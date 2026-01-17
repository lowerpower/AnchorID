
// src/admin/handlers.ts
import type { Env } from "../env";
import { buildProfile, mergeSameAs } from "../domain/profile";
import { loadClaims } from "../claims/store";

// ------------------ Cookie auth ------------------

const COOKIE_NAME = "anchor_admin";

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

export function requireAdminCookie(request: Request, env: Env): Response | null {
  const expected = (env.ANCHOR_ADMIN_COOKIE || env.ANCHOR_ADMIN_TOKEN || "").trim();
  if (!expected) return new Response("Admin not configured", { status: 500 });

  const token = getCookie(request, COOKIE_NAME) || "";
  if (token !== expected) {
    return new Response(null, { status: 303, headers: { Location: "/admin/login" } });
  }
  return null;
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

// ------------------ Handlers ------------------

export async function handleAdminLoginPage(_req: Request, _env: Env): Promise<Response> {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AnchorID Admin Login</title></head>
<body style="font-family:system-ui;max-width:720px;margin:40px auto;padding:0 16px;line-height:1.45">
<h1>Admin Login</h1>
<form method="post" action="/admin/login">
  <label>Admin Token<br><input style="width:100%" name="token" autocomplete="off"></label><br><br>
  <button type="submit">Login</button>
</form>
</body></html>`;
  return htmlResponse(html);
}

export async function handleAdminLoginPost(req: Request, env: Env): Promise<Response> {
  const expected = (env.ANCHOR_ADMIN_COOKIE || env.ANCHOR_ADMIN_TOKEN || "").trim();
  if (!expected) return new Response("Admin not configured", { status: 500 });

  const fd = await req.formData();
  const token = String(fd.get("token") || "").trim();

  if (token !== expected) return new Response("Unauthorized", { status: 401 });

  return new Response(null, {
    status: 303,
    headers: {
      "set-cookie": setCookie(COOKIE_NAME, expected),
      Location: "/admin",
      "cache-control": "no-store",
    },
  });
}

export async function handleAdminLogoutPost(req: Request, env: Env): Promise<Response> {
  const denied = requireAdminCookie(req, env);
  if (denied) return denied;

  return new Response(null, {
    status: 303,
    headers: {
      "set-cookie": clearCookie(COOKIE_NAME),
      Location: "/admin/login",
      "cache-control": "no-store",
    },
  });
}

export async function handleAdminHome(req: Request, env: Env): Promise<Response> {
  const denied = requireAdminCookie(req, env);
  if (denied) return denied;

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
  <button type="submit">Logout</button>
</form>
</body></html>`;

  return htmlResponse(html);
}

export async function handleAdminNewGet(req: Request, env: Env): Promise<Response> {
  const denied = requireAdminCookie(req, env);
  if (denied) return denied;

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Create Profile</title></head>
<body style="font-family:system-ui;max-width:720px;margin:40px auto;padding:0 16px;line-height:1.45">
<h1>Create New Profile</h1>
<form method="post" action="/admin/new">
  <button type="submit">Create</button>
</form>
<p style="margin-top:18px"><a href="/admin">Back</a></p>
</body></html>`;

  return htmlResponse(html);
}

export async function handleAdminNewPost(req: Request, env: Env): Promise<Response> {
  const denied = requireAdminCookie(req, env);
  if (denied) return denied;

  const uuid = uuidV4().toLowerCase();

  // Seed required canonical profile, timestamps set here (dateCreated immutable from now on)
  const { profile: seeded } = buildProfile(uuid, null, {}, [], {
    persistMergedSameAs: false,
    bumpOnNoop: false,
    preserveStoredTimestampsOnRead: false,
  });

  await env.ANCHOR_KV.put(`profile:${uuid}`, JSON.stringify(seeded));

  return new Response(null, {
    status: 303,
    headers: { Location: `/admin/edit/${uuid}`, "cache-control": "no-store" },
  });
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s
  );
}

export async function handleAdminEditGet(req: Request, env: Env, uuid: string): Promise<Response> {
  const denied = requireAdminCookie(req, env);
  if (denied) return denied;

  if (!isUuid(uuid)) return new Response("Invalid UUID", { status: 400 });

  const stored = (await env.ANCHOR_KV.get(`profile:${uuid}`, { type: "json" })) as any | null;
  if (!stored) return new Response("Not found", { status: 404 });

  const claims = await loadClaims(env, uuid);
  const verifiedUrls = claims.filter((c) => c.status === "verified").map((c) => c.url);

  const { profile: canonical } = buildProfile(uuid, stored, null, verifiedUrls, {
    persistMergedSameAs: false,
    bumpOnNoop: false,
    preserveStoredTimestampsOnRead: true,
  });

  const manualSameAs = Array.isArray(stored?.sameAs) ? stored.sameAs : [];
  const effectiveSameAs = mergeSameAs(manualSameAs, verifiedUrls);

  const name = canonical.name || "";
  const alternateName = Array.isArray(canonical.alternateName) ? canonical.alternateName : [];
  const urlVal = canonical.url || "";
  const desc = canonical.description || "";

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
  pre { margin:0; white-space: pre-wrap; word-break: break-word; }
  .badge { display:inline-block; font-size: 12px; padding: 3px 8px; border-radius: 999px; background: #eaeaea; margin-left: 8px; vertical-align: middle; }
  .hint { color:#555; font-size: 13px; margin-top: 6px; }
  .actions { margin-top: 14px; display:flex; gap: 10px; align-items:center; flex-wrap:wrap; }
  button { padding: 10px 14px; border-radius: 10px; border: 1px solid #ddd; background: white; cursor:pointer; font: inherit; }
  button.primary { background: #111; color: #fff; border-color:#111; }
  .danger { background:#fff5f5; border:1px solid #ffd6d6; }
</style>
</head>
<body>
<h1>Edit Profile</h1>
<p class="meta">
  <code>${escapeHtml(uuid)}</code><br>
  Created: <code>${escapeHtml(canonical.dateCreated)}</code>
  &nbsp;·&nbsp;
  Modified: <code>${escapeHtml(canonical.dateModified)}</code>
</p>

<div class="row" style="margin-bottom:14px">
  <a class="card" href="/resolve/${escapeHtml(uuid)}" target="_blank">View <code>/resolve</code></a>
  <a class="card" href="/claims/${escapeHtml(uuid)}" target="_blank">View <code>/claims</code></a>
  <a class="card" href="/admin">Back to list</a>
</div>

<form method="post" action="/admin/save/${escapeHtml(uuid)}">
  <div class="grid">
    <div class="card">
      <label>Name</label>
      <input name="name" value="${escapeHtml(name)}" placeholder="e.g., Mycal">
      <div class="hint">Optional. Shown as <code>name</code> in the canonical Person record.</div>
    </div>

    <div class="card">
      <label>URL <span class="badge">Canonical about page</span></label>
      <input name="url" value="${escapeHtml(urlVal)}" placeholder="https://example.com/about">
      <div class="hint">Will be canonicalized (https upgrade, hostname lowercase, fragments removed, etc.).</div>
    </div>

    <div class="card">
      <label>Alternate names <span class="badge">Manual</span></label>
      <textarea name="alternateName" placeholder="One per line">${escapeHtml(alternateName.join("\n"))}</textarea>
      <div class="hint">Stored as <code>alternateName[]</code>.</div>
    </div>

    <div class="card">
      <label>Description <span class="badge">Manual</span></label>
      <textarea name="description" placeholder="Short optional description">${escapeHtml(desc)}</textarea>
      <div class="hint">Keep this short; profile stays canonical and small.</div>
    </div>
  </div>

  <div class="grid" style="margin-top:14px">
     ${verifiedUrls.length ? `
	   <div class="card" style="background:#fffbe6;border:1px solid #ffe58f;grid-column:1 / -1">
       <strong>Important:</strong>
	   Verified identity links are sourced from claims.
       Editing <code>sameAs</code> here will not remove them —
       they are merged automatically at resolve-time.
       </div>
     ` : ""}

    <div class="card">
      <label>sameAs (Manual) <span class="badge">Stored</span></label>
      <textarea name="sameAs" placeholder="One URL per line">${escapeHtml(manualSameAs.join("\n"))}</textarea>
      <div class="hint">
        This is the only list you edit. Verified URLs come from claims and are merged at resolve-time.
      </div>
    </div>

    <div class="card">
      <label>sameAs (Verified) <span class="badge">Read-only</span></label>
      <pre>${escapeHtml(verifiedUrls.join("\n") || "(none)")}</pre>
      <div class="hint">Derived from <code>/claims</code> where verification timestamps live.</div>
    </div>

    <div class="card" style="grid-column: 1 / -1;">
      <label>sameAs (Published) <span class="badge">Manual ∪ Verified</span></label>
      <pre>${escapeHtml(effectiveSameAs.join("\n") || "(none)")}</pre>
      <div class="hint">
        This is what the public sees from <code>/resolve</code>. (Currently not persisted to KV.)
      </div>
    </div>
  </div>

  <div class="actions">
    <button class="primary" type="submit">Save</button>
    <span class="hint">Save bumps <code>dateModified</code> only if the stored profile changes.</span>
  </div>
</form>

<form method="post" action="/admin/logout" style="margin-top:18px">
  <button type="submit">Logout</button>
</form>

<div class="card danger" style="margin-top:18px">
  <strong>Reminder:</strong> Claims are the ledger (timestamps, checks). Profiles are canonical (small, stable).
</div>

</body></html>`;




  return htmlResponse(html);
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

  const input = {
    name: fd.get("name"),
    alternateName: fd.get("alternateName"), // string with newlines is OK
    url: fd.get("url"),
    sameAs: fd.get("sameAs"), // string with newlines is OK
    description: fd.get("description"),
  };

  const { profile: next, changed } = buildProfile(uuid, stored, input, [], {
    persistMergedSameAs: false,
    bumpOnNoop: false,
    preserveStoredTimestampsOnRead: false,
  });

  if (changed) {
    await env.ANCHOR_KV.put(`profile:${uuid}`, JSON.stringify(next));
  }

  return new Response(null, {
    status: 303,
    headers: { Location: `/admin/edit/${uuid}`, "cache-control": "no-store" },
  });
}



