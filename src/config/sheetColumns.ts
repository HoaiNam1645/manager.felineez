// File: src/config/sheetColumns.ts
/**
 * Google Sheets Column Configuration
 * Professional English column names for clean, modern sheets
 */

export const GOOGLE_SHEET_COLUMNS = [
    'No.',
    'Shop',
    'Product',
    'Product URL',
    'Mockup',
    'Date & Time',
    'Order ID',
    'Tracking',
    'Customer Info',
    'Revenue',
    'Net',
    'Base Cost',
    'Extra Cost',
    'AI Design',
    'Variant',
    'Requirements',
    'Order Status',
    'Fulfillment',
    'PTS Link',
    'Notes',
    'FF Status'
] as const;

// Type for column names
export type SheetColumn = typeof GOOGLE_SHEET_COLUMNS[number];

// Column indices for programmatic access
export const COL = {
    NO: 0,
    SHOP: 1,
    PRODUCT: 2,
    PRODUCT_URL: 3,
    MOCKUP: 4,
    DATE: 5,
    ORDER_ID: 6,
    TRACKING: 7,
    CUSTOMER: 8,
    REVENUE: 9,
    NET: 10,
    BASE_COST: 11,
    EXTRA_COST: 12,
    AI_DESIGN: 13,
    VARIANT: 14,
    REQUIREMENTS: 15,
    ORDER_STATUS: 16,
    FULFILLMENT: 17,
    PTS_LINK: 18,
    NOTES: 19,
    FF_STATUS: 20
} as const;
