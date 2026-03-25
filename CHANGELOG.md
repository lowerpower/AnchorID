# Changelog

All notable changes to AnchorID will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added - 2026-03-25

#### Admin Interface Enhancements: Email Retention, Audit Summaries & Enhanced List View

**Temporary Email Storage (7-day TTL)**
- Store plaintext emails for 7 days after profile creation for spam detection
- New KV key pattern: `email:unhashed:{uuid}` with 604800 second TTL
- Auto-expires via KV TTL, no cleanup required
- Added to both self-service signup and admin creation flows

**Enhanced Admin List View**
- Replaced simple UUID list with rich metadata table showing:
  - UUID (8-char prefix, clickable links)
  - Type badges (👤 Person / 🏢 Organization)
  - Name (or "(unnamed)")
  - Email (obfuscated as `m***l@example.com`)
  - Created date (YYYY-MM-DD format)
  - Modified date (YYYY-MM-DD format)
  - Recent activity (e.g., "2h ago: ✏️ update via magic_link")
- Profiles sorted by most recently modified first
- Parallel loading of all metadata (profiles + emails + audit logs)

**Helper Functions**
- `formatEmailForDisplay()` - Obfuscates emails as `m***l@example.com`
- `formatDate()` - Extracts YYYY-MM-DD from ISO timestamps
- `formatTimeAgo()` - Human-readable relative times ("3h ago", "2d ago")
- `formatAuditSummary()` - Formats recent activity with icons (🆕 create, ✏️ update, 🔄 rotate_token)

**Enhanced Admin Edit Page**
- Shows full unhashed email when available (first 7 days after creation)
- Displays "(visible for 7 days)" note when email is shown
- Falls back to showing only hash after expiration

**Documentation Updates**
- Added `email:unhashed:{uuid}` to KV Key Patterns in CLAUDE.md
- Documented 7-day email retention policy in threat-model.md

**Files Modified**
- `src/index.ts` - Added unhashed email storage to signup flow
- `src/admin/handlers.ts` - Enhanced admin interface with new list view, helper functions, and email display
- `CLAUDE.md` - Updated KV key patterns table
- `docs/threat-model.md` - Documented email retention policy
