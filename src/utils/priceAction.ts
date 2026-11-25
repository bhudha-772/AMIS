/**
 * AMIS PRICE-ACTION KNOWLEDGE ENGINE
 * ─────────────────────────────────────────────────────────────────────────────
 * Teaches the system how professional price-action traders actually read a
 * chart, distilled from canonical sources:
 *
 *   • WILLIAMS FRACTALS (MetaTrader 5 / Bill Williams): an UP (sell) fractal
 *     is ≥5 successive bars with the HIGHEST high in the middle and two lower
 *     highs on each side; a DOWN (buy) fractal mirrors with the LOWEST low.
 *     Fractals mark swing points and natural support/resistance; Williams says
 *     to filter them with the Alligator (never trust a sell fractal above the
 *     Alligator's teeth / buy below it) — we implement the same filter with
 *     the EMA20/50 trend from signalMath.
 *   • DOUBLE TOP/BOTTOM (PriceActionNinja): form after a clear extended trend;
 *     two swing highs/lows at roughly the same level with a pullback between
 *     (the neckline); confirmed ONLY when price closes decisively beyond the
 *     neckline. The second top is the liquidity trap: breakout buyers + the
 *     late FOMO crowd get caught, and their trapped orders fuel the move —
 *     which is why this pattern keeps appearing in our "sweep then reverse"
 *     losses when traded backwards.
 *   • FALSE BREAKOUT / TURTLE-SOUP (FXSSI Liquidity concepts): a wick beyond a
 *     prior swing high/low that CLOSES back inside is a liquidity raid, not a
 *     breakout. Our forensics (198 RANDOM_NOISE longs, nearly all "strong LONG
 *     breakout" entries) says the system bought exactly these raids at the top.
 *   • M/W + HEAD-AND-SHOULDERS structure: three-swing reversal geometry with
 *     neckline-break confirmation, measured-move targets, and stops beyond the
 *     pattern extreme (CMC Markets guide).
 *
 * DESIGN: pure, deterministic, shared by server (AI prompt) and browser (local
 * JYSR gate) so both sides reason over identical price-action facts. Candle
 * input is the minimal OHLC shape both sides already have.
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal OHLC candle — matches both Candle and CandleData field names. */
export interface PriceBar {
  high: number;
  low: number;
  close: number;
  open?: number;
  time?: number | string;
}

/** A confirmed Williams fractal (swing extreme). */
export interface Fractal {
  index: number;            // bar index of the apex (middle) bar
  kind: "UP" | "DOWN";      // UP = swing high (sell-side), DOWN = swing low
  price: number;            // apex high (UP) or apex low (DOWN)
  strength: number;         // 1 + extra confirming bars on each side beyond 2
}

/** A swing point extracted from fractal + pivot structure. */
export interface SwingPoint {
  index: number;
  price: number;
  kind: "HIGH" | "LOW";
}

/** Double top / double bottom / head-and-shoulders detection result. */
export interface ReversalPattern {
  pattern: "DOUBLE_TOP" | "DOUBLE_BOTTOM" | "HEAD_SHOULDERS" | "INV_HEAD_SHOULDERS";
  status: "FORMING" | "CONFIRMED";
  firstExtreme: number;     // price of first top/bottom (or left shoulder)
  secondExtreme: number;    // price of second top/bottom (or head)
  neckline: number;         // pullback level that confirms on break
  tolerancePips: number;    // allowed extreme mismatch, in price units
  measuredMove: number;     // pattern height (target distance beyond neckline)
  bias: "BEARISH" | "BULLISH";
  description: string;
}

/** A liquidity raid: wick beyond a swing extreme that closes back inside. */
export interface LiquidityRaid {
  index: number;
  raidedLevel: number;      // the swing high/low that was swept
  side: "BUY_SIDE" | "SELL_SIDE"; // which liquidity was taken
  wickSize: number;         // penetration beyond the level, price units
  closedBackInside: boolean;
  bias: "BEARISH" | "BULLISH";    // raid of buy-side highs → bearish, etc.
  description: string;
}

