import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, RefreshCw } from 'lucide-react';
import LoadingSpinner from '../LoadingSpinner';
import { ProcessedData, Record } from '../../types';
import DataTable from '../DataTable';
import { ORDER_LIST_INDICES } from '../../constants/dataIndices';
import { formatDateEfficiently } from '../../utils/dateFormatter';
import { ORDER_STATUSES, ORDER_STATUS_LABELS } from '../../constants/orderStatus';
import { useDashboard } from '../../contexts/DashboardContext';
import { createManualOrderRecord, updateOrderFields } from '../../services/firebaseService';
import EditOrderModal, { EditOrderFields } from '../EditOrderModal';
import ManualOrderModal from '../ManualOrderModal';
import GoogleSheetModal from '../GoogleSheetModal';
import OrderSelectorModal from '../OrderSelectorModal';
import PreviewSyncModal from '../PreviewSyncModal';
import { Product, fetchAllProducts } from '../../services/productService';
import { api } from '../../services/apiClient';
import { fetchListedIdeas } from '../../services/ideasService';
import { useNotification } from '../../contexts/NotificationContext';
import { designRequestsOf, productMatchesDesignItem } from '../../utils/designItems';
import { captureProductsReturnState, restoreProductsReturnScroll } from '../../utils/productReturnState';

const FACTORIES: { key: string; label: string }[] = [
    { key: 'lemiex', label: 'Lemiex' },
    { key: 'mango', label: 'MangoTee' },
    { key: 'vinaway', label: 'Vinaway' },
    { key: 'monkeyking', label: 'MonkeyKing' },
    { key: 'dreamship', label: 'Dreamship' },
    { key: 'hongphat', label: 'HongPhat' },
    { key: 'hogoto', label: 'Hogoto' },
];

// Status quick-filter: pipeline statuses + "No tracking" (SHIPPED without a tracking code)
type StatusFilter = 'ALL' | (typeof ORDER_STATUSES)[number] | 'NO_TRACKING';

// Factory filter maps to the ffCode prefix each factory uses
const FF_PREFIX: { [key: string]: string } = {
    lemiex: 'LMX-', mango: 'MGO-', vinaway: 'VNW-', monkeyking: 'MKP-',
    dreamship: 'DSH-', hongphat: 'HPE-', hogoto: 'HGT-',
};
const VISIBLE_ORDER_STATUSES = ORDER_STATUSES.filter(status => status !== 'READY');

