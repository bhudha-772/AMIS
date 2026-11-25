/**
 * AMIS MT5 PREDICTION LEDGER ENGINE
 *
 * Purpose: turn every AI prediction into an OBSERVABLE, SCORED event.
 * The user's requirement was explicit — instead of trusting a confidence
 * percentage, the system should "verify this is a good-to-perfect setup, look
 * at the current data and the way the market is, place the trade, observe it,
 * and see if we predicted and traded right".
 *
 * This engine is the "observe it and see if we were right" half:
 *   1. recordPrediction()  — called the moment a Kimi setup verdict is produced
 *                            (whether or not the trade gate let it execute).
 *   2. resolvePredictions() — after the observation horizon elapses, score it
 *                            against real prices: TP touched → WIN, SL touched
 *                            → LOSS, otherwise scored on directional
 *                            correctness (did price move our way?).
 *   3. computePredictionStats() — calibration view: hit-rate overall, hit-rate of
 *                            trades we actually placed, and hit-rate per Kimi
 *                            setupQuality grade so the grading itself is audited.
 *
 * Storage: data/mt5Predictions.json via src/persistence.ts (atomic writes).
 */

import { loadMT5Predictions, saveMT5Predictions } from "./persistence";
import {
  MT5PredictionRecord,
  MT5PredictionStats,
  ObservedWindow,
  PredictionDirection,
  PredictionQuality,
  PredictionSource,
  PredictionFeatures,
} from "./mt5PredictionTypes";
import { resolveFirstTouch, rMultipleNet } from "./utils/metaLabel";

export const MAX_LEDGER_RECORDS = 400;
export const DEFAULT_HORIZON_SEC = 900; // 15 minutes — long enough for a forex scalp to resolve

export interface RecordPredictionInput {
  symbol: string;
  direction: PredictionDirection;
  entryPrice: number;
  slPrice: number;
  tpPrice: number;
  slPips: number;
  tpPips: number;
  horizonSec?: number;
  source: PredictionSource;
  setupQuality: PredictionQuality;
  confidencePct: number;
  setupType?: string;
  reasoning?: string;
  tradeExecuted: boolean;
  ticket?: number | null;
  shouldTrade?: boolean;
  skipReason?: string;
  now?: number;
  /** Full feature snapshot saved with the verdict (meta-label inputs). */
  features?: PredictionFeatures | null;
}

function defaultLoad(): MT5PredictionRecord[] {
  const raw = loadMT5Predictions<MT5PredictionRecord[]>([]);
  return Array.isArray(raw) ? raw : [];
}

function defaultSave(records: MT5PredictionRecord[]) {
  saveMT5Predictions(records.slice(-MAX_LEDGER_RECORDS));
}

/**
 * Pluggable storage so the deterministic test-suite (src/mt5PredictionLedger.test.ts)
 * can exercise the full scoring pipeline in-memory without touching data/.
 */
interface LedgerStorage {
  load: () => MT5PredictionRecord[];
  save: (records: MT5PredictionRecord[]) => void;
}

const defaultStorage: LedgerStorage = { load: defaultLoad, save: defaultSave };
let storage: LedgerStorage = defaultStorage;

export function __setLedgerStorageForTests(next: LedgerStorage) {
  storage = next;
}

export function __resetLedgerStorageForTests() {
  storage = defaultStorage;
}

function ledger(): MT5PredictionRecord[] {
  return storage.load();
}

function persist(records: MT5PredictionRecord[]) {
  storage.save(records);
}

export function pipSizeFor(symbol: string): number {
  const s = String(symbol || "").toUpperCase();
  if (s.includes("XAU") || s.includes("GOLD")) return 0.1;
  if (s.includes("JPY")) return 0.01;
  if (s.includes("OIL") || s.includes("US30") || s.includes("NAS") || s.includes("SPX")) return 0.01;
  return 0.0001;
}

function round2(n: number): number {
  return Number(n.toFixed(2));
}

export function listPredictions(): MT5PredictionRecord[] {
  return ledger();
}

