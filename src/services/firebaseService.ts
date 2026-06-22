/**
 * firebaseService.ts — MySQL/Prisma adapter
 *
 * This file used to wrap Firestore. It has been rewritten to call the REST API
 * (which talks to MySQL via Prisma). The exported function signatures are kept
 * compatible so callers across the app continue to work.
 *
 * - The `teamId` parameter is preserved in signatures but the backend infers
 *   the team from the JWT token, so it's effectively ignored.
 * - The `listenForXxx` functions used to subscribe via Firestore onSnapshot.
 *   They now use polling (default every 30s). Return value is still an
 *   unsubscribe function.
 * - `db` and `auth` exports are stubs that throw on access. Frontend code
 *   should not reach for them directly anymore; if you hit the throw, that
 *   means a usage site needs to be migrated to the API client.
 */

import { api } from './apiClient';
import { Account, Record } from '../types';

// --- Stubs for legacy Firebase exports ------------------------------------

const FIREBASE_REMOVED_ERROR = new Error(
  '[firebaseService] Firebase has been removed; migrate this call to the REST API.'
);

const throwingProxy = new Proxy(
  {},
  {
    get() {
      throw FIREBASE_REMOVED_ERROR;
    },
  }
) as any;

export const db = throwingProxy;
export const auth = throwingProxy;

export const getMessagingInstance = async () => {
  // FCM disabled — switch to Web Push API or a new provider when needed.
  return null;
};

// --- Helpers --------------------------------------------------------------

function mapAccount(raw: any): Account {
  return {
    id: raw.id,
    email: raw.email,
    label: raw.label ?? '',
    provider: (raw.provider === 'OUTLOOK' ? 'outlook' : 'gmail') as 'gmail' | 'outlook',
    token: raw.token,
    last_synced_at: raw.lastSyncedAt ?? undefined,
    order: raw.sortOrder ?? undefined,
    history_synced_until: raw.historySyncedUntil ?? undefined,
    historical_sync_complete: raw.historicalSyncComplete ?? undefined,
    scan_start_date: raw.scanStartDate ?? undefined,
    lastKnownHistoryId: raw.lastKnownHistoryId ?? undefined,
    platforms: raw.platforms ?? undefined,
  };
}

function accountToApi(a: Partial<Account>) {
  return {
    email: a.email,
    label: a.label,
    provider: a.provider,
    token: a.token,
    lastSyncedAt: a.last_synced_at,
    sortOrder: a.order,
    historySyncedUntil: a.history_synced_until,
    historicalSyncComplete: a.historical_sync_complete,
    scanStartDate: a.scan_start_date,
    lastKnownHistoryId: a.lastKnownHistoryId,
    platforms: a.platforms,
  };
}

function mapRecord(raw: any): Record {
  return {
    id: raw.id,
    email_id: raw.emailId ?? undefined,
    dt_local: raw.dtLocal,
    amount: Number(raw.amount ?? 0),
    order_id: raw.orderId ?? null,
    currency: raw.currency ?? null,
    source: raw.source ?? '',
    account: raw.accountEmail ?? '',
    kind: (String(raw.kind).toLowerCase() === 'funds'
      ? 'Funds'
      : (String(raw.kind).toLowerCase() as 'order' | 'case' | 'help')) as Record['kind'],
    case_msg: raw.caseMsg ?? null,
    help_kind: raw.helpKind ?? null,
    cost_total: raw.costTotal != null ? Number(raw.costTotal) : undefined,
    ff_code: raw.ffCode ?? undefined,
    product_name: raw.productName ?? undefined,
    details: raw.details ?? undefined,
  };
}

// --- Accounts -------------------------------------------------------------

export const getAccountsFromFirebase = async (_teamId: string): Promise<Account[]> => {
  const { accounts } = await api.get<{ accounts: any[] }>('/api/accounts');
  return accounts.map(mapAccount);
};

export const listenForAccounts = (
  _teamId: string,
  callback: (accounts: Account[]) => void
): (() => void) => {
  let cancelled = false;
  const tick = async () => {
    if (cancelled) return;
    try {
      const accounts = await getAccountsFromFirebase(_teamId);
      callback(accounts);
    } catch (e) {
      console.warn('[listenForAccounts] poll failed', e);
    }
  };
  tick();
  const interval = setInterval(tick, 30000);
  // Immediate refresh after mutations
  const onMutated = () => tick();
  window.addEventListener('nh:accounts-changed', onMutated);
  return () => {
    cancelled = true;
    clearInterval(interval);
    window.removeEventListener('nh:accounts-changed', onMutated);
  };
};

