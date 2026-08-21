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

import type { Claim, ClaimProof, ClaimStatus } from "./types";
import type { Env } from "../env";
import { clampKvTtl, intFromEnv } from "../env";

/**
 * Outcome of a verification attempt.
 *
 * `transient` marks a failure that is not the claimant's fault — an X API
 * outage, a quota ceiling, a missing token. Callers must not turn a transient
 * failure into a stored "failed" status, or an upstream hiccup would revoke
 * good claims and strip them from the published sameAs.
 */
export type VerifyResult = {
  status: ClaimStatus;
  failReason?: string;
  transient?: boolean;
};

export function claimIdForWebsite(url: string): string {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return `website:${h}`;
  } catch {
    return `website:${url}`;
  }
}

/** GitHub login rules: alphanumeric or single hyphens, max 39 chars. */
const GITHUB_LOGIN_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

/**
 * Extract the GitHub username from a profile URL.
 *
 * Returns null unless the URL is actually on github.com. Previously only
 * `pathname[0]` was used and the hostname was ignored entirely, so a claim on
 * `https://any-host.example/<name>` was "proven" by the README of
 * `github.com/<name>` — letting anyone publish a verified sameAs pointing at a
 * domain they do not control.
 */
export function parseGitHubProfile(url: string): { user: string; canonicalUrl: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }

  if (u.protocol !== "https:" && u.protocol !== "http:") return null;

  const host = u.hostname.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") return null;

  const parts = u.pathname.split("/").filter(Boolean);
  const user = (parts[0] || "").toLowerCase();
  if (!user || !GITHUB_LOGIN_RE.test(user)) return null;

  // Reject deep links (repos, gists, settings) — this claim is about a profile.
  if (parts.length > 1) return null;

  return { user, canonicalUrl: `https://github.com/${user}` };
}

export function claimIdForGitHub(url: string): string {
  const parsed = parseGitHubProfile(url);
  return parsed ? `github:${parsed.user}` : `github:${url}`;
}

/** X handles: 1-15 chars, letters/digits/underscore only. */
const X_HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

/**
 * Reserved first-path segments on x.com that are routes, not accounts.
 *
 * Some of these ("home", "about") also fail no other check, so without this
 * list https://x.com/home would be accepted as a claim on an account that
 * cannot exist.
 */
const X_RESERVED_PATHS = new Set([
  "i", "home", "explore", "search", "notifications", "messages", "settings",
  "compose", "intent", "share", "login", "logout", "signup", "account",
  "about", "tos", "privacy", "help", "download", "hashtag",
]);

const X_HOSTS = new Set(["x.com", "www.x.com", "twitter.com", "www.twitter.com"]);

/**
 * Parse an X profile reference into a canonical handle + URL.
 *
 * Accepts a bare handle ("mycal"), an @-handle ("@mycal"), or a profile URL on
 * x.com / twitter.com (with or without www.). Everything else returns null.
 *
 * The host pinning here matters for the same reason it does in
 * parseGitHubProfile: the proof is read from the X account named by the path,
 * so accepting an arbitrary host would let someone publish a verified sameAs
 * pointing at a domain they do not control.
 *
 * Canonical form is always x.com — that is the current brand and what the API
 * reports. Note canonicalizeUrl does no cross-domain aliasing, so a manual
 * sameAs entry of twitter.com/<handle> stays a separate entry.
 */
export function parseXProfile(input: string): { username: string; canonicalUrl: string } | null {
  const raw = (input || "").trim();
  if (!raw) return null;

  let handle: string;

  if (raw.includes("://") || raw.toLowerCase().startsWith("x.com/") ||
      raw.toLowerCase().startsWith("twitter.com/") || raw.toLowerCase().startsWith("www.")) {
    // URL form — parse it, pinning the host.
    let u: URL;
    try {
      u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    } catch {
      return null;
    }

    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!X_HOSTS.has(u.hostname.toLowerCase().replace(/\.+$/, ""))) return null;

    const parts = u.pathname.split("/").filter(Boolean);
    // Reject deep links (/status/..., /i/flow/login) — this claim is about a profile.
    if (parts.length !== 1) return null;
    handle = parts[0];
    // x.com/@handle is not a real X URL form, but people paste it anyway.
    if (handle.startsWith("@")) handle = handle.slice(1);
  } else {
    // Bare or @-prefixed handle.
    handle = raw.startsWith("@") ? raw.slice(1) : raw;
    // A handle must not look like a path or a host.
    if (handle.includes("/") || handle.includes(".") || handle.includes("@")) return null;
  }

  if (!X_HANDLE_RE.test(handle)) return null;

  const username = handle.toLowerCase();
  if (X_RESERVED_PATHS.has(username)) return null;

  return { username, canonicalUrl: `https://x.com/${username}` };
}

