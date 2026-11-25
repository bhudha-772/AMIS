/**
 * META-LABEL ENGINE — labels, calibration, filters and validation
 * ─────────────────────────────────────────────────────────────────────────────
 * Fixes the measurement layer the whole trading loop depends on:
 *
 *   1. FIRST-TOUCH LABELS — every resolved row replays post-entry candles in
 *      order and records which barrier printed FIRST (TP_FIRST / SL_FIRST /
 *      TIMEOUT). The old resolver scored on window high/low, which cannot see
 *      order and inflates losers via the directional fallback. No mixing of
 *      TP-first and SL-first rows into one "hit-rate": R is recorded per row.
 *   2. R-MULTIPLES NET OF SPREAD — +RR on TP_FIRST, −1 on SL_FIRST, including
 *      the fractional fill on TIMEOUT. Pips flatter gold/oil/JPY comparisons;
 *      R is the comparable unit.
 *   3. FULL FEATURE SNAPSHOT per verdict: ADX, ATR percentile, session grade,
 *      spread, minutes-to-news, JYSR confidence, Kimi confidence + grade,
 *      H1/H4 agreement, raid and pattern flags.
 *   4. CALIBRATION — Brier score + reliability diagram for Kimi and JYSR
 *      confidences separately; Platt scaling (<~500 samples) maps raw scores
 *      to calibrated probabilities, replacing "higher confidence wins".
 *   5. META-LABEL GATE — logistic regression on the saved features predicts
 *      P(TP first). Trade only when calibrated probability beats break-even
 *      plus margin: breakEven = (SL + cost) / (SL + TP).
 *   6. WALK-FORWARD VALIDATION with purging of overlapping examples plus an
 *      embargo after each test window (trades overlap in time; shuffled CV
 *      flatters the model).
 *   7. FILTERS + A/B — news blackout, spread cap, ATR-percentile gate, each
 *      kept only if it wins out-of-sample: base vs +trend vs +vol vs both.
 *
 * Pure and deterministic: no I/O, no dates-as-now, injected candle arrays.
 * Server and browser can share every function; tests run without fixtures.
 */

export interface TouchCandle {
  time: number; // ms epoch, strictly increasing per series
  high: number;
  low: number;
  close: number;
}

/** Result of replaying post-entry candles in order. */
export interface FirstTouchResult {
  outcome: "TP_FIRST" | "SL_FIRST" | "TIMEOUT";
  /** Index into the candle array of the deciding bar (−1 on TIMEOUT). */
  touchIndex: number;
  /** Bars replayed before the decision. */
  barsUsed: number;
}

/**
 * Replay post-entry candles in chronological order. The FIRST barrier whose
 * level prints inside a bar wins; when both print in the same bar the
 * conservative (SL-side) outcome wins. Bars after the decision are ignored,
 * and rows that never touch either barrier resolve TIMEOUT at `horizonSec`.
 */
export function resolveFirstTouch(
  direction: "BUY" | "SELL",
  slPrice: number,
  tpPrice: number,
  candles: TouchCandle[],
  entryTimeMs: number,
  horizonSec: number
): FirstTouchResult {
  const empty: FirstTouchResult = { outcome: "TIMEOUT", touchIndex: -1, barsUsed: 0 };
  if (!Array.isArray(candles) || candles.length === 0) return empty;
  if (!Number.isFinite(slPrice) || !Number.isFinite(tpPrice)) return empty;
  const deadlineMs = entryTimeMs + Math.max(1, horizonSec) * 1000;
  let used = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (!c || !Number.isFinite(c.time) || c.time <= entryTimeMs) continue;
    if (c.time > deadlineMs) break;
    if (!Number.isFinite(c.high) || !Number.isFinite(c.low)) continue;
    used++;
    const tpHit = direction === "BUY" ? c.high >= tpPrice : c.low <= tpPrice;
    const slHit = direction === "BUY" ? c.low <= slPrice : c.high >= slPrice;
    if (tpHit || slHit) {
      // Same-bar ambiguity resolves to the conservative outcome: the trade
      // would have been stopped before the target could be banked.
      const slFirst = slHit;
      return {
        outcome: slFirst ? "SL_FIRST" : "TP_FIRST",
        touchIndex: i,
        barsUsed: used,
      };
    }
  }
  return { outcome: "TIMEOUT", touchIndex: -1, barsUsed: used };
}

