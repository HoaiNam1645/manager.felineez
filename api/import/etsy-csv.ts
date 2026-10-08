// Import the Etsy "Sold Orders" CSV (Shop Manager → Settings → Options → Download Data).
//
//   POST /api/import/etsy-csv   { csv: "<raw csv text>" }
//   (Lives under api/import/ — the [id].ts sibling in api/records/ would shadow
//    static routes there, since server.ts mounts routes in readdir order.)
//
// Parses the CSV, matches rows to existing Etsy order records by Order ID
// (same team, kind=ORDER, source=Etsy_Sales) and stores the financials the
// email parser can never see (card processing fees, order net, discount, SKU,
// ship date) into Record.etsyFees. Unmatched orders are reported, not created.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as XLSX from 'xlsx';
import { prisma } from '../_lib/prisma.js';
import { requireAuth } from '../_lib/auth.js';
import { visibleAccountEmails } from '../_lib/teamScope.js';
import { badRequest, methodNotAllowed, serverError } from '../_lib/helpers.js';
import { enrichEtsyFees, emailTaxOf } from '../_lib/etsyNet.js';

const num = (v: unknown): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
};

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());

const SOLD_ORDERS_REQUIRED_HEADERS = [
  'Sale Date',
  'Order ID',
  'Number of Items',
  'Order Value',
  'Shipping',
  'Sales Tax',
  'Order Total',
  'Card Processing Fees',
  'Order Net',
];

const SOLD_ORDER_ITEMS_ONLY_HEADERS = [
  'Item Name',
  'Transaction ID',
  'Item Total',
  'Variations',
  'Listing ID',
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const auth = requireAuth(req, res);
  if (!auth) return;
  if (auth.role !== 'OWNER' && auth.role !== 'LEADER') {
    return res.status(403).json({ message: 'Owner or leader role required' });
  }

  try {
    const { csv } = req.body || {};
    if (typeof csv !== 'string' || !csv.trim()) {
      return badRequest(res, 'csv (string) is required');
    }
    // SheetJS handles quoted fields/commas correctly.
    const wb = XLSX.read(csv, { type: 'string', raw: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { raw: true, defval: '' });
    const headerRow = rows[0] || {};
    const headers = new Set(Object.keys(headerRow));
    const missingHeaders = SOLD_ORDERS_REQUIRED_HEADERS.filter((h) => !headers.has(h));
    const looksLikeItemsExport = SOLD_ORDER_ITEMS_ONLY_HEADERS.some((h) => headers.has(h));

    if (missingHeaders.length > 0) {
      const hint = looksLikeItemsExport
        ? 'You uploaded EtsySoldOrderItems*.csv. Please upload EtsySoldOrders*.csv from Etsy Download Data → Orders.'
        : `Missing required header(s): ${missingHeaders.join(', ')}`;
      return badRequest(res, `This import only accepts EtsySoldOrders*.csv. ${hint}`);
    }

    // Build fees per Order ID (one CSV row per order; last row wins on dupes).
    const feesByOrderId: { [orderId: string]: any } = {};
    for (const row of rows) {
      const orderId = str(row['Order ID']);
      if (!orderId) continue;
      feesByOrderId[orderId] = {
        orderValue: num(row['Order Value']),
        discount: num(row['Discount Amount']),
        shippingDiscount: num(row['Shipping Discount']),
        shipping: num(row['Shipping']),
        tax: num(row['Sales Tax']),
        orderTotal: num(row['Order Total']),
        cardFees: num(row['Card Processing Fees']),
        orderNet: num(row['Order Net']),
        currency: str(row['Currency']) || 'USD',
        sku: str(row['SKU']) || null,
        couponCode: str(row['Coupon Code']) || null,
        saleDate: str(row['Sale Date']) || null,
        dateShipped: str(row['Date Shipped']) || null,
        numberOfItems: num(row['Number of Items']) || null,
        importedAt: new Date().toISOString(),
      };
    }

    const ids = Object.keys(feesByOrderId);
    if (ids.length === 0) return badRequest(res, 'No rows with an Order ID found in the CSV');

    const visibleAccounts = await visibleAccountEmails(auth);

    // Match against this team's parsed Etsy orders. Leaders are scoped to
    // their team's visible shop accounts; owners remain unrestricted.
    const matchedRecords = await prisma.record.findMany({
      where: {
        teamId: auth.teamId,
        kind: 'ORDER',
        source: 'Etsy_Sales',
        orderId: { in: ids },
        ...(visibleAccounts ? { accountEmail: { in: visibleAccounts } } : {}),
      },
      select: { id: true, orderId: true, details: true, orderStatus: true },
    });

    const updatedRecordIds: string[] = [];
    const matchedOrderIds = new Set<string>();
    for (const rec of matchedRecords) {
      if (!rec.orderId) continue;
      // Normalize VND-shop values + estimate the actual per-order earnings
      // (needs the buyer tax from the parsed sale email).
      const enriched = enrichEtsyFees(feesByOrderId[rec.orderId], emailTaxOf(rec.details));
      feesByOrderId[rec.orderId] = enriched;
      // Etsy confirmed shipment → auto-advance the fulfillment status
      // (never off a manually-set ON_HOLD/CANCELLED).
      const data: any = { etsyFees: enriched };
      if (enriched.dateShipped && !['ON_HOLD', 'CANCELLED', 'REFUND'].includes(rec.orderStatus ?? '')) {
        data.orderStatus = 'SHIPPED';
      }
      await prisma.record.update({
        where: { id: rec.id },
        data,
      });
      updatedRecordIds.push(rec.id);
      matchedOrderIds.add(rec.orderId);
    }

    const unmatched = ids.filter((id) => !matchedOrderIds.has(id));

    return res.status(200).json({
      total: ids.length,
      matched: matchedOrderIds.size,
      updatedRecordIds,
      unmatched,
      // ALL parsed rows (matched + unmatched) so the result UI can show
      // sale date / totals for unmatched orders too.
      feesByOrderId,
    });
  } catch (err) {
    return serverError(res, err);
  }
}
