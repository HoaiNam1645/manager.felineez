import { CSSProperties } from 'react';

// Define ListChildComponentProps manually
export interface ListChildComponentProps<T = any> {
    index: number;
    style: CSSProperties;
    data: T;
    isScrolling?: boolean;
}

export interface RowData {
    items: any[][];
    headers: string[];
    loadingItems: Set<string>;
    statusUpdating: Set<string>;
    onViewDayDetails?: (date: string) => void;
    onViewOrderDetails?: (recordId: string) => void;
    onResyncClick: (id: string) => void;
    onStatusChange?: (id: string, status: string) => void;
    onTrackingClick?: (id: string, value: string) => void;
    onOrderNoteClick?: (id: string, value: string) => void;
    onFfNoteClick?: (id: string, value: string) => void;
    onEditClick?: (id: string) => void;
    onFulfillClick?: (id: string) => void;
    onDesignClick?: (productName: string, recordId?: string, designItemKey?: string) => void;
    onImageClick: (src: string) => void;
    onRowHeightChange?: (index: number, height: number) => void;
    isMobile: boolean;
    columnWidths?: { [key: string]: number };
}

export interface DataTableProps {
    headers: string[];
    data: (string | number | null | { type: 'button', label: string, id: string } | { type: 'image', src: string, alt: string, fullSrc?: string } | { type: 'action_group', actions: any[] } | { type: 'value_with_unit', value: number, display: string, unit?: string } | { type: 'status', id: string, value: string } | { type: 'tracking', id: string, value: string } | { type: 'ordernote', id: string, value: string } | { type: 'ffnote', id: string, value: string } | { type: 'support', case: string, help: string, msg: string })[][];
    onViewDayDetails?: (date: string) => void;
    onViewOrderDetails?: (recordId: string) => void;
    onResyncOrder?: (recordId: string) => Promise<void>;
    onChangeOrderStatus?: (recordId: string, status: string) => Promise<void>;
    onSaveTracking?: (recordId: string, tracking: string) => Promise<void>;
    onSaveOrderNote?: (recordId: string, note: string) => Promise<void>;
    onSaveFfNote?: (recordId: string, note: string) => Promise<void>;
    onEditOrder?: (recordId: string) => void;
    onFulfillOrder?: (recordId: string) => void;
    onDesignOrder?: (productName: string, recordId?: string, designItemKey?: string) => void;
    autoHeight?: boolean;
    mobileRowHeight?: number;
    forceCardView?: boolean;
    mobileBreakpoint?: number;
    columnWidths?: { [key: string]: number };
    scrollParentId?: string;
}
