import type { VercelRequest, VercelResponse } from '@vercel/node';
import { methodNotAllowed } from './_lib/helpers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  const { message, stack, componentStack, url, userAgent } = req.body || {};
  console.error('[client-error]', JSON.stringify({
    message: String(message || '').slice(0, 500),
    stack: String(stack || '').slice(0, 2000),
    componentStack: String(componentStack || '').slice(0, 2000),
    url: String(url || '').slice(0, 500),
    userAgent: String(userAgent || '').slice(0, 500),
  }));

  return res.status(204).end();
}
