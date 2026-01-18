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

  // Email login/update
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;

  // TTL + limits
  LOGIN_TTL_SECONDS?: string; // default 900
  LOGIN_RL_PER_HOUR?: string; // default 3
  UPDATE_RL_PER_HOUR?: string; // default 20
}