export function claimIdForX(input: string): string {
  const parsed = parseXProfile(input);
  return parsed ? `x:${parsed.username}` : `x:${input}`;
}

export function buildXProof(input: string, resolverUrl: string): ClaimProof | null {
  const parsed = parseXProfile(input);
  if (!parsed) return null;
  return {
    kind: "x_profile",
    username: parsed.username,
    url: parsed.canonicalUrl,
    mustContain: resolverUrl,
  };
}

export function claimIdForDns(qname: string): string {
  return `dns:${qname.toLowerCase()}`;
}

export function buildWellKnownProof(domainOrUrl: string, resolverUrl: string): ClaimProof {
  let host = domainOrUrl;
  try {
    if (domainOrUrl.includes("://")) host = new URL(domainOrUrl).hostname;
  } catch {}
  host = host.toLowerCase();
  return {
    kind: "well_known",
    url: `https://${host}/.well-known/anchorid.txt`,
    mustContain: resolverUrl,
  };
}

export function buildGitHubReadmeProof(githubProfileUrl: string, resolverUrl: string): ClaimProof | null {
  const parsed = parseGitHubProfile(githubProfileUrl);
  if (!parsed) return null;

  const { user } = parsed;
  return {
    kind: "github_readme",
    url: `https://raw.githubusercontent.com/${user}/${user}/main/README.md`,
    // Profile READMEs live on whichever branch the repo defaults to; try the
    // other common default rather than silently failing master-based repos.
    fallbackUrls: [`https://raw.githubusercontent.com/${user}/${user}/master/README.md`],
    mustContain: resolverUrl,
  };
}

export function buildDnsProof(qname: string, uuid: string): ClaimProof {
  const canonicalToken = `anchorid=urn:uuid:${uuid.toLowerCase()}`;
  return { kind: "dns_txt", qname: qname.toLowerCase(), expectedToken: canonicalToken };
}

/**
 * Parse @user@instance.social format to URL
 * Returns null if format is invalid
 */
export function parseFediverseHandle(input: string): string | null {
  // Match @user@instance or user@instance
  const match = input.match(/^@?([^@\s]+)@([^@\s]+)$/);
  if (!match) return null;

  const [, username, instance] = match;
  if (!username || !instance) return null;

  // Basic validation
  if (username.length === 0 || instance.length === 0) return null;
  if (instance.includes('/')) return null;  // Domain shouldn't have path

  return `https://${instance}/@${username}`;
}

/**
 * Validate URL for SSRF protection
 * Blocks localhost, private IPs, and cloud metadata endpoints
 */
/** Parse a dotted-quad IPv4 literal, or null if it isn't one. */
function parseIpv4(host: string): number[] | null {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const octets = m.slice(1).map((o) => parseInt(o, 10));
  return octets.every((o) => o >= 0 && o <= 255) ? octets : null;
}

function isPrivateIpv4(o: number[]): boolean {
  const [a, b] = o;
  if (a === 0) return true;                       // 0.0.0.0/8
  if (a === 10) return true;                      // private
  if (a === 127) return true;                     // loopback
  if (a === 169 && b === 254) return true;        // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true;          // 192.0.0.0/24 protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true;                      // multicast + reserved
  return false;
}

/**
 * Reject IPv6 literals wholesale.
 *
 * Public identity profiles are not served from bare IPv6 literals, and
 * enumerating the unsafe ranges (::1, ::ffff:127.0.0.1, fc00::/7, fe80::/10,
 * ::) correctly is easy to get subtly wrong. A blanket reject is the safer
 * default here.
 */
function isIpv6Literal(host: string): boolean {
  return host.startsWith("[") || host.includes(":");
}

/** Internal-only TLDs that should never be fetched. */
const BLOCKED_SUFFIXES = [".internal", ".local", ".localhost", ".localdomain", ".home.arpa"];

/**
 * Validate a URL before any outbound fetch (SSRF guard).
 *
 * Note this cannot stop DNS rebinding or a public name that resolves to a
 * private address — Workers gives no hook between resolution and connect. On
 * the production edge, RFC1918 and loopback are not routable from a Worker,
 * which covers the residual risk; this check is what stops the direct attempts
 * and anything reachable via redirect.
 */
