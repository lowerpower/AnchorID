# AnchorID Changelogs

This directory contains detailed changelogs for major feature implementations and production updates.

## Changelogs

### [Admin Search & Pagination - January 30, 2026](./CHANGELOG-admin-search-pagination.md)
Admin profile list search and pagination implementation:
- **Search**: Full-text search across all profile JSON data (UUID, name, email, etc.)
- **Pagination**: 100 profiles per page with Previous/Next navigation
- **Performance**: Cursor-based KV fetching handles databases with >1000 profiles
- **UX**: Result counts, URL state preservation, bookmarkable searches
- Scalable admin interface for large profile databases

**Focus:** Admin tooling, scalability, performance

### [Branding Updates - Bluesky Removal - January 30, 2026](./CHANGELOG-branding-updates.md)
Documentation and UI branding updates:
- **Removed**: All Bluesky references from public-facing content
- **Updated**: Social profile claim descriptions to focus on Mastodon and generic platforms
- **Technical**: No functional changes, documentation only
- **Files**: Updated about, guide, FAQ, and claim UI text
- Platform-agnostic verification system remains unchanged

**Focus:** Branding, documentation cleanup

### [Brevo Email Support - January 25, 2026](./CHANGELOG-brevo-email-support.md)
Email provider routing with domain-based selection:
- **Brevo Integration**: New email provider with API support
- **Domain Routing**: Route emails by recipient domain (e.g., outlook.com → Brevo)
- **Subdomain Matching**: Automatic subdomain support (mail.outlook.com)
- **Provider Priority**: Brevo → mycal.net → Resend with fallback chain
- Improved deliverability for problematic domains

**Focus:** Email infrastructure, deliverability

### [Social Profile Claims - January 25, 2026](./CHANGELOG-social-profile-claims.md)
Social profile verification system:
- **New Claim Type**: "social" for Mastodon, forums, and public profiles
- **Fediverse Support**: `@user@instance.social` handle parsing
- **SSRF Protection**: Blocks private IPs, localhost, cloud metadata
- **Generic Platform**: Works with any public HTTPS profile page
- Profile bio/description verification for identity claims

**Focus:** New claim type, social verification, SSRF security

### [Security Hardening & MVP Completion - January 24, 2026](./CHANGELOG-security-hardening-mvp.md)
🎉 **MVP Completion** - Final security hardening:
- **Rate Limiting**: Added to all public endpoints (/resolve, /claims, /signup, etc.)
- **Security Tests**: Comprehensive test suite (test/security.spec.ts)
- **Load Testing**: Performance validation (test/load.spec.ts)
- **Documentation**: Complete threat model and security testing guide
- **MVP Complete**: System survives hostile-but-boring internet traffic

**Focus:** 🎉 MVP completion, security hardening, comprehensive testing

### [Documentation Updates & Security Hardening - January 22, 2026](./CHANGELOG-documentation-and-security.md)
Documentation updates + rate limiting for claim endpoints:
- **Documentation**: Updated FAQ, proofs page, and CLAUDE.md for self-service claims
- **Rate Limiting**: Added IP and UUID rate limits to /claim and /claim/verify endpoints
- **Security**: Prevent spam claims, excessive verifications, and DoS attacks
- Comprehensive documentation of new user self-service workflow

**Focus:** Documentation accuracy, security hardening, abuse prevention

### [Admin Panel Enhancements & Critical Bug Fix - January 21, 2026](./CHANGELOG-admin-enhancements.md)
🚨 **CRITICAL BUG FIX** + two admin UI enhancements:
- **🚨 Bug Fix**: Metadata preservation - prevents account lockouts during profile edits
- **Email Addition**: Add email to legacy profiles, enable magic link login
- **Profile Deletion**: Delete profiles < 7 days old with safety protections
- Critical fix preserves authentication credentials across profile updates

**Focus:** Critical bug fix, admin tooling, account security

### [Production Hardening - January 20, 2026](./CHANGELOG-production-hardening.md)
Production readiness update with 6 high-priority features:
- DNS query result caching with TTL support
- DNS claims admin UI with visual management
- Error message improvements with user-friendly guidance
- Health check endpoint for monitoring
- Public signup flow improvements with security warnings
- Claim verification email notifications (opt-in)

**Focus:** Security hardening, operational monitoring, and user experience

### [DNS Proof Implementation - January 19-20, 2026](./CHANGELOG-dns-proof.md)
Complete DNS TXT record verification system implementation:
- DNS-over-HTTPS verification via Cloudflare API
- Support for 4 TXT record value formats
- User-facing documentation for all proof types
- `/proofs` page with comprehensive guides

**Focus:** New proof type, documentation, and specification

---

## Changelog Format

Each changelog includes:
- **Overview** - High-level summary of changes
- **What Was Added** - Feature descriptions
- **Technical Implementation** - Code changes, files modified/created
- **API Changes** - New endpoints, parameters, request/response formats
- **Testing** - Test procedures and results
- **Deployment** - Production deployment guide
- **User-Facing Changes** - UX improvements and new pages
- **Technical Notes** - Design decisions and implementation details
- **Statistics** - Code metrics and commit information
- **Checklist** - Completion status of all items
- **Links** - GitHub commits and live URLs

---

## Contributing

When adding new changelogs:

1. **Naming Convention:** `CHANGELOG-<feature-slug>.md`
2. **Date Format:** "Month DD, YYYY" in title
3. **Update This Index:** Add entry to the list above
4. **Follow Format:** Use existing changelogs as templates
5. **Include Commit Hashes:** Link to GitHub commits
6. **Test Procedures:** Document how to verify changes
7. **Deployment Steps:** Provide clear deployment instructions

---

## Version History

| Date | Changelog | Focus |
|------|-----------|-------|
| 2026-01-30 | Admin Search & Pagination | Admin tooling, scalability, performance |
| 2026-01-30 | Branding Updates - Bluesky Removal | Branding, documentation cleanup |
| 2026-01-25 | Brevo Email Support | Email infrastructure, deliverability |
| 2026-01-25 | Social Profile Claims | New claim type, social verification |
| 2026-01-24 | Security Hardening & MVP Completion | 🎉 MVP complete, security, testing |
| 2026-01-22 | Documentation & Security Hardening | Docs, rate limiting, abuse prevention |
| 2026-01-21 | Admin Enhancements + Critical Bug Fix | 🚨 Account lockout fix, admin tools |
| 2026-01-20 | Production Hardening | Security, monitoring, UX |
| 2026-01-19 | DNS Proof Implementation | New proof type, docs |

---

_For the main project changelog, see the repository root README.md_
