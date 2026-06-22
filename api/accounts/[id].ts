import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../_lib/prisma.js';
import { requireAuth } from '../_lib/auth.js';
import { badRequest, methodNotAllowed, notFound, parseDate, parseId, serverError } from '../_lib/helpers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = requireAuth(req, res);
  if (!auth) return;

  const id = parseId(req.query.id);
  if (!id) return badRequest(res, 'id is required');

  try {
    const account = await prisma.mailAccount.findUnique({ where: { id } });
    if (!account || account.teamId !== auth.teamId) return notFound(res);

    if (req.method === 'PATCH') {
      const {
        label,
        token,
        lastSyncedAt,
        historySyncedUntil,
        historicalSyncComplete,
        scanStartDate,
        lastKnownHistoryId,
        platforms,
        sortOrder,
      } = req.body || {};

      const data: any = {};
      if (label !== undefined) data.label = label;
      if (token !== undefined) data.token = String(token);
      if (lastSyncedAt !== undefined) data.lastSyncedAt = parseDate(lastSyncedAt);
      if (historySyncedUntil !== undefined) data.historySyncedUntil = parseDate(historySyncedUntil);
      if (historicalSyncComplete !== undefined) data.historicalSyncComplete = Boolean(historicalSyncComplete);
      if (scanStartDate !== undefined) data.scanStartDate = parseDate(scanStartDate);
      if (lastKnownHistoryId !== undefined) data.lastKnownHistoryId = lastKnownHistoryId;
      if (platforms !== undefined) data.platforms = platforms;
      if (sortOrder !== undefined) data.sortOrder = sortOrder;

      const updated = await prisma.mailAccount.update({ where: { id }, data });
      return res.status(200).json({ account: updated });
    }

    if (req.method === 'DELETE') {
      await prisma.mailAccount.delete({ where: { id } });
      return res.status(204).end();
    }

    return methodNotAllowed(res, ['PATCH', 'DELETE']);
  } catch (err) {
    return serverError(res, err);
  }
}
