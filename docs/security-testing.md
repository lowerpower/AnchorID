# Security Testing Guide

This document describes how to run and verify the security testing suite for AnchorID.

---

## Overview

AnchorID includes comprehensive security tests to verify the system can handle hostile-but-boring internet traffic:

- **Rate limiting** on all endpoints (public, admin, user)
- **Authentication** and authorization
- **Input validation** and sanitization
- **Load testing** under sustained and concurrent requests
- **Distributed attack** simulation

---

## Running Security Tests

### All Tests

```bash
npm test
```

### Security Tests Only

```bash
npm test test/security.spec.ts
```

### Load Tests Only

```bash
npm test test/load.spec.ts
```

### Specific Test Suite

```bash
npm test -- --grep "Rate Limiting"
npm test -- --grep "Authentication"
npm test -- --grep "Distributed Attacks"
```

---

## Test Categories

### 1. Rate Limiting Tests

**What they test**: All endpoints enforce correct rate limits per IP and per resource.

**Key scenarios**:
- Public endpoints (`/resolve`, `/claims`) allow 300 req/hour per IP
- Admin login limited to 5 req/hour per IP (brute force prevention)
- User endpoints properly isolated by IP address
- Rate limits cannot be bypassed by changing headers/user agents

**Expected outcomes**:
- Requests within limit succeed (200/303)
- Requests over limit return 429 with `retry-after` header
- Different IPs have independent rate limits

### 2. Authentication & Authorization Tests

**What they test**: Only authorized users can access protected resources.

**Key scenarios**:
- Admin token required for admin API endpoints
- Session tokens required for user endpoints
- Users cannot access other users' profiles
- Invalid/expired tokens are rejected

**Expected outcomes**:
- Missing auth returns 401 Unauthorized
- Invalid auth returns 401 Unauthorized
- Valid auth succeeds with expected operation

### 3. Input Validation Tests

**What they test**: Malformed or malicious input is rejected gracefully.

**Key scenarios**:
- Invalid UUIDs rejected (400)
- Invalid emails rejected (400+)
- Malformed JSON handled gracefully
- Oversized URLs rejected

**Expected outcomes**:
- System doesn't crash on bad input
- Returns appropriate 4xx error codes
- Error messages don't leak sensitive info

### 4. Load Tests

**What they test**: System remains stable under sustained high load.

**Key scenarios**:
- 1000+ sequential requests without degradation
- 100+ concurrent requests handled correctly
- Distributed attacks from 50+ IPs
- Rate limit counters accurate at scale

**Expected outcomes**:
- High success rate (>95%) under normal load
- Graceful degradation under attack (429 responses, not crashes)
- Consistent response times
- Legitimate traffic works during attacks

---

## Performance Benchmarks

Expected performance characteristics:

| Metric | Target | Notes |
|--------|--------|-------|
| Average response time | < 100ms | For successful requests |
| Max response time | < 500ms | Under normal load |
| Success rate | > 95% | For non-rate-limited requests |
| Concurrent request handling | 100+ | Without errors |
| Sustained load | 1000+ req | Sequential, different IPs |

---

## Manual Verification

### Testing Rate Limits in Production

```bash
# Test /resolve rate limit (should allow 300/hour)
for i in {1..305}; do
  curl -i https://anchorid.net/resolve/<uuid>
  echo "Request $i"
done
# Requests 1-300 should return 200
# Requests 301+ should return 429

# Test admin login rate limit (should allow 5/hour)
for i in {1..7}; do
  curl -i -X POST https://anchorid.net/admin/login \
    -d "token=test&_csrf=test"
  echo "Request $i"
done
# Requests 1-5 should process (may return 401/403)
# Requests 6+ should return 429
```

### Verify Rate Limit Headers

```bash
curl -i https://anchorid.net/resolve/<uuid>
# Should include:
# Cache-Control: public, max-age=300, ...
```

When rate limited:

```bash
# Should include:
# HTTP/1.1 429 Too Many Requests
# Retry-After: 3600
# Cache-Control: no-store
```

---

## Production Monitoring

### Key Metrics to Monitor

1. **Rate Limit Hit Rate**
   - KV keys with prefix `rl:*`
   - High counts may indicate attack or overly strict limits

2. **429 Response Rate**
   - % of requests returning 429
   - Sudden spikes indicate attack or misconfigured limits

3. **Response Time P95/P99**
   - Track degradation under load
   - Should remain < 500ms for P99

4. **Error Rate (5xx)**
   - Should be near zero
   - Non-zero indicates system instability

### Cloudflare Analytics

Use Cloudflare Analytics to monitor:
- Request volume per endpoint
- Geographic distribution of traffic
- Bot vs. human traffic patterns
- DDoS attack indicators

---

## Known Limitations

1. **KV Eventual Consistency**: Rate limit counters use KV, which is eventually consistent. Under extreme concurrent load from the same IP, you may occasionally see `limit + 1` or `limit + 2` requests succeed before rate limiting kicks in. This is acceptable and doesn't indicate a security issue.

2. **Test Environment**: Tests run against Cloudflare Workers' test pool, which may have different performance characteristics than production. Load tests are indicative, not definitive.

3. **IP Spoofing**: Tests simulate different IPs via headers. In production, Cloudflare provides actual client IPs via `cf-connecting-ip`, which cannot be spoofed.

---

## Troubleshooting Test Failures

### "Test timed out"

Increase timeout for long-running tests:

```typescript
it('long test', async () => {
  // Test code
}, 30000); // 30 second timeout
```

### "Rate limit not enforced"

Check that:
- Environment variables are set correctly
- Rate limit keys are being cleared between tests (`clearRateLimitKeys()`)
- IP addresses are consistent within test (not randomized)

### "Isolated storage failed"

Ensure all KV operations are awaited:

```typescript
// Bad
env.ANCHOR_KV.put(key, value); // Missing await

// Good
await env.ANCHOR_KV.put(key, value);
```

---

## Security Testing Checklist

Before deploying changes:

- [ ] All security tests pass
- [ ] Load tests demonstrate stable performance
- [ ] Rate limits are documented in threat-model.md
- [ ] New endpoints have appropriate rate limits
- [ ] Authentication required where expected
- [ ] Input validation rejects malicious payloads
- [ ] Error messages don't leak sensitive information
- [ ] Manual smoke test in staging environment

After deploying:

- [ ] Monitor 429 response rate for 24 hours
- [ ] Check for unexpected rate limit hits
- [ ] Verify legitimate traffic isn't being blocked
- [ ] Review Cloudflare Analytics for anomalies

---

## Reporting Security Issues

If you discover a security vulnerability:

1. **Do not** open a public GitHub issue
2. Email details to: [security contact - TBD]
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will respond within 48 hours and work with you on a fix.
