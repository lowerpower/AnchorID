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
 * Security headers.
 *
 * script-src no longer allows 'unsafe-inline' anywhere. Three variants:
 *
 *  - securityHeaders()        script-src 'none'  — JSON/text/XML responses and
 *                             any HTML that carries no executable script
 *  - staticPageHeaders()      script-src 'sha256-…' — the KV content pages,
 *                             whose only executable script is the shared
 *                             footer-year one-liner (JSON-LD blocks are data,
 *                             never executed, and need no allowance)
 *  - noncedHeaders(nonce)     script-src 'nonce-…' — Worker-generated pages;
 *                             every <script> tag must carry the same nonce
 *
 * style-src keeps 'unsafe-inline': the pages use style="" attributes
 * throughout, which nonces cannot cover (only 'unsafe-hashes' could), and CSS
 * injection is a far weaker primitive than script injection. Known, accepted
 * limitation.
 */

/**
 * CSP hash of the one executable inline script shared by the static content
 * pages (the footer year setter). Byte-exact over the script's inner text —
 * a regression test recomputes this from src/content/*.html, so editing that
 * script without updating this constant fails the suite rather than silently
 * breaking every content page.
 */
export const STATIC_PAGE_SCRIPT_HASH = "sha256-2b9aEsGoW+i1nvgQ64wDYlonyJohtTsdobHJ2V8C6hY=";

function headersWithScriptSrc(scriptSrc: string): Record<string, string> {
  return {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "interest-cohort=()",
    "content-security-policy":
      `default-src 'none'; script-src ${scriptSrc}; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'`,
  };
}

/** Strictest variant: no script execution at all. */
export function securityHeaders(): Record<string, string> {
  return headersWithScriptSrc("'none'");
}

/** For the KV-served content pages (shared footer-year script only). */
export function staticPageHeaders(): Record<string, string> {
  return headersWithScriptSrc(`'${STATIC_PAGE_SCRIPT_HASH}'`);
}

/** Per-response nonce for Worker-generated pages with inline scripts. */
export function newScriptNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/** For Worker-generated HTML; every <script> tag must carry this nonce. */
export function noncedHeaders(nonce: string): Record<string, string> {
  return headersWithScriptSrc(`'nonce-${nonce}'`);
}

/**
 * Stamp the nonce onto every <script> tag (opening tags only; also hits
 * JSON-LD data blocks, where the attribute is ignored — harmless). Safe as a
 * blanket rewrite because all user-controlled content is HTML-escaped before
 * it reaches a template, so no literal "<script" can originate from input.
 */
export function injectScriptNonce(html: string, nonce: string): string {
  return html.replace(/<script(?=[\s>])/g, `<script nonce="${nonce}"`);
}

/**
 * Headers for pages that carry a credential in the URL or in the page body
 * (/setup, /edit). Adds no-referrer so a magic-link or backup token in the
 * query string is never leaked in a Referer header.
 */
export function secretPageHeaders(nonce: string): Record<string, string> {
  return {
    ...noncedHeaders(nonce),
    "referrer-policy": "no-referrer",
  };
}
