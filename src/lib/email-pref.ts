/**
 * Per-user email opt-out lives in the prefs JSON under
 * `notifications.emailEnabled`. Missing / any non-false value = opted in, so a
 * user with no prefs row (or an older row) gets email by default.
 *
 * Pure and dependency-free so it can be shared by both the client-facing prefs
 * surface (`userPreferences.ts`) and the server email send path
 * (`notification-email.server.ts`) without either importing the other.
 */
export function isEmailNotificationOptedIn(prefs: unknown): boolean {
  if (typeof prefs !== "object" || prefs === null) return true;
  const notif = (prefs as { notifications?: unknown }).notifications;
  if (typeof notif !== "object" || notif === null) return true;
  return (notif as { emailEnabled?: unknown }).emailEnabled !== false;
}