export function validateProfileUrl(urlString: string): { ok: boolean; error?: string; url?: URL } {
  let url: URL;

  try {
    url = new URL(urlString);
  } catch {
    return { ok: false, error: "invalid_url" };
  }

  // Must be HTTPS
  if (url.protocol !== 'https:') {
    return { ok: false, error: "must_be_https" };
  }

  // Strip trailing dots before every check. A fully-qualified name keeps its
  // root label in url.hostname ("metadata.google.internal." / "localhost."),
  // which would slip past both the suffix denylist and the exact-match checks
  // below while still resolving to the same host.
  const hostname = url.hostname.toLowerCase().replace(/\.+$/, "");

  if (!hostname) return { ok: false, error: "invalid_url" };

  if (isIpv6Literal(hostname)) {
    return { ok: false, error: "blocked_private_ip" };
  }

  if (hostname === 'localhost' || hostname === 'localhost.localdomain') {
    return { ok: false, error: "blocked_localhost" };
  }

  if (BLOCKED_SUFFIXES.some((s) => hostname.endsWith(s))) {
    return { ok: false, error: "blocked_internal_host" };
  }

  // Cloud metadata services addressed by name
  if (hostname === 'metadata.google.internal' || hostname === 'metadata') {
    return { ok: false, error: "blocked_metadata_endpoint" };
  }

  const ipv4 = parseIpv4(hostname);
  if (ipv4) {
    if (ipv4[0] === 169 && ipv4[1] === 254) {
      return { ok: false, error: "blocked_metadata_endpoint" };
    }
    if (ipv4[0] === 127) {
      return { ok: false, error: "blocked_loopback" };
    }
    if (isPrivateIpv4(ipv4)) {
      return { ok: false, error: "blocked_private_ip" };
    }
  }

  // A hostname with no dot is a bare/internal name (e.g. "intranet").
  if (!hostname.includes(".")) {
    return { ok: false, error: "blocked_internal_host" };
  }

  return { ok: true, url };
}

export function claimIdForPublic(url: string): string {
  try {
    const u = new URL(url);
    // Use hostname + pathname for ID to handle different profiles on same instance
    const path = u.pathname.replace(/\/$/, '');  // Remove trailing slash
    return `public:${u.hostname.toLowerCase()}${path}`;
  } catch {
    return `public:${url}`;
  }
}

// Backward compatibility: keep old name as alias
export const claimIdForSocial = claimIdForPublic;

/**
 * Strip query and fragment from a profile URL.
 *
 * The proof is an unanchored substring search over the fetched page, so a
 * retained query string let any site that reflects a parameter "prove" a
 * claim — e.g. https://victim.example/search?q=<resolver-url>. A profile page
 * is identified by its path; the query is never part of that identity.
 */
export function stripQueryAndFragment(inputUrl: string): string {
  try {
    const u = new URL(inputUrl);
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return inputUrl;
  }
}

export function buildPublicProof(inputUrl: string, resolverUrl: string): ClaimProof {
  return {
    kind: "profile_page",
    url: stripQueryAndFragment(inputUrl),
    mustContain: resolverUrl,
  };
}

// Backward compatibility: keep old name as alias
export const buildSocialProof = buildPublicProof;

const PROOF_FETCH_TIMEOUT_MS = 5000;
const PROOF_MAX_BYTES = 256 * 1024;
const PROOF_MAX_REDIRECTS = 3;

/** Read at most `maxBytes` from a response body, then stop. */
async function readCapped(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.length;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  const buf = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const c of chunks) {
    if (offset >= buf.length) break;
    const slice = c.subarray(0, buf.length - offset);
    buf.set(slice, offset);
    offset += slice.length;
  }
  return new TextDecoder().decode(buf);
}

/**
 * Fetch a proof document with SSRF, redirect, timeout and size protection.
 *
 * Every hop is re-validated: `redirect: "manual"` means an allowed host cannot
 * bounce us to a private address or downgrade to http. The previous
 * implementation used the platform default (follow) with no validation at
 * fetch time at all.
 */
async function safeFetchText(
  url: string
): Promise<{ ok: boolean; status: number; text: string; error?: string; finalUrl?: string }> {
  let current = url;

  for (let hop = 0; hop <= PROOF_MAX_REDIRECTS; hop++) {
    const check = validateProfileUrl(current);
    if (!check.ok) {
      return { ok: false, status: 0, text: "", error: check.error || "blocked_url" };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROOF_FETCH_TIMEOUT_MS);

    let r: Response;
    try {
      r = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent": "AnchorID-ClaimVerifier/1.0",
          accept: "text/plain,text/*;q=0.9,*/*;q=0.1",
        },
      });
    } catch (e: any) {
      clearTimeout(timer);
      const aborted = e?.name === "AbortError";
      return { ok: false, status: 0, text: "", error: aborted ? "timeout" : "fetch_error" };
    }

    try {
      if (r.status >= 300 && r.status < 400) {
        const location = r.headers.get("location");
        if (!location) return { ok: false, status: r.status, text: "", error: "redirect_no_location" };
        // Resolve relative redirects against the current URL, then re-validate.
        try {
          current = new URL(location, current).toString();
        } catch {
          return { ok: false, status: r.status, text: "", error: "redirect_invalid" };
        }
        continue;
      }

      const text = await readCapped(r, PROOF_MAX_BYTES);
      return { ok: r.ok, status: r.status, text, finalUrl: current };
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false, status: 0, text: "", error: "too_many_redirects" };
}

