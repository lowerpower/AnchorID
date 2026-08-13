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
 */

/**
 * Security headers applied to every response.
 *
 * These were previously defined three times (index.ts, claims/handlers.ts) and
 * not at all for the admin UI, so the pages that render secrets — /edit,
 * /setup, and all of /admin/* — shipped without a CSP or X-Frame-Options while
 * the public informational pages had both. Single definition, applied
 * everywhere.
 *
 * Note: `script-src 'unsafe-inline'` is required by the current inline-script
 * pages and blunts the CSP's XSS value. Moving to hashed/nonced scripts is
 * tracked separately; the header still provides framing, sniffing and
 * form-action protection in the meantime.
 */
export function securityHeaders(): Record<string, string> {
  return {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "interest-cohort=()",
    "content-security-policy":
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'",
  };
}

/**
 * Headers for pages that carry a credential in the URL or in the page body
 * (/setup, /edit). Adds no-referrer so a magic-link or backup token in the
 * query string is never leaked in a Referer header.
 */
export function secretPageHeaders(): Record<string, string> {
  return {
    ...securityHeaders(),
    "referrer-policy": "no-referrer",
  };
}
