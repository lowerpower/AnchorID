// src/claims/types.ts

export type ClaimStatus = "self_asserted" | "verified" | "failed";

export type ClaimProof =
  | { kind: "well_known"; url: string; mustContain: string }
  | { kind: "github_readme"; url: string; mustContain: string }
  | { kind: "dns_txt"; qname: string; expectedToken: string };

export type Claim = {
  id: string;
  type: "website" | "github" | "dns";
  url: string;
  status: ClaimStatus;
  proof: ClaimProof;
  createdAt: string;
  updatedAt: string;
  lastCheckedAt?: string;
  verifiedAt?: string;
  failReason?: string;
};

