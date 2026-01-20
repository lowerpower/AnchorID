# AnchorID - Next Steps Checklist

Items to tackle in future sessions, organized by priority and category.

---

## 🔒 Security & Production Hardening

### High Priority

- [x] **Add security headers** to all responses ✅ (Completed Jan 20, 2026)
  - [x] `Content-Security-Policy` - Prevent XSS and injection attacks
  - [x] `X-Frame-Options: DENY` - Prevent clickjacking
  - [x] `X-Content-Type-Options: nosniff` - Prevent MIME sniffing
  - [x] `Referrer-Policy: strict-origin-when-cross-origin`
  - [x] `Permissions-Policy` - Restrict browser features

- [x] **Add request size limits** ✅ (Completed Jan 20, 2026)
  - [x] Limit JSON payload size (prevent memory exhaustion) - 50KB
  - [x] Limit URL length - 2048 characters
  - [x] Reject oversized requests early

- [x] **Add timeouts to DNS queries** ✅ (Completed Jan 20, 2026)
  - [x] Per-request timeout: 2.5s (per spec)
  - [x] Overall verification timeout: 5s (via 2 attempts × 2.5s)
  - [x] Add retry logic on transient failures (1 retry)

- [x] **Add DNS query result caching** ✅ (Completed Jan 20, 2026)
  - [x] Success cache: 15 minutes (per spec), capped at DNS TTL if lower
  - [x] Failure cache: 2 minutes
  - [x] TTL-bounded caching from DNS response (uses minimum TTL from TXT records)
  - [x] "Recheck now" bypass option (via `bypassCache` or `recheckNow` parameter)

### Medium Priority

- [ ] **Add monitoring/observability**
  - [ ] Log DNS verification success/failure rates
  - [ ] Track claim verification patterns
  - [ ] Monitor rate limit hits
  - [ ] Alert on unusual patterns

- [ ] **Improve error messages**
  - [ ] More specific DNS failure reasons
  - [ ] User-friendly error descriptions
  - [ ] Troubleshooting hints in error responses

- [ ] **Add health check endpoint**
  - [ ] `/health` or `/_health` endpoint
  - [ ] Check KV connectivity
  - [ ] Return service status

### Low Priority

- [ ] **Add request ID tracing**
  - [ ] Generate unique ID per request
  - [ ] Include in logs and error responses
  - [ ] Helps with debugging

- [ ] **Review and test edge cases**
  - [ ] Very long domain names (IDN/punycode)
  - [ ] Special characters in claims
  - [ ] Concurrent claim updates
  - [ ] KV consistency edge cases

---

## 🎨 Admin UI Improvements

### High Priority

- [x] **Add DNS claims to admin UI** ✅ (Completed Jan 20, 2026)
  - [x] Create DNS claim form in admin - Type selector + dynamic hints
  - [x] Show DNS claims in profile list - All claim types displayed with proof details
  - [x] Add "Verify" button for DNS claims - One-click verification for all claim types
  - [x] Display DNS proof details (qname, expected token) - Shown inline with each claim

- [x] **Add claims management page** ✅ (Completed Jan 20, 2026)
  - [x] List all claims for a profile - Integrated into admin edit page
  - [x] Show verification status - Color-coded badges (verified/failed/self_asserted)
  - [x] Allow re-verification - Verify button on each claim
  - [x] Show last checked timestamps - Displayed below each claim

### Medium Priority

- [x] **Improve claim creation UX** ✅ (Completed Jan 20, 2026)
  - [x] Single "Add Proof" workflow with type selector - Collapsible form with dropdown
  - [ ] Inline validation (check domain format, GitHub username)
  - [ ] Preview of what needs to be published
  - [ ] Copy-to-clipboard for proof values

- [ ] **Add bulk operations**
  - [ ] Verify all pending claims
  - [ ] Re-verify all verified claims
  - [ ] Delete multiple claims

### Low Priority

- [ ] **Add claim statistics**
  - [ ] Count by type and status
  - [ ] Verification success rate
  - [ ] Most recent verifications

---

## 📚 Documentation & Content

### High Priority

- [ ] **Commit CHANGELOG-dns-proof.md**
  - [ ] Review and finalize
  - [ ] Commit to repository
  - [ ] Consider moving to `/docs/changelogs/` directory

- [x] **Update main README.md** ✅ (Completed Jan 20, 2026)
  - [x] Add DNS proof to feature list
  - [x] Link to /proofs page
  - [x] Update "What can you prove" section

### Medium Priority

- [ ] **Create proof comparison matrix**
  - [ ] Signal strength comparison
  - [ ] Difficulty vs. value
  - [ ] When to use each type
  - [ ] Combinations for strongest signal

- [ ] **Add troubleshooting FAQ**
  - [ ] Common DNS propagation issues
  - [ ] GitHub README not found
  - [ ] Website .well-known access
  - [ ] Verification failures

- [ ] **Create admin documentation**
  - [ ] How to use admin UI
  - [ ] Creating profiles
  - [ ] Managing claims
  - [ ] Backup tokens and recovery

### Low Priority

- [ ] **Add API documentation**
  - [ ] Full API reference page
  - [ ] Authentication methods
  - [ ] All endpoints with examples
  - [ ] Rate limits and errors
  - [ ] OpenAPI/Swagger spec (optional)

