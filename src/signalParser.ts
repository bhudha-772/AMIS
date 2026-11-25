/**
 * Signal Parser - Extracts trading signals from Telegram messages
 * Handles multiple common signal formats from various trading channels
 */

import { TelegramRawSignal } from "./telegramTypes";

const KNOWN_SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT",
  "ADAUSDT", "DOGEUSDT", "SHIBUSDT", "DOTUSDT", "SUIUSDT",
  "LINKUSDT", "LTCUSDT", "TRXUSDT", "NEARUSDT", "AVAXUSDT",
  "OPUSDT", "APTUSDT", "PEPEUSDT", "WIFUSDT", "RENDERUSDT",
  "BTC", "ETH", "BNB", "SOL", "XRP", "ADA", "DOGE", "SHIB",
  "DOT", "SUI", "LINK", "LTC", "TRX", "NEAR", "AVAX", "OP",
  "APT", "PEPE", "WIF", "RENDER",
];

const SYMBOL_MAP: Record<string, string> = {
  BTC: "BTCUSDT", ETH: "ETHUSDT", BNB: "BNBUSDT", SOL: "SOLUSDT",
  XRP: "XRPUSDT", ADA: "ADAUSDT", DOGE: "DOGEUSDT", SHIB: "SHIBUSDT",
  DOT: "DOTUSDT", SUI: "SUIUSDT", LINK: "LINKUSDT", LTC: "LTCUSDT",
  TRX: "TRXUSDT", NEAR: "NEARUSDT", AVAX: "AVAXUSDT", OP: "OPUSDT",
  APT: "APTUSDT", PEPE: "PEPEUSDT", WIF: "WIFUSDT", RENDER: "RENDERUSDT",
};

function normalizeSymbol(sym: string): string {
  const upper = sym.toUpperCase().replace(/[^A-Z]/g, "");
  if (SYMBOL_MAP[upper]) return SYMBOL_MAP[upper];
  if (upper.endsWith("USDT")) return upper;
  if (upper.endsWith("USD")) return upper + "T";
  return upper + "USDT";
}

function extractNumberNearKeyword(text: string, keywords: string[]): number | null {
  const lowerText = text.toLowerCase();
  for (const keyword of keywords) {
    const idx = lowerText.indexOf(keyword.toLowerCase());
    if (idx === -1) continue;
    const snippet = text.substring(idx, idx + 50);
    const numbers = snippet.match(/[\d,]+\.?\d*/g);
    if (numbers && numbers.length > 0) {
      const val = parseFloat(numbers[0].replace(/,/g, ""));
      if (!isNaN(val) && val > 0) return val;
    }
  }
  return null;
}

function extractPriceList(text: string, keywords: string[]): number[] {
  const results: number[] = [];
  const lines = text.toLowerCase().split("\n");
  for (const line of lines) {
    for (const keyword of keywords) {
      if (line.includes(keyword.toLowerCase())) {
        const numbers = line.match(/[\d,]+\.?\d*/g);
        if (numbers) {
          numbers.forEach((n) => {
            const val = parseFloat(n.replace(/,/g, ""));
            if (!isNaN(val) && val > 0) results.push(val);
          });
        }
      }
    }
  }
  return results;
}

function detectDirection(text: string): "BUY" | "SELL" | null {
  const lower = text.toLowerCase();
  const buyPatterns = [
    /\b(long)\b/, /\b(buy)\b/, /\b(bullish)\b/, /\b(long entry)\b/,
    /\b🟢\b/, /\b📈\b/, /\b🚀\b/, /\b💎\b/, /\b(long trade)\b/,
    /\bentry long\b/, /\bbuy entry\b/, /\bbuy zone\b/,
  ];
  const sellPatterns = [
    /\b(short)\b/, /\b(sell)\b/, /\b(bearish)\b/, /\b(short entry)\b/,
    /\b🔴\b/, /\b📉\b/, /\b(short trade)\b/, /\bentry short\b/,
    /\bsell entry\b/, /\bsell zone\b/,
  ];
  for (const pattern of buyPatterns) {
    if (pattern.test(lower)) return "BUY";
  }
  for (const pattern of sellPatterns) {
    if (pattern.test(lower)) return "SELL";
  }
  return null;
}

