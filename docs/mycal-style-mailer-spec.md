# mycal-style Mailer API Specification

**Version:** 1.0
**Last Updated:** January 31, 2026

## Overview

A "mycal-style mailer" is any HTTP service that implements this simple email sending API. AnchorID uses this interface to send magic link emails through a configurable endpoint.

This specification defines the contract that any compatible email service must implement.

---

## API Endpoint

**Method:** `POST`
**Content-Type:** `application/json`
**Authentication:** `X-Mail-Secret` header (shared secret)

---

## Request Format

### Headers

```http
POST /api/send HTTP/1.1
Host: example.com
Content-Type: application/json
X-Mail-Secret: your-shared-secret-key
```

**Required Headers:**
- `Content-Type: application/json`
- `X-Mail-Secret: <secret>` — Shared secret for authentication

### Body

```json
{
  "to": "user@example.com",
  "subject": "Your AnchorID Magic Link",
  "body": "Click here to log in: https://anchorid.net/edit?token=abc123"
}
```

**Required Fields:**
- `to` (string) — Recipient email address (single recipient only)
- `subject` (string) — Email subject line
- `body` (string) — Plain text email body (no HTML)

**Field Constraints:**
- `to` — Valid RFC 5322 email address
- `subject` — Max 998 characters (SMTP limit)
- `body` — Plain text only, UTF-8 encoded

---

## Response Format

### Success Response

**Status Code:** `200 OK`

**Body:** Any valid response (ignored by AnchorID)

The endpoint should return HTTP 200 if the email was successfully queued or sent. The response body is not parsed by AnchorID.

**Examples:**
```json
{"status": "sent"}
```
```json
{"message": "Email queued", "id": "msg_123"}
```
```
OK
```

### Error Responses

**Status Codes:**
- `401 Unauthorized` — Invalid or missing `X-Mail-Secret`
- `400 Bad Request` — Invalid request body (missing fields, malformed JSON)
- `429 Too Many Requests` — Rate limit exceeded
- `500 Internal Server Error` — Server-side error
- `503 Service Unavailable` — Temporary failure, retry later

**Error Body:** Optional, may contain error details (logged by AnchorID but not parsed)

---

## Security Requirements

### Authentication

- Endpoint MUST verify `X-Mail-Secret` header matches configured shared secret
- Endpoint MUST reject requests with missing or invalid secret (401 Unauthorized)
- Secret comparison MUST be constant-time to prevent timing attacks

### Rate Limiting

- Endpoint SHOULD implement rate limiting per secret/client
- Recommended: 100 emails per hour per secret
- Return 429 status when limit exceeded

### Input Validation

- Endpoint MUST validate recipient email address format
- Endpoint SHOULD reject emails to invalid/non-existent domains
- Endpoint MUST sanitize subject and body to prevent header injection

### HTTPS

- Endpoint MUST be served over HTTPS (TLS 1.2+)
- HTTP endpoints will be rejected by AnchorID

---

## Implementation Example (Node.js/Cloudflare Workers)

```javascript
export default {
  async fetch(request, env) {
    // Verify method
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Verify secret
    const secret = request.headers.get('X-Mail-Secret');
    if (!secret || secret !== env.MAIL_SEND_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Parse body
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    // Validate required fields
    if (!body.to || !body.subject || !body.body) {
      return new Response('Missing required fields: to, subject, body', { status: 400 });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.to)) {
      return new Response('Invalid email address', { status: 400 });
    }

    // Send email (example using Resend)
    const emailResult = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: body.to,
        subject: body.subject,
        text: body.body,
      }),
    });

    if (!emailResult.ok) {
      return new Response('Failed to send email', { status: 500 });
    }

    return new Response(JSON.stringify({ status: 'sent' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
```

---

## Testing Your Implementation

### cURL Example

```bash
curl -X POST https://example.com/api/send \
  -H "Content-Type: application/json" \
  -H "X-Mail-Secret: your-secret-key" \
  -d '{
    "to": "test@example.com",
    "subject": "Test Email",
    "body": "This is a test message."
  }'
```

**Expected Result:** HTTP 200 response, email delivered to recipient

### Test Checklist

- [ ] Returns 200 for valid requests
- [ ] Returns 401 for missing/invalid `X-Mail-Secret`
- [ ] Returns 400 for missing required fields
- [ ] Returns 400 for invalid email addresses
- [ ] Actually delivers email to recipient
- [ ] Handles UTF-8 characters in subject/body
- [ ] Enforces HTTPS (rejects HTTP requests)
- [ ] Rate limits excessive requests (429)

---

## Reference Implementation

**mycal.net mailer:** `https://www.mycal.net/api/send.php`

The original implementation that this spec is based on. Contact Mike Johnson (mycal) for access.

---

## Configuration in AnchorID

```bash
# Set both secrets (both required)
npx wrangler secret put MAIL_SEND_SECRET       # Your shared secret
npx wrangler secret put MYCAL_MAIL_ENDPOINT    # Your endpoint URL
```

**Example:**
```bash
npx wrangler secret put MAIL_SEND_SECRET
# Paste: my-secure-random-secret-key-here

npx wrangler secret put MYCAL_MAIL_ENDPOINT
# Paste: https://mail.example.com/api/send
```

---

## Why This Design?

**Simplicity:** Three fields, one header. Easy to implement in any language.

**Security:** Shared secret authentication is simple but effective for server-to-server communication.

**Portability:** Plain text email only. No HTML parsing, no attachments, no complexity.

**Flexibility:** Can wrap any email provider (Resend, SendGrid, Mailgun, SES, etc.)

**Durability:** Dead-simple spec that will work for decades.

---

## Alternatives Considered

**Why not SMTP directly?**
SMTP requires TLS, authentication negotiation, and complex protocol handling. HTTP is simpler for Cloudflare Workers.

**Why not OAuth2?**
Overkill for server-to-server communication. Shared secrets are simpler and sufficient.

**Why not webhook/callback?**
AnchorID doesn't need delivery confirmation. Fire-and-forget is acceptable for magic links.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-31 | Initial specification |

---

**Questions?** See [AnchorID documentation](https://anchorid.net/) or contact Mike Johnson.
