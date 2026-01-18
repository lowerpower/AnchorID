/**
 * Email provider abstraction for AnchorID magic links.
 * Supports mycal.net relay (preferred) and Resend (fallback).
 */

export interface EmailEnv {
  MAIL_SEND_SECRET?: string;  // mycal.net relay
  RESEND_API_KEY?: string;    // Resend API
  EMAIL_FROM?: string;        // Sender address (required for Resend)
}

export interface EmailResult {
  ok: boolean;
  error?: string;
}

/**
 * Check if any email provider is configured.
 */
export function hasEmailConfig(env: EmailEnv): boolean {
  return !!(env.MAIL_SEND_SECRET || (env.RESEND_API_KEY && env.EMAIL_FROM));
}

/**
 * Send an email using the configured provider.
 * Prefers mycal.net relay if MAIL_SEND_SECRET is set.
 * Falls back to Resend if RESEND_API_KEY is set.
 */
export async function sendEmail(
  env: EmailEnv,
  to: string,
  subject: string,
  text: string
): Promise<EmailResult> {
  // Prefer mycal.net relay if configured
  if (env.MAIL_SEND_SECRET) {
    return sendViaMycal(env.MAIL_SEND_SECRET, to, subject, text);
  }

  // Fallback to Resend
  if (env.RESEND_API_KEY && env.EMAIL_FROM) {
    return sendViaResend(env.RESEND_API_KEY, env.EMAIL_FROM, to, subject, text);
  }

  return { ok: false, error: "no_email_provider" };
}

async function sendViaMycal(
  secret: string,
  to: string,
  subject: string,
  body: string
): Promise<EmailResult> {
  try {
    const res = await fetch("https://www.mycal.net/api/send.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Mail-Secret": secret,
      },
      body: JSON.stringify({ to, subject, body }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      return { ok: false, error: `mycal: ${res.status} - ${errorText}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: `mycal: ${err}` };
  }
}

async function sendViaResend(
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  text: string
): Promise<EmailResult> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, text }),
    });

    if (!res.ok) {
      return { ok: false, error: `resend: ${res.status}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: `resend: ${err}` };
  }
}
