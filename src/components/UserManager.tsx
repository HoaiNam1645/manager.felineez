
// components/UserManager.tsx
//
// Admin-style user management: a searchable table listing all users, with
// separate Create / Edit modals (explicit Save — no auto-save) and a Delete
// confirmation. Lives on the /users page (UserManagementPage).

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useDashboard } from '../contexts/DashboardContext';
import { api } from '../services/apiClient';
import { Account } from '../types';
import Spinner from './Spinner';

// ==============================
// Types & helpers
// ==============================

type RoleLower = 'owner' | 'leader' | 'user' | 'fulfillment' | 'design';

interface UserPermissions {
  viewSales: boolean;
  viewFunds: boolean;
  viewFulfill: boolean;
  canManageSettings: boolean;
  viewKpi: boolean;
}

interface UserRow {
  id: string;
  email: string;
  role: RoleLower;
  permissions: UserPermissions;
  allowedAccounts: string[];
  sellerCodes: string[];
  sellerTeamId: string | null;
}

interface SellerTeamInfo {
  id: string;
  name: string;
  memberCount: number;
}

const DEFAULT_PERMISSIONS: UserPermissions = {
  viewSales: false,
  viewFunds: false,
  viewFulfill: false,
  canManageSettings: false,
  viewKpi: false,
};

const PERMISSION_KEYS: (keyof UserPermissions)[] = ['viewSales', 'viewFunds', 'viewFulfill', 'canManageSettings', 'viewKpi'];
const PERMISSION_LABELS: { [key: string]: string } = {
  viewSales: 'Sales', viewFunds: 'Funds', viewFulfill: 'Cost', canManageSettings: 'Mail Edit', viewKpi: 'KPI',
};

const ROLE_BADGE: { [r in RoleLower]: string } = {
  owner: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  leader: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  fulfillment: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  design: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  user: 'bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-200',
};

const toUpperRole = (r: RoleLower) => (r === 'owner' ? 'OWNER' : r === 'leader' ? 'LEADER' : r === 'fulfillment' ? 'FULFILLMENT' : r === 'design' ? 'DESIGN' : 'USER');

// Parse "na, MA" → ["NA","MA"] (dedup; server validates the 2-char rule strictly)
const parseCodesInput = (input: string): string[] => {
  const out: string[] = [];
  input.split(',').forEach(part => {
    const code = part.trim().toUpperCase();
    if (code && !out.includes(code)) out.push(code);
  });
  return out;
};

const inputCls = 'w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-sm';
const labelCls = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1';

// ==============================
// AccountSelectionModal (allowed mail accounts picker)
// ==============================

interface AccountSelectionModalProps {
  userEmail: string;
  initialSelected: string[];
  allMailAccounts: Account[];
  onSave: (allowedAccounts: string[]) => void;
  onClose: () => void;
}

