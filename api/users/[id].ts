import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../_lib/prisma.js';
import { requireAuth, hashPassword } from '../_lib/auth.js';
import { badRequest, methodNotAllowed, notFound, parseId, serverError } from '../_lib/helpers.js';
import { normalizeSellerCodes, assertCodesAvailable, SellerCodeError } from '../_lib/sellerCodes.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = parseId(req.query.id);
  if (!id) return badRequest(res, 'id is required');

  try {
    if (req.method === 'PATCH') {
      const auth = requireAuth(req, res);
      if (!auth) return;
      if (auth.role !== 'OWNER' && auth.role !== 'LEADER') {
        return res.status(403).json({ message: 'Owner or leader role required' });
      }

      const target = await prisma.user.findUnique({ where: { id } });
      if (!target || target.teamId !== auth.teamId) return notFound(res);

      // Leaders may edit non-owner accounts inside their own seller team,
      // but may never move the user to another team or grant owner.
      const isLeader = auth.role === 'LEADER';
      if (isLeader) {
        const me = await prisma.user.findUnique({ where: { id: auth.userId }, select: { sellerTeamId: true } });
        if (!me?.sellerTeamId || target.role === 'OWNER' || target.sellerTeamId !== me.sellerTeamId) {
          return res.status(403).json({ message: 'Not allowed for this user' });
        }
      }

      const { password, role, permissions, allowedAccounts, sellerCodes, sellerTeamId } = req.body || {};
      const data: any = {};
      if (typeof role === 'string') {
        if (!isLeader && (role === 'OWNER' || role === 'LEADER' || role === 'USER' || role === 'FULFILLMENT' || role === 'DESIGN')) data.role = role;
        if (isLeader && (role === 'LEADER' || role === 'USER' || role === 'FULFILLMENT' || role === 'DESIGN')) data.role = role;
      }
      if (permissions !== undefined) data.permissions = permissions;
      if (allowedAccounts !== undefined) data.allowedAccounts = allowedAccounts;
      if (typeof password === 'string' && password.length >= 6) {
        data.password = await hashPassword(password);
      }
      if (sellerCodes !== undefined) {
        try {
          const codes = normalizeSellerCodes(sellerCodes);
          await assertCodesAvailable(auth.teamId, codes, id);
          data.sellerCodes = codes;
        } catch (e) {
          if (e instanceof SellerCodeError) return res.status(e.status).json({ message: e.message });
          throw e;
        }
      }
      if (sellerTeamId !== undefined && !isLeader) {
        if (sellerTeamId === null || sellerTeamId === '') {
          data.sellerTeamId = null;
        } else {
          const st = await prisma.sellerTeam.findUnique({ where: { id: String(sellerTeamId) } });
          if (!st || st.teamId !== auth.teamId) return badRequest(res, 'Invalid seller team');
          data.sellerTeamId = st.id;
        }
      }

      const updated = await prisma.user.update({
        where: { id },
        data,
        select: { id: true, email: true, role: true, permissions: true, allowedAccounts: true, sellerCodes: true, sellerTeamId: true },
      });
      return res.status(200).json({ user: updated });
    }

    if (req.method === 'DELETE') {
      const auth = requireAuth(req, res);
      if (!auth) return;
      if (auth.role !== 'OWNER' && auth.role !== 'LEADER') {
        return res.status(403).json({ message: 'Owner or leader role required' });
      }
      if (id === auth.userId) return badRequest(res, 'Cannot delete yourself');

      const target = await prisma.user.findUnique({ where: { id } });
      if (!target || target.teamId !== auth.teamId) return notFound(res);

      // Leaders may only delete non-owner accounts inside their own seller team.
      if (auth.role === 'LEADER') {
        const me = await prisma.user.findUnique({ where: { id: auth.userId }, select: { sellerTeamId: true } });
        if (!me?.sellerTeamId || target.role === 'OWNER' || target.sellerTeamId !== me.sellerTeamId) {
          return res.status(403).json({ message: 'Not allowed for this user' });
        }
      }

      await prisma.user.delete({ where: { id } });
      return res.status(204).end();
    }

    return methodNotAllowed(res, ['PATCH', 'DELETE']);
  } catch (err) {
    return serverError(res, err);
  }
}