const normalizeIdeaName = (value?: string | null) => (value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
interface OrderListTabProps {
    processedData: ProcessedData;
    dayFilter: string | null;
    sourceFilter: string;
    timeZone: string;
    handleViewOrderDetails: (recordId: string) => void;
    handleResyncOrder: (recordId: string) => Promise<void>;
    handleChangeOrderStatus: (recordId: string, status: string) => Promise<void>;
    handleSaveTracking: (recordId: string, tracking: string) => Promise<void>;
    handleSaveFfNote: (recordId: string, note: string) => Promise<void>;
    allRecords: Record[];
}

const OrderListTab: React.FC<OrderListTabProps> = ({
    processedData,
    dayFilter,
    sourceFilter,
    timeZone,
    handleViewOrderDetails,
    handleResyncOrder,
    handleChangeOrderStatus,
    handleSaveTracking,
    handleSaveFfNote,
    allRecords
}) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const { role, setRecords, accounts } = useDashboard();
    const { addNotification } = useNotification();
    const [showGoogleSheetModal, setShowGoogleSheetModal] = useState(false);
    const [showOrderSelector, setShowOrderSelector] = useState(false);
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [showCreateOrder, setShowCreateOrder] = useState(false);
    const [selectedRecords, setSelectedRecords] = useState<Record[]>([]);
    const [fulfillFor, setFulfillFor] = useState<string | null>(null);
    const [mappingSku, setMappingSku] = useState(false);
    const [editFor, setEditFor] = useState<string | null>(null);
    const [designProducts, setDesignProducts] = useState<Product[]>([]);

    const editRecord = editFor ? allRecords.find(r => r.id === editFor) || null : null;
    const rawOrderStatus = searchParams.get('orderStatus');
    const statusFilter: StatusFilter = rawOrderStatus === 'ALL' || rawOrderStatus === 'NO_TRACKING' || VISIBLE_ORDER_STATUSES.includes(rawOrderStatus as any)
        ? rawOrderStatus as StatusFilter
        : 'ALL';
    const rawFactory = searchParams.get('factory');
    const factoryFilter = rawFactory === 'all' || rawFactory === 'unsent' || !!(rawFactory && FF_PREFIX[rawFactory])
        ? rawFactory
        : 'all';
    const search = searchParams.get('orderQ') || '';
    const skuFilter = searchParams.get('sku') || '';

    const updateOrderListParam = useCallback((key: string, value: string | null, replace = false) => {
        setSearchParams(prev => {
            const params = new URLSearchParams(prev);
            if (value === null || value === '') params.delete(key);
            else params.set(key, value);
            return params;
        }, { replace });
    }, [setSearchParams]);

    const setStatusFilter = useCallback((value: StatusFilter) => {
        updateOrderListParam('orderStatus', value);
    }, [updateOrderListParam]);

    const setFactoryFilter = useCallback((value: string) => {
        updateOrderListParam('factory', value);
    }, [updateOrderListParam]);

    const setSearch = useCallback((value: string) => {
        updateOrderListParam('orderQ', value.trim() ? value : null, true);
    }, [updateOrderListParam]);

    const setSkuFilter = useCallback((value: string) => {
        updateOrderListParam('sku', value.trim() ? value : null, true);
    }, [updateOrderListParam]);

    useEffect(() => {
        let cancelled = false;
        fetchAllProducts(1000)
            .then(products => { if (!cancelled) setDesignProducts(products); })
            .catch(() => { if (!cancelled) setDesignProducts([]); });
        return () => { cancelled = true; };
    }, []);

    const handleSaveEdit = async (recordId: string, f: EditOrderFields) => {
        const rec = allRecords.find(r => r.id === recordId);
        const details = rec?.details ? {
            ...rec.details,
            customerName: f.customer_name,
        } : undefined;
        await updateOrderFields(recordId, {
            order_id: f.order_id,
            amount: f.amount,
            cost_total: f.cost_total,
            design_cost: f.design_cost,
            ff_code: f.ff_code || null,
            order_status: f.order_status,
            tracking_code: f.tracking_code || null,
            ...(details ? { details } : {}),
        });
        setRecords(prev => prev.map(r => r.id === recordId ? {
            ...r,
            order_id: f.order_id,
            amount: f.amount,
            cost_total: f.cost_total ?? undefined,
            design_cost: f.design_cost ?? undefined,
            ff_code: f.ff_code || undefined,
            order_status: f.order_status,
            tracking_code: f.tracking_code || undefined,
            ...(details ? { details } : {}),
        } : r));
    };

    const goFulfill = (recordId: string, factory: string) => {
        setFulfillFor(null);
        const qs = new URLSearchParams({ section: 'factory', lmx: recordId });
        if (factory !== 'lemiex') qs.set('fp', factory);
        navigate(`/fulfill?${qs.toString()}`);
    };

    const handleSaveOrderNote = async (recordId: string, note: string) => {
        const rec = allRecords.find(r => r.id === recordId);
        const trimmed = note.trim();
        const details = {
            ...((rec?.details || {}) as any),
            orderNote: trimmed,
        };
        await updateOrderFields(recordId, { details });
        setRecords(prev => prev.map(r => r.id === recordId ? { ...r, details: details as any } : r));
    };

    const goDesign = async (productName: string, recordId?: string, designItemKey?: string) => {
        const q = productName.trim();
        const params = new URLSearchParams();
        if (q) params.set('design', q);
        if (recordId) {
            params.set('designOrder', recordId);
            if (designItemKey) params.set('designItem', designItemKey);
            try {
                const rec = allRecords.find(r => r.id === recordId);
                const previousRequests = designRequestsOf(rec?.details);
                const now = new Date().toISOString();
                const details = rec?.details ? {
                    ...rec.details,
                    designRequestedAt: now,
                    ...(designItemKey ? { designRequests: { ...previousRequests, [designItemKey]: now } } : {}),
                } : {
                    designRequestedAt: now,
                    ...(designItemKey ? { designRequests: { [designItemKey]: now } } : {}),
                };
                await updateOrderFields(recordId, { details });
                setRecords(prev => prev.map(r => r.id === recordId ? { ...r, details: details as any } : r));
            } catch (e) {
                console.error('Failed to assign design order:', e);
            }
        }
        const returnPath = `${location.pathname}${location.search}${location.hash}`;
        captureProductsReturnState(returnPath);
        navigate(`/products${params.toString() ? `?${params.toString()}` : ''}`, { state: { from: returnPath } });
    };

    // Columns hidden from the Order List UI (data is kept for filtering/export)
    const hiddenIndices = useMemo(() => {
        const hidden = new Set<number>();
        const names = ['Variants', 'Source', 'Currency', 'Image', 'Account', 'DateTime'];
        if (role === 'design') names.push('Revenue', 'FF Cost', 'DS Cost', 'Profit');
        names.forEach(name => {
            const i = processedData.orders.headers.findIndex(h => h === name);
            if (i !== -1) hidden.add(i);
        });
        return hidden;
    }, [processedData.orders.headers, role]);

    const displayHeaders = useMemo(() => {
        return ['Stt', ...processedData.orders.headers.filter((_, i) => !hiddenIndices.has(i))];
    }, [processedData.orders.headers, hiddenIndices]);

    const statusIdx = processedData.orders.headers.indexOf('Status');
    const trackingIdx = processedData.orders.headers.indexOf('Tracking');
    const statusOf = (row: any[]): string => {
        const status = (row[statusIdx] as any)?.value || 'NEW';
        return status === 'READY' ? 'NEW' : status;
    };
    const trackingOf = (row: any[]): string => (row[trackingIdx] as any)?.value || '';

    const ffIdx = processedData.orders.headers.indexOf('FF Code');
    const orderIdIdx = processedData.orders.headers.indexOf('Order ID');
    const productIdx = processedData.orders.headers.indexOf('Product Name');
    const accountIdx = processedData.orders.headers.indexOf('Account');
    const dateTimeIdx = processedData.orders.headers.indexOf('DateTime');
    const sourceIdx = processedData.orders.headers.indexOf('Source');
    const skusOf = (row: any[]): string[] => {
        const productCell = row[productIdx] as any;
        const itemSkus = productCell?.type === 'items' && Array.isArray(productCell.items)
            ? productCell.items.map((item: any) => item?.sku ? String(item.sku) : '').filter(Boolean)
            : [];
        const recordId = productCell?.id;
        const rec = recordId ? allRecords.find(r => r.id === recordId) : null;
        if (itemSkus.length > 0) return itemSkus;
        return rec?.etsy_fees?.sku ? [String(rec.etsy_fees.sku)] : [];
    };

    const markDesignRows = (rows: any[][]) => {
        if (designProducts.length === 0 || productIdx === -1) return rows;
        return rows.map(row => {
            const productCell = row[productIdx] as any;
            if (!productCell || productCell.type !== 'items' || !Array.isArray(productCell.items)) return row;
            const nextItems = productCell.items.map((item: any) => {
                const matchedDesign = designProducts.find(product => productMatchesDesignItem(product, item.designItemKey));
                const hasDesign = !!matchedDesign;
                const hasDesignFiles = (matchedDesign?.images?.length || 0) > 0;
                const designFileCount = matchedDesign?.images?.length || 0;
                return hasDesign === item.hasDesign && hasDesignFiles === item.hasDesignFiles && designFileCount === item.designFileCount
                    ? item
                    : { ...item, hasDesign, hasDesignFiles, designFileCount };
            });
            const hasDesign = nextItems.some((item: any) => item.hasDesign);
            if (productCell.hasDesign === hasDesign && nextItems.every((item: any, i: number) => item === productCell.items[i])) return row;
            const nextRow = [...row];
            nextRow[productIdx] = { ...productCell, items: nextItems, hasDesign };
            return nextRow;
        });
    };

    // Rows after date/source/factory filters — the base both the pills' counts and the table share
    const baseRows = useMemo(() => {
        let rows = processedData.orders.rows;

        if (dayFilter) {
            rows = rows.filter(row => {
                const dtLocal = row[ORDER_LIST_INDICES.DT_LOCAL_RAW] as string;
                return formatDateEfficiently(dtLocal, timeZone) === dayFilter;
            });
        }

        if (sourceFilter !== 'All') {
            rows = rows.filter(row => {
                const source = row[ORDER_LIST_INDICES.SOURCE] as string;
                return source === sourceFilter;
            });
        }

        if (factoryFilter === 'unsent') {
            rows = rows.filter(row => !/^[A-Z]{3}-/.test(String(row[ffIdx] || '')));
        } else if (factoryFilter !== 'all' && FF_PREFIX[factoryFilter]) {
            rows = rows.filter(row => String(row[ffIdx] || '').startsWith(FF_PREFIX[factoryFilter]));
        }

        const q = search.trim().toLowerCase();
        if (q) {
            rows = rows.filter(row => {
                const oid = String(row[orderIdIdx] || '').toLowerCase();
                const pname = String((row[productIdx] as any)?.name || '').toLowerCase();
                const trk = trackingOf(row).toLowerCase();
                return oid.includes(q) || pname.includes(q) || trk.includes(q);
            });
        }

        const skuQ = skuFilter.trim().slice(0, 2).toLowerCase();
        if (skuQ) {
            rows = rows.filter(row => skusOf(row).some(sku => sku.trim().slice(0, 2).toLowerCase() === skuQ));
        }

        return rows;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [processedData.orders.rows, dayFilter, sourceFilter, timeZone, factoryFilter, ffIdx, search, skuFilter, allRecords]);

    const statusCounts = useMemo(() => {
        const counts: { [key: string]: number } = { ALL: baseRows.length, NO_TRACKING: 0 };
        for (const row of baseRows) {
            const s = statusOf(row);
            counts[s] = (counts[s] || 0) + 1;
            if (s === 'SHIPPED' && !trackingOf(row)) counts.NO_TRACKING += 1;
        }
        return counts;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [baseRows]);

    const visibleRows = useMemo(() => {
        let rows = markDesignRows(baseRows);

        if (statusFilter === 'NO_TRACKING') {
            rows = rows.filter(row => statusOf(row) === 'SHIPPED' && !trackingOf(row));
        } else if (statusFilter !== 'ALL') {
            rows = rows.filter(row => statusOf(row) === statusFilter);
        }

        return rows;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [baseRows, statusFilter, designProducts]);

    const displayRows = useMemo(() => {
        let rows = visibleRows.map(row => {
            const next = [...row];
            if (orderIdIdx !== -1) {
                const productCell = productIdx !== -1 ? row[productIdx] as any : null;
                next[orderIdIdx] = {
                    type: 'order_meta',
                    id: productCell?.id,
                    orderId: row[orderIdIdx],
                    account: accountIdx !== -1 ? row[accountIdx] : '',
                    dateTime: dateTimeIdx !== -1 ? row[dateTimeIdx] : '',
                    source: sourceIdx !== -1 ? row[sourceIdx] : '',
                } as any;
            }
            return next;
        });

        if (hiddenIndices.size > 0) {
            rows = rows.map(row => row.filter((_, i) => !hiddenIndices.has(i)));
        }

        return rows.map((row, index) => [index + 1, ...row]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visibleRows, hiddenIndices]);

    useEffect(() => {
        const path = `${location.pathname}${location.search}${location.hash}`;
        restoreProductsReturnScroll(path);
    }, [displayRows.length, location.pathname, location.search, location.hash]);

    const filteredRecords = useMemo(() => {
        const ids = new Set<string>();
        visibleRows.forEach(row => {
            const productCell = row[productIdx] as any;
            if (productCell?.id) ids.add(productCell.id);
        });
        return allRecords.filter(record => record.id && ids.has(record.id));
    }, [visibleRows, productIdx, allRecords]);

    const statusPills: { key: StatusFilter; label: string }[] = [
        { key: 'ALL', label: 'All' },
        ...VISIBLE_ORDER_STATUSES.map(s => ({ key: s as StatusFilter, label: ORDER_STATUS_LABELS[s] || s })),
        { key: 'NO_TRACKING', label: 'No tracking' },
    ];

    const handleOrderSelection = (selectedIds: Set<string>) => {
        const records = allRecords.filter(r => r.id && selectedIds.has(r.id));
        setSelectedRecords(records);
        setShowOrderSelector(false);
        setShowPreviewModal(true);
    };

    const handleMapSkuFromIdeas = async () => {
        if (mappingSku) return;
        setMappingSku(true);
        try {
            const ideas = await fetchListedIdeas();
            const skuByName = new Map<string, string>();
            ideas.forEach(idea => {
                const key = normalizeIdeaName(idea.productName);
                if (key && idea.sku && !skuByName.has(key)) skuByName.set(key, idea.sku);
            });

            const updatesBySku = new Map<string, { recordId: string; itemIndex: number }[]>();
            const optimistic: { recordId: string; itemIndex: number; sku: string }[] = [];
            for (const row of baseRows) {
                const productCell = row[productIdx] as any;
                if (!productCell || productCell.type !== 'items' || !Array.isArray(productCell.items)) continue;
                const recordId = productCell.id;
                if (!recordId) continue;
                productCell.items.forEach((item: any, itemIndex: number) => {
                    if (String(item?.sku || '').trim()) return;
                    const matchedSku = skuByName.get(normalizeIdeaName(item?.name));
                    if (!matchedSku) return;
                    const list = updatesBySku.get(matchedSku) || [];
                    list.push({ recordId, itemIndex });
                    updatesBySku.set(matchedSku, list);
                    optimistic.push({ recordId, itemIndex, sku: matchedSku });
                });
            }

            if (optimistic.length === 0) {
                addNotification('Không có đơn trống SKU nào trùng tên với Ideas.', 'info');
                return;
            }

            for (const [sku, items] of updatesBySku.entries()) {
                await api.patch('/api/records', { sku, items });
            }

            setRecords(prev => prev.map(record => {
                if (!record.id || !record.details?.items) return record;
                const ownUpdates = optimistic.filter(update => update.recordId === record.id);
                if (ownUpdates.length === 0) return record;
                const items = record.details.items.map((item, index) => {
                    const update = ownUpdates.find(u => u.itemIndex === index);
                    return update ? { ...item, sku: update.sku } : item;
                });
                return {
                    ...record,
                    details: { ...record.details, items },
                    etsy_fees: items.length === 1 ? { ...(record.etsy_fees || {}), sku: items[0].sku || null } : record.etsy_fees,
                };
            }));
            addNotification(`Đã map SKU cho ${optimistic.length} item từ Ideas.`, 'success');
        } catch (error) {
            console.error('Map SKU from ideas failed:', error);
            addNotification('Map SKU từ Ideas thất bại, thử lại giúp mình.', 'error');
        } finally {
            setMappingSku(false);
        }
    };

    const handleCreateManualOrder = async (record: Partial<Record>) => {
        const saved = await createManualOrderRecord(record);
        setRecords(prev => prev.some(r => r.id === saved.id) ? prev : [saved, ...prev]);
        addNotification(`Đã tạo đơn #${saved.order_id || saved.id}.`, 'success');
    };

    return (
        <div className="h-full bg-gray-50 dark:bg-gray-900 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] relative">
            <div className="p-2 md:p-6">
                <div className="mb-3 space-y-3">
                    <div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
                        {statusPills.map(p => (
                            <button
                                key={p.key}
                                onClick={() => setStatusFilter(p.key)}
                                className={`flex-none px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                                    statusFilter === p.key
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                                }`}
                            >
                                {p.label} ({statusCounts[p.key] || 0})
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-start">
                        <select
                            value={factoryFilter}
                            onChange={e => setFactoryFilter(e.target.value)}
                            className="h-9 w-full sm:w-44 px-3 rounded-full text-xs font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="all">All factories</option>
                            <option value="unsent">Not fulfilled</option>
                            {FACTORIES.map(f => (
                                <option key={f.key} value={f.key}>{f.label}</option>
                            ))}
                        </select>
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Order ID, product, tracking"
                            className="h-9 w-full sm:w-72 px-3 rounded-full text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <input
                            value={skuFilter}
                            onChange={e => setSkuFilter(e.target.value)}
                            placeholder="SKU prefix"
                            className="h-9 w-full sm:w-36 px-3 rounded-full text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                            type="button"
                            onClick={() => setShowCreateOrder(true)}
                            disabled={accounts.length === 0}
                            className="h-9 w-full sm:w-auto px-3 rounded-full text-xs font-semibold bg-blue-50 dark:bg-blue-900/25 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                            title="Tạo đơn hàng thủ công"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Create Order</span>
                        </button>
                        {role !== 'fulfillment' && role !== 'design' && (
                            <>
                                <button
                                    type="button"
                                    onClick={handleMapSkuFromIdeas}
                                    disabled={mappingSku}
                                    className="h-9 w-full sm:w-auto px-3 rounded-full text-xs font-semibold bg-pink-50 dark:bg-pink-900/25 border border-pink-200 dark:border-pink-800 text-pink-700 dark:text-pink-300 hover:bg-pink-100 dark:hover:bg-pink-900/40 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                                    title="Map SKU từ Ideas theo tên sản phẩm"
                                >
                                    <RefreshCw className={`w-4 h-4 ${mappingSku ? 'animate-spin' : ''}`} />
                                    <span>{mappingSku ? 'Mapping' : 'Map SKU từ Ideas'}</span>
                                </button>
                            </>
                        )}
                    </div>
                </div>
                <div style={{ height: 'calc(100vh - 205px)' }}>
                    <Suspense fallback={<LoadingSpinner variant="card" count={5} />}>
                        <DataTable
                            headers={displayHeaders}
                            data={displayRows}
                            onViewOrderDetails={handleViewOrderDetails}
                            onResyncOrder={handleResyncOrder}
                            onChangeOrderStatus={handleChangeOrderStatus}
                            onSaveTracking={handleSaveTracking}
                            onSaveOrderNote={handleSaveOrderNote}
                            onSaveFfNote={handleSaveFfNote}
                            onEditOrder={setEditFor}
                            onFulfillOrder={setFulfillFor}
                            onDesignOrder={goDesign}
                            mobileRowHeight={340}
                            autoHeight={false}
                            scrollParentId="orders-list"
                        />
                    </Suspense>
                </div>
            </div>

            {/* Floating Action Button - Select Orders to Sync */}
            {role !== 'fulfillment' && role !== 'design' && (
            <div className="fixed bottom-28 left-4 md:bottom-8 md:left-auto md:right-8 z-40">
                <button
                    onClick={() => setShowOrderSelector(true)}
                    className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all duration-200 flex items-center gap-2 group"
                    title="Select Orders to Sync"
                >
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3M19 19H5V5H19V19M12 13H7V11H12V13M17 9H7V7H17V9M17 17H7V15H17V17Z" />
                    </svg>
                    <span className="hidden md:group-hover:inline-block font-medium text-sm whitespace-nowrap">
                        Select Orders
                    </span>
                </button>
            </div>
            )}

            {/* Order Selector Modal */}
            <OrderSelectorModal
                isOpen={showOrderSelector}
                onClose={() => setShowOrderSelector(false)}
                allRecords={filteredRecords}
                onConfirm={handleOrderSelection}
                onOpenSettings={() => setShowGoogleSheetModal(true)}
            />

            {/* Google Sheet Config Modal - NO records */}
            {showGoogleSheetModal && (
                <GoogleSheetModal
                    isOpen={showGoogleSheetModal}
                    onClose={() => setShowGoogleSheetModal(false)}
                    records={[]}
                />
            )}

            {/* Preview Sync Modal */}
            <PreviewSyncModal
                isOpen={showPreviewModal}
                onClose={() => {
                    setShowPreviewModal(false);
                    setSelectedRecords([]);
                }}
                selectedRecords={selectedRecords}
                onSuccess={() => {
                    setShowPreviewModal(false);
                    setSelectedRecords([]);
                }}
            />

            <ManualOrderModal
                isOpen={showCreateOrder}
                accounts={accounts}
                onClose={() => setShowCreateOrder(false)}
                onCreate={handleCreateManualOrder}
            />

            {editRecord && (
                <EditOrderModal
                    record={editRecord}
                    onClose={() => setEditFor(null)}
                    onSave={handleSaveEdit}
                />
            )}

            {/* Factory picker for the Fulfill action */}
            {fulfillFor && (() => {
                // Pre-mark the factory this order was already sent to (from its ffCode prefix)
                const prefixToKey: { [p: string]: string } = {
                    LMX: 'lemiex', MGO: 'mango', VNW: 'vinaway', MKP: 'monkeyking',
                    DSH: 'dreamship', HPE: 'hongphat', HGT: 'hogoto',
                };
                const ffCode = allRecords.find(r => r.id === fulfillFor)?.ff_code || '';
                const m = /^([A-Z]{3})-/.exec(ffCode);
                const sentKey = m ? prefixToKey[m[1]] || null : null;
                return (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[70] p-4" onClick={() => setFulfillFor(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-xs border border-gray-200 dark:border-gray-700 p-5" onClick={e => e.stopPropagation()}>
                        <h3 className="text-base font-bold text-gray-900 dark:text-white mb-3">Send to factory</h3>
                        <div className="space-y-2">
                            {FACTORIES.map(f => (
                                <button
                                    key={f.key}
                                    onClick={() => goFulfill(fulfillFor, f.key)}
                                    className={`w-full px-4 py-2.5 text-sm font-medium text-left rounded-md transition-colors flex items-center justify-between gap-2 ${
                                        f.key === sentKey
                                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700'
                                            : 'bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-300'
                                    }`}
                                >
                                    <span>{f.label}</span>
                                    {f.key === sentKey && (
                                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 whitespace-nowrap">
                                            Sent • {ffCode}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                        <div className="flex justify-end mt-4">
                            <button onClick={() => setFulfillFor(null)} className="px-4 py-2 text-sm font-medium bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-500 text-gray-700 dark:text-white rounded-md hover:bg-gray-50 dark:hover:bg-gray-600">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
                );
            })()}
        </div>
    );
};

export default OrderListTab;
