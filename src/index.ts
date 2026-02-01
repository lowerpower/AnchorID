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

import {
  handleAdminLoginPage,
  handleAdminLoginPost,
  handleAdminLogoutPost,
  handleAdminHome,
  handleAdminNewGet,
  handleAdminNewPost,
  handleAdminCreatedGet,
  handleAdminEditGet,
  handleAdminSavePost,
  handleAdminRotateToken,
  handleAdminDebugKv,
  handleAdminDelete,
  handleAdminBackup,
} from "./admin/handlers";


import {
  handleGetClaims,
  handleGetClaimsHtml,
  handlePostClaim,
  handlePostClaimVerify,
} from "./claims/handlers";

import { loadClaims } from "./claims/store";

import { buildProfile, mergeSameAs } from "./domain/profile";
import { sendEmail, hasEmailConfig } from "./email";


export interface Env {
  // Required: KV storage for profiles/sessions
  ANCHOR_KV: KVNamespace;

  // Admin secret (required for /admin/* routes)
  // Must be explicitly set - admin routes are disabled without it.
  ANCHOR_ADMIN_SECRET?: string;

  // Legacy: still supported for backward compatibility
  ANCHOR_ADMIN_TOKEN?: string;
  ANCHOR_ADMIN_COOKIE?: string;

  // Email providers (at least one required for magic links)
  MAIL_SEND_SECRET?: string;       // mycal-style mailer secret
  MYCAL_MAIL_ENDPOINT?: string;    // mycal-style mailer endpoint URL (required if using MAIL_SEND_SECRET)
  RESEND_API_KEY?: string;         // Resend API (fallback)
  EMAIL_FROM?: string;             // Sender address (required for Resend)
  BREVO_API_KEY?: string;          // Brevo API key
  BREVO_FROM?: string;             // Sender email for Brevo
  BREVO_DOMAINS?: string;          // Comma-separated domains (e.g., "outlook.com,hotmail.com")

  // TTL + limits
  LOGIN_TTL_SECONDS?: string;    // default 900
  LOGIN_RL_PER_HOUR?: string;    // default 3 (per email)
  UPDATE_RL_PER_HOUR?: string;   // default 20 (per UUID)

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

  // Optional: Enable claim verification notifications
  // If enabled, stores email in plaintext (as _email in profile) for notifications
  ENABLE_CLAIM_NOTIFICATIONS?: string; // "true" to enable
}

const FOUNDER_UUID = "4ff7ed97-b78f-4ae6-9011-5af714ee241c";


// helpers, maybe move to the bottom later
function requireAdmin(request: Request, env: Env): Response | null {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  // For API access, check ANCHOR_ADMIN_SECRET first, then fall back to ANCHOR_ADMIN_TOKEN
  const expected = (env.ANCHOR_ADMIN_SECRET || env.ANCHOR_ADMIN_TOKEN || "").trim();
  if (!expected) {
    return ldjson({ error: "admin_not_configured" }, 403, { "cache-control": "no-store" });
  }

  if (token !== expected) {
    return ldjson({ error: "unauthorized" }, 401, { "cache-control": "no-store" });
  }

  return null;
}

function canonicalSameAs(u: string): string {
  try {
    const x = new URL(u);
    // If it's exactly the origin with a trailing slash, normalize
    if (x.pathname === "/" && !x.search && !x.hash) {
      return x.origin;
    }
    return u;
  } catch {
    return u;
  }
}

function upsertSubjectOf(entity: any, claimsUrl: string) {
  const node = {
    "@type": "WebPage",
    "@id": claimsUrl,
    "url": claimsUrl,
    "name": "AnchorID Claims",
  };

  const cur = entity.subjectOf;
  const arr = Array.isArray(cur) ? cur : cur ? [cur] : [];

  // Dedup by @id/url
  const exists = arr.some((x: any) => x?.["@id"] === claimsUrl || x?.url === claimsUrl);
  if (!exists) arr.push(node);

  entity.subjectOf = arr.length === 1 ? arr[0] : arr;
}

function wantsHtml(request: Request): boolean {
  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html") || accept.includes("application/xhtml+xml");
}

// Get admin secret (explicit ANCHOR_ADMIN_SECRET preferred)
function getAdminSecret(env: Env): string | null {
  const secret = (env.ANCHOR_ADMIN_SECRET || env.ANCHOR_ADMIN_COOKIE || env.ANCHOR_ADMIN_TOKEN || "").trim();
  return secret || null;
}

function requireAdminCookie(request: Request, env: Env): Response | null {
  const expected = getAdminSecret(env);

  // Admin routes are completely disabled if no secret is configured
  if (!expected) {
    return new Response(
      "Admin interface disabled. Set ANCHOR_ADMIN_SECRET to enable.",
      { status: 403, headers: { "content-type": "text/plain" } }
    );
  }

  const cookie = request.headers.get("cookie") || "";
  const m = cookie.match(/(?:^|;\s*)anchor_admin=([^;]+)/);
  const token = m ? decodeURIComponent(m[1]) : "";

  if (token !== expected) {
    return new Response(null, { status: 303, headers: { Location: "/admin/login" } });
  }
  return null;
}

function setAdminCookie(env: Env): string {
  const secret = getAdminSecret(env) || "";
  return `anchor_admin=${encodeURIComponent(secret)}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

function clearAdminCookie(): string {
  return `anchor_admin=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

function wantsPostForm(request: Request): boolean {
  const ct = request.headers.get("content-type") || "";
  return ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data");
}

function uuidV4(): string {
  // Workers supports crypto.randomUUID()
  return crypto.randomUUID();
}

// Request size validation
const MAX_JSON_SIZE = 50 * 1024; // 50KB - generous for profile data
const MAX_URL_LENGTH = 2048; // Standard max URL length

function checkUrlLength(url: URL): Response | null {
  if (url.href.length > MAX_URL_LENGTH) {
    return new Response("URL too long", {
      status: 414,
      headers: { "content-type": "text/plain", ...securityHeaders() }
    });
  }
  return null;
}

async function checkRequestSize(request: Request, maxSize: number = MAX_JSON_SIZE): Promise<Response | null> {
  const contentLength = request.headers.get("content-length");

  // If content-length header is present and exceeds limit, reject immediately
  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (!isNaN(size) && size > maxSize) {
      return new Response("Request body too large", {
        status: 413,
        headers: { "content-type": "text/plain", ...securityHeaders() }
      });
    }
  }

  return null;
}

// Health check endpoint
async function handleHealthCheck(env: Env): Promise<Response> {
  const checks: Record<string, { status: string; message?: string; latencyMs?: number }> = {};
  let overallHealthy = true;

  // Check KV connectivity
  try {
    const startKv = Date.now();
    // Try a simple read operation - use a known key or test key
    const testResult = await env.ANCHOR_KV.get("health:check");
    const kvLatency = Date.now() - startKv;

    checks.kv = {
      status: "healthy",
      message: "KV storage is accessible",
      latencyMs: kvLatency,
    };
  } catch (e: any) {
    checks.kv = {
      status: "unhealthy",
      message: `KV error: ${e.message || "unknown"}`,
    };
    overallHealthy = false;
  }

  const response = {
    status: overallHealthy ? "healthy" : "unhealthy",
    timestamp: new Date().toISOString(),
    checks,
    version: "1.0",
  };

  return new Response(JSON.stringify(response, null, 2), {
    status: overallHealthy ? 200 : 503,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-cache, no-store, must-revalidate",
      ...securityHeaders(),
    },
  });
}


