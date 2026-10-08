import { Record, ProcessedData, KpiData, KpiValue, TableData, Account, OverviewChartData, SummaryChartData, FulfillChartData, TopProduct, SellerRankRow } from '../types';
import { getHighResImageUrl } from './imageUtils';
import { decodeHTMLEntities } from './htmlDecode';
import { makeDesignItemKey } from './designItems';

const ETSY_FALLBACK_FEE_RATE = 0.145;

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

const numericValue = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = typeof value === 'number' ? value : parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : null;
};

const isRefundedOrder = (record: Record): boolean => record.order_status === 'REFUND';
const effectiveOrderAmount = (record: Record): number => isRefundedOrder(record) ? 0 : (record.amount || 0);

const getOrderTotalForFeeEstimate = (record: Record): number => {
    if (isRefundedOrder(record)) return 0;
    return numericValue((record as any).etsy_fees?.orderTotal)
        ?? numericValue(record.details?.financials?.orderTotal)
        ?? numericValue(record.amount)
        ?? 0;
};

const getOrderNetForProfit = (record: Record): number => {
    if (isRefundedOrder(record)) return 0;
    const fees = (record as any).etsy_fees;
    const estActualNet = numericValue(fees?.estActualNet);
    if (estActualNet !== null) return roundMoney(estActualNet);

    const orderTotal = numericValue(fees?.orderTotal) ?? getOrderTotalForFeeEstimate(record);
    const rawNet = numericValue(fees?.orderNet);
    if (rawNet !== null && rawNet > 0) {
        const rawFees = numericValue(fees?.cardFees) ?? 0;
        return rawNet > orderTotal && rawNet + rawFees > 0
            ? roundMoney((orderTotal * rawNet) / (rawNet + rawFees))
            : roundMoney(rawNet);
    }

    if (record.source === 'Etsy_Sales') {
        return roundMoney(getOrderTotalForFeeEstimate(record) * (1 - ETSY_FALLBACK_FEE_RATE));
    }

    return roundMoney(effectiveOrderAmount(record));
};

const formatCurrency = (value: number): string => {
    // Per user request to simplify KPI card display, always use a '$' symbol
    // as the currency code (e.g., AUD) is displayed separately.
    return '$' + new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
};

const formatDate = (dateStr: string, timeZone: string): string => {
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return 'Invalid Date';
        return new Intl.DateTimeFormat('en-CA', { // 'en-CA' gives YYYY-MM-DD
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(date);
    } catch (e) {
        return 'Invalid Date';
    }
};

const formatHour = (dateStr: string, timeZone: string): string => {
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return 'Invalid Hour';
        const hour = new Intl.DateTimeFormat('en-US', {
            timeZone,
            hour: '2-digit',
            hour12: false
        }).format(date);
        // Handle midnight case which might be formatted as "24"
        return `${hour === '24' ? '00' : hour}:00`;
    } catch (e) {
        return 'Invalid Hour';
    }
};

const formatDateTime = (dateStr: string, timeZone: string): string => {
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return 'Invalid Date';
        return new Intl.DateTimeFormat('en-US', {
            timeZone,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
        }).format(date).replace(',', '');
    } catch (e) {
        return 'Invalid Date';
    }
}

// Helper function to convert eBay image URLs to higher resolution
// MOVED TO utils/imageUtils.ts