// DNS TXT record normalization per spec
function normalizeDnsTxtValue(raw: string): string {
  let s = raw.trim();

  // Strip outer quotes if present
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    s = s.slice(1, -1);
  }

  // Collapse consecutive whitespace
  s = s.replace(/\s+/g, " ");

  // Normalize anchorid= prefix to lowercase
  if (s.toLowerCase().startsWith("anchorid=")) {
    s = "anchorid=" + s.slice(9);
  }

  return s;
}

// Extract UUID from various accepted formats
function extractUuidFromDnsValue(normalized: string): string | null {
  const uuidPattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

  let extracted = "";

  // anchorid=urn:uuid:<uuid>
  if (normalized.startsWith("anchorid=urn:uuid:")) {
    extracted = normalized.slice(18);
  }
  // anchorid=<uuid>
  else if (normalized.startsWith("anchorid=")) {
    extracted = normalized.slice(9);
  }
  // urn:uuid:<uuid>
  else if (normalized.startsWith("urn:uuid:")) {
    extracted = normalized.slice(9);
  }
  // https://anchorid.net/resolve/<uuid>
  else if (normalized.startsWith("https://anchorid.net/resolve/")) {
    extracted = normalized.slice(29);
  }

  extracted = extracted.trim();

  // Validate UUID format
  if (uuidPattern.test(extracted)) {
    return extracted.toLowerCase();
  }

  return null;
}

// Build set of expected tokens for a UUID
function buildExpectedDnsTokens(uuid: string): string[] {
  const lowerUuid = uuid.toLowerCase();
  return [
    `anchorid=urn:uuid:${lowerUuid}`,
    `anchorid=${lowerUuid}`,
    `urn:uuid:${lowerUuid}`,
    `https://anchorid.net/resolve/${lowerUuid}`,
  ];
}

// Timeout wrapper for promises
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutError: string): Promise<T> {
  const timeout = new Promise<T>((_, reject) =>
    setTimeout(() => reject(new Error(timeoutError)), timeoutMs)
  );
  return Promise.race([promise, timeout]);
}

// DNS query result with TTL information
interface DnsQueryResult {
  ok: boolean;
  txtValues: string[];
  error?: string;
  ttl?: number; // TTL from DNS response (seconds)
}

