import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../_lib/prisma.js';
import { requireAuth } from '../_lib/auth.js';
import { badRequest, methodNotAllowed, parseDate, serverError } from '../_lib/helpers.js';

const KIND_MAP: Record<string, 'ORDER' | 'FUNDS' | 'CASE' | 'HELP'> = {
  order: 'ORDER',
  Funds: 'FUNDS',
  funds: 'FUNDS',
  case: 'CASE',
  help: 'HELP',
};

function toEnum(kind: unknown): 'ORDER' | 'FUNDS' | 'CASE' | 'HELP' | null {
  if (typeof kind !== 'string') return null;
  return KIND_MAP[kind] ?? null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = requireAuth(req, res);
  if (!auth) return;

  try {
    if (req.method === 'GET') {
      const { from, to, accountId, kind, q, limit = '5000', cursor } = req.query as Record<string, string>;

      const where: any = { teamId: auth.teamId };
      const fromDate = parseDate(from);
      const toDate = parseDate(to);
      if (fromDate || toDate) {
        where.dtLocal = {};
        if (fromDate) where.dtLocal.gte = fromDate;
        if (toDate) where.dtLocal.lte = toDate;
      }
      if (accountId) where.accountId = accountId;
      if (kind) {
        const k = toEnum(kind);
        if (k) where.kind = k;
      }
      if (q) {
        where.OR = [
          { orderId: { contains: q } },
          { productName: { contains: q } },
          { source: { contains: q } },
        ];
      }

      const take = Math.min(parseInt(limit, 10) || 5000, 10000);
      const records = await prisma.record.findMany({
        where,
        take,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { dtLocal: 'desc' },
      });

      return res.status(200).json({
        records,
        nextCursor: records.length === take ? records[records.length - 1].id : null,
      });
    }

    if (req.method === 'POST') {
      // Bulk upsert from sync workers
      const { records } = req.body || {};
      if (!Array.isArray(records) || records.length === 0) {
        return badRequest(res, 'records array is required');
      }

      // Dedupe by emailId so the same email isn't upserted twice in one batch.
      // Records without an emailId can't be deduped, so keep them all.
      const seenEmailIds = new Set<string>();
      const dedupedRecords = records.filter((r: any) => {
        const emailId = r.email_id ?? r.emailId ?? null;
        if (!emailId) return true;
        if (seenEmailIds.has(emailId)) return false;
        seenEmailIds.add(emailId);
        return true;
      });

      let upserted = 0;
      for (const r of dedupedRecords) {
        const kindEnum = toEnum(r.kind) ?? 'ORDER';
        const emailId = r.email_id ?? r.emailId ?? null;
        const fields = {
          dtLocal: parseDate(r.dt_local || r.dtLocal) ?? new Date(),
          amount: r.amount ?? 0,
          orderId: r.order_id ?? r.orderId ?? null,
          currency: r.currency ?? null,
          source: r.source ?? null,
          accountEmail: r.account ?? r.accountEmail ?? null,
          accountId: r.accountId ?? null,
          kind: kindEnum,
          caseMsg: r.case_msg ?? r.caseMsg ?? null,
          helpKind: r.help_kind ?? r.helpKind ?? null,
          costTotal: r.cost_total ?? r.costTotal ?? null,
          ffCode: r.ff_code ?? r.ffCode ?? null,
          productName: r.product_name ?? r.productName ?? null,
          details: r.details ?? undefined,
        };
        try {
          await prisma.record.upsert({
            where: emailId
              ? { teamId_emailId: { teamId: auth.teamId, emailId } }
              : { id: r.id || '__never__' },
            update: fields,
            create: { teamId: auth.teamId, emailId, ...fields },
          });
        } catch (e: any) {
          // P2002 = unique constraint race: a concurrent sync request inserted
          // this (teamId, emailId) between our SELECT and INSERT. Fall back to
          // an update so the batch still succeeds.
          if (e?.code === 'P2002' && emailId) {
            await prisma.record.update({
              where: { teamId_emailId: { teamId: auth.teamId, emailId } },
              data: fields,
            });
          } else {
            throw e;
          }
        }
        upserted++;
      }

      return res.status(200).json({ upserted });
    }

    return methodNotAllowed(res, ['GET', 'POST']);
  } catch (err) {
    return serverError(res, err);
  }
}
