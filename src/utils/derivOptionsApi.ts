/**
 * Deriv Options REST & WebSocket API Utility
 * Implements the official Deriv Options API v1 endpoints specified at https://developers.deriv.com/
 */

import { DERIV_APP_ID, DERIV_PUBLIC_WS_URL } from "../config/derivConfig";

export const DERIV_REST_BASE_URL = "https://api.derivws.com";

/**
 * Strip the `?otp=` session credential before a URL can reach the console.
 * Deriv support (Amy) guidance: never put the PAT — or anything derived from
 * it — into browser logs, because logs end up in screenshots and chat
 * messages. The `otp` query value IS a live session credential.
 */
export function redactDerivUrl(url: unknown): string {
  return String(url).replace(/([?&]otp=)[^&]+/, "$1[REDACTED]");
}

/**
 * Build a descriptive, credential-safe Error from a failed Deriv REST response.
 * The server's own `errors[0].message` is safe to surface (Deriv never echoes
 * the Authorization header back), and the hint maps the common failure modes
 * the user actually hits: a revoked/wrong PAT vs. a wrong App ID.
 */
async function derivRestError(res: Response, what: string): Promise<Error> {
  let detail = "";
  // Read as TEXT first: Deriv's REST layer returns plain-text bodies (verified
  // live: "Invalid token format" for a bad PAT), and calling res.json() first
  // consumes the stream so a fallback read would fail.
  let raw = "";
  try {
    raw = await res.text();
  } catch {
    /* empty/unreadable body — status code alone has to do */
  }
  if (raw) {
    try {
      const body = JSON.parse(raw);
      const first = body?.errors?.[0];
      if (first && first.message) detail = `: ${first.message}`;
      else if (typeof body?.message === "string") detail = `: ${body.message}`;
    } catch {
      // Plain-text error body — safe to surface (Deriv never echoes the
      // Authorization header); truncate so a huge HTML error page can't flood
      // the UI.
      detail = `: ${raw.trim().slice(0, 200)}`;
    }
  }
  let hint = "";
  if (res.status === 401 || res.status === 403) {
    hint =
      " — check the PAT: it must be a Personal Access Token from developers.deriv.com with the Options/trade scope, and not revoked";
  } else if (res.status === 400 || res.status === 404) {
    hint = " — check the App ID matches your application on developers.deriv.com";
  }
  return new Error(`${what} failed (HTTP ${res.status})${detail}${hint}`);
}

// Public market-data socket URL lives in derivConfig (single source of truth).
// Re-exported here so existing imports keep working.
export { DERIV_APP_ID, DERIV_PUBLIC_WS_URL };

export interface DerivOptionAccount {
  account_id: string;
  account_type?: "demo" | "real";
  currency?: string;
  balance?: number;
  is_disabled?: boolean;
}

export interface OtpResponse {
  data?: {
    url: string;
    otp: string;
  };
  errors?: Array<{
    status: number;
    code: string;
    message: string;
  }>;
}

/**
 * Fetch all Options trading accounts for the authenticated user
 * GET https://api.derivws.com/trading/v1/options/accounts
 */
