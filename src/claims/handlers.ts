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

import type { Env } from "../env";
import type { Claim } from "./types";
import { nowIso, isUuid, normalizeUrl, normalizeIdentityUrl, loadClaims, saveClaims, upsertClaim } from "./store";
import {
  claimIdForWebsite,
  claimIdForGitHub,
  claimIdForDns,
  claimIdForPublic,
  buildWellKnownProof,
  buildGitHubReadmeProof,
  buildDnsProof,
  buildPublicProof,
  parseFediverseHandle,
  validateProfileUrl,
  verifyClaim,
} from "./verify";
import { getErrorInfo } from "./errors";
import { sendClaimVerifiedEmail, sendClaimFailedEmail, shouldSendNotification } from "./notifications";

// Optional: pass base resolver host in if you want staging/prod support later
function resolverUrlFor(uuid: string): string {
  return `https://anchorid.net/resolve/${uuid}`;
}

// Security headers for all responses
function securityHeaders(): Record<string, string> {
  return {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "interest-cohort=()",
    "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'",
  };
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
      ...securityHeaders(),
    },
  });
}


export async function handleGetClaimsHtml(
  request: Request,
  env: Env,
  uuid: string
): Promise<Response> {
  if (!isUuid(uuid)) return new Response("Bad UUID", { status: 400 });

  const claims = await loadClaims(env, uuid);
  const verified = claims.filter((c) => c.status === "verified");
  const others = claims.filter((c) => c.status !== "verified");

  const resolveUrl = `https://anchorid.net/resolve/${uuid}`;
  const claimsUrl = `https://anchorid.net/claims/${uuid}`;

  function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function badge(status: string): string {
    const t = status.toUpperCase();
    return `<span class="badge ${esc(status)}">${esc(t)}</span>`;
  }

  function renderClaim(c: any): string {
    let failReasonHtml = "";
    if (c.failReason) {
      const errorInfo = getErrorInfo(c.failReason);
      failReasonHtml = `<div class="fail" style="margin-top:8px">
        <strong>Error:</strong> ${esc(errorInfo.message)}
        ${errorInfo.hint ? `<br><span style="font-size:12px">${esc(errorInfo.hint)}</span>` : ""}
        ${errorInfo.docLink ? `<br><a href="${esc(errorInfo.docLink)}" style="font-size:11px">View documentation →</a>` : ""}
      </div>`;
    }

    return `
      <div class="claim">
        <div class="row">
          <div class="id">${esc(c.id)}</div>
          <div class="right">${badge(c.status)}</div>
        </div>
        <div class="url"><a href="${esc(c.url)}" rel="me noopener" target="_blank">${esc(c.url)}</a></div>
        <div class="meta">
          <span>${esc(c.type === "social" ? "public" : c.type)}</span>
          ${c.verifiedAt ? `<span>Verified: <code>${esc(c.verifiedAt)}</code></span>` : ""}
          ${c.lastCheckedAt ? `<span>Checked: <code>${esc(c.lastCheckedAt)}</code></span>` : ""}
        </div>
        ${failReasonHtml}
        <details>
          <summary>Proof</summary>
          <div class="proof">
            <div><strong>kind</strong>: <code>${esc(c.proof?.kind || "")}</code></div>
            <div><strong>url</strong>: <a href="${esc(c.proof?.url || "")}" target="_blank" rel="noopener">${esc(c.proof?.url || "")}</a></div>
            <div><strong>mustContain</strong>: <code>${esc(c.proof?.mustContain || "")}</code></div>
          </div>
        </details>
      </div>
    `;
  }

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AnchorID Claims • ${esc(uuid)}</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;margin:24px;max-width:920px;line-height:1.4}
    header{display:flex;gap:12px;align-items:baseline;flex-wrap:wrap}
    h1{font-size:20px;margin:0}
    .muted{color:#666}
    .links a{margin-right:12px}
    .box{background:#f6f7f9;border:1px solid #e4e6ea;border-radius:10px;padding:12px;margin:16px 0}
    .claim{border:1px solid #e4e6ea;border-radius:12px;padding:12px;margin:10px 0}
    .row{display:flex;justify-content:space-between;gap:12px;align-items:center}
    .id{font-weight:600}
    .url{margin:6px 0 8px}
    .meta{display:flex;gap:12px;flex-wrap:wrap;color:#555;font-size:13px}
    code{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}
    .badge{font-size:12px;padding:2px 8px;border-radius:999px;border:1px solid #ddd}
    .badge.verified{background:#e7f7ee;border-color:#bfe8cf}
    .badge.self_asserted{background:#fff7e6;border-color:#ffe0a6}
    .badge.failed{background:#fdecec;border-color:#f6b7b7}
    .fail{color:#a00}
    details{margin-top:8px}
    footer{margin-top:24px;color:#777;font-size:12px}
  </style>
</head>
<body>
  <header>
    <h1>AnchorID Claims</h1>
    <div class="muted"><code>${esc(uuid)}</code></div>
  </header>

  <div class="links box">
    <div><strong>Resolve</strong>: <a href="${esc(resolveUrl)}">${esc(resolveUrl)}</a></div>
    <div><strong>Claims JSON</strong>: <a href="${esc(claimsUrl)}">${esc(claimsUrl)}</a></div>
  </div>

  <div class="box">
    <div class="muted">Copy/paste proof line:</div>
    <div><code>${esc(resolveUrl)}</code></div>
  </div>

  <h2>Verified</h2>
  ${verified.length ? verified.map(renderClaim).join("") : `<p class="muted">No verified claims.</p>`}

  <h2>Other</h2>
  ${others.length ? others.map(renderClaim).join("") : `<p class="muted">No other claims.</p>`}

  <footer>
    Served by AnchorID • <a href="${esc(resolveUrl)}">/resolve</a> • <a href="${esc(claimsUrl)}">/claims</a>
  </footer>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=86400",
      ...securityHeaders(),
    },
  });
}


// Token-gated in router (reuse your existing auth guard there)
export async function handlePostClaim(request: Request,   env: Env): Promise<Response> {
  const payload: any = await request.json().catch(() => null);
  if (!payload) return new Response("Bad JSON", { status: 400 });

  const uuid = String(payload.uuid || "").trim();
  const type = String(payload.type || "").trim();
  // normalize FIRST, before building ids or proofs (except for public/social, which needs special handling)
  const url = (type === "public" || type === "social") ? String(payload.url || "").trim() : normalizeIdentityUrl(String(payload.url || ""));

  if (!isUuid(uuid)) return new Response("Bad UUID", { status: 400 });
  if (url.length > 2048) return new Response("URL too long", { status: 400 });
  // Accept both "public" (new) and "social" (backward compatibility)
  if (type !== "website" && type !== "github" && type !== "dns" && type !== "public" && type !== "social") return new Response("Bad type", { status: 400 });

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
  } else if (type === "github") {
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
  } else if (type === "dns") {
    // Parse domain input to determine qname
    // Accept: "example.com" (defaults to _anchorid.example.com)
    // Accept: "_anchorid.example.com" (explicit subdomain)
    let domain = url.toLowerCase().trim();

    // Remove protocol if present
    domain = domain.replace(/^https?:\/\//, "");
    // Remove trailing slash
    domain = domain.replace(/\/$/, "");
    // Remove path
    domain = domain.split("/")[0];

    let qname: string;
    if (domain.startsWith("_anchorid.")) {
      // User specified subdomain explicitly
      qname = domain;
    } else {
      // Default to subdomain method
      qname = `_anchorid.${domain}`;
    }

    const id = claimIdForDns(qname);
    const proof = buildDnsProof(qname, uuid);

    // Use the base domain as the url for display
    const displayUrl = domain.startsWith("_anchorid.") ? domain.slice(10) : domain;

    claim = {
      id,
      type: "dns",
      url: displayUrl,
      status: "self_asserted",
      proof,
      createdAt: now,
      updatedAt: now,
    };
  } else if (type === "public" || type === "social") {
    // Parse @user@instance format or accept full URL
    let profileUrl = url;

    // Try parsing as Fediverse handle first
    if (url.includes('@') && !url.startsWith('http')) {
      const parsed = parseFediverseHandle(url);
      if (!parsed) {
        return new Response("Invalid Fediverse handle format. Use @user@instance.social or full URL", { status: 400 });
      }
      profileUrl = parsed;
    }

    // Validate URL for SSRF protection
    const validation = validateProfileUrl(profileUrl);
    if (!validation.ok) {
      return new Response(`Invalid URL: ${validation.error}`, { status: 400 });
    }

    const id = claimIdForPublic(profileUrl);
    const proof = buildPublicProof(profileUrl, resolverUrl);

    claim = {
      id,
      type: "public",  // Always create new claims with "public" type
      url: profileUrl,
      status: "self_asserted",
      proof,
      createdAt: now,
      updatedAt: now,
    };
  } else {
    return new Response("Invalid claim type", { status: 400 });
  }

  const list = await loadClaims(env, uuid);
  const updated = upsertClaim(list, claim);
  await saveClaims(env, uuid, updated);

  return new Response(JSON.stringify({ ok: true, claim }, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...securityHeaders(),
    },
  });
}

export async function handlePostClaimVerify(
  request: Request,
  env: Env
): Promise<Response> {
  const payload: any = await request.json().catch(() => null);
  if (!payload) return new Response("Bad JSON", { status: 400 });

  const uuid = String(payload.uuid || "").trim();
  const id = String(payload.claimId || payload.id || "").trim();
  const bypassCache = Boolean(payload.bypassCache || payload.recheckNow);

  if (!isUuid(uuid)) return new Response("Bad UUID", { status: 400 });
  if (!id) return new Response("Bad claim id", { status: 400 });

  const list = await loadClaims(env, uuid);
  const idx = list.findIndex((c) => c.id === id);
  if (idx < 0) return new Response("Claim not found", { status: 404 });

  const claim = { ...list[idx] };
  const previousStatus = claim.status; // Track previous status for notifications
  const now = nowIso();

  let result: { status: Claim["status"]; failReason?: string };
  try {
    result = await verifyClaim(claim, env.ANCHOR_KV, bypassCache);
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

  // Send notification if status changed (success or failure)
  if (previousStatus !== result.status) {
    // Get profile to retrieve email (if notifications enabled)
    const profile = await env.ANCHOR_KV.get(`profile:${uuid}`, { type: "json" }) as any | null;
    const email = profile?._email;

    if (shouldSendNotification(env, email)) {
      // Send in background (don't wait for email to send)
      if (result.status === "verified") {
        sendClaimVerifiedEmail(env, email, uuid, claim).catch(e => {
          console.error("Failed to send verification success notification:", e);
        });
      } else if (result.status === "failed") {
        sendClaimFailedEmail(env, email, uuid, claim).catch(e => {
          console.error("Failed to send verification failure notification:", e);
        });
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, claim }, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...securityHeaders(),
    },
  });
}

/**
 * Delete a claim from a user's profile
 * Requires authentication (admin or user session token)
 * Note: Audit logging is handled by the caller in index.ts
 */
export async function handlePostClaimDelete(
  request: Request,
  env: Env
): Promise<Response> {
  const payload: any = await request.json().catch(() => null);
  if (!payload) return new Response("Bad JSON", { status: 400 });

  const uuid = String(payload.uuid || "").trim();
  const claimId = String(payload.claimId || "").trim();

  if (!isUuid(uuid)) return new Response("Bad UUID", { status: 400 });
  if (!claimId) return new Response("Bad claim ID", { status: 400 });

  // Load current claims
  const list = await loadClaims(env, uuid);
  const idx = list.findIndex((c) => c.id === claimId);

  if (idx < 0) {
    return new Response("Claim not found", { status: 404 });
  }

  // Store claim info for response (will be used for audit logging by caller)
  const deletedClaim = list[idx];

  // Remove the claim from the array
  const updated = [...list.slice(0, idx), ...list.slice(idx + 1)];

  // Save updated claims list
  await saveClaims(env, uuid, updated);

  return new Response(JSON.stringify({
    ok: true,
    message: "Claim deleted successfully",
    deletedClaimId: claimId,
    deletedClaim: {
      type: deletedClaim.type,
      url: deletedClaim.url,
      status: deletedClaim.status
    }
  }, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...securityHeaders(),
    },
  });
}



