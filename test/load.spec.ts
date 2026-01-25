import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createTestRequest,
  clearRateLimitKeys,
  clearAllTestData,
  createMockProfile,
  generateUniqueIPs,
  isRateLimited,
  isSuccessful,
  getJson,
  wait,
} from './helpers';

/**
 * Load Testing Suite
 *
 * Tests system behavior under sustained load, concurrent requests,
 * distributed attacks, and rate limit counter accuracy at scale.
 */

describe('Load Testing: Sustained Load', () => {
  beforeEach(async () => {
    await clearAllTestData();
    await clearRateLimitKeys();
  });

  afterEach(async () => {
    await clearAllTestData();
    await clearRateLimitKeys();
  });

  it('handles 1000+ sequential requests without degradation', async () => {
    const uuid = crypto.randomUUID();
    await createMockProfile({ uuid });

    const totalRequests = 1000;
    const ips = generateUniqueIPs(totalRequests);

    let successCount = 0;
    let errorCount = 0;
    const startTime = Date.now();

    for (let i = 0; i < totalRequests; i++) {
      const req = createTestRequest(`https://anchorid.net/resolve/${uuid}`, {
        ip: ips[i], // Each request from different IP to avoid rate limiting
      });

      const response = await SELF.fetch(req);

      if (isSuccessful(response)) {
        successCount++;
      } else {
        errorCount++;
      }
    }

    const endTime = Date.now();
    const duration = endTime - startTime;
    const requestsPerSecond = (totalRequests / duration) * 1000;

    console.log(`Load test: ${totalRequests} requests in ${duration}ms (${requestsPerSecond.toFixed(2)} req/s)`);
    console.log(`Success: ${successCount}, Errors: ${errorCount}`);

    // Expect high success rate (allowing for some errors)
    expect(successCount).toBeGreaterThan(totalRequests * 0.95); // 95% success rate
    expect(errorCount).toBeLessThan(totalRequests * 0.05); // Less than 5% errors
  });

  it('maintains consistent response times under load', async () => {
    const uuid = crypto.randomUUID();
    await createMockProfile({ uuid });

    const totalRequests = 100;
    const responseTimes: number[] = [];

    for (let i = 0; i < totalRequests; i++) {
      const startTime = Date.now();
      const req = createTestRequest(`https://anchorid.net/resolve/${uuid}`, {
        ip: `10.${Math.floor(i / 256)}.${i % 256}.1`,
      });

      const response = await SELF.fetch(req);
      const endTime = Date.now();

      if (isSuccessful(response)) {
        responseTimes.push(endTime - startTime);
      }
    }

    // Calculate statistics
    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const maxResponseTime = Math.max(...responseTimes);
    const minResponseTime = Math.min(...responseTimes);

    console.log(`Response times: avg=${avgResponseTime.toFixed(2)}ms, min=${minResponseTime}ms, max=${maxResponseTime}ms`);

    // Expect reasonable response times (adjust based on environment)
    expect(avgResponseTime).toBeLessThan(100); // Average under 100ms
    expect(maxResponseTime).toBeLessThan(500); // Max under 500ms
  });

  it('handles sustained load across multiple endpoints', async () => {
    const uuid = crypto.randomUUID();
    await createMockProfile({ uuid });

    const endpoints = [
      `/resolve/${uuid}`,
      `/claims/${uuid}`,
    ];

    const requestsPerEndpoint = 200;
    const results: Record<string, { success: number; errors: number }> = {};

    for (const endpoint of endpoints) {
      let success = 0;
      let errors = 0;

      for (let i = 0; i < requestsPerEndpoint; i++) {
        const req = createTestRequest(`https://anchorid.net${endpoint}`, {
          ip: `20.${endpoints.indexOf(endpoint)}.${Math.floor(i / 256)}.${i % 256}`,
        });

        const response = await SELF.fetch(req);

        if (isSuccessful(response)) {
          success++;
        } else {
          errors++;
        }
      }

      results[endpoint] = { success, errors };
    }

    // All endpoints should handle load well
    for (const endpoint of endpoints) {
      const { success, errors } = results[endpoint];
      console.log(`${endpoint}: ${success} success, ${errors} errors`);
      expect(success).toBeGreaterThan(requestsPerEndpoint * 0.95);
    }
  });
});

