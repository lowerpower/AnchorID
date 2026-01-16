


import {
  handleGetClaims,
  handlePostClaim,
  handlePostClaimVerify,
} from "./claims/handlers";

import { loadClaims } from "./claims/store";

export interface Env {
  // Rquired: KV storage for profiles/sessions
  ANCHOR_KV: KVNamespace;

  // If you enable email login/update
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;

  // TTL + limits
  LOGIN_TTL_SECONDS?: string;    // default 900
  LOGIN_RL_PER_HOUR?: string;    // default 3
  UPDATE_RL_PER_HOUR?: string;   // default 20
}

const FOUNDER_UUID = "4ff7ed97-b78f-4ae6-9011-5af714ee241c";

function requireAdmin(request: Request, env: Env): Response | null {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  if (!env.ANCHOR_ADMIN_TOKEN) {
    return ldjson({ error: "not_configured" }, 500, { "cache-control": "no-store" });
  }

  if (token !== env.ANCHOR_ADMIN_TOKEN) {
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



export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Homepage
    if (path === "/" || path === "/index.html") {
      return new Response(
        `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>AnchorID</title>
</head>
<body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; line-height: 1.45;">
  <h1>AnchorID</h1>
  <p>Canonical UUID identity anchors and resolvers.</p>
  <p>Try: <code>/resolve/&lt;uuid&gt;</code></p>
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

	// Public claims list
	if (path.startsWith("/claims/") && request.method === "GET") {
  		const uuid = path.slice("/claims/".length);
  		return handleGetClaims(request, env as any, uuid);
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

    // Magic-link login (v1.1)
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
    const profile = await env.ANCHOR_KV.get(kvKey, { type: "json" }) as any | null;

    if (profile) {
      // Ensure @id is correct even if stored object is older
      profile["@id"] = `https://anchorid.net/resolve/${u}`;
  
	  // ✅ ADD THIS BLOCK
  	  if (env.ANCHOR_KV) {
         const claims = await loadClaims(env, u);
         const verified = claims
           .filter((c) => c.status === "verified")
           .map((c) => c.url);

      if (verified.length) {
		 const existing = Array.isArray(profile.sameAs) ? profile.sameAs : [];
		 const merged = new Set<string>(existing.map(canonicalSameAs));

		 for (const v of verified) {
  			merged.add(canonicalSameAs(v));
		 }

		 profile.sameAs = Array.from(merged);
       }
     }

     return ldjson(profile, 200, {
        "cache-control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
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

  return ldjson(body, 200, {
    "cache-control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
  });
}


// NOTE: login/update require KV + email provider. If not configured, they return 501.

async function handleLogin(request: Request, env: Env): Promise<Response> {
  if (!env.ANCHOR_KV || !env.RESEND_API_KEY || !env.EMAIL_FROM) {
    return json({ error: "not_configured" }, 501);
  }

  const body = await request.json().catch(() => null) as { email?: string } | null;
  const email = (body?.email || "").trim().toLowerCase();

  // Always 200 to avoid user enumeration
  if (!isValidEmail(email)) return json({ ok: true }, 200, { "cache-control": "no-store" });

  const emailHash = await sha256Hex(email);

  // Rate limit per email hash per hour
  const maxPerHour = parseInt(env.LOGIN_RL_PER_HOUR || "3", 10);
  const rl = await incrWithTtl(env.ANCHOR_KV, `rl:login:${emailHash}`, 3600);
  if (rl > maxPerHour) return json({ ok: true }, 200, { "cache-control": "no-store" });

  const uuid = await env.ANCHOR_KV.get(`email:${emailHash}`);
  if (!uuid) return json({ ok: true }, 200, { "cache-control": "no-store" });

  const token = randomTokenUrlSafe(32);
  const ttl = parseInt(env.LOGIN_TTL_SECONDS || "900", 10);
  await env.ANCHOR_KV.put(`login:${token}`, JSON.stringify({ uuid, emailHash }), { expirationTtl: ttl });

  const link = `${new URL(request.url).origin}/edit?token=${encodeURIComponent(token)}`;

  await sendResendEmail(env, email, "Your AnchorID edit link", [
    `Here’s your secure edit link (expires in ${Math.round(ttl / 60)} minutes):`,
    link,
    "",
    "If you did not request this, you can ignore this email."
  ].join("\n"));

  return json({ ok: true }, 200, { "cache-control": "no-store" });
}

async function handleEditPage(request: Request, env: Env): Promise<Response> {
  if (!env.ANCHOR_KV) return new Response("Not configured", { status: 501 });

  const url = new URL(request.url);
  const token = (url.searchParams.get("token") || "").trim();
  if (!token) return new Response("Missing token", { status: 400 });

  const session = await env.ANCHOR_KV.get(`login:${token}`, { type: "json" }) as any | null;
  if (!session?.uuid) return new Response("Link expired", { status: 410 });

  const uuid = String(session.uuid).toLowerCase();
  const profile = await env.ANCHOR_KV.get(`profile:${uuid}`, { type: "json" }) as any | null;

  const current = profile || { url: "", sameAs: [], description: "" };

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Edit AnchorID</title></head>
<body style="font-family:system-ui;max-width:720px;margin:40px auto;padding:0 16px;line-height:1.45">
<h1>Edit AnchorID</h1>
<p><code>${escapeHtml(uuid)}</code></p>
<form method="post" action="/update" onsubmit="return submitForm(event)">
  <input type="hidden" name="token" value="${escapeHtml(token)}" />
  <label>URL<br><input style="width:100%" name="url" value="${escapeHtml(current.url || "")}"></label><br><br>
  <label>sameAs (one per line)<br>
    <textarea style="width:100%;height:120px" name="sameAs">${escapeHtml((current.sameAs || []).join("\\n"))}</textarea>
  </label><br><br>
  <label>Description (optional)<br>
    <textarea style="width:100%;height:80px" name="description">${escapeHtml(current.description || "")}</textarea>
  </label><br><br>
  <button type="submit">Save</button>
</form>
<pre id="out" style="margin-top:20px;white-space:pre-wrap"></pre>
<script>
async function submitForm(e){
  e.preventDefault();
  const fd = new FormData(e.target);
  const token = fd.get("token");
  const url = fd.get("url");
  const sameAs = (fd.get("sameAs")||"").toString().split(/\\r?\\n/).map(s=>s.trim()).filter(Boolean);
  const description = (fd.get("description")||"").toString().trim();

  const res = await fetch("/update", {
    method: "POST",
    headers: {"content-type":"application/json"},
    body: JSON.stringify({ token, patch: { url, sameAs, description } })
  });
  document.getElementById("out").textContent = await res.text();
  return false;
}
</script>
</body></html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}

async function handleUpdate(request: Request, env: Env): Promise<Response> {
  if (!env.ANCHOR_KV) return json({ error: "not_configured" }, 501);

  const body = await request.json().catch(() => null) as { token?: string; patch?: any } | null;
  const token = (body?.token || "").trim();
  const patch = body?.patch || null;

  if (!token || !patch) return json({ error: "bad_request" }, 400, { "cache-control": "no-store" });

  const session = await env.ANCHOR_KV.get(`login:${token}`, { type: "json" }) as any | null;
  if (!session?.uuid) return json({ error: "expired" }, 410, { "cache-control": "no-store" });

  const uuid = String(session.uuid).toLowerCase();

  const maxPerHour = parseInt(env.UPDATE_RL_PER_HOUR || "20", 10);
  const rl = await incrWithTtl(env.ANCHOR_KV, `rl:update:${uuid}`, 3600);
  if (rl > maxPerHour) return json({ error: "rate_limited" }, 429, { "cache-control": "no-store" });

  const key = `profile:${uuid}`;
  const current = await env.ANCHOR_KV.get(key, { type: "json" }) as any | null;
  if (!current) return json({ error: "not_found" }, 404, { "cache-control": "no-store" });

  const next = { ...current };

  if (typeof patch.url === "string") next.url = patch.url.trim().slice(0, 512);
  if (typeof patch.description === "string") next.description = patch.description.trim().slice(0, 512);

  if (Array.isArray(patch.sameAs)) {
    next.sameAs = patch.sameAs
      .map((s: any) => String(s).trim())
      .filter((s: string) => s.startsWith("http://") || s.startsWith("https://"))
      .slice(0, 50);
  }

  next.dateModified = new Date().toISOString();

  await env.ANCHOR_KV.put(key, JSON.stringify(next));

  // One-time token
  await env.ANCHOR_KV.delete(`login:${token}`);

  return json({ ok: true, uuid, profile: next }, 200, { "cache-control": "no-store" });
}

// ------------------ Utilities ------------------

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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c] as string));
}

async function sendResendEmail(env: Env, to: string, subject: string, text: string) {
  // Best-effort; don’t hard fail the API for email issues
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to,
      subject,
      text,
    }),
  });

  if (!res.ok) {
    // optionally: console.log(await res.text());
  }
}



