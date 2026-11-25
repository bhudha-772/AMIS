/**
 * DETERMINISTIC TESTS — CALIBRATION BUNDLE
 *
 * Locks the glue between the resolved ledger and the live gate: row-label
 * discipline (drop unresolved/incomplete, never impute), per-engine Platt fit
 * on TP-first, the logistic meta-gate, and the walk-forward honest check.
 * Every fixture is hand-built so the suite proves semantics, not data.
 *
 * Run directly:  npx tsx src/utils/calibration.test.ts
 */

import {
  CalibrationSourceRow,
  buildLabeledRows,
  fitCalibration,
  calibrationSignature,
} from "./calibration";

export function runCalibrationTests(): { passed: number; failed: number; errors: string[] } {
  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  const assert = (condition: boolean, msg: string) => {
    if (condition) passed++;
    else {
      failed++;
      errors.push(`Assertion failed: ${msg}`);
      console.error(`❌ [CALIBRATION TEST FAIL] ${msg}`);
    }
  };

  console.log("=== Running Calibration Bundle Tests ===");

  const fullFeatures = (over: Partial<CalibrationSourceRow["features"]> = {}) => ({
    adx: 30,
    atrPercentile: 50,
    sessionGrade: "B" as const,
    spreadPips: 1.2,
    minutesToNews: null,
    jysrConfidence: 70,
    kimiConfidence: 75,
    kimiGrade: "VALID" as const,
    h1h4Agree: true,
    raidFlag: false,
    patternFlag: false,
    ...over,
  });

  // Build N rows where a strong feature (adx) separates TP_FIRST from not, so
  // the logistic gate has a real (if synthetic) signal to learn.
  const makeRows = (n: number): CalibrationSourceRow[] => {
    const rows: CalibrationSourceRow[] = [];
    const t0 = 1_700_000_000_000;
    for (let i = 0; i < n; i++) {
      const win = i % 2 === 0;
      rows.push({
        createdAt: t0 + i * 60_000,
        horizonSec: 900,
        slPips: 12,
        tpPips: 24,
        touchOutcome: win ? "TP_FIRST" : "SL_FIRST",
        rMultiple: win ? 2 : -1,
        features: fullFeatures({
          adx: win ? 45 : 15,          // strong trend → win, weak → loss
          kimiConfidence: win ? 85 : 55,
          jysrConfidence: win ? 80 : 50,
        }),
      });
    }
    return rows;
  };

  /* ── 1. Empty input degrades to nulls, never throws ── */
  const empty = fitCalibration([]);
  assert(empty.sampleRows === 0, "Empty ledger → 0 sample rows");
  assert(empty.plattKimi === null && empty.plattJysr === null, "Empty → no Platt models");
  assert(empty.gate === null, "Empty → no logistic gate");
  assert(empty.kimiReliability.n === 0 && empty.jysrReliability.n === 0, "Empty → empty reliability");
  assert(empty.walkForward.evaluatedRows === 0, "Empty → no walk-forward rows");

  /* ── 2. Unresolved / incomplete rows are dropped, not imputed ── */
  const messy = makeRows(6);
  messy.push({ ...messy[0], touchOutcome: null, rMultiple: null }); // unresolved
  messy.push({ ...messy[0], features: null });                       // no snapshot
  messy.push({ ...messy[0], features: fullFeatures({ adx: null }) }); // incomplete snapshot
  const labeled = buildLabeledRows(messy);
  assert(labeled.length === 6, `Only resolved+complete rows survive (got ${labeled.length}, want 6)`);
  assert(labeled.every(r => r.label === 0 || r.label === 1), "Every label is 0/1");

  /* ── 3. Label = TP_FIRST → 1, SL_FIRST/TIMEOUT → 0 ── */
  const labRows = buildLabeledRows([
    { createdAt: 1, horizonSec: 900, slPips: 12, tpPips: 24, touchOutcome: "TP_FIRST", rMultiple: 2, features: fullFeatures() },
    { createdAt: 2, horizonSec: 900, slPips: 12, tpPips: 24, touchOutcome: "SL_FIRST", rMultiple: -1, features: fullFeatures() },
    { createdAt: 3, horizonSec: 900, slPips: 12, tpPips: 24, touchOutcome: "TIMEOUT", rMultiple: 0.3, features: fullFeatures() },
  ]);
  assert(labRows[0].label === 1, "TP_FIRST → label 1");
  assert(labRows[1].label === 0, "SL_FIRST → label 0");
  assert(labRows[2].label === 0, "TIMEOUT → label 0 (did not hit TP first)");

  /* ── 4. costPips taken from the row's own spread snapshot ── */
  const costRow = buildLabeledRows([
    { createdAt: 1, horizonSec: 900, slPips: 12, tpPips: 24, touchOutcome: "TP_FIRST", rMultiple: 2, features: fullFeatures({ spreadPips: 1.7 }) },
  ]);
  assert(costRow[0].costPips === 1.7, "costPips uses the row's spread snapshot");

  /* ── 5. Platt fits per engine; reliability counts match its stream ── */
  const big = fitCalibration(makeRows(120));
  assert(big.plattKimi !== null, "Platt fits Kimi confidence on 120 rows");
  assert(big.plattJysr !== null, "Platt fits JYSR confidence on 120 rows");
  assert(big.kimiReliability.n === 120, `Kimi reliability sees 120 rows (got ${big.kimiReliability.n})`);
  assert(big.jysrReliability.n === 120, `JYSR reliability sees 120 rows (got ${big.jysrReliability.n})`);
  assert(big.kimiReliability.brier !== null && big.kimiReliability.brier! >= 0, "Kimi Brier is a real number ≥ 0");

  /* ── 6. Separable signal: high-confidence row calibrates above low ── */
  if (big.plattKimi) {
    const hiConf = big.plattKimi.a + big.plattKimi.b * 0.85;
    const loConf = big.plattKimi.a + big.plattKimi.b * 0.55;
    assert(hiConf > loConf, `Platt slope rewards higher Kimi confidence (${hiConf.toFixed(3)} > ${loConf.toFixed(3)})`);
  }

  /* ── 7. Logistic gate fits on separable rows ── */
  assert(big.gate !== null, "Logistic gate fits on 120 separable rows");
  if (big.gate) {
    assert(big.gate.weights.length === 12, `Gate has intercept + 11 features (got ${big.gate.weights.length})`);
    assert(big.gate.means.length === 11 && big.gate.stds.length === 11, "Gate stores per-column means/stds");
  }

  /* ── 8. Walk-forward runs and is internally consistent ── */
  assert(big.walkForward.folds.length > 0, "Walk-forward produced folds");
  assert(
    big.walkForward.folds.every(f => f.takenTrades <= f.evaluatedRows),
    "No fold takes more trades than it evaluated"
  );

  /* ── 9. Signature changes only when resolved set changes ── */
  const rows = makeRows(4);
  const sig1 = calibrationSignature(rows);
  const sig2 = calibrationSignature([...rows]);
  assert(sig1 === sig2, "Same resolved set → same signature (no needless refit)");
  const sig3 = calibrationSignature(makeRows(5));
  assert(sig1 !== sig3, "More rows → new signature (refit)");

  return { passed, failed, errors };
}

if (typeof process !== "undefined" && process.argv && process.argv[1]?.includes("calibration.test")) {
  const res = runCalibrationTests();
  console.log(`\n=== Calibration Bundle: ${res.passed} passed, ${res.failed} failed ===`);
  process.exit(res.failed > 0 ? 1 : 0);
}

