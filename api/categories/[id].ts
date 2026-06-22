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
    const category = await prisma.category.findUnique({ where: { id } });
    if (!category || category.teamId !== auth.teamId) return notFound(res);

    if (req.method === 'PATCH') {
      const { name } = req.body || {};
      if (!name || !String(name).trim()) return badRequest(res, 'name is required');
      const updated = await prisma.category.update({
        where: { id },
        data: { name: String(name).trim() },
      });
      return res.status(200).json({ category: updated });
    }

    if (req.method === 'DELETE') {
      // Products keep their images but lose the category link (onDelete: SetNull).
      await prisma.category.delete({ where: { id } });
      return res.status(204).end();
    }

    return methodNotAllowed(res, ['PATCH', 'DELETE']);
  } catch (err) {
    return serverError(res, err);
  }
}
