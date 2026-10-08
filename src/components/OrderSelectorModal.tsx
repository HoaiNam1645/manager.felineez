import React, { useState, useMemo, useEffect } from 'react';
import { Record } from '../types';
import { useDashboard } from '../contexts/DashboardContext';
import { api } from '../services/apiClient';

interface OrderSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
    allRecords: Record[];
    onConfirm: (selectedIds: Set<string>) => void;
    onOpenSettings?: () => void;
}

interface OrderItemRow {
    key: string;
    record: Record;
    itemIndex: number;
    item: NonNullable<NonNullable<Record['details']>['items']>[number];
}

const OrderSelectorModal: React.FC<OrderSelectorModalProps> = ({
    isOpen,
    onClose,
    allRecords,
    onConfirm,
    onOpenSettings
}) => {
    const { allAccounts, setRecords } = useDashboard();
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
    const [searchTerm, setSearchTerm] = useState('');
    const [skuInput, setSkuInput] = useState('');
    const [isMappingSku, setIsMappingSku] = useState(false);
    const [mapMessage, setMapMessage] = useState<string | null>(null);

    // Helper to get account label
    const getAccountLabel = (email: string) => {
        const account = allAccounts.find(acc => acc.email === email);
        return account?.label || email;
    };

    // Only show orders, not Funds/case/help
    const ordersOnly = useMemo(() => {
        return allRecords.filter(r => r.kind === 'order');
    }, [allRecords]);

    const itemRows = useMemo<OrderItemRow[]>(() => {
        return ordersOnly.flatMap(record => {
            const items = record.details?.items?.length
                ? record.details.items
                : [{ name: record.product_name || 'No product', quantity: 1, price: record.amount, image: undefined, sku: record.etsy_fees?.sku }];
            return items.map((item, itemIndex) => ({
                key: `${record.id || record.order_id}-${itemIndex}`,
                record,
                itemIndex,
                item,
            }));
        });
    }, [ordersOnly]);

    // Auto-select all when modal opens
    useEffect(() => {
        if (isOpen && itemRows.length > 0) {
            setSelectedKeys(new Set(itemRows.map(row => row.key)));
        }
    }, [isOpen, itemRows]);

    const filteredRows = useMemo(() => {
        if (!searchTerm) return itemRows;
        const term = searchTerm.toLowerCase();
        return itemRows.filter(({ record, item }) => {
            return (
                record.order_id?.toLowerCase().includes(term) ||
                item.name?.toLowerCase().includes(term) ||
                item.variant?.toLowerCase().includes(term) ||
                item.personalization?.toLowerCase().includes(term) ||
                item.sku?.toLowerCase().includes(term) ||
                record.etsy_fees?.sku?.toLowerCase().includes(term) ||
                record.account?.toLowerCase().includes(term)
            );
        });
    }, [itemRows, searchTerm]);

    const selectedOrderIds = useMemo(() => {
        const ids = new Set<string>();
        itemRows.forEach(row => {
            if (selectedKeys.has(row.key) && row.record.id) ids.add(row.record.id);
        });
        return ids;
    }, [itemRows, selectedKeys]);

    const toggleSelect = (key: string) => {
        setSelectedKeys(prev => {
            const newSet = new Set(prev);
            if (newSet.has(key)) {
                newSet.delete(key);
            } else {
                newSet.add(key);
            }
            return newSet;
        });
    };

    const toggleSelectAll = () => {
        const filteredKeys = filteredRows.map(row => row.key);
        if (filteredKeys.length > 0 && filteredKeys.every(key => selectedKeys.has(key))) {
            setSelectedKeys(prev => {
                const next = new Set(prev);
                filteredKeys.forEach(key => next.delete(key));
                return next;
            });
        } else {
            setSelectedKeys(prev => {
                const next = new Set(prev);
                filteredKeys.forEach(key => next.add(key));
                return next;
            });
        }
    };

    const handleConfirm = () => {
        onConfirm(selectedOrderIds);
        onClose();
    };

    const handleMapSku = async () => {
        const sku = skuInput.trim();
        if (!sku || selectedKeys.size === 0 || isMappingSku) return;
        setIsMappingSku(true);
        setMapMessage(null);
        try {
            const selectedItems = itemRows
                .filter(row => selectedKeys.has(row.key) && row.record.id)
                .map(row => ({ recordId: row.record.id as string, itemIndex: row.itemIndex }));
            const res = await api.patch<{ updated: number; updatedItems?: number; sku: string }>('/api/records', { items: selectedItems, sku });
            setRecords(prev => prev.map(record => (
                record.id && selectedItems.some(item => item.recordId === record.id)
                    ? {
                        ...record,
                        details: record.details?.items
                            ? {
                                ...record.details,
                                items: record.details.items.map((item, index) => (
                                    selectedItems.some(selected => selected.recordId === record.id && selected.itemIndex === index)
                                        ? { ...item, sku: res.sku }
                                        : item
                                )),
                            }
                            : record.details,
                        etsy_fees: record.details?.items?.length === 1
                            ? { ...(record.etsy_fees || {}), sku: res.sku }
                            : record.etsy_fees,
                    }
                    : record
            )));
            setSkuInput('');
            setMapMessage(`Mapped SKU to ${res.updatedItems ?? selectedItems.length} items`);
        } catch (err: any) {
            setMapMessage(err?.message || 'Map SKU failed');
        } finally {
            setIsMappingSku(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                            Select Orders to Sync
                        </h2>
                        <div className="flex items-center gap-2">
                            {/* Settings Button */}
                            {onOpenSettings && (
                                <button
                                    onClick={onOpenSettings}
                                    className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                    title="Settings"
                                >
                                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z" />
                                    </svg>
                                </button>
                            )}
                            {/* Close Button */}
                            <button
                                onClick={onClose}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                            >
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Search */}
                    <input
                        type="text"
                        placeholder="Search order number, product, shop..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />

                    <div className="mt-3 flex flex-col sm:flex-row gap-2">
                        <input
                            type="text"
                            placeholder="Enter SKU to map selected items"
                            value={skuInput}
                            onChange={(e) => {
                                setSkuInput(e.target.value);
                                setMapMessage(null);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleMapSku();
                            }}
                            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        <button
                            onClick={handleMapSku}
                            disabled={selectedKeys.size === 0 || !skuInput.trim() || isMappingSku}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-md font-medium whitespace-nowrap transition-colors"
                        >
                            {isMappingSku ? 'Mapping...' : 'Map SKU'}
                        </button>
                    </div>
                    {mapMessage && (
                        <p className={`mt-2 text-xs ${mapMessage.includes('failed') ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                            {mapMessage}
                        </p>
                    )}

                    {/* Stats */}
                    <div className="mt-3 flex items-center justify-between text-sm">
                        <button
                            onClick={toggleSelectAll}
                            className="text-blue-600 dark:text-blue-400 hover:underline"
                        >
                            {filteredRows.length > 0 && filteredRows.every(row => selectedKeys.has(row.key)) ? 'Deselect All' : 'Select All'}
                        </button>
                        <span className="text-gray-600 dark:text-gray-400">
                            {selectedKeys.size} / {filteredRows.length} items · {selectedOrderIds.size} orders
                        </span>
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {filteredRows.map(({ key, record, item, itemIndex }) => (
                        <div
                            key={key}
                            onClick={() => toggleSelect(key)}
                            className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${selectedKeys.has(key)
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                }`}
                        >
                            <div className="flex items-center gap-3">
                                {/* Checkbox */}
                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${selectedKeys.has(key)
                                    ? 'bg-blue-600 border-blue-600'
                                    : 'border-gray-300 dark:border-gray-600'
                                    }`}>
                                    {selectedKeys.has(key) && (
                                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                </div>

                                <div className="w-16 h-16 rounded-md overflow-hidden bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex-shrink-0 flex items-center justify-center">
                                    {item.image ? (
                                        <img
                                            src={item.image}
                                            alt={item.name || 'Order item'}
                                            className="w-full h-full object-cover"
                                            loading="lazy"
                                        />
                                    ) : (
                                        <svg className="w-7 h-7 text-gray-400 dark:text-gray-500" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                            <path d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3M5 5H19V14.5L16 11.5L12 15.5L10 13.5L5 18.5V5Z" />
                                        </svg>
                                    )}
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-semibold text-gray-900 dark:text-white">
                                            #{record.order_id}
                                        </span>
                                        <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-400">
                                            {getAccountLabel(record.account)}
                                        </span>
                                        <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-gray-500 dark:text-gray-400">
                                            Item {itemIndex + 1}
                                        </span>
                                        {(item.sku || record.etsy_fees?.sku) && (
                                            <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 rounded text-blue-700 dark:text-blue-300">
                                                {item.sku || record.etsy_fees?.sku}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                        {item.name || 'No product'}
                                    </p>
                                    {(item.variant || item.personalization) && (
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                                            {[item.variant, item.personalization].filter(Boolean).join(' · ')}
                                        </p>
                                    )}
                                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                                        <span>${item.price ?? record.amount}</span>
                                        <span>Qty {item.quantity || 1}</span>
                                        <span>•</span>
                                        <span>{new Date(record.dt_local).toLocaleDateString('en-US')}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}

                    {filteredRows.length === 0 && (
                        <div className="text-center py-12 text-gray-500">
                            No orders found
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        {selectedKeys.size} items selected · {selectedOrderIds.size} orders
                    </p>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={selectedOrderIds.size === 0}
                            className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-md font-medium flex items-center gap-2"
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3M19 19H5V5H19V19M12 13H7V11H12V13M17 9H7V7H17V9M17 17H7V15H17V17Z" />
                            </svg>
                            <span className="hidden sm:inline">Sync {selectedOrderIds.size} orders</span>
                            <span className="sm:hidden">Sync ({selectedOrderIds.size})</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OrderSelectorModal;
