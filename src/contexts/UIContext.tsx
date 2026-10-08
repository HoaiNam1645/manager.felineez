import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import useLocalStorage from '../hooks/useLocalStorage';
import { Tab } from '../types';
import { useNotification } from './NotificationContext';

// Constants moved here or imported? For now, defining strict types/constants.
const DEFAULT_TABS: Tab[] = ['Overview', 'Order List', 'Products', 'Support', 'Fulfill', 'KPI'];

// --- URL routing: tab <-> path -------------------------------------------------
// The active menu/tab is encoded in the URL path so views are bookmarkable and
// browser back/forward works. ProductManager owns /products/* (untouched), so the
// "Products" analytics tab uses /analytics.
const TAB_TO_PATH: Record<Tab, string> = {
    'Overview': '/overview',
    'Order List': '/orders',
    'Products': '/analytics',
    'Support': '/support',
    'Fulfill': '/fulfill',
    'KPI': '/kpi',
};
const PATH_TO_TAB: Record<string, Tab> = {
    'overview': 'Overview',
    'orders': 'Order List',
    'analytics': 'Products',
    'support': 'Support',
    'fulfill': 'Fulfill',
    'kpi': 'KPI',
};
// Derive the active tab from the first path segment. Unknown paths (incl. the
// /products ProductManager overlay and "/") fall back to Overview as the underlay.
const pathToTab = (pathname: string): Tab => {
    const seg = pathname.split('/').filter(Boolean)[0] || '';
    return PATH_TO_TAB[seg] ?? 'Overview';
};

interface UIContextType {
    // Layout
    isSidebarCollapsed: boolean;
    toggleSidebar: () => void;

    // Mobile Menu
    isMobileMenuOpen: boolean;
    setIsMobileMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
    toggleMobileMenu: () => void;

    // Modals
    isAccountManagerOpen: boolean;
    setIsAccountManagerOpen: React.Dispatch<React.SetStateAction<boolean>>;
    isTabSettingsOpen: boolean;
    setIsTabSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
    isProductManagerOpen: boolean;
    setIsProductManagerOpen: React.Dispatch<React.SetStateAction<boolean>>;
    isNotificationDetailOpen: boolean;
    setIsNotificationDetailOpen: React.Dispatch<React.SetStateAction<boolean>>;
    selectedNotificationId: string | null;
    setSelectedNotificationId: React.Dispatch<React.SetStateAction<string | null>>;

    // Tabs
    activeTab: Tab;
    setActiveTab: (tab: Tab) => void;
    tabOrder: Tab[];
    setTabOrder: (order: Tab[]) => void;
    hiddenTabs: Set<Tab>;
    reorderTabs: (fromIndex: number, toIndex: number) => void;
    toggleTabVisibility: (tab: Tab) => void;
    resetTabPreferences: () => void;
    handleTabClick: (tab: Tab) => void;

    // Filters & Search
    searchTerm: string;
    setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
    selectedAccountId: string;
    setSelectedAccountId: React.Dispatch<React.SetStateAction<string>>;
    timeZone: string;
    setTimeZone: (tz: string) => void;
    filterDateRange: { from: string; to: string };
    setFilterDateRange: React.Dispatch<React.SetStateAction<{ from: string; to: string }>>;
    dayFilter: string | null;
    setDayFilter: React.Dispatch<React.SetStateAction<string | null>>;
    sourceFilter: 'All' | 'Ebay_Sales' | 'Etsy_Sales';
    setSourceFilter: React.Dispatch<React.SetStateAction<'All' | 'Ebay_Sales' | 'Etsy_Sales'>>;
    supportFilter: 'All' | 'Case' | 'Help' | 'Message';
    setSupportFilter: React.Dispatch<React.SetStateAction<'All' | 'Case' | 'Help' | 'Message'>>;

