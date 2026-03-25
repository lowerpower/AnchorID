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

/**
 * Profile canonicalization and merge rules.
 * Supports both Person and Organization types.
 */

type ISO8601UTC = string;

export type EntityType = "Person" | "Organization";

export type WebPageRef = {
  "@type": "WebPage";
  "@id": string;
  url: string;
  name?: string;
};

export type WebSiteRef = {
  "@type": "WebSite";
  "@id": string;
  url: string;
  name: string;
};

export type PropertyValue = {
  "@type": "PropertyValue";
  propertyID: "canonical-uuid";
  value: string; // "urn:uuid:<uuid>"
};

// Reference to another AnchorID entity (for founder/affiliation)
export type EntityRef = {
  "@id": string;
};

// Base fields shared by Person and Organization
type BaseProfile = {
  "@context": "https://schema.org";
  "@id": string;
  identifier: PropertyValue;
  dateCreated: ISO8601UTC;
  dateModified: ISO8601UTC;
  name?: string;
  alternateName?: string[];
  description?: string;
  url?: string;
  sameAs?: string[];
  mainEntityOfPage: WebPageRef;
  subjectOf: WebPageRef;
  isPartOf: WebSiteRef;
};

export type PersonProfile = BaseProfile & {
  "@type": "Person";
  affiliation?: EntityRef[]; // References to Organization records
};

export type OrganizationProfile = BaseProfile & {
  "@type": "Organization";
  founder?: EntityRef[]; // References to Person records
  foundingDate?: string; // ISO 8601 date
};

// Union type for any AnchorID profile
export type AnchorProfile = PersonProfile | OrganizationProfile;

export type ProfileInput = {
  "@type"?: unknown; // "Person" or "Organization"
  name?: unknown;
  alternateName?: unknown; // accept string|string[]
  description?: unknown;
  url?: unknown;
  sameAs?: unknown; // accept string|string[]
  // Person-specific
  affiliation?: unknown; // accept string|string[] of UUIDs or resolve URLs
  // Organization-specific
  founder?: unknown; // accept string|string[] of UUIDs or resolve URLs
  foundingDate?: unknown;
};

export type BuildProfileOptions = {
  nowIso?: () => ISO8601UTC;

  /**
   * If true, the returned profile.sameAs will be the merged (manual ∪ verified) set
   * and can be persisted. If false, profile.sameAs stays "manual" and merge is for
   * resolve-time only.
   */
  persistMergedSameAs?: boolean;

  /**
   * If true, bump dateModified even if canonical result is a no-op.
   * Default false (nice optimization).
   */
  bumpOnNoop?: boolean;

  /**
   * If true, do not modify dateCreated/dateModified during a "read build"
   * (i.e., when input is null/undefined). This keeps /resolve stable even if
   * we recompute structured fields like mainEntityOfPage/subjectOf/isPartOf.
   */
  preserveStoredTimestampsOnRead?: boolean;

};

const DEFAULTS: Required<BuildProfileOptions> = {
  nowIso: () => new Date().toISOString(),
  persistMergedSameAs: false,
  bumpOnNoop: false,
  preserveStoredTimestampsOnRead: true,
};

const WEBSITE: WebSiteRef = {
  "@type": "WebSite",
  "@id": "https://anchorid.net/#website",
  url: "https://anchorid.net",
  name: "AnchorID",
};

function resolveUrl(uuid: string) {
  return `https://anchorid.net/resolve/${uuid}`;
}
function claimsUrl(uuid: string) {
  return `https://anchorid.net/claims/${uuid}`;
}

function isNonEmptyString(x: unknown): x is string {
  return typeof x === "string" && x.trim().length > 0;
}

function normalizeOptionalArray<T>(arr?: T[]): T[] | undefined {
  return arr && arr.length ? arr : undefined;
}


/**
 * Canonical URL normalization.
 * - Trim
 * - Parse with new URL
 * - Force https (upgrade)
 * - Lowercase hostname
 * - Remove fragment
 * - Remove default ports 80/443
 * - Remove trailing slash for root and non-root
 *
 * Returns canonical string or null if invalid.
 */
