import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createTestRequest,
  clearAllTestData,
  createMockProfile,
  createLoginSession,
  withAdminAuth,
  withAdminSession,
  withAdminSessionAndCsrf,
  getKVJson,
  setKV,
} from './helpers';

import { canonicalizeUrl, buildProfile } from '../src/domain/profile';
import { validateProfileUrl, parseGitHubProfile, stripQueryAndFragment, profilePageHasUuidMarker, urlReflectsProofUuid } from '../src/claims/verify';
import { claimsKey, upsertClaim } from '../src/claims/store';
import { clampKvTtl, kvTtlFromEnv, intFromEnv } from '../src/env';
import { emailIndexHash, legacyEmailHash, lookupEmailUuid, emailPointerKey, deletedTombstoneKey } from '../src/email-index';

/**
 * Regression tests for the security audit fixes.
 *
 * Each block names the flaw it locks down so a future refactor that reopens it
 * fails loudly rather than silently republishing bad data.
 */

// ------------------------------------------------------------------
// P1.3 — canonicalizeUrl scheme allow-list
// ------------------------------------------------------------------
describe('canonicalizeUrl scheme handling', () => {
  it('rejects non-http(s) schemes', () => {
    // `u.protocol = "https:"` is a no-op for non-special schemes, so these
    // used to pass through untouched and land in published JSON-LD.
    expect(canonicalizeUrl('javascript:alert(1)')).toBeNull();
    expect(canonicalizeUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(canonicalizeUrl('vbscript:msgbox(1)')).toBeNull();
    expect(canonicalizeUrl('file:///etc/passwd')).toBeNull();
    expect(canonicalizeUrl('blob:https://example.com/abc')).toBeNull();
  });

  it('rejects other special schemes rather than silently rewriting them', () => {
    // ftp://example.com/x used to become https://example.com/x — a different
    // identity than the one asserted.
    expect(canonicalizeUrl('ftp://example.com/x')).toBeNull();
  });

  it('upgrades http to https', () => {
    expect(canonicalizeUrl('http://example.com/about')).toBe('https://example.com/about');
  });

  it('strips embedded credentials', () => {
    const out = canonicalizeUrl('https://user:pass@example.com/');
    expect(out).toBe('https://example.com');
    expect(out).not.toContain('user');
    expect(out).not.toContain('pass');
  });

  it('still canonicalizes ordinary URLs', () => {
    expect(canonicalizeUrl('https://EXAMPLE.com/path/#frag')).toBe('https://example.com/path');
  });
});

describe('published profile rejects dangerous URLs end-to-end', () => {
  beforeEach(async () => { await clearAllTestData(); });
  afterEach(async () => { await clearAllTestData(); });

  it('does not publish a javascript: sameAs via /update', async () => {
    const uuid = crypto.randomUUID();
    await createMockProfile({ uuid, name: 'Test' });
    const token = await createLoginSession(uuid);
    const csrf = 'regression-csrf-token';

    const res = await SELF.fetch(createTestRequest('https://anchorid.net/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `anchor_csrf=${csrf}`,
      },
      body: JSON.stringify({
        token,
        _csrf: csrf,
        patch: { sameAs: ['javascript:alert(1)', 'https://good.example.com'] },
      }),
      ip: '198.51.100.10',
    }));

    expect(res.status).toBe(200);

    const resolved = await SELF.fetch(
      createTestRequest(`https://anchorid.net/resolve/${uuid}`, { ip: '198.51.100.11' })
    );
    const text = await resolved.text();
    expect(text).not.toContain('javascript:');
    expect(text).toContain('https://good.example.com');
  });
});

// ------------------------------------------------------------------
// P2.2 — self-links must not reach the published sameAs
// ------------------------------------------------------------------
describe('sameAs self-link filtering', () => {
  it('drops anchorid.net links from the published (effective) sameAs', () => {
    const uuid = '11111111-1111-4111-8111-111111111111';
    const other = '22222222-2222-4222-8222-222222222222';

    const { effectiveSameAs } = buildProfile(
      uuid,
      null,
      { sameAs: [`https://anchorid.net/resolve/${other}`, 'https://example.com'] },
      [`https://anchorid.net/resolve/${other}`]
    );

    // Claiming another AnchorID as "the same entity" is exactly the identity
    // confusion the filter exists to prevent.
    expect(effectiveSameAs).not.toContain(`https://anchorid.net/resolve/${other}`);
    expect(effectiveSameAs).toContain('https://example.com');
  });
});

