import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../_lib/prisma.js';
import { requireAuth } from '../_lib/auth.js';
import { badRequest, methodNotAllowed, notFound, parseDate, parseId, serverError } from '../_lib/helpers.js';
import { visibleAccountEmails } from '../_lib/teamScope.js';
import { emailTaxOf, enrichEtsyFees } from '../_lib/etsyNet.js';

const num = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = requireAuth(req, res);
  if (!auth) return;

  const id = parseId(req.query.id);
  if (!id) return badRequest(res, 'id is required');

  try {
    const record = await prisma.record.findUnique({ where: { id } });
    if (!record || record.teamId !== auth.teamId) return notFound(res);
    if (record.deletedAt && req.method !== 'DELETE') return notFound(res);

    // Same shop-level visibility as the list endpoint
    const visibleEmails = await visibleAccountEmails(auth);
    if (visibleEmails && (!record.accountEmail || !visibleEmails.includes(record.accountEmail))) {
      return notFound(res);
    }

    if (req.method === 'GET') {
      return res.status(200).json({ record });
    }

    if (req.method === 'PATCH') {
      const b = req.body || {};
      const data: any = {};
      if (b.dt_local !== undefined || b.dtLocal !== undefined)
        data.dtLocal = parseDate(b.dt_local || b.dtLocal);
      if (b.amount !== undefined) data.amount = b.amount;
      if (b.order_id !== undefined || b.orderId !== undefined) data.orderId = b.order_id ?? b.orderId;
      if (b.currency !== undefined) data.currency = b.currency;
      if (b.source !== undefined) data.source = b.source;
      if (b.cost_total !== undefined || b.costTotal !== undefined) data.costTotal = b.cost_total !== undefined ? b.cost_total : b.costTotal;
      if (b.design_cost !== undefined || b.designCost !== undefined) data.designCost = b.design_cost !== undefined ? b.design_cost : b.designCost;
      if (b.ff_code !== undefined || b.ffCode !== undefined) data.ffCode = b.ff_code !== undefined ? b.ff_code : b.ffCode;
      if (b.product_name !== undefined || b.productName !== undefined) data.productName = b.product_name ?? b.productName;
      if (b.details !== undefined) data.details = b.details;
      if (b.case_msg !== undefined || b.caseMsg !== undefined) data.caseMsg = b.case_msg ?? b.caseMsg;
      if (b.help_kind !== undefined || b.helpKind !== undefined) data.helpKind = b.help_kind ?? b.helpKind;
      if (b.tracking_code !== undefined || b.trackingCode !== undefined) {
        const t = b.tracking_code !== undefined ? b.tracking_code : b.trackingCode;
        if (t === null || t === '') data.trackingCode = null;
        else if (typeof t === 'string' && t.trim().length <= 64) data.trackingCode = t.trim();
        else return badRequest(res, 'invalid tracking_code');
      }

      // SKU lives inside the etsyFees JSON (imported from the Etsy CSV) and
      // drives KPI seller attribution — merge it so the financial fields the
      // import wrote stay intact.
      if (b.sku !== undefined) {
        const raw = b.sku;
        if (raw !== null && typeof raw !== 'string') return badRequest(res, 'invalid sku');
        const sku = raw === null ? null : raw.trim().slice(0, 190) || null;
        const fees = (record.etsyFees && typeof record.etsyFees === 'object' && !Array.isArray(record.etsyFees))
          ? (record.etsyFees as any)
          : {};
        data.etsyFees = { ...fees, sku };
      }

      if (b.ff_note !== undefined || b.ffNote !== undefined) {
        const n = b.ff_note !== undefined ? b.ff_note : b.ffNote;
        if (n === null || n === '') data.ffNote = null;
        else if (typeof n === 'string' && n.trim().length <= 500) data.ffNote = n.trim();
        else return badRequest(res, 'invalid ff_note');
      }
      if (b.order_status !== undefined || b.orderStatus !== undefined) {
        const s = b.order_status ?? b.orderStatus;
        const ORDER_STATUSES = ['NEW', 'DESIGNING', 'READY', 'PRODUCING', 'SHIPPED', 'ON_HOLD', 'CANCELLED', 'REFUND'];
        if (s === null) data.orderStatus = null;
        else if (typeof s === 'string' && ORDER_STATUSES.includes(s)) data.orderStatus = s;
        else return badRequest(res, 'invalid order_status');
      }

      const shouldSyncFinancials = b.amount !== undefined || b.details !== undefined;
      const currentFees = (data.etsyFees ?? record.etsyFees) as any;
      const hasImportedFees = currentFees
        && typeof currentFees === 'object'
        && !Array.isArray(currentFees)
        && (
          currentFees.orderTotal !== undefined ||
          currentFees.orderNet !== undefined ||
          currentFees.cardFees !== undefined ||
          currentFees.estActualNet !== undefined
        );
      if (shouldSyncFinancials && hasImportedFees) {
        const nextDetails = (data.details !== undefined ? data.details : record.details) as any;
        const fin = nextDetails?.financials || {};
        const orderTotal = num(fin.orderTotal) || num(data.amount ?? record.amount);
        const discount = num(fin.discount);
        const shipping = num(fin.shipping);
        const tax = num(fin.tax);
        const orderValue = num(fin.itemTotal) || Math.max(orderTotal + discount - shipping - tax, 0);
        data.etsyFees = enrichEtsyFees({
          ...currentFees,
          orderValue,
          discount,
          shipping,
          tax,
          orderTotal,
          manualRevenueOverride: true,
          manualRevenueOverrideAt: new Date().toISOString(),
        }, emailTaxOf(nextDetails));
      }

      const updated = await prisma.record.update({ where: { id }, data });
      return res.status(200).json({ record: updated });
    }

    if (req.method === 'DELETE') {
      if (!record.deletedAt) {
        await prisma.record.update({ where: { id }, data: { deletedAt: new Date() } });
      }
      return res.status(204).end();
    }

    return methodNotAllowed(res, ['GET', 'PATCH', 'DELETE']);
  } catch (err) {
    return serverError(res, err);
  }
}
