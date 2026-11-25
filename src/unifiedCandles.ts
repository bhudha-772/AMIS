/**
 * AMIS UNIFIED CANDLE NORMALIZER
 * Standardizes OHLCV data from MT5, Deriv WebSocket, and Binance into a single
 * canonical CandleData format used by all AMIS analysis engines.
 *
 * Platform     | Raw Format      | Normalization Key
 * -------------|-----------------|-------------------
 * MT5 Python   | mt5.copy_rates  | time, open, high, low, close, tick_volume
 * Deriv WS     | candles stream  | epoch, open, high, low, close
 * Binance WS   | kline event     | t, o, h, l, c, v
 */

export interface CandleData {
  timestamp: number;   // Unix epoch milliseconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;      // tick_volume for MT5/Deriv; real volume for Binance
}

export type CandleProvider = 'MT5' | 'DERIV' | 'BINANCE';

/**
 * Normalize raw candle data from any supported provider into CandleData[].
 * This is the single entry point — all AMIS engines consume only CandleData.
 */
export function normalizeCandles(rawData: any[], provider: CandleProvider): CandleData[] {
  if (!Array.isArray(rawData) || rawData.length === 0) return [];

  switch (provider) {
    case 'MT5':
      // Python MetaTrader5 mt5.copy_rates_from_pos() format
      // Fields: time (unix seconds), open, high, low, close, tick_volume, spread, real_volume
      return rawData
        .filter(c => c && c.time && c.close)
        .map(c => ({
          timestamp: c.time * 1000,          // MT5 returns seconds → convert to ms
          open: parseFloat(c.open),
          high: parseFloat(c.high),
          low: parseFloat(c.low),
          close: parseFloat(c.close),
          volume: c.tick_volume ?? c.real_volume ?? 0
        }));

    case 'DERIV':
      // Deriv WebSocket ticks_history candles format
      // Fields: epoch (unix seconds), open, high, low, close  (no real volume for synthetic)
      return rawData
        .filter(c => c && c.epoch && c.close)
        .map(c => ({
          timestamp: c.epoch * 1000,         // Deriv returns seconds → convert to ms
          open: parseFloat(c.open),
          high: parseFloat(c.high),
          low: parseFloat(c.low),
          close: parseFloat(c.close),
          volume: 0                           // Synthetic indices have no real volume
        }));

    case 'BINANCE':
      // Binance klines REST or WebSocket format
      // Array: [openTime, open, high, low, close, volume, closeTime, ...]
      // OR object: { t: openTime, o, h, l, c, v }
      return rawData
        .filter(c => c != null)
        .map(c => {
          if (Array.isArray(c)) {
            return {
              timestamp: c[0],
              open: parseFloat(c[1]),
              high: parseFloat(c[2]),
              low: parseFloat(c[3]),
              close: parseFloat(c[4]),
              volume: parseFloat(c[5])
            };
          }
          // Object format from WebSocket kline event
          return {
            timestamp: c.t ?? c.openTime ?? Date.now(),
            open: parseFloat(c.o ?? c.open),
            high: parseFloat(c.h ?? c.high),
            low: parseFloat(c.l ?? c.low),
            close: parseFloat(c.c ?? c.close),
            volume: parseFloat(c.v ?? c.volume ?? '0')
          };
        });

    default:
      return [];
  }
}

/**
 * Build a CandleData[] from a prices-only tick array (fallback when OHLC not available).
 * Groups sequential ticks into synthetic OHLC candles of `groupSize` ticks each.
 */
export function buildCandlesFromTicks(prices: number[], groupSize: number = 5): CandleData[] {
  const candles: CandleData[] = [];
  const now = Date.now();
  for (let i = 0; i < prices.length; i += groupSize) {
    const block = prices.slice(i, i + groupSize);
    if (block.length === 0) continue;
    candles.push({
      timestamp: now - (prices.length - i) * 1000,
      open: block[0],
      high: Math.max(...block),
      low: Math.min(...block),
      close: block[block.length - 1],
      volume: block.length
    });
  }
  return candles;
}

/**
 * Extract close prices from a normalized CandleData array.
 */
export function extractCloses(candles: CandleData[]): number[] {
  return candles.map(c => c.close);
}

/**
 * Extract high prices from a normalized CandleData array.
 */
export function extractHighs(candles: CandleData[]): number[] {
  return candles.map(c => c.high);
}

/**
 * Extract low prices from a normalized CandleData array.
 */
export function extractLows(candles: CandleData[]): number[] {
  return candles.map(c => c.low);
}

/**
 * Extract volume array from a normalized CandleData array.
 */
export function extractVolumes(candles: CandleData[]): number[] {
  return candles.map(c => c.volume);
}
