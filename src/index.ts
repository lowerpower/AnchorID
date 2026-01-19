


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
  MAIL_SEND_SECRET?: string;  // mycal.net relay (preferred)
  RESEND_API_KEY?: string;    // Resend API (fallback)
  EMAIL_FROM?: string;        // Sender address (required for Resend)

  // TTL + limits
  LOGIN_TTL_SECONDS?: string;    // default 900
  LOGIN_RL_PER_HOUR?: string;    // default 3 (per email)
  UPDATE_RL_PER_HOUR?: string;   // default 20 (per UUID)

  // Per-IP rate limits
  IP_LOGIN_RL_PER_HOUR?: string;   // default 10 (per IP for login attempts)
  IP_EDIT_RL_PER_HOUR?: string;    // default 30 (per IP for edit page loads)
  IP_UPDATE_RL_PER_HOUR?: string;  // default 60 (per IP for update submissions)
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


export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;


    // Admin routes
    if (path === "/admin/login" && request.method === "GET") return handleAdminLoginPage(request, env);
    if (path === "/admin/login" && request.method === "POST") return handleAdminLoginPost(request, env);
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


    // Homepage
    if (path === "/" || path === "/index.html") {
      return new Response(
        `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>AnchorID</title>
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
    <a href="/privacy">Privacy</a>
  </nav>

  <h1>AnchorID</h1>
  <p>Canonical UUID identity anchors and resolvers. Create a permanent, decentralized identity anchor that you control.</p>

  <div class="actions">
    <a href="/signup" class="primary">Create Your AnchorID</a>
    <a href="/login" class="secondary">Edit Existing</a>
  </div>

  <p style="margin-top: 32px; color: #555; font-size: 14px;">
    Already have a UUID? Try: <code>/resolve/&lt;uuid&gt;</code>
  </p>
</body>
</html>`,
        {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "x-content-type-options": "nosniff",
            "referrer-policy": "no-referrer",
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
        },
      });
    }

	// Public claims list
	if (path.startsWith("/claims/") && (request.method === "GET" || request.method === "HEAD")) {
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



	// Token-gated: add/update claim
	if (path === "/claim" && request.method === "POST") {
  		// your existing auth guard here
  		const denied = requireAdmin(request, env);
  		if (denied) return denied;
	    
        return handlePostClaim(request, env as any);
	}

	// Token-gated: verify claim
	if (path === "/claim/verify" && request.method === "POST") {
  		// your existing auth guard here
  		const denied = requireAdmin(request, env);
		if (denied) return denied;

		return handlePostClaimVerify(request, env as any);
	}

    // Resolver (v1): /resolve/<uuid>
    if (path.startsWith("/resolve/")) {
      return handleResolve(request, env);
    }

    // Public signup (self-service identity creation)
    if (path === "/signup" && request.method === "GET") {
      return handleSignupPage(request, env);
    }
    if (path === "/signup" && request.method === "POST") {
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
  label { font-weight:600; display:block; margin-bottom:6px; }
  input { width:100%; box-sizing:border-box; padding:10px; border:1px solid #ddd; border-radius:8px; font:inherit; }
  button { padding:10px 14px; border-radius:10px; border:1px solid #111; background:#111; color:#fff; cursor:pointer; font:inherit; }
  .hint { color:#555; font-size:13px; margin-top:6px; }
  .badge { display:inline-block; font-size:11px; padding:2px 6px; border-radius:999px; background:#1a73e8; color:#fff; margin-left:6px; vertical-align:middle; }
  a { color:#1a73e8; }
</style>
</head>
<body>
<h1>Create Your AnchorID</h1>
<p>AnchorID is a permanent, decentralized identity anchor. Once created, you control it via email magic links.</p>

<form method="post" action="/signup">
  <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">

  <div class="card required">
    <label>Email <span class="badge">Required</span></label>
    <input name="email" type="email" placeholder="you@example.com" required>
    <div class="hint">We'll send you a link to complete setup. Never shared, stored as hash only.</div>
  </div>

  <div class="card">
    <label>Name (optional)</label>
    <input name="name" placeholder="e.g., Jane Doe">
    <div class="hint">You can change this later.</div>
  </div>

  <div style="margin-top:14px">
    <button type="submit">Create Identity</button>
  </div>
</form>

<p style="margin-top:24px;font-size:13px;color:#555">
  Already have an AnchorID? <a href="/login">Request edit link</a>
</p>
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
    return htmlError("Invalid Email", "Please provide a valid email address.", "/signup");
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

  // Generate backup token
  const backupToken = randomTokenUrlSafe(24);
  const backupTokenHash = await sha256Hex(backupToken);

  const now = new Date().toISOString();
  const profile = {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": `https://anchorid.net/resolve/${uuid}`,
    identifier: {
      "@type": "PropertyValue",
      propertyID: "canonical-uuid",
      value: `urn:uuid:${uuid}`,
    },
    dateCreated: now,
    dateModified: now,
    ...(name ? { name } : {}),
    _emailHash: emailHash,
    _backupTokenHash: backupTokenHash,
  };

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

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AnchorID Created</title>
<style>
  body { font-family:system-ui; max-width:720px; margin:40px auto; padding:0 16px; line-height:1.45; }
  .card { background:#f6f6f6; padding:14px; border-radius:10px; margin-bottom:14px; }
  .success { background:#e6f4ea; border:1px solid #a8dab5; }
  .warning { background:#fff8e6; border:1px solid #ffe58f; }
  .token-box { background:#111; color:#0f0; padding:16px; border-radius:8px; font-family:monospace; font-size:14px; word-break:break-all; margin:12px 0; }
  button { padding:10px 14px; border-radius:10px; border:1px solid #111; background:#111; color:#fff; cursor:pointer; font:inherit; margin-right:8px; }
  button.secondary { background:#fff; color:#111; border:1px solid #ddd; }
  .hint { color:#555; font-size:13px; margin-top:6px; }
  code { background:#eee; padding:2px 6px; border-radius:4px; font-size:13px; }
  a { color:#1a73e8; }
  a.btn { display:inline-block; padding:12px 20px; border-radius:10px; background:#1a73e8; color:#fff; text-decoration:none; font-weight:500; }
  a.btn:hover { background:#1557b0; }
  .action-box { text-align:center; padding:20px 0; }
</style>
</head>
<body>
<h1>Your AnchorID is Ready</h1>

<div class="card success">
  <strong>Success!</strong> Your identity anchor has been created.
  <div class="hint" style="margin-top:8px">
    UUID: <code>${escapeHtml(uuid)}</code><br>
    Name: <strong>${escapeHtml(name)}</strong>
  </div>
</div>

${backupToken ? `
<div class="card warning">
  <strong>Save Your Backup Token</strong>
  <p style="margin:8px 0">This token lets you recover access if you lose your email.
  <strong>It will only be shown once.</strong></p>

  <div class="token-box" id="token">${escapeHtml(backupToken)}</div>

  <button type="button" onclick="copyToken()">Copy Token</button>
  <button type="button" class="secondary" onclick="downloadToken()">Download as File</button>

  <p class="hint" style="margin-top:12px">
    Store this somewhere safe (password manager, secure note, printed copy).
  </p>
</div>

<script>
function copyToken() {
  navigator.clipboard.writeText(document.getElementById('token').textContent);
  alert('Token copied to clipboard');
}
function downloadToken() {
  const token = document.getElementById('token').textContent;
  const blob = new Blob(['AnchorID Backup Token\\n\\nUUID: ${escapeHtml(uuid)}\\nToken: ' + token + '\\n\\nKeep this file safe.'], {type: 'text/plain'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'anchorid-backup-${escapeHtml(uuid.slice(0, 8))}.txt';
  a.click();
}
</script>
` : `
<div class="card warning">
  <strong>Backup token already viewed</strong>
  <p class="hint">The backup token was shown when you first completed setup.</p>
</div>
`}

<div class="card action-box">
  <a href="/edit?token=${escapeHtml(token)}" class="btn">Edit this AnchorID</a>
  <p class="hint" style="margin-top:12px">
    This link can be used once to finish setup.<br>
    After saving, you'll need to request a new edit link by email.
  </p>
</div>

<div class="card">
  <strong>What's Next?</strong>
  <ul style="margin:8px 0;padding-left:20px">
    <li>View your public identity: <a href="/resolve/${escapeHtml(uuid)}" target="_blank">/resolve/${escapeHtml(uuid.slice(0, 8))}...</a></li>
    <li>To edit later, request a magic link at <a href="/login">/login</a></li>
    <li>Add verifiable claims to link your websites and profiles</li>
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
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
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
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

// GET /login - Public login form (request magic link)
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
  button { padding:10px 14px; border-radius:10px; border:1px solid #111; background:#111; color:#fff; cursor:pointer; font:inherit; }
  .hint { color:#555; font-size:13px; margin-top:6px; }
  a { color:#1a73e8; }
</style>
</head>
<body>
<h1>Request Edit Link</h1>
<p>Enter your email to receive a magic link for editing your AnchorID.</p>

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

<p style="margin-top:24px;font-size:13px;color:#555">
  Don't have an AnchorID? <a href="/signup">Create one</a>
</p>
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

  const current = {
    name: canonical.name || "",
    alternateName: Array.isArray(canonical.alternateName) ? canonical.alternateName : [],
    url: canonical.url || "",
    description: canonical.description || "",
    manualSameAs,
    verifiedSameAs: verifiedUrls,
    effectiveSameAs,
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
    <p class="hint">A short description of this person.</p>
    <p class="hint-secondary">Keep it concise. The canonical profile is intentionally small.</p>
  </div>

  <div style="margin-top:24px">
    <button type="submit">Save</button>
    <p class="save-hint">Date modified updates only if something actually changes.</p>
  </div>
</form>

<pre id="out"></pre>

<div class="footer">
  AnchorID favors durability over convenience.<br>
  Most changes are reversible. The identifier is not.
</div>
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

  const res = await fetch("/update", {
    method: "POST",
    headers: {"content-type":"application/json"},
    body: JSON.stringify({ token, _csrf, patch: { name, alternateName, url, sameAs, description } })
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
  const input = {
    name: patch.name,
    alternateName: patch.alternateName,
    url: patch.url,
    sameAs: patch.sameAs,
    description: patch.description,
  };

  const { profile: next, changed } = buildProfile(uuid, current, input, [], {
    persistMergedSameAs: false,
    bumpOnNoop: false,
  });

  if (changed) {
    await env.ANCHOR_KV.put(key, JSON.stringify(next));

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

function json(obj: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
      ...extraHeaders,
    },
  });
}

function ldjson(obj: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      "content-type": "application/ld+json; charset=utf-8",
      "x-content-type-options": "nosniff",
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