// ------------------------------------------------------------------
// P3 — dateModified must advance on a real edit, and only then
// ------------------------------------------------------------------
describe('dateModified timestamp policy', () => {
  const uuid = '33333333-3333-4333-8333-333333333333';

  it('advances dateModified when a field actually changes', () => {
    const stored = buildProfile(uuid, null, { name: 'Original' }).profile as any;
    stored.dateModified = '2020-01-01T00:00:00.000Z';
    stored.dateCreated = '2020-01-01T00:00:00.000Z';

    const { profile, changed } = buildProfile(uuid, stored, { name: 'Changed' });

    expect(changed).toBe(true);
    expect((profile as any).dateModified).not.toBe('2020-01-01T00:00:00.000Z');
    // dateCreated is immutable
    expect((profile as any).dateCreated).toBe('2020-01-01T00:00:00.000Z');
  });

  it('leaves dateModified alone on a no-op save, including private metadata', () => {
    const base = buildProfile(uuid, null, { name: 'Stable' }).profile as any;
    base.dateModified = '2020-01-01T00:00:00.000Z';
    base.dateCreated = '2020-01-01T00:00:00.000Z';
    // Private fields live on the stored record but never on the canonical
    // candidate; if they aren't excluded from the diff every save looks changed.
    base._emailHash = 'abc123';
    base._backupTokenHash = 'def456';
    base._emailVerified = true;

    const { profile, changed } = buildProfile(uuid, base, { name: 'Stable' });

    expect(changed).toBe(false);
    expect((profile as any).dateModified).toBe('2020-01-01T00:00:00.000Z');
  });
});

// ------------------------------------------------------------------
// P2.1 — SSRF guard
// ------------------------------------------------------------------
describe('validateProfileUrl SSRF guard', () => {
  const blocked = [
    'https://localhost/x',
    'https://127.0.0.1/x',
    'https://127.0.0.2/x',
    'https://10.0.0.5/x',
    'https://192.168.1.1/x',
    'https://172.16.0.1/x',
    'https://172.31.255.255/x',
    'https://169.254.169.254/latest/meta-data/',
    'https://metadata.google.internal/computeMetadata/v1/',
    'https://100.64.0.1/x',          // CGNAT
    'https://192.0.0.1/x',           // protocol assignments
    'https://198.18.0.1/x',          // benchmarking
    'https://0.0.0.0/x',
    'https://[::1]/x',               // IPv6 loopback
    'https://[::ffff:127.0.0.1]/x',  // IPv4-mapped loopback
    'https://[fd00::1]/x',           // unique local
    'https://[fe80::1]/x',           // link-local
    'https://jenkins.internal/x',
    'https://printer.local/x',
    'https://intranet/x',            // bare hostname
    'https://2130706433/x',          // decimal-encoded 127.0.0.1
    'https://0177.0.0.1/x',          // octal-encoded 127.0.0.1
    'http://example.com/x',          // must be https

    // Trailing-dot (fully-qualified) forms. url.hostname keeps the root label
    // for named hosts, so these slipped past the suffix denylist and the
    // exact-match checks while resolving to the same host.
    'https://localhost./x',
    'https://metadata.google.internal./x',
    'https://jenkins.internal./x',
    'https://printer.local./x',
    'https://intranet./x',
    'https://127.0.0.1./x',
    'https://169.254.169.254./x',
    'https://10.0.0.1../x',
  ];

  for (const url of blocked) {
    it(`blocks ${url}`, () => {
      expect(validateProfileUrl(url).ok).toBe(false);
    });
  }

  it('allows an ordinary public https URL', () => {
    expect(validateProfileUrl('https://noauthority.social/@mycal').ok).toBe(true);
  });
});

// ------------------------------------------------------------------
// P1.4 — GitHub proof must be tied to github.com
// ------------------------------------------------------------------
describe('GitHub claim host validation', () => {
  it('rejects a profile URL on a non-github host', () => {
    // The proof is fetched from raw.githubusercontent.com/<name>/..., so
    // accepting any host published a verified sameAs for a domain the
    // claimant does not control.
    expect(parseGitHubProfile('https://bank.example.com/attacker')).toBeNull();
  });

  it('rejects deep links and invalid usernames', () => {
    expect(parseGitHubProfile('https://github.com/user/repo')).toBeNull();
    expect(parseGitHubProfile('https://github.com/')).toBeNull();
    expect(parseGitHubProfile('https://github.com/-bad-')).toBeNull();
  });

  it('accepts a real profile URL and canonicalizes it', () => {
    expect(parseGitHubProfile('https://github.com/LowerPower')).toEqual({
      user: 'lowerpower',
      canonicalUrl: 'https://github.com/lowerpower',
    });
    expect(parseGitHubProfile('https://www.github.com/lowerpower')?.canonicalUrl)
      .toBe('https://github.com/lowerpower');
  });

  it('returns 400 for a github claim on another host', async () => {
    await clearAllTestData();
    const uuid = crypto.randomUUID();
    await createMockProfile({ uuid });

    const res = await SELF.fetch(createTestRequest('https://anchorid.net/claim', {
      method: 'POST',
      headers: withAdminAuth(env, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ uuid, type: 'github', url: 'https://bank.example.com/someuser' }),
      ip: '198.51.100.20',
    }));

    expect(res.status).toBe(400);
    await clearAllTestData();
  });
});