    // Helpers
    handleViewDayDetails: (date: string) => void;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export const UIProvider: React.FC<{ children: React.ReactNode; userUid?: string; teamId?: string }> = ({ children, userUid, teamId }) => {
    const { addNotification } = useNotification();

    // --- Router (URL is the source of truth for tab + filters) ---
    const location = useLocation();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    // Always-fresh ref so setters can resolve functional updaters without
    // capturing a stale `searchParams` (keeps setter identities stable).
    const searchParamsRef = useRef(searchParams);
    searchParamsRef.current = searchParams;

    const updateParams = useCallback(
        (mutate: (p: URLSearchParams) => void, opts?: { replace?: boolean }) => {
            setSearchParams(prev => {
                const p = new URLSearchParams(prev);
                mutate(p);
                return p;
            }, { replace: opts?.replace });
        },
        [setSearchParams]
    );

    // --- 1. Local Storage State (preferences, not navigation state) ---
    const [storedTimeZone, setStoredTimeZone] = useLocalStorage<string>('timeZone', 'Asia/Ho_Chi_Minh');
    const timeZone = searchParams.get('tz') || storedTimeZone;
    const setTimeZone = useCallback((tz: string) => {
        setStoredTimeZone(tz);
        updateParams(p => { p.set('tz', tz); });
    }, [setStoredTimeZone, updateParams]);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useLocalStorage<boolean>('sidebarCollapsed', false);

    // Tab Preferences
    const prefKey = userUid && teamId ? `tabPreferences_${teamId}_${userUid}` : 'tabPreferences_guest';
    const [tabPreferences, setTabPreferences] = useLocalStorage<{ tabOrder: Tab[], hiddenTabs: Tab[] }>(
        prefKey,
        { tabOrder: DEFAULT_TABS, hiddenTabs: [] }
    );

    const [tabOrder, setLocalTabOrder] = useState<Tab[]>(() => {
        // Filter out any tabs that are no longer in DEFAULT_TABS (handles stale local storage)
        const validTabs = new Set(DEFAULT_TABS);
        const stored = tabPreferences.tabOrder.filter(tab => validTabs.has(tab));
        // Append tabs added after the prefs were saved (e.g. 'KPI') so they aren't lost.
        const missing = DEFAULT_TABS.filter(tab => !stored.includes(tab));
        return [...stored, ...missing];
    });
    // Convert array back to Set for internal logic
    const [hiddenTabs, setHiddenTabs] = useState<Set<Tab>>(new Set(tabPreferences.hiddenTabs));

    // Use ref to track if we're initializing to prevent infinite loop
    const isInitialized = useRef(false);

    // Sync tabPreferences from local storage/state - but only when user changes them, not on every render
    useEffect(() => {
        // Skip initial render to prevent loop
        if (!isInitialized.current) {
            isInitialized.current = true;
            return;
        }

        const timeoutId = setTimeout(() => {
            setTabPreferences({ tabOrder, hiddenTabs: Array.from(hiddenTabs) });
        }, 300); // Debounce to prevent rapid updates

        return () => clearTimeout(timeoutId);
    }, [tabOrder, hiddenTabs, setTabPreferences]);

    // --- 2. Active tab — derived from the URL path ---
    const activeTab = pathToTab(location.pathname);

    // --- 3. Date Range — backed by ?from=&to=, defaulting to "today" in tz ---
    const getTodayInTimezone = useCallback((tz: string = timeZone): string => {
        try {
            const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
            return formatter.format(new Date());
        } catch (e) { return new Date().toISOString().split('T')[0]; }
    }, [timeZone]);

    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    const today = getTodayInTimezone();
    // Memoized so the object identity is stable across renders (data-fetch effects
    // downstream may depend on it). New object only when from/to/today change.
    const filterDateRange = useMemo(
        () => (fromParam && toParam ? { from: fromParam, to: toParam } : { from: today, to: today }),
        [fromParam, toParam, today]
    );
    const setFilterDateRange = useCallback<React.Dispatch<React.SetStateAction<{ from: string; to: string }>>>(
        (value) => {
            const cur = (() => {
                const f = searchParamsRef.current.get('from');
                const t = searchParamsRef.current.get('to');
                return f && t ? { from: f, to: t } : { from: getTodayInTimezone(), to: getTodayInTimezone() };
            })();
            const next = typeof value === 'function' ? (value as (p: { from: string; to: string }) => { from: string; to: string })(cur) : value;
            updateParams(p => { p.set('from', next.from); p.set('to', next.to); });
        },
        [updateParams, getTodayInTimezone]
    );

    // --- 4. Other filters — backed by query params (omit when default) ---
    const selectedAccountId = searchParams.get('account') ?? 'all';
    const setSelectedAccountId = useCallback<React.Dispatch<React.SetStateAction<string>>>(
        (value) => {
            const next = typeof value === 'function'
                ? (value as (p: string) => string)(searchParamsRef.current.get('account') ?? 'all')
                : value;
            updateParams(p => { p.set('account', next || 'all'); });
        },
        [updateParams]
    );

    const rawPlatform = searchParams.get('platform');
    const sourceFilter: 'All' | 'Ebay_Sales' | 'Etsy_Sales' =
        rawPlatform === 'Ebay_Sales' || rawPlatform === 'Etsy_Sales' ? rawPlatform : 'All';
    const setSourceFilter = useCallback<React.Dispatch<React.SetStateAction<'All' | 'Ebay_Sales' | 'Etsy_Sales'>>>(
        (value) => {
            const curRaw = searchParamsRef.current.get('platform');
            const cur: 'All' | 'Ebay_Sales' | 'Etsy_Sales' = curRaw === 'Ebay_Sales' || curRaw === 'Etsy_Sales' ? curRaw : 'All';
            const next = typeof value === 'function' ? (value as (p: typeof cur) => typeof cur)(cur) : value;
            updateParams(p => { p.set('platform', next); });
        },
        [updateParams]
    );

    const rawSupport = searchParams.get('support');
    const supportFilter: 'All' | 'Case' | 'Help' | 'Message' =
        rawSupport === 'Case' || rawSupport === 'Help' || rawSupport === 'Message' ? rawSupport : 'All';
    const setSupportFilter = useCallback<React.Dispatch<React.SetStateAction<'All' | 'Case' | 'Help' | 'Message'>>>(
        (value) => {
            const curRaw = searchParamsRef.current.get('support');
            const cur: 'All' | 'Case' | 'Help' | 'Message' = curRaw === 'Case' || curRaw === 'Help' || curRaw === 'Message' ? curRaw : 'All';
            const next = typeof value === 'function' ? (value as (p: typeof cur) => typeof cur)(cur) : value;
            updateParams(p => { p.set('support', next); });
        },
        [updateParams]
    );

    const dayFilter = searchParams.get('day');
    const setDayFilter = useCallback<React.Dispatch<React.SetStateAction<string | null>>>(
        (value) => {
            const next = typeof value === 'function'
                ? (value as (p: string | null) => string | null)(searchParamsRef.current.get('day'))
                : value;
            updateParams(p => { if (!next) p.delete('day'); else p.set('day', next); });
        },
        [updateParams]
    );

    // searchTerm: keep a local mirror for instant typing; debounce the ?q= write
    // (replace, so keystrokes don't fill the history stack).
    const [searchInput, setSearchInput] = useState<string>(() => searchParams.get('q') ?? '');
    const searchInputRef = useRef(searchInput);
    searchInputRef.current = searchInput;
    const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const searchTerm = searchInput;
    const setSearchTerm = useCallback<React.Dispatch<React.SetStateAction<string>>>(
        (value) => {
            const next = typeof value === 'function' ? (value as (p: string) => string)(searchInputRef.current) : value;
            setSearchInput(next);
            if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
            searchDebounceRef.current = setTimeout(() => {
                updateParams(p => { if (!next) p.delete('q'); else p.set('q', next); }, { replace: true });
            }, 300);
        },
        [updateParams]
    );
    // Keep the mirror in sync when ?q= changes externally (back/forward, deep link).
    useEffect(() => {
        const urlQ = searchParams.get('q') ?? '';
        if (urlQ !== searchInputRef.current) setSearchInput(urlQ);
    }, [searchParams]);

    // --- 5. Modals (transient UI state) ---
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isAccountManagerOpen, setIsAccountManagerOpen] = useState(false);
    const [isTabSettingsOpen, setIsTabSettingsOpen] = useState(false);
    const [isProductManagerOpen, setIsProductManagerOpen] = useState(false);
    const [isNotificationDetailOpen, setIsNotificationDetailOpen] = useState(false);
    const [selectedNotificationId, setSelectedNotificationId] = useState<string | null>(null);


