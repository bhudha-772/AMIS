/**
 * AMIS SIGNAL MATH — pure, tested indicator & risk calculations.
 * ─────────────────────────────────────────────────────────────────────────────
 * Extracted from ForexMT5Trader so the exact math that drives real trades is
 * unit-testable. Every value here is research-backed:
 *
 *   • ATR(14) Wilder smoothing (Wilder 1978) — the volatility standard.
 *   • RSI(14) Wilder — backtested-optimal setting (23,487-trade study: RSI 14
 *     on 1H was the most reliable config, 53% success / ~65% winners).
 *   • EMA20/50 trend gate — aligns entries with the dominant trend (the forensics
 *     showed 195/204 dollar losses were counter-trend LONGs).
 *   • SL = 1.5× ATR, TP = 2.0× SL (TraderNest ATR table: forex scalp/intraday
 *     stops run 1.0–2.0× ATR; scalp reward:risk 1.5–2.2).
 */

export type TrendDir = "BULLISH" | "BEARISH" | "CONSOLIDATING";
export type SignalDir = "BUY" | "SELL" | "NEUTRAL";

export interface OHLC {
  high: number;
  low: number;
  close: number;
}

/** Wilder Average True Range over `period` bars, in PRICE units. */
export function computeATR(candles: OHLC[], period: number = 14): number {
  if (!Array.isArray(candles) || candles.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    const pc = candles[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const n = Math.min(period, trs.length);
  let atr = trs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (let i = n; i < trs.length; i++) atr = (atr * (n - 1) + trs[i]) / n;
  return atr;
}

/** Wilder RSI (0-100). Returns 50 when there is insufficient data. */
export function wilderRSI(closes: number[], period: number = 14): number {
  const len = closes.length;
  if (len <= period) return 50;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < len; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  return avgLoss === 0 ? 100 : Math.round(100 - 100 / (1 + avgGain / avgLoss));
}

/** Simple EMA value (last bar) over a close series. */
export function emaValue(closes: number[], period: number): number {
  const len = closes.length;
  if (len === 0) return 0;
  if (len < period) return closes[len - 1];
  const k = 2 / (period + 1);
  let e = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < len; i++) e = closes[i] * k + e * (1 - k);
  return e;
}

/** EMA20/50 trend with a noise deadband: BULLISH if fast>slow & price>slow, BEARISH
 *  if opposite — but ONLY when |fast−slow| exceeds 0.15× series σ. Without the
 *  deadband, ranging markets flicker a "trend" on microscopic EMA separation
 *  and the alignment gate fires on chop. Real trends separate by multiples of
 *  σ, so the deadband suppresses only noise. */
export function emaTrend(closes: number[]): TrendDir {
  if (closes.length < 5) return "CONSOLIDATING";
  const latest = closes[closes.length - 1];
  const fast = emaValue(closes, 20);
  const slow = emaValue(closes, 50);
  const mean = closes.reduce((a, b) => a + b, 0) / closes.length;
  const variance = closes.reduce((a, p) => a + Math.pow(p - mean, 2), 0) / closes.length;
  const sigma = Math.sqrt(variance);
  if (Math.abs(fast - slow) < sigma * 0.15) return "CONSOLIDATING";
  if (fast > slow && latest > slow) return "BULLISH";
  if (fast < slow && latest < slow) return "BEARISH";
  return "CONSOLIDATING";
}

/** True when a directional signal opposes the dominant trend (block it). */
export function isCounterTrend(signal: SignalDir, trend: TrendDir): boolean {
  return (signal === "BUY" && trend === "BEARISH") ||
         (signal === "SELL" && trend === "BULLISH");
}

/**
 * Adaptive SL/TP from live ATR(14), in PIPS.
 *   • SL = clamp(ATR_pips × 1.5, min 2×spread, 250)   [research: 1.0–2.0× ATR]
 *   • TP = clamp(SL × 2.0, min 1.5×minSL, 750)        [research: RR 1.5–2.2]
 * `atrPips` = ATR_price / pipSize. Price distance (slPips × pipSize) always
 * equals 1.5×ATR regardless of pipSize, so stops scale with true volatility.
 */
export function solveSLTP(
  atrPrice: number,
  pipSize: number,
  spreadPips: number
): { slPips: number; tpPips: number; atrPips: number } {
  const ps = pipSize > 0 ? pipSize : 0.0001;
  const atrPips = atrPrice > 0 ? atrPrice / ps : 0;
  return solveSLTPFromAtrPips(atrPips, spreadPips);
}

/**
 * SL/TP when ATR is already expressed in pips (e.g. the static per-symbol
 * table used as fallback when no candles are available). Same researched
 * 1.5×SL / 2.0×RR math as solveSLTP, so table and live paths agree.
 */
export function solveSLTPFromAtrPips(
  atrPips: number,
  spreadPips: number
): { slPips: number; tpPips: number; atrPips: number } {
  const spread = Number.isFinite(spreadPips) && spreadPips > 0 ? spreadPips : 1.0;
  const SL_MULT = 1.5;
  const RR = 2.0;
  const minSlPips = Math.max(5, spread * 2);
  const slPips = Math.max(minSlPips, Math.min(250, Math.round(atrPips * SL_MULT)));
  const tpPips = Math.max(Math.round(minSlPips * 1.5), Math.min(750, Math.round(slPips * RR)));
  return { slPips, tpPips, atrPips: Math.round(atrPips * 10) / 10 };
}
