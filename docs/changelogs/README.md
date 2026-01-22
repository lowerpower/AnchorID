# AnchorID Changelogs

This directory contains detailed changelogs for major feature implementations and production updates.

## Changelogs

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
| 2026-01-21 | Admin Enhancements + Critical Bug Fix | 🚨 Account lockout fix, admin tools |
| 2026-01-20 | Production Hardening | Security, monitoring, UX |
| 2026-01-19 | DNS Proof Implementation | New proof type, docs |

---

_For the main project changelog, see the repository root README.md_
