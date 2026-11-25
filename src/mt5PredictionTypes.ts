/**
 * AMIS MT5 PREDICTION LEDGER — SHARED TYPES
 *
 * Pure type module (no fs / no node imports) so it can be imported from BOTH the
 * browser bundle (ForexMT5Trader.tsx) and the server-side ledger engine
 * (src/mt5PredictionLedger.ts) without dragging node built-ins into Vite.
 */

export type PredictionDirection = "BUY" | "SELL";

/**
 * Kimi's verified setup grade. This replaces the old rigid confidence-% gate:
 * a pattern only gets traded when Kimi confirms the chart actually offers a
 * good-to-perfect setup on the live data.
 */
export type PredictionQuality = "PERFECT" | "HIGH_PROBABILITY" | "VALID" | "POOR";

/** Which engine produced the prediction. */
export type PredictionSource = "KIMI_SETUP_VERIFIED" | "JYSR_FALLBACK";

/**
 * PENDING  — observation horizon not elapsed yet
 * WIN      — prediction was correct (TP touched, or direction was right)
 * LOSS     — prediction was wrong (SL touched, or direction was wrong)
 * VOID     — could not be observed (no data / market closed)
 */
export type PredictionStatus = "PENDING" | "WIN" | "LOSS" | "VOID";

export interface MT5PredictionRecord {
  id: string;
  createdAt: number;                 // ms epoch
  symbol: string;
  direction: PredictionDirection;
  entryPrice: number;
  slPrice: number;
  tpPrice: number;
  slPips: number;
  tpPips: number;
  riskReward: number;
  horizonSec: number;                // observation window before resolution
  source: PredictionSource;
  setupQuality: PredictionQuality;
  confidencePct: number;
  setupType: string;
  reasoning: string;
  tradeExecuted: boolean;
  ticket: number | null;
  /** Did the AI itself say this setup was worth taking? (vs. the grade) */
  shouldTrade: boolean;
  /** Human-readable reason the trade did NOT fire. Empty string when it did. */
  skipReason: string;

  // ── observation results (filled by the resolver) ──
  status: PredictionStatus;
  resolvedAt: number | null;
  observedPrice: number | null;
  observedHigh: number | null;
  observedLow: number | null;
  pipsResult: number | null;
  maxFavourablePips: number | null;
  maxAdversePips: number | null;
  tpTouched: boolean;
  slTouched: boolean;
  note: string;

  // ── meta-label block (filled when rows carry the full feature snapshot) ──
  /** First-touch outcome: which barrier printed first, else TIMEOUT. */
  touchOutcome: TouchOutcome | null;
  /** R-multiple net of the entry spread: +RR on TP_FIRST, −1 on SL_FIRST. */
  rMultiple: number | null;
  /** Full feature snapshot saved with the verdict (meta-label inputs). */
  features: PredictionFeatures | null;
}

export interface MT5PredictionStats {
  total: number;
  pending: number;
  wins: number;
  losses: number;
  voids: number;
  /** Directional hit-rate over resolved (WIN+LOSS) predictions, %. */
  hitRatePct: number | null;
  /** Same hit-rate restricted to predictions that actually placed a trade. */
  executedHitRatePct: number | null;
  executedTrades: number;
  avgWinPips: number | null;
  avgLossPips: number | null;
  expectancyPips: number | null;
  /** First-touch counts (rows without candles contribute nothing). */
  tpFirst: number;
  slFirst: number;
  timeouts: number;
  /** Net R-multiple across resolved first-touch rows (spread-adjusted). */
  netR: number | null;
  avgRPerTrade: number | null;
  /** TP_FIRST / (TP_FIRST + SL_FIRST), % — the honest hit-rate. */
  tpFirstRatePct: number | null;
  /** Per setup-quality accuracy, so Kimi's grading can be audited over time. */
  byQuality: Record<PredictionQuality, { total: number; wins: number; losses: number; hitRatePct: number | null }>;
}

export interface ObservedWindow {
  price: number;
  high: number;
  low: number;
  samples: number;
}

/**
 * Full feature snapshot saved with each verdict (meta-label inputs).
 * Every field is optional at the type level because older rows and
 * shadow-mode rows may predate a feature; the vectorizer drops incomplete
 * rows deterministically rather than imputing silently.
 */
export interface PredictionFeatures {
  /** ADX(14) trend strength at entry, 0-100. */
  adx: number | null;
  /** ATR percentile (0-100) vs trailing history at entry. */
  atrPercentile: number | null;
  /** Session scalp grade at entry. */
  sessionGrade: "A" | "B" | "C" | "D" | "F" | null;
  /** Live spread in pips at entry. */
  spreadPips: number | null;
  /** Minutes to the next high-impact news event (null = none scheduled). */
  minutesToNews: number | null;
  /** Local engine confidence 0-100. */
  jysrConfidence: number | null;
  /** Kimi confidence 0-100. */
  kimiConfidence: number | null;
  /** Kimi setup grade. */
  kimiGrade: PredictionQuality | null;
  /** H1/H4 timeframe agreement with the signal direction. */
  h1h4Agree: boolean | null;
  /** Fresh liquidity-raid veto flag active at entry. */
  raidFlag: boolean | null;
  /** CONFIRMED reversal pattern backing the signal. */
  patternFlag: boolean | null;
}

/** How a first-touch label resolved. */
export type TouchOutcome = "TP_FIRST" | "SL_FIRST" | "TIMEOUT";
