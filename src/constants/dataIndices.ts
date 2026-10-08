/**
 * Constants for Data Table Column Indices
 * Needed because some data is hidden in the row array for filtering purposes.
 */

// Indices for Order List Table Row
export const ORDER_LIST_INDICES = {
    DT_LOCAL_RAW: 19, // Hidden column for date filtering
    SOURCE: 20,       // Hidden column for source filtering
} as const;
