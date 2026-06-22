import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../_lib/prisma.js';
import { requireAuth } from '../_lib/auth.js';
import { badRequest, methodNotAllowed, serverError } from '../_lib/helpers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = requireAuth(req, res);
  if (!auth) return;

  try {
    if (req.method === 'GET') {
      const { limit = '50' } = req.query as Record<string, string>;
      const take = Math.min(parseInt(limit, 10) || 50, 200);
      const notifications = await prisma.notification.findMany({
        where: { teamId: auth.teamId },
        orderBy: { createdAt: 'desc' },
        take,
      });
      return res.status(200).json({ notifications });
    }

    if (req.method === 'POST') {
      const { type, title, body, data } = req.body || {};
      const created = await prisma.notification.create({
        data: {
          teamId: auth.teamId,
          type: type || null,
          title: title || null,
          body: body || null,
          data: data ?? null,
        },
      });
      return res.status(201).json({ notification: created });
    }

    if (req.method === 'DELETE') {
      // Clear all (used for "mark all read" or clear)
      await prisma.notification.deleteMany({ where: { teamId: auth.teamId } });
      return res.status(204).end();
    }

    return methodNotAllowed(res, ['GET', 'POST', 'DELETE']);
  } catch (err) {
    return serverError(res, err);
  }
}