// Query DNS TXT records via Cloudflare DoH JSON API (single attempt)
async function queryDnsTxtOnce(qname: string, timeoutMs: number = 2500): Promise<DnsQueryResult> {
  const dohUrl = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(qname)}&type=TXT`;

  try {
    const fetchPromise = fetch(dohUrl, {
      method: "GET",
      headers: {
        "accept": "application/dns-json",
      },
    });

    const r = await withTimeout(fetchPromise, timeoutMs, "dns_query_timeout");

    if (!r.ok) {
      return { ok: false, txtValues: [], error: `doh_status:${r.status}` };
    }

    const data: any = await r.json();

    // Check for NXDOMAIN or no answers
    if (data.Status !== 0) {
      return { ok: false, txtValues: [], error: `dns_status:${data.Status}` };
    }

    if (!data.Answer || data.Answer.length === 0) {
      return { ok: false, txtValues: [], error: "no_txt_records" };
    }

    // Extract TXT records and minimum TTL
    const txtValues: string[] = [];
    let minTtl: number | undefined;

    for (const answer of data.Answer) {
      if (answer.type === 16) { // TXT record type
        if (answer.data) {
          // TXT data may be a single string or array of strings
          // DoH JSON returns the full concatenated string typically
          txtValues.push(String(answer.data));
        }

        // Track minimum TTL from all TXT records
        if (typeof answer.TTL === "number" && answer.TTL > 0) {
          minTtl = minTtl === undefined ? answer.TTL : Math.min(minTtl, answer.TTL);
        }
      }
    }

    if (txtValues.length === 0) {
      return { ok: false, txtValues: [], error: "no_txt_records" };
    }

    return { ok: true, txtValues, ttl: minTtl };
  } catch (e: any) {
    // Check if it's a timeout or network error
    const errorMsg = e.message || String(e);
    if (errorMsg.includes("timeout")) {
      return { ok: false, txtValues: [], error: "timeout" };
    }
    return { ok: false, txtValues: [], error: `fetch_error:${errorMsg}` };
  }
}

// Query DNS TXT records with timeout and retry on transient failures
async function queryDnsTxt(qname: string): Promise<DnsQueryResult> {
  const perRequestTimeout = 2500; // 2.5s per spec
  const maxRetries = 1; // 1 retry on transient failures

  let lastError = "";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await queryDnsTxtOnce(qname, perRequestTimeout);

    // Success - return immediately
    if (result.ok) {
      return result;
    }

    // Non-transient errors - don't retry
    if (result.error === "no_txt_records" || result.error?.startsWith("dns_status:")) {
      return result;
    }

    // Transient errors - retry once
    lastError = result.error || "unknown_error";

    // Don't retry on last attempt
    if (attempt < maxRetries) {
      // Small delay before retry (100ms)
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // All retries exhausted
  return { ok: false, txtValues: [], error: lastError };
}

// Cached DNS query result
interface CachedDnsResult {
  ok: boolean;
  txtValues: string[];
  error?: string;
  cachedAt: number; // Unix timestamp (ms)
  expiresAt: number; // Unix timestamp (ms)
}

// Query DNS TXT records with caching
async function queryDnsTxtCached(
  qname: string,
  kv: KVNamespace,
  bypassCache: boolean = false
): Promise<DnsQueryResult> {
  const cacheKey = `dnscache:${qname.toLowerCase()}`;
  const now = Date.now();

  // Check cache first (unless bypassed)
  if (!bypassCache) {
    const cachedJson = await kv.get(cacheKey);
    if (cachedJson) {
      try {
        const cached: CachedDnsResult = JSON.parse(cachedJson);

        // Check if still valid
        if (cached.expiresAt > now) {
          return {
            ok: cached.ok,
            txtValues: cached.txtValues,
            error: cached.error,
          };
        }
      } catch {
        // Invalid cache entry, continue to fresh query
      }
    }
  }

  // Perform fresh query
  const result = await queryDnsTxt(qname);

  // Determine cache TTL
  let cacheTtlSeconds: number;

  if (result.ok) {
    // Success: Use DNS TTL if available, capped at 15 minutes
    const defaultSuccessTtl = 15 * 60; // 15 minutes
    if (result.ttl && result.ttl > 0) {
      // Use DNS TTL, but cap at 15 minutes
      cacheTtlSeconds = Math.min(result.ttl, defaultSuccessTtl);
    } else {
      cacheTtlSeconds = defaultSuccessTtl;
    }
  } else {
    // Failure: 2 minutes
    cacheTtlSeconds = 2 * 60;
  }

  // Clamp to KV's 60s floor. result.ttl comes from the claimant's own DNS
  // record, so a TTL of 1-59 would make every cache write throw (swallowed
  // below) and silently defeat caching for that domain.
  cacheTtlSeconds = clampKvTtl(cacheTtlSeconds);

  // Store in cache
  const expiresAt = now + (cacheTtlSeconds * 1000);
  const cached: CachedDnsResult = {
    ok: result.ok,
    txtValues: result.txtValues,
    error: result.error,
    cachedAt: now,
    expiresAt,
  };

  try {
    await kv.put(cacheKey, JSON.stringify(cached), {
      expirationTtl: cacheTtlSeconds,
    });
  } catch {
    // Cache write failure is non-fatal
  }

  return result;
}

async function verifyDnsClaim(
  claim: Claim,
  kv: KVNamespace,
  bypassCache: boolean = false
): Promise<VerifyResult> {
  if (claim.proof.kind !== "dns_txt") {
    return { status: "failed", failReason: "invalid_proof_kind" };
  }

  const { qname, expectedToken } = claim.proof;

  // Extract expected UUID from the canonical token
  const expectedUuid = extractUuidFromDnsValue(expectedToken);
  if (!expectedUuid) {
    return { status: "failed", failReason: "invalid_expected_token" };
  }

  // Build set of acceptable tokens
  const expectedTokens = buildExpectedDnsTokens(expectedUuid);

  // Query DNS (with caching)
  const result = await queryDnsTxtCached(qname, kv, bypassCache);
  if (!result.ok) {
    return { status: "failed", failReason: result.error || "dns_query_failed" };
  }

  // Check each TXT value
  for (const raw of result.txtValues) {
    const normalized = normalizeDnsTxtValue(raw);

    // Try to extract UUID from this value
    const foundUuid = extractUuidFromDnsValue(normalized);

    // Compare UUIDs (case-insensitive)
    if (foundUuid && foundUuid === expectedUuid) {
      return { status: "verified" };
    }

    // Also check direct token match
    if (expectedTokens.includes(normalized)) {
      return { status: "verified" };
    }
  }

  return { status: "failed", failReason: "proof_not_found" };
}

/**
 * Marker forms accepted on a public profile page in place of the full
 * resolver URL, for space-constrained bios. The UUID must appear in a
 * deliberate form — a bare UUID anywhere on the page (a comment, a paste, a
 * log line) is not a claim of ownership, and matching one made any page
 * mentioning the UUID "verify". The documented short URL
 * anchorid.net/<uuid> (with or without scheme) counts as deliberate.
 */
const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i;

/**
 * True if a proof URL itself contains the claim's UUID (raw or
 * percent-decoded).
 *
 * A match found on such a page proves nothing: an echo service or debug
 * endpoint that reflects its request path into the response would "contain"
 * any marker we put in the URL — e.g. https://echo.example/anchorid.net/<uuid>
 * — without the claimant having added anything to the page. The marker must
 * come from page content, so a proof URL carrying it is rejected outright.
 */
export function urlReflectsProofUuid(url: string, mustContain: string): boolean {
  const uuidMatch = mustContain.match(UUID_RE);
  if (!uuidMatch) return false;

  const uuid = uuidMatch[1].toLowerCase();
  const lower = url.toLowerCase();
  if (lower.includes(uuid)) return true;
  try {
    return decodeURIComponent(lower).includes(uuid);
  } catch {
    // Malformed percent-encoding in a proof URL — treat as suspect.
    return true;
  }
}

export function profilePageHasUuidMarker(mustContain: string, text: string): boolean {
  const uuidMatch = mustContain.match(UUID_RE);
  if (!uuidMatch) return false;

  const uuid = uuidMatch[1].toLowerCase();
  const haystack = text.toLowerCase();
  if (haystack.includes(`urn:uuid:${uuid}`)) return true;
  if (haystack.includes(`anchorid.net/${uuid}`)) return true;
  // Labeled form, e.g. "AnchorID: <uuid>" — the documented forum-signature
  // format writes a space after the colon, so tolerate optional whitespace.
  if (new RegExp(`anchorid[:=][ \\t]*${uuid}`).test(haystack)) return true;
  // Compact scheme-style form for the tightest character limits: "aid:<uuid>".
  // The \b keeps "paid:<uuid>" / "said:<uuid>" from matching.
  return new RegExp(`\\baid:[ \\t]*${uuid}`).test(haystack);
}

// ------------------ X (Twitter) profile verification ------------------

const X_API_TIMEOUT_MS = 5000;
const X_API_MAX_BYTES = 64 * 1024;
const X_CACHE_OK_TTL_SECONDS = 15 * 60;
const X_CACHE_FAIL_TTL_SECONDS = 2 * 60;
const X_API_DEFAULT_RL_PER_HOUR = 200;

/**
 * The parts of an X user payload that can carry a proof.
 *
 * Only the bio and the profile website field count. Display name, location and
 * pinned posts are not proofs.
 */
export interface XProofCandidates {
  description: string;
  expandedUrls: string[];
}

/**
 * Pull the proof-bearing strings out of an X API user payload.
 *
 * The expanded URLs are the important part. X linkifies every URL in a bio
 * through t.co, so `description` holds a *truncated display form*
 * ("anchorid.net/resolve/8f3ac1...") while the real target only ever appears in
 * entities[].expanded_url. Matching on the description text alone would fail on
 * every correctly-configured profile.
 */
export function extractXProofCandidates(payload: any): XProofCandidates {
  const data = payload?.data ?? payload;
  const description = typeof data?.description === "string" ? data.description : "";

  const expandedUrls: string[] = [];
  const collect = (urls: any) => {
    if (!Array.isArray(urls)) return;
    for (const u of urls) {
      if (u && typeof u.expanded_url === "string") expandedUrls.push(u.expanded_url);
    }
  };

  // Links inside the bio text.
  collect(data?.entities?.description?.urls);
  // The single "website" field on the profile.
  collect(data?.entities?.url?.urls);

  return { description, expandedUrls };
}

/**
 * True if the bio / website field proves the claim.
 *
 * Kept pure and exported so the match rules are testable against captured API
 * payloads without any network or fetch stubbing.
 */
export function xCandidatesProveClaim(candidates: XProofCandidates, mustContain: string): boolean {
  // Full resolver URL, in a linked URL or typed as plain text.
  if (candidates.expandedUrls.some((u) => u.includes(mustContain))) return true;
  if (candidates.description.includes(mustContain)) return true;

  // Short marker forms. X bios are 160 characters, which is exactly the
  // space-constrained case profilePageHasUuidMarker was written for.
  const haystack = [candidates.description, ...candidates.expandedUrls].join(" ");
  return profilePageHasUuidMarker(mustContain, haystack);
}

type XLookupResult =
  | { ok: true; candidates: XProofCandidates }
  | { ok: false; failReason: string; transient: boolean };

interface CachedXResult {
  ok: boolean;
  candidates?: XProofCandidates;
  failReason?: string;
  transient?: boolean;
  cachedAt: number;
  expiresAt: number;
}

/**
 * Reserve one unit of the hourly X API budget.
 *
 * X reads are metered per request, so an unbounded verification loop is a
 * billing problem, not just a rate-limit one. The per-UUID and per-IP verify
 * limits already bound normal use; this is the backstop that bounds the whole
 * worker.
 */
async function reserveXApiBudget(kv: KVNamespace, limitPerHour: number): Promise<boolean> {
  // Hour-bucketed key: no clock sync needed, and it expires on its own.
  const bucket = new Date().toISOString().slice(0, 13).replace(/[-T:]/g, "");
  const key = `rl:xapi:${bucket}`;
  const cur = await kv.get(key);
  const n = (cur ? parseInt(cur, 10) : 0) + 1;
  if (n > limitPerHour) return false;
  try {
    await kv.put(key, String(n), { expirationTtl: 3600 });
  } catch {
    // A failed counter write must not block verification.
  }
  return true;
}

/** Fetch a user from the X API. Fixed host, so no SSRF surface and no redirects. */
async function fetchXUser(username: string, bearer: string): Promise<XLookupResult> {
  const url =
    `https://api.x.com/2/users/by/username/${encodeURIComponent(username)}` +
    `?user.fields=description,url,entities,id,username`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), X_API_TIMEOUT_MS);

  let r: Response;
  try {
    r = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${bearer}`,
        accept: "application/json",
        "user-agent": "AnchorID-ClaimVerifier/1.0",
      },
    });
  } catch (e: any) {
    clearTimeout(timer);
    const aborted = e?.name === "AbortError";
    return {
      ok: false,
      failReason: aborted ? "x_api_timeout" : "x_api_unreachable",
      transient: true,
    };
  }

  try {
    // Auth and quota problems are ours, not the claimant's — never let them
    // turn a good claim into a failed one.
    if (r.status === 401 || r.status === 403) {
      return { ok: false, failReason: "x_auth_failed", transient: true };
    }
    if (r.status === 429) {
      return { ok: false, failReason: "x_rate_limited", transient: true };
    }
    if (r.status >= 500) {
      return { ok: false, failReason: `x_api_error:${r.status}`, transient: true };
    }
    if (!r.ok) {
      return { ok: false, failReason: `x_api_error:${r.status}`, transient: true };
    }

    const text = await readCapped(r, X_API_MAX_BYTES);
    let payload: any;
    try {
      payload = JSON.parse(text);
    } catch {
      return { ok: false, failReason: "x_api_bad_response", transient: true };
    }

    // A missing/suspended account comes back 200 with an errors[] array.
    if (!payload?.data) {
      const title = payload?.errors?.[0]?.title || "";
      if (/not found/i.test(title)) {
        return { ok: false, failReason: "x_user_not_found", transient: false };
      }
      if (/suspend|forbidden/i.test(title)) {
        return { ok: false, failReason: "x_user_unavailable", transient: false };
      }
      return { ok: false, failReason: "x_api_bad_response", transient: true };
    }

    return { ok: true, candidates: extractXProofCandidates(payload) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Cached X user lookup.
 *
 * Cached by handle only, and it caches the *extracted strings* rather than a
 * verdict, so two profiles claiming the same handle share one API read while
 * each still matches against its own resolver URL.
 */
async function fetchXUserCached(
  username: string,
  bearer: string,
  kv: KVNamespace,
  limitPerHour: number,
  bypassCache: boolean
): Promise<XLookupResult> {
  const cacheKey = `xcache:${username.toLowerCase()}`;
  const now = Date.now();

  if (!bypassCache) {
    const cachedJson = await kv.get(cacheKey);
    if (cachedJson) {
      try {
        const cached: CachedXResult = JSON.parse(cachedJson);
        if (cached.expiresAt > now) {
          return cached.ok && cached.candidates
            ? { ok: true, candidates: cached.candidates }
            : {
                ok: false,
                failReason: cached.failReason || "x_api_bad_response",
                transient: Boolean(cached.transient),
              };
        }
      } catch {
        // Bad cache entry — fall through to a fresh lookup.
      }
    }
  }

  if (!(await reserveXApiBudget(kv, limitPerHour))) {
    return { ok: false, failReason: "x_budget_exceeded", transient: true };
  }

  const result = await fetchXUser(username, bearer);

  const ttlSeconds = clampKvTtl(result.ok ? X_CACHE_OK_TTL_SECONDS : X_CACHE_FAIL_TTL_SECONDS);
  const cached: CachedXResult = result.ok
    ? { ok: true, candidates: result.candidates, cachedAt: now, expiresAt: now + ttlSeconds * 1000 }
    : {
        ok: false,
        failReason: result.failReason,
        transient: result.transient,
        cachedAt: now,
        expiresAt: now + ttlSeconds * 1000,
      };

  try {
    await kv.put(cacheKey, JSON.stringify(cached), { expirationTtl: ttlSeconds });
  } catch {
    // Cache write failure is non-fatal.
  }

  return result;
}

async function verifyXClaim(
  claim: Claim,
  kv: KVNamespace | undefined,
  env: Env | undefined,
  bypassCache: boolean
): Promise<VerifyResult> {
  if (claim.proof.kind !== "x_profile") {
    return { status: "failed", failReason: "invalid_proof_kind" };
  }
  if (!kv) {
    return { status: "failed", failReason: "kv_not_available" };
  }

  const bearer = env?.X_API_BEARER_TOKEN;
  if (!bearer) {
    // The server is misconfigured, not the claim. Keep whatever status the
    // claim already has rather than revoking it.
    return { status: "failed", failReason: "x_api_not_configured", transient: true };
  }

  const limitPerHour = intFromEnv(env?.X_API_RL_PER_HOUR, X_API_DEFAULT_RL_PER_HOUR);
  const result = await fetchXUserCached(claim.proof.username, bearer, kv, limitPerHour, bypassCache);

  if (!result.ok) {
    return {
      status: "failed",
      failReason: result.failReason,
      ...(result.transient ? { transient: true } : {}),
    };
  }

  if (xCandidatesProveClaim(result.candidates, claim.proof.mustContain)) {
    return { status: "verified" };
  }

  return { status: "failed", failReason: "proof_not_found" };
}

export async function verifyClaim(
  claim: Claim,
  kv?: KVNamespace,
  bypassCache: boolean = false,
  env?: Env
): Promise<VerifyResult> {
  // Handle DNS claims
  if (claim.type === "dns") {
    if (!kv) {
      return { status: "failed", failReason: "kv_not_available" };
    }
    return verifyDnsClaim(claim, kv, bypassCache);
  }

  // X profile claims go through the X API — x.com serves a JS shell to
  // unauthenticated fetchers, so there is no anonymous path to the bio text.
  if (claim.proof.kind === "x_profile") {
    return verifyXClaim(claim, kv, env, bypassCache);
  }

  // Handle website, github, and social profile claims
  if (claim.proof.kind === "well_known" || claim.proof.kind === "github_readme" || claim.proof.kind === "profile_page") {
    let text: string;

    // Special case: anchorid.net self-verification
    // We can't fetch ourselves due to network restrictions, so use the hardcoded content
    if (claim.proof.kind === "well_known" && claim.proof.url === "https://anchorid.net/.well-known/anchorid.txt") {
      // This is the exact content served by the /.well-known/anchorid.txt route
      text = `https://anchorid.net/resolve/4c785577-9f55-4a22-a80b-dd1f4d9b4658
https://anchorid.net/resolve/4ff7ed97-b78f-4ae6-9011-5af714ee241c
`;
    } else {
      // Normal case: fetch from external URL. Try the primary proof URL, then
      // any declared fallbacks (e.g. master vs main for GitHub READMEs).
      const candidates = [claim.proof.url, ...((claim.proof as any).fallbackUrls || [])];
      let lastFailure = "proof_not_found";
      let fetched = false;
      text = "";

      for (const candidate of candidates) {
        // Reject a proof URL that carries the marker itself (before and after
        // redirects) — a path-echoing endpoint would reflect it into the body.
        if (claim.proof.kind === "profile_page" && urlReflectsProofUuid(candidate, claim.proof.mustContain)) {
          return { status: "failed", failReason: "proof_url_contains_marker" };
        }

        const result = await safeFetchText(candidate);
        if (result.ok) {
          if (
            claim.proof.kind === "profile_page" &&
            result.finalUrl &&
            urlReflectsProofUuid(result.finalUrl, claim.proof.mustContain)
          ) {
            return { status: "failed", failReason: "proof_url_contains_marker" };
          }
          text = result.text;
          fetched = true;
          break;
        }
        lastFailure = result.error
          ? `fetch_blocked:${result.error}`
          : `fetch_failed:${result.status}`;
      }

      if (!fetched) return { status: "failed", failReason: lastFailure };
    }

    // First check for full resolver URL
    if (text.includes(claim.proof.mustContain)) return { status: "verified" };

    // For public profile proofs, also accept a UUID marker for
    // space-constrained bios (see profilePageHasUuidMarker).
    if (claim.proof.kind === "profile_page" && profilePageHasUuidMarker(claim.proof.mustContain, text)) {
      return { status: "verified" };
    }

    return { status: "failed", failReason: "proof_not_found" };
  }

  return { status: "failed", failReason: "unknown_claim_type" };
}