export const processData = (
    records: Record[],
    previousRecords: Record[] | null,
    accounts: Account[],
    filterDateRange: { from: string, to: string },
    timeZone: string,
    role: string,
    permissions: { [key: string]: boolean },
    manualCosts: any[]
): ProcessedData => {
    const accountLabelMap = new Map(accounts.map(acc => [acc.email, acc.label || acc.email]));

    // --- DEDUPLICATION LOGIC ---
    // Filter out duplicates based on order_id and dt_local
    const uniqueRecordsMap = new Map<string, Record>();
    records.forEach(r => {
        // If it's an order with an ID
        if (r.kind === 'order' && r.order_id) {
            const key = `${r.order_id}_${r.dt_local}`;

            if (!uniqueRecordsMap.has(key)) {
                uniqueRecordsMap.set(key, r);
            } else {
                // Duplicate found. Keep the one with more info (e.g. details) if possible
                const existing = uniqueRecordsMap.get(key)!;
                // Prefer the one with details if the existing one doesn't have them
                if (!existing.details && r.details) {
                    uniqueRecordsMap.set(key, r);
                }
                // If both have details or neither, the first one (existing) stays.
            }
        } else {
            // For non-orders (Funds, Help, Case) or orders without ID (N/A), keep them.
            // Use record ID as key to ensure uniqueness in map, or a random string if ID missing
            uniqueRecordsMap.set(r.id || Math.random().toString(36), r);
        }
    });

    const uniqueRecords = Array.from(uniqueRecordsMap.values());
    // ---------------------------

    const overviewData = calculateOverview(uniqueRecords, filterDateRange, timeZone, role, permissions);
    const orders = getOrderList(uniqueRecords, accountLabelMap, timeZone);
    const ebay = getPlatformRecords(uniqueRecords, 'Ebay_Sales', accountLabelMap, timeZone);
    const etsy = getPlatformRecords(uniqueRecords, 'Etsy_Sales', accountLabelMap, timeZone);
    const cases = getSupportRecords(uniqueRecords, 'case', accountLabelMap, timeZone);
    const help = getSupportRecords(uniqueRecords, 'help', accountLabelMap, timeZone);
    const messages = getSupportRecords(uniqueRecords, 'message', accountLabelMap, timeZone);
    const fulfill = (role === 'owner' || role === 'fulfillment' || permissions.viewFulfill)
        ? getFulfillRecords(uniqueRecords, accountLabelMap, timeZone, manualCosts, filterDateRange)
        : { table: { headers: ['Fulfill'], rows: [["Permission Denied"]] }, merchizeChartData: [], printwayChartData: [] };

    const { kpis: summaryKpis, table: summaryTable, chartData: summaryChartData, topProductsByShop, sellerRanking: summarySellerRanking } = (role === 'owner' || permissions.viewSales)
        ? calculateSummary(uniqueRecords, previousRecords, accountLabelMap, role, permissions, manualCosts, filterDateRange)
        : { kpis: {}, table: { headers: ['Summary'], rows: [["Permission Denied"]] }, chartData: [], topProductsByShop: {}, sellerRanking: [] };

    return {
        overview: overviewData,
        orders,
        ebay,
        etsy,
        cases,
        help,
        messages,
        fulfill,
        summary: { kpis: summaryKpis, table: summaryTable, chartData: summaryChartData, topProductsByShop, sellerRanking: summarySellerRanking },
        products: {
            headers: ['Image', 'Product Name', 'Shop', 'Quantity', 'Revenue'],
            rows: (() => {
                const productStats = new Map<string, { image: any, name: string, shop: string, quantity: number, revenue: number, currency: string }>();

                uniqueRecords.forEach(r => {
                    if (r.kind !== 'order') return;

                    const shopName = accountLabelMap.get(r.account) || r.account;
                    const tax = r.details?.financials?.tax || 0;
                    const netRevenue = isRefundedOrder(r) ? 0 : effectiveOrderAmount(r) - tax; // Revenue minus Tax

                    if (r.details && r.details.items && r.details.items.length > 0) {
                        // Calculate total list value to determine weights
                        const totalListValue = r.details.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

                        r.details.items.forEach(item => {
                            const name = decodeHTMLEntities(item.name.trim()); // Decode HTML entities and ensure no leading/trailing spaces
                            const key = `${name}_${shopName}`;

                            // Calculate weight ensuring no division by zero
                            const weight = totalListValue > 0 ? (item.price * item.quantity) / totalListValue : (1 / r.details!.items.length);
                            const itemRevenue = netRevenue * weight;

                            // Image Logic (High Res) -> Refactored to use util
                            const image = getHighResImageUrl(item.image) || item.image;

                            const current = productStats.get(key) || {
                                image: image,
                                name: name,
                                shop: shopName,
                                quantity: 0,
                                revenue: 0,
                                currency: r.currency || 'USD'
                            };

                            // Update stats
                            // Use first available image if current is missing
                            if (!current.image && image) current.image = image;

                            current.quantity += item.quantity;
                            current.revenue += itemRevenue;

                            productStats.set(key, current);
                        });
                    } else if (r.product_name && r.product_name !== 'N/A') {
                        // Fallback for records without details but with product_name
                        const names = r.product_name.split(',').map(n => n.trim()).filter(n => n);
                        if (names.length > 0) {
                            const itemRevenue = netRevenue / names.length; // Equal split
                            names.forEach(name => {
                                const key = `${name}_${shopName}`;
                                const current = productStats.get(key) || {
                                    image: null,
                                    name: name,
                                    shop: shopName,
                                    quantity: 0,
                                    revenue: 0,
                                    currency: r.currency || 'USD'
                                };
                                current.quantity += 1; // Assume 1
                                current.revenue += itemRevenue;
                                productStats.set(key, current);
                            });
                        }
                    }
                });

                return Array.from(productStats.values())
                    .sort((a, b) => b.revenue - a.revenue)
                    .map(p => [
                        { type: 'image', src: p.image, fullSrc: p.image, alt: p.name },
                        p.name,
                        p.shop,
                        p.quantity,
                        {
                            type: 'value_with_unit',
                            value: p.revenue,
                            display: `${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(p.revenue)} ${p.currency}`
                        }
                    ]);
            })()
        }
    };
};

