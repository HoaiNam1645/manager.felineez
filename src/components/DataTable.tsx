import React, { useState, useMemo, useLayoutEffect } from 'react';
import { compareValues, SortDirection } from '../utils/sortUtils';
import { VariableSizeList as List } from 'react-window';
import { HIDDEN_MOBILE_HEADERS } from '../constants';
import EmptyState from './EmptyState';
import DesktopRow from './datatable/DesktopRow';
import MobileCard from './datatable/MobileCard';
import { RowData, DataTableProps } from './datatable/types';
import ImagePreviewModal from './ImagePreviewModal';
import TrackingModal from './TrackingModal';
import NoteModal from './NoteModal';

// Helper to check if a header should be hidden on mobile (Only applied in Desktop View now)
const isHiddenOnDesktopMobileView = (header: string) => HIDDEN_MOBILE_HEADERS.includes(header);

// Custom outer element to allow document scroll
const WindowScrollerOuter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>((props, ref) => {
    const { style, ...rest } = props;
    return (
        <div
            ref={ref}
            style={{
                ...style,
                position: 'relative',
                width: '100%',
                height: 'auto',
                overflow: 'visible'
            }}
            {...rest}
        />
    );
});

// Custom hook to track container size
const useContainerSize = (ref: React.RefObject<HTMLDivElement>) => {
    const [size, setSize] = useState({ width: 0, height: 0 });

    useLayoutEffect(() => {
        if (!ref.current) return;

        const updateSize = () => {
            if (ref.current) {
                const { width, height } = ref.current.getBoundingClientRect();
                setSize({ width, height });
            }
        };

        // Initial measurement
        updateSize();

        // Use ResizeObserver for efficient tracking
        const resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(ref.current);

        // Fallback for older browsers
        window.addEventListener('resize', updateSize);

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('resize', updateSize);
        };
    }, [ref]);

    return size;
};

// SortDirection type imported from utils now

