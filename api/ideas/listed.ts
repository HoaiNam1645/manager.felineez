import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../_lib/auth.js';
import { methodNotAllowed, serverError } from '../_lib/helpers.js';
import { fetchIdeasSkuMap } from '../_lib/ideasSkuMap.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = requireAuth(req, res);
  if (!auth) return;

  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  try {
    const skuByName = await fetchIdeasSkuMap();
    const ideas = Array.from(skuByName.entries()).map(([productName, sku]) => ({ productName, sku }));
    return res.status(200).json({ ideas });
  } catch (error) {
    return serverError(res, error);
  }
}
