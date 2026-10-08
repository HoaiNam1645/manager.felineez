import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../_lib/auth.js';
import { uploadImage } from '../_lib/spaces.js';
import { badRequest, methodNotAllowed, serverError } from '../_lib/helpers.js';

/**
 * POST /api/upload
 * Body: { files: Array<string | { data: string; name?: string }> }
 *       (legacy alias: `images`) — each item is a base64 data URI or remote URL.
 * Returns: { images: UploadedImage[] }
 *
 * Used by the local file picker, the folder picker and the Google Drive picker.
 * Accepts mockups as well as design files (.emb/.dst/.pes/.zip/.pdf…), which is
 * why the filename is sent along: those formats carry no usable mime type.
 * Everything is stored per-team in DigitalOcean Spaces.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = requireAuth(req, res);
  if (!auth) return;

  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  try {
    const { images, files, categorySlug } = req.body || {};
    const raw = files ?? images;
    const list: any[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
    if (list.length === 0) return badRequest(res, 'files array is required');
    if (list.length > 20) return badRequest(res, 'max 20 files per upload');

    const items = list.map((it) =>
      typeof it === 'string' ? { data: it, name: undefined } : { data: it?.data, name: it?.name }
    );
    if (items.some((it) => typeof it.data !== 'string' || !it.data)) {
      return badRequest(res, 'each file needs a data URI or url');
    }

    // Organize Spaces objects by team, then category (or "uncategorized").
    const safeSlug = String(categorySlug || 'uncategorized').replace(/[^a-z0-9_-]/gi, '') || 'uncategorized';
    const folder = `nh-media/products/${auth.teamId}/${safeSlug}`;
    const uploaded = await Promise.all(items.map((it) => uploadImage(it.data, folder, it.name)));

    return res.status(200).json({ images: uploaded });
  } catch (err) {
    return serverError(res, err);
  }
}
