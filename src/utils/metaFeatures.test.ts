/**
 * DETERMINISTIC TESTS — META-LABEL FEATURE HELPERS
 *
 * Locks atrPercentile, h1h4Agreement (mirror of the MTF prompt strings), and
 * minutesToHighImpactNews (same impact vocabulary as the blackout).
 *
 * Run directly:  npx tsx src/utils/metaFeatures.test.ts
 */

import {
  atrPercentile,
  h1h4Agreement,
  minutesToHighImpactNews,
} from "./metaFeatures";

export function runMetaFeaturesTests(): { passed: number; failed: number; errors: string[] } {
  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  const assert = (condition: boolean, msg: string) => {
    if (condition) passed++;
    else {
      failed++;
      errors.push(`Assertion failed: ${msg}`);
      console.error(`❌ [META-FEATURES TEST FAIL] ${msg}`);
    }
  };

  console.log("=== Running Meta-Label Feature Helper Tests ===");

  /* ── ATR percentile ── */
  assert(atrPercentile(5, [1, 2, 3, 4, 5]) === 100, `ATR at top of history = p100`);
  assert(atrPercentile(0.5, [1, 2, 3, 4, 5]) === 0, `ATR below history = p0`);
  assert(atrPercentile(3, [1, 2, 3, 4, 5]) === 60, `ATR mid history = p60`);
  assert(atrPercentile(3, []) === null, `Empty history → null (never impute)`);
  assert(atrPercentile(NaN, [1, 2]) === null, `Non-finite ATR → null`);

  /* ── H1/H4 agreement mirrors the MTF summary strings ── */
  const up = [1, 2, 3, 4, 5];
  const down = [5, 4, 3, 2, 1];
  assert(h1h4Agreement("BUY", up, up) === true, `BUY + rising H1/H4 agrees`);
  assert(h1h4Agreement("SELL", down, down) === true, `SELL + falling H1/H4 agrees`);
  assert(h1h4Agreement("BUY", up, down) === false, `BUY + falling H4 disagrees`);
  assert(h1h4Agreement("SELL", up, up) === false, `SELL + rising frames disagrees`);
  assert(h1h4Agreement("BUY", [1], up) === null, `Missing H1 → null, not false`);
  assert(h1h4Agreement("HOLD", up, up) === null, `HOLD has no side to agree with`);

  /* ── minutes-to-news: vocabulary, currency routing, sign ── */
  const now = Date.UTC(2025, 0, 15, 12, 0, 0);
  const iso = (mins: number) => new Date(now + mins * 60000).toISOString();
  const news = [
    { isoTime: iso(4), impact: "HIGH", currency: "USD", event: "CPI" },
    { isoTime: iso(-30), impact: "HIGH", currency: "USD", event: "NFP" },
    { isoTime: iso(2), impact: "LOW", currency: "USD", event: "noise" },
    { isoTime: iso(1), impact: "HIGH", currency: "JPY", event: "BOJ" },
  ];
  const eur = minutesToHighImpactNews("EURUSDm", news, now);
  assert(eur === 4, `Nearest USD high-impact event is +4 min (got ${eur})`);
  const jpy = minutesToHighImpactNews("USDJPYm", news, now);
  assert(jpy === 1, `JPY cross routes to the BOJ event (got ${jpy})`);
  const aud = minutesToHighImpactNews("AUDUSDm", news, now);
  assert(aud === 4, `AUDUSD (USD leg) routes to USD events (got ${aud})`);
  assert(minutesToHighImpactNews("EURUSDm", [], now) === null, `No news → null`);
  assert(minutesToHighImpactNews("EURUSDm", [{ impact: "LOW", currency: "USD" }], now) === null,
    `Low-impact never qualifies`);
  const pastOnly = minutesToHighImpactNews("EURUSDm",
    [{ isoTime: iso(-30), impact: "HIGH", currency: "USD", event: "NFP" }], now);
  assert(pastOnly === -30, `Released events count negative (got ${pastOnly})`);

  console.log(`=== Meta-Label Feature Helper Tests: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) console.error("Failures:", errors);
  return { passed, failed, errors };
}

// Auto-run if directly executed via tsx
if (typeof process !== "undefined" && process.argv && process.argv[1]?.includes("metaFeatures.test")) {
  const res = runMetaFeaturesTests();
  process.exit(res.failed > 0 ? 1 : 0);
}
