// Fulfillment pipeline statuses stored in Record.orderStatus.
export const ORDER_STATUSES = [
    'NEW',
    'DESIGNING',
    'READY',
    'PRODUCING',
    'SHIPPED',
    'ON_HOLD',
    'CANCELLED',
    'REFUND',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: { [key: string]: string } = {
    NEW: 'New',
    DESIGNING: 'Designing',
    READY: 'Ready',
    PRODUCING: 'Producing',
    SHIPPED: 'Shipped',
    ON_HOLD: 'On hold',
    CANCELLED: 'Cancelled',
    REFUND: 'Refund',
};

export const ORDER_STATUS_CLASSES: { [key: string]: string } = {
    NEW: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    DESIGNING: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    READY: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
    PRODUCING: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    SHIPPED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    ON_HOLD: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    REFUND: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
};
