// Client for our server-side Lemiex proxy (api/lemiex/*).
import { api } from './apiClient';

export type LemiexLine = 'embroidery' | 'print';

export interface LemiexVariant {
  id: number;
  name: string;
  variant_id: string;
  style: string;
  color: string;
  size: string;
}

export interface LemiexPagination {
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
}

export interface LemiexSettingsInfo {
  configured: boolean;
  email: string;
  hasApiKey: boolean;
  loginOk?: boolean;
  loginMessage?: string;
}

export const getLemiexSettings = () => api.get<LemiexSettingsInfo>('/api/lemiex/settings');

export const saveLemiexSettings = (body: { email?: string; password?: string; apiKey?: string }) =>
  api.post<LemiexSettingsInfo>('/api/lemiex/settings', body);

const catalog = (what: string, params: { [k: string]: string | number | undefined }) => {
  const qs = new URLSearchParams({ what });
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  });
  return api.get<any>(`/api/lemiex/catalog?${qs.toString()}`);
};

export const getLemiexStyles = async (line: LemiexLine): Promise<string[]> =>
  (await catalog('styles', { line })).data || [];

export const getLemiexColors = async (line: LemiexLine, style?: string): Promise<string[]> =>
  (await catalog('colors', { line, style })).data || [];

export const getLemiexSizes = async (line: LemiexLine, style?: string, color?: string): Promise<string[]> =>
  (await catalog('sizes', { line, style, color })).data || [];

export const getLemiexVariants = async (
  line: LemiexLine,
  filters: { style?: string; color?: string; size?: string; search?: string; page?: number; per_page?: number }
): Promise<{ variants: LemiexVariant[]; pagination: LemiexPagination | null }> => {
  const resp = await catalog('variants', { line, ...filters });
  return { variants: resp.data || [], pagination: resp.pagination || null };
};

// Metadata lists come back as strings or objects — normalize to strings.
const toNames = (list: any[]): string[] =>
  (list || []).map((x: any) => (typeof x === 'string' ? x : x?.name ?? x?.value ?? x?.key ?? String(x))).filter(Boolean);

export const getLemiexEmbroideryTypes = async (): Promise<string[]> =>
  toNames((await catalog('embroidery-types', {})).data);

export const getLemiexPriorities = async (): Promise<string[]> =>
  toNames((await catalog('priorities', {})).data);

// ---------- Orders ----------

export interface LemiexPrintFile {
  key: string;             // front | back | sleeve_left | sleeve_right | neck | special_design
  url: string | null;      // .dst
  url_emb: string | null;
  url_pes: string | null;
  embroidery_type: string | null;
  is_no_design: boolean;
  size?: string;
}

export interface LemiexLineItem {
  variant_id: string;
  external_item_id: string;
  note?: string;
  product_name: string;
  quantity: number;
  mockup: string | null;
  mockup_back: string | null;
  print_files: LemiexPrintFile[];
}

export interface LemiexOrderPayload {
  order_type: 'seller_ship' | 'label_ship';
  ref_id: string;
  seller_ref?: string;
  order_status: string;
  shipping_method: string;
  shipping_service: string;
  shipping_label: string | null;
  fulfillment_priority: string;
  note?: string;
  product_type: string;
  address: {
    name: string; phone: string; street1: string; street2: string;
    city: string; state: string; zip: string; country: string;
  } | null;
  line_items: LemiexLineItem[];
}

export const createLemiexOrder = (recordId: string, payload: LemiexOrderPayload) =>
  api.post<{ order_id: number; existed: boolean; ff_code: string; order_status: string }>(
    '/api/lemiex/orders',
    { recordId, payload }
  );

export const getLemiexOrder = (lemiexOrderId: string) =>
  api.get<any>(`/api/lemiex/orders?id=${encodeURIComponent(lemiexOrderId)}`);
