/**
 * Notification center hook — MySQL backend (polling).
 *
 * Polls /api/notifications every 30s. State lives both in localStorage
 * (offline-first) and in the database. Same public API as the Firebase
 * version so callers (NotificationBell, etc.) do not need to change.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Notification } from '../types/notification';
import { cleanupOldNotifications } from '../utils/notificationCleanup';
import { api } from '../services/apiClient';
import { UserProfile } from './useAuthLogic';
import { filterNotificationsByPermissions } from '../utils/notificationPermissions';

const STORAGE_KEY = 'dashboard_notifications';
const AUTO_CLEANUP_DAYS = 3;
const POLL_INTERVAL_MS = 30_000;

interface UseNotificationCenterOptions {
  teamId?: string;
  enableFirestoreSync?: boolean; // kept for API compat; now means "sync with backend"
  userProfile?: UserProfile | null;
}

function mapApiNotification(raw: any): Notification {
  return {
    id: raw.id,
    type: raw.type,
    title: raw.title || '',
    content: raw.body || '',
    metadata: raw.data || {},
    isRead: Boolean(raw.isRead),
    createdAt: raw.createdAt,
  };
}

export function useNotificationCenter(options: UseNotificationCenterOptions = {}) {
  const { enableFirestoreSync = true, userProfile } = options;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [limitCount, setLimitCount] = useState(20);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: Notification[] = JSON.parse(stored);
        setNotifications(cleanupOldNotifications(parsed, AUTO_CLEANUP_DAYS));
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
    }
  }, []);

  // Persist to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
    } catch (err) {
      console.error('Failed to save notifications:', err);
    }
  }, [notifications]);

  // Poll backend
  useEffect(() => {
    if (!enableFirestoreSync) return;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      try {
        const { notifications: list } = await api.get<{ notifications: any[] }>(
          `/api/notifications?limit=${limitCount}`
        );
        const mapped = list.map(mapApiNotification);
        setNotifications((prev) => {
          // Merge: prefer server state for items whose id matches, keep local-only items (id starts with 'notif_').
          const serverIds = new Set(mapped.map((n) => n.id));
          const localOnly = prev.filter((n) => n.id.startsWith('notif_') && !serverIds.has(n.id));
          const merged = [...mapped, ...localOnly].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          return merged.slice(0, Math.max(limitCount, merged.length));
        });
      } catch (err) {
        console.warn('[useNotificationCenter] poll failed', err);
      }
    };

    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enableFirestoreSync, limitCount]);

  // Auto-cleanup hourly
  useEffect(() => {
    const interval = setInterval(() => {
      setNotifications((prev) => cleanupOldNotifications(prev, AUTO_CLEANUP_DAYS));
    }, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const loadMore = useCallback(() => setLimitCount((p) => p + 20), []);

  const addNotification = useCallback(
    (notification: Omit<Notification, 'id' | 'createdAt' | 'isRead'>) => {
      const newOne: Notification = {
        ...notification,
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        createdAt: new Date().toISOString(),
        isRead: false,
      };
      setNotifications((prev) => [newOne, ...prev]);
    },
    []
  );

  const markAsRead = useCallback(
    async (id: string) => {
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      if (!id.startsWith('notif_') && enableFirestoreSync) {
        try {
          await api.patch(`/api/notifications/${id}`, { isRead: true });
        } catch (err) {
          console.error('[markAsRead] failed', err);
        }
      }
    },
    [enableFirestoreSync]
  );

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }, []);

  const clearAll = useCallback(async () => {
    if (enableFirestoreSync) {
      try {
        await api.delete('/api/notifications');
      } catch (err) {
        console.error('[clearAll] failed', err);
      }
    }
    setNotifications([]);
  }, [enableFirestoreSync]);

  const deleteNotification = useCallback(
    async (id: string, _hardDelete = false) => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      if (!id.startsWith('notif_') && enableFirestoreSync) {
        try {
          await api.delete(`/api/notifications/${id}`);
        } catch (err) {
          console.error('[deleteNotification] failed', err);
        }
      }
    },
    [enableFirestoreSync]
  );

  const filteredNotifications = useMemo(
    () => filterNotificationsByPermissions(notifications, userProfile),
    [notifications, userProfile]
  );

  const unreadCount = filteredNotifications.filter((n) => !n.isRead).length;
  const toggleOpen = useCallback(() => setIsOpen((p) => !p), []);
  const closePanel = useCallback(() => setIsOpen(false), []);

  return {
    notifications: filteredNotifications,
    unreadCount,
    isOpen,
    addNotification,
    markAsRead,
    markAllAsRead,
    clearAll,
    deleteNotification,
    toggleOpen,
    closePanel,
    loadMore,
    hasMore: filteredNotifications.length >= limitCount,
  };
}
