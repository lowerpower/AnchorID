
// src/admin/handlers.ts
import type { Env } from "../env";
import { buildProfile, mergeSameAs } from "../domain/profile";
import { loadClaims } from "../claims/store";

// ------------------ Cookie auth ------------------

const COOKIE_NAME = "anchor_admin";
const CSRF_COOKIE_NAME = "anchor_csrf";

function getCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function setCookie(name: string, value: string): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

function clearCookie(name: string): string {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

// ------------------ CSRF Protection ------------------

function generateCsrfToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function getCsrfToken(request: Request): string | null {
  return getCookie(request, CSRF_COOKIE_NAME);
}

function setCsrfCookie(token: string): string {
  // Not HttpOnly so it can be read by JS if needed, but SameSite=Strict for CSRF protection
  return `${CSRF_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Secure; SameSite=Strict`;
}

function clearCsrfCookie(): string {
  return `${CSRF_COOKIE_NAME}=; Path=/; Max-Age=0; Secure; SameSite=Strict`;
}

// Validates CSRF token from form matches cookie
async function validateCsrf(request: Request, formData: FormData): Promise<boolean> {
  const cookieToken = getCsrfToken(request);
  const formToken = String(formData.get("_csrf") || "").trim();

  if (!cookieToken || !formToken) return false;

  // Constant-time comparison to prevent timing attacks
  if (cookieToken.length !== formToken.length) return false;

  let result = 0;
  for (let i = 0; i < cookieToken.length; i++) {
    result |= cookieToken.charCodeAt(i) ^ formToken.charCodeAt(i);
  }
  return result === 0;
}

// Returns CSRF error response
function csrfError(): Response {
  return htmlResponse(`<!doctype html>
<html><head><meta charset="utf-8"><title>Error</title></head>
<body style="font-family:system-ui;max-width:720px;margin:40px auto;padding:0 16px">
<h1>Invalid Request</h1>
<p>CSRF token validation failed. Please go back and try again.</p>
<p><a href="/admin">Return to Admin</a></p>
</body></html>`, 403);
}

// Ensures CSRF cookie is set, returns token
function ensureCsrfToken(request: Request): { token: string; needsSet: boolean } {
  const existing = getCsrfToken(request);
  if (existing) {
    return { token: existing, needsSet: false };
  }
  return { token: generateCsrfToken(), needsSet: true };
}

// ------------------ Admin Auth ------------------

// Get the admin secret from environment (explicit ANCHOR_ADMIN_SECRET preferred)
function getAdminSecret(env: Env): string | null {
  const secret = (env.ANCHOR_ADMIN_SECRET || env.ANCHOR_ADMIN_COOKIE || env.ANCHOR_ADMIN_TOKEN || "").trim();
  return secret || null;
}

export function requireAdminCookie(request: Request, env: Env): Response | null {
  const expected = getAdminSecret(env);

  // Admin routes are completely disabled if no secret is configured
  if (!expected) {
    return new Response(
      "Admin interface disabled. Set ANCHOR_ADMIN_SECRET to enable.",
      { status: 403, headers: { "content-type": "text/plain" } }
    );
  }

  const token = getCookie(request, COOKIE_NAME) || "";
  if (token !== expected) {
    return new Response(null, { status: 303, headers: { Location: "/admin/login" } });
  }
  return null;
}

// ------------------ Audit Logging ------------------

export interface AuditEntry {
  timestamp: string;       // ISO 8601
  action: "create" | "update" | "rotate_token";
  method: "admin" | "magic_link" | "backup_token";
  ipHash: string;          // First 16 chars of SHA-256(IP)
  changes?: string[];      // List of changed fields
  summary?: string;        // Optional human-readable summary
}

async function hashForAudit(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

function getClientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
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
  const ipHash = await hashForAudit(ip);

  const entry: AuditEntry = {
    timestamp: new Date().toISOString(),
    action,
    method,
    ipHash,
    ...(changes && changes.length > 0 ? { changes } : {}),
    ...(summary ? { summary } : {}),
  };

  // Load existing log (max 100 entries to prevent unbounded growth)
  const existing = await env.ANCHOR_KV.get(key, { type: "json" }) as AuditEntry[] | null;
  const log = existing || [];

  // Prepend new entry (most recent first)
  log.unshift(entry);

  // Keep only last 100 entries
  if (log.length > 100) {
    log.length = 100;
  }

  await env.ANCHOR_KV.put(key, JSON.stringify(log));
}

// Compute which fields changed between two profile objects
function computeChangedFields(before: any, after: any): string[] {
  const fields = ["name", "alternateName", "url", "description", "sameAs", "founder", "foundingDate", "affiliation"];
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

// ------------------ HTML helpers ------------------

function htmlResponse(html: string, status = 200, extra: Record<string, string> = {}) {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      ...extra,
    },
  });
}

