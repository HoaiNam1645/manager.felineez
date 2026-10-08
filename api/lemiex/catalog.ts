import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../_lib/auth.js';
import { badRequest, methodNotAllowed, serverError } from '../_lib/helpers.js';
import { lemiexGet, LemiexError } from '../_lib/lemiex.js';

// Proxy for the Lemiex product catalog (styles/colors/sizes/variants).
// The browser never talks to Lemiex directly — credentials stay server-side.
//   GET /api/lemiex/catalog?what=styles|colors|sizes|variants
//     &line=embroidery|print &style=&color=&size=&search=&page=&per_page=
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = requireAuth(req, res);
  if (!auth) return;

  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);

  const { what, line, style, color, size, search, page, per_page } = req.query as Record<string, string>;
  const WHAT_PATHS: Record<string, string> = {
    styles: '/styles',
    colors: '/colors',
    sizes: '/sizes',
    variants: '/all-variants',
  };
  // Metadata lives outside the embroidery/print prefix split.
  const META_PATHS: Record<string, string> = {
    'embroidery-types': '/api/metadata/embroidery-types',
    'priorities': '/api/metadata/fulfillment-priorities',
  };
  if (!what || (!WHAT_PATHS[what] && !META_PATHS[what])) {
    return badRequest(res, 'what must be styles|colors|sizes|variants|embroidery-types|priorities');
  }

  if (META_PATHS[what]) {
    try {
      const data = await lemiexGet(auth.teamId, META_PATHS[what]);
      return res.status(200).json(data);
    } catch (err) {
      if (err instanceof LemiexError) {
        return res.status(err.status === 401 ? 502 : err.status).json({ message: err.message });
      }
      return serverError(res, err);
    }
  }

  const prefix = line === 'print' ? '/api/print' : '/api';
  const qs = new URLSearchParams();
  if (style) qs.set('style', style);
  if (color) qs.set('color', color);
  if (size) qs.set('size', size);
  if (search) qs.set('search', search);
  if (page) qs.set('page', page);
  if (per_page) qs.set('per_page', per_page);
  const query = qs.toString();

  try {
    const data = await lemiexGet(auth.teamId, `${prefix}${WHAT_PATHS[what]}${query ? `?${query}` : ''}`);
    return res.status(200).json(data);
  } catch (err) {
    if (err instanceof LemiexError) {
      return res.status(err.status === 401 ? 502 : err.status).json({ message: err.message });
    }
    return serverError(res, err);
  }
}
