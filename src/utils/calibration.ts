/**
 * CALIBRATION BUNDLE — turns resolved ledger rows into live trading models
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure and deterministic (no I/O, no Date.now()): it consumes already-resolved
 * MT5PredictionRecord[] and returns the models + diagnostics the live gate and
 * the Autopilot UI need. The server fits this once per ledger change and ships
 * it to the browser; the browser only APPLIES it (applyPlatt / predictLogistic /
 * metaLabelDecision) — it never refits on live data, which would leak.
 *
 * Label discipline (matches metaLabel.metaLabelDecision): a usable row has a
 * resolved first-touch outcome AND a complete feature snapshot. Label = 1 iff
 * TP_FIRST, else 0 (SL_FIRST and TIMEOUT both mean "did not hit TP first").
 * Incomplete rows are DROPPED, never imputed — same rule as vectorizeFeatures.
 *
 * Confidence calibration is per engine: Kimi confidence and JYSR confidence are
 * Platt-scaled separately, so the blend compares calibrated P(TP first), not the
 * two engines' raw, differently-scaled self-reports.
 */

import {
  FEATURE_ORDER,
  fitLogistic,
  fitPlatt,
  reliabilityReport,
  vectorizeFeatures,
  walkForward,
  type LabeledRow,
  type LogisticModel,
  type PlattModel,
  type ReliabilityReport,
  type WalkForwardSummary,
} from "./metaLabel";

/** Minimal shape of a resolved ledger row this module reads. */
export interface CalibrationSourceRow {
  createdAt: number;
  horizonSec: number;
  slPips: number;
  tpPips: number;
  touchOutcome: "TP_FIRST" | "SL_FIRST" | "TIMEOUT" | null;
  rMultiple: number | null;
  features: {
    adx: number | null;
    atrPercentile: number | null;
    sessionGrade: "A" | "B" | "C" | "D" | "F" | null;
    spreadPips: number | null;
    minutesToNews: number | null;
    jysrConfidence: number | null;
    kimiConfidence: number | null;
    kimiGrade: "PERFECT" | "HIGH_PROBABILITY" | "VALID" | "POOR" | null;
    h1h4Agree: boolean | null;
    raidFlag: boolean | null;
    patternFlag: boolean | null;
  } | null;
  /**
   * Which engine produced the verdict. Drives plattKimi purity: only
   * KIMI_SETUP_VERIFIED rows feed the Kimi Platt calibrator. LOCAL_FALLBACK
   * rows now also populate features.kimiConfidence/kimiGrade so the meta-label
   * gate can train on them, and must be excluded from kimiFit to avoid
   * contaminating real-Kimi calibration. Optional for legacy rows/tests.
   */
  source?: "KIMI_SETUP_VERIFIED" | "JYSR_FALLBACK";
}

export interface CalibrationBundle {
  /** Rows that were usable for fitting (resolved first-touch + full features). */
  sampleRows: number;
  /** Rows usable for the confidence calibrators (subset; needs a confidence). */
  plattSamples: number;
  /** Platt for Kimi confidence vs TP-first (null when too few / no signal). */
  plattKimi: PlattModel | null;
  /** Platt for JYSR confidence vs TP-first. */
  plattJysr: PlattModel | null;
  /** Meta-label logistic gate on the feature vector (null under 30 rows). */
  gate: LogisticModel | null;
  /** Reliability + Brier per engine so calibration is auditable, not asserted. */
  kimiReliability: ReliabilityReport;
  jysrReliability: ReliabilityReport;
  /** Walk-forward (purged + embargoed) honest out-of-sample check of the gate. */
  walkForward: WalkForwardSummary;
}

function num(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

const IDX_KIMI_CONF = FEATURE_ORDER.indexOf("kimiConfidence");
const IDX_JYSR_CONF = FEATURE_ORDER.indexOf("jysrConfidence");

/**
 * Build the labeled rows the meta-label gate, the confidence calibrators and
 * the walk-forward all share. Drops any row without a resolved first-touch
 * outcome, a finite R, or a complete feature vector.
 */
export function buildLabeledRows(records: CalibrationSourceRow[]): LabeledRow[] {
  const out: LabeledRow[] = [];
  for (const r of records || []) {
    if (!r || r.touchOutcome == null) continue;               // unresolved / VOID
    if (!num(r.rMultiple)) continue;
    if (!num(r.slPips) || !num(r.tpPips) || !num(r.horizonSec) || !num(r.createdAt)) continue;
    if (!r.features) continue;
    const x = vectorizeFeatures(r.features);
    if (!x) continue;                                          // incomplete snapshot
    const label: 0 | 1 = r.touchOutcome === "TP_FIRST" ? 1 : 0;
    const costPips = num(r.features.spreadPips) ? r.features.spreadPips : 0;
    out.push({
      entryTimeMs: r.createdAt,
      horizonSec: r.horizonSec,
      x,
      label,
      rMultiple: r.rMultiple,
      slPips: r.slPips,
      tpPips: r.tpPips,
      costPips,
      source: r.source,
    });
  }
  return out;
}


/** Fit every model + diagnostic the live gate consumes, from resolved rows. */
export function fitCalibration(records: CalibrationSourceRow[]): CalibrationBundle {
  const rows = buildLabeledRows(records);

  // Per-engine confidence calibrators: only rows where that engine produced the
  // confidence actually carry signal for it, so each stream is filtered on its
  // own confidence being present. plattKimi additionally excludes JYSR_FALLBACK
  // rows: those now populate kimiConfidence so the meta-label gate can train on
  // them, but they are the local engine's self-report, NOT real Kimi, so they
  // must not contaminate the Kimi calibrator. Legacy rows without a source are
  // kept (historically all carried rows were real-Kimi).
  const kimiFit = rows
    .filter(r => num(r.x[IDX_KIMI_CONF]) && r.source !== "JYSR_FALLBACK")
    .map(r => ({ score: r.x[IDX_KIMI_CONF] as number, label: r.label as 0 | 1 }));
  const jysrFit = rows
    .filter(r => num(r.x[IDX_JYSR_CONF]))
    .map(r => ({ score: r.x[IDX_JYSR_CONF] as number, label: r.label as 0 | 1 }));

  const plattKimi = fitPlatt(kimiFit);
  const plattJysr = fitPlatt(jysrFit);

  const gate = fitLogistic(rows.map(r => ({ x: r.x, label: r.label })));

  const kimiReliability = reliabilityReport(
    kimiFit.map(r => ({ confidencePct: r.score, tpFirst: r.label }))
  );
  const jysrReliability = reliabilityReport(
    jysrFit.map(r => ({ confidencePct: r.score, tpFirst: r.label }))
  );

  const walkForwardSummary = walkForward(rows);

  return {
    sampleRows: rows.length,
    plattSamples: kimiFit.length,
    plattKimi,
    plattJysr,
    gate,
    kimiReliability,
    jysrReliability,
    walkForward: walkForwardSummary,
  };
}

/** Cheap signature so the server only refits when the resolved set changes. */
export function calibrationSignature(records: CalibrationSourceRow[]): string {
  let resolved = 0;
  let lastResolved = 0;
  for (const r of records || []) {
    if (r.touchOutcome != null) resolved++;
    if (num(r.createdAt) && r.createdAt > lastResolved) lastResolved = r.createdAt;
  }
  return `${records?.length || 0}:${resolved}:${lastResolved}`;
}

export function emptyCalibrationBundle(): CalibrationBundle {
  return fitCalibration([]);
}
