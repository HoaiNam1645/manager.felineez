import { Tab } from '../types';

const TAB_PERMISSION: Partial<Record<Tab, string>> = {
    Overview: 'viewOverview',
    'Order List': 'viewOrders',
    Design: 'viewDesign',
    Products: 'viewProducts',
    Support: 'viewSupport',
    Fulfill: 'viewFulfill',
    KPI: 'viewKpi',
};

export const getPermittedTabs = (
    tabs: Tab[],
    role: 'owner' | 'leader' | 'user' | 'fulfillment' | 'design',
    permissions: { [key: string]: boolean }
): Tab[] => {
    return tabs.filter(tab => {
        if (role === 'owner') return true;

        const permissionKey = TAB_PERMISSION[tab];
        if (permissionKey && typeof permissions[permissionKey] === 'boolean') {
            return permissions[permissionKey];
        }

        // Legacy fallback for accounts that have not been saved with menu-level permissions yet.
        if (tab === 'Products') return true;
        // Fulfillment staff work the Fulfill screens + Order List (money columns hidden there)
        if (role === 'fulfillment') return tab === 'Fulfill' || tab === 'Order List';
        if (role === 'design') return tab === 'Overview' || tab === 'Order List' || tab === 'Design';
        switch (tab) {
            case 'Overview':
            case 'Order List':
            case 'Design':
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
