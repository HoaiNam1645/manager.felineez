import React from 'react';
import Spinner from '../Spinner';
import CachedImage from './CachedImage';
import { ffFactoryName } from '../../utils/ffCode';
import OrderStatusSelect from './OrderStatusSelect';
import { ListChildComponentProps, RowData } from './types';
import { HIDDEN_MOBILE_HEADERS } from '../../constants';
import { PaintBrushIcon } from '@heroicons/react/24/outline';

// Helper to check if a header should be hidden on mobile (Only applied in Desktop View now)
const isHiddenOnDesktopMobileView = (header: string) => HIDDEN_MOBILE_HEADERS.includes(header);

const renderActionCell = (cell: any, _cellIndex: number, loadingItems: Set<string>, onResyncClick: (id: string) => void, onViewOrderDetails?: (id: string) => void, onViewDayDetails?: (date: string) => void, rowData?: any[], onFulfillClick?: (id: string) => void, onEditClick?: (id: string) => void, onDesignClick?: (productName: string, recordId?: string, designItemKey?: string) => void, onDeleteClick?: (id: string) => void) => {
    if (cell === 'Click for detail' && onViewDayDetails && rowData) {
        const date = rowData[0] as string;
        return (
            <button
                onClick={() => onViewDayDetails(date)}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 font-medium hover:underline focus:outline-none truncate"
                title={`View details for ${date}`}
            >
                {cell}
            </button>
        );
    }

    // Handle "Action Group"
    if (cell && typeof cell === 'object' && 'type' in cell && cell.type === 'action_group') {
        const actions = cell.actions;
        return actions.map((action: any, i: number) => { // Directly return array of buttons
            if (action.type === 'view') {
                return (
                    <button
                        key={i}
                        onClick={() => onViewOrderDetails && onViewOrderDetails(action.id)}
                        className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 text-xs font-semibold transition-colors"
                    >
                        {action.label}
                    </button>
                );
            }
            if (action.type === 'edit') {
                return (
                    <button
                        key={i}
                        onClick={() => onEditClick && onEditClick(action.id)}
                        className="px-3 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded hover:bg-emerald-200 dark:hover:bg-emerald-900/50 text-xs font-semibold transition-colors"
                    >
                        {action.label}
                    </button>
                );
            }
            if (action.type === 'fulfill') {
                return (
                    <button
                        key={i}
                        onClick={() => onFulfillClick && onFulfillClick(action.id)}
                        className="px-3 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded hover:bg-indigo-200 dark:hover:bg-indigo-900/50 text-xs font-semibold transition-colors"
                    >
                        {action.label}
                    </button>
                );
            }
            if (action.type === 'design') {
                return (
                    <button
                        key={i}
                        onClick={() => onDesignClick && onDesignClick(action.productName || '')}
                        className="px-3 py-1 bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 rounded hover:bg-pink-200 dark:hover:bg-pink-900/50 text-xs font-semibold transition-colors"
                    >
                        {action.label}
                    </button>
                );
            }
            if (action.type === 'resync') {
                const isLoading = loadingItems.has(action.id);
                return (
                    <button
                        key={i}
                        onClick={() => onResyncClick(action.id)}
                        className={`px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-xs font-semibold transition-colors flex items-center gap-1 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="Resync Order"
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <Spinner size="xs" />
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        )}

                    </button>
                );
            }
            if (action.type === 'delete') {
                return (
                    <button
                        key={i}
                        onClick={() => onDeleteClick && onDeleteClick(action.id)}
                        className="px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/50 text-xs font-semibold transition-colors"
                    >
                        {action.label}
                    </button>
                );
            }
            return null;
        });
    }

    // Handle simple button
    if (cell && typeof cell === 'object' && 'type' in cell && cell.type === 'button') {
        return (
            <button
                onClick={() => onViewDayDetails && onViewDayDetails(cell.id)}
                className="text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 font-medium hover:underline focus:outline-none truncate"
                title={`View details for ${cell.id}`}
            >
                {cell.label}
            </button>
        );
    }

    return null;
}

const renderTextContent = (cell: any) => {
    if (cell && typeof cell === 'object' && cell.type === 'value_with_unit') {
        if (cell.value === 0 || cell.display === '--') {
            return <span className="text-gray-300 dark:text-gray-600">--</span>;
        }
        return cell.display;
    }
    return typeof cell === 'number'
        ? (cell === 0
            ? <span className="text-gray-300 dark:text-gray-600">--</span>
            : (Number.isInteger(cell)
                ? cell.toLocaleString('en-US')
                : cell.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
        )
        : (typeof cell === 'string' ? cell : '');
}

const ItemDesignButton = ({ productName, recordId, designItemKey, hasDesign, hasDesignFiles, designFileCount, onDesignClick }: { productName?: string; recordId?: string; designItemKey?: string; hasDesign?: boolean; hasDesignFiles?: boolean; designFileCount?: number; onDesignClick?: (productName: string, recordId?: string, designItemKey?: string) => void }) => {
    if (!productName || !onDesignClick) return null;
    const colorClass = hasDesignFiles
        ? 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-300'
        : hasDesign
            ? 'text-pink-600 hover:bg-pink-50 hover:text-pink-700 dark:text-pink-400 dark:hover:bg-pink-900/30 dark:hover:text-pink-300'
            : 'text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/30 dark:hover:text-blue-300';
    return (
        <button
            type="button"
            onClick={() => onDesignClick(productName, recordId, designItemKey)}
            className={`mt-1 inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium transition-colors ${colorClass}`}
            title={hasDesignFiles ? `Design folder has ${designFileCount || 0} file(s)` : hasDesign ? 'Design folder exists, no files yet' : 'Open design folder'}
        >
            <PaintBrushIcon className="h-3.5 w-3.5" />
            <span>Design</span>
        </button>
    );
};

const DesktopRow = ({ index, style, data }: ListChildComponentProps<RowData>) => {
    const { items, headers, loadingItems, statusUpdating, onViewDayDetails, onViewOrderDetails, onResyncClick, onStatusChange, onTrackingClick, onOrderNoteClick, onFfNoteClick, onEditClick, onFulfillClick, onDesignClick, onDeleteClick, onImageClick, onRowHeightChange, columnWidths } = data;
    const rowRef = React.useRef<HTMLDivElement | null>(null);
    const row = items[index];
    const hasAttentionNote = row.some((cell: any) =>
        cell &&
        typeof cell === 'object' &&
        (cell.type === 'ordernote' || cell.type === 'ffnote') &&
        String(cell.value || '').trim().length > 0
    );
    const rowBgClass = hasAttentionNote
        ? 'bg-red-50 dark:bg-red-950/30'
        : index % 2 === 0
            ? 'bg-white dark:bg-gray-800'
            : 'bg-gray-50 dark:bg-gray-700/50';
    const rowHoverClass = hasAttentionNote
        ? 'hover:bg-red-100 dark:hover:bg-red-900/40'
        : 'hover:bg-blue-50 dark:hover:bg-blue-900/20';

    React.useLayoutEffect(() => {
        const el = rowRef.current;
        if (!el || !onRowHeightChange) return;
        let frame = 0;
        const measure = () => {
            frame = 0;
            const measured = Math.max(el.scrollHeight, el.getBoundingClientRect().height) + 1;
            onRowHeightChange(index, measured);
        };
        const schedule = () => {
            if (frame) cancelAnimationFrame(frame);
            frame = requestAnimationFrame(measure);
        };
        schedule();
        const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
        observer?.observe(el);
        return () => {
            if (frame) cancelAnimationFrame(frame);
            observer?.disconnect();
        };
    }, [index, row, headers, onRowHeightChange]);

    return (
        <div
            ref={rowRef}
            style={{ ...style, willChange: 'transform' }}
            className={`flex items-stretch border-b border-gray-200 dark:border-gray-700 ${rowBgClass} ${rowHoverClass} transition-colors`}
        >
            {headers.map((header, cellIndex) => {
                const cell = row[cellIndex];
                const isHidden = isHiddenOnDesktopMobileView(header);

                const hiddenClass = isHidden ? 'hidden lg:flex' : 'flex';

                let cellClass = `${hiddenClass} text-sm items-start h-full min-h-0 overflow-visible px-3 py-2 `;

                // --- NEW: Column-specific styling ---
                switch (header) {
                    case 'Stt':
                        cellClass += 'flex-none w-16 justify-center';
                        break;
                    case 'Image':
                        cellClass += 'flex-none w-[95px] justify-center'; // 75px + padding
                        break;
                    case 'Product Name':
                        cellClass += 'flex-grow-[3] basis-[420px]';
                        break;
                    case 'Order ID':
                    case 'Order Number':
                        cellClass += 'flex-1 basis-[150px]';
                        break;
                    case 'Revenue':
                    case 'Cost':
                    case 'FF Cost':
                    case 'DS Cost':
                    case 'Profit':
                    case 'Currency':
                        cellClass += 'flex-1 basis-[90px]';
                        break;
                    case 'FF Code':
                        cellClass += 'flex-1 basis-[110px]';
                        break;
                    case 'Message':
                    case 'Help Kind':
                        cellClass += 'flex-[2] basis-[250px]';
                        break;
                    case 'DateTime':
                    case 'Account':
                        cellClass += 'flex-1 basis-[120px]';
                        break;
                    case 'Status':
                        cellClass += 'flex-1 basis-[140px]';
                        break;
                    case 'Tracking':
                        cellClass += 'flex-1 basis-[110px]';
                        break;
                    case 'Support':
                        cellClass += 'flex-1 basis-[130px]';
                        break;
                    case 'Note':
                    case 'FF Note':
                        cellClass += 'flex-1 basis-[150px]';
                        break;
                    case 'Actions':
                        cellClass += 'flex-none w-[315px] gap-1';
                        break;
                    default:
                        cellClass += 'flex-1 basis-[120px]';
                        break;
                }

                // Apply custom width if provided
                const customStyle = columnWidths && columnWidths[header]
                    ? { flexBasis: `${columnWidths[header]}px`, minWidth: `${columnWidths[header]}px` }
                    : undefined;

                // Check if complex object
                if (cell && typeof cell === 'object') {
                    if (cell.type === 'items') {
                        const list = cell.items || [];
                        if (list.length === 0) {
                            return (
                                <div key={cellIndex} className={`${cellClass} text-gray-800 dark:text-gray-200`} style={customStyle} title={cell.name}>
                                    <span className="truncate w-full">{cell.name}</span>
                                </div>
                            );
                        }
                        return (
                            <div key={cellIndex} className={`${cellClass} !items-start`} style={customStyle}>
                                <div className="w-full min-w-0 space-y-1.5 py-0.5">
                                    {list.map((it: any, i: number) => {
                                        const variantLines = String(it.variant || '').split('\n').map((s: string) => s.trim()).filter(Boolean);
                                        const persoLines = String(it.personalization || '').split('\n').map((s: string) => s.trim()).filter(Boolean);
                                        const detailLines = [
                                            ...variantLines,
                                            ...persoLines.map((line: string, li: number) => li === 0 ? `Personalization: ${line}` : line),
                                        ];
                                        return (
                                            <div key={i} className="flex gap-2 min-w-0">
                                                {it.image ? (
                                                    <CachedImage
                                                        src={it.image}
                                                        alt={it.name}
                                                        onClick={() => it.fullImage && onImageClick(it.fullImage)}
                                                        className="w-10 h-10 flex-none object-cover rounded-md border border-gray-200 dark:border-gray-600 cursor-pointer"
                                                    />
                                                ) : (
                                                    <div className="w-10 h-10 flex-none bg-gray-100 dark:bg-gray-700 rounded-md" />
                                                )}
                                                <div className="min-w-0 flex-1">
                                                    <p
                                                        className={`text-[13px] leading-5 font-medium text-blue-600 dark:text-blue-400 whitespace-normal break-words ${cell.id && onViewOrderDetails ? 'cursor-pointer hover:underline' : ''}`}
                                                        title={it.name}
                                                        onClick={() => cell.id && onViewOrderDetails && onViewOrderDetails(cell.id)}
                                                    >
                                                        {it.name}
                                                    </p>
                                                    <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5">
                                                        <span className={Number(it.quantity || 0) > 1
                                                            ? 'inline-flex rounded bg-red-100 dark:bg-red-900/40 px-1.5 py-0.5 text-[11px] font-extrabold leading-4 text-red-700 dark:text-red-300'
                                                            : 'inline-flex rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-[11px] font-semibold leading-4 text-gray-600 dark:text-gray-300'}
                                                        >
                                                            x{it.quantity || 1}
                                                        </span>
                                                        {it.sku && (
                                                            <span className="inline-flex max-w-full rounded bg-pink-50 dark:bg-pink-900/25 px-1.5 py-0.5 text-[11px] font-semibold leading-4 text-pink-700 dark:text-pink-300" title={String(it.sku)}>
                                                                SKU: <span className="ml-1 truncate">{it.sku}</span>
                                                            </span>
                                                        )}
                                                        <ItemDesignButton productName={it.designProductName || it.name} recordId={it.designRecordId || cell.id} designItemKey={it.designItemKey} hasDesign={it.hasDesign} hasDesignFiles={it.hasDesignFiles} designFileCount={it.designFileCount} onDesignClick={onDesignClick} />
                                                    </div>
                                                    {detailLines.map((line: string, li: number) => (
                                                        <p key={li} className={`text-xs leading-4 whitespace-normal break-words ${line.startsWith('Personalization:') ? 'font-medium text-amber-700 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'}`} title={[...variantLines, ...persoLines].join('\n')}>
                                                            {line}
                                                        </p>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    }
                    if (cell.type === 'image') {
                        return (
                            <div key={cellIndex} className={cellClass} style={customStyle}>
                                {cell.src ? (
                                    <CachedImage src={cell.src} alt={cell.alt} onClick={() => cell.fullSrc && onImageClick(cell.fullSrc)} className="w-[75px] h-[75px] object-cover rounded-md border border-gray-200 dark:border-gray-600 cursor-pointer hover:scale-105 transition-transform" />
                                ) : (
                                    <div className="w-[75px] h-[75px] bg-gray-200 dark:bg-gray-700 rounded-md flex items-center justify-center text-xs text-gray-400 dark:text-gray-500 text-center p-1">No Image</div>
                                )}
                            </div>
                        )
                    }
                    if (cell.type === 'order_meta') {
                        return (
                            <div key={cellIndex} className={`${cellClass} !items-start text-gray-800 dark:text-gray-200`} style={customStyle}>
                                <div className="min-w-0 py-1">
                                    <button
                                        type="button"
                                        onClick={() => cell.id && onViewOrderDetails && onViewOrderDetails(cell.id)}
                                        className="block max-w-full truncate text-left font-semibold text-blue-600 hover:underline dark:text-blue-400"
                                        title={String(cell.orderId || '')}
                                    >
                                        {cell.orderId || 'N/A'}
                                    </button>
                                    <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400" title={String(cell.account || '')}>{cell.account || '-'}</p>
                                    <p className="mt-0.5 truncate text-xs text-gray-400 dark:text-gray-500" title={String(cell.dateTime || '')}>{cell.dateTime || '-'}</p>
                                    {cell.source && <p className="mt-0.5 text-xs font-medium text-gray-400 dark:text-gray-500">{cell.source}</p>}
                                </div>
                            </div>
                        )
                    }
                    if (cell.type === 'tracking') {
                        return (
                            <div key={cellIndex} className={cellClass} style={customStyle}>
                                <button
                                    onClick={() => onTrackingClick && onTrackingClick(cell.id, cell.value)}
                                    className={cell.value
                                        ? 'text-blue-600 dark:text-blue-400 hover:underline text-xs font-medium truncate max-w-full'
                                        : 'px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-xs font-semibold transition-colors'}
                                    title={cell.value || 'Add tracking'}
                                >
                                    {cell.value || 'Add'}
                                </button>
                            </div>
                        )
                    }
                    if (cell.type === 'ordernote' || cell.type === 'ffnote') {
                        const onNoteClick = cell.type === 'ordernote' ? onOrderNoteClick : onFfNoteClick;
                        return (
                            <div key={cellIndex} className={cellClass} style={customStyle}>
                                <button
                                    onClick={() => onNoteClick && onNoteClick(cell.id, cell.value)}
                                    className={cell.value
                                        ? 'text-left text-xs leading-4 px-2 py-1 rounded bg-red-50 dark:bg-red-900/25 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40 line-clamp-3 max-w-full font-semibold transition-colors'
                                        : 'px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-xs font-semibold transition-colors'}
                                    title={cell.value || 'Add note'}
                                >
                                    {cell.value || 'Add'}
                                </button>
                            </div>
                        )
                    }
                    if (cell.type === 'support') {
                        return (
                            <div key={cellIndex} className={cellClass} style={customStyle}>
                                <div className="text-[11px] leading-4 text-gray-600 dark:text-gray-300 space-y-0.5 min-w-0">
                                    <p className="truncate" title={cell.case}>Case: <span className={cell.case !== 'No' ? 'font-semibold text-red-600 dark:text-red-400' : ''}>{cell.case}</span></p>
                                    <p className="truncate" title={cell.help}>Help: <span className={cell.help !== 'No' ? 'font-semibold text-orange-600 dark:text-orange-400' : ''}>{cell.help}</span></p>
                                    <p className="truncate" title={cell.msg}>Msg: <span className={cell.msg !== 'No' ? 'font-semibold text-blue-600 dark:text-blue-400' : ''}>{cell.msg}</span></p>
                                </div>
                            </div>
                        )
                    }
                    if (cell.type === 'status') {
                        return (
                            <div key={cellIndex} className={cellClass} style={customStyle}>
                                <OrderStatusSelect
                                    id={cell.id}
                                    value={cell.value}
                                    disabled={statusUpdating?.has(cell.id)}
                                    onChange={onStatusChange}
                                />
                            </div>
                        )
                    }
                    if (cell.type === 'button' || cell.type === 'action_group') {
                        return (
                            <div key={cellIndex} className={cellClass} style={customStyle}>
                                {renderActionCell(cell, cellIndex, loadingItems, onResyncClick, onViewOrderDetails, onViewDayDetails, row, onFulfillClick, onEditClick, onDesignClick, onDeleteClick)}
                            </div>
                        )
                    }
                }

                // Factory fulfill cost: '-' until the cost-cron (or a webhook) fills it
                if ((header === 'Cost' || header === 'FF Cost' || header === 'DS Cost' || header === 'Profit') && (cell === null || cell === undefined || cell === '')) {
                    return (
                        <div key={cellIndex} className={cellClass} style={customStyle}>
                            <span className="truncate w-full text-gray-400 dark:text-gray-500">-</span>
                        </div>
                    );
                }

                // FF Code shows the factory name; the raw code stays in the tooltip/export
                if (header === 'FF Code' && typeof cell === 'string') {
                    return (
                        <div key={cellIndex} className={`${cellClass} text-gray-800 dark:text-gray-200`} style={customStyle}>
                            <span className="truncate w-full" title={cell !== '-' ? cell : undefined}>
                                {ffFactoryName(cell)}
                            </span>
                        </div>
                    );
                }

                if (cell === 'Click for detail') {
                    return (
                        <div key={cellIndex} className={cellClass} style={customStyle}>
                            {renderActionCell(cell, cellIndex, loadingItems, onResyncClick, onViewOrderDetails, onViewDayDetails, row, onFulfillClick, onEditClick, onDesignClick, onDeleteClick)}
                        </div>
                    )
                }

                return (
                    <div
                        key={cellIndex}
                        className={`${cellClass} text-gray-800 dark:text-gray-200`}
                        title={(header === 'Product Name' || header === 'Message' || header === 'Message / Type') && typeof cell === 'string' ? cell : undefined}
                        style={customStyle}
                    >
                        <span className="truncate w-full">
                            {renderTextContent(cell)}
                        </span>
                    </div>
                );
            })}
        </div>
    );
};

export default React.memo(DesktopRow);
