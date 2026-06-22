import { useCallback, useEffect, useState } from 'react';
import { fetchMe, logout as logoutApi, AuthUser } from '../services/authApi';

/**
 * Backwards-compatible shape used by App.tsx & contexts:
 *   user        => minimal { uid, email }
 *   userProfile => { teamId, role: 'owner'|'user' (lowercase), permissions, ... }
 *
 * The API returns role in UPPERCASE ('OWNER'|'USER'); we normalize to lowercase
 * here so the rest of the app doesn't need to change.
 */

export interface User {
  uid: string;
  email: string | null;
}

export interface UserProfile {
  teamId: string;
  role: 'owner' | 'user';
  permissions: { [key: string]: boolean };
  allowedAccounts?: string[];
  email?: string;
  [key: string]: any;
}

function toLegacy(u: AuthUser): { user: User; profile: UserProfile } {
  return {
    user: { uid: u.id, email: u.email },
    profile: {
      teamId: u.teamId,
      role: u.role === 'OWNER' ? 'owner' : 'user',
      permissions: (u.permissions as { [k: string]: boolean }) || {},
      allowedAccounts: (u.allowedAccounts as string[] | undefined) || undefined,
      email: u.email,
    },
  };
}

export const useAuthLogic = () => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const me = await fetchMe();
      if (me) {
        const { user, profile } = toLegacy(me);
        setUser(user);
        setUserProfile(profile);
      } else {
        setUser(null);
        setUserProfile(null);
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Auth check failed');
      setUser(null);
      setUserProfile(null);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onAuthChanged = () => refresh();
    window.addEventListener('nh:auth-changed', onAuthChanged);
    return () => window.removeEventListener('nh:auth-changed', onAuthChanged);
  }, [refresh]);

  const logout = useCallback(async () => {
    logoutApi();
    setUser(null);
    setUserProfile(null);
    window.dispatchEvent(new CustomEvent('nh:auth-changed'));
  }, []);

  return {
    user,
    userProfile,
    authLoading,
    authError,
    logout,
    refresh,
  };
};
