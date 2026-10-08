import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../_lib/prisma.js';
import { getAccessTokenFromRefreshToken } from '../_lib/googleAuthHelper.js';
import { methodNotAllowed, serverError } from '../_lib/helpers.js';

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

async function renewWatch(account: { id: string; email: string; token: string; lastKnownHistoryId: string | null }) {
  const topicName = process.env.GMAIL_PUBSUB_TOPIC || process.env.VITE_GMAIL_PUBSUB_TOPIC || '';
  if (!topicName) return { email: account.email, ok: false, reason: 'missing_topic' };

  const accessToken = await getAccessTokenFromRefreshToken(account.token);

  await fetch('https://gmail.googleapis.com/gmail/v1/users/me/stop', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  }).catch(() => undefined);

  await new Promise((resolve) => setTimeout(resolve, 1000));

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      topicName,
      labelIds: ['INBOX'],
      labelFilterAction: 'INCLUDE',
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      email: account.email,
      ok: false,
      reason: data?.error?.message || `watch_failed_${response.status}`,
    };
  }

  const updateData: any = {};
  if (!account.lastKnownHistoryId && data?.historyId) {
    updateData.lastKnownHistoryId = String(data.historyId);
  }
  if (Object.keys(updateData).length > 0) {
    await prisma.mailAccount.update({ where: { id: account.id }, data: updateData });
  }

  return {
    email: account.email,
    ok: true,
    historyId: data?.historyId ? String(data.historyId) : null,
    expiration: data?.expiration ? String(data.expiration) : null,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST']);
  if (!checkSecret(req)) return res.status(401).json({ message: 'Invalid cron secret' });

  try {
    const accounts = await prisma.mailAccount.findMany({
      where: { provider: 'GMAIL' },
      select: { id: true, email: true, token: true, lastKnownHistoryId: true },
      orderBy: { createdAt: 'asc' },
    });

    const results = [];
    for (const account of accounts) {
      try {
        results.push(await renewWatch(account));
      } catch (error: any) {
        results.push({ email: account.email, ok: false, reason: error?.message || String(error) });
      }
    }

    const ok = results.filter((r) => r.ok).length;
    return res.status(200).json({ ok: true, total: results.length, renewed: ok, failed: results.length - ok, results });
  } catch (error) {
    return serverError(res, error);
  }
}
