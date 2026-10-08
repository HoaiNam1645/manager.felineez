// Multi-provider POD factory clients (MangoTee, Vinaway, MonkeyKing, Dreamship)
// — server-side only. Same storage pattern as Lemiex: per-team Setting rows
// `{provider}:{teamId}` so secrets never reach regular clients.

import { prisma } from './prisma.js';

export type FactoryProvider = 'mango' | 'vinaway' | 'monkeyking' | 'dreamship' | 'hongphat' | 'hogoto';

export const MANGO_BASE = 'https://v3.mangoteeprints.com/api/public/v1';
export const VINAWAY_BASE = 'https://api.vinaway.io/api';
export const MONKEYKING_BASE = 'https://monkeykingprint.com/rest/V1';
export const DREAMSHIP_BASE = 'https://api.dreamship.com/v1';
export const HONGPHAT_BASE = 'https://hongphatembroidery.com/api/v1';
export const HOGOTO_BASE = 'https://seller.hogotopod.com/api';

export class FactoryError extends Error {
  constructor(public status: number, message: string, public data?: any) {
    super(message);
  }
}

export function factorySettingKey(provider: FactoryProvider, teamId: string) {
  return `${provider}:${teamId}`;
}

export interface MangoConfig { apiKey?: string }
export interface VinawayConfig { email?: string; password?: string }
export interface MonkeyKingConfig { username?: string; password?: string }
export interface DreamshipConfig { apiKey?: string }
export interface HongPhatConfig { apiKey?: string }
export interface HogotoConfig { apiKey?: string; tenant?: string }

export async function getFactoryConfig<T = any>(provider: FactoryProvider, teamId: string): Promise<T> {
  const row = await prisma.setting.findUnique({ where: { key: factorySettingKey(provider, teamId) } });
  return ((row?.value as any) || {}) as T;
}

// ---------- MangoTee: X-API-Key header ----------

export async function mangoFetch(teamId: string, path: string, init?: RequestInit): Promise<any> {
  const cfg = await getFactoryConfig<MangoConfig>('mango', teamId);
  if (!cfg.apiKey) throw new FactoryError(400, 'MangoTee API key is not configured');
  const res = await fetch(`${MANGO_BASE}${path}`, {
    ...init,
    headers: {
      'X-API-Key': cfg.apiKey,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const json: any = await res.json().catch(() => ({}));
  // Mango envelope: { status, code, message, data }
  if (!res.ok || json?.status === false) {
    throw new FactoryError(
      res.status >= 400 && res.status < 500 ? res.status : 502,
      json?.message || `MangoTee request failed (${res.status})`,
      json?.data
    );
  }
  return json;
}

// ---------- Vinaway: Bearer token from POST /token (expires_in ~5h) ----------

const vinawayTokens = new Map<string, { token: string; exp: number }>();

export function clearVinawayToken(teamId: string) {
  vinawayTokens.delete(teamId);
}

export async function getVinawayToken(teamId: string): Promise<string> {
  const cached = vinawayTokens.get(teamId);
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;

  const cfg = await getFactoryConfig<VinawayConfig>('vinaway', teamId);
  if (!cfg.email || !cfg.password) throw new FactoryError(400, 'Vinaway account is not configured');

  let res: Response;
  try {
    res = await fetch(`${VINAWAY_BASE}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: cfg.email, password: cfg.password }),
    });
  } catch (e: any) {
    // Their SSL certificate was expired at integration time — surface clearly.
    throw new FactoryError(502, `Cannot reach Vinaway (${e?.cause?.code || e?.message || 'network error'}) — check their SSL certificate`);
  }
  const json: any = await res.json().catch(() => ({}));
  const token = json?.access_token;
  if (!res.ok || !token) {
    throw new FactoryError(res.status === 401 || res.status === 422 ? 401 : 502, json?.message || 'Vinaway login failed');
  }
  const expiresIn = Number(json?.expires_in || 18000);
  vinawayTokens.set(teamId, { token, exp: Date.now() + expiresIn * 1000 });
  return token;
}

export async function vinawayFetch(teamId: string, path: string, init?: RequestInit): Promise<any> {
  let token = await getVinawayToken(teamId);
  const doFetch = async (t: string) => {
    try {
      return await fetch(`${VINAWAY_BASE}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${t}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(init?.headers || {}),
        },
      });
    } catch (e: any) {
      throw new FactoryError(502, `Cannot reach Vinaway (${e?.cause?.code || e?.message || 'network error'}) — check their SSL certificate`);
    }
  };
  let res = await doFetch(token);
  if (res.status === 401) {
    clearVinawayToken(teamId);
    token = await getVinawayToken(teamId);
    res = await doFetch(token);
  }
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new FactoryError(res.status >= 400 && res.status < 500 ? res.status : 502, json?.message || `Vinaway request failed (${res.status})`, json?.errors);
  }
  return json;
}

