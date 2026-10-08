// Seller team management (full-page panel): create / rename / delete teams and
// see each team's members (assign users to teams on the Users page).

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/apiClient';

interface SellerTeamInfo {
  id: string;
  name: string;
  memberCount: number;
}

interface TeamMemberInfo {
  id: string;
  email: string;
  role: string;
  sellerCodes: string[];
  sellerTeamId: string | null;
}

const SellerTeamManager: React.FC = () => {
  const [teams, setTeams] = useState<SellerTeamInfo[]>([]);
  const [members, setMembers] = useState<TeamMemberInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingTeamName, setEditingTeamName] = useState('');

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const [{ teams: teamList }, { users }] = await Promise.all([
        api.get<{ teams: SellerTeamInfo[] }>('/api/seller-teams'),
        api.get<{ users: any[] }>('/api/users'),
      ]);
      setTeams(teamList);
      setMembers(users.map(u => ({
        id: u.id,
        email: u.email,
        role: u.role,
        sellerCodes: Array.isArray(u.sellerCodes) ? u.sellerCodes : [],
        sellerTeamId: u.sellerTeamId ?? null,
      })));
    } catch (err: any) {
      setError(err?.message || 'Failed to load teams.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newTeamName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      await api.post('/api/seller-teams', { name });
      setNewTeamName('');
      await fetchAll();
    } catch (err: any) {
      setError(err?.message || 'Failed to create team.');
    }
    setCreating(false);
  };

  const handleRename = async (teamId: string) => {
    const name = editingTeamName.trim();
    setEditingTeamId(null);
    if (!name) return;
    setError(null);
    try {
      await api.patch(`/api/seller-teams/${teamId}`, { name });
      await fetchAll();
    } catch (err: any) {
      setError(err?.message || 'Failed to rename team.');
    }
  };

  const handleDelete = async (team: SellerTeamInfo) => {
    if (!window.confirm(`Delete team "${team.name}"? Members will be unassigned (not deleted).`)) return;
    setError(null);
    try {
      await api.delete(`/api/seller-teams/${team.id}`);
      await fetchAll();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete team.');
    }
  };

  const membersOf = (teamId: string) => members.filter(m => m.sellerTeamId === teamId);
  const unassigned = members.filter(m => !m.sellerTeamId && m.role !== 'OWNER');

  if (loading) return <div className="text-center p-8 text-gray-500 dark:text-gray-400">Loading teams...</div>;

  return (
    <div className="space-y-6">
      {/* Create team */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Create New Team</h3>
        <form onSubmit={handleCreate} className="flex gap-3">
          <input
            type="text"
            placeholder="Team name (e.g. Team A)"
            value={newTeamName}
            onChange={e => setNewTeamName(e.target.value)}
            className="flex-grow px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-sm"
          />
          <button type="submit" disabled={creating || !newTeamName.trim()} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md font-semibold text-sm disabled:opacity-50">
            {creating ? 'Adding…' : 'Add Team'}
          </button>
        </form>
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
      </div>

      {/* Teams list */}
      {teams.length === 0 ? (
        <div className="text-center py-10 text-gray-500 dark:text-gray-400 text-sm">
          No teams yet — create one above, then assign sellers on the Users page.
        </div>
      ) : (
        <div className="space-y-4">
          {teams.map(team => {
            const teamMembers = membersOf(team.id);
            return (
              <div key={team.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-center justify-between mb-3">
                  {editingTeamId === team.id ? (
                    <input
                      autoFocus
                      value={editingTeamName}
                      onChange={e => setEditingTeamName(e.target.value)}
                      onBlur={() => handleRename(team.id)}
                      onKeyDown={e => { if (e.key === 'Enter') handleRename(team.id); if (e.key === 'Escape') setEditingTeamId(null); }}
                      className="px-2 py-1 text-base font-semibold bg-gray-50 dark:bg-gray-700 border border-blue-400 rounded-md flex-grow mr-3"
                    />
                  ) : (
                    <div className="flex items-center gap-3 min-w-0">
                      <h4 className="text-base font-semibold text-gray-900 dark:text-white truncate">{team.name}</h4>
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 whitespace-nowrap">
                        {teamMembers.length} member{teamMembers.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => { setEditingTeamId(team.id); setEditingTeamName(team.name); }}
                      className="p-2 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
                      title="Rename team"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(team)}
                      className="p-2 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20"
                      title="Delete team"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Members */}
                {teamMembers.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500">No members yet — assign users to this team on the Users page.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {teamMembers.map(m => (
                      <span key={m.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-xs text-gray-800 dark:text-gray-200">
                        <span className={`w-1.5 h-1.5 rounded-full ${m.role === 'LEADER' ? 'bg-purple-500' : 'bg-gray-400'}`} />
                        {m.email}
                        {m.sellerCodes.length > 0 && (
                          <span className="font-mono text-gray-500 dark:text-gray-400">[{m.sellerCodes.join(',')}]</span>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Unassigned users hint */}
      {unassigned.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/40 rounded-lg p-4">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-400 mb-2">
            {unassigned.length} user{unassigned.length !== 1 ? 's' : ''} without a team:
          </p>
          <div className="flex flex-wrap gap-2">
            {unassigned.map(m => (
              <span key={m.id} className="px-2.5 py-1 rounded-full bg-white dark:bg-gray-800 border border-amber-200 dark:border-amber-900/40 text-xs text-gray-700 dark:text-gray-300">
                {m.email}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SellerTeamManager;