/**
 * R-multiple net of the entry spread, in units of risk.
 *   TP_FIRST  → +(tpDistance − spread) / (slDistance + spread)
 *   SL_FIRST  → −1
 *   TIMEOUT   → fractional exit vs entry, net of spread, in R units.
 * Costs enter only through the spread charged once at entry — commissions and
 * swap are separate cost terms handled by the caller when they exist.
 */
export function rMultipleNet(
  outcome: "TP_FIRST" | "SL_FIRST" | "TIMEOUT",
  direction: "BUY" | "SELL",
  entryPrice: number,
  slPrice: number,
  tpPrice: number,
  exitPrice: number,
  spreadPrice: number
): number {
  const slDist = Math.abs(entryPrice - slPrice);
  if (!(slDist > 0) || !Number.isFinite(spreadPrice) || spreadPrice < 0) return 0;
  const risk = slDist + spreadPrice;
  if (outcome === "SL_FIRST") return -1;
  if (outcome === "TP_FIRST") {
    const reward = Math.abs(tpPrice - entryPrice) - spreadPrice;
    return reward / risk;
  }
  const drift = direction === "BUY" ? exitPrice - entryPrice : entryPrice - exitPrice;
  if (!Number.isFinite(drift)) return 0;
  return (drift - spreadPrice) / risk;
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE VECTOR
// ─────────────────────────────────────────────────────────────────────────────
// Fixed model order. Grades map to ordinal scores (A=1 … F=5) and the two
// confidences stay in 0-100 raw form — the calibrator, not the vectorizer,
// owns the mapping to probability. Rows missing ANY field are dropped by the
// caller via vectorizeFeatures returning null; no silent imputation.

export interface MetaFeatures {
  adx: number;
  atrPercentile: number;
  sessionGrade: number; // A=1, B=2, C=3, D=4, F=5
  spreadPips: number;
  minutesToNews: number; // null news → large sentinel (see below)
  jysrConfidence: number;
  kimiConfidence: number;
  kimiGrade: number; // PERFECT=4, HIGH_PROBABILITY=3, VALID=2, POOR=1
  h1h4Agree: number; // 1/0
  raidFlag: number; // 1/0
  patternFlag: number; // 1/0
}

/** Sentinel for "no high-impact news scheduled" — far outside any blackout. */
export const NO_NEWS_MINUTES = 100000;

/** Ordered model inputs; keep in sync with vectorizeFeatures/fitLogistic. */
export const FEATURE_ORDER: Array<keyof MetaFeatures> = [
  "adx",
  "atrPercentile",
  "sessionGrade",
  "spreadPips",
  "minutesToNews",
  "jysrConfidence",
  "kimiConfidence",
  "kimiGrade",
  "h1h4Agree",
  "raidFlag",
  "patternFlag",
];

const GRADE_SCORE: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, F: 5 };
const KIMI_SCORE: Record<string, number> = {
  PERFECT: 4,
  HIGH_PROBABILITY: 3,
  VALID: 2,
  POOR: 1,
};

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Convert a stored PredictionFeatures row to a fixed model vector.
 * Returns null when ANY input is missing (minutesToNews null is allowed and
 * maps to the NO_NEWS sentinel). Deterministic: field order never changes.
 */
