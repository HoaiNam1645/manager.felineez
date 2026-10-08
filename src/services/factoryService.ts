// Client for the factory proxy (api/factory/*): MangoTee, Vinaway,
// MonkeyKing, Dreamship.
import { api } from './apiClient';

export type FactoryProvider = 'mango' | 'vinaway' | 'monkeyking' | 'dreamship' | 'hongphat' | 'hogoto';

export interface FactorySettingsInfo {
  provider: FactoryProvider;
  configured: boolean;
  email?: string;
  hasApiKey?: boolean;
  testOk?: boolean;
  testMessage?: string;
}

export const getFactorySettings = (provider: FactoryProvider) =>
  api.get<FactorySettingsInfo>(`/api/factory/settings?provider=${provider}`);

export const saveFactorySettings = (provider: FactoryProvider, body: { apiKey?: string; email?: string; password?: string; username?: string; tenant?: string }) =>
  api.post<FactorySettingsInfo>('/api/factory/settings', { provider, ...body });

const catalog = (provider: FactoryProvider, what: string, params: { [k: string]: string | number | undefined } = {}) => {
  const qs = new URLSearchParams({ provider, what });
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  });
  return api.get<any>(`/api/factory/catalog?${qs.toString()}`);
};

// ---------- MangoTee ----------

export interface MangoProductionLine { id: number | string; name: string; [k: string]: any }
export interface MangoProduct { id: number | string; name: string; [k: string]: any }
export interface MangoVariation { id?: number | string; sku?: string; color?: string; size?: string; [k: string]: any }

const listFrom = (resp: any): any[] =>
  Array.isArray(resp) ? resp
    : Array.isArray(resp?.data) ? resp.data
    : Array.isArray(resp?.data?.items) ? resp.data.items
    : Array.isArray(resp?.data?.data) ? resp.data.data
    : Array.isArray(resp?.results) ? resp.results
    : Array.isArray(resp?.result) ? resp.result
    : Array.isArray(resp?.items) ? resp.items
    : [];

// Session-scoped promise cache: catalogs are static and Mango's /products
// takes ~6s, so re-opening forms must not refetch. Failed calls are evicted
// so a retry actually retries.
const catalogMemo = new Map<string, Promise<any>>();
const memoized = <T,>(key: string, fn: () => Promise<T>): Promise<T> => {
  if (!catalogMemo.has(key)) {
    const p = fn().catch((e) => { catalogMemo.delete(key); throw e; });
    catalogMemo.set(key, p);
  }
  return catalogMemo.get(key) as Promise<T>;
};

export const getMangoProductionLines = (): Promise<MangoProductionLine[]> =>
  memoized('mango:lines', async () => listFrom(await catalog('mango', 'production-lines', { limit: 100 })));

export const getMangoProducts = (search?: string): Promise<MangoProduct[]> =>
  memoized(`mango:products:${search || ''}`, async () =>
    listFrom(await catalog('mango', 'products', { limit: 100, search })));

// Mango caps `limit` at 1000 and big products exceed that (Gildan 5000 = 1457
// variations) — merge up to 5 pages so the color/size lists are complete.
export const getMangoVariations = (
  productId: string | number,
  filters: { color?: string; size?: string; production_line_id?: string | number } = {}
): Promise<MangoVariation[]> =>
  memoized(`mango:vars:${productId}:${JSON.stringify(filters)}`, async () => {
    const first = await catalog('mango', 'variations', { product_id: productId, limit: 1000, page: 1, ...filters });
    let items = listFrom(first);
    const pages = Number(first?.data?.pagination?.pages || 1);
    for (let p = 2; p <= Math.min(pages, 5); p++) {
      const next = await catalog('mango', 'variations', { product_id: productId, limit: 1000, page: p, ...filters });
      items = items.concat(listFrom(next));
    }
    return items;
  });

// ---------- Vinaway ----------

export interface VinawayProductionLine { id: number; name: string; description?: string; added_price?: number }
export interface VinawayProduct { id: number; name: string; sku?: string }
// Live /product-skus shape (differs from their docs): name already contains
// "product att1/att2", product_id is included directly, price is numeric.
export interface VinawaySku {
  id: number;
  product_sku_id?: number;
  product_id?: number;
  name?: string;
  att1_value?: string;
  att2_value?: string;
  price?: number;
  product?: { id: number; name?: string };
  [k: string]: any;
}

export const getVinawayProductionLines = (): Promise<VinawayProductionLine[]> =>
  memoized('vinaway:lines', async () => listFrom(await catalog('vinaway', 'production-lines')));

export const getVinawayProducts = (): Promise<VinawayProduct[]> =>
  memoized('vinaway:products', async () => listFrom(await catalog('vinaway', 'products', { limit: 200 })));

// 1700+ SKUs on the live account — paginate (500/page, up to 5 pages).
export const getVinawaySkus = (): Promise<VinawaySku[]> =>
  memoized('vinaway:skus', async () => {
    const first = await catalog('vinaway', 'skus', { limit: 500, page: 1 });
    let items = listFrom(first);
    const total = Number(first?.total || 0);
    for (let p = 2; p <= 5 && items.length < total; p++) {
      const chunk = listFrom(await catalog('vinaway', 'skus', { limit: 500, page: p }));
      if (chunk.length === 0) break;
      items = items.concat(chunk);
    }
    return items;
  });

