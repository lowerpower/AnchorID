/**
 * AnchorID - Permanent Attribution Anchor Service
 *
 * Copyright (c) 2025-2026 Mike Johnson (Mycal) / AnchorID
 *
 * Author:       https://anchorid.net/resolve/4ff7ed97-b78f-4ae6-9011-5af714ee241c
 * Organization: https://anchorid.net/resolve/4c785577-9f55-4a22-a80b-dd1f4d9b4658
 * Repository:   https://github.com/lowerpower/anchorid
 *
 * SPDX-License-Identifier: MIT
 * See LICENSE file for full terms.
 *
 * AnchorID provides UUID-based permanent attribution anchors for the AI era.
 * Part of the Mycal Labs infrastructure preservation project.
 */

/**
 * Email provider abstraction for AnchorID magic links.
 * Supports Brevo (domain-based routing), mycal-style mailer (preferred), and Resend (fallback).
 */

export interface EmailEnv {
  MAIL_SEND_SECRET?: string;       // mycal-style mailer secret
  MYCAL_MAIL_ENDPOINT?: string;    // mycal-style mailer endpoint URL (required if using MAIL_SEND_SECRET)
  RESEND_API_KEY?: string;         // Resend API
  EMAIL_FROM?: string;             // Sender address (required for Resend)
  BREVO_API_KEY?: string;          // Brevo API key
  BREVO_FROM?: string;             // Sender email for Brevo
  BREVO_DOMAINS?: string;          // Comma-separated domains (e.g., "outlook.com,hotmail.com")
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
    (env.MAIL_SEND_SECRET && env.MYCAL_MAIL_ENDPOINT) ||
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

  // Prefer mycal-style mailer for non-Brevo domains
  if (env.MAIL_SEND_SECRET && env.MYCAL_MAIL_ENDPOINT) {
    console.log(`[EMAIL] Routing ${to.split('@')[1]} → mycal-style mailer`);
    return sendViaMycal(env.MYCAL_MAIL_ENDPOINT, env.MAIL_SEND_SECRET, to, subject, text);
  }

  // Fallback to Resend
  if (env.RESEND_API_KEY && env.EMAIL_FROM) {
    console.log(`[EMAIL] Routing ${to.split('@')[1]} → Resend`);
    return sendViaResend(env.RESEND_API_KEY, env.EMAIL_FROM, to, subject, text);
  }

  return { ok: false, error: "no_email_provider" };
}

async function sendViaMycal(
  endpoint: string,
  secret: string,
  to: string,
  subject: string,
  body: string
): Promise<EmailResult> {
  try {
    const res = await fetch(endpoint, {
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
