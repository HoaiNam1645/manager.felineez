// Order Subs — full-page overlay (/subs/{provider}) listing the orders that
// live on each factory's side, one screen per factory, with a detail view.
// Lists come straight from the factory APIs (Lemiex: from our linked records,
// their seller API has no list endpoint); details are always fetched live.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDashboard } from '../../contexts/DashboardContext';
import Spinner from '../Spinner';
import {
  SubProvider,
  listFactoryOrders,
  getFactoryOrderDetail,
  extractFactoryList,
} from '../../services/factoryService';

const inputCls = 'w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';
const cardCls = 'bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700';

const PROVIDERS: { key: SubProvider; label: string; prefix: string }[] = [
  { key: 'lemiex', label: 'Lemiex', prefix: 'LMX' },
  { key: 'mango', label: 'MangoTee', prefix: 'MGO' },
  { key: 'vinaway', label: 'Vinaway', prefix: 'VNW' },
  { key: 'monkeyking', label: 'MonkeyKing', prefix: 'MKP' },
  { key: 'dreamship', label: 'Dreamship', prefix: 'DSH' },
  { key: 'hongphat', label: 'HongPhat', prefix: 'HPE' },
  { key: 'hogoto', label: 'Hogoto', prefix: 'HGT' },
];

interface SubRow {
  id: string;        // factory-side id (used for the detail fetch)
  ref: string;       // our order id
  status: string;
  cost: string;
  created: string;
  tracking: string;
  name: string;
}

const s = (v: any): string => (v === null || v === undefined ? '' : String(v));

// Normalize one raw list row per provider into a common table row.
const mapRow = (provider: SubProvider, x: any): SubRow => {
  switch (provider) {
    case 'lemiex':
      return {
        id: s(x.ffCode).replace('LMX-', ''),
        ref: s(x.orderId),
        status: s(x.orderStatus),
        cost: s(x.costTotal ?? ''),
        created: s(x.dtLocal).slice(0, 10),
        tracking: s(x.trackingCode ?? ''),
        name: s(x.productName ?? ''),
      };
    case 'mango':
      return {
        id: s(x.id ?? x.order_fulfill_id ?? x.order_id),
        ref: s(x.order_id),
        status: s(x.status ?? x.fulfill_status),
        cost: s(x.total_cost ?? x.total ?? x.base_cost ?? ''),
        created: s(x.created_at).slice(0, 10),
        tracking: s(x.tracking_id ?? x.tracking_number ?? ''),
        name: s(x.product_name ?? ''),
      };
    case 'vinaway':
      return {
        id: s(x.internal_order_id ?? x.id),
        ref: s(x.external_order_id ?? ''),
        status: s(x.status),
        cost: s(x.amount_total ?? ''),
        created: s(x.created_at ?? '').slice(0, 10),
        tracking: s(x.tracking_number ?? ''),
        name: s(x.customer_name ?? ''),
      };
    case 'monkeyking':
      return {
        id: s(x.increment_id),
        ref: s(x.custom_order_id ?? x.seller_order_id ?? ''),
        status: s(x.status),
        cost: s(x.grand_total ?? ''),
        created: s(x.created_at ?? '').slice(0, 10),
        tracking: s(x.tracking_number ?? ''),
        name: '',
      };
    case 'hogoto':
      // DB-backed list (their API has no order-list endpoint)
      return {
        id: s(x.ffCode).replace('HGT-', ''),
        ref: s(x.orderId),
        status: s(x.orderStatus),
        cost: s(x.costTotal ?? ''),
        created: s(x.dtLocal).slice(0, 10),
        tracking: s(x.trackingCode ?? ''),
        name: s(x.productName ?? ''),
      };
    case 'hongphat':
      return {
        id: s(x.code ?? x.order_code ?? x.hp_order_code ?? x.id),
        ref: s(x.seller_order_code ?? ''),
        status: s(x.status_label ?? x.status ?? ''),
        cost: s(x.grand_total ?? x.total ?? ''),
        created: s(x.created_at ?? '').slice(0, 10),
        tracking: s(x.shipping?.tracking_number ?? x.tracking_number ?? ''),
        name: s(x.items?.[0]?.product ?? ''),
      };
    case 'dreamship':
      return {
        id: s(x.id),
        ref: s(x.reference_id ?? ''),
        status: s(x.status),
        cost: s(x.total_cost ?? ''),
        created: s(x.created_at ?? '').slice(0, 10),
        tracking: s(
          (Array.isArray(x.fulfillments) ? x.fulfillments : [])
            .flatMap((f: any) => (Array.isArray(f?.trackings) ? f.trackings : []))
            .find((t: any) => t?.tracking_number)?.tracking_number ?? ''
        ),
        name: '',
      };
  }
};

