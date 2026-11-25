import { runSMCAnalysis } from './smcEngine';
import { normalizeCandles, buildCandlesFromTicks, CandleData } from './unifiedCandles';
import {
  calculateWilliamsR,
  calculateCCI,
  calculateADX,
  calculateSupertrend,
  calculateVWAP,
  calculateIchimoku,
  calculatePivotPoints
} from './utils/technicalIndicators';

export function runSMCEngineTests(): { passed: number; failed: number; errors: string[] } {
  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  const assert = (condition: boolean, msg: string) => {
    if (condition) {
      passed++;
    } else {
      failed++;
      errors.push(`Assertion failed: ${msg}`);
      console.error(`❌ [SMC TEST FAIL] ${msg}`);
    }
  };

  console.log("=== Running AMIS Smart Money Concepts & Indicator Suite Tests ===");

  // 1. Unified Candle Normalizer Tests
  try {
    // MT5 Normalizer test
    const rawMT5 = [
      { time: 1700000000, open: "1.0850", high: "1.0890", low: "1.0840", close: "1.0875", tick_volume: 1500 }
    ];
    const mt5Candles = normalizeCandles(rawMT5, 'MT5');
    assert(mt5Candles.length === 1, "MT5 candle length is 1");
    assert(mt5Candles[0].timestamp === 1700000000000, "MT5 timestamp converted to ms");
    assert(mt5Candles[0].close === 1.0875, "MT5 close parsed as float");
    assert(mt5Candles[0].volume === 1500, "MT5 tick volume extracted");

    // Deriv Normalizer test
    const rawDeriv = [
      { epoch: 1700000000, open: 2450.5, high: 2455.0, low: 2449.0, close: 2453.2 }
    ];
    const derivCandles = normalizeCandles(rawDeriv, 'DERIV');
    assert(derivCandles.length === 1, "Deriv candle length is 1");
    assert(derivCandles[0].timestamp === 1700000000000, "Deriv epoch converted to ms");
    assert(derivCandles[0].close === 2453.2, "Deriv close parsed");

    // Binance Normalizer test (Array format)
    const rawBinance = [
      [1700000000000, "65000.00", "65500.00", "64900.00", "65400.00", "125.5"]
    ];
    const binanceCandles = normalizeCandles(rawBinance, 'BINANCE');
    assert(binanceCandles.length === 1, "Binance candle length is 1");
    assert(binanceCandles[0].high === 65500.0, "Binance high parsed");
    assert(binanceCandles[0].volume === 125.5, "Binance volume parsed");

    // Tick grouping fallback
    const rawTicks = [100, 101, 103, 99, 102, 104, 106, 103, 105, 107];
    const tickCandles = buildCandlesFromTicks(rawTicks, 5);
    assert(tickCandles.length === 2, "10 ticks grouped into 2 candles of size 5");
    assert(tickCandles[0].open === 100, "First candle open is 100");
    assert(tickCandles[0].high === 103, "First candle high is 103");
    assert(tickCandles[0].low === 99, "First candle low is 99");
    assert(tickCandles[0].close === 102, "First candle close is 102");
  } catch (e: any) {
    failed++;
    errors.push(`Candle Normalizer error: ${e.message}`);
  }

  // 2. SMC Engine Analysis Tests
  try {
    // Generate an institutional trending OHLC test sequence with a clear impulse and pullback
    const baseCandles: CandleData[] = [];
    let price = 100;
    const now = Date.now();

    // 25 structured candles: range -> impulse up (generating FVG and bullish OB) -> pullback
    for (let i = 0; i < 30; i++) {
      let open = price;
      let close = price;
      let high = price;
      let low = price;

      if (i < 5) {
        // Base accumulation range
        open = 100 + (i % 2 === 0 ? 0.2 : -0.2);
        close = 100 + (i % 2 === 0 ? -0.1 : 0.3);
        high = Math.max(open, close) + 0.3;
        low = Math.min(open, close) - 0.3;
      } else if (i === 5) {
        // Institutional origin candle (Bullish OB origin)
        open = 100.2;
        close = 99.7; // Bearish candle before expansion
        high = 100.4;
        low = 99.5;
      } else if (i >= 6 && i <= 10) {
        // Strong Bullish expansion / displacement (generating FVG and BOS)
        open = price;
        close = price + 2.5;
        high = close + 0.5;
        low = open - 0.2;
        price = close;
      } else if (i > 10 && i <= 18) {
        // Gentle retracement back into discount
        open = price;
        close = price - 0.8;
        high = open + 0.2;
        low = close - 0.3;
        price = close;
      } else {
        // Continuation
        open = price;
        close = price + 1.2;
        high = close + 0.4;
        low = open - 0.2;
        price = close;
      }

      baseCandles.push({
        timestamp: now - (30 - i) * 60000,
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        volume: i >= 6 && i <= 10 ? 5000 : 1000
      });
    }

    const smc = runSMCAnalysis(baseCandles, "TEST_PAIR", "DERIV", 2);
    assert(smc.symbol === "TEST_PAIR", "Symbol matches");
    assert(smc.candleCount === 30, "Candle count matches");
    assert(smc.overallBias === "BULLISH" || smc.overallBias === "NEUTRAL", "Detected bullish or neutral institutional bias");
    assert(smc.biasConfidence > 0, "Confidence is positive");
    assert(smc.premiumDiscount.equilibrium > 0, "Equilibrium level computed");
    assert(smc.orderBlocks.length > 0, "Order blocks detected");
    assert(smc.summary.length > 0, "Institutional summary generated");
  } catch (e: any) {
    failed++;
    errors.push(`SMC Engine error: ${e.message}`);
  }

  // 3. Technical Indicator Tests
  try {
    const prices = [10, 11, 12, 11.5, 13, 14, 13.8, 15, 14.5, 16, 17, 16.5, 18, 19, 18.5, 20];
    const highs = prices.map(p => p + 0.5);
    const lows = prices.map(p => p - 0.5);
    const closes = prices;

    // Williams %R
    const wR = calculateWilliamsR(highs, lows, closes, 14);
    assert(wR >= -100 && wR <= 0, `Williams %R between -100 and 0 (got ${wR})`);

    // CCI
    const cci = calculateCCI(highs, lows, closes, 14);
    assert(typeof cci === 'number' && !isNaN(cci), `CCI is a valid number (got ${cci})`);

    // ADX
    const adxResult = calculateADX(highs, lows, closes, 10);
    assert(adxResult.adx >= 0 && adxResult.adx <= 100, `ADX between 0 and 100 (got ${adxResult.adx})`);
    assert(typeof adxResult.trendStrength === 'string', "ADX trendStrength computed");

    // Supertrend
    const st = calculateSupertrend(highs, lows, closes, 10, 3);
    assert(st.supertrend > 0, `Supertrend level positive (got ${st.supertrend})`);
    assert(st.direction === 1 || st.direction === -1, `Supertrend direction is 1 or -1 (got ${st.direction})`);

    // VWAP
    const vwap = calculateVWAP(highs, lows, closes);
    assert(vwap > 0, `VWAP is positive (got ${vwap})`);

    // Ichimoku
    const ichi = calculateIchimoku(highs, lows, closes);
    assert(ichi.tenkanSen > 0 && ichi.kijunSen > 0, "Ichimoku lines computed");
    assert(ichi.cloudColor === 'GREEN' || ichi.cloudColor === 'RED', "Cloud color is valid");

    // Pivot Points
    const pivots = calculatePivotPoints(20.5, 9.5, 20.0);
    assert(pivots.pivot > 0, "Pivot point is positive");
    assert(pivots.classic.r1 > pivots.pivot, "Classic R1 is above Pivot");
    assert(pivots.classic.s1 < pivots.pivot, "Classic S1 is below Pivot");
    assert(pivots.fibonacci.r1 > pivots.pivot, "Fibonacci R1 is above Pivot");
    assert(pivots.fibonacci.s1 < pivots.pivot, "Fibonacci S1 is below Pivot");
  } catch (e: any) {
    failed++;
    errors.push(`Technical Indicator error: ${e.message}`);
  }

  console.log(`=== SMC Test Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    console.error("Failures:", errors);
  }

  return { passed, failed, errors };
}

// Auto-run if directly executed via tsx
if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('smcEngine.test')) {
  const res = runSMCEngineTests();
  if (res.failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}