const calculateOverview = (
    records: Record[],
    filterDateRange: { from: string, to: string },
    timeZone: string,
    role: string,
    permissions: { [key: string]: boolean }
): { table: TableData, chartData: OverviewChartData[] } => {

    const fromDate = new Date(filterDateRange.from);
    const toDate = new Date(filterDateRange.to);
    const diffTime = Math.abs(toDate.getTime() - fromDate.getTime()) + 1000;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const isHourlyViewForChart = diffDays <= 2;
    const getChartGroupingKey = (dateStr: string): string => {
        return isHourlyViewForChart ? formatHour(dateStr, timeZone) : formatDate(dateStr, timeZone);
    };

    const dailyDataForTable: {
        [date: string]: {
            orders: Set<string>,
            revenue: { [currency: string]: number },
            net: { [currency: string]: number },
            funds: { [currency: string]: number },
            cost: { [currency: string]: number },
            refundOrders: Set<string>,
            refund: { [currency: string]: number }
        }
    } = {};

    const groupedDataForChart: {
        [key: string]: {
            orders: Set<string>,
            revenue: { [currency: string]: number },
        }
    } = {};

    const allCurrenciesForTable = { revenue: new Set<string>(), funds: new Set<string>(), cost: new Set<string>() };
    const allCurrenciesForChart = new Set<string>();

    records.forEach(r => {
        const currency = r.currency || 'USD';
        const dailyGroupKey = formatDate(r.dt_local, timeZone);
        if (!dailyDataForTable[dailyGroupKey]) {
            dailyDataForTable[dailyGroupKey] = { orders: new Set(), revenue: {}, funds: {}, cost: {} };
        }
        if (r.kind === 'order' && r.order_id) {
            dailyDataForTable[dailyGroupKey].orders.add(r.order_id);
            const orderAmount = effectiveOrderAmount(r);
            if (orderAmount > 0) {
                dailyDataForTable[dailyGroupKey].revenue[currency] = (dailyDataForTable[dailyGroupKey].revenue[currency] || 0) + orderAmount;
                allCurrenciesForTable.revenue.add(currency);
            }
            if (r.cost_total && r.cost_total > 0 && (role === 'owner' || role === 'fulfillment' || permissions.viewFulfill)) {
                dailyDataForTable[dailyGroupKey].cost['USD'] = (dailyDataForTable[dailyGroupKey].cost['USD'] || 0) + r.cost_total;
                allCurrenciesForTable.cost.add('USD');
            }
        } else if (r.kind === 'Funds' && r.amount > 0 && (role === 'owner' || permissions.viewFunds)) {
            dailyDataForTable[dailyGroupKey].funds[currency] = (dailyDataForTable[dailyGroupKey].funds[currency] || 0) + r.amount;
            allCurrenciesForTable.funds.add(currency);
        }

        const chartGroupKey = getChartGroupingKey(r.dt_local);
        if (!groupedDataForChart[chartGroupKey]) {
            groupedDataForChart[chartGroupKey] = { orders: new Set(), revenue: {} };
        }
        const chartOrderAmount = effectiveOrderAmount(r);
        if (r.kind === 'order' && r.order_id && chartOrderAmount > 0) {
            groupedDataForChart[chartGroupKey].orders.add(r.order_id);
            groupedDataForChart[chartGroupKey].revenue[currency] = (groupedDataForChart[chartGroupKey].revenue[currency] || 0) + chartOrderAmount;
            allCurrenciesForChart.add(currency);
        }
    });

    const sortedRevenueCurrencies = Array.from(allCurrenciesForTable.revenue).sort();
    const sortedFundsCurrencies = Array.from(allCurrenciesForTable.funds).sort();
    const sortedCostCurrencies = Array.from(allCurrenciesForTable.cost).sort();

    const revenueHeaders = sortedRevenueCurrencies.map(c => `Revenue (${c})`);
    const fundsHeaders = (role === 'owner' || permissions.viewFunds) ? sortedFundsCurrencies.map(c => `Funds (${c})`) : [];
    const costHeaders = (role === 'owner' || role === 'fulfillment' || permissions.viewFulfill) ? sortedCostCurrencies.map(c => `Cost (${c})`) : [];

    const headers = [
        "Date",
        "Order Count",
        ...revenueHeaders,
        ...fundsHeaders,
        ...costHeaders,
        "Details"
    ];

    const tableRows = Object.entries(dailyDataForTable)
        .map(([date, data]) => {
            const revenueValues = sortedRevenueCurrencies.map(c => data.revenue[c] || 0);
            const fundsValues = (role === 'owner' || permissions.viewFunds) ? sortedFundsCurrencies.map(c => data.funds[c] || 0) : [];
            const costValues = (role === 'owner' || role === 'fulfillment' || permissions.viewFulfill) ? sortedCostCurrencies.map(c => data.cost[c] || 0) : [];

            return [
                date,
                data.orders.size,
                ...revenueValues,
                ...fundsValues,
                ...costValues,
                { type: 'button' as const, label: 'Click for details', id: date } // Details button - id is the date
            ] as any; // Type assertion to resolve complex type inference
        })
        .sort((a, b) => new Date(b[0] as string).getTime() - new Date(a[0] as string).getTime());

    const sortedChartRevenueCurrencies = Array.from(allCurrenciesForChart).sort();
    const chartData = Object.entries(groupedDataForChart)
        .map(([groupKey, data]) => {
            const revenueData: { [key: string]: number } = {};
            for (const currency of sortedChartRevenueCurrencies) {
                revenueData[`revenue${currency}`] = data.revenue[currency] || 0;
            }
            return {
                date: groupKey,
                orderCount: data.orders.size,
                ...revenueData,
            };
        })
        .sort((a, b) => {
            if (isHourlyViewForChart) {
                return (a.date as string).localeCompare(b.date as string);
            }
            return new Date(a.date as string).getTime() - new Date(b.date as string).getTime();
        });

    return { table: { headers, rows: tableRows }, chartData };
}

