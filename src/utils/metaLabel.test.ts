/**
 * DETERMINISTIC TESTS — META-LABEL ENGINE
 *
 * Locks the measurement rebuild: first-touch order, spread-adjusted R,
 * reliability/Brier per source, Platt calibration, break-even gate,
 * walk-forward purge+embargo, and filter A/B. Every fixture is hand-built so
 * the suite proves semantics, not data.
 *
 * Run directly:  npx tsx src/utils/metaLabel.test.ts
 */

import {
  TouchCandle,
  resolveFirstTouch,
  rMultipleNet,
  vectorizeFeatures,
  FEATURE_ORDER,
  NO_NEWS_MINUTES,
  reliabilityReport,
  fitPlatt,
  applyPlatt,
  breakEvenProb,
  fitLogistic,
  predictLogistic,
  metaLabelDecision,
  walkForward,
  LabeledRow,
  inNewsBlackout,
  spreadOk,
  atrGateOk,
  armAllows,
  abCompare,
  FilterContext,
} from "./metaLabel";

export function runMetaLabelTests(): { passed: number; failed: number; errors: string[] } {
  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  const assert = (condition: boolean, msg: string) => {
    if (condition) passed++;
    else {
      failed++;
      errors.push(`Assertion failed: ${msg}`);
      console.error(`❌ [META-LABEL TEST FAIL] ${msg}`);
    }
  };

  const close = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

  console.log("=== Running Meta-Label Engine Tests ===");

  const C = (time: number, high: number, low: number, close: number): TouchCandle =>
    ({ time, high, low, close });

  /* ── 1. FIRST-TOUCH: TP prints first on a BUY → TP_FIRST ── */
  const t1 = resolveFirstTouch("BUY", 90, 110, [
    C(1000, 105, 95, 100),
    C(2000, 112, 98, 108),
    C(3000, 120, 80, 100),
  ], 0, 3600);
  assert(t1.outcome === "TP_FIRST" && t1.touchIndex === 1 && t1.barsUsed === 2,
    `BUY touches TP first at bar 1 (got ${t1.outcome}@${t1.touchIndex}, bars ${t1.barsUsed})`);

  /* ── 2. FIRST-TOUCH: SL prints on an earlier bar → SL_FIRST ── */
  const t2 = resolveFirstTouch("BUY", 90, 110, [
    C(1000, 105, 95, 100),
    C(2000, 108, 88, 95),
    C(3000, 120, 95, 115),
  ], 0, 3600);
  assert(t2.outcome === "SL_FIRST" && t2.touchIndex === 1,
    `Earlier SL bar wins over later TP bar (got ${t2.outcome}@${t2.touchIndex})`);

  /* ── 3. SAME-BAR ambiguity → conservative SL_FIRST ── */
  const t3 = resolveFirstTouch("BUY", 90, 110, [C(1000, 115, 85, 100)], 0, 3600);
  assert(t3.outcome === "SL_FIRST",
    `Same-bar both-touch resolves SL_FIRST (got ${t3.outcome})`);

  /* ── 4. TIMEOUT: neither barrier prints before the horizon ── */
  const t4 = resolveFirstTouch("BUY", 90, 110, [
    C(1000, 105, 95, 100),
    C(2000, 108, 92, 105),
  ], 0, 1); // 1s horizon, both bars after the deadline
  assert(t4.outcome === "TIMEOUT" && t4.touchIndex === -1,
    `Post-deadline bars give TIMEOUT (got ${t4.outcome})`);

  /* ── 5. SELL polarity mirrored (low touches TP) ── */
  const t5 = resolveFirstTouch("SELL", 110, 90, [C(1000, 105, 88, 95)], 0, 3600);
  assert(t5.outcome === "TP_FIRST", `SELL TP touched via low (got ${t5.outcome})`);

  /* ── 6. Bars at/before entry are ignored; deadline respected ── */
  const t6 = resolveFirstTouch("BUY", 90, 110, [
    C(0, 200, 10, 100), // contains both levels but time <= entryTimeMs
    C(5000, 112, 95, 108),
  ], 0, 3600);
  assert(t6.outcome === "TP_FIRST" && t6.touchIndex === 1 && t6.barsUsed === 1,
    `Pre-entry bar ignored, first live bar decides (got ${t6.outcome}@${t6.touchIndex}, bars ${t6.barsUsed})`);

  /* ── 7. R NET OF SPREAD: TP_FIRST keeps reward minus cost ── */
  // BUY 100, SL 88 (12 risk), TP 124 (24 reward), 1.2 spread → (24−1.2)/13.2.
  const r1 = rMultipleNet("TP_FIRST", "BUY", 100, 88, 124, 124, 1.2);
  assert(close(r1, (24 - 1.2) / (12 + 1.2), 1e-9),
    `TP_FIRST R = (24−1.2)/13.2 ≈ 1.727 (got ${r1})`);

  /* ── 8. R NET OF SPREAD: SL_FIRST is exactly −1 ── */
  assert(rMultipleNet("SL_FIRST", "BUY", 100, 88, 124, 88, 1.2) === -1,
    `SL_FIRST R is exactly −1`);

  /* ── 9. R NET OF SPREAD: TIMEOUT is fractional drift minus cost ── */
  const r3 = rMultipleNet("TIMEOUT", "BUY", 100, 88, 124, 106, 1.2);
  assert(close(r3, (6 - 1.2) / 13.2, 1e-9),
    `TIMEOUT drift +6 → (6−1.2)/13.2 ≈ 0.364 (got ${r3})`);

  /* ── 10. BREAK-EVEN INCLUDES COST: SL12/TP24/cost1.2 → ~0.367, not 0.333 ── */
  const be = breakEvenProb(12, 24, 1.2);
  assert(close(be, 13.2 / 36, 1e-9),
    `Break-even = 13.2/36 ≈ 0.3667 (got ${be})`);
  assert(Math.abs(be - 1 / 3) > 0.03,
    `Cost moves break-even materially off naive 1/(1+2) (got ${be})`);

  /* ── 11. VECTORIZER: full snapshot → fixed 11-field order ── */
  const v = vectorizeFeatures({
    adx: 28, atrPercentile: 55, sessionGrade: "B", spreadPips: 1.1,
    minutesToNews: 42, jysrConfidence: 81, kimiConfidence: 77,
    kimiGrade: "VALID", h1h4Agree: true, raidFlag: false, patternFlag: true,
  });
  assert(v !== null && v.length === FEATURE_ORDER.length,
    `Full snapshot vectorizes to ${FEATURE_ORDER.length} fields`);
  assert(v !== null && v[2] === 2 && v[7] === 2 && v[8] === 1 && v[9] === 0 && v[10] === 1,
    `Grade/flag ordinals correct (B→2, VALID→2, agree→1, raid→0, pattern→1)`);
  assert(v !== null && v[4] === 42, `minutesToNews passes through`);

  /* ── 12. VECTORIZER: null news → sentinel; any other gap → null ── */
  const vNews = vectorizeFeatures({
    adx: 28, atrPercentile: 55, sessionGrade: "A", spreadPips: 1.0,
    minutesToNews: null, jysrConfidence: 80, kimiConfidence: 75,
    kimiGrade: "HIGH_PROBABILITY", h1h4Agree: false, raidFlag: false, patternFlag: false,
  });
  assert(vNews !== null && vNews[4] === NO_NEWS_MINUTES,
    `Null news maps to sentinel (got ${vNews && vNews[4]})`);
  const vGap = vectorizeFeatures({
    adx: null, atrPercentile: 55, sessionGrade: "A", spreadPips: 1.0,
    minutesToNews: null, jysrConfidence: 80, kimiConfidence: 75,
    kimiGrade: "VALID", h1h4Agree: true, raidFlag: false, patternFlag: false,
  });
  assert(vGap === null, `Incomplete rows are dropped, never imputed`);

  /* ── 13. BRIER: perfect forecaster scores 0, coin scores 0.25 ── */
  const perfect = reliabilityReport([
    { confidencePct: 100, tpFirst: 1 }, { confidencePct: 100, tpFirst: 1 },
    { confidencePct: 0, tpFirst: 0 }, { confidencePct: 0, tpFirst: 0 },
  ]);
  assert(perfect.brier === 0, `Perfect forecaster Brier = 0 (got ${perfect.brier})`);
  const coin = reliabilityReport([
    { confidencePct: 50, tpFirst: 1 }, { confidencePct: 50, tpFirst: 0 },
    { confidencePct: 50, tpFirst: 1 }, { confidencePct: 50, tpFirst: 0 },
  ]);
  assert(coin.brier !== null && close(coin.brier, 0.25, 1e-9),
    `Coin-flip Brier = 0.25 baseline (got ${coin.brier})`);

  /* ── 14. RELIABILITY BINS: overconfident engine exposed per bin ── */
  const over = reliabilityReport([
    { confidencePct: 90, tpFirst: 0 }, { confidencePct: 92, tpFirst: 0 },
    { confidencePct: 91, tpFirst: 1 }, { confidencePct: 93, tpFirst: 0 },
  ]);
  const topBin = over.bins[9];
  assert(topBin.n === 4 && topBin.observedRate !== null && close(topBin.observedRate, 0.25, 1e-9),
    `90s bin shows 25% observed vs ~91% stated (got ${topBin.observedRate})`);
  assert(topBin.meanStated !== null && topBin.meanStated > 0.9,
    `Bin records its own stated mean (got ${topBin.meanStated})`);

  /* ── 15. PLATT: refuses tiny samples, calibrates monotone signal ── */
  assert(fitPlatt([{ score: 80, label: 1 }]) === null,
    `Platt refuses <10 rows`);
  const plattRows: Array<{ score: number; label: 0 | 1 }> = [];
  for (let i = 0; i < 30; i++) {
    plattRows.push({ score: 80 + (i % 10), label: i % 3 === 0 ? 0 : 1 });
    plattRows.push({ score: 30 + (i % 10), label: i % 4 === 0 ? 1 : 0 });
  }
  const platt = fitPlatt(plattRows);
  assert(platt !== null, `Platt fits 60 mixed rows`);
  if (platt) {
    const lo = applyPlatt(platt, 30);
    const hi = applyPlatt(platt, 85);
    assert(hi > lo, `Calibrated P rises with raw score (${lo.toFixed(3)} → ${hi.toFixed(3)})`);
    assert(lo >= 0 && lo <= 1 && hi >= 0 && hi <= 1, `Calibrated outputs stay in [0,1]`);
  }

  /* ── 16. META-LABEL: refuses <30 rows; learns a separable gate ── */
  assert(fitLogistic([{ x: new Array(11).fill(1), label: 1 }]) === null,
    `Logistic refuses <30 rows`);
  // Synthetic separable world: label = 1 iff adx (field 0) is high.
  const gateRows: Array<{ x: number[]; label: 0 | 1 }> = [];
  const mkx = (adx: number): number[] =>
    [adx, 50, 2, 1.0, NO_NEWS_MINUTES, 75, 75, 2, 1, 0, 0];
  for (let i = 0; i < 25; i++) gateRows.push({ x: mkx(45), label: 1 });
  for (let i = 0; i < 25; i++) gateRows.push({ x: mkx(12), label: 0 });
  const gate = fitLogistic(gateRows);
  assert(gate !== null, `Logistic fits 50 separable rows`);
  if (gate) {
    const dGood = metaLabelDecision(gate, mkx(45), 12, 24, 1.2, 0.05);
    const dBad = metaLabelDecision(gate, mkx(12), 12, 24, 1.2, 0.05);
    assert(dGood.trade === true && dBad.trade === false,
      `Gate takes high-ADX and rejects low-ADX (p ${dGood.probability.toFixed(3)} vs ${dBad.probability.toFixed(3)}, threshold ${dGood.threshold.toFixed(3)})`);
    assert(close(dGood.threshold, 13.2 / 36 + 0.05, 1e-9),
      `Threshold = break-even + margin (got ${dGood.threshold})`);
  }

  /* ── 17. WALK-FORWARD: purge removes overlap, embargo skips the head ── */
  const wfRows: LabeledRow[] = [];
  const base = 1_700_000_000_000;
  for (let i = 0; i < 40; i++) {
    const t = base + i * 600_000; // 10 min apart, 15-min horizons overlap
    const x = [30, 50, 2, 1.0, NO_NEWS_MINUTES, 75, 75, 2, 1, 0, 0];
    wfRows.push({
      entryTimeMs: t, horizonSec: 900, x,
      label: (i % 2) as 0 | 1, rMultiple: i % 2 === 1 ? 1.7 : -1,
      slPips: 12, tpPips: 24, costPips: 1.2,
    });
  }
  const wf = walkForward(wfRows, { folds: 2, embargoSec: 3600, margin: 0.0, minTrainRows: 10 });
  assert(wf.folds.length === 2, `Two folds produced`);
  assert(wf.folds.every(f => f.purgedRows > 0),
    `Purge removed overlapping train rows (${wf.folds.map(f => f.purgedRows).join("/")})`);
  assert(wf.folds.every(f => f.embargoedRows > 0),
    `Embargo skipped test heads (${wf.folds.map(f => f.embargoedRows).join("/")})`);
  assert(wf.evaluatedRows < wfRows.length,
    `Evaluated set is smaller than raw rows (purge+embargo removed ${wfRows.length - wf.evaluatedRows})`);
  const wfEmpty = walkForward([], { folds: 2 });
  assert(wfEmpty.evaluatedRows === 0 && wfEmpty.takenTrades === 0 && wfEmpty.netRPerTrade === null,
    `Empty input yields an empty summary, not a crash`);

  /* ── 18. FILTERS: blackout, spread cap, ATR gate ── */
  const hiNews: FilterContext = {
    minutesToNews: 3, newsEventName: "FOMC rate decision", newsImpact: "high",
    spreadPips: 1.0, slPips: 12, atrPercentile: 50,
    counterTrendBlocked: false, h1h4Agree: true,
  };
  assert(inNewsBlackout(hiNews) === true, `High-impact news at T−3 min is blacked out`);
  assert(inNewsBlackout({ ...hiNews, minutesToNews: 40 }) === false,
    `40 min after a rate decision the extended window has passed`);
  assert(inNewsBlackout({ ...hiNews, minutesToNews: 20 }) === true,
    `Rate decisions extend the blackout (T+20 still blocked)`);
  assert(inNewsBlackout({ ...hiNews, newsImpact: "low", minutesToNews: 1 }) === false,
    `Low-impact news never triggers the blackout`);
  const calm: FilterContext = {
    minutesToNews: null, spreadPips: 1.0, slPips: 12, atrPercentile: 50,
    counterTrendBlocked: false, h1h4Agree: true,
  };
  assert(spreadOk(calm) === true, `1.0p spread on a 12p stop passes the cap`);
  assert(spreadOk({ ...calm, spreadPips: 4.0 }) === false,
    `4.0p spread on a 12p stop fails the cap (>12/4)`);
  assert(atrGateOk(calm) === true, `ATR p50 passes the 10–90 gate`);
  assert(atrGateOk({ ...calm, atrPercentile: 5 }) === false, `ATR p5 is dead chop`);
  assert(atrGateOk({ ...calm, atrPercentile: 97 }) === false, `ATR p97 is chaos`);

  /* ── 19. A/B: arms are blackout-first, trend/vol reported separately ── */
  const abRows = [
    { ctx: calm, rMultiple: 1.7 },
    { ctx: { ...calm, counterTrendBlocked: true, spreadPips: 9.0, atrPercentile: 3 }, rMultiple: -1 },
    { ctx: hiNews, rMultiple: 1.7 }, // blackout removes this winner everywhere
  ];
  const arms = abCompare(abRows);
  const byArm = Object.fromEntries(arms.map(a => [a.arm, a]));
  assert(byArm.base.rows === 2, `Base takes non-blackout rows (got ${byArm.base.rows})`);
  assert(byArm.plusTrend.rows === 1 && close(byArm.plusTrend.rSum, 1.7, 1e-9),
    `+trend keeps only the agreeing winner (got ${byArm.plusTrend.rows}, R ${byArm.plusTrend.rSum})`);
  assert(byArm.plusVol.rows === 1 && close(byArm.plusVol.rSum, 1.7, 1e-9),
    `+vol keeps only the cheap-spread winner (got ${byArm.plusVol.rows}, R ${byArm.plusVol.rSum})`);
  assert(byArm.both.rows === 1 && (byArm.both.netRPerTrade as number) > (byArm.base.netRPerTrade as number),
    `Both-filters arm beats base per trade on this fixture`);
  assert(armAllows("base", { ctx: hiNews, rMultiple: 1.7 }) === false,
    `Blackout binds every arm, including base`);

  console.log(`=== Meta-Label Engine Tests: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) console.error("Failures:", errors);
  return { passed, failed, errors };
}

// Auto-run if directly executed via tsx
if (typeof process !== "undefined" && process.argv && process.argv[1]?.includes("metaLabel.test")) {
  const res = runMetaLabelTests();
  process.exit(res.failed > 0 ? 1 : 0);
}



