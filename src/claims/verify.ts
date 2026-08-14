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
import { clampKvTtl } from "../env";

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
): Promise<{ ok: boolean; status: number; text: string; error?: string }> {
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
      return { ok: r.ok, status: r.status, text };
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
): Promise<{ status: ClaimStatus; failReason?: string }> {
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
export function profilePageHasUuidMarker(mustContain: string, text: string): boolean {
  const uuidMatch = mustContain.match(/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i);
  if (!uuidMatch) return false;

  const uuid = uuidMatch[1].toLowerCase();
  const haystack = text.toLowerCase();
  if (haystack.includes(`urn:uuid:${uuid}`)) return true;
  if (haystack.includes(`anchorid.net/${uuid}`)) return true;
  // Labeled form, e.g. "AnchorID: <uuid>" — the documented forum-signature
  // format writes a space after the colon, so tolerate optional whitespace.
  return new RegExp(`anchorid[:=][ \\t]*${uuid}`).test(haystack);
}

export async function verifyClaim(
  claim: Claim,
  kv?: KVNamespace,
  bypassCache: boolean = false
): Promise<{ status: ClaimStatus; failReason?: string }> {
  // Handle DNS claims
  if (claim.type === "dns") {
    if (!kv) {
      return { status: "failed", failReason: "kv_not_available" };
    }
    return verifyDnsClaim(claim, kv, bypassCache);
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
        const result = await safeFetchText(candidate);
        if (result.ok) {
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



