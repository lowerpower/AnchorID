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
 */

/**
 * Email → UUID index hashing.
 *
 * The index key is `email:<hash>`. Historically the hash was a bare
 * sha256(email), which is dictionary-reversible for anyone holding a KV dump
 * or backup — emails are low-entropy and SHA-256 is fast. With EMAIL_PEPPER
 * set, the hash is HMAC-SHA256(pepper, email): a KV/backup leak alone then
 * reveals nothing, because the pepper lives outside KV as a Wrangler secret.
 *
 * Migration is lazy: we only hold plaintext email while the user is handing
 * it to us (signup/login/admin add), so that is when a legacy sha256 key is
 * upgraded to the peppered form. Dormant users keep working through the
 * legacy fallback in lookupEmailUuid indefinitely.
 *
 * IMPORTANT: once set, EMAIL_PEPPER must never be rotated or removed —
 * already-migrated keys are unrecoverable under a different pepper, and the
 * affected users would need their backup token to get back in.
 */

import type { Env } from "./env";

function hexOf(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Legacy index hash: bare sha256(email). Kept for fallback reads only. */
export async function legacyEmailHash(email: string): Promise<string> {
  const data = new TextEncoder().encode(email);
  return hexOf(await crypto.subtle.digest("SHA-256", data));
}

/**
 * Current index hash for an email. HMAC-SHA256(EMAIL_PEPPER, email) when the
 * pepper is configured; identical to the legacy sha256 when it is not, so
 * deploying this code before setting the secret changes nothing.
 */
export async function emailIndexHash(env: Env, email: string): Promise<string> {
  const pepper = (env.EMAIL_PEPPER || "").trim();
  if (!pepper) return legacyEmailHash(email);

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return hexOf(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(email)));
}

/**
 * Look up the UUID for an email, trying the peppered key first and falling
 * back to the legacy sha256 key. A legacy hit is migrated in place: the
 * peppered key is written, the pointer key (`emailkey:<uuid>`) records the
 * hash the email is now indexed under, and the legacy key is deleted.
 *
 * The profile document is NEVER read-modify-written here. With eventual
 * consistency a profile read on the login path can lag a recent edit, so
 * writing it back to change one private field could revert the user's
 * changes. Instead `_emailHash` stays frozen at its creation-time value and
 * the pointer key — owned exclusively by this module — carries the current
 * hash; deletion/purge clean up `email:<_emailHash>`, `email:<pointer>`,
 * and the pointer itself, which covers every migration state.
 *
 * Returns the hash under which the email is now indexed alongside the uuid
 * (callers use it for _emailHash, sessions, and new index writes).
 */
export function emailPointerKey(uuid: string): string {
  return `emailkey:${uuid.toLowerCase()}`;
}

export async function lookupEmailUuid(
  env: Env,
  email: string
): Promise<{ uuid: string | null; hash: string }> {
  const hash = await emailIndexHash(env, email);
  const pepper = (env.EMAIL_PEPPER || "").trim();

  const uuid = await env.ANCHOR_KV.get(`email:${hash}`);
  if (uuid) {
    // Note: no profile read here. A missing profile would not be proof the
    // mapping is stale anyway (signup's profile and mapping writes are
    // independent puts, so a reader can see one before the other) — the
    // mapping is reported as-is either way.

    // Reconcile an interrupted migration of THIS email: make sure the
    // pointer records the hash the email is reachable under, and clear this
    // email's legacy key if it still maps to the same profile. Both ops are
    // idempotent and scoped to this email — other mappings a profile may
    // legitimately carry (e.g. an admin-updated email leaves the prior
    // email's key) are never touched, and the profile document is not
    // written at all.
    if (pepper) {
      try {
        const pointer = await env.ANCHOR_KV.get(emailPointerKey(uuid));
        if (pointer !== hash) {
          await env.ANCHOR_KV.put(emailPointerKey(uuid), hash);
        }
        const legacyOfThis = await legacyEmailHash(email);
        const mapped = await env.ANCHOR_KV.get(`email:${legacyOfThis}`);
        if (mapped === uuid) await env.ANCHOR_KV.delete(`email:${legacyOfThis}`);
      } catch (e) {
        console.error("email index reconcile failed:", e);
      }
    }

    return { uuid, hash };
  }

  if (!pepper) return { uuid: null, hash };

  const legacy = await legacyEmailHash(email);
  const legacyUuid = await env.ANCHOR_KV.get(`email:${legacy}`);
  if (!legacyUuid) return { uuid: null, hash };

  if (!(await env.ANCHOR_KV.get(`profile:${legacyUuid}`))) {
    // Fail closed: a missing profile is not proof the mapping is stale.
    // During EMAIL_PEPPER activation, a signup completed just before the
    // secret was enabled can have its legacy mapping visible while its
    // independently-written profile is still propagating — treating that as
    // "no match" would let a duplicate signup take over the email. Report
    // the mapping under its actual (legacy) hash; migration waits for a
    // lookup that can see the profile. A genuinely orphaned legacy key
    // needs manual cleanup.
    return { uuid: legacyUuid, hash: legacy };
  }

  // Lazy migration — index keys and the pointer only, never the profile.
  // A failure or termination at any point converges: if the peppered key
  // was written, the next primary hit's reconcile fixes the pointer and
  // clears the legacy key; if it wasn't, the next legacy hit retries. The
  // rollback just shortens the inconsistent window.
  let migrated = false;
  try {
    await env.ANCHOR_KV.put(`email:${hash}`, legacyUuid);
    await env.ANCHOR_KV.put(emailPointerKey(legacyUuid), hash);
    await env.ANCHOR_KV.delete(`email:${legacy}`);
    migrated = true;
  } catch (e) {
    console.error("email index migration failed, rolling back:", e);
    try {
      await env.ANCHOR_KV.delete(emailPointerKey(legacyUuid));
      await env.ANCHOR_KV.delete(`email:${hash}`);
    } catch (rollbackErr) {
      console.error("email index migration rollback failed:", rollbackErr);
    }
  }

  // Report the hash the email is actually indexed under: callers persist it
  // (_emailHash, new index writes), so returning the peppered hash after a
  // rollback would strand the still-live legacy key.
  return { uuid: legacyUuid, hash: migrated ? hash : legacy };
}
