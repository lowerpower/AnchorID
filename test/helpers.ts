import { env, SELF } from 'cloudflare:test';
import type { Env } from '../src/env';

/**
 * Test Helpers for AnchorID Security & Load Testing
 *
 * Provides utilities for creating test requests, managing rate limits,
 * creating mock data, and testing authentication.
 */

// ------------------ Request Utilities ------------------

/**
 * Creates a test request with custom IP and headers
 */
export function createTestRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string | FormData;
    ip?: string;
  } = {}
): Request {
  const headers = new Headers(options.headers || {});

  // Set custom IP if provided (simulates Cloudflare's cf-connecting-ip header)
  if (options.ip) {
    headers.set('cf-connecting-ip', options.ip);
  }

  const reqInit: RequestInit = {
    method: options.method || 'GET',
    headers,
  };

  if (options.body) {
    if (typeof options.body === 'string') {
      reqInit.body = options.body;
    } else {
      reqInit.body = options.body;
    }
  }

  return new Request(url, reqInit);
}

/**
 * Tests rate limiting by making N requests and checking when rate limit kicks in
 * Returns the count at which rate limiting was enforced
 */
export async function testRateLimit(
  urlPattern: string,
  limit: number,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string | FormData;
    ip?: string;
  } = {}
): Promise<{
  successCount: number;
  rateLimitedAt: number | null;
  totalRequests: number;
}> {
  let successCount = 0;
  let rateLimitedAt: number | null = null;

  // Test up to limit + 5 to verify rate limiting is enforced
  const totalRequests = limit + 5;

  for (let i = 1; i <= totalRequests; i++) {
    const req = createTestRequest(urlPattern, {
      ...options,
      ip: options.ip || '1.2.3.4', // Use consistent IP for rate limit testing
    });

    const response = await SELF.fetch(req);

    if (response.status === 429) {
      if (rateLimitedAt === null) {
        rateLimitedAt = i;
      }
    } else if (response.ok || response.status < 500) {
      successCount++;
    }
  }

  return {
    successCount,
    rateLimitedAt,
    totalRequests,
  };
}

/**
 * Makes multiple concurrent requests to test race conditions
 */
export async function makeConcurrentRequests(
  count: number,
  urlPattern: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string | FormData;
    ip?: string;
  } = {}
): Promise<Response[]> {
  const requests = Array.from({ length: count }, () =>
    SELF.fetch(createTestRequest(urlPattern, options))
  );

  return Promise.all(requests);
}

// ------------------ KV Utilities ------------------

/**
 * Clears rate limit keys from KV for testing
 * WARNING: This uses KV list operations which can be slow in production
 */
export async function clearRateLimitKeys(prefix: string = 'rl:'): Promise<number> {
  const list = await env.ANCHOR_KV.list({ prefix });
  let count = 0;

  for (const key of list.keys) {
    await env.ANCHOR_KV.delete(key.name);
    count++;
  }

  return count;
}

/**
 * Clears all test data (profiles, claims, audit logs)
 * Use with caution - only for test cleanup
 */
export async function clearAllTestData(): Promise<void> {
  const prefixes = ['profile:', 'claims:', 'audit:', 'email:', 'login:', 'signup:', 'created:', 'rl:'];

  for (const prefix of prefixes) {
    const list = await env.ANCHOR_KV.list({ prefix });
    for (const key of list.keys) {
      await env.ANCHOR_KV.delete(key.name);
    }
  }
}

/**
 * Gets a value from KV (test helper)
 */
export async function getKV(key: string): Promise<string | null> {
  return env.ANCHOR_KV.get(key);
}

/**
 * Gets a JSON value from KV (test helper)
 */
export async function getKVJson(key: string): Promise<any | null> {
  return env.ANCHOR_KV.get(key, { type: 'json' });
}

/**
 * Sets a value in KV (test helper)
 */
export async function setKV(key: string, value: string, ttl?: number): Promise<void> {
  await env.ANCHOR_KV.put(key, value, ttl ? { expirationTtl: ttl } : undefined);
}

// ------------------ Mock Data Utilities ------------------

/**
 * Creates a mock profile in KV for testing
 */
