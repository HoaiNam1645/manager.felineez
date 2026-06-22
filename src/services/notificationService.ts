/**
 * Notification service — FCM disabled for the MySQL backend.
 *
 * After the Firebase migration there is no client-side FCM. When push
 * notifications become a priority again, swap this for a Web Push API
 * implementation (subscribe via service worker, post the PushSubscription
 * to /api/push/subscribe, send notifications from the server with the
 * `web-push` npm package).
 */

export const requestForToken = async (_userId?: string) => {
  return null;
};

export const sendLarkLoginNotification = (
  email: string | null,
  role: string,
  _meta?: { teamId?: string; ip?: string; userAgent?: string }
) => {
  // Best-effort: just log. The /api/lark-login-notify endpoint can be called
  // from the auth flow if/when re-enabled.
  console.info('[notification] login:', email, role);
};
