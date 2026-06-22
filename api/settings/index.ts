import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../_lib/prisma.js';
import { requireAuth } from '../_lib/auth.js';
import { methodNotAllowed, serverError } from '../_lib/helpers.js';

/**
 * Per-team settings (notification prefs, app preferences, sync flags).
 * Stored as a single Setting row keyed by `team:{teamId}`.
 */

function key(teamId: string) {
  return `team:${teamId}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = requireAuth(req, res);
  if (!auth) return;

  try {
    if (req.method === 'GET') {
      const setting = await prisma.setting.findUnique({ where: { key: key(auth.teamId) } });
      return res.status(200).json({ settings: setting?.value ?? {} });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const body = req.body || {};
      const existing = await prisma.setting.findUnique({ where: { key: key(auth.teamId) } });
      const merged = req.method === 'PATCH'
        ? { ...((existing?.value as any) || {}), ...body }
        : body;

      const saved = await prisma.setting.upsert({
        where: { key: key(auth.teamId) },
        update: { value: merged },
        create: { key: key(auth.teamId), value: merged },
      });
      return res.status(200).json({ settings: saved.value });
    }

    return methodNotAllowed(res, ['GET', 'PUT', 'PATCH']);
  } catch (err) {
    return serverError(res, err);
  }
}
