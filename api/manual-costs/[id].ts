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
    const cost = await prisma.manualCost.findUnique({ where: { id } });
    if (!cost || cost.teamId !== auth.teamId) return notFound(res);

    if (req.method === 'PATCH') {
      const { providerName, cost: costAmt, date, timeZone, currency } = req.body || {};
      const data: any = {};
      if (providerName !== undefined) data.providerName = providerName;
      if (costAmt !== undefined) data.cost = Number(costAmt);
      if (date !== undefined) data.date = parseDate(date);
      if (timeZone !== undefined) data.timeZone = timeZone;
      if (currency !== undefined) data.currency = currency;

      const updated = await prisma.manualCost.update({ where: { id }, data });
      return res.status(200).json({ cost: updated });
    }

    if (req.method === 'DELETE') {
      await prisma.manualCost.delete({ where: { id } });
      return res.status(204).end();
    }

    return methodNotAllowed(res, ['PATCH', 'DELETE']);
  } catch (err) {
    return serverError(res, err);
  }
}
