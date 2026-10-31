import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../_lib/prisma.js';
import { requireAuth } from '../_lib/auth.js';
import { badRequest, methodNotAllowed, serverError } from '../_lib/helpers.js';
import { visibleCreatorIds, emailsByUserIds } from '../_lib/teamScope.js';

const STATUS = new Set(['DRAFT', 'ACTIVE', 'ARCHIVED']);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = requireAuth(req, res);
  if (!auth) return;

  try {
    if (req.method === 'GET') {
      const { status, q, categoryId, page = '1', pageSize = '20' } = req.query as Record<string, string>;
      const creatorIds = await visibleCreatorIds(auth);
      const where: any = {
        teamId: auth.teamId,
        ...(creatorIds ? { createdById: { in: creatorIds } } : {}),
      };
      if (status && STATUS.has(status)) where.status = status;
      if (categoryId) where.categoryId = categoryId === 'none' ? null : categoryId;
      if (q) {
        where.OR = [
          { title: { contains: q } },
          { listingTitle: { contains: q } },
          { description: { contains: q } },
        ];
      }

      const take = Math.min(Math.max(parseInt(pageSize, 10) || 20, 1), 100);
      const currentPage = Math.max(parseInt(page, 10) || 1, 1);
      const skip = (currentPage - 1) * take;

      const [products, total] = await Promise.all([
        prisma.product.findMany({
          where,
          take,
          skip,
          orderBy: { createdAt: 'desc' },
          include: { designLinks: { select: { id: true, productId: true, recordId: true, itemIndex: true, designItemKey: true, createdAt: true } } },
        }),
        prisma.product.count({ where }),
      ]);

      const emailById = await emailsByUserIds(products.map((pr) => pr.createdById));
      return res.status(200).json({
        products: products.map((pr) => ({
          ...pr,
          createdByEmail: pr.createdById ? emailById.get(pr.createdById) ?? null : null,
        })),
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
      if (typeof source === 'string' && source.startsWith('design-item:')) {
        const permanentLink = await prisma.productDesignLink.findUnique({
          where: { designItemKey: source },
          include: { product: { include: { designLinks: true } } },
        });
        if (permanentLink?.product.teamId === auth.teamId) {
          return res.status(200).json({ product: permanentLink.product, existing: true });
        }
        const linkedProducts = await prisma.product.findMany({ where: { teamId: auth.teamId, source }, orderBy: { updatedAt: 'desc' }, include: { designLinks: true } });
        const existing = linkedProducts.sort((a, b) => {
          const aFiles = Array.isArray(a.images) ? a.images.length : 0;
          const bFiles = Array.isArray(b.images) ? b.images.length : 0;
          return bFiles - aFiles;
        })[0];
        if (existing) return res.status(200).json({ product: existing, existing: true });
      }
      const product = await prisma.$transaction(async (tx) => {
        const created = await tx.product.create({
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
        if (typeof source === 'string' && source.startsWith('design-item:')) {
          const match = /^design-item:([^:]+):(\d+)$/.exec(source);
          if (!match) throw new Error('Invalid design item key');
          const record = await tx.record.findFirst({ where: { id: match[1], teamId: auth.teamId, kind: 'ORDER', deletedAt: null }, select: { id: true } });
          if (!record) throw new Error('Order item not found');
          await tx.productDesignLink.create({
            data: { teamId: auth.teamId, productId: created.id, recordId: record.id, itemIndex: Number(match[2]), designItemKey: source, linkedById: auth.userId },
          });
        }
        return tx.product.findUniqueOrThrow({ where: { id: created.id }, include: { designLinks: true } });
      });
      return res.status(201).json({ product });
    }

    return methodNotAllowed(res, ['GET', 'POST']);
  } catch (err) {
    return serverError(res, err);
  }
}
