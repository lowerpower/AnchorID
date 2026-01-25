import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createTestRequest,
  testRateLimit,
  clearRateLimitKeys,
  clearAllTestData,
  createMockProfile,
  createLoginSession,
  createClaim,
  mockAdminCookie,
  withAdminAuth,
  withSessionAuth,
  withAdminCookie,
  generateRandomIP,
  generateUniqueIPs,
  isRateLimited,
  isSuccessful,
  getJson,
  waitForKVPropagation,
} from './helpers';

/**
 * Security Test Suite
 *
 * Tests all security features including rate limiting, authentication,
 * CSRF protection, input validation, and off-by-one fix verification.
 */

describe('Security: Rate Limiting', () => {
  beforeEach(async () => {
    await clearRateLimitKeys();
  });

  afterEach(async () => {
    await clearRateLimitKeys();
  });

  describe('Off-by-one bug fix verification', () => {
    it('enforces exact limit (not limit+1)', async () => {
      // Test with a small limit to verify fix
      const testLimit = 3;

      // Override environment for this test
      const originalLimit = env.IP_RESOLVE_RL_PER_HOUR;
      (env as any).IP_RESOLVE_RL_PER_HOUR = String(testLimit);

      try {
        const testIP = '10.0.0.1';
        let successCount = 0;
        let rateLimitedAt: number | null = null;

        for (let i = 1; i <= testLimit + 2; i++) {
          const req = createTestRequest('https://anchorid.net/resolve/00000000-0000-0000-0000-000000000000', {
            ip: testIP,
          });
          const response = await SELF.fetch(req);

          if (response.status === 429) {
            if (rateLimitedAt === null) {
              rateLimitedAt = i;
            }
          } else {
            successCount++;
          }
        }

        // With limit=3, should allow exactly 3 requests (not 4)
        expect(successCount).toBe(testLimit);
        expect(rateLimitedAt).toBe(testLimit + 1);
      } finally {
        // Restore original limit
        (env as any).IP_RESOLVE_RL_PER_HOUR = originalLimit;
      }
    });
  });

  describe('Public endpoint rate limits', () => {
    it('rate limits /resolve/<uuid> at 300 requests per IP per hour', async () => {
      const uuid = crypto.randomUUID();
      await createMockProfile({ uuid });

      // Test with reduced limit for faster testing
      const testLimit = 10;
      const originalLimit = env.IP_RESOLVE_RL_PER_HOUR;
      (env as any).IP_RESOLVE_RL_PER_HOUR = String(testLimit);

      try {
        const result = await testRateLimit(`https://anchorid.net/resolve/${uuid}`, testLimit, {
          ip: '1.2.3.4',
        });

        expect(result.successCount).toBe(testLimit);
        expect(result.rateLimitedAt).toBe(testLimit + 1);
      } finally {
        (env as any).IP_RESOLVE_RL_PER_HOUR = originalLimit;
      }
    });

    it('rate limits /claims/<uuid> at 300 requests per IP per hour', async () => {
      const uuid = crypto.randomUUID();
      await createMockProfile({ uuid });

      const testLimit = 10;
      const originalLimit = env.IP_CLAIMS_RL_PER_HOUR;
      (env as any).IP_CLAIMS_RL_PER_HOUR = String(testLimit);

      try {
        const result = await testRateLimit(`https://anchorid.net/claims/${uuid}`, testLimit, {
          ip: '2.3.4.5',
        });

        expect(result.successCount).toBe(testLimit);
        expect(result.rateLimitedAt).toBe(testLimit + 1);
      } finally {
        (env as any).IP_CLAIMS_RL_PER_HOUR = originalLimit;
      }
    });

    it('isolates rate limits by IP address', async () => {
      const uuid = crypto.randomUUID();
      await createMockProfile({ uuid });

      const testLimit = 5;
      const originalLimit = env.IP_RESOLVE_RL_PER_HOUR;
      (env as any).IP_RESOLVE_RL_PER_HOUR = String(testLimit);

      try {
        // First IP exhausts its limit
        for (let i = 0; i < testLimit; i++) {
          const req = createTestRequest(`https://anchorid.net/resolve/${uuid}`, { ip: '10.0.0.1' });
          await SELF.fetch(req);
        }

        // Verify first IP is rate limited
        const req1 = createTestRequest(`https://anchorid.net/resolve/${uuid}`, { ip: '10.0.0.1' });
        const response1 = await SELF.fetch(req1);
        expect(response1.status).toBe(429);

        // Second IP should still work
        const req2 = createTestRequest(`https://anchorid.net/resolve/${uuid}`, { ip: '10.0.0.2' });
        const response2 = await SELF.fetch(req2);
        expect(response2.status).not.toBe(429);
      } finally {
        (env as any).IP_RESOLVE_RL_PER_HOUR = originalLimit;
      }
    });
  });

  describe('Admin endpoint rate limits', () => {
    it('rate limits /admin/login POST at 5 requests per IP per hour', async () => {
      const testLimit = 3; // Use smaller limit for faster testing
      const originalLimit = env.IP_ADMIN_LOGIN_RL_PER_HOUR;
      (env as any).IP_ADMIN_LOGIN_RL_PER_HOUR = String(testLimit);

      try {
        const formData = new FormData();
        formData.append('token', 'wrong-password');
        formData.append('_csrf', 'test-csrf');

        const result = await testRateLimit('https://anchorid.net/admin/login', testLimit, {
          method: 'POST',
          body: formData,
          ip: '3.4.5.6',
        });

        expect(result.rateLimitedAt).toBe(testLimit + 1);
      } finally {
        (env as any).IP_ADMIN_LOGIN_RL_PER_HOUR = originalLimit;
      }
    });

    it('prevents brute force attacks on admin password', async () => {
      const testLimit = 3;
      const originalLimit = env.IP_ADMIN_LOGIN_RL_PER_HOUR;
      (env as any).IP_ADMIN_LOGIN_RL_PER_HOUR = String(testLimit);

      try {
        const attempts = ['pass1', 'pass2', 'pass3', 'pass4', 'pass5'];
        let rateLimitedAt = -1;

        for (let i = 0; i < attempts.length; i++) {
          const formData = new FormData();
          formData.append('token', attempts[i]);
          formData.append('_csrf', 'test-csrf');

          const req = createTestRequest('https://anchorid.net/admin/login', {
            method: 'POST',
            body: formData,
            ip: '4.5.6.7',
          });

          const response = await SELF.fetch(req);

          if (response.status === 429 && rateLimitedAt === -1) {
            rateLimitedAt = i + 1;
            break;
          }
        }

        expect(rateLimitedAt).toBe(testLimit + 1);
      } finally {
        (env as any).IP_ADMIN_LOGIN_RL_PER_HOUR = originalLimit;
      }
    });
  });

  describe('User endpoint rate limits', () => {
    it('rate limits /login POST per IP', async () => {
      const testLimit = 5;
      const originalLimit = env.IP_LOGIN_RL_PER_HOUR;
      (env as any).IP_LOGIN_RL_PER_HOUR = String(testLimit);

      try {
        const result = await testRateLimit('https://anchorid.net/login', testLimit, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email: 'test@example.com' }),
          ip: '5.6.7.8',
        });

        expect(result.rateLimitedAt).toBe(testLimit + 1);
      } finally {
        (env as any).IP_LOGIN_RL_PER_HOUR = originalLimit;
      }
    });

    it('rate limits /edit page loads per IP', async () => {
      const uuid = crypto.randomUUID();
      const token = await createLoginSession(uuid);

      const testLimit = 5;
      const originalLimit = env.IP_EDIT_RL_PER_HOUR;
      (env as any).IP_EDIT_RL_PER_HOUR = String(testLimit);

      try {
        const result = await testRateLimit(`https://anchorid.net/edit?token=${token}`, testLimit, {
          ip: '6.7.8.9',
        });

        expect(result.rateLimitedAt).toBe(testLimit + 1);
      } finally {
        (env as any).IP_EDIT_RL_PER_HOUR = originalLimit;
      }
    });

    it('rate limits claim creation per IP and per UUID', async () => {
      const uuid = crypto.randomUUID();
      await createMockProfile({ uuid });
      const token = await createLoginSession(uuid);

      const testLimit = 5;
      const originalIpLimit = env.IP_CLAIM_RL_PER_HOUR;
      const originalUuidLimit = env.CLAIM_RL_PER_HOUR;
      (env as any).IP_CLAIM_RL_PER_HOUR = String(testLimit);
      (env as any).CLAIM_RL_PER_HOUR = String(testLimit);

      try {
        const result = await testRateLimit('https://anchorid.net/claim', testLimit, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            uuid,
            type: 'website',
            url: 'https://example.com',
          }),
          ip: '7.8.9.10',
        });

        expect(result.rateLimitedAt).toBe(testLimit + 1);
      } finally {
        (env as any).IP_CLAIM_RL_PER_HOUR = originalIpLimit;
        (env as any).CLAIM_RL_PER_HOUR = originalUuidLimit;
      }
    });
  });

  describe('Rate limit bypass attempts', () => {
    it('cannot bypass rate limits with different user agents', async () => {
      const uuid = crypto.randomUUID();
      await createMockProfile({ uuid });

      const testLimit = 3;
      const originalLimit = env.IP_RESOLVE_RL_PER_HOUR;
      (env as any).IP_RESOLVE_RL_PER_HOUR = String(testLimit);

      try {
        const testIP = '11.22.33.44';

        // Exhaust limit with one user agent
        for (let i = 0; i < testLimit; i++) {
          const req = createTestRequest(`https://anchorid.net/resolve/${uuid}`, {
            ip: testIP,
            headers: { 'User-Agent': 'Browser-A' },
          });
          await SELF.fetch(req);
        }

        // Try with different user agent - should still be rate limited
        const req = createTestRequest(`https://anchorid.net/resolve/${uuid}`, {
          ip: testIP,
          headers: { 'User-Agent': 'Browser-B' },
        });
        const response = await SELF.fetch(req);
        expect(response.status).toBe(429);
      } finally {
        (env as any).IP_RESOLVE_RL_PER_HOUR = originalLimit;
      }
    });

    it('cannot bypass rate limits by changing headers', async () => {
      const uuid = crypto.randomUUID();
      await createMockProfile({ uuid });

      const testLimit = 3;
      const originalLimit = env.IP_RESOLVE_RL_PER_HOUR;
      (env as any).IP_RESOLVE_RL_PER_HOUR = String(testLimit);

      try {
        const testIP = '55.66.77.88';

        // Exhaust limit
        for (let i = 0; i < testLimit; i++) {
          const req = createTestRequest(`https://anchorid.net/resolve/${uuid}`, {
            ip: testIP,
            headers: { 'Accept': 'application/json' },
          });
          await SELF.fetch(req);
        }

        // Try with different headers - should still be rate limited
        const req = createTestRequest(`https://anchorid.net/resolve/${uuid}`, {
          ip: testIP,
          headers: { 'Accept': 'text/html', 'X-Custom': 'header' },
        });
        const response = await SELF.fetch(req);
        expect(response.status).toBe(429);
      } finally {
        (env as any).IP_RESOLVE_RL_PER_HOUR = originalLimit;
      }
    });
  });
});