const getOrderList = (records: Record[], accountLabelMap: Map<string, string>, timeZone: string): TableData => {
    const headers = ["Order ID", "Image", "Product Name", "Variants", "Revenue", "Currency", "FF Cost", "DS Cost", "Profit", "FF Code", "Status", "Tracking", "Note", "FF Note", "Support", "Account", "DateTime", "Source", "Actions"];
    const orders = records.filter(r => r.kind === 'order');
    const cases = records.filter(r => r.kind === 'case');
    const helps = records.filter(r => r.kind === 'help');
    const messages = records.filter(r => r.kind === 'message');

    const caseMap = new Map(cases.map(c => [c.order_id, c.case_msg || 'Yes']));
    const helpMap = new Map(helps.map(h => [h.order_id, h.help_kind || 'Yes']));
    const msgCountMap = new Map<string, number>();
    messages.forEach(m => {
        if (m.order_id) msgCountMap.set(m.order_id, (msgCountMap.get(m.order_id) || 0) + 1);
    });

    const sortedOrders = [...orders].sort((a, b) => new Date(b.dt_local).getTime() - new Date(a.dt_local).getTime());

    const rows = sortedOrders.map(o => {
        const actions = [];
        if (o.details) {
            actions.push({ type: 'view', label: 'View', id: o.id! });
        }
        actions.push({ type: 'edit', label: 'Edit', id: o.id! });

        // --- New logic to get product name and image ---
        let productName = o.product_name || 'N/A';
        let variants = '-';
        let productImage = null;
        let fullProductImage = null;

        if (o.details && o.details.items && o.details.items.length > 0) {
            const itemNames = o.details.items.map(i => decodeHTMLEntities(i.name)).join(', ');
            if (itemNames) {
                productName = itemNames;
            }
            // Join variants
            const itemVariants = o.details.items.map(i => decodeHTMLEntities(i.variant)).filter(v => v).join('; ');
            if (itemVariants) {
                variants = itemVariants;
            }

            // Get image of the first item
            const rawImage = o.details.items[0].image || null;

            // Convert to high-res for BOTH thumbnail and preview -> instant loading
            productImage = getHighResImageUrl(rawImage);
            fullProductImage = productImage;
        }
        // --- End of new logic ---

        actions.push({ type: 'fulfill', label: 'Fulfill', id: o.id! });
        if (o.email_id) {
            actions.push({ type: 'resync', label: 'Resync', id: o.id! });
        }

        // Map Source
        let displaySource = o.source;
        if (o.source === 'Etsy_Sales') displaySource = 'Etsy';
        else if (o.source === 'Ebay_Sales') displaySource = 'eBay';

        const moneyBase = getOrderNetForProfit(o);
        const ffCost = o.cost_total ?? null;
        const designCost = o.design_cost ?? null;
        const totalCost = (ffCost ?? 0) + (designCost ?? 0);
        const profit = (moneyBase != null && (ffCost != null || designCost != null))
            ? Math.round((moneyBase - totalCost) * 100) / 100
            : null;

        return [
            o.order_id || 'N/A',
            { type: 'image', src: productImage, fullSrc: fullProductImage, alt: productName }, // kept for mobile cards; hidden on Order List desktop
            // Per-item detail shown directly in the row; `name` keeps sort/export/mobile behavior
            {
                type: 'items',
                name: productName,
                id: o.id,
                items: (o.details?.items || []).map((i, itemIndex) => {
                    const itemName = decodeHTMLEntities(i.name);
                    const designItemKey = makeDesignItemKey(o.id, itemIndex);
                    return {
                        name: itemName,
                        variant: decodeHTMLEntities(i.variant || ''),
                        personalization: i.personalization || '',
                        quantity: i.quantity || 1,
                        sku: i.sku || '',
                        image: i.image || null,
                        fullImage: getHighResImageUrl(i.image || null),
                        designProductName: itemName,
                        designRecordId: o.id,
                        designItemKey,
                    };
                }),
            } as any,
            variants, // New cell for variants
            {
                type: 'value_with_unit' as const,
                value: moneyBase,
                display: moneyBase,
            },
            o.currency || 'USD',
            ffCost,
            designCost,
            profit,
            o.ff_code || '-',
            { type: 'status', id: o.id!, value: o.order_status || 'NEW' } as any,
            { type: 'tracking', id: o.id!, value: o.tracking_code || '' } as any,
            { type: 'ordernote', id: o.id!, value: (o.details as any)?.orderNote || '' } as any,
            { type: 'ffnote', id: o.id!, value: o.ff_note || '' } as any,
            {
                type: 'support',
                case: o.order_id && caseMap.has(o.order_id) ? String(caseMap.get(o.order_id)) : 'No',
                help: o.order_id && helpMap.has(o.order_id) ? String(helpMap.get(o.order_id)) : 'No',
                msg: o.order_id && msgCountMap.has(o.order_id) ? String(msgCountMap.get(o.order_id)) : 'No',
            } as any,
            accountLabelMap.get(o.account) || o.account,
            formatDateTime(o.dt_local, timeZone),
            displaySource,
            { type: 'action_group', actions } as any,
            o.dt_local, // Add raw ISO string for filtering, will not be displayed
            o.source, // Add source string for filtering, will not be displayed
        ];
    });

    return { headers, rows };
}