    // --- 6. Logic Functions ---
    const toggleSidebar = useCallback(() => setIsSidebarCollapsed(prev => !prev), [setIsSidebarCollapsed]);
    const toggleMobileMenu = useCallback(() => setIsMobileMenuOpen(prev => !prev), []);

    // Params that belong to ONE tab's screens (not shared filters) — they must
    // not leak to other tabs when switching. Currently: Fulfill's Lemiex flow.
    const dropForeignScreenParams = (p: URLSearchParams, targetTab: Tab) => {
        if (targetTab !== 'Fulfill') {
            p.delete('section');
            p.delete('lmx');
            p.delete('fp');
        }
        return p;
    };

    // Switch tab = navigate to its path, preserving the current filter query string.
    const setActiveTab = useCallback((tab: Tab) => {
        const p = dropForeignScreenParams(new URLSearchParams(searchParamsRef.current), tab);
        navigate({ pathname: TAB_TO_PATH[tab] ?? '/overview', search: p.toString() });
    }, [navigate]);

    // Tab click also clears the day drill-down filter.
    const handleTabClick = useCallback((tab: Tab) => {
        const p = dropForeignScreenParams(new URLSearchParams(searchParamsRef.current), tab);
        p.delete('day');
        navigate({ pathname: TAB_TO_PATH[tab] ?? '/overview', search: p.toString() });
    }, [navigate]);

