import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../_lib/prisma.js';
import { requireAuth } from '../_lib/auth.js';
import { badRequest, methodNotAllowed, notFound, parseId, serverError } from '../_lib/helpers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = requireAuth(req, res);
  if (!auth) return;

  const id = parseId(req.query.id);
  if (!id) return badRequest(res, 'id is required');

  try {
    const notif = await prisma.notification.findUnique({ where: { id } });
    if (!notif || notif.teamId !== auth.teamId) return notFound(res);

    if (req.method === 'PATCH') {
      const { isRead } = req.body || {};
      const updated = await prisma.notification.update({
        where: { id },
        data: { isRead: Boolean(isRead) },
      });
      return res.status(200).json({ notification: updated });
    }

    if (req.method === 'DELETE') {
      await prisma.notification.delete({ where: { id } });
      return res.status(204).end();
    }

    return methodNotAllowed(res, ['PATCH', 'DELETE']);
  } catch (err) {
    return serverError(res, err);
  }
}
