/**
 * SERVER-ONLY low-level email sender (Resend HTTP API, no SDK — plain fetch).
 *
 * Entirely gated on configuration: with `RESEND_API_KEY` / `EMAIL_FROM` unset
 * (the default in dev, local, and any un-provisioned environment) every call is
 * a no-op that returns `false`, so nothing is sent and no error is raised. This
 * mirrors how Sentry source-map upload is gated on `SENTRY_AUTH_TOKEN` in
 * vite.config.ts — opt-in by presence of credentials.
 *
 * Sends are best-effort: any provider/network failure is logged and swallowed,
 * never thrown. Email is a courtesy copy of the in-app Notification (the source
 * of truth); a delivery miss must never break the workflow action that emitted
 * it.
 *
 * Env vars:
 *   RESEND_API_KEY   API key from the Resend dashboard. Required to send.
 *   EMAIL_FROM       Verified sender, e.g. "EPC Manager <notify@yourco.com>".
 *   EMAIL_REPLY_TO   Optional Reply-To header.
 *   APP_BASE_URL     Optional public base URL (https://app.yourco.com) used to
 *                    build "open in app" links. Links are omitted when unset.
 */

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

/** True when the provider credentials needed to actually send are present. */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/** Public base URL for "open in app" links, normalized without a trailing
 *  slash. Empty string when `APP_BASE_URL` is unset — callers omit links. */
export function appBaseUrl(): string {
  return (process.env.APP_BASE_URL ?? "").replace(/\/+$/, "");
}

/**
 * Send one email. Returns `true` on a 2xx from the provider, `false` when
 * email isn't configured or the send failed (the failure is logged). Never
 * throws.
 */
export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  if (!isEmailConfigured()) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        ...(process.env.EMAIL_REPLY_TO
          ? { reply_to: process.env.EMAIL_REPLY_TO }
          : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        `sendEmail: provider returned ${res.status} ${res.statusText} ${body}`,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error("sendEmail: request failed:", err);
    return false;
  }
}
