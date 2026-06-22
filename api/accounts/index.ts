import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../_lib/prisma.js';
import { requireAuth } from '../_lib/auth.js';
import { badRequest, methodNotAllowed, parseDate, serverError } from '../_lib/helpers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = requireAuth(req, res);
  if (!auth) return;

  try {
    if (req.method === 'GET') {
      const accounts = await prisma.mailAccount.findMany({
        where: { teamId: auth.teamId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
      return res.status(200).json({ accounts });
    }

    if (req.method === 'POST') {
      const { email, label, provider, token, platforms, sortOrder } = req.body || {};
      if (!email || !provider || !token) {
        return badRequest(res, 'email, provider, token are required');
      }
      const providerEnum = String(provider).toUpperCase() === 'OUTLOOK' ? 'OUTLOOK' : 'GMAIL';

      const account = await prisma.mailAccount.upsert({
        where: { teamId_email: { teamId: auth.teamId, email: String(email).toLowerCase() } },
        update: {
          token: String(token),
          label: label ?? undefined,
          platforms: platforms ?? undefined,
        },
        create: {
          teamId: auth.teamId,
          email: String(email).toLowerCase(),
          label: label || null,
          provider: providerEnum,
          token: String(token),
          platforms: platforms ?? null,
          sortOrder: typeof sortOrder === 'number' ? sortOrder : null,
        },
      });
      return res.status(201).json({ account });
    }

    return methodNotAllowed(res, ['GET', 'POST']);
  } catch (err) {
    return serverError(res, err);
  }
}
