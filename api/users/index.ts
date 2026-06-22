import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../_lib/prisma.js';
import { requireAuth, requireOwner, hashPassword } from '../_lib/auth.js';
import { badRequest, methodNotAllowed, serverError } from '../_lib/helpers.js';

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
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      });
      return res.status(200).json({ users });
    }

    if (req.method === 'POST') {
      const auth = requireOwner(req, res);
      if (!auth) return;

      const { email, password, role, permissions, allowedAccounts } = req.body || {};
      if (!email || !password) return badRequest(res, 'Email and password are required');
      if (String(password).length < 6) return badRequest(res, 'Password must be at least 6 characters');

      const normalized = String(email).toLowerCase().trim();
      const existing = await prisma.user.findUnique({ where: { email: normalized } });
      if (existing) return res.status(409).json({ message: 'Email already registered' });

      const user = await prisma.user.create({
        data: {
          email: normalized,
          password: await hashPassword(String(password)),
          role: role === 'OWNER' ? 'OWNER' : 'USER',
          teamId: auth.teamId,
          permissions: permissions ?? {},
          allowedAccounts: allowedAccounts ?? [],
        },
        select: {
          id: true,
          email: true,
          role: true,
          permissions: true,
          allowedAccounts: true,
        },
      });
      return res.status(201).json({ user });
    }

    return methodNotAllowed(res, ['GET', 'POST']);
  } catch (err) {
    return serverError(res, err);
  }
}
