// Outbound sync of Etsy orders to the external backend (feline).
//
// Builds the agreed JSON body from a parsed Record (+ its `details`
// OrderDetails) and pushes it to FELINE_SYNC_URL with a shared secret.
// Fields that can't be derived from the Etsy *email* (status, etsy fees,
// net earnings, listing gallery, message thread, …) are sent as null/[] so
// the receiver keeps a stable schema. See also the pull API (export/etsy-orders).

import { prisma } from './prisma.js';

// Only ORDER records produced by this rule are Etsy sales.
export const ETSY_ORDER_SOURCE = 'Etsy_Sales';

type AnyRecord = any; // Prisma Record row (details is Json)

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

function nullableNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isNaN(n) ? null : n;
}

/** Etsy shop id is embedded in every etsystatic image URL: i.etsystatic.com/<shopId>/... */
export function extractShopId(details: any): string | null {
  const items = details?.items ?? [];
  for (const it of items) {
    const m = String(it?.image || '').match(/i\.etsystatic\.com\/(\d+)\//);
    if (m) return m[1];
  }
  return null;
}

/** Build the per-order entry ({ order, items, messages }) plus shop info for grouping. */
export function buildOrderEntry(record: AnyRecord) {
  const d: any = record.details || {};
  const addr: any = d.shippingAddress || {};
  const fin: any = d.financials || {};
  const currency: string | null = record.currency || d.detectedCurrency || null;
  const isRefund = (record.orderStatus || record.order_status) === 'REFUND';

  const order = {
    id: record.orderId ?? null,
    status: null,                              // needs Etsy API
    create_time: record.dtLocal ? new Date(record.dtLocal).toISOString() : null,
    buyer_message: d.buyerMessage ?? null,     // parser may fill later
    shipping_type: d.shippingType ?? null,     // parser may fill later
    currency,
    net_earnings: null,                        // needs Etsy API
    etsy_fees: null,                           // needs Etsy API
    etsy_promotion: null,                      // needs Etsy API
    payment: {
      sub_total: nullableNum(fin.itemTotal),
      discount: nullableNum(fin.discount),
      tax: nullableNum(fin.tax),
      shipping_fee: nullableNum(fin.shipping),
      total_amount: isRefund ? 0 : (nullableNum(fin.orderTotal) ?? num(record.amount)),
    },
    recipient_address: {
      name: addr.name || d.customerName || null,
      phone_number: null,                      // Etsy doesn't expose buyer phone in email
      email: d.customerEmail || null,
      country: addr.country || null,
      state: addr.state || null,
      city: addr.city || null,
      address_line1: addr.address1 || null,
      address_line2: addr.address2 || null,
      postal_code: addr.zip || null,
    },
  };

  const items = (d.items ?? []).map((it: any) => ({
    id: it.transactionId || null,
    product_id: it.productId ?? null,          // listing id — not in email
    product_name: it.name || null,
    sku_id: it.sku ?? null,                    // seller SKU — usually not in email
    sku_name: it.variant || null,
    personalization: it.personalization ?? '',
    sku_image: it.image || null,
    product_url: it.productUrl ?? null,        // not in email
    sale_price: nullableNum(it.price),
    quantity: it.quantity ?? 1,
    listing: {
      primary_image: it.image || null,
      gallery_images: [],                      // needs Etsy API
      personalization: null,                   // needs Etsy API
    },
  }));

  return {
    shopId: extractShopId(d),
    shopName: d.shopName ?? null,
    entry: { order, items, messages: [] as any[] },
  };
}

/** Group many records into shop envelopes: [{ ShopId, ShopName, Orders: [...] }]. */
export function groupByShop(records: AnyRecord[]) {
  const map = new Map<string, { ShopId: string | null; ShopName: string | null; Orders: any[] }>();
  for (const r of records) {
    const { shopId, shopName, entry } = buildOrderEntry(r);
    const key = shopId || shopName || '__unknown__';
    if (!map.has(key)) map.set(key, { ShopId: shopId, ShopName: shopName, Orders: [] });
    map.get(key)!.Orders.push(entry);
  }
  return Array.from(map.values());
}

/** Envelope for a single order (used by the real-time push). */
export function buildEnvelope(record: AnyRecord) {
  const { shopId, shopName, entry } = buildOrderEntry(record);
  return { ShopId: shopId, ShopName: shopName, Orders: [entry] };
}

const MAX_ATTEMPTS = 6;

/**
 * Push one record to feline and update its sync state.
 * Returns { ok, skipped?, status?, error? }. Never throws.
 */
export async function pushRecord(record: AnyRecord): Promise<{ ok: boolean; skipped?: boolean; status?: number; error?: string }> {
  const url = process.env.FELINE_SYNC_URL;
  const secret = process.env.FELINE_SYNC_SECRET || '';
  if (!url) {
    // Not configured yet — leave record PENDING so the cron/pull can handle it later.
    return { ok: false, skipped: true };
  }

  const body = JSON.stringify(buildEnvelope(record));
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sync-Secret': secret,
      },
      body,
    });
    if (!resp.ok) {
      const text = (await resp.text().catch(() => '')).slice(0, 500);
      await markFailed(record.id, `HTTP ${resp.status}: ${text}`);
      return { ok: false, status: resp.status, error: text };
    }
    await prisma.record.update({
      where: { id: record.id },
      data: { syncStatus: 'SYNCED', syncedAt: new Date(), syncError: null, syncAttempts: { increment: 1 } },
    });
    return { ok: true, status: resp.status };
  } catch (e: any) {
    await markFailed(record.id, e?.message || String(e));
    return { ok: false, error: e?.message || String(e) };
  }
}

async function markFailed(id: string, err: string) {
  try {
    await prisma.record.update({
      where: { id },
      data: { syncStatus: 'FAILED', syncError: err.slice(0, 1000), syncAttempts: { increment: 1 } },
    });
  } catch {
    /* ignore */
  }
}

/**
 * Fire-and-forget trigger for freshly-saved records. Filters to Etsy orders,
 * pushes each, and swallows all errors so it can't disrupt the caller (webhook
 * / records upsert). Records that fail stay FAILED for the cron to retry.
 */
export function triggerSyncSafe(records: AnyRecord[]): void {
  try {
    const etsy = (records || []).filter(
      (r) => r && r.kind === 'ORDER' && r.source === ETSY_ORDER_SOURCE,
    );
    if (etsy.length === 0) return;
    void Promise.allSettled(etsy.map((r) => pushRecord(r)));
  } catch {
    /* never throw */
  }
}

/**
 * Cron worker: push PENDING/FAILED Etsy orders (bounded by attempts).
 * If teamId is omitted, processes all teams.
 */
export async function pushPending(opts: { teamId?: string; limit?: number } = {}) {
  const limit = Math.min(opts.limit ?? 100, 500);
  const where: any = {
    kind: 'ORDER',
    source: ETSY_ORDER_SOURCE,
    syncStatus: { in: ['PENDING', 'FAILED'] },
    syncAttempts: { lt: MAX_ATTEMPTS },
  };
  if (opts.teamId) where.teamId = opts.teamId;

  const records = await prisma.record.findMany({ where, take: limit, orderBy: { dtLocal: 'asc' } });
  let ok = 0, failed = 0, skipped = 0;
  for (const r of records) {
    const res = await pushRecord(r);
    if (res.skipped) skipped++;
    else if (res.ok) ok++;
    else failed++;
    if (res.skipped) break; // FELINE_SYNC_URL not set — stop early, nothing will succeed
  }
  return { processed: records.length, ok, failed, skipped };
}
