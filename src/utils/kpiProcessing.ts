// KPI attribution engine.
//
// An Etsy order's SKUs (from the imported Sold Orders CSV, stored in
// record.etsy_fees.sku) are attributed to sellers by the agreed rule:
//   seller code = first 2 characters of the SKU, uppercased
//   ("NA09090" / "Na-0099" → "NA").
// Orders whose SKUs span multiple sellers are split proportionally by SKU count.
// Net = estActualNet (≈ Etsy "You earned": all fees incl. transaction/VAT),
// falling back to the CSV orderNet when absent. If no CSV/enriched fees exist yet,
// Etsy orders use a temporary 14.5% fee estimate from the buyer-paid order total.

import { Record as AppRecord } from '../types';

export interface KpiUser {
  id: string;
  email: string;
  role: string; // 'OWNER' | 'LEADER' | 'USER'
  sellerCodes: string[];
  sellerTeamId: string | null;
}

export interface KpiTeam {
  id: string;
  name: string;
}

export interface SellerKpiRow {
  userId: string;
  email: string;
  role: string;
  codes: string[];
  teamId: string | null;
  teamName: string;
  orders: number; // orders the seller participated in
  items: number;  // number of their SKUs across orders
  revenue: number;
  net: number;
  ffCost: number;
  designCost: number;
  profit: number;
}

export interface TeamKpiRow {
  teamId: string | null; // null = "No team"
  teamName: string;
  members: number; // members with any attribution in range
  orders: number;  // distinct orders the team participated in
  items: number;
  revenue: number;
  net: number;
  ffCost: number;
  designCost: number;
  profit: number;
}

export interface KpiTotals {
  attributedOrders: number;
  attributedItems: number;
  revenue: number;
  net: number;
  ffCost: number;
  designCost: number;
  profit: number;
  unattributedOrders: number; // noSku + fully-unknown
  totalOrders: number;        // all Etsy orders in range
  attributionRate: number;    // % of orders with at least one attributed SKU
}

export interface KpiDailyPoint {
  date: string; // YYYY-MM-DD in the viewer's timezone
  [stackKey: string]: number | string;
}

export type KpiGranularity = 'day' | 'week' | 'month';

export interface KpiResult {
  totals: KpiTotals;
  sellers: SellerKpiRow[]; // sorted by net desc
  teams: TeamKpiRow[];     // sorted by net desc
  daily: KpiDailyPoint[];  // ascending by bucket (day/week/month per `granularity`)
  dailyKeys: string[];     // stack keys present in `daily`
  granularity: KpiGranularity;
  unattributed: {
    noSku: number;                      // Etsy orders without imported SKU (CSV not imported)
    unknownOnly: number;                // orders whose SKUs matched NO seller at all
    unknownPrefixes: { prefix: string; orders: number }[]; // prefixes with no owner
  };
  currency: string;
}

export interface ComputeKpiOptions {
  records: AppRecord[];
  users: KpiUser[];
  teams: KpiTeam[];
  timeZone: string;
  /** 'all' or a SellerTeam id — limits sellers/teams/daily/totals to that team. */
  teamFilter: string;
  /** The active filter range — drives the chart bucket size (day/week/month). */
  range?: { from: string; to: string };
}

// ---- time bucketing (adapts to the filtered range) --------------------------

const pickGranularity = (from: string, to: string): KpiGranularity => {
  const days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  if (!isFinite(days) || days <= 31) return 'day';
  if (days <= 130) return 'week';
  return 'month';
};

/** Monday of the week containing dayStr (YYYY-MM-DD). */
const mondayOf = (dayStr: string): string => {
  const d = new Date(dayStr + 'T00:00:00Z');
  if (isNaN(d.getTime())) return dayStr;
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

const bucketOf = (dayStr: string, g: KpiGranularity): string =>
  g === 'day' ? dayStr : g === 'week' ? mondayOf(dayStr) : dayStr.slice(0, 7);

/** All bucket keys between from..to inclusive, so the axis has no gaps. */
const enumerateBuckets = (from: string, to: string, g: KpiGranularity): string[] => {
  const out: string[] = [];
  if (g === 'month') {
    let y = Number(from.slice(0, 4));
    let m = Number(from.slice(5, 7));
    const end = to.slice(0, 7);
    for (let i = 0; i < 400; i++) {
      const key = `${y}-${String(m).padStart(2, '0')}`;
      if (key > end) break;
      out.push(key);
      m++; if (m > 12) { m = 1; y++; }
    }
  } else {
    const step = g === 'week' ? 7 : 1;
    const d = new Date((g === 'week' ? mondayOf(from) : from) + 'T00:00:00Z');
    const end = new Date(to + 'T00:00:00Z');
    for (let i = 0; i < 400 && !isNaN(d.getTime()) && d <= end; i++) {
      out.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + step);
    }
  }
  return out;
};

