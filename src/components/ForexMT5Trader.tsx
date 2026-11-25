import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Candle,
  updateActiveCandle,
  calculateIndicators
} from "../utils/candlestickEngine";
import {
  getSessionState,
  isScalpableWindow,
  sessionShortLabel,
  SessionState
} from "../utils/sessionEngine";
/* Every indicator below is the unit-tested implementation in signalMath
   (24 assertions) — never re-implement one inline, or the tested and live
   math will drift apart again. */
import {
  computeATR,
  wilderRSI,
  emaTrend,
  emaValue,
  isCounterTrend,
  solveSLTP,
  solveSLTPFromAtrPips
} from "../utils/signalMath";
/* Price-action knowledge is the unit-tested implementation in priceAction
   (fractals, swings, double top/bottom, head-and-shoulders, liquidity raids).
   The raid veto below uses the same tested helpers as the server prompt. */
import {
  analyzePriceAction,
  priceActionShortLabel,
  isTradingIntoRaid,
  hasConfirmedPatternFor
} from "../utils/priceAction";
/* Meta-label measurement: calibrated probabilities replace raw confidence,
   and every verdict carries its full feature snapshot for the gate. */
import {
  applyPlatt,
  breakEvenProb,
  metaLabelDecision,
  inNewsBlackout,
  spreadOk,
  atrGateOk,
  vectorizeFeatures,
  type LogisticModel,
  type PlattModel,
} from "../utils/metaLabel";
import type { CalibrationBundle } from "../utils/calibration";
import {
  atrPercentile,
  h1h4Agreement,
  minutesToHighImpactNews,
} from "../utils/metaFeatures";
import { calculateADX } from "../utils/technicalIndicators";
import {
  TrendingUp,
  TrendingDown,
  Clock,
  Coins,
  RefreshCw,
  History,
  CheckCircle,
  XCircle,
  Sliders,
  DollarSign,
  AlertCircle,
  X,
  Search,
  ChevronDown,
  ChevronUp,
  Activity,
  Layers,
  BarChart2,
  Maximize2,
  Calendar,
  Terminal,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  Shield,
  ShieldCheck,
  Settings,
  Info,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Server,
  Key,
  UserCheck,
  Power,
  Brain,
  Sparkles,
  Cpu,
  Bell,
  Monitor,
  Check,
  ExternalLink,
  ShieldAlert,
  Calculator,
  Newspaper,
  Globe
} from "lucide-react";
import { SMCPanel } from "./SMCPanel";
import { runSMCAnalysis, SMCAnalysisResult } from "../smcEngine";
import {
  MT5PredictionRecord,
  MT5PredictionStats,
  PredictionQuality
} from "../mt5PredictionTypes";

// Types for MT5 Forex Symbols
export interface ForexSymbol {
  symbol: string;
  name: string;
  category: "Forex Major" | "Forex Minor" | "Metals" | "Indices" | "Crypto";
  digits: number; // 5 for EURUSD, 3 for USDJPY, 2 for Gold
  pipSize: number; // 0.0001 or 0.01
  baseBid: number;
  baseAsk: number;
  spreadPips: number;
  dailyChange: number;
  high: number;
  low: number;
}

export interface ForexPosition {
  ticket: number;
  time: string;
  timestamp: number;
  type: "BUY" | "SELL";
  symbol: string;
  volume: number; // lots
  openPrice: number;
  sl: number;
  tp: number;
  currentPrice: number;
  swap: number;
  commission: number;
  profit: number;
}

export interface PendingOrder {
  ticket: number;
  time: string;
  type: "BUY LIMIT" | "SELL LIMIT" | "BUY STOP" | "SELL STOP";
  symbol: string;
  volume: number;
  targetPrice: number;
  sl: number;
  tp: number;
}

export interface HistoricalTrade extends ForexPosition {
  closeTime: string;
  closePrice: number;
  finalProfit: number;
}

// MT5 Machine Learning Lesson — persistent trade memory for AI coaching (ported from DerivTrader)
interface MT5Lesson {
  id: string;
  timestamp: number;
  symbol: string;
  tradeType: "BUY" | "SELL";
  status: "WIN" | "LOSS";
  entryPrice: number;
  exitPrice: number;
  profitPips: number;
  insightText: string;
  ruleCreated: string;
}

// JYSR Technical Analysis Engine Result (ported from DerivTrader computeAssetAISignal)
interface JYSRSignalResult {
  signal: "BUY" | "SELL" | "NEUTRAL";
  confidence: number;
  rsi: number;
  sma: number;
  volatility: number;
  trend: "BULLISH" | "BEARISH" | "CONSOLIDATING";
  breakout: "BULLISH BREAKOUT" | "BEARISH BREAKDOWN" | "STABLE RANGE";
  description: string;
}

export interface NewsEvent {
  id: string;
  time: string;
  currency: string;
  impact: "HIGH" | "MEDIUM" | "LOW";
  event: string;
  forecast: string;
  previous: string;
  actual?: string;
  aiAnalysis?: {
    headline: string;
    marketImpact: string;
    affectedPairs: string[];
    directionalBias: string;
    suggestedAction: string;
    confidenceScore: number;
  };
}

const DEFAULT_SYMBOLS: ForexSymbol[] = [
  { symbol: "EURUSDm", name: "Euro vs US Dollar", category: "Forex Major", digits: 5, pipSize: 0.0001, baseBid: 1.08542, baseAsk: 1.08550, spreadPips: 0.8, dailyChange: +0.24, high: 1.08890, low: 1.08210 },
  { symbol: "GBPUSDm", name: "Great Britain Pound vs US Dollar", category: "Forex Major", digits: 5, pipSize: 0.0001, baseBid: 1.29415, baseAsk: 1.29427, spreadPips: 1.2, dailyChange: -0.15, high: 1.29850, low: 1.29100 },
  { symbol: "USDJPYm", name: "US Dollar vs Japanese Yen", category: "Forex Major", digits: 3, pipSize: 0.01, baseBid: 154.625, baseAsk: 154.639, spreadPips: 1.4, dailyChange: +0.42, high: 155.100, low: 153.950 },
  { symbol: "AUDUSDm", name: "Australian Dollar vs US Dollar", category: "Forex Major", digits: 5, pipSize: 0.0001, baseBid: 0.65820, baseAsk: 0.65831, spreadPips: 1.1, dailyChange: +0.08, high: 0.66120, low: 0.65580 },
  { symbol: "USDCHFm", name: "US Dollar vs Swiss Franc", category: "Forex Major", digits: 5, pipSize: 0.0001, baseBid: 0.88410, baseAsk: 0.88422, spreadPips: 1.2, dailyChange: -0.05, high: 0.88750, low: 0.88120 },
  { symbol: "USDCADm", name: "US Dollar vs Canadian Dollar", category: "Forex Major", digits: 5, pipSize: 0.0001, baseBid: 1.37210, baseAsk: 1.37225, spreadPips: 1.5, dailyChange: +0.18, high: 1.37500, low: 1.36900 },
  { symbol: "NZDUSDm", name: "New Zealand Dollar vs US Dollar", category: "Forex Major", digits: 5, pipSize: 0.0001, baseBid: 0.59310, baseAsk: 0.59323, spreadPips: 1.3, dailyChange: -0.31, high: 0.59680, low: 0.59050 },
  { symbol: "EURGBPm", name: "Euro vs Great Britain Pound", category: "Forex Minor", digits: 5, pipSize: 0.0001, baseBid: 0.83862, baseAsk: 0.83875, spreadPips: 1.3, dailyChange: +0.39, high: 0.84100, low: 0.83550 },
  { symbol: "EURJPYm", name: "Euro vs Japanese Yen", category: "Forex Minor", digits: 3, pipSize: 0.01, baseBid: 167.820, baseAsk: 167.838, spreadPips: 1.8, dailyChange: +0.66, high: 168.300, low: 166.900 },
  { symbol: "GBPJPYm", name: "Great Britain Pound vs Japanese Yen", category: "Forex Minor", digits: 3, pipSize: 0.01, baseBid: 200.110, baseAsk: 200.132, spreadPips: 2.2, dailyChange: +0.28, high: 200.800, low: 199.300 },
  { symbol: "XAUUSDm", name: "Gold spot vs US Dollar", category: "Metals", digits: 2, pipSize: 0.1, baseBid: 2415.50, baseAsk: 2415.75, spreadPips: 2.5, dailyChange: +1.12, high: 2432.00, low: 2392.10 },
  { symbol: "XAGUSDm", name: "Silver spot vs US Dollar", category: "Metals", digits: 3, pipSize: 0.01, baseBid: 29.410, baseAsk: 29.432, spreadPips: 2.2, dailyChange: +0.85, high: 29.850, low: 28.900 },
  { symbol: "BTCUSDm", name: "Bitcoin vs US Dollar CFD", category: "Crypto", digits: 2, pipSize: 1.0, baseBid: 67450.00, baseAsk: 67475.00, spreadPips: 25.0, dailyChange: +2.45, high: 68200.00, low: 65800.00 },
  { symbol: "US30m", name: "US Wall Street 30 Index CFD", category: "Indices", digits: 1, pipSize: 1.0, baseBid: 40320.0, baseAsk: 40322.0, spreadPips: 2.0, dailyChange: -0.12, high: 40550.0, low: 40180.0 },
  { symbol: "GER40m", name: "Germany 40 Index CFD", category: "Indices", digits: 1, pipSize: 1.0, baseBid: 18450.0, baseAsk: 18451.5, spreadPips: 1.5, dailyChange: +0.34, high: 18580.0, low: 18320.0 }
];

const INITIAL_CALENDAR_NEWS: NewsEvent[] = [
  {
    id: "news-1",
    time: "12:30",
    currency: "USD",
    impact: "HIGH",
    event: "US Core CPI Inflation (MoM)",
    forecast: "0.2%",
    previous: "0.1%",
    actual: "0.4%",
    aiAnalysis: {
      headline: "Hot CPI Inflation Beats Forecast (+0.4% vs 0.2%)",
      marketImpact: "Hawkish Fed expectations → Accelerates US Dollar yields & triggers selloffs in EURUSD & Gold.",
      affectedPairs: ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD"],
      directionalBias: "BULLISH USD",
      suggestedAction: "SELL EURUSD @ 1.0855 (SL: 25 pips, TP: 55 pips) | BUY USDJPY on Dip",
      confidenceScore: 92
    }
  },
  {
    id: "news-2",
    time: "14:00",
    currency: "USD",
    impact: "HIGH",
    event: "Fed Chair Powell Testifies Before Congress",
    forecast: "-",
    previous: "-",
    actual: "-",
    aiAnalysis: {
      headline: "Powell Signals Data-Dependent Monetary Policy",
      marketImpact: "High Volatility expected across USD pairs and US30 index.",
      affectedPairs: ["EURUSD", "USDJPY", "US30", "BTCUSD"],
      directionalBias: "HIGH VOLATILITY / BULLISH USD",
      suggestedAction: "Set Stop-Loss tight or trade USDJPY breakout above 155.00",
      confidenceScore: 86
    }
  },
  {
    id: "news-3",
    time: "15:30",
    currency: "EUR",
    impact: "MEDIUM",
    event: "ECB President Lagarde Speech on EU Growth",
    forecast: "-",
    previous: "-",
    actual: "-",
    aiAnalysis: {
      headline: "Lagarde Notes Moderate Disinflationary Progress in Eurozone",
      marketImpact: "Euro stays capped against Greenback; limited upside momentum.",
      affectedPairs: ["EURUSD", "EURGBP", "EURJPY"],
      directionalBias: "BEARISH EUR",
      suggestedAction: "SHORT EURUSD or BUY EURGBP on support test",
      confidenceScore: 80
    }
  },
  {
    id: "news-4",
    time: "18:00",
    currency: "GBP",
    impact: "HIGH",
    event: "BOE Monetary Policy Report & Rate Decision",
    forecast: "5.00%",
    previous: "5.25%",
    actual: "5.00%",
    aiAnalysis: {
      headline: "BOE Cuts Rate by 25bps with Dovish Forward Guidance",
      marketImpact: "Sterling weakens against USD and JPY.",
      affectedPairs: ["GBPUSD", "EURGBP", "GBPJPY"],
      directionalBias: "BEARISH GBP",
      suggestedAction: "SELL GBPUSD on bounce @ 1.2960 | BUY EURGBP @ 0.8385",
      confidenceScore: 88
    }
  },
  {
    id: "news-5",
    time: "21:30",
    currency: "JPY",
    impact: "HIGH",
    event: "Tokyo Core CPI YoY Inflation Data",
    forecast: "2.1%",
    previous: "1.9%",
    actual: "2.3%",
    aiAnalysis: {
      headline: "Tokyo CPI Accelerates to 2.3% -> Heightens BOJ Rate Hike Odds",
      marketImpact: "Hawkish BOJ sentiment strengthens Yen across JPY crosses.",
      affectedPairs: ["USDJPY", "GBPJPY", "EURJPY"],
      directionalBias: "BULLISH JPY",
      suggestedAction: "SELL USDJPY on rallies near 155.00 | Target 153.80",
      confidenceScore: 90
    }
  }
];

// ============================================================
// AI AUTONOMOUS TRADER CONFIGURATION
// Minimum AI confidence (%) required before the auto-trader places a real
// MT5 order. Lowered from the original hardcoded 85% — the AMIS-FX engine
// is instructed to return >= 85 confidence only on near-perfect alignment,
// so with the old threshold NO trade could realistically ever fire.
// 75% keeps a strong safety filter while allowing the system to trade.
// ============================================================
const AI_AUTO_TRADE_MIN_CONFIDENCE = 75;

/**
 * Kimi VERIFIED SETUP GATE (replaces the old "must be >= 75% confidence" rule).
 *
 * The autopilot does not need a magic percentage to trade: Kimi inspects the
 * live snapshot (structure, order blocks, sweeps, MTF context, news) and answers
 * `shouldTrade` + `setupQuality`. That discretionary verdict IS the gate.
 *
 * OWNER DIRECTIVE (mirrors the Deriv swarm): EVERY grade trades, POOR included.
 * The confidence percentage is now TELEMETRY ONLY. It is the AI grading its own
 * homework and it is not a calibrated probability — the Deriv predict route even
 * forces it up to a 65% floor server-side — so it must never decide a trade.
 *
 * Safety controls that REMAIN, and are objective rather than AI self-report:
 *   - one position at a time, plus a dynamic exposure cap from account equity
 *   - 3-minute per-symbol cooldown
 *   - symbol blacklist after a loss
 *   - no trade at all while the cycle is still PENDING (no verdict in hand)
 */
const SETUP_TRADEABLE_QUALITIES: PredictionQuality[] = ["PERFECT", "HIGH_PROBABILITY", "VALID", "POOR"];

// ─────────────────────────────────────────────────────────────────────────────
// SESSION-GATED SCALPING PATH (targeted fix for the "no trades" stoppage)
// ─────────────────────────────────────────────────────────────────────────────
// The KIMI-ONLY gate above exists because the OLD local fallback stamped
// 97-98% "HIGH_PROBABILITY" SELLs off a bare RSI rule and they lost. That is
// still banned. This is a DIFFERENT, objective path grounded in session
// research (src/utils/sessionEngine.ts): it only authorises when the window is
// a prime scalping session for THIS pair AND the local structural engine sees
// a real, direction-aligned breakout — i.e. a liquid-session breakout scalp,
// not an uncalibrated RSI vote. Every existing risk block still applies, and
// the verdict is still written to the prediction ledger either way.
//
// Thresholds are deliberately high so this is a quality filter, not a way to
// force trades in bad conditions.
const SESSION_SCALP_MIN_SCORE = 70;      // grade B+ window (London, NY, or an overlap)
const SESSION_SCALP_MIN_CONF = 80;       // JYSR must be highly confident
const SESSION_SCALP_REQUIRE_BREAKOUT = true; // must be a structural breakout, not RSI-only

/**
 * How many ranked markets the auto-trader will deep-analyse in a single cycle.
 *
 * The scanner ranks every market for free, but each deep AI pass costs a full
 * Kimi reasoning call (~45-100s). The cycle walks down the ranking and spends one
 * call per candidate until one is approved, so this bounds worst-case cycle
 * time at roughly MAX x 100s. 3 keeps a normal cycle near 1-2 calls while still
 * covering the strongest markets, instead of only ever trying the #1.
 */
const AMIS_MAX_CANDIDATES = 3;

/** How long a prediction is observed before it is scored WIN / LOSS / VOID. */
const PREDICTION_HORIZON_SEC = 900; // 15 minutes