export async function createMockProfile(options: {
  uuid?: string;
  name?: string;
  email?: string;
  type?: 'Person' | 'Organization';
  withBackupToken?: boolean;
}): Promise<{
  uuid: string;
  emailHash?: string;
  backupToken?: string;
  backupTokenHash?: string;
}> {
  const uuid = options.uuid || crypto.randomUUID();
  const profile: any = {
    '@context': 'https://schema.org',
    '@type': options.type || 'Person',
    '@id': `https://anchorid.net/resolve/${uuid}`,
    identifier: {
      '@type': 'PropertyValue',
      propertyID: 'canonical-uuid',
      value: `urn:uuid:${uuid}`,
    },
    dateCreated: new Date().toISOString(),
    dateModified: new Date().toISOString(),
  };

  if (options.name) {
    profile.name = options.name;
  }

  const result: any = { uuid };

  // Add email if provided
  if (options.email) {
    const emailHash = await sha256Hex(options.email.trim().toLowerCase());
    profile._emailHash = emailHash;
    result.emailHash = emailHash;

    // Store email mapping
    await env.ANCHOR_KV.put(`email:${emailHash}`, uuid);
  }

  // Add backup token if requested
  if (options.withBackupToken) {
    const backupToken = generateBackupToken();
    const backupTokenHash = await sha256Hex(backupToken);
    profile._backupTokenHash = backupTokenHash;
    result.backupToken = backupToken;
    result.backupTokenHash = backupTokenHash;
  }

  // Store profile
  await env.ANCHOR_KV.put(`profile:${uuid}`, JSON.stringify(profile));

  return result;
}

/**
 * Creates a magic link login session for testing
 */
export async function createLoginSession(
  uuid: string,
  options: {
    emailHash?: string;
    isSetup?: boolean;
    backupAccess?: boolean;
  } = {}
): Promise<string> {
  const token = generateToken();
  const session = {
    uuid,
    ...(options.emailHash ? { emailHash: options.emailHash } : {}),
    ...(options.isSetup ? { isSetup: true } : {}),
    ...(options.backupAccess ? { backupAccess: true } : {}),
  };

  await env.ANCHOR_KV.put(`login:${token}`, JSON.stringify(session), {
    expirationTtl: 900, // 15 minutes
  });

  return token;
}

/**
 * Creates a claim in KV for testing
 */
export async function createClaim(
  uuid: string,
  claim: {
    type: 'website' | 'github' | 'dns';
    url: string;
    status?: 'pending' | 'verified' | 'failed';
  }
): Promise<string> {
  const claimId = crypto.randomUUID();
  const claims = await getKVJson(`claims:${uuid}`) || [];

  claims.push({
    id: claimId,
    type: claim.type,
    url: claim.url,
    status: claim.status || 'pending',
    createdAt: new Date().toISOString(),
    proof: {
      kind: claim.type === 'website' ? 'well_known' : claim.type === 'github' ? 'github_readme' : 'dns_txt',
    },
  });

  await env.ANCHOR_KV.put(`claims:${uuid}`, JSON.stringify(claims));

  return claimId;
}

// ------------------ Authentication Utilities ------------------

/**
 * Generates a mock admin cookie value for testing
 */
export function mockAdminCookie(env: Env): string {
  return env.ANCHOR_ADMIN_SECRET || env.ANCHOR_ADMIN_TOKEN || 'test-admin-secret';
}

/**
 * Creates headers with admin authentication
 */
export function withAdminAuth(env: Env, headers: Record<string, string> = {}): Record<string, string> {
  return {
    ...headers,
    'Authorization': `Bearer ${mockAdminCookie(env)}`,
  };
}

/**
 * Creates headers with session token authentication
 */
export function withSessionAuth(token: string, headers: Record<string, string> = {}): Record<string, string> {
  return {
    ...headers,
    'Authorization': `Bearer ${token}`,
  };
}

/**
 * Creates headers with admin cookie
 */
export function withAdminCookie(env: Env, headers: Record<string, string> = {}): Record<string, string> {
  const secret = mockAdminCookie(env);
  return {
    ...headers,
    'Cookie': `anchor_admin=${encodeURIComponent(secret)}`,
  };
}

// ------------------ Crypto Utilities ------------------

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateBackupToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

// ------------------ IP Generation ------------------

/**
 * Generates a realistic-looking IP address for testing
 * Useful for simulating distributed attacks
 */
export function generateRandomIP(): string {
  return `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
}

/**
 * Generates N unique IP addresses for distributed testing
 */
export function generateUniqueIPs(count: number): string[] {
  const ips = new Set<string>();
  while (ips.size < count) {
    ips.add(generateRandomIP());
  }
  return Array.from(ips);
}

// ------------------ Validation Utilities ------------------

/**
 * Checks if a response is a rate limit error (429)
 */
export function isRateLimited(response: Response): boolean {
  return response.status === 429;
}

/**
 * Checks if a response is successful (2xx)
 */
export function isSuccessful(response: Response): boolean {
  return response.status >= 200 && response.status < 300;
}

/**
 * Checks if a response is an error (4xx or 5xx)
 */
export function isError(response: Response): boolean {
  return response.status >= 400;
}

/**
 * Extracts JSON from response with proper error handling
 */
export async function getJson(response: Response): Promise<any> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Failed to parse JSON: ${text}`);
  }
}

// ------------------ Wait Utilities ------------------

/**
 * Waits for a specified number of milliseconds
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Waits for KV to propagate (useful for eventual consistency)
 */
export async function waitForKVPropagation(): Promise<void> {
  await wait(100); // 100ms should be enough for KV in test environment
}