const dayFormatterCache = new Map<string, Intl.DateTimeFormat>();
const dayOf = (iso: string, timeZone: string): string => {
  let fmt = dayFormatterCache.get(timeZone);
  if (!fmt) {
    try {
      fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch {
      fmt = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
    }
    dayFormatterCache.set(timeZone, fmt);
  }
  try {
    return fmt.format(new Date(iso));
  } catch {
    return String(iso).slice(0, 10);
  }
};

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return isNaN(n) ? 0 : n;
};

const ETSY_FALLBACK_FEE_RATE = 0.145;
const roundMoney = (v: number): number => Math.round(v * 100) / 100;
const hasNumber = (v: unknown): boolean => v !== null && v !== undefined && Number.isFinite(Number(v));
const isRefundedOrder = (record: AppRecord): boolean => (record as any).order_status === 'REFUND';

const orderTotalForFeeEstimate = (record: AppRecord, fees: any): number => {
  if (isRefundedOrder(record)) return 0;
  return num(fees?.orderTotal) || num((record as any).details?.financials?.orderTotal) || num((record as any).amount);
};

const orderNetForKpi = (record: AppRecord, fees: any): number => {
  if (isRefundedOrder(record)) return 0;
  if (hasNumber(fees?.estActualNet)) return roundMoney(num(fees.estActualNet));

  const orderTotal = orderTotalForFeeEstimate(record, fees);
  const rawNet = num(fees?.orderNet);
  if (rawNet > 0) {
    const rawFees = num(fees?.cardFees);
    return rawNet > orderTotal && rawNet + rawFees > 0
      ? roundMoney((orderTotal * rawNet) / (rawNet + rawFees))
      : roundMoney(rawNet);
  }

  return roundMoney(orderTotal * (1 - ETSY_FALLBACK_FEE_RATE));
};

