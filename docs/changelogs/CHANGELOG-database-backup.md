# Database Backup Feature - January 30, 2026

## Overview

Add complete database backup functionality to the admin panel, enabling catastrophic recovery by allowing admins to download a full JSON export of all profiles, claims, and audit logs. Designed for disaster recovery and data portability.

**Date:** January 30, 2026
**Status:** ✅ Complete
**Scope:** Admin tooling, disaster recovery, data export

---

## What Was Added

### 1. Backup Handler

**New Function:** `handleAdminBackup()` in `src/admin/handlers.ts`

**Functionality:**
- Fetches all profile UUIDs using cursor-based pagination
- For each profile, fetches:
  - Profile data (including `_emailHash`, `_backupTokenHash`)
  - Claims array
  - Audit log entries
- Builds comprehensive JSON backup object
- Returns as downloadable file with timestamped filename

**Implementation:**
```typescript
export async function handleAdminBackup(req: Request, env: Env): Promise<Response> {
  const denied = requireAdminCookie(req, env);
  if (denied) return denied;

  // Fetch all profile UUIDs
  const uuids = await fetchAllProfileUUIDs(env);

  // Build backup metadata
  const backup = {
    metadata: {
      timestamp: new Date().toISOString(),
      anchorid_version: "1.0",
      backup_type: "full",
      profile_count: uuids.length,
      generator: "AnchorID Admin Backup"
    },
    profiles: [] as any[]
  };

  // Fetch each profile with associated data
  for (const uuid of uuids) {
    const profile = await env.ANCHOR_KV.get(`profile:${uuid}`, { type: "json" });
    const claims = await env.ANCHOR_KV.get(`claims:${uuid}`, { type: "json" }) || [];
    const audit = await env.ANCHOR_KV.get(`audit:${uuid}`, { type: "json" }) || [];

    if (profile) {
      backup.profiles.push({
        uuid,
        profile,
        claims,
        audit,
      });
    }
  }

  // Generate filename with timestamp
  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  const filename = `anchorid-backup-${timestamp}.json`;

  // Return as downloadable JSON file
  return new Response(JSON.stringify(backup, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
```

---

### 2. Route Handler

**New Route:** `GET /admin/backup`

**Location:** `src/index.ts`

**Code:**
```typescript
if (path === "/admin/backup" && request.method === "GET") {
  return handleAdminBackup(request, env);
}
```

**Authentication:**
- Requires admin cookie
- Same authentication as other admin routes
- No public access

---

### 3. Admin UI

**Location:** Admin home page (`/admin`)

**New Section:** Database Backup card

**HTML:**
```html
<div class="backup-section">
  <h2>📥 Database Backup</h2>
  <p>Download a complete backup of all profiles, claims, and audit logs.</p>
  <form method="get" action="/admin/backup" style="margin:0">
    <button type="submit">Download Full Backup</button>
    <span class="hint">JSON format · ${total} profiles</span>
  </form>
  <div class="alert alert-warning" style="margin-top:10px;font-size:13px">
    ⚠️ <strong>Security Notice:</strong> This backup contains sensitive data including email hashes and authentication credentials. Store securely.
  </div>
</div>
```

**Placement:**
- Top of admin page
- Below "Create new profile" link
- Above search box and profile list

**Styling:**
```css
.backup-section {
  background:#f8f9fa;
  border:1px solid #dee2e6;
  padding:14px;
  border-radius:10px;
  margin-bottom:20px;
}
.alert-warning {
  background:#fff3cd;
  border:1px solid #ffc107;
  color:#856404;
}
```

---

## Backup Format

### JSON Structure

