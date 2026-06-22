import { api } from './apiClient';

export interface Category {
  id: string;
  name: string;
  slug: string;
  productCount?: number;
  createdAt?: string;
}

export async function listCategories(): Promise<Category[]> {
  const { categories } = await api.get<{ categories: Category[] }>('/api/categories');
  return categories;
}

export async function createCategory(name: string): Promise<Category> {
  const { category } = await api.post<{ category: Category }>('/api/categories', { name });
  return category;
}

export async function renameCategory(id: string, name: string): Promise<Category> {
  const { category } = await api.patch<{ category: Category }>(`/api/categories/${id}`, { name });
  return category;
}

export async function deleteCategory(id: string): Promise<void> {
  await api.delete(`/api/categories/${id}`);
}
