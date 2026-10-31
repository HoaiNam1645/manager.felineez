import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../_lib/prisma.js';
import { requireAuth } from '../_lib/auth.js';
import { visibleCreatorIds } from '../_lib/teamScope.js';
import { badRequest, methodNotAllowed, notFound, parseId, serverError } from '../_lib/helpers.js';
import { deleteImage as deleteCloudinaryImage } from '../_lib/cloudinary.js';
import { deleteImage as deleteSpacesImage, isSpacesImage } from '../_lib/spaces.js';

const STATUS = new Set(['DRAFT', 'ACTIVE', 'ARCHIVED']);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = requireAuth(req, res);
  if (!auth) return;

  const id = parseId(req.query.id);
  if (!id) return badRequest(res, 'id is required');

  try {
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        designLinks: {
          orderBy: { createdAt: 'asc' },
          include: { record: { select: { id: true, orderId: true, accountEmail: true, orderStatus: true, productName: true, details: true } } },
        },
      },
    });
    if (!product || product.teamId !== auth.teamId) return notFound(res);
    // Non-owners may only touch folders created within their seller team.
    const creatorIds = await visibleCreatorIds(auth);
    if (creatorIds && (!product.createdById || !creatorIds.includes(product.createdById))) {
      return notFound(res);
    }

    if (req.method === 'GET') {
      return res.status(200).json({ product });
    }

    if (req.method === 'PATCH') {
      const { title, listingTitle, price, currency, description, images, status, categoryId, source } = req.body || {};
      const data: any = {};
      if (title !== undefined) data.title = title;
      if (listingTitle !== undefined) data.listingTitle = listingTitle;
      if (price !== undefined) data.price = price === '' || price == null ? null : Number(price);
      if (currency !== undefined) data.currency = currency;
      if (description !== undefined) data.description = description;
      if (images !== undefined) data.images = images;
      if (status !== undefined && STATUS.has(status)) data.status = status;
      if (categoryId !== undefined) data.categoryId = categoryId || null;
      if (source !== undefined && source !== product.source) {
        return badRequest(res, 'Design folder links are permanent. Use the design links API.');
      }

      const updated = await prisma.product.update({
        where: { id },
        data,
        include: {
          designLinks: {
            orderBy: { createdAt: 'asc' },
            include: { record: { select: { id: true, orderId: true, accountEmail: true, orderStatus: true, productName: true, details: true } } },
          },
        },
      });
      return res.status(200).json({ product: updated });
    }

    if (req.method === 'DELETE') {
      if (product.designLinks.length > 0) {
        return res.status(409).json({ message: 'Folder đã liên kết với đơn nên không thể xóa.' });
      }
      // Best-effort cleanup of stored assets (Spaces for new uploads,
      // Cloudinary for legacy ones).
      const imgs = (product.images as any[]) || [];
      await Promise.all(
        imgs
          .filter((im) => im?.publicId)
          .map((im) =>
            (isSpacesImage(im)
              ? deleteSpacesImage(im.publicId)
              : deleteCloudinaryImage(im.publicId)
            ).catch(() => undefined)
          )
      );
      await prisma.product.delete({ where: { id } });
      return res.status(204).end();
    }

    return methodNotAllowed(res, ['GET', 'PATCH', 'DELETE']);
  } catch (err) {
    return serverError(res, err);
  }
}
