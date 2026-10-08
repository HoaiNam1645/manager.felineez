// Cron endpoint: backfill Record.costTotal (factory fulfill cost) — and
// trackingCode when the factory already exposes it — for fulfilled orders
// (ffCode set) that have no cost yet. Dreamship normally arrives via webhook;
// every other factory has no cost push, so we poll their detail endpoints.
//
//   */30 * * * * curl -s -H "X-Cron-Secret: $CRON_SECRET" http://127.0.0.1:3030/api/factory/cost-cron
//
// Auth via CRON_SECRET (header X-Cron-Secret, Bearer token, or ?secret=).

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { methodNotAllowed, serverError } from '../_lib/helpers.js';
import { prisma } from '../_lib/prisma.js';
import {
  mangoFetch,
  vinawayFetch,
  monkeyKingFetch,
  dreamshipFetch,
  hongPhatFetch,
  hogotoFetch,
} from '../_lib/factory.js';
import { lemiexGet } from '../_lib/lemiex.js';

const PREFIX_PROVIDER: { [p: string]: string } = {
  LMX: 'lemiex', MGO: 'mango', VNW: 'vinaway', MKP: 'monkeyking',
  DSH: 'dreamship', HPE: 'hongphat', HGT: 'hogoto',
};

const mkOrdersByCustomId = (customOrderId: string) =>
  '/vendors/order/?' +
  'searchCriteria[filterGroups][0][filters][0][field]=custom_order_id' +
  `&searchCriteria[filterGroups][0][filters][0][value]=${encodeURIComponent(customOrderId)}` +
  '&searchCriteria[filterGroups][0][filters][0][conditionType]=eq';

function checkSecret(req: VercelRequest): boolean {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) return false;
  const header =
    (req.headers['x-cron-secret'] as string) ||
    (typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ')
      ? req.headers.authorization.slice(7).trim()
      : '');
  const qSecret = (req.query.secret as string) || '';
  return header === expected || qSecret === expected;
}

const num = (v: any): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

// Mango list index (order_id -> row), built once per cron run.
const mangoIndexCache = new Map<string, Map<string, any>>();

async function getMangoIndex(teamId: string): Promise<Map<string, any>> {
  const cached = mangoIndexCache.get(teamId);
  if (cached) return cached;
  const index = new Map<string, any>();
  for (let page = 1; page <= 5; page++) {
    const j = await mangoFetch(teamId, `/orders?page=${page}&limit=100`);
    const items = j?.data?.items ?? [];
    for (const o of items) {
      const key = String(o?.order_id ?? '');
      if (key) index.set(key, o);
    }
    if (items.length < 100) break;
  }
  mangoIndexCache.set(teamId, index);
  return index;
}

async function fetchCost(
  provider: string,
  teamId: string,
  id: string,
  orderId: string | null
): Promise<{ cost: number | null; tracking: string | null }> {
  if (provider === 'lemiex') {
    const j = await lemiexGet(teamId, `/api/orders/${encodeURIComponent(id)}`);
    const orders = j?.data?.orders;
    const o = Array.isArray(orders)
      ? orders.find((x: any) => String(x?.id ?? x?.order_id ?? '') === id) ?? orders[0]
      : j?.data ?? j;
    return {
      cost: num(o?.pricing?.total_cost),
      tracking: o?.tracking_number ?? o?.shipping?.tracking_number ?? null,
    };
  }
  if (provider === 'mango') {
    // Mango has no working detail endpoint (GET /orders/{id} → ORDER_NOT_FOUND
    // for both our id and their uuid) and ignores list filters, so page the
    // list once per run and match their order_id. Their id can carry a
    // re-submit suffix ("4142316769A"), hence the prefix fallback.
    const index = await getMangoIndex(teamId);
    const hit = index.get(id) ?? [...index.entries()].find(([k]) => k.startsWith(id))?.[1];
    return { cost: num(hit?.total), tracking: hit?.tracking_number ?? null };
  }
  if (provider === 'vinaway') {
    const j = await vinawayFetch(teamId, `/orders/${encodeURIComponent(id)}`);
    const d = j?.data ?? j;
    // Vinaway amounts are integer cents (amount_total 2550 = $25.50)
    const raw = num(d?.amount_total);
    return {
      cost: raw != null ? raw / 100 : null,
      tracking: d?.tracking_number ?? d?.tracking_code ?? null,
    };
  }
  if (provider === 'monkeyking') {
    if (!orderId) return { cost: null, tracking: null };
    const j = await monkeyKingFetch(teamId, mkOrdersByCustomId(orderId));
    const it = j?.items?.[0];
    return { cost: num(it?.grand_total), tracking: null };
  }
  if (provider === 'dreamship') {
    const j = await dreamshipFetch(teamId, `/orders/${encodeURIComponent(id)}/`);
    const f = j?.fulfillments?.[0];
    return {
      cost: num(j?.total_cost),
      tracking: f?.trackings?.[0]?.tracking_number ?? f?.tracking_number ?? null,
    };
  }
  if (provider === 'hongphat') {
    const j = await hongPhatFetch(teamId, `/orders/${encodeURIComponent(id)}`);
    const o = j?.order ?? j?.data ?? j;
    return { cost: num(o?.grand_total), tracking: o?.shipping?.tracking_number ?? null };
  }
  if (provider === 'hogoto') {
    const j = await hogotoFetch(teamId, `/v1/partner/order/detail?orderCode=${encodeURIComponent(id)}`);
    const o = j?.result ?? j?.data ?? j;
    return {
      cost: num(o?.amount ?? o?.amountCustomerDebit),
      tracking: o?.shippingLabel?.trackingNumber ?? null,
    };
  }
  return { cost: null, tracking: null };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST']);
  if (!checkSecret(req)) return res.status(401).json({ message: 'Invalid cron secret' });

  try {
    mangoIndexCache.clear();
    const limit = Math.min(parseInt((req.query.limit as string) || '40', 10) || 40, 200);
    const rows = await prisma.record.findMany({
      where: { AND: [{ ffCode: { not: null } }, { ffCode: { not: '' } }], costTotal: null, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, ffCode: true, orderId: true, teamId: true, trackingCode: true },
    });

    let updated = 0;
    let trackingSet = 0;
    const byProvider: { [p: string]: number } = {};
    const errors: string[] = [];

    for (const r of rows) {
      const m = /^([A-Z]{3})-(.+)$/.exec(r.ffCode || '');
      if (!m) continue;
      const provider = PREFIX_PROVIDER[m[1]];
      if (!provider) continue;
      try {
        const { cost, tracking } = await fetchCost(provider, r.teamId, m[2], r.orderId);
        const data: any = {};
        if (cost != null) data.costTotal = cost;
        if (tracking && !r.trackingCode) data.trackingCode = String(tracking).slice(0, 64);
        if (Object.keys(data).length > 0) {
          await prisma.record.update({ where: { id: r.id }, data });
          if (data.costTotal != null) { updated++; byProvider[provider] = (byProvider[provider] || 0) + 1; }
          if (data.trackingCode) trackingSet++;
        }
      } catch (e: any) {
        if (errors.length < 8) errors.push(`${r.ffCode}: ${String(e?.message || e).slice(0, 90)}`);
      }
    }

    return res.status(200).json({ ok: true, checked: rows.length, updated, trackingSet, byProvider, errors });
  } catch (err) {
    return serverError(res, err);
  }
}
