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

export function claimIdForWebsite(url: string): string {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return `website:${h}`;
  } catch {
    return `website:${url}`;
  }
}

export function claimIdForGitHub(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const user = (parts[0] || "").toLowerCase();
    return user ? `github:${user}` : `github:${url}`;
  } catch {
    return `github:${url}`;
  }
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

export function buildGitHubReadmeProof(githubProfileUrl: string, resolverUrl: string): ClaimProof {
  let user = "";
  try {
    const u = new URL(githubProfileUrl);
    const parts = u.pathname.split("/").filter(Boolean);
    user = (parts[0] || "").toLowerCase();
  } catch {}

  const raw = user
    ? `https://raw.githubusercontent.com/${user}/${user}/main/README.md`
    : githubProfileUrl;

  return { kind: "github_readme", url: raw, mustContain: resolverUrl };
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

  const hostname = url.hostname.toLowerCase();

  // Block localhost and loopback
  if (hostname === 'localhost' || hostname === '0.0.0.0') {
    return { ok: false, error: "blocked_localhost" };
  }

  // Block 127.x.x.x
  if (hostname.startsWith('127.')) {
    return { ok: false, error: "blocked_loopback" };
  }

  // Block AWS/GCP metadata endpoints
  if (hostname === '169.254.169.254' || hostname.startsWith('169.254.')) {
    return { ok: false, error: "blocked_metadata_endpoint" };
  }

  // Block private IP ranges (10.x, 192.168.x, 172.16-31.x)
  if (hostname.startsWith('10.')) {
    return { ok: false, error: "blocked_private_ip" };
  }
  if (hostname.startsWith('192.168.')) {
    return { ok: false, error: "blocked_private_ip" };
  }
  // 172.16.0.0 - 172.31.255.255
  const match172 = hostname.match(/^172\.(\d+)\./);
  if (match172) {
    const octet = parseInt(match172[1], 10);
    if (octet >= 16 && octet <= 31) {
      return { ok: false, error: "blocked_private_ip" };
    }
  }

  return { ok: true, url };
}

export function claimIdForSocial(url: string): string {
  try {
    const u = new URL(url);
    // Use hostname + pathname for ID to handle different profiles on same instance
    const path = u.pathname.replace(/\/$/, '');  // Remove trailing slash
    return `social:${u.hostname.toLowerCase()}${path}`;
  } catch {
    return `social:${url}`;
  }
}

export function buildSocialProof(inputUrl: string, resolverUrl: string): ClaimProof {
  return {
    kind: "profile_page",
    url: inputUrl,
    mustContain: resolverUrl,
  };
}

async function fetchText(url: string): Promise<{ ok: boolean; status: number; text: string }> {
  const r = await fetch(url, {
    method: "GET",
    headers: {
      "user-agent": "AnchorID-ClaimVerifier/1.0",
      accept: "text/plain,text/*;q=0.9,*/*;q=0.1",
    },
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, text };
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
    const { ok, status, text } = await fetchText(claim.proof.url);

    if (!ok) return { status: "failed", failReason: `fetch_failed:${status}` };
    if (text.includes(claim.proof.mustContain)) return { status: "verified" };

    return { status: "failed", failReason: "proof_not_found" };
  }

  return { status: "failed", failReason: "unknown_claim_type" };
}