const DataTable: React.FC<DataTableProps> = ({ headers, data, onViewDayDetails, onViewOrderDetails, onResyncOrder, onChangeOrderStatus, onSaveTracking, onSaveOrderNote, onSaveFfNote, onEditOrder, onFulfillOrder, onDesignOrder, autoHeight = false, mobileRowHeight, forceCardView = false, mobileBreakpoint = 768, columnWidths, scrollParentId }) => {
    const [sortColumn, setSortColumn] = useState<number | null>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>(null);
    const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set());
    const [statusUpdating, setStatusUpdating] = useState<Set<string>>(new Set());
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [trackingEdit, setTrackingEdit] = useState<{ id: string, value: string } | null>(null);
    const [orderNoteEdit, setOrderNoteEdit] = useState<{ id: string, value: string } | null>(null);
    const [ffNoteEdit, setFfNoteEdit] = useState<{ id: string, value: string } | null>(null);

    // Config for window scrolling
    const useWindowScroll = autoHeight;
    const listRef = React.useRef<List>(null);
    const listOuterRef = React.useRef<HTMLDivElement | null>(null);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const headerRef = React.useRef<HTMLDivElement>(null);
    const measuredHeightsRef = React.useRef<{ [index: number]: number }>({});

    // Use custom size tracker instead of AutoSizer
    const { width, height } = useContainerSize(containerRef);
    const isMobile = width < mobileBreakpoint || forceCardView;

    React.useEffect(() => {
        const el = listOuterRef.current;
        if (!el || !scrollParentId) return;
        el.setAttribute('data-products-return-scroll', scrollParentId);
        return () => {
            if (el.getAttribute('data-products-return-scroll') === scrollParentId) {
                el.removeAttribute('data-products-return-scroll');
            }
        };
    }, [scrollParentId, width, height, isMobile]);

    // Store table offset in a ref to avoid re-binding scroll listeners
    const tableOffsetRef = React.useRef<number>(0);

    const handleSort = (columnIndex: number) => {
        // Disable sorting for image column
        if (headers[columnIndex] === 'Image') {
            setSortColumn(null);
            setSortDirection(null);
            return;
        }
        if (sortColumn === columnIndex) {
            setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortColumn(columnIndex);
            setSortDirection('asc');
        }
    };

    const handleResyncClick = async (id: string) => {
        if (!onResyncOrder) return;
        setLoadingItems(prev => new Set(prev).add(id));
        try {
            await onResyncOrder(id);
        } finally {
            setLoadingItems(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    };

    const handleStatusChange = async (id: string, status: string) => {
        if (!onChangeOrderStatus) return;
        setStatusUpdating(prev => new Set(prev).add(id));
        try {
            await onChangeOrderStatus(id, status);
        } finally {
            setStatusUpdating(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    };

    const sortedData = useMemo(() => {
        if (sortColumn === null || sortDirection === null) {
            return data;
        }

        return [...data].sort((a, b) => {
            const valA = a[sortColumn];
            const valB = b[sortColumn];
            return compareValues(valA, valB, sortDirection);
        });
    }, [data, sortColumn, sortDirection]);

    // Row heights vary with the items cell — recompute cached sizes whenever
    // the data set, viewport, or card mode changes.
    React.useEffect(() => {
        measuredHeightsRef.current = {};
        (listRef.current as any)?.resetAfterIndex?.(0, true);
    }, [sortedData, width, mobileRowHeight, forceCardView]);

    const handleRowHeightChange = React.useCallback((index: number, height: number) => {
        if (height <= 0) return;
        const nextHeight = Math.ceil(height);
        const current = measuredHeightsRef.current[index];
        if (current && Math.abs(current - nextHeight) < 3) return;
        measuredHeightsRef.current[index] = nextHeight;
        (listRef.current as any)?.resetAfterIndex?.(index, true);
    }, []);

    // Measure table absolute position once (and on resize) - Simpler version just for tooltip/modal pos if needed
    React.useLayoutEffect(() => {
        if (!useWindowScroll || !containerRef.current) return;
        const measureOffset = () => {
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect) tableOffsetRef.current = window.scrollY + rect.top;
        };
        measureOffset();
        window.addEventListener('resize', measureOffset);
        return () => window.removeEventListener('resize', measureOffset);
    }, [useWindowScroll]);

    if (data.length === 0) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <EmptyState
                    variant="no-data"
                />
            </div>
        );
    }

    // Determine root container classes
    const rootClasses = `flex flex-col ${autoHeight ? '' : 'h-full'} bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 ${autoHeight ? '' : 'overflow-hidden'}`;

    // Render Skeleton if dimensions are not yet available
    if (!width || (!autoHeight && !height)) {
        return (
            <div className={rootClasses} ref={containerRef}>
                <div style={{ width: '100%', height: autoHeight ? 400 : '100%' }} className="p-4">
                    <div className="animate-pulse space-y-4">
                        <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
                        {[...Array(10)].map((_, i) => (
                            <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded w-full"></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    const itemSize = isMobile ? (mobileRowHeight || 250) : 92;
    const RowComponent = isMobile ? MobileCard : DesktopRow;

    // Desktop rows grow with the items cell, but keep rows compact so large
    // date ranges stay readable and fast.
    const getItemSize = (index: number): number => {
        if (isMobile) return itemSize;
        const measured = measuredHeightsRef.current[index];
        if (measured) return measured;
        const row = sortedData[index] as any[] | undefined;
        const itemsCell = Array.isArray(row)
            ? row.find((c: any) => c && typeof c === 'object' && c.type === 'items')
            : undefined;
        const list = itemsCell?.items;
        if (!list || list.length === 0) return 92;
        let h = 16;
        for (const it of list) {
            const nVar = String(it.variant || '').split('\n').filter((l: string) => l.trim()).length;
            const nPerso = String(it.personalization || '').split('\n').filter((l: string) => l.trim()).length;
            const hasSku = !!String(it.sku || '').trim();
            const metaWrapAllowance = hasSku ? 8 : 0;
            const detailLines = nVar + nPerso;
            const nameWrapAllowance = String(it.name || '').length > 70 ? 22 : 0;
            h += Math.max(96, 60 + detailLines * 18 + metaWrapAllowance + nameWrapAllowance);
        }
        h += Math.max(0, list.length - 1) * 12;
        return Math.max(104, h);
    };

    // Calculate height for List
    let listHeight = 0;
    if (autoHeight) {
        listHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
    } else {
        listHeight = isMobile ? height : height - 48; // Subtract header height on desktop
    }

    // Desktop: give each column a sane minimum so wide tables scroll
    // horizontally instead of crushing the cells.
    const MIN_COL_WIDTH: { [h: string]: number } = {
        'Stt': 64, 'Image': 95, 'Product Name': 420, 'Order ID': 150, 'Order Number': 150,
        'Revenue': 90, 'Cost': 90, 'FF Cost': 90, 'DS Cost': 90, 'Profit': 90, 'Currency': 90,
        'Message': 250, 'Help Kind': 250,
        'FF Code': 110, 'Status': 140, 'Tracking': 110, 'Note': 150, 'FF Note': 150, 'Support': 130,
        'Actions': 270, 'DateTime': 115, 'Account': 120,
    };
    const estimatedMinWidth = headers.reduce(
        (sum, h) => sum + (columnWidths?.[h] ?? MIN_COL_WIDTH[h] ?? 120),
        0
    );
    const tableWidth = isMobile ? width : Math.max(width, estimatedMinWidth);

    // Create item data object to pass to FixedSizeList
    const itemData: RowData = {
        items: sortedData,
        headers,
        loadingItems,
        statusUpdating,
        onViewDayDetails,
        onViewOrderDetails,
        onResyncClick: handleResyncClick,
        onStatusChange: handleStatusChange,
        onTrackingClick: (id: string, value: string) => setTrackingEdit({ id, value }),
        onOrderNoteClick: (id: string, value: string) => setOrderNoteEdit({ id, value }),
        onFfNoteClick: (id: string, value: string) => setFfNoteEdit({ id, value }),
        onEditClick: onEditOrder,
        onFulfillClick: onFulfillOrder,
        onDesignClick: onDesignOrder,
        onImageClick: setPreviewImage,
        onRowHeightChange: handleRowHeightChange,
        isMobile,
        columnWidths
    };

    return (
        <div className={rootClasses} ref={containerRef}>
          <div className={isMobile ? '' : 'overflow-x-auto h-full flex flex-col'}>
            {/* Desktop Header - Sticky if Window Scroll */}
            {!isMobile && (
                <div
                    ref={headerRef}
                    className={`flex items-center bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 font-semibold text-xs text-gray-500 dark:text-gray-300 uppercase tracking-wider h-12 flex-shrink-0 z-20 ${useWindowScroll ? 'sticky top-0 shadow-sm' : ''}`}
                    style={{ width: tableWidth }}
                >
                    {headers.map((header, index) => {
                        const isHidden = isHiddenOnDesktopMobileView(header);
                        const canSort = header !== 'Stt' && header !== 'Image' && header !== 'Actions' && header !== 'Status' && header !== 'Tracking' && header !== 'Note' && header !== 'FF Note' && header !== 'Support';
                        let headerCellClass = `${isHidden ? 'hidden lg:flex' : 'flex'} items-center h-full min-w-0 overflow-hidden px-3 py-2 ${canSort ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600' : ''} transition-colors `;

                        switch (header) {
                            case 'Stt':
                                headerCellClass += 'flex-none w-16 justify-center';
                                break;
                            case 'Image':
                                headerCellClass += 'flex-none w-[95px] justify-center';
                                break;
                            case 'Product Name':
                                headerCellClass += 'flex-grow-[3] basis-[420px]';
                                break;
                            case 'Order ID':
                            case 'Order Number':
                                headerCellClass += 'flex-1 basis-[150px]';
                                break;
                            case 'Revenue':
                            case 'Cost':
                            case 'FF Cost':
                            case 'DS Cost':
                            case 'Profit':
                            case 'Currency':
                                headerCellClass += 'flex-1 basis-[90px]';
                                break;
                            case 'FF Code':
                                headerCellClass += 'flex-1 basis-[110px]';
                                break;
                            case 'Message':
                            case 'Help Kind':
                                headerCellClass += 'flex-[2] basis-[250px]';
                                break;
                            case 'DateTime':
                            case 'Account':
                                headerCellClass += 'flex-1 basis-[120px]';
                                break;
                            case 'Status':
                                headerCellClass += 'flex-1 basis-[140px]';
                                break;
                            case 'Tracking':
                                headerCellClass += 'flex-1 basis-[110px]';
                                break;
                            case 'Support':
                                headerCellClass += 'flex-1 basis-[130px]';
                                break;
                            case 'Note':
                            case 'FF Note':
                                headerCellClass += 'flex-1 basis-[150px]';
                                break;
                            case 'Actions':
                                headerCellClass += 'flex-none w-[270px]';
                                break;
                            default:
                                headerCellClass += 'flex-1 basis-[120px]';
                                break;
                        }

                        // Apply custom width if provided
                        const customHeaderStyle = columnWidths && columnWidths[header]
                            ? { flexBasis: `${columnWidths[header]}px`, minWidth: `${columnWidths[header]}px`, width: `${columnWidths[header]}px` }
                            : { width: undefined }; // Need to reset width if used in style tag previously

                        return (
                            <div
                                key={header}
                                className={headerCellClass}
                                onClick={() => canSort && handleSort(index)}
                                style={customHeaderStyle}
                            >
                                <div className="flex items-center whitespace-nowrap">
                                    {header}
                                    {sortColumn === index && (
                                        <span className="ml-2">
                                            {sortDirection === 'asc' ? '▲' : '▼'}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Virtualized Body */}
            <div style={{ height: useWindowScroll ? 'auto' : listHeight, width: tableWidth }}>
                <List
                    ref={listRef}
                    outerRef={listOuterRef}
                    height={listHeight}
                    itemCount={sortedData.length}
                    itemSize={getItemSize}
                    estimatedItemSize={itemSize}
                    width={tableWidth}
                    itemData={itemData}
                    overscanCount={12}
                    className="scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600"
                    style={useWindowScroll ? { overflow: 'visible' } : undefined} // Override to visible for Window Scroll
                    outerElementType={useWindowScroll ? WindowScrollerOuter : undefined} // Use custom outer for Window Scroll
                >
                    {RowComponent}
                </List>
            </div>
          </div>
            <ImagePreviewModal
                imageUrl={previewImage}
                onClose={() => setPreviewImage(null)}
            />
            {trackingEdit && onSaveTracking && (
                <TrackingModal
                    recordId={trackingEdit.id}
                    initialValue={trackingEdit.value}
                    onClose={() => setTrackingEdit(null)}
                    onSave={onSaveTracking}
                />
            )}
            {ffNoteEdit && onSaveFfNote && (
                <NoteModal
                    recordId={ffNoteEdit.id}
                    initialValue={ffNoteEdit.value}
                    onClose={() => setFfNoteEdit(null)}
                    onSave={onSaveFfNote}
                />
            )}
            {orderNoteEdit && onSaveOrderNote && (
                <NoteModal
                    recordId={orderNoteEdit.id}
                    initialValue={orderNoteEdit.value}
                    onClose={() => setOrderNoteEdit(null)}
                    onSave={onSaveOrderNote}
                    title="Order Note"
                    placeholder="Note for this order"
                />
            )}
        </div >
    );
};

export default DataTable;
