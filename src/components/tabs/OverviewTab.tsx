import React, { Suspense, lazy } from 'react';
import { useDashboard } from '../../contexts/DashboardContext';
import KpiCard from '../KpiCard';
import { KpiValue } from '../../types';
import ChartErrorBoundary from '../ChartErrorBoundary';
import LoadingSpinner from '../LoadingSpinner';
import { ProcessedData } from '../../types';
import DataTable from '../DataTable';

import OverviewChart from '../OverviewChart';
import SummaryChart from '../SummaryChart';
import SellerRanking from '../SellerRanking';

interface OverviewTabProps {
    processedData: ProcessedData;
    isSingleDay: boolean;
    handleViewDayDetails: (date: string) => void;
}

const OverviewTab: React.FC<OverviewTabProps> = ({ processedData, isSingleDay, handleViewDayDetails }) => {
    const { role, permissions } = useDashboard();
    const isOwner = role === 'owner';
    const canViewFunds = isOwner || permissions.viewFunds;
    const canViewCost = isOwner || permissions.viewFulfill;
    const hiddenValue: KpiValue = { value: '---', direction: 'neutral' };

    // Memoize KPI values to prevent recalculation
    const kpiValues = React.useMemo(() => ({
        orders: processedData.summary.kpis['Total Orders'] || { value: '---' },
        shops: processedData.summary.kpis['Shops'] || { value: '---' },
        revenue: processedData.summary.kpis['Revenue'] || { value: '---' },
        funds: canViewFunds ? (processedData.summary.kpis['Funds'] || { value: '---' }) : hiddenValue,
        cost: canViewCost ? (processedData.summary.kpis['Cost'] || { value: '---' }) : hiddenValue
    }), [processedData.summary.kpis, canViewFunds, canViewCost, hiddenValue]);

    return (
        <div className="p-2 md:p-6">
            {/* 1. KPIs Section (Merged from Summary) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-6 mb-6">
                <KpiCard title="Total Orders" value={kpiValues.orders} />
                <KpiCard title="Shops" value={kpiValues.shops} />
                <KpiCard title="Revenue" value={kpiValues.revenue} />
                <KpiCard title="Funds" value={kpiValues.funds} />
                <KpiCard title="Cost" value={kpiValues.cost} />
            </div>

            {/* 2. Charts Section */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
                {/* Main Overview Chart - Takes 1/2 width */}
                <ChartErrorBoundary>
                    <OverviewChart data={processedData.overview.chartData} />
                </ChartErrorBoundary>

                {/* Revenue Chart - Takes 1/2 width */}
                <ChartErrorBoundary>
                    <SummaryChart
                        data={processedData.summary.chartData}
                        hideTitle={true}
                        hideFunds={!canViewFunds}
                    />
                </ChartErrorBoundary>
            </div>

            {/* 3. Detailed Tables */}
            <div className="space-y-6">
                {/* Seller Ranking (all shop metrics + total items) */}
                <SellerRanking sellers={processedData.summary.sellerRanking || []} />

                {/* Daily Breakdown (Card View) - Hide if single day */}
                {!isSingleDay && (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Daily Breakdown</h3>
                        </div>
                        <div className="">
                            <Suspense fallback={<LoadingSpinner variant="card" count={5} />}>
                                <DataTable
                                    headers={processedData.overview.table.headers}
                                    data={processedData.overview.table.rows}
                                    onViewDayDetails={handleViewDayDetails}
                                    autoHeight={true}
                                    mobileRowHeight={260} // Increased to show all rows including Cost without scroll
                                    forceCardView={true}
                                />
                            </Suspense>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default OverviewTab;