function detectSymbol(text: string): string | null {
  const hashMatch = text.match(/#([A-Z]{2,10})(?:USDT|USD)?/g);
  if (hashMatch && hashMatch.length > 0) {
    return normalizeSymbol(hashMatch[0].replace("#", ""));
  }
  const upperText = text.toUpperCase();
  for (const sym of KNOWN_SYMBOLS) {
    const base = sym.replace("USDT", "");
    const regex = new RegExp(`\\b${base}(?:USDT|USD)?\\b`, "i");
    if (regex.test(upperText)) {
      return normalizeSymbol(sym);
    }
  }
  return null;
}

function detectLeverage(text: string): number | null {
  const patterns = [
    /(\d+)\s*x\s*(?:lev|leverage)?/i,
    /(?:lev|leverage)\s*[:@]?\s*(\d+)\s*x?/i,
    /(\d+)\s*×/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const val = parseInt(match[1]);
      if (!isNaN(val) && val > 0 && val <= 125) return val;
    }
  }
  return null;
}

export function isTradingSignal(text: string): boolean {
  if (!text || text.length < 10) return false;
  const signalIndicators = [
    /\b(long|short|buy|sell)\b/i,
    /\b(entry|tp|sl|stop loss|take profit)\b/i,
    /\b(support|resistance|breakout)\b/i,
    /🟢|🔴|📈|📉|🚀|💎/,
    /#?(BTC|ETH|BNB|SOL|XRP|ADA|DOGE|SHIB|DOT|SUI|LINK|LTC)/i,
    /\b(leverage|lev)\b/i,
  ];
  let indicatorCount = 0;
  for (const pattern of signalIndicators) {
    if (pattern.test(text)) indicatorCount++;
  }
  return indicatorCount >= 2;
}

export function parseSignal(
  text: string,
  chatId: number,
  chatTitle: string,
  messageId: number
): TelegramRawSignal | null {
  if (!isTradingSignal(text)) return null;

  const symbol = detectSymbol(text);
  const direction = detectDirection(text);
  const leverage = detectLeverage(text);
  const entryPrice = extractNumberNearKeyword(text, [
    "entry", "entry price", "entry zone", "buy at", "sell at",
    "price", "enter", "long at", "short at", "entry:",
  ]);
  const takeProfits = extractPriceList(text, [
    "tp", "tp1", "tp2", "tp3", "tp4", "tp5",
    "take profit", "target", "targets", "tp:", "target1", "target2",
  ]);
  const stopLoss = extractNumberNearKeyword(text, [
    "sl", "stop loss", "stop-loss", "sl:", "stop:",
  ]);

  const parsed: TelegramRawSignal = {
    id: `TG-${chatId}-${messageId}-${Date.now()}`,
    sourceChatId: chatId,
    sourceChatTitle: chatTitle,
    sourceMessageId: messageId,
    rawText: text,
    timestamp: Date.now(),
    parsedSymbol: symbol,
    parsedDirection: direction,
    parsedEntryPrice: entryPrice,
    parsedTakeProfits: takeProfits,
    parsedStopLoss: stopLoss,
    parsedLeverage: leverage,
    parseConfidence: 0,
  };

  parsed.parseConfidence = calculateConfidence(parsed);
  if (!parsed.parsedSymbol && !parsed.parsedDirection) return null;

  return parsed;
}

function calculateConfidence(parsed: Partial<TelegramRawSignal>): number {
  let score = 0;
  let maxScore = 0;

  maxScore += 30;
  if (parsed.parsedSymbol) score += 30;

  maxScore += 25;
  if (parsed.parsedDirection) score += 25;

  maxScore += 20;
  if (parsed.parsedEntryPrice) score += 20;

  maxScore += 15;
  if (parsed.parsedTakeProfits && parsed.parsedTakeProfits.length > 0) score += 15;

  maxScore += 10;
  if (parsed.parsedStopLoss) score += 10;

  return Math.round((score / maxScore) * 100);
}
