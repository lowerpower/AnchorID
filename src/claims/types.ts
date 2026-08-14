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

export type ClaimStatus = "self_asserted" | "verified" | "failed";

export type ClaimProof =
  | { kind: "well_known"; url: string; mustContain: string; fallbackUrls?: string[] }
  | { kind: "github_readme"; url: string; mustContain: string; fallbackUrls?: string[] }
  | { kind: "dns_txt"; qname: string; expectedToken: string }
  | { kind: "profile_page"; url: string; mustContain: string; fallbackUrls?: string[] };

/**
 * "social" is the legacy name for "public" and still appears in stored records
 * and in accepted API input, so it stays in the union for back-compat.
 */
export type ClaimType = "website" | "github" | "dns" | "public" | "social";

export type Claim = {
  id: string;
  type: ClaimType;
  url: string;
  status: ClaimStatus;
  proof: ClaimProof;
  createdAt: string;
  updatedAt: string;
  lastCheckedAt?: string;
  verifiedAt?: string;
  failReason?: string;
};

