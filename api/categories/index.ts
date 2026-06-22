import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../_lib/prisma.js';
import { requireAuth } from '../_lib/auth.js';
import { badRequest, methodNotAllowed, serverError } from '../_lib/helpers.js';

function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'category';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = requireAuth(req, res);
  if (!auth) return;

  try {
    if (req.method === 'GET') {
      const categories = await prisma.category.findMany({
        where: { teamId: auth.teamId },
        orderBy: { name: 'asc' },
        include: { _count: { select: { products: true } } },
      });
      return res.status(200).json({
        categories: categories.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          productCount: c._count.products,
          createdAt: c.createdAt,
        })),
      });
    }

    if (req.method === 'POST') {
      const { name } = req.body || {};
      if (!name || !String(name).trim()) return badRequest(res, 'name is required');

      let slug = slugify(String(name));
      // Ensure unique slug per team
      const existing = await prisma.category.findUnique({
        where: { teamId_slug: { teamId: auth.teamId, slug } },
      });
      if (existing) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

      const category = await prisma.category.create({
        data: { teamId: auth.teamId, name: String(name).trim(), slug },
      });
      return res.status(201).json({ category });
    }

    return methodNotAllowed(res, ['GET', 'POST']);
  } catch (err) {
    return serverError(res, err);
  }
}