describe('Security: Authentication & Authorization', () => {
  beforeEach(async () => {
    await clearAllTestData();
  });

  afterEach(async () => {
    await clearAllTestData();
  });

  describe('Admin authentication', () => {
    it('requires admin token for admin API endpoints', async () => {
      const req = createTestRequest('https://anchorid.net/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uuid: crypto.randomUUID(),
          type: 'website',
          url: 'https://example.com',
        }),
      });

      const response = await SELF.fetch(req);
      expect(response.status).toBe(401);
    });

    it('accepts valid admin token', async () => {
      const uuid = crypto.randomUUID();
      await createMockProfile({ uuid });

      const req = createTestRequest('https://anchorid.net/claim', {
        method: 'POST',
        headers: withAdminAuth(env, {
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          uuid,
          type: 'website',
          url: 'https://example.com',
        }),
      });

      const response = await SELF.fetch(req);
      expect(response.status).not.toBe(401);
    });

    it('rejects invalid admin token', async () => {
      const req = createTestRequest('https://anchorid.net/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer wrong-token',
        },
        body: JSON.stringify({
          uuid: crypto.randomUUID(),
          type: 'website',
          url: 'https://example.com',
        }),
      });

      const response = await SELF.fetch(req);
      expect(response.status).toBe(401);
    });
  });

  describe('User session authentication', () => {
    it('requires valid session token for user endpoints', async () => {
      const req = createTestRequest('https://anchorid.net/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Test User',
        }),
      });

      const response = await SELF.fetch(req);
      expect(response.status).toBe(401);
    });

    it('accepts valid session token', async () => {
      const uuid = crypto.randomUUID();
      await createMockProfile({ uuid, name: 'Test User' });
      const token = await createLoginSession(uuid);

      const req = createTestRequest('https://anchorid.net/update', {
        method: 'POST',
        headers: withSessionAuth(token, {
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          name: 'Updated Name',
        }),
      });

      const response = await SELF.fetch(req);
      expect(response.status).not.toBe(401);
    });

    it('rejects expired session token', async () => {
      // Create an expired session (would need KV TTL manipulation)
      // For now, test with invalid token
      const req = createTestRequest('https://anchorid.net/update', {
        method: 'POST',
        headers: withSessionAuth('expired-token', {
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          name: 'Test',
        }),
      });

      const response = await SELF.fetch(req);
      expect(response.status).toBe(401);
    });

    it('prevents user from accessing other users profiles', async () => {
      const uuid1 = crypto.randomUUID();
      const uuid2 = crypto.randomUUID();
      await createMockProfile({ uuid: uuid1 });
      await createMockProfile({ uuid: uuid2 });

      const token1 = await createLoginSession(uuid1);

      // Try to create claim for uuid2 using uuid1's token
      const req = createTestRequest('https://anchorid.net/claim', {
        method: 'POST',
        headers: withSessionAuth(token1, {
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          uuid: uuid2,
          type: 'website',
          url: 'https://example.com',
        }),
      });

      const response = await SELF.fetch(req);
      expect(response.status).toBe(401);
    });
  });

  describe('Admin cookie authentication', () => {
    it('requires admin cookie for admin UI pages', async () => {
      const req = createTestRequest('https://anchorid.net/admin');
      const response = await SELF.fetch(req);

      // Should redirect to login
      expect(response.status).toBe(303);
      expect(response.headers.get('Location')).toContain('/admin/login');
    });

    it('accepts valid admin cookie', async () => {
      const req = createTestRequest('https://anchorid.net/admin', {
        headers: withAdminCookie(env),
      });

      const response = await SELF.fetch(req);
      expect(response.status).toBe(200);
    });
  });
});

