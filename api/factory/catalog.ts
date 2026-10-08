import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../_lib/auth.js';
import { badRequest, methodNotAllowed, serverError } from '../_lib/helpers.js';
import { mangoFetch, vinawayFetch, monkeyKingFetch, dreamshipFetch, hongPhatFetch, hogotoFetch, FactoryError } from '../_lib/factory.js';

// Catalog proxy for MangoTee / Vinaway (variant resolution steps).
//   GET /api/factory/catalog?provider=mango&what=production-lines|products|variations
//       (&product_id=&color=&size=&production_line_id=&page=&limit=&search=)
//   GET /api/factory/catalog?provider=vinaway&what=production-lines|products|skus (&page=&limit=)
//
// Responses are cached in memory for 10 minutes: these are static catalogs and
// Mango's /products endpoint alone takes ~6s, so only the first hit pays it.
const catalogCache = new Map<string, { exp: number; body: any }>();
const CACHE_TTL_MS = 10 * 60_000;

function cacheGet(key: string): any | null {
  const hit = catalogCache.get(key);
  if (!hit) return null;
  if (hit.exp < Date.now()) {
    catalogCache.delete(key);
    return null;
  }
  return hit.body;
}

function cacheSet(key: string, body: any) {
  if (catalogCache.size > 500) catalogCache.clear();
  catalogCache.set(key, { exp: Date.now() + CACHE_TTL_MS, body });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = requireAuth(req, res);
  if (!auth) return;
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const { provider, what, product_id, color, size, production_line_id, page, limit, search } =
    req.query as Record<string, string>;

  const cacheKey = `${auth.teamId}|${provider}|${what}|${product_id || ''}|${color || ''}|${size || ''}|${production_line_id || ''}|${page || ''}|${limit || ''}|${search || ''}`;
  const cached = cacheGet(cacheKey);
  if (cached) return res.status(200).json(cached);

  const qs = new URLSearchParams();
  if (page) qs.set('page', page);
  if (limit) qs.set('limit', limit);

  try {
    if (provider === 'mango') {
      let path: string;
      if (what === 'production-lines') {
        path = '/production-lines';
      } else if (what === 'products') {
        if (search) qs.set('search', search);
        path = '/products';
      } else if (what === 'variations') {
        if (!product_id) return badRequest(res, 'product_id is required');
        if (color) qs.set('color', color);
        if (size) qs.set('size', size);
        if (production_line_id) qs.set('production_line_id', production_line_id);
        path = `/products/${encodeURIComponent(product_id)}/variations`;
      } else {
        return badRequest(res, 'what must be production-lines|products|variations');
      }
      const data = await mangoFetch(auth.teamId, `${path}${qs.toString() ? `?${qs}` : ''}`);
      cacheSet(cacheKey, data);
      return res.status(200).json(data);
    }

    if (provider === 'vinaway') {
      const paths: Record<string, string> = {
        'production-lines': '/production-lines',
        products: '/products',
        skus: '/product-skus',
      };
      if (!what || !paths[what]) return badRequest(res, 'what must be production-lines|products|skus');
      const data = await vinawayFetch(auth.teamId, `${paths[what]}${qs.toString() ? `?${qs}` : ''}`);
      cacheSet(cacheKey, data);
      return res.status(200).json(data);
    }

    if (provider === 'monkeyking') {
      if (what !== 'products') return badRequest(res, 'what must be products');
      const data = await monkeyKingFetch(auth.teamId, '/configurable-product');
      cacheSet(cacheKey, data);
      return res.status(200).json(data);
    }

    if (provider === 'dreamship') {
      // Django-style endpoints (trailing slash); pagination via ?limit=&page=
      if (what === 'items') {
        const data = await dreamshipFetch(auth.teamId, `/items/${qs.toString() ? `?${qs}` : ''}`);
        cacheSet(cacheKey, data);
        return res.status(200).json(data);
      }
      if (what === 'item') {
        if (!product_id) return badRequest(res, 'product_id is required');
        const data = await dreamshipFetch(auth.teamId, `/items/${encodeURIComponent(product_id)}/`);
        cacheSet(cacheKey, data);
        return res.status(200).json(data);
      }
      return badRequest(res, 'what must be items|item');
    }

    if (provider === 'hongphat') {
      const paths: Record<string, string> = {
        products: '/products',
        positions: '/positions',
      };
      if (!what || !paths[what]) return badRequest(res, 'what must be products|positions');
      const data = await hongPhatFetch(auth.teamId, `${paths[what]}${qs.toString() ? `?${qs}` : ''}`);
      cacheSet(cacheKey, data);
      return res.status(200).json(data);
    }

    if (provider === 'hogoto') {
      if (what !== 'products') return badRequest(res, 'what must be products');
      const data = await hogotoFetch(auth.teamId, '/v1/product');
      cacheSet(cacheKey, data);
      return res.status(200).json(data);
    }

    return badRequest(res, 'provider must be mango|vinaway|monkeyking|dreamship|hongphat|hogoto');
  } catch (err) {
    if (err instanceof FactoryError) {
      return res.status(err.status).json({ message: err.message, errors: err.data });
    }
    return serverError(res, err);
  }
}
