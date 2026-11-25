/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SINGLE SOURCE OF TRUTH — DERIV APP ID
 * ────────────────────────────────────────────────────────────────────────────
 * Why this file exists:
 *   The App ID used to be hardcoded in FIVE conflicting places:
 *     • derivOptionsApi.ts ....... "3420itMJIgnv6A35hHFx9"   (REST + OTP calls)
 *     • DerivWSContext.tsx ....... app_id=71710              (shared socket)
 *     • useDerivMarketFeed.ts .... app_id=71710              (isolated feed)
 *     • DerivTrader.tsx .......... app_id=71710 fallback, dead "1089" const
 *     • DerivRiseFallTrader.tsx .. app_id=71710, dead "1089" const
 *
 *   Deriv identifies an application by ONE App ID. Mixing identities means the
 *   OTP WebSocket URL can be minted under one application while the socket then
 *   connects as another — authentication fails in a way that looks exactly like
 *   a bad token, which is a very expensive thing to misdiagnose.
 *
 * How to set your App ID:
 *   1. Deriv dashboard → Apps → choose "Native apps".
 *      (Native = the PAT / manual-token flow. "Web-based apps" is the OAuth
 *       redirect flow and does NOT accept a Personal Access Token.)
 *   2. Copy the App ID it generates.
 *   3. Either add it to `.env` as VITE_DERIV_APP_ID=... (recommended — `.env`
 *      is gitignored), or replace APP_ID_FALLBACK below.
 *   Use that ONE value for every request. Do not add per-module copies.
 *
 * SECURITY: an App ID is a PUBLIC client identifier — it appears in WebSocket
 * URLs, so it is safe in source. A Personal Access Token / OAuth token is NOT.
 * Never place a token in this file, in source, or in browser storage.
 */

/** Build-time env. Vite injects only VITE_-prefixed variables. */
const ENV_APP_ID: string = import.meta.env?.VITE_DERIV_APP_ID ?? "";

/**
 * ⚠️ REPLACE THIS with your own App ID, or set VITE_DERIV_APP_ID in `.env`.
 * While it still starts with "REPLACE_WITH" the app logs a console warning.
 */
const APP_ID_FALLBACK = "REPLACE_WITH_YOUR_DERIV_APP_ID";

/** The one App ID that every Deriv REST / OTP / WebSocket call must use. */
export const DERIV_APP_ID: string = String(ENV_APP_ID || APP_ID_FALLBACK).trim();

/** True once a real App ID has been supplied (not the placeholder). */
export const isDerivAppIdConfigured = (): boolean =>
  DERIV_APP_ID.length > 0 && !DERIV_APP_ID.startsWith("REPLACE_WITH");

/** Deriv legacy WebSocket gateway (v3 — the one that accepts `authorize`). */
export const DERIV_WS_HOST = "ws.derivws.com";
export const DERIV_LEGACY_WS_PATH = "/websockets/v3";

/** Build a legacy v3 socket URL bound to a specific App ID. */
export function buildDerivLegacyWsUrl(appId: string = DERIV_APP_ID): string {
  return `wss://${DERIV_WS_HOST}${DERIV_LEGACY_WS_PATH}?app_id=${encodeURIComponent(appId)}`;
}

/**
 * Default legacy socket URL. Replaces every old `app_id=71710` / `app_id=1089`
 * literal so the socket always speaks as the same application as the REST layer.
 */
export const DERIV_LEGACY_WS_URL: string = buildDerivLegacyWsUrl();

/**
 * NEW Deriv Options API — PUBLIC market-data socket (migration Phase 1).
 *   wss://api.derivws.com/trading/v1/options/ws/public
 * No app_id and no auth required. Verified empirically: ticks, ticks_history,
 * active_symbols and ping behave exactly like v3, while balance/authorize
 * cleanly reply AuthorizationRequired (account-scoped calls are unavailable
 * here by design). Live trading rides a REST-minted OTP URL instead — see
 * requestAccountOtpUrl() in src/utils/derivOptionsApi.ts. The legacy gateway
 * above must NOT be used as a trading fallback: it currently returns
 * Cloudflare 520 from the app's network, and Deriv support (Amy) has directed
 * us to the new API endpoints.
 */
export const DERIV_OPTIONS_WS_HOST = "api.derivws.com";
export const DERIV_OPTIONS_PUBLIC_WS_PATH = "/trading/v1/options/ws/public";
export const DERIV_PUBLIC_WS_URL: string = `wss://${DERIV_OPTIONS_WS_HOST}${DERIV_OPTIONS_PUBLIC_WS_PATH}`;

if (!isDerivAppIdConfigured()) {
  console.warn(
    "[DERIV CONFIG] No App ID configured. Set VITE_DERIV_APP_ID in .env or edit " +
      "APP_ID_FALLBACK in src/config/derivConfig.ts. PAT authentication (accounts " +
      "list + OTP minting) cannot work without a real App ID."
  );
}