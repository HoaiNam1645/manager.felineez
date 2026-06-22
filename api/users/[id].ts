import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../_lib/prisma.js';
import { requireAuth, requireOwner, hashPassword } from '../_lib/auth.js';
import { badRequest, methodNotAllowed, notFound, parseId, serverError } from '../_lib/helpers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = parseId(req.query.id);
  if (!id) return badRequest(res, 'id is required');

  try {
    if (req.method === 'PATCH') {
      const auth = requireOwner(req, res);
      if (!auth) return;

      const target = await prisma.user.findUnique({ where: { id } });
      if (!target || target.teamId !== auth.teamId) return notFound(res);

      const { password, role, permissions, allowedAccounts } = req.body || {};
      const data: any = {};
      if (typeof role === 'string' && (role === 'OWNER' || role === 'USER')) data.role = role;
      if (permissions !== undefined) data.permissions = permissions;
      if (allowedAccounts !== undefined) data.allowedAccounts = allowedAccounts;
      if (typeof password === 'string' && password.length >= 6) {
        data.password = await hashPassword(password);
      }

      const updated = await prisma.user.update({
        where: { id },
        data,
        select: { id: true, email: true, role: true, permissions: true, allowedAccounts: true },
      });
      return res.status(200).json({ user: updated });
    }

    if (req.method === 'DELETE') {
      const auth = requireOwner(req, res);
      if (!auth) return;
      if (id === auth.userId) return badRequest(res, 'Cannot delete yourself');

      const target = await prisma.user.findUnique({ where: { id } });
      if (!target || target.teamId !== auth.teamId) return notFound(res);

      await prisma.user.delete({ where: { id } });
      return res.status(204).end();
    }

    return methodNotAllowed(res, ['PATCH', 'DELETE']);
  } catch (err) {
    return serverError(res, err);
  }
}
