import { prisma } from './prisma.js';

const IDEAS_URL = 'https://ideas.felineez.com/api/public/listed-ideas';

type ListedIdeaPayload = {
  product_name?: string;
  sku?: string;
};

export type IdeasSkuMapResult = {
  ideas: number;
  scanned: number;
  updatedRecords: number;
  updatedItems: number;
};

export const normalizeIdeaName = (value?: string | null) =>
  (value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export async function fetchIdeasSkuMap(): Promise<Map<string, string>> {
  const skuByName = new Map<string, string>();
  let page = 1;
  let lastPage = 1;

  do {
    const url = new URL(IDEAS_URL);
    url.searchParams.set('page', String(page));
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Ideas API failed with HTTP ${response.status}`);
    }
    const payload = await response.json();
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    for (const item of rows as ListedIdeaPayload[]) {
      const key = normalizeIdeaName(item.product_name);
      const sku = String(item.sku || '').trim();
      if (key && sku && !skuByName.has(key)) skuByName.set(key, sku);
    }
    lastPage = Math.max(1, Number(payload?.meta?.last_page || 1));
    page += 1;
  } while (page <= lastPage && page <= 20);

  return skuByName;
}

export async function mapMissingOrderSkusFromIdeas(options: { teamId?: string; limit?: number } = {}): Promise<IdeasSkuMapResult> {
  const skuByName = await fetchIdeasSkuMap();
  const take = Math.min(Math.max(options.limit || 5000, 1), 20000);
  const where: any = { kind: 'ORDER' };
  if (options.teamId) where.teamId = options.teamId;

  const records = await prisma.record.findMany({
    where,
    take,
    orderBy: { dtLocal: 'desc' },
    select: { id: true, details: true, etsyFees: true },
  });

  let updatedRecords = 0;
  let updatedItems = 0;

  for (const record of records) {
    const details = record.details && typeof record.details === 'object' && !Array.isArray(record.details)
      ? structuredClone(record.details as any)
      : null;
    if (!details || !Array.isArray(details.items)) continue;

    let changed = false;
    details.items = details.items.map((item: any) => {
      if (!item || typeof item !== 'object' || String(item.sku || '').trim()) return item;
      const sku = skuByName.get(normalizeIdeaName(item.name));
      if (!sku) return item;
      changed = true;
      updatedItems++;
      return { ...item, sku };
    });

    if (!changed) continue;

    const fees = record.etsyFees && typeof record.etsyFees === 'object' && !Array.isArray(record.etsyFees)
      ? (record.etsyFees as any)
      : {};
    const data: any = { details };
    if (details.items.length === 1) data.etsyFees = { ...fees, sku: details.items[0]?.sku || null };

    await prisma.record.update({
      where: { id: record.id },
      data,
    });
    updatedRecords++;
  }

  return {
    ideas: skuByName.size,
    scanned: records.length,
    updatedRecords,
    updatedItems,
  };
}