export function vectorizeFeatures(f: {
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
}): number[] | null {
  if (
    !isNum(f.adx) ||
    !isNum(f.atrPercentile) ||
    f.sessionGrade == null ||
    !(f.sessionGrade in GRADE_SCORE) ||
    !isNum(f.spreadPips) ||
    !isNum(f.jysrConfidence) ||
    !isNum(f.kimiConfidence) ||
    f.kimiGrade == null ||
    !(f.kimiGrade in KIMI_SCORE) ||
    typeof f.h1h4Agree !== "boolean" ||
    typeof f.raidFlag !== "boolean" ||
    typeof f.patternFlag !== "boolean"
  ) {
    return null;
  }
  const mins = f.minutesToNews == null
    ? NO_NEWS_MINUTES
    : isNum(f.minutesToNews) ? f.minutesToNews : null;
  if (mins == null) return null;
  return [
    f.adx,
    f.atrPercentile,
    GRADE_SCORE[f.sessionGrade],
    f.spreadPips,
    mins,
    f.jysrConfidence,
    f.kimiConfidence,
    KIMI_SCORE[f.kimiGrade],
    f.h1h4Agree ? 1 : 0,
    f.raidFlag ? 1 : 0,
    f.patternFlag ? 1 : 0,
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// BRIER SCORE + RELIABILITY DIAGRAM (per confidence source)
// ─────────────────────────────────────────────────────────────────────────────
// Brier = mean((p − y)²) over rows that resolved WIN/LOSS; lower is better,
// 0.25 is the coin-flip baseline. Reliability bins predictions by stated
// confidence (10 equal bins) and records observed TP-first rate per bin, so
// the diagram shows exactly where each engine over- or under-states itself.

export interface ReliabilityBin {
  binStart: number; // inclusive, 0-100 scale
  binEnd: number; // exclusive
  n: number;
  meanStated: number | null; // mean confidence in this bin (0-1)
  observedRate: number | null; // TP_FIRST fraction in this bin
}

export interface ReliabilityReport {
  n: number;
  brier: number | null;
  bins: ReliabilityBin[];
}

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/**
 * Score one confidence stream against TP_FIRST labels.
 * `rows`: { confidencePct 0-100, tpFirst 1/0 }. Fixed 10 bins — the bin edges
 * never move, so diagrams from different months are directly comparable.
 */
export function reliabilityReport(
  rows: Array<{ confidencePct: number; tpFirst: 0 | 1 }>
): ReliabilityReport {
  const bins: ReliabilityBin[] = [];
  for (let b = 0; b < 10; b++) bins.push({ binStart: b * 10, binEnd: b * 10 + 10, n: 0, meanStated: null, observedRate: null });
  let sumSq = 0;
  let n = 0;
  for (const r of rows) {
    if (!isNum(r.confidencePct) || (r.tpFirst !== 0 && r.tpFirst !== 1)) continue;
    const p = clamp01(r.confidencePct / 100);
    sumSq += (p - r.tpFirst) * (p - r.tpFirst);
    n++;
    const b = Math.min(9, Math.max(0, Math.floor(r.confidencePct / 10)));
    const bin = bins[b];
    bin.n++;
    bin.meanStated = (bin.meanStated ?? 0) + p;
    bin.observedRate = (bin.observedRate ?? 0) + r.tpFirst;
  }
  for (const bin of bins) {
    if (bin.n > 0) {
      bin.meanStated = (bin.meanStated as number) / bin.n;
      bin.observedRate = (bin.observedRate as number) / bin.n;
    }
  }
  return { n, brier: n > 0 ? sumSq / n : null, bins };
}

// ─────────────────────────────────────────────────────────────────────────────
// PLATT SCALING (primary calibrator below ~500 samples)
// ─────────────────────────────────────────────────────────────────────────────
// Maps a raw score x (0-100) to P(TP first) via a 1-D logistic fit:
//   p(x) = 1 / (1 + exp(−(a + b·x̃))), x̃ = x/100.
// Newton's method on the log-loss with L2 penalty λ (default 1.0 — the value
// that keeps the slope stable on 100-500 rows without flattening the signal).
// Deterministic: fixed init, fixed iterations, no randomness. With ≥~500 rows
// the caller may prefer isotonic, but Platt is kept as the shipped default
// because the ledger is small and Platt degrades gracefully.

export interface PlattModel {
  kind: "platt";
  a: number;
  b: number;
}

export function sigmoid(z: number): number {
  if (z >= 0) {
    const e = Math.exp(-z);
    return 1 / (1 + e);
  }
  const e = Math.exp(z);
  return e / (1 + e);
}

/**
 * Fit Platt scaling on (rawScore 0-100, label 0/1) pairs.
 * Returns null when fewer than 10 usable rows exist (refuse to fit noise).
 */
export function fitPlatt(
  rows: Array<{ score: number; label: 0 | 1 }>,
  lambda: number = 1.0,
  iterations: number = 100
): PlattModel | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const r of rows) {
    if (!isNum(r.score) || (r.label !== 0 && r.label !== 1)) continue;
    xs.push(clamp01(r.score / 100));
    ys.push(r.label);
  }
  const n = xs.length;
  if (n < 10) return null;
  let a = 0;
  let b = 0;
  for (let it = 0; it < iterations; it++) {
    let ga = 0;
    let gb = 0;
    let haa = lambda;
    let hab = 0;
    let hbb = lambda;
    for (let i = 0; i < n; i++) {
      const p = sigmoid(a + b * xs[i]);
      const w = Math.max(1e-6, p * (1 - p));
      const err = p - ys[i];
      ga += err;
      gb += err * xs[i];
      haa += w;
      hab += w * xs[i];
      hbb += w * xs[i] * xs[i];
    }
    ga += lambda * a;
    gb += lambda * b;
    const det = haa * hbb - hab * hab;
    if (!(det > 1e-12)) break;
    const da = (ga * hbb - gb * hab) / det;
    const db = (haa * gb - hab * ga) / det;
    a -= da;
    b -= db;
    if (Math.abs(da) < 1e-9 && Math.abs(db) < 1e-9) break;
  }
  return { kind: "platt", a, b };
}

