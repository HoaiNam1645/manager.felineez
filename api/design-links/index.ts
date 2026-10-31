import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../_lib/prisma.js';
import { requireAuth } from '../_lib/auth.js';
import { badRequest, methodNotAllowed, notFound, serverError } from '../_lib/helpers.js';
import { visibleAccountEmails, visibleCreatorIds } from '../_lib/teamScope.js';

const parseDesignItemKey = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const match = /^design-item:([^:]+):(\d+)$/.exec(value);
  return match ? { recordId: match[1], itemIndex: Number(match[2]), designItemKey: value } : null;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = requireAuth(req, res);
  if (!auth) return;

  try {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
    const { productId, links } = req.body || {};
    if (typeof productId !== 'string' || !productId.trim()) return badRequest(res, 'productId is required');
    if (!Array.isArray(links) || links.length === 0) return badRequest(res, 'links are required');
    if (links.length > 100) return badRequest(res, 'Maximum 100 links per request');

    const parsed = links.map((link: any) => parseDesignItemKey(link?.designItemKey));
    if (parsed.some((link) => !link)) return badRequest(res, 'Invalid design item key');
    const uniqueLinks = Array.from(new Map(parsed.map((link) => [link!.designItemKey, link!])).values());

    const product = await prisma.product.findFirst({ where: { id: productId, teamId: auth.teamId }, select: { id: true, createdById: true } });
    if (!product) return notFound(res);
    const creatorIds = await visibleCreatorIds(auth);
    if (creatorIds && (!product.createdById || !creatorIds.includes(product.createdById))) return notFound(res);

    const recordIds = Array.from(new Set(uniqueLinks.map((link) => link.recordId)));
    const recordWhere: any = { id: { in: recordIds }, teamId: auth.teamId, kind: 'ORDER', deletedAt: null };
    const visibleEmails = await visibleAccountEmails(auth);
    if (visibleEmails) recordWhere.accountEmail = { in: visibleEmails };
    const records = await prisma.record.findMany({ where: recordWhere, select: { id: true, details: true } });
    if (records.length !== recordIds.length) return badRequest(res, 'One or more orders are unavailable');
    const recordById = new Map(records.map((record) => [record.id, record]));
    for (const link of uniqueLinks) {
      const items = (recordById.get(link.recordId)?.details as any)?.items;
      if (Array.isArray(items) && (link.itemIndex < 0 || link.itemIndex >= items.length)) return badRequest(res, 'Order item not found');
    }

    const existing = await prisma.productDesignLink.findMany({ where: { designItemKey: { in: uniqueLinks.map((link) => link.designItemKey) } } });
    const conflict = existing.find((link) => link.productId !== product.id);
    if (conflict) return res.status(409).json({ message: 'Một item đã được link với folder khác và không thể đổi.' });

    const existingKeys = new Set(existing.map((link) => link.designItemKey));
    const toCreate = uniqueLinks.filter((link) => !existingKeys.has(link.designItemKey));
    if (toCreate.length > 0) {
      await prisma.productDesignLink.createMany({
        data: toCreate.map((link) => ({ ...link, teamId: auth.teamId, productId: product.id, linkedById: auth.userId })),
      });
    }

    const saved = await prisma.productDesignLink.findMany({
      where: { designItemKey: { in: uniqueLinks.map((link) => link.designItemKey) }, productId: product.id },
      orderBy: { createdAt: 'asc' },
    });
    return res.status(200).json({ links: saved, created: toCreate.length });
  } catch (error) {
    return serverError(res, error);
  }
}
