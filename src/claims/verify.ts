// src/claims/verify.ts
import type { Claim, ClaimProof, ClaimStatus } from "./types";

export function claimIdForWebsite(url: string): string {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return `website:${h}`;
  } catch {
    return `website:${url}`;
  }
}

export function claimIdForGitHub(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const user = (parts[0] || "").toLowerCase();
    return user ? `github:${user}` : `github:${url}`;
  } catch {
    return `github:${url}`;
  }
}

export function buildWellKnownProof(domainOrUrl: string, resolverUrl: string): ClaimProof {
  let host = domainOrUrl;
  try {
    if (domainOrUrl.includes("://")) host = new URL(domainOrUrl).hostname;
  } catch {}
  host = host.toLowerCase();
  return {
    kind: "well_known",
    url: `https://${host}/.well-known/anchorid.txt`,
    mustContain: resolverUrl,
  };
}

export function buildGitHubReadmeProof(githubProfileUrl: string, resolverUrl: string): ClaimProof {
  let user = "";
  try {
    const u = new URL(githubProfileUrl);
    const parts = u.pathname.split("/").filter(Boolean);
    user = (parts[0] || "").toLowerCase();
  } catch {}

  const raw = user
    ? `https://raw.githubusercontent.com/${user}/${user}/main/README.md`
    : githubProfileUrl;

  return { kind: "github_readme", url: raw, mustContain: resolverUrl };
}

async function fetchText(url: string): Promise<{ ok: boolean; status: number; text: string }> {
  const r = await fetch(url, {
    method: "GET",
    headers: {
      "user-agent": "AnchorID-ClaimVerifier/1.0",
      accept: "text/plain,text/*;q=0.9,*/*;q=0.1",
    },
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, text };
}

export async function verifyClaim(
  claim: Claim
): Promise<{ status: ClaimStatus; failReason?: string }> {
  const { ok, status, text } = await fetchText(claim.proof.url);

  if (!ok) return { status: "failed", failReason: `fetch_failed:${status}` };
  if (text.includes(claim.proof.mustContain)) return { status: "verified" };

  return { status: "failed", failReason: "proof_not_found" };
}