// ---------- MonkeyKing (Magento) ----------
// GET /rest/V1/configurable-product — live shape (undocumented):
// [{ sku, name, status, varriants: [{color,size}] }] — note their "varriants"
// typo. create-order product_id = the `sku` field (their docs example
// "Classic T-Shirt" matches sku exactly).
export interface MonkeyKingProduct {
  name?: string;
  sku?: string;
  status?: string;
  varriants?: { color?: string; size?: string }[];
  [k: string]: any;
}

export const getMonkeyKingProducts = (): Promise<MonkeyKingProduct[]> =>
  memoized('monkeyking:products', async () => listFrom(await catalog('monkeyking', 'products')));

// ---------- Dreamship ----------

export interface DreamshipItemSummary { id: number; name: string; [k: string]: any }
export interface DreamshipVariant {
  id: number;
  name?: string;
  color?: any;
  basic_cost?: string | number;
  availability?: any;
  [k: string]: any;
}
export interface DreamshipItemDetail {
  id: number;
  name: string;
  colors?: any[];
  sizes?: any[];
  item_variants?: DreamshipVariant[];
  print_areas?: { key?: string; id?: number; required?: boolean; [k: string]: any }[];
  [k: string]: any;
}

export const getDreamshipItems = (): Promise<DreamshipItemSummary[]> =>
  memoized('dreamship:items', async () => {
    // List responses are { paging: {count,next,previous}, data: [...] }
    const first = await catalog('dreamship', 'items', { limit: 100, page: 1 });
    let items = listFrom(first);
    const total = Number(first?.paging?.count || 0);
    for (let p = 2; p <= 5; p++) {
      if (total ? items.length >= total : items.length < (p - 1) * 100) break;
      const next = await catalog('dreamship', 'items', { limit: 100, page: p });
      const chunk = listFrom(next);
      if (chunk.length === 0) break;
      items = items.concat(chunk);
    }
    return items;
  });

export const getDreamshipItem = (id: number | string): Promise<DreamshipItemDetail> =>
  memoized(`dreamship:item:${id}`, async () => (await catalog('dreamship', 'item', { product_id: id })) as DreamshipItemDetail);

// ---------- Hong Phat Embroidery ----------
// Docs don't document the catalog response shapes — keep them loose; forms
// fall back to text inputs when fields are missing.
export interface HongPhatProduct {
  id?: number | string;
  product_code?: string;
  code?: string;
  name?: string;
  colors?: any[];
  sizes?: any[];
  [k: string]: any;
}
export interface HongPhatPosition { id?: number | string; name?: string; position?: string; [k: string]: any }

export const getHongPhatProducts = (): Promise<HongPhatProduct[]> =>
  memoized('hongphat:products', async () => listFrom(await catalog('hongphat', 'products', { limit: 200 })));

export const getHongPhatPositions = (): Promise<HongPhatPosition[]> =>
  memoized('hongphat:positions', async () => listFrom(await catalog('hongphat', 'positions', { limit: 200 })));

// ---------- Hogoto POD ----------
// GET /v1/product returns a bare array of ProductViewDto:
// {code, name, colors:[{code,name}], positions:[{code,name}],
//  sizeCosts:[{size?,cost?…}], embroideryThread, is3dProduct, mockupImage}
export interface HogotoProduct {
  id?: string;
  code?: string;
  name?: string;
  colors?: any[];
  positions?: any[];
  sizeCosts?: any[];
  is3dProduct?: boolean;
  [k: string]: any;
}

export const getHogotoProducts = (): Promise<HogotoProduct[]> =>
  memoized('hogoto:products', async () => listFrom(await catalog('hogoto', 'products')));

// Warm the slow catalogs in the background (called when the Factory screen
// opens, so the lists are ready by the time a form is opened).
export const prefetchFactoryCatalogs = () => {
  getMangoProducts().catch(() => {});
  getVinawaySkus().catch(() => {});
  getVinawayProducts().catch(() => {});
  getMonkeyKingProducts().catch(() => {});
  getDreamshipItems().catch(() => {});
  getHongPhatProducts().catch(() => {});
  getHongPhatPositions().catch(() => {});
  getHogotoProducts().catch(() => {});
};

// ---------- Orders ----------

export const createFactoryOrder = (provider: FactoryProvider, recordId: string, payload: any) =>
  api.post<{ order_id: string; ff_code: string; order_status: string }>(
    '/api/factory/orders',
    { provider, recordId, payload }
  );

export const getFactoryOrder = (provider: FactoryProvider, id: string) =>
  api.get<any>(`/api/factory/orders?provider=${provider}&id=${encodeURIComponent(id)}`);

// ---------- Order Subs (per-factory sent-order screens) ----------
// 'lemiex' is included here: its list comes from our linked records (their
// seller API has no list endpoint); details are fetched live from the factory.
export type SubProvider = FactoryProvider | 'lemiex';

export const listFactoryOrders = (provider: SubProvider, page = 1, limit = 20) =>
  api.get<any>(`/api/factory/orders?provider=${provider}&list=1&page=${page}&limit=${limit}`);

export const getFactoryOrderDetail = (provider: SubProvider, id: string) =>
  api.get<any>(`/api/factory/orders?provider=${provider}&id=${encodeURIComponent(id)}`);

export const extractFactoryList = listFrom;
