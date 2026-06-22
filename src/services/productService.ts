import { api } from './apiClient';

export interface ProductImage {
  url: string;
  publicId: string;
  width?: number;
  height?: number;
  source?: string;
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
export async function uploadImages(sources: string[], categorySlug?: string): Promise<ProductImage[]> {
  const { images } = await api.post<{ images: ProductImage[] }>('/api/upload', {
    images: sources,
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
  };
}

/** Read a File (from <input type=file>) into a base64 data URI. */
export function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
