const RETURN_PATH_KEY = 'productsUploadReturnTo';
const RETURN_SCROLL_KEY = 'productsUploadReturnScroll';
const MAIN_SCROLL_ID = 'active-tab-container';
const ORDER_LIST_SCROLL_SELECTOR = '[data-products-return-scroll="orders-list"]';

type ReturnScrollState = {
  path: string;
  scrollTop: number;
  windowY: number;
  orderListScrollTop?: number;
  orderListScrollLeft?: number;
  scrollables: {
    index: number;
    id: string;
    className: string;
    scrollTop: number;
    scrollLeft: number;
  }[];
  savedAt: number;
};

const scrollableElements = () => {
  if (typeof window === 'undefined') return [];
  return Array.from(document.querySelectorAll<HTMLElement>('body *'))
    .filter((el) => {
      const style = window.getComputedStyle(el);
      const overflowY = style.overflowY;
      const canScroll = /(auto|scroll|overlay)/.test(overflowY);
      return canScroll && el.scrollHeight > el.clientHeight + 8;
    });
};

const classKey = (el: HTMLElement) => String(el.className || '').split(/\s+/).filter(Boolean).slice(0, 4).join(' ');

export const captureProductsReturnState = (path: string) => {
  if (typeof window === 'undefined') return;
  const scrollEl = document.getElementById(MAIN_SCROLL_ID);
  const orderListEl = document.querySelector<HTMLElement>(ORDER_LIST_SCROLL_SELECTOR);
  const scrollables = scrollableElements()
    .map((el, index) => ({
      index,
      id: el.id || '',
      className: classKey(el),
      scrollTop: el.scrollTop,
      scrollLeft: el.scrollLeft,
    }))
    .filter((item) => item.scrollTop > 0 || item.scrollLeft > 0);
  const state: ReturnScrollState = {
    path,
    scrollTop: scrollEl?.scrollTop ?? window.scrollY ?? 0,
    windowY: window.scrollY ?? 0,
    orderListScrollTop: orderListEl?.scrollTop ?? undefined,
    orderListScrollLeft: orderListEl?.scrollLeft ?? undefined,
    scrollables,
    savedAt: Date.now(),
  };
  sessionStorage.setItem(RETURN_PATH_KEY, path);
  sessionStorage.setItem(RETURN_SCROLL_KEY, JSON.stringify(state));
};

export const restoreProductsReturnScroll = (path?: string) => {
  if (typeof window === 'undefined') return;
  const raw = sessionStorage.getItem(RETURN_SCROLL_KEY);
  if (!raw) return;

  let state: ReturnScrollState | null = null;
  try {
    state = JSON.parse(raw);
  } catch {
    sessionStorage.removeItem(RETURN_SCROLL_KEY);
    return;
  }
  if (!state || (path && state.path !== path)) return;

  let attempts = 0;
  const apply = () => {
    let restoredAny = false;
    let restoredOrderList = false;
    const expectsOrderList = typeof state!.orderListScrollTop === 'number' && state!.orderListScrollTop > 0;
    const scrollEl = document.getElementById(MAIN_SCROLL_ID);
    if (scrollEl) {
      scrollEl.scrollTop = state!.scrollTop;
      restoredAny = Math.abs(scrollEl.scrollTop - state!.scrollTop) <= 2 || restoredAny;
    } else if (attempts >= 10) {
      window.scrollTo(0, state!.windowY || state!.scrollTop);
    }

    const orderListEl = document.querySelector<HTMLElement>(ORDER_LIST_SCROLL_SELECTOR);
    if (orderListEl && typeof state!.orderListScrollTop === 'number') {
      orderListEl.scrollTop = state!.orderListScrollTop;
      orderListEl.scrollLeft = state!.orderListScrollLeft || 0;
      restoredOrderList = Math.abs(orderListEl.scrollTop - state!.orderListScrollTop) <= 2;
      restoredAny = restoredOrderList || restoredAny;
    }

    const currentScrollables = scrollableElements();
    for (const saved of state!.scrollables || []) {
      const target =
        (saved.id ? document.getElementById(saved.id) as HTMLElement | null : null) ||
        currentScrollables[saved.index] ||
        currentScrollables.find((el) => classKey(el) === saved.className);
      if (!target) continue;
      target.scrollTop = saved.scrollTop;
      target.scrollLeft = saved.scrollLeft;
      if (Math.abs(target.scrollTop - saved.scrollTop) <= 2) restoredAny = true;
    }

    if (((restoredAny && attempts >= 3 && (!expectsOrderList || restoredOrderList)) || attempts >= 100)) {
      sessionStorage.removeItem(RETURN_SCROLL_KEY);
      return;
    }

    attempts += 1;
    window.setTimeout(apply, 50);
  };

  window.setTimeout(apply, 0);
};
