// Seller identifier codes (mã định danh) — 2-char SKU prefixes used for KPI
// attribution: an order item belongs to the user whose code equals
// sku.trim().slice(0, 2).toUpperCase().

import { prisma } from './prisma.js';

export class SellerCodeError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Accepts an array (["na","MA"]) or a comma-separated string ("NA, MA").
 * Returns deduped uppercase codes. Throws SellerCodeError(400) on invalid input.
 */
export function normalizeSellerCodes(input: unknown): string[] {
  if (input === undefined || input === null || input === '') return [];
  const parts = Array.isArray(input) ? input : String(input).split(',');
  const codes: string[] = [];
  for (const raw of parts) {
    const code = String(raw).trim().toUpperCase();
    if (!code) continue;
    if (!/^[A-Z0-9]{2}$/.test(code)) {
      throw new SellerCodeError(
        `Invalid seller code "${code}" — each code must be exactly 2 letters/digits (e.g. NA, MA).`,
      );
    }
    if (!codes.includes(code)) codes.push(code);
  }
  return codes;
}

/**
 * Ensures none of `codes` is already claimed by ANOTHER user in the workspace.
 * Throws SellerCodeError(409) listing the conflicting codes and their owners.
 */
export async function assertCodesAvailable(
  teamId: string,
  codes: string[],
  excludeUserId?: string,
): Promise<void> {
  if (codes.length === 0) return;
  const users = await prisma.user.findMany({
    where: { teamId, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
    select: { email: true, sellerCodes: true },
  });
  const conflicts: string[] = [];
  for (const u of users) {
    const theirs = Array.isArray(u.sellerCodes) ? (u.sellerCodes as string[]) : [];
    for (const code of codes) {
      if (theirs.includes(code)) conflicts.push(`${code} (${u.email})`);
    }
  }
  if (conflicts.length > 0) {
    throw new SellerCodeError(`Seller code already in use: ${conflicts.join(', ')}`, 409);
  }
}