/** Apply a fitted Platt model to a raw 0-100 score. */
export function applyPlatt(model: PlattModel, score: number): number {
  if (!isNum(score)) return 0.5;
  return clamp01(sigmoid(model.a + model.b * clamp01(score / 100)));
}

// ─────────────────────────────────────────────────────────────────────────────
// META-LABEL GATE — logistic regression on saved features
// ─────────────────────────────────────────────────────────────────────────────
// Predicts P(TP first | features). Feature scales differ wildly (ADX 0-100 vs
// minutes-to-news sentinel 100000), so every column is standardised with the
// train means/stds stored in the model — the gate standardises live inputs
// with the SAME numbers, never with live-batch statistics (that would leak).
// L2-penalised Newton fit, fully deterministic. Trade rule: trade only when
//   calibratedP >= breakEven + margin,
//   breakEven = (SL + cost) / (SL + TP)   [all in pips]
// e.g. SL 12, TP 24, cost 1.2 → (12+1.2)/(12+24) ≈ 0.367, NOT 1/(1+2)=0.333:
// ignoring the 1.2-pip entry cost understates the required edge.

export interface LogisticModel {
  kind: "logistic";
  weights: number[]; // aligned with FEATURE_ORDER (+ intercept at index 0)
  means: number[];
  stds: number[];
  lambda: number;
}

/** Break-even TP-first probability including entry cost, all in pips. */
export function breakEvenProb(slPips: number, tpPips: number, costPips: number): number {
  const sl = Math.max(0.0001, slPips);
  const tp = Math.max(0.0001, tpPips);
  const cost = Math.max(0, costPips);
  return (sl + cost) / (sl + tp);
}

function standardizeColumns(
  X: number[][]
): { Z: number[][]; means: number[]; stds: number[] } {
  const n = X.length;
  const d = X[0].length;
  const means: number[] = new Array(d).fill(0);
  const stds: number[] = new Array(d).fill(1);
  for (let j = 0; j < d; j++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += X[i][j];
    means[j] = s / n;
  }
  for (let j = 0; j < d; j++) {
    let v = 0;
    for (let i = 0; i < n; i++) v += (X[i][j] - means[j]) * (X[i][j] - means[j]);
    const sd = Math.sqrt(v / n);
    stds[j] = sd > 1e-9 ? sd : 1;
  }
  const Z = X.map(row => row.map((v, j) => (v - means[j]) / stds[j]));
  return { Z, means, stds };
}

function solveLinear(A: number[][], b: number[]): number[] | null {
  // Gaussian elimination with partial pivoting on the (d+1)×(d+1) Newton
  // system. d = 11 features → trivially small; exactness beats cleverness.
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    }
    if (Math.abs(M[piv][col]) < 1e-12) return null;
    if (piv !== col) {
      const tmp = M[piv];
      M[piv] = M[col];
      M[col] = tmp;
    }
    const inv = 1 / M[col][col];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] * inv;
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  const x: number[] = new Array(n);
  for (let i = 0; i < n; i++) x[i] = M[i][n] / M[i][i];
  return x;
}