/** Aggregate price-action state for one market + timeframe. */
export interface PriceActionState {
  fractals: Fractal[];
  swings: SwingPoint[];
  patterns: ReversalPattern[];
  raids: LiquidityRaid[];
  structureBias: "BULLISH" | "BEARISH" | "NEUTRAL";
  structureReason: string;
  lastSwingHigh: number | null;
  lastSwingLow: number | null;
  rangeHigh: number | null;
  rangeLow: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// WILLIAMS FRACTALS (canonical 5-bar; strength grows with extra confirmation)
// ─────────────────────────────────────────────────────────────────────────────
// UP fractal:    H[i-2] < H[i-1] < H[i] > H[i+1] > H[i+2]  (apex = highest high)
// DOWN fractal:  L[i-2] > L[i-1] > L[i] < L[i+1] < L[i+2]  (apex = lowest low)
// A fractal is only CONFIRMED once the two right-side bars have closed, so the
// apex index is i and confirmation completes at i+2. strength counts how many
// EXTRA bars beyond the minimum confirm on each side.
/** Detect confirmed Williams fractals over the whole series. */
export function detectFractals(bars: PriceBar[], sideBars: number = 2): Fractal[] {
  const out: Fractal[] = [];
  if (!Array.isArray(bars) || bars.length < sideBars * 2 + 1) return out;
  for (let i = sideBars; i <= bars.length - 1 - sideBars; i++) {
    const apexH = bars[i].high;
    const apexL = bars[i].low;
    let upOK = true;
    let downOK = true;
    for (let k = 1; k <= sideBars; k++) {
      if (!(bars[i - k].high < apexH && bars[i + k].high < apexH)) upOK = false;
      if (!(bars[i - k].low > apexL && bars[i + k].low > apexL)) downOK = false;
      if (!upOK && !downOK) break;
    }
    if (!upOK && !downOK) continue;
    // Strength: count extra confirming bars beyond the minimum on BOTH sides.
    let strength = 1;
    let extra = sideBars + 1;
    for (;; extra++) {
      const l = i - extra;
      const r = i + extra;
      if (l < 0 || r >= bars.length) break;
      const upExtra = upOK && bars[l].high < apexH && bars[r].high < apexH;
      const downExtra = downOK && bars[l].low > apexL && bars[r].low > apexL;
      if (!upExtra && !downExtra) break;
      strength++;
      // If one side stops confirming, the other kind can keep extending on its own.
      if (!upExtra) upOK = false;
      if (!downExtra) downOK = false;
    }
    if (upOK) out.push({ index: i, kind: "UP", price: apexH, strength });
    if (downOK) out.push({ index: i, kind: "DOWN", price: apexL, strength });
  }
  return out;
}

/** The most recent UP/DOWN fractal of each kind (or null when absent). */
export function latestFractal(
  fractals: Fractal[],
  kind: "UP" | "DOWN"
): Fractal | null {
  let best: Fractal | null = null;
  for (const f of fractals) {
    if (f.kind !== kind) continue;
    if (!best || f.index > best.index) best = f;
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// SWING EXTRACTION — alternating HIGH/LOW pivots from fractal structure
// ─────────────────────────────────────────────────────────────────────────────
// Fractals give every confirmed pivot; swings keep the alternating sequence
// (a HIGH must be followed by a LOW) so double tops/bottoms and M/W shapes
// are read off a clean skeleton instead of noisy raw bars. Equal-extreme
// clustering: consecutive same-kind fractals collapse to the most extreme.
/** Build the alternating HIGH/LOW swing skeleton from confirmed fractals. */
export function extractSwings(fractals: Fractal[]): SwingPoint[] {
  if (fractals.length === 0) return [];
  const ordered = [...fractals].sort((a, b) => a.index - b.index);
  const swings: SwingPoint[] = [];
  for (const f of ordered) {
    const kind: "HIGH" | "LOW" = f.kind === "UP" ? "HIGH" : "LOW";
    const prev = swings[swings.length - 1];
    if (!prev) {
      swings.push({ index: f.index, price: f.price, kind });
      continue;
    }
    if (prev.kind !== kind) {
      swings.push({ index: f.index, price: f.price, kind });
      continue;
    }
    // Same kind twice in a row — keep the more extreme of the two.
    const better = kind === "HIGH"
      ? (f.price >= prev.price ? f : null)
      : (f.price <= prev.price ? f : null);
    if (better) {
      swings[swings.length - 1] = { index: better.index, price: better.price, kind };
    }
  }
  return swings;
}

/** Distance (in price units) between two levels, for tolerance checks. */
function levelGap(a: number, b: number): number {
  return Math.abs(a - b);
}

// ─────────────────────────────────────────────────────────────────────────────
// REVERSAL PATTERNS — double top/bottom shared options
// ─────────────────────────────────────────────────────────────────────────────
// Canonical rules (PriceActionNinja / CMC):
//   DOUBLE TOP: after an up-move, two swing HIGHs at roughly the same level,
//     separated by a pullback LOW (the neckline). CONFIRMED only when a bar
//     CLOSES below the neckline. Bias BEARISH. Stop: above the higher top.
//     Target (measured move): pattern height projected below the neckline.
//   DOUBLE BOTTOM: mirror image. CONFIRMED on a close above the neckline.
// "Roughly the same level" = extremes within toleranceFrac of the pattern
// height (default 12%); extremes must be ≥3 bars apart so adjacent wiggles
// are not double-counted. Status is FORMING until the confirm close exists.
/** Options shared by all reversal-pattern detectors. */
export interface PatternOptions {
  /** Max extreme mismatch as a fraction of pattern height (default 0.12). */
  toleranceFrac?: number;
  /** Minimum bars between the two extremes (default 3). */
  minBarsApart?: number;
}

function opts(o?: PatternOptions): Required<PatternOptions> {
  return {
    toleranceFrac: o?.toleranceFrac ?? 0.12,
    minBarsApart: o?.minBarsApart ?? 3,
  };
}

/** Compact price formatter (adaptive decimals, no locale commas). */
function fmt(p: number): string {
  if (!Number.isFinite(p)) return "n/a";
  const a = Math.abs(p);
  const d = a >= 1000 ? 2 : a >= 100 ? 2 : a >= 1 ? 4 : 5;
  return p.toFixed(d);
}

/** Scan the swing skeleton for the latest double top or double bottom. */
export function detectDouble(
  swings: SwingPoint[],
  bars: PriceBar[],
  o?: PatternOptions
): ReversalPattern | null {
  const { toleranceFrac, minBarsApart } = opts(o);
  const lastClose = bars.length > 0 ? bars[bars.length - 1].close : NaN;
  // Walk backwards so the freshest structure wins.
  for (let e2 = swings.length - 1; e2 >= 2; e2--) {
    const s2 = swings[e2];
    const neck = swings[e2 - 1];
    const s1 = swings[e2 - 2];
    if (!(s1.kind === s2.kind && neck.kind !== s2.kind)) continue;
    // Recency: the second extreme must be the latest swing of its kind.
    let fresherSameKind = false;
    for (let k = e2 + 1; k < swings.length; k++) {
      if (swings[k].kind === s2.kind) { fresherSameKind = true; break; }
    }
    if (fresherSameKind) continue;
    if (s2.index - s1.index < minBarsApart) continue;
    const height = levelGap(Math.max(s1.price, s2.price), neck.price);
    if (height <= 0) continue;
    const mismatch = levelGap(s1.price, s2.price);
    if (mismatch > height * toleranceFrac) continue;

    if (s2.kind === "HIGH") {
      const top = Math.max(s1.price, s2.price);
      const confirmed = Number.isFinite(lastClose) && lastClose < neck.price;
      return {
        pattern: "DOUBLE_TOP",
        status: confirmed ? "CONFIRMED" : "FORMING",
        firstExtreme: s1.price,
        secondExtreme: s2.price,
        neckline: neck.price,
        tolerancePips: mismatch,
        measuredMove: top - neck.price,
        bias: "BEARISH",
        description: confirmed
          ? `Double top CONFIRMED — close below neckline ${fmt(neck.price)} (tops ${fmt(s1.price)}/${fmt(s2.price)}).`
          : `Double top FORMING — two highs ${fmt(s1.price)}/${fmt(s2.price)}, neckline ${fmt(neck.price)}; needs a close below it.`,
      };
    }
    const bottom = Math.min(s1.price, s2.price);
    const confirmed = Number.isFinite(lastClose) && lastClose > neck.price;
    return {
      pattern: "DOUBLE_BOTTOM",
      status: confirmed ? "CONFIRMED" : "FORMING",
      firstExtreme: s1.price,
      secondExtreme: s2.price,
      neckline: neck.price,
      tolerancePips: mismatch,
      measuredMove: neck.price - bottom,
      bias: "BULLISH",
      description: confirmed
        ? `Double bottom CONFIRMED — close above neckline ${fmt(neck.price)} (bottoms ${fmt(s1.price)}/${fmt(s2.price)}).`
        : `Double bottom FORMING — two lows ${fmt(s1.price)}/${fmt(s2.price)}, neckline ${fmt(neck.price)}; needs a close above it.`,
    };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// HEAD AND SHOULDERS (+ inverse) — three-swing reversal geometry
// ─────────────────────────────────────────────────────────────────────────────
// Canonical (CMC): three highs — left shoulder, HIGHER head, lower right
// shoulder — troughs between them defining one neckline; CONFIRMED on a close
// below the neckline; stop above the head (or right shoulder for a tight
// entry); target = head-to-neckline height projected down. Inverse mirrors.
/** Scan the swing skeleton for head-and-shoulders or its inverse. */
export function detectHeadShoulders(
  swings: SwingPoint[],
  bars: PriceBar[],
  o?: PatternOptions
): ReversalPattern | null {
  return finishHeadShoulders(swings, bars, o);
}

/** Shared H&S finalisation (kept separate so the window loop stays small). */
function finishHeadShoulders(
  swings: SwingPoint[],
  bars: PriceBar[],
  o?: PatternOptions
): ReversalPattern | null {
  const { toleranceFrac, minBarsApart } = opts(o);
  const lastClose = bars.length > 0 ? bars[bars.length - 1].close : NaN;
  for (let end = swings.length - 1; end >= 6; end--) {
    const w = swings.slice(end - 6, end + 1);
    // TOP: L H L H L H L with middle H highest.
    if (w.every((s, i) => s.kind === (i % 2 === 0 ? "LOW" : "HIGH"))) {
      const [t0, lSh, t1, head, t2, rSh, t3] =
        [w[0].price, w[1].price, w[2].price, w[3].price, w[4].price, w[5].price, w[6].price];
      void t0; void t1; void t3;
      if (!(head > lSh && head > rSh)) continue;
      if (w[5].index - w[1].index < minBarsApart) continue;
      const height = head - Math.min(w[2].price, w[4].price);
      if (height <= 0) continue;
      if (levelGap(lSh, rSh) > height * toleranceFrac) continue;
      const neckline = (w[2].price + w[4].price) / 2;
      const confirmed = Number.isFinite(lastClose) && lastClose < neckline;
      return {
        pattern: "HEAD_SHOULDERS",
        status: confirmed ? "CONFIRMED" : "FORMING",
        firstExtreme: lSh,
        secondExtreme: head,
        neckline,
        tolerancePips: levelGap(lSh, rSh),
        measuredMove: head - neckline,
        bias: "BEARISH",
        description: confirmed
          ? `Head-and-shoulders CONFIRMED — close below neckline ${fmt(neckline)}.`
          : `Head-and-shoulders FORMING — head ${fmt(head)}, neckline ${fmt(neckline)}; needs a close below it.`,
      };
    }
    // BOTTOM (inverse): H L H L H L H with middle L lowest.
    if (w.every((s, i) => s.kind === (i % 2 === 0 ? "HIGH" : "LOW"))) {
      const [t0, lSh, t1, head, t2, rSh, t3] =
        [w[0].price, w[1].price, w[2].price, w[3].price, w[4].price, w[5].price, w[6].price];
      void t0; void t1; void t3; void t2;
      if (!(head < lSh && head < rSh)) continue;
      if (w[5].index - w[1].index < minBarsApart) continue;
      const height = Math.max(w[0].price, w[2].price, w[4].price, w[6].price) - head;
      if (height <= 0) continue;
      if (levelGap(lSh, rSh) > height * toleranceFrac) continue;
      const neckline = (w[0].price + w[2].price + w[4].price + w[6].price) / 4;
      const confirmed = Number.isFinite(lastClose) && lastClose > neckline;
      return {
        pattern: "INV_HEAD_SHOULDERS",
        status: confirmed ? "CONFIRMED" : "FORMING",
        firstExtreme: lSh,
        secondExtreme: head,
        neckline,
        tolerancePips: levelGap(lSh, rSh),
        measuredMove: neckline - head,
        bias: "BULLISH",
        description: confirmed
          ? `Inverse head-and-shoulders CONFIRMED — close above neckline ${fmt(neckline)}.`
          : `Inverse H&S FORMING — head ${fmt(head)}, neckline ${fmt(neckline)}; needs a close above it.`,
      };
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// LIQUIDITY RAIDS — wick beyond a swing extreme that closes back inside
// ─────────────────────────────────────────────────────────────────────────────
// This is the exact failure mode in our forensics: 198 RANDOM_NOISE longs,
// nearly all entered as "strong LONG breakout" — price poked above a prior
// swing high (raid of buy-side stops), closed back below it, and reversed.
// A raid is: bar.high > priorSwingHigh + minPenetration AND bar.close <
// priorSwingHigh (mirror for lows). Raids set expectations the OTHER way: a
// buy-side raid is BEARISH evidence (trapped breakout buyers fuel the drop).
/** Scan recent bars for liquidity raids of fractal swing levels. */
export function detectLiquidityRaids(
  bars: PriceBar[],
  fractals: Fractal[],
  o?: { lookbackBars?: number; minPenetrationAtr?: number; atrPrice?: number }
): LiquidityRaid[] {
  const out: LiquidityRaid[] = [];
  if (!Array.isArray(bars) || bars.length < 3) return out;
  const lookback = o?.lookbackBars ?? 12;
  const atr = o?.atrPrice ?? 0;
  const start = Math.max(1, bars.length - lookback);
  for (let i = start; i < bars.length; i++) {
    const priorHighs = fractals.filter(f => f.kind === "UP" && f.index < i - 1);
    const priorLows = fractals.filter(f => f.kind === "DOWN" && f.index < i - 1);
    const swingHigh = priorHighs.length > 0
      ? Math.max(...priorHighs.map(f => f.price)) : NaN;
    const swingLow = priorLows.length > 0
      ? Math.min(...priorLows.map(f => f.price)) : NaN;
    // Require a non-trivial penetration when ATR is known (else any touch).
    const minPen = atr > 0 ? atr * (o?.minPenetrationAtr ?? 0.15) : 0;
    if (Number.isFinite(swingHigh) &&
        bars[i].high > swingHigh + minPen &&
        bars[i].close < swingHigh) {
      out.push({
        index: i,
        raidedLevel: swingHigh,
        side: "BUY_SIDE",
        wickSize: bars[i].high - swingHigh,
        closedBackInside: true,
        bias: "BEARISH",
        description: `Buy-side raid — wicked above ${fmt(swingHigh)} then closed back below. Trapped breakout longs fuel downside.`,
      });
      continue; // one raid per bar is enough signal
    }
    if (Number.isFinite(swingLow) &&
        bars[i].low < swingLow - minPen &&
        bars[i].close > swingLow) {
      out.push({
        index: i,
        raidedLevel: swingLow,
        side: "SELL_SIDE",
        wickSize: swingLow - bars[i].low,
        closedBackInside: true,
        bias: "BULLISH",
        description: `Sell-side raid — wicked below ${fmt(swingLow)} then closed back above. Trapped breakdown shorts fuel upside.`,
      });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// AGGREGATOR
// ─────────────────────────────────────────────────────────────────────────────
// One entry point: feed it OHLC bars (and ATR when known) and get the full
// price-action picture. Bias precedence is deliberate and matches the loss
// forensics: a fresh liquidity raid outranks everything (it is literally the
// pattern of our 198 noise losses); then confirmed reversal patterns; then
// the raw fractal swing skeleton. Range high/low come from the latest
// confirmed fractals — the levels breakout traders (and stop-hunters) watch.
/** Compute full price-action state for a bar series. */
export function analyzePriceAction(
  bars: PriceBar[],
  o?: { atrPrice?: number; sideBars?: number }
): PriceActionState {
  const fractals = detectFractals(bars, o?.sideBars ?? 2);
  const swings = extractSwings(fractals);
  const dbl = detectDouble(swings, bars);
  const hs = detectHeadShoulders(swings, bars);
  const patterns: ReversalPattern[] = [];
  if (dbl) patterns.push(dbl);
  if (hs) patterns.push(hs);
  const raids = detectLiquidityRaids(bars, fractals, {
    lookbackBars: 12,
    minPenetrationAtr: 0.15,
    atrPrice: o?.atrPrice ?? 0,
  });

  const lastUp = latestFractal(fractals, "UP");
  const lastDown = latestFractal(fractals, "DOWN");

  // Bias precedence: fresh raid > confirmed pattern > forming pattern > swings.
  let structureBias: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
  let structureReason = "No dominant price-action structure — mixed or flat swings.";
  const freshRaid = raids.length > 0 ? raids[raids.length - 1] : null;
  const freshBarsOld = freshRaid ? bars.length - 1 - freshRaid.index : 999;
  if (freshRaid && freshBarsOld <= 3) {
    structureBias = freshRaid.bias;
    structureReason = `Fresh ${freshRaid.side === "BUY_SIDE" ? "buy" : "sell"}-side liquidity raid ${freshBarsOld} bar(s) ago (${freshRaid.description})`;
  } else {
    const confirmed = patterns.find(p => p.status === "CONFIRMED");
    if (confirmed) {
      structureBias = confirmed.bias;
      structureReason = confirmed.description;
    } else if (patterns.length > 0) {
      const p = patterns[patterns.length - 1];
      structureReason = `${p.description} (awaiting neckline confirmation — do not front-run).`;
    } else if (lastUp && lastDown) {
      if (lastUp.index > lastDown.index) {
        structureBias = "BEARISH";
        structureReason = `Latest swing is a fractal high at ${fmt(lastUp.price)} — supply overhead until it breaks.`;
      } else {
        structureBias = "BULLISH";
        structureReason = `Latest swing is a fractal low at ${fmt(lastDown.price)} — demand underfoot until it breaks.`;
      }
    }
  }

  return {
    fractals,
    swings,
    patterns,
    raids,
    structureBias,
    structureReason,
    lastSwingHigh: lastUp ? lastUp.price : null,
    lastSwingLow: lastDown ? lastDown.price : null,
    rangeHigh: lastUp ? lastUp.price : null,
    rangeLow: lastDown ? lastDown.price : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PROMPT RENDERING + LOCAL GATE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compact one-liner for logs: swings, active pattern, fresh raid, bias.
 * Example: "F12/S9 · DOUBLE_TOP forming · RAID buy-side · BEARISH".
 */
export function priceActionShortLabel(s: PriceActionState): string {
  const parts: string[] = [`F${s.fractals.length}/S${s.swings.length}`];
  const p = s.patterns.length > 0 ? s.patterns[s.patterns.length - 1] : null;
  parts.push(p ? `${p.pattern} ${p.status.toLowerCase()}` : "no pattern");
  parts.push(s.raids.length > 0 ? `RAID ${s.raids[s.raids.length - 1].side.toLowerCase()}` : "no raid");
  parts.push(s.structureBias);
  return parts.join(" · ");
}

/**
 * Model-friendly markdown for the AI prompt: fractal levels, patterns with
 * necklines/targets, raids, and hard trading rules (never buy into a buy-side
 * raid; never front-run FORMING patterns).
 */
export function priceActionForPrompt(s: PriceActionState, symbol?: string): string {
  const lines: string[] = [];
  lines.push(`## PRICE-ACTION KNOWLEDGE${symbol ? ` (${symbol})` : ""}`);
  const lastUp = s.fractals.filter(f => f.kind === "UP").slice(-3);
  const lastDown = s.fractals.filter(f => f.kind === "DOWN").slice(-3);
  lines.push(`- Fractal swing highs: ${lastUp.length > 0 ? lastUp.map(f => fmt(f.price)).join(", ") : "none"} | swing lows: ${lastDown.length > 0 ? lastDown.map(f => fmt(f.price)).join(", ") : "none"}`);
  lines.push(`- Structure bias: ${s.structureBias} — ${s.structureReason}`);
  if (s.patterns.length > 0) {
    lines.push("- Reversal patterns:");
    for (const p of s.patterns) {
      lines.push(`  • ${p.pattern} ${p.status}: extremes ${fmt(p.firstExtreme)}/${fmt(p.secondExtreme)}, neckline ${fmt(p.neckline)}, measured move ${fmt(p.measuredMove)}, bias ${p.bias}. ${p.description}`);
    }
  } else {
    lines.push("- Reversal patterns: none detected on the swing skeleton.");
  }
  if (s.raids.length > 0) {
    const r = s.raids[s.raids.length - 1];
    lines.push(`- LATEST LIQUIDITY RAID: ${r.description} Bias: ${r.bias}.`);
  } else {
    lines.push("- Liquidity raids: none in the last 12 bars.");
  }
  lines.push("- HARD RULES: (1) Never BUY into a fresh buy-side raid or SELL into a fresh sell-side raid — that is buying the trap that caused our 198 noise losses. (2) FORMING patterns are watch-only; trade only CONFIRMED neckline breaks with a stop beyond the pattern extreme. (3) Respect fractal swing highs/lows as the real support/resistance.");
  return lines.join("\n");
}

/**
 * True when taking `signal` here would trade INTO the trap: a BUY while a
 * fresh buy-side raid is active (price poking above highs then failing), or a
 * SELL while a fresh sell-side raid is active. A stale raid is information,
 * not a veto — freshness defaults to 3 bars.
 */
export function isTradingIntoRaid(
  signal: "BUY" | "SELL" | "HOLD",
  s: PriceActionState,
  totalBars: number,
  freshWithinBars: number = 3
): boolean {
  if (signal === "HOLD" || s.raids.length === 0) return false;
  const r = s.raids[s.raids.length - 1];
  if (totalBars - 1 - r.index > freshWithinBars) return false;
  return (signal === "BUY" && r.side === "BUY_SIDE") ||
         (signal === "SELL" && r.side === "SELL_SIDE");
}

/**
 * True when a CONFIRMED reversal pattern agrees with `signal` (double top /
 * head-and-shoulders confirm a SELL; double bottom / inverse confirm a BUY).
 * Positive confluence for the scalping path.
 */
export function hasConfirmedPatternFor(
  signal: "BUY" | "SELL" | "HOLD",
  s: PriceActionState
): boolean {
  if (signal === "HOLD") return false;
  return s.patterns.some(p =>
    p.status === "CONFIRMED" &&
    ((signal === "SELL" && p.bias === "BEARISH") ||
     (signal === "BUY" && p.bias === "BULLISH")));
}







