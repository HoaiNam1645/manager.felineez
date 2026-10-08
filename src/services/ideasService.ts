import { api } from './apiClient';

export interface ListedIdea {
  productName: string;
  sku: string;
}

export async function fetchListedIdeas(): Promise<ListedIdea[]> {
  const { ideas } = await api.get<{ ideas: ListedIdea[] }>('/api/ideas/listed');
  return Array.isArray(ideas) ? ideas : [];
}