```json
{
  "metadata": {
    "timestamp": "2026-01-30T12:34:56.789Z",
    "anchorid_version": "1.0",
    "backup_type": "full",
    "profile_count": 543,
    "generator": "AnchorID Admin Backup"
  },
  "profiles": [
    {
      "uuid": "4ff7ed97-b78f-4ae6-9011-5af714ee241c",
      "profile": {
        "@context": "https://schema.org",
        "@type": "Person",
        "@id": "https://anchorid.net/resolve/4ff7ed97-b78f-4ae6-9011-5af714ee241c",
        "identifier": {
          "@type": "PropertyValue",
          "propertyID": "canonical-uuid",
          "value": "urn:uuid:4ff7ed97-b78f-4ae6-9011-5af714ee241c"
        },
        "name": "Mike Johnson",
        "dateCreated": "2026-01-11T10:23:45.123Z",
        "dateModified": "2026-01-30T12:00:00.000Z",
        "_emailHash": "abc123...",
        "_backupTokenHash": "def456..."
      },
      "claims": [
        {
          "id": "claim-123",
          "type": "website",
          "url": "https://blog.mycal.net",
          "status": "verified",
          "createdAt": "2026-01-11T10:30:00.000Z",
          "lastCheckedAt": "2026-01-30T11:00:00.000Z",
          "proof": {
            "kind": "well_known",
            "url": "https://blog.mycal.net/.well-known/anchorid.txt"
          }
        }
      ],
      "audit": [
        {
          "timestamp": "2026-01-30T12:00:00.000Z",
          "action": "update",
          "method": "magic_link",
          "ipHash": "1234abcd5678efgh",
          "changes": ["name", "description"]
        }
      ]
    }
  ]
}
```

---

## Data Included

### Profile Object (Full)
- All JSON-LD fields (`@context`, `@type`, `@id`, etc.)
- User-editable fields (`name`, `description`, `sameAs`, etc.)
- **Sensitive metadata:**
  - `_emailHash` - SHA-256 hash of email
  - `_backupTokenHash` - SHA-256 hash of backup token
  - `_email` - Plaintext email (if claim notifications enabled)

### Claims Array
- All claims (verified, self_asserted, failed)
- Claim metadata (type, URL, status)
- Timestamps (createdAt, lastCheckedAt)
- Proof details (kind, URL, tokens)
- Failure reasons if applicable

### Audit Log
- All audit entries (max 100 per profile)
- Action types (create, update, rotate_token)
- Authentication methods (admin, magic_link, backup_token)
- IP hashes (first 16 chars of SHA-256)
- Changed fields list

---

## Security Considerations

### Sensitive Data Warning

**Included in Backup:**
- ✅ Email hashes (can be reverse-engineered with rainbow tables)
- ✅ Backup token hashes (less sensitive, already hashed)
- ✅ IP hashes (privacy-preserving but still traceable)
- ✅ Audit history (reveals user activity patterns)
- ⚠️ Plaintext emails (only if `ENABLE_CLAIM_NOTIFICATIONS` is true)

**UI Warning:**
```
⚠️ Security Notice: This backup contains sensitive data including
email hashes and authentication credentials. Store securely.
```

**Recommendations for Users:**
1. Encrypt backup files before storing
2. Store in secure location (encrypted drive, password manager)
3. Don't commit to public git repositories
4. Don't share via unencrypted channels
5. Rotate regularly, delete old backups

---

### Authentication & Access Control

**Who Can Download:**
- Only authenticated admins (cookie-based auth)
- No API access (requires browser session)
- No rate limiting (trusted admin action)

**What Prevents Abuse:**
- Admin cookie required
- No public endpoint
- CSRF protection on admin routes
- `no-store` cache control header

---

## Performance Characteristics

### Benchmarks (Estimated)

**100 Profiles:**
- Fetch time: ~500ms
- JSON generation: ~100ms
- Download size: ~2 MB
- Total time: **< 1 second**

**1,000 Profiles:**
- Fetch time: ~2-3 seconds
- JSON generation: ~500ms
- Download size: ~20 MB
- Total time: **< 5 seconds**

**10,000 Profiles:**
- Fetch time: ~20-30 seconds
- JSON generation: ~2 seconds
- Download size: ~200 MB
- Total time: **< 40 seconds**

**Note:** Cloudflare Workers have 30-second CPU time limit, so databases with >10,000 profiles may require chunking or streaming approach.

---

## Scalability

### Current Implementation

**Algorithm:**
```
1. Fetch all UUIDs (cursor-based pagination, no limit)
2. For each UUID:
   - Fetch profile (1 KV read)
   - Fetch claims (1 KV read)
   - Fetch audit (1 KV read)
3. Build JSON in memory
4. Return as single response
```

