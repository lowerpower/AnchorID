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
 * peppered key is written, the legacy key deleted, and the profile's
 * _emailHash updated so deletion/purge paths stay consistent.
 *
 * Returns the hash under which the email is now indexed alongside the uuid
 * (callers use it for _emailHash, sessions, and new index writes).
 */
export async function lookupEmailUuid(
  env: Env,
  email: string
): Promise<{ uuid: string | null; hash: string }> {
  const hash = await emailIndexHash(env, email);

  const uuid = await env.ANCHOR_KV.get(`email:${hash}`);
  if (uuid) {
    const stored = (await env.ANCHOR_KV.get(`profile:${uuid}`, { type: "json" })) as any | null;
    if (!stored) {
      // Stale mapping — the profile is gone but the index entry survived
      // (e.g. an interrupted migration left a key that profile deletion,
      // which derives its cleanup from _emailHash, never removed). Left in
      // place it would block this email from ever registering again.
      await env.ANCHOR_KV.delete(`email:${hash}`).catch(() => {});
      return { uuid: null, hash };
    }

    // Reconcile an interrupted migration. A Worker termination between the
    // new-key write and the profile patch / legacy delete never reaches the
    // rollback below, leaving _emailHash on the old hash and the legacy key
    // alive — and deletion/purge clean up via _emailHash. Finish the job
    // whenever a primary hit sees the mismatch.
    const oldHash = typeof stored._emailHash === "string" ? stored._emailHash : null;
    if (oldHash && oldHash !== hash) {
      try {
        stored._emailHash = hash;
        await env.ANCHOR_KV.put(`profile:${uuid}`, JSON.stringify(stored));
        // Only remove the old key if it still points at this profile.
        const mapped = await env.ANCHOR_KV.get(`email:${oldHash}`);
        if (mapped === uuid) await env.ANCHOR_KV.delete(`email:${oldHash}`);
      } catch (e) {
        console.error("email index reconcile failed:", e);
      }
    }

    return { uuid, hash };
  }

  const pepper = (env.EMAIL_PEPPER || "").trim();
  if (!pepper) return { uuid: null, hash };

  const legacy = await legacyEmailHash(email);
  const legacyUuid = await env.ANCHOR_KV.get(`email:${legacy}`);
  if (!legacyUuid) return { uuid: null, hash };

  const stored = (await env.ANCHOR_KV.get(`profile:${legacyUuid}`, { type: "json" })) as any | null;
  if (!stored) {
    // Stale legacy mapping — same self-heal as above.
    await env.ANCHOR_KV.delete(`email:${legacy}`).catch(() => {});
    return { uuid: null, hash };
  }

  // Lazy migration. Failure here must not break the login/signup that
  // triggered it, and must not leave a half-migrated state behind: a stray
  // peppered key would make every later lookup hit it and short-circuit, so
  // the migration would never be retried — and after a profile deletion
  // (which cleans up via _emailHash) the stray key would block the email
  // from re-registering. On any failure, roll back to the fully-legacy
  // state so the next lookup retries from scratch.
  let profilePatched = false;
  let migrated = false;
  try {
    await env.ANCHOR_KV.put(`email:${hash}`, legacyUuid);

    if (stored._emailHash === legacy) {
      stored._emailHash = hash;
      await env.ANCHOR_KV.put(`profile:${legacyUuid}`, JSON.stringify(stored));
      profilePatched = true;
    }

    await env.ANCHOR_KV.delete(`email:${legacy}`);
    migrated = true;
  } catch (e) {
    console.error("email index migration failed, rolling back:", e);
    try {
      if (profilePatched) {
        stored._emailHash = legacy;
        await env.ANCHOR_KV.put(`profile:${legacyUuid}`, JSON.stringify(stored));
      }
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