const getPlatformRecords = (records: Record[], source: 'Ebay_Sales' | 'Etsy_Sales', accountLabelMap: Map<string, string>, timeZone: string): TableData => {
    const headers = ["Image", "Product Name", "Order Number", "Revenue", "Currency", "Account", "DateTime", "Actions"];
    const platformRecords = records.filter(r => r.source === source && r.kind === 'order');

    const sortedRecords = [...platformRecords].sort((a, b) => new Date(b.dt_local).getTime() - new Date(a.dt_local).getTime());

    const rows = sortedRecords.map(r => {
        // Create a list of actions for the Action column
        const actions = [];
        if (r.details) {
            actions.push({ type: 'view', label: 'View', id: r.id! });
        }

        // Show Resync if email_id exists
        if (r.email_id) {
            actions.push({ type: 'resync', label: 'Resync', id: r.id! });
        }

        // --- Logic from getOrderList ---
        let productName = r.product_name || 'N/A';
        let productImage = null;
        let fullProductImage = null;

        if (r.details && r.details.items && r.details.items.length > 0) {
            const itemNames = r.details.items.map(i => decodeHTMLEntities(i.name)).join(', ');
            if (itemNames) {
                productName = itemNames;
            }
            const rawImage = r.details.items[0].image || null;

            // Convert to high-res for BOTH thumbnail and preview -> instant loading
            productImage = getHighResImageUrl(rawImage);
            fullProductImage = productImage;
        }
        // --- End of logic ---

        return [
            { type: 'image', src: productImage, fullSrc: fullProductImage, alt: productName },
            productName,
            r.order_id || 'N/A',
            effectiveOrderAmount(r),
            r.currency || 'USD',
            accountLabelMap.get(r.account) || r.account,
            formatDateTime(r.dt_local, timeZone),
            { type: 'action_group', actions } as any
        ];
    });

    return { headers, rows };
}

const getSupportRecords = (records: Record[], kind: 'case' | 'help' | 'message', accountLabelMap: Map<string, string>, timeZone: string): TableData => {
    const headers = kind === 'help'
        ? ["Order Number", "Help Kind", "Source", "Account", "DateTime"]
        : ["Order Number", "Message", "Source", "Account", "DateTime"];

    const supportRecords = records.filter(r => r.kind === kind);
    const sortedRecords = [...supportRecords].sort((a, b) => new Date(b.dt_local).getTime() - new Date(a.dt_local).getTime());

    const rows = sortedRecords.map(r => [
        r.order_id || 'N/A',
        kind === 'help' ? decodeHTMLEntities(r.help_kind || 'N/A') : decodeHTMLEntities(r.case_msg || 'N/A'),
        r.source,
        accountLabelMap.get(r.account) || r.account,
        formatDateTime(r.dt_local, timeZone),
        r.dt_local // Hidden column for sorting
    ]);

    return { headers, rows };
}

