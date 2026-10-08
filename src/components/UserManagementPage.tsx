// Full-screen User Management page (owner only) — owns the /users and /teams
// routes, following the ProductManager overlay pattern: it reads the URL itself
// and renders on top of the dashboard.

import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDashboard } from '../contexts/DashboardContext';
import UserManager from './UserManager';
import SellerTeamManager from './SellerTeamManager';

const CloseIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const UserManagementPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { role } = useDashboard();

  const seg = location.pathname.split('/').filter(Boolean)[0];
  const isOpen = seg === 'users' || seg === 'teams';
  if (!isOpen) return null;

  const close = () => navigate('/overview');

  // Owner: full access (Users + Teams). Leader: Users only, scoped to their team.
  const isLeader = role === 'leader';
  if (role !== 'owner' && role !== 'leader') {
    return (
      <div className="fixed inset-0 z-50 bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-8 text-center max-w-sm">
          <p className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Owner access only</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">You don't have permission to manage users and teams.</p>
          <button onClick={close} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium text-sm">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const subTabs: { key: 'users' | 'teams'; label: string; path: string }[] = isLeader
    ? [{ key: 'users', label: 'Users', path: '/users' }]
    : [
        { key: 'users', label: 'Users', path: '/users' },
        { key: 'teams', label: 'Teams', path: '/teams' },
      ];

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 dark:bg-gray-900 overflow-y-auto">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 md:px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <h1 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white whitespace-nowrap">User Management</h1>
          {/* Sub-nav pills */}
          <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            {subTabs.map(t => (
              <button
                key={t.key}
                onClick={() => navigate(t.path)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${seg === t.key
                  ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-300 shadow-sm'
                  : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={close} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 flex-shrink-0" title="Close">
          <CloseIcon />
        </button>
      </div>

      {/* Body */}
      <div className="max-w-5xl mx-auto p-4 md:p-6">
        {seg === 'users' || isLeader ? <UserManager /> : <SellerTeamManager />}
      </div>
    </div>
  );
};

export default UserManagementPage;
