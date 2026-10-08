import { useMemo } from 'react';
import { Record, Account } from '../types';

interface UseRecordFilteringProps {
    records: Record[];
    accounts: Account[];
    selectedAccountId: string;
    searchTerm: string;
    // FULFILLMENT works across all shops: the server already scopes records per
    // role, and their visible-accounts list is empty — skip the account filter.
    bypassAccountFilter?: boolean;
}

export const useRecordFiltering = ({
    records,
    accounts,
    selectedAccountId,
    searchTerm,
    bypassAccountFilter = false
}: UseRecordFilteringProps) => {

    const filteredRecords = useMemo(() => {
        if (!records || records.length === 0) return [];

        // Filter out accounts without valid emails
        const allowedEmails = new Set(
            accounts
                .map(a => a.email)
                .filter((email): email is string => !!email)
        );

        // First filter: only records with valid account that's in allowedEmails
        let baseFiltered = bypassAccountFilter
            ? records
            : records.filter(r => r.account && allowedEmails.has(r.account));

        // Second filter: specific account selection
        if (selectedAccountId && selectedAccountId !== 'all') {
            baseFiltered = baseFiltered.filter(r => r.account === selectedAccountId);
        }

        // Third filter: search term
        if (searchTerm && searchTerm.trim()) {
            const lowerTerm = searchTerm.toLowerCase();
            baseFiltered = baseFiltered.filter(r => {
                const oid = (r.order_id ?? '').toLowerCase();
                const custName = (r.details?.customerName ?? '').toLowerCase();
                const prodName = (r.product_name ?? r.details?.items?.[0]?.name ?? '').toLowerCase();
                const ffCode = (r.ff_code ?? '').toLowerCase();
                return [oid, custName, prodName, ffCode].some(field => field.includes(lowerTerm));
            });
        }
        return baseFiltered;
    }, [records, accounts, selectedAccountId, searchTerm, bypassAccountFilter]);

    return filteredRecords;
};