describe('Security: Input Validation', () => {
  beforeEach(async () => {
    await clearAllTestData();
  });

  afterEach(async () => {
    await clearAllTestData();
  });

  it('rejects invalid UUID formats', async () => {
    const invalidUUIDs = [
      'not-a-uuid',
      '12345',
      'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      '00000000-0000-0000-0000-00000000000', // too short
      '00000000-0000-0000-0000-0000000000000', // too long
    ];

    for (const invalidUUID of invalidUUIDs) {
      const req = createTestRequest(`https://anchorid.net/resolve/${invalidUUID}`);
      const response = await SELF.fetch(req);
      expect(response.status).toBe(400);
    }
  });

  it('rejects invalid email addresses', async () => {
    const invalidEmails = [
      'not-an-email',
      '@example.com',
      'user@',
      'user@.com',
      'user @example.com',
      '',
    ];

    for (const invalidEmail of invalidEmails) {
      const req = createTestRequest('https://anchorid.net/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: invalidEmail }),
      });

      const response = await SELF.fetch(req);
      expect(response.status).toBeGreaterThanOrEqual(400);
    }
  });

  it('handles malformed JSON gracefully', async () => {
    const uuid = crypto.randomUUID();
    await createMockProfile({ uuid });
    const token = await createLoginSession(uuid);

    const req = createTestRequest('https://anchorid.net/update', {
      method: 'POST',
      headers: withSessionAuth(token, {
        'Content-Type': 'application/json',
      }),
      body: 'not valid json {',
    });

    const response = await SELF.fetch(req);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects URLs that are too long', async () => {
    const uuid = crypto.randomUUID();
    await createMockProfile({ uuid });
    const token = await createLoginSession(uuid);

    const longUrl = 'https://example.com/' + 'a'.repeat(3000);

    const req = createTestRequest('https://anchorid.net/claim', {
      method: 'POST',
      headers: withSessionAuth(token, {
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({
        uuid,
        type: 'website',
        url: longUrl,
      }),
    });

    const response = await SELF.fetch(req);
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});

describe('Security: CSRF Protection', () => {
  beforeEach(async () => {
    await clearAllTestData();
  });

  afterEach(async () => {
    await clearAllTestData();
  });

  it('rejects admin POST requests without CSRF token', async () => {
    const formData = new FormData();
    formData.append('name', 'Test Profile');
    formData.append('type', 'Person');

    const req = createTestRequest('https://anchorid.net/admin/new', {
      method: 'POST',
      headers: withAdminCookie(env),
      body: formData,
    });

    const response = await SELF.fetch(req);
    expect(response.status).toBe(403); // CSRF error
  });

  // Note: Full CSRF testing would require extracting token from HTML forms
  // and submitting it back. This is a basic check that CSRF protection exists.
});

describe('Security: Denial of Service Protection', () => {
  it('handles rapid sequential requests without crashing', async () => {
    const uuid = crypto.randomUUID();
    await createMockProfile({ uuid });

    const requests = [];
    for (let i = 0; i < 50; i++) {
      requests.push(
        SELF.fetch(createTestRequest(`https://anchorid.net/resolve/${uuid}`, {
          ip: `100.${i}.${i}.${i}`, // Different IPs to avoid rate limiting
        }))
      );
    }

    const responses = await Promise.all(requests);
    const successCount = responses.filter(r => r.status === 200).length;

    expect(successCount).toBeGreaterThan(0); // System didn't crash
  });

  it('handles concurrent requests from same IP gracefully', async () => {
    const uuid = crypto.randomUUID();
    await createMockProfile({ uuid });

    const requests = [];
    const testIP = '200.200.200.200';

    for (let i = 0; i < 20; i++) {
      requests.push(
        SELF.fetch(createTestRequest(`https://anchorid.net/resolve/${uuid}`, {
          ip: testIP,
        }))
      );
    }

    const responses = await Promise.all(requests);

    // Some should succeed, some should be rate limited
    const successCount = responses.filter(r => r.status === 200).length;
    const rateLimitedCount = responses.filter(r => r.status === 429).length;

    expect(successCount + rateLimitedCount).toBe(20);
    expect(successCount).toBeGreaterThan(0); // At least some succeeded
  });
});