describe('Load Testing: Concurrent Requests', () => {
  beforeEach(async () => {
    await clearAllTestData();
    await clearRateLimitKeys();
  });

  afterEach(async () => {
    await clearAllTestData();
    await clearRateLimitKeys();
  });

  it('handles 100 concurrent requests correctly', async () => {
    const uuid = crypto.randomUUID();
    await createMockProfile({ uuid });

    const concurrentRequests = 100;
    const ips = generateUniqueIPs(concurrentRequests);

    const requests = ips.map((ip, i) =>
      SELF.fetch(createTestRequest(`https://anchorid.net/resolve/${uuid}`, { ip }))
    );

    const responses = await Promise.all(requests);

    const successCount = responses.filter(r => isSuccessful(r)).length;
    const errorCount = responses.filter(r => !isSuccessful(r) && !isRateLimited(r)).length;

    console.log(`Concurrent requests: ${successCount} success, ${errorCount} errors out of ${concurrentRequests}`);

    expect(successCount).toBeGreaterThan(concurrentRequests * 0.9); // 90% success rate
  });

  it('prevents race conditions in rate limit counters', async () => {
    const uuid = crypto.randomUUID();
    await createMockProfile({ uuid });

    const testLimit = 10;
    const originalLimit = env.IP_RESOLVE_RL_PER_HOUR;
    (env as any).IP_RESOLVE_RL_PER_HOUR = String(testLimit);

    try {
      const testIP = '30.30.30.30';
      const concurrentRequests = testLimit + 5;

      // Send concurrent requests from same IP
      const requests = Array.from({ length: concurrentRequests }, () =>
        SELF.fetch(createTestRequest(`https://anchorid.net/resolve/${uuid}`, { ip: testIP }))
      );

      const responses = await Promise.all(requests);

      const successCount = responses.filter(r => isSuccessful(r)).length;
      const rateLimitedCount = responses.filter(r => isRateLimited(r)).length;

      console.log(`Race condition test: ${successCount} success, ${rateLimitedCount} rate limited`);

      // Should allow exactly testLimit requests (or close to it, accounting for race conditions)
      // In practice, concurrent requests may cause slight over-limit due to KV eventual consistency
      expect(successCount).toBeLessThanOrEqual(testLimit + 2); // Allow small margin for race conditions
      expect(rateLimitedCount).toBeGreaterThan(0); // Some should be rate limited
    } finally {
      (env as any).IP_RESOLVE_RL_PER_HOUR = originalLimit;
    }
  });

  it('handles concurrent requests across different UUIDs', async () => {
    const uuids = await Promise.all([
      createMockProfile({ name: 'User 1' }),
      createMockProfile({ name: 'User 2' }),
      createMockProfile({ name: 'User 3' }),
    ]);

    const concurrentRequests = 30; // 10 per UUID
    const requests = [];

    for (let i = 0; i < concurrentRequests; i++) {
      const uuid = uuids[i % uuids.length].uuid;
      requests.push(
        SELF.fetch(createTestRequest(`https://anchorid.net/resolve/${uuid}`, {
          ip: `40.40.${i}.${i}`,
        }))
      );
    }

    const responses = await Promise.all(requests);
    const successCount = responses.filter(r => isSuccessful(r)).length;

    expect(successCount).toBe(concurrentRequests); // All should succeed (different IPs)
  });
});