// MonkeyKing detail lookups are by our seller_order_id, not their increment_id
const detailIdOf = (provider: SubProvider, row: SubRow) =>
  provider === 'monkeyking' ? (row.ref || row.id) : row.id;

// ---------- Detail modal (auto-rendered from the factory response) ----------

const DetailModal: React.FC<{
  provider: SubProvider;
  row: SubRow;
  onClose: () => void;
}> = ({ provider, row, onClose }) => {
  const [detail, setDetail] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getFactoryOrderDetail(provider, detailIdOf(provider, row))
      .then(resp => {
        // Unwrap provider envelopes: mango {data}, monkeyking {items:[...]},
        // lemiex {data}, vinaway/dreamship = flat.
        let d = resp?.data ?? resp;
        if (provider === 'monkeyking' && Array.isArray(resp?.items)) d = resp.items[0] ?? {};
        if (provider === 'hongphat') d = resp?.order ?? resp?.data ?? resp;
        if (provider === 'hogoto') d = resp?.result ?? resp?.data ?? resp;
        setDetail(d);
      })
      .catch((e: any) => setError(e?.message || 'Failed to load order'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scalars = useMemo(() => {
    if (!detail || typeof detail !== 'object') return [] as [string, string][];
    return Object.entries(detail)
      .filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v))
      .map(([k, v]) => [k, String(v)] as [string, string])
      .filter(([, v]) => v !== '' && v.length <= 200);
  }, [detail]);

  const items = useMemo(() => {
    if (!detail) return [] as any[];
    const arr = detail.items ?? detail.line_items ?? [];
    return Array.isArray(arr) ? arr : [];
  }, [detail]);

  const trackings = useMemo(() => {
    if (!detail) return [] as any[];
    const out: any[] = [];
    (Array.isArray(detail.fulfillments) ? detail.fulfillments : []).forEach((f: any) => {
      (Array.isArray(f?.trackings) ? f.trackings : []).forEach((t: any) => out.push(t));
    });
    if (detail.tracking_id || detail.tracking_number) {
      out.push({ tracking_number: detail.tracking_number ?? detail.tracking_id, tracking_url: detail.tracking_link ?? detail.tracking_url });
    }
    return out;
  }, [detail]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[70] p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col border border-gray-200 dark:border-gray-700"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate">
              {PROVIDERS.find(p => p.key === provider)?.label} — {row.id || row.ref}
            </h3>
            {row.ref && <p className="text-xs text-gray-500 dark:text-gray-400">Order #{row.ref}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">
          {loading && <div className="py-10 text-center"><Spinner size="lg" /></div>}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          {!loading && !error && detail && (
            <>
              {trackings.length > 0 && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md p-3 space-y-1">
                  {trackings.map((t, i) => (
                    <p key={i} className="text-sm text-green-800 dark:text-green-300">
                      {t.carrier ? `${t.carrier}: ` : ''}
                      {t.tracking_url ? (
                        <a href={t.tracking_url} target="_blank" rel="noopener noreferrer" className="font-mono underline">{t.tracking_number}</a>
                      ) : (
                        <span className="font-mono">{t.tracking_number}</span>
                      )}
                    </p>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2">
                {scalars.map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide truncate" title={k}>{k}</p>
                    <p className="text-sm text-gray-900 dark:text-white break-all">{v}</p>
                  </div>
                ))}
              </div>

              {items.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Items</p>
                  <div className="border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
                    <table className="min-w-full text-sm">
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                        {items.map((it: any, i: number) => (
                          <tr key={i}>
                            <td className="px-3 py-2 text-gray-900 dark:text-white">
                              {s(it.product_name ?? it.name ?? it.product?.name ?? it.sku ?? it.item_variant ?? `Item ${i + 1}`)}
                            </td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                              {s(it.color ?? it.variant ?? '')} {s(it.size ?? '')}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300 whitespace-nowrap">
                              ×{s(it.quantity ?? it.qty ?? 1)}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300 whitespace-nowrap">
                              {s(it.price ?? it.item_cost ?? it.row_total ?? '')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------- Page ----------

const OrderSubsPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { role, permissions } = useDashboard();

  const segs = location.pathname.split('/').filter(Boolean);
  const isOpen = segs[0] === 'subs';
  const provider = (PROVIDERS.find(p => p.key === segs[1])?.key || 'lemiex') as SubProvider;

  const canView = role === 'owner' || role === 'leader' || role === 'fulfillment' || permissions.viewFulfill;

  const [rows, setRows] = useState<SubRow[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<SubRow | null>(null);

  const load = useCallback((prov: SubProvider, pg: number) => {
    setLoading(true);
    setError(null);
    listFactoryOrders(prov, pg, 20)
      .then(resp => setRows(extractFactoryList(resp).map((x: any) => mapRow(prov, x))))
      .catch((e: any) => { setRows([]); setError(e?.message || 'Failed to load orders'); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!isOpen || !canView) return;
    setPage(1);
    setSearch('');
    load(provider, 1);
  }, [isOpen, provider, canView, load]);

  if (!isOpen) return null;

  if (!canView) {
    return (
      <div className="h-full bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-8 text-center max-w-sm">
          <p className="text-lg font-semibold text-gray-900 dark:text-white mb-6">No access</p>
          <button onClick={() => navigate('/overview')} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium text-sm">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const q = search.trim().toLowerCase();
  const visible = q
    ? rows.filter(r =>
        r.id.toLowerCase().includes(q) ||
        r.ref.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q) ||
        r.tracking.toLowerCase().includes(q))
    : rows;

  return (
    <div className="h-full bg-gray-50 dark:bg-gray-900">
      {/* Provider switcher */}
      <div className="px-2 md:px-6 pt-3 flex items-center gap-4 overflow-x-auto">
        <div className="inline-flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          {PROVIDERS.map(p => (
            <button
              key={p.key}
              onClick={() => navigate(`/subs/${p.key}`)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${provider === p.key
                ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-300 shadow-sm'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="p-2 md:p-6 space-y-4">
        <div className="flex items-center gap-3">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={`${inputCls} max-w-xs`}
            placeholder="Search id, order, status, tracking"
          />
          <button
            onClick={() => load(provider, page)}
            className="px-3 py-2 text-sm font-medium bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-500 text-gray-700 dark:text-white rounded-md hover:bg-gray-50 dark:hover:bg-gray-600"
          >
            Refresh
          </button>
        </div>

        <div className={`${cardCls} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  {['Factory ID', 'Order', 'Status', 'Cost', 'Tracking', 'Created', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {loading ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">Loading…</td></tr>
                ) : error ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-red-600 dark:text-red-400">{error}</td></tr>
                ) : visible.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">No orders</td></tr>
                ) : (
                  visible.map((r, i) => (
                    <tr key={`${r.id}-${i}`} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer" onClick={() => setSelected(r)}>
                      <td className="px-4 py-3 font-mono text-xs text-gray-900 dark:text-white whitespace-nowrap">{r.id}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.ref ? `#${r.ref}` : ''}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">{r.status}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap tabular-nums">{r.cost}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-300 max-w-[180px] truncate" title={r.tracking}>{r.tracking}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{r.created}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">View</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-700 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <button
              onClick={() => { const p = Math.max(1, page - 1); setPage(p); load(provider, p); }}
              disabled={loading || page <= 1}
              className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-40"
            >
              Prev
            </button>
            <span className="tabular-nums">{page}</span>
            <button
              onClick={() => { const p = page + 1; setPage(p); load(provider, p); }}
              disabled={loading || rows.length < 20}
              className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {selected && (
        <DetailModal provider={provider} row={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
};

export default OrderSubsPage;
