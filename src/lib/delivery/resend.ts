import "server-only";

/**
 * Minimal Resend email sender for the delivery worker (§7 email channel, M3).
 * We talk to Resend's REST API directly rather than pull in the SDK — one POST
 * per message with a bearer key. SERVER-ONLY: it reads RESEND_API_KEY and must
 * never be imported from a client component.
 *
 * Gated on the key: `deliveryConfigured()` is false when RESEND_API_KEY is
 * absent, and `sendEmail()` returns a clear "not configured" error rather than
 * throwing, so a deploy with delivery switched off degrades cleanly (the cron
 * route reports it as a skip, not a failure).
 */

/** The from address every message is sent as. Overridable via DELIVERY_FROM. */
export function deliveryFrom(): string {
  return process.env.DELIVERY_FROM || "SignalRoom <briefings@signalroom.app>";
}

/** True when RESEND_API_KEY is present — the single gate for email delivery. */
export function deliveryConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export interface SendEmailInput {
  /** One or more recipient addresses. */
  to: string[];
  subject: string;
  /** Pre-rendered HTML body. */
  html: string;
}

export interface SendEmailResult {
  ok: boolean;
  /** Resend message id on success. */
  id?: string;
  /** Human-readable failure reason on !ok (never thrown). */
  error?: string;
}

/** Abort a hung Resend request rather than let it eat the cron's wall-clock. */
const REQUEST_TIMEOUT_MS = 25_000;

/**
 * Send one email through Resend. Returns a typed result — a missing key, a
 * network error, a timeout, or a non-2xx response all surface as
 * `{ ok: false, error }` so the caller can count and log without a try/catch.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return { ok: false, error: "RESEND_API_KEY not set" };
  }
  if (input.to.length === 0) {
    return { ok: false, error: "no recipients" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: deliveryFrom(),
        to: input.to,
        subject: input.subject,
        html: input.html,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        ok: false,
        error: `Resend responded ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
      };
    }

    const body = (await res.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, id: body?.id };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? `Resend request timed out after ${REQUEST_TIMEOUT_MS}ms`
          : err.message
        : String(err);
    return { ok: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}
