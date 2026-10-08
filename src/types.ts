export interface Account {
  id: string;
  email: string;
  label: string;
  provider: 'gmail' | 'outlook';
  token: string; // For Google: stringified credentials. For MSAL: homeAccountId.
  last_synced_at?: string; // ISO string of the last successful NORMAL sync time
  order?: number; // Field to store the user-defined sort order

  // Trường để quản lý việc quét lịch sử chạy ngầm
  history_synced_until?: string; // Mốc thời gian LÙI mà quá trình quét đã hoàn thành
  historical_sync_complete?: boolean; // Đánh dấu là true khi quá trình quét lịch sử đã hoàn tất
  scan_start_date?: string; // Ngày bắt đầu của lịch sử email, được tìm thấy bởi giai đoạn dò tìm
  lastKnownHistoryId?: string; // ID cuối cùng mà webhook đã xử lý
  platforms?: string[]; // 'etsy', 'ebay'
  linkedByUserId?: string | null; // who connected this mailbox
  linkedByEmail?: string | null;
}

export interface OrderItem {
  name: string;
  variant?: string; // Material & Size, etc.
  personalization?: string;
  quantity: number;
  price: number;
  image?: string;
  transactionId?: string;
  sku?: string;
}

export interface OrderDetails {
  customerName: string;
  customerEmail: string;
  shippingAddress: {
    name: string;
    address1: string;
    address2?: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  items: OrderItem[];
  financials?: {
    itemTotal: number;
    discount: number;
    shipping: number;
    tax: number;
    orderTotal: number;
  };
  detectedCurrency?: string;
  shopName?: string;
  buyerMessage?: string;
}

export interface Record {
  id?: string; // Unique ID for the record, usually from Firestore document ID
  email_id?: string; // The unique ID of the source email message
  dt_local: string;
  amount: number;
  order_id: string | null;
  currency: string | null;
  source: string;
  account: string;
  kind: 'order' | 'Funds' | 'case' | 'help' | 'message';
  case_msg?: string | null;
  help_kind?: string | null;
  cost_total?: number;
  design_cost?: number;
  ff_code?: string;
  order_status?: string; // Fulfillment pipeline: NEW/DESIGNING/READY/PRODUCING/SHIPPED/ON_HOLD/CANCELLED
  tracking_code?: string;
  ff_note?: string;
  product_name?: string;
  details?: OrderDetails; // Added detailed info
  etsy_fees?: EtsyFees; // Imported from the Etsy Sold Orders CSV
}

// Financials imported from the Etsy "Sold Orders" CSV (per order).
export interface EtsyFees {
  orderValue?: number;
  discount?: number;
  shippingDiscount?: number;
  shipping?: number;
  tax?: number;
  orderTotal?: number;
  cardFees?: number;
  orderNet?: number;
  currency?: string;
  sku?: string | null;
  couponCode?: string | null;
  saleDate?: string | null;
  dateShipped?: string | null;
  numberOfItems?: number | null;
  importedAt?: string;
  // Derived at import/backfill time (see api/_lib/etsyNet.ts):
  shopCurrency?: 'VND' | 'USD';
  exchangeRate?: number | null; // VND per USD (VND shops)
  cardFeesUsd?: number;         // processing fee normalized to USD
  orderNetUsd?: number;         // CSV-style net normalized to USD
  estBreakdown?: {
    taxWithheld: number;
    transactionFee: number;
    processingFee: number;
    regulatoryFee: number;
    vat: number;
  };
  estActualNet?: number;        // ≈ Etsy "You earned" for this order
}

export interface CostData {
  order_id: string;
  cost_total: number;
  ff_code: string;
  currency: string;
  product_name?: string;
}

export type Tab = 'Overview' | 'Order List' | 'Products' | 'Support' | 'Fulfill' | 'KPI';
export interface KpiValue {
  value: string;
  change?: number; // e.g., 5.2 for 5.2%
  direction?: 'up' | 'down' | 'neutral';
}

export interface KpiData {
  [key: string]: KpiValue | { [currency: string]: KpiValue };
}

// FIX: Allowed null in TableData rows to support records with missing cost data.
export interface TableData {
  headers: string[];
  rows: (string | number | null | { type: 'button', label: string, id: string } | { type: 'image', src: string | null, fullSrc: string | null, alt: string } | { type: 'value_with_unit', value: number, display: string } | { type: 'action_group', actions: any[] })[][];
}

export interface OverviewChartData {
  date: string; // Can be 'YYYY-MM-DD' or 'HH:00'
  orderCount: number;
  [revenueKey: string]: number | string; // e.g., revenueAUD: 100
}

export interface SummaryChartData {
  shop: string;
  [revenueKey: string]: number | string; // e.g., revenueAUD: 100
}

export interface FulfillChartData {
  name: string;
  count: number;
}

export interface TopProduct {
  name: string;
  quantity: number;
  revenue: number;
  image?: string; // Added image field
}

// One row of the Overview "Seller Ranking" table.
export interface SellerRankRow {
  seller: string;
  orders: number;
  items: number; // total item quantity sold
  revenue: { value: number; display: string };
  funds?: { value: number; display: string }; // only for owner / viewFunds
  cost?: number;                               // only for owner / viewFulfill (USD)
  profit?: number;                             // net minus cost, permission-gated with cost
  refund?: { count: number; amount: { value: number; display: string } };
}

export interface ProcessedData {
  overview: {
    table: TableData;
    chartData: OverviewChartData[];
  };
  orders: TableData;
  ebay: TableData;
  etsy: TableData;
  cases: TableData;
  help: TableData;
  messages: TableData; // Etsy buyer conversation notifications
  fulfill: {
    table: TableData;
    merchizeChartData: FulfillChartData[];
    printwayChartData: FulfillChartData[];
  };
  summary: {
    kpis: KpiData;
    table: TableData;
    chartData: SummaryChartData[];
    topProductsByShop: { [shopName: string]: TopProduct[] };
    sellerRanking: SellerRankRow[];
  };
  products: TableData; // New field for detailed products table
}

export interface ManualCost {
  id: string;
  providerName: string;
  cost: number;
  date: string;
  timeZone?: string;
  currency?: string;
  createdAt?: any; // Firestore Timestamp
}
