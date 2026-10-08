// Cron endpoint: map missing item SKU from ideas.felineez.com every 6 hours.
//
//   0 */6 * * * curl -s -H "X-Cron-Secret: $CRON_SECRET" https://manager.felineez.com/api/ideas/sku-cron

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { methodNotAllowed, serverError } from '../_lib/helpers.js';
import { mapMissingOrderSkusFromIdeas } from '../_lib/ideasSkuMap.js';

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
    const limit = parseInt((req.query.limit as string) || '5000', 10);
    const result = await mapMissingOrderSkusFromIdeas({ teamId, limit });
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    return serverError(res, error);
  }
}
