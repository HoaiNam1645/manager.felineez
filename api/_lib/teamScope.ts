// Team-scoped visibility for user-created content (categories, product folders).
//
// OWNER sees everything. A LEADER or USER sees content created by members of
// their own seller team (or only their own if they have no team). Legacy rows
// with a null creator are backfilled to the owner, so they stay owner-only.

import { prisma } from './prisma.js';
import type { AuthTokenPayload } from './auth.js';

/**
 * Returns the user ids whose content the caller may see,
 * or null when the caller is OWNER/DESIGN (no filtering).
 */
export async function visibleCreatorIds(auth: AuthTokenPayload): Promise<string[] | null> {
  if (auth.role === 'OWNER' || auth.role === 'DESIGN') return null;
  const me = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { sellerTeamId: true },
  });
  if (!me?.sellerTeamId) return [auth.userId];
  const members = await prisma.user.findMany({
    where: { teamId: auth.teamId, sellerTeamId: me.sellerTeamId },
    select: { id: true },
  });
  const ids = new Set(members.map((m) => m.id));
  ids.add(auth.userId);
  return Array.from(ids);
}

/**
 * Shop (mail-account) emails whose records the caller may see, or null when
 * unrestricted (OWNER; FULFILLMENT staff fulfill across all shops; DESIGN staff prepare assets across all shops).
 * LEADER → accounts linked by their seller-team members + own allowedAccounts;
 * USER → own-linked accounts + allowedAccounts. Mirrors GET /api/accounts.
 */
export async function visibleAccountEmails(auth: AuthTokenPayload): Promise<string[] | null> {
  if (auth.role === 'OWNER' || auth.role === 'FULFILLMENT' || auth.role === 'DESIGN') return null;
  const me = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { sellerTeamId: true, allowedAccounts: true },
  });
  const emails = new Set<string>(
    Array.isArray(me?.allowedAccounts) ? (me!.allowedAccounts as string[]) : []
  );
  const linkerIds = new Set<string>([auth.userId]);
  if (auth.role === 'LEADER' && me?.sellerTeamId) {
    const members = await prisma.user.findMany({
      where: { teamId: auth.teamId, sellerTeamId: me.sellerTeamId },
      select: { id: true },
    });
    members.forEach((m) => linkerIds.add(m.id));
  }
  const accounts = await prisma.mailAccount.findMany({
    where: { teamId: auth.teamId, linkedByUserId: { in: Array.from(linkerIds) } },
    select: { email: true },
  });
  accounts.forEach((a) => emails.add(a.email));
  return Array.from(emails);
}

/** id → email map for annotating responses with the creator. */
export async function emailsByUserIds(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const clean = Array.from(new Set(ids.filter(Boolean))) as string[];
  if (clean.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: clean } },
    select: { id: true, email: true },
  });
  return new Map(users.map((u) => [u.id, u.email]));
}
