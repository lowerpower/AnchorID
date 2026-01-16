
// src/claims/store.ts

import type { Env } from "../env";
import type { Claim, ClaimsEnv } from "./types";

export function nowIso(): string {
  return new Date().toISOString();
}

export function normalizeIdentityUrl(input: string): string {
  const s = input.trim();

  // If it already looks like a URL, keep it (and normalize trivial stuff)
  if (/^https?:\/\//i.test(s)) return s;

  // If it looks like a bare domain or host/path, default to https
  return `https://${s}`;
}


export function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export function normalizeUrl(u: string): string {
  return u.trim();
}

export function claimsKey(uuid: string): string {
  return `claims:${uuid}`;
}

export async function loadClaims(env: Env, uuid: string): Promise<Claim[]> {
  const raw = await env.ANCHOR_KV.get(claimsKey(uuid));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Claim[]) : [];
  } catch {
    return [];
  }
}

export async function saveClaims(env: Env, uuid: string, claims: Claim[]): Promise<void> {
  await env.ANCHOR_KV.put(claimsKey(uuid), JSON.stringify(claims));
}

export function upsertClaim(list: Claim[], claim: Claim): Claim[] {
  const idx = list.findIndex((c) => c.id === claim.id);
  if (idx >= 0) {
    const merged: Claim = {
      ...list[idx],
      ...claim,
      createdAt: list[idx].createdAt || claim.createdAt,
      updatedAt: claim.updatedAt,
    };
    const copy = [...list];
    copy[idx] = merged;
    return copy;
  }
  return [...list, claim];
}


