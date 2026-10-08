export const DESIGN_SOURCE_PREFIX = 'design-item:';

export const makeDesignItemKey = (recordId?: string | null, itemIndex?: number | string | null) => {
  if (!recordId) return '';
  const index = Math.max(0, Number(itemIndex) || 0);
  return `${DESIGN_SOURCE_PREFIX}${recordId}:${index}`;
};

export const productMatchesDesignItem = (product: { source?: string | null }, designItemKey?: string | null) => {
  return !!designItemKey && product.source === designItemKey;
};

export const designRequestsOf = (details?: any): Record<string, string> => {
  const requests = details?.designRequests;
  return requests && typeof requests === 'object' && !Array.isArray(requests) ? requests : {};
};

export const hasDesignRequestForItem = (details: any, designItemKey: string) => {
  const requests = designRequestsOf(details);
  if (Object.keys(requests).length > 0) return !!requests[designItemKey];
  return !!details?.designRequestedAt;
};