export function computeKpi({ records, users, teams, timeZone, teamFilter, range }: ComputeKpiOptions): KpiResult {
  const granularity: KpiGranularity = range ? pickGranularity(range.from, range.to) : 'day';
  const teamName = (id: string | null) =>
    id ? (teams.find(t => t.id === id)?.name ?? 'Unknown team') : 'No team';

  // code (2-char, uppercase) → user
  const codeMap = new Map<string, KpiUser>();
  users.forEach(u => (u.sellerCodes || []).forEach(c => codeMap.set(String(c).toUpperCase(), u)));

  const inScope = (u: KpiUser) => teamFilter === 'all' || u.sellerTeamId === teamFilter;

  const sellerAgg = new Map<string, SellerKpiRow & { orderIds: Set<string> }>();
  const ensureSeller = (u: KpiUser) => {
    let row = sellerAgg.get(u.id);
    if (!row) {
      row = {
        userId: u.id, email: u.email, role: u.role, codes: u.sellerCodes || [],
        teamId: u.sellerTeamId, teamName: teamName(u.sellerTeamId),
        orders: 0, items: 0, revenue: 0, net: 0, ffCost: 0, designCost: 0, profit: 0, orderIds: new Set(),
      };
      sellerAgg.set(u.id, row);
    }
    return row;
  };

  const dailyMap = new Map<string, { [key: string]: number }>();
  const unknownPrefixCounts = new Map<string, number>();

  let totalOrders = 0;
  let noSku = 0;
  let unknownOnly = 0;
  let attributedOrders = 0;
  let attributedItems = 0;
  let revenueSum = 0;
  let netSum = 0;
  let ffCostSum = 0;
  let designCostSum = 0;
  let profitSum = 0;
  let currency = 'USD';

  for (const r of records) {
    if (r.kind !== 'order' || r.source !== 'Etsy_Sales') continue;
    totalOrders++;

    const fees: any = (r as any).etsy_fees;
    const itemSkus = Array.isArray((r as any).details?.items)
      ? (r as any).details.items
        .map((item: any) => item?.sku ? String(item.sku) : '')
        .flatMap((sku: string) => sku.split(',').map(s => s.trim()).filter(Boolean))
      : [];
    const fallbackSkus = fees?.sku
      ? String(fees.sku).split(',').map(s => s.trim()).filter(Boolean)
      : [];
    const skus = itemSkus.length > 0 ? itemSkus : fallbackSkus;
    if (skus.length === 0) {
      noSku++;
      continue;
    }
    if (fees?.currency) currency = fees.currency;

    // Resolve each SKU → seller (or unknown prefix)
    const shares = new Map<string, { user: KpiUser; count: number }>(); // userId → sku count
    let unknownCount = 0;
    const seenUnknown = new Set<string>();
    for (const sku of skus) {
      const prefix = sku.slice(0, 2).toUpperCase();
      const owner = codeMap.get(prefix);
      if (owner) {
        const cur = shares.get(owner.id);
        if (cur) cur.count += 1;
        else shares.set(owner.id, { user: owner, count: 1 });
      } else {
        unknownCount++;
        if (!seenUnknown.has(prefix)) {
          seenUnknown.add(prefix);
          unknownPrefixCounts.set(prefix, (unknownPrefixCounts.get(prefix) || 0) + 1);
        }
      }
    }

    if (shares.size === 0) {
      unknownOnly++;
      continue;
    }

    const orderTotal = orderTotalForFeeEstimate(r, fees);
    const orderFfCost = r.cost_total != null ? num(r.cost_total) : 0;
    const orderDesignCost = r.design_cost != null ? num(r.design_cost) : 0;
    const orderNet = orderNetForKpi(r, fees);
    const orderProfit = orderNet - orderFfCost - orderDesignCost;
    const totalSkus = skus.length;
    const day = bucketOf(dayOf(r.dt_local, timeZone), granularity);

    // Order counts toward totals if ANY in-scope seller participated.
    let orderInScope = false;

    shares.forEach(({ user, count }) => {
      if (!inScope(user)) return;
      orderInScope = true;
      const row = ensureSeller(user);
      const share = count / totalSkus;
      row.orderIds.add(r.id || r.order_id || String(Math.random()));
      row.items += count;
      row.revenue += orderTotal * share;
      row.net += orderNet * share;
      row.ffCost += orderFfCost * share;
      row.designCost += orderDesignCost * share;
      row.profit += orderProfit * share;

      // Daily stacking key: team when viewing All, seller email otherwise.
      const key = teamFilter === 'all' ? row.teamName : row.email;
      let bucket = dailyMap.get(day);
      if (!bucket) { bucket = {}; dailyMap.set(day, bucket); }
      bucket[key] = (bucket[key] || 0) + orderNet * share;
    });

    if (orderInScope) {
      attributedOrders++;
      shares.forEach(({ user, count }) => {
        if (!inScope(user)) return;
        attributedItems += count;
        const share = count / totalSkus;
        revenueSum += orderTotal * share;
        netSum += orderNet * share;
        ffCostSum += orderFfCost * share;
        designCostSum += orderDesignCost * share;
        profitSum += orderProfit * share;
      });
    }
  }

  const sellers: SellerKpiRow[] = Array.from(sellerAgg.values())
    .map(({ orderIds, ...row }) => ({ ...row, orders: orderIds.size }))
    .sort((a, b) => b.net - a.net);

  // Teams aggregate (from seller rows)
  const teamAgg = new Map<string, TeamKpiRow>();
  sellers.forEach(s => {
    const key = s.teamId ?? '__none__';
    let t = teamAgg.get(key);
    if (!t) {
      t = { teamId: s.teamId, teamName: s.teamName, members: 0, orders: 0, items: 0, revenue: 0, net: 0, ffCost: 0, designCost: 0, profit: 0 };
      teamAgg.set(key, t);
    }
    t.members += 1;
    t.orders += s.orders; // approximation: shared orders counted per member's participation
    t.items += s.items;
    t.revenue += s.revenue;
    t.net += s.net;
    t.ffCost += s.ffCost;
    t.designCost += s.designCost;
    t.profit += s.profit;
  });
  const teamRows = Array.from(teamAgg.values()).sort((a, b) => b.net - a.net);

  // Time series → stable keys; fill every bucket in the range so the axis
  // is continuous (no gaps on sparse data).
  const dailyKeysSet = new Set<string>();
  dailyMap.forEach(bucket => Object.keys(bucket).forEach(k => dailyKeysSet.add(k)));
  const dailyKeys = Array.from(dailyKeysSet).sort();
  const bucketDates = range && dailyKeys.length > 0
    ? enumerateBuckets(range.from, range.to, granularity)
    : Array.from(dailyMap.keys()).sort();
  const daily: KpiDailyPoint[] = bucketDates.map((date) => {
    const bucket = dailyMap.get(date) || {};
    const point: KpiDailyPoint = { date };
    dailyKeys.forEach(k => { point[k] = Math.round((bucket[k] || 0) * 100) / 100; });
    return point;
  });

  const unknownPrefixes = Array.from(unknownPrefixCounts.entries())
    .map(([prefix, orders]) => ({ prefix, orders }))
    .sort((a, b) => b.orders - a.orders);

  return {
    totals: {
      attributedOrders,
      attributedItems,
      revenue: Math.round(revenueSum * 100) / 100,
      net: Math.round(netSum * 100) / 100,
      ffCost: Math.round(ffCostSum * 100) / 100,
      designCost: Math.round(designCostSum * 100) / 100,
      profit: Math.round(profitSum * 100) / 100,
      unattributedOrders: noSku + unknownOnly,
      totalOrders,
      attributionRate: totalOrders > 0 ? Math.round((attributedOrders / totalOrders) * 100) : 0,
    },
    sellers,
    teams: teamRows,
    daily,
    dailyKeys,
    granularity,
    unattributed: { noSku, unknownOnly, unknownPrefixes },
    currency,
  };
}
