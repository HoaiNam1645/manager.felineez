import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDashboard } from '../../contexts/DashboardContext';
import { ORDER_STATUS_LABELS, ORDER_STATUS_CLASSES } from '../../constants/orderStatus';
import { Record } from '../../types';
import LemiexPanel from '../lemiex/LemiexPanel';

type FulfillSection = 'overview' | 'lemiex';
type GroupBy = 'factory' | 'account';

const FACTORIES: { key: string; label: string; prefix: string }[] = [
    { key: 'lemiex', label: 'Lemiex', prefix: 'LMX-' },
    { key: 'mango', label: 'MangoTee', prefix: 'MGO-' },
    { key: 'vinaway', label: 'Vinaway', prefix: 'VNW-' },
    { key: 'monkeyking', label: 'MonkeyKing', prefix: 'MKP-' },
    { key: 'dreamship', label: 'Dreamship', prefix: 'DSH-' },
    { key: 'hongphat', label: 'HongPhat', prefix: 'HPE-' },
    { key: 'hogoto', label: 'Hogoto', prefix: 'HGT-' },
];
const BY_PREFIX = new Map(FACTORIES.map(f => [f.prefix.slice(0, 3), f]));

const factoryOf = (ffCode?: string) => {
    const m = /^([A-Z]{3})-/.exec(ffCode || '');
    return m ? BY_PREFIX.get(m[1]) || null : null;
};

const hasFfCode = (ffCode?: string) => !!String(ffCode || '').trim();
const normalizeManualFfCode = (ffCode?: string) => String(ffCode || '').trim().replace(/\s+/g, ' ') || 'Manual';
const orderRevenue = (record: Record) => record.order_status === 'REFUND' ? 0 : (Number(record.amount) || 0);

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const cardCls = 'bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700';
const selectCls = 'px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';

interface Bucket {
    key: string;
    label: string;
    orders: number;
    cost: number;
    revenue: number;
    withCost: number;
    shipped: number;
}

const Stat: React.FC<{ label: string; value: string; sub?: string; tone?: string }> = ({ label, value, sub, tone }) => (
    <div className={`${cardCls} p-4`}>
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
        <p className={`mt-1 text-2xl font-bold ${tone || 'text-gray-900 dark:text-white'}`}>{value}</p>
        {sub && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{sub}</p>}
    </div>
);