/**
 * Fit the meta-label on (featureVector, tpFirst) rows.
 * Returns null under 30 usable rows — a gate fit on less is decoration.
 */
export function fitLogistic(
  rows: Array<{ x: number[]; label: 0 | 1 }>,
  // Strong L2 by default. On a thin ledger (~tens of rows vs 11 features) the
  // unregularised IRLS fit separates the sample and drives |weights| large, so
  // sigmoid(z) saturates to ~0.000 / ~1.000 at inference — a fake probability
  // that then hard-vetoes (or waves through) every setup. lambda=10 shrinks the
  // weights toward the base rate so predictions stay calibrated and the gate
  // only rejects setups that are genuinely worse than average.
  lambda: number = 10.0,
  iterations: number = 100
): LogisticModel | null {
  const clean = rows.filter(r =>
    Array.isArray(r.x) && r.x.length === FEATURE_ORDER.length &&
    r.x.every(isNum) && (r.label === 0 || r.label === 1)
  );
  if (clean.length < 30) return null;
  const { Z, means, stds } = standardizeColumns(clean.map(r => r.x));
  const y = clean.map(r => r.label);
  const d = FEATURE_ORDER.length;
  let w = new Array(d + 1).fill(0); // index 0 = intercept
  for (let it = 0; it < iterations; it++) {
    const grad = new Array(d + 1).fill(0);
    const H: number[][] = Array.from({ length: d + 1 }, () => new Array(d + 1).fill(0));
    for (let i = 0; i < Z.length; i++) {
      let z = w[0];
      for (let j = 0; j < d; j++) z += w[j + 1] * Z[i][j];
      const p = sigmoid(z);
      const err = p - y[i];
      const wt = Math.max(1e-6, p * (1 - p));
      const row = [1, ...Z[i]];
      for (let a = 0; a <= d; a++) {
        grad[a] += err * row[a];
        for (let b2 = 0; b2 <= d; b2++) H[a][b2] += wt * row[a] * row[b2];
      }
    }
    for (let j = 1; j <= d; j++) {
      grad[j] += lambda * w[j];
      H[j][j] += lambda;
    }
    H[0][0] += 1e-9;
    const step = solveLinear(H, grad);
    if (!step) break;
    let maxStep = 0;
    for (let j = 0; j <= d; j++) {
      w[j] -= step[j];
      maxStep = Math.max(maxStep, Math.abs(step[j]));
    }
    if (maxStep < 1e-9) break;
  }
  return { kind: "logistic", weights: w, means, stds, lambda };
}

/** P(TP first) for one feature vector under a fitted gate (0-1). */
export function predictLogistic(model: LogisticModel, x: number[]): number {
  if (!Array.isArray(x) || x.length !== FEATURE_ORDER.length || !x.every(isNum)) return 0.5;
  let z = model.weights[0];
  for (let j = 0; j < FEATURE_ORDER.length; j++) {
    z += model.weights[j + 1] * ((x[j] - model.means[j]) / (model.stds[j] || 1));
  }
  // Honest clamp: a calibrated probability is never exactly 0.000 / 1.000. A
  // tiny-ledger fit can still drive |z| large on a rare vector; pinning the
  // output to (0.01, 0.99) stops a degenerate saturation from masquerading as
  // certainty and hard-vetoing (or waving through) a setup it has no right to.
  return Math.min(0.99, Math.max(0.01, clamp01(sigmoid(z))));
}

/**
 * The gate decision. `costPips` is the entry spread (+ commission in pips when
 * known); `margin` is the extra edge demanded on top of break-even.
 */
export function metaLabelDecision(
  model: LogisticModel,
  x: number[],
  slPips: number,
  tpPips: number,
  costPips: number,
  margin: number = 0.05
): { probability: number; threshold: number; trade: boolean } {
  const probability = predictLogistic(model, x);
  const threshold = breakEvenProb(slPips, tpPips, costPips) + margin;
  return { probability, threshold, trade: probability >= threshold };
}

