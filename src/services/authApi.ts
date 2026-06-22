import { api, setToken, clearToken, getToken } from './apiClient';

export interface AuthUser {
  id: string;
  email: string;
  role: 'OWNER' | 'USER';
  teamId: string;
  permissions?: Record<string, boolean> | null;
  allowedAccounts?: string[] | null;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const data = await api.post<{ token: string; user: AuthUser }>('/api/auth/login', {
    email,
    password,
  });
  setToken(data.token);
  return data.user;
}

export async function register(email: string, password: string, teamName?: string): Promise<AuthUser> {
  const data = await api.post<{ token: string; user: AuthUser }>('/api/auth/register', {
    email,
    password,
    teamName,
  });
  setToken(data.token);
  return data.user;
}

export async function fetchMe(): Promise<AuthUser | null> {
  if (!getToken()) return null;
  try {
    const data = await api.get<{ user: AuthUser }>('/api/auth/me');
    return data.user;
  } catch {
    return null;
  }
}

export function logout() {
  clearToken();
}
