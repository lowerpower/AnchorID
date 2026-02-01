# AnchorID Proofs Documentation

This directory contains detailed user-facing documentation for each AnchorID proof type.

## Available Proofs

### [Website Proof](./website.md)
Prove ownership of a website by publishing a file at `/.well-known/anchorid.txt`

**Signal strength:** Strong
**Best for:** Personal sites, company websites, project homepages

### [DNS Proof](./dns.md)
Prove ownership of a domain by publishing a DNS TXT record

**Signal strength:** Strong
**Best for:** Organizations, domain owners, combined with website proof

### [GitHub Proof](./github.md)
Prove ownership of a GitHub account by adding AnchorID to profile README

**Signal strength:** Good
**Best for:** Developers, open source contributors, technical identity

### [Social Profile Proof](./social.md)
Prove ownership of a social profile by adding AnchorID to your bio

**Signal strength:** Good
**Best for:** Mastodon/Fediverse, forums, community platforms, social presence

## Overview

For a high-level introduction to proofs, see the main proofs page:
- **Web:** https://anchorid.net/proofs
- **Source:** `/src/content/proofs.html`

## Documentation Structure

- `website.md` - Detailed website proof guide
- `dns.md` - Detailed DNS proof guide
- `github.md` - Detailed GitHub proof guide
- `social.md` - Detailed social profile proof guide
- `README.md` - This file

## Technical Specifications

For implementation details, see:
- `docs/specs/dns-proof-v1.md` - DNS proof specification (developer-focused)

## Contributing

When updating proof documentation:
1. Edit the markdown files in this directory
2. Keep language clear and user-focused
3. Include troubleshooting sections
4. Provide concrete examples
5. Update the main `/proofs` page if needed
