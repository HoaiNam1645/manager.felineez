import { Tab } from '../types';

export const getPermittedTabs = (
    tabs: Tab[],
    role: 'owner' | 'leader' | 'user' | 'fulfillment' | 'design',
    permissions: { [key: string]: boolean }
): Tab[] => {
    return tabs.filter(tab => {
        if (role === 'owner') return true;
        if (tab === 'Products') return true;
        // Fulfillment staff work the Fulfill screens + Order List (money columns hidden there)
        if (role === 'fulfillment') return tab === 'Fulfill' || tab === 'Order List' || tab === 'Products';
        if (role === 'design') return tab === 'Overview' || tab === 'Order List' || tab === 'Products';
        switch (tab) {
            case 'Overview':
            case 'Order List':
            case 'Support':
                return permissions.viewSales;
            case 'Fulfill':
                return permissions.viewFulfill;
            case 'KPI':
                // KPI dashboard: leaders always; regular users need the KPI permission.
                return role === 'leader' || !!permissions.viewKpi;
            default:
                return false;
        }
    });
};