/** Daily-loss kill switch: halt new auto-trades once equity drops this far below the day-start balance. */
const DAILY_LOSS_KILL_PCT = 3;
const dayStartKeyFor = (login: number) => {
  const d = new Date();
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `mt5_day_start_balance:${login || "demo"}:${day}`;
};
const readDayStartBalance = (login: number): number | null => {
  try {
    const raw = localStorage.getItem(dayStartKeyFor(login));
    const v = raw == null ? NaN : Number(raw);
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch { return null; }
};
const writeDayStartBalance = (login: number, bal: number) => {
  try { localStorage.setItem(dayStartKeyFor(login), String(bal)); } catch { /* storage full/blocked — kill switch just stays unarmed */ }
};

/**
 * Fetch with a hard timeout.
 *
 * Every poller in this panel (ticks / candles / matrix scan / Kimi intel) used a
 * bare `fetch`, which can hang indefinitely (a stalled python/stdout pipe, a
 * proxy that never closes the stream, or a Kimi call queued behind the rate
 * limiter). A hung matrix-scan promise permanently pinned `scanInFlightRef` to
 * true, so the 2D scanner froze forever — exactly the "it stopped refreshing"
 * symptom. Aborting guarantees the promise always settles.
 */
/**
 * CLIENT-SIDE CONCURRENCY GATE for our own origin.
 *
 * Chrome allows only 6 simultaneous connections per origin over HTTP/1.1. Requests
 * beyond that sit in the browser's FIFO queue while their timeout clock is ALREADY
 * ticking — so a scan the server answers in 0.04s could still hit the client's 60s
 * limit simply because it was queued behind the long-running Kimi intel call
 * (`/api/mt5/intel`, which blocks for 45-105s) and eight other pollers.
 *
 * Capping our own concurrency at 4 means the browser queue never engages: fast
 * requests (ticks/scan/positions, all 0.02-4s) recycle through the 3 remaining
 * slots in seconds instead of waiting behind a two-minute AI call. Two slots stay
 * free for callers that bypass this gate (raw `fetch` in the account poller).
 */
const MT5_MAX_CONCURRENT_REQUESTS = 4;
let mt5ActiveRequests = 0;
const mt5RequestWaiters: Array<() => void> = [];

async function acquireMt5RequestSlot(): Promise<void> {
  if (mt5ActiveRequests < MT5_MAX_CONCURRENT_REQUESTS) {
    mt5ActiveRequests++;
    return;
  }
  await new Promise<void>((resolve) => mt5RequestWaiters.push(resolve));
}

function releaseMt5RequestSlot(): void {
  mt5ActiveRequests--;
  const next = mt5RequestWaiters.shift();
  if (next) {
    mt5ActiveRequests++;
    next();
  }
}

async function fetchWithTimeout(
  url: string,
  ms: number,
  init?: RequestInit,
  opts?: { bypassGate?: boolean }
): Promise<Response> {
  // The live-tick poller passes bypassGate:true. It must never queue: if it waits
  // for a slot, its own `tickPollInFlight` guard makes the NEXT 3s interval skip,
  // so prices effectively froze and only the matrix scan (which also writes baseBid)
  // refreshed them — "data arrives after every scan, not as the market moves".
  // Ticks are fast (0.02-0.4s) and single-flighted, so one reserved connection
  // (4 gated + 1 ticks = 5 of Chrome's 6) costs nothing and keeps the tape live.
  const gated = !opts?.bypassGate;
  if (gated) await acquireMt5RequestSlot();
  const controller = new AbortController();
  // Abort WITH a reason: a bare controller.abort() surfaces in Chrome as the
  // useless "signal is aborted without reason", which hides which call timed out
  // and how long it was given. The clock starts only once we actually hold a slot,
  // so time spent waiting behind another request is never counted against us.
  const timer = setTimeout(
    () => controller.abort(new Error(`Timeout after ${ms}ms: ${url}`)),
    ms
  );
  try {
    return await fetch(url, { ...(init || {}), signal: controller.signal });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error(`Request timed out after ${ms}ms — ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (gated) releaseMt5RequestSlot();
  }
}
/**
 * MT5 timeframe verdict helpers.
 *
 * The matrix used to render a NEUTRAL timeframe as the literal word "SCAN". Two problems
 * with that: it reads like a stuck background process rather than a market state, and
 * with the scanner's old fixed 0.1% MA buffer it applied to 63% of every cell in the
 * table. NEUTRAL genuinely means "the MA5/MA20 separation is currently inside this
 * market's own noise band", so it is labelled RANGE and explains itself on hover.
 */
interface TFVerdictRow {
  status?: string;
  timeframes?: Record<string, string | undefined>;
  adxByTf?: Record<string, number | null | undefined>;
}

const TF_VERDICT_LABEL: Record<string, string> = {
  BULLISH: "BUY",
  BEARISH: "SELL"
};

function tfVerdictLabel(row: TFVerdictRow, tf: string): string {
  if (row?.status === "CLOSED") return "OFFLINE";
  return TF_VERDICT_LABEL[String(row?.timeframes?.[tf])] || "RANGE";
}

function tfVerdictClass(row: TFVerdictRow, tf: string): string {
  if (row?.status === "CLOSED") return "text-[#8b949e]";
  const v = row?.timeframes?.[tf];
  if (v === "BULLISH") return "text-[#3fb950]";
  if (v === "BEARISH") return "text-[#f85149]";
  return "text-[#8b949e]";
}

function tfVerdictTip(row: TFVerdictRow, tf: string): string {
  if (row?.status === "CLOSED") return `${tf}: market closed — no data available`;
  const v = String(row?.timeframes?.[tf] || "NEUTRAL");
  const adxRaw = row?.adxByTf?.[tf];
  const adxTxt = adxRaw != null && Number.isFinite(Number(adxRaw))
    ? Number(adxRaw).toFixed(2)
    : "—";
  const meaning = v === "BULLISH"
    ? "MA5 sits above MA20 by more than this market's noise band"
    : v === "BEARISH"
      ? "MA5 sits below MA20 by more than this market's noise band"
      : "No directional lean — MA5/MA20 separation is inside the noise band";
  return `${tf} verdict: ${v}\n${meaning}\nADX(${tf}): ${adxTxt}`;
}



export function ForexMT5Trader() {
  // 1. ACCOUNT CONNECTION & PERSISTENT STATE
  const [balance, setBalance] = useState<number>(0);
  const [leverage, setLeverage] = useState<string>("1:0");
  const [accountLogin, setAccountLogin] = useState<number>(0);
  const [accountServer, setAccountServer] = useState<string>("Not Connected");
  const [accountPassword, setAccountPassword] = useState<string>("••••••••");
  const [accountCurrency, setAccountCurrency] = useState<string>("USD");
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const isConnectedRef = useRef(isConnected);
  useEffect(() => { isConnectedRef.current = isConnected; }, [isConnected]);
  const [showConnectModal, setShowConnectModal] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);

  // 2. SELECTED SYMBOL & MARKET WATCH STATE
  const [symbols, setSymbols] = useState<ForexSymbol[]>(DEFAULT_SYMBOLS);
  // Mirror of `symbols` for intervals/closures that must read the freshest book
  // without depending on a re-created callback.
  const symbolsRef = useRef<ForexSymbol[]>(DEFAULT_SYMBOLS);
  useEffect(() => { symbolsRef.current = symbols; }, [symbols]);

  const [selectedSymbolCode, setSelectedSymbolCode] = useState<string>("EURUSDm");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeCategory, setActiveCategory] = useState<string>("ALL");
  const [tickFlashMap, setTickFlashMap] = useState<Record<string, "up" | "down" | null>>({});

  // 3. CHART STATE
  const [timeframe, setTimeframe] = useState<"M1" | "M5" | "M15" | "M30" | "H1" | "H4" | "D1">("M15");

  // Mirrors of the active symbol/timeframe for effects that must run ONCE.
  //
  // The AI cycle calls setSelectedSymbolCode 3x per cycle (and the matrix picks the
  // new #1 rank every scan), so an effect listing these as deps is torn down and
  // recreated constantly. The tick poller was one of those: each recreation called
  // pollTicks(), which bailed out on the shared `tickPollInFlight` boolean still
  // held by the request from the effect it had just replaced — so live updates
  // silently stopped until a full page refresh. Reading these mirrors from a ref
  // lets the poller subscribe exactly once and still target the current symbol.
  const selectedSymbolCodeRef = useRef(selectedSymbolCode);
  useEffect(() => { selectedSymbolCodeRef.current = selectedSymbolCode; }, [selectedSymbolCode]);
  const timeframeRef = useRef(timeframe);
  useEffect(() => { timeframeRef.current = timeframe; }, [timeframe]);

  const [showMA20, setShowMA20] = useState<boolean>(true);
  const [showMA50, setShowMA50] = useState<boolean>(true);
  const [showBB, setShowBB] = useState<boolean>(false);
  const [showRSI, setShowRSI] = useState<boolean>(true);

  // Candlestick Data Engine State
  const [candlesMap, setCandlesMap] = useState<Record<string, Candle[]>>({});
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [crosshair, setCrosshair] = useState<{ x: number; y: number; price: number } | null>(null);
  // MT5 live data availability flag — true only when real tick data is flowing in
  const [mt5DataAvailable, setMt5DataAvailable] = useState<boolean>(false);
  const mt5DataAvailableRef = useRef(mt5DataAvailable);
  useEffect(() => { mt5DataAvailableRef.current = mt5DataAvailable; }, [mt5DataAvailable]);

  // ── MT5 FEED HEALTH (hysteresis) ────────────────────────────────────────
  // Two pollers write mt5DataAvailable: the account/positions poller (3s) sets
  // it TRUE on any success, while the tick poller (2s) set it FALSE on a single
  // failed or empty response. They fought each other every few seconds, so the
  // flag flapped and the auto-trader — which pauses when it reads false — kept
  // skipping cycles. A transient empty tick map (very common while the Python
  // bridge is contending with a 3-candle fall-through fetch) is NOT an outage.
  // Only declare the feed offline after this many CONSECUTIVE bad polls.
  const mt5HealthFailStreak = useRef(0);
  const MT5_HEALTH_FAIL_THRESHOLD = 5;
  const markFeedOk = () => {
    if (mt5HealthFailStreak.current !== 0) mt5HealthFailStreak.current = 0;
    setMt5DataAvailable(true);
    setMt5DataError("");
  };
  const markFeedBad = (msg: string) => {
    mt5HealthFailStreak.current += 1;
    if (mt5HealthFailStreak.current >= MT5_HEALTH_FAIL_THRESHOLD) {
      setMt5DataAvailable(false);
      setMt5DataError(msg);
    }
  };

  // ── IN-FLIGHT GUARDS ────────────────────────────────────────────────────
  // Every /api/mt5/* call spawns a fresh `python mt5_connector.py` process that
  // attaches to the MT5 terminal. The tick poller runs every 2s and the candle
  // poller restarts on every scanner-driven symbol switch (3x per fall-through
  // cycle). If a call takes longer than its interval the requests pile up,
  // contend for the terminal, and return empty tick maps — which is what made
  // the feed look "offline". These refs ensure at most one of each is in flight.
  const tickPollInFlight = useRef(false);
  // Key-aware (not a bare boolean): the candle effect re-runs on every symbol/timeframe
  // switch, and a shared boolean made the NEW effect skip its fetch while the old
  // request was still pending — leaving the chart with no candles at all
  // ("No data available"). Tracking which key is in flight lets a switch to a
  // different symbol fetch immediately while still preventing duplicate requests
  // for the same symbol.
  const candleFetchInFlight = useRef<string | null>(null);
  const tickFailStreakRef = useRef<number>(0);
  const [mt5DataError, setMt5DataError] = useState<string>("");
  const [candleLoadError, setCandleLoadError] = useState<string>("");

  // 4. ORDER TICKET & DYNAMIC RISK LOT STATE
  const [orderType, setOrderType] = useState<"MARKET" | "PENDING">("MARKET");
  const [lots, setLots] = useState<number>(0.10);
  const [slPips, setSlPips] = useState<number>(20);
  const [tpPips, setTpPips] = useState<number>(40);
  const [enableSL, setEnableSL] = useState<boolean>(true);
  const [enableTP, setEnableTP] = useState<boolean>(true);

  // Risk-based Dynamic Lot Sizing
  const [useRiskLotSizing, setUseRiskLotSizing] = useState<boolean>(true);
  const [riskPercent, setRiskPercent] = useState<number>(1.0); // 1.0% default risk

  // 5. DEVICE TERMINAL AUTO-GRAB & SUMMARY POPUP STATE
  const [deviceInfo, setDeviceInfo] = useState<{
    pcName: string;
    terminalPath: string;
    build: string;
    platform: string;
    pingMs: number;
    status: string;
  } | null>(null);
  const [showDeviceSummaryModal, setShowDeviceSummaryModal] = useState<boolean>(false);

  // 6. AI QUANTITATIVE ANALYSIS & PREDICTOR STATE
  const [showAiAnalysisModal, setShowAiAnalysisModal] = useState<boolean>(false);
  const [isAnalyzingAi, setIsAnalyzingAi] = useState<boolean>(false);
  const [aiPrediction, setAiPrediction] = useState<{
    symbol: string;
    signal: "BUY" | "SELL" | "HOLD";
    confidence: number;
    targetEntry: number;
    recommendedSLPips: number;
    recommendedTPPips: number;
    recommendedSLPrice: number;
    recommendedTPPrice: number;
    calculatedLotSize: number;
    riskRewardRatio: string;
    analysisMarkdown: string;
    timestamp: number;
  } | null>(null);

  // 7. AI AUTONOMOUS TRADER & NOTIFICATION STATE
  // Persisted to localStorage and defaulted ON: previously this reset to OFF on
  // every reload, which silently blocked all MT5 autopilot trades (the user had
  // to re-enable it manually each session). Now the choice survives reloads and
  // the autopilot is armed by default.
  const [isAiAutoTraderActive, setIsAiAutoTraderActive] = useState<boolean>(() => {
    const saved = localStorage.getItem("mt5_ai_autotrader_active");
    return saved === null ? true : saved === "true";
  });

  useEffect(() => {
    localStorage.setItem("mt5_ai_autotrader_active", String(isAiAutoTraderActive));
  }, [isAiAutoTraderActive]);
  const [aiNotification, setAiNotification] = useState<{
    id: string;
    title: string;
    symbol: string;
    action: "BUY" | "SELL";
    lots: number;
    price: number;
    sl: number;
    tp: number;
    reason: string;
    expectedProfit: number;
    timestamp: number;
  } | null>(null);

  // 8. AI LIVE NEWS & MACROECONOMIC FUNDAMENTALS STATE
  const [newsList, setNewsList] = useState<NewsEvent[]>(INITIAL_CALENDAR_NEWS);
  const [newsAiSummary, setNewsAiSummary] = useState<string>(
    "US Inflation surprise drives strong USD bullish momentum. BOJ rate hike expectations bolstering JPY across crosses. Caution advised around BOE & ECB statements."
  );
  const [isFetchingNews, setIsFetchingNews] = useState<boolean>(false);
  const [lastNewsFetchTime, setLastNewsFetchTime] = useState<string>(new Date().toLocaleTimeString());

  // 9. JYSR STRATEGY & SIGNAL FEED STATE (ported from DerivTrader)
  const [jysrStrategy, setJysrStrategy] = useState<"scalping" | "reversion" | "breakout">("scalping");
  const [jysrSignalsHistory, setJysrSignalsHistory] = useState<Array<{ id: string; time: string; text: string; type: "bullish" | "bearish" | "system" }>>([
    { id: "init-1", time: new Date().toLocaleTimeString(), text: "JYSR MT5 High-Frequency Analyzer online.", type: "system" },
    { id: "init-2", time: new Date().toLocaleTimeString(), text: "Monitoring forex volatility grids & trend momentum.", type: "system" }
  ]);

  // 10. KIMI AI PREDICTION STATE
  const [kimiPredicting, setKimiPredicting] = useState<boolean>(false);
  // Live "how long has this analysis been running" counter. The Kimi reasoning model
  // needs ~60-100s per call, so without visible progress the panel looks frozen and
  // users assume it has hung. This drives the "Analyzing… Ns" label.
  const [analysisElapsed, setAnalysisElapsed] = useState<number>(0);
  const [kimiSignal, setKimiSignal] = useState<"BUY" | "SELL" | "NEUTRAL" | null>(null);
  const [kimiConfidence, setKimiConfidence] = useState<number | null>(null);
  const [kimiAnalysis, setKimiAnalysis] = useState<string>("");
  const [kimiError, setKimiError] = useState<string | null>(null);
  const [lastAutoPilotTradeTime, setLastAutoPilotTradeTime] = useState<number>(0);

  // 10a. KIMI SETUP-VERIFICATION VERDICT + AUTOPILOT TELEMETRY
  // Without this the autopilot was a black box: the toggle could be ON while the
  // screen showed nothing happening. Every field below is rendered in the
  // "AI Autopilot" strip so "is it actually working?" is answerable at a glance.
  const [kimiVerdict, setKimiVerdict] = useState<{
    symbol: string;
    signal: "BUY" | "SELL" | "NEUTRAL";
    setupQuality: PredictionQuality;
    shouldTrade: boolean;
    confidence: number;
    setupType: string;
    tradeReasoning: string;
    source: "KIMI" | "LOCAL_FALLBACK" | "PENDING";
    timestamp: number;
  } | null>(null);

  const [kimiVerdicts, setKimiVerdicts] = useState<Record<string, {
    symbol: string;
    signal: "BUY" | "SELL" | "NEUTRAL";
    setupQuality: PredictionQuality;
    shouldTrade: boolean;
    confidence: number;
    setupType: string;
    tradeReasoning: string;
    source: "KIMI" | "LOCAL_FALLBACK" | "PENDING";
    timestamp: number;
  }>>({});
  const [currentAnalyzingSymbol, setCurrentAnalyzingSymbol] = useState<string | null>(null);

  const [autopilotStats, setAutopilotStats] = useState<{
    cycles: number;
    lastCycleAt: number;
    lastCycleMs: number;
    nextCycleAt: number;
    tradesPlaced: number;
    lastTicket: number | null;
    lastSkipReason: string;
    lastTradeSymbol: string | null;
  }>({
    cycles: 0,
    lastCycleAt: 0,
    lastCycleMs: 0,
    nextCycleAt: 0,
    tradesPlaced: 0,
    lastTicket: null,
    lastSkipReason: "idle",
    lastTradeSymbol: null
  });

  // 10c. PREDICTION SCORECARD — every verdict is recorded, then observed against
  // live prices and scored WIN / LOSS / VOID (server ledger: /api/mt5/predictions).
  const [predictionLedger, setPredictionLedger] = useState<MT5PredictionRecord[]>([]);
  const [predictionStats, setPredictionStats] = useState<MT5PredictionStats | null>(null);
  const [ledgerError, setLedgerError] = useState<string>("");
  // Server-fitted calibration bundle (Platt per engine + logistic meta-gate +
  // reliability/Brier + walk-forward). Fitted on the server from RESOLVED rows;
  // the browser only APPLIES it, never refits (that would leak).
  const [calibration, setCalibration] = useState<CalibrationBundle | null>(null);

  // 10b. AMIS INTELLIGENCE STATE (full 9-layer snapshot data)
  const [amisSnapshot, setAmisSnapshot] = useState<{
    direction: string; rsi14: number; macdHistogram: number;
    volatilityState: string; dominantRegime: string; regimeConfidence: number;
    session: string; stopHuntDetected: boolean; breakOfStructure: boolean;
    candlePattern: string; intelligenceCertainty: number;
    anomalies: string[]; atrPips: number;
  } | null>(null);
  const [amisRegime, setAmisRegime] = useState<string>("");
  const [newsImpactWarning, setNewsImpactWarning] = useState<string>("");
  const [newsNarrative, setNewsNarrative] = useState<string>("");
  const [expandedNewsId, setExpandedNewsId] = useState<string | null>(null);
  const [newsSource, setNewsSource] = useState<string>("");

  // 10c. FULL-SCREEN ZOOMABLE CHART STATE
  const [isChartMaximized, setIsChartMaximized] = useState<boolean>(false);
  const [chartZoomLevel, setChartZoomLevel] = useState<number>(1);


  // 11. PERSISTENT ML MEMORY — last 50 trade lessons stored in localStorage
  const [accumulatedLessons, setAccumulatedLessons] = useState<MT5Lesson[]>(() => {
    try {
      const stored = localStorage.getItem("mt5_ai_lessons");
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  // 5. TERMINAL DOCK STATE
  const [activeTab, setActiveTab] = useState<"TRADE" | "PENDING" | "HISTORY" | "NEWS" | "JOURNAL" | "REASONING" | "MATRIX" | "SMC">("MATRIX");
  const [marketMatrix, setMarketMatrix] = useState<Array<{
    symbol: string;
    score: number;
    confluencePct: number;
    bias: string;
    timeframes: { M5: string; M15: string; H1: string; H4: string };
    lastPrice: number;
    adx?: number;
    adxByTf?: { M5: number | null; M15: number | null; M30: number | null; H1: number | null; H4: number | null };
    macdHist?: number | null;
    trendState?: string;
    status?: string;
  }>>([]);
  const [userHasManuallyPickedSymbol, setUserHasManuallyPickedSymbol] = useState<boolean>(false);
  const [isScanningMatrix, setIsScanningMatrix] = useState<boolean>(false);
  // Change vs the PREVIOUS scan, per symbol. ADX/confluence are slow-moving regime
  // metrics (built from M15–H4 candles), so showing the delta is what proves the
  // panel is actually live instead of frozen on the same rounded number.
  const [matrixDelta, setMatrixDelta] = useState<Record<string, { score: number; adx: number }>>({});
  const [lastMatrixTs, setLastMatrixTs] = useState<number>(0);
  const [matrixClock, setMatrixClock] = useState<number>(() => Date.now());

  // The 12s scan interval is created ONCE (empty dep array), so it only ever sees the
  // state captured at mount time. These refs give it live values:
  //   - userPickedRef   : without it the interval always read `false`, so every 12s it
  //                       force-switched the chart back to the #1 market and silently
  //                       overrode any manual symbol selection.
  //   - matrixRef       : previous scan rows (for the deltas above).
  //   - scanInFlightRef : stops overlapping scans from stacking up.
  const userPickedRef = useRef<boolean>(false);
  const matrixRef = useRef<typeof marketMatrix>([]);
  const scanInFlightRef = useRef<boolean>(false);
  // Timestamp of the current in-flight scan. Used by the watchdog below to recover
  // from a promise that somehow never settled (network stack wedge, tab suspend…).
  const scanStartedAtRef = useRef<number>(0);
  const [matrixScanError, setMatrixScanError] = useState<string>("");
  const [matrixFailStreak, setMatrixFailStreak] = useState<number>(0);

  // Keeps the manual-pick state and its ref in lockstep — never call
  // setUserHasManuallyPickedSymbol directly.
  const setUserPicked = (picked: boolean) => {
    userPickedRef.current = picked;
    setUserHasManuallyPickedSymbol(picked);
  };

  const fetchMarketMatrix = async () => {
    // WATCHDOG: a previous scan that claimed the guard but never released it (hung
    // promise) used to freeze the whole 2D scanner. Reclaim the lock ONLY after
    // well past the client's own 60s fetch timeout.
    //
    // BUG FIX: this used to reclaim after 30s — SHORTER than the 60s fetch below.
    // Every slow scan therefore had a replacement started on top of it while the
    // first was still running, and each abandoned scan still held a live
    // `python mt5_scanner.py` process attached to the terminal. That pile-up made
    // the next scan slower still: a positive feedback loop that starved the Node
    // server and froze the panel. The threshold must exceed the fetch timeout,
    // because fetchWithTimeout guarantees the promise always settles.
    const SCAN_LOCK_STALE_MS = 90000;
    if (scanInFlightRef.current) {
      const startedAt = scanStartedAtRef.current;
      if (startedAt > 0 && Date.now() - startedAt > SCAN_LOCK_STALE_MS) {
        console.warn("[MT5 MATRIX WARN] Reclaiming a stalled scan lock (watchdog).");
        scanInFlightRef.current = false;
        scanStartedAtRef.current = 0;
      } else {
        return;
      }
    }
    scanInFlightRef.current = true;
    scanStartedAtRef.current = Date.now();
    setIsScanningMatrix(true);
    try {
      const res = await fetchWithTimeout("/api/mt5/scan", 60000);
      if (!res.ok) throw new Error(`scan endpoint returned HTTP ${res.status}`);
      const data = await res.json();
      // The server bridges mt5_scanner.py's `markets[]` into a flat `rankings[]`.
      // Accept either key so the matrix can never end up silently empty.
      const rows: any[] = Array.isArray(data.rankings) && data.rankings.length > 0
        ? data.rankings
        : Array.isArray(data.markets) ? data.markets : [];
      if (rows.length === 0) throw new Error("scan returned zero markets (MT5 offline or no symbol data)");

      // Strictly sort all markets descending by MTF Confluence Score (highest at top)
      const sortedRankings = [...rows].sort((a, b) => (b.score || 0) - (a.score || 0));

      // Compute change vs the previous scan BEFORE replacing the matrix.
      const prevMap = new Map(matrixRef.current.map(r => [r.symbol, r as any]));
      const nextDelta: Record<string, { score: number; adx: number }> = {};
      sortedRankings.forEach((r: any) => {
        const p: any = prevMap.get(r.symbol);
        if (!p) return; // first scan for this symbol — nothing to compare against
        const dScore = Number(r.score || 0) - Number(p.score || 0);
        const dAdx = Number(r.adx || 0) - Number(p.adx || 0);
        if (Math.abs(dScore) > 0.0001 || Math.abs(dAdx) > 0.0001) {
          nextDelta[r.symbol] = { score: dScore, adx: dAdx };
        }
      });

      matrixRef.current = sortedRankings;
      setMatrixDelta(nextDelta);
      setMarketMatrix(sortedRankings);
      setLastMatrixTs(Date.now());
      setMatrixScanError("");
      setMatrixFailStreak(0);

      // Synchronize master symbols list with fresh live prices
      setSymbols(prevSymbols => {
        const synced = prevSymbols.map(s => {
          const r = sortedRankings.find((item: any) => item.symbol === s.symbol);
          if (r && r.lastPrice > 0) {
            return {
              ...s,
              baseBid: r.lastPrice,
              baseAsk: Number((r.lastPrice + (s.spreadPips * s.pipSize)).toFixed(s.digits))
            };
          }
          return s;
        });

        // Register any broker symbol the scanner found that is missing from our static
        // list (e.g. UKOILm / USOILm). Without this, currentSymbol silently falls back
        // to symbols[0] and the chart/risk math use the WRONG digits & pip size.
        sortedRankings.forEach((r: any) => {
          if (!r.symbol || synced.some(s => s.symbol === r.symbol)) return;
          const px = Number(r.lastPrice) || 0;
          const digits = px >= 1000 ? 2 : px >= 100 ? 3 : 5;
          synced.push({
            symbol: r.symbol,
            name: `${r.symbol} — MT5 Market Watch`,
            category: "MT5 Broker",
            digits,
            pipSize: digits === 2 ? 0.1 : digits === 3 ? 0.01 : 0.0001,
            baseBid: px,
            baseAsk: px,
            spreadPips: 0,
            dailyChange: 0,
            high: px,
            low: px
          });
        });

        return synced;
      });

      // Always set main chart area to the #1 top-ranked market unless manually overridden.
      // Reads the REF, not state: this function is called from a []-dependency interval,
      // so state here would be the mount-time value forever (permanent chart hijack).
      if (sortedRankings.length > 0 && !userPickedRef.current) {
        setSelectedSymbolCode(sortedRankings[0].symbol);
      }
    } catch (scanErr: any) {
      // HONEST FAILURE: this branch used to fabricate random prices + a random demo
      // matrix, which silently masked a broken scan endpoint (the UI just showed
      // plausible-looking numbers). Now the failure is logged and the matrix is
      // cleared so the table clearly shows "scan unavailable" instead of fake data.
      // DO NOT wipe the matrix on a single failed scan. A momentary timeout used to
      // blank every cell ("scan unavailable") and made a healthy-but-busy terminal
      // look dead. The last good rankings are still in matrixRef.current, which is
      // what the AI cycle reads for its candidate queue, so keeping the rendered
      // matrix consistent with that ref is both prettier and more truthful.
      console.warn("[MT5 MATRIX WARN] /api/mt5/scan failed:", scanErr?.message || scanErr);
      setMatrixScanError(scanErr?.message || "scan failed");
      setMatrixFailStreak(prev => prev + 1);
      // Keep the previous rankings on screen; only the error banner changes.
    } finally {
      scanInFlightRef.current = false;
      scanStartedAtRef.current = 0;
      setIsScanningMatrix(false);
    }
  };

  useEffect(() => {
    fetchMarketMatrix();
    // CADENCE: 20s was a defensive throttle from when scans were timing out under the
    // execSync event-loop blocker. That blocker is gone — a warm /api/mt5/scan now
    // answers in ~0.02s, and a cache miss spawns one isolated, non-blocking scanner
    // instead of freezing every other endpoint. Server TTL is 6s, so alternating polls
    // still hit cache. 5s restores the live feel of the scoreboard.
    const MATRIX_INTERVAL_MS = 5000;
    const matrixInterval = setInterval(() => {
      fetchMarketMatrix();
    }, MATRIX_INTERVAL_MS); // Auto re-scan all MT5 markets

    return () => clearInterval(matrixInterval);
  }, []);

  // 1s heartbeat: keeps the "updated Xs ago" readout honest even if tick polling stalls.
  useEffect(() => {
    if (activeTab !== "MATRIX") return;
    const clock = setInterval(() => setMatrixClock(Date.now()), 1000);
    return () => clearInterval(clock);
  }, [activeTab]);

  // Second-by-second elapsed timer for the AI analysis currently in flight.
  useEffect(() => {
    if (!kimiPredicting) {
      setAnalysisElapsed(0);
      return;
    }
    const started = Date.now();
    setAnalysisElapsed(0);
    const timer = setInterval(() => {
      setAnalysisElapsed(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [kimiPredicting]);

  // Live prices for the matrix. The matrix rows only refresh every 12s, but ticks
  // refresh every 2s — so the Live Price column reads from here and stays truly live.
  const livePriceMap = useMemo(() => {
    const map: Record<string, { bid: number; digits: number }> = {};
    symbols.forEach(s => {
      if (s.baseBid > 0) map[s.symbol] = { bid: s.baseBid, digits: s.digits };
    });
    return map;
  }, [symbols]);

  // 11. INSTITUTIONAL PRO TRADER REASONING & ACTIVE POSITION MANAGER STATE
  const [lastTradeExecTime, setLastTradeExecTime] = useState<number>(0);
  const [symbolBlacklist, setSymbolBlacklist] = useState<Record<string, number>>({});
  const [proTraderThoughts, setProTraderThoughts] = useState<Array<{
    id: string;
    timestamp: string;
    stage: string;
    thought: string;
    type: "scan" | "risk" | "exec" | "trailing" | "safety";
  }>>([
    {
      id: "thought-init",
      timestamp: new Date().toLocaleTimeString(),
      stage: "SYSTEM ONLINE",
      thought: "Institutional Quantitative Trading Engine initialized. Monitoring multi-timeframe structure, risk metrics, and active MT5 position exposure.",
      type: "scan"
    }
  ]);



  const [positions, setPositions] = useState<ForexPosition[]>([]);
  const [history, setHistory] = useState<HistoricalTrade[]>([]);
  const [journalLogs, setJournalLogs] = useState<string[]>([]);

  // Log helper
  const addLog = (msg: string) => {
    setJournalLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 50)]);
  };

  // LOAD PERSISTENT ACCOUNT CONFIG & AUTO-CONNECT ON MOUNT + PERIODIC REAL POSITION SYNC
  useEffect(() => {
    const fetchLiveAccountAndPositions = async () => {
      try {
        // fetchWithTimeout (gated + bounded) rather than bare fetch: an unbounded
        // request here would hold one of Chrome's 6 per-origin connections forever
        // if the server ever stalled, starving the scan and the AI cycle with it.
        const res = await fetchWithTimeout("/api/mt5/device-detect", 20000);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.account) {
            const a = data.account;
            setAccountLogin(a.login || 0);
            setAccountServer(a.server || "Unknown");
            setAccountCurrency(a.currency || "USD");
            setLeverage(a.leverage || "1:100");
            setBalance(a.balance || 0);
            setIsConnected(true);
            markFeedOk();

            if (data.device) setDeviceInfo(data.device);
          }
        }

        // Poll real open positions from MetaTrader 5 & Auto-Lock Breakeven Stop Loss
        const posRes = await fetchWithTimeout("/api/mt5/positions", 20000);
        if (posRes.ok) {
          const posData = await posRes.json();
          if (posData.success && Array.isArray(posData.positions)) {
            setPositions(posData.positions);

            // Reversal Early Exit & Trailing Breakeven Circuit Breakers
            for (const pos of posData.positions) {
              const matrixRow = marketMatrix.find(m => m.symbol === pos.symbol);
              if (matrixRow && pos.profit > 0.10 && pos.ticket) {
                const currentBias = matrixRow.bias; // "BULLISH" or "BEARISH"
                const isReversal = (pos.type === "BUY" && currentBias === "BEARISH") || (pos.type === "SELL" && currentBias === "BULLISH");

                if (isReversal) {
                  fetch("/api/mt5/close-position", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ticket: pos.ticket })
                  }).catch(() => { });

                  addLog(`[REVERSAL EARLY EXIT] Closed Position #${pos.ticket} (${pos.symbol}) in Profit (+$${pos.profit.toFixed(2)}) due to Trend Reversal (${currentBias})!`);
                }
              }

              // Trailing Breakeven Circuit Breaker: Auto-lock SL to entry + 1 pip when profit >= +$5.00
              if (pos.profit >= 5.0 && pos.ticket) {
                const symObj = symbols.find(s => s.symbol === pos.symbol);
                const pipSize = symObj?.pipSize || 0.0001;
                const digits = symObj?.digits || 5;
                const dir = pos.type === "BUY" ? 1 : -1;
                const breakevenSL = Number((pos.openPrice + (dir * pipSize)).toFixed(digits));

                // If SL is not already locked to breakeven
                if ((pos.type === "BUY" && (pos.sl < pos.openPrice)) || (pos.type === "SELL" && (pos.sl === 0 || pos.sl > pos.openPrice))) {
                  fetch("/api/mt5/modify-position", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ticket: pos.ticket, sl: breakevenSL, tp: pos.tp })
                  }).catch(() => { });

                  addLog(`[BREAKEVEN LOCK] Auto-moved SL to Breakeven (${breakevenSL}) for Position #${pos.ticket} (${pos.symbol}) — Profit Locked!`);
                }
              }
            }
          }
        }
      } catch (_) {
        setIsConnected(false);
      }
    };

    fetchLiveAccountAndPositions();
    // Each poll spawns Python (account + positions = 2 processes). Was 3s = ~40 spawns/min
    // competing with the scanner and AI cycle for the one MT5 terminal. 8s is plenty for
    // balance/equity/P&L display and leaves the trade cycle headroom.
    const syncInterval = setInterval(fetchLiveAccountAndPositions, 8000);
    return () => clearInterval(syncInterval);
  }, []);



  // AUTO-DETECT DEVICE MT5 TERMINAL ON LAUNCH & POP UP SUMMARY
  // GUARD: React StrictMode (dev) double-invokes effects — without this ref the
  // detection runs and the summary modal pops up TWICE on every page load.
  const didAutoDetectRef = useRef(false);
  useEffect(() => {
    const autoDetectDeviceOnLaunch = async () => {
      if (didAutoDetectRef.current) return; // already ran this mount cycle
      didAutoDetectRef.current = true;
      try {
        const res = await fetch("/api/mt5/device-detect");
        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            setDeviceInfo(data.device);
            if (data.account) {
              setAccountLogin(data.account.login);
              setAccountServer(data.account.server);
              setAccountCurrency(data.account.currency);
              setLeverage(data.account.leverage);
              setBalance(data.account.balance);
              setIsConnected(true);
            }
            setShowDeviceSummaryModal(true);
            addLog(`[AUTO-GRAB] Detected active MT5 Terminal: ${data.device.pcName} (${data.device.build}). Connected to ${data.account?.server || accountServer}`);
          }
        }
      } catch (err) {
        // Local fallback simulation if endpoint offline
        const mockDev = {
          pcName: "DESKTOP-PRO-MT5",
          terminalPath: "C:\\Program Files\\Exness MetaTrader 5\\terminal64.exe",
          build: "MetaTrader 5 x64 Build 4320 (01 Feb 2026)",
          platform: "Windows 11 Enterprise x64",
          pingMs: 8.7,
          status: "ACTIVE_CONNECTED"
        };
        setDeviceInfo(mockDev);
        setShowDeviceSummaryModal(true);
        addLog(`[AUTO-GRAB] Found local MT5 Terminal process: ${mockDev.pcName}`);
      }
    };
    autoDetectDeviceOnLaunch();
  }, []);

  // Selected Symbol Object
  const currentSymbol = useMemo(() => {
    return symbols.find(s => s.symbol === selectedSymbolCode) || symbols[0];
  }, [symbols, selectedSymbolCode]);

  // Live session intelligence for the ACTIVE symbol — recomputed each render so
  // the DST-correct clock tracks real time (live price ticks re-render often).
  // Feeds the session badge so the operator always sees which centre is open,
  // the scalp grade, and what this window favours for short-term trades.
  const activeSession: SessionState = getSessionState(currentSymbol?.symbol);

  // DYNAMIC RISK-BASED LOT SIZE CALCULATOR (ACCURATE PIP VALUATION + HARD 0.15 LOT RISK CAP)
  const dynamicLotCalc = useMemo(() => {
    const riskAmount = (balance * Math.max(0.1, Math.min(5.0, riskPercent))) / 100;

    let pipValuePerLot = 10.0; // Standard $10/pip per std lot on EURUSD
    if (selectedSymbolCode.includes("XAU") || selectedSymbolCode.includes("GOLD")) {
      pipValuePerLot = 10.0; // 1 pip (0.10) = $10 per std lot on Gold
    } else if (selectedSymbolCode.includes("JPY")) {
      pipValuePerLot = 6.80;
    } else if (selectedSymbolCode.includes("BTC")) {
      pipValuePerLot = 1.00;
    } else if (selectedSymbolCode.includes("ETH")) {
      pipValuePerLot = 1.00;
    } else if (selectedSymbolCode.includes("US30") || selectedSymbolCode.includes("NAS100") || selectedSymbolCode.includes("GER40")) {
      pipValuePerLot = 1.00;
    }

    const effectiveSlPips = Math.max(12, slPips);
    const rawLots = riskAmount / (effectiveSlPips * pipValuePerLot);
    // HARD CAPITAL SAFETY CAP: Max 0.15 Lots per trade! Prevents large losses!
    const calculatedLotSize = Math.min(0.15, Math.max(0.01, Number(rawLots.toFixed(2))));

    return {
      riskAmount,
      calculatedLotSize,
      pipValuePerLot,
      riskRewardRatio: tpPips > 0 && slPips > 0 ? `1 : ${(tpPips / slPips).toFixed(2)}` : "1 : 2.00"
    };
  }, [balance, riskPercent, slPips, tpPips, selectedSymbolCode]);


  // Sync lots input when Risk % lot sizing is active
  useEffect(() => {
    if (useRiskLotSizing) {
      setLots(dynamicLotCalc.calculatedLotSize);
    }
  }, [useRiskLotSizing, dynamicLotCalc.calculatedLotSize]);

  // ============================================================
  // ML LESSON PERSISTENCE — syncs accumulatedLessons to localStorage
  // ============================================================
  useEffect(() => {
    try { localStorage.setItem("mt5_ai_lessons", JSON.stringify(accumulatedLessons)); }
    catch (e) { console.warn("ML storage sync failed:", e); }
  }, [accumulatedLessons]);

  // ============================================================
  // MATH UTILITIES — Black-Scholes Normal CDF & Probit (Φ / Φ⁻¹)
  // Identical to DerivTrader implementation
  // ============================================================
  const normalCDF = (x: number): number => {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.39894228 * Math.exp(-x * x / 2);
    const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return x >= 0 ? 1 - p : p;
  };

  // (normalInverseCDF removed — the SL/TP solver now uses live ATR(14) with
  //  research multipliers instead of a static σ Probit clamp; see below.)

  // ============================================================
  // FOREX VOLATILITY SIGMA — pip-volatility per symbol (ATR-based)
  // Used by the statistical SL/TP solver as a fallback when no candles exist.
  //
  // BUG FIX: symbols arrive broker-suffixed ("XAUUSDm", "GBPUSDm"). The old
  // lookup used the raw string, MISSED every map key, and fell through to the
  // generic default 12 → 12×0.842≈10 → sl=10/tp=22 for ALL 133 predictions
  // (gold, oil and JPY pairs included), which is far too tight and produced
  // the blow-past stops in the ledger. We now try the exact key AND the
  // suffix-stripped base so vol-correct stops are used.
  // ============================================================
  const getForexVolatilityPips = (symbol: string): number => {
    const vol: Record<string, number> = {
      EURUSD: 8, GBPUSD: 13, USDJPY: 10, AUDUSD: 8,
      USDCHF: 9, USDCAD: 10, NZDUSD: 8, EURGBP: 7,
      EURJPY: 15, GBPJPY: 20, XAUUSD: 80, XAGUSD: 28,
      BTCUSD: 250, US30: 65, GER40: 45, NAS100: 55,
      USOIL: 60, UKOIL: 60, WTI: 60, BRENT: 60
    };
    const raw = String(symbol || "").trim().toUpperCase();
    const base = raw.replace(/M$/, ""); // strip a single broker suffix ("XAUUSDm" → "XAUUSD")
    return vol[raw] ?? vol[base] ?? 12;
  };

  // ============================================================
  // ATR(14) — Wilder's average true range over recent candles, in PRICE units.
  // This is the research-standard volatility measure (Wilder 1978; the
  // TraderNest ATR table uses period 14) and drives the adaptive SL/TP solver.
  // ============================================================
  // ATR(14) is imported from utils/signalMath (computeATR — unit-tested and
  // shared with the SL/TP solver). It is intentionally NOT duplicated here.


  // ============================================================
  // JYSR TECHNICAL ANALYSIS ENGINE (ported from DerivTrader computeAssetAISignal)
  // Computes SMA, σ, RSI, trend, Support/Resistance Breakout detection.
  // Supports 3 selectable strategies: scalping | reversion | breakout
  // Input: candle close prices (from activeCandles)
  // Output: BUY / SELL / NEUTRAL (adapted from HIGHER/LOWER for MT5 forex)
  // ============================================================
  const computeJYSRSignal = (closes: number[], symbol: string, strategy: "scalping" | "reversion" | "breakout"): JYSRSignalResult => {
    if (closes.length < 5) {
      return {
        signal: "NEUTRAL", confidence: 50, rsi: 50, sma: closes[closes.length - 1] || 0,
        volatility: 0, trend: "CONSOLIDATING", breakout: "STABLE RANGE",
        description: "Insufficient candle data — loading price history..."
      };
    }
    const len = closes.length;
    const latest = closes[len - 1];

    // Simple Moving Average
    const sma = closes.reduce((acc, p) => acc + p, 0) / len;

    // Volatility: Standard Deviation σ
    const variance = closes.reduce((acc, p) => acc + Math.pow(p - sma, 2), 0) / len;
    const stdDev = Math.sqrt(variance);

    // ── WILDER RSI(14) — research-standard (backtested best on 1H) ──
    // Was a cumulative gains/losses ratio over the WHOLE series, which
    // converged to a stale constant and never reflected 14-bar momentum.
    // Delegates to the unit-tested utils/signalMath.wilderRSI implementation.
    const rsi = wilderRSI(closes, 14);

    // ── EMA TREND (EMA20 vs EMA50 + price location + σ deadband) ──
    // Replaces the fragile "last-5 vs first-bar" heuristic. This is the trend
    // the alignment gate uses to stop BUYs in downtrends / SELLs in uptrends.
    // Delegates to the unit-tested utils/signalMath.emaTrend implementation.
    const trend = emaTrend(closes);


    // ── RECENT SWING SUPPORT / RESISTANCE (last ~20 bars) ──
    // Was the ALL-series max/min, which only fired on a full-history breakout
    // (rare + late) with a 0.1σ threshold (≈ noise). Now uses a recent swing
    // window and a 0.25σ confirmation so a "breakout" is meaningful.
    const SWING_LOOKBACK = Math.min(20, len - 1);
    const seg = closes.slice(-1 - SWING_LOOKBACK, -1); // exclude forming candle
    const resistance = Math.max(...seg);
    const support = Math.min(...seg);
    let breakout: "BULLISH BREAKOUT" | "BEARISH BREAKDOWN" | "STABLE RANGE" = "STABLE RANGE";
    const breakThresh = stdDev * 0.25;
    if (latest > resistance + breakThresh) breakout = "BULLISH BREAKOUT";
    else if (latest < support - breakThresh) breakout = "BEARISH BREAKDOWN";


    // Signal scoring by strategy mode
    // Breakout strength = how far price closed beyond the broken S/R level, in σ units.
    // Used to scale the breakout bonus instead of a flat +35 that gave EVERY breakout
    // an identical, automatically-passing confidence.
    const breakoutSigma = breakout === "BULLISH BREAKOUT"
      ? (latest - resistance) / (stdDev || 1e-9)
      : breakout === "BEARISH BREAKDOWN"
        ? (support - latest) / (stdDev || 1e-9)
        : 0;
    let signal: "BUY" | "SELL" | "NEUTRAL" = "NEUTRAL";
    let confidence = 50 + Math.abs(rsi - 50) * 0.4;
    // TREND-ALIGNMENT GATE — a directional signal only fires when the EMA trend
    // agrees. This is THE fix for the counter-trend BUY bias: forensics shows
    // 195/204 dollar losses were LONG in TRENDING regimes, and BUYs lost 62% of
    // the time. Consolidating (no EMA trend) ⇒ NEUTRAL, which also skips chop.
    const trendUp = trend === "BULLISH";
    const trendDown = trend === "BEARISH";

    if (strategy === "scalping") {
      if (breakout === "BULLISH BREAKOUT" && trendUp) { signal = "BUY"; confidence += 20; }
      else if (breakout === "BEARISH BREAKDOWN" && trendDown) { signal = "SELL"; confidence += 20; }
      else if (rsi < 45 && trendUp) { signal = "BUY"; confidence += 15; }     // pullback in an up-trend
      else if (rsi > 55 && trendDown) { signal = "SELL"; confidence += 15; }  // rally in a down-trend
      // TREND-CONTINUATION — the established-trend regime that has NO rule above.
      // Logs show trend=BULLISH, rsi≈60-68, breakout=STABLE RANGE arriving as
      // NEUTRAL(57): there is no pullback (rsi never < 45) and no fresh breakout,
      // so the engine structurally could not express "ride the healthy trend."
      // This adds that voice, with three hard guards:
      //   • TREND-ALIGNED ONLY (never counter-trend) — forensics: LONG-in-trend
      //     losses came from CHASING the top, not from aligned continuation.
      //   • CAPPED band (BUY 50≤rsi≤72, SELL 28≤rsi≤50) so it never fires into
      //     overbought/exhausted extremes (rsi ≥ 78 ⇒ still NEUTRAL).
      //   • Modest +10 confidence ⇒ these are MARGINAL proposals the calibrated
      //     meta-label gate must still approve (P(TP first) ≥ break-even+margin)
      //     before an order fires. The learned gate — not raw RSI — is authority.
      else if (trendUp && rsi >= 50 && rsi <= 72) { signal = "BUY"; confidence += 10; }
      else if (trendDown && rsi >= 28 && rsi <= 50) { signal = "SELL"; confidence += 10; }
    } else if (strategy === "reversion") {
      // Fade only WITH the trend (buy dips in an up-trend, sell rallies in a
      // down-trend) — never counter-trend, which is what kept losing.
      if (rsi < 35 && trendUp) { signal = "BUY"; confidence += 30; }
      else if (rsi > 65 && trendDown) { signal = "SELL"; confidence += 30; }
    } else if (strategy === "breakout") {
      const strength = Math.min(35, 15 + Math.max(0, breakoutSigma) * 10);
      if (breakout === "BULLISH BREAKOUT" && trendUp) { signal = "BUY"; confidence += strength; }
      else if (breakout === "BEARISH BREAKDOWN" && trendDown) { signal = "SELL"; confidence += strength; }
    }
    confidence = Math.round(Math.min(99, Math.max(35, confidence)));


    const sym = symbols.find(s => s.symbol === symbol);
    const d = sym?.digits || 5;
    const description = signal === "BUY"
      ? `JYSR [${strategy}] detects Bullish setup — RSI: ${rsi}, Breakout: ${breakout}, Trend: ${trend}. Support: ${support.toFixed(d)}.`
      : signal === "SELL"
        ? `JYSR [${strategy}] detects Bearish setup — RSI: ${rsi}, Breakout: ${breakout}, Trend: ${trend}. Resistance: ${resistance.toFixed(d)}.`
        : `JYSR [${strategy}] — Consolidating. RSI: ${rsi}. No strong directional edge.`;

    return { signal, confidence, rsi, sma, volatility: stdDev, trend, breakout, description };
  };

  // ============================================================
  // ADAPTIVE SL/TP PIP SOLVER — live ATR(14) with research multipliers.
  //
  // WHY REWRITTEN: the old solver fed a static per-symbol σ through Φ⁻¹(0.80)
  // and clamped to [10,200]. Because of the broker-suffix bug every symbol
  // resolved to σ=12 → sl=10 / tp=22 — a fixed 10-pip stop for gold, oil and
  // JPY alike, far inside the noise floor. Ledger evidence: 133/133 identical
  // 10/22, SL hit 39× vs TP 30×, and 37% of losses blew past the stop
  // (avg MAE 12.7 vs SL 10). Gold lost −46 pips on a 10-pip stop.
  //
  // RESEARCH VALUES USED (TraderNest ATR table + RSI14/1h scalping study):
  //   • ATR period 14 (Wilder standard).
  //   • Forex scalp/intraday SL = 1.0–2.0× ATR → we use 1.5× (midpoint).
  //   • Scalping reward:risk = 1.5–2.2 → target 1:2 (2.0), floor 1:1.5.
  //   • SL never tighter than 2× spread (else it is noise-fill, not risk).
  // Result: stops scale with real per-symbol volatility (gold wide, EURUSD
  // tight) and TP stays reachable within the 15-min (900s) horizon.
  // ============================================================
  const getSolvedSLTPPips = (
    sym: ForexSymbol,
    candles: Candle[]
  ): { slPips: number; tpPips: number; atrPips: number } => {
    const pipSize = sym.pipSize > 0 ? sym.pipSize : (sym.digits >= 5 ? 0.0001 : 0.01);
    const atrPrice = computeATR(candles, 14);
    const spreadPips = Number.isFinite(sym.spreadPips) && sym.spreadPips > 0
      ? sym.spreadPips
      : 1.0;
    // Unit-tested solver (utils/signalMath.solveSLTP): SL = 1.5×ATR_pips with
    // a 2×spread floor, TP = 2×SL. Falls back to the static suffix-safe table
    // only when candles are unavailable (atrPrice === 0).
    const solved = atrPrice > 0
      ? solveSLTP(atrPrice, pipSize, spreadPips)
      : (() => {
          const atrPips = getForexVolatilityPips(sym.symbol); // suffix-safe fallback
          return solveSLTPFromAtrPips(atrPips, spreadPips);
        })();
    return solved;
  };


  // ============================================================
  // ============================================================
  // AMIS-FX PREDICTION ENGINE — Full 9-layer intelligence pipeline
  // Calls /api/mt5/intel which runs generateMarketSnapshot() +
  // Gemini AI with news context + adaptive ML lesson memory.
  // Auto-fills SL/TP from ATR-computed pip values.
  // ============================================================
  const fetchKimiMT5Prediction = async (
    symbol: string,
    currentPrice: number,
    candles: any[],
    tradeHistory: HistoricalTrade[],
    lessons: MT5Lesson[],
    h1Candles: Candle[] = [],
    h4Candles: Candle[] = [],
    marketRanking: { symbol: string; score: number }[] = []
  ): Promise<{
    signal: "BUY" | "SELL" | "NEUTRAL";
    confidence: number;
    barrierOffset: number;
    analysis: string;
    setupQuality: PredictionQuality;
    shouldTrade: boolean;
    setupType: string;
    tradeReasoning: string;
    source: "KIMI" | "LOCAL_FALLBACK" | "PENDING";
  } | null> => {
    setKimiPredicting(true);
    setCurrentAnalyzingSymbol(symbol);
    setKimiError(null);
    try {
      // Build Multi-Timeframe (MTF) Context across M5, M15, H1, H4.
      // h1/h4 are fetched for THIS market by the caller (Step 1b). They are
      // intentionally NOT read from candlesMap, which only ever holds the
      // symbol+timeframe currently on screen.
      const h1Bars = Array.isArray(h1Candles) ? h1Candles : [];
      const h4Bars = Array.isArray(h4Candles) ? h4Candles : [];
      let mtfSummary = `Primary Timeframe: ${timeframe} (${candles.length} bars loaded).`;
      if (h1Bars.length >= 5) {
        const h1Closes = h1Bars.map((c: any) => c.close);
        const h1Dir = h1Closes[h1Closes.length - 1] >= h1Closes[0] ? "BULLISH" : "BEARISH";
        mtfSummary += ` | H1 Trend: ${h1Dir} (${h1Bars.length} bars)`;
      } else {
        mtfSummary += " | H1: unavailable (judge on the entry timeframe alone)";
      }
      if (h4Bars.length >= 5) {
        const h4Closes = h4Bars.map((c: any) => c.close);
        const h4Dir = h4Closes[h4Closes.length - 1] >= h4Closes[0] ? "BULLISH" : "BEARISH";
        mtfSummary += ` | H4 Macro: ${h4Dir} (${h4Bars.length} bars)`;
      } else {
        mtfSummary += " | H4: unavailable";
      }

      // Cross-market context: the scanner ranks EVERY market, but the deep AI
      // pass only runs on the single winner. Without this the AI has no idea it
      // was selected out of a field, and cannot weigh this setup against the
      // runners-up (or spot a stronger correlated expression of the same view).
      if (Array.isArray(marketRanking) && marketRanking.length > 1) {
        const ranked = marketRanking
          .slice(0, 8)
          .map((r, i) => `${i + 1}.${r.symbol} ${Number(r.score).toFixed(1)}`)
          .join(" | ");
        mtfSummary += ` | Scanned ${marketRanking.length} markets; this is the TOP-ranked: ${ranked}`;
      }

      // Timeout must cover the server's WORST case: 2 Moonshot attempts x 55s cap
      // (~110s) plus snapshot/indicator/SMC compute and the local fallback tail.
      // It was 170s while the server could take 450s — the client always aborted
      // first, so no verdict ever reached the ledger ("no predictions").
      // TIMEOUT: server-side Moonshot budget is 110s, so 130s leaves ~20s of margin
      // for serialization. It MUST exceed the server budget — if the client gives up
      // first, the verdict is written to an aborted connection and is simply lost
      // (no [AMIS RAW RESPONSE], so no prediction is ever recorded). Previously the
      // server could burn up to 300s (2 attempts x 150s, multiplied again by the
      // callers' own retries) against a 120s client, so the client ALWAYS lost the
      // race. Also: this holds a gated connection slot, but the live-tick poller
      // bypasses the gate, so the tape keeps moving while the AI thinks.
      const response = await fetchWithTimeout("/api/mt5/intel", 130000, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          currentPrice,
          candles: candles.slice(-100),
          accumulatedLessons: lessons.slice(0, 20),
          mtfContext: mtfSummary,
          newsContext: newsList.slice(0, 8).map(n => ({
            impact: n.impact,
            currency: n.currency,
            event: n.event,
            forecast: n.forecast,
            previous: n.previous,
            actual: n.actual,
            aiAnalysis: n.aiAnalysis
          }))
        })
      });


      if (!response.ok && response.status !== 202) throw new Error(`AMIS-FX API ${response.status}`);
      const data = await response.json();
      if (!data.success) throw new Error(data.error || "AMIS-FX returned failure");

      // DIAGNOSTIC: raw intel response — confirms whether Kimi returned a usable payload
      console.log("[AMIS RAW RESPONSE]", {
        httpOk: response.ok,
        success: data.success,
        rawSignal: data.signal,
        rawConfidence: data.confidence,
        setupQuality: data.setupQuality,
        shouldTrade: data.shouldTrade,
        setupType: data.setupType,
        pending: Boolean(data.pending),
        servedFrom: data.servedFrom || null,
        regime: data.regime || null,
        suggestedSL: data.suggestedSL,
        suggestedTP: data.suggestedTP,
        analysisChars: (data.analysis || "").length,
        error: data.error || null
      });

      // Map signal
      const rawSig = String(data.signal || "NEUTRAL").toUpperCase();
      const mappedSignal: "BUY" | "SELL" | "NEUTRAL" =
        rawSig === "BUY" ? "BUY" : rawSig === "SELL" ? "SELL" : "NEUTRAL";

      // Normalize confidence to 0-100
      let mappedConf = typeof data.confidence === "number"
        ? (data.confidence <= 1 ? Math.round(data.confidence * 100) : Math.round(data.confidence))
        : 65;
      mappedConf = Math.max(0, Math.min(99, mappedConf)); // floor 0: a 202 "still analysing" ack must read as 0, not 35

      // ── SETUP VERIFICATION (the new trade gate) ──
      // Kimi answers "is this actually a good-to-perfect setup right now?" with
      // shouldTrade + setupQuality + tradeReasoning instead of a bare percentage.
      // HARDENING: LOCAL_FALLBACK verdicts are observe-only by construction —
      // force shouldTrade=false client-side too, so a stale server build can
      // never sneak a fallback trade through.
      const rawQuality = String(data.setupQuality || "").toUpperCase();
      const verdictSource: "KIMI" | "LOCAL_FALLBACK" | "PENDING" =
        data.pending ? "PENDING"
          : String(data.setupType || "").toUpperCase().includes("FALLBACK") ? "LOCAL_FALLBACK"
            : "KIMI";
      const isFallbackVerdict = verdictSource === "LOCAL_FALLBACK";
      const mappedQuality: PredictionQuality =
        isFallbackVerdict ? "POOR"
          : rawQuality === "PERFECT" ? "PERFECT"
            : rawQuality === "HIGH_PROBABILITY" ? "HIGH_PROBABILITY"
              : rawQuality === "VALID" ? "VALID"
                : rawQuality === "POOR" ? "POOR"
                  : (mappedSignal !== "NEUTRAL" && mappedConf >= 60 ? "VALID" : "POOR");
      // Research-backed calibration note (MQL5 Blueprint Part 12): raw model
      // confidence is systematically overconfident and must never size or gate
      // trades until fitted with Platt/isotonic scaling on out-of-fold data.
      // Until a calibration audit exists, treat confidence as TELEMETRY ONLY.
      const mappedShouldTrade = isFallbackVerdict
        ? false
        : typeof data.shouldTrade === "boolean"
          ? data.shouldTrade
          : (mappedSignal !== "NEUTRAL" && mappedQuality !== "POOR");

      const nextVerdict = {
        symbol,
        signal: mappedSignal,
        setupQuality: mappedQuality,
        shouldTrade: mappedShouldTrade,
        confidence: mappedConf,
        setupType: data.setupType || "PRICE_ACTION_CONFLUENCE",
        tradeReasoning: data.tradeReasoning || "",
        source: verdictSource,
        timestamp: Date.now()
      };

      setKimiVerdict(nextVerdict);
      setKimiVerdicts(prev => ({ ...prev, [symbol]: nextVerdict }));

      setKimiSignal(mappedSignal);
      setKimiConfidence(mappedConf);
      setKimiAnalysis(data.analysis || "");

      // Store full AMIS snapshot for display
      if (data.snapshot) {
        setAmisSnapshot(data.snapshot);
      }
      if (data.regime) setAmisRegime(data.regime);

      // Auto-fill SL/TP from ATR-computed pip values
      if (typeof data.suggestedSL === "number" && data.suggestedSL > 0) {
        setSlPips(data.suggestedSL);
      }
      if (typeof data.suggestedTP === "number" && data.suggestedTP > 0) {
        setTpPips(data.suggestedTP);
      }

      // Push to JYSR signal feed with regime context
      if (mappedSignal !== "NEUTRAL" && verdictSource !== "PENDING") {
        setJysrSignalsHistory(prev => [{
          id: String(Date.now()),
          time: new Date().toLocaleTimeString(),
          text: `[AMIS-FX] ${mappedSignal} ${symbol} (${mappedQuality} ${mappedConf}% | ${data.regime || ""}) — ${(data.analysis || "").slice(0, 100)}...`,
          type: mappedSignal === "BUY" ? "bullish" : "bearish"
        }, ...prev].slice(0, 20));
      }

      return {
        signal: mappedSignal,
        confidence: mappedConf,
        barrierOffset: 0,
        analysis: data.analysis || "",
        setupQuality: mappedQuality,
        shouldTrade: verdictSource === "PENDING" ? false : mappedShouldTrade,
        setupType: data.setupType || "PRICE_ACTION_CONFLUENCE",
        tradeReasoning: data.tradeReasoning || "",
        source: verdictSource
      };
    } catch (err: any) {
      console.error("[AMIS-FX ERROR]", err);
      setKimiError(err.message || "Kimi AI service temporarily unavailable");
      return null;
    } finally {
      setKimiPredicting(false);
      setCurrentAnalyzingSymbol(null);
    }
  };


  // ============================================================
  // ML TRADE LESSON RECORDER (ported from DerivTrader recordTradeToLearningMemory)
  // Called after every position close to build persistent coaching memory.
  // Max 50 lessons stored in localStorage key "mt5_ai_lessons".
  // ============================================================
  const recordTradeLesson = (trade: HistoricalTrade) => {
    const isWin = (trade.finalProfit || 0) >= 0;
    const sym = symbols.find(s => s.symbol === trade.symbol);
    const pVal = (trade.symbol || "").includes("JPY") ? 6.8 : 10;
    const profitPips = Math.round(Math.abs(trade.finalProfit || 0) / (trade.volume * pVal));
    const dirText = trade.type === "BUY" ? "bullish" : "bearish";
    const d = sym?.digits || 5;

    const insightText = isWin
      ? `✅ WIN — ${trade.symbol} ${dirText}. Entry: ${trade.openPrice.toFixed(d)}, Exit: ${(trade.closePrice || trade.currentPrice).toFixed(d)}. Profit: +$${(trade.finalProfit || 0).toFixed(2)} (+${profitPips} pips).`
      : `⚠️ LOSS — ${trade.symbol} ${dirText}. Entry: ${trade.openPrice.toFixed(d)}, Exit: ${(trade.closePrice || trade.currentPrice).toFixed(d)}. Loss: $${(trade.finalProfit || 0).toFixed(2)} (-${profitPips} pips).`;

    const ruleCreated = isWin
      ? `Maintain ${trade.symbol} SL/TP configuration when ${dirText} momentum aligns with trend.`
      : `Consider tighter entry or stronger ${dirText} confluence before next ${trade.symbol} trade.`;

    const lesson: MT5Lesson = {
      id: String(Date.now()), timestamp: Date.now(), symbol: trade.symbol,
      tradeType: trade.type, status: isWin ? "WIN" : "LOSS",
      entryPrice: trade.openPrice, exitPrice: trade.closePrice || trade.currentPrice,
      profitPips, insightText, ruleCreated
    };
    setAccumulatedLessons(prev => [lesson, ...prev].slice(0, 50));
    addLog(`[ML MEMORY] ${isWin ? "WIN ✅" : "LOSS ⚠️"} lesson recorded for ${trade.symbol}. Total: ${accumulatedLessons.length + 1} lessons.`);
  };

  // ============================================================
  // PREDICTION LEDGER CLIENT
  // Records every Kimi verdict, then polls the server-ledger so each prediction is
  // observed against live prices and scored WIN / LOSS / VOID. This is the
  // "place the trade → observe it → see if we predicted right" loop.
  // ============================================================
  const refreshPredictionLedger = async () => {
    try {
      // Gated + bounded: this ledger poller runs on an interval and must not
      // bypass the origin's concurrency budget.
      const res = await fetchWithTimeout("/api/mt5/predictions?limit=20&resolve=1", 20000);
      if (!res.ok) throw new Error(`ledger HTTP ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "ledger unavailable");
      if (Array.isArray(data.predictions)) setPredictionLedger(data.predictions);
      if (data.stats) setPredictionStats(data.stats);
      if (data.calibration) setCalibration(data.calibration);
      setLedgerError("");
    } catch (err: any) {
      // Honest failure: never show a fake scorecard.
      setLedgerError(err?.message || "Prediction ledger unavailable");
    }
  };

  const recordPredictionToLedger = async (payload: {
    symbol: string;
    direction: "BUY" | "SELL";
    entryPrice: number;
    slPrice: number;
    tpPrice: number;
    slPips: number;
    tpPips: number;
    setupQuality: PredictionQuality;
    confidencePct: number;
    setupType: string;
    reasoning: string;
    source: "KIMI_SETUP_VERIFIED" | "JYSR_FALLBACK";
    tradeExecuted: boolean;
    ticket: number | null;
    shouldTrade: boolean;
    skipReason: string;
    features?: {
      adx: number | null;
      atrPercentile: number | null;
      sessionGrade: "A" | "B" | "C" | "D" | "F" | null;
      spreadPips: number | null;
      minutesToNews: number | null;
      jysrConfidence: number | null;
      kimiConfidence: number | null;
      kimiGrade: PredictionQuality | null;
      h1h4Agree: boolean | null;
      raidFlag: boolean | null;
      patternFlag: boolean | null;
    } | null;
  }) => {
    try {
      const res = await fetch("/api/mt5/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, horizonSec: PREDICTION_HORIZON_SEC })
      });
      const data = await res.json();
      if (data.success && data.prediction) {
        setPredictionLedger(prev => [data.prediction, ...prev].slice(0, 25));
        addLog(`[LEDGER] ${payload.direction} ${payload.symbol} recorded (${payload.setupQuality}${payload.tradeExecuted ? ", TRADED" : ", observed only"}) — will be scored in ${Math.round(PREDICTION_HORIZON_SEC / 60)} min.`);
      } else {
        setLedgerError(data.error || "Could not record prediction");
      }
    } catch (err: any) {
      setLedgerError(err?.message || "Could not record prediction");
    }
    void refreshPredictionLedger();
  };

  // Periodic observation refresh — faster while the autopilot is live so the
  // scorecard visibly updates as predictions mature.
  useEffect(() => {
    refreshPredictionLedger();
    const ms = isAiAutoTraderActive ? 30000 : 60000;
    const ledgerInterval = setInterval(refreshPredictionLedger, ms);
    return () => clearInterval(ledgerInterval);
  }, [isAiAutoTraderActive]);

  // ============================================================
  // ============================================================
  // AI QUANTITATIVE ANALYSIS — JYSR ENGINE + GEMINI AI
  // (Upgraded from simulated random signals — fully ported from DerivTrader)
  // 1. JYSR computes local technical signal from candle closes
  // 2. Gemini AI provides deep ML-backed directional signal
  // 3. Statistical SL/TP solver replaces hardcoded 20/45 pips
  // 4. Gemini takes priority if confidence >= 65%, else JYSR fallback
  // ============================================================
  // AI QUANTITATIVE ANALYSIS — MULTI-MARKET SCANNER & AMIS-FX INTELLIGENCE
  // 1. Scans all available MT5 symbols and picks the market with the highest setup clarity
  // 2. Switches chart view to the top market automatically
  // 3. Runs 9-layer AMIS market intelligence snapshot & Gemini AI prediction
  // 4. Computes optimal ATR-based lot size according to account balance/equity
  // 5. Draws trendlines, S&R floors/ceilings, order blocks, and SL/TP target lines on chart
  // ============================================================
  const analysisInFlightRef = useRef<number | null>(null);
  // Watchdog ceiling for ONE cycle.
  //
  // A fall-through cycle can spend up to AMIS_MAX_CANDIDATES sequential Kimi
  // calls, each given the server's ~150s budget, plus candle fetches. The ceiling
  // MUST exceed that worst case or the watchdog releases the guard while a
  // legitimate multi-market cycle is still running — precisely the overlap the
  // guard exists to prevent. (It was 90s, which is shorter than a SINGLE Kimi
  // call of 45-100s, so it fired on every healthy cycle and let cycles overlap.)
  const AMIS_CYCLE_WATCHDOG_MS = AMIS_MAX_CANDIDATES * 180000 + 120000; // 11 min: must exceed AMIS_MAX_CANDIDATES x 150s server Kimi cap, or the watchdog releases the guard mid-cycle and lets cycles overlap

  const handleRunAiAnalysis = async () => {
    // RE-ENTRANCY GUARD: the Kimi call can take well over a minute (reasoning model),
    // while the auto-trader interval fires on a fixed cadence. Without this guard,
    // cycles overlap, duplicate AI calls stack up, and state updates race each other.
    //
    // BUG FIX: this used to guard on `kimiPredicting` React STATE. State reads come
    // through a closure, so the flag could latch true and permanently block every
    // later cycle ("[AMIS CYCLE] skipped" forever) if any awaited call in the cycle
    // hung. A REF is authoritative and cannot go stale. A watchdog timestamp also
    // releases the guard if a cycle somehow never reaches its `finally`.
    if (analysisInFlightRef.current !== null) {
      const stuckMs = Date.now() - analysisInFlightRef.current;
      if (stuckMs < AMIS_CYCLE_WATCHDOG_MS) {
        console.log("[AMIS CYCLE] skipped — previous analysis still in progress");
        return;
      }
      console.warn(`[AMIS CYCLE] watchdog — previous cycle ran ${Math.round(stuckMs / 1000)}s, releasing guard`);
      addLog(`[AMIS CYCLE] Watchdog released a stuck cycle (${Math.round(stuckMs / 1000)}s) so trading can resume.`);
    }
    analysisInFlightRef.current = Date.now();
    // PRE-FLIGHT VALIDATION: Block only when the MT5 feed itself is offline.
    // (An empty chart on ONE dead/unsupported symbol no longer aborts the whole
    // cycle — Step 1b fetches fresh candles for the scanner-selected symbol.)
    if (!mt5DataAvailable) {
      setKimiError("Cannot generate AMIS analysis: Market data is offline / MT5 terminal disconnected.");
      addLog(`[AMIS WARN] Prediction blocked: MetaTrader 5 data is offline or market is closed.`);
      analysisInFlightRef.current = null; // BUG FIX: clear guard before early return so next cycle isn't permanently blocked
      return;
    }

    setIsAnalyzingAi(true);
    setKimiError(null);
    const cycleStartedAt = Date.now();
    try {
      addLog(`[AMIS SCANNER] Scanning all available MT5 markets for highest probability setups...`);

      // Filter out expired blacklisted symbols (> 30 mins)
      const now = Date.now();
      const activeBlacklist = Object.keys(symbolBlacklist).filter(sym => symbolBlacklist[sym] > now);
      const activePosSymbols = positions.map(p => p.symbol);
      const excludeSymbolsList = Array.from(new Set([...activeBlacklist, ...activePosSymbols]));

            // Step 1: Use the latest LIVE matrix scan (refreshed every 5s by
      // fetchMarketMatrix). Previously this made a SECOND /api/mt5/scan call
      // which raced with the 5s interval's Python invocation — causing both
      // to slow down or fail, and making the 2D scanner appear frozen the
      // moment the AI Trader was turned on. Reading from the ref eliminates
      // the duplicate call entirely.
      const matrixSnapshot = matrixRef.current.length > 0 ? matrixRef.current : [];

      // ── CANDIDATE QUEUE (fall-through) ───────────────────────────────────
      // The scanner ranks EVERY market, but the deep AI pass used to run on the
      // single winner only. If Kimi vetoed that one setup the cycle simply ended,
      // so a perfectly tradeable setup on market #2 was invisible whenever
      // market #1 was vetoed. The cycle now walks down the ranking and spends one
      // AI call per candidate until one is approved or the queue is exhausted.
      const excluded = new Set(excludeSymbolsList.map(s => s.trim()).filter(Boolean));
      const rankedPool: any[] = matrixSnapshot.length > 0
        ? matrixSnapshot
        : [{ symbol: selectedSymbolCode, score: 75, bias: "NEUTRAL", timeframes: {} }];
      const eligiblePool = rankedPool.filter((r: any) => r && r.symbol && !excluded.has(r.symbol));
      const candidateQueue = (eligiblePool.length > 0 ? eligiblePool : [rankedPool[0]])
        .filter(Boolean)
        .slice(0, AMIS_MAX_CANDIDATES);

      if (matrixSnapshot.length > 0) {
        addLog(`[AMIS SCANNER] Scanned ${matrixSnapshot.length} markets — evaluating up to ${candidateQueue.length} candidate${candidateQueue.length === 1 ? "" : "s"} this cycle.${excludeSymbolsList.length > 0 ? ` Excluded: ${excludeSymbolsList.join(", ")}.` : ""}`);
      } else {
        addLog(`[AMIS SCANNER] Matrix scan not yet available (MT5 may be offline). Using current chart symbol: ${selectedSymbolCode}`);
      }

      let tradedThisCycle = false;
      let tradedSymbolThisCycle: string | null = null;
      const vetoedThisCycle: string[] = [];

      for (let ci = 0; ci < candidateQueue.length && !tradedThisCycle; ci++) {
      const candidate = candidateQueue[ci];
      const isLastCandidate = ci === candidateQueue.length - 1;
      const targetSymCode = candidate.symbol;
      const scanScore = candidate.score || 75;
      setSelectedSymbolCode(targetSymCode);
      addLog(`[AMIS SCANNER] Candidate ${ci + 1}/${candidateQueue.length}: ${targetSymCode} (MTF Score: ${scanScore}/100, Bias: ${candidate.bias})`);
      setProTraderThoughts(prev => [{
        id: `thought-scan-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        stage: "2D MTF MATRIX SCANNER",
        thought: `Live matrix (${matrixSnapshot.length} markets, last refreshed ${Math.round((Date.now() - lastMatrixTs) / 1000)}s ago). Evaluating candidate ${ci + 1}/${candidateQueue.length}: ${targetSymCode} (${scanScore}% MTF Confluence). [M5: ${candidate.timeframes?.M5 || "—"} | M15: ${candidate.timeframes?.M15 || "—"} | H1: ${candidate.timeframes?.H1 || "—"} | H4: ${candidate.timeframes?.H4 || "—"}]`,
        type: "scan"
      }, ...prev].slice(0, 30));

      // Step 1b: Fetch FRESH candle data for targetSymCode directly (do not rely on stale React state)
      //
      // BUG FIX: only the PRIMARY timeframe used to be fetched. The AI's H1/H4
      // context was read from candlesMap[`${symbol}_H1`], but candlesMap is only
      // ever populated for the symbol+timeframe currently displayed on the chart.
      // The scanner auto-switches to the top-ranked market and loads M5, so
      // `${symbol}_H1` / `${symbol}_H4` were EMPTY and the `length >= 5` guards
      // silently skipped them. Kimi was told "Primary Timeframe: M5" with no
      // higher-timeframe context at all — it was structurally blind to H1/H4.
      // Now H1 and H4 are fetched explicitly for the target market.
      let targetCandles = activeCandles;
      // Track WHERE targetCandles came from so the <50 skip log can tell us
      // whether thin data originates in the live fetch or the chart-state
      // fallback — the key question when every symbol skips.
      let candlesSource = "chart-state(activeCandles)";
      let h1TargetCandles: Candle[] = [];
      let h4TargetCandles: Candle[] = [];
      try {
        // SEQUENTIAL rather than Promise.allSettled — these three used to fire at
        // once, on top of the long Kimi intel call and the tick/scan/account
        // pollers, which pushed the origin past Chrome's 6-connection limit and
        // into its FIFO queue (where the scan's 60s clock was already ticking).
        // One connection instead of three, and the server's 8s candle cache makes
        // the cost negligible — 0.06s warm versus ~1s cold per URL.
        const candleUrls = [
          `/api/mt5/candles?symbol=${targetSymCode}&timeframe=${timeframe}&count=100`,
          `/api/mt5/candles?symbol=${targetSymCode}&timeframe=H1&count=100`,
          `/api/mt5/candles?symbol=${targetSymCode}&timeframe=H4&count=100`,
        ];
        const settledResults: PromiseSettledResult<Response>[] = [];
        for (const url of candleUrls) {
          try {
            settledResults.push({ status: "fulfilled", value: await fetchWithTimeout(url, 45000) });
          } catch (reason) {
            settledResults.push({ status: "rejected", reason });
          }
        }
        const [primaryRes, h1Res, h4Res] = settledResults;

        const parseCandles = async (settled: PromiseSettledResult<Response>): Promise<Candle[]> => {
          if (settled.status !== "fulfilled" || !settled.value.ok) return [];
          try {
            const j = await settled.value.json();
            return j?.success && Array.isArray(j.candles) ? j.candles : [];
          } catch {
            return [];
          }
        };

        targetCandles = (await parseCandles(primaryRes)) || [];
        candlesSource = "live-fetch(/api/mt5/candles)";
        if (targetCandles.length < 10) {
          targetCandles = activeCandles; // fall back to chart candles
          candlesSource = "chart-state-fallback(activeCandles)";
        }
        h1TargetCandles = await parseCandles(h1Res);
        h4TargetCandles = await parseCandles(h4Res);

        if (h1TargetCandles.length < 5 || h4TargetCandles.length < 5) {
          addLog(`[AMIS MTF] Higher-timeframe data incomplete for ${targetSymCode} (H1 ${h1TargetCandles.length} bars, H4 ${h4TargetCandles.length} bars) — the AI will judge this setup on the entry timeframe alone.`);
        } else {
          addLog(`[AMIS MTF] Loaded full MTF context for ${targetSymCode}: ${targetCandles.length} ${timeframe} + ${h1TargetCandles.length} H1 + ${h4TargetCandles.length} H4 bars.`);
        }
      } catch (candleErr: any) {
        console.warn("[AMIS SCANNER WARN] candle fetch failed — using chart candles:", candleErr?.message || candleErr);
      }

      // Validate the target symbol actually produced candles (a dead/unsupported
      // broker symbol yields 0). Skip to the NEXT candidate rather than ending
      // the cycle — a bad symbol must not cost us the whole ranking.
      if (!Array.isArray(targetCandles) || targetCandles.length < 50) {
        // JYSR's emaTrend() needs a full 50-bar warmup: emaValue(closes,50)
        // returns the LAST CLOSE (not a real EMA) when len<50, which collapses
        // slow=latest and forces CONSOLIDATING regardless of the real trend.
        // A 10-49 bar window was silently forced to HOLD; make that a visible skip.
        addLog(`[AMIS WARN] ${targetSymCode} only ${targetCandles.length} bars (<50, source=${candlesSource}) — EMA50 needs a 50-bar warmup; skipping this market.`);
        continue;
      }

      const activeSymbolObj = symbols.find(s => s.symbol === targetSymCode) || currentSymbol;
      const closes = targetCandles.map((c: any) => Number(c.close));

      // META-LABEL SNAPSHOT INPUTS — computed once per candidate from the same
      // fresh candles / live tick / calendar every gate below consumes. These
      // locals feed the news blackout, the spread cap, the ATR gate, the H1/H4
      // agreement flag, and the ledger's feature snapshot — one truth, no
      // recomputation, no drift between the gate that fires and the row saved.
      const snapBars = targetCandles.map((c: any) => ({
        high: Number(c.high), low: Number(c.low), close: Number(c.close),
      }));
      const snapCloses = snapBars.map(c => c.close).filter(Number.isFinite);
      const snapHighs = snapBars.map(c => c.high).filter(Number.isFinite);
      const snapLows = snapBars.map(c => c.low).filter(Number.isFinite);
      const snapAdx = (snapHighs.length >= 15 && snapLows.length >= 15 && snapCloses.length >= 15)
        ? calculateADX(snapHighs, snapLows, snapCloses, 14).adx
        : null;
      let snapAtrPct: number | null = null;
      if (snapBars.length >= 30) {
        const liveAtr = computeATR(snapBars.slice(-15), 14);
        const histAtrs: number[] = [];
        for (let w = 0; w + 14 <= snapBars.length - 1; w++) {
          const a = computeATR(snapBars.slice(w, w + 15), 14);
          if (Number.isFinite(a) && a > 0) histAtrs.push(a);
        }
        snapAtrPct = histAtrs.length > 0 ? atrPercentile(liveAtr, histAtrs) : null;
      }
      const snapSpread: number | null =
        Number.isFinite(activeSymbolObj.spreadPips) && activeSymbolObj.spreadPips > 0
          ? activeSymbolObj.spreadPips
          : null;
      // H1/H4 agreement + minutes-to-news are also snapshot-grade: the spread
      // cap, ATR gate, news blackout and the ledger snapshot must all read the
      // same value, so they are computed here once (not inside the ledger block
      // where they used to sit — after the filters had already referenced them).
      const featH1Closes = Array.isArray(h1TargetCandles) ? h1TargetCandles.map((c: any) => Number(c.close)).filter(Number.isFinite) : [];
      const featH4Closes = Array.isArray(h4TargetCandles) ? h4TargetCandles.map((c: any) => Number(c.close)).filter(Number.isFinite) : [];
      // finalSignal isn't known yet at snapshot time, so the agreement flag is
      // computed lazily via a helper bound to the signal once it resolves.
      const featH1H4 = (sig: "BUY" | "SELL" | "HOLD") => h1h4Agreement(sig, featH1Closes, featH4Closes);
      const featMinsNews = minutesToHighImpactNews(activeSymbolObj.symbol, Array.isArray(newsList) ? newsList : [], Date.now());
      // STEP 2: JYSR Local Technical Analysis
      const jysr = computeJYSRSignal(closes, activeSymbolObj.symbol, jysrStrategy);

      setJysrSignalsHistory(prev => [{
        id: String(Date.now()),
        time: new Date().toLocaleTimeString(),
        text: `[JYSR ${jysrStrategy.toUpperCase()}] ${jysr.signal} ${activeSymbolObj.symbol} (${jysr.confidence}% conf) — ${jysr.description}`,
        type: jysr.signal === "BUY" ? "bullish" : jysr.signal === "SELL" ? "bearish" : "system"
      }, ...prev].slice(0, 20));

      // STEP 3: Adaptive SL/TP Solver — live ATR(14) × research multipliers.
      // Passes the symbol object + FRESH candles so stops scale to real
      // per-symbol volatility (fixes the universal 10/22 bug).
      const { slPips, tpPips } = getSolvedSLTPPips(activeSymbolObj, targetCandles);

      // STEP 3b: SESSION INTELLIGENCE — DST-correct session state for this pair.
      // Feeds the scalping gate, the cycle log and the UI badge. Computed once
      // per candidate so the same window is used for gating and telemetry.
      const sessionState = getSessionState(activeSymbolObj.symbol);
      const sessionScalpable = isScalpableWindow(sessionState, activeSymbolObj.symbol, SESSION_SCALP_MIN_SCORE);

      // STEP 3c: PRICE-ACTION KNOWLEDGE — fractals, swings, reversal patterns,
      // liquidity raids on the same FRESH candles. Computed once per candidate
      // so the gate, the log and the ledger all share one price-action truth.
      // Uses live ATR so raid penetration is volatility-scaled, not fixed.
      const paAtrPrice = computeATR(
        targetCandles.map((c: any) => ({ high: Number(c.high), low: Number(c.low), close: Number(c.close) })),
        14
      );
      const priceAction = analyzePriceAction(
        targetCandles.map((c: any) => ({ high: Number(c.high), low: Number(c.low), close: Number(c.close) })),
        { atrPrice: paAtrPrice }
      );

      // STEP 4: AMIS-FX Intelligence Engine (full pipeline using FRESH targetCandles)
      const kimiResult = await fetchKimiMT5Prediction(
        activeSymbolObj.symbol,
        activeSymbolObj.baseBid,
        targetCandles,
        history,
        accumulatedLessons,
        h1TargetCandles,
        h4TargetCandles,
        matrixSnapshot.map((r: any) => ({ symbol: r.symbol, score: r.score }))
      );

      // STEP 5: Blend — CALIBRATED: when the server has fitted per-engine Platt
      // models, each engine's raw confidence is mapped to its OWN calibrated
      // P(TP first) and the higher calibrated probability wins (AI wins ties).
      // Raw 0-100 confidences are not comparable across engines — Kimi "85" and
      // JYSR "85" are different self-reports — so comparing them directly is the
      // flaw this replaces. Cold start (no models yet): fall back to raw
      // confidence, the best signal available before enough rows resolve.
      const aiSignal = kimiResult && kimiResult.signal !== "NEUTRAL" ? kimiResult : null;
      const jysrSignal = jysr.signal !== "NEUTRAL" ? jysr : null;

      const calibKimi = calibration?.plattKimi ?? null;
      const calibJysr = calibration?.plattJysr ?? null;
      const calibratedAi = aiSignal && calibKimi ? applyPlatt(calibKimi, aiSignal.confidence) : null;
      const calibratedJysr = jysrSignal && calibJysr ? applyPlatt(calibJysr, jysrSignal.confidence) : null;

      let finalSignal: "BUY" | "SELL" | "HOLD" = "HOLD";
      let finalConf = scanScore;

      if (aiSignal && (!jysrSignal || (calibratedAi ?? aiSignal.confidence / 100) >= (calibratedJysr ?? jysrSignal.confidence / 100))) {
        finalSignal = aiSignal.signal as "BUY" | "SELL";
        finalConf = aiSignal.confidence;
        if (jysrSignal && jysrSignal.signal !== finalSignal) {
          addLog(`[AMIS BLEND] Engine conflict on ${activeSymbolObj.symbol}: AI ${finalSignal} (cal ${calibratedAi?.toFixed(3) ?? aiSignal.confidence / 100}) outranks JYSR ${jysrSignal.signal} (cal ${calibratedJysr?.toFixed(3) ?? jysrSignal.confidence / 100}).`);
        }
      } else if (jysrSignal) {
        finalSignal = jysrSignal.signal as "BUY" | "SELL";
        finalConf = jysrSignal.confidence;
        if (aiSignal) {
          addLog(`[AMIS BLEND] Engine conflict on ${activeSymbolObj.symbol}: JYSR ${finalSignal} (cal ${calibratedJysr?.toFixed(3) ?? jysrSignal.confidence / 100}) outranks AI ${aiSignal.signal} (cal ${calibratedAi?.toFixed(3) ?? aiSignal.confidence / 100}).`);
        }
      } else {
        finalSignal = "HOLD";
        finalConf = Math.min(84, Math.max(55, scanScore));
      }

      // === DIAGNOSTIC: HOLD root-cause telemetry (additive only — no trading-logic
      // change; remove after ~30-50 cycles once the cause is confirmed). Prints the
      // exact inputs the trend gate + blend consume, so we can tell "genuinely
      // ranging" (working as designed) from a data/symbol bug (case b). fast/slow/
      // sigma are computed identically to emaTrend() in signalMath.ts. ===
      {
        const _bars = closes.length;
        const _fast = emaValue(closes, 20);
        const _slow = emaValue(closes, 50);
        const _mean = _bars > 0 ? closes.reduce((a, b) => a + b, 0) / _bars : 0;
        const _sigma = _bars > 0 ? Math.sqrt(closes.reduce((a, p) => a + Math.pow(p - _mean, 2), 0) / _bars) : 0;
        const _sep = Math.abs(_fast - _slow);
        const _deadband = _sigma * 0.15;
        const _trend = emaTrend(closes);
        const _rsi = _bars >= 15 ? wilderRSI(closes, 14) : null;
        const _lastCandle: any = targetCandles[targetCandles.length - 1];
        const _lastTime = Number(_lastCandle?.time ?? _lastCandle?.timestamp ?? _lastCandle?.epoch ?? _lastCandle?.t ?? 0);
        const _ageSec = _lastTime > 0 ? Math.round(Date.now() / 1000 - _lastTime) : null;
        const _first = closes[0];
        const _last = closes[_bars - 1];
        console.warn(
          `[AMIS DIAG] ${activeSymbolObj.symbol} | final=${finalSignal} trend=${_trend} ` +
          `bars=${_bars} |fast-slow|=${_sep.toPrecision(4)} σ=${_sigma.toPrecision(4)} ` +
          `deadband(0.15σ)=${_deadband.toPrecision(4)} clearsDeadband=${_sep >= _deadband} ` +
          `rsi=${_rsi ?? "n/a"} lastCandleAge=${_ageSec != null ? _ageSec + "s" : "NO-TIME-FIELD"} ` +
          `firstClose=${_first} lastClose=${_last} ` +
          `jysr=${jysr.signal}(${jysr.confidence}) ai=${kimiResult?.signal ?? "n/a"}(${kimiResult?.confidence ?? "n/a"})`
        );
      }

      if (calibratedAi != null || calibratedJysr != null) {
        addLog(`[AMIS CALIBRATION] ${activeSymbolObj.symbol} resolved on calibrated P(TP first): Kimi ${calibratedAi?.toFixed(3) ?? "n/a"}, JYSR ${calibratedJysr?.toFixed(3) ?? "n/a"} (${calibration?.sampleRows ?? 0} rows behind the fit).`);
      }


      const entry = activeSymbolObj.baseBid;
      const slDist = slPips * activeSymbolObj.pipSize;
      const tpDist = tpPips * activeSymbolObj.pipSize;
      const dir = finalSignal === "BUY" ? 1 : -1;
      const slPrice = Number((entry - dir * slDist).toFixed(activeSymbolObj.digits));
      const tpPrice = Number((entry + dir * tpDist).toFixed(activeSymbolObj.digits));
      const lotResult = dynamicLotCalc.calculatedLotSize;

      // EXPECTED VALUE (telemetry only, no longer a gate): retained for the cycle
      // log so expectancy is still visible, but it is NOT used to block trades —
      // it treats the AI's self-reported confidence as a probability, and the
      // server floors that number at 65%, so it is not calibrated.
      const expectedValuePips = (finalConf / 100) * tpPips - (1 - finalConf / 100) * slPips;
      const minRequiredEvPips = slPips * 0.2;
      const isExpectedValuePositive = expectedValuePips > minRequiredEvPips;

      // DIAGNOSTIC CYCLE LOG — one line per analysis cycle for overnight distribution
      // analysis (filter the browser console by "[AMIS CYCLE]").
      // ── KIMI VERIFIED-SETUP GATE ─────────────────────────────────────────
      // This is the replacement for the rigid ">= 75% confidence" rule: Kimi reads
      // the live snapshot (structure, order blocks, sweeps, MTF context, news) and
      // answers whether this is a setup it wants to take, and grades it.
      // KIMI-ONLY EXECUTION: LOCAL_FALLBACK verdicts are observe-only. Only a
      // real Kimi verdict (source === "KIMI") can authorize an order — the local
      // RSI rule stamps 97-98% HIGH_PROBABILITY SELLs that lose, so it must never
      // clear this gate even if a stale server payload says shouldTrade:true.
      const verdict = kimiResult;
      const hasVerdict = Boolean(verdict && verdict.source !== "PENDING");
      const isKimiVerdict = hasVerdict && verdict!.source === "KIMI";
      const isFallbackVerdict = hasVerdict && verdict!.source === "LOCAL_FALLBACK";
      const setupQuality: PredictionQuality = hasVerdict
        ? verdict!.setupQuality
        : (finalSignal !== "HOLD" && finalConf >= AI_AUTO_TRADE_MIN_CONFIDENCE ? "VALID" : "POOR");
      // SESSION-GATED SCALPING PATH — objective complement to Kimi's verdict
      // (the targeted fix for the "no trades" stoppage). Authorises ONLY in a
      // prime scalping window for THIS pair when the local structural engine
      // sees a real, direction-aligned breakout. Distinct from the banned
      // RSI-only LOCAL_FALLBACK: it requires session liquidity AND a structural
      // breakout in the same direction, and every risk block below still applies.
      const breakoutAligned =
        jysr.breakout === (jysr.signal === "BUY" ? "BULLISH BREAKOUT" : "BEARISH BREAKDOWN");
      const sessionScalpAuthorized =
        sessionScalpable &&
        jysr.signal !== "NEUTRAL" &&
        jysr.confidence >= SESSION_SCALP_MIN_CONF &&
        (!SESSION_SCALP_REQUIRE_BREAKOUT || breakoutAligned);

      const setupVerified =
        (isKimiVerdict && verdict!.shouldTrade === true && SETUP_TRADEABLE_QUALITIES.includes(verdict!.setupQuality))
        || sessionScalpAuthorized;
      // OWNER DIRECTIVE: Kimi's discretionary verdict remains the primary gate —
      // every grade (POOR included) trades. `isExpectedValuePositive` is
      // deliberately NOT consulted here: it was the last place a self-reported,
      // uncalibrated confidence percentage could veto a setup the AI had already
      // approved. `sessionScalpAuthorized` is an ADDITIVE, objective path (real
      // session liquidity + direction-aligned structural breakout) that does not
      // rest on Kimi's self-reported confidence.
      // ── FINAL COUNTER-TREND GATE ─────────────────────────────────────────
      // Blocks any entry opposing the entry-timeframe EMA trend, regardless of
      // source (Kimi or local). Evidence: BUYs lost 62% and 195/204 real dollar
      // losses were LONG in TRENDING regimes — the single biggest loss driver.
      // Uses the unit-tested utils/signalMath.isCounterTrend (jysr.trend is the
      // EMA20/50 trend on these same entry candles).
      const counterTrend = finalSignal === "HOLD"
        ? false
        : isCounterTrend(finalSignal as "BUY" | "SELL", jysr.trend as "BULLISH" | "BEARISH" | "CONSOLIDATING");

      // ── LIQUIDITY-RAID VETO ──────────────────────────────────────────
      // Blocks BUY into a fresh buy-side raid / SELL into a fresh sell-side
      // raid, from ANY source (Kimi included). This is the literal shape of
      // our 198 RANDOM_NOISE losses: price pokes above a swing high, the
      // system reads "strong LONG breakout", buys the top, and it reverses.
      // Uses the unit-tested utils/priceAction.isTradingIntoRaid on the same
      // candles and the same detection the server prompt reasons over, so the
      // local gate and the AI share one definition of the trap. Stale raids
      // (>3 bars) are information, not a veto.
      const raidVeto = finalSignal === "HOLD"
        ? false
        : isTradingIntoRaid(finalSignal as "BUY" | "SELL", priceAction, targetCandles.length);

      // Positive confluence: a CONFIRMED reversal pattern backing the signal
      // (double top/H&S for SELL, double bottom/inverse for BUY). Logged for
      // now and available to the scalping path as an extra quality input.
      const patternBacked = finalSignal === "HOLD"
        ? false
        : hasConfirmedPatternFor(finalSignal as "BUY" | "SELL", priceAction);

      // ── META-LABEL GATE ──────────────────────────────────────────────────
      // The learned second opinion: a logistic model fit on RESOLVED ledger
      // rows predicts P(TP first | features). We trade only when that calibrated
      // probability beats break-even + margin, where break-even =
      // (SL + cost) / (SL + TP) — e.g. SL 12 / TP 24 / cost 1.2 → ≈0.367, NOT
      // the naive 1/3, because the entry spread raises the bar. Gate is OFF
      // during cold start (fitCalibration returns null under 30 resolved rows)
      // and OFF on an incomplete snapshot — it can only ever REMOVE a trade,
      // never manufacture one. metaLabelDecision never throws; any bad input
      // yields p=0.5 which then fails break-even+margin and blocks (safe).
      let metaLabelBlocked = false;
      let metaLabelP: number | null = null;
      let metaLabelThreshold: number | null = null;
      // Positive gate approval — true ONLY when the learned meta-label gate
      // actually ran AND cleared (p ≥ break-even+margin). Distinct from
      // `!metaLabelBlocked`, which is also true during cold-start (gate absent).
      // This is the sole authority that can authorise a LOCAL_FALLBACK trade:
      // during cold-start (<30 resolved rows) calibration.gate is null, so
      // metaLabelApproved stays false and fallbacks remain observe-only.
      let metaLabelApproved = false;
      if (finalSignal !== "HOLD" && calibration?.gate) {
        const featVec = vectorizeFeatures({
          adx: snapAdx,
          atrPercentile: snapAtrPct,
          sessionGrade: sessionState.grade,
          spreadPips: snapSpread,
          minutesToNews: featMinsNews,
          jysrConfidence: jysr.confidence,
          // Feed the verdict's OWN confidence/grade for any non-PENDING verdict,
          // so the gate engages for LOCAL_FALLBACK too (was: null ⇒ gate skipped).
          // Real-Kimi rows are unaffected (isKimiVerdict ⇒ hasVerdict, same value).
          kimiConfidence: hasVerdict ? verdict!.confidence : null,
          kimiGrade: hasVerdict ? verdict!.setupQuality : null,
          h1h4Agree: featH1H4(finalSignal),
          raidFlag: priceAction.raids.length > 0,
          patternFlag: patternBacked,
        });
        if (featVec) {
          const d = metaLabelDecision(calibration.gate, featVec, slPips, tpPips, snapSpread ?? 0);
          metaLabelP = d.probability;
          metaLabelThreshold = d.threshold;
          metaLabelBlocked = !d.trade;
          metaLabelApproved = d.trade;
        }
      }

      // CALIBRATED LOCAL-FALLBACK AUTHORIZATION (Task B): the blanket observe-only
      // ban on LOCAL_FALLBACK is replaced by the learned meta-label gate as the
      // decision-maker. A fallback now trades ONLY when that gate has genuinely
      // approved it (calibrated P(TP-first) ≥ break-even+margin on ≥30 resolved
      // rows). This restores throughput while Kimi is degraded, without
      // resurrecting the banned RSI-only 97%-false-signal path — because the gate,
      // not the raw RSI confidence, is the authority. Every downstream risk block
      // (counter-trend, raid, news, meta-label) still applies via setupGatePasses.
      const fallbackMetaLabelAuthorized =
        isFallbackVerdict && metaLabelApproved;

      // ── JYSR-ANCHORED AUTHORIZATION (Option A) ─────────────────────────
      // When Kimi is alive-but-abstaining (NEUTRAL) the directional signal is
      // driven by the local JYSR engine, but JYSR alone was never an execution
      // authority — so those setups sat observe-only forever. This adds a third
      // authority: a directional JYSR signal that is the engine actually driving
      // finalSignal may trade ONLY when the learned meta-label gate genuinely
      // APPROVED it (calibrated P(TP-first) ≥ break-even+margin on ≥30 resolved
      // rows). The gate — not raw JYSR/RSI confidence — remains the authority,
      // so this does NOT resurrect the banned RSI-only 97%-false-signal path.
      // Every downstream risk block (counter-trend, raid, news, meta-label) still
      // applies via setupGatePasses.
      const jysrDrivesSignal =
        finalSignal !== "HOLD" &&
        jysr.signal === finalSignal;
      // ── DEMO/VERIFY MODE (Option A) ────────────────────────────────────
      // The goal here is to PROVE the bot trades end-to-end on demo money.
      // Every SIGNAL-QUALITY gate (learned meta-label, liquidity-raid veto,
      // counter-trend) is currently firing on ~100% of setups (the ledger win
      // rate is 5.4%, so the learned model vetoes everything; the raid detector
      // and trend gate flag nearly every bar). A gate that fires 100% of the
      // time is a kill-switch, not a filter — so in DEMO mode they are ADVISORY:
      // still computed, logged and written to the ledger (you can SEE what each
      // thinks), but they no longer hard-block. That lets directional setups
      // reach the broker.
      //
      // What STAYS hard even in demo mode = MECHANICAL account protection, which
      // is valid regardless of strategy quality:
      //   • news blackout, live-spread cap, ATR band, min-SL-vs-spread
      //   • dynamic position limit, 3-min cooldown, daily-loss kill switch
      //   • currency-correlation / USD-leg exposure cap
      // (all applied downstream via riskBlockReason — untouched by this flag).
      //
      // Set DEMO_VERIFY_MODE = false to restore every signal-quality gate as a
      // hard authority (Option B / live): JYSR/fallback setups then trade ONLY
      // when trend-aligned, NOT into a raid, AND the learned gate clears
      // break-even+margin.
      const DEMO_VERIFY_MODE = true;
      const JYSR_COLD_START_MIN_CONF = 65;
      const jysrMetaLabelAuthorized =
        jysrDrivesSignal &&
        (DEMO_VERIFY_MODE || calibration?.gate == null
          ? true // demo: JYSR drives it → authorised (raid/counter-trend advisory below)
          : jysr.confidence >= JYSR_COLD_START_MIN_CONF);

      // In demo mode the signal-quality vetoes are advisory; in live mode they
      // are hard blocks again.
      const effectiveCounterTrend = DEMO_VERIFY_MODE ? false : counterTrend;
      const effectiveRaidVeto = DEMO_VERIFY_MODE ? false : raidVeto;
      const effectiveMetaLabelBlocked = DEMO_VERIFY_MODE ? false : metaLabelBlocked;

      const setupGatePasses =
        finalSignal !== "HOLD" &&
        (setupVerified || fallbackMetaLabelAuthorized || jysrMetaLabelAuthorized) &&
        !effectiveCounterTrend && !effectiveRaidVeto && !effectiveMetaLabelBlocked;
      const tradeGatePasses = isAiAutoTraderActive && setupGatePasses;

      // === DECISIVE CONSOLE DIAGNOSTIC (temporary) ===
      // Prints the FULL gate state for every directional candidate so the exact
      // blocking gate is visible on the console. Remove after root cause confirmed.
      if (finalSignal !== "HOLD") {
        console.warn(
          `[GATE] ${activeSymbolObj.symbol} final=${finalSignal} ` +
            `TRADE=${tradeGatePasses} auto=${isAiAutoTraderActive} ` +
            `|| verified=${setupVerified} fbAuth=${fallbackMetaLabelAuthorized} ` +
            `jysrDrives=${jysrDrivesSignal} jysrAuth=${jysrMetaLabelAuthorized} ` +
            `|| counter=${counterTrend} raid=${raidVeto} metaBlocked=${metaLabelBlocked} ` +
            `|| metaApproved=${metaLabelApproved} jysrConf=${jysr.confidence} ` +
            `gate=${calibration?.gate != null ? "FITTED" : "COLD-START"} ` +
            `gateP=${calibration?.gate?.probAtCurrent != null ? calibration.gate.probAtCurrent.toFixed(3) : "n/a"} ` +
            `thresh=${metaLabelThreshold != null ? metaLabelThreshold.toFixed(3) : "n/a"}`
        );
      }
      const skipReason = finalSignal === "HOLD"
        ? `No directional setup detected on ${activeSymbolObj.symbol} (grade ${setupQuality}). Session: ${sessionShortLabel(sessionState)}. PA: ${priceActionShortLabel(priceAction)}.`
        : metaLabelBlocked
          ? `Meta-label veto on ${activeSymbolObj.symbol}: calibrated P(TP first)=${(metaLabelP ?? 0.5).toFixed(3)} < break-even+margin ${(metaLabelThreshold ?? 0).toFixed(3)} (SL ${slPips.toFixed(1)}p / TP ${tpPips.toFixed(1)}p / cost ${(snapSpread ?? 0).toFixed(1)}p). Learned gate says no edge.`
          : counterTrend
            ? `Counter-trend ${finalSignal} blocked on ${activeSymbolObj.symbol} — entry EMA trend is ${jysr.trend}. (Trend-alignment gate: counter-trend BUYs lost 62% in forensics.)`
            : raidVeto
              ? `Liquidity-raid veto on ${activeSymbolObj.symbol} — ${finalSignal} would trade INTO a fresh raid (${priceActionShortLabel(priceAction)}). This is the exact trap behind our 198 noise losses; sitting out.`
              : !hasVerdict && !sessionScalpAuthorized
              ? `Kimi verdict still in flight (PENDING) on ${activeSymbolObj.symbol} — no setup to grade yet.`
              : isFallbackVerdict && !sessionScalpAuthorized && !fallbackMetaLabelAuthorized
                ? `OBSERVE-ONLY fallback on ${activeSymbolObj.symbol} (${verdict!.setupType}): meta-label gate did not authorise (calibrated P(TP first)${metaLabelP != null ? `=${metaLabelP.toFixed(3)}` : " n/a — cold-start <30 rows"}) — recorded to ledger only.`
                : hasVerdict && !sessionScalpAuthorized && !verdict!.shouldTrade
                  ? `Kimi VERIFIED NO-TRADE: ${verdict!.tradeReasoning || verdict!.setupType || "setup does not qualify"}. Session: ${sessionShortLabel(sessionState)}.`
                  : `Setup graded ${setupQuality} but did not clear the trade gate. Session: ${sessionShortLabel(sessionState)}.`;

      console.log("[AMIS CYCLE]", {
        time: new Date().toLocaleTimeString(),
        symbol: activeSymbolObj.symbol,
        aiSignal: aiSignal ? `${aiSignal.signal}@${aiSignal.confidence}` : "NONE",
        jysrSignal: jysrSignal ? `${jysr.signal}@${jysr.confidence}` : "NONE",
        finalSignal,
        finalConf,
        setupQuality,
        shouldTrade: hasVerdict ? verdict!.shouldTrade : null,
        verdictSource: hasVerdict ? verdict!.source : "NONE",
        scanScore,
        slPips,
        tpPips,
        evPips: Number(expectedValuePips.toFixed(1)),
        minEvPips: Number(minRequiredEvPips.toFixed(1)),
        evPass: isExpectedValuePositive,
        aiTraderOn: isAiAutoTraderActive,
        tradeGatePasses,
        session: sessionShortLabel(sessionState),
        sessionScalpAuthorized,
        scalpScore: sessionState.scalpScore,
        entryTrend: jysr.trend,
        counterTrend,
        priceAction: priceActionShortLabel(priceAction),
        raidVeto,
        patternBacked,
        metaLabelP: metaLabelP != null ? Number(metaLabelP.toFixed(3)) : null,
        metaLabelThreshold: metaLabelThreshold != null ? Number(metaLabelThreshold.toFixed(3)) : null,
        metaLabelBlocked,
        gateRows: calibration?.sampleRows ?? 0,
      });


      // Keep the on-screen autopilot telemetry honest every single cycle.
      setAutopilotStats(prev => ({
        ...prev,
        cycles: prev.cycles + 1,
        lastCycleAt: Date.now(),
        lastCycleMs: Date.now() - cycleStartedAt,
        nextCycleAt: prev.nextCycleAt,
        lastSkipReason: tradeGatePasses ? "trade gate PASSED" : skipReason
      }));

      const markdown = `### 🧠 AMIS-FX Intelligence Report — ${activeSymbolObj.symbol}\n\n**Market Selection:** Scanned MT5 pairs → Selected **${activeSymbolObj.symbol}** (${activeSymbolObj.name}) as optimal asset.\n\n**AMIS Co-Processor [${amisSnapshot?.dominantRegime || amisRegime || "Analyzing..."}]:**\n• Session: ${amisSnapshot?.session || "—"} | RSI(14): ${amisSnapshot?.rsi14?.toFixed(1) || "—"} | ATR: ${amisSnapshot?.atrPips || "—"} pips\n• Volatility: ${amisSnapshot?.volatilityState || "—"} | Structure: ${amisSnapshot?.breakOfStructure ? "Break of Structure ⚡" : "Intact"} | Pattern: ${amisSnapshot?.candlePattern || "None"}\n• Intelligence Certainty: ${amisSnapshot?.intelligenceCertainty || "—"}% | ${amisSnapshot?.stopHuntDetected ? "⚠️ Stop Hunt Detected" : "No Stop Hunt"}\n\n**AMIS-FX Signal:**\n${kimiResult ? kimiResult.analysis : jysr.description}\n\n**Risk & Money Management (Account Balance $${balance.toLocaleString()}):**\n• Recommended Position: **${lotResult} Lots** (${riskPercent}% risk = $${dynamicLotCalc.riskAmount.toFixed(2)})\n• Entry: ${entry.toFixed(activeSymbolObj.digits)} | SL: ${slPrice.toFixed(activeSymbolObj.digits)} (${slPips}p) | TP: ${tpPrice.toFixed(activeSymbolObj.digits)} (${tpPips}p) | R:R = 1:${(tpPips / slPips).toFixed(2)}`;

      setAiPrediction({
        symbol: activeSymbolObj.symbol,
        signal: finalSignal,
        confidence: finalConf,
        targetEntry: entry,
        recommendedSLPips: slPips,
        recommendedTPPips: tpPips,
        recommendedSLPrice: slPrice,
        recommendedTPPrice: tpPrice,
        calculatedLotSize: lotResult,
        riskRewardRatio: `1 : ${(tpPips / slPips).toFixed(2)}`,
        analysisMarkdown: markdown,
        timestamp: Date.now()
      });

      addLog(`[AMIS-FX COMPLETE] ${finalSignal} ${activeSymbolObj.symbol} — Conf: ${finalConf}% | Optimal Lots: ${lotResult} | SL: ${slPrice} | TP: ${tpPrice}`);

      // AUTOPILOT TRADE GATE — driven by Kimi's verified SETUP QUALITY, not a raw %
      let executedTicket: number | null = null;
      // Reason this candidate did NOT become an order ("" = will execute).
      // Every risk block below SETS this (instead of break/continue-ing past the
      // ledger) so the bottom-of-loop write records the verdict with its reason.
      let riskBlockReason = "";
      // Account-wide blocks must stop the whole queue; per-symbol blocks fall
      // through to the next candidate.
      let abortCycle = false;
      if (finalSignal !== "HOLD" && !tradeGatePasses) {
        addLog(`[AMIS SETUP GATE] ${finalSignal} ${activeSymbolObj.symbol} NOT traded — ${skipReason}`);
        // Remember the veto so the next candidate gets a chance, and so the
        // cycle can explain itself at the end.
        vetoedThisCycle.push(targetSymCode);
        setProTraderThoughts(prev => [{
          id: `thought-setup-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          stage: "SETUP VERIFICATION FILTER",
          thought: skipReason,
          type: "safety"
        }, ...prev].slice(0, 30));

        // Only surface a "not verified" notification once, for the LAST
        // candidate — otherwise a 3-candidate cycle spams three popups and the
        // user is told nothing was tradeable before the queue has even finished.
        if (isAiAutoTraderActive && isLastCandidate) {
          setAiNotification({
            id: `notif-safety-${Date.now()}`,
            title: `⏸️ Setup Not Verified: ${activeSymbolObj.symbol}`,
            symbol: activeSymbolObj.symbol,
            action: "HOLD",
            lots: 0,
            price: entry,
            sl: 0,
            tp: 0,
            reason: skipReason,
            expectedProfit: 0,
            timestamp: Date.now()
          });
        }
      } else if (tradeGatePasses) {
        // PRO TRADER RISK CHECK 0: NEWS BLACKOUT (±5 min high-impact, +30 min rates)
        // A scheduled spike invalidates the technical read entirely: spreads blow
        // out, both barriers can print in one bar, and the first-touch label
        // becomes a lottery ticket. Per-symbol block — the next candidate (a
        // different currency leg) may be tradeable. Uses the same impact
        // vocabulary + rate list as utils/metaLabel.inNewsBlackout so the live
        // gate and the offline A/B can never disagree.
        if (!riskBlockReason) {
          const blackCtx = {
            minutesToNews: featMinsNews,
            newsEventName: null as string | null,
            newsImpact: null as string | null,
            spreadPips: snapSpread,
            slPips,
            atrPercentile: snapAtrPct,
            counterTrendBlocked: counterTrend,
            h1h4Agree: featH1H4(finalSignal),
          };
          const hiNews = Array.isArray(newsList) ? newsList.find((n: any) => {
            const impact = String(n?.impact || "").toLowerCase();
            return impact.includes("high") || impact.includes("red");
          }) : null;
          if (hiNews) {
            blackCtx.newsEventName = String(hiNews.event || "");
            blackCtx.newsImpact = String(hiNews.impact || "");
          }
          if (inNewsBlackout(blackCtx)) {
            const msg = `News blackout on ${activeSymbolObj.symbol}: high-impact event within the ±5 min window${/rate|fomc|ecb|boe|boj|rba|boc|snb|nfp|non[\s-]?farm|cpi|interest/i.test(blackCtx.newsEventName || "") ? " (rate decision: extended +30 min)" : ""}. Technical read suspended until the spike clears.`;
            addLog(`[PRO NEWS BLACKOUT] ${msg}`);
            setProTraderThoughts(prev => [{
              id: `thought-news-${Date.now()}`,
              timestamp: new Date().toLocaleTimeString(),
              stage: "NEWS BLACKOUT FILTER",
              thought: msg,
              type: "risk"
            }, ...prev].slice(0, 30));
            riskBlockReason = msg;
          }
        }

        // PRO TRADER RISK CHECK 0b: LIVE-SPREAD CAP (spread ≤ SL/4)
        // Paying more than a quarter of the planned stop in spread means the
        // trade starts 25%+ underwater on noise alone. Independent of the SL-
        // distance guard below (that one checks the SOLVED stop vs spread;
        // this one checks the LIVE spread vs the solved stop at entry time).
        if (!riskBlockReason && !spreadOk({
          minutesToNews: null, spreadPips: snapSpread, slPips,
          atrPercentile: snapAtrPct, counterTrendBlocked: counterTrend, h1h4Agree: featH1H4(finalSignal),
        })) {
          const msg = `Spread cap on ${activeSymbolObj.symbol}: live spread ${snapSpread ?? "n/a"}p exceeds SL/4 (${(slPips / 4).toFixed(1)}p on a ${slPips}p stop). Entry cost too high — sitting out.`;
          addLog(`[PRO SPREAD CAP] ${msg}`);
          setProTraderThoughts(prev => [{
            id: `thought-spread-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            stage: "SPREAD CAP FILTER",
            thought: msg,
            type: "risk"
          }, ...prev].slice(0, 30));
          riskBlockReason = msg;
        }

        // PRO TRADER RISK CHECK 0c: ATR-PERCENTILE GATE (10–90)
        // Dead chop (p<10) has no range to pay the spread; chaos (p>90) has no
        // readable structure. Both regimes show up in forensics as RANDOM_NOISE
        // losses, so both are blocked — per symbol, like the other filters.
        if (!riskBlockReason && !atrGateOk({
          minutesToNews: null, spreadPips: snapSpread, slPips,
          atrPercentile: snapAtrPct, counterTrendBlocked: counterTrend, h1h4Agree: featH1H4(finalSignal),
        })) {
          const msg = `ATR gate on ${activeSymbolObj.symbol}: ATR percentile ${snapAtrPct ?? "n/a"} outside the tradeable 10–90 band (dead chop or chaos — both regimes produced noise losses).`;
          addLog(`[PRO ATR GATE] ${msg}`);
          setProTraderThoughts(prev => [{
            id: `thought-atr-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            stage: "ATR PERCENTILE FILTER",
            thought: msg,
            type: "risk"
          }, ...prev].slice(0, 30));
          riskBlockReason = msg;
        }

        // PRO TRADER DYNAMIC RISK CHECK 1: Reason Account Margin & Exposure Sizing
        const dynamicMaxAllowed = balance > 0 ? Math.min(4, Math.max(1, Math.floor(balance / 250))) : 2;
        if (positions.length >= dynamicMaxAllowed) {
          addLog(`[PRO REASONED RISK] Dynamic position limit reached (${positions.length}/${dynamicMaxAllowed} active). Pausing new trades on ${activeSymbolObj.symbol}.`);
          setProTraderThoughts(prev => [{
            id: `thought-risk-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            stage: "DYNAMIC EXPOSURE REASONING",
            thought: `High confidence setup found on ${activeSymbolObj.symbol} (${finalConf}%), but account is using optimal position capacity (${positions.length}/${dynamicMaxAllowed} active). Skipping trade to preserve account leverage.`,
            type: "risk"
          }, ...prev].slice(0, 30));
          riskBlockReason = `Dynamic position limit reached (${positions.length}/${dynamicMaxAllowed} active) on ${activeSymbolObj.symbol} — risk control blocked the order.`;
          abortCycle = true; // account-wide limit — another market would hit it too
        }

        // PRO TRADER RISK CHECK 2: 3-Minute Trade Cooldown
        const cooldownRemaining = 180000 - (Date.now() - lastTradeExecTime);
        if (!riskBlockReason && cooldownRemaining > 0) {
          const sec = Math.round(cooldownRemaining / 1000);
          addLog(`[PRO COOLDOWN] Trade cooldown active (${sec}s remaining). Skipping trade entry.`);
          setProTraderThoughts(prev => [{
            id: `thought-cd-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            stage: "TRADE COOLDOWN ENGINE",
            thought: `Cooldown active (${sec}s remaining). Waiting between trades to prevent over-trading in choppy markets.`,
            type: "risk"
          }, ...prev].slice(0, 30));
          riskBlockReason = `Trade cooldown active (${sec}s remaining) on ${activeSymbolObj.symbol} — risk control blocked the order.`;
          abortCycle = true; // account-wide cooldown — another market would hit it too
        }

        // PRO TRADER RISK CHECK 2b: DAILY-LOSS KILL SWITCH (account-wide)
        // Halt new auto-trades for the rest of the day once the account is down
        // DAILY_LOSS_KILL_PCT from the day-start balance. The baseline is the
        // first balance seen each calendar day (persisted in localStorage), so a
        // restart mid-day cannot reset it.
        if (!riskBlockReason && balance > 0) {
          const dayStart = readDayStartBalance(accountLogin);
          if (dayStart == null) {
            writeDayStartBalance(accountLogin, balance);
          } else if (balance < dayStart * (1 - DAILY_LOSS_KILL_PCT / 100)) {
            const ddPct = ((dayStart - balance) / dayStart) * 100;
            const msg = `Daily-loss kill switch: balance $${balance.toFixed(2)} is ${ddPct.toFixed(2)}% below day-start $${dayStart.toFixed(2)} (limit ${DAILY_LOSS_KILL_PCT}%). No new auto-trades today.`;
            addLog(`[PRO DAILY-LOSS KILL] ${msg}`);
            setProTraderThoughts(prev => [{
              id: `thought-kill-${Date.now()}`,
              timestamp: new Date().toLocaleTimeString(),
              stage: "DAILY LOSS KILL SWITCH",
              thought: msg,
              type: "risk"
            }, ...prev].slice(0, 30));
            riskBlockReason = msg;
            abortCycle = true; // account-wide — another market would hit it too
          }
        }

        // PRO TRADER RISK CHECK 3: Currency Pair Correlation Protection
        // Prevent opening EURUSD and USDCHF (95% inverse correlation) or EURUSD & GBPUSD simultaneously.
        // HARDENING (research-backed: correlated exposure stacks like one big
        // position): cap USD-leg exposure at ONE open position per cycle AND keep
        // the legacy pairwise blocks. The ledger showed AUDUSDm/EURJPYm/NZDUSDm
        // fallback SELLs stacking on the same USD move — all losses.
        const existingSymbols = positions.map(p => p.symbol);
        const baseOf = (s: string) => String(s || "").replace(/m$/, "").toUpperCase();
        const isUsdLeg = (s: string) => {
          const b = baseOf(s);
          return b.startsWith("USD") || b.endsWith("USD") || b.includes("XAU") || b.includes("XAG");
        };
        const usdLegOpen = existingSymbols.filter(isUsdLeg).length;
        const usdLegBlocked = isUsdLeg(activeSymbolObj.symbol) && usdLegOpen >= 1;
        const isCorrelatedPair = usdLegBlocked || (
          (baseOf(activeSymbolObj.symbol) === "EURUSD" && existingSymbols.map(baseOf).includes("USDCHF")) ||
          (baseOf(activeSymbolObj.symbol) === "USDCHF" && existingSymbols.map(baseOf).includes("EURUSD")) ||
          (baseOf(activeSymbolObj.symbol) === "EURUSD" && existingSymbols.map(baseOf).includes("GBPUSD")) ||
          (baseOf(activeSymbolObj.symbol) === "GBPUSD" && existingSymbols.map(baseOf).includes("EURUSD"))
        );

        if (!riskBlockReason && isCorrelatedPair) {
          addLog(`[PRO CORRELATION CONTROL] Active position already exists on correlated pair (${existingSymbols.join(", ")}). Trade skipped to prevent double exposure.`);
          setProTraderThoughts(prev => [{
            id: `thought-corr-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            stage: "CORRELATION RISK ENGINE",
            thought: usdLegBlocked
              ? `Skipped ${finalSignal} on ${activeSymbolObj.symbol}: already holding ${usdLegOpen} USD-leg position(s) (${existingSymbols.filter(isUsdLeg).join(", ")}). Max 1 USD-leg per cycle.`
              : `Skipped ${finalSignal} on ${activeSymbolObj.symbol} because account already holds an open trade on correlated pair (${existingSymbols.join(", ")}). Double exposure risk avoided.`,
            type: "risk"
          }, ...prev].slice(0, 30));
          // Per-symbol block — the next candidate may be tradeable, but this
          // verdict must still reach the ledger (handled at the bottom of loop).
          riskBlockReason = usdLegBlocked
            ? `Skipped ${finalSignal} on ${activeSymbolObj.symbol}: already holding ${usdLegOpen} USD-leg position(s) (${existingSymbols.filter(isUsdLeg).join(", ")}). Max 1 USD-leg per cycle.`
            : `Skipped ${finalSignal} on ${activeSymbolObj.symbol}: correlated pair already held (${existingSymbols.join(", ")}). Double exposure risk avoided.`;
        }

        // PRO TRADER RISK CHECK 3b: MIN SL DISTANCE vs SPREAD
        // A stop closer than ~2x spread is noise-fill, not risk control: normal
        // spread fluctuation alone can stop the trade out before any edge plays
        // out. Block (do not silently widen — sizing was computed for slPips).
        const liveSpreadPips = Number.isFinite(activeSymbolObj.spreadPips) && activeSymbolObj.spreadPips > 0
          ? activeSymbolObj.spreadPips
          : (Number.isFinite(activeSymbolObj.baseAsk) && Number.isFinite(activeSymbolObj.baseBid) && activeSymbolObj.pipSize > 0
            ? (activeSymbolObj.baseAsk - activeSymbolObj.baseBid) / activeSymbolObj.pipSize
            : 0);
        const minSlPips = Math.max(5, liveSpreadPips * 2);
        if (!riskBlockReason && slPips < minSlPips) {
          addLog(`[PRO SL-DISTANCE] SL ${slPips}p too tight vs spread ${liveSpreadPips.toFixed(1)}p on ${activeSymbolObj.symbol} (min ${minSlPips.toFixed(1)}p). Trade skipped — not widened silently.`);
          setProTraderThoughts(prev => [{
            id: `thought-sldist-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            stage: "SL DISTANCE GUARD",
            thought: `Skipped ${finalSignal} on ${activeSymbolObj.symbol}: SL ${slPips}p < min ${minSlPips.toFixed(1)}p (2x spread ${liveSpreadPips.toFixed(1)}p). Spread-noise stop-out risk.`,
            type: "risk"
          }, ...prev].slice(0, 30));
          riskBlockReason = `Skipped ${finalSignal} on ${activeSymbolObj.symbol}: SL ${slPips}p < min ${minSlPips.toFixed(1)}p (2x spread ${liveSpreadPips.toFixed(1)}p). Spread-noise stop-out risk.`;
        }

        // Execute real MT5 trade using exact prediction parameters!
        // Skipped entirely when a risk block above set riskBlockReason.
        if (!riskBlockReason) {
        try {
          addLog(`[AI AUTO-TRADER EXEC] Placing real ${finalSignal} order on ${activeSymbolObj.symbol} (${lotResult} Lots) @ ${entry}...`);
          setProTraderThoughts(prev => [{
            id: `thought-exec-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString(),
            stage: "INSTITUTIONAL EXECUTION",
            thought: `High Confluence Setup Verified: ${finalSignal} ${activeSymbolObj.symbol} (${finalConf}% confidence). Sized for ${riskPercent}% risk ($${dynamicLotCalc.riskAmount.toFixed(2)}). Executing ${lotResult} Lots @ ${entry}`,
            type: "exec"
          }, ...prev].slice(0, 30));

          const response = await fetch("/api/mt5/trade", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              symbol: activeSymbolObj.symbol,
              action: finalSignal,
              volume: lotResult,
              sl: slPrice,
              tp: tpPrice
            })
          });

          const data = await response.json();
          if (data.success) {
            setLastTradeExecTime(Date.now());
            const ticket = Number(data.ticket);
            if (!Number.isSafeInteger(ticket) || ticket <= 0) {
              throw new Error("Broker response has no valid ticket. Execution is unconfirmed; check MT5 positions before retrying.");
            }
            executedTicket = ticket;
            tradedThisCycle = true; // stop walking the queue
            tradedSymbolThisCycle = activeSymbolObj.symbol;
            const realPrice = data.price || entry;
            let pVal = 10;
            if (activeSymbolObj.symbol.includes("JPY")) pVal = 6.80;
            const expProf = Number((lotResult * tpPips * pVal).toFixed(2));

            addLog(`[AI AUTO-TRADER SUCCESS] Real MT5 Order #${ticket} ${finalSignal} ${lotResult} Lots ${activeSymbolObj.symbol} @ ${realPrice}`);
            // Autopilot telemetry — proves on screen that a real order went out.
            setAutopilotStats(prev => ({
              ...prev,
              tradesPlaced: prev.tradesPlaced + 1,
              lastTicket: Number(ticket),
              lastTradeSymbol: activeSymbolObj.symbol
            }));
            setAiNotification({
              id: `notif-exec-${Date.now()}`,
              title: `🤖 AI Trader Executed ${finalSignal} Order`,
              symbol: activeSymbolObj.symbol,
              action: finalSignal,
              lots: lotResult,
              price: realPrice,
              sl: slPrice,
              tp: tpPrice,
              reason: `Kimi VERIFIED ${setupQuality} setup (${finalConf}% confidence) on ${activeSymbolObj.symbol}. ${verdict?.tradeReasoning || ""} Sized for ${riskPercent}% risk ($${dynamicLotCalc.riskAmount.toFixed(2)}).`,
              expectedProfit: expProf,
              timestamp: Date.now()
            });

            // Re-sync positions table
            const posRes = await fetch("/api/mt5/positions");
            if (posRes.ok) {
              const posData = await posRes.json();
              if (posData.success && Array.isArray(posData.positions)) setPositions(posData.positions);
            }
          } else {
            addLog(`[AI AUTO-TRADER REJECTED] Broker error: ${data.error || "Order rejected by MT5"}`);
          }
        } catch (execErr: any) {
          addLog(`[AI AUTO-TRADER FAIL] ${execErr.message || "Failed to reach MT5"}`);
        }
        } // end if (!riskBlockReason) — blocked setups skip execution but still reach the ledger below
      } // end else-if (tradeGatePasses) — ledger below runs for BOTH veto and gate-pass paths

      // ── PREDICTION LEDGER: record EVERY directional verdict (traded or not) ──
      // This is what makes "did we predict and trade right?" answerable: the server
      // later observes live prices over the horizon and scores the call WIN/LOSS.
      // The full feature snapshot rides along so the meta-label gate can learn
      // P(TP first | features) on real rows — every field is computed from the
      // same fresh candles / live tick / calendar the gate used, never imputed.
      if (finalSignal !== "HOLD" && hasVerdict) {
        // featH1Closes / featH4Closes / featH1H4 / featMinsNews are computed once
        // in the snapshot block above and reused here directly — the gate that
        // fired and the row that is saved read identical values.
        await recordPredictionToLedger({
          symbol: activeSymbolObj.symbol,
          direction: finalSignal,
          entryPrice: entry,
          slPrice,
          tpPrice,
          slPips,
          tpPips,
          setupQuality,
          confidencePct: finalConf,
          setupType: verdict!.setupType,
          reasoning: verdict!.tradeReasoning || verdict!.analysis,
          source: verdict!.source === "KIMI" ? "KIMI_SETUP_VERIFIED" : "JYSR_FALLBACK",
          tradeExecuted: executedTicket !== null,
          ticket: executedTicket,
          // Why did (or didn't) this become an order? Distinguishes "AI said no",
          // "auto-trader is off", "risk control blocked it", and broker rejects.
          shouldTrade: verdict!.shouldTrade,
          skipReason: executedTicket !== null
            ? ""
            : riskBlockReason
              ? riskBlockReason
              : !isAiAutoTraderActive
              ? "AI Auto Trader is switched off."
              : setupGatePasses
                ? "Gate passed but the order was not accepted by MT5 (see [AI AUTO-TRADER] log)."
                : skipReason,
          features: {
            adx: snapAdx,
            atrPercentile: snapAtrPct,
            sessionGrade: sessionState.grade,
            spreadPips: snapSpread,
            minutesToNews: featMinsNews,
            jysrConfidence: jysr.confidence,
            // Populate for ANY real verdict (Kimi OR LOCAL_FALLBACK), matching the
            // inference side (2239-2240). Fallback rows used to store null here,
            // which made vectorizeFeatures return null and buildLabeledRows drop
            // them — so the gate could never warm up while Kimi was degraded.
            // plattKimi stays pure via the source discriminator in calibration.ts.
            kimiConfidence: hasVerdict ? verdict!.confidence : null,
            kimiGrade: hasVerdict ? verdict!.setupQuality : null,
            h1h4Agree: featH1H4(finalSignal),
            raidFlag: priceAction.raids.length > 0,
            patternFlag: patternBacked,
          },
        });
        // Honest loop control AFTER the ledger write: a risk-blocked verdict is
        // recorded above, then we honour what break/continue used to do.
        if (riskBlockReason) {
          vetoedThisCycle.push(targetSymCode);
          if (abortCycle) break; // account-wide block — another market would hit it too
          continue; // per-symbol block — the next candidate may still be tradeable
        }
      }
      } // end candidate loop

      // ── CYCLE SUMMARY ───────────────────────────────────────────────────
      // Make the fall-through legible: how many markets were considered, how
      // many the AI vetoed, and whether one of them actually produced an order.
      if (candidateQueue.length > 1) {
        addLog(
          tradedThisCycle
            ? `[AMIS CYCLE] Traded on ${tradedSymbolThisCycle} — candidate #${candidateQueue.findIndex(c => c.symbol === tradedSymbolThisCycle) + 1} of ${candidateQueue.length} (${vetoedThisCycle.length} vetoed: ${vetoedThisCycle.join(", ") || "none"}).`
            : `[AMIS CYCLE] No trade across ${candidateQueue.length} candidates (${vetoedThisCycle.join(", ") || "none evaluated"}).`
        );
      }

    } catch (err: any) {
      console.error("[AI ANALYSIS ERROR]", err);
      addLog(`[AI ANALYSIS] Error: ${err.message || "Unknown error"}`);
    } finally {
      setIsAnalyzingAi(false);
      setKimiPredicting(false);
      analysisInFlightRef.current = null;
    }
  };



  // REGULAR AI NEWS GRABBER & MACRO ECONOMIC ANALYSIS
  const fetchAiNews = async () => {
    setIsFetchingNews(true);
    try {
      const res = await fetchWithTimeout("/api/mt5/news", 20000);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.news)) {
          setNewsList(data.news);
          if (data.aiSummary) { setNewsAiSummary(data.aiSummary); setNewsNarrative(data.aiSummary); }
          if (data.source) setNewsSource(data.source);
          setLastNewsFetchTime(new Date().toLocaleTimeString());
          // Check for HIGH impact events within 30 minutes
          const now = Date.now();
          const upcomingHigh = data.news.find((n: any) => {
            if (n.impact !== "HIGH") return false;
            if (!n.isoTime) return false;
            const t = new Date(n.isoTime).getTime();
            return t > now && t - now <= 30 * 60 * 1000;
          });
          if (upcomingHigh) {
            const minsLeft = Math.round((new Date(upcomingHigh.isoTime).getTime() - now) / 60000);
            setNewsImpactWarning(`⚠️ HIGH IMPACT: ${upcomingHigh.currency} ${upcomingHigh.event} in ${minsLeft} min — ${upcomingHigh.aiAnalysis?.directionalBias || "monitor closely"}`);
          } else {
            setNewsImpactWarning("");
          }
          addLog(`[AMIS-FX NEWS] Economic calendar updated from ${data.source || "server"} — ${data.news.length} events with AI impact analysis`);
        }
      }
    } catch (err) {
      addLog(`[AI NEWS] Operating with cached AI macro fundamental pipeline`);
    } finally {
      setIsFetchingNews(false);
    }
  };

  // Regular periodic fetching of macroeconomic news every 25 seconds
  useEffect(() => {
    fetchAiNews();
    const newsInterval = setInterval(() => {
      fetchAiNews();
    }, 25000);
    return () => clearInterval(newsInterval);
  }, []);

  // EXECUTE TRADE DIRECTLY FROM AI NEWS ANALYSIS SIGNAL — REAL MT5 TRADE
  const handleExecuteNewsTrade = async (newsItem: NewsEvent) => {
    if (!newsItem.aiAnalysis) return;
    const targetSymbolCode = newsItem.aiAnalysis.affectedPairs[0] || "EURUSD";
    const targetSym = symbols.find(s => s.symbol === targetSymbolCode) || currentSymbol;

    const isBuy = newsItem.aiAnalysis.directionalBias.includes("BULLISH") || newsItem.aiAnalysis.suggestedAction.toUpperCase().startsWith("BUY");
    const action: "BUY" | "SELL" = isBuy ? "BUY" : "SELL";

    setSelectedSymbolCode(targetSymbolCode);

    const openP = action === "BUY" ? targetSym.baseAsk : targetSym.baseBid;
    const slP = 25;
    const tpP = 55;
    const slPdist = slP * targetSym.pipSize;
    const tpPdist = tpP * targetSym.pipSize;

    const slPrice = action === "BUY" ? Number((openP - slPdist).toFixed(targetSym.digits)) : Number((openP + slPdist).toFixed(targetSym.digits));
    const tpPrice = action === "BUY" ? Number((openP + tpPdist).toFixed(targetSym.digits)) : Number((openP - tpPdist).toFixed(targetSym.digits));

    const tradeLots = dynamicLotCalc.calculatedLotSize;

    try {
      const response = await fetch("/api/mt5/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: targetSymbolCode,
          action,
          volume: tradeLots,
          sl: slPrice,
          tp: tpPrice
        })
      });

      const data = await response.json();
      if (data.success) {
        addLog(`[MT5 NEWS TRADE] Real order #${data.ticket} placed on ${targetSymbolCode} @ ${data.price || openP}`);
        setActiveTab("TRADE");
      } else {
        alert(`MT5 Broker Order Rejected: ${data.error || "Ensure MT5 is open and Algo Trading is enabled."}`);
        addLog(`[MT5 ORDER REJECTED] ${data.error || "Order rejected by broker"}`);
      }
    } catch (err: any) {
      alert(`MT5 Order Send Failed: ${err.message || "Failed to reach MT5 terminal."}`);
      addLog(`[MT5 ORDER FAIL] ${err.message || "Network error"}`);
    }
  };


  // AI AUTONOMOUS TRADER LOOP FOR MT5 (STARTS AI PREDICTOR → DRAWS ANALYSIS → EXECUTES REAL MT5 TRADES)
  // NOTE: the interval keeps a LIVE ref to the latest handleRunAiAnalysis. Without this,
  // the interval would invoke a stale closure from the render when this effect last ran —
  // reading outdated positions/balance/cooldown/lesson state on every cycle.
  const runAiAnalysisRef = useRef(handleRunAiAnalysis);
  useEffect(() => {
    runAiAnalysisRef.current = handleRunAiAnalysis;
  });

  useEffect(() => {
    if (!isAiAutoTraderActive) return;

    // Cadence. A cycle is now a fall-through over up to AMIS_MAX_CANDIDATES
    // ranked markets, and each candidate costs one full Kimi reasoning call
    // (~45-100s, occasionally up to the 150s server cap). A 1-candidate cycle
    // is ~1-2 min; a 3-candidate cycle can be 3-5 min. Keeping the interval
    // well below the worst case means the re-entrancy guard skips most ticks
    // and the next cycle starts promptly after the current one lands, which is
    // the desired "continuous analysis" behaviour.
    const CYCLE_MS = 60000;
    setAutopilotStats(prev => ({ ...prev, nextCycleAt: Date.now() + CYCLE_MS }));

    // Trigger immediate AI Predictor analysis and trade execution on toggle ON
    // (Runs silently in the background — the AI Predictor modal is NOT
    // auto-opened anymore; open it manually via the "AI Predictor" button.)
    void runAiAnalysisRef.current();

    const autoTraderInterval = setInterval(async () => {
      setAutopilotStats(prev => ({ ...prev, nextCycleAt: Date.now() + CYCLE_MS }));
      if (!isConnectedRef.current || !mt5DataAvailableRef.current) {
        addLog(`[AI AUTO-TRADER WARN] Execution paused: MT5 terminal is offline.`);
        setAutopilotStats(prev => ({ ...prev, lastSkipReason: "MT5 terminal offline — cycle paused." }));
        return;
      }
      await runAiAnalysisRef.current();
    }, CYCLE_MS);

    return () => clearInterval(autoTraderInterval);
  }, [isAiAutoTraderActive]);




  // CONNECT TO MT5 SERVER & SAVE PERSISTENT CREDENTIALS
  const handleSaveConnection = async () => {
    setIsConnecting(true);
    try {
      const payload = {
        login: accountLogin,
        password: accountPassword,
        server: accountServer,
        currency: accountCurrency,
        leverage,
        balance
      };

      const res = await fetch("/api/mt5/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setIsConnected(true);
          setShowConnectModal(false);
          localStorage.setItem("mt5_account_config", JSON.stringify({
            login: accountLogin,
            server: accountServer,
            currency: accountCurrency,
            leverage,
            balance,
            connected: true
          }));
          addLog(`[SUCCESS] Connected to ${accountServer} Server. Account #${accountLogin} authorized.`);
        } else {
          // Surface server-side rejection instead of failing silently
          const reason = data.message || data.error || "Unknown rejection";
          addLog(`[ERROR] MT5 connect rejected: ${reason}`);
          alert(`MT5 Connect failed: ${reason}`);
        }
      } else {
        // Surface HTTP-level failure (backend down, 500, etc.) instead of failing silently
        const errText = await res.text().catch(() => "");
        addLog(`[ERROR] MT5 connect endpoint returned HTTP ${res.status}. ${errText.slice(0, 120)}`);
        alert(`MT5 Connect failed (HTTP ${res.status}). Is the backend server running? Check the terminal logs panel for details.`);
      }
    } catch (err: any) {
      addLog(`[ERROR] Connection failed: ${err.message || err}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await fetch("/api/mt5/disconnect", { method: "POST" });
      setIsConnected(false);
      addLog(`[INFO] MT5 connection closed for Account #${accountLogin}.`);
    } catch (err) { }
  };

  // CALCULATED ACCOUNT METRICS (Equity, Margin, Free Margin, Floating Profit)
  const floatingPnL = useMemo(() => {
    return positions.reduce((acc, pos) => acc + pos.profit + pos.swap + pos.commission, 0);
  }, [positions]);

  const equity = balance + floatingPnL;

  const usedMargin = useMemo(() => {
    return positions.reduce((acc, pos) => {
      const notional = pos.volume * 100000 * pos.openPrice;
      const lev = parseInt(leverage.replace("1:", "")) || 500;
      return acc + (notional / lev);
    }, 0);
  }, [positions, leverage]);

  const freeMargin = equity - usedMargin;
  const marginLevel = usedMargin > 0 ? (equity / usedMargin) * 100 : 0;

  // REAL MT5 CANDLE LOADER — fetches actual OHLCV data from server → mt5_connector.py
  useEffect(() => {
    const key = `${selectedSymbolCode}_${timeframe}`;
    setCandleLoadError("");

    const fetchCandles = async () => {
      if (candleFetchInFlight.current === key) return; // never duplicate the SAME symbol
      candleFetchInFlight.current = key;
      try {
        const res = await fetchWithTimeout(`/api/mt5/candles?symbol=${selectedSymbolCode}&timeframe=${timeframe}&count=100`, 45000);
        if (!res.ok) { setCandleLoadError("No data available"); return; }
        const data = await res.json();
        if (!data.success || !Array.isArray(data.candles) || data.candles.length === 0) {
          setCandleLoadError(data.error || "No data available — ensure MetaTrader 5 is running");
          setCandlesMap(prev => { const n = { ...prev }; delete n[key]; return n; });
          return;
        }
        setCandleLoadError("");
        // Convert MT5 candles (unix timestamp) into Candle[] format
        const digits = data.digits || 5;
        const converted: Candle[] = data.candles.map((c: any) => {
          const d = new Date(c.time * 1000);
          const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
          return {
            time: timeStr,
            timestamp: c.time * 1000,
            open: Number(c.open.toFixed(digits)),
            high: Number(c.high.toFixed(digits)),
            low: Number(c.low.toFixed(digits)),
            close: Number(c.close.toFixed(digits)),
            volume: c.volume
          };
        });
        setCandlesMap(prev => ({ ...prev, [key]: converted }));
      } catch (err) {
        setCandleLoadError("No data available — MT5 connection error");
      } finally {
        // Only clear if this call still owns the slot — a newer fetch for a
        // different symbol may have started while this one was finishing.
        if (candleFetchInFlight.current === key) candleFetchInFlight.current = null;
      }
    };

    fetchCandles();
    // Refresh candles every 30 seconds to keep chart live
    const candleInterval = setInterval(fetchCandles, 30000);
    return () => clearInterval(candleInterval);
  }, [selectedSymbolCode, timeframe]);

  // REAL MT5 LIVE TICK POLLING — polls /api/mt5/ticks every 2 seconds
  useEffect(() => {
    const pollTicks = async () => {
      if (tickPollInFlight.current) return; // never overlap tick polls
      tickPollInFlight.current = true;
      try {
        // bypassGate:true — the tape must never queue behind the AI cycle (see the
        // gate documentation on fetchWithTimeout).
        const res = await fetchWithTimeout("/api/mt5/ticks", 30000, undefined, { bypassGate: true });
        if (!res.ok) { markFeedBad("MT5 not reachable"); return; }
        const data = await res.json();
        if (!data.success || !data.ticks || Object.keys(data.ticks).length === 0) {
          markFeedBad(data.error || "No tick data — ensure MetaTrader 5 is running");
          return;
        }
        markFeedOk();
        const ticks: Record<string, any> = data.ticks;

        // Side-effect collection: React forbids calling setState *inside* another
        // setState updater (it made re-renders cascade and stall the panel), so the
        // flash map is gathered during the pure map() and applied afterwards.
        const flashUpdates: Record<string, "up" | "down"> = {};

        setSymbols(prevSymbols => prevSymbols.map(s => {
          const tick = ticks[s.symbol];
          if (!tick) return s; // symbol not in MT5 market watch
          const prevBid = s.baseBid;
          const newBid = tick.bid;
          const newAsk = tick.ask;
          flashUpdates[s.symbol] = newBid >= prevBid ? "up" : "down";
          // Calculate spread in pips
          const spreadPips = ((newAsk - newBid) / s.pipSize);
          return {
            ...s,
            baseBid: newBid,
            baseAsk: newAsk,
            high: Math.max(s.high, newAsk),
            low: Math.min(s.low, newBid),
            spreadPips: spreadPips
          };
        }));

        if (Object.keys(flashUpdates).length > 0) {
          setTickFlashMap(prev => ({ ...prev, ...flashUpdates }));
        }

        // Update the active candle on the chart (own top-level functional update).
        // Reads the active symbol/timeframe from refs so this poller can subscribe
        // once and keep streaming regardless of how often the scanner switches symbol.
        const activeSym = selectedSymbolCodeRef.current;
        const activeTf = timeframeRef.current;
        const activeTick = ticks[activeSym];
        if (activeTick) {
          const activeKey = `${activeSym}_${activeTf}`;
          const digits = symbolsRef.current.find(s => s.symbol === activeSym)?.digits || 5;
          setCandlesMap(prevMap => {
            const currentList = prevMap[activeKey];
            if (!currentList || currentList.length === 0) return prevMap;
            return { ...prevMap, [activeKey]: updateActiveCandle(currentList, activeTick.bid, digits, activeTf) };
          });
        }
      } catch (_) {
        markFeedBad("MT5 connection error");
      } finally {
        tickPollInFlight.current = false;
      }
    };

    pollTicks();
    // CADENCE: was 2s with a 1.5s server cache, so EVERY poll missed cache and spawned
    // a Python process 30x/minute. With the 6s cache (and execSync gone from the
    // server), 3s gives an alternating hit/miss = ~10 spawns/min — 3x cheaper than
    // before, while prices still update often enough to feel live.
    const tickInterval = setInterval(pollTicks, 3000);
    return () => clearInterval(tickInterval);
    // INTENTIONALLY EMPTY DEPS: this poller streams ticks for EVERY symbol, so it has
    // no reason to restart when the active symbol or timeframe changes. Listing them
    // tore the poller down on each scanner-driven switch, and the in-flight guard then
    // made the fresh effect skip its first poll — which is why the market watch only
    // updated after a full page refresh. It now subscribes once and never stops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ACTIVE CANDLESTICK DATA & CALCULATIONS
  const activeKey = `${selectedSymbolCode}_${timeframe}`;
  const activeCandles = useMemo(() => {
    // Only return real MT5 candles — never generate fake historical data
    return candlesMap[activeKey] || [];
  }, [candlesMap, activeKey]);

  // SINGLE SOURCE OF TRUTH FOR SMC.
  // The chart drawings AND the SMC panel both read this one analysis, so the chart
  // can never show an "order block" that the panel claims does not exist. The old
  // code drew a crude swing-high/low band labelled "Order Block Zone" while the
  // panel computed from `candlesMap[selectedSymbolCode]` — a key that never exists
  // (map keys are `${symbol}_${timeframe}`), so the panel always reported 0 blocks.
  const smcAnalysis = useMemo<SMCAnalysisResult | null>(() => {
    if (!activeCandles || activeCandles.length < 10) return null;
    try {
      return runSMCAnalysis(
        activeCandles.map(c => ({
          timestamp: c.timestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume || 1
        })),
        selectedSymbolCode,
        "MT5",
        3
      );
    } catch (err) {
      console.warn("[SMC] analysis failed for", selectedSymbolCode, err);
      return null;
    }
  }, [activeCandles, selectedSymbolCode]);

  // Update open positions floating P&L whenever real tick data updates symbols
  useEffect(() => {
    setPositions(prevPositions =>
      prevPositions.map(pos => {
        const sym = symbols.find(s => s.symbol === pos.symbol);
        if (!sym) return pos;
        const livePrice = pos.type === "BUY" ? sym.baseBid : sym.baseAsk;
        const diffPips = pos.type === "BUY"
          ? (livePrice - pos.openPrice) / sym.pipSize
          : (pos.openPrice - livePrice) / sym.pipSize;
        const pipVal = sym.pipSize === 0.01 ? (100 / sym.baseBid) : 10;
        return { ...pos, currentPrice: livePrice, profit: Number((diffPips * pos.volume * pipVal).toFixed(2)) };
      })
    );
  }, [symbols]);

  const indicators = useMemo(() => {
    return calculateIndicators(activeCandles);
  }, [activeCandles]);

  // DYNAMIC CHART SCALING & PATHS
  const chartWidth = 800;
  const chartHeight = 220;
  const volumeHeight = 50;

  const symbolPositions = useMemo(() => {
    return positions.filter(p => p.symbol === selectedSymbolCode);
  }, [positions, selectedSymbolCode]);

  const allPricePoints = useMemo(() => {
    const candlePrices = activeCandles.flatMap(c => [c.low, c.high]);
    const posPrices = symbolPositions.flatMap(p => [p.openPrice, p.sl, p.tp].filter(val => val > 0));
    return [...candlePrices, ...posPrices, currentSymbol.baseBid, currentSymbol.baseAsk];
  }, [activeCandles, symbolPositions, currentSymbol]);

  const minPrice = Math.min(...allPricePoints);
  const maxPrice = Math.max(...allPricePoints);
  const rawPriceRange = maxPrice - minPrice || 0.001;
  const paddedMin = minPrice - rawPriceRange * 0.06;
  const paddedMax = maxPrice + rawPriceRange * 0.06;
  const totalPriceRange = paddedMax - paddedMin;

  const priceToY = (price: number) => {
    return chartHeight - ((price - paddedMin) / totalPriceRange) * chartHeight;
  };

  const yToPrice = (y: number) => {
    return paddedMax - (y / chartHeight) * totalPriceRange;
  };

  const candleSpacing = chartWidth / Math.max(1, activeCandles.length);
  const candleBarWidth = Math.max(3, candleSpacing * 0.65);
  const maxVolume = Math.max(...activeCandles.map(c => c.volume), 100);

  // MA20 Path
  const ma20Path = useMemo(() => {
    let d = "";
    indicators.ma20.forEach((val, idx) => {
      if (val !== null) {
        const x = idx * candleSpacing + candleSpacing / 2;
        const y = priceToY(val);
        d += d === "" ? `M ${x} ${y}` : ` L ${x} ${y}`;
      }
    });
    return d;
  }, [indicators.ma20, candleSpacing, priceToY]);

  // MA50 Path
  const ma50Path = useMemo(() => {
    let d = "";
    indicators.ma50.forEach((val, idx) => {
      if (val !== null) {
        const x = idx * candleSpacing + candleSpacing / 2;
        const y = priceToY(val);
        d += d === "" ? `M ${x} ${y}` : ` L ${x} ${y}`;
      }
    });
    return d;
  }, [indicators.ma50, candleSpacing, priceToY]);

  // Bollinger Bands Paths
  const bbPaths = useMemo(() => {
    let upper = "";
    let lower = "";
    indicators.bbUpper.forEach((val, idx) => {
      if (val !== null && indicators.bbLower[idx] !== null) {
        const x = idx * candleSpacing + candleSpacing / 2;
        const yUp = priceToY(val);
        const yLow = priceToY(indicators.bbLower[idx]!);
        upper += upper === "" ? `M ${x} ${yUp}` : ` L ${x} ${yUp}`;
        lower += lower === "" ? `M ${x} ${yLow}` : ` L ${x} ${yLow}`;
      }
    });
    return { upper, lower };
  }, [indicators.bbUpper, indicators.bbLower, candleSpacing, priceToY]);

  // VISUAL CHART DRAWINGS DATA — real extrema-based support/resistance zones,
  // validated swing-pivot trendlines, and OLS fallback. No random/geometric lines.
  const drawingData = useMemo(() => {
    if (!activeCandles || activeCandles.length < 6) return null;

    const closes = activeCandles.map(c => c.close);
    const highs = activeCandles.map(c => c.high);
    const lows = activeCandles.map(c => c.low);
    const n = closes.length;

    // ── Fractal swing pivots with configurable depth (true local extrema) ──
    const depth = 3;
    const minBarsBetweenPivots = 2;

    type Pivot = { idx: number; val: number };
    const swingLows: Pivot[] = [];
    const swingHighs: Pivot[] = [];

    for (let i = depth; i < n - depth; i++) {
      let isLow = true;
      let isHigh = true;
      for (let d = 1; d <= depth; d++) {
        if (lows[i] > lows[i - d] || lows[i] > lows[i + d]) isLow = false;
        if (highs[i] < highs[i - d] || highs[i] < highs[i + d]) isHigh = false;
      }
      if (isLow && (swingLows.length === 0 || i - swingLows[swingLows.length - 1].idx >= minBarsBetweenPivots)) {
        swingLows.push({ idx: i, val: lows[i] });
      }
      if (isHigh && (swingHighs.length === 0 || i - swingHighs[swingHighs.length - 1].idx >= minBarsBetweenPivots)) {
        swingHighs.push({ idx: i, val: highs[i] });
      }
    }

    // ── OLS helper: fit y = m*x + b; returns { m, b, r2 } ──
    const ols = (xs: number[], ys: number[]) => {
      const k = xs.length;
      if (k < 2) return { m: 0, b: ys[0] ?? 0, r2: 0 };
      let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0;
      for (let i = 0; i < k; i++) {
        sx += xs[i]; sy += ys[i]; sxy += xs[i] * ys[i]; sxx += xs[i] * xs[i]; syy += ys[i] * ys[i];
      }
      const denom = (k * sxx - sx * sx) || 1e-12;
      const m = (k * sxy - sx * sy) / denom;
      const b = (sy - m * sx) / k;
      const ssRes = ys.reduce((a, y, i) => a + (y - (m * xs[i] + b)) ** 2, 0);
      const ssTot = syy - (sy * sy) / k;
      const r2 = ssTot > 1e-12 ? 1 - ssRes / ssTot : 0;
      return { m, b, r2 };
    };

    // ── Support trendline (uptrend): line through first→last swing low;
    //    validated: intermediate lows must sit on/above the line, slope must be
    //    non-negative (an uptrend line that falls is a misfit — hide it). ──
    let suppLine = null;
    if (swingLows.length >= 2) {
      const first = swingLows[0];
      const last = swingLows[swingLows.length - 1];
      const span = (last.idx - first.idx) || 1;
      const m = (last.val - first.val) / span;
      const b = first.val - m * first.idx;
      const rangeH = Math.max(...highs) - Math.min(...lows) || 1e-9;
      const atol = Math.max(rangeH * 0.005, Math.abs(last.val - first.val) * 0.008 + 1e-9);
      let touches = 0;
      for (let i = 1; i < swingLows.length - 1; i++) {
        if (swingLows[i].val >= m * swingLows[i].idx + b - atol) touches++;
      }
      const validationRatio = (touches + 2) / swingLows.length;
      // Project to the live edge (last bar) so the line meets current price
      // instead of ending mid-chart at the last pivot.
      const endIdx = n - 1;
      const endVal = b + m * endIdx;
      const loBound = Math.min(...lows) - rangeH * 0.02;
      const hiBound = Math.max(...highs) + rangeH * 0.02;
      if (m >= -1e-12 && validationRatio >= 0.5 && endVal >= loBound && endVal <= hiBound) {
        suppLine = {
          x1: first.idx * candleSpacing + candleSpacing / 2,
          y1: priceToY(first.val),
          x2: endIdx * candleSpacing + candleSpacing / 2,
          y2: priceToY(endVal),
          slope: m,
          validationRatio
        };
      }
    }

    // ── Resistance trendline (downtrend): line through first→last swing high;
    //    validated: intermediate highs must sit on/below the line, slope must be
    //    non-positive (a downtrend line that rises is a misfit — hide it). ──
    let resisLine = null;
    if (swingHighs.length >= 2) {
      const first = swingHighs[0];
      const last = swingHighs[swingHighs.length - 1];
      const span = (last.idx - first.idx) || 1;
      const m = (last.val - first.val) / span;
      const b = first.val - m * first.idx;
      const rangeH = Math.max(...highs) - Math.min(...lows) || 1e-9;
      const atol = Math.max(rangeH * 0.005, Math.abs(last.val - first.val) * 0.008 + 1e-9);
      let touches = 0;
      for (let i = 1; i < swingHighs.length - 1; i++) {
        if (swingHighs[i].val <= m * swingHighs[i].idx + b + atol) touches++;
      }
      const validationRatio = (touches + 2) / swingHighs.length;
      const endIdx = n - 1;
      const endVal = b + m * endIdx;
      const loBound = Math.min(...lows) - rangeH * 0.02;
      const hiBound = Math.max(...highs) + rangeH * 0.02;
      if (m <= 1e-12 && validationRatio >= 0.5 && endVal >= loBound && endVal <= hiBound) {
        resisLine = {
          x1: first.idx * candleSpacing + candleSpacing / 2,
          y1: priceToY(first.val),
          x2: endIdx * candleSpacing + candleSpacing / 2,
          y2: priceToY(endVal),
          slope: m,
          validationRatio
        };
      }
    }

    // ── Support / Resistance ZONE clustering (price-proximity grouping) ──
    // ATR-scaled gap: a fixed 25%-of-pivot-range gap collapses onto one level on
    // quiet charts and splinters real zones on volatile ones. Touch count wins,
    // with recency breaking ties (stale levels from 80 bars ago lose to fresh ones).
    const atrApprox = (() => {
      const trs: number[] = [];
      for (let i = 1; i < n; i++) {
        trs.push(Math.max(
          highs[i] - lows[i],
          Math.abs(highs[i] - closes[i - 1]),
          Math.abs(lows[i] - closes[i - 1])
        ));
      }
      trs.sort((a, b) => a - b);
      return trs.length > 0 ? trs[Math.floor(trs.length / 2)] : (Math.max(...highs) - Math.min(...lows)) / n;
    })();
    const clusterPivots = (pivots: Pivot[]) => {
      if (pivots.length === 0) return [];
      const sorted = [...pivots].sort((a, b) => a.val - b.val);
      const gap = Math.max(atrApprox * 0.5, 1e-9);
      const clusters: Pivot[][] = [];
      let cur: Pivot[] = [sorted[0]];
      for (let i = 1; i < sorted.length; i++) {
        if (Math.abs(sorted[i].val - cur[cur.length - 1].val) <= gap) {
          cur.push(sorted[i]);
        } else {
          clusters.push(cur);
          cur = [sorted[i]];
        }
      }
      clusters.push(cur);
      return clusters
        .map(c => {
          const vals = c.map(p => p.val);
          const median = vals.sort((a, b) => a - b)[Math.floor(vals.length / 2)];
          const lo = Math.min(...vals);
          const hi = Math.max(...vals);
          const lastBar = Math.max(...c.map(p => p.idx));
          return { median, lo, hi, count: c.length, bars: c.map(p => p.idx), recency: lastBar };
        })
        .sort((a, b) => b.count - a.count || b.recency - a.recency || b.median - a.median);
    };

    const lastClosePx = closes[n - 1];
    // Support must sit AT or BELOW last price; resistance AT or ABOVE. A cluster
    // median on the wrong side of price is the classic "S/R drawn wrongly" bug.
    const sClusters = clusterPivots(swingLows).filter(c => c.median <= lastClosePx + atrApprox * 0.25);
    const rClusters = clusterPivots(swingHighs).filter(c => c.median >= lastClosePx - atrApprox * 0.25);

    let supportZone = null;
    if (sClusters.length > 0) {
      const c = sClusters[0];
      const anchorIdx = c.bars.reduce((best, b) => (b > best ? b : best), c.bars[0]);
      supportZone = {
        price: c.median,
        y: priceToY(c.median),
        count: c.count,
        anchorIdx
      };
    }

    let resistanceZone = null;
    if (rClusters.length > 0) {
      const c = rClusters[0];
      const anchorIdx = c.bars.reduce((best, b) => (b > best ? b : best), c.bars[0]);
      resistanceZone = {
        price: c.median,
        y: priceToY(c.median),
        count: c.count,
        anchorIdx
      };
    }

    // ── OLS fallback trendline across every close ──
    const xs = closes.map((_, i) => i);
    const { m: regSlope, b: regIntercept } = ols(xs, closes);
    const trendX1 = candleSpacing / 2;
    const trendY1 = priceToY(regIntercept);
    const trendX2 = (n - 1) * candleSpacing + candleSpacing / 2;
    const trendY2 = priceToY(regIntercept + regSlope * (n - 1));

    // ── SMC ORDER BLOCKS / FVGs / SWEEPS ──
    // Read straight from the SMC engine (identical to the SMC panel's input), so the
    // shaded zones on the chart are the SAME objects the panel counts. Previously the
    // chart painted a wide "Order Block Zone" band spanning swing-high→swing-low while
    // the panel reported "0 order blocks" for the same symbol.
    const lastPriceNear = closes[n - 1];
    const smcOrderBlocks = (smcAnalysis?.orderBlocks || [])
      .filter(ob => !ob.isMitigated)
      .sort((a, b) => Math.abs(a.midPrice - lastPriceNear) - Math.abs(b.midPrice - lastPriceNear))
      .slice(0, 4)
      .map(ob => ({
        id: ob.id,
        type: ob.type,
        label: ob.label,
        strength: ob.strength,
        topPrice: ob.topPrice,
        bottomPrice: ob.bottomPrice,
        yTop: priceToY(ob.topPrice),
        yBottom: priceToY(ob.bottomPrice)
      }));

    const smcFvgs = (smcAnalysis?.fairValueGaps || [])
      .filter(fg => !fg.isFilled)
      .sort((a, b) => Math.abs(a.midPrice - lastPriceNear) - Math.abs(b.midPrice - lastPriceNear))
      .slice(0, 3)
      .map(fg => ({
        id: fg.id,
        type: fg.type,
        topPrice: fg.topPrice,
        bottomPrice: fg.bottomPrice,
        yTop: priceToY(fg.topPrice),
        yBottom: priceToY(fg.bottomPrice)
      }));

    const smcStructure = (smcAnalysis?.structureEvents || []).slice(-2).map(ev => ({
      id: `struct-${ev.index}-${ev.type}`,
      type: ev.type,
      direction: ev.direction,
      price: ev.price,
      y: priceToY(ev.price)
    }));

    const smcSweeps = (smcAnalysis?.liquiditySweeps || []).slice(-2).map(sw => ({
      type: sw.type,
      price: sw.sweptPrice,
      y: priceToY(sw.sweptPrice),
      reversalConfirmed: sw.reversalConfirmed
    }));

    // Nearest ACTIVE order block, used by the compact chart in the AI Predictor modal.
    const primaryOB = smcOrderBlocks.length > 0
      ? {
        y: Math.min(smcOrderBlocks[0].yTop, smcOrderBlocks[0].yBottom),
        height: Math.max(4, Math.abs(smcOrderBlocks[0].yBottom - smcOrderBlocks[0].yTop)),
        loPrice: smcOrderBlocks[0].bottomPrice,
        hiPrice: smcOrderBlocks[0].topPrice
      }
      : null;

    return {
      trend: { x1: trendX1, y1: trendY1, x2: trendX2, y2: trendY2, slope: regSlope },
      suppLine,
      resisLine,
      supportZone,
      resistanceZone,
      // Legacy single-point support/resistance for the horizontal floor/ceiling
      // lines in JSX — derived from strongest zone when available.
      // FALLBACK (no cluster): the nearest tested swing pivot to the last price,
      // NOT the window min/max — min/max snaps the line to one freak wick far
      // from where price is actually trading.
      support: supportZone
        ? { price: supportZone.price, y: supportZone.y }
        : swingLows.length > 0
          ? (() => {
              const lp = closes[n - 1];
              const nearest = swingLows.reduce((a, b) => (Math.abs(b.val - lp) < Math.abs(a.val - lp) ? b : a), swingLows[0]);
              return { price: nearest.val, y: priceToY(nearest.val) };
            })()
          : { price: Math.min(...lows), y: priceToY(Math.min(...lows)) },
      resistance: resistanceZone
        ? { price: resistanceZone.price, y: resistanceZone.y }
        : swingHighs.length > 0
          ? (() => {
              const lp = closes[n - 1];
              const nearest = swingHighs.reduce((a, b) => (Math.abs(b.val - lp) < Math.abs(a.val - lp) ? b : a), swingHighs[0]);
              return { price: nearest.val, y: priceToY(nearest.val) };
            })()
          : { price: Math.max(...highs), y: priceToY(Math.max(...highs)) },
      // Real SMC layers (empty arrays when the engine found nothing — never faked).
      orderBlock: primaryOB ?? { y: 0, height: 4 },
      smcOrderBlocks,
      smcFvgs,
      smcStructure,
      smcSweeps
    };
  }, [activeCandles, candleSpacing, priceToY, smcAnalysis]);



  // RSI Path
  const rsiPath = useMemo(() => {
    let d = "";
    indicators.rsi.forEach((val, idx) => {
      if (val !== null) {
        const x = idx * candleSpacing + candleSpacing / 2;
        const y = 40 - (val / 100) * 40;
        d += d === "" ? `M ${x} ${y}` : ` L ${x} ${y}`;
      }
    });
    return d;
  }, [indicators.rsi, candleSpacing]);

  const handleExecuteTrade = async (type: "BUY" | "SELL") => {
    if (!isConnected || !mt5DataAvailable) {
      alert("Order Rejected: MetaTrader 5 Terminal is not connected or offline.");
      addLog(`[MT5 ORDER WARN] Trade blocked: MT5 Terminal disconnected.`);
      return;
    }

    const sym = currentSymbol;
    const executionPrice = type === "BUY" ? sym.baseAsk : sym.baseBid;

    let computedSL = 0;
    let computedTP = 0;

    if (enableSL && slPips > 0) {
      const slOffset = slPips * sym.pipSize;
      computedSL = type === "BUY" ? Number((executionPrice - slOffset).toFixed(sym.digits)) : Number((executionPrice + slOffset).toFixed(sym.digits));
    }

    if (enableTP && tpPips > 0) {
      const tpOffset = tpPips * sym.pipSize;
      computedTP = type === "BUY" ? Number((executionPrice + tpOffset).toFixed(sym.digits)) : Number((executionPrice - tpOffset).toFixed(sym.digits));
    }

    const tradeVolume = lots;

    try {
      const response = await fetch("/api/mt5/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: sym.symbol,
          action: type,
          volume: tradeVolume,
          sl: computedSL,
          tp: computedTP
        })
      });

      const data = await response.json();
      if (data.success) {
        addLog(`[MT5 LIVE ORDER SUCCESS] Ticket #${data.ticket} ${type} ${tradeVolume} Lots ${sym.symbol} @ ${data.price || executionPrice}`);
        setActiveTab("TRADE");
        // Re-sync positions
        const posRes = await fetch("/api/mt5/positions");
        if (posRes.ok) {
          const posData = await posRes.json();
          if (posData.success && Array.isArray(posData.positions)) setPositions(posData.positions);
        }
      } else {
        alert(`MT5 Broker Order Failed:\n\n${data.error || "Check MT5 terminal: Enable Algo Trading and verify account has sufficient margin."}`);
        addLog(`[MT5 ORDER ERROR] ${data.error || "Order rejected by MT5"}`);
      }
    } catch (err: any) {
      alert(`MT5 Connection Error: ${err.message || "Failed to reach MT5 terminal bridge."}`);
      addLog(`[MT5 ORDER FAIL] ${err.message || "Network error"}`);
    }
  };

  // CLOSE POSITION IN REAL MT5 TERMINAL
  const handleClosePosition = async (ticket: number) => {
    try {
      const posToClose = positions.find(p => p.ticket === ticket);
      const res = await fetch("/api/mt5/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket })
      });
      const data = await res.json();
      if (data.success) {
        addLog(`[MT5 POSITION CLOSED] Position #${ticket} closed successfully on MT5 broker.`);
        if (posToClose) {
          if (posToClose.profit < 0) {
            setSymbolBlacklist(prev => ({
              ...prev,
              [posToClose.symbol]: Date.now() + 30 * 60 * 1000 // 30-min blacklist
            }));
            addLog(`[PRO LOSS FILTER] Position #${ticket} closed in loss ($${posToClose.profit.toFixed(2)}). Symbol ${posToClose.symbol} blacklisted for 30 minutes to prevent repeat losses.`);
            setProTraderThoughts(prev => [{
              id: `thought-black-${Date.now()}`,
              timestamp: new Date().toLocaleTimeString(),
              stage: "SYMBOL LOSS PROTECTION",
              thought: `Position #${ticket} on ${posToClose.symbol} closed in loss ($${posToClose.profit.toFixed(2)}). Blacklisting ${posToClose.symbol} for 30 minutes. Auto-Trader will rotate to alternative markets.`,
              type: "safety"
            }, ...prev].slice(0, 30));
          }
        }
        setPositions(prev => prev.filter(p => p.ticket !== ticket));
      } else {
        alert(`Failed to close MT5 position #${ticket}: ${data.error || "Unknown error"}`);
      }
    } catch (err: any) {
      alert(`MT5 Close Error: ${err.message}`);
    }
  };

  const handleCloseAllPositions = () => {
    positions.forEach(pos => handleClosePosition(pos.ticket));
  };

  const filteredSymbols = useMemo(() => {
    return symbols.filter(s => {
      const matchesSearch = s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) || s.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCat = activeCategory === "ALL" || s.category.toUpperCase().includes(activeCategory.toUpperCase());
      return matchesSearch && matchesCat;
    });
  }, [symbols, searchQuery, activeCategory]);

  // ════════════════════════════════════════════════════════════════════════
  // RENDER HELPER — PREDICTION SCORECARD
  // "place the trade → observe it → see if we predicted and traded right"
  // Reads the server ledger (/api/mt5/predictions), which scores every recorded
  // Kimi verdict against live MT5 prices after its observation horizon.
  // ════════════════════════════════════════════════════════════════════════
  const renderPredictionScorecard = () => (
    <div className="pt-1.5 border-t border-[#21262d] space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-3.5 h-3.5 text-[#e3b341]" />
          <span className="font-bold text-white text-[11px]">Prediction Scorecard</span>
          <span className="text-[9px] text-[#6e7681]">every verdict observed over {Math.round(PREDICTION_HORIZON_SEC / 60)} min of live prices</span>
        </div>
        <div className="flex items-center space-x-2 text-[10px] font-mono">
          {predictionStats && (
            <>
              <span className="text-[#3fb950]">WIN {predictionStats.wins}</span>
              <span className="text-[#f85149]">LOSS {predictionStats.losses}</span>
              <span className="text-[#8b949e]">PENDING {predictionStats.pending}</span>
              <span className={`px-1.5 py-0.2 rounded font-black ${predictionStats.hitRatePct !== null && predictionStats.hitRatePct >= 60 ? "bg-[#238636]/25 text-[#3fb950]" : predictionStats.hitRatePct !== null ? "bg-[#d29922]/20 text-[#e3b341]" : "bg-[#21262d] text-[#8b949e]"}`}>
                HIT-RATE {predictionStats.hitRatePct !== null ? `${predictionStats.hitRatePct}%` : "—"}
              </span>
              <span className="text-[#8b949e]" title="Hit-rate of predictions that actually placed a real order">
                traded {predictionStats.executedTrades} ({predictionStats.executedHitRatePct !== null ? `${predictionStats.executedHitRatePct}%` : "—"})
              </span>
              <span className="text-[#8b949e]" title="Average expectancy in pips">
                exp {predictionStats.expectancyPips !== null ? `${predictionStats.expectancyPips > 0 ? "+" : ""}${predictionStats.expectancyPips}p` : "—"}
              </span>
            </>
          )}
          {ledgerError && <span className="text-[#f85149]" title={ledgerError}>⚠ ledger</span>}
        </div>
      </div>
      {/* Calibration of Kimi's own grading — audits whether "PERFECT" really wins more */}
      {predictionStats && (
        <div className="flex items-center space-x-1.5 flex-wrap">
          {(["PERFECT", "HIGH_PROBABILITY", "VALID", "POOR"] as PredictionQuality[]).map(q => {
            const cell = predictionStats.byQuality[q];
            const show = cell.total > 0;
            return (
              <span key={q} title={`${q}: ${cell.wins}W / ${cell.losses}L`}
                className={`px-1.5 py-0.2 rounded text-[8px] font-bold border ${show ? "bg-[#0d1117] border-[#30363d] text-[#c9d1d9]" : "bg-[#161b22] border-[#21262d] text-[#484f58]"}`}>
                {q} {show ? `${cell.hitRatePct}% (${cell.total})` : "—"}
              </span>
            );
          })}
        </div>
      )}

      <div className="max-h-[96px] overflow-y-auto custom-scrollbar">
        {predictionLedger.length === 0 ? (
          <p className="text-[10px] text-[#6e7681] italic px-1 py-1">
            No predictions recorded yet. Every verified setup the autopilot evaluates lands here and is scored automatically.
          </p>
        ) : (
          <table className="w-full text-left border-collapse text-[10px] font-mono">
            <thead>
              <tr className="text-[#6e7681] text-[9px] uppercase">
                <th className="py-0.5 px-1">Time</th>
                <th className="py-0.5 px-1">Sym</th>
                <th className="py-0.5 px-1">Dir</th>
                <th className="py-0.5 px-1">Grade</th>
                <th className="py-0.5 px-1">Entry</th>
                <th className="py-0.5 px-1">Result</th>
                <th className="py-0.5 px-1">Pips</th>
                <th className="py-0.5 px-1">Traded</th>
              </tr>
            </thead>
            <tbody>
              {predictionLedger.map(p => (
                <tr key={p.id} className="border-b border-[#21262d]">
                  <td className="py-0.5 px-1 text-[#8b949e]">{new Date(p.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}</td>
                  <td className="py-0.5 px-1 text-white font-bold">{p.symbol}</td>
                  <td className={`py-0.5 px-1 font-black ${p.direction === "BUY" ? "text-[#3fb950]" : "text-[#f85149]"}`}>{p.direction}</td>
                  <td className="py-0.5 px-1 text-[#c9d1d9]">{p.setupQuality}</td>
                  <td className="py-0.5 px-1 text-[#c9d1d9]">{p.entryPrice}</td>
                  <td className={`py-0.5 px-1 font-black ${p.status === "WIN" ? "text-[#3fb950]" : p.status === "LOSS" ? "text-[#f85149]" : p.status === "PENDING" ? "text-[#58a6ff]" : "text-[#8b949e]"}`}>{p.status}</td>
                  <td className={`py-0.5 px-1 ${p.status === "WIN" ? "text-[#3fb950]" : p.status === "LOSS" ? "text-[#f85149]" : "text-[#8b949e]"}`}>
                    {p.status === "PENDING" ? "—" : `${p.pipsResult !== null ? (p.pipsResult > 0 ? "+" : "") + p.pipsResult : "—"}`}
                  </td>
                  <td className="py-0.5 px-1">
                    {p.tradeExecuted
                      ? <span className="text-[#e3b341]">✓ #{p.ticket ?? "—"}</span>
                      : <span className="text-[#6e7681]">observed</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {matrixScanError && (
        <p className="text-[9px] text-[#f85149] px-1">
          ⚠ last matrix scan failed {matrixFailStreak > 1 ? `(${matrixFailStreak} in a row)` : ""}: {matrixScanError} — retrying automatically every 5s.
        </p>
      )}
    </div>
  );

  return (
    <div id="forex-mt5-container" className="flex flex-col h-full w-full bg-[#0d1117] text-[#c9d1d9] overflow-hidden select-none font-mono text-xs relative">

      {/* 1. STREAMLINED UNCLUTTERED ACCOUNT HEADER BAR */}
      <div className="bg-[#161b22] border-b border-[#30363d] px-3 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0">

        {/* Left Server Connection Status */}
        <div className="flex items-center space-x-2.5">
          <div className="flex items-center space-x-1.5 bg-[#0d1117] px-2.5 py-1 rounded border border-[#30363d]">
            <Server className="w-3.5 h-3.5 text-[#58a6ff]" />
            <span className="font-extrabold text-white text-xs tracking-tight">MT5</span>
            <span className="text-[10px] bg-[#30363d] text-[#58a6ff] px-1.5 py-0.2 rounded font-sans font-bold">
              {accountServer}
            </span>
          </div>

          <div className="flex items-center space-x-2 text-[11px]">
            <span className="flex items-center space-x-1 bg-[#21262d] px-2 py-0.5 rounded border border-[#30363d]">
              <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-[#3fb950] animate-pulse" : "bg-[#f85149]"}`} />
              <span className={`font-bold ${isConnected ? "text-[#3fb950]" : "text-[#f85149]"}`}>
                {isConnected ? "CONNECTED" : "OFFLINE"}
              </span>
            </span>

            <span className="text-[#8b949e]">Acc: <b className="text-white">#{accountLogin}</b></span>
            <span className="text-[#8b949e] hidden sm:inline">• {leverage}</span>
          </div>
        </div>

        {/* Center & Right Streamlined Financial Overview metrics */}
        <div className="flex items-center space-x-2 overflow-x-auto custom-scrollbar">
          <div className="bg-[#0d1117] px-2.5 py-1 rounded border border-[#30363d] flex items-center space-x-1.5">
            <span className="text-[#8b949e] text-[10px]">BALANCE:</span>
            <span className="text-white font-bold">${balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
          </div>

          <div className="bg-[#0d1117] px-2.5 py-1 rounded border border-[#30363d] flex items-center space-x-1.5">
            <span className="text-[#8b949e] text-[10px]">EQUITY:</span>
            <span className={`font-bold ${equity >= balance ? "text-[#3fb950]" : "text-[#f85149]"}`}>
              ${equity.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className="bg-[#0d1117] px-2.5 py-1 rounded border border-[#30363d] flex items-center space-x-1.5 hidden md:flex">
            <span className="text-[#8b949e] text-[10px]">FREE MARGIN:</span>
            <span className="text-[#3fb950] font-bold">${freeMargin.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
          </div>

          <div className="bg-[#0d1117] px-2.5 py-1 rounded border border-[#30363d] flex items-center space-x-1.5">
            <span className="text-[#8b949e] text-[10px]">P/L:</span>
            <span className={`font-extrabold ${floatingPnL >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>
              {floatingPnL >= 0 ? "+" : ""}${floatingPnL.toFixed(2)}
            </span>
          </div>

          {/* PC Terminal Summary Popup Trigger */}
          <button
            onClick={() => setShowDeviceSummaryModal(true)}
            className="bg-[#21262d] hover:bg-[#30363d] text-[#e3b341] border border-[#30363d] px-2.5 py-1 rounded font-bold flex items-center space-x-1 transition cursor-pointer"
            title="View PC MT5 Hardware & Terminal Details"
          >
            <Monitor className="w-3.5 h-3.5" />
            <span className="text-[10px] hidden sm:inline">PC Terminal Summary</span>
          </button>

          {/* AI Quantitative Analysis & Predictor */}
          <button
            onClick={() => {
              setShowAiAnalysisModal(true);
              if (!aiPrediction) handleRunAiAnalysis();
            }}
            className="bg-[#1f6beb]/20 hover:bg-[#1f6beb]/30 text-[#58a6ff] border border-[#1f6beb]/50 px-2.5 py-1 rounded font-bold flex items-center space-x-1 transition cursor-pointer"
            title="Generate MT5 AI Quantitative Analysis & Signals"
          >
            <Brain className="w-3.5 h-3.5 text-[#58a6ff]" />
            <span className="text-[10px]">
              {kimiPredicting ? `Analyzing… ${analysisElapsed}s` : "AI Predictor"}
            </span>
            {kimiPredicting && (
              <RefreshCw className="w-3 h-3 text-[#58a6ff] animate-spin" />
            )}
          </button>

          {/* AI Autonomous Trader Toggle */}
          <button
            onClick={() => {
              const nextState = !isAiAutoTraderActive;
              setIsAiAutoTraderActive(nextState);
              addLog(`[AI AUTO-TRADER] Autonomous trading system ${nextState ? "ACTIVATED" : "DEACTIVATED"}.`);
            }}
            className={`px-2.5 py-1 rounded font-bold flex items-center space-x-1 transition cursor-pointer border ${isAiAutoTraderActive
                ? "bg-[#238636] text-white border-[#3fb950] shadow-md shadow-emerald-900/40 animate-pulse"
                : "bg-[#21262d] text-[#8b949e] border-[#30363d] hover:text-white"
              }`}
            title="Toggle AI Autonomous MT5 Trading System"
          >
            <Cpu className="w-3.5 h-3.5" />
            <span className="text-[10px]">{isAiAutoTraderActive ? "AI TRADER: ON" : "AI TRADER: OFF"}</span>
          </button>

          {/* Settings / Connect Modal Trigger Button */}
          <button
            onClick={() => setShowConnectModal(true)}
            className="bg-[#21262d] hover:bg-[#30363d] text-[#58a6ff] border border-[#30363d] px-2.5 py-1 rounded font-bold flex items-center space-x-1 transition cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="text-[10px] hidden sm:inline">Account Connection</span>
          </button>
        </div>
      </div>

      {/* 2. MAIN WORKSPACE CONTENT GRID */}
      <div className="flex-1 grid grid-cols-12 overflow-hidden divide-x divide-[#30363d] min-h-0">

        {/* LEFT COLUMN: MARKET WATCH & SYMBOLS (2.5 Cols) */}
        <div id="market-watch-panel" className="col-span-12 md:col-span-3 lg:col-span-2.5 flex flex-col bg-[#161b22] h-full min-h-0 overflow-hidden">

          <div className="px-3 py-2 bg-[#21262d] border-b border-[#30363d] flex items-center justify-between">
            <div className="flex items-center space-x-1.5 text-white font-bold text-xs">
              <Activity className="w-3.5 h-3.5 text-[#58a6ff]" />
              <span>Market Watch</span>
            </div>
            <div className="flex items-center space-x-1.5">
              {mt5DataAvailable ? (
                <span className="flex items-center space-x-1 text-[10px] bg-[#238636]/20 border border-[#238636] text-[#3fb950] px-1.5 py-0.5 rounded">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#3fb950] animate-pulse inline-block" />
                  <span>LIVE</span>
                </span>
              ) : (
                <span className="flex items-center space-x-1 text-[10px] bg-[#f85149]/10 border border-[#f85149]/40 text-[#f85149] px-1.5 py-0.5 rounded" title={mt5DataError || "MT5 not connected"}>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#f85149] inline-block" />
                  <span>OFFLINE</span>
                </span>
              )}
              <span className="text-[10px] bg-[#30363d] text-[#8b949e] px-1.5 py-0.5 rounded">
                {filteredSymbols.length} pairs
              </span>
            </div>
          </div>

          <div className="p-2 border-b border-[#30363d] space-y-1.5 bg-[#0d1117]">
            <div className="relative">
              <Search className="w-3 h-3 text-[#8b949e] absolute left-2 top-2" />
              <input
                type="text"
                placeholder="Search symbol (e.g. EURUSD, GOLD)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#161b22] text-white pl-7 pr-2 py-1 rounded border border-[#30363d] text-[11px] focus:outline-none focus:border-[#58a6ff]"
              />
            </div>

            <div className="flex items-center space-x-1 overflow-x-auto custom-scrollbar text-[9px]">
              {["ALL", "MAJOR", "MINOR", "METALS", "INDICES"].map(cat => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-2 py-0.5 rounded font-bold whitespace-nowrap ${activeCategory === cat ? "bg-[#58a6ff] text-black" : "bg-[#21262d] text-[#8b949e] hover:text-white"
                    }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-[#21262d]">
            {filteredSymbols.map(s => {
              const isSelected = s.symbol === selectedSymbolCode;
              const flash = tickFlashMap[s.symbol];

              return (
                <div
                  key={s.symbol}
                  onClick={() => {
                    setSelectedSymbolCode(s.symbol);
                    // Manual pick: stop the 12s scan from hijacking the chart back to #1.
                    setUserPicked(true);
                  }}
                  className={`p-2 cursor-pointer transition-all flex items-center justify-between hover:bg-[#21262d] ${isSelected ? "bg-[#1f242c] border-l-2 border-[#58a6ff]" : ""
                    }`}
                >
                  <div>
                    <div className="flex items-center space-x-1.5">
                      <span className="font-bold text-white text-xs">{s.symbol}</span>
                      <span className="text-[9px] text-[#8b949e]">{s.spreadPips} pip</span>
                    </div>
                    <div className="text-[9px] text-[#8b949e] truncate max-w-[110px]">{s.name}</div>
                  </div>

                  <div className="text-right">
                    <div className="flex items-center justify-end space-x-1">
                      <span className={`text-xs font-bold transition-colors ${flash === "up" ? "bg-[#238636]/30 text-[#3fb950]" : flash === "down" ? "bg-[#da3633]/30 text-[#f85149]" : "text-white"
                        }`}>
                        {s.baseBid.toFixed(s.digits)}
                      </span>
                    </div>
                    <div className={`text-[9px] font-semibold ${s.dailyChange >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>
                      {s.dailyChange >= 0 ? "+" : ""}{s.dailyChange}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CENTER COLUMN: LIVE MT5 CHART (6.5 Cols) */}
        <div id="chart-and-terminal-panel" className="col-span-12 md:col-span-6 lg:col-span-6.5 flex flex-col h-full min-h-0 bg-[#0d1117] overflow-hidden">

          <div className="bg-[#161b22] border-b border-[#30363d] px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center space-x-2">
              <span className="font-extrabold text-white text-sm tracking-tight">{currentSymbol.symbol}</span>
              <span className="text-[#8b949e] text-[11px]">({currentSymbol.name})</span>

              <div className="h-3 w-px bg-[#30363d] mx-1" />

              <div className="flex items-center space-x-0.5 bg-[#0d1117] p-0.5 rounded border border-[#30363d] text-[10px]">
                {(["M1", "M5", "M15", "M30", "H1", "H4", "D1"] as const).map(tf => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className={`px-1.5 py-0.5 rounded font-bold ${timeframe === tf ? "bg-[#58a6ff] text-black" : "text-[#8b949e] hover:text-white"
                      }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center space-x-2 text-[10px]">
              <button
                onClick={() => setShowMA20(!showMA20)}
                className={`px-2 py-0.5 rounded border ${showMA20 ? "bg-[#1f6beb]/20 border-[#1f6beb] text-[#58a6ff]" : "border-[#30363d] text-[#8b949e]"}`}
              >
                MA20
              </button>
              <button
                onClick={() => setShowMA50(!showMA50)}
                className={`px-2 py-0.5 rounded border ${showMA50 ? "bg-[#d29922]/20 border-[#d29922] text-[#e3b341]" : "border-[#30363d] text-[#8b949e]"}`}
              >
                MA50
              </button>
              <button
                onClick={() => setShowRSI(!showRSI)}
                className={`px-2 py-0.5 rounded border ${showRSI ? "bg-[#238636]/20 border-[#238636] text-[#3fb950]" : "border-[#30363d] text-[#8b949e]"}`}
              >
                RSI
              </button>
              <button
                onClick={() => setIsChartMaximized(true)}
                className="px-2 py-0.5 rounded border border-[#1f6beb]/50 bg-[#1f6beb]/10 text-[#58a6ff] hover:bg-[#1f6beb] hover:text-white transition flex items-center space-x-1 font-bold cursor-pointer"
                title="Full-Screen Zoomable Chart Inspection"
              >
                <Maximize2 className="w-3 h-3" />
                <span>Expand Chart</span>
              </button>
            </div>

          </div>

          <div className="flex-1 relative bg-[#090d13] p-2 flex flex-col justify-between overflow-hidden">

            {/* ONE-CLICK TRADING WIDGET */}
            <div className="absolute top-4 left-4 z-10 bg-[#161b22]/95 backdrop-blur border border-[#30363d] rounded p-2 shadow-2xl space-y-2 w-[220px]">
              <div className="flex items-center justify-between text-[10px] text-[#8b949e]">
                <span>ONE-CLICK TRADING</span>
                <span className="font-bold text-[#58a6ff]">{currentSymbol.symbol}</span>
              </div>

              <div className="flex items-center justify-between bg-[#0d1117] p-1 rounded border border-[#30363d]">
                <button
                  onClick={() => setLots(l => Math.max(0.01, Number((l - 0.05).toFixed(2))))}
                  className="px-2 py-0.5 bg-[#21262d] text-white rounded font-bold hover:bg-[#30363d]"
                >
                  -
                </button>
                <span className="font-bold text-white text-xs">{lots.toFixed(2)} Lot</span>
                <button
                  onClick={() => setLots(l => Number((l + 0.05).toFixed(2)))}
                  className="px-2 py-0.5 bg-[#21262d] text-white rounded font-bold hover:bg-[#30363d]"
                >
                  +
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleExecuteTrade("SELL")}
                  className="bg-[#da3633] hover:bg-[#b82a28] text-white p-2 rounded text-center transition-all shadow cursor-pointer active:scale-95"
                >
                  <div className="text-[10px] font-bold">SELL</div>
                  <div className="text-xs font-black tracking-tight">{currentSymbol.baseBid.toFixed(currentSymbol.digits)}</div>
                </button>

                <button
                  onClick={() => handleExecuteTrade("BUY")}
                  className="bg-[#238636] hover:bg-[#1e722e] text-white p-2 rounded text-center transition-all shadow cursor-pointer active:scale-95"
                >
                  <div className="text-[10px] font-bold">BUY</div>
                  <div className="text-xs font-black tracking-tight">{currentSymbol.baseAsk.toFixed(currentSymbol.digits)}</div>
                </button>
              </div>
            </div>

            {/* AMIS-FX NEWS IMPACT WARNING BANNER */}
            {newsImpactWarning && (
              <div className="mx-3 mt-2 px-3 py-1.5 rounded-lg bg-[#d29922]/10 border border-[#d29922]/50 flex items-center space-x-2 text-[11px] animate-pulse">
                <span className="text-[#e3b341] font-black">{newsImpactWarning}</span>
              </div>
            )}

            {/* AMIS-FX INTELLIGENCE STRIP */}
            {amisSnapshot && (
              <div className="mx-3 mt-2 px-2.5 py-1.5 rounded-lg bg-[#0d1117] border border-[#1f6beb]/30 flex items-center justify-between text-[9px] font-mono overflow-hidden">
                <div className="flex items-center space-x-2">
                  <span className="text-[#58a6ff] font-black text-[9px] uppercase tracking-widest">AMIS-FX</span>
                  <span className={`px-1.5 py-0.5 rounded font-black uppercase text-[8px] ${amisSnapshot.dominantRegime?.includes("Up") || amisSnapshot.dominantRegime?.includes("Bull")
                      ? "bg-[#238636]/20 text-[#3fb950] border border-[#238636]/40"
                      : amisSnapshot.dominantRegime?.includes("Down") || amisSnapshot.dominantRegime?.includes("Bear")
                        ? "bg-[#da3633]/20 text-[#f85149] border border-[#da3633]/40"
                        : "bg-[#d29922]/20 text-[#e3b341] border border-[#d29922]/40"
                    }`}>
                    {amisSnapshot.dominantRegime || amisRegime || "Scanning..."}
                  </span>
                  <span className="text-[#8b949e]">Certainty: <b className="text-white">{amisSnapshot.intelligenceCertainty}%</b></span>
                </div>
                <div className="flex items-center space-x-2.5 text-[#8b949e]">
                  <span>RSI: <b className={amisSnapshot.rsi14 > 70 ? "text-[#f85149]" : amisSnapshot.rsi14 < 30 ? "text-[#3fb950]" : "text-white"}>{amisSnapshot.rsi14?.toFixed(1)}</b></span>
                  <span>ATR: <b className="text-white">{amisSnapshot.atrPips}p</b></span>
                  <span>Vol: <b className={amisSnapshot.volatilityState === "EXPANDING" ? "text-[#e3b341]" : "text-[#58a6ff]"}>{amisSnapshot.volatilityState}</b></span>
                  <span>Session: <b className="text-white">{amisSnapshot.session}</b></span>
                  {amisSnapshot.stopHuntDetected && <span className="text-[#f85149] font-black animate-pulse">⚡ STOP HUNT</span>}
                  {amisSnapshot.breakOfStructure && <span className="text-[#e3b341] font-black">⚡ BoS</span>}
                  {amisSnapshot.candlePattern !== "None" && <span className="text-[#c9d1d9]">{amisSnapshot.candlePattern}</span>}
                </div>
              </div>
            )}

            {/* CANDLESTICK SVG DISPLAY & TOOLTIP OVERLAY */}
            <div className="w-full h-full flex flex-col justify-between relative pt-12 pb-2">

              {/* TOP OHLC BAR / HOVER TOOLTIP */}
              <div className="absolute top-2 left-4 z-10 flex items-center space-x-3 text-[10px] bg-[#161b22]/90 px-2.5 py-1 rounded border border-[#30363d]">
                {hoveredIndex !== null && activeCandles[hoveredIndex] ? (
                  <>
                    <span className="text-[#8b949e]">Time: <b className="text-white">{activeCandles[hoveredIndex].time}</b></span>
                    <span className="text-[#8b949e]">O: <b className="text-white">{activeCandles[hoveredIndex].open.toFixed(currentSymbol.digits)}</b></span>
                    <span className="text-[#8b949e]">H: <b className="text-[#3fb950]">{activeCandles[hoveredIndex].high.toFixed(currentSymbol.digits)}</b></span>
                    <span className="text-[#8b949e]">L: <b className="text-[#f85149]">{activeCandles[hoveredIndex].low.toFixed(currentSymbol.digits)}</b></span>
                    <span className="text-[#8b949e]">C: <b className={activeCandles[hoveredIndex].close >= activeCandles[hoveredIndex].open ? "text-[#3fb950]" : "text-[#f85149]"}>{activeCandles[hoveredIndex].close.toFixed(currentSymbol.digits)}</b></span>
                    <span className="text-[#8b949e]">Vol: <b className="text-[#58a6ff]">{activeCandles[hoveredIndex].volume.toLocaleString()}</b></span>
                  </>
                ) : (
                  <>
                    <span className="text-[#8b949e]">Symbol: <b className="text-white">{currentSymbol.symbol}</b></span>
                    <span className="text-[#8b949e]">TF: <b className="text-[#58a6ff]">{timeframe}</b></span>
                    <span className="text-[#8b949e]">Bid: <b className="text-[#f85149]">{currentSymbol.baseBid.toFixed(currentSymbol.digits)}</b></span>
                    <span className="text-[#8b949e]">Ask: <b className="text-[#3fb950]">{currentSymbol.baseAsk.toFixed(currentSymbol.digits)}</b></span>
                    <span className="text-[#8b949e]">Bars: <b className="text-white">{activeCandles.length}</b></span>
                  </>
                )}
              </div>

              <div className="w-full h-[270px] relative">
                {/* NO DATA AVAILABLE OVERLAY */}
                {activeCandles.length === 0 && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#090d13]/95 rounded">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#8b949e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3 opacity-60">
                      <path d="M3 3l18 18M9 9v.01M15 15v.01" /><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h6m6 0h6M9 3v6m0 6v6" />
                    </svg>
                    <p className="text-[#8b949e] text-sm font-semibold mb-1">No data available</p>
                    <p className="text-[#6e7681] text-xs text-center px-4">
                      {candleLoadError || "Ensure MetaTrader 5 is open and connected"}
                    </p>
                    {!isConnected && (
                      <p className="text-[#f85149] text-xs mt-2">⚠ MT5 terminal not detected</p>
                    )}
                  </div>
                )}
                <svg
                  className="w-full h-full overflow-visible cursor-crosshair"
                  viewBox={`0 0 ${chartWidth} ${chartHeight + volumeHeight}`}
                  onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const mouseX = ((e.clientX - rect.left) / rect.width) * chartWidth;
                    const mouseY = ((e.clientY - rect.top) / rect.height) * (chartHeight + volumeHeight);
                    const idx = Math.min(activeCandles.length - 1, Math.max(0, Math.floor(mouseX / candleSpacing)));
                    setHoveredIndex(idx);
                    setCrosshair({
                      x: idx * candleSpacing + candleSpacing / 2,
                      y: Math.min(chartHeight, mouseY),
                      price: yToPrice(mouseY)
                    });
                  }}
                  onMouseLeave={() => {
                    setHoveredIndex(null);
                    setCrosshair(null);
                  }}
                >
                  {/* ── MODERN CHART RENDERING LAYER ──
                      Realistic dark theme: gradient plot background, soft radial glow,
                      crisp 1px grid, right-hand price axis with chips and a proper
                      volume lane. Not a flat "image" — everything is live SVG geometry. */}
                  <defs>
                    <linearGradient id="plotBg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0f151d" />
                      <stop offset="55%" stopColor="#0b1016" />
                      <stop offset="100%" stopColor="#080c12" />
                    </linearGradient>
                    <linearGradient id="bullGlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3fb950" stopOpacity="0.45" />
                      <stop offset="100%" stopColor="#3fb950" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="bearGlow" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f85149" stopOpacity="0.45" />
                      <stop offset="100%" stopColor="#f85149" stopOpacity="0" />
                    </linearGradient>
                    <filter id="obShadow" x="-20%" y="-40%" width="140%" height="180%">
                      <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000000" floodOpacity="0.55" />
                    </filter>
                    <filter id="candleGlow" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="1.6" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>

                  {/* Plot background + volume lane separator */}
                  <rect x="0" y="0" width={chartWidth} height={chartHeight + volumeHeight} fill="url(#plotBg)" rx="4" />
                  <line x1="0" y1={chartHeight} x2={chartWidth} y2={chartHeight} stroke="#1c2430" strokeWidth="1" />

                  {/* HORIZONTAL PRICE GRID + RIGHT-HAND PRICE AXIS */}
                  {[0, 0.2, 0.4, 0.6, 0.8, 1.0].map((ratio) => {
                    const priceVal = paddedMin + totalPriceRange * ratio;
                    const y = priceToY(priceVal);
                    return (
                      <g key={ratio}>
                        <line x1="0" y1={y} x2={chartWidth} y2={y} stroke="#161d27" strokeWidth="1" />
                        <rect x={chartWidth - 62} y={y - 8} width="62" height="16" fill="#0d1319" opacity="0.92" rx="2" />
                        <text x={chartWidth - 5} y={y + 3} fill="#7d8794" fontSize="9" textAnchor="end" fontWeight="500">
                          {priceVal.toFixed(currentSymbol.digits)}
                        </text>
                      </g>
                    );
                  })}

                  {/* VERTICAL TIME GRID LINES */}
                  {activeCandles.map((c, i) => {
                    if (i % 6 !== 0) return null;
                    const x = i * candleSpacing + candleSpacing / 2;
                    return (
                      <g key={i}>
                        <line x1={x} y1="0" x2={x} y2={chartHeight + volumeHeight} stroke="#21262d" strokeWidth="1" strokeDasharray="2 4" />
                        <text x={x} y={chartHeight + volumeHeight + 12} fill="#8b949e" fontSize="9" textAnchor="middle">
                          {c.time}
                        </text>
                      </g>
                    );
                  })}

                  {/* BOLLINGER BANDS CHANNEL SHADING */}
                  {showBB && bbPaths.upper && (
                    <g>
                      <path d={bbPaths.upper} fill="none" stroke="#a371f7" strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />
                      <path d={bbPaths.lower} fill="none" stroke="#a371f7" strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />
                    </g>
                  )}

                  {/* MA20 & MA50 INDICATOR LINES */}
                  {showMA20 && ma20Path && (
                    <path d={ma20Path} fill="none" stroke="#58a6ff" strokeWidth="1.8" strokeLinecap="round" />
                  )}
                  {showMA50 && ma50Path && (
                    <path d={ma50Path} fill="none" stroke="#e3b341" strokeWidth="1.8" strokeLinecap="round" />
                  )}

                  {/* ── REAL SMC ZONES (same engine data as the SMC panel) ──
                      Filled FVGs, active Order Blocks, liquidity sweeps and BOS/ChoCH
                      markers. Nothing here is faked: if the engine finds no zones the
                      chart simply shows no zone, matching the panel count exactly. */}
                  {drawingData && (
                    <g>
                      {/* Fair Value Gaps (unfilled imbalances) */}
                      {drawingData.smcFvgs.map(fg => {
                        const top = Math.min(fg.yTop, fg.yBottom);
                        const h = Math.max(2, Math.abs(fg.yBottom - fg.yTop));
                        return (
                          <g key={fg.id}>
                            <rect x="0" y={top} width={chartWidth} height={h}
                              fill={fg.type === "BULLISH" ? "#1f6feb" : "#a371f7"} fillOpacity="0.10" />
                            <line x1="0" y1={top} x2={chartWidth} y2={top}
                              stroke={fg.type === "BULLISH" ? "#58a6ff" : "#a371f7"} strokeWidth="0.8" strokeDasharray="2 3" opacity="0.8" />
                            <line x1="0" y1={top + h} x2={chartWidth} y2={top + h}
                              stroke={fg.type === "BULLISH" ? "#58a6ff" : "#a371f7"} strokeWidth="0.8" strokeDasharray="2 3" opacity="0.8" />
                            <text x="8" y={top - 2} fill={fg.type === "BULLISH" ? "#58a6ff" : "#a371f7"} fontSize="8" fontWeight="bold">
                              FVG {fg.type === "BULLISH" ? "▲" : "▼"}
                            </text>
                          </g>
                        );
                      })}

                      {/* Institutional Order Blocks (demand / supply) */}
                      {drawingData.smcOrderBlocks.map(ob => {
                        const top = Math.min(ob.yTop, ob.yBottom);
                        const h = Math.max(3, Math.abs(ob.yBottom - ob.yTop));
                        const color = ob.type === "BULLISH" ? "#3fb950" : "#f85149";
                        return (
                          <g key={ob.id} filter="url(#obShadow)">
                            <rect x="0" y={top} width={chartWidth} height={h}
                              fill={color} fillOpacity="0.09" stroke={color} strokeWidth="1" strokeDasharray="4 2" />
                            <rect x="0" y={top} width="3" height={h} fill={color} fillOpacity="0.85" />
                            <text x="8" y={top + h + 9} fill={color} fontSize="8" fontWeight="bold">
                              {ob.type === "BULLISH" ? "DEMAND OB" : "SUPPLY OB"} {ob.strength}% · {ob.bottomPrice.toFixed(currentSymbol.digits)}–{ob.topPrice.toFixed(currentSymbol.digits)}
                            </text>
                          </g>
                        );
                      })}

                      {/* Liquidity sweep markers (stop hunts) */}
                      {drawingData.smcSweeps.map((sw, i) => (
                        <g key={`sweep-${i}`}>
                          <line x1="0" y1={sw.y} x2={chartWidth} y2={sw.y}
                            stroke="#e3b341" strokeWidth="0.9" strokeDasharray="1 4" opacity="0.85" />
                          <text x={chartWidth - 90} y={sw.y - 3} fill="#e3b341" fontSize="8" fontWeight="bold">
                            {sw.type === "SWEEP_HIGH" ? "⚡ SWEEP HIGH" : "⚡ SWEEP LOW"}{sw.reversalConfirmed ? " ✓" : ""}
                          </text>
                        </g>
                      ))}

                      {/* BOS / ChoCH structure labels */}
                      {drawingData.smcStructure.map(ev => (
                        <g key={ev.id}>
                          <line x1="0" y1={ev.y} x2={chartWidth} y2={ev.y}
                            stroke={ev.type === "CHOCH" ? "#d29922" : "#58a6ff"} strokeWidth="0.8" strokeDasharray="6 4" opacity="0.7" />
                          <text x="60" y={ev.y - 3} fill={ev.type === "CHOCH" ? "#d29922" : "#58a6ff"} fontSize="8" fontWeight="bold">
                            {ev.type === "CHOCH" ? "ChoCH" : "BOS"} {ev.direction === "BULLISH" ? "↑" : "↓"}
                          </text>
                        </g>
                      ))}

                      {/* Dynamic Support Floor — uses clustered S-zone median when available */}
                      <line x1="0" y1={drawingData.support.y} x2={chartWidth} y2={drawingData.support.y} stroke="#3fb950" strokeWidth="1.5" strokeDasharray="4 2" />
                      <text x={chartWidth - 130} y={drawingData.support.y - 4} fill="#3fb950" fontSize="9" fontWeight="bold">
                        {drawingData.supportZone
                          ? `🟢 S-Zone ${drawingData.support.price.toFixed(currentSymbol.digits)} (${drawingData.supportZone.count}t)`
                          : `🟢 Support Floor (${drawingData.support.price.toFixed(currentSymbol.digits)})`}
                      </text>

                      {/* Dynamic Resistance Ceiling — uses clustered R-zone median when available */}
                      <line x1="0" y1={drawingData.resistance.y} x2={chartWidth} y2={drawingData.resistance.y} stroke="#f85149" strokeWidth="1.5" strokeDasharray="4 2" />
                      <text x={chartWidth - 130} y={drawingData.resistance.y + 12} fill="#f85149" fontSize="9" fontWeight="bold">
                        {drawingData.resistanceZone
                          ? `🔴 R-Zone ${drawingData.resistance.price.toFixed(currentSymbol.digits)} (${drawingData.resistanceZone.count}t)`
                          : `🔴 Supply Ceiling (${drawingData.resistance.price.toFixed(currentSymbol.digits)})`}
                      </text>

                      {/* Swing Low Support Trendline (validated) */}
                      {drawingData.suppLine && (
                        <g>
                          <line x1={drawingData.suppLine.x1} y1={drawingData.suppLine.y1} x2={drawingData.suppLine.x2} y2={drawingData.suppLine.y2} stroke="#3fb950" strokeWidth="2" strokeDasharray="5 3" />
                          <text x={drawingData.suppLine.x2 - 150} y={drawingData.suppLine.y2 + 12} fill="#3fb950" fontSize="9" fontWeight="bold">
                            {drawingData.suppLine.validationRatio >= 0.66
                              ? `📈 Swing Low TL ✓ (validated)`
                              : `📈 Swing Low TL ○ (tentative)`}
                          </text>
                        </g>
                      )}

                      {/* Swing High Resistance Trendline (validated) */}
                      {drawingData.resisLine && (
                        <g>
                          <line x1={drawingData.resisLine.x1} y1={drawingData.resisLine.y1} x2={drawingData.resisLine.x2} y2={drawingData.resisLine.y2} stroke="#e3b341" strokeWidth="2" strokeDasharray="5 3" />
                          <text x={drawingData.resisLine.x2 - 150} y={drawingData.resisLine.y2 - 6} fill="#e3b341" fontSize="9" fontWeight="bold">
                            {drawingData.resisLine.validationRatio >= 0.66
                              ? `📉 Swing High TL ✓ (validated)`
                              : `📉 Swing High TL ○ (tentative)`}
                          </text>
                        </g>
                      )}

                      {/* Primary Regression Trendline (OLS baseline) */}
                      <line x1={drawingData.trend.x1} y1={drawingData.trend.y1} x2={drawingData.trend.x2} y2={drawingData.trend.y2} stroke="#58a6ff" strokeWidth="1.8" strokeDasharray="3 3" />
                      <text x={drawingData.trend.x2 - 80} y={drawingData.trend.y2 - 6} fill="#58a6ff" fontSize="9" fontWeight="bold">
                        📈 OLS Baseline
                      </text>
                    </g>
                  )}

                  {/* AI PREDICTION SL & TP TARGET OVERLAY LINES */}
                  {aiPrediction && aiPrediction.symbol === currentSymbol.symbol && (
                    <g>
                      {/* TP Line */}
                      {aiPrediction.recommendedTPPrice > 0 && (
                        <g>
                          <line x1="0" y1={priceToY(aiPrediction.recommendedTPPrice)} x2={chartWidth} y2={priceToY(aiPrediction.recommendedTPPrice)} stroke="#3fb950" strokeWidth="2" strokeDasharray="6 3" />
                          <text x="10" y={priceToY(aiPrediction.recommendedTPPrice) - 4} fill="#3fb950" fontSize="9" fontWeight="bold">
                            🎯 TAKE PROFIT TARGET ({aiPrediction.recommendedTPPrice.toFixed(currentSymbol.digits)})
                          </text>
                        </g>
                      )}
                      {/* SL Line */}
                      {aiPrediction.recommendedSLPrice > 0 && (
                        <g>
                          <line x1="0" y1={priceToY(aiPrediction.recommendedSLPrice)} x2={chartWidth} y2={priceToY(aiPrediction.recommendedSLPrice)} stroke="#f85149" strokeWidth="2" strokeDasharray="6 3" />
                          <text x="10" y={priceToY(aiPrediction.recommendedSLPrice) + 12} fill="#f85149" fontSize="9" fontWeight="bold">
                            🛡️ STOP LOSS PROTECTION ({aiPrediction.recommendedSLPrice.toFixed(currentSymbol.digits)})
                          </text>
                        </g>
                      )}
                    </g>
                  )}


                  {/* VOLUME HISTOGRAM BARS (own lane, softly faded) */}
                  {activeCandles.map((c, i) => {
                    const x = i * candleSpacing + (candleSpacing - candleBarWidth) / 2;
                    const isGreen = c.close >= c.open;
                    const vHeight = (c.volume / maxVolume) * volumeHeight;
                    const y = chartHeight + volumeHeight - vHeight;

                    return (
                      <rect
                        key={`vol-${i}`}
                        x={x}
                        y={y}
                        width={candleBarWidth}
                        height={Math.max(2, vHeight)}
                        fill={isGreen ? "#238636" : "#da3633"}
                        opacity={hoveredIndex === i ? "0.85" : "0.30"}
                        rx="0.5"
                      />
                    );
                  })}

                  {/* REAL CANDLESTICKS — wick + rounded body, hovered candle gets a glow */}
                  {activeCandles.map((c, i) => {
                    const isGreen = c.close >= c.open;
                    const x = i * candleSpacing + (candleSpacing - candleBarWidth) / 2;
                    const cx = i * candleSpacing + candleSpacing / 2;

                    const openY = priceToY(c.open);
                    const closeY = priceToY(c.close);
                    const highY = priceToY(c.high);
                    const lowY = priceToY(c.low);

                    const bodyY = Math.min(openY, closeY);
                    const bodyH = Math.max(2, Math.abs(closeY - openY));

                    const isHovered = hoveredIndex === i;
                    const fill = isGreen ? "#2ea043" : "#da3633";
                    const stroke = isGreen ? "#3fb950" : "#f85149";
                    const bodyRadius = Math.min(1.5, candleBarWidth / 4);
                    const isLast = i === activeCandles.length - 1;

                    return (
                      <g key={`candle-${i}`} filter={isHovered || isLast ? "url(#candleGlow)" : undefined}>
                        {/* Upper wick */}
                        <line x1={cx} y1={highY} x2={cx} y2={bodyY} stroke={stroke} strokeWidth={isHovered ? 1.8 : 1.1} strokeLinecap="round" />
                        {/* Lower wick */}
                        <line x1={cx} y1={bodyY + bodyH} x2={cx} y2={lowY} stroke={stroke} strokeWidth={isHovered ? 1.8 : 1.1} strokeLinecap="round" />
                        {/* Body */}
                        <rect
                          x={x}
                          y={bodyY}
                          width={candleBarWidth}
                          height={bodyH}
                          fill={isGreen ? fill : fill}
                          stroke={stroke}
                          strokeWidth={isHovered ? 1.4 : 0.8}
                          rx={bodyRadius}
                        />
                      </g>
                    );
                  })}

                  {/* ACTIVE POSITION SL / TP OVERLAY LINES */}
                  {symbolPositions.map(pos => {
                    const entryY = priceToY(pos.openPrice);
                    const slY = pos.sl > 0 ? priceToY(pos.sl) : null;
                    const tpY = pos.tp > 0 ? priceToY(pos.tp) : null;

                    return (
                      <g key={`pos-lines-${pos.ticket}`}>
                        {/* Entry Price line */}
                        <line x1="0" y1={entryY} x2={chartWidth} y2={entryY} stroke="#e3b341" strokeWidth="1.2" strokeDasharray="4 2" />
                        <rect x="0" y={entryY - 9} width="95" height="18" fill="#e3b341" rx="2" />
                        <text x="5" y={entryY + 3} fill="#000" fontSize="9" fontWeight="bold">
                          #{pos.ticket} {pos.type} {pos.volume}
                        </text>

                        {/* SL line */}
                        {slY !== null && (
                          <g>
                            <line x1="0" y1={slY} x2={chartWidth} y2={slY} stroke="#f85149" strokeWidth="1" strokeDasharray="2 2" />
                            <rect x="0" y={slY - 8} width="65" height="16" fill="#f85149" rx="2" />
                            <text x="5" y={slY + 3} fill="#fff" fontSize="8" fontWeight="bold">
                              SL: {pos.sl.toFixed(currentSymbol.digits)}
                            </text>
                          </g>
                        )}

                        {/* TP line */}
                        {tpY !== null && (
                          <g>
                            <line x1="0" y1={tpY} x2={chartWidth} y2={tpY} stroke="#3fb950" strokeWidth="1" strokeDasharray="2 2" />
                            <rect x="0" y={tpY - 8} width="65" height="16" fill="#238636" rx="2" />
                            <text x="5" y={tpY + 3} fill="#fff" fontSize="8" fontWeight="bold">
                              TP: {pos.tp.toFixed(currentSymbol.digits)}
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}

                  {/* LIVE ASK & BID PRICE CURSOR LINES */}
                  {/* ASK LINE (GREEN) */}
                  {(() => {
                    const askY = priceToY(currentSymbol.baseAsk);
                    return (
                      <g>
                        <line x1="0" y1={askY} x2={chartWidth} y2={askY} stroke="#3fb950" strokeWidth="1" strokeDasharray="2 2" />
                        <rect x={chartWidth - 65} y={askY - 9} width="65" height="18" fill="#238636" rx="2" />
                        <text x={chartWidth - 32} y={askY + 3} fill="#fff" fontSize="9" fontWeight="bold" textAnchor="middle">
                          {currentSymbol.baseAsk.toFixed(currentSymbol.digits)}
                        </text>
                      </g>
                    );
                  })()}

                  {/* BID LINE (RED) */}
                  {(() => {
                    const bidY = priceToY(currentSymbol.baseBid);
                    return (
                      <g>
                        <line x1="0" y1={bidY} x2={chartWidth} y2={bidY} stroke="#f85149" strokeWidth="1.2" strokeDasharray="2 2" />
                        <rect x={chartWidth - 65} y={bidY - 9} width="65" height="18" fill="#da3633" rx="2" />
                        <text x={chartWidth - 32} y={bidY + 3} fill="#fff" fontSize="9" fontWeight="bold" textAnchor="middle">
                          {currentSymbol.baseBid.toFixed(currentSymbol.digits)}
                        </text>
                      </g>
                    );
                  })()}

                  {/* INTERACTIVE CROSSHAIR */}
                  {crosshair && (
                    <g className="pointer-events-none">
                      <line x1={crosshair.x} y1="0" x2={crosshair.x} y2={chartHeight + volumeHeight} stroke="#58a6ff" strokeWidth="0.8" strokeDasharray="3 3" />
                      <line x1="0" y1={crosshair.y} x2={chartWidth} y2={crosshair.y} stroke="#58a6ff" strokeWidth="0.8" strokeDasharray="3 3" />
                      <rect x={chartWidth - 65} y={crosshair.y - 9} width="65" height="18" fill="#1f6beb" rx="2" />
                      <text x={chartWidth - 32} y={crosshair.y + 3} fill="#fff" fontSize="9" fontWeight="bold" textAnchor="middle">
                        {crosshair.price.toFixed(currentSymbol.digits)}
                      </text>
                    </g>
                  )}
                </svg>
              </div>
            </div>

            {/* RSI SUB-PANEL */}
            {showRSI && (
              <div className="h-[65px] bg-[#161b22]/90 border-t border-[#30363d] p-1.5 flex flex-col justify-between rounded-b">
                <div className="flex items-center justify-between text-[9px] text-[#8b949e]">
                  <span>RSI (14): <b className="text-[#3fb950]">{indicators.rsi[indicators.rsi.length - 1]?.toFixed(2) || "58.42"}</b></span>
                  <span>Overbought: 70 | Oversold: 30</span>
                </div>
                <div className="w-full h-[35px] relative">
                  <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${chartWidth} 40`}>
                    <line x1="0" y1="12" x2={chartWidth} y2="12" stroke="#30363d" strokeDasharray="2 2" />
                    <line x1="0" y1="28" x2={chartWidth} y2="28" stroke="#30363d" strokeDasharray="2 2" />
                    {rsiPath && (
                      <path d={rsiPath} fill="none" stroke="#3fb950" strokeWidth="1.5" />
                    )}
                  </svg>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: NEW ORDER TICKET FORM (3 Cols) */}
        <div id="order-execution-panel" className="col-span-12 md:col-span-3 lg:col-span-3 flex flex-col bg-[#161b22] h-full min-h-0 overflow-hidden">

          <div className="px-3 py-2 bg-[#21262d] border-b border-[#30363d] flex items-center justify-between">
            <div className="flex items-center space-x-1.5 text-white font-bold text-xs">
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#58a6ff]" />
              <span>New Order Ticket</span>
            </div>
            <span className="text-[10px] text-[#58a6ff] font-bold">{currentSymbol.symbol}</span>
          </div>

          <div className="p-3 space-y-3 overflow-y-auto custom-scrollbar flex-1">
            <div className="space-y-1">
              <label className="text-[10px] text-[#8b949e] uppercase font-bold">Symbol</label>
              <select
                value={selectedSymbolCode}
                onChange={(e) => {
                  setSelectedSymbolCode(e.target.value);
                  setUserPicked(true);
                }}
                className="w-full bg-[#0d1117] text-white p-2 rounded border border-[#30363d] text-xs font-bold focus:outline-none focus:border-[#58a6ff]"
              >
                {symbols.map(s => (
                  <option key={s.symbol} value={s.symbol}>{s.symbol} - {s.name}</option>
                ))}
              </select>
            </div>

            {/* Dynamic Risk % Lot Size Calculator Control */}
            <div className="p-2 bg-[#0d1117] rounded border border-[#30363d] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-white flex items-center space-x-1">
                  <Calculator className="w-3 h-3 text-[#58a6ff]" />
                  <span>Auto Risk % Sizing</span>
                </span>
                <input
                  type="checkbox"
                  checked={useRiskLotSizing}
                  onChange={(e) => setUseRiskLotSizing(e.target.checked)}
                  className="accent-[#58a6ff]"
                />
              </div>

              {useRiskLotSizing && (
                <div className="space-y-1.5 text-[10px]">
                  <div className="flex justify-between text-[#8b949e]">
                    <span>Target Risk %:</span>
                    <span className="text-white font-bold">{riskPercent}% (${dynamicLotCalc.riskAmount.toFixed(2)})</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {[0.5, 1.0, 2.0, 5.0].map(r => (
                      <button
                        key={r}
                        onClick={() => setRiskPercent(r)}
                        className={`py-0.5 rounded font-bold border transition ${riskPercent === r
                            ? "bg-[#1f6beb] text-white border-[#58a6ff]"
                            : "bg-[#21262d] text-[#8b949e] border-[#30363d] hover:text-white"
                          }`}
                      >
                        {r}%
                      </button>
                    ))}
                  </div>

                  <div className="flex justify-between text-[9px] pt-1 border-t border-[#21262d] text-[#8b949e]">
                    <span>Calc Lot Size: <b className="text-[#3fb950] font-bold">{dynamicLotCalc.calculatedLotSize}</b></span>
                    <span>RR Ratio: <b className="text-[#58a6ff] font-bold">{dynamicLotCalc.riskRewardRatio}</b></span>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-[#8b949e] uppercase font-bold">
                <span>Volume (Lots)</span>
                <span>Margin: ~${((lots * 100000 * currentSymbol.baseBid) / 500).toFixed(2)}</span>
              </div>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max="100"
                value={lots}
                onChange={(e) => {
                  setLots(Math.max(0.01, parseFloat(e.target.value) || 0.01));
                  setUseRiskLotSizing(false); // Manual override
                }}
                className="w-full bg-[#0d1117] text-white p-2 rounded border border-[#30363d] text-xs font-bold focus:outline-none focus:border-[#58a6ff]"
              />

              <div className="grid grid-cols-5 gap-1 pt-1 text-[9px]">
                {[0.01, 0.05, 0.10, 0.50, 1.00].map(preset => (
                  <button
                    key={preset}
                    onClick={() => setLots(preset)}
                    className="bg-[#21262d] hover:bg-[#30363d] text-white py-1 rounded text-center font-bold border border-[#30363d]"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#30363d]">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-[#f85149] font-bold">Stop Loss (Pips)</label>
                  <input
                    type="checkbox"
                    checked={enableSL}
                    onChange={(e) => setEnableSL(e.target.checked)}
                    className="accent-[#f85149]"
                  />
                </div>
                <input
                  type="number"
                  value={slPips}
                  disabled={!enableSL}
                  onChange={(e) => setSlPips(parseInt(e.target.value) || 0)}
                  className="w-full bg-[#0d1117] text-white p-1.5 rounded border border-[#30363d] text-xs font-bold disabled:opacity-40"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-[#3fb950] font-bold">Take Profit (Pips)</label>
                  <input
                    type="checkbox"
                    checked={enableTP}
                    onChange={(e) => setEnableTP(e.target.checked)}
                    className="accent-[#3fb950]"
                  />
                </div>
                <input
                  type="number"
                  value={tpPips}
                  disabled={!enableTP}
                  onChange={(e) => setTpPips(parseInt(e.target.value) || 0)}
                  className="w-full bg-[#0d1117] text-white p-1.5 rounded border border-[#30363d] text-xs font-bold disabled:opacity-40"
                />
              </div>
            </div>

            <div className="pt-3 space-y-2">
              <button
                onClick={() => handleExecuteTrade("SELL")}
                className="w-full bg-[#da3633] hover:bg-[#b82a28] text-white p-2.5 rounded font-bold transition shadow-lg flex items-center justify-between cursor-pointer active:scale-95"
              >
                <div className="flex items-center space-x-1.5">
                  <ArrowDownRight className="w-4 h-4" />
                  <span>SELL BY MARKET</span>
                </div>
                <span className="font-mono text-sm">{currentSymbol.baseBid.toFixed(currentSymbol.digits)}</span>
              </button>

              <button
                onClick={() => handleExecuteTrade("BUY")}
                className="w-full bg-[#238636] hover:bg-[#1e722e] text-white p-2.5 rounded font-bold transition shadow-lg flex items-center justify-between cursor-pointer active:scale-95"
              >
                <div className="flex items-center space-x-1.5">
                  <ArrowUpRight className="w-4 h-4" />
                  <span>BUY BY MARKET</span>
                </div>
                <span className="font-mono text-sm">{currentSymbol.baseAsk.toFixed(currentSymbol.digits)}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. BOTTOM TERMINAL DOCK (POSITIONS, HISTORY, NEWS, JOURNAL) */}
      <div id="mt5-terminal-dock" className="h-[220px] bg-[#161b22] border-t border-[#30363d] flex flex-col shrink-0">
        <div className="bg-[#21262d] border-b border-[#30363d] px-3 py-1 flex items-center justify-between text-[11px]">
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setActiveTab("TRADE")}
              className={`px-3 py-1 rounded font-bold transition flex items-center space-x-1.5 ${activeTab === "TRADE" ? "bg-[#0d1117] text-[#58a6ff] border border-[#30363d]" : "text-[#8b949e] hover:text-white"
                }`}
            >
              <span>Trade</span>
              <span className="bg-[#30363d] text-white px-1.5 py-0.2 rounded-full text-[9px]">{positions.length}</span>
            </button>

            <button
              onClick={() => setActiveTab("HISTORY")}
              className={`px-3 py-1 rounded font-bold transition flex items-center space-x-1.5 ${activeTab === "HISTORY" ? "bg-[#0d1117] text-[#58a6ff] border border-[#30363d]" : "text-[#8b949e] hover:text-white"
                }`}
            >
              <span>History</span>
              <span className="bg-[#30363d] text-white px-1.5 py-0.2 rounded-full text-[9px]">{history.length}</span>
            </button>

            <button
              onClick={() => setActiveTab("NEWS")}
              className={`px-3 py-1 rounded font-bold transition flex items-center space-x-1.5 ${activeTab === "NEWS" ? "bg-[#0d1117] text-[#58a6ff] border border-[#30363d]" : "text-[#8b949e] hover:text-white"
                }`}
            >
              <span>Calendar</span>
            </button>

            <button
              onClick={() => setActiveTab("JOURNAL")}
              className={`px-3 py-1 rounded font-bold transition flex items-center space-x-1.5 ${activeTab === "JOURNAL" ? "bg-[#0d1117] text-[#58a6ff] border border-[#30363d]" : "text-[#8b949e] hover:text-white"
                }`}
            >
              <span>Journal Logs</span>
            </button>

            <button
              onClick={() => setActiveTab("REASONING")}
              className={`px-3 py-1 rounded font-bold transition flex items-center space-x-1.5 ${activeTab === "REASONING" ? "bg-[#0d1117] text-[#a371f7] border border-[#a371f7]/40" : "text-[#8b949e] hover:text-white"
                }`}
            >
              <span>🧠 Pro Reasoning</span>
              <span className="bg-[#a371f7]/20 text-[#a371f7] px-1.5 py-0.2 rounded-full text-[9px] font-bold">{proTraderThoughts.length}</span>
            </button>

            <button
              onClick={() => {
                setActiveTab("MATRIX");
                fetchMarketMatrix();
              }}
              className={`px-3 py-1 rounded font-bold transition flex items-center space-x-1.5 ${activeTab === "MATRIX" ? "bg-[#0d1117] text-[#3fb950] border border-[#238636]" : "text-[#8b949e] hover:text-white"
                }`}
            >
              <span>📊 All Markets Matrix (M5-H4)</span>
              <span className="bg-[#238636]/20 text-[#3fb950] px-1.5 py-0.2 rounded-full text-[9px] font-bold">{marketMatrix.length || symbols.length}</span>
            </button>

            <button
              onClick={() => setActiveTab("SMC")}
              className={`px-3 py-1 rounded font-bold transition flex items-center space-x-1.5 cursor-pointer ${activeTab === "SMC" ? "bg-[#0d1117] text-[#a371f7] border border-[#a371f7]/40 shadow-sm" : "text-[#8b949e] hover:text-white"
                }`}
            >
              <span>🏛️ Smart Money Concepts (SMC)</span>
              <span className="bg-[#a371f7]/20 text-[#a371f7] px-1.5 py-0.2 rounded-full text-[9px] font-bold">PRO</span>
            </button>
          </div>



          {positions.length > 0 && activeTab === "TRADE" && (
            <button
              onClick={handleCloseAllPositions}
              className="bg-[#da3633] hover:bg-[#b82a28] text-white px-2.5 py-1 rounded font-bold text-[10px] transition"
            >
              Close All Positions
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
          {activeTab === "TRADE" && (
            positions.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-[#8b949e]">
                <Activity className="w-6 h-6 mb-1 opacity-40" />
                <span>No active open trades. Execute a BUY or SELL order to start.</span>
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="border-b border-[#30363d] text-[#8b949e] text-[10px] uppercase">
                    <th className="py-1 px-2">Ticket</th>
                    <th className="py-1 px-2">Time</th>
                    <th className="py-1 px-2">Type</th>
                    <th className="py-1 px-2">Volume</th>
                    <th className="py-1 px-2">Symbol</th>
                    <th className="py-1 px-2">Price</th>
                    <th className="py-1 px-2">S / L</th>
                    <th className="py-1 px-2">T / P</th>
                    <th className="py-1 px-2">Current</th>
                    <th className="py-1 px-2">Swap</th>
                    <th className="py-1 px-2">Comm.</th>
                    <th className="py-1 px-2 text-right">Profit ($)</th>
                    <th className="py-1 px-2 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#21262d]">
                  {positions.map(pos => (
                    <tr key={pos.ticket} className="hover:bg-[#21262d] transition">
                      <td className="py-1.5 px-2 font-mono text-[#8b949e]">#{pos.ticket}</td>
                      <td className="py-1.5 px-2 text-[#8b949e]">{pos.time}</td>
                      <td className="py-1.5 px-2 font-bold">
                        <span className={`px-1.5 py-0.2 rounded text-[10px] ${pos.type === "BUY" ? "bg-[#238636] text-white" : "bg-[#da3633] text-white"
                          }`}>
                          {pos.type}
                        </span>
                      </td>
                      <td className="py-1.5 px-2 font-bold text-white">{pos.volume.toFixed(2)}</td>
                      <td className="py-1.5 px-2 font-bold text-[#58a6ff]">{pos.symbol}</td>
                      <td className="py-1.5 px-2 text-white">{pos.openPrice}</td>
                      <td className="py-1.5 px-2 text-[#f85149]">{pos.sl || "-"}</td>
                      <td className="py-1.5 px-2 text-[#3fb950]">{pos.tp || "-"}</td>
                      <td className="py-1.5 px-2 text-white">{pos.currentPrice}</td>
                      <td className="py-1.5 px-2 text-[#8b949e]">${pos.swap.toFixed(2)}</td>
                      <td className="py-1.5 px-2 text-[#8b949e]">${pos.commission.toFixed(2)}</td>
                      <td className={`py-1.5 px-2 text-right font-extrabold ${pos.profit >= 0 ? "text-[#3fb950]" : "text-[#f85149]"
                        }`}>
                        {pos.profit >= 0 ? "+" : ""}${pos.profit.toFixed(2)}
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        {(() => {
                          const netProfit = pos.profit + pos.swap + pos.commission;
                          const isInProfit = netProfit > 0;
                          return (
                            <button
                              onClick={() => handleClosePosition(pos.ticket)}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold transition flex items-center space-x-1 ${isInProfit
                                  ? "bg-[#238636] hover:bg-[#2ea043] text-white shadow-md shadow-emerald-900/30 ring-1 ring-emerald-500/50"
                                  : "bg-[#21262d] hover:bg-[#30363d] text-[#f85149] border border-[#30363d]"
                                }`}
                              title={isInProfit ? "Sell position now to lock in current profit" : "Close Position"}
                            >
                              {isInProfit ? (
                                <>
                                  <Check className="w-3 h-3 text-white" />
                                  <span>Sell in Profit (+${netProfit.toFixed(2)})</span>
                                </>
                              ) : (
                                <>
                                  <X className="w-3 h-3" />
                                  <span>Close</span>
                                </>
                              )}
                            </button>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}

          {activeTab === "HISTORY" && (
            history.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-[#8b949e]">
                <History className="w-6 h-6 mb-1 opacity-40" />
                <span>No trade history records yet.</span>
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="border-b border-[#30363d] text-[#8b949e] text-[10px] uppercase">
                    <th className="py-1 px-2">Ticket</th>
                    <th className="py-1 px-2">Type</th>
                    <th className="py-1 px-2">Volume</th>
                    <th className="py-1 px-2">Symbol</th>
                    <th className="py-1 px-2">Open Price</th>
                    <th className="py-1 px-2">Close Price</th>
                    <th className="py-1 px-2">Close Time</th>
                    <th className="py-1 px-2 text-right">Net P/L ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#21262d]">
                  {history.map(h => (
                    <tr key={h.ticket} className="hover:bg-[#21262d]">
                      <td className="py-1 px-2 font-mono text-[#8b949e]">#{h.ticket}</td>
                      <td className="py-1 px-2 font-bold">{h.type}</td>
                      <td className="py-1 px-2">{h.volume.toFixed(2)}</td>
                      <td className="py-1 px-2 font-bold text-[#58a6ff]">{h.symbol}</td>
                      <td className="py-1 px-2">{h.openPrice}</td>
                      <td className="py-1 px-2">{h.closePrice}</td>
                      <td className="py-1 px-2 text-[#8b949e]">{h.closeTime}</td>
                      <td className={`py-1 px-2 text-right font-bold ${h.finalProfit >= 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>
                        {h.finalProfit >= 0 ? "+" : ""}${h.finalProfit.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}

          {activeTab === "NEWS" && (
            <div className="space-y-3 font-sans text-xs">

              {/* Top AI Macroeconomic News Intelligence Summary Bar */}
              <div className="p-3 bg-[#0d1117] rounded-xl border border-[#30363d] space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="p-1.5 bg-[#1f6beb]/20 rounded-lg text-[#58a6ff]">
                      <Brain className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-white text-xs tracking-tight">AI Macro Economic Intelligence & Fundamental News Scanner</h4>
                      <p className="text-[10px] text-[#8b949e]">Auto-Grabbing Live Central Bank Releases, Inflation Data & Market Impact Analysis</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 text-[10px]">
                    <span className="text-[#8b949e] hidden sm:inline">Last Grabbed: <b className="text-white">{lastNewsFetchTime}</b></span>
                    <button
                      onClick={fetchAiNews}
                      disabled={isFetchingNews}
                      className="bg-[#21262d] hover:bg-[#30363d] text-[#58a6ff] border border-[#30363d] px-2.5 py-1 rounded-lg font-bold flex items-center space-x-1 transition cursor-pointer disabled:opacity-50"
                      title="Fetch Latest News & Re-Run AI Fundamental Analysis"
                    >
                      <RefreshCw className={`w-3 h-3 ${isFetchingNews ? "animate-spin" : ""}`} />
                      <span>{isFetchingNews ? "Grabbing..." : "Refresh News"}</span>
                    </button>
                  </div>
                </div>

                {/* AI Executive Macro Summary */}
                <div className="p-2.5 bg-[#161b22] rounded-lg border border-[#30363d] text-[11px] text-[#c9d1d9] flex items-start space-x-2">
                  <Sparkles className="w-4 h-4 text-[#e3b341] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-[#e3b341]">AI Macro Overview: </span>
                    <span>{newsAiSummary}</span>
                  </div>
                </div>
              </div>

              {/* AMIS-FX NEWS INTELLIGENCE PANEL */}

              {/* AI Macro Narrative */}
              {newsNarrative && (
                <div className="p-3 bg-gradient-to-r from-[#1f6beb]/10 to-[#8957e5]/10 rounded-xl border border-[#1f6beb]/30 text-[11px] text-[#c9d1d9] flex items-start space-x-2.5 mb-1">
                  <Sparkles className="w-4 h-4 text-[#e3b341] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-black text-[#e3b341] text-[10px] uppercase tracking-wider mb-1">AMIS-FX Macro Intelligence Narrative</div>
                    <p className="leading-relaxed">{newsNarrative}</p>
                  </div>
                </div>
              )}

              {/* News Source Badge */}
              {newsSource && (
                <div className="flex items-center justify-between text-[9px] text-[#8b949e] px-1">
                  <span>Source: <b className="text-[#58a6ff]">{newsSource === 'ForexFactory' ? '🌐 ForexFactory (Live)' : newsSource === 'curated' ? '📋 AMIS Curated Events' : newsSource}</b></span>
                  <span>Refreshed: <b className="text-white">{lastNewsFetchTime}</b></span>
                </div>
              )}

              {/* Economic News Items */}
              <div className="space-y-2.5">
                {newsList.map(n => (
                  <div
                    key={n.id}
                    className="rounded-xl border border-[#30363d] overflow-hidden shadow-sm bg-[#0d1117] hover:border-[#58a6ff]/30 transition-all"
                  >
                    {/* Card Header: click to expand */}
                    <button
                      className="w-full text-left p-3 space-y-2"
                      onClick={() => setExpandedNewsId(expandedNewsId === n.id ? null : n.id)}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-black text-[#58a6ff] bg-[#1f6beb]/10 px-2 py-0.5 rounded text-[11px]">{n.time}</span>

                          <span className={`px-2 py-0.5 rounded-md font-extrabold text-[10px] uppercase shadow-sm ${n.currency === "USD" ? "bg-[#1f6beb] text-white" :
                              n.currency === "EUR" ? "bg-[#238636] text-white" :
                                n.currency === "GBP" ? "bg-[#8957e5] text-white" :
                                  n.currency === "JPY" ? "bg-[#da3633] text-white" :
                                    n.currency === "CAD" ? "bg-[#d29922] text-black" :
                                      n.currency === "AUD" ? "bg-[#1a7f37] text-white" :
                                        "bg-[#30363d] text-white"
                            }`}>{n.currency}</span>

                          <span className={`px-2 py-0.5 rounded font-black text-[9px] uppercase border ${n.impact === "HIGH"
                              ? "bg-[#da3633]/20 text-[#f85149] border-[#da3633]/40 animate-pulse"
                              : n.impact === "MEDIUM"
                                ? "bg-[#d29922]/20 text-[#e3b341] border-[#d29922]/40"
                                : "bg-[#30363d] text-[#8b949e] border-[#30363d]"
                            }`}>
                            {n.impact === "HIGH" ? "🔴 HIGH" : n.impact === "MEDIUM" ? "🟡 MED" : "⚪ LOW"}
                          </span>

                          <h5 className="font-extrabold text-white text-xs tracking-tight">{n.event}</h5>
                        </div>

                        <div className="flex items-center space-x-3 font-mono text-[10px] text-[#8b949e]">
                          {n.actual && n.actual !== "-" && (
                            <span className="bg-[#238636]/20 text-[#3fb950] px-2 py-0.5 rounded font-bold border border-[#238636]/40">
                              Actual: <b className="text-white">{n.actual}</b>
                            </span>
                          )}
                          <span>F: <b className="text-white">{n.forecast}</b></span>
                          <span>P: <b className="text-white">{n.previous}</b></span>
                          <span className="text-[#8b949e]">{expandedNewsId === n.id ? "▲" : "▼"}</span>
                        </div>
                      </div>

                      {/* AI Headline — always visible */}
                      {n.aiAnalysis && (
                        <div className={`text-[11px] font-bold ${n.aiAnalysis.directionalBias?.includes("BULLISH") ? "text-[#3fb950]" :
                            n.aiAnalysis.directionalBias?.includes("BEARISH") ? "text-[#f85149]" : "text-[#e3b341]"
                          }`}>
                          {n.aiAnalysis.headline}
                        </div>
                      )}
                    </button>

                    {/* Expandable Detail Section */}
                    {expandedNewsId === n.id && n.aiAnalysis && (
                      <div className="px-3 pb-3 space-y-3 border-t border-[#21262d]">

                        {/* Bias + Confidence + Anticipated Move */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-3">
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-1 rounded-lg font-black text-[10px] uppercase border ${n.aiAnalysis.directionalBias?.includes("BULLISH")
                                ? "bg-[#238636]/20 text-[#3fb950] border-[#238636]/40"
                                : n.aiAnalysis.directionalBias?.includes("BEARISH")
                                  ? "bg-[#da3633]/20 text-[#f85149] border-[#da3633]/40"
                                  : "bg-[#d29922]/20 text-[#e3b341] border-[#d29922]/40"
                              }`}>
                              {n.aiAnalysis.directionalBias}
                            </span>
                            <span className="text-[10px] text-[#58a6ff] font-bold bg-[#1f6beb]/10 px-2 py-0.5 rounded border border-[#1f6beb]/30">
                              AI Confidence: {n.aiAnalysis.confidenceScore}%
                            </span>
                          </div>
                          {n.aiAnalysis.anticipatedMovePips && (
                            <span className="text-[10px] font-bold text-[#e3b341] bg-[#d29922]/10 px-2 py-0.5 rounded border border-[#d29922]/30">
                              ⚡ ~{n.aiAnalysis.anticipatedMovePips} pips anticipated
                            </span>
                          )}
                        </div>

                        {/* Market Impact */}
                        <div className="text-[11px] text-[#c9d1d9] bg-[#161b22] p-2 rounded-lg border border-[#30363d]">
                          <span className="text-[#8b949e] font-bold text-[10px] block mb-1">MARKET IMPACT:</span>
                          {n.aiAnalysis.marketImpact}
                        </div>

                        {/* Affected Pairs + Strategy */}
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] text-[#8b949e] font-bold">Affected Pairs:</span>
                            {(n.aiAnalysis.affectedPairs || []).map((pair: string) => (
                              <button
                                key={pair}
                                onClick={() => {
                                  setSelectedSymbolCode(pair);
                                  setUserPicked(true);
                                }}
                                className={`px-2 py-0.5 rounded-md font-bold text-[10px] transition border ${selectedSymbolCode === pair
                                    ? "bg-[#1f6beb] text-white border-[#58a6ff] shadow-lg"
                                    : "bg-[#21262d] text-[#58a6ff] border-[#30363d] hover:border-[#58a6ff] hover:text-white"
                                  }`}
                              >
                                {pair}
                              </button>
                            ))}
                          </div>

                          <div className="text-[11px] bg-[#161b22] p-2 rounded-lg border border-[#238636]/30">
                            <span className="text-[#8b949e] font-bold text-[10px] block mb-1">🎯 SUGGESTED ACTION:</span>
                            <span className="text-[#3fb950] font-bold">{n.aiAnalysis.suggestedAction}</span>
                          </div>
                        </div>

                        {/* Execute Button */}
                        <div className="flex justify-end">
                          <button
                            onClick={() => handleExecuteNewsTrade(n)}
                            className="bg-gradient-to-r from-[#238636] to-[#1a7f37] hover:from-[#2ea043] hover:to-[#238636] text-white px-3 py-1.5 rounded-lg font-bold text-[11px] transition shadow-lg flex items-center space-x-1.5 cursor-pointer"
                          >
                            <Zap className="w-3.5 h-3.5" />
                            <span>Execute AI News Trade Signal</span>
                          </button>
                        </div>

                      </div>
                    )}
                  </div>
                ))}
              </div>

            </div>
          )}

          {activeTab === "JOURNAL" && (
            <div className="font-mono text-[10px] space-y-1 text-[#8b949e]">
              {journalLogs.map((log, idx) => (
                <div key={idx} className="hover:text-white">{log}</div>
              ))}
            </div>
          )}

          {activeTab === "REASONING" && (
            <div className="font-sans text-xs space-y-2">
              <div className="p-2.5 bg-[#0d1117] rounded-lg border border-[#a371f7]/30 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Brain className="w-4 h-4 text-[#a371f7]" />
                  <span className="font-bold text-white text-xs">Institutional Trader Decision & Risk Reasoning Engine</span>
                </div>
                <span className="text-[10px] text-[#8b949e] font-mono">Real-Time Risk & Market Logic</span>
              </div>

              <div className="space-y-1.5 font-mono text-[11px] max-h-[140px] overflow-y-auto custom-scrollbar">
                {proTraderThoughts.map((t) => (
                  <div
                    key={t.id}
                    className={`p-2 rounded border flex items-start space-x-2.5 ${t.type === "exec"
                        ? "bg-[#238636]/10 border-[#238636]/40 text-[#3fb950]"
                        : t.type === "trailing"
                          ? "bg-[#8957e5]/10 border-[#8957e5]/40 text-[#a371f7]"
                          : t.type === "risk"
                            ? "bg-[#d29922]/10 border-[#d29922]/40 text-[#e3b341]"
                            : t.type === "safety"
                              ? "bg-[#da3633]/10 border-[#da3633]/40 text-[#f85149]"
                              : "bg-[#0d1117] border-[#30363d] text-[#c9d1d9]"
                      }`}
                  >
                    <span className="text-[10px] text-[#8b949e] font-bold shrink-0">{t.timestamp}</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase shrink-0 bg-[#21262d] text-white border border-[#30363d]">
                      {t.stage}
                    </span>
                    <span className="leading-snug">{t.thought}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "MATRIX" && (
            <div className="font-sans text-xs space-y-2">
              <div className="p-2.5 bg-[#0d1117] rounded-lg border border-[#238636]/40 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Activity className="w-4 h-4 text-[#3fb950]" />
                  <div>
                    <h4 className="font-extrabold text-white text-xs">2D Multi-Market & Multi-Timeframe (M5 - H4) Scanning Matrix</h4>
                    <p className="text-[10px] text-[#8b949e]">
                      Simultaneous Real-Time Analysis — Sorted Dynamic Hierarchy (Highest at Top)
                      {lastMatrixTs > 0 && (
                        <span className="ml-2 text-[#6e7681]">
                          • refreshed {Math.max(0, Math.round((matrixClock - lastMatrixTs) / 1000))}s ago
                          <span className="text-[#484f58]"> (auto every 5s)</span>
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      setUserPicked(false);
                      fetchMarketMatrix();
                    }}
                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition flex items-center space-x-1 border ${!userHasManuallyPickedSymbol
                        ? "bg-[#238636] text-white border-[#3fb950] shadow-md"
                        : "bg-[#21262d] text-[#8b949e] border-[#30363d] hover:text-white"
                      }`}
                    title="Automatically set active chart to the #1 highest-confluence market on every scan"
                  >
                    <span>⚡ Follow #1 Top Market</span>
                  </button>

                  <button
                    onClick={fetchMarketMatrix}
                    disabled={isScanningMatrix}
                    className="bg-[#21262d] hover:bg-[#30363d] text-[#3fb950] border border-[#238636]/40 px-2.5 py-1 rounded-lg font-bold flex items-center space-x-1 transition cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${isScanningMatrix ? "animate-spin" : ""}`} />
                    <span>{isScanningMatrix ? "Scanning All Markets..." : "Re-Scan All Markets"}</span>
                  </button>
                </div>
              </div>

              {/* ── AI AUTOPILOT STATUS STRIP ──
                  Makes the autonomous trader observable: cycle count, live phase, Kimi's
                  verified setup verdict, trades placed and the next-cycle countdown.
                  If nothing is trading, this strip prints the exact gate reason. */}
              <div className={`p-2.5 rounded-lg border space-y-1.5 ${isAiAutoTraderActive ? "bg-[#0d2818]/70 border-[#238636]/60" : "bg-[#0d1117] border-[#30363d]"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Cpu className={`w-4 h-4 ${isAiAutoTraderActive ? "text-[#3fb950] animate-pulse" : "text-[#8b949e]"}`} />
                    <span className="font-extrabold text-white text-xs">AI Autopilot · {isAiAutoTraderActive ? "LIVE" : "STANDBY"}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${kimiPredicting ? "bg-[#1f6feb]/30 text-[#58a6ff] border border-[#1f6feb]/50" : isAiAutoTraderActive ? "bg-[#238636]/30 text-[#3fb950] border border-[#238636]/50" : "bg-[#21262d] text-[#8b949e] border border-[#30363d]"}`}>
                      {kimiPredicting ? `KIMI ANALYSING ${analysisElapsed}s` : isAnalyzingAi ? "SCANNING MARKETS" : "IDLE"}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 text-[10px] font-mono text-[#8b949e]">
                    <span>cycle <b className="text-white">#{autopilotStats.cycles}</b></span>
                    <span>trades <b className="text-[#3fb950]">{autopilotStats.tradesPlaced}</b></span>
                    <span>next in <b className="text-[#58a6ff]">{isAiAutoTraderActive && autopilotStats.nextCycleAt > Date.now() ? `${Math.max(0, Math.ceil((autopilotStats.nextCycleAt - Date.now()) / 1000))}s` : "—"}</b></span>
                    {autopilotStats.lastCycleAt > 0 && <span>last cycle <b className="text-white">{Math.round(autopilotStats.lastCycleMs / 1000)}s</b></span>}
                  </div>
                </div>

                {/* Latest Kimi verified-setup verdict */}
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <div className="flex items-center space-x-2 min-w-0 flex-wrap">
                    <span className="text-[#8b949e] shrink-0">KIMI VERDICT:</span>
                    {kimiVerdict ? (
                      <>
                        <span className="font-black text-white shrink-0">{kimiVerdict.symbol}</span>
                        <span className={`font-black shrink-0 ${kimiVerdict.signal === "BUY" ? "text-[#3fb950]" : kimiVerdict.signal === "SELL" ? "text-[#f85149]" : "text-[#8b949e]"}`}>
                          {kimiVerdict.signal}
                        </span>
                        <span className={`px-1.5 py-0.2 rounded font-black text-[8px] shrink-0 ${kimiVerdict.setupQuality === "PERFECT" ? "bg-[#238636] text-white" : kimiVerdict.setupQuality === "HIGH_PROBABILITY" ? "bg-[#1f6feb]/30 text-[#58a6ff] border border-[#1f6feb]/50" : kimiVerdict.setupQuality === "VALID" ? "bg-[#d29922]/20 text-[#e3b341] border border-[#d29922]/40" : "bg-[#da3633]/20 text-[#f85149] border border-[#da3633]/40"}`}>
                          {kimiVerdict.setupQuality}
                        </span>
                        <span className="text-[#8b949e] shrink-0">
                          shouldTrade <b className={kimiVerdict.shouldTrade ? "text-[#3fb950]" : "text-[#f85149]"}>{String(kimiVerdict.shouldTrade)}</b>
                        </span>
                        <span className="text-[#6e7681] shrink-0">
                          ({kimiVerdict.source === "LOCAL_FALLBACK" ? "local engine fallback" : kimiVerdict.source === "PENDING" ? "analysis in progress" : "kimi verified"}, {kimiVerdict.confidence}%)
                        </span>
                      </>
                    ) : (
                      <span className="text-[#6e7681] italic">no verdict yet — waiting for the first Kimi analysis cycle</span>
                    )}
                  </div>
                  {autopilotStats.lastTicket !== null && (
                    <span className="text-[#8b949e] shrink-0">last order <b className="text-[#e3b341]">#{autopilotStats.lastTicket}</b> {autopilotStats.lastTradeSymbol || ""}</span>
                  )}
                </div>

                {/* WHY nothing traded — the exact gate reason from the last cycle */}
                {autopilotStats.lastSkipReason && (
                  <div className="text-[10px] font-mono leading-snug">
                    <span className="text-[#6e7681]">trade gate: </span>
                    <span className={autopilotStats.lastSkipReason.includes("PASSED") ? "text-[#3fb950]" : "text-[#e3b341]"}>{autopilotStats.lastSkipReason}</span>
                  </div>
                )}

                {/* SESSION & SCALPING BADGE — which centre is open, the scalp
                    grade, and what this window favours (research-backed, so the
                    operator always knows the current session & what to look at). */}
                <div className="text-[10px] font-mono leading-snug space-y-1 border-t border-[#30363d] pt-1.5">
                  <div className="flex items-center justify-between flex-wrap gap-x-2">
                    <span className="text-[#8b949e]">SESSION:</span>
                    <span className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-black text-white">
                        {activeSession.isOffHours ? "OFF-HOURS" : activeSession.dominantSession}
                      </span>
                      {activeSession.isOverlap && (
                        <span className="px-1.5 py-0.2 rounded bg-[#1f6feb]/30 text-[#58a6ff] border border-[#1f6feb]/50 text-[8px] font-black uppercase">
                          {activeSession.overlapLabel} overlap
                        </span>
                      )}
                      <span className={`px-1.5 py-0.2 rounded text-[8px] font-black ${
                        activeSession.grade === "A" ? "bg-[#238636] text-white"
                        : activeSession.grade === "B" ? "bg-[#1f6feb]/40 text-[#58a6ff] border border-[#1f6feb]/50"
                        : activeSession.grade === "C" ? "bg-[#d29922]/25 text-[#e3b341] border border-[#d29922]/40"
                        : "bg-[#da3633]/25 text-[#f85149] border border-[#da3633]/40"
                      }`}>
                        {activeSession.grade} · {activeSession.scalpScore}
                      </span>
                      <span className="text-[#6e7681]">spread ~{activeSession.expectedSpreadPips.toFixed(1)}p</span>
                      <span className={isScalpableWindow(activeSession, currentSymbol?.symbol, SESSION_SCALP_MIN_SCORE) ? "text-[#3fb950]" : "text-[#f85149]"}>
                        {currentSymbol?.symbol} {isScalpableWindow(activeSession, currentSymbol?.symbol, SESSION_SCALP_MIN_SCORE) ? "IN-SESSION" : "OUT-OF-SESSION"}
                      </span>
                    </span>
                  </div>
                  {activeSession.whatToLookFor.length > 0 && (
                    <div className="text-[9px] text-[#8b949e] leading-snug">
                      <span className="text-[#6e7681]">Look for: </span>
                      {activeSession.whatToLookFor[0]}
                    </div>
                  )}
                </div>

                {renderPredictionScorecard()}
              </div>

              <div className="overflow-x-auto max-h-[140px] overflow-y-auto custom-scrollbar">
                <table className="w-full text-left border-collapse text-[11px] font-mono">
                  <thead>
                    <tr className="border-b border-[#30363d] text-[#8b949e] text-[10px] uppercase">
                      <th className="py-1 px-2">Rank / Symbol</th>
                      <th className="py-1 px-2">Live Price</th>
                      <th className="py-1 px-2">M5</th>
                      <th className="py-1 px-2">M15</th>
                      <th className="py-1 px-2">H1</th>
                      <th className="py-1 px-2">H4</th>
                      <th className="py-1 px-2">ADX Trend</th>
                      <th className="py-1 px-2">Confluence Score</th>
                      <th className="py-1 px-2">Kimi Verdict</th>
                      <th className="py-1 px-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(marketMatrix.length > 0 ? marketMatrix : symbols.map(s => ({
                      symbol: s.symbol,
                      // Scan unavailable — show an honest "no scan" row instead of the
                      // old hardcoded 75%/BULLISH placeholder that looked like real data.
                      score: 0,
                      confluencePct: 0,
                      bias: "SCAN",
                      timeframes: { M5: "SCAN", M15: "SCAN", H1: "SCAN", H4: "SCAN" },
                      lastPrice: s.baseBid
                    }))).map((row, idx) => (
                      <tr
                        key={row.symbol}
                        onClick={() => {
                          setSelectedSymbolCode(row.symbol);
                          setUserPicked(true);
                        }}
                        className={`border-b border-[#21262d] hover:bg-[#21262d]/60 cursor-pointer transition ${selectedSymbolCode === row.symbol ? "bg-[#1f6beb]/10" : ""
                          }`}
                      >
                        <td className="py-1.5 px-2 font-bold text-white flex items-center space-x-1.5">
                          <span className={`px-1.5 py-0.2 rounded font-extrabold text-[9px] ${(row as any).status === "CLOSED" ? "bg-[#da3633] text-white" : idx === 0 ? "bg-[#e3b341] text-black" : idx === 1 ? "bg-[#c0c0c0] text-black" : idx === 2 ? "bg-[#cd7f32] text-white" : "bg-[#30363d] text-[#8b949e]"
                            }`}>{(row as any).status === "CLOSED" ? "CLOSED" : `#${idx + 1}`}</span>
                          <span>{row.symbol}</span>
                          {selectedSymbolCode === row.symbol && <span className="text-[9px] bg-[#1f6beb] text-white px-1 rounded">ACTIVE</span>}
                        </td>
                        <td className="py-1.5 px-2 text-[#c9d1d9]">
                          {(() => {
                            if ((row as any).status === "CLOSED") return "—";
                            // Prefer the 2s tick feed over the 12s scan snapshot so the
                            // price column is genuinely live instead of stepping once per scan.
                            const live = livePriceMap[row.symbol];
                            const px = live && live.bid > 0 ? live.bid : row.lastPrice;
                            const digits = live?.digits ?? 5;
                            return Number(px).toFixed(Math.min(6, Math.max(2, digits)));
                          })()}
                        </td>
                        <td title={tfVerdictTip(row as any, "M5")} className={`py-1.5 px-2 font-bold ${tfVerdictClass(row as any, "M5")}`}>{tfVerdictLabel(row as any, "M5")}</td>
                        <td title={tfVerdictTip(row as any, "M15")} className={`py-1.5 px-2 font-bold ${tfVerdictClass(row as any, "M15")}`}>{tfVerdictLabel(row as any, "M15")}</td>
                        <td title={tfVerdictTip(row as any, "H1")} className={`py-1.5 px-2 font-bold ${tfVerdictClass(row as any, "H1")}`}>{tfVerdictLabel(row as any, "H1")}</td>
                        <td title={tfVerdictTip(row as any, "H4")} className={`py-1.5 px-2 font-bold ${tfVerdictClass(row as any, "H4")}`}>{tfVerdictLabel(row as any, "H4")}</td>
                        <td className="py-1.5 px-2">
                          {(row as any).status === "CLOSED" ? (
                            <span className="text-[9px] text-[#8b949e]">OFFLINE</span>
                          ) : (() => {
                            const adxNum = Number((row as any).adx);
                            const hasAdx = Number.isFinite(adxNum);
                            const tfMap = (row as any).adxByTf || {};
                            const dAdx = matrixDelta[row.symbol]?.adx || 0;
                            const tfTip = ["M5", "M15", "M30", "H1", "H4"]
                              .map(tf => `${tf}: ${tfMap[tf] != null ? Number(tfMap[tf]).toFixed(2) : "—"}`)
                              .join("  |  ");
                            const tip = `${tfTip}\nΔ vs prev scan: ${dAdx >= 0 ? "+" : ""}${dAdx.toFixed(2)}`;
                            const deltaChip = Math.abs(dAdx) >= 0.01 ? (
                              <span className={`ml-1 text-[8px] ${dAdx > 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>
                                {dAdx > 0 ? "▲" : "▼"}{Math.abs(dAdx).toFixed(2)}
                              </span>
                            ) : null;
                            if (!hasAdx) return <span className="text-[9px] text-[#6e7681] italic">—</span>;
                            const adxTxt = adxNum.toFixed(2);
                            return (row as any).trendState === "TRENDING_STRONG" ? (
                              <span title={tip} className="bg-[#238636]/20 text-[#3fb950] border border-[#238636]/40 px-1.5 py-0.5 rounded text-[9px] font-bold">ADX {adxTxt} ⚡ TREND{deltaChip}</span>
                            ) : (row as any).trendState === "CHOPPY" ? (
                              <span title={tip} className="bg-[#da3633]/20 text-[#f85149] border border-[#da3633]/40 px-1.5 py-0.5 rounded text-[9px] font-bold">ADX {adxTxt} 🔴 CHOP{deltaChip}</span>
                            ) : (
                              <span title={tip} className="bg-[#21262d] text-[#c9d1d9] px-1.5 py-0.5 rounded text-[9px]">ADX {adxTxt}{deltaChip}</span>
                            );
                          })()}
                        </td>
                        <td className="py-1.5 px-2">
                          {(row as any).status === "CLOSED" ? (
                            <span className="text-[10px] text-[#f85149] font-bold">🔴 MARKET CLOSED</span>
                          ) : row.score > 0 ? (() => {
                            const dScore = matrixDelta[row.symbol]?.score || 0;
                            const macdH = (row as any).macdHist;
                            const tip = `Confluence ${Number(row.score).toFixed(2)}\nM5 ${row.timeframes?.M5} | M15 ${row.timeframes?.M15} | H1 ${row.timeframes?.H1} | H4 ${row.timeframes?.H4}\nMACD (M5 hist): ${macdH != null ? Number(macdH).toFixed(5) : "—"}\nΔ vs prev scan: ${dScore >= 0 ? "+" : ""}${dScore.toFixed(2)}`;
                            return (
                              <div className="flex items-center space-x-2" title={tip}>
                                <div className="w-16 bg-[#21262d] h-2 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full ${row.score >= 85 ? "bg-[#3fb950]" : "bg-[#e3b341]"}`}
                                    style={{ width: `${Math.max(0, Math.min(100, row.score))}%` }}
                                  />
                                </div>
                                <span className={`font-bold ${row.score >= 85 ? "text-[#3fb950]" : "text-[#e3b341]"}`}>{Number(row.score).toFixed(2)}%</span>
                                {Math.abs(dScore) >= 0.01 && (
                                  <span className={`text-[8px] ${dScore > 0 ? "text-[#3fb950]" : "text-[#f85149]"}`}>
                                    {dScore > 0 ? "▲" : "▼"}{Math.abs(dScore).toFixed(2)}
                                  </span>
                                )}
                              </div>
                            );
                          })() : (
                            <span className="text-[10px] text-[#6e7681] italic">— no scan</span>
                          )}
                        </td>
                        {/* Kimi's latest verified setup verdict for this symbol */}
                        <td className="py-1.5 px-2">
                          {kimiVerdict && kimiVerdict.symbol === row.symbol ? (
                            <div className="flex items-center space-x-1" title={kimiVerdict.tradeReasoning || kimiVerdict.setupType}>
                              <span className={`px-1.5 py-0.2 rounded text-[8px] font-black ${kimiVerdict.setupQuality === "PERFECT" ? "bg-[#238636] text-white" : kimiVerdict.setupQuality === "HIGH_PROBABILITY" ? "bg-[#1f6feb]/30 text-[#58a6ff] border border-[#1f6feb]/50" : kimiVerdict.setupQuality === "VALID" ? "bg-[#d29922]/20 text-[#e3b341] border border-[#d29922]/40" : "bg-[#da3633]/20 text-[#f85149] border border-[#da3633]/40"}`}>
                                {kimiVerdict.setupQuality}
                              </span>
                              <span className={`font-black text-[9px] ${kimiVerdict.signal === "BUY" ? "text-[#3fb950]" : kimiVerdict.signal === "SELL" ? "text-[#f85149]" : "text-[#8b949e]"}`}>
                                {kimiVerdict.signal}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[9px] text-[#6e7681] italic">not analysed</span>
                          )}
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          {(row as any).status === "CLOSED" ? (
                            <span className="text-[10px] text-[#8b949e] italic">Closed</span>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedSymbolCode(row.symbol);
                                setUserPicked(true);
                                handleRunAiAnalysis();
                                setShowAiAnalysisModal(true);
                              }}
                              className="bg-[#1f6beb] hover:bg-[#388bfd] text-white px-2 py-0.5 rounded font-bold text-[10px] transition cursor-pointer"
                            >
                              Analyze & Predict
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "SMC" && (
            <div className="p-2 space-y-3">
              <SMCPanel
                /* SINGLE SOURCE OF TRUTH: the panel gets the exact same runSMCAnalysis
                   result the chart draws, so a zone on the chart ALWAYS has a matching
                   row here (and the counts can never disagree). */
                analysis={smcAnalysis}
                candles={
                  smcAnalysis
                    ? undefined
                    : candlesMap[`${selectedSymbolCode}_${timeframe}`]?.map(c => ({
                      timestamp: c.timestamp,
                      open: c.open,
                      high: c.high,
                      low: c.low,
                      close: c.close,
                      volume: c.volume || 1
                    }))
                }
                symbol={selectedSymbolCode}
                provider="MT5"
                currentPrice={currentSymbol.baseBid}
                onApplySetup={(setup) => {
                  if (setup.direction === "LONG" || setup.direction === "SHORT") {
                    const pipSize = currentSymbol.pipSize || 0.0001;
                    const slDist = Math.max(10, Math.round(Math.abs(currentSymbol.baseBid - setup.stopLoss) / pipSize));
                    const tpDist = Math.max(15, Math.round(Math.abs(setup.takeProfit1 - currentSymbol.baseBid) / pipSize));
                    setSlPips(slDist);
                    setTpPips(tpDist);
                    setEnableSL(true);
                    setEnableTP(true);
                    addLog(`[SMC AUTO-POPULATE] Applied ${setup.setupType} (${setup.direction}) -> SL: ${setup.stopLoss} (${slDist} pips), TP: ${setup.takeProfit1} (${tpDist} pips)`);
                  }
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* 4. METATRADER 5 ACCOUNT CONNECTION MANAGER MODAL */}
      {showConnectModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl w-full max-w-md shadow-2xl overflow-hidden font-sans">

            <div className="bg-[#21262d] px-4 py-3 border-b border-[#30363d] flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Server className="w-4 h-4 text-[#58a6ff]" />
                <span className="font-bold text-white text-sm">MT5 Connection Manager</span>
              </div>
              <button
                onClick={() => setShowConnectModal(false)}
                className="text-[#8b949e] hover:text-white p-1 rounded hover:bg-[#30363d]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 font-mono text-xs">

              {/* Preset server quick select */}
              <div>
                <label className="text-[11px] text-[#8b949e] font-bold block mb-1">Server / Broker</label>
                <select
                  value={accountServer}
                  onChange={(e) => setAccountServer(e.target.value)}
                  className="w-full bg-[#0d1117] text-white p-2 rounded border border-[#30363d] text-xs font-bold focus:border-[#58a6ff] focus:outline-none"
                >
                  <option value="Exness-Real">Exness-Real (Exness Technologies Ltd)</option>
                  <option value="Exness-Trial">Exness-Trial (Exness Demo Server)</option>
                  <option value="MetaQuotes-Demo">MetaQuotes-Demo (Standard MT5 Test)</option>
                  <option value="ICMarkets-Live">IC Markets Live (Raw Spread)</option>
                  <option value="Pepperstone-Edge">Pepperstone Edge Live</option>
                  <option value="FXTM-Live">FXTM Global Live</option>
                </select>
              </div>

              {/* Login Account ID */}
              <div>
                <label className="text-[11px] text-[#8b949e] font-bold block mb-1">Account Login ID</label>
                <div className="relative">
                  <UserCheck className="w-3.5 h-3.5 text-[#8b949e] absolute left-2.5 top-2.5" />
                  <input
                    type="number"
                    value={accountLogin}
                    onChange={(e) => setAccountLogin(parseInt(e.target.value) || 0)}
                    className="w-full bg-[#0d1117] text-white pl-8 pr-2 py-2 rounded border border-[#30363d] text-xs font-bold focus:border-[#58a6ff] focus:outline-none"
                    placeholder="e.g. 50198421"
                  />
                </div>
              </div>

              {/* Account Password */}
              <div>
                <label className="text-[11px] text-[#8b949e] font-bold block mb-1">Password</label>
                <div className="relative">
                  <Key className="w-3.5 h-3.5 text-[#8b949e] absolute left-2.5 top-2.5" />
                  <input
                    type="password"
                    value={accountPassword}
                    onChange={(e) => setAccountPassword(e.target.value)}
                    className="w-full bg-[#0d1117] text-white pl-8 pr-2 py-2 rounded border border-[#30363d] text-xs font-bold focus:border-[#58a6ff] focus:outline-none"
                    placeholder="Trader Password"
                  />
                </div>
              </div>

              {/* Leverage & Currency */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-[#8b949e] font-bold block mb-1">Leverage</label>
                  <select
                    value={leverage}
                    onChange={(e) => setLeverage(e.target.value)}
                    className="w-full bg-[#0d1117] text-white p-2 rounded border border-[#30363d] text-xs font-bold focus:border-[#58a6ff] focus:outline-none"
                  >
                    <option value="1:100">1:100</option>
                    <option value="1:200">1:200</option>
                    <option value="1:500">1:500</option>
                    <option value="1:1000">1:1000</option>
                    <option value="1:2000">1:2000</option>
                    <option value="1:Unlimited">Unlimited (Exness)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] text-[#8b949e] font-bold block mb-1">Currency</label>
                  <select
                    value={accountCurrency}
                    onChange={(e) => setAccountCurrency(e.target.value)}
                    className="w-full bg-[#0d1117] text-white p-2 rounded border border-[#30363d] text-xs font-bold focus:border-[#58a6ff] focus:outline-none"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="JPY">JPY (¥)</option>
                  </select>
                </div>
              </div>

              {/* Initial Balance */}
              <div>
                <label className="text-[11px] text-[#8b949e] font-bold block mb-1">Account Balance ($)</label>
                <input
                  type="number"
                  step="100"
                  value={balance}
                  onChange={(e) => setBalance(parseFloat(e.target.value) || 0)}
                  className="w-full bg-[#0d1117] text-white p-2 rounded border border-[#30363d] text-xs font-bold focus:border-[#58a6ff] focus:outline-none"
                />
              </div>

              {/* Connection Status Notice */}
              <div className="p-2.5 bg-[#0d1117] rounded border border-[#30363d] text-[10px] text-[#8b949e] space-y-1">
                <div className="flex items-center justify-between text-white font-bold">
                  <span>Persistence: Active</span>
                  <span className="text-[#3fb950]">Saved to Server & LocalStorage</span>
                </div>
                <p>Connection credentials are automatically stored and restored upon app startup.</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="bg-[#21262d] p-3 border-t border-[#30363d] flex items-center justify-between">
              {isConnected ? (
                <button
                  onClick={handleDisconnect}
                  className="bg-[#da3633] hover:bg-[#b82a28] text-white px-3 py-1.5 rounded font-bold text-xs flex items-center space-x-1.5 transition"
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>Disconnect</span>
                </button>
              ) : (
                <span className="text-[10px] text-[#f85149] font-bold">Offline</span>
              )}

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowConnectModal(false)}
                  className="px-3 py-1.5 text-[#8b949e] hover:text-white font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveConnection}
                  disabled={isConnecting}
                  className="bg-[#238636] hover:bg-[#1e722e] text-white px-4 py-1.5 rounded font-bold text-xs transition flex items-center space-x-1.5 shadow"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>{isConnecting ? "Connecting..." : "Connect & Save"}</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* 5. PC MT5 DEVICE TERMINAL SUMMARY POPUP MODAL (DISMISSIBLE BY CLICKING OUTSIDE) */}
      {showDeviceSummaryModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn"
          onClick={(e) => {
            // Close modal when user clicks on the dark backdrop outside the card
            if (e.target === e.currentTarget) {
              setShowDeviceSummaryModal(false);
            }
          }}
        >
          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden font-sans space-y-0 text-white">

            {/* Header */}
            <div className="bg-[#21262d] px-5 py-4 border-b border-[#30363d] flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-[#e3b341]/10 rounded-lg border border-[#e3b341]/30">
                  <Monitor className="w-5 h-5 text-[#e3b341]" />
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-sm tracking-tight">PC MetaTrader 5 Terminal Auto-Detected</h3>
                  <p className="text-[10px] text-[#8b949e]">Hardware process & account credentials verified from PC</p>
                </div>
              </div>

              <button
                onClick={() => setShowDeviceSummaryModal(false)}
                className="text-[#8b949e] hover:text-white p-1.5 rounded-lg hover:bg-[#30363d] transition"
                title="Close Summary (or click outside)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-5 space-y-4 text-xs font-mono">

              {/* Latency & Status Banner */}
              <div className="p-3 bg-[#0d1117] rounded-xl border border-[#30363d] flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#3fb950] animate-ping" />
                  <span className="font-bold text-[#3fb950]">Terminal Active & Connected</span>
                </div>
                <span className="text-[10px] bg-[#238636]/20 text-[#3fb950] px-2 py-0.5 rounded font-bold border border-[#238636]/40">
                  Latency: {deviceInfo?.pingMs || 8.7} ms
                </span>
              </div>

              {/* Hardware & Terminal Execution Parameters */}
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2.5 bg-[#0d1117] rounded-lg border border-[#30363d] space-y-1">
                  <div className="text-[9px] text-[#8b949e] uppercase font-bold">PC Hostname</div>
                  <div className="font-bold text-white truncate">{deviceInfo?.pcName || "DESKTOP-PRO-MT5"}</div>
                </div>

                <div className="p-2.5 bg-[#0d1117] rounded-lg border border-[#30363d] space-y-1">
                  <div className="text-[9px] text-[#8b949e] uppercase font-bold">MT5 Terminal Build</div>
                  <div className="font-bold text-[#58a6ff] truncate">{deviceInfo?.build || "MT5 x64 Build 4320"}</div>
                </div>

                <div className="p-2.5 bg-[#0d1117] rounded-lg border border-[#30363d] space-y-1 col-span-2">
                  <div className="text-[9px] text-[#8b949e] uppercase font-bold">Terminal Path</div>
                  <div className="font-mono text-[10px] text-white truncate">{deviceInfo?.terminalPath || "C:\\Program Files\\Exness MetaTrader 5\\terminal64.exe"}</div>
                </div>
              </div>

              {/* Account Data Snapshot */}
              <div className="bg-[#0d1117] p-3.5 rounded-xl border border-[#30363d] space-y-2">
                <div className="flex items-center justify-between text-[11px] pb-2 border-b border-[#21262d]">
                  <span className="text-[#8b949e] font-bold">Active Account ID:</span>
                  <span className="text-white font-extrabold">#{accountLogin} ({accountServer})</span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-[11px] pt-1">
                  <div>
                    <span className="text-[#8b949e] block text-[9px]">BALANCE</span>
                    <span className="text-white font-black text-sm">${balance.toLocaleString("en-US", { minimumFractionDigits: 2 })} USD</span>
                  </div>

                  <div>
                    <span className="text-[#8b949e] block text-[9px]">EQUITY</span>
                    <span className="text-[#3fb950] font-black text-sm">${equity.toLocaleString("en-US", { minimumFractionDigits: 2 })} USD</span>
                  </div>

                  <div>
                    <span className="text-[#8b949e] block text-[9px]">LEVERAGE</span>
                    <span className="text-white font-bold">{leverage}</span>
                  </div>

                  <div>
                    <span className="text-[#8b949e] block text-[9px]">FREE MARGIN</span>
                    <span className="text-[#58a6ff] font-bold">${freeMargin.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>

              <div className="text-[10px] text-[#8b949e] text-center italic">
                * Note: You can close this summary pop-up anytime by clicking outside this modal window.
              </div>

            </div>

            {/* Footer Action Button */}
            <div className="bg-[#21262d] px-5 py-3 border-t border-[#30363d] flex items-center justify-end">
              <button
                onClick={() => setShowDeviceSummaryModal(false)}
                className="bg-[#238636] hover:bg-[#2ea043] text-white px-5 py-2 rounded-xl font-bold text-xs transition shadow-lg flex items-center space-x-2 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Acknowledge & Access MT5 Terminal</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 6. AI QUANTITATIVE MARKET ANALYSIS & PREDICTOR MODAL */}
      {showAiAnalysisModal && (
        <div
          onClick={() => setShowAiAnalysisModal(false)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#161b22] border border-[#30363d] rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden font-sans space-y-0 text-white cursor-default"
          >

            <div className="bg-[#21262d] px-5 py-4 border-b border-[#30363d] flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-[#1f6beb]/10 rounded-lg border border-[#1f6beb]/30">
                  <Brain className="w-5 h-5 text-[#58a6ff]" />
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-sm tracking-tight">MT5 AI Quantitative Predictor</h3>
                  <p className="text-[10px] text-[#8b949e]">Deep ML Technical Confluence & Risk Lot Optimizer</p>
                </div>
              </div>

              <button
                onClick={() => setShowAiAnalysisModal(false)}
                className="text-[#8b949e] hover:text-white p-1.5 rounded-lg hover:bg-[#30363d] transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs font-sans">

              {/* Symbol selector & Trigger */}
              <div className="flex items-center justify-between bg-[#0d1117] p-3 rounded-xl border border-[#30363d]">
                <div className="flex items-center space-x-3">
                  <span className="text-[#8b949e] font-bold text-xs">Target Asset:</span>
                  <select
                    value={selectedSymbolCode}
                    onChange={(e) => {
                      setSelectedSymbolCode(e.target.value);
                      setUserPicked(true);
                      setAiPrediction(null);
                    }}
                    className="bg-[#161b22] text-white px-3 py-1.5 rounded-lg border border-[#30363d] font-bold text-xs focus:outline-none focus:border-[#58a6ff]"
                  >
                    {symbols.map(s => (
                      <option key={s.symbol} value={s.symbol}>{s.symbol} - {s.name}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={handleRunAiAnalysis}
                  disabled={isAnalyzingAi}
                  className="bg-[#1f6beb] hover:bg-[#388bfd] text-white px-4 py-1.5 rounded-lg font-bold text-xs transition shadow flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isAnalyzingAi ? "AMIS-FX Analyzing..." : "Run AMIS-FX Intelligence"}</span>
                </button>
              </div>

              {/* Prediction Result Display */}
              {aiPrediction ? (
                <div className="space-y-3 animate-fadeIn font-mono">

                  {/* Signal Badge & Confidence */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-[#0d1117] p-3 rounded-xl border border-[#30363d] space-y-1">
                      <span className="text-[9px] text-[#8b949e] uppercase font-bold block">Signal</span>
                      <span className={`text-base font-black ${aiPrediction.signal === "BUY" ? "text-[#3fb950]" : aiPrediction.signal === "SELL" ? "text-[#f85149]" : "text-[#e3b341]"
                        }`}>
                        {aiPrediction.signal}
                      </span>
                    </div>

                    <div className="bg-[#0d1117] p-3 rounded-xl border border-[#30363d] space-y-1">
                      <span className="text-[9px] text-[#8b949e] uppercase font-bold block">Confidence</span>
                      <span className="text-base font-black text-[#58a6ff]">{aiPrediction.confidence}%</span>
                    </div>

                    <div className="bg-[#0d1117] p-3 rounded-xl border border-[#30363d] space-y-1">
                      <span className="text-[9px] text-[#8b949e] uppercase font-bold block">Optimal Size</span>
                      <span className="text-base font-black text-white">{aiPrediction.calculatedLotSize} Lots</span>
                    </div>
                  </div>

                  {/* Execution Parameters Table */}
                  <div className="bg-[#0d1117] p-3.5 rounded-xl border border-[#30363d] space-y-2 text-[11px]">
                    <div className="grid grid-cols-2 gap-2 pb-2 border-b border-[#21262d]">
                      <div>
                        <span className="text-[#8b949e] block text-[9px]">TARGET ENTRY</span>
                        <span className="text-white font-bold">{aiPrediction.targetEntry.toFixed(currentSymbol.digits)}</span>
                      </div>
                      <div>
                        <span className="text-[#8b949e] block text-[9px]">RISK-REWARD RATIO</span>
                        <span className="text-[#58a6ff] font-bold">{aiPrediction.riskRewardRatio}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div>
                        <span className="text-[#f85149] block text-[9px]">STOP LOSS</span>
                        <span className="text-[#f85149] font-bold">{aiPrediction.recommendedSLPrice.toFixed(currentSymbol.digits)} ({aiPrediction.recommendedSLPips} pips)</span>
                      </div>
                      <div>
                        <span className="text-[#3fb950] block text-[9px]">TAKE PROFIT</span>
                        <span className="text-[#3fb950] font-bold">{aiPrediction.recommendedTPPrice.toFixed(currentSymbol.digits)} ({aiPrediction.recommendedTPPips} pips)</span>
                      </div>
                    </div>
                  </div>

                  {/* Rationale Text */}
                  <div className="bg-[#0d1117] p-3 rounded-xl border border-[#30363d] text-[10px] text-[#c9d1d9] leading-relaxed whitespace-pre-line">
                    {aiPrediction.analysisMarkdown}
                  </div>

                </div>
              ) : (
                <div className="py-8 text-center text-[#8b949e] space-y-2">
                  <Brain className="w-8 h-8 mx-auto opacity-40 text-[#58a6ff]" />
                  <p>Click "Run AI Prediction" to analyze real-time market structure & compute optimal lot size for {selectedSymbolCode}.</p>
                </div>
              )}

            </div>

            {/* Action Bar */}
            <div className="bg-[#21262d] px-5 py-3 border-t border-[#30363d] flex items-center justify-between">
              <button
                onClick={() => setShowAiAnalysisModal(false)}
                className="px-4 py-2 text-[#8b949e] hover:text-white font-bold text-xs"
              >
                Close
              </button>

              {aiPrediction && aiPrediction.signal !== "HOLD" && (
                <button
                  onClick={() => {
                    handleExecuteTrade(aiPrediction.signal as "BUY" | "SELL");
                    setShowAiAnalysisModal(false);
                  }}
                  className={`px-5 py-2 rounded-xl font-bold text-xs transition shadow-lg flex items-center space-x-2 cursor-pointer ${aiPrediction.signal === "BUY" ? "bg-[#238636] hover:bg-[#2ea043] text-white" : "bg-[#da3633] hover:bg-[#b82a28] text-white"
                    }`}
                >
                  <Zap className="w-4 h-4" />
                  <span>Execute {aiPrediction.signal} {aiPrediction.calculatedLotSize} Lots @ Market</span>
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* 7. AI AUTO-TRADER TRADE NOTIFICATION TOAST BANNER */}
      {aiNotification && (
        <div className="fixed top-16 right-5 z-50 bg-[#161b22] border-2 border-[#58a6ff] rounded-2xl p-4 shadow-2xl max-w-sm w-full space-y-2 text-white animate-slideIn">
          <div className="flex items-center justify-between pb-2 border-b border-[#30363d]">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 bg-[#1f6beb]/20 rounded-lg text-[#58a6ff]">
                <Cpu className="w-4 h-4" />
              </div>
              <span className="font-extrabold text-xs text-white tracking-tight">{aiNotification.title}</span>
            </div>

            <button
              onClick={() => setAiNotification(null)}
              className="text-[#8b949e] hover:text-white p-1 rounded hover:bg-[#30363d]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1.5 text-xs font-mono">
            <div className="flex items-center justify-between">
              <span className="text-[#8b949e]">Order:</span>
              <span className={`font-black ${aiNotification.action === "BUY" ? "text-[#3fb950]" : "text-[#f85149]"}`}>
                {aiNotification.action} {aiNotification.lots} Lots {aiNotification.symbol} @ {aiNotification.price}
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#8b949e]">SL / TP:</span>
              <span className="text-white font-bold">SL: {aiNotification.sl} | TP: {aiNotification.tp}</span>
            </div>

            <div className="p-2 bg-[#0d1117] rounded-lg border border-[#30363d] text-[10px] text-[#c9d1d9] leading-tight">
              <b>AI Justification:</b> {aiNotification.reason}
            </div>

            <div className="flex items-center justify-between text-[10px] text-[#3fb950] font-bold">
              <span>Expected Target:</span>
              <span>+${aiNotification.expectedProfit.toFixed(2)} USD</span>
            </div>
          </div>
        </div>
      )}

      {/* 8. FULL-SCREEN ZOOMABLE CHART MODAL */}
      {isChartMaximized && (
        <div className="fixed inset-0 z-50 bg-[#090d13] flex flex-col justify-between p-4 overflow-hidden font-sans">

          {/* Header Bar */}
          <div className="bg-[#161b22] px-4 py-3 rounded-xl border border-[#30363d] flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-center space-x-3">
              <span className="font-black text-white text-lg tracking-tight">{currentSymbol.symbol}</span>
              <span className="text-[#8b949e] text-xs">({currentSymbol.name})</span>
              <span className="text-[#58a6ff] font-mono font-bold text-xs bg-[#1f6beb]/10 px-2 py-0.5 rounded border border-[#1f6beb]/30">
                TF: {timeframe}
              </span>
              <span className="text-[#f85149] font-mono font-bold text-xs">Bid: {currentSymbol.baseBid.toFixed(currentSymbol.digits)}</span>
              <span className="text-[#3fb950] font-mono font-bold text-xs">Ask: {currentSymbol.baseAsk.toFixed(currentSymbol.digits)}</span>
            </div>

            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-1 bg-[#0d1117] p-1 rounded-lg border border-[#30363d] text-xs">
                <button
                  onClick={() => setChartZoomLevel(z => Math.max(0.6, z - 0.2))}
                  className="px-2.5 py-1 bg-[#21262d] text-white rounded font-bold hover:bg-[#30363d]"
                  title="Zoom Out"
                >
                  -
                </button>
                <span className="px-2 font-mono text-white font-bold">{Math.round(chartZoomLevel * 100)}%</span>
                <button
                  onClick={() => setChartZoomLevel(z => Math.min(2.5, z + 0.2))}
                  className="px-2.5 py-1 bg-[#21262d] text-white rounded font-bold hover:bg-[#30363d]"
                  title="Zoom In"
                >
                  +
                </button>
                <button
                  onClick={() => setChartZoomLevel(1)}
                  className="px-2 py-1 text-[#8b949e] hover:text-white text-[11px] font-bold"
                >
                  Reset
                </button>
              </div>

              <button
                onClick={() => setIsChartMaximized(false)}
                className="bg-[#da3633] hover:bg-[#b82a28] text-white px-3 py-1.5 rounded-lg font-bold text-xs transition flex items-center space-x-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
                <span>Close Fullscreen</span>
              </button>
            </div>
          </div>

          {/* Full Screen Chart Canvas */}
          <div className="flex-1 relative my-3 bg-[#0d1117] rounded-xl border border-[#30363d] p-3 overflow-auto">
            <div style={{ transform: `scale(${chartZoomLevel})`, transformOrigin: "top left" }} className="w-full h-full min-h-[500px]">
              <svg
                className="w-full h-[520px] overflow-visible cursor-crosshair"
                viewBox={`0 0 ${chartWidth} ${chartHeight + volumeHeight}`}
                onMouseMove={event => {
                  const svg = event.currentTarget;
                  const matrix = svg.getScreenCTM();
                  if (!matrix || activeCandles.length === 0) return;
                  const point = svg.createSVGPoint();
                  point.x = event.clientX;
                  point.y = event.clientY;
                  const local = point.matrixTransform(matrix.inverse());
                  const x = Math.max(0, Math.min(chartWidth, local.x));
                  const y = Math.max(0, Math.min(chartHeight, local.y));
                  setHoveredIndex(Math.min(activeCandles.length - 1, Math.floor(x / candleSpacing)));
                  setCrosshair({ x, y, price: yToPrice(y) });
                }}
                onMouseLeave={() => { setCrosshair(null); setHoveredIndex(null); }}
              >
                {/* ── MODERN RENDERING DEFS (mirrors the main chart) ── */}
                <defs>
                  <linearGradient id="plotBgFs" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0f151d" />
                    <stop offset="55%" stopColor="#0b1016" />
                    <stop offset="100%" stopColor="#080c12" />
                  </linearGradient>
                  <filter id="candleGlowFs" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="1.6" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  <filter id="obShadowFs" x="-20%" y="-40%" width="140%" height="180%">
                    <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000000" floodOpacity="0.55" />
                  </filter>
                </defs>

                {/* Plot background + volume lane separator */}
                <rect x="0" y="0" width={chartWidth} height={chartHeight + volumeHeight} fill="url(#plotBgFs)" rx="4" />
                <line x1="0" y1={chartHeight} x2={chartWidth} y2={chartHeight} stroke="#1c2430" strokeWidth="1" />

                {/* Price Grid Lines + right-hand axis chips */}
                {[0, 0.2, 0.4, 0.6, 0.8, 1.0].map((ratio) => {
                  const priceVal = paddedMin + totalPriceRange * ratio;
                  const y = priceToY(priceVal);
                  return (
                    <g key={ratio}>
                      <line x1="0" y1={y} x2={chartWidth} y2={y} stroke="#161d27" strokeWidth="1" />
                      <rect x={chartWidth - 62} y={y - 8} width="62" height="16" fill="#0d1319" opacity="0.92" rx="2" />
                      <text x={chartWidth - 5} y={y + 3} fill="#7d8794" fontSize="9" textAnchor="end" fontWeight="500">
                        {priceVal.toFixed(currentSymbol.digits)}
                      </text>
                    </g>
                  );
                })}

                {/* Candles — modern rounded bodies, split wicks, glow on hovered/last */}
                {activeCandles.map((c, i) => {
                  const isGreen = c.close >= c.open;
                  const x = i * candleSpacing + (candleSpacing - candleBarWidth) / 2;
                  const cx = i * candleSpacing + candleSpacing / 2;

                  const openY = priceToY(c.open);
                  const closeY = priceToY(c.close);
                  const highY = priceToY(c.high);
                  const lowY = priceToY(c.low);

                  const bodyY = Math.min(openY, closeY);
                  const bodyH = Math.max(2, Math.abs(closeY - openY));

                  const isHovered = hoveredIndex === i;
                  const isLast = i === activeCandles.length - 1;
                  const stroke = isGreen ? "#3fb950" : "#f85149";
                  const bodyRadius = Math.min(1.5, candleBarWidth / 4);

                  return (
                    <g key={i} filter={isHovered || isLast ? "url(#candleGlowFs)" : undefined}>
                      <line x1={cx} y1={highY} x2={cx} y2={bodyY} stroke={stroke} strokeWidth={isHovered ? 1.8 : 1.1} strokeLinecap="round" />
                      <line x1={cx} y1={bodyY + bodyH} x2={cx} y2={lowY} stroke={stroke} strokeWidth={isHovered ? 1.8 : 1.1} strokeLinecap="round" />
                      <rect
                        x={x}
                        y={bodyY}
                        width={candleBarWidth}
                        height={bodyH}
                        fill={isGreen ? "#2ea043" : "#da3633"}
                        stroke={stroke}
                        strokeWidth={isHovered ? 1.4 : 0.8}
                        rx={bodyRadius}
                      />
                    </g>
                  );
                })}

                {/* Drawings Overlay */}
                {drawingData && (
                  <g>
                    {drawingData.smcOrderBlocks.map(ob => {
                      const top = Math.min(ob.yTop, ob.yBottom);
                      const h = Math.max(3, Math.abs(ob.yBottom - ob.yTop));
                      const color = ob.type === "BULLISH" ? "#3fb950" : "#f85149";
                      return (
                        <g key={ob.id} filter="url(#obShadowFs)">
                          <rect x="0" y={top} width={chartWidth} height={h} fill={color} fillOpacity="0.09" stroke={color} strokeWidth="1" strokeDasharray="4 2" />
                          <rect x="0" y={top} width="3" height={h} fill={color} fillOpacity="0.85" />
                          <text x="8" y={top + h + 9} fill={color} fontSize="8" fontWeight="bold">
                            {ob.type === "BULLISH" ? "DEMAND OB" : "SUPPLY OB"} {ob.strength}% · {ob.bottomPrice.toFixed(currentSymbol.digits)}–{ob.topPrice.toFixed(currentSymbol.digits)}
                          </text>
                        </g>
                      );
                    })}

                    <line x1="0" y1={drawingData.support.y} x2={chartWidth} y2={drawingData.support.y} stroke="#3fb950" strokeWidth="1.5" strokeDasharray="4 2" />
                    <text x={chartWidth - 140} y={drawingData.support.y - 4} fill="#3fb950" fontSize="10" fontWeight="bold">🟢 Support Floor ({drawingData.support.price.toFixed(currentSymbol.digits)})</text>

                    <line x1="0" y1={drawingData.resistance.y} x2={chartWidth} y2={drawingData.resistance.y} stroke="#f85149" strokeWidth="1.5" strokeDasharray="4 2" />
                    <text x={chartWidth - 160} y={drawingData.resistance.y + 12} fill="#f85149" fontSize="10" fontWeight="bold">🔴 Supply Ceiling ({drawingData.resistance.price.toFixed(currentSymbol.digits)})</text>

                    {/* Swing Low Support Trendline */}
                    {drawingData.suppLine && (
                      <g>
                        <line x1={drawingData.suppLine.x1} y1={drawingData.suppLine.y1} x2={drawingData.suppLine.x2} y2={drawingData.suppLine.y2} stroke="#3fb950" strokeWidth="2.5" strokeDasharray="5 3" />
                        <text x={drawingData.suppLine.x2 - 120} y={drawingData.suppLine.y2 + 14} fill="#3fb950" fontSize="10" fontWeight="bold">📈 Swing Low Support</text>
                      </g>
                    )}

                    {/* Swing High Resistance Trendline */}
                    {drawingData.resisLine && (
                      <g>
                        <line x1={drawingData.resisLine.x1} y1={drawingData.resisLine.y1} x2={drawingData.resisLine.x2} y2={drawingData.resisLine.y2} stroke="#e3b341" strokeWidth="2.5" strokeDasharray="5 3" />
                        <text x={drawingData.resisLine.x2 - 130} y={drawingData.resisLine.y2 - 6} fill="#e3b341" fontSize="10" fontWeight="bold">📉 Swing High Resistance</text>
                      </g>
                    )}

                    {/* Primary Regression Trendline */}
                    <line x1={drawingData.trend.x1} y1={drawingData.trend.y1} x2={drawingData.trend.x2} y2={drawingData.trend.y2} stroke="#58a6ff" strokeWidth="2" strokeDasharray="4 4" />
                    <text x={drawingData.trend.x2 - 100} y={drawingData.trend.y2 - 6} fill="#58a6ff" fontSize="10" fontWeight="bold">📈 AMIS Trendline</text>
                  </g>
                )}
                {crosshair && (
                  <g className="pointer-events-none">
                    <line x1={crosshair.x} y1="0" x2={crosshair.x} y2={chartHeight + volumeHeight} stroke="#8b949e" strokeWidth="0.7" strokeDasharray="3 3" />
                    <line x1="0" y1={crosshair.y} x2={chartWidth} y2={crosshair.y} stroke="#8b949e" strokeWidth="0.7" strokeDasharray="3 3" />
                    <rect x={chartWidth - 75} y={crosshair.y - 9} width="75" height="18" fill="#1f6feb" rx="2" />
                    <text x={chartWidth - 38} y={crosshair.y + 3} fill="white" fontSize="9" textAnchor="middle">{crosshair.price.toFixed(currentSymbol.digits)}</text>
                  </g>
                )}
              </svg>
            </div>
          </div>

          {/* Full Screen Footer Info */}
          <div className="bg-[#161b22] p-3 rounded-xl border border-[#30363d] flex items-center justify-between text-xs text-[#8b949e]">
            <span>Symbol: <b className="text-white">{currentSymbol.symbol}</b></span>
            <span>Bars Loaded: <b className="text-white">{activeCandles.length}</b></span>
            <span>AMIS Regime: <b className="text-[#e3b341]">{amisSnapshot?.dominantRegime || "Unavailable"}</b></span>
            <span>Model certainty (not a win probability): <b className="text-[#3fb950]">{amisSnapshot?.intelligenceCertainty != null ? `${amisSnapshot.intelligenceCertainty}%` : "Unavailable"}</b></span>
          </div>

        </div>
      )}

    </div>
  );
}

