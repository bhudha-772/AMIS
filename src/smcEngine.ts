/**
 * AMIS SMART MONEY CONCEPTS (SMC) ENGINE
 * Full institutional-grade market structure analysis engine.
 *
 * Concepts implemented:
 *  - Order Blocks (OB)             — institutional origin candles
 *  - Fair Value Gaps (FVG/Imbalance) — price inefficiency zones
 *  - Break of Structure (BOS)      — continuation signals
 *  - Change of Character (ChoCH)   — reversal signals
 *  - Liquidity Sweeps              — stop-hunt detection
 *  - Equal Highs / Equal Lows      — resting liquidity pools
 *  - Premium / Discount Zones      — Fibonacci equilibrium areas
 *  - Inducement Levels             — false breakout traps
 *  - Market Structure Shift (MSS)  — internal structure change
 *  - Swing Point Detection         — objective HH/HL/LH/LL classification
 *
 * Platform-agnostic: works identically on MT5 (Forex), Deriv (Synthetics), and Binance (Crypto).
 * Input: CandleData[] from the UnifiedCandleNormalizer.
 */

import { CandleData } from './unifiedCandles';
import type {
  FixedRangeVolumeProfile,
  VolumeProfileBin,
  PocReaction,
  VolumeProfileAnalysis,
} from './strategyTypes';

// ─────────────────────────────────────────────────────────────────────────────
// OUTPUT TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type SMCBias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type SMCStrength = 'STRONG' | 'MODERATE' | 'WEAK';

export interface SwingPoint {
  index: number;
  price: number;
  type: 'HIGH' | 'LOW';
  isConfirmed: boolean;
  isMitigated: boolean;
}

export interface OrderBlock {
  id: string;
  type: 'BULLISH' | 'BEARISH';           // Bullish OB = demand zone; Bearish OB = supply zone
  topPrice: number;
  bottomPrice: number;
  midPrice: number;
  originCandleIndex: number;
  strength: number;                        // 0–100
  isMitigated: boolean;                    // Price returned to this OB
  mitigationPct: number;                   // How deep price penetrated (0–100)
  volumeRatio: number;                     // OB candle volume vs average (>1 = strong)
  label: string;
}

export interface FairValueGap {
  id: string;
  type: 'BULLISH' | 'BEARISH';            // Bullish FVG = up imbalance; Bearish = down imbalance
  topPrice: number;
  bottomPrice: number;
  midPrice: number;
  gapSize: number;                         // Absolute gap size
  gapPct: number;                          // Gap as % of price
  candleIndex: number;                     // Middle candle of 3-candle pattern
  isFilled: boolean;                       // Has price returned to fill it
  fillPct: number;                         // How much has been filled (0–100)
  label: string;
}

export interface LiquiditySweep {
  index: number;
  type: 'SWEEP_HIGH' | 'SWEEP_LOW';
  sweptPrice: number;                      // The swept liquidity level
  sweepCandleHigh: number;
  sweepCandleLow: number;
  reversalConfirmed: boolean;              // Did price reject strongly after the sweep?
  strength: SMCStrength;
}

export interface EqualLevel {
  type: 'EQUAL_HIGH' | 'EQUAL_LOW';
  price: number;
  touches: number;                         // How many times this level has been tested
  indices: number[];
  isSwept: boolean;
}

export interface MarketStructureEvent {
  index: number;
  type: 'BOS' | 'CHOCH' | 'MSS';          // Break of Structure / Change of Character / Market Structure Shift
  price: number;
  direction: 'BULLISH' | 'BEARISH';
  isInternal: boolean;                     // Internal (minor) or external (major) structure
  label: string;
}

export interface PremiumDiscountZone {
  equilibrium: number;                     // 50% of the range (mid-point)
  premiumTop: number;                      // 78.6% Fib retracement
  premiumBottom: number;                   // 61.8% Fib
  discountTop: number;                     // 38.2% Fib
  discountBottom: number;                  // 21.4% Fib
  currentZone: 'PREMIUM' | 'EQUILIBRIUM' | 'DISCOUNT';
  biasedDirection: 'LOOK_FOR_SELLS' | 'LOOK_FOR_BUYS' | 'NEUTRAL';
}

export interface InducementLevel {
  type: 'HIGH_INDUCEMENT' | 'LOW_INDUCEMENT';
  price: number;
  index: number;
  isTriggered: boolean;
}

export interface SMCAnalysisResult {
  // Meta
  symbol: string;
  provider: string;
  candleCount: number;
  analysisTimestamp: number;

  // Core bias
  overallBias: SMCBias;
  biasStrength: SMCStrength;
  biasConfidence: number;                  // 0–100

  // Structural elements
  swingPoints: SwingPoint[];
  orderBlocks: OrderBlock[];
  fairValueGaps: FairValueGap[];
  liquiditySweeps: LiquiditySweep[];
  equalHighs: EqualLevel[];
  equalLows: EqualLevel[];
  structureEvents: MarketStructureEvent[];
  premiumDiscount: PremiumDiscountZone;
  inducementLevels: InducementLevel[];

  // Key levels
  keyResistance: number[];
  keySupport: number[];
  nearestOB: OrderBlock | null;
  nearestFVG: FairValueGap | null;
  lastBOS: MarketStructureEvent | null;
  lastChoCH: MarketStructureEvent | null;

  // Trading signals
  tradeSetup: SMCTradeSetup | null;
  summary: string[];

  // Volume Profile + Point of Control (POC) — Higher/Lower entry layer
  volumeProfile: VolumeProfileAnalysis;
}