describe('Load Testing: Distributed Attacks', () => {
  beforeEach(async () => {
    await clearAllTestData();
    await clearRateLimitKeys();
  });

  afterEach(async () => {
    await clearAllTestData();
    await clearRateLimitKeys();
  });

  it('handles distributed attack from 50+ different IPs', async () => {
    const uuid = crypto.randomUUID();
    await createMockProfile({ uuid });

    const attackerCount = 50;
    const requestsPerAttacker = 20;
    const ips = generateUniqueIPs(attackerCount);

    let totalRequests = 0;
    let totalSuccess = 0;
    let totalRateLimited = 0;

    for (const ip of ips) {
      for (let i = 0; i < requestsPerAttacker; i++) {
        const req = createTestRequest(`https://anchorid.net/resolve/${uuid}`, { ip });
        const response = await SELF.fetch(req);

        totalRequests++;
        if (isSuccessful(response)) {
          totalSuccess++;
        } else if (isRateLimited(response)) {
          totalRateLimited++;
        }
      }
    }

    console.log(`Distributed attack: ${totalSuccess} success, ${totalRateLimited} rate limited out of ${totalRequests}`);

    // Each IP should be rate limited individually
    expect(totalRateLimited).toBeGreaterThan(0);
    expect(totalSuccess).toBeLessThan(totalRequests); // Not all requests succeed
  });

  it('isolates rate limits across distributed IPs', async () => {
    const uuid = crypto.randomUUID();
    await createMockProfile({ uuid });

    const testLimit = 5;
    const originalLimit = env.IP_RESOLVE_RL_PER_HOUR;
    (env as any).IP_RESOLVE_RL_PER_HOUR = String(testLimit);

    try {
      const attackerIPs = generateUniqueIPs(10);
      const results: Record<string, { success: number; rateLimited: number }> = {};

      for (const ip of attackerIPs) {
        let success = 0;
        let rateLimited = 0;

        // Each IP tries to make limit + 3 requests
        for (let i = 0; i < testLimit + 3; i++) {
          const req = createTestRequest(`https://anchorid.net/resolve/${uuid}`, { ip });
          const response = await SELF.fetch(req);

          if (isSuccessful(response)) {
            success++;
          } else if (isRateLimited(response)) {
            rateLimited++;
          }
        }

        results[ip] = { success, rateLimited };
      }

      // Each IP should have similar behavior (isolated rate limiting)
      for (const ip of attackerIPs) {
        const { success, rateLimited } = results[ip];
        expect(success).toBe(testLimit); // Each IP gets exactly testLimit successes
        expect(rateLimited).toBe(3); // Each IP gets rate limited for exceeding limit
      }
    } finally {
      (env as any).IP_RESOLVE_RL_PER_HOUR = originalLimit;
    }
  });

  it('prevents coordinated distributed brute force on admin login', async () => {
    const testLimit = 3;
    const originalLimit = env.IP_ADMIN_LOGIN_RL_PER_HOUR;
    (env as any).IP_ADMIN_LOGIN_RL_PER_HOUR = String(testLimit);

    try {
      const attackerIPs = generateUniqueIPs(20);
      const passwords = ['pass1', 'pass2', 'pass3', 'pass4'];

      let totalAttempts = 0;
      let totalRateLimited = 0;

      for (const ip of attackerIPs) {
        for (const password of passwords) {
          const formData = new FormData();
          formData.append('token', password);
          formData.append('_csrf', 'test-csrf');

          const req = createTestRequest('https://anchorid.net/admin/login', {
            method: 'POST',
            body: formData,
            ip,
          });

          const response = await SELF.fetch(req);
          totalAttempts++;

          if (isRateLimited(response)) {
            totalRateLimited++;
          }
        }
      }

      console.log(`Admin brute force: ${totalRateLimited} rate limited out of ${totalAttempts} attempts`);

      // Each IP should be rate limited after testLimit attempts
      expect(totalRateLimited).toBeGreaterThan(attackerIPs.length * (passwords.length - testLimit));
    } finally {
      (env as any).IP_ADMIN_LOGIN_RL_PER_HOUR = originalLimit;
    }
  });
});

describe('Load Testing: Rate Limit Counter Accuracy', () => {
  beforeEach(async () => {
    await clearRateLimitKeys();
  });

  afterEach(async () => {
    await clearRateLimitKeys();
  });

  it('accurately counts requests at scale', async () => {
    const uuid = crypto.randomUUID();
    await createMockProfile({ uuid });

    const testLimit = 100;
    const originalLimit = env.IP_RESOLVE_RL_PER_HOUR;
    (env as any).IP_RESOLVE_RL_PER_HOUR = String(testLimit);

    try {
      const testIP = '50.50.50.50';
      let successCount = 0;
      let rateLimitedCount = 0;

      for (let i = 0; i < testLimit + 10; i++) {
        const req = createTestRequest(`https://anchorid.net/resolve/${uuid}`, { ip: testIP });
        const response = await SELF.fetch(req);

        if (isSuccessful(response)) {
          successCount++;
        } else if (isRateLimited(response)) {
          rateLimitedCount++;
        }
      }

      console.log(`Counter accuracy: ${successCount} success, ${rateLimitedCount} rate limited (limit=${testLimit})`);

      // Should be exactly testLimit successes and 10 rate limited
      expect(successCount).toBe(testLimit);
      expect(rateLimitedCount).toBe(10);
    } finally {
      (env as any).IP_RESOLVE_RL_PER_HOUR = originalLimit;
    }
  });

  it('maintains accuracy across multiple rate limit keys', async () => {
    const uuid = crypto.randomUUID();
    await createMockProfile({ uuid });

    const testLimit = 50;
    const originalResolveLimit = env.IP_RESOLVE_RL_PER_HOUR;
    const originalClaimsLimit = env.IP_CLAIMS_RL_PER_HOUR;
    (env as any).IP_RESOLVE_RL_PER_HOUR = String(testLimit);
    (env as any).IP_CLAIMS_RL_PER_HOUR = String(testLimit);

    try {
      const testIP = '60.60.60.60';

      // Test /resolve
      let resolveSuccess = 0;
      for (let i = 0; i < testLimit + 5; i++) {
        const req = createTestRequest(`https://anchorid.net/resolve/${uuid}`, { ip: testIP });
        const response = await SELF.fetch(req);
        if (isSuccessful(response)) resolveSuccess++;
      }

      // Test /claims (should have independent counter)
      let claimsSuccess = 0;
      for (let i = 0; i < testLimit + 5; i++) {
        const req = createTestRequest(`https://anchorid.net/claims/${uuid}`, { ip: testIP });
        const response = await SELF.fetch(req);
        if (isSuccessful(response)) claimsSuccess++;
      }

      // Each endpoint should have independent rate limiting
      expect(resolveSuccess).toBe(testLimit);
      expect(claimsSuccess).toBe(testLimit);
    } finally {
      (env as any).IP_RESOLVE_RL_PER_HOUR = originalResolveLimit;
      (env as any).IP_CLAIMS_RL_PER_HOUR = originalClaimsLimit;
    }
  });
});

