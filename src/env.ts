//
// src/env.ts
export interface Env {
  // Required: KV storage for profiles/claims/sessions/pages
  ANCHOR_KV: KVNamespace;

  // Admin secret (required for /admin/* routes)
  // This must be explicitly set - admin routes are disabled without it.
  ANCHOR_ADMIN_SECRET?: string;

  // Legacy: still supported for backward compatibility, but ANCHOR_ADMIN_SECRET takes precedence
  ANCHOR_ADMIN_TOKEN?: string;
  ANCHOR_ADMIN_COOKIE?: string;

  // Email providers
  MAIL_SEND_SECRET?: string;  // mycal.net relay
  RESEND_API_KEY?: string;    // Resend API
  EMAIL_FROM?: string;        // Sender address (required for Resend)
  BREVO_API_KEY?: string;     // Brevo API key
  BREVO_FROM?: string;        // Sender email for Brevo
  BREVO_DOMAINS?: string;     // Comma-separated domains (e.g., "outlook.com,hotmail.com")

  // TTL + limits
  LOGIN_TTL_SECONDS?: string; // default 900
  LOGIN_RL_PER_HOUR?: string; // default 3
  UPDATE_RL_PER_HOUR?: string; // default 20

  // Per-IP rate limits
  IP_RESOLVE_RL_PER_HOUR?: string; // default 300 (per IP for /resolve/<uuid> endpoint)
  IP_CLAIMS_RL_PER_HOUR?: string;  // default 300 (per IP for /claims/<uuid> endpoint)
  IP_LOGIN_RL_PER_HOUR?: string;   // default 10 (per IP for login attempts)
  IP_EDIT_RL_PER_HOUR?: string;    // default 30 (per IP for edit page loads)
  IP_UPDATE_RL_PER_HOUR?: string;  // default 60 (per IP for update submissions)
  IP_CLAIM_RL_PER_HOUR?: string;   // default 30 (per IP for claim creation)
  IP_VERIFY_RL_PER_HOUR?: string;  // default 20 (per IP for claim verification)
  IP_ADMIN_LOGIN_RL_PER_HOUR?: string; // default 5 (per IP for admin login)

  // Per-UUID rate limits for claims
  CLAIM_RL_PER_HOUR?: string;      // default 10 (per UUID for claim creation)
  VERIFY_RL_PER_HOUR?: string;     // default 20 (per UUID for claim verification)

  // Optional: Enable claim verification notifications
  // If enabled, stores email in plaintext (as _email in profile) for notifications
  ENABLE_CLAIM_NOTIFICATIONS?: string; // "true" to enable
}