export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Check URL length early
    const urlLengthError = checkUrlLength(url);
    if (urlLengthError) return urlLengthError;

    // Check request size for POST/PUT requests with body
    if (request.method === "POST" || request.method === "PUT") {
      const contentType = request.headers.get("content-type") || "";
      if (contentType.includes("application/json") ||
          contentType.includes("application/x-www-form-urlencoded") ||
          contentType.includes("multipart/form-data")) {
        const sizeError = await checkRequestSize(request);
        if (sizeError) return sizeError;
      }
    }

    // Health check endpoint (public, no auth required)
    if ((path === "/_health" || path === "/health") && request.method === "GET") {
      return handleHealthCheck(env);
    }

    // Admin routes
    if (path === "/admin/login" && request.method === "GET") return handleAdminLoginPage(request, env);
    if (path === "/admin/login" && request.method === "POST") {
      // Per-IP rate limit for admin login to prevent brute force
      const ipLimit = parseInt(env.IP_ADMIN_LOGIN_RL_PER_HOUR || "5", 10);
      const ipRateLimited = await checkIpRateLimit(request, env, "ip:admin_login", ipLimit);
      if (ipRateLimited) return ipRateLimited;

      return handleAdminLoginPost(request, env);
    }
    if (path === "/admin/logout" && request.method === "POST") return handleAdminLogoutPost(request, env);

    if (path === "/admin" && request.method === "GET") return handleAdminHome(request, env);

    if (path === "/admin/new" && request.method === "GET") return handleAdminNewGet(request, env);
    if (path === "/admin/new" && request.method === "POST") return handleAdminNewPost(request, env);

    // Admin debug: KV list (temporary)
    if (path === "/admin/debug/kv" && request.method === "GET") return handleAdminDebugKv(request, env);

    // Profile created confirmation page (shows backup token once)
    const mCreated = path.match(/^\/admin\/created\/([0-9a-f-]{36})$/i);
    if (mCreated && request.method === "GET") return handleAdminCreatedGet(request, env, mCreated[1].toLowerCase());

    const mEdit = path.match(/^\/admin\/edit\/([0-9a-f-]{36})$/i);
    if (mEdit && request.method === "GET") return handleAdminEditGet(request, env, mEdit[1].toLowerCase());

    const mSave = path.match(/^\/admin\/save\/([0-9a-f-]{36})$/i);
    if (mSave && request.method === "POST") return handleAdminSavePost(request, env, mSave[1].toLowerCase());

    const mRotate = path.match(/^\/admin\/rotate-token\/([0-9a-f-]{36})$/i);
    if (mRotate && request.method === "POST") return handleAdminRotateToken(request, env, mRotate[1].toLowerCase());

    const mDelete = path.match(/^\/admin\/delete\/([0-9a-f-]{36})$/i);
    if (mDelete && request.method === "POST") return handleAdminDelete(request, env, mDelete[1].toLowerCase());

    if (path === "/admin/backup" && request.method === "GET") return handleAdminBackup(request, env);

    // Homepage
    if (path === "/" || path === "/index.html") {
      return new Response(
        `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>AnchorID</title>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Person",
        "@id": "https://blog.mycal.net/about/#mycal",
        "identifier": {
          "@type": "PropertyValue",
          "propertyID": "canonical-uuid",
          "value": "urn:uuid:4ff7ed97-b78f-4ae6-9011-5af714ee241c"
        },
        "name": "Mike Johnson",
        "alternateName": ["Mycal", "Michael Johnson"],
        "url": "https://blog.mycal.net/about/",
        "sameAs": [
          "https://anchorid.net/resolve/4ff7ed97-b78f-4ae6-9011-5af714ee241c",
          "https://github.com/lowerpower",
          "https://music.mycal.net"
        ]
      },
      {
        "@type": "Organization",
        "@id": "https://anchorid.net/#org",
        "identifier": {
          "@type": "PropertyValue",
          "propertyID": "canonical-uuid",
          "value": "urn:uuid:4c785577-9f55-4a22-a80b-dd1f4d9b4658"
        },
        "name": "AnchorID",
        "alternateName": "AnchorID.net",
        "description": "A permanent attribution anchor for long-lived work. Durable, UUID-based attribution that survives platform changes and outlives any single service.",
        "url": "https://anchorid.net",
        "foundingDate": "2026-01-11",
        "founder": {
          "@id": "https://blog.mycal.net/about/#mycal"
        },
        "sameAs": [
          "https://anchorid.net/resolve/4c785577-9f55-4a22-a80b-dd1f4d9b4658",
          "https://github.com/lowerpower/AnchorID"
        ],
        "slogan": "Attribution as infrastructure, not a profile"
      },
      {
        "@type": "WebSite",
        "@id": "https://anchorid.net/#website",
        "name": "AnchorID",
        "url": "https://anchorid.net",
        "publisher": {
          "@id": "https://anchorid.net/#org"
        },
        "creator": {
          "@id": "https://blog.mycal.net/about/#mycal"
        },
        "copyrightYear": 2026,
        "copyrightHolder": {
          "@id": "https://anchorid.net/#org"
        },
        "inLanguage": "en"
      },
      {
        "@type": "SoftwareApplication",
        "@id": "https://anchorid.net/#service",
        "name": "AnchorID Service",
        "applicationCategory": "Attribution Infrastructure",
        "operatingSystem": "Web",
        "description": "A UUID-based attribution service that provides permanent, machine-readable attribution anchors for long-lived work. Enables work and ideas to be attributed to the same enduring source across time, platforms, and system failures.",
        "offers": {
          "@type": "Offer",
          "price": "0",
          "priceCurrency": "USD"
        },
        "provider": {
          "@id": "https://anchorid.net/#org"
        },
        "url": "https://anchorid.net",
        "potentialAction": [
          {
            "@type": "CreateAction",
            "name": "Create AnchorID",
            "description": "Create a permanent UUID-based attribution anchor",
            "target": {
              "@type": "EntryPoint",
              "urlTemplate": "https://anchorid.net/create",
              "actionPlatform": [
                "http://schema.org/DesktopWebPlatform",
                "http://schema.org/MobileWebPlatform"
              ]
            }
          },
          {
            "@type": "SearchAction",
            "name": "Resolve AnchorID",
            "description": "Look up an identity by UUID",
            "target": {
              "@type": "EntryPoint",
              "urlTemplate": "https://anchorid.net/resolve/{uuid}",
              "actionPlatform": [
                "http://schema.org/DesktopWebPlatform",
                "http://schema.org/MobileWebPlatform"
              ]
            }
          },
          {
            "@type": "UpdateAction",
            "name": "Edit Existing AnchorID",
            "description": "Update an existing AnchorID profile",
            "target": {
              "@type": "EntryPoint",
              "urlTemplate": "https://anchorid.net/login",
              "actionPlatform": [
                "http://schema.org/DesktopWebPlatform",
                "http://schema.org/MobileWebPlatform"
              ]
            }
          }
        ],
        "featureList": [
          "UUID-based permanent identifiers",
          "Machine-readable JSON-LD identity records",
          "Website verification via .well-known/anchorid.txt",
          "DNS verification via TXT records",
          "GitHub profile verification",
          "Social profile verification",
          "Cryptographic proof of platform control",
          "Public claims ledger",
          "Email-based magic link authentication"
        ]
      },
      {
        "@type": "WebPage",
        "@id": "https://anchorid.net/#homepage",
        "name": "AnchorID - Permanent Attribution Anchor",
        "description": "A permanent attribution anchor for long-lived work. Durable, UUID-based attribution that survives platform changes and outlives any single service.",
        "url": "https://anchorid.net/",
        "isPartOf": {
          "@id": "https://anchorid.net/#website"
        },
        "about": {
          "@id": "https://anchorid.net/#service"
        },
        "mainEntity": {
          "@id": "https://anchorid.net/#service"
        },
        "publisher": {
          "@id": "https://anchorid.net/#org"
        },
        "significantLink": [
          "https://anchorid.net/create",
          "https://anchorid.net/login",
          "https://anchorid.net/about",
          "https://anchorid.net/guide",
          "https://anchorid.net/proofs",
          "https://anchorid.net/faq",
          "https://anchorid.net/privacy"
        ]
      }
    ]
  }
  </script>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; line-height: 1.45; }
    a { color: #1a73e8; }
    nav { font-size: 14px; margin-bottom: 32px; padding-bottom: 16px; border-bottom: 1px solid #eee; }
    nav span { color: #111; font-weight: 500; }
    nav a, nav span { margin-right: 16px; }
    .actions { margin-top: 24px; }
    .actions a { display: inline-block; padding: 10px 20px; border-radius: 8px; text-decoration: none; margin-right: 12px; margin-bottom: 8px; }
    .actions a.primary { background: #111; color: #fff; }
    .actions a.secondary { background: #f6f6f6; color: #111; border: 1px solid #ddd; }
  </style>
</head>
<body>
  <nav>
    <span>Home</span>
    <a href="/about">About</a>
    <a href="/guide">Guide</a>
    <a href="/proofs">Proofs</a>
    <a href="/faq">FAQ</a>
    <a href="/privacy">Privacy</a>
  </nav>

  <h1>AnchorID</h1>
  <p>A permanent attribution anchor for long-lived work. Durable, UUID-based attribution that survives platform changes and outlives any single service.</p>

  <div class="actions">
    <a href="/create" class="primary">Create Your AnchorID</a>
    <a href="/login" class="secondary">Edit Existing</a>
  </div>

  <p style="margin-top: 24px; font-size: 14px;">
    See an example: <a href="/resolve/4ff7ed97-b78f-4ae6-9011-5af714ee241c">Mike Johnson (Founder)</a>
  </p>

  <p style="margin-top: 32px; color: #555; font-size: 14px;">
    Already have a UUID? Try: <code>/resolve/&lt;uuid&gt;</code><br>
    <a href="/faq" style="color: #555;">Skeptical? Read the FAQ.</a>
  </p>

  <footer style="margin-top: 64px; border-top: 1px solid #eee; padding-top: 16px; font-size: 13px; color: #777;">
    <p>
      Built for longevity. MIT Licensed.
      Running on the Edge via Cloudflare Workers.
    </p>
  </footer>
</body>
</html>`,
        {
          headers: {
            "content-type": "text/html; charset=utf-8",
            ...securityHeaders(),
          },
        }
      );
    }

    // Public guide page
    if (path === "/guide" || path === "/guide/") {
      const html = await env.ANCHOR_KV.get("page:guide");
      if (!html) {
        return new Response("Guide not found", { status: 404 });
      }
      return new Response(html, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control":
            "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
          ...securityHeaders(),
        },
      });
    }

    // Privacy policy page
    if (path === "/privacy" || path === "/privacy/") {
      const html = await env.ANCHOR_KV.get("page:privacy");
      if (!html) {
        return new Response("Privacy policy not found", { status: 404 });
      }
      return new Response(html, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control":
            "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
          ...securityHeaders(),
        },
      });
    }

    // Sitemap
    if (path === "/sitemap.xml") {
      const xml = await env.ANCHOR_KV.get("page:sitemap");
      if (!xml) {
        return new Response("Sitemap not found", { status: 404 });
      }
      return new Response(xml, {
        headers: {
          "content-type": "application/xml; charset=utf-8",
          "cache-control":
            "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
        },
      });
    }

    // Robots.txt
    if (path === "/robots.txt") {
      const txt = await env.ANCHOR_KV.get("page:robots");
      if (!txt) {
        return new Response("robots.txt not found", { status: 404 });
      }
      return new Response(txt, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control":
            "public, max-age=86400, s-maxage=604800",
        },
      });
    }

    // Humans.txt
    if (path === "/humans.txt") {
      const txt = await env.ANCHOR_KV.get("page:humans");
      if (!txt) {
        return new Response("humans.txt not found", { status: 404 });
      }
      return new Response(txt, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control":
            "public, max-age=86400, s-maxage=604800",
        },
      });
    }

    // .well-known/anchorid.txt - Website proof for anchorid.net
    // Demonstrates website proof linking the AnchorID organization to its founder
    if (path === "/.well-known/anchorid.txt") {
      return new Response(
        `https://anchorid.net/resolve/4c785577-9f55-4a22-a80b-dd1f4d9b4658
https://anchorid.net/resolve/4ff7ed97-b78f-4ae6-9011-5af714ee241c
`,
        {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control":
              "public, max-age=86400, s-maxage=604800",
          },
        }
      );
    }

    // Proofs page
    if (path === "/proofs" || path === "/proofs/") {
      const html = await env.ANCHOR_KV.get("page:proofs");
      if (!html) {
        return new Response("Proofs not found", { status: 404 });
      }
      return new Response(html, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control":
            "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
          ...securityHeaders(),
        },
      });
    }

    // Proofs detail pages
    if (path === "/proofs/website" || path === "/proofs/website/") {
      const html = await env.ANCHOR_KV.get("page:proofs-website");
      if (!html) {
        return new Response("Website proof guide not found", { status: 404 });
      }
      return new Response(html, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control":
            "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
          ...securityHeaders(),
        },
      });
    }

    if (path === "/proofs/dns" || path === "/proofs/dns/") {
      const html = await env.ANCHOR_KV.get("page:proofs-dns");
      if (!html) {
        return new Response("DNS proof guide not found", { status: 404 });
      }
      return new Response(html, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control":
            "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
          ...securityHeaders(),
        },
      });
    }

    if (path === "/proofs/github" || path === "/proofs/github/") {
      const html = await env.ANCHOR_KV.get("page:proofs-github");
      if (!html) {
        return new Response("GitHub proof guide not found", { status: 404 });
      }
      return new Response(html, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control":
            "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
          ...securityHeaders(),
        },
      });
    }

    if (path === "/proofs/social" || path === "/proofs/social/") {
      const html = await env.ANCHOR_KV.get("page:proofs-social");
      if (!html) {
        return new Response("Social proof guide not found", { status: 404 });
      }
      return new Response(html, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control":
            "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
          ...securityHeaders(),
        },
      });
    }

    // About page
    if (path === "/about" || path === "/about/") {
      const html = await env.ANCHOR_KV.get("page:about");
      if (!html) {
        return new Response("About page not found", { status: 404 });
      }
      return new Response(html, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control":
            "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
          ...securityHeaders(),
        },
      });
    }

    // FAQ page
    if (path === "/faq" || path === "/faq/") {
      const html = await env.ANCHOR_KV.get("page:faq");
      if (!html) {
        return new Response("FAQ not found", { status: 404 });
      }
      return new Response(html, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control":
            "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
          ...securityHeaders(),
        },
      });
    }

    // /signup redirects to /create (semantic alias)
    if (path === "/signup" || path === "/signup/") {
      return new Response(null, {
        status: 301,
        headers: { "location": "/create" },
      });
    }

	// Public claims list
	if (path.startsWith("/claims/") && (request.method === "GET" || request.method === "HEAD")) {
		// Per-IP rate limit for public claims endpoint
		const ipLimit = parseInt(env.IP_CLAIMS_RL_PER_HOUR || "300", 10);
		const ipRateLimited = await checkIpRateLimit(request, env, "ip:claims", ipLimit);
		if (ipRateLimited) return ipRateLimited;

  		const uuid = path.slice("/claims/".length);

  		// If browser asks for HTML, serve the human page (GET only)
  		if (request.method === "GET" && wantsHtml(request)) {
    	return handleGetClaimsHtml(request, env, uuid);
  		}

  		// Otherwise serve JSON (GET/HEAD)
  		const res = await handleGetClaims(request, env, uuid);

  		if (request.method === "HEAD") {
    		return new Response(null, { status: res.status, headers: res.headers });
  		}

  		return res;
	}



	// Token-gated: add/update claim (admin or user for own profile)
	if (path === "/claim" && request.method === "POST") {
		// Per-IP rate limit (checked first to prevent abuse)
		const ipLimit = parseInt(env.IP_CLAIM_RL_PER_HOUR || "30", 10);
		const ipRateLimited = await checkIpRateLimit(request, env, "ip:claim", ipLimit);
		if (ipRateLimited) return ipRateLimited;

		// Parse body to get UUID
		const bodyText = await request.text();
		const payload: any = JSON.parse(bodyText);
		const targetUuid = String(payload.uuid || "").trim().toLowerCase();

		// Check admin auth first
		const adminDenied = requireAdmin(request, env);
		if (!adminDenied) {
			// Admin has access to all profiles (skip per-UUID rate limit for admins)
			return handlePostClaim(new Request(request.url, {
				method: request.method,
				headers: request.headers,
				body: bodyText,
			}), env as any);
		}

		// Not admin - check if user session for own profile
		const authHeader = request.headers.get("authorization") || "";
		const sessionToken = authHeader.replace(/^Bearer\s+/i, "").trim();

		if (sessionToken) {
			const session = (await env.ANCHOR_KV.get(`login:${sessionToken}`, { type: "json" })) as any | null;
			if (session?.uuid && String(session.uuid).toLowerCase() === targetUuid) {
				// User authenticated for their own profile - check per-UUID rate limit
				const maxPerHour = parseInt(env.CLAIM_RL_PER_HOUR || "10", 10);
				const rl = await incrWithTtl(env.ANCHOR_KV, `rl:claim:${targetUuid}`, 3600);
				if (rl > maxPerHour) {
					return json({ error: "rate_limited", message: "Too many claim operations" }, 429, { "cache-control": "no-store", "retry-after": "3600" });
				}

				return handlePostClaim(new Request(request.url, {
					method: request.method,
					headers: request.headers,
					body: bodyText,
				}), env as any);
			}
		}

		return new Response("Unauthorized", { status: 401 });
	}

	// Token-gated: verify claim (admin or user for own profile)
	if (path === "/claim/verify" && request.method === "POST") {
		// Per-IP rate limit (checked first to prevent abuse)
		const ipLimit = parseInt(env.IP_VERIFY_RL_PER_HOUR || "20", 10);
		const ipRateLimited = await checkIpRateLimit(request, env, "ip:verify", ipLimit);
		if (ipRateLimited) return ipRateLimited;

		// Parse body to get UUID
		const bodyText = await request.text();
		const payload: any = JSON.parse(bodyText);
		const targetUuid = String(payload.uuid || "").trim().toLowerCase();

		// Check admin auth first
		const adminDenied = requireAdmin(request, env);
		if (!adminDenied) {
			// Admin has access to all profiles (skip per-UUID rate limit for admins)
			return handlePostClaimVerify(new Request(request.url, {
				method: request.method,
				headers: request.headers,
				body: bodyText,
			}), env as any);
		}

		// Not admin - check if user session for own profile
		const authHeader = request.headers.get("authorization") || "";
		const sessionToken = authHeader.replace(/^Bearer\s+/i, "").trim();

		if (sessionToken) {
			const session = (await env.ANCHOR_KV.get(`login:${sessionToken}`, { type: "json" })) as any | null;
			if (session?.uuid && String(session.uuid).toLowerCase() === targetUuid) {
				// User authenticated for their own profile - check per-UUID rate limit
				const maxPerHour = parseInt(env.VERIFY_RL_PER_HOUR || "20", 10);
				const rl = await incrWithTtl(env.ANCHOR_KV, `rl:verify:${targetUuid}`, 3600);
				if (rl > maxPerHour) {
					return json({ error: "rate_limited", message: "Too many verification attempts" }, 429, { "cache-control": "no-store", "retry-after": "3600" });
				}

				return handlePostClaimVerify(new Request(request.url, {
					method: request.method,
					headers: request.headers,
					body: bodyText,
				}), env as any);
			}
		}

		return new Response("Unauthorized", { status: 401 });
	}

    // Resolver (v1): /resolve/<uuid>
    if (path.startsWith("/resolve/")) {
      // Per-IP rate limit for public resolver endpoint
      const ipLimit = parseInt(env.IP_RESOLVE_RL_PER_HOUR || "300", 10);
      const ipRateLimited = await checkIpRateLimit(request, env, "ip:resolve", ipLimit);
      if (ipRateLimited) return ipRateLimited;

      return handleResolve(request, env);
    }

    // Public create (self-service identity creation)
    if (path === "/create" && request.method === "GET") {
      return handleSignupPage(request, env);
    }
    if (path === "/create" && request.method === "POST") {
      return handleSignup(request, env);
    }

    // Setup page (complete signup after email verification)
    if (path === "/setup" && request.method === "GET") {
      return handleSetupPage(request, env);
    }

    // Public login page (form to request magic link)
    if (path === "/login" && request.method === "GET") {
      return handleLoginPage(request, env);
    }

    // Magic-link login (v1.1) - handles both JSON API and form submission
    if (path === "/login" && request.method === "POST") {
      return handleLogin(request, env);
    }

    // Token-gated edit form
    if (path === "/edit" && request.method === "GET") {
      return handleEditPage(request, env);
    }

    // Token-gated update
    if (path === "/update" && request.method === "POST") {
      return handleUpdate(request, env);
    }

    return new Response("Not Found", { status: 404 });
  },
};