// ─────────────────────────────────────────────────────────────────────────────
// WALK-FORWARD VALIDATION with purging + embargo
// ─────────────────────────────────────────────────────────────────────────────
// Trades overlap in time (a 900s horizon vs a minutes-apart cycle), so a
// shuffled split leaks the future through shared candles: purging drops every
// train row whose [entry, entry+horizon] window intersects the test window,
// and the embargo then skips the first `embargoSec` of each test window so
// the train tail cannot bleed in. Folds advance chronologically; the gate is
// refit per fold on the purged past only and scored on the embargoed future.
// Summary: mean out-of-sample net R per trade, gate precision (TP_FIRST rate
// among taken trades), take rate, and purge/embargo counts (if purging eats
// most of the data the fold is honest but thin — that is signal, not a bug).

export interface LabeledRow {
  entryTimeMs: number;
  horizonSec: number;
  x: number[]; // vectorizeFeatures output (FEATURE_ORDER length)
  label: 0 | 1; // 1 = TP_FIRST
  rMultiple: number; // net of spread
  slPips: number;
  tpPips: number;
  costPips: number;
  /**
   * Which engine produced this row's setup verdict. Carried so the Kimi Platt
   * calibrator (plattKimi) can be fit on real-Kimi rows only and not be
   * contaminated by LOCAL_FALLBACK rows — which now also populate
   * kimiConfidence/kimiGrade so the meta-label gate can train on them.
   * Optional for backward compatibility with rows/tests built without it.
   */
  source?: "KIMI_SETUP_VERIFIED" | "JYSR_FALLBACK";
}

export interface WalkForwardFold {
  foldIndex: number;
  trainStartMs: number;
  trainEndMs: number;
  testStartMs: number;
  testEndMs: number;
  trainRows: number;
  purgedRows: number;
  testRows: number;
  embargoedRows: number;
  evaluatedRows: number;
  modelFit: boolean;
  takenTrades: number;
  netR: number;
  tpFirstTaken: number;
}

export interface WalkForwardSummary {
  folds: WalkForwardFold[];
  evaluatedRows: number;
  takenTrades: number;
  netR: number;
  netRPerTrade: number | null;
  gatePrecision: number | null; // TP_FIRST fraction among taken trades
  takeRate: number | null;
}

export interface WalkForwardOptions {
  folds?: number; // default 5
  embargoSec?: number; // default 3600 (one hour)
  margin?: number; // meta-label margin over break-even, default 0.05
  minTrainRows?: number; // default 30 (matches fitLogistic floor)
}

function windowsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Chronological walk-forward: fold k trains on [t0, testStart), tests on
 * [testStart, testEnd). Purge + embargo as documented above.
 */
