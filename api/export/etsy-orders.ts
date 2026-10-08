// Pull API: feline (or any trusted backend) fetches Etsy orders from nh-media.
//
//   GET /api/export/etsy-orders
//   Header: X-Sync-Secret: <EXPORT_API_SECRET>   (or ?secret=...)
//   Query:
//     since=ISO        only orders updated at/after this time (uses updatedAt)
//     until=ISO        only orders updated at/before this time
//     status=all|pending|synced|failed   (default all)
//     teamId=...       restrict to one team (default: all teams)
//     limit=200        max 1000
//     group=1          (default) group into [{ShopId,ShopName,Orders[]}]; 0 = flat list
//     markSynced=1     mark the returned orders as SYNCED (pull-and-ack)

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../_lib/prisma.js';
import { methodNotAllowed, serverError, parseDate } from '../_lib/helpers.js';
import { ETSY_ORDER_SOURCE, groupByShop, buildOrderEntry } from '../_lib/exportSync.js';

function checkSecret(req: VercelRequest): boolean {
  const expected = process.env.EXPORT_API_SECRET || '';
  if (!expected) return false; // not configured → deny
  const headerSecret =
    (req.headers['x-sync-secret'] as string) ||
    (typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ')
      ? req.headers.authorization.slice(7).trim()
      : '');
  const qSecret = (req.query.secret as string) || '';
  return headerSecret === expected || qSecret === expected;
}

const STATUS_MAP: Record<string, string> = {
  pending: 'PENDING',
  synced: 'SYNCED',
  failed: 'FAILED',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  if (!checkSecret(req)) return res.status(401).json({ message: 'Invalid sync secret' });

  try {
    const { since, until, status = 'all', teamId, limit = '200', group = '1', markSynced } =
      req.query as Record<string, string>;

    const where: any = { kind: 'ORDER', source: ETSY_ORDER_SOURCE, deletedAt: null };
    if (teamId) where.teamId = teamId;

    const sinceDate = parseDate(since);
    const untilDate = parseDate(until);
    if (sinceDate || untilDate) {
      where.updatedAt = {};
      if (sinceDate) where.updatedAt.gte = sinceDate;
      if (untilDate) where.updatedAt.lte = untilDate;
    }

    const st = STATUS_MAP[String(status).toLowerCase()];
    if (st) where.syncStatus = st;

    const take = Math.min(parseInt(limit, 10) || 200, 1000);
    const records = await prisma.record.findMany({
      where,
      take,
      orderBy: { updatedAt: 'asc' },
    });

    let payload: any;
    if (group === '0') {
      payload = {
        count: records.length,
        orders: records.map((r) => {
          const { shopId, shopName, entry } = buildOrderEntry(r);
          return { ShopId: shopId, ShopName: shopName, ...entry };
        }),
      };
    } else {
      const shops = groupByShop(records);
      payload = { count: records.length, shops };
    }

    if (markSynced === '1' && records.length > 0) {
      await prisma.record.updateMany({
        where: { id: { in: records.map((r) => r.id) }, deletedAt: null },
        data: { syncStatus: 'SYNCED', syncedAt: new Date() },
      });
    }

    return res.status(200).json(payload);
  } catch (err) {
    return serverError(res, err);
  }
}
