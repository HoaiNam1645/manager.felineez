import type { VercelRequest, VercelResponse } from '@vercel/node';
import { prisma } from '../_lib/prisma.js';
import { methodNotAllowed, serverError } from '../_lib/helpers.js';

const REPORT_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const MAX_RANGE_DAYS = 371;
const FALLBACK_FEE_RATE = 0.145;

type JsonMap = Record<string, any>;

function checkSecret(req: VercelRequest): boolean {
  const expected = process.env.EXPORT_API_SECRET || '';
  const supplied = String(req.headers['x-sync-secret'] || '');
  return Boolean(expected) && supplied === expected;
}

function queryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function parseIds(value: string | string[] | undefined): string[] {
  const raw = queryValue(value).trim();
  if (!raw || raw === 'all') return [];
  return [...new Set(raw.split(',').map((item) => item.trim()).filter(Boolean))];
}

function parseReportDate(value: string | string[] | undefined, name: string): string {
  const date = queryValue(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new Error(`${name} must use YYYY-MM-DD`);
  }
  return date;
}

function reportBoundary(date: string, end = false): Date {
  // Vietnam is UTC+7 year-round. A report day starts at 17:00 UTC on the previous date.
  const instant = new Date(`${date}T00:00:00.000Z`);
  instant.setUTCHours(instant.getUTCHours() - 7);
  if (end) instant.setUTCDate(instant.getUTCDate() + 1);
  return instant;
}

