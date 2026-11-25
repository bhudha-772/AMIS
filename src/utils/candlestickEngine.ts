export interface Candle {
  time: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartIndicators {
  ma20: (number | null)[];
  ma50: (number | null)[];
  bbUpper: (number | null)[];
  bbLower: (number | null)[];
  rsi: (number | null)[];
}

// Typical ATR estimates per symbol category
const SYMBOL_ATR_MAP: Record<string, number> = {
  EURUSD: 0.0012,
  GBPUSD: 0.0018,
  USDJPY: 0.25,
  AUDUSD: 0.0011,
  USDCHF: 0.0012,
  USDCAD: 0.0014,
  NZDUSD: 0.0011,
  EURGBP: 0.0009,
  EURJPY: 0.30,
  GBPJPY: 0.45,
  XAUUSD: 8.50,
  XAGUSD: 0.22,
  BTCUSD: 350.0,
  US30: 85.0,
  GER40: 35.0
};

const TIMEFRAME_MINUTES_MAP: Record<string, number> = {
  M1: 1,
  M5: 5,
  M15: 15,
  M30: 30,
  H1: 60,
  H4: 240,
  D1: 1440
};

/**
 * Generates realistic historical candlestick series for a given symbol & timeframe.
 */
export function generateHistoricalCandles(
  symbol: string,
  basePrice: number,
  digits: number,
  timeframe: string = "M15",
  count: number = 45
): Candle[] {
  const atr = SYMBOL_ATR_MAP[symbol] || (basePrice * 0.0015);
  const tfMinutes = TIMEFRAME_MINUTES_MAP[timeframe] || 15;
  const tfMult = Math.sqrt(tfMinutes / 15); // Adjust candle size based on timeframe
  const candleAtr = atr * tfMult;

  const candles: Candle[] = [];
  const now = Date.now();
  const intervalMs = tfMinutes * 60 * 1000;

  // Work backwards from 10 bars in the past to build a trend curve
  let currentPrice = basePrice;
  const rawPrices: number[] = [currentPrice];

  // Random walk with drift
  let trendDirection = Math.random() > 0.5 ? 1 : -1;
  for (let i = 0; i < count; i++) {
    if (Math.random() < 0.2) trendDirection *= -1; // trend switch
    const change = (trendDirection * 0.4 + (Math.random() - 0.48)) * candleAtr;
    currentPrice += change;
    rawPrices.unshift(currentPrice);
  }

  // Construct candles
  for (let i = 0; i < count; i++) {
    const timestamp = now - (count - 1 - i) * intervalMs;
    const dateObj = new Date(timestamp);
    const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

    const open = Number(rawPrices[i].toFixed(digits));
    const close = Number(rawPrices[i + 1].toFixed(digits));
    
    // Realistic wicks
    const maxOC = Math.max(open, close);
    const minOC = Math.min(open, close);

    const upperWick = (Math.random() * 0.7 + 0.1) * candleAtr;
    const lowerWick = (Math.random() * 0.7 + 0.1) * candleAtr;

    const high = Number((maxOC + upperWick).toFixed(digits));
    const low = Number((Math.max(0.00001, minOC - lowerWick)).toFixed(digits));
    const volume = Math.floor(200 + Math.random() * 1800);

    candles.push({
      time: timeStr,
      timestamp,
      open,
      high,
      low,
      close,
      volume
    });
  }

  return candles;
}

/**
 * Updates the active (last) candle in real-time on price ticks.
 */
export function updateActiveCandle(
  candles: Candle[],
  newPrice: number,
  digits: number,
  timeframe: string = "M15"
): Candle[] {
  if (candles.length === 0) return candles;

  const tfMinutes = TIMEFRAME_MINUTES_MAP[timeframe] || 15;
  const intervalMs = tfMinutes * 60 * 1000;
  const now = Date.now();

  const lastCandle = candles[candles.length - 1];
  const formattedPrice = Number(newPrice.toFixed(digits));

  // Check if candle period has expired
  if (now - lastCandle.timestamp >= intervalMs) {
    const dateObj = new Date(now);
    const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

    const newCandle: Candle = {
      time: timeStr,
      timestamp: now,
      open: formattedPrice,
      high: formattedPrice,
      low: formattedPrice,
      close: formattedPrice,
      volume: 1
    };

    // Keep sliding window of 60 candles max
    return [...candles.slice(1), newCandle];
  } else {
    // Update existing active candle
    const updatedLast: Candle = {
      ...lastCandle,
      close: formattedPrice,
      high: Math.max(lastCandle.high, formattedPrice),
      low: Math.min(lastCandle.low, formattedPrice),
      volume: lastCandle.volume + Math.floor(Math.random() * 3 + 1)
    };

    return [...candles.slice(0, candles.length - 1), updatedLast];
  }
}

/**
 * Computes Moving Averages, Bollinger Bands, and RSI for accurate chart indicators.
 */
export function calculateIndicators(candles: Candle[]): ChartIndicators {
  const closes = candles.map(c => c.close);
  const n = closes.length;

  const ma20: (number | null)[] = new Array(n).fill(null);
  const ma50: (number | null)[] = new Array(n).fill(null);
  const bbUpper: (number | null)[] = new Array(n).fill(null);
  const bbLower: (number | null)[] = new Array(n).fill(null);
  const rsi: (number | null)[] = new Array(n).fill(null);

  // MA 20 & Bollinger Bands
  for (let i = 0; i < n; i++) {
    if (i >= 19) {
      const slice = closes.slice(i - 19, i + 1);
      const sum = slice.reduce((acc, val) => acc + val, 0);
      const avg = sum / 20;
      ma20[i] = avg;

      // Variance for BB
      const variance = slice.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / 20;
      const stdDev = Math.sqrt(variance);
      bbUpper[i] = avg + 2 * stdDev;
      bbLower[i] = avg - 2 * stdDev;
    }

    if (i >= 49) {
      const slice = closes.slice(i - 49, i + 1);
      const sum = slice.reduce((acc, val) => acc + val, 0);
      ma50[i] = sum / 50;
    } else if (i >= 10) {
      // Partial MA50 for shorter series
      const slice = closes.slice(0, i + 1);
      const sum = slice.reduce((acc, val) => acc + val, 0);
      ma50[i] = sum / slice.length;
    }
  }

  // RSI 14
  if (n >= 15) {
    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= 14; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) gains += diff;
      else losses += Math.abs(diff);
    }

    let avgGain = gains / 14;
    let avgLoss = losses / 14;

    for (let i = 14; i < n; i++) {
      const diff = closes[i] - closes[i - 1];
      if (i > 14) {
        avgGain = (avgGain * 13 + (diff > 0 ? diff : 0)) / 14;
        avgLoss = (avgLoss * 13 + (diff < 0 ? Math.abs(diff) : 0)) / 14;
      }

      if (avgLoss === 0) {
        rsi[i] = 100;
      } else {
        const rs = avgGain / avgLoss;
        rsi[i] = 100 - (100 / (1 + rs));
      }
    }
  }

  return { ma20, ma50, bbUpper, bbLower, rsi };
}
