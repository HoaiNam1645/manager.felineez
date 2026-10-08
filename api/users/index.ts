import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../_lib/prisma.js';
import { requireAuth, hashPassword } from '../_lib/auth.js';
import { badRequest, methodNotAllowed, serverError } from '../_lib/helpers.js';
import { normalizeSellerCodes, assertCodesAvailable, SellerCodeError } from '../_lib/sellerCodes.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      const auth = requireAuth(req, res);
      if (!auth) return;

      const users = await prisma.user.findMany({
        where: { teamId: auth.teamId },
        select: {
          id: true,
          email: true,
          role: true,
          permissions: true,
          allowedAccounts: true,
          sellerCodes: true,
          sellerTeamId: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      });
      return res.status(200).json({ users });
    }

    if (req.method === 'POST') {
      // Owner: full control. Leader: may create non-owner accounts inside their own seller team.
      const auth = requireAuth(req, res);
      if (!auth) return;
      if (auth.role !== 'OWNER' && auth.role !== 'LEADER') {
        return res.status(403).json({ message: 'Owner or leader role required' });
      }
      let leaderTeamId: string | null = null;
      if (auth.role === 'LEADER') {
        const me = await prisma.user.findUnique({ where: { id: auth.userId }, select: { sellerTeamId: true } });
        leaderTeamId = me?.sellerTeamId ?? null;
        if (!leaderTeamId) return res.status(403).json({ message: 'Leader has no seller team' });
      }

      const { email, password, role, permissions, allowedAccounts, sellerCodes, sellerTeamId } = req.body || {};
      if (!email || !password) return badRequest(res, 'Email and password are required');
      if (String(password).length < 6) return badRequest(res, 'Password must be at least 6 characters');

      const normalized = String(email).toLowerCase().trim();
      const existing = await prisma.user.findUnique({ where: { email: normalized } });
      if (existing) return res.status(409).json({ message: 'Email already registered' });

      // Seller identifier codes (unique across the workspace).
      let codes: string[] = [];
      try {
        codes = normalizeSellerCodes(sellerCodes);
        await assertCodesAvailable(auth.teamId, codes);
      } catch (e) {
        if (e instanceof SellerCodeError) return res.status(e.status).json({ message: e.message });
        throw e;
      }

      // Seller team must belong to this workspace. Leaders always create into
      // their own team regardless of what the body says.
      let teamIdToSet: string | null = null;
      if (auth.role === 'LEADER') {
        teamIdToSet = leaderTeamId;
      } else if (sellerTeamId) {
        const st = await prisma.sellerTeam.findUnique({ where: { id: String(sellerTeamId) } });
        if (!st || st.teamId !== auth.teamId) return badRequest(res, 'Invalid seller team');
        teamIdToSet = st.id;
      }

      const user = await prisma.user.create({
        data: {
          email: normalized,
          password: await hashPassword(String(password)),
          role:
            auth.role === 'LEADER'
              ? (role === 'LEADER' ? 'LEADER' : role === 'FULFILLMENT' ? 'FULFILLMENT' : role === 'DESIGN' ? 'DESIGN' : 'USER')
              : role === 'OWNER' ? 'OWNER' : role === 'LEADER' ? 'LEADER' : role === 'FULFILLMENT' ? 'FULFILLMENT' : role === 'DESIGN' ? 'DESIGN' : 'USER',
          teamId: auth.teamId,
          permissions: permissions ?? {},
          allowedAccounts: allowedAccounts ?? [],
          sellerCodes: codes,
          sellerTeamId: teamIdToSet,
        },
        select: {
          id: true,
          email: true,
          role: true,
          permissions: true,
          allowedAccounts: true,
          sellerCodes: true,
          sellerTeamId: true,
        },
      });
      return res.status(201).json({ user });
    }

    return methodNotAllowed(res, ['GET', 'POST']);
  } catch (err) {
    return serverError(res, err);
  }
}
