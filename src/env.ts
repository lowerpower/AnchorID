//
// src/env.ts
// src/env.ts
export interface Env {
  // Required: KV storage for profiles/claims/sessions/pages
  ANCHOR_KV: KVNamespace;

  // Admin token (used today for Authorization: Bearer <token>)
  ANCHOR_ADMIN_TOKEN?: string;

  // Optional: cookie value for browser admin sessions.
  // If unset, we can reuse ANCHOR_ADMIN_TOKEN as the cookie value.
  ANCHOR_ADMIN_COOKIE?: string;

  // Email login/update (legacy flow)
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;

  // TTL + limits
  LOGIN_TTL_SECONDS?: string; // default 900
  LOGIN_RL_PER_HOUR?: string; // default 3
  UPDATE_RL_PER_HOUR?: string; // default 20
}

