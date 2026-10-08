// KPI tab — rendered inside the normal dashboard layout (Sidebar + Header),
// so it inherits the global date-range picker. Attribution: seller code =
// first 2 chars of the imported CSV SKU (see utils/kpiProcessing.ts).

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useDashboard } from '../../contexts/DashboardContext';
import { useUI } from '../../contexts/UIContext';
import { api } from '../../services/apiClient';
import { computeKpi, KpiUser, KpiTeam } from '../../utils/kpiProcessing';
import KpiCard from '../KpiCard';
import ChartErrorBoundary from '../ChartErrorBoundary';
import LoadingSpinner from '../LoadingSpinner';

const STACK_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#14B8A6', '#F97316', '#6366F1'];

const rankColor = (rank: number): string => {
    if (rank === 1) return 'text-amber-500';
    if (rank === 2) return 'text-slate-400';
    if (rank === 3) return 'text-orange-500';
    return 'text-gray-400 dark:text-gray-500';
};

const money = (v: number): string =>
    v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const thCls = 'px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider whitespace-nowrap';
const tdCls = 'px-4 py-3 text-sm';
const cardCls = 'bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700';

const KpiTab: React.FC = () => {
    const { records, role, user, permissions } = useDashboard();
    const { timeZone, filterDateRange } = useUI();

    const [users, setUsers] = useState<KpiUser[]>([]);
    const [teams, setTeams] = useState<KpiTeam[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [teamFilter, setTeamFilter] = useState<string>('all');

    const fetchMeta = useCallback(async () => {
        setLoadError(null);
        try {
            const [{ users: list }, { teams: teamList }] = await Promise.all([
                api.get<{ users: any[] }>('/api/users'),
                api.get<{ teams: any[] }>('/api/seller-teams'),
            ]);
            setUsers(list.map(u => ({
                id: u.id,
                email: u.email,
                role: u.role,
                sellerCodes: Array.isArray(u.sellerCodes) ? u.sellerCodes : [],
                sellerTeamId: u.sellerTeamId ?? null,
            })));
            setTeams(teamList.map(t => ({ id: t.id, name: t.name })));
        } catch (err: any) {
            setLoadError(err?.message || 'Failed to load KPI metadata.');
        }
        setLoading(false);
    }, []);

    useEffect(() => { fetchMeta(); }, [fetchMeta]);

    // Leader is locked to their own team.
    const viewer = useMemo(
        () => users.find(u => u.email.toLowerCase() === (user?.email || '').toLowerCase()) || null,
        [users, user]
    );
    const isLeader = role === 'leader';
    const effectiveTeamFilter = isLeader ? (viewer?.sellerTeamId ?? '__none__') : teamFilter;

    const kpi = useMemo(() => {
        if (loading) return null;
        return computeKpi({ records, users, teams, timeZone, teamFilter: effectiveTeamFilter, range: filterDateRange });
    }, [records, users, teams, timeZone, effectiveTeamFilter, filterDateRange, loading]);

    const canViewKpi = role === 'owner' || role === 'leader' || !!permissions?.viewKpi;
    if (!canViewKpi) {
        return (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                KPI dashboard is available to Owners and Leaders only.
            </div>
        );
    }

    if (loading) {
        return <div className="p-4"><LoadingSpinner variant="table-row" count={6} /></div>;
    }

    const isSingleDay = filterDateRange.from === filterDateRange.to;
    const hasData = !!kpi && kpi.totals.attributedOrders > 0;

    return (
        <div className="p-2 md:p-6">
            {/* Toolbar: title + team scope */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Seller KPI</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        {filterDateRange.from} → {filterDateRange.to} · ranked by Net
                    </p>
                </div>
                {!isLeader ? (
                    <select
                        value={teamFilter}
                        onChange={e => setTeamFilter(e.target.value)}
                        className="px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-sm"
                    >
                        <option value="all">All Teams</option>
                        {teams.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </select>
                ) : (
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                        Team: {viewer?.sellerTeamId ? (teams.find(t => t.id === viewer.sellerTeamId)?.name ?? '—') : 'Not assigned'}
                    </span>
                )}
            </div>

            {loadError && (
                <div className="mb-4 p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
                    {loadError}
                </div>
            )}

            {isLeader && !viewer?.sellerTeamId && (
                <div className="mb-4 p-3 rounded-md bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/40 text-sm text-amber-800 dark:text-amber-400">
                    Bạn chưa được gán vào team nào — nhờ Owner gán team trong User Management.
                </div>
            )}

            {kpi && (
                <>
                    {/* KPI cards (system component for visual consistency) */}
                    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 md:gap-4 mb-6">
                        <KpiCard title="Total Orders" value={{ value: kpi.totals.attributedOrders.toLocaleString() }} />
                        <KpiCard title="Items Sold" value={{ value: kpi.totals.attributedItems.toLocaleString() }} />
                        <KpiCard title="Revenue" value={{ value: `${money(kpi.totals.revenue)} ${kpi.currency}` }} />
                        <KpiCard title="Net Received" value={{ value: `${money(kpi.totals.net)} ${kpi.currency}` }} />
                        <KpiCard title="FF Cost" value={{ value: `${money(kpi.totals.ffCost)} USD` }} />
                        <KpiCard title="DS Cost" value={{ value: `${money(kpi.totals.designCost || 0)} USD` }} />
                        <KpiCard title="Profit" value={{ value: `${money(kpi.totals.profit)} ${kpi.currency}` }} />
                        <KpiCard title="Attribution" value={{ value: `${kpi.totals.attributionRate}%` }} />
                    </div>

                    {/* Empty state — data only, no explanations */}
                    {!hasData && (
                        <div className={`${cardCls} p-6 mb-6`}>
                            <p className="text-sm text-gray-500 dark:text-gray-400 text-center">No KPI data in this range.</p>
                            {kpi.unattributed.unknownPrefixes.length > 0 && (
                                <div className="mt-4">
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Prefix chưa gán:</p>
                                    <div className="flex flex-wrap gap-2">
                                        {kpi.unattributed.unknownPrefixes.map(p => (
                                            <span key={p.prefix} className="px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 font-mono text-sm font-semibold text-blue-700 dark:text-blue-300">
                                                {p.prefix} <span className="font-normal text-xs text-blue-400">({p.orders} đơn)</span>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {kpi.unattributed.noSku > 0 && (
                                <p className="mt-3 text-xs text-gray-400 dark:text-gray-500 text-center">
                                    {kpi.unattributed.noSku} đơn chưa có SKU
                                </p>
                            )}
                        </div>
                    )}

                    {/* Daily stacked net chart */}
                    {hasData && kpi.daily.length > 0 && (
                        <div className={`${cardCls} p-4 mb-6`}>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Net by {kpi.granularity}</h3>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                    {effectiveTeamFilter === 'all' ? 'stacked by team' : 'stacked by seller'}
                                </span>
                            </div>
                            <div className="h-[280px] md:h-[340px]">
                                <ChartErrorBoundary>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={kpi.daily} margin={{ top: 5, right: 10, left: 0, bottom: 5 }} barSize={kpi.daily.length <= 2 ? 60 : undefined}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.15} />
                                            <XAxis dataKey="date" stroke="#6B7280" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                                            <YAxis stroke="#4B5563" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                                            <Tooltip
                                                formatter={(value: any, name: any) => [`$${money(Number(value) || 0)}`, name]}
                                                contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: 8, color: '#F9FAFB', fontSize: 12 }}
                                                cursor={{ fill: 'rgba(59,130,246,0.05)' }}
                                            />
                                            <Legend wrapperStyle={{ fontSize: 12 }} />
                                            {kpi.dailyKeys.map((key, i) => (
                                                <Bar key={key} dataKey={key} stackId="net" fill={STACK_COLORS[i % STACK_COLORS.length]} radius={i === kpi.dailyKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                                            ))}
                                        </BarChart>
                                    </ResponsiveContainer>
                                </ChartErrorBoundary>
                            </div>
                        </div>
                    )}

                    {/* Leaderboard + Team ranking side-by-side on wide screens */}
                    {hasData && (
                        <div className={`grid grid-cols-1 ${role === 'owner' && effectiveTeamFilter === 'all' && kpi.teams.length > 0 ? 'xl:grid-cols-3' : ''} gap-6 items-start`}>
                            {/* Seller leaderboard */}
                            <div className={`${cardCls} overflow-hidden ${role === 'owner' && effectiveTeamFilter === 'all' && kpi.teams.length > 0 ? 'xl:col-span-2' : ''}`}>
                                <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-gray-700">
                                    <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">🏆</div>
                                    <div>
                                        <h3 className="text-base font-semibold text-gray-900 dark:text-white leading-tight">Seller Leaderboard</h3>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Ranked by Net</p>
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full">
                                        <thead>
                                            <tr className="border-b border-gray-200 dark:border-gray-700">
                                                <th className={`${thCls} text-left w-14`}>Rank</th>
                                                <th className={`${thCls} text-left`}>Seller</th>
                                                <th className={`${thCls} text-right`}>Sales</th>
                                                <th className={`${thCls} text-right`}>Money</th>
                                                <th className={`${thCls} text-right`}>Share</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                                            {kpi.sellers.map((s, i) => (
                                                <tr key={s.userId} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                                    <td className={`${tdCls} whitespace-nowrap font-bold ${rankColor(i + 1)}`}>#{i + 1}</td>
                                                    <td className={`${tdCls} min-w-[220px]`}>
                                                        <div className="font-medium text-gray-900 dark:text-white break-all">{s.email}</div>
                                                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                                            <span className="text-xs text-gray-500 dark:text-gray-400">{s.teamName}</span>
                                                            {s.codes.length > 0 && (
                                                                <span className="font-mono text-xs text-gray-400 dark:text-gray-500">[{s.codes.join(',')}]</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className={`${tdCls} text-right tabular-nums text-gray-700 dark:text-gray-300 whitespace-nowrap`}>
                                                        <div>{s.orders.toLocaleString()} orders</div>
                                                        <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">{s.items.toLocaleString()} items</div>
                                                    </td>
                                                    <td className={`${tdCls} text-right tabular-nums whitespace-nowrap`}>
                                                        <div className="text-gray-700 dark:text-gray-300">Rev ${money(s.revenue)}</div>
                                                        <div className="mt-1 font-semibold text-emerald-600 dark:text-emerald-400">Net ${money(s.net)}</div>
                                                        <div className="mt-1 font-semibold text-rose-600 dark:text-rose-400">FF ${money(s.ffCost)}</div>
                                                        <div className="mt-1 font-semibold text-fuchsia-600 dark:text-fuchsia-400">DS ${money(s.designCost || 0)}</div>
                                                        <div className={`mt-1 font-semibold ${s.profit >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>Profit ${money(s.profit)}</div>
                                                    </td>
                                                    <td className={`${tdCls} text-right tabular-nums text-gray-500 dark:text-gray-400 whitespace-nowrap`}>
                                                        {kpi.totals.net > 0 ? `${Math.round((s.net / kpi.totals.net) * 100)}%` : '--'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Team ranking (owner, All view) */}
                            {role === 'owner' && effectiveTeamFilter === 'all' && kpi.teams.length > 0 && (
                                <div className={`${cardCls} overflow-hidden`}>
                                    <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                                        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Team Ranking</h3>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full">
                                            <thead>
                                                <tr className="border-b border-gray-200 dark:border-gray-700">
                                                    <th className={`${thCls} text-left w-12`}>#</th>
                                                    <th className={`${thCls} text-left`}>Team</th>
                                                    <th className={`${thCls} text-right`}>Sales</th>
                                                    <th className={`${thCls} text-right`}>Money</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                                                {kpi.teams.map((t, i) => (
                                                    <tr key={t.teamId ?? '__none__'} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                                        <td className={`${tdCls} whitespace-nowrap font-bold ${rankColor(i + 1)}`}>#{i + 1}</td>
                                                        <td className={tdCls}>
                                                            <div className="font-medium text-gray-900 dark:text-white">{t.teamName}</div>
                                                            <div className="mt-1 text-xs text-gray-400">{t.members} members</div>
                                                        </td>
                                                        <td className={`${tdCls} text-right tabular-nums text-gray-700 dark:text-gray-300 whitespace-nowrap`}>
                                                            <div>{t.orders.toLocaleString()} orders</div>
                                                            <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">{t.items.toLocaleString()} items</div>
                                                        </td>
                                                        <td className={`${tdCls} text-right tabular-nums whitespace-nowrap`}>
                                                            <div className="font-semibold text-emerald-600 dark:text-emerald-400">Net ${money(t.net)}</div>
                                                            <div className="mt-1 font-semibold text-rose-600 dark:text-rose-400">FF ${money(t.ffCost)}</div>
                                                            <div className="mt-1 font-semibold text-fuchsia-600 dark:text-fuchsia-400">DS ${money(t.designCost || 0)}</div>
                                                            <div className={`mt-1 font-semibold ${t.profit >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>Profit ${money(t.profit)}</div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Unattributed warning (owner only, when there IS data) */}
                    {hasData && role === 'owner' && kpi.totals.unattributedOrders > 0 && (
                        <div className="mt-6 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/40 rounded-lg p-4">
                            <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-400 mb-2">
                                ⚠️ {kpi.totals.unattributedOrders} đơn chưa xác định seller
                            </h3>
                            <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-1">
                                {kpi.unattributed.noSku > 0 && (
                                    <li>• <strong>{kpi.unattributed.noSku}</strong> đơn không có SKU — chưa import Etsy CSV cho các đơn này.</li>
                                )}
                                {kpi.unattributed.unknownOnly > 0 && (
                                    <li>• <strong>{kpi.unattributed.unknownOnly}</strong> đơn có SKU nhưng prefix không khớp mã seller nào.</li>
                                )}
                            </ul>
                            {kpi.unattributed.unknownPrefixes.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {kpi.unattributed.unknownPrefixes.map(p => (
                                        <span key={p.prefix} className="px-2 py-0.5 rounded bg-white dark:bg-gray-800 border border-amber-300 dark:border-amber-800 font-mono text-xs text-gray-800 dark:text-gray-200">
                                            {p.prefix} <span className="text-gray-400">({p.orders})</span>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default KpiTab;
