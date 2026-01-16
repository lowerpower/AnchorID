// src/claims/handlers.ts

import type { Env } from "../env";
import type { Claim, ClaimsEnv } from "./types";
import { nowIso, isUuid, normalizeUrl, normalizeIdentityUrl, loadClaims, saveClaims, upsertClaim } from "./store";
import {
  claimIdForWebsite,
  claimIdForGitHub,
  buildWellKnownProof,
  buildGitHubReadmeProof,
  verifyClaim,
} from "./verify";

// Optional: pass base resolver host in if you want staging/prod support later
function resolverUrlFor(uuid: string): string {
  return `https://anchorid.net/resolve/${uuid}`;
}


export async function handleGetClaims(
  request: Request,
  env: Env,
  uuid: string
): Promise<Response> {
  if (!isUuid(uuid)) return new Response("Bad UUID", { status: 400 });

  const claims = await loadClaims(env, uuid);
  const body = JSON.stringify({ uuid, claims, dateModified: nowIso() }, null, 2);

  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=86400",
    },
  });
}

// Token-gated in router (reuse your existing auth guard there)
export async function handlePostClaim(request: Request,   env: Env): Promise<Response> {
  const payload = await request.json().catch(() => null);
  if (!payload) return new Response("Bad JSON", { status: 400 });

  const uuid = String(payload.uuid || "").trim();
  const type = String(payload.type || "").trim();
  // normalize FIRST, before building ids or proofs
  const url = normalizeIdentityUrl(String(payload.url || ""));

  if (!isUuid(uuid)) return new Response("Bad UUID", { status: 400 });
  if (type !== "website" && type !== "github") return new Response("Bad type", { status: 400 });

  const resolverUrl = resolverUrlFor(uuid);
  const now = nowIso();

  let claim: Claim;

  if (type === "website") {

    const id = claimIdForWebsite(url);
    const proof = buildWellKnownProof(url, resolverUrl);
    claim = {
      id,
      type: "website",
      url,
      status: "self_asserted",
      proof,
      createdAt: now,
      updatedAt: now,
    };
  } else {
    const id = claimIdForGitHub(url);
    const proof = buildGitHubReadmeProof(url, resolverUrl);
    claim = {
      id,
      type: "github",
      url,
      status: "self_asserted",
      proof,
      createdAt: now,
      updatedAt: now,
    };
  }

  const list = await loadClaims(env, uuid);
  const updated = upsertClaim(list, claim);
  await saveClaims(env, uuid, updated);

  return new Response(JSON.stringify({ ok: true, claim }, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function handlePostClaimVerify(
  request: Request,
  env: Env
): Promise<Response> {
  const payload = await request.json().catch(() => null);
  if (!payload) return new Response("Bad JSON", { status: 400 });

  const uuid = String(payload.uuid || "").trim();
  const id = String(payload.id || "").trim();

  if (!isUuid(uuid)) return new Response("Bad UUID", { status: 400 });
  if (!id) return new Response("Bad claim id", { status: 400 });

  const list = await loadClaims(env, uuid);
  const idx = list.findIndex((c) => c.id === id);
  if (idx < 0) return new Response("Claim not found", { status: 404 });

  const claim = { ...list[idx] };
  const now = nowIso();

  let result: { status: Claim["status"]; failReason?: string };
  try {
    result = await verifyClaim(claim);
  } catch (e: any) {
    result = { status: "failed", failReason: `verify_error:${String(e?.message || e)}` };
  }

  claim.status = result.status;
  claim.lastCheckedAt = now;
  claim.updatedAt = now;
  claim.failReason = result.failReason;

  if (result.status === "verified") {
    claim.verifiedAt = now;
    claim.failReason = undefined;
  }

  const updated = [...list];
  updated[idx] = claim;
  await saveClaims(env, uuid, updated);

  return new Response(JSON.stringify({ ok: true, claim }, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}