const getFulfillRecords = (
    records: Record[],
    accountLabelMap: Map<string, string>,
    timeZone: string,
    manualCosts: any[],
    filterDateRange: { from: string, to: string }
): { table: TableData; merchizeChartData: FulfillChartData[]; printwayChartData: FulfillChartData[] } => {

    const headers = ["Date", "Order Number", "Product Name", "Provider", "Fulfillment Code", "Cost (USD)", "Shop Account"];

    // 1. Xử lý Manual Costs (Chi phí nhập tay)
    const filteredManualCosts = manualCosts.filter(cost =>
        cost.date >= filterDateRange.from && cost.date <= filterDateRange.to
    );

    const manualRows = filteredManualCosts.map(cost => [
        cost.date,
        "N/A (Manual)",
        "N/A (Manual)",
        cost.providerName,
        "owner",
        cost.cost,
        "Manual Entry",
    ]);

    // 2. Xử lý Email Records (Chi phí từ API/Email)
    const fulfillRecords = records.filter(r => r.kind === 'order' && (r.ff_code || r.cost_total || r.product_name));

    const emailRows = fulfillRecords.map(r => {
        const ffCode = r.ff_code || '-';
        let provider = '-';

        if (ffCode.startsWith('PWN')) {
            provider = 'Printway';
        } else if (ffCode !== '-' && ffCode !== 'owner') {
            provider = 'Merchize';
        }

        return [
            formatDate(r.dt_local, timeZone),
            r.order_id || 'N/A',
            r.product_name || '-',
            provider,
            ffCode,
            r.cost_total ?? null,
            accountLabelMap.get(r.account) || r.account,
        ];
    });

    // 3. Calculate Chart Data
    const merchizeProductCounts = new Map<string, number>();
    const printwayProductCounts = new Map<string, number>();

    emailRows.forEach(row => {
        const productNameCell = row[2] as string; // Product Name is at index 2
        const provider = row[3] as string; // Provider is at index 3

        if (productNameCell && productNameCell !== '-' && productNameCell !== 'N/A (Manual)') {
            const products = productNameCell.split(',').map(p => p.trim());
            products.forEach(product => {
                if (product) {
                    if (provider === 'Merchize') {
                        merchizeProductCounts.set(product, (merchizeProductCounts.get(product) || 0) + 1);
                    } else if (provider === 'Printway') {
                        printwayProductCounts.set(product, (printwayProductCounts.get(product) || 0) + 1);
                    }
                }
            });
        }
    });

    const processCounts = (counts: Map<string, number>): FulfillChartData[] => {
        const sorted = Array.from(counts.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
        // Take top 10 and reverse for chart display (highest on top)
        return sorted.slice(0, 10).reverse();
    };

    const merchizeChartData = processCounts(merchizeProductCounts);
    const printwayChartData = processCounts(printwayProductCounts);

    // 4. Kết hợp và Sắp xếp
    emailRows.sort((a, b) => new Date(b[0] as string).getTime() - new Date(a[0] as string).getTime());

    const rows = [...manualRows, ...emailRows];

    return { table: { headers, rows }, merchizeChartData, printwayChartData };
}

const calculateSummary = (
    records: Record[],
    previousRecords: Record[] | null,
    accountLabelMap: Map<string, string>,
    role: string,
    permissions: { [key: string]: boolean },
    manualCosts: any[],
    filterDateRange: { from: string; to: string }
): { kpis: KpiData, table: TableData, chartData: SummaryChartData[], topProductsByShop: { [shopName: string]: TopProduct[] }, sellerRanking: SellerRankRow[] } => {

    const calculatePercentageChange = (current: number, previous: number): { change: number; direction: 'up' | 'down' | 'neutral' } => {
        if (previous === 0) {
            return {
                change: current > 0 ? Infinity : 0,
                direction: current > 0 ? 'up' : 'neutral',
            };
        }
        const change = ((current - previous) / previous) * 100;
        return {
            change: Math.abs(change),
            direction: change > 0 ? 'up' : (change < 0 ? 'down' : 'neutral'),
        };
    };

    type RawKpis = {
        orderIds: Set<string>;
        shops: Set<string>;
        revenueByCurrency: { [c: string]: number };
        fundsByCurrency: { [c: string]: number };
        costByCurrency: { [c: string]: number };
    };

    const getRawKpis = (recordsToProcess: Record[]): RawKpis => {
        const raw: RawKpis = {
            orderIds: new Set(),
            shops: new Set(),
            revenueByCurrency: {},
            fundsByCurrency: {},
            costByCurrency: {},
        };
        recordsToProcess.forEach(r => {
            raw.shops.add(r.account);
            const currency = r.currency || 'USD';
            if (r.kind === 'order') {
                if (r.order_id) raw.orderIds.add(r.order_id);
                const orderAmount = effectiveOrderAmount(r);
                if (orderAmount > 0) {
                    raw.revenueByCurrency[currency] = (raw.revenueByCurrency[currency] || 0) + orderAmount;
                }
                if (r.cost_total && r.cost_total > 0 && (role === 'owner' || role === 'fulfillment' || permissions.viewFulfill)) {
                    raw.costByCurrency['USD'] = (raw.costByCurrency['USD'] || 0) + r.cost_total;
                }
            } else if (r.kind === 'Funds' && r.amount > 0 && (role === 'owner' || permissions.viewFunds)) {
                raw.fundsByCurrency[currency] = (raw.fundsByCurrency[currency] || 0) + r.amount;
            }
        });
        return raw;
    };

    const currentRawKpis = getRawKpis(records);
    const previousRawKpis = previousRecords ? getRawKpis(previousRecords) : null;

    const filteredManualCosts = manualCosts.filter(cost =>
        cost.date >= filterDateRange.from && cost.date <= filterDateRange.to
    );

    if (role === 'owner' || role === 'fulfillment' || permissions.viewFulfill) {
        filteredManualCosts.forEach(cost => {
            const currency = cost.currency || 'USD';
            currentRawKpis.costByCurrency[currency] = (currentRawKpis.costByCurrency[currency] || 0) + cost.cost;
        });
    }

    const kpis: KpiData = {};

    const ordersComparison = previousRawKpis ? calculatePercentageChange(currentRawKpis.orderIds.size, previousRawKpis.orderIds.size) : {};
    kpis['Total Orders'] = {
        value: currentRawKpis.orderIds.size.toString(),
        ...ordersComparison,
    };

    kpis['Shops'] = { value: currentRawKpis.shops.size.toString() };

    const processFinancialKpi = (
        currentData: { [c: string]: number },
        previousData: { [c: string]: number } | null
    ): { [currency: string]: KpiValue } | null => {
        const allCurrencies = new Set([...Object.keys(currentData), ...(previousData ? Object.keys(previousData) : [])]);
        if (allCurrencies.size === 0) return null;

        const financialKpis: { [currency: string]: KpiValue } = {};
        Array.from(allCurrencies).sort().forEach(c => {
            const current = currentData[c] || 0;
            const previous = previousData?.[c] || 0;
            const comparison = previousRawKpis ? calculatePercentageChange(current, previous) : {};
            financialKpis[c] = {
                value: formatCurrency(current),
                ...comparison,
            };
        });
        return financialKpis;
    }

    const revenueKpis = processFinancialKpi(currentRawKpis.revenueByCurrency, previousRawKpis?.revenueByCurrency || null);
    kpis['Revenue'] = revenueKpis || { value: '---' };

    if (role === 'owner' || permissions.viewFunds) {
        const fundsKpis = processFinancialKpi(currentRawKpis.fundsByCurrency, previousRawKpis?.fundsByCurrency || null);
        kpis['Funds'] = fundsKpis || { value: '---' };
    } else {
        kpis['Funds'] = { value: '---' };
    }

    if (role === 'owner' || role === 'fulfillment' || permissions.viewFulfill) {
        const costKpis = processFinancialKpi(currentRawKpis.costByCurrency, previousRawKpis?.costByCurrency || null);
        kpis['Cost'] = costKpis || { value: '---' };
    } else {
        kpis['Cost'] = { value: '---' };
    }

    const shopData: {
        [account: string]: {
            orders: Set<string>,
            revenue: { [currency: string]: number },
            funds: { [currency: string]: number },
            cost: { [currency: string]: number }
        }
    } = {};

    // Initialize shopData for ALL accounts to ensure 0-order shops are listed
    accountLabelMap.forEach((_label, email) => {
        shopData[email] = { revenue: {}, net: {}, orders: new Set(), funds: {}, cost: {}, refundOrders: new Set(), refund: {} };
    });

    const allTableCurrencies = { revenue: new Set<string>(), funds: new Set<string>(), cost: new Set<string>() };

    // --- LOGIC TÍNH TOÁN TOP PRODUCTS ---
    const productStatsByShop: { [key: string]: Map<string, { qty: number, rev: number, image?: string }> } = {};

    records.forEach(r => {
        const shopLabel = accountLabelMap.get(r.account) || r.account;

        if (!shopData[r.account]) {
            shopData[r.account] = { revenue: {}, net: {}, orders: new Set(), funds: {}, cost: {}, refundOrders: new Set(), refund: {} };
        }

        // Init Product Stats Map for Shop
        if (!productStatsByShop[shopLabel]) {
            productStatsByShop[shopLabel] = new Map();
        }

        const currency = r.currency || 'USD';
        if (r.kind === 'order') {
            if (r.order_id) shopData[r.account].orders.add(r.order_id);
            if (isRefundedOrder(r)) {
                const refundKey = r.order_id || r.id || `${r.account}_${r.dt_local}`;
                shopData[r.account].refundOrders.add(refundKey);
                const refundAmount = Math.max(0, Number(r.amount) || 0);
                if (refundAmount > 0) {
                    shopData[r.account].refund[currency] = (shopData[r.account].refund[currency] || 0) + refundAmount;
                }
            }
            const orderAmount = effectiveOrderAmount(r);
            if (orderAmount > 0) {
                shopData[r.account].revenue[currency] = (shopData[r.account].revenue[currency] || 0) + orderAmount;
                allTableCurrencies.revenue.add(currency);
            }
            const orderNet = getOrderNetForProfit(r);
            if (orderNet > 0) {
                shopData[r.account].net[currency] = (shopData[r.account].net[currency] || 0) + orderNet;
            }
            if (r.cost_total && r.cost_total > 0 && (role === 'owner' || role === 'fulfillment' || permissions.viewFulfill)) {
                shopData[r.account].cost['USD'] = (shopData[r.account].cost['USD'] || 0) + r.cost_total;
                allTableCurrencies.cost.add('USD');
            }

            // --- Aggregate Product Stats ---
            // Priority 1: Use parsed item details
            if (r.details && r.details.items && r.details.items.length > 0) {
                r.details.items.forEach(item => {
                    const name = decodeHTMLEntities(item.name.trim());
                    const current = productStatsByShop[shopLabel].get(name) || { qty: 0, rev: 0 };

                    // --- High Res Image Logic --- -> Refactored
                    const image = getHighResImageUrl(item.image || current.image);

                    productStatsByShop[shopLabel].set(name, {
                        qty: current.qty + item.quantity,
                        rev: current.rev + (isRefundedOrder(r) ? 0 : (item.quantity * item.price)),
                        image: image
                    });
                });
            }
            // Priority 2: Use product_name from record (likely from Cost APIs)
            else if (r.product_name && r.product_name !== '-' && r.product_name !== 'N/A') {
                const names = r.product_name.split(',').map(n => n.trim()).filter(n => n);
                names.forEach(name => {
                    const current = productStatsByShop[shopLabel].get(name) || { qty: 0, rev: 0 };
                    // Assume quantity 1 and split amount if multiple names, or just assign amount to each for simplicity approx
                    // For 'Best Selling' by quantity, just incrementing qty is safer
                    productStatsByShop[shopLabel].set(name, {
                        qty: current.qty + 1,
                        rev: current.rev + orderAmount, // Rough estimate
                        image: current.image
                    });
                });
            }
        } else if (r.kind === 'Funds' && r.amount > 0 && (role === 'owner' || permissions.viewFunds)) {
            shopData[r.account].funds[currency] = (shopData[r.account].funds[currency] || 0) + r.amount;
            allTableCurrencies.funds.add(currency);
        }
    });

    const manualCostData: { cost: { [currency: string]: number } } = { cost: {} };
    if ((role === 'owner' || role === 'fulfillment' || permissions.viewFulfill) && filteredManualCosts.length > 0) {
        filteredManualCosts.forEach(cost => {
            const currency = cost.currency || 'USD';
            manualCostData.cost[currency] = (manualCostData.cost[currency] || 0) + cost.cost;
            allTableCurrencies.cost.add(currency);
        });
    }

    const sortedRevenueCurrencies = Array.from(allTableCurrencies.revenue).sort();
    const sortedFundsCurrencies = Array.from(allTableCurrencies.funds).sort();
    // sortedCostCurrencies removed as it was unused

    // --- Consolidated Column Logic ---
    const formatMixedCurrency = (amountMap: { [c: string]: number }): { value: number, display: string } => {
        const currencies = Object.keys(amountMap).sort();
        if (currencies.length === 0) return { value: 0, display: '--' };

        let totalVal = 0;
        const parts = currencies.map(c => {
            const val = amountMap[c];
            totalVal += val;
            return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val) + ' ' + c;
        });

        return { value: totalVal, display: parts.join(' + ') };
    };

    const tableHeaders = ["Shop", "Orders", "Revenue"];
    if (role === 'owner' || permissions.viewFunds) tableHeaders.push("Funds");
    if (role === 'owner' || role === 'fulfillment' || permissions.viewFulfill) tableHeaders.push("Cost (USD)");

    const tableRows = Object.entries(shopData).map(([account, data]) => {
        const revenue = formatMixedCurrency(data.revenue);

        const row = [
            accountLabelMap.get(account) || account,
            data.orders.size,
            { type: 'value_with_unit' as const, value: revenue.value, display: revenue.display }
        ];

        if (role === 'owner' || permissions.viewFunds) {
            const funds = formatMixedCurrency(data.funds);
            row.push({ type: 'value_with_unit' as const, value: funds.value, display: funds.display });
        }

        if (role === 'owner' || role === 'fulfillment' || permissions.viewFulfill) {
            // Cost is default USD per user request, but we handle the map sum for valid display number
            let totalCost = 0;
            Object.values(data.cost).forEach(v => totalCost += v);
            row.push(totalCost);
        }

        return row;
    }).sort((a, b) => (b[1] as number) - (a[1] as number));

    if ((role === 'owner' || role === 'fulfillment' || permissions.viewFulfill) && Object.keys(manualCostData.cost).length > 0) {
        let totalManualCost = 0;
        Object.values(manualCostData.cost).forEach(v => totalManualCost += v);

        const manualRow = [
            "Manual Entry",
            0,
            { type: 'value_with_unit' as const, value: 0, display: '--' } // Revenue
        ];

        if (role === 'owner' || permissions.viewFunds) {
            manualRow.push({ type: 'value_with_unit' as const, value: 0, display: '--' }); // Funds
        }

        // Manual Cost is typically strictly Cost, so we push it if the column exists
        // Since we are inside the 'if (viewFulfill)', the Cost column exists.
        manualRow.push(totalManualCost);

        tableRows.push(manualRow);
    }

    const summaryChartData = Object.entries(shopData).map(([account, data]) => {
        const chartEntry: any = {
            shop: accountLabelMap.get(account) || account,
        };
        // Revenue
        for (const currency of sortedRevenueCurrencies) {
            chartEntry[`revenue${currency}`] = data.revenue[currency] || 0;
        }
        // Funds (Update: Include Funds in Chart Data)
        for (const currency of sortedFundsCurrencies) {
            chartEntry[`funds${currency}`] = data.funds[currency] || 0;
        }
        return chartEntry;
    });

    // --- TRANSFORM PRODUCT STATS TO SORTED ARRAY ---
    const topProductsByShop: { [shopName: string]: TopProduct[] } = {};
    Object.keys(productStatsByShop).forEach(shop => {
        const stats = productStatsByShop[shop];
        const sortedProducts = Array.from(stats.entries())
            .map(([name, stat]) => ({
                name,
                quantity: stat.qty,
                revenue: stat.rev,
                image: stat.image
            }))
            .sort((a, b) => b.quantity - a.quantity) // Sort by Quantity DESC
        // .slice(0, 100); // Increased limit to Top 100
        topProductsByShop[shop] = sortedProducts;
    });

    // --- SELLER RANKING (structured: all Shop Summary fields + total items) ---
    // Total items = sum of item quantities across all of a shop's orders.
    const totalItemsByShop: { [label: string]: number } = {};
    Object.entries(productStatsByShop).forEach(([label, statMap]) => {
        let total = 0;
        statMap.forEach(v => { total += v.qty; });
        totalItemsByShop[label] = total;
    });

    const canFunds = role === 'owner' || permissions.viewFunds;
    const canFulfill = role === 'owner' || permissions.viewFulfill;
    const sellerRanking: SellerRankRow[] = Object.entries(shopData).map(([account, data]) => {
        const seller = accountLabelMap.get(account) || account;
        const revenue = formatMixedCurrency(data.revenue);
        const net = formatMixedCurrency(data.net);
        const funds = formatMixedCurrency(data.funds);
        const refund = formatMixedCurrency(data.refund);
        let totalCost = 0;
        Object.values(data.cost).forEach(v => { totalCost += v; });
        return {
            seller,
            orders: data.orders.size,
            items: totalItemsByShop[seller] || 0,
            revenue: { value: revenue.value, display: revenue.display },
            funds: canFunds ? { value: funds.value, display: funds.display } : undefined,
            cost: canFulfill ? totalCost : undefined,
            profit: canFulfill ? net.value - totalCost : undefined,
            refund: { count: data.refundOrders.size, amount: { value: refund.value, display: refund.display } },
        };
    })
        // Drop completely inactive shops; rank by revenue (highest first).
        .filter(s => s.orders > 0 || s.items > 0 || s.revenue.value > 0)
        .sort((a, b) => b.revenue.value - a.revenue.value);

    return { kpis, table: { headers: tableHeaders, rows: tableRows }, chartData: summaryChartData, topProductsByShop, sellerRanking };
}