describe('Load Testing: Resource Exhaustion Prevention', () => {
  it('prevents memory exhaustion from large payloads', async () => {
    const uuid = crypto.randomUUID();
    await createMockProfile({ uuid });
    const token = await (await import('./helpers')).createLoginSession(uuid);

    // Try to send a very large claim URL
    const largePayload = JSON.stringify({
      uuid,
      type: 'website',
      url: 'https://example.com/' + 'a'.repeat(10000),
    });

    const req = createTestRequest('https://anchorid.net/claim', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: largePayload,
    });

    const response = await SELF.fetch(req);

    // Should reject or handle gracefully (not crash)
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('handles many concurrent IPs without memory issues', async () => {
    const uuid = crypto.randomUUID();
    await createMockProfile({ uuid });

    const uniqueIPs = generateUniqueIPs(200);
    const requests = uniqueIPs.map(ip =>
      SELF.fetch(createTestRequest(`https://anchorid.net/resolve/${uuid}`, { ip }))
    );

    const responses = await Promise.all(requests);
    const successCount = responses.filter(r => isSuccessful(r)).length;

    // System should handle all requests without crashing
    expect(successCount).toBeGreaterThan(0);
    expect(responses.length).toBe(200);
  });
});

describe('Load Testing: Graceful Degradation', () => {
  it('returns proper 429 responses under sustained attack', async () => {
    const uuid = crypto.randomUUID();
    await createMockProfile({ uuid });

    const testLimit = 10;
    const originalLimit = env.IP_RESOLVE_RL_PER_HOUR;
    (env as any).IP_RESOLVE_RL_PER_HOUR = String(testLimit);

    try {
      const testIP = '70.70.70.70';

      // Exhaust rate limit
      for (let i = 0; i < testLimit; i++) {
        await SELF.fetch(createTestRequest(`https://anchorid.net/resolve/${uuid}`, { ip: testIP }));
      }

      // Verify rate limit response is proper
      const req = createTestRequest(`https://anchorid.net/resolve/${uuid}`, { ip: testIP });
      const response = await SELF.fetch(req);

      expect(response.status).toBe(429);
      expect(response.headers.get('retry-after')).toBe('3600');

      const json = await getJson(response);
      expect(json.error).toBe('rate_limited');
    } finally {
      (env as any).IP_RESOLVE_RL_PER_HOUR = originalLimit;
    }
  });

  it('maintains availability for legitimate traffic during attack', async () => {
    const uuid = crypto.randomUUID();
    await createMockProfile({ uuid });

    const testLimit = 10;
    const originalLimit = env.IP_RESOLVE_RL_PER_HOUR;
    (env as any).IP_RESOLVE_RL_PER_HOUR = String(testLimit);

    try {
      // Simulate attacker exhausting their rate limit
      const attackerIP = '80.80.80.80';
      for (let i = 0; i < testLimit; i++) {
        await SELF.fetch(createTestRequest(`https://anchorid.net/resolve/${uuid}`, { ip: attackerIP }));
      }

      // Verify attacker is rate limited
      const attackerReq = createTestRequest(`https://anchorid.net/resolve/${uuid}`, { ip: attackerIP });
      const attackerResponse = await SELF.fetch(attackerReq);
      expect(attackerResponse.status).toBe(429);

      // Legitimate user should still work
      const legitIP = '90.90.90.90';
      const legitReq = createTestRequest(`https://anchorid.net/resolve/${uuid}`, { ip: legitIP });
      const legitResponse = await SELF.fetch(legitReq);
      expect(legitResponse.status).toBe(200);
    } finally {
      (env as any).IP_RESOLVE_RL_PER_HOUR = originalLimit;
    }
  });
});