    const handleViewDayDetails = useCallback((date: string) => {
        const p = dropForeignScreenParams(new URLSearchParams(searchParamsRef.current), 'Order List');
        p.set('day', date);
        navigate({ pathname: TAB_TO_PATH['Order List'], search: p.toString() });
    }, [navigate]);

    const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
        setLocalTabOrder(prev => {
            const newOrder = [...prev];
            const [moved] = newOrder.splice(fromIndex, 1);
            newOrder.splice(toIndex, 0, moved);
            return newOrder;
        });
    }, []);

    const toggleTabVisibility = useCallback((tab: Tab) => {
        setHiddenTabs(prev => {
            const newSet = new Set(prev);
            if (newSet.has(tab)) newSet.delete(tab);
            else newSet.add(tab);
            return newSet;
        });
    }, []);

    const resetTabPreferences = useCallback(() => {
        setLocalTabOrder(DEFAULT_TABS);
        setHiddenTabs(new Set());
        addNotification('Tab preferences reset.', 'success');
    }, [addNotification]);

    return (
        <UIContext.Provider value={{
            isSidebarCollapsed, toggleSidebar,
            isMobileMenuOpen, setIsMobileMenuOpen, toggleMobileMenu,
            isAccountManagerOpen, setIsAccountManagerOpen,
            isTabSettingsOpen, setIsTabSettingsOpen,
            isProductManagerOpen, setIsProductManagerOpen,
            isNotificationDetailOpen, setIsNotificationDetailOpen,
            selectedNotificationId, setSelectedNotificationId,
            activeTab, setActiveTab,
            tabOrder, setTabOrder: setLocalTabOrder,
            hiddenTabs, reorderTabs, toggleTabVisibility, resetTabPreferences, handleTabClick,
            searchTerm, setSearchTerm,
            selectedAccountId, setSelectedAccountId,
            timeZone, setTimeZone,
            filterDateRange, setFilterDateRange,
            dayFilter, setDayFilter,
            sourceFilter, setSourceFilter,
            supportFilter, setSupportFilter,
            handleViewDayDetails
        }}>
            {children}
        </UIContext.Provider>
    );
};

export const useUI = () => {
    const context = useContext(UIContext);
    if (context === undefined) {
        throw new Error('useUI must be used within a UIProvider');
    }
    return context;
};