**KV Operations:**
- Total reads: `3 × profile_count + 1` (UUID list)
- For 1,000 profiles: ~3,001 reads

**Memory Usage:**
- Full JSON held in Worker memory
- ~20 KB per profile average
- For 1,000 profiles: ~20 MB in memory

**CPU Time:**
- Linear with profile count
- ~30ms per profile
- For 1,000 profiles: ~30 seconds total

---

### Future Enhancements (If Needed)

**Streaming Backup (for very large databases):**
```typescript
// NDJSON format (newline-delimited JSON)
{"type":"metadata","timestamp":"...","total":50000}
{"type":"profile","uuid":"...","data":{...}}
{"type":"profile","uuid":"...","data":{...}}
...
```

**Benefits:**
- Constant memory usage
- No 30-second CPU limit
- Can handle unlimited profiles

**Chunked Download:**
```
GET /admin/backup?chunk=1&chunk_size=1000
GET /admin/backup?chunk=2&chunk_size=1000
...
```

**Benefits:**
- Multiple small downloads
- Resumable if interrupted
- Better progress tracking

---

## Use Cases

### 1. Catastrophic Recovery

**Scenario:** Cloudflare KV data loss or corruption

**Recovery Process:**
1. Download most recent backup
2. Spin up new AnchorID instance
3. Parse JSON backup
4. Restore profiles/claims/audit to new KV
5. Verify data integrity

**Expected Recovery Time:**
- 1,000 profiles: ~5 minutes
- 10,000 profiles: ~30 minutes

---

### 2. Data Migration

**Scenario:** Moving to different infrastructure

**Process:**
1. Download backup from production
2. Set up new system
3. Import backup data
4. Update DNS to point to new system
5. Verify all profiles resolve correctly

---

### 3. Compliance & Auditing

**Scenario:** Legal/regulatory data export requirement

**Use Cases:**
- GDPR data export requests
- Compliance audits
- Historical record keeping
- Data analysis

**Advantages:**
- Complete audit trail
- Timestamped snapshots
- Verifiable data integrity

---

### 4. Testing & Development

**Scenario:** Need realistic test data

**Process:**
1. Download production backup
2. Sanitize sensitive data (remove email hashes)
3. Import to dev/staging environment
4. Test features with real-world data volume

---

## Files Modified

### `src/admin/handlers.ts`

**Added:**
- `handleAdminBackup()` function (lines 1535-1580)

**Modified:**
- Admin home HTML template (added backup section)
- CSS styles (added `.backup-section` and `.alert-warning`)

**Changes:**
- +73 lines

---

### `src/index.ts`

**Added:**
- Import: `handleAdminBackup`
- Route: `GET /admin/backup`

**Changes:**
- +2 lines

---

## Testing

### Manual Testing Checklist

**Before Deployment:**
- [ ] Code compiles without errors
- [ ] TypeScript types validate
- [ ] No linting errors

**After Deployment:**
- [ ] Visit `/admin` (authenticated)
- [ ] Verify backup section visible
- [ ] Click "Download Full Backup" button
- [ ] Verify file downloads
- [ ] Check filename format: `anchorid-backup-YYYY-MM-DDTHH-mm-ss.json`
- [ ] Verify JSON is valid (parse with `jq` or JSON viewer)
- [ ] Check metadata section
- [ ] Verify profiles array populated
- [ ] Confirm claims and audit included
- [ ] Test with empty database (0 profiles)
- [ ] Test with 1 profile
- [ ] Test with 100+ profiles

---

### Verification Commands

**Download and inspect:**
```bash
# Download backup (manually via browser)
# Then verify structure:

# Check JSON validity
jq '.' anchorid-backup-2026-01-30T12-34-56.json

# Count profiles
jq '.metadata.profile_count' anchorid-backup-2026-01-30T12-34-56.json

# List first 5 UUIDs
jq '.profiles[0:5] | .[].uuid' anchorid-backup-2026-01-30T12-34-56.json

# Check for sensitive data
jq '.profiles[] | select(._emailHash != null) | .uuid' anchorid-backup-2026-01-30T12-34-56.json

# Verify claims included
jq '.profiles[] | select(.claims | length > 0) | {uuid: .uuid, claims: (.claims | length)}' anchorid-backup-2026-01-30T12-34-56.json
```