export async function fetchOptionsAccounts(bearerToken: string): Promise<DerivOptionAccount[]> {
  if (!bearerToken || !bearerToken.trim()) return [];
  const cleanToken = bearerToken.trim().replace(/^["']|["']$/g, "");

  // Failures THROW with the server's own reason instead of silently returning
  // []. Otherwise a revoked PAT is indistinguishable from "user has no
  // accounts" and the real 401 never reaches the UI. Every call site already
  // runs in a try/catch (DerivTrader.handleAuthorizeToken / mintFreshOtpUrl,
  // Rise/Fall mint effect / mintFreshOtp), where the message lands in authError.
  let res: Response;
  try {
    res = await fetch(`${DERIV_REST_BASE_URL}/trading/v1/options/accounts`, {
      method: "GET",
      headers: {
        "Deriv-App-ID": DERIV_APP_ID,
        "Authorization": `Bearer ${cleanToken}`,
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    console.error("[DERIV REST] fetchOptionsAccounts unreachable:", err);
    throw new Error(
      `Deriv accounts request unreachable (GET /trading/v1/options/accounts): ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!res.ok) {
    const error = await derivRestError(res, "Deriv accounts request (GET /trading/v1/options/accounts)");
    console.warn("[DERIV REST] fetchOptionsAccounts:", error.message);
    throw error;
  }

  try {
    const data = await res.json();
    return data.accounts || data.data || [];
  } catch {
    // 200 with an unparseable body is an API anomaly — surface it instead of
    // letting callers report it as "No accounts found".
    throw new Error("Deriv accounts response was malformed (expected JSON with an accounts array)");
  }
}

/**
 * Generate a 120-second One-Time Password (OTP) and authenticated WebSocket URL
 * POST https://api.derivws.com/trading/v1/options/accounts/{accountId}/otp
 */
export async function requestAccountOtpUrl(accountId: string, bearerToken: string): Promise<string | null> {
  if (!accountId || !bearerToken) return null;
  const cleanToken = bearerToken.trim().replace(/^["']|["']$/g, "");

  // Same contract as fetchOptionsAccounts: THROW the server's reason instead
  // of a silent null — callers would otherwise turn every failure (bad PAT,
  // wrong App ID, expired account) into the same generic "no OTP" message.
  let res: Response;
  try {
    res = await fetch(`${DERIV_REST_BASE_URL}/trading/v1/options/accounts/${encodeURIComponent(accountId)}/otp`, {
      method: "POST",
      headers: {
        "Deriv-App-ID": DERIV_APP_ID,
        "Authorization": `Bearer ${cleanToken}`,
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    console.error("[DERIV REST] requestAccountOtpUrl unreachable:", err);
    throw new Error(
      `Deriv OTP request unreachable (POST /trading/v1/options/accounts/{id}/otp): ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!res.ok) {
    const error = await derivRestError(res, "Deriv OTP request (POST /trading/v1/options/accounts/{id}/otp)");
    console.warn("[DERIV REST] requestAccountOtpUrl:", error.message);
    throw error;
  }

  let data: OtpResponse;
  try {
    data = await res.json();
  } catch {
    throw new Error("Deriv OTP response was malformed (expected data.url)");
  }
  if (data.data && data.data.url) {
    console.log(`[DERIV REST] OTP generated successfully. Scoped WS URL: ${redactDerivUrl(data.data.url)}`);
    return data.data.url;
  }
  const apiMessage = data.errors && data.errors[0] && data.errors[0].message;
  throw new Error(
    apiMessage ? `Deriv OTP request rejected: ${apiMessage}` : "Deriv OTP response contained no WebSocket URL"
  );
}

/**
 * Reset balance for Demo Options trading account to $10,000.00 USD
 * POST https://api.derivws.com/trading/v1/options/accounts/{accountId}/reset-demo-balance
 */
export async function resetDemoAccountBalance(accountId: string, bearerToken: string): Promise<boolean> {
  if (!accountId || !bearerToken) return false;
  const cleanToken = bearerToken.trim().replace(/^["']|["']$/g, "");

  try {
    const res = await fetch(`${DERIV_REST_BASE_URL}/trading/v1/options/accounts/${encodeURIComponent(accountId)}/reset-demo-balance`, {
      method: "POST",
      headers: {
        "Deriv-App-ID": DERIV_APP_ID,
        "Authorization": `Bearer ${cleanToken}`,
        "Content-Type": "application/json",
      },
    });

    if (res.status === 200 || res.status === 204) {
      console.log(`[DERIV REST] Demo balance reset successfully for account ${accountId}`);
      return true;
    }
    return false;
  } catch (err) {
    console.error("[DERIV REST] resetDemoAccountBalance error:", err);
    return false;
  }
}