// ------------------------------------------------------------------
// P1.5 — public profile proof scope
// ------------------------------------------------------------------
describe('public profile proof URL scope', () => {
  it('strips query and fragment', () => {
    // A retained query let any site that reflects a parameter "prove" a claim.
    expect(stripQueryAndFragment('https://victim.example/search?q=https://anchorid.net/resolve/x'))
      .toBe('https://victim.example/search');
    expect(stripQueryAndFragment('https://example.com/@me#bio')).toBe('https://example.com/@me');
  });

  it('stores the stripped URL on the claim', async () => {
    await clearAllTestData();
    const uuid = crypto.randomUUID();
    await createMockProfile({ uuid });

    const res = await SELF.fetch(createTestRequest('https://anchorid.net/claim', {
      method: 'POST',
      headers: withAdminAuth(env, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        uuid,
        type: 'public',
        url: `https://example.com/search?q=https://anchorid.net/resolve/${uuid}`,
      }),
      ip: '198.51.100.21',
    }));

    expect(res.ok).toBe(true);

    const claims = await getKVJson(`claims:${uuid}`);
    expect(claims[0].proof.url).toBe('https://example.com/search');
    expect(claims[0].proof.url).not.toContain('?');
    await clearAllTestData();
  });
});

describe('public profile proof UUID markers', () => {
  const uuid = '4ff7ed97-b78f-4ae6-9011-5af714ee241c';
  const mustContain = `https://anchorid.net/resolve/${uuid}`;

  it('accepts the documented short URL, with or without scheme', () => {
    // /privacy, /proofs and /proofs-social all document anchorid.net/<uuid>
    // as an accepted proof form — tightening the bare-UUID match must not
    // break it.
    expect(profilePageHasUuidMarker(mustContain, `bio: https://anchorid.net/${uuid}`)).toBe(true);
    expect(profilePageHasUuidMarker(mustContain, `bio: anchorid.net/${uuid}`)).toBe(true);
    expect(profilePageHasUuidMarker(mustContain, `AnchorID.net/${uuid.toUpperCase()}`)).toBe(true);
  });

  it('accepts the deliberate marker forms', () => {
    expect(profilePageHasUuidMarker(mustContain, `urn:uuid:${uuid}`)).toBe(true);
    expect(profilePageHasUuidMarker(mustContain, `anchorid=${uuid}`)).toBe(true);
    expect(profilePageHasUuidMarker(mustContain, `anchorid:${uuid}`)).toBe(true);
    // The documented forum-signature format has a space after the colon.
    expect(profilePageHasUuidMarker(mustContain, `AnchorID: ${uuid}`)).toBe(true);
  });

  it('accepts the compact aid: form', () => {
    expect(profilePageHasUuidMarker(mustContain, `aid:${uuid}`)).toBe(true);
    expect(profilePageHasUuidMarker(mustContain, `bio text Aid: ${uuid} more text`)).toBe(true);
    // "aid" embedded in another word is not a marker.
    expect(profilePageHasUuidMarker(mustContain, `paid:${uuid}`)).toBe(false);
    expect(profilePageHasUuidMarker(mustContain, `said:${uuid}`)).toBe(false);
  });

  it('still rejects a bare UUID with no marker', () => {
    // A page merely mentioning the UUID (a comment, a paste, a log line) is
    // not a claim of ownership.
    expect(profilePageHasUuidMarker(mustContain, `random mention of ${uuid} in text`)).toBe(false);
    expect(profilePageHasUuidMarker(mustContain, 'no uuid here at all')).toBe(false);
  });

  it('rejects a proof URL that itself carries the marker', () => {
    // An echo service reflecting its request path would "contain" any marker
    // we put in the URL, so the marker must come from page content instead.
    expect(urlReflectsProofUuid(`https://echo.example/anything/anchorid.net/${uuid}`, mustContain)).toBe(true);
    expect(urlReflectsProofUuid(`https://echo.example/x/https://anchorid.net/resolve/${uuid}`, mustContain)).toBe(true);
    // Percent-encoded UUID in the path must not slip through.
    expect(urlReflectsProofUuid(`https://echo.example/%34ff7ed97-b78f-4ae6-9011-5af714ee241c`, mustContain)).toBe(true);
    // An ordinary profile URL is unaffected.
    expect(urlReflectsProofUuid('https://noauthority.social/@mycal', mustContain)).toBe(false);
  });
});