/**
 * Upsert accounts by (teamId, email). The backend POST endpoint upserts so this
 * works for both "newly connected via OAuth" (id may be a Google sub) and
 * "previously persisted" accounts. The returned ids are the real DB ids.
 */
export const saveAccountsToFirebase = async (
  _teamId: string,
  accounts: Account[],
  deletedAccountIds: string[] = []
): Promise<void> => {
  await Promise.all(accounts.map((a) => api.post('/api/accounts', accountToApi(a))));
  await Promise.all(
    deletedAccountIds
      .filter((id) => looksLikeDbId(id))
      .map((id) => api.delete(`/api/accounts/${id}`))
  );
  // Notify listenForAccounts subscribers to refresh immediately (otherwise they
  // would wait up to 30s for the next polling tick — long enough that any code
  // still holding the old non-DB id would 404 on follow-up edits).
  window.dispatchEvent(new CustomEvent('nh:accounts-changed'));
};

/**
 * Patch existing accounts. The id MUST be a DB id (cuid). If the caller still
 * holds an OAuth-issued id (e.g. Google sub of a freshly-connected account),
 * we fall back to looking up by email and patching that.
 */
export const updateAccountsInFirebase = async (
  _teamId: string,
  accountsToUpdate: (Partial<Account> & { id: string })[]
): Promise<void> => {
  await Promise.all(
    accountsToUpdate.map(async (a) => {
      if (looksLikeDbId(a.id)) {
        return api.patch(`/api/accounts/${a.id}`, accountToApi(a));
      }
      // Resolve real id by email, then patch.
      if (a.email) {
        const { accounts: list } = await api.get<{ accounts: any[] }>('/api/accounts');
        const match = list.find((acc) => acc.email === a.email);
        if (match) {
          return api.patch(`/api/accounts/${match.id}`, accountToApi(a));
        }
      }
      // Last resort: upsert via POST.
      return api.post('/api/accounts', accountToApi(a));
    })
  );
};

// Prisma cuids start with a lowercase letter and contain only lowercase
// alphanumerics. Anything else (Google numeric sub, Microsoft GUID, "new:...")
// is treated as not-yet-persisted.
function looksLikeDbId(id: string): boolean {
  return /^c[a-z0-9]{20,}$/.test(id);
}

// --- Records --------------------------------------------------------------

export const updateRecordsInFirebase = async (
  _teamId: string,
  recordsToUpdate: (Partial<Record> & { id: string })[]
): Promise<void> => {
  await Promise.all(
    recordsToUpdate.map((r) =>
      api.patch(`/api/records/${r.id}`, {
        amount: r.amount,
        currency: r.currency,
        order_id: r.order_id,
        cost_total: r.cost_total,
        ff_code: r.ff_code,
        product_name: r.product_name,
        details: r.details,
        case_msg: r.case_msg,
        help_kind: r.help_kind,
        dt_local: r.dt_local,
      })
    )
  );
};

export const getRecordsForDateRange = async (
  _teamId: string,
  startDate: string,
  endDate: string,
  _timeZone: string
): Promise<Record[]> => {
  const qs = new URLSearchParams({ from: startDate, to: endDate });
  const { records } = await api.get<{ records: any[] }>(`/api/records?${qs.toString()}`);
  return records.map(mapRecord);
};

export const getAllRecordsForAccount = async (
  _teamId: string,
  accountEmail: string
): Promise<Record[]> => {
  const qs = new URLSearchParams({ q: accountEmail });
  const { records } = await api.get<{ records: any[] }>(`/api/records?${qs.toString()}`);
  // Filter client-side by exact account email to be safe
  return records.map(mapRecord).filter((r) => r.account === accountEmail);
};

export const deleteRecordsForAccounts = async (
  _teamId: string,
  accountEmails: string[]
): Promise<void> => {
  // Fetch all matching records then delete one by one.
  // For large datasets a dedicated bulk endpoint would be better; this keeps API surface minimal.
  for (const email of accountEmails) {
    const recs = await getAllRecordsForAccount(_teamId, email);
    await Promise.all(recs.map((r) => r.id && api.delete(`/api/records/${r.id}`)));
  }
};

