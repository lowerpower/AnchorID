/**
 * Email provider abstraction for AnchorID magic links.
 * Supports Brevo (domain-based routing), mycal.net relay (preferred), and Resend (fallback).
 */

export interface EmailEnv {
  MAIL_SEND_SECRET?: string;  // mycal.net relay
  RESEND_API_KEY?: string;    // Resend API
  EMAIL_FROM?: string;        // Sender address (required for Resend)
  BREVO_API_KEY?: string;     // Brevo API key
  BREVO_FROM?: string;        // Sender email for Brevo
  BREVO_DOMAINS?: string;     // Comma-separated domains (e.g., "outlook.com,hotmail.com")
}

export interface EmailResult {
  ok: boolean;
  error?: string;
}

/**
 * Check if any email provider is configured.
 */
export function hasEmailConfig(env: EmailEnv): boolean {
  return !!(
    env.MAIL_SEND_SECRET ||
    (env.BREVO_API_KEY && env.BREVO_FROM) ||
    (env.RESEND_API_KEY && env.EMAIL_FROM)
  );
}

/**
 * Send an email using the configured provider.
 * Routes by domain: Brevo for specified domains, mycal.net for others, Resend as fallback.
 */
export async function sendEmail(
  env: EmailEnv,
  to: string,
  subject: string,
  text: string
): Promise<EmailResult> {
  // Domain-based routing for Brevo
  if (env.BREVO_API_KEY && env.BREVO_FROM && env.BREVO_DOMAINS) {
    const domain = to.split('@')[1]?.toLowerCase();
    if (domain) {
      const brevoDomains = env.BREVO_DOMAINS.split(',').map(d => d.trim().toLowerCase());
      const useBrevo = brevoDomains.some(baseDomain =>
        domain === baseDomain || domain.endsWith('.' + baseDomain)
      );

      if (useBrevo) {
        console.log(`[EMAIL] Routing ${domain} → Brevo`);
        return sendViaBrevo(env.BREVO_API_KEY, env.BREVO_FROM, to, subject, text);
      }
    }
  }

  // Prefer mycal.net relay for non-Brevo domains
  if (env.MAIL_SEND_SECRET) {
    console.log(`[EMAIL] Routing ${to.split('@')[1]} → mycal.net`);
    return sendViaMycal(env.MAIL_SEND_SECRET, to, subject, text);
  }

  // Fallback to Resend
  if (env.RESEND_API_KEY && env.EMAIL_FROM) {
    console.log(`[EMAIL] Routing ${to.split('@')[1]} → Resend`);
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

async function sendViaBrevo(
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  text: string
): Promise<EmailResult> {
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: { email: from },
        to: [{ email: to }],
        subject,
        textContent: text,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => null) as { message?: string } | null;
      return {
        ok: false,
        error: `brevo: ${res.status}${errorData?.message ? ' - ' + errorData.message : ''}`
      };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: `brevo: ${err}` };
  }
}
