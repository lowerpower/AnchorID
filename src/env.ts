//
// src/env.ts
export interface Env {
  ANCHOR_KV: KVNamespace;
  ANCHOR_ADMIN_TOKEN?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  LOGIN_TTL_SECONDS?: string;
  LOGIN_RL_PER_HOUR?: string;
  UPDATE_RL_PER_HOUR?: string;
}