const AccountSelectionModal: React.FC<AccountSelectionModalProps> = ({ userEmail, initialSelected, allMailAccounts, onSave, onClose }) => {
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(initialSelected);
  const [searchTerm, setSearchTerm] = useState('');

  const handleToggleAccount = (email: string) => {
    setSelectedAccounts(prev =>
      prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]
    );
  };

  const filteredAccounts = allMailAccounts.filter(acc =>
    (acc.label || acc.email).toLowerCase().includes(searchTerm.toLowerCase()) ||
    acc.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelectAllFiltered = (isChecked: boolean) => {
    const filteredEmails = new Set(filteredAccounts.map(a => a.email));
    if (isChecked) {
      setSelectedAccounts(prev => Array.from(new Set([...prev, ...filteredEmails])));
    } else {
      setSelectedAccounts(prev => prev.filter(email => !filteredEmails.has(email)));
    }
  };

  const isAllFilteredSelected = filteredAccounts.length > 0 && filteredAccounts.every(acc => selectedAccounts.includes(acc.email));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[80] p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg border border-gray-200 dark:border-gray-700 flex flex-col h-[600px] max-h-[85vh]" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start p-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="font-semibold text-lg text-gray-900 dark:text-white">Allowed accounts for</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-xs">{userEmail}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-3 border-b border-gray-200 dark:border-gray-700">
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className={inputCls}
          />
          <label className="flex items-center space-x-2 text-sm font-medium text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              checked={isAllFilteredSelected}
              onChange={e => handleSelectAllFiltered(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500"
            />
            <span>Select all ({filteredAccounts.length})</span>
          </label>
        </div>

        <div className="flex-grow overflow-y-auto p-2 space-y-1">
          {filteredAccounts.map(account => {
            const isSelected = selectedAccounts.includes(account.email);
            return (
              <label key={account.id} className={`flex items-center space-x-3 p-2 rounded-md border cursor-pointer transition-colors duration-150 ${isSelected ? 'bg-blue-50 dark:bg-blue-900/40 border-blue-400 dark:border-blue-600' : 'bg-transparent border-transparent hover:bg-gray-100 dark:hover:bg-gray-700/50'}`}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => handleToggleAccount(account.email)}
                  className="rounded h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-grow min-w-0">
                  <p className="font-medium text-gray-800 dark:text-gray-100 truncate" title={account.label || account.email}>{account.label || account.email}</p>
                  {account.label && <p className="text-xs text-gray-500 dark:text-gray-400 truncate" title={account.email}>{account.email}</p>}
                </div>
              </label>
            );
          })}
          {filteredAccounts.length === 0 && (
            <p className="text-center py-8 text-sm text-gray-500">No accounts match your search.</p>
          )}
        </div>

        <div className="p-4 flex justify-end gap-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-600 rounded-md font-semibold text-gray-800 dark:text-gray-100 text-sm">
            Cancel
          </button>
          <button onClick={() => onSave(selectedAccounts)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold text-sm">
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

// ==============================
// Create / Edit user modal (shared form)
// ==============================

interface UserFormModalProps {
  mode: 'create' | 'edit';
  user?: UserRow; // required in edit mode
  sellerTeams: SellerTeamInfo[];
  allMailAccounts: Account[];
  onClose: () => void;
  onDone: () => void; // refetch after successful save
  // Leader mode: team is locked to the leader's team
  // (the API enforces the same rules server-side).
  leaderMode?: boolean;
  leaderTeamId?: string | null;
}

const UserFormModal: React.FC<UserFormModalProps> = ({ mode, user, sellerTeams, allMailAccounts, onClose, onDone, leaderMode = false, leaderTeamId = null }) => {
  const isEdit = mode === 'edit';
  const isOwnerRow = isEdit && user!.role === 'owner';

  const [email, setEmail] = useState(isEdit ? user!.email : '');
  const [password, setPassword] = useState(''); // create: required; edit: optional reset
  const [role, setRole] = useState<RoleLower>(isEdit ? user!.role : 'user');
  const [codesText, setCodesText] = useState(isEdit ? (user!.sellerCodes || []).join(', ') : '');
  const [teamId, setTeamId] = useState(isEdit ? (user!.sellerTeamId ?? '') : (leaderMode ? (leaderTeamId ?? '') : ''));
  const [permissions, setPermissions] = useState<UserPermissions>(
    isEdit ? { ...DEFAULT_PERMISSIONS, ...user!.permissions } : { ...DEFAULT_PERMISSIONS }
  );
  const [allowedAccounts, setAllowedAccounts] = useState<string[]>(isEdit ? (user!.allowedAccounts || []) : []);
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isEdit && (!email || !password)) {
      setError('Email and Password are required.');
      return;
    }
    if (password && password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        await api.patch(`/api/users/${user!.id}`, {
          ...(isOwnerRow ? {} : { role: toUpperRole(role) }),
          permissions,
          allowedAccounts,
          sellerCodes: parseCodesInput(codesText),
          sellerTeamId: teamId || null,
          ...(password ? { password } : {}),
        });
      } else {
        await api.post('/api/users', {
          email,
          password,
          role: toUpperRole(role),
          permissions,
          allowedAccounts,
          sellerCodes: parseCodesInput(codesText),
          sellerTeamId: teamId || null,
        });
      }
      onDone();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save user.');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[70] p-4 animate-modal-backdrop" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col border border-gray-200 dark:border-gray-700 animate-modal-scale"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              {isEdit ? 'Edit User' : 'Create New User'}
            </h2>
            {isEdit && <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{user!.email}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-grow overflow-y-auto p-6 space-y-5">
          {!isEdit && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Email *</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} placeholder="user@example.com" />
              </div>
              <div>
                <label className={labelCls}>Password *</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} className={inputCls} placeholder="Min 6 characters" />
              </div>
            </div>
          )}

          {isEdit && (
            <div>
              <label className={labelCls}>Reset Password (optional)</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} className={inputCls} placeholder="Leave blank to keep current password" />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Role</label>
              {isOwnerRow ? (
                <div className={`${inputCls} bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-300 cursor-not-allowed`}>Owner</div>
              ) : (
                <select value={role} onChange={e => setRole(e.target.value as RoleLower)} className={inputCls}>
                  <option value="user">User</option>
                  <option value="leader">Leader</option>
                  <option value="fulfillment">Fulfillment</option>
                  <option value="design">Design</option>
                  {!leaderMode && <option value="owner">Owner</option>}
                </select>
              )}
            </div>
            <div>
              <label className={labelCls}>Seller SKU</label>
              <input
                type="text"
                value={codesText}
                onChange={e => setCodesText(e.target.value.toUpperCase())}
                className={`${inputCls} font-mono uppercase`}
                placeholder="e.g. NA, MA"
              />
            </div>
            <div>
              <label className={labelCls}>Team</label>
              {leaderMode ? (
                <div className={`${inputCls} bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-300 cursor-not-allowed`}>
                  {sellerTeams.find(t => t.id === leaderTeamId)?.name || '—'}
                </div>
              ) : (
                <select value={teamId} onChange={e => setTeamId(e.target.value)} className={inputCls}>
                  <option value="">— No team —</option>
                  {sellerTeams.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {!isOwnerRow && (
            <>
              <div>
                <label className={labelCls}>Permissions</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-md p-3">
                  {PERMISSION_KEYS.map(key => (
                    <label key={key} className="flex items-center space-x-2 text-sm text-gray-700 dark:text-gray-200">
                      <input
                        type="checkbox"
                        checked={permissions[key] || false}
                        onChange={e => setPermissions(prev => ({ ...prev, [key]: e.target.checked }))}
                        className="rounded"
                      />
                      <span>{PERMISSION_LABELS[key]}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className={labelCls}>Allowed Mail Accounts</label>
                <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-md p-3">
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {allowedAccounts.length === 0 ? 'No accounts selected (sees nothing)' : `${allowedAccounts.length} account${allowedAccounts.length !== 1 ? 's' : ''} selected`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAccountPicker(true)}
                    className="px-3 py-1.5 text-xs font-semibold bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md hover:bg-gray-50 dark:hover:bg-gray-500"
                  >
                    Manage
                  </button>
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-lg flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-500 text-gray-700 dark:text-white rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 font-medium text-sm">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold text-sm disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Spinner size="sm" color="text-white" />}
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create User'}
          </button>
        </div>

        {/* Nested: allowed accounts picker */}
        {showAccountPicker && (
          <AccountSelectionModal
            userEmail={isEdit ? user!.email : email || '(new user)'}
            initialSelected={allowedAccounts}
            allMailAccounts={allMailAccounts}
            onSave={(selected) => { setAllowedAccounts(selected); setShowAccountPicker(false); }}
            onClose={() => setShowAccountPicker(false)}
          />
        )}
      </div>
    </div>
  );
};

// ==============================
// Main: users table
// ==============================

const UserManager: React.FC = () => {
  const { accounts: allMailAccounts, role: myRole, user: authUser } = useDashboard();
  const isLeader = myRole === 'leader';
  const [users, setUsers] = useState<UserRow[]>([]);
  const [sellerTeams, setSellerTeams] = useState<SellerTeamInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<UserRow | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const [{ users: list }, { teams }] = await Promise.all([
        api.get<{ users: any[] }>('/api/users'),
        api.get<{ teams: SellerTeamInfo[] }>('/api/seller-teams'),
      ]);
      setUsers(list.map((u): UserRow => ({
        id: u.id,
        email: u.email,
        role: u.role === 'OWNER' ? 'owner' : u.role === 'LEADER' ? 'leader' : u.role === 'FULFILLMENT' ? 'fulfillment' : u.role === 'DESIGN' ? 'design' : 'user',
        permissions: { ...DEFAULT_PERMISSIONS, ...((u.permissions as any) || {}) },
        allowedAccounts: u.allowedAccounts || [],
        sellerCodes: Array.isArray(u.sellerCodes) ? u.sellerCodes : [],
        sellerTeamId: u.sellerTeamId ?? null,
      })));
      setSellerTeams(teams);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to load users.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const teamNameOf = useCallback(
    (teamId: string | null) => (teamId ? sellerTeams.find(t => t.id === teamId)?.name ?? '—' : '—'),
    [sellerTeams]
  );

  // Leader scope: their own seller team id (from their row in the users list)
  const myTeamId = useMemo(() => {
    if (!isLeader) return null;
    const me = users.find(u => u.email.toLowerCase() === (authUser?.email || '').toLowerCase());
    return me?.sellerTeamId ?? null;
  }, [isLeader, users, authUser?.email]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const roleOrder: { [r in RoleLower]: number } = { owner: 0, leader: 1, fulfillment: 2, design: 3, user: 4 };
    // Leaders see and manage every non-owner account inside their own seller team.
    const scoped = isLeader
      ? users.filter(u => u.role !== 'owner' && myTeamId != null && u.sellerTeamId === myTeamId)
      : users;
    const list = q
      ? scoped.filter(u =>
          u.email.toLowerCase().includes(q) ||
          u.sellerCodes.some(c => c.toLowerCase().includes(q)) ||
          teamNameOf(u.sellerTeamId).toLowerCase().includes(q)
        )
      : scoped;
    return [...list].sort((a, b) => roleOrder[a.role] - roleOrder[b.role] || a.email.localeCompare(b.email));
  }, [users, search, teamNameOf, isLeader, myTeamId]);

  const handleDeleteUser = async (userId: string) => {
    setDeletingUserId(userId);
    try {
      await api.delete(`/api/users/${userId}`);
      await fetchAll();
      setConfirmDeleteUser(null);
    } catch (err: any) {
      console.error(err);
      alert(`Error deleting user: ${err.message}`);
    } finally {
      setDeletingUserId(null);
    }
  };

  if (loading) return <div className="text-center p-8 text-gray-500 dark:text-gray-400">Loading users...</div>;
  if (error) return <div className="text-center p-8 text-red-500">{error}</div>;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-grow max-w-sm">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search email, code, team..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={`${inputCls} pl-9`}
          />
        </div>
        <button
          onClick={() => setIsCreateOpen(true)}
          disabled={isLeader && !myTeamId}
          title={isLeader && !myTeamId ? 'You have no seller team assigned' : undefined}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-semibold text-sm whitespace-nowrap flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          Create User
        </button>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Team</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Seller SKU</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Permissions</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Mail Accts</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
              {filteredUsers.map(user => (
                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white max-w-[220px] truncate" title={user.email}>{user.email}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium uppercase ${ROLE_BADGE[user.role]}`}>{user.role}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">{teamNameOf(user.sellerTeamId)}</td>
                  <td className="px-4 py-3">
                    {user.sellerCodes.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {user.sellerCodes.map(c => (
                          <span key={c} className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 font-mono text-xs text-gray-700 dark:text-gray-300">{c}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {user.role === 'owner' ? (
                      <span className="text-xs text-gray-400 dark:text-gray-500">All</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {PERMISSION_KEYS.filter(k => user.permissions[k]).map(k => (
                          <span key={k} className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/30 text-xs text-emerald-700 dark:text-emerald-400">{PERMISSION_LABELS[k]}</span>
                        ))}
                        {PERMISSION_KEYS.every(k => !user.permissions[k]) && <span className="text-gray-400 dark:text-gray-500">—</span>}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300 tabular-nums">
                    {user.role === 'owner' ? 'All' : user.allowedAccounts.length}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditUser(user)}
                        className="p-1.5 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
                        title="Edit user"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setConfirmDeleteUser(user)}
                        className="p-1.5 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20"
                        title="Delete user"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-500 dark:text-gray-400">
                    {search ? 'No users match your search.' : 'No users yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
          {filteredUsers.length} of {users.length} user{users.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Create modal */}
      {isCreateOpen && (
        <UserFormModal
          mode="create"
          sellerTeams={sellerTeams}
          allMailAccounts={allMailAccounts}
          onClose={() => setIsCreateOpen(false)}
          onDone={fetchAll}
          leaderMode={isLeader}
          leaderTeamId={myTeamId}
        />
      )}

      {/* Edit modal */}
      {editUser && (
        <UserFormModal
          mode="edit"
          user={editUser}
          sellerTeams={sellerTeams}
          allMailAccounts={allMailAccounts}
          onClose={() => setEditUser(null)}
          onDone={fetchAll}
          leaderMode={isLeader}
          leaderTeamId={myTeamId}
        />
      )}

      {/* Delete confirmation */}
      {confirmDeleteUser && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4"
          onClick={() => setConfirmDeleteUser(null)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-red-100 dark:bg-red-900/30 rounded-full">
              <svg className="h-6 w-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <h3 className="text-xl font-bold text-center text-gray-900 dark:text-white mb-2">Delete User?</h3>

            <div className="bg-gray-100 dark:bg-gray-700 p-3 rounded-lg mb-4">
              <p className="font-semibold text-center text-gray-900 dark:text-white">{confirmDeleteUser.email}</p>
              <p className="text-sm text-center text-gray-500 dark:text-gray-400 mt-1">Role: {confirmDeleteUser.role}</p>
            </div>

            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-6">
              <p className="text-sm text-red-800 dark:text-red-200 font-medium">
                ⚠️ The user will no longer be able to log in. This cannot be undone!
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteUser(null)}
                disabled={deletingUserId === confirmDeleteUser.id}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-800 dark:text-white rounded-md font-semibold disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteUser(confirmDeleteUser.id)}
                disabled={deletingUserId === confirmDeleteUser.id}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deletingUserId === confirmDeleteUser.id ? (
                  <>
                    <Spinner size="sm" color="text-white" />
                    Deleting...
                  </>
                ) : (
                  'Yes, Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Memoize to prevent unnecessary re-renders
export default React.memo(UserManager);
