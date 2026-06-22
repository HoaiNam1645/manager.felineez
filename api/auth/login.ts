import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../_lib/prisma.js';
import { comparePassword, signToken } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const user = await prisma.user.findUnique({
    where: { email: String(email).toLowerCase().trim() },
  });

  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const ok = await comparePassword(String(password), user.password);
  if (!ok) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const token = signToken({
    userId: user.id,
    teamId: user.teamId,
    role: user.role,
    email: user.email,
  });

  return res.status(200).json({
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      teamId: user.teamId,
      permissions: user.permissions,
      allowedAccounts: user.allowedAccounts,
    },
  });
}
