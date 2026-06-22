import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../_lib/prisma.js';
import { requireAuth } from '../_lib/auth.js';
import { badRequest, methodNotAllowed, notFound, parseId, serverError } from '../_lib/helpers.js';
import { deleteImage } from '../_lib/cloudinary.js';

const STATUS = new Set(['DRAFT', 'ACTIVE', 'ARCHIVED']);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = requireAuth(req, res);
  if (!auth) return;

  const id = parseId(req.query.id);
  if (!id) return badRequest(res, 'id is required');

  try {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product || product.teamId !== auth.teamId) return notFound(res);

    if (req.method === 'GET') {
      return res.status(200).json({ product });
    }

    if (req.method === 'PATCH') {
      const { title, listingTitle, price, currency, description, images, status, categoryId } = req.body || {};
      const data: any = {};
      if (title !== undefined) data.title = title;
      if (listingTitle !== undefined) data.listingTitle = listingTitle;
      if (price !== undefined) data.price = price === '' || price == null ? null : Number(price);
      if (currency !== undefined) data.currency = currency;
      if (description !== undefined) data.description = description;
      if (images !== undefined) data.images = images;
      if (status !== undefined && STATUS.has(status)) data.status = status;
      if (categoryId !== undefined) data.categoryId = categoryId || null;

      const updated = await prisma.product.update({ where: { id }, data });
      return res.status(200).json({ product: updated });
    }

    if (req.method === 'DELETE') {
      // Best-effort cleanup of Cloudinary assets.
      const imgs = (product.images as any[]) || [];
      await Promise.all(
        imgs
          .filter((im) => im?.publicId)
          .map((im) => deleteImage(im.publicId).catch(() => undefined))
      );
      await prisma.product.delete({ where: { id } });
      return res.status(204).end();
    }

    return methodNotAllowed(res, ['GET', 'PATCH', 'DELETE']);
  } catch (err) {
    return serverError(res, err);
  }
}