export const saveRecordsToFirebase = async (
  _teamId: string,
  records: Record[],
  _accountEmail?: string,
  _options?: any
): Promise<Record[]> => {
  if (!records.length) return [];
  await api.post('/api/records', { records });
  return records;
};

export const listenForNewRecords = (
  _teamId: string,
  callback: (record: Record) => void
): (() => void) => {
  let cancelled = false;
  let lastSeenAt = new Date().toISOString();

  const tick = async () => {
    if (cancelled) return;
    try {
      const qs = new URLSearchParams({ from: lastSeenAt, limit: '100' });
      const { records } = await api.get<{ records: any[] }>(`/api/records?${qs.toString()}`);
      lastSeenAt = new Date().toISOString();
      records.map(mapRecord).forEach(callback);
    } catch (e) {
      console.warn('[listenForNewRecords] poll failed', e);
    }
  };
  const interval = setInterval(tick, 15000);
  return () => {
    cancelled = true;
    clearInterval(interval);
  };
};

// --- Manual costs ---------------------------------------------------------

export const getManualCosts = async (_teamId: string): Promise<any[]> => {
  const { costs } = await api.get<{ costs: any[] }>('/api/manual-costs');
  return costs.map((c) => ({
    id: c.id,
    providerName: c.providerName,
    cost: Number(c.cost),
    date: c.date,
    timeZone: c.timeZone ?? undefined,
    currency: c.currency ?? undefined,
    createdAt: c.createdAt,
  }));
};

export const addManualCost = async (
  _teamId: string,
  entry: { providerName: string; cost: number; date: string; timeZone?: string; currency?: string }
): Promise<any> => {
  const { cost } = await api.post<{ cost: any }>('/api/manual-costs', entry);
  return cost;
};

export const updateManualCost = async (
  _teamId: string,
  costId: string,
  updatedData: { providerName?: string; cost?: number; date?: string; timeZone?: string; currency?: string }
): Promise<void> => {
  await api.patch(`/api/manual-costs/${costId}`, updatedData);
};

export const deleteManualCost = async (_teamId: string, costId: string): Promise<void> => {
  await api.delete(`/api/manual-costs/${costId}`);
};

// --- Single record CRUD ---------------------------------------------------

export const deleteRecord = async (_teamId: string, recordId: string): Promise<void> => {
  await api.delete(`/api/records/${recordId}`);
};

export const deleteRecordsByEmailId = async (_teamId: string, emailId: string): Promise<void> => {
  // Fetch by emailId via search, then delete each match
  const qs = new URLSearchParams({ q: emailId });
  const { records } = await api.get<{ records: any[] }>(`/api/records?${qs.toString()}`);
  await Promise.all(records.filter((r) => r.emailId === emailId).map((r) => api.delete(`/api/records/${r.id}`)));
};

export const addRecord = async (_teamId: string, record: Record): Promise<Record> => {
  await api.post('/api/records', { records: [record] });
  // The bulk endpoint returns upserted count, not the record itself.
  // Return the input record (matches previous semantics close enough).
  return record;
};

export const searchGlobalRecords = async (_teamId: string, term: string): Promise<Record[]> => {
  const qs = new URLSearchParams({ q: term, limit: '1000' });
  const { records } = await api.get<{ records: any[] }>(`/api/records?${qs.toString()}`);
  return records.map(mapRecord);
};

// --- Settings -------------------------------------------------------------

export interface TeamSettings {
  notificationPrefs?: { order?: boolean; funds?: boolean; summary?: boolean };
  syncFlags?: { [k: string]: any };
  [key: string]: any;
}

export const getSettings = async (_teamId: string): Promise<TeamSettings> => {
  const { settings } = await api.get<{ settings: TeamSettings }>('/api/settings');
  return settings || {};
};

export const saveSettings = async (
  _teamId: string,
  settings: Partial<TeamSettings>
): Promise<void> => {
  await api.patch('/api/settings', settings);
};

export const listenForSettings = (
  _teamId: string,
  callback: (settings: TeamSettings) => void
): (() => void) => {
  let cancelled = false;
  const tick = async () => {
    if (cancelled) return;
    try {
      const s = await getSettings(_teamId);
      callback(s);
    } catch (e) {
      console.warn('[listenForSettings] poll failed', e);
    }
  };
  tick();
  const interval = setInterval(tick, 30000);
  return () => {
    cancelled = true;
    clearInterval(interval);
  };
};
