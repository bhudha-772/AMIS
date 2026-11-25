/**
 * META-LABEL FEATURE HELPERS — pure inputs for the per-verdict snapshot
 * ─────────────────────────────────────────────────────────────────────────────
 * Small, unit-tested builders for the fields `PredictionFeatures` needs that
 * the trade loop does not already compute directly:
 *
 *   • atrPercentile — where today's ATR sits vs trailing history (0-100).
 *   • h1h4Agree — do the H1/H4 bar directions agree with the signal side?
 *   • minutesToNews — signed minutes to the nearest HIGH-impact event for
 *     this symbol's currencies (negative = already released).
 *
 * Pure and deterministic; the trader and server can share every function.
 */

export interface NewsItemLike {
  isoTime?: string;
  time?: string;
  impact?: string;
  currency?: string;
  event?: string;
}

/** ATR percentile of `current` against `history` (0-100, null when empty). */
export function atrPercentile(currentAtr: number, history: number[]): number | null {
  if (!Number.isFinite(currentAtr) || !Array.isArray(history) || history.length === 0) return null;
  const clean = history.filter(v => typeof v === "number" && Number.isFinite(v));
  if (clean.length === 0) return null;
  let le = 0;
  for (const v of clean) if (v <= currentAtr) le++;
  return Math.round((le / clean.length) * 100);
}

/** Bar direction of a close series; null when fewer than 2 closes. */
function seriesDir(closes: number[]): "BULLISH" | "BEARISH" | null {
  if (!Array.isArray(closes) || closes.length < 2) return null;
  const first = closes[0];
  const last = closes[closes.length - 1];
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
  if (last > first) return "BULLISH";
  if (last < first) return "BEARISH";
  return null;
}

/**
 * True when H1 and H4 both agree with the signal side, false when either
 * disagrees, null when either timeframe is missing. Exact mirror of the MTF
 * summary strings the prompt already prints, but as a gate-grade boolean.
 */
export function h1h4Agreement(
  signal: "BUY" | "SELL" | "HOLD",
  h1Closes: number[],
  h4Closes: number[]
): boolean | null {
  if (signal === "HOLD") return null;
  const want = signal === "BUY" ? "BULLISH" : "BEARISH";
  const h1 = seriesDir(h1Closes);
  const h4 = seriesDir(h4Closes);
  if (h1 === null || h4 === null) return null;
  return h1 === want && h4 === want ? true : false;
}

/** Currencies touched by a symbol string (best-effort 3-letter scan). */
function symbolCurrencies(symbol: string): string[] {
  const s = String(symbol || "").toUpperCase().replace(/M$/, "");
  const out: string[] = [];
  for (const c of ["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF", "XAU", "XAG"]) {
    if (s.includes(c)) out.push(c);
  }
  return out;
}

function eventTimeMs(n: NewsItemLike): number | null {
  if (n.isoTime) {
    const t = new Date(n.isoTime).getTime();
    if (Number.isFinite(t)) return t;
  }
  if (n.time) {
    // "HH:MM" today-UTC fallback for static calendar rows without isoTime.
    const m = String(n.time).match(/(\d{1,2}):(\d{2})/);
    if (m) {
      const now = new Date();
      const t = Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
        Number(m[1]), Number(m[2]), 0
      );
      if (Number.isFinite(t)) return t;
    }
  }
  return null;
}

/**
 * Signed minutes from `nowMs` to the nearest HIGH-impact event touching the
 * symbol's currencies. Past events count negative (minutes since release);
 * null when no qualifying event exists. Uses the same impact vocabulary as
 * the meta-label blackout (`high`/`red`), so the snapshot and the filter
 * can never disagree about what "high impact" means.
 */
export function minutesToHighImpactNews(
  symbol: string,
  news: NewsItemLike[],
  nowMs: number = Date.now()
): number | null {
  if (!Array.isArray(news) || news.length === 0) return null;
  const legs = symbolCurrencies(symbol);
  let best: number | null = null;
  for (const n of news) {
    const impact = String(n?.impact || "").toLowerCase();
    if (!(impact.includes("high") || impact.includes("red"))) continue;
    if (legs.length > 0 && n.currency && !legs.includes(String(n.currency).toUpperCase())) continue;
    const t = eventTimeMs(n);
    if (t == null) continue;
    const mins = (t - nowMs) / 60000;
    if (best == null || Math.abs(mins) < Math.abs(best)) best = mins;
  }
  return best == null ? null : Math.round(best * 10) / 10;
}
