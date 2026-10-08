/**
 * Deep Link Handler
 * Handles one-shot URL deep links from notifications:
 *   ?notification=<id>  → open the notification detail modal
 *   ?order=<id>         → go to /orders and open the order detail modal
 *   ?tab=<Name>         → (legacy) redirect to the tab's real path
 *
 * Only the consumed param is removed; filter query params (from/to/account/...)
 * are preserved. Runs once on mount (guarded), so it never fights the URL-backed
 * filters in UIContext.
 */

import React, { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useUI } from '../contexts/UIContext';

// Legacy ?tab=<Name> → path (mirrors TAB_TO_PATH in UIContext).
const TAB_PATHS: Record<string, string> = {
    'Overview': '/overview',
    'Order List': '/orders',
    'Products': '/analytics',
    'Support': '/support',
    'Fulfill': '/fulfill',
};

interface Props {
    onOpenOrder?: (orderId: string) => void;
}

export const DeepLinkHandler: React.FC<Props> = ({ onOpenOrder }) => {
    const { setSelectedNotificationId, setIsNotificationDetailOpen } = useUI();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const handled = useRef(false);

    useEffect(() => {
        if (handled.current) return;

        const notificationId = searchParams.get('notification');
        const orderId = searchParams.get('order');
        const tab = searchParams.get('tab');

        // Handle notification deep link
        if (notificationId) {
            handled.current = true;
            console.log('[Deep Link] Opening notification:', notificationId);
            setSelectedNotificationId(notificationId);
            setIsNotificationDetailOpen(true);
            setSearchParams(prev => {
                const p = new URLSearchParams(prev);
                p.delete('notification');
                return p;
            }, { replace: true });
            return;
        }

        // Handle order deep link → go to /orders (keep other filters), then open detail
        if (orderId && onOpenOrder && window.location.pathname !== '/products') {
            handled.current = true;
            console.log('[Deep Link] Opening order:', orderId);
            const p = new URLSearchParams(searchParams);
            p.delete('order');
            p.delete('tab');
            navigate({ pathname: '/orders', search: p.toString() }, { replace: true });
            // Wait for the order list to load, then open the order detail modal.
            setTimeout(() => onOpenOrder(orderId), 500);
            return;
        }

        // Legacy ?tab= → redirect to the real path, preserving other params
        if (tab) {
            handled.current = true;
            console.log('[Deep Link] Migrating legacy tab param:', tab);
            const p = new URLSearchParams(searchParams);
            p.delete('tab');
            navigate({ pathname: TAB_PATHS[tab] || '/overview', search: p.toString() }, { replace: true });
        }
    }, [searchParams, onOpenOrder, navigate, setSearchParams, setSelectedNotificationId, setIsNotificationDetailOpen]);

    return null;
};
