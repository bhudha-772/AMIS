/**
 * AMIS Central Technical Indicators Library
 * Canonical mathematical implementations of indicators to prevent duplicated logic
 * across market snapshots, prediction models, and live feeds.
 */

/**
 * Calculates exponential moving average (EMA)
 */
export function calculateEMA(prices: number[], period: number): number {
  if (prices.length === 0) return 0;
  let ema = prices[0];
  const k = 2 / (period + 1);
  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

/**
 * Calculates EMA series for MACD and other indicators
 */
export function calculateEMASeries(prices: number[], period: number): number[] {
  if (prices.length === 0) return [];
  const ema: number[] = [prices[0]];
  const k = 2 / (period + 1);
  for (let i = 1; i < prices.length; i++) {
    ema.push(prices[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

/**
 * Calculates Relative Strength Index (RSI)
 */
export function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length <= period) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  return losses === 0 ? 100 : 100 - (100 / (1 + (gains / losses)));
}

/**
 * Calculates Bollinger Bands (Upper, Middle/SMA, Lower, Bandwidth)
 */
export function calculateBollingerBands(prices: number[], period: number = 20, multiplier: number = 2) {
  const window = prices.slice(-period);
  const sma = window.reduce((a, b) => a + b, 0) / (window.length || 1);
  const variance = window.reduce((a, b) => a + Math.pow(b - sma, 2), 0) / (window.length || 1);
  const stdDev = Math.sqrt(variance);
  const upper = sma + multiplier * stdDev;
  const lower = sma - multiplier * stdDev;
  const bandwidth = (upper - lower) / (sma || 1);
  return { upper, lower, sma, stdDev, bandwidth };
}

/**
 * Calculates Average True Range (ATR) approximation for ticks
 */
export function calculateATR(prices: number[], period: number = 10): number {
  let sumRanges = 0;
  const atrPeriod = Math.min(period, prices.length - 1);
  if (atrPeriod <= 0) return 0.1;
  for (let i = prices.length - atrPeriod; i < prices.length; i++) {
    sumRanges += Math.abs(prices[i] - prices[i - 1]);
  }
  return sumRanges / atrPeriod;
}

/**
 * Calculates Stochastic Oscillator (%K and %D)
 */
export function calculateStochastic(prices: number[], period: number = 14, dPeriod: number = 3) {
  const stochKSeries: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    const startIdx = Math.max(0, i - period + 1);
    const window = prices.slice(startIdx, i + 1);
    const low = Math.min(...window);
    const high = Math.max(...window);
    const k = high === low ? 50 : ((prices[i] - low) / (high - low)) * 100;
    stochKSeries.push(k);
  }
  const lastKSeries = stochKSeries.slice(-dPeriod);
  const stochD = lastKSeries.length > 0
    ? lastKSeries.reduce((a, b) => a + b, 0) / lastKSeries.length
    : 50;
  const stochK = stochKSeries[stochKSeries.length - 1] || 50;
  return { stochK, stochD, stochKSeries };
}

/**
 * Calculates MACD Line, Signal, and Histogram
 */
export function calculateMACD(prices: number[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9) {
  const emaFastSeries = calculateEMASeries(prices, fastPeriod);
  const emaSlowSeries = calculateEMASeries(prices, slowPeriod);
  const macdLineSeries = emaFastSeries.map((v, idx) => v - (emaSlowSeries[idx] !== undefined ? emaSlowSeries[idx] : v));
  const macdSignalSeries = calculateEMASeries(macdLineSeries, signalPeriod);
  
  const macdLine = macdLineSeries[macdLineSeries.length - 1] || 0;
  const macdSignal = macdSignalSeries[macdSignalSeries.length - 1] || 0;
  const macdHistogram = macdLine - macdSignal;
  
  return { macdLine, macdSignal, macdHistogram, macdLineSeries };
}

/**
 * Calculates Linear Regression Slope and R-squared coefficient
 */
export function calculateLinearRegression(prices: number[], lookback: number = 15) {
  const window = prices.slice(-lookback);
  const n = window.length;
  if (n === 0) return { slope: 0, r2: 0, strength: 0 };
  
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += window[i];
    sumXY += i * window[i];
    sumXX += i * i;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX || 1);
  
  const meanY = sumY / n;
  const totalSS = window.reduce((acc, y) => acc + Math.pow(y - meanY, 2), 0);
  let residSS = 0;
  for (let i = 0; i < n; i++) {
    const predictedY = meanY + slope * (i - (sumX / n));
    residSS += Math.pow(window[i] - predictedY, 2);
  }
  const r2 = totalSS === 0 ? 1 : Math.max(0, Math.min(1, 1 - (residSS / totalSS)));
  const strength = r2 * 100;
  
  return { slope, r2, strength };
}

/**
 * Calculates Williams %R
 * Range: -100 to 0. Overbought > -20, Oversold < -80.
 */
export function calculateWilliamsR(
  highsOrPrices: number[],
  lows?: number[],
  closes?: number[],
  period: number = 14
): number {
  if (lows && closes) {
    const n = closes.length;
    if (n < period) return -50;
    const hSlice = highsOrPrices.slice(n - period, n);
    const lSlice = lows.slice(n - period, n);
    const highestHigh = Math.max(...hSlice);
    const lowestLow = Math.min(...lSlice);
    const currentClose = closes[n - 1];
    if (highestHigh === lowestLow) return -50;
    return ((highestHigh - currentClose) / (highestHigh - lowestLow)) * -100;
  }
  // Single prices array fallback
  const prices = highsOrPrices;
  if (prices.length < period) return -50;
  const window = prices.slice(-period);
  const highest = Math.max(...window);
  const lowest = Math.min(...window);
  const current = prices[prices.length - 1];
  if (highest === lowest) return -50;
  return ((highest - current) / (highest - lowest)) * -100;
}

/**
 * Calculates Commodity Channel Index (CCI)
 * Typical bounds: +100 (overbought) / -100 (oversold)
 */
export function calculateCCI(
  highsOrPrices: number[],
  lows?: number[],
  closes?: number[],
  period: number = 20
): number {
  const typicalPrices: number[] = [];
  if (lows && closes) {
    const len = closes.length;
    for (let i = 0; i < len; i++) {
      typicalPrices.push((highsOrPrices[i] + lows[i] + closes[i]) / 3);
    }
  } else {
    typicalPrices.push(...highsOrPrices);
  }

  if (typicalPrices.length < period) return 0;
  const window = typicalPrices.slice(-period);
  const sma = window.reduce((a, b) => a + b, 0) / period;
  const meanDeviation = window.reduce((acc, tp) => acc + Math.abs(tp - sma), 0) / period;
  const lastTP = window[window.length - 1];
  if (meanDeviation === 0) return 0;
  return (lastTP - sma) / (0.015 * meanDeviation);
}

/**
 * Calculates Average Directional Index (ADX) along with +DI and -DI
 * ADX > 25 indicates strong trend; +DI > -DI is bullish, -DI > +DI is bearish.
 */
export function calculateADX(
  highsOrPrices: number[],
  lows?: number[],
  closes?: number[],
  period: number = 14
): { adx: number; plusDI: number; minusDI: number; trendStrength: 'STRONG' | 'MODERATE' | 'WEAK' } {
  let highs: number[] = [];
  let lowsArr: number[] = [];
  let closesArr: number[] = [];

  if (lows && closes) {
    highs = highsOrPrices;
    lowsArr = lows;
    closesArr = closes;
  } else {
    const p = highsOrPrices;
    highs = p;
    lowsArr = p;
    closesArr = p;
  }

  const n = closesArr.length;
  if (n < period + 1) {
    return { adx: 20, plusDI: 20, minusDI: 20, trendStrength: 'WEAK' };
  }

  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];

  for (let i = 1; i < n; i++) {
    const currentH = highs[i];
    const currentL = lowsArr[i];
    const prevC = closesArr[i - 1];
    const prevH = highs[i - 1];
    const prevL = lowsArr[i - 1];

    const trueRange = Math.max(
      currentH - currentL,
      Math.abs(currentH - prevC),
      Math.abs(currentL - prevC)
    );
    tr.push(trueRange);

    const upMove = currentH - prevH;
    const downMove = prevL - currentL;

    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  if (tr.length < period) {
    return { adx: 20, plusDI: 20, minusDI: 20, trendStrength: 'WEAK' };
  }

  // Initial Wilder smoothing sums
  let smoothTR = tr.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);

  const dxValues: number[] = [];

  for (let i = period; i < tr.length; i++) {
    smoothTR = smoothTR - (smoothTR / period) + tr[i];
    smoothPlusDM = smoothPlusDM - (smoothPlusDM / period) + plusDM[i];
    smoothMinusDM = smoothMinusDM - (smoothMinusDM / period) + minusDM[i];

    const plusDI = smoothTR === 0 ? 0 : (smoothPlusDM / smoothTR) * 100;
    const minusDI = smoothTR === 0 ? 0 : (smoothMinusDM / smoothTR) * 100;
    const diSum = plusDI + minusDI;
    const dx = diSum === 0 ? 0 : (Math.abs(plusDI - minusDI) / diSum) * 100;
    dxValues.push(dx);
  }

  const finalPlusDI = smoothTR === 0 ? 25 : (smoothPlusDM / smoothTR) * 100;
  const finalMinusDI = smoothTR === 0 ? 25 : (smoothMinusDM / smoothTR) * 100;

  const adx = dxValues.length >= period
    ? dxValues.slice(-period).reduce((a, b) => a + b, 0) / period
    : (dxValues[dxValues.length - 1] ?? 20);

  const trendStrength: 'STRONG' | 'MODERATE' | 'WEAK' =
    adx >= 35 ? 'STRONG' : adx >= 20 ? 'MODERATE' : 'WEAK';

  return {
    adx: parseFloat(adx.toFixed(2)),
    plusDI: parseFloat(finalPlusDI.toFixed(2)),
    minusDI: parseFloat(finalMinusDI.toFixed(2)),
    trendStrength
  };
}

/**
 * Calculates Supertrend Indicator
 * Returns the trailing stop line, direction (1 = BULLISH, -1 = BEARISH), and signal.
 */
export function calculateSupertrend(
  highsOrPrices: number[],
  lows?: number[],
  closes?: number[],
  period: number = 10,
  multiplier: number = 3
): { supertrend: number; direction: 1 | -1; isBullish: boolean; upperBand: number; lowerBand: number } {
  const isOHLC = Boolean(lows && closes);
  const closesArr = isOHLC ? closes! : highsOrPrices;
  const highsArr = isOHLC ? highsOrPrices : highsOrPrices;
  const lowsArr = isOHLC ? lows! : highsOrPrices;

  const n = closesArr.length;
  const defaultPrice = closesArr[n - 1] || 0;

  if (n < period + 1) {
    return {
      supertrend: defaultPrice,
      direction: 1,
      isBullish: true,
      upperBand: defaultPrice * 1.01,
      lowerBand: defaultPrice * 0.99
    };
  }

  // Approximate or true ATR
  let atr = 0;
  for (let i = n - period; i < n; i++) {
    const tr = Math.max(
      highsArr[i] - lowsArr[i],
      Math.abs(highsArr[i] - closesArr[i - 1]),
      Math.abs(lowsArr[i] - closesArr[i - 1])
    );
    atr += tr;
  }
  atr = atr / period;

  let prevUpper = (highsArr[n - 2] + lowsArr[n - 2]) / 2 + multiplier * atr;
  let prevLower = (highsArr[n - 2] + lowsArr[n - 2]) / 2 - multiplier * atr;
  let prevSupertrend = prevLower;
  let direction: 1 | -1 = 1;

  const basicUpper = (highsArr[n - 1] + lowsArr[n - 1]) / 2 + multiplier * atr;
  const basicLower = (highsArr[n - 1] + lowsArr[n - 1]) / 2 - multiplier * atr;

  const finalUpper = (basicUpper < prevUpper || closesArr[n - 2] > prevUpper) ? basicUpper : prevUpper;
  const finalLower = (basicLower > prevLower || closesArr[n - 2] < prevLower) ? basicLower : prevLower;

  const currentClose = closesArr[n - 1];
  if (prevSupertrend === prevUpper) {
    direction = currentClose > finalUpper ? 1 : -1;
  } else {
    direction = currentClose < finalLower ? -1 : 1;
  }

  const supertrend = direction === 1 ? finalLower : finalUpper;

  return {
    supertrend: parseFloat(supertrend.toFixed(5)),
    direction,
    isBullish: direction === 1,
    upperBand: parseFloat(finalUpper.toFixed(5)),
    lowerBand: parseFloat(finalLower.toFixed(5))
  };
}

/**
 * Calculates Volume Weighted Average Price (VWAP)
 */
export function calculateVWAP(
  highsOrPrices: number[],
  lows?: number[],
  closes?: number[],
  volumes?: number[]
): number {
  const isOHLC = Boolean(lows && closes);
  const closesArr = isOHLC ? closes! : highsOrPrices;
  const highsArr = isOHLC ? highsOrPrices : highsOrPrices;
  const lowsArr = isOHLC ? lows! : highsOrPrices;
  const n = closesArr.length;

  if (n === 0) return 0;

  let cumulativeTPV = 0;
  let cumulativeVol = 0;

  for (let i = 0; i < n; i++) {
    const tp = (highsArr[i] + lowsArr[i] + closesArr[i]) / 3;
    const vol = (volumes && volumes[i] > 0) ? volumes[i] : 1;
    cumulativeTPV += tp * vol;
    cumulativeVol += vol;
  }

  return cumulativeVol === 0 ? closesArr[n - 1] : cumulativeTPV / cumulativeVol;
}

/**
 * Calculates Ichimoku Kinko Hyo (Conversion, Base, Spans A & B)
 */
export function calculateIchimoku(
  highsOrPrices: number[],
  lows?: number[],
  closes?: number[]
): {
  tenkanSen: number;
  kijunSen: number;
  senkouSpanA: number;
  senkouSpanB: number;
  cloudColor: 'GREEN' | 'RED';
  priceVsCloud: 'ABOVE' | 'BELOW' | 'INSIDE';
} {
  const isOHLC = Boolean(lows && closes);
  const highs = isOHLC ? highsOrPrices : highsOrPrices;
  const lowsArr = isOHLC ? lows! : highsOrPrices;
  const closesArr = isOHLC ? closes! : highsOrPrices;
  const n = closesArr.length;
  const currentPrice = closesArr[n - 1] || 0;

  const getHL = (len: number) => {
    const count = Math.min(len, n);
    const h = Math.max(...highs.slice(-count));
    const l = Math.min(...lowsArr.slice(-count));
    return (h + l) / 2;
  };

  const tenkanSen = getHL(9);
  const kijunSen = getHL(26);
  const senkouSpanA = (tenkanSen + kijunSen) / 2;
  const senkouSpanB = getHL(52);

  const cloudColor: 'GREEN' | 'RED' = senkouSpanA >= senkouSpanB ? 'GREEN' : 'RED';
  const cloudTop = Math.max(senkouSpanA, senkouSpanB);
  const cloudBottom = Math.min(senkouSpanA, senkouSpanB);

  const priceVsCloud: 'ABOVE' | 'BELOW' | 'INSIDE' =
    currentPrice > cloudTop ? 'ABOVE' : currentPrice < cloudBottom ? 'BELOW' : 'INSIDE';

  return {
    tenkanSen: parseFloat(tenkanSen.toFixed(5)),
    kijunSen: parseFloat(kijunSen.toFixed(5)),
    senkouSpanA: parseFloat(senkouSpanA.toFixed(5)),
    senkouSpanB: parseFloat(senkouSpanB.toFixed(5)),
    cloudColor,
    priceVsCloud
  };
}

/**
 * Calculates Classic & Fibonacci Pivot Points
 */
export function calculatePivotPoints(high: number, low: number, close: number) {
  const pp = (high + low + close) / 3;
  const range = high - low;

  // Classic
  const classicR1 = 2 * pp - low;
  const classicS1 = 2 * pp - high;
  const classicR2 = pp + range;
  const classicS2 = pp - range;
  const classicR3 = high + 2 * (pp - low);
  const classicS3 = low - 2 * (high - pp);

  // Fibonacci
  const fibR1 = pp + 0.382 * range;
  const fibR2 = pp + 0.618 * range;
  const fibR3 = pp + 1.000 * range;
  const fibS1 = pp - 0.382 * range;
  const fibS2 = pp - 0.618 * range;
  const fibS3 = pp - 1.000 * range;

  return {
    pivot: parseFloat(pp.toFixed(5)),
    classic: {
      r1: parseFloat(classicR1.toFixed(5)),
      r2: parseFloat(classicR2.toFixed(5)),
      r3: parseFloat(classicR3.toFixed(5)),
      s1: parseFloat(classicS1.toFixed(5)),
      s2: parseFloat(classicS2.toFixed(5)),
      s3: parseFloat(classicS3.toFixed(5))
    },
    fibonacci: {
      r1: parseFloat(fibR1.toFixed(5)),
      r2: parseFloat(fibR2.toFixed(5)),
      r3: parseFloat(fibR3.toFixed(5)),
      s1: parseFloat(fibS1.toFixed(5)),
      s2: parseFloat(fibS2.toFixed(5)),
      s3: parseFloat(fibS3.toFixed(5))
    }
  };
}