// ------------------------------------------------------------------
// P2.4 — malformed JSON must be a 400, not an unhandled throw
// ------------------------------------------------------------------
describe('malformed JSON handling on claim routes', () => {
  beforeEach(async () => { await clearAllTestData(); });
  afterEach(async () => { await clearAllTestData(); });

  for (const path of ['/claim', '/claim/verify', '/claim/delete']) {
    it(`returns 4xx (not 500) for malformed JSON on ${path}`, async () => {
      const res = await SELF.fetch(createTestRequest(`https://anchorid.net${path}`, {
        method: 'POST',
        headers: withAdminAuth(env, { 'Content-Type': 'application/json' }),
        body: 'not valid json {',
        ip: '198.51.100.30',
      }));

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  }
});

// ------------------------------------------------------------------
// P3 — UUID case must not split the claims key space
// ------------------------------------------------------------------
describe('claims key normalization', () => {
  it('lowercases the KV key', () => {
    expect(claimsKey('ABCD-EF')).toBe('claims:abcd-ef');
  });

  it('a claim posted with an uppercase UUID is visible to the resolver', async () => {
    await clearAllTestData();
    const uuid = crypto.randomUUID().toLowerCase();
    await createMockProfile({ uuid });

    const res = await SELF.fetch(createTestRequest('https://anchorid.net/claim', {
      method: 'POST',
      headers: withAdminAuth(env, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ uuid: uuid.toUpperCase(), type: 'website', url: 'https://example.com' }),
      ip: '198.51.100.40',
    }));
    expect(res.ok).toBe(true);

    // Written under the lowercase key, which is the one /resolve reads.
    const claims = await getKVJson(`claims:${uuid}`);
    expect(claims).toBeTruthy();
    expect(claims.length).toBe(1);
    await clearAllTestData();
  });
});

// ------------------------------------------------------------------
// P3 — re-asserting a claim must clear stale verification metadata
// ------------------------------------------------------------------
describe('upsertClaim stale metadata', () => {
  it('clears verifiedAt when a claim is reset to self_asserted', () => {
    const existing: any = {
      id: 'website:example.com',
      type: 'website',
      url: 'https://example.com',
      status: 'verified',
      proof: { kind: 'well_known', url: 'https://example.com/.well-known/anchorid.txt', mustContain: 'x' },
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
      verifiedAt: '2020-01-02T00:00:00.000Z',
      failReason: 'previous_failure',
    };

    const reasserted: any = {
      id: 'website:example.com',
      type: 'website',
      url: 'https://example.com',
      status: 'self_asserted',
      proof: existing.proof,
      createdAt: '2021-01-01T00:00:00.000Z',
      updatedAt: '2021-01-01T00:00:00.000Z',
    };

    const [merged] = upsertClaim([existing], reasserted);
    expect(merged.status).toBe('self_asserted');
    // A self_asserted claim must not advertise a verifiedAt on the public ledger.
    expect(merged.verifiedAt).toBeUndefined();
    expect(merged.failReason).toBeUndefined();
  });
});

// ------------------------------------------------------------------
// P2.3 — security headers on secret-bearing pages
// ------------------------------------------------------------------
describe('security headers', () => {
  beforeEach(async () => { await clearAllTestData(); });
  afterEach(async () => { await clearAllTestData(); });

  it('sets CSP and X-Frame-Options on the token-bearing /edit page', async () => {
    const uuid = crypto.randomUUID();
    await createMockProfile({ uuid });
    const token = await createLoginSession(uuid);

    const res = await SELF.fetch(createTestRequest(
      `https://anchorid.net/edit?token=${token}`,
      { ip: '198.51.100.50' }
    ));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toBeTruthy();
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    // The token is in the URL, so it must never leave in a Referer.
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('sets CSP and X-Frame-Options on admin pages', async () => {
    const res = await SELF.fetch(createTestRequest('https://anchorid.net/admin', {
      headers: await withAdminSession(),
      redirect: 'manual',
      ip: '198.51.100.51',
    }));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toBeTruthy();
    expect(res.headers.get('x-frame-options')).toBe('DENY');
  });

  it('sets CSP on the /login and /create pages', async () => {
    for (const path of ['/login', '/create']) {
      const res = await SELF.fetch(createTestRequest(`https://anchorid.net${path}`, {
        ip: '198.51.100.52',
      }));
      expect(res.headers.get('content-security-policy')).toBeTruthy();
      expect(res.headers.get('x-frame-options')).toBe('DENY');
    }
  });
});

// ------------------------------------------------------------------
// KV TTL floor — a sub-minimum TTL must not throw on the request path
// ------------------------------------------------------------------
describe('KV TTL clamping', () => {
  it('documents the constraint: KV rejects expirationTtl below 60', async () => {
    await expect(
      env.ANCHOR_KV.put('ttlprobe:low', 'x', { expirationTtl: 30 })
    ).rejects.toThrow(/at least 60/i);
  });

  it('clamps sub-minimum values instead of passing them through', () => {
    expect(clampKvTtl(1)).toBe(60);
    expect(clampKvTtl(59)).toBe(60);
    expect(clampKvTtl(60)).toBe(60);
    expect(clampKvTtl(3600)).toBe(3600);
  });

  it('kvTtlFromEnv clamps a misconfigured value rather than throwing later', () => {
    // ADMIN_SESSION_TTL_SECONDS=30 would otherwise make the session put throw
    // and turn every valid admin login into a 500.
    expect(kvTtlFromEnv('30', 43200)).toBe(60);
    expect(kvTtlFromEnv('1', 43200)).toBe(60);
    // Unset / malformed / non-positive fall back to the default.
    expect(kvTtlFromEnv(undefined, 43200)).toBe(43200);
    expect(kvTtlFromEnv('not-a-number', 900)).toBe(900);
    expect(kvTtlFromEnv('0', 900)).toBe(900);
    expect(kvTtlFromEnv('-5', 900)).toBe(900);
    // Valid values pass through.
    expect(kvTtlFromEnv('7200', 43200)).toBe(7200);
  });

  it('a sub-minimum TTL written through the clamp is accepted by KV', async () => {
    await expect(
      env.ANCHOR_KV.put('ttlprobe:clamped', 'x', { expirationTtl: clampKvTtl(30) })
    ).resolves.toBeUndefined();
  });

  it('intFromEnv keeps 0 meaningful for rate limits but rejects NaN', () => {
    expect(intFromEnv('0', 30)).toBe(0);
    expect(intFromEnv('bogus', 30)).toBe(30);
    expect(intFromEnv(undefined, 30)).toBe(30);
    expect(intFromEnv('15', 30)).toBe(15);
  });
});

// ------------------------------------------------------------------
// P1.1 / P1.2 — admin secret must not be reachable from the page
// ------------------------------------------------------------------
describe('admin secret exposure', () => {
  beforeEach(async () => { await clearAllTestData(); });
  afterEach(async () => { await clearAllTestData(); });

  it('does not render the admin secret into the admin edit page', async () => {
    const uuid = crypto.randomUUID();
    await createMockProfile({ uuid, name: 'Test Profile' });

    const res = await SELF.fetch(createTestRequest(`https://anchorid.net/admin/edit/${uuid}`, {
      headers: await withAdminSession(),
      redirect: 'manual',
      ip: '198.51.100.60',
    }));

    expect(res.status).toBe(200);
    const html = await res.text();
    const secret = env.ANCHOR_ADMIN_SECRET || env.ANCHOR_ADMIN_TOKEN;
    expect(secret).toBeTruthy();
    expect(html).not.toContain(secret as string);
    expect(html).not.toContain('adminToken');
  });

  it('rejects a session issued against a different (rotated) admin secret', async () => {
    // Under the old cookie-as-secret scheme, rotating ANCHOR_ADMIN_SECRET
    // invalidated every cookie instantly. Opaque sessions must preserve that
    // property, or rotating after a suspected exposure leaves the attacker
    // logged in until the TTL expires.
    const staleToken = `test-stale-session-${crypto.randomUUID()}`;
    await setKV(
      `adminsess:${staleToken}`,
      JSON.stringify({
        createdAt: new Date().toISOString(),
        secret: 'fingerprint-of-a-previous-secret',
      }),
      3600
    );

    const res = await SELF.fetch(createTestRequest('https://anchorid.net/admin', {
      headers: { Cookie: `anchor_admin=${staleToken}` },
      redirect: 'manual',
      ip: '198.51.100.62',
    }));

    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toContain('/admin/login');
  });

  it('rejects a session record with no secret binding at all', async () => {
    const legacyToken = `test-legacy-session-${crypto.randomUUID()}`;
    await setKV(
      `adminsess:${legacyToken}`,
      JSON.stringify({ createdAt: new Date().toISOString() }),
      3600
    );

    const res = await SELF.fetch(createTestRequest('https://anchorid.net/admin', {
      headers: { Cookie: `anchor_admin=${legacyToken}` },
      redirect: 'manual',
      ip: '198.51.100.63',
    }));

    expect(res.status).toBe(303);
  });

  it('does not place a profile name inside an inline event-handler attribute', async () => {
    const uuid = crypto.randomUUID();
    // An apostrophe is the payload: escapeHtml turns it into &#39;, which the
    // HTML parser decodes back to ' before the attribute's JS is parsed.
    const hostileName = "x');window.__pwned=1;//";
    await createMockProfile({ uuid, name: hostileName });

    const res = await SELF.fetch(createTestRequest(`https://anchorid.net/admin/edit/${uuid}`, {
      headers: await withAdminSession(),
      redirect: 'manual',
      ip: '198.51.100.61',
    }));

    const html = await res.text();

    // No inline handler carrying interpolated data.
    expect(html).not.toContain('onsubmit="return confirm(');

    // The breakout sequence must never appear unescaped. The name may appear
    // in a data- attribute, but only with the apostrophe entity-encoded —
    // there it is read back via getAttribute() as a string, never parsed as JS.
    expect(html).not.toContain("x');");
    expect(html).toContain('data-profile-name="x&#039;);window.__pwned=1;//"');
  });
});

// ------------------------------------------------------------------
// Peppered email index (EMAIL_PEPPER) with lazy legacy migration
// ------------------------------------------------------------------
describe('peppered email index', () => {
  beforeEach(async () => { await clearAllTestData(); });
  afterEach(async () => { await clearAllTestData(); });

  const email = 'pepper-test@example.com';

  it('uses HMAC (not bare sha256) when the pepper is set', async () => {
    const peppered = await emailIndexHash(env as any, email);
    const legacy = await legacyEmailHash(email);
    expect(peppered).not.toBe(legacy);
    expect(peppered).toMatch(/^[0-9a-f]{64}$/);
  });

  it('falls back to bare sha256 when no pepper is configured', async () => {
    const noPepperEnv = { ...(env as any), EMAIL_PEPPER: undefined };
    expect(await emailIndexHash(noPepperEnv, email)).toBe(await legacyEmailHash(email));
  });

  it('migrates a legacy sha256 key in place on lookup', async () => {
    // createMockProfile indexes the email under the legacy bare-sha256 key —
    // exactly the state of a pre-migration production profile.
    const { uuid, emailHash: legacyHash } = await createMockProfile({ email });
    expect(await env.ANCHOR_KV.get(`email:${legacyHash}`)).toBe(uuid);

    const { uuid: found, hash } = await lookupEmailUuid(env as any, email);

    expect(found).toBe(uuid);
    expect(hash).not.toBe(legacyHash);
    // New key written, pointer records the current hash, legacy key deleted.
    // The profile document must NOT be rewritten: a stale read on the login
    // path written back would revert concurrent profile edits.
    expect(await env.ANCHOR_KV.get(`email:${hash}`)).toBe(uuid);
    expect(await env.ANCHOR_KV.get(emailPointerKey(uuid))).toBe(hash);
    expect(await env.ANCHOR_KV.get(`email:${legacyHash}`)).toBeNull();
    const profile = await getKVJson(`profile:${uuid}`);
    expect(profile._emailHash).toBe(legacyHash);
  });

  it('login through a legacy key succeeds and migrates it', async () => {
    const { uuid, emailHash: legacyHash } = await createMockProfile({ email });

    const res = await SELF.fetch(createTestRequest('https://anchorid.net/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
      ip: '198.51.100.70',
    }));
    expect(res.status).toBe(200);

    const peppered = await emailIndexHash(env as any, email);
    expect(await env.ANCHOR_KV.get(`email:${peppered}`)).toBe(uuid);
    expect(await env.ANCHOR_KV.get(emailPointerKey(uuid))).toBe(peppered);
    expect(await env.ANCHOR_KV.get(`email:${legacyHash}`)).toBeNull();
  });

  it('profile deletion cleans up a migrated (pointer-indexed) email key', async () => {
    // After migration the live index key diverges from the frozen
    // _emailHash. Deletion must remove the key named by the pointer, or the
    // orphaned peppered mapping would block the email from re-registering.
    const { uuid } = await createMockProfile({ email });
    await lookupEmailUuid(env as any, email); // migrate
    const peppered = await emailIndexHash(env as any, email);
    expect(await env.ANCHOR_KV.get(`email:${peppered}`)).toBe(uuid);

    const { headers, csrfToken } = await withAdminSessionAndCsrf();
    const fd = new FormData();
    fd.append('_csrf', csrfToken);
    const res = await SELF.fetch(createTestRequest(`https://anchorid.net/admin/delete/${uuid}`, {
      method: 'POST',
      headers,
      body: fd,
      redirect: 'manual',
      ip: '198.51.100.72',
    }));

    expect(res.status).toBe(303);
    expect(await env.ANCHOR_KV.get(`profile:${uuid}`)).toBeNull();
    expect(await env.ANCHOR_KV.get(`email:${peppered}`)).toBeNull();
    expect(await env.ANCHOR_KV.get(emailPointerKey(uuid))).toBeNull();
  });

  it('reconciles a migration interrupted before the pointer write', async () => {
    // Termination right after the peppered key was written: both index keys
    // exist, no pointer. Reconcile must record the pointer (so deletion can
    // find the peppered key) and clear the legacy key — without ever writing
    // the profile document.
    const { uuid, emailHash: legacyHash } = await createMockProfile({ email });
    const peppered = await emailIndexHash(env as any, email);
    await env.ANCHOR_KV.put(`email:${peppered}`, uuid);

    const { uuid: found, hash } = await lookupEmailUuid(env as any, email);

    expect(found).toBe(uuid);
    expect(hash).toBe(peppered);
    expect(await env.ANCHOR_KV.get(emailPointerKey(uuid))).toBe(peppered);
    expect(await env.ANCHOR_KV.get(`email:${legacyHash}`)).toBeNull();
    const profile = await getKVJson(`profile:${uuid}`);
    expect(profile._emailHash).toBe(legacyHash); // untouched
  });

  it('reconciles a migration interrupted before the legacy delete', async () => {
    // Termination after the pointer write: pointer already current but the
    // reversible legacy key lingers. Reconcile must clear it.
    const { uuid, emailHash: legacyHash } = await createMockProfile({ email });
    const peppered = await emailIndexHash(env as any, email);
    await env.ANCHOR_KV.put(`email:${peppered}`, uuid);
    await env.ANCHOR_KV.put(emailPointerKey(uuid), peppered);

    const { uuid: found } = await lookupEmailUuid(env as any, email);

    expect(found).toBe(uuid);
    expect(await env.ANCHOR_KV.get(`email:${legacyHash}`)).toBeNull();
    expect(await env.ANCHOR_KV.get(emailPointerKey(uuid))).toBe(peppered);
  });

  it('never deletes a primary mapping on a missing-profile read', async () => {
    // With eventual consistency, signup's independent profile/mapping writes
    // mean a reader can see the mapping before the profile. Deleting on a
    // single cross-key miss would free the email for a duplicate signup —
    // the lookup must fail safe and report the mapping as-is.
    const ghostUuid = crypto.randomUUID();
    const peppered = await emailIndexHash(env as any, email);
    await env.ANCHOR_KV.put(`email:${peppered}`, ghostUuid);
    // No profile:<ghostUuid> visible (propagation lag or genuine orphan).

    const { uuid: found } = await lookupEmailUuid(env as any, email);
    expect(found).toBe(ghostUuid);
    expect(await env.ANCHOR_KV.get(`email:${peppered}`)).toBe(ghostUuid);
  });

  it('fails closed on a legacy mapping whose profile is not visible', async () => {
    // During pepper activation, a just-completed signup's legacy mapping can
    // be visible while its profile is still propagating. Returning "no
    // match" would let a duplicate signup take over the email — the lookup
    // must report the mapping (under its actual legacy hash) instead.
    const ghostUuid = crypto.randomUUID();
    const legacy = await legacyEmailHash(email);
    await env.ANCHOR_KV.put(`email:${legacy}`, ghostUuid);

    const { uuid: found, hash } = await lookupEmailUuid(env as any, email);
    expect(found).toBe(ghostUuid);
    expect(hash).toBe(legacy);
    expect(await env.ANCHOR_KV.get(`email:${legacy}`)).toBe(ghostUuid);
  });

  it('does not reconcile a mismatched _emailHash that is not this email\'s legacy hash', async () => {
    // A profile can legitimately carry mappings for two emails (admin email
    // update leaves the prior email's key). Looking up via the older email
    // must not demote the newer _emailHash or delete its mapping.
    const { uuid } = await createMockProfile({ email });
    const otherHash = 'f'.repeat(64); // stands in for a different email's hash
    const profile = await getKVJson(`profile:${uuid}`);
    profile._emailHash = otherHash;
    await env.ANCHOR_KV.put(`profile:${uuid}`, JSON.stringify(profile));
    await env.ANCHOR_KV.put(`email:${otherHash}`, uuid);
    const peppered = await emailIndexHash(env as any, email);
    await env.ANCHOR_KV.put(`email:${peppered}`, uuid);

    const { uuid: found } = await lookupEmailUuid(env as any, email);

    expect(found).toBe(uuid);
    const after = await getKVJson(`profile:${uuid}`);
    expect(after._emailHash).toBe(otherHash);
    expect(await env.ANCHOR_KV.get(`email:${otherHash}`)).toBe(uuid);
  });

  it('treats a mapping to a tombstoned uuid as no match and clears it', async () => {
    // A deletion/migration race can leave a mapping pointing at a deleted
    // uuid. The tombstone (written first by every deletion flow, and
    // permanent — uuids are never reused) makes the staleness decidable, so
    // the mapping is safely cleared and the email can register again.
    const deadUuid = crypto.randomUUID();
    await env.ANCHOR_KV.put(deletedTombstoneKey(deadUuid), new Date().toISOString());

    const peppered = await emailIndexHash(env as any, email);
    await env.ANCHOR_KV.put(`email:${peppered}`, deadUuid);
    const first = await lookupEmailUuid(env as any, email);
    expect(first.uuid).toBeNull();
    expect(await env.ANCHOR_KV.get(`email:${peppered}`)).toBeNull();

    // Same for a legacy mapping.
    const legacy = await legacyEmailHash(email);
    await env.ANCHOR_KV.put(`email:${legacy}`, deadUuid);
    const second = await lookupEmailUuid(env as any, email);
    expect(second.uuid).toBeNull();
    expect(await env.ANCHOR_KV.get(`email:${legacy}`)).toBeNull();
  });

  it('deletion derives both index hashes from the stored plaintext email', async () => {
    // The pointer read during deletion is eventually consistent and can miss
    // a fresh migration. Deletable profiles are < 7 days old, so the
    // plaintext email is still in KV — cleanup must find the peppered key
    // through it even when the pointer is not visible.
    const { uuid } = await createMockProfile({ email });
    await env.ANCHOR_KV.put(`email:unhashed:${uuid}`, email);
    await lookupEmailUuid(env as any, email); // migrate
    const peppered = await emailIndexHash(env as any, email);
    expect(await env.ANCHOR_KV.get(`email:${peppered}`)).toBe(uuid);
    // Simulate the stale pointer read: the pointer write hasn't propagated.
    await env.ANCHOR_KV.delete(emailPointerKey(uuid));

    const { headers, csrfToken } = await withAdminSessionAndCsrf();
    const fd = new FormData();
    fd.append('_csrf', csrfToken);
    const res = await SELF.fetch(createTestRequest(`https://anchorid.net/admin/delete/${uuid}`, {
      method: 'POST',
      headers,
      body: fd,
      redirect: 'manual',
      ip: '198.51.100.73',
    }));

    expect(res.status).toBe(303);
    expect(await env.ANCHOR_KV.get(`email:${peppered}`)).toBeNull();
    // Tombstone written, permanently marking the uuid dead.
    expect(await env.ANCHOR_KV.get(deletedTombstoneKey(uuid))).toBeTruthy();
  });

  it('signup dup-check catches an email still indexed under a legacy key', async () => {
    const { uuid } = await createMockProfile({ email });

    const csrf = 'pepper-signup-csrf';
    const fd = new FormData();
    fd.append('email', email);
    fd.append('name', 'Dup Attempt');
    fd.append('_csrf', csrf);
    const res = await SELF.fetch(createTestRequest('https://anchorid.net/create', {
      method: 'POST',
      headers: { 'Cookie': `anchor_csrf=${csrf}` },
      body: fd,
      ip: '198.51.100.71',
    }));

    // Anti-oracle: same 200 as a real signup — but no second profile may be
    // created; the (now migrated) index must still point at the original.
    expect(res.status).toBe(200);
    const peppered = await emailIndexHash(env as any, email);
    expect(await env.ANCHOR_KV.get(`email:${peppered}`)).toBe(uuid);
  });
});