// ---------- MonkeyKing: Magento customer token (POST returns a bare string) ----------

const monkeyKingTokens = new Map<string, { token: string; exp: number }>();

export function clearMonkeyKingToken(teamId: string) {
  monkeyKingTokens.delete(teamId);
}

export async function getMonkeyKingToken(teamId: string): Promise<string> {
  const cached = monkeyKingTokens.get(teamId);
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;

  const cfg = await getFactoryConfig<MonkeyKingConfig>('monkeyking', teamId);
  if (!cfg.username || !cfg.password) throw new FactoryError(400, 'MonkeyKing account is not configured');

  const res = await fetch(`${MONKEYKING_BASE}/integration/customer/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: cfg.username, password: cfg.password }),
  });
  const json: any = await res.json().catch(() => null);
  // Magento returns the token as a bare JSON string; errors as {message,...}
  if (!res.ok || typeof json !== 'string' || !json) {
    const msg = (json && typeof json === 'object' && json.message) || 'MonkeyKing login failed';
    throw new FactoryError(res.status === 401 ? 401 : res.status >= 400 && res.status < 500 ? res.status : 502, msg);
  }
  // Magento customer tokens default to a 1-hour lifetime; refresh a bit early.
  monkeyKingTokens.set(teamId, { token: json, exp: Date.now() + 50 * 60_000 });
  return json;
}

export async function monkeyKingFetch(teamId: string, path: string, init?: RequestInit): Promise<any> {
  let token = await getMonkeyKingToken(teamId);
  const doFetch = (t: string) =>
    fetch(`${MONKEYKING_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${t}`,
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    });
  let res = await doFetch(token);
  if (res.status === 401) {
    clearMonkeyKingToken(teamId);
    token = await getMonkeyKingToken(teamId);
    res = await doFetch(token);
  }
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Magento error shape: { message: "...", parameters: {...} }
    throw new FactoryError(
      res.status >= 400 && res.status < 500 ? res.status : 502,
      (json && json.message) || `MonkeyKing request failed (${res.status})`,
      json?.parameters
    );
  }
  return json;
}

// ---------- Dreamship: static Bearer API key ----------

export async function dreamshipFetch(teamId: string, path: string, init?: RequestInit): Promise<any> {
  const cfg = await getFactoryConfig<DreamshipConfig>('dreamship', teamId);
  if (!cfg.apiKey) throw new FactoryError(400, 'Dreamship API key is not configured');
  const res = await fetch(`${DREAMSHIP_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    // DRF errors: {"detail": "..."} or per-field {"field": ["msg"]}
    const msg = json?.detail || json?.message || `Dreamship request failed (${res.status})`;
    throw new FactoryError(res.status >= 400 && res.status < 500 ? res.status : 502, msg, json);
  }
  return json;
}

// ---------- Hong Phat Embroidery: static Bearer token (hp_live_…) ----------
// Errors come back as { success: false, error: "invalid_token" | … }.

export async function hongPhatFetch(teamId: string, path: string, init?: RequestInit): Promise<any> {
  const cfg = await getFactoryConfig<HongPhatConfig>('hongphat', teamId);
  if (!cfg.apiKey) throw new FactoryError(400, 'Hong Phat API token is not configured');
  const res = await fetch(`${HONGPHAT_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) {
    const msg = json?.error || json?.message || `Hong Phat request failed (${res.status})`;
    throw new FactoryError(res.status >= 400 && res.status < 500 ? res.status : 502, msg, json?.errors ?? json?.data);
  }
  return json;
}

// ---------- Hogoto POD: X-API-Key + X-Tenant headers ----------
// Spring Boot API at seller.hogotopod.com/api. X-Tenant is REQUIRED alongside
// the API key (verified live: "X-Tenant header is required when using X-API-Key").
// /v1/product returns a bare array; partner endpoints return ApiResult objects
// and auth errors as {error, error_description}.

export async function hogotoFetch(teamId: string, path: string, init?: RequestInit): Promise<any> {
  const cfg = await getFactoryConfig<HogotoConfig>('hogoto', teamId);
  if (!cfg.apiKey) throw new FactoryError(400, 'Hogoto API key is not configured');
  if (!cfg.tenant) throw new FactoryError(400, 'Hogoto tenant is not configured');
  const res = await fetch(`${HOGOTO_BASE}${path}`, {
    ...init,
    headers: {
      'X-API-Key': cfg.apiKey,
      'X-Tenant': cfg.tenant,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || (json && typeof json === 'object' && !Array.isArray(json) && json.error)) {
    // json.error is a boolean in ApiResult and a string in auth errors
    const msg = json?.error_description || json?.message
      || (typeof json?.error === 'string' ? json.error : '')
      || `Hogoto request failed (${res.status})`;
    throw new FactoryError(res.status >= 400 && res.status < 500 ? res.status : 502, msg, json?.errors ?? json?.result ?? json?.data);
  }
  return json;
}
