import { api } from './apiClient';

export interface ProductImage {
  url: string;
  publicId: string;
  width?: number;
  height?: number;
  source?: string;
  name?: string;   // original filename (design files); absent on legacy uploads
  format?: string; // file extension as stored
  bytes?: number;
}

export type UploadItem = string | { data: string; name?: string };

/** Images render inline; anything else is a downloadable design file. */
export function isImageFile(im: { url?: string; format?: string; name?: string }): boolean {
  const ext = (im.format || /\.([a-z0-9]{1,8})(?:\?|$)/i.exec(im.name || im.url || '')?.[1] || '').toLowerCase();
  return ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'svg'].includes(ext);
}

export interface Product {
  id: string;
  categoryId: string | null;
  title: string | null;
  listingTitle: string | null;
  price: number | null;
  currency: string | null;
  description: string | null;
  images: ProductImage[];
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  source: string | null;
  createdAt: string;
  updatedAt: string;
  createdByEmail?: string | null;
}

export interface ProductPage {
  products: Product[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function listProducts(params?: {
  status?: string;
  q?: string;
  categoryId?: string;
  page?: number;
  pageSize?: number;
}): Promise<ProductPage> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.q) qs.set('q', params.q);
  if (params?.categoryId) qs.set('categoryId', params.categoryId);
  if (params?.page) qs.set('page', String(params.page));
  if (params?.pageSize) qs.set('pageSize', String(params.pageSize));
  const data = await api.get<{
    products: any[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }>(`/api/products?${qs.toString()}`);
  return {
    products: data.products.map(normalize),
    total: data.total,
    page: data.page,
    pageSize: data.pageSize,
    totalPages: data.totalPages,
  };
}

export async function createProduct(input: {
  title?: string;
  listingTitle?: string;
  price?: number | string;
  currency?: string;
  description?: string;
  images: ProductImage[];
  status?: string;
  source?: string;
  categoryId?: string | null;
}): Promise<Product> {
  const { product } = await api.post<{ product: any }>('/api/products', input);
  return normalize(product);
}

export async function getProduct(id: string): Promise<Product> {
  const { product } = await api.get<{ product: any }>(`/api/products/${id}`);
  return normalize(product);
}

export async function updateProduct(id: string, input: Partial<Product>): Promise<Product> {
  const { product } = await api.patch<{ product: any }>(`/api/products/${id}`, input);
  return normalize(product);
}

export async function deleteProduct(id: string): Promise<void> {
  await api.delete(`/api/products/${id}`);
}

/** Upload base64 data URIs (or remote URLs) to Cloudinary via the backend. */
export async function uploadImages(sources: UploadItem[], categorySlug?: string): Promise<ProductImage[]> {
  const { images } = await api.post<{ images: ProductImage[] }>('/api/upload', {
    files: sources,
    categorySlug,
  });
  return images;
}

function normalize(p: any): Product {
  return {
    id: p.id,
    categoryId: p.categoryId ?? null,
    title: p.title ?? null,
    listingTitle: p.listingTitle ?? null,
    price: p.price != null ? Number(p.price) : null,
    currency: p.currency ?? null,
    description: p.description ?? null,
    images: Array.isArray(p.images) ? p.images : [],
    status: p.status ?? 'DRAFT',
    source: p.source ?? null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    createdByEmail: p.createdByEmail ?? null,
  };
}

/** Read a File (from <input type=file>) into a base64 data URI. */
/** Every product in the team, newest first (the picker/search work on the full set). */
export async function fetchAllProducts(max = 500): Promise<Product[]> {
  const out: Product[] = [];
  for (let page = 1; out.length < max; page++) {
    const res = await listProducts({ page, pageSize: 100 });
    out.push(...res.products);
    if (page >= res.totalPages || res.products.length === 0) break;
  }
  return out;
}

const normalizeText = (s?: string | null) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const tokenize = (s: string) => normalizeText(s).split(' ').filter((t) => t.length > 2);

/**
 * 0..1 relevance of a product for a query. Staff paste whole Etsy titles
 * ("Personalized Giraffe Baby Blanket, Custom Name…") while folder names are
 * short codes, so scoring is bidirectional: query words found in the product,
 * or product words found in the query — whichever matches better.
 */
export function scoreProduct(query: string, p: Product): number {
  const q = normalizeText(query);
  if (!q) return 0;
  const hay = normalizeText([p.title, p.listingTitle, p.description].filter(Boolean).join(' '));
  if (!hay) return 0;
  if (hay.includes(q) || q.includes(hay)) return 1;

  const qt = tokenize(query);
  const ht = tokenize(hay);
  if (qt.length === 0 || ht.length === 0) return 0;
  const hSet = new Set(ht);
  const qSet = new Set(qt);
  const forward = qt.filter((t) => hSet.has(t)).length / qt.length;
  const backward = ht.filter((t) => qSet.has(t)).length / ht.length;
  return Math.max(forward, backward);
}

/** Ranked matches for a free-text query (paste an order's product name here). */
export function searchProducts(query: string, products: Product[], limit = 20): Product[] {
  return products
    .map((p) => ({ p, s: scoreProduct(query, p) }))
    .filter((r) => r.s >= 0.34)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((r) => r.p);
}

/** Read a File into the {data, name} shape the upload endpoint expects. */
export async function fileToUpload(file: File): Promise<{ data: string; name: string }> {
  return { data: await fileToDataUri(file), name: file.name };
}

export function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