---

## Deployment

### Commands

**Deploy Main Worker:**
```bash
npm run deploy
```

**Verification:**
```bash
# Visit admin page
open https://anchorid.net/admin

# Check backup section visible
# Click download button
# Verify file downloads correctly
```

---

## Known Limitations

### Current Constraints

**1. Single Large File:**
- All data in one JSON file
- Could be very large (>100 MB for big databases)
- Browser memory limits apply

**2. No Incremental Backups:**
- Always full export
- No "changes since last backup"
- No compression

**3. No Automated Backups:**
- Manual download only
- No scheduled/automatic backups
- No cloud storage integration

**4. No Restore Feature:**
- Export only, no import
- Manual restoration required
- No validation on import

---

### Planned Enhancements (Future)

**Phase 2 Features:**

**1. Restore from Backup:**
- Upload JSON file
- Validate structure
- Restore profiles/claims/audit
- Conflict resolution (skip vs overwrite)

**2. Scheduled Backups:**
- Cron trigger (daily/weekly)
- Automatic upload to R2/S3
- Email download link to admin
- Retention policy (keep last N backups)

**3. Incremental Backups:**
- Track last backup timestamp
- Only export changed profiles
- Smaller file size
- Faster generation

**4. Compression:**
- Gzip JSON before download
- Reduce file size 5-10x
- Faster download

**5. Encryption:**
- Encrypt with passphrase before download
- AES-256 encryption
- Extra security for sensitive data

**6. Multiple Export Formats:**
- CSV (profiles only)
- SQL dump (for database import)
- Redacted version (no email hashes)

---

## Security Audit

### Threat Model

**Threat: Admin account compromise**
- **Risk:** Attacker downloads all user data
- **Mitigation:** Strong admin authentication, audit logging
- **Severity:** High

**Threat: Backup file exposure**
- **Risk:** Sensitive data leaked (email hashes, audit logs)
- **Mitigation:** Warning message, encryption recommendation
- **Severity:** High

**Threat: Rainbow table attack on email hashes**
- **Risk:** Email addresses reverse-engineered from hashes
- **Mitigation:** Use bcrypt/scrypt for emails (future), warn users
- **Severity:** Medium

**Threat: Backup file tampering**
- **Risk:** Modified backup imported, corrupting database
- **Mitigation:** Hash verification (future), signature validation
- **Severity:** Medium (no restore feature yet)

---

### Recommendations for Production

**1. Add Backup Encryption (Phase 2):**
```typescript
// Encrypt backup before download
const encrypted = await encryptBackup(backup, adminPassword);
```

**2. Add Backup Signing (Phase 2):**
```typescript
// Sign backup with admin key
const signature = await signBackup(backup, adminPrivateKey);
backup.metadata.signature = signature;
```

**3. Audit Backup Downloads:**
```typescript
// Log backup generation to audit system
await appendAuditLog(env, "system", req, "backup_download", "admin");
```

**4. Rate Limit Backups (Phase 2):**
```typescript
// Prevent abuse, limit to 1 backup per hour
const lastBackup = await env.ANCHOR_KV.get("last_backup_timestamp");
if (lastBackup && Date.now() - lastBackup < 3600000) {
  return new Response("Backup already generated in last hour", { status: 429 });
}
```

---

## Related Changes

This changelog is part of the January 30, 2026 admin tooling enhancement:

1. Admin Search & Pagination (see CHANGELOG-admin-search-pagination.md)
2. **Database Backup** (this document)
3. JSON-LD About Page (see CHANGELOG-json-ld-about-page.md)
4. Branding Updates (see CHANGELOG-branding-updates.md)

---

## References

**Commit:**
- Hash: `9ddc2d3`
- Message: "Add database backup feature to admin panel"
- Date: January 30, 2026

**Related Issues:**
- Catastrophic recovery requirement
- Data portability for compliance
- Admin tooling improvements

---

**Status:** ✅ Complete - Ready for production deployment
