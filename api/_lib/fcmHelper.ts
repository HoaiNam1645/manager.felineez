// fcmHelper.ts — DEPRECATED after MySQL migration.
//
// FCM push notifications are disabled. When the team is ready to re-enable
// browser push, replace this stub with a Web Push API implementation backed
// by the `web-push` npm package + a subscriptions table in Prisma.

export const sendPushNotificationToUsers = async (
  userIdsOrTeamId: string | string[],
  notificationType: 'order' | 'funds' | 'summary' | 'login',
  payload: { title: string; body: string; url?: string }
) => {
  const target = Array.isArray(userIdsOrTeamId) ? userIdsOrTeamId.join(',') : userIdsOrTeamId;
  console.log(
    `[fcmHelper] (disabled) would send "${notificationType}" notification to ${target}:`,
    payload.title
  );
  return { sent: 0, failed: 0, skipped: 'fcm-disabled' };
};
