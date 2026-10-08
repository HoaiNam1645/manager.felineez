// Seller teams (sales teams inside the workspace, for KPI grouping).
//
//   GET  /api/seller-teams          → { teams: [{ id, name, memberCount, createdAt }] }
//   POST /api/seller-teams { name } → 201 { team }   (owner only)

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../_lib/prisma.js';
import { requireAuth, requireOwner } from '../_lib/auth.js';
import { badRequest, methodNotAllowed, serverError } from '../_lib/helpers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      const auth = requireAuth(req, res);
      if (!auth) return;
      const teams = await prisma.sellerTeam.findMany({
        where: { teamId: auth.teamId },
        include: { _count: { select: { members: true } } },
        orderBy: { createdAt: 'asc' },
      });
      return res.status(200).json({
        teams: teams.map((t) => ({
          id: t.id,
          name: t.name,
          memberCount: t._count.members,
          createdAt: t.createdAt,
        })),
      });
    }

    if (req.method === 'POST') {
      const auth = requireOwner(req, res);
      if (!auth) return;
      const name = String(req.body?.name ?? '').trim();
      if (!name) return badRequest(res, 'Team name is required');
      if (name.length > 50) return badRequest(res, 'Team name too long (max 50 chars)');

      const existing = await prisma.sellerTeam.findUnique({
        where: { teamId_name: { teamId: auth.teamId, name } },
      });
      if (existing) return res.status(409).json({ message: `Team "${name}" already exists` });

      const team = await prisma.sellerTeam.create({ data: { teamId: auth.teamId, name } });
      return res.status(201).json({ team });
    }

    return methodNotAllowed(res, ['GET', 'POST']);
  } catch (err) {
    return serverError(res, err);
  }
}
