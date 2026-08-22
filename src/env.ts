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
  MAIL_SEND_SECRET?: string;       // mycal-style mailer secret
  MYCAL_MAIL_ENDPOINT?: string;    // mycal-style mailer endpoint URL (required if using MAIL_SEND_SECRET)
  RESEND_API_KEY?: string;         // Resend API
  EMAIL_FROM?: string;             // Sender address (required for Resend)
  BREVO_API_KEY?: string;          // Brevo API key
  BREVO_FROM?: string;             // Sender email for Brevo
  BREVO_DOMAINS?: string;          // Comma-separated domains (e.g., "outlook.com,hotmail.com")

  // TTL + limits
  ADMIN_SESSION_TTL_SECONDS?: string; // default 43200 (12h)
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

  // Optional: pepper for the email→UUID index (HMAC-SHA256 key, set as a
  // Wrangler secret). When set, new/updated index keys use
  // HMAC(pepper, email) instead of bare sha256(email); legacy keys keep
  // working via fallback and migrate lazily on login/signup.
  // MUST NOT be rotated or removed once set — see src/email-index.ts.
  EMAIL_PEPPER?: string;

  // Optional: expose the raw KV key-enumeration endpoint at /admin/debug/kv
  ENABLE_ADMIN_DEBUG?: string; // "true" to enable

  // X (Twitter) claim verification.
  // App-only OAuth 2.0 Bearer token from the X developer portal. Used server-side
  // only, for GET /2/users/by/username — never sent to the browser.
  // Without it the X claim type is hidden in the UI and verification returns a
  // transient failure rather than revoking existing claims.
  X_API_BEARER_TOKEN?: string;
  X_API_RL_PER_HOUR?: string; // default 200 (worker-wide cap on metered X API reads)

  // Optional: Enable claim verification notifications
  // If enabled, stores email in plaintext (as _email in profile) for notifications
  ENABLE_CLAIM_NOTIFICATIONS?: string; // "true" to enable
}

// ------------------ Config parsing ------------------

/**
 * Workers KV rejects `expirationTtl` below 60 seconds with a 400.
 *
 * Anything that derives a TTL from configuration or from a remote response has
 * to respect this floor, or the `put` throws at runtime — which, for a value
 * that looks like a harmless tuning knob, turns into a hard failure on the
 * request path that writes the key.
 */
export const MIN_KV_TTL_SECONDS = 60;

/** Clamp any TTL to KV's accepted minimum. */
export function clampKvTtl(seconds: number): number {
  return Math.max(Math.floor(seconds), MIN_KV_TTL_SECONDS);
}

/**
 * Parse an env-provided integer, falling back when unset or malformed.
 *
 * Bare `parseInt` yields NaN on a bad value, and `NaN > limit` is false — which
 * silently disabled whichever rate limit it was meant to configure.
 */
export function intFromEnv(value: string | undefined, fallback: number): number {
  const n = parseInt(value ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Parse an env-provided KV TTL. Falls back when unset/malformed, then clamps to
 * KV's minimum so a misconfigured value degrades to a short TTL instead of
 * throwing on every write.
 */
export function kvTtlFromEnv(value: string | undefined, fallback: number): number {
  const n = parseInt(value ?? "", 10);
  return clampKvTtl(Number.isFinite(n) && n > 0 ? n : fallback);
}