function numberOf(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function dayKey(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(value);
}

function enumerateDays(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function originalTotal(record: any, fees: JsonMap): number {
  return optionalNumber(fees.orderTotal)
    ?? optionalNumber(record.details?.financials?.orderTotal)
    ?? numberOf(record.amount);
}

function isFullRefund(record: any, fees: JsonMap): boolean {
  if (record.orderStatus !== 'REFUND') return false;
  const refund = optionalNumber(record.refundAmount);
  if (refund === null) return true;
  const total = originalTotal(record, fees);
  return total <= 0 || refund >= total - 0.01;
}

function normalizedNet(record: any, fees: JsonMap): { value: number; source: 'actual' | 'orderNet' | 'fallback' } {
  if (isFullRefund(record, fees)) return { value: 0, source: 'actual' };
  const actual = optionalNumber(fees.estActualNet);
  if (actual !== null) return { value: round(actual), source: 'actual' };
  const total = originalTotal(record, fees);
  const rawNet = optionalNumber(fees.orderNet);
  if (rawNet !== null && rawNet > 0) {
    const cardFees = numberOf(fees.cardFees);
    const value = rawNet > total && rawNet + cardFees > 0
      ? (total * rawNet) / (rawNet + cardFees)
      : rawNet;
    return { value: round(value), source: 'orderNet' };
  }
  return { value: round(total * (1 - FALLBACK_FEE_RATE)), source: 'fallback' };
}

function itemRows(record: any): Array<{ name: string; sku: string; quantity: number; price: number }> {
  const details = (record.details || {}) as JsonMap;
  if (Array.isArray(details.items) && details.items.length) {
    return details.items.map((item: JsonMap) => ({
      name: String(item?.name || record.productName || 'Sản phẩm chưa xác định').trim(),
      sku: String(item?.sku || '').trim(),
      quantity: Math.max(1, Math.round(numberOf(item?.quantity) || 1)),
      price: numberOf(item?.price),
    }));
  }
  const fees = (record.etsyFees || {}) as JsonMap;
  const skus = String(fees.sku || '').split(',').map((value) => value.trim()).filter(Boolean);
  if (skus.length) return skus.map((sku) => ({ name: record.productName || sku, sku, quantity: 1, price: 0 }));
  const names = String(record.productName || '').split(',').map((value) => value.trim()).filter(Boolean);
  return names.length ? names.map((name) => ({ name, sku: '', quantity: 1, price: 0 })) : [];
}

function add(target: JsonMap, values: JsonMap, share = 1): void {
  for (const [key, value] of Object.entries(values)) target[key] = numberOf(target[key]) + numberOf(value) * share;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  if (!checkSecret(req)) return res.status(401).json({ message: 'Invalid sync secret' });

  try {
    const startDate = parseReportDate(req.query.startDate, 'startDate');
    const endDate = parseReportDate(req.query.endDate, 'endDate');
    const rangeDays = Math.floor((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000) + 1;
    if (rangeDays < 1 || rangeDays > MAX_RANGE_DAYS) {
      return res.status(400).json({ message: `Date range must be between 1 and ${MAX_RANGE_DAYS} days` });
    }

    const requestedTeamIds = parseIds(req.query.sellerTeamId);
    const requestedShopIds = parseIds(req.query.shopId);
    const requestedSellerIds = parseIds(req.query.sellerId);
    const start = reportBoundary(startDate);
    const end = reportBoundary(endDate, true);

    const [sellerTeams, users, shops] = await Promise.all([
      prisma.sellerTeam.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      prisma.user.findMany({ where: { deletedAt: null }, select: { id: true, email: true, sellerCodes: true, sellerTeamId: true }, orderBy: { email: 'asc' } }),
      prisma.mailAccount.findMany({ select: { id: true, email: true, label: true, lastSyncedAt: true }, orderBy: [{ sortOrder: 'asc' }, { email: 'asc' }] }),
    ]);
    const requestedShopEmails = shops.filter((shop) => requestedShopIds.includes(shop.id)).map((shop) => shop.email);
    const shopWhere = requestedShopIds.length ? { OR: [{ accountId: { in: requestedShopIds } }, { accountEmail: { in: requestedShopEmails } }] } : {};
    const [orders, funds, manualCosts, latest] = await Promise.all([
      prisma.record.findMany({
        where: { kind: 'ORDER', source: 'Etsy_Sales', deletedAt: null, dtLocal: { gte: start, lt: end }, ...shopWhere },
        select: { id: true, accountId: true, accountEmail: true, dtLocal: true, amount: true, orderId: true, currency: true, costTotal: true, designCost: true, refundAmount: true, orderStatus: true, productName: true, details: true, etsyFees: true, updatedAt: true },
        orderBy: { dtLocal: 'asc' },
      }),
      prisma.record.findMany({
        where: { kind: 'FUNDS', deletedAt: null, dtLocal: { gte: start, lt: end }, ...shopWhere },
        select: { amount: true, currency: true, accountId: true, accountEmail: true },
      }),
      prisma.manualCost.findMany({ where: { date: { gte: start, lt: end } }, select: { cost: true, currency: true } }),
      prisma.record.aggregate({ where: { deletedAt: null }, _max: { updatedAt: true } }),
    ]);

    const shopById = new Map(shops.map((shop) => [shop.id, shop]));
    const shopByEmail = new Map(shops.map((shop) => [shop.email.toLowerCase(), shop]));
    const teamById = new Map(sellerTeams.map((team) => [team.id, team]));
    const codeOwner = new Map<string, typeof users[number]>();
    for (const user of users) {
      const codes = Array.isArray(user.sellerCodes) ? user.sellerCodes : [];
      for (const code of codes) codeOwner.set(String(code).trim().toUpperCase(), user);
    }

    const hasSellerScope = requestedSellerIds.length > 0;
    const hasTeamScope = requestedTeamIds.length > 0;
    const sellerAllowed = (user: typeof users[number]) =>
      (!hasSellerScope || requestedSellerIds.includes(user.id))
      && (!hasTeamScope || Boolean(user.sellerTeamId && requestedTeamIds.includes(user.sellerTeamId)));

    const summary: JsonMap = { orders: 0, items: 0, grossBookedValue: 0, recognizedRevenue: 0, etsyNet: 0, fulfillmentCost: 0, designCost: 0, refundAmount: 0, manualCost: 0, manualCostVnd: 0, operationalProfit: 0, funds: round(funds.filter((row) => (row.currency || 'USD') === 'USD').reduce((sum, row) => sum + numberOf(row.amount), 0)), fundsVnd: round(funds.filter((row) => row.currency === 'VND').reduce((sum, row) => sum + numberOf(row.amount), 0)), shops: 0, activeSellers: 0 };
    const statusMap = new Map<string, number>();
    const trendMap = new Map(enumerateDays(startDate, endDate).map((date) => [date, { date, orders: 0, items: 0, net: 0, profit: 0 }]));
    const sellerMap = new Map<string, JsonMap>();
    const teamMap = new Map<string, JsonMap>();
    const shopMap = new Map<string, JsonMap>();
    const productMap = new Map<string, JsonMap>();
    const activeShopIds = new Set<string>();
    const activeSellerIds = new Set<string>();
    const quality = { totalOrders: orders.length, noSkuOrders: 0, unknownSellerOrders: 0, fallbackNetOrders: 0, orderNetOrders: 0, actualNetOrders: 0, missingShopOrders: 0, unattributedOrders: 0, attributionRate: 0, unknownPrefixes: [] as Array<{ prefix: string; orders: number }> };
    const unknownPrefixes = new Map<string, number>();

    for (const order of orders) {
      const fees = (order.etsyFees || {}) as JsonMap;
      const fullRefund = isFullRefund(order, fees);
      const gross = originalTotal(order, fees);
      const recognized = fullRefund || order.orderStatus === 'CANCELLED' ? 0 : gross;
      const netResult = normalizedNet(order, fees);
      quality[`${netResult.source}NetOrders` as 'fallbackNetOrders']++;
      const ff = numberOf(order.costTotal);
      const design = numberOf(order.designCost);
      const refund = numberOf(order.refundAmount);
      const refundCost = fullRefund ? 0 : refund;
      const metrics = { grossBookedValue: gross, recognizedRevenue: recognized, etsyNet: netResult.value, fulfillmentCost: ff, designCost: design, refundAmount: refund, operationalProfit: netResult.value - ff - design - refundCost };
      const items = itemRows(order);
      const weightedSkus = items.flatMap((item) => Array.from({ length: item.quantity }, () => item.sku).filter(Boolean));
      if (!weightedSkus.length) quality.noSkuOrders++;

      const sellerCounts = new Map<string, { user: typeof users[number]; count: number }>();
      const seenUnknown = new Set<string>();
      for (const sku of weightedSkus) {
        const prefix = sku.slice(0, 2).toUpperCase();
        const owner = codeOwner.get(prefix);
        if (owner && sellerAllowed(owner)) {
          const current = sellerCounts.get(owner.id);
          sellerCounts.set(owner.id, { user: owner, count: (current?.count || 0) + 1 });
        } else if (!owner) {
          seenUnknown.add(prefix || '(trống)');
        }
      }
      for (const prefix of seenUnknown) unknownPrefixes.set(prefix, (unknownPrefixes.get(prefix) || 0) + 1);
      if (weightedSkus.length && !sellerCounts.size) quality.unknownSellerOrders++;

      const sellerScoped = hasSellerScope || hasTeamScope;
      if (sellerScoped && !sellerCounts.size) continue;
      const denominator = sellerScoped ? weightedSkus.length || 1 : 1;
      const includedCount = sellerScoped ? [...sellerCounts.values()].reduce((sum, row) => sum + row.count, 0) : 1;
      const orderShare = includedCount / denominator;
      if (order.orderStatus !== 'CANCELLED') {
        summary.orders += 1;
        summary.items += sellerScoped ? includedCount : items.reduce((sum, item) => sum + item.quantity, 0) || 1;
        add(summary, metrics, orderShare);
      }
      statusMap.set(order.orderStatus || 'NEW', (statusMap.get(order.orderStatus || 'NEW') || 0) + 1);
      const trend = trendMap.get(dayKey(order.dtLocal));
      if (trend && order.orderStatus !== 'CANCELLED') {
        trend.orders += 1; trend.items += sellerScoped ? includedCount : items.reduce((sum, item) => sum + item.quantity, 0) || 1;
        trend.net += metrics.etsyNet * orderShare; trend.profit += metrics.operationalProfit * orderShare;
      }

      const shop = (order.accountId ? shopById.get(order.accountId) : undefined)
        || (order.accountEmail ? shopByEmail.get(order.accountEmail.toLowerCase()) : undefined);
      const shopId = shop?.id || order.accountId || 'unknown';
      if (!shop) quality.missingShopOrders++;
      activeShopIds.add(shopId);
      const shopRow = shopMap.get(shopId) || { id: shopId, name: shop?.label || shop?.email || order.accountEmail || 'Shop chưa xác định', orders: 0, items: 0, net: 0, profit: 0, funds: 0, fundsVnd: 0 };
      if (order.orderStatus !== 'CANCELLED') {
        shopRow.orders += 1; shopRow.items += items.reduce((sum, item) => sum + item.quantity, 0) || 1;
        shopRow.net += metrics.etsyNet * orderShare; shopRow.profit += metrics.operationalProfit * orderShare;
      }
      shopMap.set(shopId, shopRow);

      for (const { user, count } of sellerCounts.values()) {
        const share = count / (weightedSkus.length || 1);
        activeSellerIds.add(user.id);
        const team = user.sellerTeamId ? teamById.get(user.sellerTeamId) : null;
        const seller = sellerMap.get(user.id) || { id: user.id, name: user.email.split('@')[0], email: user.email, teamId: user.sellerTeamId, teamName: team?.name || 'Chưa xếp team', orders: 0, items: 0, grossBookedValue: 0, net: 0, fulfillmentCost: 0, designCost: 0, refundAmount: 0, profit: 0 };
        seller.orders += 1; seller.items += count;
        add(seller, { grossBookedValue: gross, net: metrics.etsyNet, fulfillmentCost: ff, designCost: design, refundAmount: refund, profit: metrics.operationalProfit }, share);
        sellerMap.set(user.id, seller);
        const teamId = user.sellerTeamId || 'unassigned';
        const teamRow = teamMap.get(teamId) || { id: teamId, name: team?.name || 'Chưa xếp team', members: new Set<string>(), orderIds: new Set<string>(), items: 0, grossBookedValue: 0, net: 0, profit: 0 };
        teamRow.members.add(user.id); teamRow.orderIds.add(order.id); teamRow.items += count;
        add(teamRow, { grossBookedValue: gross, net: metrics.etsyNet, profit: metrics.operationalProfit }, share);
        teamMap.set(teamId, teamRow);
      }

      if (order.orderStatus !== 'CANCELLED') {
        const itemTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        for (const item of items) {
          const itemShare = itemTotal > 0 ? (item.price * item.quantity) / itemTotal : 1 / Math.max(items.length, 1);
          const key = `${shopId}:${item.name}`;
          const row = productMap.get(key) || { name: item.name, shopId, shopName: shop?.label || shop?.email || 'Shop chưa xác định', quantity: 0, grossBookedValue: 0, net: 0 };
          row.quantity += item.quantity; row.grossBookedValue += gross * itemShare * orderShare; row.net += metrics.etsyNet * itemShare * orderShare;
          productMap.set(key, row);
        }
      }
    }

    summary.manualCost = round(manualCosts.filter((row) => (row.currency || 'USD') === 'USD').reduce((sum, row) => sum + numberOf(row.cost), 0));
    summary.manualCostVnd = round(manualCosts.filter((row) => row.currency === 'VND').reduce((sum, row) => sum + numberOf(row.cost), 0));
    summary.operationalProfit -= summary.manualCost;
    summary.shops = activeShopIds.size;
    summary.activeSellers = activeSellerIds.size;
    for (const fund of funds) {
      const shop = (fund.accountId ? shopById.get(fund.accountId) : undefined)
        || (fund.accountEmail ? shopByEmail.get(fund.accountEmail.toLowerCase()) : undefined);
      const id = shop?.id || fund.accountId || 'unknown';
      const row = shopMap.get(id) || { id, name: shop?.label || shop?.email || fund.accountEmail || 'Shop chưa xác định', orders: 0, items: 0, net: 0, profit: 0, funds: 0, fundsVnd: 0 };
      if (fund.currency === 'VND') row.fundsVnd += numberOf(fund.amount);
      else row.funds += numberOf(fund.amount);
      shopMap.set(id, row);
    }
    for (const key of Object.keys(summary)) if (typeof summary[key] === 'number') summary[key] = round(summary[key]);
    quality.unattributedOrders = quality.noSkuOrders + quality.unknownSellerOrders;
    quality.attributionRate = quality.totalOrders ? round(((quality.totalOrders - quality.unattributedOrders) / quality.totalOrders) * 100) : 0;
    quality.unknownPrefixes = [...unknownPrefixes.entries()].map(([prefix, count]) => ({ prefix, orders: count })).sort((a, b) => b.orders - a.orders).slice(0, 20);

    const serialize = (row: JsonMap) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value instanceof Set ? value.size : typeof value === 'number' ? round(value) : value]));
    const response = {
      report: { startDate, endDate, timeZone: REPORT_TIME_ZONE, currency: 'USD', generatedAt: new Date().toISOString() },
      source: { dataUpdatedAt: latest._max.updatedAt?.toISOString() || null, shopSyncedAt: shops.reduce<Date | null>((max, shop) => !max || (shop.lastSyncedAt && shop.lastSyncedAt > max) ? shop.lastSyncedAt : max, null)?.toISOString() || null },
      filters: {
        sellerTeams: sellerTeams.map((team) => ({ id: team.id, name: team.name })),
        shops: shops.map((shop) => ({ id: shop.id, name: shop.label || shop.email })),
        sellers: users.map((user) => ({ id: user.id, name: user.email.split('@')[0], email: user.email, teamId: user.sellerTeamId })),
      },
      summary,
      statuses: [...statusMap.entries()].map(([status, orders]) => ({ status, orders })).sort((a, b) => b.orders - a.orders),
      trend: [...trendMap.values()].map(serialize),
      sellerTeams: [...teamMap.values()].map((row) => {
        const serialized = serialize(row);
        const { orderIds, ...rest } = serialized;
        return { ...rest, orders: orderIds };
      }).sort((a, b) => numberOf(b.profit) - numberOf(a.profit)),
      shops: [...shopMap.values()].map(serialize).sort((a, b) => numberOf(b.profit) - numberOf(a.profit)),
      sellers: [...sellerMap.values()].map(serialize).sort((a, b) => numberOf(b.profit) - numberOf(a.profit)),
      topProducts: [...productMap.values()].map(serialize).sort((a, b) => numberOf(b.net) - numberOf(a.net)).slice(0, 30),
      quality,
    };
    return res.status(200).json(response);
  } catch (error) {
    if (error instanceof Error && /must use YYYY|Date range/.test(error.message)) return res.status(400).json({ message: error.message });
    return serverError(res, error);
  }
}