export function canonicalizeUrl(input: unknown): string | null {
  if (!isNonEmptyString(input)) return null;
  const raw = input.trim();

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }

  // Force https unless you explicitly choose to allow http.
  // Per spec: default upgrade to https.
  u.protocol = "https:";

  // Lowercase hostname
  u.hostname = u.hostname.toLowerCase();

  // Drop fragment
  u.hash = "";

  // Remove default ports
  if ((u.protocol === "https:" && u.port === "443") || (u.protocol === "http:" && u.port === "80")) {
    u.port = "";
  }

  // Normalize pathname:
  // - remove trailing slash always (including root), unless unavoidable (URL class makes root "/").
  // We'll produce "https://example.com" not "https://example.com/".
  // For non-root: "/path/" => "/path"
  let path = u.pathname || "/";
  if (path.length > 1) {
    path = path.replace(/\/+$/, ""); // remove one-or-more trailing slashes
    if (path.length === 0) path = "/";
  }

  // Root becomes empty in final string to get no trailing slash.
  if (path === "/") {
    u.pathname = "/";
  } else {
    u.pathname = path;
  }

  // If you want to drop query params, do it here.
  // Spec does not mandate it, so we keep query string as-is.

  const s = u.toString();

  // URL.toString() will include trailing "/" for root; strip it.
  // https://example.com/ -> https://example.com
  if (s.endsWith("/") && new URL(s).pathname === "/") {
    return s.slice(0, -1);
  }

  // Also strip trailing slash for non-root (URL.toString typically preserves our pathname)
  if (s.endsWith("/") && !new URL(s).pathname.endsWith("/")) {
    // unlikely branch, but keep safe
    return s.slice(0, -1);
  }

  return s;
}

export function canonicalizeUrlList(values: unknown): string[] {
  const arr: unknown[] = Array.isArray(values)
    ? values
    : isNonEmptyString(values)
      ? splitMultilineOrComma(values)
      : [];

  const canon: string[] = [];
  for (const v of arr) {
    const c = canonicalizeUrl(v);
    if (c) canon.push(c);
  }

  return dedupeAndSort(canon);
}

/** Accept "a,b" or multiline input into an array of strings (trimmed, drop empties). */
function splitMultilineOrComma(s: string): string[] {
  // Treat newline as strongest delimiter, then commas.
  const lines = s
    .split(/\r?\n/g)
    .flatMap((line) => line.split(","))
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
  return lines;
}

function canonicalizeString(value: unknown): string | undefined {
  if (!isNonEmptyString(value)) return undefined;
  const s = value.trim();
  return s.length ? s : undefined;
}

function canonicalizeStringArray(value: unknown): string[] | undefined {
  const arr: string[] = Array.isArray(value)
    ? value.filter((x) => typeof x === "string").map((x) => x.trim())
    : isNonEmptyString(value)
      ? splitMultilineOrComma(value)
      : [];

  const cleaned = arr.map((x) => x.trim()).filter((x) => x.length > 0);

  // Dedupe, preserve order (alternateName order can be meaningful)
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of cleaned) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out.length ? out : undefined;
}

