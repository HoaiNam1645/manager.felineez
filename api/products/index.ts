import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../_lib/prisma.js';
import { requireAuth } from '../_lib/auth.js';
import { badRequest, methodNotAllowed, serverError } from '../_lib/helpers.js';

const STATUS = new Set(['DRAFT', 'ACTIVE', 'ARCHIVED']);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = requireAuth(req, res);
  if (!auth) return;

  try {
    if (req.method === 'GET') {
      const { status, q, categoryId, page = '1', pageSize = '20' } = req.query as Record<string, string>;
      const where: any = { teamId: auth.teamId };
      if (status && STATUS.has(status)) where.status = status;
      if (categoryId) where.categoryId = categoryId === 'none' ? null : categoryId;
      if (q) where.title = { contains: q };

      const take = Math.min(Math.max(parseInt(pageSize, 10) || 20, 1), 100);
      const currentPage = Math.max(parseInt(page, 10) || 1, 1);
      const skip = (currentPage - 1) * take;

      const [products, total] = await Promise.all([
        prisma.product.findMany({ where, take, skip, orderBy: { createdAt: 'desc' } }),
        prisma.product.count({ where }),
      ]);

      return res.status(200).json({
        products,
        total,
        page: currentPage,
        pageSize: take,
        totalPages: Math.ceil(total / take),
      });
    }

    if (req.method === 'POST') {
      const { title, listingTitle, price, currency, description, images, status, source, categoryId } = req.body || {};
      // A product is a "folder": it can be created with just a title (name) and
      // have mockup images added later. Images are optional at creation.
      if (!title && (!images || (Array.isArray(images) && images.length === 0))) {
        return badRequest(res, 'A title or at least one image is required');
      }
      const product = await prisma.product.create({
        data: {
          teamId: auth.teamId,
          createdById: auth.userId,
          categoryId: categoryId || null,
          title: title ?? null,
          listingTitle: listingTitle ?? null,
          price: price != null && price !== '' ? Number(price) : null,
          currency: currency || 'USD',
          description: description ?? null,
          images: images ?? [],
          status: STATUS.has(status) ? status : 'DRAFT',
          source: source || 'local',
        },
      });
      return res.status(201).json({ product });
    }

    return methodNotAllowed(res, ['GET', 'POST']);
  } catch (err) {
    return serverError(res, err);
  }
}