export function recordPrediction(input: RecordPredictionInput): MT5PredictionRecord {
  const now = input.now ?? Date.now();
  const record: MT5PredictionRecord = {
    id: `pred-${now}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    symbol: input.symbol,
    direction: input.direction,
    entryPrice: input.entryPrice,
    slPrice: input.slPrice,
    tpPrice: input.tpPrice,
    slPips: input.slPips,
    tpPips: input.tpPips,
    riskReward: input.slPips > 0 ? round2(input.tpPips / input.slPips) : 0,
    horizonSec: input.horizonSec && input.horizonSec > 0 ? input.horizonSec : DEFAULT_HORIZON_SEC,
    source: input.source,
    setupQuality: input.setupQuality,
    confidencePct: input.confidencePct,
    setupType: input.setupType || "PRICE_ACTION_CONFLUENCE",
    reasoning: input.reasoning || "",
    tradeExecuted: Boolean(input.tradeExecuted),
    ticket: input.ticket ?? null,
    // Diagnostics: without these, a ledger full of tradeExecuted=false rows
    // cannot tell you whether the AI declined, the grade was too low, or the
    // auto-trader was simply switched off.
    shouldTrade: input.shouldTrade ?? true,
    skipReason: input.skipReason || "",
    status: "PENDING",
    resolvedAt: null,
    observedPrice: null,
    observedHigh: null,
    observedLow: null,
    pipsResult: null,
    maxFavourablePips: null,
    maxAdversePips: null,
    tpTouched: false,
    slTouched: false,
    note: "",
    // Meta-label block: unresolved at record time. touchOutcome/rMultiple are
    // filled by the first-touch resolver, never guessed here. features ride
    // along from the caller so every verdict carries its own snapshot.
    touchOutcome: null,
    rMultiple: null,
    features: input.features ?? null,
  };
  persist([...ledger(), record]);
  return record;
}

/**
 * Score every PENDING prediction whose horizon has elapsed.
 * `lookup` must return the observed window (latest price + high/low) for a
 * symbol since the given timestamp, or null when no data is available.
 */
export function resolvePredictions(
  lookup: (symbol: string, sinceMs: number) => ObservedWindow | null,
  now: number = Date.now(),
  candlesFor?: (symbol: string, sinceMs: number) => Array<{ time: number; high: number; low: number; close: number }> | null,
  spreadFor?: (symbol: string) => number | null
): { records: MT5PredictionRecord[]; resolved: number; pending: number } {
  const records = ledger();
  let resolved = 0;
  let pending = 0;
  const cache = new Map<string, ObservedWindow | null>();

  for (const rec of records) {
    if (rec.status !== "PENDING") continue;

    const elapsedSec = (now - rec.createdAt) / 1000;
    if (elapsedSec < rec.horizonSec) {
      pending++;
      continue;
    }

    // Observation windows differ per prediction (different since-timestamps), so the
    // cache key must include createdAt — keying on symbol alone would hand an older
    // prediction's window to a newer one.
    const cacheKey = `${rec.symbol}@${rec.createdAt}`;
    if (!cache.has(cacheKey)) cache.set(cacheKey, lookup(rec.symbol, rec.createdAt));
    const win = cache.get(cacheKey) ?? null;

    if (!win || !Number.isFinite(win.price) || win.price <= 0 || win.samples === 0) {
      rec.status = "VOID";
      rec.resolvedAt = now;
      rec.note = "No observable price data for this symbol in the window (market closed or MT5 offline).";
      resolved++;
      continue;
    }

    const pipSize = pipSizeFor(rec.symbol);
    const isBuy = rec.direction === "BUY";
    const high = Number.isFinite(win.high) && win.high > 0 ? Math.max(win.high, win.price) : win.price;
    const low = Number.isFinite(win.low) && win.low > 0 ? Math.min(win.low, win.price) : win.price;

    rec.observedPrice = win.price;
    rec.observedHigh = high;
    rec.observedLow = low;

    // ── FIRST-TOUCH RESOLUTION (fills touchOutcome/rMultiple) ──
    // When post-entry candles exist, replay them in order: the first barrier
    // that prints wins, the horizon is the third barrier, R is net of the
    // entry spread. Rows without candles keep the legacy window scoring
    // below with touchOutcome/rMultiple left null (unknown, NOT imputed).
    const postCandles = candlesFor ? candlesFor(rec.symbol, rec.createdAt) : null;
    const spreadVal = spreadFor ? spreadFor(rec.symbol) : null;
    const spreadPrice = spreadVal != null && spreadVal >= 0
      ? spreadVal * pipSize
      : 0;
    if (postCandles && postCandles.length > 0) {
      const touch = resolveFirstTouch(
        rec.direction, rec.slPrice, rec.tpPrice, postCandles, rec.createdAt, rec.horizonSec
      );
      rec.touchOutcome = touch.outcome;
      rec.tpTouched = touch.outcome === "TP_FIRST";
      rec.slTouched = touch.outcome === "SL_FIRST";
      const exitPrice = touch.outcome === "TIMEOUT" ? win.price
        : touch.outcome === "TP_FIRST" ? rec.tpPrice : rec.slPrice;
      rec.rMultiple = round2(rMultipleNet(
        touch.outcome, rec.direction,
        rec.entryPrice, rec.slPrice, rec.tpPrice, exitPrice, spreadPrice
      ));
      rec.maxFavourablePips = round2((isBuy ? high - rec.entryPrice : rec.entryPrice - low) / pipSize);
      rec.maxAdversePips = round2((isBuy ? rec.entryPrice - low : high - rec.entryPrice) / pipSize);
      rec.pipsResult = round2((isBuy ? win.price - rec.entryPrice : rec.entryPrice - win.price) / pipSize);
      rec.resolvedAt = now;
      if (touch.outcome === "TP_FIRST") {
        rec.status = "WIN";
        rec.note = `TP touched first (${touch.barsUsed} bars in) — R ${rec.rMultiple} net of spread.`;
      } else if (touch.outcome === "SL_FIRST") {
        rec.status = "LOSS";
        rec.note = `SL touched first (${touch.barsUsed} bars in) — R −1.`;
      } else if ((rec.rMultiple ?? 0) > 0) {
        // TIMEOUT with favourable drift: a partial win in R, not a full win.
        rec.status = "WIN";
        rec.note = `Neither barrier hit inside ${rec.horizonSec}s; drift favoured the call (R ${rec.rMultiple}).`;
      } else if ((rec.rMultiple ?? 0) < 0) {
        rec.status = "LOSS";
        rec.note = `Neither barrier hit inside ${rec.horizonSec}s; drift went against the call (R ${rec.rMultiple}).`;
      } else {
        rec.status = "VOID";
        rec.note = "Price finished exactly at entry — no directional edge observed.";
      }
      resolved++;
      continue;
    }

    rec.tpTouched = isBuy ? high >= rec.tpPrice : low <= rec.tpPrice;
    rec.slTouched = isBuy ? low <= rec.slPrice : high >= rec.slPrice;
    rec.maxFavourablePips = round2((isBuy ? high - rec.entryPrice : rec.entryPrice - low) / pipSize);
    rec.maxAdversePips = round2((isBuy ? rec.entryPrice - low : high - rec.entryPrice) / pipSize);
    rec.pipsResult = round2((isBuy ? win.price - rec.entryPrice : rec.entryPrice - win.price) / pipSize);
    rec.resolvedAt = now;

    if (rec.tpTouched && !rec.slTouched) {
      rec.status = "WIN";
      rec.note = `Take-profit level reached (${rec.tpPrice}) — prediction played out.`;
    } else if (rec.slTouched && !rec.tpTouched) {
      rec.status = "LOSS";
      rec.note = `Stop-loss level reached (${rec.slPrice}) — prediction invalidated.`;
    } else if (rec.tpTouched && rec.slTouched) {
      // Ambiguous intrabar order — score conservatively.
      rec.status = "LOSS";
      rec.note = "Both TP and SL were touched inside the window; scored conservatively as a loss.";
    } else if (rec.pipsResult > 0) {
      // Neither barrier hit: grade by directional correctness, which is exactly
      // "did we predict the market direction right?" on live data.
      rec.status = "WIN";
      rec.note = `Direction call correct (+${rec.pipsResult} pips) although neither barrier was hit.`;
    } else if (rec.pipsResult < 0) {
      rec.status = "LOSS";
      rec.note = `Direction call wrong (${rec.pipsResult} pips) — market moved against the prediction.`;
    } else {
      rec.status = "VOID";
      rec.note = "Price finished exactly at entry — no directional edge observed.";
    }
    resolved++;
  }

  if (resolved > 0) persist(records);
  return { records, resolved, pending };
}

export function computePredictionStats(records: MT5PredictionRecord[]): MT5PredictionStats {
  const qualities: PredictionQuality[] = ["PERFECT", "HIGH_PROBABILITY", "VALID", "POOR"];
  const byQuality = {} as MT5PredictionStats["byQuality"];
  for (const q of qualities) {
    const subset = records.filter(r => r.setupQuality === q);
    const qWins = subset.filter(r => r.status === "WIN").length;
    const qLosses = subset.filter(r => r.status === "LOSS").length;
    byQuality[q] = {
      total: subset.length,
      wins: qWins,
      losses: qLosses,
      hitRatePct: qWins + qLosses > 0 ? round2((qWins / (qWins + qLosses)) * 100) : null
    };
  }

  const wins = records.filter(r => r.status === "WIN");
  const losses = records.filter(r => r.status === "LOSS");
  const executed = records.filter(r => r.tradeExecuted);
  const execWins = executed.filter(r => r.status === "WIN").length;
  const execLosses = executed.filter(r => r.status === "LOSS").length;

  const avg = (arr: number[]) => (arr.length > 0 ? round2(arr.reduce((s, v) => s + v, 0) / arr.length) : null);
  const winPips = wins.map(r => r.pipsResult ?? 0);
  const lossPips = losses.map(r => r.pipsResult ?? 0);
  const directional = wins.length + losses.length;
  const rRows = records.filter(r => typeof r.rMultiple === "number" && Number.isFinite(r.rMultiple));
  const rVals = rRows.map(r => r.rMultiple as number);
  const tpFirst = records.filter(r => r.touchOutcome === "TP_FIRST").length;
  const slFirst = records.filter(r => r.touchOutcome === "SL_FIRST").length;
  const timeouts = records.filter(r => r.touchOutcome === "TIMEOUT").length;

  return {
    total: records.length,
    pending: records.filter(r => r.status === "PENDING").length,
    wins: wins.length,
    losses: losses.length,
    voids: records.filter(r => r.status === "VOID").length,
    hitRatePct: directional > 0 ? round2((wins.length / directional) * 100) : null,
    executedHitRatePct: execWins + execLosses > 0 ? round2((execWins / (execWins + execLosses)) * 100) : null,
    executedTrades: executed.length,
    avgWinPips: avg(winPips),
    avgLossPips: avg(lossPips),
    expectancyPips: avg([...winPips, ...lossPips]),
    // First-touch summary (null-safe: old rows without candles contribute 0s)
    tpFirst,
    slFirst,
    timeouts,
    netR: rVals.length > 0 ? round2(rVals.reduce((s, v) => s + v, 0)) : null,
    avgRPerTrade: rVals.length > 0 ? round2(rVals.reduce((s, v) => s + v, 0) / rVals.length) : null,
    tpFirstRatePct: tpFirst + slFirst > 0 ? round2((tpFirst / (tpFirst + slFirst)) * 100) : null,
    byQuality
  };
}

/**
 * Build an ObservedWindow from OHLC candles restricted to `sinceMs`.
 * Used by the server resolver with real MT5 candle data.
 */
export function windowFromCandles(
  candles: Array<{ time: number; open: number; high: number; low: number; close: number }>,
  sinceMs: number
): ObservedWindow | null {
  const sinceSec = Math.floor(sinceMs / 1000);
  const relevant = (candles || []).filter(c => Number.isFinite(c.time) && c.time >= sinceSec);
  if (relevant.length === 0) return null;
  return {
    price: relevant[relevant.length - 1].close,
    high: Math.max(...relevant.map(c => c.high)),
    low: Math.min(...relevant.map(c => c.low)),
    samples: relevant.length
  };
}

export function emptyStats(): MT5PredictionStats {
  return computePredictionStats([]);
}