export interface SMCTradeSetup {
  direction: 'LONG' | 'SHORT' | 'NONE';
  confidence: number;
  entryZone: { top: number; bottom: number };
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  riskRewardRatio: number;
  setupType: string;
  reasoning: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// ENGINE IMPLEMENTATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detects swing highs and lows using a left/right lookback window.
 * Requires at least `lookback` candles on each side to confirm a swing point.
 */
function detectSwingPoints(candles: CandleData[], lookback: number = 3): SwingPoint[] {
  const points: SwingPoint[] = [];
  const n = candles.length;

  for (let i = lookback; i < n - lookback; i++) {
    const current = candles[i];
    let isSwingHigh = true;
    let isSwingLow = true;

    for (let j = 1; j <= lookback; j++) {
      if (candles[i - j].high >= current.high) isSwingHigh = false;
      if (candles[i + j].high > current.high) isSwingHigh = false;
      if (candles[i - j].low <= current.low) isSwingLow = false;
      if (candles[i + j].low < current.low) isSwingLow = false;
    }

    if (isSwingHigh) {
      points.push({
        index: i,
        price: current.high,
        type: 'HIGH',
        isConfirmed: true,
        isMitigated: false
      });
    }
    if (isSwingLow) {
      points.push({
        index: i,
        price: current.low,
        type: 'LOW',
        isConfirmed: true,
        isMitigated: false
      });
    }
  }

  // Mark mitigated swing points (price returned to that level)
  const lastClose = candles[n - 1]?.close ?? 0;
  points.forEach(p => {
    if (p.type === 'HIGH' && lastClose >= p.price * 0.999) p.isMitigated = true;
    if (p.type === 'LOW' && lastClose <= p.price * 1.001) p.isMitigated = true;
  });

  return points;
}

/**
 * Detect Order Blocks — the last down-candle before a significant up-move (bullish OB)
 * or the last up-candle before a significant down-move (bearish OB).
 */
function detectOrderBlocks(candles: CandleData[], atr: number): OrderBlock[] {
  const blocks: OrderBlock[] = [];
  const n = candles.length;
  if (n < 5) return blocks;
  const avgVol = candles.reduce((s, c) => s + c.volume, 0) / (n || 1);
  // Displacement threshold. A 5-bar look-forward window plus a slightly softer
  // threshold keeps genuine institutional origin candles (which often launch on
  // the 3rd-5th bar) from being discarded, which previously made real MT5 charts
  // report "0 order blocks".
  const minDisplacement = Math.max(atr * 0.5, (candles[n - 1].close || 1) * 0.0002);
  const lookForward = Math.min(5, n - 1);

  for (let i = 1; i < n - 2; i++) {
    const c = candles[i];
    const futureHighs: number[] = [];
    const futureCloses: number[] = [];
    const futureLows: number[] = [];
    for (let k = i + 1; k <= Math.min(i + lookForward, n - 1); k++) {
      futureHighs.push(candles[k].high);
      futureCloses.push(candles[k].close);
      futureLows.push(candles[k].low);
    }
    const cNext = candles[i + 1];

    // Bullish Order Block (Demand Zone):
    // Bearish/neutral origin candle followed by a strong multi-candle bullish expansion
    if (c.close <= c.open || (c.high - c.low > 0 && (c.close - c.low) / (c.high - c.low) < 0.4)) {
      const maxFutureClose = Math.max(...futureCloses, cNext.close);
      const maxFutureHigh = Math.max(...futureHighs, cNext.high);
      const displacement = maxFutureClose - c.low;

      if (displacement >= minDisplacement && maxFutureHigh > c.high) {
        const volRatio = avgVol > 0 ? c.volume / avgVol : 1;
        const topPrice = Math.max(c.open, c.close);
        const bottomPrice = c.low;
        const strength = Math.min(100, Math.round((displacement / (atr || 1e-5)) * 30 + Math.min(2, volRatio) * 20));

        blocks.push({
          id: `OB-BULL-${i}`,
          type: 'BULLISH',
          topPrice,
          bottomPrice,
          midPrice: (topPrice + bottomPrice) / 2,
          originCandleIndex: i,
          strength: Math.max(45, strength),
          isMitigated: false,
          mitigationPct: 0,
          volumeRatio: volRatio,
          label: `Demand OB @ ${bottomPrice.toFixed(5)}`
        });
      }
    }

    // Bearish Order Block (Supply Zone):
    // Bullish/neutral origin candle followed by a strong multi-candle bearish expansion
    if (c.close >= c.open || (c.high - c.low > 0 && (c.high - c.close) / (c.high - c.low) < 0.4)) {
      const minFutureClose = Math.min(...futureCloses, cNext.close);
      const minFutureLow = Math.min(...futureLows, cNext.low);
      const displacement = c.high - minFutureClose;

      if (displacement >= minDisplacement && minFutureLow < c.low) {
        const volRatio = avgVol > 0 ? c.volume / avgVol : 1;
        const topPrice = c.high;
        const bottomPrice = Math.min(c.open, c.close);
        const strength = Math.min(100, Math.round((displacement / (atr || 1e-5)) * 30 + Math.min(2, volRatio) * 20));

        blocks.push({
          id: `OB-BEAR-${i}`,
          type: 'BEARISH',
          topPrice,
          bottomPrice,
          midPrice: (topPrice + bottomPrice) / 2,
          originCandleIndex: i,
          strength: Math.max(45, strength),
          isMitigated: false,
          mitigationPct: 0,
          volumeRatio: volRatio,
          label: `Supply OB @ ${topPrice.toFixed(5)}`
        });
      }
    }
  }

  // Mark mitigated OBs — the zone counts as mitigated only when price CLOSED
  // through at least 50% of the block. Wick-only taps are normal retests, not
  // mitigation; counting them made almost every zone "mitigated" within a couple
  // of bars, which left the panel with zero ACTIVE order blocks to display.
  for (let b = 0; b < blocks.length; b++) {
    const ob = blocks[b];
    const zoneHeight = ob.topPrice - ob.bottomPrice || 1e-5;
    for (let k = ob.originCandleIndex + 2; k < n; k++) {
      const bar = candles[k];
      const depthPct = ob.type === 'BULLISH'
        ? ((ob.topPrice - bar.close) / zoneHeight) * 100
        : ((bar.close - ob.bottomPrice) / zoneHeight) * 100;
      if (depthPct >= 50) {
        ob.isMitigated = true;
        ob.mitigationPct = Math.min(100, Math.round(depthPct));
        break;
      }
      // Record the deepest wick penetration without mitigation
      const wickDepth = ob.type === 'BULLISH'
        ? ((ob.topPrice - bar.low) / zoneHeight) * 100
        : ((bar.high - ob.bottomPrice) / zoneHeight) * 100;
      if (wickDepth > ob.mitigationPct) ob.mitigationPct = Math.min(100, Math.round(wickDepth));
    }
  }

  // Keep the 8 most recent blocks, active (unmitigated) ones first.
  const active = blocks.filter(b => !b.isMitigated);
  const mitigated = blocks.filter(b => b.isMitigated);
  return [...active.slice(-8), ...mitigated.slice(-4)];
}

/**
 * Detect Fair Value Gaps (FVGs) — 3-candle imbalance pattern.
 * Bullish FVG: candle[i-1].high < candle[i+1].low (gap in upward move)
 * Bearish FVG: candle[i-1].low > candle[i+1].high (gap in downward move)
 */
function detectFairValueGaps(candles: CandleData[]): FairValueGap[] {
  const gaps: FairValueGap[] = [];
  const n = candles.length;

  for (let i = 1; i < n - 1; i++) {
    const c1 = candles[i - 1]; // Left candle
    const c2 = candles[i];     // Middle candle (the imbalance candle)
    const c3 = candles[i + 1]; // Right candle

    // Bullish FVG: Gap between c1.high and c3.low
    if (c3.low > c1.high) {
      const gapSize = c3.low - c1.high;
      const mid = c2.close;
      const gapPct = (gapSize / mid) * 100;
      if (gapPct > 0.01) { // Filter micro-gaps (> 0.01%)
        gaps.push({
          id: `FVG-BULL-${i}`,
          type: 'BULLISH',
          topPrice: c3.low,
          bottomPrice: c1.high,
          midPrice: (c3.low + c1.high) / 2,
          gapSize,
          gapPct,
          candleIndex: i,
          isFilled: false,
          fillPct: 0,
          label: `Bullish FVG ${gapPct.toFixed(2)}%`
        });
      }
    }

    // Bearish FVG: Gap between c3.high and c1.low
    if (c3.high < c1.low) {
      const gapSize = c1.low - c3.high;
      const mid = c2.close;
      const gapPct = (gapSize / mid) * 100;
      if (gapPct > 0.01) {
        gaps.push({
          id: `FVG-BEAR-${i}`,
          type: 'BEARISH',
          topPrice: c1.low,
          bottomPrice: c3.high,
          midPrice: (c1.low + c3.high) / 2,
          gapSize,
          gapPct,
          candleIndex: i,
          isFilled: false,
          fillPct: 0,
          label: `Bearish FVG ${gapPct.toFixed(2)}%`
        });
      }
    }
  }

  // Mark filled FVGs
  const lastPrice = candles[n - 1]?.close ?? 0;
  gaps.forEach(g => {
    if (g.type === 'BULLISH' && lastPrice <= g.topPrice) {
      const penetration = g.topPrice - lastPrice;
      g.fillPct = Math.min(100, Math.round((penetration / (g.topPrice - g.bottomPrice || 1)) * 100));
      if (lastPrice <= g.bottomPrice) g.isFilled = true;
    }
    if (g.type === 'BEARISH' && lastPrice >= g.bottomPrice) {
      const penetration = lastPrice - g.bottomPrice;
      g.fillPct = Math.min(100, Math.round((penetration / (g.topPrice - g.bottomPrice || 1)) * 100));
      if (lastPrice >= g.topPrice) g.isFilled = true;
    }
  });

  return gaps.slice(-10); // Keep most recent 10
}

/**
 * Detect Break of Structure (BOS) and Change of Character (ChoCH) events.
 *
 * BOS = price breaks a swing point in the direction of the trend (continuation)
 * ChoCH = price breaks a swing point AGAINST the trend (potential reversal)
 */
function detectStructureEvents(candles: CandleData[], swingPoints: SwingPoint[]): MarketStructureEvent[] {
  const events: MarketStructureEvent[] = [];
  const n = candles.length;

  if (swingPoints.length < 4) return events;

  const highs = swingPoints.filter(p => p.type === 'HIGH').sort((a, b) => a.index - b.index);
  const lows = swingPoints.filter(p => p.type === 'LOW').sort((a, b) => a.index - b.index);

  // Determine prevailing structure bias
  let bias: SMCBias = 'NEUTRAL';
  if (highs.length >= 2 && lows.length >= 2) {
    const lastHH = highs[highs.length - 1].price > highs[highs.length - 2].price;
    const lastHL = lows[lows.length - 1].price > lows[lows.length - 2].price;
    if (lastHH && lastHL) bias = 'BULLISH';
    else if (!lastHH && !lastHL) bias = 'BEARISH';
  }

  // Check recent candles for structure breaks
  for (let i = 20; i < n; i++) {
    const currentClose = candles[i].close;
    const currentHigh = candles[i].high;
    const currentLow = candles[i].low;

    // Get the most recent swing high and low before this candle
    const prevHighs = highs.filter(p => p.index < i);
    const prevLows = lows.filter(p => p.index < i);

    if (prevHighs.length === 0 || prevLows.length === 0) continue;

    const lastSwingHigh = prevHighs[prevHighs.length - 1];
    const lastSwingLow = prevLows[prevLows.length - 1];

    // Bullish BOS: price closes above last swing high in bullish trend
    if (bias === 'BULLISH' && currentClose > lastSwingHigh.price) {
      if (!events.find(e => e.index === i)) {
        events.push({
          index: i,
          type: 'BOS',
          price: lastSwingHigh.price,
          direction: 'BULLISH',
          isInternal: false,
          label: `BOS ↑ ${lastSwingHigh.price.toFixed(5)}`
        });
      }
    }

    // Bearish BOS: price closes below last swing low in bearish trend
    if (bias === 'BEARISH' && currentClose < lastSwingLow.price) {
      if (!events.find(e => e.index === i)) {
        events.push({
          index: i,
          type: 'BOS',
          price: lastSwingLow.price,
          direction: 'BEARISH',
          isInternal: false,
          label: `BOS ↓ ${lastSwingLow.price.toFixed(5)}`
        });
      }
    }

    // Bullish ChoCH: price breaks above swing high in a BEARISH trend
    if (bias === 'BEARISH' && currentClose > lastSwingHigh.price) {
      if (!events.find(e => e.index === i)) {
        events.push({
          index: i,
          type: 'CHOCH',
          price: lastSwingHigh.price,
          direction: 'BULLISH',
          isInternal: false,
          label: `ChoCH ↑ REVERSAL`
        });
        bias = 'BULLISH'; // Structure shifted
      }
    }

    // Bearish ChoCH: price breaks below swing low in a BULLISH trend
    if (bias === 'BULLISH' && currentClose < lastSwingLow.price) {
      if (!events.find(e => e.index === i)) {
        events.push({
          index: i,
          type: 'CHOCH',
          price: lastSwingLow.price,
          direction: 'BEARISH',
          isInternal: false,
          label: `ChoCH ↓ REVERSAL`
        });
        bias = 'BEARISH'; // Structure shifted
      }
    }
  }

  return events.slice(-10);
}

/**
 * Detect liquidity sweeps — where price spikes beyond a swing level then reverses,
 * indicating institutional stop-hunting before a move in the opposite direction.
 */
function detectLiquiditySweeps(candles: CandleData[], swingPoints: SwingPoint[], atr: number): LiquiditySweep[] {
  const sweeps: LiquiditySweep[] = [];
  const n = candles.length;

  for (let i = 5; i < n; i++) {
    const c = candles[i];
    const prevHighs = swingPoints.filter(p => p.type === 'HIGH' && p.index < i - 1);
    const prevLows = swingPoints.filter(p => p.type === 'LOW' && p.index < i - 1);

    if (prevHighs.length > 0) {
      const lastHigh = prevHighs[prevHighs.length - 1];
      // Sweep high: wick exceeds prior high, but closes back below
      if (c.high > lastHigh.price && c.close < lastHigh.price) {
        const rejectionSize = c.high - c.close;
        const strength: SMCStrength = rejectionSize > atr * 1.5 ? 'STRONG' : rejectionSize > atr * 0.8 ? 'MODERATE' : 'WEAK';
        sweeps.push({
          index: i,
          type: 'SWEEP_HIGH',
          sweptPrice: lastHigh.price,
          sweepCandleHigh: c.high,
          sweepCandleLow: c.low,
          reversalConfirmed: c.close < lastHigh.price * 0.999,
          strength
        });
      }
    }

    if (prevLows.length > 0) {
      const lastLow = prevLows[prevLows.length - 1];
      // Sweep low: wick goes below prior low, but closes back above
      if (c.low < lastLow.price && c.close > lastLow.price) {
        const rejectionSize = c.close - c.low;
        const strength: SMCStrength = rejectionSize > atr * 1.5 ? 'STRONG' : rejectionSize > atr * 0.8 ? 'MODERATE' : 'WEAK';
        sweeps.push({
          index: i,
          type: 'SWEEP_LOW',
          sweptPrice: lastLow.price,
          sweepCandleHigh: c.high,
          sweepCandleLow: c.low,
          reversalConfirmed: c.close > lastLow.price * 1.001,
          strength
        });
      }
    }
  }

  return sweeps.slice(-6);
}

/**
 * Detect Equal Highs and Equal Lows — clustered swing levels within a tolerance band.
 * These represent pools of resting liquidity (stop orders) likely to be swept.
 */
function detectEqualLevels(swingPoints: SwingPoint[], tolerance: number = 0.001): { highs: EqualLevel[]; lows: EqualLevel[] } {
  const highs = swingPoints.filter(p => p.type === 'HIGH');
  const lows = swingPoints.filter(p => p.type === 'LOW');
  const equalHighs: EqualLevel[] = [];
  const equalLows: EqualLevel[] = [];

  // Equal highs
  for (let i = 0; i < highs.length; i++) {
    const cluster = highs.filter(h => Math.abs(h.price - highs[i].price) / highs[i].price < tolerance);
    if (cluster.length >= 2) {
      const avgPrice = cluster.reduce((s, h) => s + h.price, 0) / cluster.length;
      if (!equalHighs.find(e => Math.abs(e.price - avgPrice) / avgPrice < tolerance)) {
        equalHighs.push({
          type: 'EQUAL_HIGH',
          price: avgPrice,
          touches: cluster.length,
          indices: cluster.map(h => h.index),
          isSwept: false
        });
      }
    }
  }

  // Equal lows
  for (let i = 0; i < lows.length; i++) {
    const cluster = lows.filter(l => Math.abs(l.price - lows[i].price) / lows[i].price < tolerance);
    if (cluster.length >= 2) {
      const avgPrice = cluster.reduce((s, l) => s + l.price, 0) / cluster.length;
      if (!equalLows.find(e => Math.abs(e.price - avgPrice) / avgPrice < tolerance)) {
        equalLows.push({
          type: 'EQUAL_LOW',
          price: avgPrice,
          touches: cluster.length,
          indices: cluster.map(l => l.index),
          isSwept: false
        });
      }
    }
  }

  return { highs: equalHighs, lows: equalLows };
}

/**
 * Compute Premium/Discount Zones using Fibonacci levels between the most recent
 * significant swing high and swing low.
 */
function computePremiumDiscountZone(candles: CandleData[], swingPoints: SwingPoint[]): PremiumDiscountZone {
  const n = candles.length;
  const lastPrice = candles[n - 1]?.close ?? 0;

  const highs = swingPoints.filter(p => p.type === 'HIGH');
  const lows = swingPoints.filter(p => p.type === 'LOW');

  const rangeHigh = highs.length > 0 ? Math.max(...highs.map(h => h.price)) : lastPrice * 1.02;
  const rangeLow = lows.length > 0 ? Math.min(...lows.map(l => l.price)) : lastPrice * 0.98;
  const range = rangeHigh - rangeLow;

  const equilibrium = rangeLow + range * 0.5;      // 50%
  const premiumTop = rangeLow + range * 0.786;      // 78.6%
  const premiumBottom = rangeLow + range * 0.618;   // 61.8%
  const discountTop = rangeLow + range * 0.382;     // 38.2%
  const discountBottom = rangeLow + range * 0.214;  // 21.4%

  let currentZone: 'PREMIUM' | 'EQUILIBRIUM' | 'DISCOUNT';
  let biasedDirection: 'LOOK_FOR_SELLS' | 'LOOK_FOR_BUYS' | 'NEUTRAL';

  if (lastPrice >= premiumBottom) {
    currentZone = 'PREMIUM';
    biasedDirection = 'LOOK_FOR_SELLS';
  } else if (lastPrice <= discountTop) {
    currentZone = 'DISCOUNT';
    biasedDirection = 'LOOK_FOR_BUYS';
  } else {
    currentZone = 'EQUILIBRIUM';
    biasedDirection = 'NEUTRAL';
  }

  return { equilibrium, premiumTop, premiumBottom, discountTop, discountBottom, currentZone, biasedDirection };
}

/**
 * Detect Inducement levels — minor swing points that appear to be breakout opportunities
 * but are actually false breaks designed to trap retail traders before the real move.
 */
function detectInducement(swingPoints: SwingPoint[], structureEvents: MarketStructureEvent[]): InducementLevel[] {
  const levels: InducementLevel[] = [];

  // Inducement = a swing point that was swept but structure event (ChoCH) happened right after
  const chochEvents = structureEvents.filter(e => e.type === 'CHOCH');

  swingPoints.forEach(sp => {
    const nearbyChoch = chochEvents.find(e => Math.abs(e.index - sp.index) <= 5);
    if (nearbyChoch && sp.isMitigated) {
      levels.push({
        type: sp.type === 'HIGH' ? 'HIGH_INDUCEMENT' : 'LOW_INDUCEMENT',
        price: sp.price,
        index: sp.index,
        isTriggered: true
      });
    }
  });

  return levels.slice(-4);
}

/**
 * Calculate ATR from candles
 */
function calcATR(candles: CandleData[], period: number = 14): number {
  const n = candles.length;
  if (n < 2) return candles[0] ? Math.max(0.0001, candles[0].high - candles[0].low) : 0.001;
  const trValues: number[] = [];
  for (let i = 1; i < n; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    trValues.push(tr);
  }
  const atrValues = trValues.slice(-period);
  return atrValues.reduce((s, v) => s + v, 0) / (atrValues.length || 1);
}

/**
 * Determine overall market bias from structure (HH/HL vs LH/LL) and recent events.
 */
function determineBias(swingPoints: SwingPoint[], structureEvents: MarketStructureEvent[]): { bias: SMCBias; confidence: number } {
  const highs = swingPoints.filter(p => p.type === 'HIGH').slice(-4);
  const lows = swingPoints.filter(p => p.type === 'LOW').slice(-4);

  let bullScore = 0;
  let bearScore = 0;

  // Higher Highs → Bullish
  for (let i = 1; i < highs.length; i++) {
    if (highs[i].price > highs[i - 1].price) bullScore += 25;
    else bearScore += 25;
  }

  // Higher Lows → Bullish
  for (let i = 1; i < lows.length; i++) {
    if (lows[i].price > lows[i - 1].price) bullScore += 25;
    else bearScore += 25;
  }

  // Recent structure events
  structureEvents.slice(-3).forEach(e => {
    if (e.type === 'CHOCH' && e.direction === 'BULLISH') bullScore += 30;
    if (e.type === 'CHOCH' && e.direction === 'BEARISH') bearScore += 30;
    if (e.type === 'BOS' && e.direction === 'BULLISH') bullScore += 15;
    if (e.type === 'BOS' && e.direction === 'BEARISH') bearScore += 15;
  });

  const total = bullScore + bearScore || 1;
  if (bullScore > bearScore) {
    return { bias: 'BULLISH', confidence: Math.round((bullScore / total) * 100) };
  } else if (bearScore > bullScore) {
    return { bias: 'BEARISH', confidence: Math.round((bearScore / total) * 100) };
  }
  return { bias: 'NEUTRAL', confidence: 50 };
}

/**
 * Generate a trade setup based on SMC confluence:
 * - Price in discount/premium zone
 * - Order Block present
 * - FVG present
 * - Structure event confirming direction
 */
function generateTradeSetup(
  candles: CandleData[],
  bias: SMCBias,
  orderBlocks: OrderBlock[],
  fvgs: FairValueGap[],
  sweeps: LiquiditySweep[],
  premDis: PremiumDiscountZone,
  atr: number
): SMCTradeSetup | null {
  const lastPrice = candles[candles.length - 1]?.close ?? 0;
  if (bias === 'NEUTRAL' || lastPrice === 0) return null;

  const relevantOBs = orderBlocks.filter(ob => ob.type === (bias === 'BULLISH' ? 'BULLISH' : 'BEARISH') && !ob.isMitigated);
  const relevantFVGs = fvgs.filter(fvg => fvg.type === (bias === 'BULLISH' ? 'BULLISH' : 'BEARISH') && !fvg.isFilled);
  const recentSweep = sweeps[sweeps.length - 1];

  let confidence = 0;
  const reasoning: string[] = [];

  // Confluence scoring
  if (premDis.biasedDirection === 'LOOK_FOR_BUYS' && bias === 'BULLISH') { confidence += 25; reasoning.push('Price in discount zone — favorable for longs'); }
  if (premDis.biasedDirection === 'LOOK_FOR_SELLS' && bias === 'BEARISH') { confidence += 25; reasoning.push('Price in premium zone — favorable for shorts'); }
  if (relevantOBs.length > 0) { confidence += 30; reasoning.push(`${bias} Order Block present at ${relevantOBs[0].midPrice.toFixed(5)}`); }
  if (relevantFVGs.length > 0) { confidence += 20; reasoning.push(`Unfilled ${bias} FVG — price likely to revisit`); }
  if (recentSweep?.reversalConfirmed) { confidence += 25; reasoning.push(`Liquidity sweep confirmed — ${recentSweep.type} with reversal`); }

  if (confidence < 30) return null;

  const nearOB = relevantOBs[0];
  const entryTop = nearOB ? nearOB.topPrice : lastPrice + atr * 0.3;
  const entryBottom = nearOB ? nearOB.bottomPrice : lastPrice - atr * 0.3;

  if (bias === 'BULLISH') {
    const sl = entryBottom - atr * 0.5;
    const tp1 = entryTop + atr * 2;
    const tp2 = entryTop + atr * 4;
    const rr = (tp1 - entryTop) / (entryTop - sl || 1);
    return {
      direction: 'LONG',
      confidence: Math.min(95, confidence),
      entryZone: { top: entryTop, bottom: entryBottom },
      stopLoss: sl,
      takeProfit1: tp1,
      takeProfit2: tp2,
      riskRewardRatio: parseFloat(rr.toFixed(2)),
      setupType: 'SMC Bullish OB Entry',
      reasoning
    };
  } else {
    const sl = entryTop + atr * 0.5;
    const tp1 = entryBottom - atr * 2;
    const tp2 = entryBottom - atr * 4;
    const rr = (entryBottom - tp1) / (sl - entryBottom || 1);
    return {
      direction: 'SHORT',
      confidence: Math.min(95, confidence),
      entryZone: { top: entryTop, bottom: entryBottom },
      stopLoss: sl,
      takeProfit1: tp1,
      takeProfit2: tp2,
      riskRewardRatio: parseFloat(rr.toFixed(2)),
      setupType: 'SMC Bearish OB Entry',
      reasoning
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// VOLUME PROFILE ENGINE — Fixed Range Volume Profile + Point of Control (POC)
// ─────────────────────────────────────────────────────────────────────────────

export function calculateFixedRangeVolumeProfile(
  candles: CandleData[],
  startIndex: number,
  endIndex: number,
  direction: 'BULLISH' | 'BEARISH',
  binCount: number = 50
): FixedRangeVolumeProfile | null {
  const n = candles.length;
  if (startIndex < 0 || endIndex >= n || startIndex >= endIndex) return null;
  const rangeCandles = candles.slice(startIndex, endIndex + 1);
  if (rangeCandles.length === 0) return null;
  let rangeLow = Infinity;
  let rangeHigh = -Infinity;
  for (const c of rangeCandles) {
    rangeLow = Math.min(rangeLow, c.low);
    rangeHigh = Math.max(rangeHigh, c.high);
  }
  const rangeSpan = rangeHigh - rangeLow;
  if (rangeSpan <= 0) return null;
  const binSize = rangeSpan / binCount;
  const bins = new Map<number, { volume: number; touches: number }>();
  for (const c of rangeCandles) {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    const volume = c.volume > 0 ? c.volume : 1;
    const lowBin = Math.floor((c.low - rangeLow) / binSize);
    const highBin = Math.floor((c.high - rangeLow) / binSize);
    for (let b = lowBin; b <= highBin && b < binCount; b++) {
      const binKey = b;
      const binPrice = rangeLow + (binKey + 0.5) * binSize;
      const existing = bins.get(binKey) ?? { volume: 0, touches: 0 };
      existing.volume += volume / (highBin - lowBin + 1);
      existing.touches += 1;
      bins.set(binKey, existing);
    }
  }
  let pocBin: VolumeProfileBin | null = null;
  let maxVolume = -1;
  let totalVolume = 0;
  for (const [binKey, data] of bins) {
    totalVolume += data.volume;
    if (data.volume > maxVolume) {
      maxVolume = data.volume;
      const binPrice = rangeLow + (binKey + 0.5) * binSize;
      pocBin = { price: binPrice, volume: data.volume, touchCount: data.touches };
    }
  }
  if (!pocBin) return null;
  const pocZoneHalfSize = binSize * 0.5;
  return {
    rangeStart: direction === 'BULLISH' ? rangeLow : rangeHigh,
    rangeEnd: direction === 'BULLISH' ? rangeHigh : rangeLow,
    direction,
    bins: Array.from(bins.entries()).map(([binKey, data]) => ({
      price: rangeLow + (Number(binKey) + 0.5) * binSize,
      volume: data.volume,
      touchCount: data.touches,
    })),
    poc: pocBin,
    pocZone: { top: pocBin.price + pocZoneHalfSize, bottom: pocBin.price - pocZoneHalfSize },
    totalVolume,
    binCount,
  };
}

/**
 * Detect whether price has returned to the POC zone and is reacting.
 * For BULLISH: price pulled back down to POC, now showing upward rejection/bounce
 * For BEARISH: price retraced up to POC, now showing downward rejection
 */
export function detectPocReaction(
  candles: CandleData[],
  profile: FixedRangeVolumeProfile,
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL',
  atr: number
): PocReaction | null {
  const n = candles.length;
  if (n < 3) return null;
  const { poc, pocZone, direction } = profile;
  const lookback = Math.min(20, n - 1);
  let priceWasInPocZone = false;
  let priceLeftPocZone = false;
  let priceReturnedToPoc = false;
  let reactionConfirmed = false;
  let reactionType: 'BOUNCE' | 'REJECTION' | 'BREAKTHROUGH' | 'NONE' = 'NONE';
  let confirmationIndex = n - 1;
  for (let i = n - lookback; i < n; i++) {
    const c = candles[i];
    const closeInZone = c.close >= pocZone.bottom && c.close <= pocZone.top;
    const highInZone = c.high >= pocZone.bottom && c.high <= pocZone.top;
    const lowInZone = c.low >= pocZone.bottom && c.low <= pocZone.top;
    if (closeInZone || highInZone || lowInZone) {
      priceWasInPocZone = true;
    }
    if (direction === 'BULLISH') {
      if (c.low > pocZone.top) priceLeftPocZone = true;
    } else {
      if (c.high < pocZone.bottom) priceLeftPocZone = true;
    }
    if (closeInZone || highInZone || lowInZone) {
      priceReturnedToPoc = true;
      confirmationIndex = i;
    }
  }
  const lastCandle = candles[n - 1];
  const prevCandle = candles[n - 2];
  const pocPrice = poc.price;
  if (priceReturnedToPoc && priceWasInPocZone) {
    if (bias === 'BULLISH') {
      if (lastCandle.close > pocPrice && lastCandle.close > prevCandle.close) {
        reactionType = 'BOUNCE';
        reactionConfirmed = true;
      } else if (lastCandle.low <= pocZone.bottom && lastCandle.close > pocZone.bottom) {
        reactionType = 'BOUNCE';
        reactionConfirmed = true;
      } else if (lastCandle.close < pocZone.bottom) {
        reactionType = 'BREAKTHROUGH';
        reactionConfirmed = false;
      }
    } else if (bias === 'BEARISH') {
      if (lastCandle.close < pocPrice && lastCandle.close < prevCandle.close) {
        reactionType = 'REJECTION';
        reactionConfirmed = true;
      } else if (lastCandle.high >= pocZone.top && lastCandle.close < pocZone.top) {
        reactionType = 'REJECTION';
        reactionConfirmed = true;
      } else if (lastCandle.close > pocZone.top) {
        reactionType = 'BREAKTHROUGH';
        reactionConfirmed = false;
      }
    }
  }
  let entryPrice = pocPrice;
  let stopLossPrice = 0;
  let takeProfit1 = 0;
  let takeProfit2 = 0;
  if (bias === 'BULLISH' && reactionConfirmed) {
    entryPrice = pocPrice;
    stopLossPrice = pocZone.bottom - atr * 0.5;
    takeProfit1 = pocPrice + atr * 2;
    takeProfit2 = pocPrice + atr * 4;
  } else if (bias === 'BEARISH' && reactionConfirmed) {
    entryPrice = pocPrice;
    stopLossPrice = pocZone.top + atr * 0.5;
    takeProfit1 = pocPrice - atr * 2;
    takeProfit2 = pocPrice - atr * 4;
  }
  return {
    priceReturnedToPoc,
    reactionConfirmed,
    reactionType,
    confirmationCandleIndex: confirmationIndex,
    entryPrice,
    stopLossPrice,
    takeProfit1,
    takeProfit2,
  };
}

/**
 * Run the complete Volume Profile + POC analysis.
 * Identifies the most recent significant swing move, builds FRVP, and checks for POC reaction.
 */
export function runVolumeProfileAnalysis(
  candles: CandleData[],
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL',
  atr: number
): VolumeProfileAnalysis {
  const n = candles.length;
  const emptyResult: VolumeProfileAnalysis = {
    profile: null,
    reaction: null,
    pocAlignedBias: 'NEUTRAL',
    confidence: 0,
  };
  if (n < 20) return emptyResult;
  if (bias === 'NEUTRAL') return emptyResult;
  const swingPoints = detectSwingPoints(candles, 3);
  const highs = swingPoints.filter(p => p.type === 'HIGH').sort((a, b) => a.index - b.index);
  const lows = swingPoints.filter(p => p.type === 'LOW').sort((a, b) => a.index - b.index);
  if (highs.length < 2 || lows.length < 2) return emptyResult;
  let startIndex: number;
  let endIndex: number;
  let direction: 'BULLISH' | 'BEARISH';
  if (bias === 'BULLISH') {
    const lastHigh = highs[highs.length - 1];
    const precedingLow = lows.filter(l => l.index < lastHigh.index).pop();
    if (!precedingLow) return emptyResult;
    startIndex = precedingLow.index;
    endIndex = lastHigh.index;
    direction = 'BULLISH';
  } else {
    const lastLow = lows[lows.length - 1];
    const precedingHigh = highs.filter(h => h.index < lastLow.index).pop();
    if (!precedingHigh) return emptyResult;
    startIndex = precedingHigh.index;
    endIndex = lastLow.index;
    direction = 'BEARISH';
  }
  if (endIndex - startIndex < 5) return emptyResult;
  const profile = calculateFixedRangeVolumeProfile(candles, startIndex, endIndex, direction);
  if (!profile) return emptyResult;
  const reaction = detectPocReaction(candles, profile, bias, atr);
  let pocAlignedBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let confidence = 0;
  if (reaction?.reactionConfirmed) {
    pocAlignedBias = bias;
    const pocVolumePct = profile.totalVolume > 0 ? (profile.poc.volume / profile.totalVolume) * 100 : 0;
    confidence = Math.min(90, Math.round(40 + pocVolumePct + (reaction.priceReturnedToPoc ? 15 : 0) + (reaction.reactionConfirmed ? 20 : 0)));
  } else if (reaction?.priceReturnedToPoc) {
    pocAlignedBias = bias;
    confidence = 25;
  }
  return {
    profile,
    reaction,
    pocAlignedBias,
    confidence,
  };
}

/**
 * Run the full SMC analysis pipeline on a CandleData array.
 *
 * @param candles   Normalized candles from any provider (MT5, Deriv, Binance)
 * @param symbol    Symbol name for labeling
 * @param provider  Data provider for labeling
 * @param lookback  Swing point lookback window (default 3)
 */
export function runSMCAnalysis(
  candles: CandleData[],
  symbol: string = 'UNKNOWN',
  provider: string = 'UNKNOWN',
  lookback: number = 3
): SMCAnalysisResult {
  const n = candles.length;
  if (n < 10) {
    return {
      symbol, provider, candleCount: n, analysisTimestamp: Date.now(),
      overallBias: 'NEUTRAL', biasStrength: 'WEAK', biasConfidence: 0,
      swingPoints: [], orderBlocks: [], fairValueGaps: [], liquiditySweeps: [],
      equalHighs: [], equalLows: [], structureEvents: [],
      premiumDiscount: {
        equilibrium: 0, premiumTop: 0, premiumBottom: 0, discountTop: 0, discountBottom: 0,
        currentZone: 'EQUILIBRIUM', biasedDirection: 'NEUTRAL'
      },
      inducementLevels: [], keyResistance: [], keySupport: [],
      nearestOB: null, nearestFVG: null, lastBOS: null, lastChoCH: null,
      tradeSetup: null, summary: ['Insufficient candle data for SMC analysis'],
      volumeProfile: { profile: null, reaction: null, pocAlignedBias: 'NEUTRAL', confidence: 0 }
    };
  }

  const atr = calcATR(candles);
  const swingPoints = detectSwingPoints(candles, lookback);
  const orderBlocks = detectOrderBlocks(candles, atr);
  const fairValueGaps = detectFairValueGaps(candles);
  const structureEvents = detectStructureEvents(candles, swingPoints);
  const liquiditySweeps = detectLiquiditySweeps(candles, swingPoints, atr);
  const { highs: equalHighs, lows: equalLows } = detectEqualLevels(swingPoints);
  const premiumDiscount = computePremiumDiscountZone(candles, swingPoints);
  const inducementLevels = detectInducement(swingPoints, structureEvents);
  const { bias, confidence } = determineBias(swingPoints, structureEvents);

  // Volume Profile + POC analysis — Higher/Lower entry layer
  const volumeProfile = runVolumeProfileAnalysis(candles, bias, atr);

  const biasStrength: SMCStrength = confidence >= 70 ? 'STRONG' : confidence >= 45 ? 'MODERATE' : 'WEAK';

  const lastPrice = candles[n - 1]?.close ?? 0;

  // Key levels from swing points
  const keyResistance = swingPoints
    .filter(p => p.type === 'HIGH' && p.price > lastPrice)
    .sort((a, b) => a.price - b.price)
    .slice(0, 3)
    .map(p => p.price);

  const keySupport = swingPoints
    .filter(p => p.type === 'LOW' && p.price < lastPrice)
    .sort((a, b) => b.price - a.price)
    .slice(0, 3)
    .map(p => p.price);

  // Nearest structures to current price
  const nearestOB = orderBlocks
    .filter(ob => !ob.isMitigated)
    .sort((a, b) => Math.abs(a.midPrice - lastPrice) - Math.abs(b.midPrice - lastPrice))[0] ?? null;

  const nearestFVG = fairValueGaps
    .filter(fg => !fg.isFilled)
    .sort((a, b) => Math.abs(a.midPrice - lastPrice) - Math.abs(b.midPrice - lastPrice))[0] ?? null;

  const lastBOS = structureEvents.filter(e => e.type === 'BOS').slice(-1)[0] ?? null;
  const lastChoCH = structureEvents.filter(e => e.type === 'CHOCH').slice(-1)[0] ?? null;

  const tradeSetup = generateTradeSetup(candles, bias, orderBlocks, fairValueGaps, liquiditySweeps, premiumDiscount, atr);

  // Build summary narrative
  const summary: string[] = [];
  summary.push(`Market Bias: ${bias} (${confidence}% confidence)`);
  summary.push(`Structure Zone: ${premiumDiscount.currentZone} — ${premiumDiscount.biasedDirection.replace('_', ' ')}`);
  if (orderBlocks.length > 0) summary.push(`${orderBlocks.filter(ob => !ob.isMitigated).length} active Order Block(s) identified`);
  if (fairValueGaps.length > 0) summary.push(`${fairValueGaps.filter(fg => !fg.isFilled).length} unfilled Fair Value Gap(s)`);
  if (lastChoCH) summary.push(`Latest ChoCH: ${lastChoCH.label}`);
  if (lastBOS) summary.push(`Latest BOS: ${lastBOS.label}`);
  if (liquiditySweeps.length > 0) {
    const lastSweep = liquiditySweeps[liquiditySweeps.length - 1];
    summary.push(`Liquidity Sweep: ${lastSweep.type} (${lastSweep.strength})`);
  }
  if (equalHighs.length > 0) summary.push(`Equal Highs at ${equalHighs[0].price.toFixed(5)} — liquidity pool`);
  if (equalLows.length > 0) summary.push(`Equal Lows at ${equalLows[0].price.toFixed(5)} — liquidity pool`);
  if (tradeSetup) summary.push(`Setup: ${tradeSetup.setupType} — ${tradeSetup.direction} (RR: ${tradeSetup.riskRewardRatio})`);
  if (volumeProfile.pocAlignedBias !== 'NEUTRAL' && volumeProfile.confidence >= 45) {
    const vp = volumeProfile.profile!;
    summary.push(`POC at ${vp.poc.price.toFixed(5)} — ${volumeProfile.pocAlignedBias} bias (${volumeProfile.confidence}% confidence)`);
    if (volumeProfile.reaction?.reactionConfirmed) {
      summary.push(`POC reaction: ${volumeProfile.reaction.reactionType} at ${volumeProfile.reaction.entryPrice.toFixed(5)}`);
    }
  }

  return {
    symbol, provider, candleCount: n, analysisTimestamp: Date.now(),
    overallBias: bias, biasStrength, biasConfidence: confidence,
    swingPoints, orderBlocks, fairValueGaps, liquiditySweeps,
    equalHighs, equalLows, structureEvents, premiumDiscount, inducementLevels,
    keyResistance, keySupport, nearestOB, nearestFVG, lastBOS, lastChoCH,
    tradeSetup, summary,
    volumeProfile
  };
}
