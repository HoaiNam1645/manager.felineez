// Cron endpoint: push PENDING/FAILED Etsy orders to feline (safety net for the
// real-time webhook trigger). Called periodically by the server crontab:
//
//   */15 * * * * curl -s -H "X-Cron-Secret: $CRON_SECRET" https://manager.felineez.com/api/export/sync-cron
//
// Auth via CRON_SECRET (header X-Cron-Secret, Bearer token, or ?secret=).

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { methodNotAllowed, serverError } from '../_lib/helpers.js';
import { pushPending } from '../_lib/exportSync.js';

function checkSecret(req: VercelRequest): boolean {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) return false;
  const header =
    (req.headers['x-cron-secret'] as string) ||
    (typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ')
      ? req.headers.authorization.slice(7).trim()
      : '');
  const qSecret = (req.query.secret as string) || '';
  return header === expected || qSecret === expected;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST']);
  if (!checkSecret(req)) return res.status(401).json({ message: 'Invalid cron secret' });

  try {
    const teamId = (req.query.teamId as string) || undefined;
    const limit = parseInt((req.query.limit as string) || '100', 10);
    const result = await pushPending({ teamId, limit });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    return serverError(res, err);
  }
}