const FulfillOverview: React.FC = () => {
    const { records, accounts, role, permissions } = useDashboard();
    const canSeeMoney = role === 'owner' || role === 'leader' || !!permissions?.viewSales;

    const [factoryFilter, setFactoryFilter] = useState('all');
    const [accountFilter, setAccountFilter] = useState('all');
    const [groupBy, setGroupBy] = useState<GroupBy>('factory');

    const labelOf = useMemo(() => {
        const m = new Map<string, string>();
        (accounts || []).forEach(a => m.set(a.email, a.label || a.email));
        return m;
    }, [accounts]);

    // Only orders actually sent to a factory carry an ffCode — those are the
    // fulfillment records this screen reports on.
    const fulfilled = useMemo(
        () => (records || []).filter((r: Record) => r.kind === 'order' && factoryOf(r.ff_code)),
        [records]
    );

    const manualFulfilled = useMemo(
        () => (records || []).filter((r: Record) => r.kind === 'order' && hasFfCode(r.ff_code) && !factoryOf(r.ff_code)),
        [records]
    );

    const rows = useMemo(() => fulfilled.filter((r: Record) => {
        const f = factoryOf(r.ff_code);
        if (factoryFilter !== 'all' && f?.key !== factoryFilter) return false;
        if (accountFilter !== 'all' && r.account !== accountFilter) return false;
        return true;
    }), [fulfilled, factoryFilter, accountFilter]);

    const manualRows = useMemo(() => manualFulfilled.filter((r: Record) => {
        if (accountFilter !== 'all' && r.account !== accountFilter) return false;
        return true;
    }), [manualFulfilled, accountFilter]);

    const totals = useMemo(() => {
        let cost = 0, revenue = 0, withCost = 0, shipped = 0;
        for (const r of rows) {
            if (r.cost_total != null) { cost += Number(r.cost_total); withCost++; }
            revenue += orderRevenue(r);
            if (r.order_status === 'SHIPPED') shipped++;
        }
        return { orders: rows.length, cost, revenue, withCost, shipped, missing: rows.length - withCost };
    }, [rows]);

    const manualTotals = useMemo(() => {
        let cost = 0, revenue = 0, withCost = 0, shipped = 0;
        for (const r of manualRows) {
            if (r.cost_total != null) { cost += Number(r.cost_total); withCost++; }
            revenue += orderRevenue(r);
            if (r.order_status === 'SHIPPED') shipped++;
        }
        return { orders: manualRows.length, cost, revenue, withCost, shipped, missing: manualRows.length - withCost };
    }, [manualRows]);

    const buckets = useMemo<Bucket[]>(() => {
        const map = new Map<string, Bucket>();
        for (const r of rows) {
            const f = factoryOf(r.ff_code);
            const key = groupBy === 'factory' ? (f?.key || 'other') : (r.account || 'unknown');
            const label = groupBy === 'factory' ? (f?.label || 'Other') : (labelOf.get(r.account) || r.account);
            let b = map.get(key);
            if (!b) { b = { key, label, orders: 0, cost: 0, revenue: 0, withCost: 0, shipped: 0 }; map.set(key, b); }
            b.orders++;
            b.revenue += orderRevenue(r);
            if (r.cost_total != null) { b.cost += Number(r.cost_total); b.withCost++; }
            if (r.order_status === 'SHIPPED') b.shipped++;
        }
        return [...map.values()].sort((a, b) => b.cost - a.cost || b.orders - a.orders);
    }, [rows, groupBy, labelOf]);

    const manualBuckets = useMemo<Bucket[]>(() => {
        const map = new Map<string, Bucket>();
        for (const r of manualRows) {
            const rawCode = normalizeManualFfCode(r.ff_code);
            const key = rawCode.toLowerCase();
            let b = map.get(key);
            if (!b) { b = { key, label: rawCode, orders: 0, cost: 0, revenue: 0, withCost: 0, shipped: 0 }; map.set(key, b); }
            b.orders++;
            b.revenue += orderRevenue(r);
            if (r.cost_total != null) { b.cost += Number(r.cost_total); b.withCost++; }
            if (r.order_status === 'SHIPPED') b.shipped++;
        }
        return [...map.values()].sort((a, b) => b.orders - a.orders || b.cost - a.cost || a.label.localeCompare(b.label));
    }, [manualRows]);

    const detail = useMemo(
        () => [...rows].sort((a, b) => new Date(b.dt_local).getTime() - new Date(a.dt_local).getTime()).slice(0, 300),
        [rows]
    );

    const accountOptions = useMemo(() => {
        const seen = new Map<string, string>();
        [...fulfilled, ...manualFulfilled].forEach((r: Record) => { if (r.account) seen.set(r.account, labelOf.get(r.account) || r.account); });
        return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    }, [fulfilled, manualFulfilled, labelOf]);

    const th = 'px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap';
    const td = 'px-4 py-2.5 text-sm text-gray-800 dark:text-gray-200 whitespace-nowrap';

    return (
        <div className="p-2 md:p-6 space-y-5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Stat label="Fulfilled orders" value={String(totals.orders)} sub={`${totals.shipped} shipped`} />
                <Stat
                    label="Fulfill cost"
                    value={canSeeMoney ? `$${money(totals.cost)}` : '—'}
                    sub={totals.missing > 0 ? `${totals.missing} order(s) without cost yet` : 'all orders costed'}
                />
                <Stat
                    label="Avg cost / order"
                    value={canSeeMoney && totals.withCost ? `$${money(totals.cost / totals.withCost)}` : '—'}
                    sub={`over ${totals.withCost} costed order(s)`}
                />
                <Stat
                    label="Profit"
                    value={canSeeMoney ? `$${money(totals.revenue - totals.cost)}` : '—'}
                    sub={canSeeMoney ? `revenue $${money(totals.revenue)}` : undefined}
                    tone={totals.revenue - totals.cost >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}
                />
            </div>

            <div className={`${cardCls} p-4 flex flex-wrap items-center gap-3`}>
                <select value={factoryFilter} onChange={e => setFactoryFilter(e.target.value)} className={selectCls}>
                    <option value="all">All factories</option>
                    {FACTORIES.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
                <select value={accountFilter} onChange={e => setAccountFilter(e.target.value)} className={selectCls}>
                    <option value="all">All shop accounts</option>
                    {accountOptions.map(([email, label]) => <option key={email} value={email}>{label}</option>)}
                </select>
                <div className="ml-auto inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
                    {(['factory', 'account'] as GroupBy[]).map(g => (
                        <button
                            key={g}
                            onClick={() => setGroupBy(g)}
                            className={`px-4 py-2 text-sm font-medium ${groupBy === g
                                ? 'bg-blue-600 text-white'
                                : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'}`}
                        >
                            {g === 'factory' ? 'By factory' : 'By shop'}
                        </button>
                    ))}
                </div>
            </div>

            <div className={`${cardCls} overflow-hidden`}>
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">FF nhập tay</h3>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            Đơn có FF Code nhưng không qua API factory prefix
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                        <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-1">{manualTotals.orders} order(s)</span>
                        <span className="rounded-full bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 text-emerald-700 dark:text-emerald-300">{manualTotals.shipped} shipped</span>
                        {canSeeMoney && <span className="rounded-full bg-blue-50 dark:bg-blue-900/30 px-2 py-1 text-blue-700 dark:text-blue-300">Cost ${money(manualTotals.cost)}</span>}
                        {canSeeMoney && <span className={`rounded-full px-2 py-1 ${manualTotals.revenue - manualTotals.cost >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}>Profit ${money(manualTotals.revenue - manualTotals.cost)}</span>}
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-700/40">
                            <tr>
                                <th className={th}>FF Code</th>
                                <th className={`${th} text-right`}>Orders</th>
                                <th className={`${th} text-right`}>Shipped</th>
                                {canSeeMoney && <th className={`${th} text-right`}>Fulfill cost</th>}
                                {canSeeMoney && <th className={`${th} text-right`}>Avg / order</th>}
                                {canSeeMoney && <th className={`${th} text-right`}>Revenue</th>}
                                {canSeeMoney && <th className={`${th} text-right`}>Profit</th>}
                                <th className={th}>Share</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                            {manualBuckets.map(b => {
                                const pct = manualTotals.orders > 0 ? (b.orders / manualTotals.orders) * 100 : 0;
                                const profit = b.revenue - b.cost;
                                return (
                                    <tr key={b.key} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                        <td className={`${td} font-medium`}>{b.label}</td>
                                        <td className={`${td} text-right`}>{b.orders}</td>
                                        <td className={`${td} text-right`}>{b.shipped}</td>
                                        {canSeeMoney && <td className={`${td} text-right font-semibold`}>${money(b.cost)}</td>}
                                        {canSeeMoney && <td className={`${td} text-right`}>{b.withCost ? `$${money(b.cost / b.withCost)}` : '-'}</td>}
                                        {canSeeMoney && <td className={`${td} text-right`}>${money(b.revenue)}</td>}
                                        {canSeeMoney && (
                                            <td className={`${td} text-right font-semibold ${profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                                                ${money(profit)}
                                            </td>
                                        )}
                                        <td className={`${td} w-40`}>
                                            <span className="flex items-center gap-2">
                                                <span className="flex-1 h-1.5 rounded bg-gray-100 dark:bg-gray-700 overflow-hidden">
                                                    <span className="block h-full bg-pink-500" style={{ width: `${pct}%` }} />
                                                </span>
                                                <span className="text-xs text-gray-500 dark:text-gray-400 w-10 text-right">{pct.toFixed(0)}%</span>
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                            {manualBuckets.length === 0 && (
                                <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Không có đơn FF nhập tay trong khoảng này.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className={`${cardCls} overflow-hidden`}>
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                        {groupBy === 'factory' ? 'Cost by factory' : 'Cost by shop account'}
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-700/40">
                            <tr>
                                <th className={th}>{groupBy === 'factory' ? 'Factory' : 'Shop'}</th>
                                <th className={`${th} text-right`}>Orders</th>
                                <th className={`${th} text-right`}>Shipped</th>
                                {canSeeMoney && <th className={`${th} text-right`}>Fulfill cost</th>}
                                {canSeeMoney && <th className={`${th} text-right`}>Avg / order</th>}
                                {canSeeMoney && <th className={`${th} text-right`}>Revenue</th>}
                                {canSeeMoney && <th className={`${th} text-right`}>Profit</th>}
                                <th className={th}>Share</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                            {buckets.map(b => {
                                const pct = totals.cost > 0 ? (b.cost / totals.cost) * 100 : 0;
                                const profit = b.revenue - b.cost;
                                return (
                                    <tr key={b.key} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                        <td className={`${td} font-medium`}>{b.label}</td>
                                        <td className={`${td} text-right`}>{b.orders}</td>
                                        <td className={`${td} text-right`}>{b.shipped}</td>
                                        {canSeeMoney && <td className={`${td} text-right font-semibold`}>${money(b.cost)}</td>}
                                        {canSeeMoney && <td className={`${td} text-right`}>{b.withCost ? `$${money(b.cost / b.withCost)}` : '-'}</td>}
                                        {canSeeMoney && <td className={`${td} text-right`}>${money(b.revenue)}</td>}
                                        {canSeeMoney && (
                                            <td className={`${td} text-right font-semibold ${profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                                                ${money(profit)}
                                            </td>
                                        )}
                                        <td className={`${td} w-40`}>
                                            <span className="flex items-center gap-2">
                                                <span className="flex-1 h-1.5 rounded bg-gray-100 dark:bg-gray-700 overflow-hidden">
                                                    <span className="block h-full bg-blue-500" style={{ width: `${pct}%` }} />
                                                </span>
                                                <span className="text-xs text-gray-500 dark:text-gray-400 w-10 text-right">{pct.toFixed(0)}%</span>
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                            {buckets.length === 0 && (
                                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">No fulfilled orders in this range.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className={`${cardCls} overflow-hidden`}>
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Fulfilled orders</h3>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                        {detail.length < rows.length ? `showing ${detail.length} of ${rows.length}` : `${rows.length} order(s)`}
                    </span>
                </div>
                <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-700/40 sticky top-0 z-10">
                            <tr>
                                <th className={th}>Date</th>
                                <th className={th}>Order ID</th>
                                <th className={th}>Factory</th>
                                <th className={th}>FF Code</th>
                                <th className={th}>Status</th>
                                <th className={th}>Tracking</th>
                                {canSeeMoney && <th className={`${th} text-right`}>Cost</th>}
                                {canSeeMoney && <th className={`${th} text-right`}>Revenue</th>}
                                <th className={th}>Shop</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                            {detail.map((r: Record) => {
                                const f = factoryOf(r.ff_code);
                                const st = r.order_status || 'NEW';
                                return (
                                    <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                        <td className={`${td} text-gray-500 dark:text-gray-400`}>{new Date(r.dt_local).toLocaleDateString('en-CA')}</td>
                                        <td className={td}>{r.order_id || '-'}</td>
                                        <td className={`${td} font-medium`}>{f?.label || '-'}</td>
                                        <td className={`${td} font-mono text-xs text-gray-500 dark:text-gray-400`}>{r.ff_code}</td>
                                        <td className={td}>
                                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${ORDER_STATUS_CLASSES[st] || ORDER_STATUS_CLASSES.NEW}`}>
                                                {ORDER_STATUS_LABELS[st] || st}
                                            </span>
                                        </td>
                                        <td className={`${td} text-xs`}>
                                            {r.tracking_code ? (
                                                <a
                                                    href={`https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(r.tracking_code)}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-blue-600 dark:text-blue-400 hover:underline"
                                                >
                                                    {r.tracking_code}
                                                </a>
                                            ) : <span className="text-gray-400">-</span>}
                                        </td>
                                        {canSeeMoney && <td className={`${td} text-right`}>{r.cost_total != null ? `$${money(Number(r.cost_total))}` : <span className="text-gray-400">-</span>}</td>}
                                        {canSeeMoney && <td className={`${td} text-right`}>${money(orderRevenue(r))}</td>}
                                        <td className={`${td} text-gray-500 dark:text-gray-400`}>{labelOf.get(r.account) || r.account}</td>
                                    </tr>
                                );
                            })}
                            {detail.length === 0 && (
                                <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">No fulfilled orders match these filters.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const FulfillTab: React.FC<{ processedData?: unknown }> = () => {
    // URL-backed (?section=factory), driven by the sidebar's Fulfill submenu
    // (Dashboard | Supplier). 'lemiex' is accepted as a legacy alias.
    const [searchParams] = useSearchParams();
    const rawSection = searchParams.get('section');
    const section: FulfillSection = rawSection === 'factory' || rawSection === 'lemiex' ? 'lemiex' : 'overview';

    return (
        <div className="h-full bg-gray-50 dark:bg-gray-900 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
            {section === 'lemiex' ? <div className="p-2 md:p-6"><LemiexPanel /></div> : <FulfillOverview />}
        </div>
    );
};

export default FulfillTab;
