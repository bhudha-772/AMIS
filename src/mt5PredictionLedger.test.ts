/**
 * DETERMINISTIC TESTS — MT5 PREDICTION LEDGER
 *
 * Validates the "place the trade, observe it, and see if we predicted right"
 * loop: recording, horizon-aware resolution (TP hit / SL hit / directional
 * fallback / void), and the calibration statistics that audit Kimi's
 * setupQuality grading.
 *
 * Run directly:  npx tsx src/mt5PredictionLedger.test.ts
 */

import {
  recordPrediction,
  resolvePredictions,
  computePredictionStats,
  listPredictions,
  windowFromCandles,
  __setLedgerStorageForTests,
  __resetLedgerStorageForTests
} from "./mt5PredictionLedger";
import { MT5PredictionRecord } from "./mt5PredictionTypes";

export function runMT5PredictionLedgerTests(): { passed: number; failed: number; errors: string[] } {
  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  const assert = (condition: boolean, msg: string) => {
    if (condition) {
      passed++;
    } else {
      failed++;
      errors.push(`Assertion failed: ${msg}`);
      console.error(`❌ [LEDGER TEST FAIL] ${msg}`);
    }
  };

  console.log("=== Running AMIS MT5 Prediction Ledger Tests ===");

  // In-memory storage so the real data/ folder is never touched.
  let mem: MT5PredictionRecord[] = [];
  __setLedgerStorageForTests({
    load: () => mem.map(r => ({ ...r })),
    save: (records) => { mem = records.map(r => ({ ...r })); }
  });

  const base = {
    symbol: "EURUSDm", direction: "BUY" as const, entryPrice: 1.1000,
    slPrice: 1.0980, tpPrice: 1.1040, slPips: 20, tpPips: 40
  };

  // ── 1. Recording ──
  const rec = recordPrediction({
    ...base,
    source: "KIMI_SETUP_VERIFIED",
    setupQuality: "PERFECT",
    confidencePct: 71,
    reasoning: "Bullish OB + discount zone + confirmed sweep",
    tradeExecuted: true,
    ticket: 555001,
    now: 1_700_000_000_000
  });
  assert(rec.status === "PENDING", "Fresh prediction starts PENDING");
  assert(rec.riskReward === 2, "Risk:reward computed from pip distances (40/20 = 2)");
  assert(listPredictions().length === 1, "Prediction persisted to ledger");

  // ── 2. Horizon gate — nothing resolves before the window elapses ──
  let res = resolvePredictions(() => ({ price: 1.1050, high: 1.1050, low: 1.1050, samples: 3 }), 1_700_000_600_000);
  assert(res.resolved === 0, "Not resolved before horizon (600s < 900s)");
  assert(res.pending === 1, "Still pending inside the horizon window");

  // ── 3. TP touched → WIN ──
  res = resolvePredictions(() => ({ price: 1.1038, high: 1.1042, low: 1.0998, samples: 12 }), 1_700_001_000_000);
  assert(res.resolved === 1, "TP-reached prediction resolved after horizon");
  const scored = listPredictions()[0];
  assert(scored.status === "WIN", "TP touched and SL untouched → WIN");
  assert(scored.tpTouched === true && scored.slTouched === false, "TP/SL touch flags recorded correctly");
  assert(scored.maxFavourablePips === 42, "Max favourable excursion measured in pips (42)");

  // ── 4. SL touched → LOSS ──
  mem = [];
  recordPrediction({
    ...base, source: "KIMI_SETUP_VERIFIED", setupQuality: "HIGH_PROBABILITY",
    confidencePct: 66, tradeExecuted: true, now: 1_700_000_000_000
  });
  resolvePredictions(() => ({ price: 1.0975, high: 1.1005, low: 1.0975, samples: 9 }), 1_700_001_000_000);
  assert(listPredictions()[0].status === "LOSS", "SL touched and TP untouched → LOSS");

  // ── 5. Neither barrier → directional correctness decides ──
  mem = [];
  recordPrediction({
    ...base, source: "JYSR_FALLBACK", setupQuality: "VALID",
    confidencePct: 58, tradeExecuted: false, now: 1_700_000_000_000
  });
  resolvePredictions(() => ({ price: 1.1012, high: 1.1015, low: 1.1001, samples: 5 }), 1_700_001_000_000);
  const directionWin = listPredictions()[0];
  assert(directionWin.status === "WIN", "Neither barrier hit but price moved up on a BUY → WIN");
  assert(directionWin.pipsResult === 12, "Observed pips result computed (+12 pips)");

  mem = [];
  recordPrediction({
    ...base, source: "JYSR_FALLBACK", setupQuality: "VALID",
    confidencePct: 56, tradeExecuted: false, now: 1_700_000_000_000
  });
  resolvePredictions(() => ({ price: 1.0992, high: 1.1004, low: 1.0990, samples: 5 }), 1_700_001_000_000);
  assert(listPredictions()[0].status === "LOSS", "Neither barrier hit but price moved down on a BUY → LOSS");

  // ── 6. SELL side symmetry ──
  mem = [];
  recordPrediction({
    symbol: "USDJPYm", direction: "SELL", entryPrice: 150.00, slPrice: 150.30, tpPrice: 149.40,
    slPips: 30, tpPips: 60, source: "KIMI_SETUP_VERIFIED", setupQuality: "PERFECT",
    confidencePct: 79, tradeExecuted: true, now: 1_700_000_000_000
  });
  resolvePredictions(() => ({ price: 149.35, high: 150.10, low: 149.30, samples: 7 }), 1_700_001_000_000);
  assert(listPredictions()[0].status === "WIN", "SELL prediction with TP touched → WIN");

  // ─ 7. Missing data → VOID (never a false WIN/LOSS) ──
  mem = [];
  recordPrediction({
    ...base, source: "KIMI_SETUP_VERIFIED", setupQuality: "VALID",
    confidencePct: 60, tradeExecuted: false, now: 1_700_000_000_000
  });
  resolvePredictions(() => null, 1_700_001_000_000);
  assert(listPredictions()[0].status === "VOID", "No price data → VOID, not a fabricated result");

  // ── 8. Statistics & per-quality calibration ──
  mem = [];
  const mk = (quality: "PERFECT" | "HIGH_PROBABILITY" | "VALID" | "POOR", executed: boolean, now: number) =>
    recordPrediction({
      ...base, source: "KIMI_SETUP_VERIFIED", setupQuality: quality,
      confidencePct: 70, tradeExecuted: executed, now
    });
  mk("PERFECT", true, 1_700_000_000_000);
  mk("PERFECT", true, 1_700_000_001_000);
  mk("VALID", false, 1_700_000_002_000);

  let call = 0;
  resolvePredictions(() => {
    call++;
    // First two lookups win on TP, third loses on SL.
    if (call <= 2) return { price: 1.1040, high: 1.1041, low: 1.0999, samples: 4 };
    return { price: 1.0970, high: 1.1001, low: 1.0970, samples: 4 };
  }, 1_700_001_000_000);

  const stats = computePredictionStats(listPredictions());
  assert(stats.total === 3, "Stats total counts every recorded prediction");
  assert(stats.wins === 2 && stats.losses === 1, "Stats win/loss split correct (2 wins, 1 loss)");
  assert(stats.hitRatePct === 66.67, `Overall hit-rate 66.67% (got ${stats.hitRatePct})`);
  assert(stats.executedTrades === 2, "Executed-trade count tracks tradeExecuted flag");
  assert(stats.executedHitRatePct === 100, `Executed-only hit-rate 100% (got ${stats.executedHitRatePct})`);
  assert(stats.byQuality.PERFECT.hitRatePct === 100, "PERFECT grade calibration tracked separately");
  assert(stats.byQuality.VALID.hitRatePct === 0, "VALID grade calibration tracked separately");
  assert(stats.expectancyPips !== null && stats.expectancyPips > 0, "Expectancy computed in pips");

  // ── 9. windowFromCandles filters to the observation window ──
  const win = windowFromCandles([
    { time: 1_699_999_000, open: 1.09, high: 1.10, low: 1.08, close: 1.095 },
    { time: 1_700_000_100, open: 1.10, high: 1.1030, low: 1.0990, close: 1.1020 },
    { time: 1_700_000_200, open: 1.1020, high: 1.1045, low: 1.1010, close: 1.1040 }
  ], 1_700_000_000_000);
  assert(win !== null && win.samples === 2, "windowFromCandles ignores candles before the prediction");
  assert(
    win !== null && win.high === 1.1045 && win.low === 1.0990 && win.price === 1.1040,
    "windowFromCandles high/low/last-close correct"
  );

  // ── 10. Meta-label block: features stored, touch/R unresolved at record ──
  mem = [];
  const feat = {
    adx: 28, atrPercentile: 55, sessionGrade: "B" as const, spreadPips: 1.1,
    minutesToNews: 42, jysrConfidence: 81, kimiConfidence: 77,
    kimiGrade: "VALID" as const, h1h4Agree: true, raidFlag: false, patternFlag: true,
  };
  const featRec = recordPrediction({
    ...base, source: "KIMI_SETUP_VERIFIED", setupQuality: "VALID",
    confidencePct: 70, tradeExecuted: true, now: 1_700_000_000_000,
    features: feat,
  });
  assert(featRec.touchOutcome === null && featRec.rMultiple === null,
    "touchOutcome/rMultiple unresolved at record time (never guessed)");
  assert(featRec.features !== null && featRec.features.adx === 28 && featRec.features.sessionGrade === "B",
    "Feature snapshot rides along with the verdict");

  // ── 11. First-touch resolution via candles: TP-first on a BUY ──
  // Entry 1.1000 (t=...000), SL 1.0980, TP 1.1040, spread 1.1 pips.
  const t0 = 1_700_000_000_000;
  const postTP = [
    { time: t0 + 60_000, high: 1.1020, low: 1.0990, close: 1.1010 },
    { time: t0 + 120_000, high: 1.1045, low: 1.1000, close: 1.1041 },
    { time: t0 + 180_000, high: 1.1090, low: 1.0970, close: 1.1000 }, // both after — must be ignored
  ];
  resolvePredictions(
    () => ({ price: 1.1041, high: 1.1045, low: 1.0990, samples: 2 }),
    t0 + 1_000_000,
    () => postTP,
    () => 1.1
  );
  const tpRow = listPredictions()[0];
  assert(tpRow.touchOutcome === "TP_FIRST", `First-touch TP-first recorded (got ${tpRow.touchOutcome})`);
  assert(tpRow.tpTouched === true && tpRow.slTouched === false, "Touch flags follow first touch, not window");
  assert(tpRow.status === "WIN", "TP-first resolves WIN");
  assert(tpRow.rMultiple !== null && Math.abs((tpRow.rMultiple as number) - ((40 - 1.1) / (20 + 1.1))) < 0.01,
    `R net of spread ≈ (40−1.1)/21.1 (got ${tpRow.rMultiple})`);

  // ── 12. First-touch: SL prints on an earlier bar even when TP prints later ──
  mem = [];
  recordPrediction({
    ...base, source: "KIMI_SETUP_VERIFIED", setupQuality: "VALID",
    confidencePct: 70, tradeExecuted: true, now: t0,
  });
  const postSL = [
    { time: t0 + 60_000, high: 1.1010, low: 1.0979, close: 1.0990 }, // SL first
    { time: t0 + 120_000, high: 1.1050, low: 1.0990, close: 1.1041 }, // TP later — ignored
  ];
  resolvePredictions(
    () => ({ price: 1.1041, high: 1.1050, low: 1.0979, samples: 2 }),
    t0 + 1_000_000,
    () => postSL,
    () => 1.1
  );
  const slRow = listPredictions()[0];
  assert(slRow.touchOutcome === "SL_FIRST" && slRow.status === "LOSS",
    `Earlier SL wins over later TP (got ${slRow.touchOutcome}/${slRow.status})`);
  assert(slRow.rMultiple === -1, `SL-first R is exactly −1 (got ${slRow.rMultiple})`);

  // ── 13. Stats carry the first-touch summary ──
  const stats2 = computePredictionStats(listPredictions());
  assert(stats2.tpFirst === 0 && stats2.slFirst === 1 && stats2.timeouts === 0,
    `Stats count first-touch outcomes (TP ${stats2.tpFirst} / SL ${stats2.slFirst} / TO ${stats2.timeouts})`);
  assert(stats2.netR === -1 && stats2.avgRPerTrade === -1,
    `Stats net/avg R reflect the spread-adjusted label (got ${stats2.netR}/${stats2.avgRPerTrade})`);
  assert(stats2.tpFirstRatePct === 0, `TP-first rate 0% on one SL-first row (got ${stats2.tpFirstRatePct})`);

  // ── 14. Legacy rows without candles keep legacy scoring, null touch fields ──
  mem = [];
  recordPrediction({
    ...base, source: "KIMI_SETUP_VERIFIED", setupQuality: "VALID",
    confidencePct: 60, tradeExecuted: false, now: t0,
  });
  resolvePredictions(
    () => ({ price: 1.1038, high: 1.1042, low: 1.0998, samples: 12 }),
    t0 + 1_000_000
    // no candlesFor/spreadFor → legacy window path
  );
  const legRow = listPredictions()[0];
  assert(legRow.status === "WIN" && legRow.touchOutcome === null && legRow.rMultiple === null,
    "Legacy window scoring preserved; touch fields stay unknown, not imputed");
  const stats3 = computePredictionStats(listPredictions());
  assert(stats3.tpFirst === 0 && stats3.slFirst === 0 && stats3.netR === null,
    "Stats stay null-safe when no row has first-touch data");

  __resetLedgerStorageForTests();

  console.log(`=== MT5 Prediction Ledger Tests: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) console.error("Failures:", errors);
  return { passed, failed, errors };
}

// Auto-run if directly executed via tsx
if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('mt5PredictionLedger.test')) {
  const res = runMT5PredictionLedgerTests();
  process.exit(res.failed > 0 ? 1 : 0);
}