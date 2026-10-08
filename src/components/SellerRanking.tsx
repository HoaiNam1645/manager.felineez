import React from 'react';
import { Trophy } from 'lucide-react';
import { SellerRankRow } from '../types';

interface SellerRankingProps {
    sellers: SellerRankRow[];
}

// Medal-style rank colors (gold / silver / bronze), gray for the rest.
const rankColor = (rank: number): string => {
    if (rank === 1) return 'text-amber-500';
    if (rank === 2) return 'text-slate-400';
    if (rank === 3) return 'text-orange-500';
    return 'text-gray-400 dark:text-gray-500';
};

const formatUpdated = (): string => {
    const d = new Date();
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};

const money = (value: number): string => {
    const abs = Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${value < 0 ? '-' : ''}$${abs}`;
};

const thBase = 'px-3 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap';
const tdBase = 'px-3 py-3 text-sm whitespace-nowrap';

const SellerRanking: React.FC<SellerRankingProps> = ({ sellers }) => {
    // Funds / Cost columns only appear when the data carries them (permission-gated upstream).
    const showFunds = sellers.some(s => s.funds !== undefined);
    const showCost = sellers.some(s => s.cost !== undefined);
    const showProfit = sellers.some(s => s.profit !== undefined);
    const showRefund = sellers.some(s => (s.refund?.count || 0) > 0 || (s.refund?.amount.value || 0) > 0);

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <Trophy className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white leading-tight">Seller Ranking</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Ranked by revenue · Updated: {formatUpdated()}</p>
                </div>
            </div>

            {/* Ranking table */}
            <div className="min-h-[400px] overflow-x-auto">
                {sellers.length === 0 ? (
                    <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">No seller data yet.</div>
                ) : (
                    <table className="min-w-full">
                        <thead>
                            <tr className="border-b border-gray-200 dark:border-gray-700">
                                <th className={`${thBase} text-left w-14`}>Rank</th>
                                <th className={`${thBase} text-left`}>Seller</th>
                                <th className={`${thBase} text-right`}>Orders</th>
                                <th className={`${thBase} text-right`}>Items</th>
                                <th className={`${thBase} text-right`}>Revenue</th>
                                {showFunds && <th className={`${thBase} text-right`}>Funds</th>}
                                {showCost && <th className={`${thBase} text-right`}>Cost</th>}
                                {showProfit && <th className={`${thBase} text-right`}>Profit</th>}
                                {showRefund && <th className={`${thBase} text-right`}>Refund</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {sellers.map((s, i) => {
                                const rank = i + 1;
                                return (
                                    <tr
                                        key={s.seller}
                                        className="border-b border-gray-100 dark:border-gray-700/50 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                                    >
                                        <td className={`${tdBase} font-bold ${rankColor(rank)}`}>#{rank}</td>
                                        <td className={`${tdBase} text-gray-900 dark:text-gray-100 font-medium max-w-[180px] truncate`} title={s.seller}>{s.seller}</td>
                                        <td className={`${tdBase} text-right text-gray-700 dark:text-gray-300 tabular-nums`}>{s.orders.toLocaleString()}</td>
                                        <td className={`${tdBase} text-right text-gray-700 dark:text-gray-300 tabular-nums`}>{s.items.toLocaleString()}</td>
                                        <td className={`${tdBase} text-right font-semibold text-gray-900 dark:text-white tabular-nums`}>{s.revenue.display}</td>
                                        {showFunds && <td className={`${tdBase} text-right text-gray-700 dark:text-gray-300 tabular-nums`}>{s.funds?.display ?? '--'}</td>}
                                        {showCost && <td className={`${tdBase} text-right text-gray-700 dark:text-gray-300 tabular-nums`}>{s.cost != null ? `$${s.cost.toFixed(2)}` : '--'}</td>}
                                        {showProfit && (
                                            <td className={`${tdBase} text-right font-semibold tabular-nums ${s.profit != null && s.profit < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-300'}`}>
                                                {s.profit != null ? money(s.profit) : '--'}
                                            </td>
                                        )}
                                        {showRefund && (
                                            <td className={`${tdBase} text-right text-rose-700 dark:text-rose-300 tabular-nums`}>
                                                {(s.refund?.count || 0) > 0 ? `${s.refund?.count} · ${s.refund?.amount.display || '--'}` : '--'}
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default React.memo(SellerRanking);
