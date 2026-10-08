// Lemiex fulfillment provider (https://manage.lemiex.us) — server-side client.
// Credentials are stored per-team in the Setting table under `lemiex:{teamId}`
// (kept OUT of the shared team settings blob so the password never reaches
// regular clients via GET /api/settings).

import { prisma } from './prisma.js';

export const LEMIEX_BASE = 'https://manage.lemiex.us';

export interface LemiexConfig {
  email?: string;
  password?: string;
  apiKey?: string; // used by order-create (body auth), not by catalog reads
}

export class LemiexError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function lemiexSettingKey(teamId: string) {
  return `lemiex:${teamId}`;
}

export async function getLemiexConfig(teamId: string): Promise<LemiexConfig> {
  const row = await prisma.setting.findUnique({ where: { key: lemiexSettingKey(teamId) } });
  return ((row?.value as any) || {}) as LemiexConfig;
}

// JWT cache per team — Lemiex tokens expire after ~3600s.
const tokenCache = new Map<string, { token: string; exp: number }>();

export function clearLemiexToken(teamId: string) {
  tokenCache.delete(teamId);
}

export async function getLemiexToken(teamId: string): Promise<string> {
  const cached = tokenCache.get(teamId);
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;

  const cfg = await getLemiexConfig(teamId);
  if (!cfg.email || !cfg.password) {
    throw new LemiexError(400, 'Lemiex account is not configured');
  }

  const res = await fetch(`${LEMIEX_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: cfg.email, password: cfg.password }),
  });
  const json: any = await res.json().catch(() => ({}));
  // Live API returns data.token (docs say data.access_token) — accept both.
  const token = json?.data?.access_token || json?.data?.token;
  if (!res.ok || !token) {
    throw new LemiexError(res.status === 401 ? 401 : 502, json?.message || 'Lemiex login failed');
  }
  // Expiry: prefer the JWT's own exp claim; fall back to expires_in / 1h.
  let expMs = Date.now() + Number(json?.data?.expires_in || 3600) * 1000;
  try {
    const claims = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64').toString('utf8'));
    if (claims?.exp) expMs = claims.exp * 1000;
  } catch { /* keep fallback */ }
  tokenCache.set(teamId, { token, exp: expMs });
  return token;
}

/** GET a Lemiex endpoint with the team's JWT; re-login once on 401. */
export async function lemiexGet(teamId: string, path: string): Promise<any> {
  let token = await getLemiexToken(teamId);
  let res = await fetch(`${LEMIEX_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    clearLemiexToken(teamId);
    token = await getLemiexToken(teamId);
    res = await fetch(`${LEMIEX_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  }
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new LemiexError(res.status, json?.message || `Lemiex request failed (${res.status})`);
  }
  return json;
}
