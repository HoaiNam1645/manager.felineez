export const DESIGN_SOURCE_PREFIX = 'design-item:';

export type DesignType = 'TEAM' | 'OUTSOURCE';

export const DESIGN_TYPE_LABELS: Record<DesignType, string> = {
  TEAM: 'Team làm',
  OUTSOURCE: 'Làm ngoài',
};

export const makeDesignItemKey = (recordId?: string | null, itemIndex?: number | string | null) => {
  if (!recordId) return '';
  const index = Math.max(0, Number(itemIndex) || 0);
  return `${DESIGN_SOURCE_PREFIX}${recordId}:${index}`;
};

export const productMatchesDesignItem = (product: { source?: string | null; designLinks?: Array<{ designItemKey?: string | null }> | null }, designItemKey?: string | null) => {
  return !!designItemKey && (product.source === designItemKey || product.designLinks?.some((link) => link.designItemKey === designItemKey) === true);
};

export const preferredDesignProduct = <T extends { source?: string | null; designLinks?: Array<{ designItemKey?: string | null }> | null; images?: unknown[] | null; updatedAt?: string; createdAt?: string }>(products: T[], designItemKey?: string | null): T | undefined => {
  return products
    .filter((product) => productMatchesDesignItem(product, designItemKey))
    .sort((a, b) => {
      const fileDifference = (b.images?.length || 0) - (a.images?.length || 0);
      if (fileDifference !== 0) return fileDifference;
      const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
      const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
      return bTime - aTime;
    })[0];
};

export const designRequestsOf = (details?: any): Record<string, string> => {
  const requests = details?.designRequests;
  return requests && typeof requests === 'object' && !Array.isArray(requests) ? requests : {};
};

export const designTypesOf = (details?: any): Record<string, DesignType> => {
  const types = details?.designTypes;
  if (!types || typeof types !== 'object' || Array.isArray(types)) return {};
  return Object.fromEntries(
    Object.entries(types).filter((entry): entry is [string, DesignType] => entry[1] === 'TEAM' || entry[1] === 'OUTSOURCE'),
  );
};

export const designTypeForItem = (details: any, designItemKey: string): DesignType | null => {
  const value = designTypesOf(details)[designItemKey];
  return value || null;
};

export const hasDesignRequestForItem = (details: any, designItemKey: string) => {
  const requests = designRequestsOf(details);
  if (Object.keys(requests).length > 0) return !!requests[designItemKey];
  return !!details?.designRequestedAt;
};
