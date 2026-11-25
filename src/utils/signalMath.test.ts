/**
 * DETERMINISTIC TESTS — SIGNAL MATH (indicators & SL/TP)
 *
 * Locks the research-backed values into the codebase so a future edit cannot
 * silently revert to the losing configuration (fixed 10/22 stops, cumulative
 * RSI, full-history S/R).
 *
 * Run directly:  npx tsx src/utils/signalMath.test.ts
 */

import {
  computeATR,
  wilderRSI,
  emaValue,
  emaTrend,
  isCounterTrend,
  solveSLTP,
  solveSLTPFromAtrPips,
} from "./signalMath";

export function runSignalMathTests(): { passed: number; failed: number; errors: string[] } {
  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  const assert = (condition: boolean, msg: string) => {
    if (condition) passed++;
    else {
      failed++;
      errors.push(`Assertion failed: ${msg}`);
      console.error(`❌ [SIGNAL-MATH TEST FAIL] ${msg}`);
    }
  };

  console.log("=== Running Signal Math Tests ===");

  /* ── 1. ATR — EURUSD-like M5 candles: flat closes, 0.0008 range ──
     (Flat closes so TR equals bar range exactly; drifting closes add
      legitimate gap terms — that is real ATR behaviour, not a bug.)      */
  const eurCandles = Array.from({ length: 20 }, () => ({
    high: 1.0858,
    low: 1.0850,
    close: 1.0854,
  }));
  const atrEur = computeATR(eurCandles, 14);
  assert(atrEur > 0.0007 && atrEur < 0.0009,
    `EUR ATR ≈ 0.0008 (got ${atrEur.toFixed(6)})`);

  /* ── 2. ATR — gold-like candles: $3 range each ── */
  const goldCandles = Array.from({ length: 20 }, (_, i) => ({
    high: 2650 + 3,
    low: 2650,
    close: 2650 + i * 0.1,
  }));
  const atrGold = computeATR(goldCandles, 14);
  assert(atrGold > 2.9 && atrGold < 3.1,
    `Gold ATR ≈ 3.0 (got ${atrGold.toFixed(2)})`);
  assert(atrGold > atrEur * 1000,
    `Gold ATR is orders of magnitude larger than EUR (adaptive, not fixed)`);

  /* ── 3. WILDER RSI(14) — pure uptrend of 16 bars → overheated high ── */
  const upCloses = Array.from({ length: 20 }, (_, i) => 100 + i * 2);
  assert(wilderRSI(upCloses, 14) >= 90,
    `Relentless uptrend RSI near 100 (got ${wilderRSI(upCloses, 14)})`);

  /* ── 4. WILDER RSI(14) — pure downtrend → cold low ── */
  const dnCloses = Array.from({ length: 20 }, (_, i) => 100 - i * 2);
  assert(wilderRSI(dnCloses, 14) <= 10,
    `Relentless downtrend RSI near 0 (got ${wilderRSI(dnCloses, 14)})`);

  /* ── 5. WILDER RSI(14) — flat market → neutral ~50 ── */
  const flatCloses = Array.from({ length: 30 }, (_, i) =>
    100 + (i % 2 === 0 ? 0.1 : -0.1));
  const flatRsi = wilderRSI(flatCloses, 14);
  assert(flatRsi >= 35 && flatRsi <= 65,
    `Flat market RSI ≈ 50 (got ${flatRsi})`);

  /* ── 6. WILDER RSI — insufficient data → safe neutral 50 ── */
  assert(wilderRSI([1, 2, 3], 14) === 50,
    `Short series returns 50 (got ${wilderRSI([1, 2, 3], 14)})`);

  /* ── 7. WILDER RSI — not a stale full-series cumulative ──
     A sharp V-reversal late in a long series MUST move the RSI.      */
  const longThenDump = [
    ...Array.from({ length: 60 }, (_, i) => 100 + i * 0.2),
    ...Array.from({ length: 14 }, (_, i) => 112 - i * 1.5),
  ];
  assert(wilderRSI(longThenDump, 14) < 50,
    `Late 14-bar dump drags RSI below 50 (got ${wilderRSI(longThenDump, 14)})`);

  /* ── 8. EMA TREND — steady climb → BULLISH ── */
  const climb = Array.from({ length: 60 }, (_, i) => 100 + i * 0.5);
  assert(emaTrend(climb) === "BULLISH",
    `Steady climb is BULLISH (got ${emaTrend(climb)})`);

  /* ── 9. EMA TREND — steady fall → BEARISH ── */
  const fall = Array.from({ length: 60 }, (_, i) => 100 - i * 0.5);
  assert(emaTrend(fall) === "BEARISH",
    `Steady fall is BEARISH (got ${emaTrend(fall)})`);

  /* ── 10. EMA TREND — chop → CONSOLIDATING ── */
  const chop: number[] = [];
  for (let i = 0; i < 60; i++) chop.push(100 + Math.sin(i / 2) * 0.2);
  assert(emaTrend(chop) === "CONSOLIDATING",
    `Sideways chop is CONSOLIDATING (got ${emaTrend(chop)})`);

  /* ── 11. COUNTER-TREND matrix ── */
  assert(isCounterTrend("BUY", "BEARISH") === true, `BUY vs BEARISH blocked`);
  assert(isCounterTrend("SELL", "BULLISH") === true, `SELL vs BULLISH blocked`);
  assert(isCounterTrend("BUY", "BULLISH") === false, `BUY with BULLISH allowed`);
  assert(isCounterTrend("SELL", "BEARISH") === false, `SELL with BEARISH allowed`);
  assert(isCounterTrend("BUY", "CONSOLIDATING") === false, `BUY in chop allowed`);
  assert(isCounterTrend("NEUTRAL", "BEARISH") === false, `NEUTRAL never blocked`);

  /* ── 12. SOLVE SL/TP — EURUSD-like: ATR 0.0008, pip 0.0001 ── */
  const eur = solveSLTP(0.0008, 0.0001, 1.0);
  assert(eur.slPips >= 10 && eur.slPips <= 16,
    `EUR SL is 1.5×ATR ≈ 12p (got ${eur.slPips})`);
  assert(eur.tpPips === eur.slPips * 2,
    `TP is exactly 2×SL (got ${eur.slPips}/${eur.tpPips})`);

  /* ── 13. SOLVE SL/TP — gold-like: ATR $3, pip 0.01 ── */
  const gold = solveSLTP(3.0, 0.01, 3.0);
  assert(gold.slPips > 200,
    `Gold SL scales with ATR, not stuck at 10 (got ${gold.slPips})`);
  assert(gold.tpPips === gold.slPips * 2,
    `Gold TP is exactly 2×SL (got ${gold.tpPips})`);
  assert(gold.slPips !== 10 && gold.tpPips !== 22,
    `Gold is NOT the broken 10/22 (got ${gold.slPips}/${gold.tpPips})`);

  /* ── 14. SOLVE SL/TP — dead-quiet market still respects 2×spread floor ── */
  const quiet = solveSLTP(0.00001, 0.0001, 2.0);
  assert(quiet.slPips >= 5,
    `Quiet-market SL ≥ floor of 5p (got ${quiet.slPips})`);

  /* ── 15. EMA value — known series (sanity of smoothing) ── */
  const ev = emaValue([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3);
  assert(ev > 8 && ev <= 10,
    `EMA(3) of 1..10 trails near 9.x (got ${ev.toFixed(2)})`);

  /* ── 16. FALLBACK PATH — static table value goes through the SAME math ──
     This is the suffix-bug regression test: once XAUUSDm resolves to table
     value 80 (not the default 12), the fallback must produce a wide stop. */
  const goldTable = solveSLTPFromAtrPips(80, 3.0);
  assert(goldTable.slPips > 100,
    `Table fallback for gold gives a wide stop (got ${goldTable.slPips})`);
  assert(goldTable.tpPips === goldTable.slPips * 2,
    `Table fallback TP is exactly 2×SL (got ${goldTable.tpPips})`);
  const eurTable = solveSLTPFromAtrPips(8, 1.0);
  assert(eurTable.slPips === 12,
    `Table fallback for EURUSD gives 8×1.5=12p (got ${eurTable.slPips})`);
  const oldDefault = solveSLTPFromAtrPips(12, 1.0);
  assert(oldDefault.slPips === 18,
    `Old "default 12" path yields 12×1.5=18p — no symbol should hit this via suffix mismatch anymore (got ${oldDefault.slPips})`);

  console.log(`=== Signal Math Tests: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) console.error("Failures:", errors);
  return { passed, failed, errors };
}

// Auto-run if directly executed via tsx
if (typeof process !== "undefined" && process.argv && process.argv[1]?.includes("signalMath.test")) {
  const res = runSignalMathTests();
  process.exit(res.failed > 0 ? 1 : 0);
}