---

## ✨ Features & Enhancements

### High Priority

- [ ] **Public signup flow improvements**
  - [ ] Better error messages on signup
  - [ ] Email verification step
  - [ ] Clearer setup page instructions

- [ ] **Claim verification notifications**
  - [ ] Email when claim verified
  - [ ] Email when claim fails
  - [ ] Optional webhook for API users

### Medium Priority

- [ ] **Batch claim verification**
  - [ ] Verify multiple claims at once
  - [ ] API endpoint: `POST /claims/verify-all`
  - [ ] Background job processing

- [ ] **Claim history/timeline**
  - [ ] Show verification attempts
  - [ ] Track status changes over time
  - [ ] Display in admin UI and claims page

- [ ] **Export identity data**
  - [ ] Download all profile data as JSON
  - [ ] Include claims and audit log
  - [ ] GDPR compliance feature

### Low Priority

- [ ] **Additional proof types** (future)
  - [ ] Mastodon/ActivityPub proof
  - [ ] Twitter/X proof (if API available)
  - [ ] PGP key proof
  - [ ] Domain verification via meta tag (alternative to .well-known)

- [ ] **Profile preview before publish**
  - [ ] Show how /resolve output will look
  - [ ] Preview JSON-LD
  - [ ] Validate before save

- [ ] **Vanity URLs** (if desired)
  - [ ] `/resolve/username` in addition to UUID
  - [ ] Username uniqueness check
  - [ ] Optional feature, not core

---

## 🧪 Testing & Quality

### High Priority

- [ ] **Update existing tests**
  - [ ] Fix "Hello World" test snapshots
  - [ ] Add DNS proof verification tests
  - [ ] Test normalization logic
  - [ ] Test UUID extraction

- [ ] **Add integration tests**
  - [ ] Test full claim creation flow
  - [ ] Test verification flow
  - [ ] Test rate limiting
  - [ ] Test error conditions

### Medium Priority

- [ ] **Add DNS verification unit tests**
  - [ ] Mock DoH responses
  - [ ] Test all accepted TXT formats
  - [ ] Test normalization edge cases
  - [ ] Test malformed DNS responses

- [ ] **Add claims system tests**
  - [ ] Website proof verification
  - [ ] GitHub proof verification
  - [ ] DNS proof verification
  - [ ] Claim state transitions

### Low Priority

- [ ] **Add load testing**
  - [ ] Simulate traffic patterns
  - [ ] Test rate limiting under load
  - [ ] KV performance testing

- [ ] **Add security testing**
  - [ ] SQL injection attempts (not applicable but good practice)
  - [ ] XSS attempts
  - [ ] CSRF testing
  - [ ] Rate limit bypass attempts

---

## 🔧 Technical Debt & Refactoring

### Medium Priority

- [ ] **Organize DNS verification into separate module**
  - [ ] `src/claims/dns/` directory
  - [ ] Separate normalization, validation, verification
  - [ ] Easier to maintain and test

- [ ] **Consistent error response format**
  - [ ] Standardize error objects
  - [ ] Always include error code
  - [ ] Human-readable message + machine code

- [ ] **Type safety improvements**
  - [ ] Stricter TypeScript config
  - [ ] No implicit `any`
  - [ ] Exhaustive switch cases

### Low Priority

- [ ] **Code organization**
  - [ ] Move helpers to `/src/utils/`
  - [ ] Consolidate KV operations
  - [ ] Reduce index.ts size

- [ ] **Dependencies audit**
  - [ ] Review all dependencies
  - [ ] Update to latest versions
  - [ ] Remove unused dependencies

---

## 📊 Analytics & Insights (Optional)

### Low Priority

- [ ] **Basic usage metrics** (privacy-preserving)
  - [ ] Count profiles created
  - [ ] Count claims by type
  - [ ] Verification success rates
  - [ ] No PII, aggregate only

- [ ] **Performance monitoring**
  - [ ] DNS query latency
  - [ ] KV operation latency
  - [ ] Overall request latency

---

## 🎯 MVP Definition of Done - Remaining

From `todo.md`:

- [ ] **System survives hostile-but-boring internet traffic**
  - This requires completing the security hardening items above
  - Security headers
  - Request size limits
  - Timeouts and error handling
  - Rate limiting (already done ✅)

---

## 🗂️ Housekeeping

- [ ] Commit `CHANGELOG-dns-proof.md`
- [ ] Update `todo.md` with DNS proof completion
- [ ] Create `/docs/changelogs/` directory for future changelogs
- [ ] Consider organizing specs into `/docs/specs/v1/`

---

## Priority Legend

- **High Priority** - Should be done soon for production stability/security
- **Medium Priority** - Nice to have, improves UX or maintainability
- **Low Priority** - Future enhancements, not critical

---

## Quick Wins (Can knock out quickly)

From the list above, these are quick to implement:

1. ✅ Commit CHANGELOG (1 min) - DONE
2. ✅ Add security headers (15-30 min) - DONE
3. ✅ Add DNS query timeouts (15-30 min) - DONE
4. ✅ Update README with DNS proof (10 min) - DONE
5. ✅ Fix test snapshots (5 min) - DONE

🎉 **All quick wins completed!**

---

_Last updated: January 20, 2026_
_After: DNS claims admin UI implementation_