// HTML response that ensures CSRF cookie is set
function htmlResponseWithCsrf(
  html: string,
  request: Request,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  const { token, needsSet } = ensureCsrfToken(request);
  const headers: Record<string, string> = {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    ...extraHeaders,
  };
  if (needsSet) {
    headers["set-cookie"] = setCsrfCookie(token);
  }
  return new Response(html, { status, headers });
}

// Helper to inject CSRF hidden input into forms
function csrfInput(request: Request): string {
  const { token } = ensureCsrfToken(request);
  return `<input type="hidden" name="_csrf" value="${escapeHtml(token)}">`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function uuidV4(): string {
  return crypto.randomUUID();
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function generateBackupToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  // URL-safe base64
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

// ------------------ Handlers ------------------

export async function handleAdminLoginPage(req: Request, env: Env): Promise<Response> {
  // Check if admin is configured
  const adminSecret = getAdminSecret(env);
  if (!adminSecret) {
    return new Response(
      "Admin interface disabled. Set ANCHOR_ADMIN_SECRET to enable.",
      { status: 403, headers: { "content-type": "text/plain" } }
    );
  }

  const csrf = csrfInput(req);
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AnchorID Admin Login</title></head>
<body style="font-family:system-ui;max-width:720px;margin:40px auto;padding:0 16px;line-height:1.45">
<h1>Admin Login</h1>
<form method="post" action="/admin/login">
  ${csrf}
  <label>Admin Secret<br><input style="width:100%" name="token" type="password" autocomplete="off"></label><br><br>
  <button type="submit">Login</button>
</form>
</body></html>`;
  return htmlResponseWithCsrf(html, req);
}

export async function handleAdminLoginPost(req: Request, env: Env): Promise<Response> {
  const expected = getAdminSecret(env);
  if (!expected) {
    return new Response(
      "Admin interface disabled. Set ANCHOR_ADMIN_SECRET to enable.",
      { status: 403, headers: { "content-type": "text/plain" } }
    );
  }

  const fd = await req.formData();

  // Validate CSRF token
  if (!await validateCsrf(req, fd)) {
    return csrfError();
  }

  const token = String(fd.get("token") || "").trim();

  if (token !== expected) return new Response("Unauthorized", { status: 401 });

  // Generate new CSRF token on login for session isolation
  const newCsrf = generateCsrfToken();

  return new Response(null, {
    status: 303,
    headers: [
      ["set-cookie", setCookie(COOKIE_NAME, expected)],
      ["set-cookie", setCsrfCookie(newCsrf)],
      ["Location", "/admin"],
      ["cache-control", "no-store"],
    ] as [string, string][],
  });
}

export async function handleAdminLogoutPost(req: Request, env: Env): Promise<Response> {
  const denied = requireAdminCookie(req, env);
  if (denied) return denied;

  // Parse form data for CSRF validation
  const fd = await req.formData();
  if (!await validateCsrf(req, fd)) {
    return csrfError();
  }

  return new Response(null, {
    status: 303,
    headers: [
      ["set-cookie", clearCookie(COOKIE_NAME)],
      ["set-cookie", clearCsrfCookie()],
      ["Location", "/admin/login"],
      ["cache-control", "no-store"],
    ] as [string, string][],
  });
}

export async function handleAdminHome(req: Request, env: Env): Promise<Response> {
  const denied = requireAdminCookie(req, env);
  if (denied) return denied;

  const csrf = csrfInput(req);

  const list = await env.ANCHOR_KV.list({ prefix: "profile:", limit: 200 });
  const uuids = list.keys
    .map((k) => k.name.slice("profile:".length))
    .filter(Boolean)
    .sort();

  const items = uuids
    .map((u) => `<li><a href="/admin/edit/${escapeHtml(u)}">${escapeHtml(u)}</a></li>`)
    .join("");

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AnchorID Admin</title></head>
<body style="font-family:system-ui;max-width:720px;margin:40px auto;padding:0 16px;line-height:1.45">
<h1>AnchorID Admin</h1>

<p><a href="/admin/new">Create new profile</a></p>

<h2>Profiles</h2>
<ul>${items || "<li>(none)</li>"}</ul>

<form method="post" action="/admin/logout" style="margin-top:24px">
  ${csrf}
  <button type="submit">Logout</button>
</form>
</body></html>`;

  return htmlResponseWithCsrf(html, req);
}

// GET /admin/new
export async function handleAdminNewGet(req: Request, env: Env): Promise<Response> {
  const denied = requireAdminCookie(req, env);
  if (denied) return denied;

  const url = new URL(req.url);
  const error = url.searchParams.get("error") || "";
  const errorField = url.searchParams.get("field") || "";
  const prefillEmail = url.searchParams.get("email") || "";
  const prefillName = url.searchParams.get("name") || "";
  const prefillUrl = url.searchParams.get("url") || "";

  const csrf = csrfInput(req);

  const errorMessages: Record<string, string> = {
    invalid_email: "Please enter a valid email address.",
    email_exists: "This email is already associated with a profile.",
  };

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Create Profile</title>
<style>
  body { font-family:system-ui; max-width:720px; margin:40px auto; padding:0 16px; line-height:1.45; }
  .card { background:#f6f6f6; padding:14px; border-radius:10px; }
  .card.required { border: 1px solid #1a73e8; }
  .card.error { border: 2px solid #dc3545; background: #fff5f5; }
  label { font-weight:600; display:block; margin-bottom:6px; }
  input { width:100%; box-sizing:border-box; padding:10px; border:1px solid #ddd; border-radius:8px; font:inherit; }
  input.error { border-color: #dc3545; }
  button { padding:10px 14px; border-radius:10px; border:1px solid #111; background:#111; color:#fff; cursor:pointer; font:inherit; }
  a { color: inherit; }
  .hint { color:#555; font-size:13px; margin-top:6px; }
  .error-msg { color:#dc3545; font-size:13px; margin-top:6px; font-weight:500; }
  .badge { display:inline-block; font-size:11px; padding:2px 6px; border-radius:999px; background:#1a73e8; color:#fff; margin-left:6px; vertical-align:middle; }
  .alert { padding:12px 14px; border-radius:10px; margin-bottom:14px; }
  .alert-error { background:#fff5f5; border:1px solid #dc3545; color:#dc3545; }
  .info-box { background:#e8f4fd; border:1px solid #b8daff; padding:14px; border-radius:10px; margin-bottom:14px; }
  .info-box h3 { margin:0 0 8px 0; font-size:14px; }
  .info-box p { margin:0; font-size:13px; color:#555; }
</style>
</head>
<body>
<h1>Create New Profile</h1>

<div class="info-box">
  <h3>What is an AnchorID?</h3>
  <p>An AnchorID is a permanent, UUID-based identity anchor. Once created, you control it via email magic links.
  Your identity can be cryptographically verified by third parties through the claims system.</p>
</div>

${error ? `<div class="alert alert-error">${escapeHtml(errorMessages[error] || error)}</div>` : ""}

<form method="post" action="/admin/new">
  ${csrf}
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
    <div class="hint">Cannot be changed after creation. Choose Organization for companies, nonprofits, or projects.</div>
  </div>

  <div class="card required ${errorField === "email" ? "error" : ""}" style="margin-top:14px">
    <label>Email <span class="badge">Required</span></label>
    <input name="email" type="email" placeholder="you@example.com" required
      class="${errorField === "email" ? "error" : ""}"
      value="${escapeHtml(prefillEmail)}">
    ${errorField === "email" ? `<div class="error-msg">${escapeHtml(errorMessages[error] || "Invalid email")}</div>` : ""}
    <div class="hint">Used for magic-link edit access. Stored as a hash, never in plaintext.</div>
  </div>

  <div class="card" style="margin-top:14px">
    <label>Name (optional)</label>
    <input name="name" placeholder="e.g., Jane Doe or Acme Corp" value="${escapeHtml(prefillName)}">
    <div class="hint">You can change this later.</div>
  </div>

  <div class="card" style="margin-top:14px">
    <label>About URL (optional)</label>
    <input name="url" placeholder="https://example.com/about" value="${escapeHtml(prefillUrl)}">
    <div class="hint">Will be canonicalized (https upgrade, fragments removed, etc.).</div>
  </div>

  <div style="margin-top:14px">
    <button type="submit">Create</button>
    <a href="/admin" style="margin-left:12px">Cancel</a>
  </div>
</form>
</body></html>`;

  return htmlResponseWithCsrf(html, req);
}

// POST /admin/new
export async function handleAdminNewPost(req: Request, env: Env): Promise<Response> {
  const denied = requireAdminCookie(req, env);
  if (denied) return denied;

  const fd = await req.formData();

  // Validate CSRF token
  if (!await validateCsrf(req, fd)) {
    return csrfError();
  }

  // Extract form values for potential redirect
  const rawEmail = String(fd.get("email") || "").trim();
  const name = String(fd.get("name") || "").trim();
  const urlVal = String(fd.get("url") || "").trim();
  const email = normalizeEmail(rawEmail);

  // Helper to redirect back with error
  const redirectWithError = (error: string, field: string) => {
    const params = new URLSearchParams({
      error,
      field,
      email: rawEmail,
      name,
      url: urlVal,
    });
    return new Response(null, {
      status: 303,
      headers: { Location: `/admin/new?${params.toString()}`, "cache-control": "no-store" },
    });
  };

  if (!email || !isValidEmail(email)) {
    return redirectWithError("invalid_email", "email");
  }

  const emailHash = await sha256Hex(email);

  // Check if email is already associated with a profile
  const existingUuid = await env.ANCHOR_KV.get(`email:${emailHash}`);
  if (existingUuid) {
    return redirectWithError("email_exists", "email");
  }

  const entityType = fd.get("type") === "Organization" ? "Organization" : "Person";

  const input = {
    "@type": entityType,
    name: fd.get("name"),
    url: fd.get("url"),
  };

  const uuid = crypto.randomUUID().toLowerCase();

  // Generate backup token (plaintext shown once, hash stored)
  const backupToken = generateBackupToken();
  const backupTokenHash = await sha256Hex(backupToken);

  const { profile: seeded } = buildProfile(uuid, null, input, [], {
    persistMergedSameAs: false,
    bumpOnNoop: false,
    preserveStoredTimestampsOnRead: false,
  });

  // Store email hash and backup token hash in profile metadata
  const profileWithMeta = {
    ...seeded,
    _emailHash: emailHash,
    _backupTokenHash: backupTokenHash,
  };

  // Store profile, email->uuid mapping, and temporary token display key
  // The token display key expires in 60s and is consumed by the created page
  await Promise.all([
    env.ANCHOR_KV.put(`profile:${uuid}`, JSON.stringify(profileWithMeta)),
    env.ANCHOR_KV.put(`email:${emailHash}`, uuid),
    env.ANCHOR_KV.put(`created:${uuid}`, backupToken, { expirationTtl: 60 }),
  ]);

  // Audit log for profile creation
  await appendAuditLog(env, uuid, req, "create", "admin", undefined, "Profile created");

  return new Response(null, {
    status: 303,
    headers: { Location: `/admin/created/${uuid}`, "cache-control": "no-store" },
  });
}

// GET /admin/created/<uuid> - Shows backup token ONCE after creation
export async function handleAdminCreatedGet(req: Request, env: Env, uuid: string): Promise<Response> {
  const denied = requireAdminCookie(req, env);
  if (denied) return denied;

  if (!isUuid(uuid)) return new Response("Invalid UUID", { status: 400 });

  // Get and immediately delete the one-time token
  const backupToken = await env.ANCHOR_KV.get(`created:${uuid}`);
  if (backupToken) {
    await env.ANCHOR_KV.delete(`created:${uuid}`);
  }

  const stored = (await env.ANCHOR_KV.get(`profile:${uuid}`, { type: "json" })) as any | null;
  if (!stored) return new Response("Not found", { status: 404 });

  const name = stored.name || "(unnamed)";

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Profile Created</title>
<style>
  body { font-family:system-ui; max-width:720px; margin:40px auto; padding:0 16px; line-height:1.45; }
  .card { background:#f6f6f6; padding:14px; border-radius:10px; margin-bottom:14px; }
  .success { background:#e6f4ea; border:1px solid #a8dab5; }
  .warning { background:#fff8e6; border:1px solid #ffe58f; }
  .token-box { background:#111; color:#0f0; padding:16px; border-radius:8px; font-family:monospace; font-size:14px; word-break:break-all; margin:12px 0; }
  button { padding:10px 14px; border-radius:10px; border:1px solid #111; background:#111; color:#fff; cursor:pointer; font:inherit; margin-right:8px; }
  button.secondary { background:#fff; color:#111; border:1px solid #ddd; }
  .hint { color:#555; font-size:13px; margin-top:6px; }
  code { background:#eee; padding:2px 6px; border-radius:4px; }
</style>
</head>
<body>
<h1>Profile Created</h1>

<div class="card success">
  <strong>Success!</strong> Profile for <strong>${escapeHtml(name)}</strong> has been created.
  <div class="hint">UUID: <code>${escapeHtml(uuid)}</code></div>
</div>

${backupToken ? `
<div class="card warning">
  <strong>Save Your Backup Token</strong>
  <p style="margin:8px 0">This token allows you to edit your profile if you lose access to your email.
  <strong>It will only be shown once.</strong></p>

  <div class="token-box" id="token">${escapeHtml(backupToken)}</div>

  <button type="button" onclick="copyToken()">Copy Token</button>
  <button type="button" class="secondary" onclick="downloadToken()">Download as File</button>

  <p class="hint" style="margin-top:12px">
    Store this somewhere safe (password manager, secure note, printed copy).
    If you lose both your email access and this token, you cannot recover your profile.
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
  <p class="hint">The backup token was already displayed or has expired.
  If you need a new one, you can rotate it from the edit page.</p>
</div>
`}

<div class="card">
  <a href="/admin/edit/${escapeHtml(uuid)}">Continue to Edit Profile →</a>
</div>

</body></html>`;

  return htmlResponse(html);
}

export async function handleAdminDebugKv(req: Request, env: Env): Promise<Response> {

  const denied = requireAdminCookie(req, env);
  if (denied) return denied;

  const list = await env.ANCHOR_KV.list({ prefix: "profile:", limit: 100 });

  return new Response(JSON.stringify(list, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function handleAdminEditGet(req: Request, env: Env, uuid: string): Promise<Response> {
  const denied = requireAdminCookie(req, env);
  if (denied) return denied;

  if (!isUuid(uuid)) return new Response("Invalid UUID", { status: 400 });

  const stored = (await env.ANCHOR_KV.get(`profile:${uuid}`, { type: "json" })) as any | null;
  if (!stored) return new Response("Not found", { status: 404 });

  // Check for success/error query params
  const url = new URL(req.url);
  const success = url.searchParams.get("success") || "";
  const error = url.searchParams.get("error") || "";

  const csrf = csrfInput(req);

  const claims = await loadClaims(env, uuid);
  const verifiedUrls = claims.filter((c) => c.status === "verified").map((c) => c.url);

  const { profile: canonical } = buildProfile(uuid, stored, null, verifiedUrls, {
    persistMergedSameAs: false,
    bumpOnNoop: false,
    preserveStoredTimestampsOnRead: true,
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

  const name = canonical.name || "";
  const alternateName = Array.isArray(canonical.alternateName) ? canonical.alternateName : [];
  const urlVal = canonical.url || "";
  const desc = canonical.description || "";
  const emailHash = stored?._emailHash || null;
  const backupTokenHash = stored?._backupTokenHash || null;

  // Entity-specific fields
  const founder = isOrg ? extractUuids((canonical as any).founder) : [];
  const foundingDate = isOrg ? ((canonical as any).foundingDate || "") : "";
  const affiliation = !isOrg ? extractUuids((canonical as any).affiliation) : [];

  const successMessages: Record<string, string> = {
    saved: "Profile saved successfully.",
    no_changes: "No changes detected.",
  };

  const errorMessages: Record<string, string> = {
    save_failed: "Failed to save profile. Please try again.",
    invalid_url: "One or more URLs are invalid.",
  };

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Edit Profile</title>
<style>
  body { font-family: system-ui; max-width: 860px; margin: 40px auto; padding: 0 16px; line-height: 1.45; }
  h1 { margin-bottom: 6px; }
  .meta { color:#444; margin: 0 0 14px 0; }
  .row { display:flex; gap:16px; flex-wrap:wrap; align-items:center; }
  .row a { text-decoration:none; }
  .card { background:#f6f6f6; padding: 14px; border-radius: 10px; }
  .grid { display:grid; grid-template-columns: 1fr; gap: 14px; }
  @media (min-width: 860px) { .grid { grid-template-columns: 1fr 1fr; } }
  label { font-weight: 600; display:block; margin-bottom: 6px; }
  input, textarea { width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid #ddd; border-radius: 8px; font: inherit; }
  textarea { min-height: 110px; }
  pre { margin:0; white-space: pre-wrap; word-break: break-word; background:#fff; padding:10px; border-radius:6px; border:1px solid #e0e0e0; }
  .badge { display:inline-block; font-size: 12px; padding: 3px 8px; border-radius: 999px; background: #eaeaea; margin-left: 8px; vertical-align: middle; }
  .badge.access { background: #e6f4ea; color: #1e7e34; }
  .badge.manual { background: #fff3cd; color: #856404; }
  .badge.verified { background: #d4edda; color: #155724; }
  .badge.published { background: #cce5ff; color: #004085; }
  .hint { color:#555; font-size: 13px; margin-top: 6px; }
  .actions { margin-top: 14px; display:flex; gap: 10px; align-items:center; flex-wrap:wrap; }
  button { padding: 10px 14px; border-radius: 10px; border: 1px solid #ddd; background: white; cursor:pointer; font: inherit; }
  button.primary { background: #111; color: #fff; border-color:#111; }
  .danger { background:#fff5f5; border:1px solid #ffd6d6; }
  .access-card { background: #e6f4ea; border: 1px solid #a8dab5; }
  .alert { padding:12px 14px; border-radius:10px; margin-bottom:14px; display:flex; align-items:center; gap:10px; }
  .alert-success { background:#d4edda; border:1px solid #c3e6cb; color:#155724; }
  .alert-error { background:#f8d7da; border:1px solid #f5c6cb; color:#721c24; }
  .alert-info { background:#e8f4fd; border:1px solid #b8daff; color:#004085; }
  .sameAs-manual { background:#fffbeb; border:1px solid #fcd34d; }
  .sameAs-verified { background:#ecfdf5; border:1px solid #6ee7b7; }
  .sameAs-published { background:#eff6ff; border:1px solid #93c5fd; }
</style>
</head>
<body>
<h1>Edit AnchorID</h1>
<p class="meta" style="margin-top:0">This page edits your canonical identity record. Changes here affect how you are identified across the web.</p>

${success ? `<div class="alert alert-success">${escapeHtml(successMessages[success] || success)}</div>` : ""}
${error ? `<div class="alert alert-error">${escapeHtml(errorMessages[error] || error)}</div>` : ""}

<div class="card" style="margin-bottom:14px;background:#f0f4f8;border:1px solid #d0d7de">
  <label style="margin-bottom:2px">AnchorID</label>
  <code style="font-size:15px">${escapeHtml(uuid)}</code>
  <div class="hint" style="margin-top:4px">This is your permanent identifier. It never changes, even if everything else does.</div>
  <div style="margin-top:8px;font-size:13px;color:#555">
    Type: <span class="badge" style="background:#1a73e8;color:#fff">${escapeHtml(entityType)}</span>
    &nbsp;·&nbsp;
    Created: <code>${escapeHtml(canonical.dateCreated)}</code>
    &nbsp;·&nbsp;
    Modified: <code>${escapeHtml(canonical.dateModified)}</code>
  </div>
</div>

<div class="grid" style="margin-bottom:14px">
  ${emailHash ? `
  <div class="card access-card">
    <label>Email Access <span class="badge access">Configured</span></label>
    <div class="hint" style="margin-top:0">
      Hash: <code style="font-size:11px">${escapeHtml(emailHash.slice(0, 16))}...</code>
      <br>Magic link login is enabled.
    </div>
  </div>
  ` : `
  <div class="card danger">
    <label>Email Access <span class="badge" style="background:#ffd6d6">Not configured</span></label>
    <div class="hint" style="margin-top:0">
      Created before email-based access was added.
    </div>
  </div>
  `}

  ${backupTokenHash ? `
  <div class="card access-card">
    <label>Backup Token <span class="badge access">Configured</span></label>
    <div class="hint" style="margin-top:0">
      Hash: <code style="font-size:11px">${escapeHtml(backupTokenHash.slice(0, 16))}...</code>
    </div>
    <form method="post" action="/admin/rotate-token/${escapeHtml(uuid)}" style="margin-top:8px">
      ${csrf}
      <button type="submit" style="padding:6px 10px;font-size:12px">Rotate Token</button>
    </form>
  </div>
  ` : `
  <div class="card danger">
    <label>Backup Token <span class="badge" style="background:#ffd6d6">Not configured</span></label>
    <div class="hint" style="margin-top:0">
      No backup token. Created before this feature was added.
    </div>
    <form method="post" action="/admin/rotate-token/${escapeHtml(uuid)}" style="margin-top:8px">
      ${csrf}
      <button type="submit" style="padding:6px 10px;font-size:12px">Generate Token</button>
    </form>
  </div>
  `}
</div>

<div class="row" style="margin-bottom:14px">
  <a class="card" href="/resolve/${escapeHtml(uuid)}" target="_blank">
    View <code>/resolve</code>
  </a>

  <button class="card" type="button"
    onclick="navigator.clipboard.writeText('${origin}/resolve/${escapeHtml(uuid)}')">
    Copy resolve URL
  </button>

  <a class="card" href="/claims/${escapeHtml(uuid)}" target="_blank">
    View <code>/claims</code>
  </a>

  <a class="card" href="/admin">Back to list</a>
</div>


<form method="post" action="/admin/save/${escapeHtml(uuid)}">
  ${csrf}
  <div class="grid">
    <div class="card">
      <label>Name</label>
      <input name="name" value="${escapeHtml(name)}" placeholder="e.g., Mycal">
      <div class="hint">Your primary human-readable name.</div>
      <div class="hint" style="color:#777;font-size:12px">Used by search engines and applications when displaying this identity.</div>
    </div>

    <div class="card">
      <label>URL (canonical about page)</label>
      <input name="url" value="${escapeHtml(urlVal)}" placeholder="https://example.com/about">
      <div class="hint">The main page that describes this identity.</div>
      <div class="hint" style="color:#777;font-size:12px">URLs are normalized automatically (https enforced, fragments removed). You can't break it.</div>
    </div>

    <div class="card">
      <label>Alternate names (one per line)</label>
      <textarea name="alternateName" placeholder="One per line">${escapeHtml(alternateName.join("\n"))}</textarea>
      <div class="hint">Other names this person is known by.</div>
      <div class="hint" style="color:#777;font-size:12px">Common uses: legal name, handle, transliteration, or historical name.</div>
    </div>

    <div class="card">
      <label>Description (optional)</label>
      <textarea name="description" placeholder="Short optional description">${escapeHtml(desc)}</textarea>
      <div class="hint">A short description of this ${isOrg ? "organization" : "person"}.</div>
      <div class="hint" style="color:#777;font-size:12px">Keep it concise. The canonical profile is intentionally small.</div>
    </div>
  </div>

${isOrg ? `
  <h2 style="margin-top:24px;font-size:18px">Organization Fields</h2>
  <div class="grid">
    <div class="card">
      <label>Founders (UUIDs, one per line)</label>
      <textarea name="founder" placeholder="One UUID per line">${escapeHtml(founder.join("\\n"))}</textarea>
      <div class="hint">AnchorID UUIDs of people who founded this organization.</div>
      <div class="hint" style="color:#777;font-size:12px">Enter just the UUID (e.g., 4ff7ed97-b78f-4ae6-9011-5af714ee241c).</div>
    </div>

    <div class="card">
      <label>Founding Date (optional)</label>
      <input type="date" name="foundingDate" value="${escapeHtml(foundingDate)}">
      <div class="hint">The date this organization was founded.</div>
    </div>
  </div>
` : `
  <h2 style="margin-top:24px;font-size:18px">Person Fields</h2>
  <div class="grid">
    <div class="card">
      <label>Affiliations (UUIDs, one per line)</label>
      <textarea name="affiliation" placeholder="One UUID per line">${escapeHtml(affiliation.join("\\n"))}</textarea>
      <div class="hint">AnchorID UUIDs of organizations this person is affiliated with.</div>
      <div class="hint" style="color:#777;font-size:12px">Enter just the UUID (e.g., 4ff7ed97-b78f-4ae6-9011-5af714ee241c).</div>
    </div>
  </div>
`}

  <h2 style="margin-top:24px;font-size:18px">Identity Links (sameAs)</h2>

  <div class="alert alert-info" style="margin-bottom:14px">
    <div>
      <strong>How sameAs works:</strong> Links are categorized by trust level.
      <strong>Manual</strong> links are self-declared.
      <strong>Verified</strong> links have been cryptographically proven via claims.
      <strong>Published</strong> is what the world sees (the union of both).
    </div>
  </div>

  <div class="grid">
    <div class="card sameAs-manual">
      <label>sameAs (Manual) <span class="badge manual">Editable</span></label>
      <textarea name="sameAs" placeholder="One URL per line">${escapeHtml(manualSameAs.join("\n"))}</textarea>
      <div class="hint">External profiles you control that represent the same person.</div>
      <div class="hint" style="color:#777;font-size:12px">These links are stored directly in your canonical profile.</div>
      <div class="hint" style="color:#888;font-size:11px;margin-top:8px">Examples: GitHub profile, personal site, LinkedIn, Mastodon profile</div>
    </div>

    <div class="card sameAs-verified">
      <label>sameAs (Verified) <span class="badge verified">Proven</span></label>
      <pre>${escapeHtml(verifiedUrls.join("\n") || "(none)")}</pre>
      <div class="hint">Links proven via verification claims.</div>
      <div class="hint" style="color:#777;font-size:12px">These cannot be edited here. Verification timestamps live in the claims ledger.</div>
    </div>

    <div class="card sameAs-published" style="grid-column: 1 / -1;">
      <label>sameAs (Public view) <span class="badge published">What the world sees</span></label>
      <pre>${escapeHtml(effectiveSameAs.join("\n") || "(none)")}</pre>
      <div class="hint">What the public sees from <code>/resolve</code>.</div>
      <div class="hint" style="color:#777;font-size:12px">This is the union of manual links and verified claims. This list is derived automatically and not stored directly.</div>
    </div>
  </div>

  <div class="actions">
    <button class="primary" type="submit">Save</button>
    <span class="hint">Date modified updates only if something actually changes.</span>
  </div>
</form>

<form method="post" action="/admin/logout" style="margin-top:18px">
  ${csrf}
  <button type="submit">Logout</button>
</form>

<div class="alert alert-info" style="margin-top:24px">
  <div>
    <strong>Identity Guarantees:</strong>
    Your AnchorID is a permanent, UUID-based identity anchor. Once created, only you (via email or backup token) can modify it.
    The <code>/resolve</code> endpoint returns a stable, canonical JSON-LD Person record that third parties can rely on.
    Claims provide cryptographic proof of account ownership without sharing credentials.
  </div>
</div>

<div style="margin-top:24px;padding:16px 0;border-top:1px solid #e0e0e0;text-align:center;color:#666;font-size:13px">
  <p style="margin:0">AnchorID favors durability over convenience.<br>Most changes are reversible. The identifier is not.</p>
</div>

</body></html>`;

  return htmlResponseWithCsrf(html, req);
}


export async function handleAdminSavePost(
  req: Request,
  env: Env,
  uuid: string
): Promise<Response> {
  const denied = requireAdminCookie(req, env);
  if (denied) return denied;

  if (!isUuid(uuid)) return new Response("Invalid UUID", { status: 400 });

  const stored = (await env.ANCHOR_KV.get(`profile:${uuid}`, { type: "json" })) as any | null;
  if (!stored) return new Response("Not found", { status: 404 });

  const fd = await req.formData();

  // Validate CSRF token
  if (!await validateCsrf(req, fd)) {
    return csrfError();
  }

  const input: Record<string, unknown> = {
    name: fd.get("name"),
    alternateName: fd.get("alternateName"), // string with newlines is OK
    url: fd.get("url"),
    sameAs: fd.get("sameAs"),               // string with newlines is OK
    description: fd.get("description"),
  };

  // Include entity-specific fields if present in the form
  if (fd.has("founder")) input.founder = fd.get("founder");
  if (fd.has("foundingDate")) input.foundingDate = fd.get("foundingDate");
  if (fd.has("affiliation")) input.affiliation = fd.get("affiliation");

  const { profile: next, changed } = buildProfile(uuid, stored, input, [], {
    persistMergedSameAs: false,
    bumpOnNoop: false,
    preserveStoredTimestampsOnRead: false,
  });

  // Optional safety cleanup: never persist empty arrays
  if (Array.isArray((next as any).sameAs) && (next as any).sameAs.length === 0) {
    delete (next as any).sameAs;
  }
  if (Array.isArray((next as any).alternateName) && (next as any).alternateName.length === 0) {
    delete (next as any).alternateName;
  }

  if (changed) {
    await env.ANCHOR_KV.put(`profile:${uuid}`, JSON.stringify(next));

    // Audit log
    const changedFields = computeChangedFields(stored, next);
    await appendAuditLog(env, uuid, req, "update", "admin", changedFields);

    return new Response(null, {
      status: 303,
      headers: { Location: `/admin/edit/${uuid}?success=saved`, "cache-control": "no-store" },
    });
  }

  // No changes detected
  return new Response(null, {
    status: 303,
    headers: { Location: `/admin/edit/${uuid}?success=no_changes`, "cache-control": "no-store" },
  });
}

// POST /admin/rotate-token/<uuid> - Generate new backup token and show it once
export async function handleAdminRotateToken(
  req: Request,
  env: Env,
  uuid: string
): Promise<Response> {
  const denied = requireAdminCookie(req, env);
  if (denied) return denied;

  if (!isUuid(uuid)) return new Response("Invalid UUID", { status: 400 });

  // Validate CSRF token
  const fd = await req.formData();
  if (!await validateCsrf(req, fd)) {
    return csrfError();
  }

  const stored = (await env.ANCHOR_KV.get(`profile:${uuid}`, { type: "json" })) as any | null;
  if (!stored) return new Response("Not found", { status: 404 });

  // Generate new backup token
  const newBackupToken = generateBackupToken();
  const newBackupTokenHash = await sha256Hex(newBackupToken);

  // Update profile with new hash
  const updated = {
    ...stored,
    _backupTokenHash: newBackupTokenHash,
  };
  await env.ANCHOR_KV.put(`profile:${uuid}`, JSON.stringify(updated));

  // Audit log for token rotation
  await appendAuditLog(env, uuid, req, "rotate_token", "admin", undefined, "Backup token rotated");

  const name = stored.name || "(unnamed)";

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>New Backup Token</title>
<style>
  body { font-family:system-ui; max-width:720px; margin:40px auto; padding:0 16px; line-height:1.45; }
  .card { background:#f6f6f6; padding:14px; border-radius:10px; margin-bottom:14px; }
  .warning { background:#fff8e6; border:1px solid #ffe58f; }
  .token-box { background:#111; color:#0f0; padding:16px; border-radius:8px; font-family:monospace; font-size:14px; word-break:break-all; margin:12px 0; }
  button { padding:10px 14px; border-radius:10px; border:1px solid #111; background:#111; color:#fff; cursor:pointer; font:inherit; margin-right:8px; }
  button.secondary { background:#fff; color:#111; border:1px solid #ddd; }
  .hint { color:#555; font-size:13px; margin-top:6px; }
  code { background:#eee; padding:2px 6px; border-radius:4px; }
</style>
</head>
<body>
<h1>New Backup Token</h1>

<div class="card warning">
  <strong>Save Your New Backup Token</strong>
  <p style="margin:8px 0">A new backup token has been generated for <strong>${escapeHtml(name)}</strong>.
  The old token is now invalid. <strong>This token will only be shown once.</strong></p>

  <div class="token-box" id="token">${escapeHtml(newBackupToken)}</div>

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
  const blob = new Blob(['AnchorID Backup Token (Rotated)\\n\\nUUID: ${escapeHtml(uuid)}\\nToken: ' + token + '\\n\\nKeep this file safe.'], {type: 'text/plain'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'anchorid-backup-${escapeHtml(uuid.slice(0, 8))}.txt';
  a.click();
}
</script>

<div class="card">
  <a href="/admin/edit/${escapeHtml(uuid)}">← Back to Edit Profile</a>
</div>

</body></html>`;

  return htmlResponse(html);
}
