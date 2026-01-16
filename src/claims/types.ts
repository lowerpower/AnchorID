// src/claims/types.ts

export type ClaimStatus = "self_asserted" | "verified" | "failed";

export type ClaimProof =
  | { kind: "well_known"; url: string; mustContain: string }
  | { kind: "github_readme"; url: string; mustContain: string };

export type Claim = {
  id: string;
  type: "website" | "github";
  url: string;
  status: ClaimStatus;
  proof: ClaimProof;
  createdAt: string;
  updatedAt: string;
  lastCheckedAt?: string;
  verifiedAt?: string;
  failReason?: string;
};

