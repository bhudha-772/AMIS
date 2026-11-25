export interface TickerData {
  symbol: string;
  price: number;
  changePercent: number;
  high: number;
  low: number;
  volume: number;
  quoteVolume: number;
  priceChange: number;
}

export interface KlineData {
  time: number; // timestamp in ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OrderBookEntry {
  price: number;
  amount: number;
  total: number;
  cumulativeTotal: number;
}

export interface OrderBookState {
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  spread: number;
  spreadPercent: number;
}

export interface MarketTrade {
  id: string;
  time: number;
  price: number;
  amount: number;
  isBuyerMaker: boolean; // true = sell (taker sells to maker), false = buy (taker buys from maker)
}

export type OrderType = "LIMIT" | "MARKET";
export type OrderSide = "BUY" | "SELL";

export interface OpenOrder {
  id: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  price: number;
  amount: number;
  filled: number;
  timestamp: number;
}

export interface TradeHistoryEntry {
  id: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  price: number;
  amount: number;
  timestamp: number;
}

export interface AssetBalance {
  asset: string;
  free: number;
  locked: number;
}

export interface UserPortfolio {
  balances: Record<string, AssetBalance>;
  openOrders: OpenOrder[];
  tradeHistory: TradeHistoryEntry[];
}

export const SUPPORTED_SYMBOLS_MAP: Record<string, { name: string; base: string; quote: string }> = {
  BTCUSDT: { name: "Bitcoin", base: "BTC", quote: "USDT" },
  ETHUSDT: { name: "Ethereum", base: "ETH", quote: "USDT" },
  BNBUSDT: { name: "BNB", base: "BNB", quote: "USDT" },
  SOLUSDT: { name: "Solana", base: "SOL", quote: "USDT" },
  XRPUSDT: { name: "Ripple", base: "XRP", quote: "USDT" },
  ADAUSDT: { name: "Cardano", base: "ADA", quote: "USDT" },
  DOGEUSDT: { name: "Dogecoin", base: "DOGE", quote: "USDT" },
  SHIBUSDT: { name: "Shiba Inu", base: "SHIB", quote: "USDT" },
  DOTUSDT: { name: "Polkadot", base: "DOT", quote: "USDT" },
  SUIUSDT: { name: "Sui", base: "SUI", quote: "USDT" },
  LINKUSDT: { name: "Chainlink", base: "LINK", quote: "USDT" },
  LTCUSDT: { name: "Litecoin", base: "LTC", quote: "USDT" },
  TRXUSDT: { name: "TRON", base: "TRX", quote: "USDT" },
  NEARUSDT: { name: "Near Protocol", base: "NEAR", quote: "USDT" },
  AVAXUSDT: { name: "Avalanche", base: "AVAX", quote: "USDT" },
  OPUSDT: { name: "Optimism", base: "OP", quote: "USDT" },
  APTUSDT: { name: "Aptos", base: "APT", quote: "USDT" },
  PEPEUSDT: { name: "Pepe Coin", base: "PEPE", quote: "USDT" },
  WIFUSDT: { name: "dogwifhat", base: "WIF", quote: "USDT" },
  RENDERUSDT: { name: "Render", base: "RENDER", quote: "USDT" },
};

export const SUPPORTED_SYMBOLS = Object.keys(SUPPORTED_SYMBOLS_MAP);

export const TIMEFRAMES = [
  { value: "1m", label: "1m" },
  { value: "3m", label: "3m" },
  { value: "5m", label: "5m" },
  { value: "15m", label: "15m" },
  { value: "30m", label: "30m" },
  { value: "1h", label: "1H" },
  { value: "2h", label: "2H" },
  { value: "4h", label: "4H" },
  { value: "6h", label: "6H" },
  { value: "8h", label: "8H" },
  { value: "12h", label: "12H" },
  { value: "1d", label: "1D" },
];

export interface AISignal {
  id: string;
  recommendedSymbol: string;
  timeframe: string;
  direction: "BUY" | "SELL" | "HOLD" | "WAIT";
  entryPrice: number;
  takeProfit: number;
  stopLoss: number;
  duration: string;
  confidence: number;
  patternDetected: string;
  analysisReasoning: string;
  indicatorsConfig?: {
    selectedList: string[];
    settingsDetails: Array<{
      indicatorName: string;
      parameters: string;
      reason: string;
    }>;
    justification: string;
  };
  trendLines?: Array<{
    name: string;
    type: "SUPPORT" | "RESISTANCE" | "BREAKOUT_LEVEL" | "TRENDLINE";
    startIdx: number;
    endIdx: number;
    startPrice: number;
    endPrice: number;
  }>;
  marketScannerReport: string;
  pairRankings?: Array<{
    symbol: string;
    rank: number;
    score: number;
    trend: string;
    justification: string;
  }>;
  portfolioAdvice?: {
    action: string;
    analysis: string;
    expectedOutcome: string;
  };
  futuresPrediction?: {
    targetPrice: number;
    targetSeconds: number; // e.g. 60, 120, 180 seconds
    targetDirection: "UP" | "DOWN";
    validationStrength: number; // calculated live (0-100)
    analysis: string;
  };
  timestamp: number;
  status: "ACTIVE" | "COMPLETED" | "STOPPED_OUT" | "CANCELLED";
}

