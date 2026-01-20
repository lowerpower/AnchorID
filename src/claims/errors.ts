// src/claims/errors.ts
// User-friendly error messages and troubleshooting hints for claim verification

export interface ErrorInfo {
  message: string;
  hint?: string;
  docLink?: string;
}

/**
 * Maps error codes to user-friendly messages with troubleshooting hints
 */
export function getErrorInfo(failReason: string): ErrorInfo {
  // DNS-specific errors
  if (failReason.startsWith("doh_status:")) {
    const status = failReason.split(":")[1];
    return {
      message: `DNS lookup service returned HTTP ${status}`,
      hint: "This is a temporary issue with the DNS resolver. Please try again in a few minutes.",
    };
  }

  if (failReason.startsWith("dns_status:")) {
    const status = failReason.split(":")[1];
    const dnsStatusMap: Record<string, ErrorInfo> = {
      "1": {
        message: "DNS query format error",
        hint: "The domain name may be invalid. Check for typos or invalid characters.",
      },
      "2": {
        message: "DNS server failure",
        hint: "The DNS server encountered an error. This is temporary - try again in a few minutes.",
      },
      "3": {
        message: "Domain does not exist (NXDOMAIN)",
        hint: "The domain name doesn't exist. Check spelling and ensure DNS records are published.",
      },
      "4": {
        message: "DNS query not supported",
        hint: "The DNS server doesn't support this query type. Contact your DNS provider.",
      },
      "5": {
        message: "DNS query refused",
        hint: "The DNS server refused the query. Check your DNS provider's configuration.",
      },
    };

    return dnsStatusMap[status] || {
      message: `DNS error (status ${status})`,
      hint: "An unexpected DNS error occurred. Please try again later.",
    };
  }

  if (failReason === "no_txt_records") {
    return {
      message: "No TXT records found",
      hint: "The DNS TXT record hasn't been added yet, or DNS changes haven't propagated. Wait 5-10 minutes after adding the record, then try again.",
      docLink: "/proofs#dns",
    };
  }

  if (failReason === "timeout") {
    return {
      message: "DNS query timed out",
      hint: "The DNS server took too long to respond. This is usually temporary - try again in a minute.",
    };
  }

  if (failReason.startsWith("fetch_error:")) {
    const detail = failReason.split(":").slice(1).join(":");
    return {
      message: "Network error during DNS lookup",
      hint: `Could not connect to DNS server: ${detail}. This is usually temporary.`,
    };
  }

  // Proof verification errors
  if (failReason === "proof_not_found") {
    return {
      message: "Proof not found",
      hint: "The proof file exists but doesn't contain your AnchorID. Check that you copied the correct URL or UUID.",
      docLink: "/proofs",
    };
  }

  if (failReason.startsWith("fetch_failed:")) {
    const status = failReason.split(":")[1];
    if (status === "404") {
      return {
        message: "Proof file not found (HTTP 404)",
        hint: "The proof file doesn't exist at the expected location. Check that you've published the file and the URL is correct.",
        docLink: "/proofs",
      };
    }
    if (status === "403") {
      return {
        message: "Access denied (HTTP 403)",
        hint: "The web server is blocking access to the proof file. Check file permissions and .htaccess rules.",
        docLink: "/proofs#website",
      };
    }
    if (status === "500" || status === "502" || status === "503") {
      return {
        message: `Server error (HTTP ${status})`,
        hint: "The web server is experiencing issues. This is temporary - try again in a few minutes.",
      };
    }
    return {
      message: `HTTP error ${status}`,
      hint: "The web server returned an error. Check that the URL is correct and the server is working.",
    };
  }

  // Configuration errors
  if (failReason === "invalid_proof_kind") {
    return {
      message: "Invalid proof configuration",
      hint: "The claim has an invalid proof type. This shouldn't happen - please report this issue.",
    };
  }

  if (failReason === "invalid_expected_token") {
    return {
      message: "Invalid verification token",
      hint: "The claim has an invalid UUID format. This shouldn't happen - please report this issue.",
    };
  }

  if (failReason === "kv_not_available") {
    return {
      message: "Storage service unavailable",
      hint: "Internal service error. Please try again in a few minutes.",
    };
  }

  if (failReason === "unknown_claim_type") {
    return {
      message: "Unsupported claim type",
      hint: "This claim type is not supported. Use 'website', 'github', or 'dns'.",
    };
  }

  if (failReason === "dns_query_failed") {
    return {
      message: "DNS query failed",
      hint: "Could not query DNS for the TXT record. This may be a temporary network issue - try again.",
    };
  }

  if (failReason.startsWith("verify_error:")) {
    const detail = failReason.split(":").slice(1).join(":");
    return {
      message: "Verification error",
      hint: `An unexpected error occurred: ${detail}`,
    };
  }

  // Generic fallback
  return {
    message: failReason || "Unknown error",
    hint: "An unexpected error occurred. Please try again or contact support if the issue persists.",
  };
}

/**
 * Formats error for display in HTML
 */
export function formatErrorHtml(failReason: string): string {
  const info = getErrorInfo(failReason);
  let html = `<strong>${escapeHtml(info.message)}</strong>`;

  if (info.hint) {
    html += `<br><span style="font-weight:normal">${escapeHtml(info.hint)}</span>`;
  }

  if (info.docLink) {
    html += `<br><a href="${escapeHtml(info.docLink)}" style="font-size:11px">View documentation →</a>`;
  }

  return html;
}

/**
 * Formats error for plain text display
 */
export function formatErrorText(failReason: string): string {
  const info = getErrorInfo(failReason);
  let text = info.message;

  if (info.hint) {
    text += `\n\n${info.hint}`;
  }

  if (info.docLink) {
    text += `\n\nDocumentation: https://anchorid.net${info.docLink}`;
  }

  return text;
}

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
