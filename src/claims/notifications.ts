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

/**
 * Email notifications for claim verification.
 */

import type { Claim } from "./types";
import type { Env } from "../env";
import { sendEmail, hasEmailConfig } from "../email";
import { getErrorInfo } from "./errors";

/**
 * Send notification email when a claim is verified successfully
 */
export async function sendClaimVerifiedEmail(
  env: Env,
  email: string,
  uuid: string,
  claim: Claim
): Promise<void> {
  if (!hasEmailConfig(env)) return;

  const claimTypeLabel = claim.type.toUpperCase();
  const subject = `✓ ${claimTypeLabel} Claim Verified - AnchorID`;

  const message = [
    `Good news! Your ${claimTypeLabel} identity claim has been verified.`,
    "",
    `Claim: ${claim.url}`,
    `Type: ${claim.type}`,
    `Verified: ${claim.verifiedAt || "just now"}`,
    "",
    "This claim is now included in your public sameAs links and strengthens your identity.",
    "",
    `View your identity: https://anchorid.net/resolve/${uuid}`,
    `View all claims: https://anchorid.net/claims/${uuid}`,
    "",
    "---",
    "To disable these notifications, contact support.",
  ].join("\n");

  try {
    await sendEmail(env, email, subject, message);
  } catch (e) {
    // Log error but don't fail the verification
    console.error("Failed to send verification success email:", e);
  }
}

/**
 * Send notification email when a claim verification fails
 */
export async function sendClaimFailedEmail(
  env: Env,
  email: string,
  uuid: string,
  claim: Claim
): Promise<void> {
  if (!hasEmailConfig(env)) return;

  const claimTypeLabel = claim.type.toUpperCase();
  const subject = `✗ ${claimTypeLabel} Claim Verification Failed - AnchorID`;

  // Get user-friendly error message
  const errorInfo = getErrorInfo(claim.failReason || "unknown_error");

  const message = [
    `Your ${claimTypeLabel} identity claim verification failed.`,
    "",
    `Claim: ${claim.url}`,
    `Type: ${claim.type}`,
    `Last checked: ${claim.lastCheckedAt || "just now"}`,
    "",
    `Error: ${errorInfo.message}`,
    "",
    errorInfo.hint ? `${errorInfo.hint}` : "",
    errorInfo.hint ? "" : undefined,
    errorInfo.docLink ? `Documentation: https://anchorid.net${errorInfo.docLink}` : "",
    errorInfo.docLink ? "" : undefined,
    "---",
    "",
    "What to do:",
    "1. Review the error message and fix the issue",
    "2. Verify your claim again at https://anchorid.net/admin",
    "",
    `View all claims: https://anchorid.net/claims/${uuid}`,
    `Edit your profile: https://anchorid.net/login`,
    "",
    "---",
    "To disable these notifications, contact support.",
  ].filter(line => line !== undefined).join("\n");

  try {
    await sendEmail(env, email, subject, message);
  } catch (e) {
    // Log error but don't fail the verification
    console.error("Failed to send verification failure email:", e);
  }
}

/**
 * Check if notifications are enabled and email is available
 */
export function shouldSendNotification(env: Env, email: string | null | undefined): boolean {
  if (env.ENABLE_CLAIM_NOTIFICATIONS !== "true") return false;
  if (!email || !email.trim()) return false;
  if (!hasEmailConfig(env)) return false;
  return true;
}