// ------------------ Routes ------------------
async function handleResolve(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const uuid = url.pathname.slice("/resolve/".length).trim();

  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidRe.test(uuid)) {
    return ldjson({ error: "invalid_uuid" }, 400, { "cache-control": "no-store" });
  }

  const u = uuid.toLowerCase();

  // 1) KV-first: profile:<uuid>
  if (env.ANCHOR_KV) {
    const kvKey = `profile:${u}`;
    const profile = (await env.ANCHOR_KV.get(kvKey, { type: "json" })) as any | null;

    if (profile) {
      const storedDateCreated = typeof profile.dateCreated === "string" ? profile.dateCreated : null;
      const storedDateModified = typeof profile.dateModified === "string" ? profile.dateModified : null;

      const claims = await loadClaims(env, u);
      const verifiedUrls = claims
        .filter((c) => c.status === "verified")
        .map((c) => c.url);

      const { profile: canonical, effectiveSameAs } = buildProfile(
        u,
        profile,
        null,
        verifiedUrls,
        {
          persistMergedSameAs: false,
          bumpOnNoop: false,
        }
      );

      // IMPORTANT: /resolve is a read view. Do not “invent” new timestamps.
      if (storedDateCreated) canonical.dateCreated = storedDateCreated;
      if (storedDateModified) canonical.dateModified = storedDateModified;

      const resolved = { ...canonical, sameAs: effectiveSameAs };

      return ldjson(resolved, 200, {
        "cache-control":
          "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      });
    }
  }

  // 2) Fallback: founder hardcode (keeps existing behavior while KV is empty)
  const founderUuid = "4ff7ed97-b78f-4ae6-9011-5af714ee241c";
  if (u !== founderUuid.toLowerCase()) {
    return ldjson(
      { error: "not_found" },
      404,
      { "cache-control": "public, max-age=60, s-maxage=300" }
    );
  }

  const body = {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": `https://anchorid.net/resolve/${founderUuid}`,
    "identifier": {
      "@type": "PropertyValue",
      "propertyID": "canonical-uuid",
      "value": `urn:uuid:${founderUuid}`,
    },
    "name": "Mycal",
    "alternateName": ["Mike Johnson", "マイカル"],
    "url": "https://blog.mycal.net/about/",
    "sameAs": [
      "https://github.com/lowerpower",
      "https://blog.mycal.net/"
    ],
    "dateCreated": "2026-01-13T00:00:00Z",
    "dateModified": "2026-01-13T00:00:00Z"
  };
//
//  const claimsUrl = `https://anchorid.net/claims/${u}`;
//  upsertSubjectOf(profile, claimsUrl)

  return ldjson(body, 200, {
    "cache-control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
  });
}


// NOTE: signup/login/update require KV + email provider. If not configured, they return 501.

// GET /signup - Public signup form
async function handleSignupPage(request: Request, env: Env): Promise<Response> {
  const { token: csrfToken, needsSet } = ensureCsrfToken(request);

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Create Your AnchorID</title>
<style>
  body { font-family:system-ui; max-width:720px; margin:40px auto; padding:0 16px; line-height:1.45; }
  .card { background:#f6f6f6; padding:14px; border-radius:10px; margin-bottom:14px; }
  .card.required { border: 1px solid #1a73e8; }
  .card.info { background:#e8f4fd; border:1px solid #b8daff; }
  label { font-weight:600; display:block; margin-bottom:6px; }
  input { width:100%; box-sizing:border-box; padding:10px; border:1px solid #ddd; border-radius:8px; font:inherit; }
  input[type="radio"], input[type="checkbox"] { width:auto; }
  input:focus { outline:2px solid #1a73e8; border-color:#1a73e8; }
  input.error { border-color:#dc3545; }
  button { padding:12px 20px; border-radius:10px; border:1px solid #111; background:#111; color:#fff; cursor:pointer; font:inherit; font-weight:500; }
  button:hover { background:#333; }
  button:disabled { background:#ccc; border-color:#ccc; cursor:not-allowed; }
  .hint { color:#555; font-size:13px; margin-top:6px; line-height:1.4; }
  .badge { display:inline-block; font-size:11px; padding:2px 6px; border-radius:999px; background:#1a73e8; color:#fff; margin-left:6px; vertical-align:middle; }
  .error-msg { color:#dc3545; font-size:13px; margin-top:6px; display:none; }
  .error-msg.show { display:block; }
  a { color:#1a73e8; }
  ol { padding-left:20px; margin:8px 0; }
  ol li { margin-bottom:6px; }
</style>
</head>
<body>
<h1>Create Your AnchorID</h1>
<p>AnchorID is a permanent, UUID-based identity anchor. Once created, only you can modify it via email magic links or backup token.</p>

<div class="card info">
  <strong>What happens next:</strong>
  <ol style="margin:8px 0;padding-left:20px;font-size:14px">
    <li>We'll send a setup link to your email (expires in 15 minutes)</li>
    <li>Click the link to verify your email and see your backup recovery token</li>
    <li>Save the backup token somewhere safe (password manager, secure note)</li>
    <li>Edit your profile and add verifiable identity claims</li>
  </ol>
</div>

<form method="post" action="/create" id="signupForm">
  <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">

  <div class="card required">
    <label>Identity Type <span class="badge">Required</span></label>
    <div style="display:flex; gap:16px; margin-top:8px;">
      <label style="font-weight:normal; display:flex; align-items:center; gap:6px; cursor:pointer;">
        <input type="radio" name="type" value="Person" checked> Person
      </label>
      <label style="font-weight:normal; display:flex; align-items:center; gap:6px; cursor:pointer;">
        <input type="radio" name="type" value="Organization"> Organization
      </label>
    </div>
    <div class="hint"><strong>Person:</strong> Individual identity (yourself, a pseudonym, etc.)<br>
    <strong>Organization:</strong> Company, nonprofit, project, or collective<br>
    ⚠️ This cannot be changed after creation.</div>
  </div>

  <div class="card required">
    <label>Email <span class="badge">Required</span></label>
    <input name="email" id="emailInput" type="email" placeholder="you@example.com" required>
    <div class="error-msg" id="emailError"></div>
    <div class="hint">
      • You'll receive a setup link at this address<br>
      • Used for magic link authentication (no passwords!)<br>
      • Never shared publicly, stored as one-way hash only<br>
      • Cannot be changed after creation (you can add recovery options)
    </div>
  </div>

  <div class="card">
    <label>Name (optional but recommended)</label>
    <input name="name" id="nameInput" placeholder="e.g., Jane Doe or Acme Corp">
    <div class="hint">Your display name. You can change this anytime later.</div>
  </div>

  <div style="margin-top:14px">
    <button type="submit" id="submitBtn">Create Identity</button>
    <span id="submitStatus" style="margin-left:10px;font-size:13px;color:#555"></span>
  </div>
</form>

<p style="margin-top:24px;font-size:13px;color:#555">
  Already have an AnchorID? <a href="/login">Request edit link</a>
</p>

<script>
(function() {
  const form = document.getElementById('signupForm');
  const emailInput = document.getElementById('emailInput');
  const emailError = document.getElementById('emailError');
  const submitBtn = document.getElementById('submitBtn');
  const submitStatus = document.getElementById('submitStatus');

  // Email validation
  emailInput.addEventListener('blur', function() {
    const email = this.value.trim();
    if (!email) return;

    if (!isValidEmail(email)) {
      emailInput.classList.add('error');
      emailError.textContent = 'Please enter a valid email address';
      emailError.classList.add('show');
    } else {
      emailInput.classList.remove('error');
      emailError.classList.remove('show');
    }
  });

  emailInput.addEventListener('input', function() {
    if (emailError.classList.contains('show')) {
      emailInput.classList.remove('error');
      emailError.classList.remove('show');
    }
  });

  function isValidEmail(email) {
    const re = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
    return re.test(email);
  }

  // Form submission
  form.addEventListener('submit', function(e) {
    const email = emailInput.value.trim();

    if (!isValidEmail(email)) {
      e.preventDefault();
      emailInput.focus();
      emailInput.classList.add('error');
      emailError.textContent = 'Please enter a valid email address';
      emailError.classList.add('show');
      return;
    }

    submitBtn.disabled = true;
    submitStatus.textContent = 'Creating identity...';
  });
})();
</script>
</body></html>`;

  const headers: Record<string, string> = {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  };
  if (needsSet) {
    headers["set-cookie"] = setCsrfCookie(csrfToken);
  }

  return new Response(html, { headers });
}

// POST /signup - Create new profile (public)
async function handleSignup(request: Request, env: Env): Promise<Response> {
  if (!env.ANCHOR_KV || !hasEmailConfig(env)) {
    return new Response("Email not configured", { status: 501 });
  }

  // Per-IP rate limit
  const ipLimit = parseInt(env.IP_LOGIN_RL_PER_HOUR || "10", 10);
  const ipRateLimited = await checkIpRateLimit(request, env, "ip:signup", ipLimit);
  if (ipRateLimited) {
    return new Response("Too many requests. Please try again later.", {
      status: 429,
      headers: { "content-type": "text/plain", "retry-after": "3600" },
    });
  }

  const fd = await request.formData();

  // Validate CSRF
  const csrfFromForm = String(fd.get("_csrf") || "").trim();
  const csrfFromCookie = getCsrfToken(request);
  if (!csrfFromCookie || csrfFromForm !== csrfFromCookie) {
    return new Response("Invalid request. Please go back and try again.", { status: 403 });
  }

  // Extract and validate email
  const rawEmail = String(fd.get("email") || "").trim();
  const email = rawEmail.toLowerCase();

  if (!isValidEmail(email)) {
    return htmlError("Invalid Email", "Please provide a valid email address.", "/create");
  }

  const emailHash = await sha256Hex(email);

  // Check if email already registered
  const existingUuid = await env.ANCHOR_KV.get(`email:${emailHash}`);
  if (existingUuid) {
    // Don't reveal if email exists - send "check your email" message either way
    return htmlSuccess(
      "Check Your Email",
      "If this email is not already registered, you'll receive a setup link shortly. If you already have an AnchorID, use the login page to request an edit link.",
      email
    );
  }

  // Create new profile
  const uuid = crypto.randomUUID().toLowerCase();
  const name = String(fd.get("name") || "").trim() || undefined;
  const entityType = fd.get("type") === "Organization" ? "Organization" : "Person";

  // Generate backup token
  const backupToken = randomTokenUrlSafe(24);
  const backupTokenHash = await sha256Hex(backupToken);

  // Use buildProfile to create canonical profile
  const { profile: canonicalProfile } = buildProfile(
    uuid,
    null, // no stored profile
    { "@type": entityType, name }, // input
    undefined, // no verified URLs yet
  );

  // Add private fields (not part of public schema)
  const profile: any = {
    ...canonicalProfile,
    _emailHash: emailHash,
    _backupTokenHash: backupTokenHash,
  };

  // Optionally store email for claim verification notifications
  if (env.ENABLE_CLAIM_NOTIFICATIONS === "true") {
    profile._email = email;
  }

  // Generate edit token for email
  const editToken = randomTokenUrlSafe(32);
  const ttl = parseInt(env.LOGIN_TTL_SECONDS || "900", 10);

  // Store everything
  await Promise.all([
    env.ANCHOR_KV.put(`profile:${uuid}`, JSON.stringify(profile)),
    env.ANCHOR_KV.put(`email:${emailHash}`, uuid),
    env.ANCHOR_KV.put(`login:${editToken}`, JSON.stringify({ uuid, emailHash, isSetup: true }), { expirationTtl: ttl }),
    env.ANCHOR_KV.put(`signup:${uuid}`, backupToken, { expirationTtl: 300 }), // 5 min to show backup token
  ]);

  // Audit log
  await appendAuditLog(env, uuid, request, "create", "magic_link", undefined, "Self-service signup");

  // Send setup email
  const origin = new URL(request.url).origin;
  const setupLink = `${origin}/setup?token=${encodeURIComponent(editToken)}&uuid=${encodeURIComponent(uuid)}`;

  await sendEmail(env, email, "Complete your AnchorID setup", [
    "Welcome to AnchorID!",
    "",
    `Complete your setup (expires in ${Math.round(ttl / 60)} minutes):`,
    setupLink,
    "",
    "This link will show you your backup recovery token. Save it somewhere safe.",
    "",
    "If you did not request this, you can ignore this email.",
  ].join("\n"));

  return htmlSuccess(
    "Check Your Email",
    "We've sent you a setup link. Click it to complete your AnchorID and receive your backup recovery token.",
    email
  );
}

// GET /setup?token=...&uuid=... - Complete signup and show backup token
async function handleSetupPage(request: Request, env: Env): Promise<Response> {
  if (!env.ANCHOR_KV) return new Response("Not configured", { status: 501 });

  const url = new URL(request.url);
  const token = (url.searchParams.get("token") || "").trim();
  const uuid = (url.searchParams.get("uuid") || "").trim().toLowerCase();

  if (!token || !uuid) {
    return new Response("Missing token or uuid", { status: 400 });
  }

  // Validate token
  const session = await env.ANCHOR_KV.get(`login:${token}`, { type: "json" }) as any | null;
  if (!session?.uuid || session.uuid !== uuid) {
    return new Response("Link expired or invalid", { status: 410 });
  }

  // Get backup token (one-time display)
  const backupToken = await env.ANCHOR_KV.get(`signup:${uuid}`);
  if (backupToken) {
    await env.ANCHOR_KV.delete(`signup:${uuid}`);
  }

  // NOTE: Don't consume the login token here - it stays valid until first save
  // This allows the user to click "Edit this AnchorID" and make changes
  // Token will be consumed by handleUpdate() on first successful save

  const profile = await env.ANCHOR_KV.get(`profile:${uuid}`, { type: "json" }) as any | null;
  const name = profile?.name || "(unnamed)";
  const entityType = profile?.["@type"] || "Person";

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AnchorID Created Successfully</title>
<style>
  body { font-family:system-ui; max-width:720px; margin:40px auto; padding:0 16px; line-height:1.45; }
  .card { background:#f6f6f6; padding:16px; border-radius:10px; margin-bottom:16px; }
  .success { background:#e6f4ea; border:2px solid #34a853; }
  .warning { background:#fff3cd; border:2px solid #ffc107; }
  .critical { background:#fff5f5; border:2px solid #dc3545; }
  .step { background:#fff; border:1px solid #e0e0e0; padding:16px; border-radius:8px; margin-bottom:12px; }
  .step-number { display:inline-block; background:#1a73e8; color:#fff; width:28px; height:28px; border-radius:50%; text-align:center; line-height:28px; font-weight:600; margin-right:10px; }
  .token-box { background:#111; color:#0f0; padding:16px; border-radius:8px; font-family:monospace; font-size:14px; word-break:break-all; margin:12px 0; user-select:all; }
  button { padding:10px 16px; border-radius:8px; border:1px solid #111; background:#111; color:#fff; cursor:pointer; font:inherit; margin-right:8px; font-weight:500; }
  button:hover { background:#333; }
  button.secondary { background:#fff; color:#111; border:1px solid #ddd; }
  button.secondary:hover { background:#f0f0f0; }
  .hint { color:#555; font-size:13px; margin-top:8px; line-height:1.4; }
  code { background:#eee; padding:2px 6px; border-radius:4px; font-size:13px; font-family:monospace; }
  .type-badge { display:inline-block; background:#1a73e8; color:#fff; font-size:12px; padding:3px 8px; border-radius:999px; margin-left:8px; vertical-align:middle; }
  a { color:#1a73e8; text-decoration:none; }
  a:hover { text-decoration:underline; }
  a.btn { display:inline-block; padding:14px 24px; border-radius:10px; background:#1a73e8; color:#fff; text-decoration:none; font-weight:600; text-align:center; }
  a.btn:hover { background:#1557b0; text-decoration:none; }
  .action-box { text-align:center; padding:20px 0; }
  ul { padding-left:20px; margin:8px 0; }
  ul li { margin-bottom:8px; }
  .icon { font-size:20px; margin-right:8px; vertical-align:middle; }
  h2 { margin-top:0; margin-bottom:12px; font-size:20px; }
  .saved-indicator { display:inline-block; background:#34a853; color:#fff; padding:4px 10px; border-radius:4px; font-size:12px; margin-left:10px; }
</style>
</head>
<body>
<div class="card success">
  <h1 style="margin:0 0 8px 0"><span class="icon">✓</span>Your AnchorID is Ready!</h1>
  <div style="font-size:14px;color:#155724">
    <strong>UUID:</strong> <code>${escapeHtml(uuid)}</code><br>
    <strong>Type:</strong> <span class="type-badge">${escapeHtml(entityType)}</span>
    <strong>Name:</strong> ${escapeHtml(name)}
  </div>
</div>

${backupToken ? `
<div class="card critical">
  <h2><span class="icon">⚠️</span>CRITICAL: Save Your Backup Recovery Token</h2>
  <p style="margin:8px 0;font-size:15px"><strong>This token will only be shown once.</strong> If you lose access to your email, this is the ONLY way to recover your AnchorID.</p>

  <div class="token-box" id="token">${escapeHtml(backupToken)}</div>

  <div style="margin:12px 0">
    <button type="button" onclick="copyToken()"><span class="icon">📋</span>Copy Token</button>
    <button type="button" class="secondary" onclick="downloadToken()"><span class="icon">💾</span>Download as File</button>
    <span id="saveStatus" class="saved-indicator" style="display:none">Copied!</span>
  </div>

  <div class="hint" style="background:#fff;padding:10px;border-radius:6px;border:1px solid #ffc107">
    <strong>Where to save it:</strong><br>
    ✓ Password manager (1Password, Bitwarden, etc.)<br>
    ✓ Secure note app (encrypted)<br>
    ✓ Printed and stored in a safe location<br>
    ✗ Do NOT store in plain text files or unencrypted notes
  </div>
</div>

<script>
let tokenSaved = false;

function copyToken() {
  const tokenText = document.getElementById('token').textContent;
  navigator.clipboard.writeText(tokenText).then(function() {
    const status = document.getElementById('saveStatus');
    status.style.display = 'inline-block';
    tokenSaved = true;
    setTimeout(() => { status.style.display = 'none'; }, 3000);
  });
}

function downloadToken() {
  const token = document.getElementById('token').textContent;
  const blob = new Blob([
    'AnchorID Backup Recovery Token\\n' +
    '================================\\n\\n' +
    'UUID: ${escapeHtml(uuid)}\\n' +
    'Type: ${escapeHtml(entityType)}\\n' +
    'Name: ${escapeHtml(name)}\\n\\n' +
    'Backup Token:\\n' + token + '\\n\\n' +
    'IMPORTANT: Keep this file secure and private.\\n' +
    'This token grants full access to your AnchorID.\\n'
  ], {type: 'text/plain'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'anchorid-backup-${escapeHtml(uuid.slice(0, 8))}.txt';
  a.click();
  tokenSaved = true;
}

window.addEventListener('beforeunload', function(e) {
  if (!tokenSaved) {
    e.preventDefault();
    e.returnValue = 'Have you saved your backup token? It will not be shown again.';
    return e.returnValue;
  }
});
</script>
` : `
<div class="card warning">
  <h2><span class="icon">ℹ️</span>Backup Token Already Viewed</h2>
  <p class="hint">The backup token was displayed when you first completed setup. If you didn't save it, you won't be able to recover access without your email.</p>
</div>
`}

<div class="card">
  <h2>Next Steps</h2>

  <div class="step">
    <span class="step-number">1</span>
    <strong>Complete Your Profile</strong>
    <p style="margin:8px 0 8px 38px;color:#555;font-size:14px">Add your name, URL, description, and other details to make your identity more useful.</p>
    <div style="margin-left:38px">
      <a href="/edit?token=${escapeHtml(token)}" class="btn">Edit Profile Now</a>
    </div>
    <p class="hint" style="margin-left:38px">This setup link expires after first save. To edit later, request a new link at <a href="/login">/login</a></p>
  </div>

  <div class="step">
    <span class="step-number">2</span>
    <strong>View Your Public Identity</strong>
    <p style="margin:8px 0 8px 38px;color:#555;font-size:14px">See how your identity appears to others and search engines.</p>
    <div style="margin-left:38px">
      <a href="/resolve/${escapeHtml(uuid)}" target="_blank" rel="noopener">View /resolve/${escapeHtml(uuid.slice(0,8))}...</a>
    </div>
  </div>

  <div class="step">
    <span class="step-number">3</span>
    <strong>Add Identity Proofs</strong>
    <p style="margin:8px 0 8px 38px;color:#555;font-size:14px">Prove ownership of websites, domains, and accounts. Verified claims strengthen your identity and appear in your sameAs links.</p>
    <div style="margin-left:38px">
      <a href="/proofs" target="_blank">Learn about identity proofs →</a>
    </div>
  </div>

  <div class="step">
    <span class="step-number">4</span>
    <strong>Place Your AnchorID</strong>
    <p style="margin:8px 0 8px 38px;color:#555;font-size:14px">Link to your AnchorID from your website, social profiles, and projects.</p>
    <div style="margin-left:38px">
      <a href="/guide" target="_blank">Read the placement guide →</a>
    </div>
  </div>
</div>

<div class="card" style="background:#f9f9f9;border:1px solid #ddd">
  <h2 style="font-size:16px">Remember:</h2>
  <ul style="font-size:14px">
    <li><strong>Email access:</strong> Request magic links at <a href="/login">/login</a></li>
    <li><strong>Backup token:</strong> Use it at <a href="/login">/login</a> if you lose email access</li>
    <li><strong>Identity is permanent:</strong> Your UUID and email cannot be changed</li>
    <li><strong>Everything else is editable:</strong> Name, description, claims, sameAs links</li>
  </ul>
</div>

</body></html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

// Helper for error pages
function htmlError(title: string, message: string, backLink: string): Response {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="font-family:system-ui;max-width:720px;margin:40px auto;padding:0 16px">
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(message)}</p>
<p><a href="${escapeHtml(backLink)}">Go back</a></p>
</body></html>`;
  return new Response(html, {
    status: 400,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      ...securityHeaders(),
    },
  });
}

// Helper for success pages
function htmlSuccess(title: string, message: string, email: string): Response {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="font-family:system-ui;max-width:720px;margin:40px auto;padding:0 16px;line-height:1.45">
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(message)}</p>
<p style="color:#555;font-size:14px">Sent to: <strong>${escapeHtml(email)}</strong></p>
<p><a href="/">Return home</a></p>
</body></html>`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      ...securityHeaders(),
    },
  });
}

// GET /login - Public login form (request magic link or use backup token)
async function handleLoginPage(request: Request, env: Env): Promise<Response> {
  const { token: csrfToken, needsSet } = ensureCsrfToken(request);

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AnchorID Login</title>
<style>
  body { font-family:system-ui; max-width:720px; margin:40px auto; padding:0 16px; line-height:1.45; }
  .card { background:#f6f6f6; padding:14px; border-radius:10px; margin-bottom:14px; }
  label { font-weight:600; display:block; margin-bottom:6px; }
  input { width:100%; box-sizing:border-box; padding:10px; border:1px solid #ddd; border-radius:8px; font:inherit; }
  input[type="radio"], input[type="checkbox"] { width:auto; }
  button { padding:10px 14px; border-radius:10px; border:1px solid #111; background:#111; color:#fff; cursor:pointer; font:inherit; }
  .hint { color:#555; font-size:13px; margin-top:6px; }
  a { color:#1a73e8; text-decoration:none; }
  a:hover { text-decoration:underline; }
  .tabs { display:flex; gap:8px; margin-bottom:20px; border-bottom:2px solid #e0e0e0; }
  .tab { padding:10px 16px; cursor:pointer; border:none; background:none; font:inherit; font-weight:500; color:#666; border-bottom:2px solid transparent; margin-bottom:-2px; }
  .tab.active { color:#111; border-bottom-color:#111; }
  .tab-content { display:none; }
  .tab-content.active { display:block; }
  code { background:#eee; padding:2px 6px; border-radius:4px; font-family:monospace; font-size:13px; }
</style>
</head>
<body>
<h1>Login to AnchorID</h1>
<p>Choose your login method below.</p>

<div class="tabs">
  <button class="tab active" onclick="switchTab('email')">Email Magic Link</button>
  <button class="tab" onclick="switchTab('backup')">Backup Token</button>
</div>

<!-- Email Magic Link Tab -->
<div id="email-tab" class="tab-content active">
  <h2 style="margin-top:0;font-size:18px">Request Edit Link via Email</h2>
  <p style="margin-bottom:14px;color:#555">We'll send a secure edit link to your email.</p>

  <form method="post" action="/login">
    <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">

    <div class="card">
      <label>Email</label>
      <input name="email" type="email" placeholder="you@example.com" required>
      <div class="hint">We'll send a secure edit link if this email has an AnchorID.</div>
    </div>

    <div style="margin-top:14px">
      <button type="submit">Send Edit Link</button>
    </div>
  </form>
</div>

<!-- Backup Token Tab -->
<div id="backup-tab" class="tab-content">
  <h2 style="margin-top:0;font-size:18px">Login with Backup Token</h2>
  <p style="margin-bottom:14px;color:#555">Use your backup recovery token to access your profile.</p>

  <form id="backupForm" onsubmit="return handleBackupLogin(event)">
    <div class="card">
      <label>AnchorID (UUID)</label>
      <input id="uuidInput" type="text" placeholder="4ff7ed97-b78f-4ae6-9011-5af714ee241c" required pattern="[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}">
      <div class="hint">Your 36-character UUID identifier.</div>
    </div>

    <div class="card">
      <label>Backup Token</label>
      <input id="tokenInput" type="text" placeholder="Enter your backup recovery token" required>
      <div class="hint">The token you saved when creating your AnchorID. This is case-sensitive.</div>
    </div>

    <div style="margin-top:14px">
      <button type="submit">Login with Backup Token</button>
    </div>
  </form>

  <div class="card" style="background:#fff8e6;border:1px solid #ffe58f;margin-top:14px">
    <strong>What is a backup token?</strong>
    <p style="margin:6px 0 0 0;font-size:13px;color:#555">
      Your backup token is a recovery code shown once during account creation.
      It allows you to access your AnchorID if you lose access to your email.
      If you don't have it, you'll need to use email login instead.
    </p>
  </div>
</div>

<p style="margin-top:24px;font-size:13px;color:#555">
  Don't have an AnchorID? <a href="/create">Create one</a>
</p>

<script>
function switchTab(tab) {
  // Update tab buttons
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');

  // Update tab content
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById(tab + '-tab').classList.add('active');
}

function handleBackupLogin(e) {
  e.preventDefault();

  const uuid = document.getElementById('uuidInput').value.trim().toLowerCase();
  const token = document.getElementById('tokenInput').value.trim();

  if (!uuid || !token) {
    alert('Please enter both UUID and backup token.');
    return false;
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(uuid)) {
    alert('Invalid UUID format. Please check and try again.');
    return false;
  }

  // Redirect to edit page with backup token parameters
  window.location.href = '/edit?backup_token=' + encodeURIComponent(token) + '&uuid=' + encodeURIComponent(uuid);
  return false;
}
</script>

</body></html>`;

  const headers: Record<string, string> = {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  };
  if (needsSet) {
    headers["set-cookie"] = setCsrfCookie(csrfToken);
  }

  return new Response(html, { headers });
}

// POST /login - Request magic link (handles both JSON API and form submission)
async function handleLogin(request: Request, env: Env): Promise<Response> {
  if (!env.ANCHOR_KV || !hasEmailConfig(env)) {
    return json({ error: "not_configured" }, 501);
  }

  // Per-IP rate limit (checked first to prevent abuse before any processing)
  const ipLimit = parseInt(env.IP_LOGIN_RL_PER_HOUR || "10", 10);
  const ipRateLimited = await checkIpRateLimit(request, env, "ip:login", ipLimit);
  if (ipRateLimited) return ipRateLimited;

  // Detect content type to support both JSON and form submissions
  const ct = request.headers.get("content-type") || "";
  const isFormSubmit = ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data");

  let email: string;
  let csrfFromRequest: string | undefined;

  if (isFormSubmit) {
    const fd = await request.formData();
    email = (String(fd.get("email") || "")).trim().toLowerCase();
    csrfFromRequest = String(fd.get("_csrf") || "").trim();

    // Validate CSRF for form submissions
    const csrfFromCookie = getCsrfToken(request);
    if (!csrfFromCookie || csrfFromRequest !== csrfFromCookie) {
      return htmlError("Invalid Request", "Please go back and try again.", "/login");
    }
  } else {
    const body = await request.json().catch(() => null) as { email?: string } | null;
    email = (body?.email || "").trim().toLowerCase();
  }

  // For invalid email, return appropriate response
  // Always same response to avoid user enumeration
  if (!isValidEmail(email)) {
    if (isFormSubmit) {
      return htmlSuccess("Check Your Email", "If this email is registered, you'll receive an edit link shortly.", email || "");
    }
    return json({ ok: true }, 200, { "cache-control": "no-store" });
  }

  const emailHash = await sha256Hex(email);

  // Rate limit per email hash per hour
  const maxPerHour = parseInt(env.LOGIN_RL_PER_HOUR || "3", 10);
  const rl = await incrWithTtl(env.ANCHOR_KV, `rl:login:${emailHash}`, 3600);
  if (rl > maxPerHour) {
    if (isFormSubmit) {
      return htmlSuccess("Check Your Email", "If this email is registered, you'll receive an edit link shortly.", email);
    }
    return json({ ok: true }, 200, { "cache-control": "no-store" });
  }

  const uuid = await env.ANCHOR_KV.get(`email:${emailHash}`);
  if (!uuid) {
    // Don't reveal if email exists
    if (isFormSubmit) {
      return htmlSuccess("Check Your Email", "If this email is registered, you'll receive an edit link shortly.", email);
    }
    return json({ ok: true }, 200, { "cache-control": "no-store" });
  }

  const token = randomTokenUrlSafe(32);
  const ttl = parseInt(env.LOGIN_TTL_SECONDS || "900", 10);
  await env.ANCHOR_KV.put(`login:${token}`, JSON.stringify({ uuid, emailHash }), { expirationTtl: ttl });

  const link = `${new URL(request.url).origin}/edit?token=${encodeURIComponent(token)}`;

  await sendEmail(env, email, "Your AnchorID edit link", [
    `Here's your secure edit link (expires in ${Math.round(ttl / 60)} minutes):`,
    link,
    "",
    "If you did not request this, you can ignore this email."
  ].join("\n"));

  if (isFormSubmit) {
    return htmlSuccess("Check Your Email", "If this email is registered, you'll receive an edit link shortly.", email);
  }
  return json({ ok: true }, 200, { "cache-control": "no-store" });
}


async function handleEditPage(request: Request, env: Env): Promise<Response> {
  if (!env.ANCHOR_KV) return new Response("Not configured", { status: 501 });

  // Per-IP rate limit for edit page access
  const ipLimit = parseInt(env.IP_EDIT_RL_PER_HOUR || "30", 10);
  const ipRateLimited = await checkIpRateLimit(request, env, "ip:edit", ipLimit);
  if (ipRateLimited) {
    return new Response(
      "Too many requests. Please try again later.",
      { status: 429, headers: { "content-type": "text/plain", "retry-after": "3600" } }
    );
  }

  const url = new URL(request.url);
  const token = (url.searchParams.get("token") || "").trim();
  const backupToken = (url.searchParams.get("backup_token") || "").trim();

  if (!token && !backupToken) {
    return new Response("Missing token or backup_token", { status: 400 });
  }

  let uuid: string;
  let sessionToken: string; // For the form submission

  if (backupToken) {
    // Backup token flow: hash the token and find matching profile
    const backupTokenHash = await sha256Hex(backupToken);

    // We need to find the profile with this backup token hash
    // Since we don't have a reverse index, we need to check via uuid parameter
    const uuidParam = (url.searchParams.get("uuid") || "").trim().toLowerCase();
    if (!uuidParam || !isUuid(uuidParam)) {
      return new Response("Missing or invalid uuid parameter for backup token", { status: 400 });
    }

    const stored = (await env.ANCHOR_KV.get(`profile:${uuidParam}`, { type: "json" })) as any | null;
    if (!stored) {
      return new Response("Profile not found", { status: 404 });
    }

    if (stored._backupTokenHash !== backupTokenHash) {
      return new Response("Invalid backup token", { status: 401 });
    }

    uuid = uuidParam;

    // Create a temporary session for this backup token access
    const tempToken = randomTokenUrlSafe(32);
    await env.ANCHOR_KV.put(`login:${tempToken}`, JSON.stringify({ uuid, backupAccess: true }), { expirationTtl: 900 });
    sessionToken = tempToken;
  } else {
    // Magic link token flow (existing behavior)
    const session = (await env.ANCHOR_KV.get(`login:${token}`, {
      type: "json",
    })) as any | null;
    if (!session?.uuid) return new Response("Link expired", { status: 410 });

    uuid = String(session.uuid).toLowerCase();
    sessionToken = token;
  }

  // Stored profile (manual fields live here)
  const stored = (await env.ANCHOR_KV.get(`profile:${uuid}`, {
    type: "json",
  })) as any | null;

  // Verified URLs from claims ledger (read-only)
  const claims = await loadClaims(env, uuid);
  const verifiedUrls = claims
    .filter((c) => c.status === "verified")
    .map((c) => c.url);

  // Canonicalize for display (does not persist)
  const { profile: canonical } = buildProfile(uuid, stored, null, verifiedUrls, {
    persistMergedSameAs: false,
    bumpOnNoop: false,
  });

  const manualSameAs = Array.isArray(stored?.sameAs) ? stored.sameAs : [];
  const effectiveSameAs = mergeSameAs(manualSameAs, verifiedUrls);

  const entityType = canonical["@type"] || "Person";
  const isOrg = entityType === "Organization";

  // Extract entity refs as UUIDs for editing
  const extractUuids = (refs: any): string[] => {
    if (!Array.isArray(refs)) return [];
    return refs
      .map((r: any) => {
        const id = r?.["@id"] || "";
        const match = id.match(/\/resolve\/([0-9a-f-]{36})$/i);
        return match ? match[1] : "";
      })
      .filter(Boolean);
  };

  const current = {
    name: canonical.name || "",
    alternateName: Array.isArray(canonical.alternateName) ? canonical.alternateName : [],
    url: canonical.url || "",
    description: canonical.description || "",
    manualSameAs,
    verifiedSameAs: verifiedUrls,
    effectiveSameAs,
    // Organization fields
    founder: isOrg ? extractUuids((canonical as any).founder) : [],
    foundingDate: isOrg ? ((canonical as any).foundingDate || "") : "",
    // Person fields
    affiliation: !isOrg ? extractUuids((canonical as any).affiliation) : [],
  };

  const { token: csrfToken, needsSet: needsCsrfCookie } = ensureCsrfToken(request);

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Edit AnchorID</title>
<style>
  body { font-family:system-ui; max-width:720px; margin:40px auto; padding:0 16px; line-height:1.5; color:#111; }
  h1 { margin-bottom:8px; }
  .intro { color:#555; margin-bottom:24px; }
  .field { margin-bottom:20px; }
  .field label { font-weight:500; display:block; margin-bottom:4px; }
  .field input, .field textarea { width:100%; padding:8px; border:1px solid #ccc; border-radius:6px; font:inherit; box-sizing:border-box; }
  .field input[type="radio"], .field input[type="checkbox"] { width:auto; }
  .field textarea { resize:vertical; }
  .hint { color:#555; font-size:13px; margin-top:4px; }
  .hint-secondary { color:#777; font-size:12px; margin-top:2px; }
  .section { margin-top:24px; padding-top:16px; border-top:1px solid #eee; }
  .section h3 { margin:0 0 8px 0; font-size:15px; }
  .readonly-box { background:#f6f6f6; padding:12px; border-radius:8px; white-space:pre-wrap; font-family:monospace; font-size:13px; }
  .uuid-box { background:#f0f0f0; padding:10px 14px; border-radius:8px; font-family:monospace; font-size:14px; margin:8px 0 20px 0; }
  button[type="submit"] { padding:12px 24px; background:#111; color:#fff; border:none; border-radius:8px; font:inherit; cursor:pointer; }
  button[type="submit"]:hover { background:#333; }
  .save-hint { color:#555; font-size:12px; margin-top:8px; }
  .footer { margin-top:40px; padding-top:20px; border-top:1px solid #eee; color:#777; font-size:13px; }
  #out { margin-top:20px; white-space:pre-wrap; }
  #out:empty { display:none; }
</style>
</head>
<body>
<h1>Edit AnchorID</h1>
<p class="intro">This page edits your canonical identity record.<br>Changes here affect how you are identified across the web.</p>

<div class="field">
  <label>AnchorID</label>
  <div class="uuid-box">${escapeHtml(uuid)}</div>
  <p class="hint">This is your permanent identifier. It never changes, even if everything else does.</p>
</div>

<div class="field">
  <label>Type</label>
  <div class="uuid-box">${escapeHtml(entityType)}</div>
  <p class="hint">Cannot be changed after creation.</p>
</div>

<form method="post" action="/update" onsubmit="return submitForm(event)">
  <input type="hidden" name="token" value="${escapeHtml(sessionToken)}" />
  <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}" />

  <div class="field">
    <label for="name">Name</label>
    <input id="name" name="name" value="${escapeHtml(current.name)}">
    <p class="hint">Your primary human-readable name.</p>
    <p class="hint-secondary">Used by search engines and applications when displaying this identity.</p>
  </div>

  <div class="field">
    <label for="alternateName">Alternate names (one per line)</label>
    <textarea id="alternateName" name="alternateName" rows="3">${escapeHtml(current.alternateName.join("\n"))}</textarea>
    <p class="hint">Other names this person is known by.</p>
    <p class="hint-secondary">Common uses: legal name, handle, transliteration, or historical name.</p>
  </div>

  <div class="field">
    <label for="url">URL (canonical about page)</label>
    <input id="url" name="url" value="${escapeHtml(current.url)}">
    <p class="hint">The main page that describes this identity.</p>
    <p class="hint-secondary">URLs are normalized automatically (https enforced, fragments removed).</p>
  </div>

  <div class="field">
    <label for="sameAs">sameAs (Manual)</label>
    <textarea id="sameAs" name="sameAs" rows="4">${escapeHtml(current.manualSameAs.join("\n"))}</textarea>
    <p class="hint">External profiles you control that represent the same person.</p>
    <p class="hint-secondary">These links are stored directly in your canonical profile.</p>
    <p class="hint-secondary">Examples: GitHub profile, personal site, LinkedIn, Mastodon profile</p>
  </div>

  <div class="section">
    <h3>sameAs (Verified)</h3>
    <div class="readonly-box">${escapeHtml(current.verifiedSameAs.join("\n") || "(none)")}</div>
    <p class="hint">Links proven via verification claims.</p>
    <p class="hint-secondary">These cannot be edited here. Verification timestamps live in the claims ledger.</p>
  </div>

  <div class="section">
    <h3>sameAs (Public view)</h3>
    <div class="readonly-box">${escapeHtml(current.effectiveSameAs.join("\n") || "(none)")}</div>
    <p class="hint">What the public sees from /resolve.</p>
    <p class="hint-secondary">This is the union of manual links and verified claims. Derived automatically, not stored directly.</p>
  </div>

  <div class="field" style="margin-top:24px">
    <label for="description">Description (optional)</label>
    <textarea id="description" name="description" rows="3">${escapeHtml(current.description)}</textarea>
    <p class="hint">A short description of this ${isOrg ? "organization" : "person"}.</p>
    <p class="hint-secondary">Keep it concise. The canonical profile is intentionally small.</p>
  </div>

${isOrg ? `
  <div class="section">
    <h3>Organization Fields</h3>
  </div>

  <div class="field">
    <label for="founder">Founders (UUIDs, one per line)</label>
    <textarea id="founder" name="founder" rows="3">${escapeHtml(current.founder.join("\n"))}</textarea>
    <p class="hint">AnchorID UUIDs of people who founded this organization.</p>
    <p class="hint-secondary">Enter just the UUID (e.g., 4ff7ed97-b78f-4ae6-9011-5af714ee241c), not the full URL.</p>
  </div>

  <div class="field">
    <label for="foundingDate">Founding Date (optional)</label>
    <input id="foundingDate" name="foundingDate" type="date" value="${escapeHtml(current.foundingDate)}">
    <p class="hint">The date this organization was founded (ISO 8601 format).</p>
  </div>
` : `
  <div class="section">
    <h3>Person Fields</h3>
  </div>

  <div class="field">
    <label for="affiliation">Affiliations (UUIDs, one per line)</label>
    <textarea id="affiliation" name="affiliation" rows="3">${escapeHtml(current.affiliation.join("\n"))}</textarea>
    <p class="hint">AnchorID UUIDs of organizations this person is affiliated with.</p>
    <p class="hint-secondary">Enter just the UUID (e.g., 4ff7ed97-b78f-4ae6-9011-5af714ee241c), not the full URL.</p>
  </div>
`}

  <div style="margin-top:24px">
    <button type="submit">Save</button>
    <p class="save-hint">Date modified updates only if something actually changes.</p>
  </div>
</form>

<div class="section" style="margin-top:40px">
  <h2>Identity Claims</h2>
  <p class="hint">Prove ownership of websites, domains, and accounts. Verified claims automatically appear in your sameAs.</p>

${claims.length === 0 ? `<div style="background:#f6f6f6;padding:14px;border-radius:8px;margin:14px 0">
  <p style="margin:0;color:#666">No claims yet. Add your first claim below.</p>
</div>` : `
<div style="margin-top:14px;display:grid;gap:14px">
  ${claims.map((c) => {
    const statusStyle = c.status === "verified"
      ? "background:#d4edda;color:#155724;padding:3px 8px;border-radius:4px;font-size:12px"
      : c.status === "failed"
      ? "background:#f8d7da;color:#721c24;padding:3px 8px;border-radius:4px;font-size:12px"
      : "background:#fff3cd;color:#856404;padding:3px 8px;border-radius:4px;font-size:12px";

    // Map claim type to display name
    const typeDisplayName = c.type === "website" ? "WEBSITE"
      : c.type === "github" ? "GITHUB"
      : c.type === "dns" ? "DNS"
      : c.type === "social" ? "PUBLIC PROFILE"
      : escapeHtml(c.type).toUpperCase();

    let proofDetails = "";
    if (c.type === "dns" && c.proof.kind === "dns_txt") {
      const qname = escapeHtml((c.proof as any).qname || "");
      const token = escapeHtml((c.proof as any).expectedToken || "");
      proofDetails = `
        <div style="margin-top:8px;font-size:12px;color:#555">
          <strong>Query name:</strong> <code>${qname}</code><br>
          <strong>Expected:</strong> <code style="font-size:11px">${token}</code>
        </div>`;
    } else if (c.proof.kind === "well_known") {
      proofDetails = `
        <div style="margin-top:8px;font-size:12px;color:#555">
          <strong>Proof location:</strong> <code style="font-size:11px">${escapeHtml((c.proof as any).url || "")}</code>
        </div>`;
    } else if (c.proof.kind === "github_readme") {
      proofDetails = `
        <div style="margin-top:8px;font-size:12px;color:#555">
          <strong>Proof location:</strong> <code style="font-size:11px">${escapeHtml((c.proof as any).url || "")}</code>
        </div>`;
    }

    return `
    <div style="background:#f6f6f6;padding:14px;border-radius:8px">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div style="flex:1">
          <div style="font-weight:500;margin-bottom:4px">
            ${typeDisplayName}
            <span style="${statusStyle}">${escapeHtml(c.status)}</span>
          </div>
          <code style="font-size:13px;word-break:break-all">${escapeHtml(c.url)}</code>
          ${proofDetails}
          ${c.failReason ? `<div style="margin-top:8px;color:#721c24;font-size:12px">Error: ${escapeHtml(c.failReason)}</div>` : ""}
          ${c.lastCheckedAt ? `<div style="margin-top:6px;font-size:11px;color:#777">Last checked: ${escapeHtml(c.lastCheckedAt)}</div>` : ""}
        </div>
        <button type="button" class="verify-claim-btn" data-claim-id="${escapeHtml(c.id)}"
          style="padding:6px 12px;font-size:12px;margin-left:10px;white-space:nowrap;cursor:pointer;background:#111;color:#fff;border:1px solid #111;border-radius:6px">
          Verify
        </button>
      </div>
    </div>`;
  }).join("")}
</div>
`}

<details style="margin-top:20px;border:1px solid #ddd;border-radius:8px;padding:14px;background:#f9f9f9">
  <summary style="cursor:pointer;font-weight:600;font-size:14px">Add New Claim</summary>

  <div style="margin-top:14px">
    <form id="addClaimForm">
      <label style="display:block;margin-bottom:8px;font-weight:500">Claim Type</label>
      <select id="claimType" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;margin-bottom:12px;font:inherit">
        <option value="website">Website (.well-known/anchorid.txt)</option>
        <option value="github">GitHub (profile README)</option>
        <option value="dns">DNS (TXT record)</option>
        <option value="social">Public Profile (any public bio)</option>
      </select>

      <label style="display:block;margin-bottom:8px;font-weight:500" id="urlLabel">URL or Domain</label>
      <input type="text" id="claimUrl" placeholder="https://example.com or example.com"
        style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;margin-bottom:12px;font:inherit;box-sizing:border-box">

      <div id="dnsHint" style="display:none;font-size:12px;color:#555;margin-bottom:12px;padding:10px;background:#fff;border:1px solid #e0e0e0;border-radius:6px">
        <strong>DNS Setup Instructions:</strong><br>
        Add a TXT record at <code>_anchorid.yourdomain.com</code> with value:<br>
        <code style="font-size:11px">anchorid=urn:uuid:${escapeHtml(uuid)}</code>
      </div>

      <button type="submit" style="padding:8px 16px;background:#111;color:#fff;border:1px solid #111;border-radius:6px;cursor:pointer;font:inherit">
        Add Claim
      </button>
      <span id="claimStatus" style="margin-left:10px;font-size:13px"></span>
    </form>
  </div>
</details>
</div>

<pre id="out"></pre>

<div class="footer">
  AnchorID favors durability over convenience.<br>
  Most changes are reversible. The identifier is not.
</div>
<script>
// Claim form handling
(function() {
  const sessionToken = "${escapeHtml(sessionToken)}";
  const profileUuid = "${escapeHtml(uuid)}";

  // Update form hints based on claim type
  document.getElementById("claimType").addEventListener("change", function() {
    const type = this.value;
    const urlLabel = document.getElementById("urlLabel");
    const urlInput = document.getElementById("claimUrl");
    const dnsHint = document.getElementById("dnsHint");

    if (type === "website") {
      urlLabel.textContent = "Website URL";
      urlInput.placeholder = "https://example.com";
      dnsHint.style.display = "none";
    } else if (type === "github") {
      urlLabel.textContent = "GitHub Profile URL";
      urlInput.placeholder = "https://github.com/username";
      dnsHint.style.display = "none";
    } else if (type === "dns") {
      urlLabel.textContent = "Domain";
      urlInput.placeholder = "example.com or _anchorid.example.com";
      dnsHint.style.display = "block";
    } else if (type === "social") {
      urlLabel.textContent = "Profile URL or @handle";
      urlInput.placeholder = "@user@mastodon.social or https://bsky.app/profile/user.bsky.social";
      dnsHint.style.display = "none";
    }
  });

  // Add claim form submission
  document.getElementById("addClaimForm").addEventListener("submit", async function(e) {
    e.preventDefault();
    const statusEl = document.getElementById("claimStatus");
    statusEl.textContent = "Adding...";
    statusEl.style.color = "#666";

    const type = document.getElementById("claimType").value;
    const url = document.getElementById("claimUrl").value.trim();

    try {
      const res = await fetch("/claim", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + sessionToken
        },
        body: JSON.stringify({ uuid: profileUuid, type, url })
      });

      if (res.ok) {
        statusEl.textContent = "✓ Added! Reloading...";
        statusEl.style.color = "#155724";
        setTimeout(() => location.reload(), 1000);
      } else {
        const text = await res.text();
        statusEl.textContent = "✗ Failed: " + text;
        statusEl.style.color = "#721c24";
      }
    } catch (err) {
      statusEl.textContent = "✗ Network error";
      statusEl.style.color = "#721c24";
    }
  });

  // Verify claim buttons
  document.querySelectorAll(".verify-claim-btn").forEach(btn => {
    btn.addEventListener("click", async function() {
      const claimId = this.getAttribute("data-claim-id");
      this.textContent = "Verifying...";
      this.disabled = true;

      try {
        const res = await fetch("/claim/verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + sessionToken
          },
          body: JSON.stringify({ uuid: profileUuid, claimId })
        });

        if (res.ok) {
          this.textContent = "✓ Done";
          setTimeout(() => location.reload(), 1000);
        } else {
          const text = await res.text();
          alert("Verification failed: " + text);
          this.textContent = "Verify";
          this.disabled = false;
        }
      } catch (err) {
        alert("Network error: " + err.message);
        this.textContent = "Verify";
        this.disabled = false;
      }
    });
  });
})();
</script>
<script>
async function submitForm(e){
  e.preventDefault();
  const fd = new FormData(e.target);

  const token = fd.get("token");
  const _csrf = fd.get("_csrf");
  const name = (fd.get("name") || "").toString().trim();
  const alternateName = (fd.get("alternateName") || "").toString().split(/\\r?\\n/).map(s=>s.trim()).filter(Boolean);

  const url = (fd.get("url") || "").toString().trim();
  const sameAs = (fd.get("sameAs") || "").toString().split(/\\r?\\n/).map(s=>s.trim()).filter(Boolean);

  const description = (fd.get("description") || "").toString().trim();

  // Entity-specific fields
  const founder = (fd.get("founder") || "").toString().split(/\\r?\\n/).map(s=>s.trim()).filter(Boolean);
  const foundingDate = (fd.get("foundingDate") || "").toString().trim();
  const affiliation = (fd.get("affiliation") || "").toString().split(/\\r?\\n/).map(s=>s.trim()).filter(Boolean);

  const patch = { name, alternateName, url, sameAs, description };
  // Include entity-specific fields if they have input elements
  if (fd.has("founder")) patch.founder = founder;
  if (fd.has("foundingDate")) patch.foundingDate = foundingDate;
  if (fd.has("affiliation")) patch.affiliation = affiliation;

  const res = await fetch("/update", {
    method: "POST",
    headers: {"content-type":"application/json"},
    body: JSON.stringify({ token, _csrf, patch })
  });

  document.getElementById("out").textContent = await res.text();
  return false;
}
</script>
</body></html>`;

  const headers: Record<string, string> = {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  };
  if (needsCsrfCookie) {
    headers["set-cookie"] = setCsrfCookie(csrfToken);
  }

  return new Response(html, { headers });
}


async function handleUpdate(request: Request, env: Env): Promise<Response> {
  if (!env.ANCHOR_KV) return json({ error: "not_configured" }, 501);

  // Per-IP rate limit (checked first to prevent abuse)
  const ipLimit = parseInt(env.IP_UPDATE_RL_PER_HOUR || "60", 10);
  const ipRateLimited = await checkIpRateLimit(request, env, "ip:update", ipLimit);
  if (ipRateLimited) return ipRateLimited;

  const body = (await request.json().catch(() => null)) as
    | { token?: string; _csrf?: string; patch?: any }
    | null;

  const token = (body?.token || "").trim();
  const csrfFromBody = (body?._csrf || "").trim();
  const patch = body?.patch || null;

  if (!token || !patch) {
    return json({ error: "bad_request" }, 400, { "cache-control": "no-store" });
  }

  // Validate CSRF token
  if (!validateCsrfFromJson(request, csrfFromBody)) {
    return json({ error: "csrf_invalid" }, 403, { "cache-control": "no-store" });
  }

  const session = (await env.ANCHOR_KV.get(`login:${token}`, {
    type: "json",
  })) as any | null;
  if (!session?.uuid) {
    return json({ error: "expired" }, 410, { "cache-control": "no-store" });
  }

  const uuid = String(session.uuid).toLowerCase();

  // Per-UUID rate limit (in addition to per-IP)
  const maxPerHour = parseInt(env.UPDATE_RL_PER_HOUR || "20", 10);
  const rl = await incrWithTtl(env.ANCHOR_KV, `rl:update:${uuid}`, 3600);
  if (rl > maxPerHour) {
    return json({ error: "rate_limited" }, 429, { "cache-control": "no-store" });
  }

  const key = `profile:${uuid}`;
  const current = (await env.ANCHOR_KV.get(key, { type: "json" })) as any | null;
  if (!current) {
    return json({ error: "not_found" }, 404, { "cache-control": "no-store" });
  }

  // Build canonical next profile (manual fields only; verified merge happens at /resolve)
  const input: Record<string, unknown> = {
    name: patch.name,
    alternateName: patch.alternateName,
    url: patch.url,
    sameAs: patch.sameAs,
    description: patch.description,
  };

  // Include entity-specific fields if present in the patch
  if ("founder" in patch) input.founder = patch.founder;
  if ("foundingDate" in patch) input.foundingDate = patch.foundingDate;
  if ("affiliation" in patch) input.affiliation = patch.affiliation;

  const { profile: next, changed } = buildProfile(uuid, current, input, [], {
    persistMergedSameAs: false,
    bumpOnNoop: false,
  });

  if (changed) {
    // Preserve metadata fields (email, backup token, etc.) when saving
    const profileWithMeta = {
      ...next,
      ...(current._emailHash ? { _emailHash: current._emailHash } : {}),
      ...(current._backupTokenHash ? { _backupTokenHash: current._backupTokenHash } : {}),
      ...(current._email ? { _email: current._email } : {}),
    };

    await env.ANCHOR_KV.put(key, JSON.stringify(profileWithMeta));

    // Audit log
    const method = session.backupAccess ? "backup_token" : "magic_link";
    const changedFields = computeChangedFields(current, next);
    await appendAuditLog(env, uuid, request, "update", method, changedFields);
  }

  // One-time token
  await env.ANCHOR_KV.delete(`login:${token}`);

  return json({ ok: true, uuid, profile: next }, 200, {
    "cache-control": "no-store",
  });
}

// ------------------ Utilities ------------------

const CSRF_COOKIE = "anchor_csrf";

function getCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function generateCsrfToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function getCsrfToken(request: Request): string | null {
  return getCookie(request, CSRF_COOKIE);
}

function setCsrfCookie(token: string): string {
  return `${CSRF_COOKIE}=${encodeURIComponent(token)}; Path=/; Secure; SameSite=Strict`;
}

function ensureCsrfToken(request: Request): { token: string; needsSet: boolean } {
  const existing = getCsrfToken(request);
  if (existing) {
    return { token: existing, needsSet: false };
  }
  return { token: generateCsrfToken(), needsSet: true };
}

function validateCsrfFromJson(request: Request, csrfFromBody: string): boolean {
  const cookieToken = getCsrfToken(request);
  if (!cookieToken || !csrfFromBody) return false;
  if (cookieToken.length !== csrfFromBody.length) return false;
  let result = 0;
  for (let i = 0; i < cookieToken.length; i++) {
    result |= cookieToken.charCodeAt(i) ^ csrfFromBody.charCodeAt(i);
  }
  return result === 0;
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

// Security headers applied to all responses
function securityHeaders(): Record<string, string> {
  return {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "interest-cohort=()",
    "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'",
  };
}

function json(obj: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...securityHeaders(),
      ...extraHeaders,
    },
  });
}

function ldjson(obj: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      "content-type": "application/ld+json; charset=utf-8",
      ...securityHeaders(),
      ...extraHeaders,
    },
  });
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function randomTokenUrlSafe(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  let s = btoa(String.fromCharCode(...arr));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function incrWithTtl(kv: KVNamespace, key: string, ttlSeconds: number): Promise<number> {
  const cur = await kv.get(key);
  const n = (cur ? parseInt(cur, 10) : 0) + 1;
  await kv.put(key, String(n), { expirationTtl: ttlSeconds });
  return n;
}

// Get client IP from Cloudflare headers (falls back to X-Forwarded-For or unknown)
function getClientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

// Hash IP for privacy (don't store raw IPs in KV)
async function hashIp(ip: string): Promise<string> {
  const hash = await sha256Hex(ip);
  return hash.slice(0, 16); // First 16 chars is enough for rate limiting
}

// Check IP rate limit, returns error response if exceeded
async function checkIpRateLimit(
  request: Request,
  env: Env,
  prefix: string,
  limitPerHour: number
): Promise<Response | null> {
  const ip = getClientIp(request);
  const ipHash = await hashIp(ip);
  const key = `rl:${prefix}:${ipHash}`;
  const count = await incrWithTtl(env.ANCHOR_KV, key, 3600);

  if (count > limitPerHour) {
    return json(
      { error: "rate_limited", message: "Too many requests from this IP" },
      429,
      { "cache-control": "no-store", "retry-after": "3600" }
    );
  }
  return null;
}

// ------------------ Audit Logging ------------------

interface AuditEntry {
  timestamp: string;
  action: "create" | "update" | "rotate_token";
  method: "admin" | "magic_link" | "backup_token";
  ipHash: string;
  changes?: string[];
  summary?: string;
}

async function appendAuditLog(
  env: Env,
  uuid: string,
  request: Request,
  action: AuditEntry["action"],
  method: AuditEntry["method"],
  changes?: string[],
  summary?: string
): Promise<void> {
  const key = `audit:${uuid}`;
  const ip = getClientIp(request);
  const ipHash = await hashIp(ip);

  const entry: AuditEntry = {
    timestamp: new Date().toISOString(),
    action,
    method,
    ipHash,
    ...(changes && changes.length > 0 ? { changes } : {}),
    ...(summary ? { summary } : {}),
  };

  const existing = await env.ANCHOR_KV.get(key, { type: "json" }) as AuditEntry[] | null;
  const log = existing || [];

  log.unshift(entry);

  if (log.length > 100) {
    log.length = 100;
  }

  await env.ANCHOR_KV.put(key, JSON.stringify(log));
}

function computeChangedFields(before: any, after: any): string[] {
  const fields = ["name", "alternateName", "url", "description", "sameAs"];
  const changed: string[] = [];

  for (const field of fields) {
    const a = JSON.stringify(before?.[field] ?? null);
    const b = JSON.stringify(after?.[field] ?? null);
    if (a !== b) {
      changed.push(field);
    }
  }

  return changed;
}

// ------------------ HTML Helpers ------------------

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c] as string));
}
