import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../_lib/prisma.js';
import { hashPassword, signToken } from '../_lib/auth.js';

/**
 * Bootstrap registration: creates a new Team + the first OWNER user.
 * If any team already exists, this endpoint is disabled by default.
 * Use the Users API (POST /api/users) under an OWNER token to add more users.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { email, password, teamName } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  if (String(password).length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }

  const allowOpenRegistration = process.env.ALLOW_OPEN_REGISTRATION === 'true';
  const existingTeams = await prisma.team.count();
  if (existingTeams > 0 && !allowOpenRegistration) {
    return res.status(403).json({
      message: 'Open registration is disabled. Ask an Owner to create your account.',
    });
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return res.status(409).json({ message: 'Email already registered' });
  }

  const hash = await hashPassword(String(password));

  const result = await prisma.$transaction(async (tx) => {
    const team = await tx.team.create({
      data: { name: teamName || `${normalizedEmail}'s team` },
    });
    const user = await tx.user.create({
      data: {
        email: normalizedEmail,
        password: hash,
        role: 'OWNER',
        teamId: team.id,
        permissions: { revenue: true, cost: true, fulfill: true } as any,
      },
    });
    return { team, user };
  });

  const token = signToken({
    userId: result.user.id,
    teamId: result.team.id,
    role: 'OWNER',
    email: result.user.email,
  });

  return res.status(201).json({
    token,
    user: {
      id: result.user.id,
      email: result.user.email,
      role: result.user.role,
      teamId: result.user.teamId,
      permissions: result.user.permissions,
    },
  });
}