function dedupeAndSort(urls: string[]): string[] {
  const set = new Set<string>();
  for (const u of urls) set.add(u);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/**
 * Merge sameAs:
 * - canonicalize both lists
 * - set-union
 * - dedupe/sort
 */
export function mergeSameAs(manual: unknown, verifiedUrls: unknown): string[] {
  const manualCanon = canonicalizeUrlList(manual);
  const verifiedCanon = canonicalizeUrlList(verifiedUrls);
  return dedupeAndSort([...manualCanon, ...verifiedCanon]);
}

/**
 * Deterministic deep-equal for our profile objects.
 * Assumes buildProfile returns stable ordering for arrays + fixed key shapes.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

/**
 * Stable stringify with sorted object keys.
 * Arrays preserve order (we already normalize them).
 */
function stableStringify(x: unknown): string {
  if (x === null || typeof x !== "object") return JSON.stringify(x);
  if (Array.isArray(x)) return `[${x.map(stableStringify).join(",")}]`;
  const obj = x as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",")}}`;
}

function buildRefs(uuid: string) {
  const res = resolveUrl(uuid);
  const clm = claimsUrl(uuid);

  const mainEntityOfPage: WebPageRef = {
    "@type": "WebPage",
    "@id": res,
    url: res,
  };

  const subjectOf: WebPageRef = {
    "@type": "WebPage",
    "@id": clm,
    url: clm,
    name: "AnchorID Claims",
  };

  return { mainEntityOfPage, subjectOf };
}

function buildIdentifier(uuid: string): PropertyValue {
  return {
    "@type": "PropertyValue",
    propertyID: "canonical-uuid",
    value: `urn:uuid:${uuid}`,
  };
}

function sanitizeSameAsForProfileStorage(urls: string[]): string[] | undefined {
  // sameAs should not include self-links to anchorid.net
  const filtered = urls.filter((u) => {
    try {
      return new URL(u).hostname !== "anchorid.net";
    } catch {
      return false;
    }
  });
  const out = dedupeAndSort(filtered);
  return out.length ? out : undefined;
}

/**
 * Parse and canonicalize entity references (founder/affiliation).
 * Accepts:
 * - Array of objects with @id
 * - Array of UUIDs (converts to resolve URLs)
 * - Comma/newline separated string of UUIDs
 * Returns array of EntityRef or undefined if empty.
 */
function canonicalizeEntityRefs(value: unknown): EntityRef[] | undefined {
  if (!value) return undefined;

  let items: unknown[];
  if (Array.isArray(value)) {
    items = value;
  } else if (typeof value === "string") {
    // Support comma/newline separated UUIDs
    items = splitMultilineOrComma(value);
  } else {
    return undefined;
  }

  const refs: EntityRef[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    let id: string | null = null;

    if (typeof item === "object" && item !== null && "@id" in (item as any)) {
      // Already an EntityRef
      id = String((item as any)["@id"]).trim();
    } else if (typeof item === "string") {
      const trimmed = item.trim();
      if (!trimmed) continue;
      // Check if it's already a full URL
      if (trimmed.startsWith("https://anchorid.net/resolve/")) {
        id = trimmed;
      } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
        // It's a UUID, convert to resolve URL
        id = resolveUrl(trimmed.toLowerCase());
      }
    }

    if (id && !seen.has(id)) {
      seen.add(id);
      refs.push({ "@id": id });
    }
  }

  return refs.length > 0 ? refs : undefined;
}

/**
 * Canonicalize founding date.
 * Accepts ISO 8601 date string (YYYY-MM-DD or full datetime).
 * Returns just the date portion (YYYY-MM-DD) or undefined.
 */
function canonicalizeFoundingDate(value: unknown): string | undefined {
  if (!isNonEmptyString(value)) return undefined;
  const trimmed = value.trim();
  // Accept YYYY-MM-DD or full ISO datetime
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  return undefined;
}





/**
 * buildProfile(uuid, stored?, input?, verifiedUrls?, options?) -> canonical Person/Organization JSON-LD
 *
 * Purpose
 * - Produce a canonical schema.org Person or Organization object suitable for KV storage
 *   at `profile:<uuid>` and for public output from `/resolve/<uuid>`.
 *
 * Enforces (always)
 * - Required fields present and correct:
 *   @context, @type, @id, identifier, mainEntityOfPage, subjectOf, isPartOf
 * - `dateCreated` is immutable after first write
 * - `@type` is immutable after first write (Person or Organization)
 * - URL normalization + dedupe for `url` and `sameAs`
 * - `sameAs` merge policy:
 *   - manual sameAs comes from stored (or input on writes)
 *   - verifiedUrls are merged in as an effective/public union set
 *
 * Timestamp rules
 * - On write (input provided):
 *   - if canonical stored profile would change, bump `dateModified`
 *   - if no-op and bumpOnNoop=false, preserve stored `dateModified`
 * - On read (input null/undefined):
 *   - by default preserve stored timestamps (dateCreated/dateModified) even if we recompute
 *     structured fields; this keeps `/resolve` stable and makes timestamps represent KV state.
 *   - can be overridden via `preserveStoredTimestampsOnRead=false`
 *
 * Returns
 * - profile: canonical Person or Organization JSON-LD (what you may store; `sameAs` depends on persistMergedSameAs)
 * - changed: whether storing `profile` would change KV state (taking bumpOnNoop into account)
 * - effectiveSameAs: the public union (manual ∪ verified) after canonicalization/dedupe
 */
export function buildProfile(
  uuid: string,
  stored?: AnchorProfile | null,
  input?: ProfileInput | null,
  verifiedUrls?: unknown,
  options?: BuildProfileOptions
): { profile: AnchorProfile; changed: boolean; effectiveSameAs: string[] } {
  const opt = { ...DEFAULTS, ...(options ?? {}) };
  const now = opt.nowIso();

  const refs = buildRefs(uuid);

  const isReadBuild = input == null;
  const preserveOnRead = !!opt.preserveStoredTimestampsOnRead && isReadBuild;

  // Determine entity type: stored type wins (immutable), then input, then default to Person
  const entityType: EntityType = (stored?.["@type"] as EntityType) ??
    (input?.["@type"] === "Organization" ? "Organization" : "Person");

  // Canonicalize optional inputs (input wins if present)
  const name = canonicalizeString(input?.name) ?? stored?.name;
  const alternateName =
    canonicalizeStringArray(input?.alternateName) ?? stored?.alternateName;
  const description = canonicalizeString(input?.description) ?? stored?.description;

  const url = (() => {
    const candidate = input?.url ?? stored?.url;
    const canon = canonicalizeUrl(candidate);
    return canon ?? undefined;
  })();

  // Manual sameAs is editable (stored field). If input.sameAs is present, it replaces manual.
  const manualSameAs = (() => {
    if (input && "sameAs" in (input as any)) return canonicalizeUrlList(input.sameAs);
    return canonicalizeUrlList(stored?.sameAs ?? []);
  })();

  // Effective (public) sameAs is manual ∪ verified
  const effectiveSameAs = mergeSameAs(manualSameAs, verifiedUrls);

  // What do we store in profile.sameAs?
  const sameAsForStorage = opt.persistMergedSameAs ? effectiveSameAs : manualSameAs;
  const sameAs = normalizeOptionalArray(
    sanitizeSameAsForProfileStorage(sameAsForStorage)
  );

  // Baseline timestamps
  const baseDateCreated = stored?.dateCreated ?? now;
  const baseDateModified = stored?.dateModified ?? now;

  // Helper to strip empty arrays
  function stripEmptyArrays<T extends Record<string, unknown>>(obj: T): T {
    if (!obj || typeof obj !== "object") return obj;
    const out: any = Array.isArray(obj) ? [...obj] : { ...obj };
    for (const k of Object.keys(out)) {
      const v = out[k];
      if (Array.isArray(v) && v.length === 0) delete out[k];
    }
    return out;
  }

  // Build the base profile fields shared by both types
  const baseFields = {
    "@context": "https://schema.org" as const,
    "@id": resolveUrl(uuid),
    identifier: buildIdentifier(uuid),
    dateCreated: baseDateCreated,
    dateModified: baseDateModified,
    ...(name ? { name } : {}),
    ...(alternateName && alternateName.length ? { alternateName } : {}),
    ...(description ? { description } : {}),
    ...(url ? { url } : {}),
    ...(sameAs && sameAs.length ? { sameAs } : {}),
    mainEntityOfPage: refs.mainEntityOfPage,
    subjectOf: refs.subjectOf,
    isPartOf: WEBSITE,
  };

  let candidate: AnchorProfile;

  if (entityType === "Organization") {
    // Organization-specific fields
    const storedOrg = stored as OrganizationProfile | undefined;

    const founder = (() => {
      if (input && "founder" in (input as any)) return canonicalizeEntityRefs(input.founder);
      return storedOrg?.founder;
    })();

    const foundingDate = (() => {
      if (input && "foundingDate" in (input as any)) return canonicalizeFoundingDate(input.foundingDate);
      return storedOrg?.foundingDate;
    })();

    candidate = {
      ...baseFields,
      "@type": "Organization",
      ...(founder ? { founder } : {}),
      ...(foundingDate ? { foundingDate } : {}),
    } as OrganizationProfile;
  } else {
    // Person-specific fields
    const storedPerson = stored as PersonProfile | undefined;

    const affiliation = (() => {
      if (input && "affiliation" in (input as any)) return canonicalizeEntityRefs(input.affiliation);
      return storedPerson?.affiliation;
    })();

    candidate = {
      ...baseFields,
      "@type": "Person",
      ...(affiliation ? { affiliation } : {}),
    } as PersonProfile;
  }

  // Strip empty arrays from candidate (keep canonical output clean)
  const normalizedCandidate = stripEmptyArrays(candidate);

  // Detect change compared to stored (ignore dateModified drift by aligning it for comparison)
  const storedComparable = stored
    ? stripEmptyArrays({ ...stored, dateModified: normalizedCandidate.dateModified })
    : null;

  const structurallyChanged = storedComparable
    ? !deepEqual(normalizedCandidate, storedComparable)
    : true;

  // Apply timestamp policy
  if (preserveOnRead) {
    if (stored?.dateCreated) normalizedCandidate.dateCreated = stored.dateCreated;
    if (stored?.dateModified) normalizedCandidate.dateModified = stored.dateModified;
  } else {
    if (stored?.dateCreated) normalizedCandidate.dateCreated = stored.dateCreated;

    if (structurallyChanged || opt.bumpOnNoop) {
      normalizedCandidate.dateModified = now;
    } else if (stored?.dateModified) {
      normalizedCandidate.dateModified = stored.dateModified;
    }
  }

  const changed = preserveOnRead
    ? false
    : (structurallyChanged || (!!stored && opt.bumpOnNoop));

  const cleaned = stripEmptyArrays(candidate);
  return { profile: cleaned, changed, effectiveSameAs };
}

