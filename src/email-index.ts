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

/**
 * Permanent tombstone written FIRST by every profile-deletion flow.
 *
 * UUIDs are random v4 and never reused, so this is an authoritative "this
 * uuid is dead" signal. It is what makes deletion/migration races decidable
 * on an eventually consistent store: a mapping pointing at a tombstoned uuid
 * is stale by definition and can safely be ignored and cleaned up, and a
 * migration can re-check it after writing (a cold read of a fresh key goes
 * to the origin store, not a possibly-stale edge cache) and undo itself.
 */
export function deletedTombstoneKey(uuid: string): string {
  return `deleted:${uuid.toLowerCase()}`;
}

/**
 * While a tombstone is younger than this, the deletion flow's unconditional
 * key deletes may still be running or propagating; freeing the email during
 * that window would let a fresh signup's mapping be destroyed by those
 * deletes. The flows themselves finish in seconds and KV propagation is
 * bounded by ~a minute, so five minutes is comfortably past both.
 */
const TOMBSTONE_GRACE_MS = 5 * 60 * 1000;

type TombstoneState = "none" | "deleting" | "dead";

async function tombstoneState(env: Env, uuid: string): Promise<TombstoneState> {
  const v = await env.ANCHOR_KV.get(deletedTombstoneKey(uuid));
  if (v === null) return "none";
  const t = Date.parse(v);
  if (Number.isFinite(t) && Date.now() - t < TOMBSTONE_GRACE_MS) return "deleting";
  return "dead";
}

export async function lookupEmailUuid(
  env: Env,
  email: string
): Promise<{ uuid: string | null; hash: string }> {
  const hash = await emailIndexHash(env, email);
  const pepper = (env.EMAIL_PEPPER || "").trim();

  const uuid = await env.ANCHOR_KV.get(`email:${hash}`);
  if (uuid) {
    const tomb = await tombstoneState(env, uuid);
    if (tomb === "deleting") {
      // Deletion in progress: keep the email reserved (fail closed) until
      // the grace period passes, so a re-signup can't race the deletion
      // flow's unconditional key deletes. No reconcile either — nothing may
      // be recreated for a dying uuid.
      return { uuid, hash };
    }
    if (tomb === "dead") {
      // The uuid is tombstoned and past the grace period: this mapping is an
      // orphan from a deletion/migration race. Clearing it is safe (uuids
      // are never reused) and frees the email to register again.
      await env.ANCHOR_KV.delete(`email:${hash}`).catch(() => {});
      return { uuid: null, hash };
    }

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

  const legacyTomb = await tombstoneState(env, legacyUuid);
  if (legacyTomb === "deleting") {
    // Deletion in progress — reserve the email, and definitely don't
    // migrate keys for a dying uuid.
    return { uuid: legacyUuid, hash: legacy };
  }
  if (legacyTomb === "dead") {
    // Tombstoned past grace — stale legacy mapping; safe to clear.
    await env.ANCHOR_KV.delete(`email:${legacy}`).catch(() => {});
    return { uuid: null, hash };
  }

  if (!(await env.ANCHOR_KV.get(`profile:${legacyUuid}`))) {
    // Fail closed: a missing profile without a tombstone is not proof the
    // mapping is stale. During EMAIL_PEPPER activation, a signup completed
    // just before the secret was enabled can have its legacy mapping visible
    // while its independently-written profile is still propagating —
    // treating that as "no match" would let a duplicate signup take over
    // the email. Report the mapping under its actual (legacy) hash;
    // migration waits for a lookup that can see the profile.
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

    // Deletion may have raced us between the tombstone check above and these
    // writes. This re-check is best-effort, NOT authoritative: KV can serve
    // the earlier read's cached miss for this same key, so a same-colo race
    // inside the cache window slips through. That residual is bounded
    // staleness, not permanent damage — the tombstone-aware branches above
    // clear a recreated mapping on any later lookup that sees the tombstone.
    // Making this exact requires a serialization point (a Durable Object),
    // which the threat model deliberately defers. See threat-model.md.
    if ((await tombstoneState(env, legacyUuid)) !== "none") {
      await env.ANCHOR_KV.delete(emailPointerKey(legacyUuid));
      await env.ANCHOR_KV.delete(`email:${hash}`);
      return { uuid: null, hash };
    }
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
