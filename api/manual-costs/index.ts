import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../_lib/prisma.js';
import { requireAuth } from '../_lib/auth.js';
import { badRequest, methodNotAllowed, parseDate, serverError } from '../_lib/helpers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = requireAuth(req, res);
  if (!auth) return;

  try {
    if (req.method === 'GET') {
      const { from, to } = req.query as Record<string, string>;
      const where: any = { teamId: auth.teamId };
      const fromDate = parseDate(from);
      const toDate = parseDate(to);
      if (fromDate || toDate) {
        where.date = {};
        if (fromDate) where.date.gte = fromDate;
        if (toDate) where.date.lte = toDate;
      }
      const costs = await prisma.manualCost.findMany({
        where,
        orderBy: { date: 'desc' },
      });
      return res.status(200).json({ costs });
    }

    if (req.method === 'POST') {
      const { providerName, cost, date, timeZone, currency } = req.body || {};
      if (!providerName || cost == null || !date) {
        return badRequest(res, 'providerName, cost, date are required');
      }
      const created = await prisma.manualCost.create({
        data: {
          teamId: auth.teamId,
          providerName: String(providerName),
          cost: Number(cost),
          date: parseDate(date) ?? new Date(),
          timeZone: timeZone || null,
          currency: currency || null,
        },
      });
      return res.status(201).json({ cost: created });
    }

    return methodNotAllowed(res, ['GET', 'POST']);
  } catch (err) {
    return serverError(res, err);
  }
}
