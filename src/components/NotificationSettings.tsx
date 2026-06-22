
import React, { useState, useEffect } from 'react';
import { useDashboard } from '../contexts/DashboardContext';
import { useNotification } from '../contexts/NotificationContext';

// Notification prefs are stored in localStorage after the MySQL migration.
// Re-enable web push by wiring `/api/push/subscribe` and the `web-push` package
// on the server side.
const PREFS_KEY = 'nh_notification_prefs';

interface NotificationPrefs {
  order: boolean;
  funds: boolean;
  summary: boolean;
  login: boolean;
  support: boolean; // Support cases (CASE_HELP)
}

const NotificationSettings: React.FC = () => {
  const { user, role, permissions } = useDashboard();
  const { addNotification } = useNotification();
  const [permission, setPermission] = useState<NotificationPermission>(Notification.permission);
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    order: false,
    funds: false,
    summary: false,
    login: false,
    support: false // Support cases
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(PREFS_KEY);
      if (stored) setPrefs(JSON.parse(stored));
    } catch (err) {
      console.error('Error loading notification prefs', err);
    }
  }, []);

  const requestPermission = async () => {
    setLoading(true);
    try {
      const permissionResult = await Notification.requestPermission();
      if (permissionResult !== 'granted') {
        addNotification('Permission denied. Please enable notifications in browser settings.', 'info');
        setLoading(false);
        return;
      }
      setPermission('granted');
      const enabled: NotificationPrefs = { order: true, funds: true, summary: true, login: true, support: true };
      setPrefs(enabled);
      localStorage.setItem(PREFS_KEY, JSON.stringify(enabled));
      addNotification('Browser notifications enabled.', 'success');
    } catch (err) {
      console.error('Failed to request permission', err);
      addNotification('Failed to enable notifications.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (key: keyof NotificationPrefs) => {
    if (permission !== 'granted') {
      addNotification('Please enable browser notifications first.', 'info');
      return;
    }
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch (err) {
      console.error('Failed to save prefs', err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold text-blue-900 dark:text-blue-100">Browser Permission</h4>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Status: <span className="font-bold uppercase">{permission}</span>
            </p>
          </div>
          {permission !== 'granted' && (
            <button
              onClick={requestPermission}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50"
            >
              {loading ? 'Requesting...' : 'Enable Push'}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">
          Notification Preferences
        </h3>

        {/* New Orders - Requires viewSales */}
        {(role === 'owner' || permissions.viewSales) && (
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-800 dark:text-gray-200">New Orders</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Get notified when a new sales email is parsed.</p>
            </div>
            <button
              onClick={() => handleToggle('order')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${prefs.order ? 'bg-green-600' : 'bg-gray-200 dark:bg-gray-700'
                }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${prefs.order ? 'translate-x-6' : 'translate-x-1'
                  }`}
              />
            </button>
          </div>
        )}

        {/* Funds Received - Requires viewFunds */}
        {(role === 'owner' || permissions.viewFunds) && (
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-800 dark:text-gray-200">Funds Received</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Get notified when payout/funds emails arrive.</p>
            </div>
            <button
              onClick={() => handleToggle('funds')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${prefs.funds ? 'bg-green-600' : 'bg-gray-200 dark:bg-gray-700'
                }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${prefs.funds ? 'translate-x-6' : 'translate-x-1'
                  }`}
              />
            </button>
          </div>
        )}


        {/* Daily Summary - Requires viewSales */}
        {(role === 'owner' || permissions.viewSales) && (
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-800 dark:text-gray-200">Daily Summary</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Receive a daily report at 00:30 UTC-7.
                {!permissions.viewFunds && role !== 'owner' && (
                  <span className="block mt-0.5 text-amber-600 dark:text-amber-400">Note: Funds data excluded (no viewFunds permission)</span>
                )}
              </p>
            </div>
            <button
              onClick={() => handleToggle('summary')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${prefs.summary ? 'bg-green-600' : 'bg-gray-200 dark:bg-gray-700'
                }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${prefs.summary ? 'translate-x-6' : 'translate-x-1'
                  }`}
              />
            </button>
          </div>
        )}


        {/* User Login - Owner only */}
        {role === 'owner' && (
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-800 dark:text-gray-200">User Login</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Get notified when team members log into dashboard.</p>
            </div>
            <button
              onClick={() => handleToggle('login')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${prefs.login ? 'bg-green-600' : 'bg-gray-200 dark:bg-gray-700'
                }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${prefs.login ? 'translate-x-6' : 'translate-x-1'
                  }`}
              />
            </button>
          </div>
        )}


        {/* Support Cases - Requires viewSales */}
        {(role === 'owner' || permissions.viewSales) && (
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-800 dark:text-gray-200">Support Cases</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Get notified about customer support cases and help requests.</p>
            </div>
            <button
              onClick={() => handleToggle('support')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${prefs.support ? 'bg-green-600' : 'bg-gray-200 dark:bg-gray-700'
                }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${prefs.support ? 'translate-x-6' : 'translate-x-1'
                  }`}
              />
            </button>
          </div>
        )}
      </div>
    </div >
  );
};

// Memoize to prevent unnecessary re-renders
export default React.memo(NotificationSettings);