export function walkForward(
  rows: LabeledRow[],
  o?: WalkForwardOptions
): WalkForwardSummary {
  const folds = Math.max(2, Math.min(20, Math.floor(o?.folds ?? 5)));
  const embargoSec = Math.max(0, o?.embargoSec ?? 3600);
  const margin = o?.margin ?? 0.05;
  const minTrainRows = o?.minTrainRows ?? 30;
  const clean = (Array.isArray(rows) ? rows : [])
    .filter(r =>
      r && Number.isFinite(r.entryTimeMs) && Number.isFinite(r.horizonSec) && r.horizonSec > 0 &&
      Array.isArray(r.x) && r.x.length === FEATURE_ORDER.length && r.x.every(isNum) &&
      (r.label === 0 || r.label === 1) && Number.isFinite(r.rMultiple) &&
      Number.isFinite(r.slPips) && Number.isFinite(r.tpPips) && Number.isFinite(r.costPips)
    )
    .sort((a, b) => a.entryTimeMs - b.entryTimeMs);
  const summary: WalkForwardSummary = {
    folds: [],
    evaluatedRows: 0,
    takenTrades: 0,
    netR: 0,
    netRPerTrade: null,
    gatePrecision: null,
    takeRate: null,
  };
  if (clean.length < minTrainRows + 1) return summary;
  const t0 = clean[0].entryTimeMs;
  const t1 = clean[clean.length - 1].entryTimeMs;
  const span = Math.max(1, t1 - t0);
  for (let k = 0; k < folds; k++) {
    const trainEnd = t0 + (span * (k + 1)) / (folds + 1);
    const testStart = trainEnd;
    const testEnd = t0 + (span * (k + 2)) / (folds + 1);
    const fold: WalkForwardFold = {
      foldIndex: k,
      trainStartMs: t0,
      trainEndMs: trainEnd,
      testStartMs: testStart,
      testEndMs: testEnd,
      trainRows: 0,
      purgedRows: 0,
      testRows: 0,
      embargoedRows: 0,
      evaluatedRows: 0,
      modelFit: false,
      takenTrades: 0,
      netR: 0,
      tpFirstTaken: 0,
    };
    const trainPool = clean.filter(r => r.entryTimeMs < trainEnd);
    // PURGE: train rows whose observation window touches the test window go.
    const trainKept = trainPool.filter(r => {
      const end = r.entryTimeMs + r.horizonSec * 1000;
      const overlaps = windowsOverlap(r.entryTimeMs, end, testStart, testEnd);
      if (overlaps) fold.purgedRows++;
      return !overlaps;
    });
    fold.trainRows = trainKept.length;
    const testPool = clean.filter(r => r.entryTimeMs >= testStart && r.entryTimeMs < testEnd);
    fold.testRows = testPool.length;
    // EMBARGO: skip the head of the test window after the train tail.
    const cutoff = testStart + embargoSec * 1000;
    const testKept = testPool.filter(r => {
      if (r.entryTimeMs < cutoff) {
        fold.embargoedRows++;
        return false;
      }
      return true;
    });
    fold.evaluatedRows = testKept.length;
    const model = trainKept.length >= minTrainRows
      ? fitLogistic(trainKept.map(r => ({ x: r.x, label: r.label })))
      : null;
    fold.modelFit = model != null;
    if (model) {
      for (const r of testKept) {
        const d = metaLabelDecision(model, r.x, r.slPips, r.tpPips, r.costPips, margin);
        if (d.trade) {
          fold.takenTrades++;
          fold.netR += r.rMultiple;
          if (r.label === 1) fold.tpFirstTaken++;
        }
      }
    }
    fold.netR = Math.round(fold.netR * 100) / 100;
    summary.folds.push(fold);
    summary.evaluatedRows += fold.evaluatedRows;
    summary.takenTrades += fold.takenTrades;
    summary.netR += fold.netR;
  }
  summary.netR = Math.round(summary.netR * 100) / 100;
  summary.netRPerTrade = summary.takenTrades > 0
    ? Math.round((summary.netR / summary.takenTrades) * 10000) / 10000
    : null;
  let tpTaken = 0;
  for (const f of summary.folds) tpTaken += f.tpFirstTaken;
  summary.gatePrecision = summary.takenTrades > 0 ? tpTaken / summary.takenTrades : null;
  summary.takeRate = summary.evaluatedRows > 0 ? summary.takenTrades / summary.evaluatedRows : null;
  return summary;
}

// ─────────────────────────────────────────────────────────────────────────────
// MISSING FILTERS + OUT-OF-SAMPLE A/B
// ─────────────────────────────────────────────────────────────────────────────
// Three hard filters, each with honest provenance:
//   • newsBlackout — ±5 min around high-impact events, extended after rate
//     decisions (newsList carries impact + event name; rate decisions match
//     /rate|fomc|ecb|boe|boj|rba|boc|snb|nfp|non-?farm|cpi/i).
//   • spreadCap — live spread must be ≤ slPips / spreadDivisor (default 4:
//     paying more than a quarter of the stop in spread is noise-fill).
//   • atrPercentileGate — ATR percentile must sit inside [min,max]
//     (default 10-90: skip dead chop AND untradeable expansion).
// abCompare runs each candidate set on OUT-OF-SAMPLE rows only and reports
// net R per trade + take rate per arm. Keep a filter only if its arm beats
// base out-of-sample. Candidate arms: "base", "+trend", "+vol", "both" —
// trend/arm = counterTrend false AND h1h4Agree true; vol/arm = spread cap +
// ATR gate. Arms are pure functions of the row, never of the future.

