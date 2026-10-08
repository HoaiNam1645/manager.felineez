// Single seller team: rename / delete (owner only).
//
//   PATCH  /api/seller-teams/:id { name }
//   DELETE /api/seller-teams/:id     (members' sellerTeamId auto-nulls via FK SetNull)

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../_lib/prisma.js';
import { requireOwner } from '../_lib/auth.js';
import { badRequest, methodNotAllowed, notFound, serverError, parseId } from '../_lib/helpers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = requireOwner(req, res);
  if (!auth) return;

  const id = parseId(req.query.id);
  if (!id) return badRequest(res, 'Invalid team id');

  try {
    const target = await prisma.sellerTeam.findUnique({ where: { id } });
    if (!target || target.teamId !== auth.teamId) return notFound(res, 'Team not found');

    if (req.method === 'PATCH') {
      const name = String(req.body?.name ?? '').trim();
      if (!name) return badRequest(res, 'Team name is required');
      if (name.length > 50) return badRequest(res, 'Team name too long (max 50 chars)');

      const dup = await prisma.sellerTeam.findUnique({
        where: { teamId_name: { teamId: auth.teamId, name } },
      });
      if (dup && dup.id !== id) return res.status(409).json({ message: `Team "${name}" already exists` });

      const team = await prisma.sellerTeam.update({ where: { id }, data: { name } });
      return res.status(200).json({ team });
    }

    if (req.method === 'DELETE') {
      await prisma.sellerTeam.delete({ where: { id } });
      return res.status(204).send('');
    }

    return methodNotAllowed(res, ['PATCH', 'DELETE']);
  } catch (err) {
    return serverError(res, err);
  }
}
