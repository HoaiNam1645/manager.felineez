import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../_lib/auth.js';
import { uploadImage } from '../_lib/cloudinary.js';
import { badRequest, methodNotAllowed, serverError } from '../_lib/helpers.js';

/**
 * POST /api/upload
 * Body: { images: string[] }  where each item is a base64 data URI or remote URL.
 * Returns: { images: UploadedImage[] }
 *
 * Used by both the local file picker and the Google Drive picker — the frontend
 * reads the file into a data URI and posts it here. Images are stored per-team
 * in Cloudinary.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = requireAuth(req, res);
  if (!auth) return;

  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  try {
    const { images, categorySlug } = req.body || {};
    const list: string[] = Array.isArray(images) ? images : images ? [images] : [];
    if (list.length === 0) return badRequest(res, 'images array is required');
    if (list.length > 20) return badRequest(res, 'max 20 images per upload');

    // Organize Cloudinary assets by team, then category (or "uncategorized").
    const safeSlug = String(categorySlug || 'uncategorized').replace(/[^a-z0-9_-]/gi, '') || 'uncategorized';
    const folder = `nh-media/products/${auth.teamId}/${safeSlug}`;
    const uploaded = await Promise.all(list.map((src) => uploadImage(src, folder)));

    return res.status(200).json({ images: uploaded });
  } catch (err) {
    return serverError(res, err);
  }
}