export interface FilterContext {
  minutesToNews: number | null;
  newsEventName?: string | null;
  newsImpact?: string | null;
  spreadPips: number | null;
  slPips: number;
  atrPercentile: number | null;
  counterTrendBlocked: boolean;
  h1h4Agree: boolean | null;
}

export interface FilterConfig {
  blackoutMin?: number; // default 5
  rateDecisionExtraMin?: number; // default 30
  spreadDivisor?: number; // default 4
  atrMin?: number; // default 10
  atrMax?: number; // default 90
}

const RATE_RE = /rate|fomc|ecb|boe|boj|rba|rbna|boc|snb|nfp|non[\s-]?farm|cpi|interest/i;

function isHighImpact(ctx: FilterContext): boolean {
  const impact = String(ctx.newsImpact || "").toLowerCase();
  return impact.includes("high") || impact.includes("red");
}

/** True when the row sits inside the news blackout (extended for rates). */
export function inNewsBlackout(ctx: FilterContext, cfg?: FilterConfig): boolean {
  if (ctx.minutesToNews == null || !isHighImpact(ctx)) return false;
  const mins = Math.abs(ctx.minutesToNews);
  const base = cfg?.blackoutMin ?? 5;
  const isRate = RATE_RE.test(String(ctx.newsEventName || ""));
  const windowMin = base + (isRate ? (cfg?.rateDecisionExtraMin ?? 30) : 0);
  return mins <= windowMin;
}

/** True when live spread is cheap enough relative to the planned stop. */
export function spreadOk(ctx: FilterContext, cfg?: FilterConfig): boolean {
  if (ctx.spreadPips == null || !(ctx.slPips > 0)) return false;
  const divisor = cfg?.spreadDivisor ?? 4;
  return ctx.spreadPips <= ctx.slPips / divisor;
}

/** True when volatility is tradeable: not dead chop, not chaos. */
export function atrGateOk(ctx: FilterContext, cfg?: FilterConfig): boolean {
  if (ctx.atrPercentile == null) return false;
  const lo = cfg?.atrMin ?? 10;
  const hi = cfg?.atrMax ?? 90;
  return ctx.atrPercentile >= lo && ctx.atrPercentile <= hi;
}

export type FilterArm = "base" | "plusTrend" | "plusVol" | "both";

export interface ArmResult {
  arm: FilterArm;
  rows: number;
  rSum: number;
  netRPerTrade: number | null;
  takeRate: number | null;
}

/** Pure arm predicate: which rows would this filter set have allowed? */
export function armAllows(
  arm: FilterArm,
  row: { ctx: FilterContext; rMultiple: number },
  cfg?: FilterConfig
): boolean {
  const { ctx } = row;
  if (inNewsBlackout(ctx, cfg)) return false; // blackout applies to every arm
  const trendOk = !ctx.counterTrendBlocked && ctx.h1h4Agree === true;
  const volOk = spreadOk(ctx, cfg) && atrGateOk(ctx, cfg);
  if (arm === "base") return true;
  if (arm === "plusTrend") return trendOk;
  if (arm === "plusVol") return volOk;
  return trendOk && volOk;
}

/**
 * A/B on OUT-OF-SAMPLE rows: each arm reports net R per trade and the share
 * of rows it would have taken. The caller must pass rows the filters were
 * never tuned on; this function cannot verify that, it only scores.
 */
export function abCompare(
  rows: Array<{ ctx: FilterContext; rMultiple: number }>,
  cfg?: FilterConfig
): ArmResult[] {
  const arms: FilterArm[] = ["base", "plusTrend", "plusVol", "both"];
  return arms.map(arm => {
    let rSum = 0;
    let taken = 0;
    for (const row of rows) {
      if (!Number.isFinite(row.rMultiple)) continue;
      if (armAllows(arm, row, cfg)) {
        taken++;
        rSum += row.rMultiple;
      }
    }
    const total = rows.length;
    return {
      arm,
      rows: taken,
      rSum: Math.round(rSum * 100) / 100,
      netRPerTrade: taken > 0 ? Math.round((rSum / taken) * 10000) / 10000 : null,
      takeRate: total > 0 ? taken / total : null,
    };
  });
}







