// firebaseAdminHelper.ts — DEPRECATED after MySQL migration.
//
// Any code path that still calls initFirebaseAdmin() or getDb() will throw a
// clear error. Migrate the call site to use api/_lib/prisma.ts instead.
//
// Files known to still depend on this and need migration:
//   - api/auto-sync-sheets.ts
//   - api/gmail-webhook.ts
//   - api/sync-outlook.ts
//   - api/lark-events.ts
//   - api/_lib/larkHelper.ts
//   - api/_lib/notificationHelper.ts
//   - api/_lib/fcmHelper.ts

const MSG =
  '[firebaseAdminHelper] Firebase Admin has been removed. Use api/_lib/prisma.ts (Prisma + MySQL) instead.';

export function initFirebaseAdmin(): never {
  throw new Error(MSG);
}

export function getDb(): never {
  throw new Error(MSG);
}
