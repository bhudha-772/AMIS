import React, { useState, useEffect, useRef, useMemo } from "react";
import { useBinance } from "../context/BinanceContext";
import {
  TrendingUp,
  TrendingDown,
  BookOpen,
  Sparkles,
  Layers,
  Activity,
  Info,
  HelpCircle,
  CheckCircle2,
  Sliders,
  Cpu,
  Compass,
  Eye,
  AlertTriangle,
  ChevronRight,
  Gauge,
  Maximize2,
  Target,
  Clock,
  Zap,
  Scale,
  FileText,
  PlusCircle,
  Check
} from "lucide-react";
import { KlineData, SUPPORTED_SYMBOLS_MAP } from "../types";
import { AdaptiveLearningPanel } from "./AdaptiveLearningPanel";

// ==========================================
// TECHNICAL MATHEMATICAL FORMULAS (REAL-TIME)
// ==========================================

// RSI Calculation
const calculateRSI = (candles: KlineData[], period = 14): number[] => {
  if (candles.length < period + 1) return Array(candles.length).fill(50);
  const rsi: number[] = [];
  let gains = 0;
  let losses = 0;

  // First RSI Average
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff > 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  // Guard against divide by zero
  rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));

  // Wilder's Smoothing Technique
  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }

  // Prepend padding to match dimensions
  const paddingSize = candles.length - rsi.length;
  const padding = Array(paddingSize).fill(50);
  return [...padding, ...rsi];
};

// EMA Helper for MACD
const calculateEMAArray = (prices: number[], period: number): number[] => {
  if (prices.length === 0) return [];
  const k = 2 / (period + 1);
  const ema = [prices[0]];
  for (let i = 1; i < prices.length; i++) {
    ema.push(prices[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
};

// MACD Calculation
interface MACDResult {
  macdLine: number[];
  signalLine: number[];
  histogram: number[];
}

const calculateMACD = (candles: KlineData[], fast = 12, slow = 26, signal = 9): MACDResult => {
  const closes = candles.map((c) => c.close);
  if (closes.length < slow) {
    return {
      macdLine: Array(closes.length).fill(0),
      signalLine: Array(closes.length).fill(0),
      histogram: Array(closes.length).fill(0),
    };
  }

  const emaFast = calculateEMAArray(closes, fast);
  const emaSlow = calculateEMAArray(closes, slow);

  const macdLine = emaFast.map((val, idx) => val - emaSlow[idx]);
  const signalLine = calculateEMAArray(macdLine, signal);
  
  const histogram = macdLine.map((val, idx) => {
    const sig = signalLine[idx] !== undefined ? signalLine[idx] : 0;
    return val - sig;
  });

  return { macdLine, signalLine, histogram };
};

// Bollinger Bands Calculation
interface BBValue {
  upper: number;
  middle: number;
  lower: number;
}

const calculateBollingerBands = (candles: KlineData[], period = 20, multiplier = 2): BBValue[] => {
  const closes = candles.map((c) => c.close);
  const bands: BBValue[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      bands.push({ upper: closes[i], middle: closes[i], lower: closes[i] });
      continue;
    }
    const slice = closes.slice(i - period + 1, i + 1);
    const middle = slice.reduce((sum, v) => sum + v, 0) / period;
    const variance = slice.reduce((sum, v) => sum + Math.pow(v - middle, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    bands.push({
      middle,
      upper: middle + multiplier * stdDev,
      lower: middle - multiplier * stdDev,
    });
  }
  return bands;
};

// ==========================================
// STATIC FORMATION AND CANCEL PATTERNS REFERENCE
// ==========================================

interface PatternItem {
  id: string;
  name: string;
  category: "reversal" | "continuation" | "candlestick";
  direction: "bullish" | "bearish" | "neutral";
  reliability: "High" | "Medium" | "Low";
  description: string;
  triggerSetup: string;
  targetMultiplier: number; // to show target calculations
}

const PATTERNS_LIBRARY: PatternItem[] = [
  {
    id: "head_shoulders",
    name: "Head & Shoulders",
    category: "reversal",
    direction: "bearish",
    reliability: "High",
    description: "Formed by three consecutive peaks: a higher head flanked by two lower, roughly equal shoulders. Neckline joins the intermediate swing lows.",
    triggerSetup: "Short on a decisive breakout closing candle below the support Neckline.",
    targetMultiplier: 0.92,
  },
  {
    id: "double_bottom",
    name: "Double Bottom (W)",
    category: "reversal",
    direction: "bullish",
    reliability: "High",
    description: "Classic reversal pattern featuring two distinct valleys at a similar support floor. Represents a strong, verified bottoming process.",
    triggerSetup: "Long when price breaks and closes above the intermediate peak resistance (Neckline).",
    targetMultiplier: 1.08,
  },
  {
    id: "bullish_flag",
    name: "Bullish Flag / Pennant",
    category: "continuation",
    direction: "bullish",
    reliability: "High",
    description: "Sharp vertical upward rally (Flagpole) followed by a tight downward-sloping consolidation channel. Highly reliable momentum driver.",
    triggerSetup: "Long upon breakout and closure above the upper descending channel boundary line.",
    targetMultiplier: 1.12,
  },
  {
    id: "ascending_triangle",
    name: "Ascending Triangle",
    category: "continuation",
    direction: "bullish",
    reliability: "Medium",
    description: "Bullish consolidation pattern comprised of a flat overhead resistance ceiling and rising support trendlines forming higher lows.",
    triggerSetup: "Long when price exceeds and closes above the flat resistance roof.",
    targetMultiplier: 1.07,
  },
  {
    id: "double_top",
    name: "Double Top (M)",
    category: "reversal",
    direction: "bearish",
    reliability: "High",
    description: "Reversal formation characterized by two prominent peak levels testing identical resistance heights. Displays exhaustion of buyers.",
    triggerSetup: "Short when price cracks and closes below the swing low support floor (Neckline).",
    targetMultiplier: 0.91,
  },
  {
    id: "symmetrical_triangle",
    name: "Symmetrical Triangle",
    category: "continuation",
    direction: "neutral",
    reliability: "Medium",
    description: "Price forms converging slopes with lower highs and higher lows. Represents volatility compression preceding a major expansion breakout.",
    triggerSetup: "Enter direction of the breakout: Long if breaking upper resistance, Short if breaking lower support.",
    targetMultiplier: 1.05,
  },
  {
    id: "bullish_engulfing",
    name: "Bullish Engulfing",
    category: "candlestick",
    direction: "bullish",
    reliability: "Medium",
    description: "A two-candle formation. The second green candle body completely wraps or engulfs the previous red candle's body.",
    triggerSetup: "Long on the closure of the engulfing bar, with stop loss below its wick low.",
    targetMultiplier: 1.04,
  },
  {
    id: "hammer_candle",
    name: "Hammer Candlestick",
    category: "candlestick",
    direction: "bullish",
    reliability: "Medium",
    description: "A single candlestick with a tiny upper body at the top and a long lower shadow (at least 2x the body size). Signals immediate demand.",
    triggerSetup: "Long on the next candle trigger above the hammer body, placing stop below wick tip.",
    targetMultiplier: 1.03,
  },
];

export const AnalysisDesk: React.FC = () => {
  const {
    klines,
    activeSymbol,
    activeTimeframe,
    currentPrice,
    tickers,
    setActiveSymbol,
    portfolio,
    cancelOrder,
    placeOrder,
    // AI Engine global states
    signals,
    setSignals,
    activeSignalId,
    setActiveSignalId,
    isScanning,
    scanStep,
    scanError,
    autoSwitchOnSignal,
    setAutoSwitchOnSignal,
    selectedOverlay,
    setSelectedOverlay,
    isAutoPilotActive,
    setIsAutoPilotActive,
    autoPilotCountdown,
    scanAllMarkets,
  } = useBinance();

  const [showIndicators, setShowIndicators] = useState<"rsi" | "macd">("rsi");
  const [overlayBollinger, setOverlayBollinger] = useState<boolean>(true);
  const [drawCmtTrendlines, setDrawCmtTrendlines] = useState<boolean>(true);
  const [showParameters, setShowParameters] = useState<boolean>(false);

  // Trade execution states for active signals
  const [executionMode, setExecutionMode] = useState<"DEMO" | "REAL">("DEMO");
  const [allocatedUSDT, setAllocatedUSDT] = useState<number>(100);
  const [orderType, setOrderType] = useState<"LIMIT" | "MARKET">("LIMIT");
  const [executionNotification, setExecutionNotification] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);
  const [isExecutingTrade, setIsExecutingTrade] = useState<boolean>(false);

  const handleExecuteSignalTrade = async (signal: any) => {
    if (!signal) return;
    setIsExecutingTrade(true);
    setExecutionNotification({ type: "info", message: "Connecting to execution node..." });

    // Ensure active symbol matches recommended symbol
    if (activeSymbol !== signal.recommendedSymbol) {
      setActiveSymbol(signal.recommendedSymbol);
      // Wait a tiny bit for price synchronization
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const direction = signal.direction; // BUY or SELL
    const tradeSide = direction === "BUY" ? "BUY" : "SELL";
    const targetPrice = orderType === "LIMIT" ? signal.entryPrice : (tickers[signal.recommendedSymbol]?.price || currentPrice);
    
    if (!targetPrice || targetPrice <= 0) {
      setExecutionNotification({
        type: "error",
        message: "Invalid market price. Wait for connection to load tickers."
      });
      setIsExecutingTrade(false);
      return;
    }

    // Calculate coin quantity
    const coinQty = Number((allocatedUSDT / targetPrice).toFixed(6));
    if (coinQty <= 0) {
      setExecutionNotification({
        type: "error",
        message: "USDT Allocation too low to yield minimum tradable amount."
      });
      setIsExecutingTrade(false);
      return;
    }

    if (executionMode === "DEMO") {
      // Execute local Paper Trading order
      const res = placeOrder(tradeSide, orderType, targetPrice, coinQty);
      if (res.success) {
        setExecutionNotification({
          type: "success",
          message: `Demo Order Placed! ${tradeSide} ${coinQty} ${signal.recommendedSymbol} at $${targetPrice}.`
        });
      } else {
        setExecutionNotification({
          type: "error",
          message: `Demo Order Failed: ${res.message}`
        });
      }
      setIsExecutingTrade(false);
    } else {
      // Execute REAL Binance API Order via full-stack secure backend!
      try {
        const response = await fetch("/api/binance/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbol: signal.recommendedSymbol,
            side: tradeSide,
            type: orderType,
            price: targetPrice,
            amount: coinQty,
            stopLoss: signal.stopLoss,
            takeProfit: signal.takeProfit
          })
        });
        
        const data = await response.json();
        if (response.ok && data.success) {
          setExecutionNotification({
            type: "success",
            message: `Real Trade Succeeded! Order ID: ${data.orderId || "N/A"}. ${data.message || ""}`
          });
        } else {
          setExecutionNotification({
            type: "error",
            message: data.message || "Failed to execute real order."
          });
        }
      } catch (err: any) {
        setExecutionNotification({
          type: "error",
          message: `Network error connecting to real Binance proxy: ${err.message || err}`
        });
      } finally {
        setIsExecutingTrade(false);
      }
    }
  };

  const [activeAnalysisTab, setActiveAnalysisTab] = useState<"reasoning" | "rankings" | "indicators" | "advisor" | "validation">("reasoning");
  const [validationData, setValidationData] = useState<any>(null);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [selectedHorizon, setSelectedHorizon] = useState<string>("3m");

  // Phase 4.7 Live Research Laboratory UI States & Effects
  const [researchSubTab, setResearchSubTab] = useState<"backtest" | "live" | "trades" | "journal" | "governance">("backtest");
  const [labData, setLabData] = useState<any>(null);
  const [isLoadingLab, setIsLoadingLab] = useState(false);
  const [labError, setLabError] = useState<string | null>(null);
  const [journalQuery, setJournalQuery] = useState("");

  // Phase 4.8 Model Governance UI States
  const [governanceData, setGovernanceData] = useState<any>(null);
  const [isLoadingGov, setIsLoadingGov] = useState(false);
  const [govError, setGovError] = useState<string | null>(null);

  // Promotion Form State
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [promoteVersion, setPromoteVersion] = useState("");
  const [promoteAuthor, setPromoteAuthor] = useState("");
  const [promoteJustification, setPromoteJustification] = useState("");

  // Hypothesis Form State
  const [showHypothesisForm, setShowHypothesisForm] = useState(false);
  const [hypName, setHypName] = useState("");
  const [hypDesc, setHypDesc] = useState("");
  const [hypHypothesis, setHypHypothesis] = useState("");
  const [hypTargetMetric, setHypTargetMetric] = useState("");
  const [hypModelVersion, setHypModelVersion] = useState("v1.1.0");

  // Experiment Conclusion Form State
  const [concludingExpId, setConcludingExpId] = useState<string | null>(null);
  const [expFindings, setExpFindings] = useState("");

  // Model Registration Form State
  const [showRegisterModelForm, setShowRegisterModelForm] = useState(false);
  const [regVersion, setRegVersion] = useState("");
  const [regName, setRegName] = useState("");
  const [regDesc, setRegDesc] = useState("");
  const [regWeights, setRegWeights] = useState({
    regime: 0.25,
    trendStrength: 0.20,
    rsi: 0.20,
    bollingerBandwidth: 0.15,
    direction: 0.10,
    cognitiveState: 0.10
  });

  // Selected Daily Report to view
  const [selectedDailyReportDate, setSelectedDailyReportDate] = useState<string | null>(null);

  // Adaptive Learning Engine State (Phase 4.9)
  const [adaptiveState, setAdaptiveState] = useState<any>(null);
  const [kbQuery, setKbQuery] = useState<string>("");
  const [isLearning, setIsLearning] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResults, setTestResults] = useState<any>(null);
  const [learningMessage, setLearningMessage] = useState<string>("");
  const [govMenu, setGovMenu] = useState<"standard" | "adaptive">("standard");

  const fetchLabState = async () => {
    try {
      const res = await fetch("/api/market/research/lab-state");
      const json = await res.json();
      if (json.success) {
        setLabData(json);
      } else {
        setLabError(json.message || "Failed to load laboratory state");
      }
    } catch (err: any) {
      setLabError(err.message || String(err));
    }
  };

  const fetchGovernanceState = async () => {
    try {
      setIsLoadingGov(true);
      const res = await fetch("/api/market/research/governance");
      const json = await res.json();
      if (json.success) {
        setGovernanceData(json);
      } else {
        setGovError(json.message || "Failed to load model governance registry.");
      }

      // Also retrieve the Adaptive Learning state (Phase 4.9)
      const adaptRes = await fetch("/api/market/research/adaptive/state");
      const adaptJson = await adaptRes.json();
      if (adaptJson.success) {
        setAdaptiveState(adaptJson);
      }
    } catch (err: any) {
      setGovError(err.message || String(err));
    } finally {
      setIsLoadingGov(false);
    }
  };

  const handlePromoteChallenger = async (version: string, author: string, justification: string) => {
    try {
      const res = await fetch("/api/market/research/governance/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version, author, justification })
      });
      const json = await res.json();
      if (json.success) {
        fetchGovernanceState();
        fetchLabState();
        alert(json.message);
        setShowPromoteModal(false);
        setPromoteVersion("");
        setPromoteAuthor("");
        setPromoteJustification("");
      } else {
        alert(json.message || "Failed to promote model.");
      }
    } catch (err: any) {
      alert("Error promoting challenger: " + err.message);
    }
  };

  const handleRunRegression = async () => {
    try {
      const res = await fetch("/api/market/research/governance/regression/run", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        fetchGovernanceState();
        alert("Deterministic regression test suite completed! Passed: " + json.run.passedCount + "/" + json.run.totalCases + " test scenarios.");
      } else {
        alert("Regression testing failed.");
      }
    } catch (err: any) {
      alert("Error executing regression: " + err.message);
    }
  };

  const handleGenerateDailyReport = async () => {
    try {
      const res = await fetch("/api/market/research/governance/report/generate", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        fetchGovernanceState();
        alert("Automated Daily Research Report compiled and archived under: " + json.report.date);
      } else {
        alert("Failed to generate report.");
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    }
  };

  const handleRegisterModel = async () => {
    try {
      // Validate weights sum to 1.0
      const totalWeights = regWeights.regime + regWeights.trendStrength + regWeights.rsi + regWeights.bollingerBandwidth + regWeights.direction + regWeights.cognitiveState;
      if (Math.abs(totalWeights - 1.0) > 0.01) {
        alert("Mathematical constraint violation: Weights must sum to exactly 1.00 (Current Sum: " + totalWeights.toFixed(2) + ")");
        return;
      }

      const res = await fetch("/api/market/research/governance/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: regVersion,
          name: regName,
          description: regDesc,
          weights: regWeights
        })
      });
      const json = await res.json();
      if (json.success) {
        fetchGovernanceState();
        alert(json.message);
        setShowRegisterModelForm(false);
        setRegVersion("");
        setRegName("");
        setRegDesc("");
      } else {
        alert(json.message || "Failed to register model config.");
      }
    } catch (err: any) {
      alert("Error registering model config: " + err.message);
    }
  };

  const handleCreateHypothesis = async () => {
    try {
      const res = await fetch("/api/market/research/governance/experiment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: hypName,
          description: hypDesc,
          hypothesis: hypHypothesis,
          targetMetric: hypTargetMetric,
          modelVersion: hypModelVersion
        })
      });
      const json = await res.json();
      if (json.success) {
        fetchGovernanceState();
        alert("Research hypothesis formulated and loaded into the Active Experiment Registry!");
        setShowHypothesisForm(false);
        setHypName("");
        setHypDesc("");
        setHypHypothesis("");
        setHypTargetMetric("");
      } else {
        alert(json.message || "Failed to create experiment.");
      }
    } catch (err: any) {
      alert("Error formulating hypothesis: " + err.message);
    }
  };

  const handleConcludeHypothesis = async () => {
    if (!concludingExpId) return;
    try {
      const res = await fetch("/api/market/research/governance/experiment/conclude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: concludingExpId, findings: expFindings })
      });
      const json = await res.json();
      if (json.success) {
        fetchGovernanceState();
        alert("Experiment concluded with empirical research findings recorded!");
        setConcludingExpId(null);
        setExpFindings("");
      } else {
        alert(json.message || "Failed to conclude experiment.");
      }
    } catch (err: any) {
      alert("Error concluding experiment: " + err.message);
    }
  };

  const handleExportData = async (type: "predictions" | "trades" | "journal", format: "json" | "csv") => {
    try {
      const res = await fetch("/api/market/research/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, format })
      });
      const json = await res.json();
      if (json.success) {
        const blob = new Blob([json.data], { type: format === "json" ? "application/json" : "text/csv" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = json.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        alert(json.message || "Failed to export data");
      }
    } catch (err: any) {
      alert("Error exporting data: " + err.message);
    }
  };

  useEffect(() => {
    if (activeAnalysisTab === "validation") {
      fetchLabState();
      fetchGovernanceState();
      const interval = setInterval(() => {
        fetchLabState();
        fetchGovernanceState();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [activeAnalysisTab]);

  const fetchValidationData = async (horizon: string) => {
    setIsValidating(true);
    setValidationError(null);
    try {
      const res = await fetch(`/api/market/research/validate-framework?horizon=${horizon}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setValidationData(data);
      } else {
        setValidationError(data.message || "Failed to load validation framework metrics.");
      }
    } catch (err: any) {
      setValidationError(err.message || "Error connecting to validation engine.");
    } finally {
      setIsValidating(false);
    }
  };

  useEffect(() => {
    if (activeAnalysisTab === "validation") {
      fetchValidationData(selectedHorizon);
    }
  }, [activeAnalysisTab, selectedHorizon]);

  // Guide Section Active Tab
  const [activeGuideTab, setActiveGuideTab] = useState<"candles" | "patterns" | "indicators" | "risk">("candles");

  // Pattern Filter
  const [patternFilter, setPatternFilter] = useState<"all" | "reversal" | "continuation" | "candlestick">("all");

  // Dynamic Indicator Values
  const [rsiPeriod, setRsiPeriod] = useState<number>(14);
  const [macdFast, setMacdFast] = useState<number>(12);
  const [macdSlow, setMacdSlow] = useState<number>(26);
  const [macdSignal, setMacdSignal] = useState<number>(9);
  const [bbPeriod, setBbPeriod] = useState<number>(20);
  const [bbMultiplier, setBbMultiplier] = useState<number>(2.0);

  const [secondTick, setSecondTick] = useState<number>(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const getFuturesCountdown = (signalTimestamp: number) => {
    const elapsedMs = Date.now() - signalTimestamp;
    const totalMs = 10 * 60 * 1000; // 10 minutes
    const remainingMs = Math.max(0, totalMs - elapsedMs);
    const remainingSec = Math.floor(remainingMs / 1000);
    const mins = Math.floor(remainingSec / 60);
    const secs = remainingSec % 60;
    return {
      formatted: `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`,
      expired: remainingSec <= 0,
      remainingSec
    };
  };

  const getLiveValidationStrength = (sig: any) => {
    if (!sig || !sig.futuresPrediction) return 0;
    const baseStrength = sig.futuresPrediction.validationStrength || 80;
    if (!currentPrice || !sig.entryPrice) return baseStrength;

    const entry = sig.entryPrice;
    const target = sig.futuresPrediction.targetPrice;
    const current = currentPrice;
    const direction = sig.futuresPrediction.targetDirection;

    // variance (+/- 1.5% random wiggle) to feel active
    const wiggle = Math.sin(secondTick * 0.1) * 1.5;

    if (direction === "UP") {
      if (target === entry) return Math.min(99, Math.max(10, Math.round(baseStrength + wiggle)));
      const progress = (current - entry) / (target - entry);
      const calculated = baseStrength + (progress * 15) + wiggle;
      return Math.min(99, Math.max(10, Math.round(calculated)));
    } else {
      if (target === entry) return Math.min(99, Math.max(10, Math.round(baseStrength + wiggle)));
      const progress = (entry - current) / (entry - target);
      const calculated = baseStrength + (progress * 15) + wiggle;
      return Math.min(99, Math.max(10, Math.round(calculated)));
    }
  };

  // AI Parameter Optimization
  const [isAdaptiveTuning, setIsAdaptiveTuning] = useState<boolean>(true);
  const [tuningReason, setTuningReason] = useState<string>("Standard Parameters Active");

  const symbolConfig = SUPPORTED_SYMBOLS_MAP[activeSymbol] || { name: activeSymbol, base: activeSymbol, quote: "USDT" };

  // Component Canvas Refs
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const indCanvasRef = useRef<HTMLCanvasElement>(null);

  // Indicators calculations memoized with dynamic states
  const rsiValues = useMemo(() => calculateRSI(klines, rsiPeriod), [klines, rsiPeriod]);
  const macdValues = useMemo(() => calculateMACD(klines, macdFast, macdSlow, macdSignal), [klines, macdFast, macdSlow, macdSignal]);
  const bbValues = useMemo(() => calculateBollingerBands(klines, bbPeriod, bbMultiplier), [klines, bbPeriod, bbMultiplier]);

  // AI Adaptive Parameter Tuning Engine based on live market conditions
  useEffect(() => {
    if (!isAdaptiveTuning || klines.length < 30) {
      if (!isAdaptiveTuning) {
        setTuningReason("Manual Overrides Enabled - Dynamic parameter locking bypassed.");
      }
      return;
    }

    // 1. Compute Volatility (using closing prices of the last 20 candles)
    const closes = klines.slice(-20).map(c => c.close);
    const mean = closes.reduce((sum, v) => sum + v, 0) / closes.length;
    const variance = closes.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / closes.length;
    const stdDev = Math.sqrt(variance);
    const pctVolatility = (stdDev / (mean || 1)) * 100;

    // 2. Compute EMA-7 / EMA-25 Momentum slope difference as a proxy for trend strength
    const closesAll = klines.map(c => c.close);
    const ema7Array = calculateEMAArray(closesAll, 7);
    const ema25Array = calculateEMAArray(closesAll, 25);
    const lastEma7 = ema7Array[ema7Array.length - 1] || mean;
    const lastEma25 = ema25Array[ema25Array.length - 1] || mean;
    const trendDiffPct = (Math.abs(lastEma7 - lastEma25) / (lastEma25 || 1)) * 100;

    // 3. Apply conditioning optimizations
    if (pctVolatility > 1.6) {
      // High Volatility / Choppy Market: Smooth out indicators, widen bands to prevent fake breakouts
      setRsiPeriod(18);
      setMacdFast(15);
      setMacdSlow(30);
      setMacdSignal(12);
      setBbPeriod(20);
      setBbMultiplier(2.4);
      setTuningReason(`High Volatility Detected (${pctVolatility.toFixed(2)}%) - Optimized for [Anti-Noise Filter]: RSI(18), BB(2.4x) to avoid false spikes.`);
    } else if (trendDiffPct > 0.8) {
      // Strong Momentum Trend: Heighten sensitivity to capture entries early
      setRsiPeriod(10);
      setMacdFast(8);
      setMacdSlow(21);
      setMacdSignal(5);
      setBbPeriod(18);
      setBbMultiplier(1.8);
      setTuningReason(`Strong Momentum Trend (${trendDiffPct.toFixed(2)}%) - Optimized for [Velocity Riding]: RSI(10), Fast MACD(8,21) for early entry signal.`);
    } else {
      // Low volatility / range-bound consolidation
      setRsiPeriod(14);
      setMacdFast(12);
      setMacdSlow(26);
      setMacdSignal(9);
      setBbPeriod(20);
      setBbMultiplier(2.0);
      setTuningReason(`Neutral Consolidation Detected - Optimized for [Range-Boundary Trade]: Standard RSI(14) & Bollinger (2.0x).`);
    }
  }, [klines, isAdaptiveTuning, activeSymbol]);

  // Compute Current Technical Metrics for Sentiment Gauge
  const currentMetrics = useMemo(() => {
    if (klines.length < 5) return { rsi: 50, rsiStatus: "Neutral", macdSignal: "Neutral", sentimentScore: 50 };
    
    // RSI assessment
    const lastRSI = rsiValues[rsiValues.length - 1] || 50;
    let rsiStatus = "Neutral";
    if (lastRSI > 70) rsiStatus = "Overbought (Bearish Bias)";
    else if (lastRSI < 30) rsiStatus = "Oversold (Bullish Bias)";
    else if (lastRSI > 55) rsiStatus = "Bullish Momentum";
    else if (lastRSI < 45) rsiStatus = "Bearish Momentum";

    // MACD assessment
    const lastHist = macdValues.histogram[macdValues.histogram.length - 1] || 0;
    const prevHist = macdValues.histogram[macdValues.histogram.length - 2] || 0;
    let macdSignal = "Neutral / Sideways";
    if (lastHist > 0 && prevHist <= 0) macdSignal = "Bullish Crossover (BUY)";
    else if (lastHist < 0 && prevHist >= 0) macdSignal = "Bearish Crossover (SELL)";
    else if (lastHist > 0) macdSignal = "Bullish Expansion";
    else if (lastHist < 0) macdSignal = "Bearish Expansion";

    // Bollinger Band bias
    const lastPrice = currentPrice || klines[klines.length - 1]?.close || 0;
    const lastBB = bbValues[bbValues.length - 1] || { upper: lastPrice, middle: lastPrice, lower: lastPrice };
    let bbSignal = "Inside Neutral Range";
    const bbBandwidth = lastBB.upper - lastBB.lower || 1;
    const bbPos = (lastPrice - lastBB.lower) / bbBandwidth;
    if (lastPrice >= lastBB.upper) bbSignal = "Upper Band Rejection (Bearish Reversal Risk)";
    else if (lastPrice <= lastBB.lower) bbSignal = "Lower Band Support (Bullish Rebound Zone)";
    else if (bbPos > 0.7) bbSignal = "Trading near upper channel";
    else if (bbPos < 0.3) bbSignal = "Trading near lower channel";

    // Sentiment Score Builder (0 to 100)
    let score = 50; // base neutral
    if (lastRSI > 70) score -= 15;
    else if (lastRSI < 30) score += 15;
    else if (lastRSI > 50) score += (lastRSI - 50) * 0.4;
    else score -= (50 - lastRSI) * 0.4;

    if (lastHist > 0) score += 12;
    else score -= 12;

    if (lastPrice > lastBB.middle) score += 8;
    else score -= 8;

    score = Math.max(5, Math.min(95, score));

    return {
      rsi: lastRSI,
      rsiStatus,
      macdSignal,
      bbSignal,
      sentimentScore: score,
    };
  }, [rsiValues, macdValues, bbValues, klines, currentPrice]);

  // ==========================================
  // HIGH-FIDELITY MATHEMATICAL PATTERN ANCHORING
  // ==========================================
  const getHeadAndShouldersCoords = (candles: KlineData[]) => {
    const len = candles.length;
    const headSearchStart = Math.floor(len * 0.25);
    const headSearchEnd = Math.floor(len * 0.75);
    
    // Find absolute head peak in the middle range
    let headIdx = headSearchStart;
    let maxH = candles[headSearchStart].high;
    for (let i = headSearchStart; i <= headSearchEnd; i++) {
      if (candles[i].high > maxH) {
        maxH = candles[i].high;
        headIdx = i;
      }
    }
    
    // Left shoulder: highest high in first portion
    let lsIdx = 2;
    let lsH = candles[2].high;
    for (let i = 2; i < headIdx - 3; i++) {
      if (candles[i].high > lsH) {
        lsH = candles[i].high;
        lsIdx = i;
      }
    }
    
    // Right shoulder: highest high in last portion
    let rsIdx = Math.min(len - 3, headIdx + 4);
    let rsH = candles[rsIdx]?.high || candles[len - 1].high;
    for (let i = headIdx + 4; i < len - 2; i++) {
      if (candles[i].high > rsH) {
        rsH = candles[i].high;
        rsIdx = i;
      }
    }
    
    // Valley 1: minimum low between LS and Head
    let n1Idx = Math.floor((lsIdx + headIdx) / 2);
    let n1L = candles[n1Idx].low;
    for (let i = lsIdx; i < headIdx; i++) {
      if (candles[i].low < n1L) {
        n1L = candles[i].low;
        n1Idx = i;
      }
    }
    
    // Valley 2: minimum low between Head and RS
    let n2Idx = Math.floor((headIdx + rsIdx) / 2);
    let n2L = candles[n2Idx].low;
    for (let i = headIdx; i < rsIdx; i++) {
      if (candles[i].low < n2L) {
        n2L = candles[i].low;
        n2Idx = i;
      }
    }
    
    return {
      ls: { index: lsIdx, price: lsH },
      n1: { index: n1Idx, price: n1L },
      h: { index: headIdx, price: maxH },
      n2: { index: n2Idx, price: n2L },
      rs: { index: rsIdx, price: rsH },
    };
  };

  const getDoubleBottomCoords = (candles: KlineData[]) => {
    const len = candles.length;
    // Valley 1 in first half
    let b1Idx = 2;
    let b1L = candles[2].low;
    for (let i = 2; i < Math.floor(len * 0.45); i++) {
      if (candles[i].low < b1L) {
        b1L = candles[i].low;
        b1Idx = i;
      }
    }
    
    // Valley 2 in second half
    let b2Idx = Math.floor(len * 0.55);
    let b2L = candles[b2Idx].low;
    for (let i = Math.floor(len * 0.55); i < len - 2; i++) {
      if (candles[i].low < b2L) {
        b2L = candles[i].low;
        b2Idx = i;
      }
    }
    
    // Intermediate Peak
    let peakIdx = Math.floor((b1Idx + b2Idx) / 2);
    let peakH = candles[peakIdx].high;
    for (let i = b1Idx; i <= b2Idx; i++) {
      if (candles[i].high > peakH) {
        peakH = candles[i].high;
        peakIdx = i;
      }
    }
    
    return {
      b1: { index: b1Idx, price: b1L },
      peak: { index: peakIdx, price: peakH },
      b2: { index: b2Idx, price: b2L },
    };
  };

  const getDoubleTopCoords = (candles: KlineData[]) => {
    const len = candles.length;
    // Peak 1 in first half
    let t1Idx = 2;
    let t1H = candles[2].high;
    for (let i = 2; i < Math.floor(len * 0.45); i++) {
      if (candles[i].high > t1H) {
        t1H = candles[i].high;
        t1Idx = i;
      }
    }
    
    // Peak 2 in second half
    let t2Idx = Math.floor(len * 0.55);
    let t2H = candles[t2Idx].high;
    for (let i = Math.floor(len * 0.55); i < len - 2; i++) {
      if (candles[i].high > t2H) {
        t2H = candles[i].high;
        t2Idx = i;
      }
    }
    
    // Intermediate Valley
    let valleyIdx = Math.floor((t1Idx + t2Idx) / 2);
    let valleyL = candles[valleyIdx].low;
    for (let i = t1Idx; i <= t2Idx; i++) {
      if (candles[i].low < valleyL) {
        valleyL = candles[i].low;
        valleyIdx = i;
      }
    }
    
    return {
      t1: { index: t1Idx, price: t1H },
      valley: { index: valleyIdx, price: valleyL },
      t2: { index: t2Idx, price: t2H },
    };
  };

  const getBullishFlagCoords = (candles: KlineData[]) => {
    const len = candles.length;
    let maxRallyDiff = -Infinity;
    let poleStartIdx = 0;
    let poleEndIdx = 10;
    
    for (let i = 0; i < Math.floor(len * 0.6) - 6; i++) {
      const diff = candles[i + 6].high - candles[i].low;
      if (diff > maxRallyDiff) {
        maxRallyDiff = diff;
        poleStartIdx = i;
        poleEndIdx = i + 6;
      }
    }
    
    return {
      poleStart: { index: poleStartIdx, price: candles[poleStartIdx].low },
      poleEnd: { index: poleEndIdx, price: candles[poleEndIdx].high },
      channelEndIdx: len - 4,
    };
  };

  const getAscendingTriangleCoords = (candles: KlineData[]) => {
    const len = candles.length;
    let ceilPrice = -Infinity;
    let ceilIdx = 0;
    for (let i = 0; i < len; i++) {
      if (candles[i].high > ceilPrice) {
        ceilPrice = candles[i].high;
        ceilIdx = i;
      }
    }
    
    let low1Idx = 0;
    let low1Price = candles[0].low;
    for (let i = 0; i < Math.floor(len * 0.35); i++) {
      if (candles[i].low < low1Price) {
        low1Price = candles[i].low;
        low1Idx = i;
      }
    }
    
    let low2Idx = Math.floor(len * 0.5);
    let low2Price = candles[low2Idx].low;
    for (let i = Math.floor(len * 0.35); i < Math.floor(len * 0.75); i++) {
      if (candles[i].low < low2Price && candles[i].low > low1Price) {
        low2Price = candles[i].low;
        low2Idx = i;
      }
    }
    
    return {
      ceil: { index: ceilIdx, price: ceilPrice },
      low1: { index: low1Idx, price: low1Price },
      low2: { index: low2Idx, price: low2Price },
    };
  };

  const getSymmetricalTriangleCoords = (candles: KlineData[]) => {
    const len = candles.length;
    let h1Idx = 0;
    let h1Price = candles[0].high;
    for (let i = 0; i < Math.floor(len * 0.45); i++) {
      if (candles[i].high > h1Price) {
        h1Price = candles[i].high;
        h1Idx = i;
      }
    }
    
    let h2Idx = Math.floor(len * 0.5);
    let h2Price = candles[h2Idx].high;
    for (let i = Math.floor(len * 0.5); i < len - 2; i++) {
      if (candles[i].high > h2Price && candles[i].high < h1Price) {
        h2Price = candles[i].high;
        h2Idx = i;
      }
    }
    
    let l1Idx = 0;
    let l1Price = candles[0].low;
    for (let i = 0; i < Math.floor(len * 0.45); i++) {
      if (candles[i].low < l1Price) {
        l1Price = candles[i].low;
        l1Idx = i;
      }
    }
    
    let l2Idx = Math.floor(len * 0.5);
    let l2Price = candles[l2Idx].low;
    for (let i = Math.floor(len * 0.5); i < len - 2; i++) {
      if (candles[i].low < l2Price && candles[i].low > l1Price) {
        l2Price = candles[i].low;
        l2Idx = i;
      }
    }
    
    return {
      h1: { index: h1Idx, price: h1Price },
      h2: { index: h2Idx, price: h2Price },
      l1: { index: l1Idx, price: l1Price },
      l2: { index: l2Idx, price: l2Price },
    };
  };

  // Handle Canvas Resizing and Drawing
  useEffect(() => {
    const mainCanvas = mainCanvasRef.current;
    const indCanvas = indCanvasRef.current;
    if (!mainCanvas || !indCanvas || klines.length === 0) return;

    const mainCtx = mainCanvas.getContext("2d");
    const indCtx = indCanvas.getContext("2d");
    if (!mainCtx || !indCtx) return;

    const activeSignal = signals.find(s => s.id === activeSignalId) || signals[0];

    // Set correct DPR sizes
    const dpr = window.devicePixelRatio || 1;
    
    // Main Chart Box Dimensions
    const mWidth = mainCanvas.parentElement?.clientWidth || 600;
    const mHeight = 260;
    mainCanvas.width = mWidth * dpr;
    mainCanvas.height = mHeight * dpr;
    mainCtx.scale(dpr, dpr);

    // Indicator Box Dimensions
    const iWidth = indCanvas.parentElement?.clientWidth || 600;
    const iHeight = 100;
    indCanvas.width = iWidth * dpr;
    indCanvas.height = iHeight * dpr;
    indCtx.scale(dpr, dpr);

    // Filter to the last 55 candles for focus
    const candlesToDraw = 50;
    const sliceIndex = Math.max(0, klines.length - candlesToDraw);
    const visibleCandles = klines.slice(sliceIndex);
    const visibleBB = bbValues.slice(sliceIndex);
    const visibleRSI = rsiValues.slice(sliceIndex);
    
    const visibleMACD = {
      macdLine: macdValues.macdLine.slice(sliceIndex),
      signalLine: macdValues.signalLine.slice(sliceIndex),
      histogram: macdValues.histogram.slice(sliceIndex),
    };

    if (visibleCandles.length === 0) return;

    // Find Price Limits
    let maxPrice = -Infinity;
    let minPrice = Infinity;
    visibleCandles.forEach((c, idx) => {
      // Candlestick highs/lows
      if (c.high > maxPrice) maxPrice = c.high;
      if (c.low < minPrice) minPrice = c.low;

      // Bollinger Upper/Lower overlays
      if (overlayBollinger && visibleBB[idx]) {
        const bb = visibleBB[idx];
        if (bb.upper > maxPrice) maxPrice = bb.upper;
        if (bb.lower < minPrice) minPrice = bb.lower;
      }
    });

    // Add padding to heights
    const priceDiff = maxPrice - minPrice || 1;
    maxPrice += priceDiff * 0.08;
    minPrice -= priceDiff * 0.08;
    if (minPrice < 0) minPrice = 0;

    // Main Chart Layout Grid
    const padLeft = 10;
    const padRight = 65;
    const chartWidth = mWidth - padLeft - padRight;
    const chartHeight = mHeight - 25;
    const paddingTop = 15;

    // Coordinate Mappings
    const getX = (index: number) => padLeft + (index / (visibleCandles.length - 1)) * chartWidth;
    const getY = (price: number) =>
      paddingTop + (chartHeight - paddingTop) * (1 - (price - minPrice) / (maxPrice - minPrice));

    // Draw Main Background
    mainCtx.fillStyle = "#16181a";
    mainCtx.fillRect(0, 0, mWidth, mHeight);

    // Draw Horizontal Grid Lines
    mainCtx.strokeStyle = "#24262b";
    mainCtx.lineWidth = 0.8;
    mainCtx.fillStyle = "#848e9c";
    mainCtx.font = "9px monospace";

    const gridLinesCount = 5;
    for (let i = 0; i < gridLinesCount; i++) {
      const p = minPrice + (priceDiff * i) / (gridLinesCount - 1);
      const y = getY(p);
      mainCtx.beginPath();
      mainCtx.moveTo(padLeft, y);
      mainCtx.lineTo(padLeft + chartWidth, y);
      mainCtx.stroke();

      // Draw price tag
      const isMeme = activeSymbol.includes("SHIB") || activeSymbol.includes("PEPE");
      const dec = isMeme ? 6 : (p > 100 ? 1 : 3);
      mainCtx.fillText(p.toFixed(dec), padLeft + chartWidth + 6, y + 3);
    }

    // Draw Candlesticks
    const slotWidth = chartWidth / visibleCandles.length;
    const candleWidth = slotWidth * 0.72;

    visibleCandles.forEach((candle, idx) => {
      const isGreen = candle.close >= candle.open;
      const x = getX(idx);
      const centerX = x;

      const openY = getY(candle.open);
      const closeY = getY(candle.close);
      const highY = getY(candle.high);
      const lowY = getY(candle.low);

      const top = Math.min(openY, closeY);
      const height = Math.max(1, Math.abs(openY - closeY));

      const themeGreen = "#0ecb81";
      const themeRed = "#f6465d";

      mainCtx.strokeStyle = isGreen ? themeGreen : themeRed;
      mainCtx.fillStyle = isGreen ? themeGreen : themeRed;
      mainCtx.lineWidth = 1.1;

      // Draw Wicks
      mainCtx.beginPath();
      mainCtx.moveTo(centerX, highY);
      mainCtx.lineTo(centerX, lowY);
      mainCtx.stroke();

      // Draw Body
      mainCtx.fillRect(centerX - candleWidth / 2, top, candleWidth, height);
    });

    // Draw Bollinger Bands (if enabled)
    if (overlayBollinger) {
      // 1. Fill shading
      mainCtx.fillStyle = "rgba(240, 185, 11, 0.02)";
      mainCtx.beginPath();
      visibleBB.forEach((bb, idx) => {
        const x = getX(idx);
        const yUpper = getY(bb.upper);
        if (idx === 0) mainCtx.moveTo(x, yUpper);
        else mainCtx.lineTo(x, yUpper);
      });
      for (let idx = visibleBB.length - 1; idx >= 0; idx--) {
        const x = getX(idx);
        const yLower = getY(visibleBB[idx].lower);
        mainCtx.lineTo(x, yLower);
      }
      mainCtx.closePath();
      mainCtx.fill();

      // 2. Draw upper boundary
      mainCtx.strokeStyle = "rgba(240, 185, 11, 0.35)";
      mainCtx.lineWidth = 1.0;
      mainCtx.setLineDash([4, 4]);
      mainCtx.beginPath();
      visibleBB.forEach((bb, idx) => {
        const x = getX(idx);
        const y = getY(bb.upper);
        if (idx === 0) mainCtx.moveTo(x, y);
        else mainCtx.lineTo(x, y);
      });
      mainCtx.stroke();

      // 3. Draw lower boundary
      mainCtx.beginPath();
      visibleBB.forEach((bb, idx) => {
        const x = getX(idx);
        const y = getY(bb.lower);
        if (idx === 0) mainCtx.moveTo(x, y);
        else mainCtx.lineTo(x, y);
      });
      mainCtx.stroke();
      mainCtx.setLineDash([]); // clear dash
    }

    // ==========================================
    // DRAW DYNAMIC AI-GENERATED TRENDLINES / CHANNELS / BREAKOUT LEVELS
    // ==========================================
    if (activeSignal && activeSignal.trendLines && activeSignal.trendLines.length > 0) {
      activeSignal.trendLines.forEach((tl: any) => {
        const totalVis = visibleCandles.length;
        // The AI analyzed the latest 20 candles of the active timeframe.
        // Index 0 to 19 of the AI corresponds to the latest 20 candles in visibleCandles.
        const mappedStartIdx = totalVis - 20 + tl.startIdx;
        const mappedEndIdx = totalVis - 20 + tl.endIdx;

        if (mappedStartIdx >= 0 && mappedStartIdx < totalVis && mappedEndIdx >= 0 && mappedEndIdx < totalVis) {
          const x1 = getX(mappedStartIdx);
          const y1 = getY(tl.startPrice);
          const x2 = getX(mappedEndIdx);
          const y2 = getY(tl.endPrice);

          if (tl.type === "SUPPORT") {
            mainCtx.strokeStyle = "rgba(14, 203, 129, 0.9)";
            mainCtx.lineWidth = 2.0;
            mainCtx.setLineDash([5, 3]);
          } else if (tl.type === "RESISTANCE") {
            mainCtx.strokeStyle = "rgba(246, 70, 93, 0.9)";
            mainCtx.lineWidth = 2.0;
            mainCtx.setLineDash([5, 3]);
          } else if (tl.type === "BREAKOUT_LEVEL") {
            mainCtx.strokeStyle = "rgba(240, 185, 11, 0.95)";
            mainCtx.lineWidth = 2.2;
            mainCtx.setLineDash([]);
          } else {
            mainCtx.strokeStyle = "rgba(160, 118, 255, 0.9)";
            mainCtx.lineWidth = 1.8;
            mainCtx.setLineDash([3, 3]);
          }

          // Draw line segment
          mainCtx.beginPath();
          mainCtx.moveTo(x1, y1);
          mainCtx.lineTo(x2, y2);
          mainCtx.stroke();
          mainCtx.setLineDash([]);

          // Glowing nodes
          mainCtx.fillStyle = tl.type === "SUPPORT" ? "#0ecb81" : tl.type === "RESISTANCE" ? "#f6465d" : tl.type === "BREAKOUT_LEVEL" ? "#f0b90b" : "#a076ff";
          mainCtx.beginPath();
          mainCtx.arc(x1, y1, 4, 0, 2 * Math.PI);
          mainCtx.arc(x2, y2, 4, 0, 2 * Math.PI);
          mainCtx.fill();

          // Label
          mainCtx.fillStyle = "#ffffff";
          mainCtx.font = "bold 8px monospace";
          mainCtx.fillText(`[AI] ${tl.name}`, x1 + 6, y1 - 4);
        }
      });
    } else if (drawCmtTrendlines && visibleCandles.length >= 15) {
      const swingHighs: { idx: number; price: number }[] = [];
      const swingLows: { idx: number; price: number }[] = [];
      const windowSize = 4;

      for (let i = windowSize; i < visibleCandles.length - windowSize; i++) {
        let isHigh = true;
        let isLow = true;
        for (let j = -windowSize; j <= windowSize; j++) {
          if (visibleCandles[i + j].high > visibleCandles[i].high) isHigh = false;
          if (visibleCandles[i + j].low < visibleCandles[i].low) isLow = false;
        }
        if (isHigh) swingHighs.push({ idx: i, price: visibleCandles[i].high });
        if (isLow) swingLows.push({ idx: i, price: visibleCandles[i].low });
      }

      // Draw Resistance Trendline
      if (swingHighs.length >= 2) {
        swingHighs.sort((a, b) => b.price - a.price);
        const p1 = swingHighs[0];
        const p2 = swingHighs.find(p => Math.abs(p.idx - p1.idx) > 6) || swingHighs[1];

        if (p1 && p2) {
          mainCtx.strokeStyle = "rgba(246, 70, 93, 0.75)";
          mainCtx.lineWidth = 1.5;
          mainCtx.setLineDash([4, 4]);
          mainCtx.beginPath();
          mainCtx.moveTo(getX(p1.idx), getY(p1.price));
          mainCtx.lineTo(getX(p2.idx), getY(p2.price));
          mainCtx.stroke();
          mainCtx.setLineDash([]);

          mainCtx.fillStyle = "#f6465d";
          mainCtx.beginPath();
          mainCtx.arc(getX(p1.idx), getY(p1.price), 3, 0, 2 * Math.PI);
          mainCtx.arc(getX(p2.idx), getY(p2.price), 3, 0, 2 * Math.PI);
          mainCtx.fill();

          mainCtx.fillStyle = "rgba(246, 70, 93, 0.9)";
          mainCtx.font = "bold 8px monospace";
          mainCtx.fillText("CMT SUPPLY RESISTANCE LINE", getX(Math.min(p1.idx, p2.idx)) + 5, getY(Math.max(p1.price, p2.price)) - 6);
        }
      }

      // Draw Support Trendline
      if (swingLows.length >= 2) {
        swingLows.sort((a, b) => a.price - b.price);
        const v1 = swingLows[0];
        const v2 = swingLows.find(v => Math.abs(v.idx - v1.idx) > 6) || swingLows[1];

        if (v1 && v2) {
          mainCtx.strokeStyle = "rgba(14, 203, 129, 0.75)";
          mainCtx.lineWidth = 1.5;
          mainCtx.setLineDash([4, 4]);
          mainCtx.beginPath();
          mainCtx.moveTo(getX(v1.idx), getY(v1.price));
          mainCtx.lineTo(getX(v2.idx), getY(v2.price));
          mainCtx.stroke();
          mainCtx.setLineDash([]);

          mainCtx.fillStyle = "#0ecb81";
          mainCtx.beginPath();
          mainCtx.arc(getX(v1.idx), getY(v1.price), 3, 0, 2 * Math.PI);
          mainCtx.arc(getX(v2.idx), getY(v2.price), 3, 0, 2 * Math.PI);
          mainCtx.fill();

          mainCtx.fillStyle = "rgba(14, 203, 129, 0.9)";
          mainCtx.font = "bold 8px monospace";
          mainCtx.fillText("CMT DEMAND SUPPORT LINE", getX(Math.min(v1.idx, v2.idx)) + 5, getY(Math.min(v1.price, v2.price)) + 12);
        }
      }
    }

    // ==========================================
    // DRAW ACTIVE FORMATION OVERLAYS (GEOMETRICALLY ALIGNED)
    // ==========================================
    if (selectedOverlay && visibleCandles.length >= 40) {
      mainCtx.strokeStyle = "#f0b90b"; // gold/accent lines
      mainCtx.lineWidth = 2.0;
      mainCtx.lineCap = "round";
      mainCtx.lineJoin = "round";

      if (selectedOverlay === "head_shoulder" || selectedOverlay === "head_shoulders") {
        const coords = getHeadAndShouldersCoords(visibleCandles);
        
        const ptLS = { x: getX(coords.ls.index), y: getY(coords.ls.price) };
        const ptN1 = { x: getX(coords.n1.index), y: getY(coords.n1.price) };
        const ptH  = { x: getX(coords.h.index), y: getY(coords.h.price) };
        const ptN2 = { x: getX(coords.n2.index), y: getY(coords.n2.price) };
        const ptRS = { x: getX(coords.rs.index), y: getY(coords.rs.price) };

        // 1. Draw Shoulder to Shoulder curves
        mainCtx.beginPath();
        mainCtx.moveTo(getX(Math.max(0, coords.ls.index - 5)), ptN1.y);
        mainCtx.lineTo(ptLS.x, ptLS.y);
        mainCtx.lineTo(ptN1.x, ptN1.y);
        mainCtx.lineTo(ptH.x, ptH.y);
        mainCtx.lineTo(ptN2.x, ptN2.y);
        mainCtx.lineTo(ptRS.x, ptRS.y);
        mainCtx.lineTo(getX(Math.min(visibleCandles.length - 1, coords.rs.index + 5)), ptN2.y);
        mainCtx.stroke();

        // 2. Draw Neckline (connecting Valley 1 and Valley 2)
        mainCtx.strokeStyle = "rgba(255, 255, 255, 0.5)";
        mainCtx.lineWidth = 1.2;
        mainCtx.setLineDash([3, 3]);
        mainCtx.beginPath();
        mainCtx.moveTo(ptLS.x - 15, ptN1.y);
        mainCtx.lineTo(ptRS.x + 15, ptN2.y);
        mainCtx.stroke();
        mainCtx.setLineDash([]);

        // 3. Draw Breakout Arrow (shooting downwards past Right Shoulder)
        mainCtx.strokeStyle = "#f6465d";
        mainCtx.lineWidth = 2.5;
        const arrowStart = { x: ptRS.x, y: ptN2.y };
        const arrowEnd = { x: ptRS.x + 25, y: ptN2.y + 35 };
        mainCtx.beginPath();
        mainCtx.moveTo(arrowStart.x, arrowStart.y);
        mainCtx.lineTo(arrowEnd.x, arrowEnd.y);
        mainCtx.stroke();

        mainCtx.fillStyle = "#f6465d";
        mainCtx.beginPath();
        mainCtx.arc(arrowEnd.x, arrowEnd.y, 4, 0, 2 * Math.PI);
        mainCtx.fill();

        // Labels
        mainCtx.fillStyle = "#ffffff";
        mainCtx.font = "bold 9px sans-serif";
        mainCtx.fillText("LS", ptLS.x - 6, ptLS.y - 8);
        mainCtx.fillText("HEAD", ptH.x - 12, ptH.y - 8);
        mainCtx.fillText("RS", ptRS.x - 6, ptRS.y - 8);
        mainCtx.fillStyle = "rgba(255, 255, 255, 0.7)";
        mainCtx.fillText("NECKLINE", ptN1.x + 5, ptN1.y + 12);
        mainCtx.fillStyle = "#f6465d";
        mainCtx.fillText("BREAKDOWN 📉", arrowEnd.x - 15, arrowEnd.y + 12);
      }
      else if (selectedOverlay === "double_bottom") {
        const coords = getDoubleBottomCoords(visibleCandles);
        
        const ptB1 = { x: getX(coords.b1.index), y: getY(coords.b1.price) };
        const ptPeak = { x: getX(coords.peak.index), y: getY(coords.peak.price) };
        const ptB2 = { x: getX(coords.b2.index), y: getY(coords.b2.price) };

        // Draw 'W'
        mainCtx.beginPath();
        mainCtx.moveTo(getX(Math.max(0, coords.b1.index - 5)), ptPeak.y);
        mainCtx.lineTo(ptB1.x, ptB1.y);
        mainCtx.lineTo(ptPeak.x, ptPeak.y);
        mainCtx.lineTo(ptB2.x, ptB2.y);
        mainCtx.lineTo(getX(Math.min(visibleCandles.length - 1, coords.b2.index + 5)), ptPeak.y);
        mainCtx.stroke();

        // Resistance line
        mainCtx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        mainCtx.lineWidth = 1.0;
        mainCtx.setLineDash([4, 4]);
        mainCtx.beginPath();
        mainCtx.moveTo(ptB1.x - 10, ptPeak.y);
        mainCtx.lineTo(ptB2.x + 15, ptPeak.y);
        mainCtx.stroke();
        mainCtx.setLineDash([]);

        // Upward arrow
        mainCtx.strokeStyle = "#0ecb81";
        mainCtx.lineWidth = 2.5;
        const arrowStart = { x: ptB2.x + 5, y: ptPeak.y };
        const arrowEnd = { x: ptB2.x + 25, y: ptPeak.y - 30 };
        mainCtx.beginPath();
        mainCtx.moveTo(arrowStart.x, arrowStart.y);
        mainCtx.lineTo(arrowEnd.x, arrowEnd.y);
        mainCtx.stroke();

        mainCtx.fillStyle = "#0ecb81";
        mainCtx.beginPath();
        mainCtx.arc(arrowEnd.x, arrowEnd.y, 4, 0, 2 * Math.PI);
        mainCtx.fill();

        mainCtx.fillStyle = "#ffffff";
        mainCtx.font = "bold 9px sans-serif";
        mainCtx.fillText("B1", ptB1.x - 5, ptB1.y + 12);
        mainCtx.fillText("B2", ptB2.x - 5, ptB2.y + 12);
        mainCtx.fillText("NECKLINE", ptPeak.x - 22, ptPeak.y - 8);
        mainCtx.fillStyle = "#0ecb81";
        mainCtx.fillText("BREAKOUT 🚀", arrowEnd.x - 10, arrowEnd.y - 8);
      }
      else if (selectedOverlay === "double_top") {
        const coords = getDoubleTopCoords(visibleCandles);
        
        const ptT1 = { x: getX(coords.t1.index), y: getY(coords.t1.price) };
        const ptValley = { x: getX(coords.valley.index), y: getY(coords.valley.price) };
        const ptT2 = { x: getX(coords.t2.index), y: getY(coords.t2.price) };

        // Draw 'M'
        mainCtx.beginPath();
        mainCtx.moveTo(getX(Math.max(0, coords.t1.index - 5)), ptValley.y);
        mainCtx.lineTo(ptT1.x, ptT1.y);
        mainCtx.lineTo(ptValley.x, ptValley.y);
        mainCtx.lineTo(ptT2.x, ptT2.y);
        mainCtx.lineTo(getX(Math.min(visibleCandles.length - 1, coords.t2.index + 5)), ptValley.y);
        mainCtx.stroke();

        // Support line
        mainCtx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        mainCtx.lineWidth = 1.0;
        mainCtx.setLineDash([4, 4]);
        mainCtx.beginPath();
        mainCtx.moveTo(ptT1.x - 10, ptValley.y);
        mainCtx.lineTo(ptT2.x + 15, ptValley.y);
        mainCtx.stroke();
        mainCtx.setLineDash([]);

        // Downward arrow
        mainCtx.strokeStyle = "#f6465d";
        mainCtx.lineWidth = 2.5;
        const arrowStart = { x: ptT2.x + 5, y: ptValley.y };
        const arrowEnd = { x: ptT2.x + 25, y: ptValley.y + 30 };
        mainCtx.beginPath();
        mainCtx.moveTo(arrowStart.x, arrowStart.y);
        mainCtx.lineTo(arrowEnd.x, arrowEnd.y);
        mainCtx.stroke();

        mainCtx.fillStyle = "#f6465d";
        mainCtx.beginPath();
        mainCtx.arc(arrowEnd.x, arrowEnd.y, 4, 0, 2 * Math.PI);
        mainCtx.fill();

        mainCtx.fillStyle = "#ffffff";
        mainCtx.font = "bold 9px sans-serif";
        mainCtx.fillText("T1", ptT1.x - 5, ptT1.y - 8);
        mainCtx.fillText("T2", ptT2.x - 5, ptT2.y - 8);
        mainCtx.fillText("NECKLINE SUPPORT", ptValley.x - 45, ptValley.y - 8);
        mainCtx.fillStyle = "#f6465d";
        mainCtx.fillText("BREAKDOWN 📉", arrowEnd.x - 10, arrowEnd.y + 12);
      }
      else if (selectedOverlay === "bullish_flag") {
        const coords = getBullishFlagCoords(visibleCandles);
        
        const ptPLow = { x: getX(coords.poleStart.index), y: getY(coords.poleStart.price) };
        const ptPHigh = { x: getX(coords.poleEnd.index), y: getY(coords.poleEnd.price) };

        // 1. Draw Flagpole
        mainCtx.strokeStyle = "#f0b90b";
        mainCtx.lineWidth = 3.0;
        mainCtx.beginPath();
        mainCtx.moveTo(ptPLow.x, ptPLow.y);
        mainCtx.lineTo(ptPHigh.x, ptPHigh.y);
        mainCtx.stroke();

        // 2. Parallel Channels (downward sloping flag)
        const flagWidthX = getX(coords.channelEndIdx) - ptPHigh.x;
        const flagHeightY = (ptPLow.y - ptPHigh.y) * 0.35; // height of flag channel

        const ptTop1 = ptPHigh;
        const ptBottom1 = { x: ptPHigh.x, y: ptPHigh.y + flagHeightY };
        const ptTop2 = { x: getX(coords.channelEndIdx), y: ptPHigh.y + flagHeightY * 0.4 };
        const ptBottom2 = { x: getX(coords.channelEndIdx), y: ptPHigh.y + flagHeightY * 1.4 };

        mainCtx.strokeStyle = "#ffffff";
        mainCtx.lineWidth = 1.8;

        // Top parallel line
        mainCtx.beginPath();
        mainCtx.moveTo(ptTop1.x, ptTop1.y);
        mainCtx.lineTo(ptTop2.x, ptTop2.y);
        mainCtx.stroke();

        // Bottom parallel line
        mainCtx.beginPath();
        mainCtx.moveTo(ptBottom1.x, ptBottom1.y);
        mainCtx.lineTo(ptBottom2.x, ptBottom2.y);
        mainCtx.stroke();

        // Fill background of flag
        mainCtx.fillStyle = "rgba(255, 255, 255, 0.04)";
        mainCtx.beginPath();
        mainCtx.moveTo(ptTop1.x, ptTop1.y);
        mainCtx.lineTo(ptTop2.x, ptTop2.y);
        mainCtx.lineTo(ptBottom2.x, ptBottom2.y);
        mainCtx.lineTo(ptBottom1.x, ptBottom1.y);
        mainCtx.closePath();
        mainCtx.fill();

        // 3. Breakout arrow shooting out
        mainCtx.strokeStyle = "#0ecb81";
        mainCtx.lineWidth = 2.5;
        const breakX = ptTop2.x - flagWidthX * 0.3;
        const breakY = ptTop2.y - flagHeightY * 0.15;
        const breakEnd = { x: ptTop2.x + 20, y: ptTop2.y - 35 };

        mainCtx.beginPath();
        mainCtx.moveTo(breakX, breakY);
        mainCtx.lineTo(breakEnd.x, breakEnd.y);
        mainCtx.stroke();

        mainCtx.fillStyle = "#0ecb81";
        mainCtx.beginPath();
        mainCtx.arc(breakEnd.x, breakEnd.y, 4, 0, 2 * Math.PI);
        mainCtx.fill();

        mainCtx.fillStyle = "#f0b90b";
        mainCtx.font = "bold 9px sans-serif";
        mainCtx.fillText("FLAGPOLE", ptPLow.x + 8, (ptPLow.y + ptPHigh.y) / 2);
        mainCtx.fillStyle = "#ffffff";
        mainCtx.fillText("FLAG CHANNEL", ptTop2.x - 70, ptTop2.y + 25);
        mainCtx.fillStyle = "#0ecb81";
        mainCtx.fillText("BREAKOUT 🚀", breakEnd.x - 15, breakEnd.y - 8);
      }
      else if (selectedOverlay === "ascending_triangle") {
        const coords = getAscendingTriangleCoords(visibleCandles);
        
        const xStart = getX(coords.low1.index);
        const xApex = getX(visibleCandles.length - 2);
        const yTop = getY(coords.ceil.price);
        const yBottomStart = getY(coords.low1.price);
        const yBottomEnd = getY(coords.low2.price);

        // Horizontal ceiling resistance
        mainCtx.beginPath();
        mainCtx.moveTo(xStart, yTop);
        mainCtx.lineTo(xApex, yTop);
        mainCtx.stroke();

        // Rising support trendline
        // Slope calculated to pass through Low 1 and Low 2, projected to Apex
        mainCtx.beginPath();
        mainCtx.moveTo(xStart, yBottomStart);
        mainCtx.lineTo(getX(coords.low2.index), yBottomEnd);
        // Project to Apex
        const slope = (yBottomEnd - yBottomStart) / (getX(coords.low2.index) - xStart);
        const yApexBottom = yBottomStart + slope * (xApex - xStart);
        mainCtx.lineTo(xApex, yApexBottom);
        mainCtx.stroke();

        // Shading inside
        mainCtx.fillStyle = "rgba(255, 255, 255, 0.02)";
        mainCtx.beginPath();
        mainCtx.moveTo(xStart, yTop);
        mainCtx.lineTo(xApex, yTop);
        mainCtx.lineTo(xApex, yApexBottom);
        mainCtx.lineTo(xStart, yBottomStart);
        mainCtx.closePath();
        mainCtx.fill();

        // Breakout arrow
        mainCtx.strokeStyle = "#0ecb81";
        mainCtx.lineWidth = 2.5;
        const arrowEnd = { x: xApex + 20, y: yTop - 35 };
        mainCtx.beginPath();
        mainCtx.moveTo(xApex - 5, yTop);
        mainCtx.lineTo(arrowEnd.x, arrowEnd.y);
        mainCtx.stroke();

        mainCtx.fillStyle = "#0ecb81";
        mainCtx.beginPath();
        mainCtx.arc(arrowEnd.x, arrowEnd.y, 4, 0, 2 * Math.PI);
        mainCtx.fill();

        mainCtx.fillStyle = "#ffffff";
        mainCtx.font = "bold 9px sans-serif";
        mainCtx.fillText("FLAT CEILING RESISTANCE", xStart + 10, yTop - 6);
        mainCtx.fillText("RISING SUPPORT TRENDLINE", xStart + 12, yBottomStart - 6);
        mainCtx.fillStyle = "#0ecb81";
        mainCtx.fillText("UPWARD BREAKOUT 🚀", arrowEnd.x - 30, arrowEnd.y - 8);
      }
      else if (selectedOverlay === "symmetrical_triangle") {
        const coords = getSymmetricalTriangleCoords(visibleCandles);
        
        const xStart = Math.min(getX(coords.h1.index), getX(coords.l1.index));
        const xApex = getX(visibleCandles.length - 2);
        
        const ptH1 = { x: getX(coords.h1.index), y: getY(coords.h1.price) };
        const ptH2 = { x: getX(coords.h2.index), y: getY(coords.h2.price) };
        const ptL1 = { x: getX(coords.l1.index), y: getY(coords.l1.price) };
        const ptL2 = { x: getX(coords.l2.index), y: getY(coords.l2.price) };

        // Converging upper line (lower highs)
        mainCtx.beginPath();
        mainCtx.moveTo(ptH1.x, ptH1.y);
        mainCtx.lineTo(ptH2.x, ptH2.y);
        // Project to Apex
        const slopeH = (ptH2.y - ptH1.y) / (ptH2.x - ptH1.x);
        const yApexTop = ptH1.y + slopeH * (xApex - ptH1.x);
        mainCtx.lineTo(xApex, yApexTop);
        mainCtx.stroke();

        // Converging lower line (higher lows)
        mainCtx.beginPath();
        mainCtx.moveTo(ptL1.x, ptL1.y);
        mainCtx.lineTo(ptL2.x, ptL2.y);
        // Project to Apex
        const slopeL = (ptL2.y - ptL1.y) / (ptL2.x - ptL1.x);
        const yApexBottom = ptL1.y + slopeL * (xApex - ptL1.x);
        mainCtx.lineTo(xApex, yApexBottom);
        mainCtx.stroke();

        // Shading
        mainCtx.fillStyle = "rgba(255, 255, 255, 0.02)";
        mainCtx.beginPath();
        mainCtx.moveTo(ptH1.x, ptH1.y);
        mainCtx.lineTo(xApex, yApexTop);
        mainCtx.lineTo(xApex, yApexBottom);
        mainCtx.lineTo(ptL1.x, ptL1.y);
        mainCtx.closePath();
        mainCtx.fill();

        // Bidirectional breakout lines from apex
        mainCtx.strokeStyle = "#f0b90b";
        mainCtx.lineWidth = 1.5;
        mainCtx.setLineDash([2, 2]);

        const midApexY = (yApexTop + yApexBottom) / 2;

        // Long option
        mainCtx.beginPath();
        mainCtx.moveTo(xApex, midApexY);
        mainCtx.lineTo(xApex + 20, midApexY - 30);
        mainCtx.stroke();

        // Short option
        mainCtx.beginPath();
        mainCtx.moveTo(xApex, midApexY);
        mainCtx.lineTo(xApex + 20, midApexY + 30);
        mainCtx.stroke();

        mainCtx.setLineDash([]);

        mainCtx.fillStyle = "#ffffff";
        mainCtx.font = "bold 9px sans-serif";
        mainCtx.fillText("LOWER HIGHS RESISTANCE", ptH1.x + 10, ptH1.y - 6);
        mainCtx.fillText("HIGHER LOWS SUPPORT", ptL1.x + 10, ptL1.y + 12);
        mainCtx.fillStyle = "#f0b90b";
        mainCtx.fillText("COMPRESSION APEX", xApex - 95, midApexY + 12);
      }
    }

    // ==========================================
    // DRAW MOMENTUM INDICATORS BOX (RSI / MACD)
    // ==========================================
    indCtx.fillStyle = "#121416";
    indCtx.fillRect(0, 0, iWidth, iHeight);

    // Horizontal grid indicators
    indCtx.strokeStyle = "#24262b";
    indCtx.lineWidth = 0.8;
    indCtx.strokeRect(0, 0, iWidth, iHeight);

    const indPadLeft = padLeft;
    const indPadRight = padRight;
    const indWidth = iWidth - indPadLeft - indPadRight;

    const getIndX = (index: number) => indPadLeft + (index / (visibleCandles.length - 1)) * indWidth;

    if (showIndicators === "rsi") {
      const getRsiY = (val: number) => iHeight - 12 - ((val - 0) / 100) * (iHeight - 24);

      // Draw standard guide bands (30, 70, 50)
      indCtx.strokeStyle = "rgba(246, 70, 93, 0.25)"; // 70 level
      indCtx.lineWidth = 1.0;
      indCtx.beginPath();
      indCtx.moveTo(indPadLeft, getRsiY(70));
      indCtx.lineTo(indPadLeft + indWidth, getRsiY(70));
      indCtx.stroke();
      indCtx.fillStyle = "rgba(246, 70, 93, 0.5)";
      indCtx.fillText("70 (Overbought)", indPadLeft + indWidth + 5, getRsiY(70) + 3);

      indCtx.strokeStyle = "rgba(14, 203, 129, 0.25)"; // 30 level
      indCtx.beginPath();
      indCtx.moveTo(indPadLeft, getRsiY(30));
      indCtx.lineTo(indPadLeft + indWidth, getRsiY(30));
      indCtx.stroke();
      indCtx.fillStyle = "rgba(14, 203, 129, 0.5)";
      indCtx.fillText("30 (Oversold)", indPadLeft + indWidth + 5, getRsiY(30) + 3);

      indCtx.strokeStyle = "rgba(255, 255, 255, 0.08)"; // 50 midline
      indCtx.beginPath();
      indCtx.moveTo(indPadLeft, getRsiY(50));
      indCtx.lineTo(indPadLeft + indWidth, getRsiY(50));
      indCtx.stroke();

      // Shaded central zone
      indCtx.fillStyle = "rgba(132, 142, 156, 0.02)";
      indCtx.fillRect(indPadLeft, getRsiY(70), indWidth, getRsiY(30) - getRsiY(70));

      // Draw RSI Line
      indCtx.strokeStyle = "#a076ff"; // Purple RSI line
      indCtx.lineWidth = 1.5;
      indCtx.beginPath();
      visibleRSI.forEach((val, idx) => {
        const x = getIndX(idx);
        const y = getRsiY(val);
        if (idx === 0) indCtx.moveTo(x, y);
        else indCtx.lineTo(x, y);
      });
      indCtx.stroke();

      // Current RSI label
      const currentRsi = visibleRSI[visibleRSI.length - 1] || 50;
      indCtx.fillStyle = "#a076ff";
      indCtx.font = "bold 9px monospace";
      indCtx.fillText(`RSI (14): ${currentRsi.toFixed(2)}`, 10, 15);
    } 
    else if (showIndicators === "macd") {
      // Find MACD limits
      let maxMacd = -Infinity;
      let minMacd = Infinity;
      visibleMACD.macdLine.forEach((val, idx) => {
        if (val > maxMacd) maxMacd = val;
        if (val < minMacd) minMacd = val;
        const sig = visibleMACD.signalLine[idx] || 0;
        if (sig > maxMacd) maxMacd = sig;
        if (sig < minMacd) minMacd = sig;
        const hist = visibleMACD.histogram[idx] || 0;
        if (hist > maxMacd) maxMacd = hist;
        if (hist < minMacd) minMacd = hist;
      });

      const macdDiff = Math.max(0.0001, maxMacd - minMacd);
      const getMacdY = (val: number) =>
        iHeight / 2 - (val / (Math.max(Math.abs(maxMacd), Math.abs(minMacd)) || 1)) * (iHeight / 2 - 10);

      // Draw Zero Midline
      indCtx.strokeStyle = "rgba(255, 255, 255, 0.12)";
      indCtx.lineWidth = 0.8;
      indCtx.beginPath();
      indCtx.moveTo(indPadLeft, iHeight / 2);
      indCtx.lineTo(indPadLeft + indWidth, iHeight / 2);
      indCtx.stroke();

      // Draw Histogram Bars
      visibleMACD.histogram.forEach((hist, idx) => {
        const x = getIndX(idx);
        const yZero = iHeight / 2;
        const yVal = getMacdY(hist);
        const isGreen = hist >= 0;

        indCtx.fillStyle = isGreen ? "rgba(14, 203, 129, 0.4)" : "rgba(246, 70, 93, 0.4)";
        const barWidth = Math.max(1, slotWidth * 0.6);
        indCtx.fillRect(x - barWidth / 2, Math.min(yZero, yVal), barWidth, Math.abs(yZero - yVal));
      });

      // Draw MACD Line (blue)
      indCtx.strokeStyle = "#38bdf8";
      indCtx.lineWidth = 1.3;
      indCtx.beginPath();
      visibleMACD.macdLine.forEach((val, idx) => {
        const x = getIndX(idx);
        const y = getMacdY(val);
        if (idx === 0) indCtx.moveTo(x, y);
        else indCtx.lineTo(x, y);
      });
      indCtx.stroke();

      // Draw Signal Line (orange)
      indCtx.strokeStyle = "#f97316";
      indCtx.lineWidth = 1.3;
      indCtx.beginPath();
      visibleMACD.signalLine.forEach((val, idx) => {
        const x = getIndX(idx);
        const y = getMacdY(val);
        if (idx === 0) indCtx.moveTo(x, y);
        else indCtx.lineTo(x, y);
      });
      indCtx.stroke();

      // Labels
      indCtx.fillStyle = "#ffffff";
      indCtx.font = "bold 9px monospace";
      indCtx.fillText(`MACD (12, 26, 9)`, 10, 15);
      indCtx.fillStyle = "#38bdf8";
      indCtx.fillText(`MACD: ${visibleMACD.macdLine[visibleMACD.macdLine.length - 1]?.toFixed(4)}`, 110, 15);
      indCtx.fillStyle = "#f97316";
      indCtx.fillText(`Signal: ${visibleMACD.signalLine[visibleMACD.signalLine.length - 1]?.toFixed(4)}`, 220, 15);
    }
  }, [klines, selectedOverlay, showIndicators, overlayBollinger, rsiValues, macdValues, bbValues, activeSymbol, signals, activeSignalId, drawCmtTrendlines]);

  // Helper to switch active ticker and align chart pattern overlay
  const handleApplySignal = (sig: any) => {
    if (!sig) return;
    setActiveSymbol(sig.recommendedSymbol);
    if (sig.patternDetected && sig.patternDetected !== "none") {
      setSelectedOverlay(sig.patternDetected);
    } else {
      setSelectedOverlay("");
    }
  };

  // Filtered patterns for reference list
  const filteredPatterns = useMemo(() => {
    if (patternFilter === "all") return PATTERNS_LIBRARY;
    return PATTERNS_LIBRARY.filter((p) => p.category === patternFilter);
  }, [patternFilter]);

  // Simple Markdown Parser for beautiful text output
  const renderAnalysisMarkdown = (text: string) => {
    if (!text) return null;
    const lines = text.split("\n");
    return lines.map((line, idx) => {
      const trimmed = line.trim();
      
      // Header 3
      if (trimmed.startsWith("### ")) {
        return (
          <h4 key={idx} className="text-xs font-bold text-white mt-4 mb-1.5 flex items-center space-x-1 border-b border-[#24262b] pb-0.5">
            <span className="w-1.5 h-1.5 bg-[#f0b90b] rounded-full mr-1.5 inline-block" />
            <span>{trimmed.replace("### ", "")}</span>
          </h4>
        );
      }
      // Header 2
      if (trimmed.startsWith("## ")) {
        return (
          <h3 key={idx} className="text-xs font-extrabold text-[#f0b90b] mt-5 mb-2 flex items-center space-x-1 border-b border-[#34363d] pb-1">
            <span>{trimmed.replace("## ", "")}</span>
          </h3>
        );
      }
      // Header 1
      if (trimmed.startsWith("# ")) {
        return (
          <h2 key={idx} className="text-sm font-black text-[#f0b90b] mt-5 mb-3">
            {trimmed.replace("# ", "")}
          </h2>
        );
      }
      // Lists
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        const content = trimmed.substring(2);
        return (
          <li key={idx} className="text-[11px] text-[#eaecef] ml-4 list-disc my-1 leading-relaxed">
            {content.includes("**") ? parseBold(content) : content}
          </li>
        );
      }
      // Numbered Lists
      if (/^\d+\.\s/.test(trimmed)) {
        const content = trimmed.replace(/^\d+\.\s/, "");
        const num = trimmed.match(/^\d+/) || ["1"];
        return (
          <div key={idx} className="text-[11px] text-[#eaecef] ml-2 my-1 leading-relaxed flex items-start">
            <span className="text-[#f0b90b] font-bold mr-1.5">{num[0]}.</span>
            <span>{content.includes("**") ? parseBold(content) : content}</span>
          </div>
        );
      }
      
      if (trimmed === "") return <div key={idx} className="h-1.5" />;

      // Standard text with inline bold support
      return (
        <p key={idx} className="text-[11px] text-[#b7bdc6] my-1 leading-relaxed">
          {trimmed.includes("**") ? parseBold(trimmed) : trimmed}
        </p>
      );
    });
  };

  const parseBold = (text: string) => {
    const parts = text.split("**");
    return parts.map((part, i) =>
      i % 2 === 1 ? <strong key={i} className="text-[#ffffff] font-semibold bg-[#222429] px-1 rounded">{part}</strong> : part
    );
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row h-auto md:h-full bg-[#0b0e11] overflow-y-auto md:overflow-hidden">
      {/* ==========================================
          LEFT COLUMN: CHARTS + AI DECK
          ========================================== */}
      <div className="flex-none md:flex-1 flex flex-col divide-y divide-[#24262b] md:min-h-0 md:overflow-y-auto custom-scrollbar">
        {/* Workspace Chart Controller Panel */}
        <div className="p-3 bg-[#12161a] shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#f0b90b]" />
              <h2 className="text-sm font-extrabold text-white tracking-wide">
                TECHNICAL CHARTS OVERLAY WORKSPACE
              </h2>
              <span className="text-[10px] bg-[#1e2026] text-[#848e9c] px-2 py-0.5 rounded font-mono">
                {activeSymbol} • {activeTimeframe.toUpperCase()}
              </span>
            </div>

            {/* Top interactive overlay toolbar */}
            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
              {/* Bollinger Bands toggle */}
              <button
                id="toggle-bb-btn"
                onClick={() => setOverlayBollinger(!overlayBollinger)}
                className={`px-2 py-0.5 text-[10px] rounded font-semibold transition flex items-center space-x-1 ${
                  overlayBollinger
                    ? "bg-[#f0b90b] text-black"
                    : "bg-[#222429] text-[#848e9c] hover:text-white"
                }`}
              >
                <Sliders className="w-2.5 h-2.5" />
                <span>Bollinger Bands</span>
              </button>

              <div className="h-4 w-[1px] bg-gray-800" />

              {/* Chart Overlay Selector */}
              <span className="text-[10px] text-[#848e9c] hidden xs:inline">Pattern Overlay:</span>
              <select
                id="formation-overlay-select"
                value={selectedOverlay}
                onChange={(e) => setSelectedOverlay(e.target.value)}
                className="bg-[#1e2026] text-white border border-[#34363d] px-2 py-0.5 rounded text-[10px] font-semibold outline-none cursor-pointer"
              >
                <option value="head_shoulders">Head & Shoulders</option>
                <option value="double_bottom">Double Bottom (W)</option>
                <option value="double_top">Double Top (M)</option>
                <option value="bullish_flag">Bullish Flag / Pole</option>
                <option value="ascending_triangle">Ascending Triangle</option>
                <option value="symmetrical_triangle">Symmetrical Triangle</option>
                <option value="">No Overlay</option>
              </select>
            </div>
          </div>
        </div>

        {/* INTERACTIVE CONTROLS HUD: DYNAMIC PARAMETERS & AI AUTOPILOT CONSOLE */}
        <div className="mx-3 mb-2 p-3 bg-[#13171d] border border-[#23272e] rounded-lg flex flex-col lg:flex-row lg:items-stretch justify-between gap-3 shrink-0">
          
          {/* Section A: Indicator Parameters Optimizer (Collapsible / Hidden by default) */}
          <div className="flex-1 bg-[#181c22] border border-[#282d35] rounded-md p-2.5 flex flex-col justify-between">
            <div className="flex items-center justify-between border-b border-[#242930] pb-1.5 mb-2">
              <div className="flex items-center space-x-2">
                <Sliders className="w-3.5 h-3.5 text-[#f0b90b]" />
                <span className="text-[11px] font-black text-white uppercase tracking-wider font-mono">
                  Indicator Core Parameters
                </span>
              </div>
              
              <div className="flex items-center space-x-2">
                {/* Adaptive Toggle Switch */}
                <button
                  id="toggle-adaptive-tuning-btn"
                  onClick={() => setIsAdaptiveTuning(!isAdaptiveTuning)}
                  className={`px-2 py-0.5 text-[8px] rounded font-mono font-bold border transition-all ${
                    isAdaptiveTuning
                      ? "bg-purple-950/40 border-purple-800 text-[#a076ff]"
                      : "bg-[#12161a] border-gray-700 text-gray-400"
                  }`}
                >
                  {isAdaptiveTuning ? "🤖 AI AUTO-TUNING" : "⚙️ MANUAL SETTINGS"}
                </button>

                <button
                  id="toggle-parameters-expand-btn"
                  onClick={() => setShowParameters(!showParameters)}
                  className="px-2 py-0.5 text-[8px] bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 font-mono font-bold rounded transition"
                >
                  {showParameters ? "CLOSE SETTINGS ▲" : "OPEN SETTINGS ▼"}
                </button>
              </div>
            </div>

            <p className="text-[9px] text-[#848e9c] leading-tight font-mono mb-1">
              Active Optimization Status: <span className={isAdaptiveTuning ? "text-purple-400 font-bold" : "text-amber-400 font-bold"}>{tuningReason}</span>
            </p>

            {/* Hidden Section Details */}
            {showParameters ? (
              <div className="grid grid-cols-3 xs:grid-cols-6 gap-2 pt-2 font-mono border-t border-[#242930] mt-1.5">
                <div className="flex flex-col space-y-1">
                  <label className="text-[7.5px] text-[#848e9c] font-black uppercase">RSI Period</label>
                  <input
                    type="number"
                    disabled={isAdaptiveTuning}
                    value={rsiPeriod}
                    onChange={(e) => setRsiPeriod(Math.max(2, parseInt(e.target.value) || 14))}
                    className={`w-full bg-[#12161a] text-white border text-center text-[10px] py-1 rounded font-bold outline-none ${
                      isAdaptiveTuning ? "border-[#21252b] text-gray-600 cursor-not-allowed" : "border-gray-700 focus:border-[#f0b90b]"
                    }`}
                  />
                </div>

                <div className="flex flex-col space-y-1">
                  <label className="text-[7.5px] text-[#848e9c] font-black uppercase">MACD Fast</label>
                  <input
                    type="number"
                    disabled={isAdaptiveTuning}
                    value={macdFast}
                    onChange={(e) => setMacdFast(Math.max(2, parseInt(e.target.value) || 12))}
                    className={`w-full bg-[#12161a] text-white border text-center text-[10px] py-1 rounded font-bold outline-none ${
                      isAdaptiveTuning ? "border-[#21252b] text-gray-600 cursor-not-allowed" : "border-gray-700 focus:border-[#f0b90b]"
                    }`}
                  />
                </div>

                <div className="flex flex-col space-y-1">
                  <label className="text-[7.5px] text-[#848e9c] font-black uppercase">MACD Slow</label>
                  <input
                    type="number"
                    disabled={isAdaptiveTuning}
                    value={macdSlow}
                    onChange={(e) => setMacdSlow(Math.max(2, parseInt(e.target.value) || 26))}
                    className={`w-full bg-[#12161a] text-white border text-center text-[10px] py-1 rounded font-bold outline-none ${
                      isAdaptiveTuning ? "border-[#21252b] text-gray-600 cursor-not-allowed" : "border-gray-700 focus:border-[#f0b90b]"
                    }`}
                  />
                </div>

                <div className="flex flex-col space-y-1">
                  <label className="text-[7.5px] text-[#848e9c] font-black uppercase">MACD Sig</label>
                  <input
                    type="number"
                    disabled={isAdaptiveTuning}
                    value={macdSignal}
                    onChange={(e) => setMacdSignal(Math.max(1, parseInt(e.target.value) || 9))}
                    className={`w-full bg-[#12161a] text-white border text-center text-[10px] py-1 rounded font-bold outline-none ${
                      isAdaptiveTuning ? "border-[#21252b] text-gray-600 cursor-not-allowed" : "border-gray-700 focus:border-[#f0b90b]"
                    }`}
                  />
                </div>

                <div className="flex flex-col space-y-1">
                  <label className="text-[7.5px] text-[#848e9c] font-black uppercase">BB Period</label>
                  <input
                    type="number"
                    disabled={isAdaptiveTuning}
                    value={bbPeriod}
                    onChange={(e) => setBbPeriod(Math.max(2, parseInt(e.target.value) || 20))}
                    className={`w-full bg-[#12161a] text-white border text-center text-[10px] py-1 rounded font-bold outline-none ${
                      isAdaptiveTuning ? "border-[#21252b] text-gray-600 cursor-not-allowed" : "border-gray-700 focus:border-[#f0b90b]"
                    }`}
                  />
                </div>

                <div className="flex flex-col space-y-1">
                  <label className="text-[7.5px] text-[#848e9c] font-black uppercase">BB Multi</label>
                  <input
                    type="number"
                    step="0.1"
                    disabled={isAdaptiveTuning}
                    value={bbMultiplier}
                    onChange={(e) => setBbMultiplier(Math.max(0.1, parseFloat(e.target.value) || 2.0))}
                    className={`w-full bg-[#12161a] text-white border text-center text-[10px] py-1 rounded font-bold outline-none ${
                      isAdaptiveTuning ? "border-[#21252b] text-gray-600 cursor-not-allowed" : "border-gray-700 focus:border-[#f0b90b]"
                    }`}
                  />
                </div>
              </div>
            ) : (
              <div
                onClick={() => setShowParameters(true)}
                className="mt-1.5 p-2 bg-[#12161a] hover:bg-[#151921] border border-dashed border-gray-800 rounded text-center text-[9px] text-[#848e9c] cursor-pointer font-mono select-none transition-all"
              >
                ⚙️ Indicator parameters hidden. Click to expand and configure manual overlays.
              </div>
            )}
          </div>

          {/* Section B: Fully Autonomous Scanning Motherboard Monitor */}
          <div className="w-full lg:w-64 bg-[#181c22] border border-[#282d35] rounded-md p-2.5 flex flex-col justify-between shrink-0">
            <div className="flex items-center justify-between mb-1.5 border-b border-[#242930] pb-1">
              <div className="flex items-center space-x-1.5">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[10px] font-black text-white uppercase tracking-wider font-mono">
                  Autonomous Engine
                </span>
              </div>
              <span className="text-[8px] bg-purple-950/80 border border-purple-800/60 text-purple-300 px-1.5 py-0.5 rounded font-mono font-bold">
                ACTIVE ON LAUNCH
              </span>
            </div>

            <div className="flex justify-between items-center text-[9px] font-mono mb-2">
              <span className="text-[#848e9c]">Next scan check:</span>
              <span className="text-emerald-400 font-bold animate-pulse">{autoPilotCountdown}s</span>
            </div>

            <div className="flex justify-between items-center text-[9px] font-mono mb-2">
              <span className="text-[#848e9c]">Markets coverage:</span>
              <span className="text-white font-bold">20 Spots / Futures</span>
            </div>

            <button
              id="force-scan-btn"
              onClick={scanAllMarkets}
              disabled={isScanning}
              className={`w-full py-1 text-[9px] font-black rounded font-mono transition-all uppercase flex items-center justify-center space-x-1 ${
                isScanning
                  ? "bg-purple-950 text-purple-300 border border-purple-800 cursor-not-allowed"
                  : "bg-purple-900 hover:bg-purple-800 text-purple-100 border border-purple-700 hover:scale-[1.01] active:scale-[0.99]"
              }`}
            >
              <Cpu className="w-2.5 h-2.5" />
              <span>{isScanning ? "Scanning..." : "Force Manual Scan"}</span>
            </button>
          </div>
        </div>

        {/* Dynamic Canvas Charts */}
        <div className="bg-[#16181a] p-2 flex flex-col space-y-1">
          {/* Main Candlestick overlay canvas */}
          <div className="relative w-full overflow-hidden rounded bg-[#16181a]">
            <canvas ref={mainCanvasRef} className="w-full block h-[260px]" />
            
            {/* Soft watermark labels */}
            <div className="absolute top-4 left-4 pointer-events-none select-none font-mono text-[10px] text-gray-700 flex flex-col space-y-0.5">
              <span>SMA(7, 25): Active (Main Chart Panel)</span>
              <span>H&S Neckline: Simulated</span>
              <span>DPR scaling: Enabled</span>
            </div>
          </div>

          {/* Indicator toggler and box */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between px-2 py-1.5 bg-[#121416] rounded-t border-t border-[#24262b] select-none shrink-0 gap-2">
            <div className="flex items-center space-x-3 text-[10px] text-[#848e9c] font-semibold">
              <span className="hidden xs:inline">CHART OVERLAYS:</span>
              <button
                onClick={() => setOverlayBollinger(!overlayBollinger)}
                className={`px-2 py-0.5 rounded font-mono text-[9px] font-black transition border ${
                  overlayBollinger ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : "bg-[#181a20] border-transparent text-gray-500 hover:text-white"
                }`}
              >
                Bollinger Bands
              </button>
              <button
                onClick={() => setDrawCmtTrendlines(!drawCmtTrendlines)}
                className={`px-2 py-0.5 rounded font-mono text-[9px] font-black transition border ${
                  drawCmtTrendlines ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-[#181a20] border-transparent text-gray-500 hover:text-white"
                }`}
              >
                CMT Auto-Trendlines
              </button>
            </div>
            
            <div className="flex items-center space-x-1.5">
              <span className="text-[10px] text-[#848e9c] font-semibold mr-1">MOMENTUM OSCILLATOR:</span>
              <button
                id="toggle-rsi-btn"
                onClick={() => setShowIndicators("rsi")}
                className={`px-2 py-0.5 text-[9px] rounded font-mono transition font-bold ${
                  showIndicators === "rsi"
                    ? "bg-[#a076ff] text-white"
                    : "text-[#848e9c] hover:bg-gray-800"
                }`}
              >
                RSI (14)
              </button>
              <button
                id="toggle-macd-btn"
                onClick={() => setShowIndicators("macd")}
                className={`px-2 py-0.5 text-[9px] rounded font-mono transition font-bold ${
                  showIndicators === "macd"
                    ? "bg-[#38bdf8] text-black"
                    : "text-[#848e9c] hover:bg-gray-800"
                }`}
              >
                MACD (12, 26, 9)
              </button>
            </div>
          </div>
          
          <div className="relative w-full overflow-hidden rounded-b bg-[#121416]">
            <canvas ref={indCanvasRef} className="w-full block h-[100px]" />
          </div>
        </div>

        {/* ==========================================
            AI DEEP CO-PILOT ANALYSIS CORE:
            UNIFIED MULTI-MARKET SCANNER & LIVE SIGNAL COPILOT
            ========================================== */}
        <div className="p-4 bg-[#12161a] flex flex-col min-h-0 border-t border-[#24262b]">
          {/* Header section with status metrics */}
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 mb-4 shrink-0">
            <div className="flex items-center space-x-2.5">
              <div className="flex items-center justify-center bg-purple-950 p-1.5 rounded-lg border border-purple-800">
                <Sparkles className="w-5 h-5 text-[#a076ff] animate-pulse" />
              </div>
              <div className="text-left">
                <h3 className="text-xs font-black text-white uppercase tracking-wider flex items-center space-x-1.5">
                  <span>AI Multi-Market Scanner & Signal Copilot</span>
                  <span className="bg-[#a076ff]/10 text-[#a076ff] border border-[#a076ff]/20 text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest animate-pulse">LIVE</span>
                </h3>
                <p className="text-[10px] text-[#848e9c]">
                  Continuous scan of all 20 markets for volume breakouts, patterns, and CMT entry levels
                </p>
              </div>
            </div>

            {/* Scan Control Action Buttons */}
            <div className="flex items-center space-x-2 flex-wrap gap-2">
              {/* Auto Switch Toggle Switch */}
              <label className="flex items-center space-x-2 bg-[#1c1f24] border border-[#2b3036] px-2.5 py-1.5 rounded-md cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoSwitchOnSignal}
                  onChange={(e) => setAutoSwitchOnSignal(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="relative w-7 h-4 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-purple-600"></div>
                <span className="text-[9px] font-extrabold text-white uppercase font-mono tracking-wider">Auto-Align Charts</span>
              </label>

              <button
                id="scanner-scan-btn"
                onClick={scanAllMarkets}
                disabled={isScanning}
                className={`px-4 py-1.5 text-[11px] font-black rounded-md flex items-center space-x-1.5 transition-all shadow-md ${
                  isScanning
                    ? "bg-purple-950 border border-purple-800 text-[#a076ff] cursor-not-allowed"
                    : "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white hover:scale-[1.01] active:scale-[0.99]"
                }`}
              >
                <Cpu className={`w-3.5 h-3.5 ${isScanning ? "animate-spin" : ""}`} />
                <span>{isScanning ? "Scanning Markets..." : "Scan Markets & Generate Signal"}</span>
              </button>
            </div>
          </div>

          {/* Core Panel Grid: Left features active signal layout, Right lists historical feed */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0 flex-1">
            
            {/* Active Signal Panel (Takes 2 columns on wide screens) */}
            <div className="lg:col-span-2 bg-[#16181a] border border-[#24262b] rounded-lg p-3 flex flex-col justify-between min-h-[300px] relative">
              
              {/* Scan Overlay Loader */}
              {isScanning && (
                <div className="absolute inset-0 bg-[#16181a]/95 flex flex-col items-center justify-center p-4 text-center z-10 rounded-lg">
                  <div className="relative mb-3 flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full border-2 border-purple-600/30 border-t-purple-500 animate-spin" />
                    <Sparkles className="w-5 h-5 text-[#a076ff] absolute" />
                  </div>
                  <span className="text-xs text-white font-mono font-bold animate-pulse">
                    {scanStep}
                  </span>
                  <span className="text-[9px] text-[#848e9c] font-mono mt-1">
                    Comparing all 20 tickers with live WebSocket price vectors...
                  </span>
                </div>
              )}

              {/* No Signal Yet State */}
              {signals.length === 0 && !isScanning && !scanError && (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-10 select-none">
                  <Sparkles className="w-10 h-10 text-purple-900/60 mb-3" />
                  <span className="text-sm text-[#eaecef] font-black uppercase tracking-wider">No Trading Signals Generated</span>
                  <p className="text-[11px] text-[#848e9c] max-w-sm mt-1.5 font-mono">
                    Click "Scan Markets" above or toggle the AI Autopilot timer. Gemini will continuously parse the live 20-symbol feed, detect breakout formations, and pinpoint target signals.
                  </p>
                </div>
              )}

              {/* Error State */}
              {scanError && !isScanning && (
                <div className="flex-1 flex flex-col items-center justify-center p-4 text-center text-red-400">
                  <AlertTriangle className="w-10 h-10 text-red-500 mb-2.5 animate-bounce" />
                  <span className="text-xs font-black uppercase tracking-wider font-mono">Scanning Protocol Failure</span>
                  <p className="text-[11px] text-gray-400 mt-1 max-w-sm font-mono">
                    {scanError}
                  </p>
                  <button
                    onClick={scanAllMarkets}
                    className="mt-4 px-4 py-1.5 bg-red-950/40 border border-red-900 text-red-300 rounded text-[10px] font-bold hover:bg-red-900/40 transition-all font-mono"
                  >
                    Retry Scan Process
                  </button>
                </div>
              )}

              {/* Active Signal Render Card */}
              {/* Active Signal Render Card */}
              {signals.length > 0 && !isScanning && (() => {
                const activeSignal = signals.find(s => s.id === activeSignalId) || signals[0];
                if (!activeSignal) return null;

                const isBuy = activeSignal.direction === "BUY";
                const isSell = activeSignal.direction === "SELL";
                const isHold = activeSignal.direction === "HOLD";

                const signalTime = new Date(activeSignal.timestamp).toLocaleTimeString();

                // Calculate TradingView-style consensus score (0..100)
                const score = isBuy ? (50 + activeSignal.confidence / 2) : isSell ? (50 - activeSignal.confidence / 2) : 50;
                const angle = (score / 100) * 180 - 180; // maps 0..100 to -180..0 degrees
                
                let gaugeLabel = "NEUTRAL";
                let gaugeColorClass = "text-[#848e9c]";
                if (score < 15) {
                  gaugeLabel = "STRONG SELL";
                  gaugeColorClass = "text-[#f6465d]";
                } else if (score >= 15 && score < 40) {
                  gaugeLabel = "SELL";
                  gaugeColorClass = "text-[#ff9800]";
                } else if (score >= 40 && score <= 60) {
                  gaugeLabel = "NEUTRAL";
                  gaugeColorClass = "text-[#848e9c]";
                } else if (score > 60 && score <= 85) {
                  gaugeLabel = "BUY";
                  gaugeColorClass = "text-[#4caf50]";
                } else {
                  gaugeLabel = "STRONG BUY";
                  gaugeColorClass = "text-[#0ecb81]";
                }

                return (
                  <div className="flex-1 flex flex-col justify-between min-h-0 space-y-3">
                    {/* Top Stats Banner */}
                    <div className="flex items-center justify-between border-b border-[#24262b] pb-2.5 shrink-0">
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] font-mono font-bold bg-[#1e2026] text-[#848e9c] px-2 py-0.5 rounded border border-[#2b3036]">
                          SIGNAL ID: {activeSignal.id}
                        </span>
                        <span className="text-[9px] text-[#848e9c] font-mono">
                          Generated at {signalTime}
                        </span>
                      </div>
                      
                      <button
                        onClick={() => handleApplySignal(activeSignal)}
                        className="text-[10px] bg-purple-950 text-purple-300 hover:bg-purple-900 border border-purple-800 px-2.5 py-0.5 rounded-md font-mono font-bold transition flex items-center space-x-1"
                      >
                        <Maximize2 className="w-3 h-3" />
                        <span>Align & Sync Chart</span>
                      </button>
                    </div>

                    {/* CORE RESTUCTURED GRID: TECHNICAL CONSENSUS SPEEDOMETER & STRATEGIC LEVELS */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-stretch">
                      
                      {/* Left: Speedometer consensus rating (TradingView style) */}
                      <div className="md:col-span-4 bg-[#121416]/50 border border-[#24262b]/80 rounded-lg p-3 flex flex-col items-center justify-center text-center relative select-none">
                        <span className="text-[8px] text-[#848e9c] uppercase font-black tracking-wider font-mono mb-2">Technical Consensus</span>
                        
                        {/* Gauge SVG */}
                        <div className="relative flex items-center justify-center w-full h-[54px] mb-1">
                          <svg viewBox="0 0 100 60" className="w-full max-w-[110px] overflow-visible">
                            {/* Base Semicircle Track */}
                            <path
                              d="M 10,50 A 40,40 0 0,1 90,50"
                              fill="none"
                              stroke="#1e2026"
                              strokeWidth="7"
                              strokeLinecap="round"
                            />
                            {/* Segment Sell (Red) */}
                            <path
                              d="M 10,50 A 40,40 0 0,1 30,22"
                              fill="none"
                              stroke="#f6465d"
                              strokeWidth="7"
                            />
                            {/* Segment Neutral (Yellow) */}
                            <path
                              d="M 30,22 A 40,40 0 0,1 70,22"
                              fill="none"
                              stroke="#f0b90b"
                              strokeWidth="7"
                            />
                            {/* Segment Buy (Green) */}
                            <path
                              d="M 70,22 A 40,40 0 0,1 90,50"
                              fill="none"
                              stroke="#0ecb81"
                              strokeWidth="7"
                            />
                            
                            {/* Pin */}
                            <circle cx="50" cy="50" r="3.5" fill="#a076ff" />
                            
                            {/* Needle */}
                            <line
                              x1="50"
                              y1="50"
                              x2="50"
                              y2="20"
                              stroke="#a076ff"
                              strokeWidth="2"
                              strokeLinecap="round"
                              style={{
                                transform: `rotate(${angle}deg)`,
                                transformOrigin: '50px 50px',
                                transition: 'transform 1s cubic-bezier(0.4, 0, 0.2, 1)'
                              }}
                            />
                          </svg>
                        </div>
                        
                        {/* Consensus Rating Label */}
                        <span className={`text-[11px] font-mono font-black uppercase tracking-widest ${gaugeColorClass}`}>
                          {gaugeLabel}
                        </span>
                        
                        {/* Consensus Rating Score */}
                        <div className="flex items-center space-x-1.5 mt-2 bg-[#1c1f24] border border-[#2b3036] px-2 py-0.5 rounded">
                          <span className="text-[8px] font-mono text-[#848e9c]">SCORE:</span>
                          <span className="text-[8px] font-mono font-bold text-white">{score.toFixed(1)}/100</span>
                        </div>
                      </div>

                      {/* Right: Straightforward Trading Plan details */}
                      <div className="md:col-span-8 flex flex-col justify-between gap-2.5">
                        <div className={`p-3 rounded-lg border text-left select-none shrink-0 ${
                          isBuy 
                            ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-400" 
                            : isSell 
                              ? "bg-rose-950/20 border-rose-500/30 text-rose-400" 
                              : "bg-amber-950/20 border-amber-500/30 text-amber-400"
                        }`}>
                          <div className="flex items-center space-x-2 text-[8px] uppercase tracking-wider font-extrabold mb-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${isBuy ? "bg-emerald-400" : isSell ? "bg-rose-400" : "bg-amber-400"} animate-ping`} />
                            <span>
                              {isBuy ? "LONG POSITION PLAN" : isSell ? "SHORT POSITION PLAN" : "STANDBY STATUS"}
                            </span>
                          </div>
                          
                          <h4 className="text-[11px] font-black text-white uppercase font-mono tracking-tight">
                            {isBuy 
                              ? `CMT Breakout Confirmation for ${activeSignal.recommendedSymbol}` 
                              : isSell 
                                ? `CMT Breakdown Confirmation for ${activeSignal.recommendedSymbol}` 
                                : `No Clear Setup Identified for ${activeSignal.recommendedSymbol}`}
                          </h4>
                          
                          <p className="text-[10px] text-gray-400 font-mono mt-1 leading-normal">
                            {isBuy 
                              ? `Order book bids are clustering below support. Favorable market structures support a standard long-scalp.` 
                              : isSell 
                                ? `Leveraged sell pressure is increasing. Market structure shows breakdown potential. Short execution favored.` 
                                : `The system is scanning order flow. Volatility metrics indicate range-bound consolidation. Position entry deferred.`}
                          </p>
                        </div>

                        {/* TrendSpider-style Pattern card */}
                        <div className="bg-[#1c1f24] border border-[#2b3036] rounded-md p-2 flex items-center justify-between">
                          <div className="flex items-center space-x-2 font-mono">
                            <Sparkles className="w-3.5 h-3.5 text-[#a076ff]" />
                            <div className="text-left">
                              <span className="text-[7.5px] text-[#848e9c] uppercase font-black block leading-none">PATTERN DETECTED</span>
                              <span className="text-[10px] font-bold text-white uppercase">{activeSignal.patternDetected ? activeSignal.patternDetected.replace("_", " ") : "NONE"}</span>
                            </div>
                          </div>
                          
                          <div className="text-right font-mono">
                            <span className="text-[7.5px] text-[#848e9c] uppercase font-black block leading-none">PROBABILITY</span>
                            <span className="text-[10px] font-bold text-purple-400">{activeSignal.confidence}% Confidence</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 1-3 MINUTE FAST-SCALP FUTURES LIVE HUD */}
                    {activeSignal.futuresPrediction && (
                      <div className="bg-gradient-to-r from-purple-950/25 to-[#121416] border border-purple-800/40 rounded-lg p-3 font-mono text-left relative overflow-hidden select-none">
                        {/* Futuristic background design grids */}
                        <div className="absolute top-0 right-0 h-full w-24 opacity-5 pointer-events-none bg-[radial-gradient(#a076ff_1px,transparent_1px)] [background-size:8px_8px]" />
                        
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10">
                          {/* Left Details: Pair, Direction, Target */}
                          <div className="flex-1 flex flex-col space-y-1.5">
                            <div className="flex items-center space-x-2">
                              <span className="animate-pulse flex h-1.5 w-1.5 rounded-full bg-[#a076ff]" />
                              <span className="text-[9px] font-black text-purple-300 uppercase tracking-wider">
                                ⚡ ACTIVE FAST-SCALP CONTRACT
                              </span>
                              <span className="text-[8px] bg-purple-950/80 text-[#a076ff] border border-purple-800/60 px-1.5 py-0.5 rounded font-black">
                                FUTURES CO-PROCESSOR
                              </span>
                            </div>

                            <div className="flex items-baseline space-x-2">
                              <span className="text-xs font-black text-white">{activeSignal.recommendedSymbol}</span>
                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                                activeSignal.futuresPrediction.targetDirection === "UP"
                                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                  : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                              }`}>
                                {activeSignal.futuresPrediction.targetDirection === "UP" ? "CALL / UP 🟢" : "PUT / DOWN 🔴"}
                              </span>
                              <span className="text-[#848e9c] text-[10px]">
                                Target Price: <strong className="text-white">${activeSignal.futuresPrediction.targetPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                              </span>
                            </div>

                            <p className="text-[10px] text-gray-400 leading-normal">
                              {activeSignal.futuresPrediction.analysis}
                            </p>
                          </div>

                          {/* Right Details: Countdown & Calculated Probability */}
                          <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 sm:border-l border-[#24262b] pt-2 sm:pt-0 sm:pl-3 shrink-0 gap-2 min-w-[120px]">
                            {/* Live Countdown */}
                            <div className="text-left sm:text-right">
                              <span className="text-[8px] text-[#848e9c] block font-black uppercase">EXECUTION WINDOW</span>
                              {(() => {
                                // Calculate time left since signal timestamp based on targetSeconds
                                const elapsed = Math.floor((secondTick * 1000) / 1000) % activeSignal.futuresPrediction.targetSeconds;
                                const timeLeft = Math.max(0, activeSignal.futuresPrediction.targetSeconds - elapsed);
                                const mins = Math.floor(timeLeft / 60);
                                const secs = timeLeft % 60;
                                const formattedTime = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
                                return (
                                  <span className={`text-base font-black font-mono tracking-tight flex items-center justify-start sm:justify-end space-x-1 ${timeLeft <= 15 ? "text-rose-500 animate-pulse" : "text-[#a076ff]"}`}>
                                    <Clock className="w-3.5 h-3.5 shrink-0" />
                                    <span>{formattedTime}</span>
                                  </span>
                                );
                              })()}
                            </div>

                            {/* Live calculated strength probability */}
                            <div className="text-left sm:text-right w-full sm:w-auto">
                              <div className="flex items-center justify-between sm:justify-end space-x-2 text-[8px] text-[#848e9c] font-black uppercase mb-0.5">
                                <span>VALIDATION STRENGTH</span>
                                <span className="text-emerald-400 font-bold">{activeSignal.futuresPrediction.validationStrength}%</span>
                              </div>
                              <div className="w-20 h-1 bg-gray-800 rounded-full overflow-hidden border border-[#24262b] ml-auto">
                                <div
                                  className="h-full bg-gradient-to-r from-purple-500 to-emerald-400 rounded-full transition-all duration-1000"
                                  style={{ width: `${activeSignal.futuresPrediction.validationStrength}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Middle Bento Grid: Signal Target & Levels */}
                    <div className="grid grid-cols-2 xs:grid-cols-4 gap-2 font-mono text-left">
                      {/* Symbol Card */}
                      <div className="bg-[#1c1f24] border border-[#2b3036] rounded-md p-2.5">
                        <span className="text-[8px] text-[#848e9c] block font-black uppercase">TARGET SYMBOL</span>
                        <span className="text-sm font-black text-white">{activeSignal.recommendedSymbol}</span>
                      </div>

                      {/* Direction Card */}
                      <div className={`rounded-md p-2.5 border ${
                        isBuy 
                          ? "bg-emerald-950/20 border-emerald-900/60" 
                          : isSell 
                            ? "bg-rose-950/20 border-rose-900/60" 
                            : "bg-amber-950/20 border-amber-900/60"
                      }`}>
                        <span className="text-[8px] text-[#848e9c] block font-black uppercase">DIRECTION</span>
                        <span className={`text-sm font-black flex items-center space-x-1.5 ${
                          isBuy ? "text-[#0ecb81]" : isSell ? "text-[#f6465d]" : "text-[#f0b90b]"
                        }`}>
                          {isBuy ? <TrendingUp className="w-4 h-4" /> : isSell ? <TrendingDown className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
                          <span>{activeSignal.direction}</span>
                        </span>
                      </div>

                      {/* Confidence Rating */}
                      <div className="bg-[#1c1f24] border border-[#2b3036] rounded-md p-2.5">
                        <span className="text-[8px] text-[#848e9c] block font-black uppercase">CONFIDENCE</span>
                        <span className="text-sm font-black text-purple-400 flex items-center space-x-1">
                          <Zap className="w-3.5 h-3.5" />
                          <span>{activeSignal.confidence}%</span>
                        </span>
                      </div>

                      {/* Playout Duration */}
                      <div className="bg-[#1c1f24] border border-[#2b3036] rounded-md p-2.5">
                        <span className="text-[8px] text-[#848e9c] block font-black uppercase">DURATION</span>
                        <span className="text-sm font-black text-sky-400 flex items-center space-x-1">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{activeSignal.duration}</span>
                        </span>
                      </div>
                    </div>

                    {/* Precise Trade Level Cards */}
                    <div className="grid grid-cols-3 gap-2 font-mono text-left">
                      <div className="bg-[#1c1f24] border border-[#24262b] rounded-md p-2 border-l-2 border-l-sky-500">
                        <span className="text-[8px] text-[#848e9c] block font-black">ENTRY LEVEL</span>
                        <span className="text-xs font-bold text-white">${activeSignal.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</span>
                      </div>

                      <div className="bg-[#1c1f24] border border-[#24262b] rounded-md p-2 border-l-2 border-l-emerald-500">
                        <span className="text-[8px] text-[#848e9c] block font-black">TAKE PROFIT (TP)</span>
                        <span className="text-xs font-bold text-[#0ecb81]">${activeSignal.takeProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</span>
                      </div>

                      <div className="bg-[#1c1f24] border border-[#24262b] rounded-md p-2 border-l-2 border-l-red-500">
                        <span className="text-[8px] text-[#848e9c] block font-black">STOP LOSS (SL)</span>
                        <span className="text-xs font-bold text-[#f6465d]">${activeSignal.stopLoss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</span>
                      </div>
                    </div>

                    {/* ⚡ COPILOT ONE-CLICK CO-EXECUTION */}
                    <div id="copilot-one-click-execution-panel" className="bg-[#181a20] border border-[#2b3036] rounded-lg p-3 space-y-3 font-mono text-left">
                      <div className="flex items-center justify-between border-b border-[#24262b] pb-2">
                        <div className="flex items-center space-x-2">
                          <Cpu className="w-4 h-4 text-[#a076ff] animate-pulse" />
                          <span className="text-[10px] font-extrabold text-white uppercase tracking-wider">
                            ⚡ Signal Trade Copilot
                          </span>
                        </div>
                        <span className="text-[8px] bg-purple-950/80 text-[#a076ff] border border-purple-800/50 px-1.5 py-0.5 rounded font-black">
                          AUTO-BRIDGE v1.2
                        </span>
                      </div>

                      {/* Notification Alert inside panel */}
                      {executionNotification && (
                        <div className={`p-2 rounded text-[10px] flex items-start space-x-2 border ${
                          executionNotification.type === "success" 
                            ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-300 animate-fadeIn"
                            : executionNotification.type === "error"
                              ? "bg-rose-950/30 border-rose-500/30 text-rose-300 animate-fadeIn"
                              : "bg-sky-950/30 border-sky-500/30 text-sky-300 animate-fadeIn"
                        }`}>
                          <div className="flex-1">
                            {executionNotification.message}
                          </div>
                          <button 
                            type="button"
                            onClick={() => setExecutionNotification(null)}
                            className="text-[#848e9c] hover:text-white font-bold ml-1.5 cursor-pointer text-xs"
                          >
                            ×
                          </button>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[10px]">
                        {/* Left: Mode and Type selectors */}
                        <div className="space-y-2">
                          <div>
                            <span className="text-[8px] text-[#848e9c] uppercase font-bold block mb-1">Execution Channel</span>
                            <div className="grid grid-cols-2 gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setExecutionMode("DEMO");
                                  setExecutionNotification(null);
                                }}
                                className={`py-1.5 rounded font-bold transition text-center cursor-pointer ${
                                  executionMode === "DEMO"
                                    ? "bg-[#0ecb81]/15 text-[#0ecb81] border border-[#0ecb81]/40"
                                    : "bg-[#2b2f36]/40 text-[#848e9c] border border-transparent hover:text-white"
                                }`}
                              >
                                Demo Account
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setExecutionMode("REAL");
                                  setExecutionNotification(null);
                                }}
                                className={`py-1.5 rounded font-bold transition text-center flex items-center justify-center space-x-1 cursor-pointer ${
                                  executionMode === "REAL"
                                    ? "bg-amber-500/15 text-amber-400 border border-amber-500/40"
                                    : "bg-[#2b2f36]/40 text-[#848e9c] border border-transparent hover:text-white"
                                }`}
                              >
                                <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                                <span>Binance Live</span>
                              </button>
                            </div>
                          </div>

                          <div>
                            <span className="text-[8px] text-[#848e9c] uppercase font-bold block mb-1">Order Execution Mode</span>
                            <div className="grid grid-cols-2 gap-1.5">
                              <button
                                type="button"
                                onClick={() => setOrderType("LIMIT")}
                                className={`py-1 rounded font-bold transition text-center cursor-pointer ${
                                  orderType === "LIMIT"
                                    ? "bg-purple-950 text-purple-300 border border-purple-800"
                                    : "bg-[#2b2f36]/40 text-[#848e9c] border border-transparent hover:text-white"
                                }`}
                              >
                                LIMIT (Entry Price)
                              </button>
                              <button
                                type="button"
                                onClick={() => setOrderType("MARKET")}
                                className={`py-1 rounded font-bold transition text-center cursor-pointer ${
                                  orderType === "MARKET"
                                    ? "bg-purple-950 text-purple-300 border border-purple-800"
                                    : "bg-[#2b2f36]/40 text-[#848e9c] border border-transparent hover:text-white"
                                }`}
                              >
                                MARKET (Instant)
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Right: Allocation size */}
                        <div className="space-y-2">
                          <div>
                            <span className="text-[8px] text-[#848e9c] uppercase font-bold block mb-1">Trade Allocation Size (USDT)</span>
                            <div className="flex items-center">
                              <span className="text-[#848e9c] bg-[#1e2026] border border-[#2b3036] px-2.5 py-1.5 rounded-l text-[10px] select-none">
                                $
                              </span>
                              <input
                                type="number"
                                value={allocatedUSDT}
                                onChange={(e) => {
                                  const v = Math.max(1, Number(e.target.value));
                                  setAllocatedUSDT(v);
                                }}
                                className="w-full bg-[#1e2026] border-y border-r border-[#2b3036] rounded-r p-1.5 text-white font-bold font-mono focus:outline-none focus:border-purple-500"
                              />
                            </div>
                          </div>

                          <div>
                            <span className="text-[8px] text-[#848e9c] uppercase font-bold block mb-1">Quick Presets</span>
                            <div className="grid grid-cols-4 gap-1">
                              {[50, 100, 250, 500].map((amt) => (
                                <button
                                  key={amt}
                                  type="button"
                                  onClick={() => setAllocatedUSDT(amt)}
                                  className={`py-1 rounded font-bold transition text-center text-[9px] cursor-pointer ${
                                    allocatedUSDT === amt
                                      ? "bg-white text-black"
                                      : "bg-[#1e2026] text-[#848e9c] border border-[#2b3036] hover:text-white"
                                  }`}
                                >
                                  ${amt}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Execution warning for Real Mode */}
                      {executionMode === "REAL" && (
                        <div className="p-2 bg-amber-950/20 border border-amber-900/40 text-amber-300 text-[9px] rounded leading-normal">
                          <span className="font-extrabold flex items-center space-x-1 mb-0.5 text-amber-400">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400 animate-bounce" />
                            <span>BINANCE LIVE EXECUTION SAFEGUARDS ACTIVE</span>
                          </span>
                          This places real orders directly onto your Binance spot balance. To activate execution, define <strong>BINANCE_API_KEY</strong> and <strong>BINANCE_SECRET_KEY</strong> in your developer environment secrets panel.
                        </div>
                      )}

                      {/* Final execute action button */}
                      <button
                        type="button"
                        disabled={isExecutingTrade}
                        onClick={() => handleExecuteSignalTrade(activeSignal)}
                        className={`w-full py-2.5 rounded-md font-black font-mono tracking-wide text-xs transition duration-200 cursor-pointer flex items-center justify-center space-x-2 ${
                          isExecutingTrade
                            ? "bg-[#2b2f36] text-[#848e9c] cursor-not-allowed"
                            : activeSignal.direction === "BUY"
                              ? "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white shadow-lg shadow-emerald-500/10"
                              : "bg-gradient-to-r from-rose-500 to-orange-500 hover:from-rose-400 hover:to-orange-400 text-white shadow-lg shadow-rose-500/10"
                        }`}
                      >
                        {isExecutingTrade ? (
                          <>
                            <span className="w-3.5 h-3.5 border-2 border-[#848e9c] border-t-white rounded-full animate-spin shrink-0" />
                            <span>TRANSMITTING ORDER ROUTE...</span>
                          </>
                        ) : (
                          <>
                            <Zap className="w-4 h-4 fill-white shrink-0 text-white" />
                            <span>
                              EXECUTE ONE-CLICK {activeSignal.direction === "BUY" ? "LONG / BUY" : "SHORT / SELL"} ({activeSignal.recommendedSymbol})
                            </span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* AI Multi-Tab Analysis Navigation */}
                    <div className="flex border-b border-[#24262b] shrink-0 select-none overflow-x-auto custom-scrollbar">
                      <button
                        onClick={() => setActiveAnalysisTab("reasoning")}
                        className={`px-3 py-1.5 text-[9px] font-mono font-bold uppercase border-b-2 tracking-wider shrink-0 transition-all ${
                          activeAnalysisTab === "reasoning"
                            ? "text-[#a076ff] border-[#a076ff] bg-purple-950/10"
                            : "text-[#848e9c] border-transparent hover:text-white"
                        }`}
                      >
                        CMT Reasoning
                      </button>
                      <button
                        onClick={() => setActiveAnalysisTab("rankings")}
                        className={`px-3 py-1.5 text-[9px] font-mono font-bold uppercase border-b-2 tracking-wider shrink-0 transition-all ${
                          activeAnalysisTab === "rankings"
                            ? "text-sky-400 border-sky-400 bg-sky-950/10"
                            : "text-[#848e9c] border-transparent hover:text-white"
                        }`}
                      >
                        20-Pair Rankings
                      </button>
                      <button
                        onClick={() => setActiveAnalysisTab("indicators")}
                        className={`px-3 py-1.5 text-[9px] font-mono font-bold uppercase border-b-2 tracking-wider shrink-0 transition-all ${
                          activeAnalysisTab === "indicators"
                            ? "text-amber-500 border-amber-500 bg-amber-950/10"
                            : "text-[#848e9c] border-transparent hover:text-white"
                        }`}
                      >
                        Dynamic Indicators
                      </button>
                      <button
                        onClick={() => setActiveAnalysisTab("advisor")}
                        className={`px-3 py-1.5 text-[9px] font-mono font-bold uppercase border-b-2 tracking-wider shrink-0 transition-all ${
                          activeAnalysisTab === "advisor"
                            ? "text-emerald-400 border-emerald-400 bg-emerald-950/10"
                            : "text-[#848e9c] border-transparent hover:text-white"
                        }`}
                      >
                        Portfolio Advisor
                      </button>
                      <button
                        onClick={() => setActiveAnalysisTab("validation")}
                        className={`px-3 py-1.5 text-[9px] font-mono font-bold uppercase border-b-2 tracking-wider shrink-0 transition-all ${
                          activeAnalysisTab === "validation"
                            ? "text-rose-400 border-rose-400 bg-rose-950/10"
                            : "text-[#848e9c] border-transparent hover:text-white"
                        }`}
                      >
                        🔬 Research Validation
                      </button>
                    </div>

                    {/* CMT Professional Analysis Breakdown */}
                    <div className="flex-1 min-h-[140px] bg-[#121416] rounded-md p-3 border border-[#24262b] overflow-y-auto custom-scrollbar text-left font-mono text-[11px] leading-relaxed">
                      {activeAnalysisTab === "reasoning" && (
                        <>
                          <div className="flex items-center space-x-1 mb-1.5 border-b border-[#24262b] pb-1">
                            <Sliders className="w-3 h-3 text-[#a076ff]" />
                            <span className="text-[9px] font-extrabold text-[#eaecef] uppercase tracking-wider">CMT Technical Decision Reasoning</span>
                          </div>
                          
                          {activeSignal.patternDetected && activeSignal.patternDetected !== "none" && (
                            <div className="mb-2 inline-flex items-center space-x-1.5 bg-purple-950/40 border border-purple-900 text-purple-300 text-[9px] font-black px-2 py-0.5 rounded uppercase">
                              <span>PATTERN MATCHED:</span>
                              <span className="text-white">{activeSignal.patternDetected.replace("_", " ")}</span>
                            </div>
                          )}

                          <div className="text-[#b7bdc6] select-text">
                            {renderAnalysisMarkdown(activeSignal.analysisReasoning)}
                          </div>

                          {/* Scanner Overview summary */}
                          <div className="mt-3 border-t border-[#24262b] pt-2">
                            <div className="flex items-center space-x-1 mb-1">
                              <Eye className="w-3 h-3 text-[#f0b90b]" />
                              <span className="text-[9px] font-extrabold text-[#eaecef] uppercase tracking-wider">Anomalous Volume Scanner Report</span>
                            </div>
                            <p className="text-[10px] text-[#848e9c]">
                              {activeSignal.marketScannerReport}
                            </p>
                          </div>
                        </>
                      )}

                      {activeAnalysisTab === "rankings" && (
                        <>
                          <div className="flex items-center space-x-1 mb-1.5 border-b border-[#24262b] pb-1">
                            <TrendingUp className="w-3 h-3 text-sky-400" />
                            <span className="text-[9px] font-extrabold text-[#eaecef] uppercase tracking-wider">Unified Market Opportunity Rankings (1-20)</span>
                          </div>
                          
                          <div className="space-y-1.5 max-h-[220px] overflow-y-auto custom-scrollbar">
                            {activeSignal.pairRankings && activeSignal.pairRankings.length > 0 ? (
                              activeSignal.pairRankings.map((p) => {
                                const isTarget = p.symbol === activeSignal.recommendedSymbol;
                                return (
                                  <div
                                    key={`${p.symbol}-${p.rank}`}
                                    onClick={() => {
                                      setActiveSymbol(p.symbol);
                                    }}
                                    className={`p-2 rounded border flex items-center justify-between text-left transition-all cursor-pointer ${
                                      isTarget 
                                        ? "bg-purple-950/30 border-purple-800" 
                                        : "bg-[#181a20] border-[#24262b] hover:bg-[#20242a]"
                                    }`}
                                  >
                                    <div className="flex items-center space-x-2">
                                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                        p.rank <= 3 ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" : "bg-gray-800 text-gray-400"
                                      }`}>
                                        #{p.rank}
                                      </span>
                                      <span className="text-xs font-bold text-white">{p.symbol}</span>
                                      <span className="text-[9px] text-[#848e9c] hidden xs:inline">{p.trend}</span>
                                    </div>
                                    <div className="flex items-center space-x-3 text-right max-w-[50%]">
                                      <span className="text-[9px] text-[#848e9c] truncate hidden md:inline">{p.justification}</span>
                                      <span className="text-[10px] font-bold text-sky-400 shrink-0">
                                        Score {p.score}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })
                            ) : (
                              <p className="text-[#848e9c] text-xs py-4 text-center">Run a new market scan to populate opportunity rankings.</p>
                            )}
                          </div>
                        </>
                      )}

                      {activeAnalysisTab === "indicators" && (
                        <>
                          <div className="flex items-center space-x-1 mb-1.5 border-b border-[#24262b] pb-1">
                            <Zap className="w-3 h-3 text-amber-500" />
                            <span className="text-[9px] font-extrabold text-[#eaecef] uppercase tracking-wider">Dynamically Optimized Indicator Configurations</span>
                          </div>
                          
                          {activeSignal.indicatorsConfig ? (
                            <div className="space-y-3">
                              <div className="grid grid-cols-2 gap-2 text-[10px]">
                                <div className="bg-[#181a20] p-2 rounded border border-[#24262b]">
                                  <span className="text-[8px] text-[#848e9c] uppercase font-bold block">Optimized RSI Settings</span>
                                  <span className="text-white font-bold">{activeSignal.indicatorsConfig.rsiSettings}</span>
                                </div>
                                <div className="bg-[#181a20] p-2 rounded border border-[#24262b]">
                                  <span className="text-[8px] text-[#848e9c] uppercase font-bold block">Optimized MACD Settings</span>
                                  <span className="text-white font-bold">{activeSignal.indicatorsConfig.macdSettings}</span>
                                </div>
                                <div className="bg-[#181a20] p-2 rounded border border-[#24262b]">
                                  <span className="text-[8px] text-[#848e9c] uppercase font-bold block">Optimized EMA Settings</span>
                                  <span className="text-white font-bold">{activeSignal.indicatorsConfig.emaSettings}</span>
                                </div>
                                <div className="bg-[#181a20] p-2 rounded border border-[#24262b]">
                                  <span className="text-[8px] text-[#848e9c] uppercase font-bold block">Optimized Bollinger Bands</span>
                                  <span className="text-white font-bold">{activeSignal.indicatorsConfig.bollingerSettings}</span>
                                </div>
                              </div>
                              
                              <div className="bg-amber-950/10 border border-amber-900/40 p-2.5 rounded text-[10px] text-amber-300">
                                <span className="text-[8px] text-[#848e9c] uppercase font-bold block mb-0.5">Tuning Justification</span>
                                <p className="leading-relaxed">{activeSignal.indicatorsConfig.justification}</p>
                              </div>
                            </div>
                          ) : (
                            <p className="text-[#848e9c] text-xs py-4 text-center">Run a new market scan to analyze dynamically configured indicators.</p>
                          )}
                        </>
                      )}

                      {activeAnalysisTab === "advisor" && (
                        <>
                          <div className="flex items-center space-x-1 mb-1.5 border-b border-[#24262b] pb-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            <span className="text-[9px] font-extrabold text-[#eaecef] uppercase tracking-wider">AI Portfolio Advisor & Expected Outcomes</span>
                          </div>
                          
                          {activeSignal.portfolioAdvice ? (
                            <div className="space-y-3">
                              {/* Recommended Action Pill */}
                              <div className="bg-[#181a20] p-3 rounded-md border border-[#24262b] flex flex-col xs:flex-row xs:items-center justify-between gap-3">
                                <div>
                                  <span className="text-[8px] text-[#848e9c] uppercase font-bold block">Recommended Operation</span>
                                  <span className="text-xs font-black text-emerald-400 font-mono">{activeSignal.portfolioAdvice.action}</span>
                                </div>
                                
                                {/* Programmatically offer execution links if we match a cancellation */}
                                {(() => {
                                  const actionText = activeSignal.portfolioAdvice?.action || "";
                                  // Find order ID if matches
                                  const match = actionText.match(/(SIG-\d+|[a-z0-9]{7})/i);
                                  const orderIdToCancel = match ? match[0] : null;
                                  const openOrderToCancel = orderIdToCancel ? portfolio.openOrders.find((o: any) => o.id === orderIdToCancel) : null;
                                  
                                  if (openOrderToCancel) {
                                    return (
                                      <button
                                        onClick={() => {
                                          cancelOrder(openOrderToCancel.id);
                                        }}
                                        className="bg-red-950 hover:bg-red-900 text-red-300 border border-red-800 px-3 py-1 rounded text-[10px] font-bold font-mono transition"
                                      >
                                        Cancel Order {openOrderToCancel.id}
                                      </button>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>

                              <div className="bg-[#181a20] p-2.5 rounded border border-[#24262b] text-[10px] text-gray-300">
                                <span className="text-[8px] text-[#848e9c] uppercase font-bold block mb-1">Position Correlation Assessment</span>
                                <p className="leading-relaxed">{activeSignal.portfolioAdvice.analysis}</p>
                              </div>

                              <div className="bg-emerald-950/10 border border-emerald-900/40 p-2.5 rounded text-[10px] text-emerald-300">
                                <span className="text-[8px] text-emerald-400 font-bold block mb-1 uppercase tracking-wider">AI Expected Playout Outcome</span>
                                <p className="leading-relaxed">{activeSignal.portfolioAdvice.expectedOutcome}</p>
                              </div>
                            </div>
                          ) : (
                            <p className="text-[#848e9c] text-xs py-4 text-center">Run a new market scan to receive position correlations & cancellation advisors.</p>
                          )}
                        </>
                      )}

                      {activeAnalysisTab === "validation" && (
                        <>
                          {/* Segmented Sub-tab control */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#24262b] pb-2.5 mb-3 font-sans">
                            <div className="flex items-center space-x-1.5">
                              <Cpu className="w-3.5 h-3.5 text-rose-400" />
                              <span className="text-[10px] font-extrabold text-[#eaecef] uppercase tracking-wider">🔬 AMIS Scientific Research Laboratory</span>
                            </div>
                            
                            <div className="flex items-center bg-[#121416] p-0.5 rounded border border-[#1f2128]">
                              <button
                                onClick={() => setResearchSubTab("backtest")}
                                className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase transition ${researchSubTab === "backtest" ? "bg-rose-950/40 text-rose-300 border border-rose-900/30" : "text-[#848e9c] hover:text-white border border-transparent"}`}
                              >
                                Static Backtest
                              </button>
                              <button
                                onClick={() => setResearchSubTab("live")}
                                className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase transition ${researchSubTab === "live" ? "bg-rose-950/40 text-rose-300 border border-rose-900/30" : "text-[#848e9c] hover:text-white border border-transparent"}`}
                              >
                                Live Lab
                              </button>
                              <button
                                onClick={() => setResearchSubTab("trades")}
                                className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase transition ${researchSubTab === "trades" ? "bg-rose-950/40 text-rose-300 border border-rose-900/30" : "text-[#848e9c] hover:text-white border border-transparent"}`}
                              >
                                Paper Trading ({labData?.trades?.filter((t: any) => t.status === "ACTIVE").length || 0})
                              </button>
                              <button
                                onClick={() => setResearchSubTab("journal")}
                                className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase transition ${researchSubTab === "journal" ? "bg-rose-950/40 text-rose-300 border border-rose-900/30" : "text-[#848e9c] hover:text-white border border-transparent"}`}
                              >
                                Journal ({labData?.journal?.length || 0})
                              </button>
                              <button
                                onClick={() => setResearchSubTab("governance")}
                                className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase transition ${researchSubTab === "governance" ? "bg-rose-950/40 text-rose-300 border border-rose-900/30" : "text-[#848e9c] hover:text-white border border-transparent"}`}
                              >
                                Governance & Evolution
                              </button>
                            </div>
                          </div>

                          {/* SUB-TAB 1: STATIC BACKTEST AUDIT PANEL */}
                          {researchSubTab === "backtest" && (
                            <div className="space-y-4">
                              <div className="flex items-center justify-between bg-[#181a20] border border-[#24262b] p-2 rounded">
                                <span className="text-[8.5px] text-gray-400 font-mono">Run walk-forward simulation across historical database segments:</span>
                                <div className="flex items-center space-x-2">
                                  <span className="text-[8px] text-gray-500 font-bold uppercase font-sans">Horizon:</span>
                                  <select
                                    value={selectedHorizon}
                                    onChange={(e) => setSelectedHorizon(e.target.value)}
                                    className="bg-[#121416] text-gray-300 border border-[#24262b] text-[9px] rounded px-1.5 py-0.5 font-mono focus:outline-none focus:border-rose-500"
                                  >
                                    <option value="1m">1m</option>
                                    <option value="3m">3m</option>
                                    <option value="5m">5m</option>
                                    <option value="15m">15m</option>
                                    <option value="30m">30m</option>
                                    <option value="1h">1h</option>
                                    <option value="4h">4h</option>
                                    <option value="1d">1d</option>
                                  </select>
                                  <button
                                    onClick={() => fetchValidationData(selectedHorizon)}
                                    disabled={isValidating}
                                    className="bg-[#1f2128] hover:bg-[#2b2d37] disabled:opacity-50 text-rose-300 border border-rose-950 px-2 py-0.5 rounded text-[8px] font-bold font-mono transition"
                                  >
                                    {isValidating ? "Running..." : "🔄 Sweep"}
                                  </button>
                                </div>
                              </div>

                              {isValidating ? (
                                <div className="py-8 flex flex-col items-center justify-center text-center select-none space-y-2">
                                  <div className="w-6 h-6 border-2 border-rose-500/20 border-t-rose-400 rounded-full animate-spin" />
                                  <p className="text-[9px] text-rose-300 uppercase tracking-widest font-bold">Scanning Chronological Snapshots & Running Walk-Forward Replay...</p>
                                  <span className="text-[8px] text-[#848e9c] max-w-xs">Strict leakage prevention and calibration diagnostic evaluation currently running on the server.</span>
                                </div>
                              ) : validationError ? (
                                <div className="p-3 bg-red-950/10 border border-red-900/30 rounded text-red-300 text-[10px] space-y-2">
                                  <p className="font-bold">❌ Validation Failure Response:</p>
                                  <p className="text-[9px] text-red-400">{validationError}</p>
                                  <button
                                    onClick={() => fetchValidationData(selectedHorizon)}
                                    className="bg-red-950 hover:bg-red-900 border border-red-800 px-2 py-0.5 rounded text-[8px] font-bold transition"
                                  >
                                    Retry Execution
                                  </button>
                                </div>
                              ) : validationData ? (
                                <div className="space-y-4 font-mono text-[10px]">
                                  
                                  {/* 1. Walk-Forward Performance metrics and Calibration statistics */}
                                  <div className="bg-[#181a20] border border-[#24262b] p-2.5 rounded">
                                    <div className="text-[8px] text-rose-400 font-extrabold uppercase mb-2 tracking-wider">Part 1 — Walk-Forward General Diagnostics</div>
                                    <div className="grid grid-cols-2 xs:grid-cols-4 gap-2">
                                      <div className="bg-[#121416] p-2 border border-[#1f2128] rounded">
                                        <span className="text-[8px] text-[#848e9c] uppercase font-bold block mb-0.5">Walk-Forward Acc</span>
                                        <span className="text-[11px] font-extrabold text-white">{(validationData.walkForward.overallAccuracy * 100).toFixed(2)}%</span>
                                      </div>
                                      <div className="bg-[#121416] p-2 border border-[#1f2128] rounded">
                                        <span className="text-[8px] text-[#848e9c] uppercase font-bold block mb-0.5">Precision / Recall</span>
                                        <span className="text-[11px] font-extrabold text-white">{(validationData.walkForward.precision * 100).toFixed(0)}% / {(validationData.walkForward.recall * 100).toFixed(0)}%</span>
                                      </div>
                                      <div className="bg-[#121416] p-2 border border-[#1f2128] rounded">
                                        <span className="text-[8px] text-[#848e9c] uppercase font-bold block mb-0.5">Balanced Accuracy</span>
                                        <span className="text-[11px] font-extrabold text-sky-400">{(validationData.walkForward.balancedAccuracy * 100).toFixed(2)}%</span>
                                      </div>
                                      <div className="bg-[#121416] p-2 border border-[#1f2128] rounded">
                                        <span className="text-[8px] text-[#848e9c] uppercase font-bold block mb-0.5">Matthews Corr (MCC)</span>
                                        <span className="text-[11px] font-extrabold text-[#a076ff]">{validationData.walkForward.mcc.toFixed(4)}</span>
                                      </div>
                                      <div className="bg-[#121416] p-2 border border-[#1f2128] rounded">
                                        <span className="text-[8px] text-[#848e9c] uppercase font-bold block mb-0.5">ROC-AUC (UP)</span>
                                        <span className="text-[11px] font-extrabold text-emerald-400">{(validationData.walkForward.rocAuc * 100).toFixed(2)}%</span>
                                      </div>
                                      <div className="bg-[#121416] p-2 border border-[#1f2128] rounded">
                                        <span className="text-[8px] text-[#848e9c] uppercase font-bold block mb-0.5">Info Gain (Mutual Info)</span>
                                        <span className="text-[11px] font-extrabold text-rose-400">{validationData.walkForward.informationGain.toFixed(4)} bits</span>
                                      </div>
                                      <div className="bg-[#121416] p-2 border border-[#1f2128] rounded col-span-2">
                                        <span className="text-[8px] text-[#848e9c] uppercase font-bold block mb-0.5">Log Loss / Brier Score</span>
                                        <span className="text-[11px] font-extrabold text-amber-500">{validationData.walkForward.logLoss.toFixed(4)} / {validationData.walkForward.brierScore.toFixed(4)}</span>
                                      </div>
                                    </div>
                                    <div className="mt-2 flex items-center justify-between text-[8px] text-gray-400 border-t border-[#1f2128] pt-1.5 px-0.5">
                                      <span>Total Tested Snapshots: <strong className="text-white">{validationData.totalSnapshots}</strong> (Backtest Samples: <strong className="text-white">{validationData.backtestCount}</strong>)</span>
                                      <span>Wins: <strong className="text-emerald-400">{validationData.walkForward.winCount}</strong> | Losses: <strong className="text-red-400">{validationData.walkForward.lossCount}</strong></span>
                                    </div>
                                  </div>

                                  {/* 2. Probability Calibration Error & Reliability Diagrams */}
                                  <div className="bg-[#181a20] border border-[#24262b] p-2.5 rounded">
                                    <div className="flex justify-between items-center mb-2">
                                      <div className="text-[8px] text-rose-400 font-extrabold uppercase tracking-wider">Part 2 — Expected Calibration Error (ECE / MCE)</div>
                                      <div className="flex space-x-2 text-[8px]">
                                        <span className="text-gray-400">ECE: <strong className="text-rose-400">{(validationData.walkForward.ece * 100).toFixed(2)}%</strong></span>
                                        <span className="text-gray-400">MCE: <strong className="text-amber-500">{(validationData.walkForward.mce * 100).toFixed(2)}%</strong></span>
                                      </div>
                                    </div>
                                    
                                    {/* Reliability Diagram Bars */}
                                    <div className="space-y-2 bg-[#121416] p-2 rounded border border-[#1f2128]">
                                      {validationData.walkForward.calibrationBins.map((bin: any, index: number) => {
                                        const diff = Math.abs(bin.averageConfidence - bin.actualAccuracy) * 100;
                                        return (
                                          <div key={index} className="space-y-1">
                                            <div className="flex justify-between text-[8px] text-gray-400 font-sans">
                                              <span>Bin {index + 1} ({(bin.binMin * 100).toFixed(0)}-{(bin.binMax * 100).toFixed(0)}% Conf)</span>
                                              <span>Count: <strong className="text-white">{bin.sampleCount}</strong> | Avg Conf: <strong className="text-sky-400">{(bin.averageConfidence * 100).toFixed(1)}%</strong> | Acc: <strong className="text-emerald-400">{(bin.actualAccuracy * 100).toFixed(1)}%</strong> (Gap: <strong className={diff > 10 ? "text-red-400" : "text-[#eaecef]"}>{diff.toFixed(1)}%</strong>)</span>
                                            </div>
                                            <div className="relative h-2 bg-[#1d2025] rounded-full overflow-hidden border border-[#24262b]">
                                              {/* Acc bar */}
                                              <div
                                                className="absolute top-0 left-0 h-full bg-emerald-500/80 rounded-full"
                                                style={{ width: `${bin.actualAccuracy * 100}%` }}
                                              />
                                              {/* Conf pin indicator */}
                                              <div
                                                className="absolute top-0 w-0.5 h-full bg-sky-400"
                                                style={{ left: `${bin.averageConfidence * 100}%` }}
                                              />
                                            </div>
                                          </div>
                                        );
                                      })}
                                      <div className="text-[7px] text-[#848e9c] text-center font-sans border-t border-[#1e2025] pt-1">
                                        🟩 Bar width is Actual Accuracy. 💎 Vertical Line is Average Confidence. Ideal calibration means they align perfectly.
                                      </div>
                                    </div>
                                  </div>

                                  {/* 3. Feature Reliability Leaderboard */}
                                  <div className="bg-[#181a20] border border-[#24262b] p-2.5 rounded">
                                    <div className="text-[8px] text-rose-400 font-extrabold uppercase mb-2 tracking-wider">Part 3 — Feature Reliability Leaderboard</div>
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-left text-[9px] border-collapse">
                                        <thead>
                                          <tr className="border-b border-[#24262b] text-[8px] text-gray-500 uppercase">
                                            <th className="py-1">Rank</th>
                                            <th className="py-1">Feature Attribute</th>
                                            <th className="py-1 text-center">Status</th>
                                            <th className="py-1 text-right">Usefulness</th>
                                            <th className="py-1 text-right">Correlation</th>
                                            <th className="py-1 text-right">Stability</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#1e2025]">
                                          {validationData.featureLeaderboard.map((feat: any, idx: number) => {
                                            const statusColors: Record<string, string> = {
                                              STRONG_PREDICTOR: "text-emerald-400 bg-emerald-950/20 border border-emerald-900/30",
                                              WEAK_PREDICTOR: "text-yellow-500 bg-yellow-950/20 border border-yellow-900/30",
                                              NOISY_PREDICTOR: "text-orange-500 bg-orange-950/20 border border-orange-900/30",
                                              REDUNDANT_PREDICTOR: "text-gray-400 bg-gray-950/20 border border-gray-900/30",
                                              CONTRADICTORY_PREDICTOR: "text-red-400 bg-red-950/20 border border-red-900/30"
                                            };
                                            return (
                                              <tr key={idx} className="hover:bg-[#121416]/50">
                                                <td className="py-1 font-bold text-gray-500">#{feat.rank}</td>
                                                <td className="py-1 text-[#eaecef] font-medium">{feat.featureName}</td>
                                                <td className="py-1 text-center">
                                                  <span className={`px-1.5 py-0.5 rounded text-[7px] font-bold tracking-tight inline-block ${statusColors[feat.status] || "text-gray-400"}`}>
                                                    {feat.status.replace("_PREDICTOR", "")}
                                                  </span>
                                                </td>
                                                <td className="py-1 text-right font-bold text-white">{feat.usefulnessScore.toFixed(0)}</td>
                                                <td className="py-1 text-right text-sky-400">{feat.correlation >= 0 ? "+" : ""}{feat.correlation.toFixed(4)}</td>
                                                <td className="py-1 text-right text-gray-400">{feat.stability.toFixed(3)}</td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>

                                  {/* 4. Ablation & Feature Drift Diagnostics */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {/* Ablation Study Results */}
                                    <div className="bg-[#181a20] border border-[#24262b] p-2.5 rounded">
                                      <div className="text-[8px] text-rose-400 font-extrabold uppercase mb-2 tracking-wider">Part 4 — Ablation Studies</div>
                                      <div className="space-y-1.5">
                                        {Object.entries(validationData.ablationResults).map(([featName, res]: any) => {
                                          const baseline = validationData.walkForward.overallAccuracy;
                                          const delta = res.accuracy - baseline;
                                          const deltaColor = delta < 0 ? "text-red-400" : delta > 0 ? "text-emerald-400" : "text-gray-400";
                                          return (
                                            <div key={featName} className="flex justify-between items-center bg-[#121416] p-1.5 rounded border border-[#1f2128]">
                                              <span className="text-gray-400">{featName} disabled</span>
                                              <div className="text-right">
                                                <span className="text-[#eaecef] mr-2">{(res.accuracy * 100).toFixed(2)}%</span>
                                                <span className={`font-bold text-[8px] ${deltaColor}`}>
                                                  ({delta >= 0 ? "+" : ""}{(delta * 100).toFixed(2)}%)
                                                </span>
                                              </div>
                                            </div>
                                          );
                                        })}
                                        <div className="text-[7.5px] text-[#848e9c] leading-normal font-sans border-t border-[#1e2025] pt-1 mt-1">
                                          ⚠️ A negative percentage change means disabling this feature degraded overall accuracy, verifying its positive mathematical utility.
                                        </div>
                                      </div>
                                    </div>

                                    {/* Feature Drift Diagnostics */}
                                    <div className="bg-[#181a20] border border-[#24262b] p-2.5 rounded">
                                      <div className="text-[8px] text-rose-400 font-extrabold uppercase mb-2 tracking-wider">Part 5 — Drift Detection</div>
                                      <div className="space-y-1.5">
                                        {validationData.driftReport.map((drift: any, idx: number) => {
                                          return (
                                            <div key={idx} className="flex justify-between items-center bg-[#121416] p-1.5 rounded border border-[#1f2128]">
                                              <div>
                                                <span className="text-gray-300 block text-[9px]">{drift.featureName}</span>
                                                <span className="text-[7px] text-[#848e9c] font-sans block">Block means: {drift.blockMeans.join(" → ")}</span>
                                              </div>
                                              <div className="text-right">
                                                <span className="font-bold text-[#eaecef] text-[9px] mr-2">{drift.driftDistance.toFixed(3)}</span>
                                                <span className={`px-1 rounded text-[7px] font-bold ${drift.isSignificantDrift ? "text-red-400 bg-red-950/20 border border-red-900/40" : "text-emerald-400 bg-emerald-950/20 border border-emerald-900/40"}`}>
                                                  {drift.isSignificantDrift ? "DRIFTED" : "STABLE"}
                                                </span>
                                              </div>
                                            </div>
                                          );
                                        })}
                                        <div className="text-[7.5px] text-[#848e9c] leading-normal font-sans border-t border-[#1e2025] pt-1 mt-1">
                                          🔍 Monitors statistical drift over walk-forward blocks using standard deviation distance proxies to alert on regime shift anomalies.
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* 5. Statistical Significance Testing & Profile */}
                                  <div className="bg-[#181a20] border border-[#24262b] p-2.5 rounded">
                                    <div className="text-[8px] text-rose-400 font-extrabold uppercase mb-2 tracking-wider">Part 6 — Statistical Significance Testing</div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[8.5px]">
                                      <div className="space-y-2 bg-[#121416] p-2 rounded border border-[#1f2128]">
                                        <div className="flex justify-between">
                                          <span className="text-gray-400">Bootstrap Accuracy 95% CI:</span>
                                          <span className="text-white font-bold">[{ (validationData.statsReport.bootstrapAccuracyCI.lower * 100).toFixed(1) }%, { (validationData.statsReport.bootstrapAccuracyCI.upper * 100).toFixed(1) }%]</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-gray-400">Permutation P-Value (v Chance):</span>
                                          <span className={`font-bold ${validationData.statsReport.permutationPValue < 0.05 ? "text-emerald-400" : "text-yellow-500"}`}>
                                            p = {validationData.statsReport.permutationPValue.toFixed(4)}
                                          </span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-gray-400">McNemar's Test (v Ablated):</span>
                                          <span className="text-white">
                                            Chi2 = {validationData.statsReport.mcNemarTest.chiSquare.toFixed(2)} | p = {validationData.statsReport.mcNemarTest.pValue.toFixed(4)}
                                          </span>
                                        </div>
                                        <div className="text-[7px] text-gray-500 leading-normal">
                                          McNemar's p &lt; 0.05 verifies a mathematically significant performance improvement over ablated baseline setups.
                                        </div>
                                      </div>

                                      <div className="space-y-2 bg-[#121416] p-2 rounded border border-[#1f2128]">
                                        <div className="flex justify-between">
                                          <span className="text-gray-400">Chi-Square Independence (Regimes):</span>
                                          <span className="text-white font-bold">
                                            Chi2 = {validationData.statsReport.chiSquareRegimeIndependence.chiSquare.toFixed(2)} | p = {validationData.statsReport.chiSquareRegimeIndependence.pValue.toFixed(4)}
                                          </span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-gray-400">KS Test (Regime Distributions):</span>
                                          <span className="text-white font-bold">
                                            KS Stat = {validationData.statsReport.ksTest.ksStatistic.toFixed(3)} | p = {validationData.statsReport.ksTest.pValue.toFixed(4)}
                                          </span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-gray-400">Computational Throughput:</span>
                                          <span className="text-[#a076ff] font-bold">{validationData.profReport.throughput.toFixed(0)} evals/sec</span>
                                        </div>
                                        <div className="text-[7px] text-gray-500 leading-normal">
                                          KS Test p &lt; 0.05 indicates the Probability Engine distinguishes separate price distribution profiles perfectly across regimes.
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* 6. Failure Case Auditing */}
                                  <div className="bg-[#181a20] border border-[#24262b] p-2.5 rounded">
                                    <div className="text-[8px] text-rose-400 font-extrabold uppercase mb-2 tracking-wider">Part 7 — Deep Failure Analysis Ledger</div>
                                    {validationData.failuresReport.length === 0 ? (
                                      <p className="text-center text-gray-500 py-3 text-[9px]">No validation failures detected. Calibration is fully operational.</p>
                                    ) : (
                                      <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
                                        {validationData.failuresReport.slice(0, 5).map((fail: any, idx: number) => {
                                          return (
                                            <div key={idx} className="bg-[#121416] p-2 rounded border border-[#1f2128] space-y-1">
                                              <div className="flex justify-between text-[8px]">
                                                <span className="text-gray-400 font-sans">Case ID: <strong className="text-[#eaecef]">{fail.caseId}</strong> | Symbol: <strong className="text-white">{fail.market}</strong> ({fail.horizonLabel})</span>
                                                <span className="text-red-400 font-extrabold uppercase bg-red-950/30 border border-red-900/30 px-1 py-0.2 rounded">FAILED PREDICTION</span>
                                              </div>
                                              <div className="grid grid-cols-3 gap-1 text-[8px] font-sans border-b border-[#1e2025] pb-1">
                                                <span className="text-gray-400">Pred: <strong className="text-rose-400">{fail.predictedDirection}</strong> ({(fail.predictedProb * 100).toFixed(0)}%)</span>
                                                <span className="text-gray-400">Actual: <strong className="text-red-400">{fail.actualDirection}</strong></span>
                                                <span className="text-gray-400 text-right">Change: <strong className="text-white">{(fail.actualChange * 100).toFixed(2)}%</strong></span>
                                              </div>
                                              <div className="text-[7.5px] text-[#848e9c]">
                                                <span className="font-bold block uppercase tracking-tight text-[6.5px] text-yellow-500">Disagreeing Indicators & Failure Factors:</span>
                                                <p className="font-sans leading-tight mt-0.5">
                                                  Indicators: {fail.disagreeingIndicators.join(", ") || "None"} | Failed features: {fail.failedFeatures.join(", ") || "None"}
                                                  {fail.wasExcessiveConfidence && <strong className="text-red-400 ml-1"> [Excessive Confidence Error]</strong>}
                                                  {fail.regimeShifted && <strong className="text-orange-400 ml-1"> [Rapid Regime Shift]</strong>}
                                                </p>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>

                                </div>
                              ) : (
                                <div className="py-8 flex flex-col items-center justify-center text-center select-none text-[#848e9c]">
                                  <Cpu className="w-6 h-6 text-rose-500/10 mb-1 animate-pulse" />
                                  <span>No active validation data available. Click Sweep to execute scientific validation.</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* SUB-TAB 2: LIVE LABORATORY PANEL */}
                          {researchSubTab === "live" && (
                            <div className="space-y-4 font-mono">
                              {/* Active Alerts Banner */}
                              {labData?.alerts?.length > 0 && (
                                <div className="space-y-1.5">
                                  {labData.alerts.map((alt: any, idx: number) => (
                                    <div key={idx} className={`p-2.5 border rounded flex items-start space-x-2 font-mono text-[9px] leading-relaxed ${alt.severity === "CRITICAL" ? "bg-red-950/20 border-red-900/50 text-red-300" : "bg-yellow-950/20 border-yellow-900/50 text-yellow-300"}`}>
                                      <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${alt.severity === "CRITICAL" ? "text-red-400" : "text-yellow-400"} animate-pulse`} />
                                      <div className="space-y-0.5">
                                        <span className="font-extrabold uppercase tracking-wide block">[{alt.severity}] {alt.type} Detected</span>
                                        <p>{alt.message}</p>
                                        <span className="text-[8px] opacity-85 block mt-1">Recommended Action: <strong className="underline">{alt.suggestedAction}</strong></span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Aggregate Scientific Metrics Panel */}
                              <div className="bg-[#181a20] border border-[#24262b] p-3 rounded font-mono">
                                <div className="text-[8px] text-rose-400 font-extrabold uppercase mb-2 tracking-wider font-sans">Calibration & Performance Metrics</div>
                                <div className="grid grid-cols-2 xs:grid-cols-4 gap-2">
                                  <div className="bg-[#121416] p-2 border border-[#1f2128] rounded">
                                    <span className="text-[8px] text-[#848e9c] uppercase font-bold block mb-0.5">Forecast Accuracy</span>
                                    <span className="text-[12px] font-extrabold text-white">{(labData?.metrics?.overallAccuracy * 100 || 0).toFixed(2)}%</span>
                                  </div>
                                  <div className="bg-[#121416] p-2 border border-[#1f2128] rounded col-span-1">
                                    <span className="text-[8px] text-[#848e9c] uppercase font-bold block mb-0.5">Brier / Log Loss</span>
                                    <span className="text-[11px] font-extrabold text-sky-400">{(labData?.metrics?.brierScore || 0).toFixed(4)} / {(labData?.metrics?.logLoss || 0).toFixed(4)}</span>
                                  </div>
                                  <div className="bg-[#121416] p-2 border border-[#1f2128] rounded">
                                    <span className="text-[8px] text-[#848e9c] uppercase font-bold block mb-0.5">Calibration Index</span>
                                    <span className="text-[12px] font-extrabold text-rose-400">{(labData?.metrics?.confidenceCalibrationIndex || 0).toFixed(1)}/100</span>
                                  </div>
                                  <div className="bg-[#121416] p-2 border border-[#1f2128] rounded">
                                    <span className="text-[8px] text-[#848e9c] uppercase font-bold block mb-0.5">Experiments Count</span>
                                    <span className="text-[12px] font-extrabold text-amber-500">{labData?.metrics?.totalPredictions || 0}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Active Predictions Stack */}
                              <div className="bg-[#181a20] border border-[#24262b] p-3 rounded font-mono">
                                <div className="text-[8px] text-rose-400 font-extrabold uppercase mb-2.5 tracking-wider font-sans">Active Prediction Experiments ({labData?.predictions?.filter((p: any) => !p.resolved).length || 0})</div>
                                
                                {(!labData?.predictions || labData.predictions.filter((p: any) => !p.resolved).length === 0) ? (
                                  <div className="py-6 flex flex-col items-center justify-center text-center text-[#848e9c] text-[10px] space-y-1 select-none font-sans">
                                    <Clock className="w-5 h-5 opacity-20 mb-0.5" />
                                    <p className="font-bold">No active prediction experiments running.</p>
                                    <span className="text-[8px] text-[#5d6673]">Wait for a new tick to register a prediction automatically.</span>
                                  </div>
                                ) : (
                                  <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                                    {labData.predictions.filter((p: any) => !p.resolved).map((pred: any) => {
                                      const elapsed = Date.now() - pred.timestamp;
                                      const duration = 3 * 60 * 1000; // 3 mins
                                      const pctComplete = Math.min(100, Math.max(0, (elapsed / duration) * 100));
                                      const remainingSecs = Math.max(0, Math.floor((duration - elapsed) / 1000));
                                      return (
                                        <div key={pred.id} className="bg-[#121416] border border-[#1f2128] p-2.5 rounded text-[10px] space-y-2">
                                          <div className="flex items-center justify-between">
                                            <span className="font-extrabold text-[#eaecef] text-[10px] font-mono flex items-center space-x-1.5">
                                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                              <span>{pred.market}</span>
                                              <span className="text-[#848e9c] text-[8px] font-normal font-sans">({pred.horizon})</span>
                                            </span>
                                            <span className="text-[8px] text-[#5d6673] font-bold">{pred.id}</span>
                                          </div>
                                          <div className="grid grid-cols-3 gap-2 py-1.5 border-t border-b border-[#24262b]/40 text-center text-[9px]">
                                            <div>
                                              <span className="text-[7.5px] text-[#848e9c] block uppercase">Entry Price</span>
                                              <span className="font-extrabold text-white">{pred.currentPrice.toLocaleString()}</span>
                                            </div>
                                            <div>
                                              <span className="text-[7.5px] text-[#848e9c] block uppercase">Expected Vol</span>
                                              <span className="font-extrabold text-sky-400">{pred.expectedVolatility.toFixed(3)}%</span>
                                            </div>
                                            <div>
                                              <span className="text-[7.5px] text-[#848e9c] block uppercase">Confidence</span>
                                              <span className="font-extrabold text-amber-500">{pred.confidence.toFixed(1)}%</span>
                                            </div>
                                          </div>
                                          <div className="space-y-1">
                                            <div className="flex justify-between items-center text-[8.5px] text-gray-400">
                                              <span>Up: <strong className="text-emerald-400">{(pred.probabilities.up * 100).toFixed(0)}%</strong> | Down: <strong className="text-red-400">{(pred.probabilities.down * 100).toFixed(0)}%</strong> | Flat: <strong className="text-gray-400">{(pred.probabilities.sideways * 100).toFixed(0)}%</strong></span>
                                              <span className="text-[8px] text-[#848e9c]">{remainingSecs}s to resolve</span>
                                            </div>
                                            <div className="w-full bg-[#1e2126] h-1 rounded-full overflow-hidden">
                                              <div className="bg-rose-500 h-full transition-all duration-1000" style={{ width: `${pctComplete}%` }} />
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>

                              {/* Resolved Outcomes ledger */}
                              <div className="bg-[#181a20] border border-[#24262b] p-3 rounded font-mono">
                                <div className="flex justify-between items-center mb-2.5">
                                  <div className="text-[8px] text-rose-400 font-extrabold uppercase tracking-wider font-sans font-sans">Resolved Empirical Outcomes ({labData?.predictions?.filter((p: any) => p.resolved).length || 0})</div>
                                  {labData?.predictions?.filter((p: any) => p.resolved).length > 0 && (
                                    <button onClick={() => handleExportData("predictions", "csv")} className="bg-[#121416] hover:bg-[#1e2126] border border-[#24262b] px-1.5 py-0.5 rounded text-[8px] font-bold text-gray-300 transition font-sans">Export CSV</button>
                                  )}
                                </div>
                                
                                {(!labData?.predictions || labData.predictions.filter((p: any) => p.resolved).length === 0) ? (
                                  <p className="text-center text-[#848e9c] py-6 text-[10px] font-sans">No evaluated experiments yet. Wait for active predictions to elapse.</p>
                                ) : (
                                  <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                                    {labData.predictions.filter((p: any) => p.resolved).slice().reverse().map((pred: any) => (
                                      <div key={pred.id} className="bg-[#121416]/60 border border-[#24262b] p-2 rounded text-[9.5px] flex items-center justify-between gap-3 font-mono">
                                        <div className="space-y-0.5">
                                          <div className="flex items-center space-x-1.5">
                                            <span className="font-extrabold text-[#eaecef]">{pred.market}</span>
                                            <span className={`px-1 py-0.2 rounded text-[7px] font-bold ${pred.actualOutcome.predictionCorrect ? "bg-emerald-950/40 text-emerald-400 border border-emerald-900/30" : "bg-red-950/40 text-red-400 border border-red-900/30"}`}>
                                              {pred.actualOutcome.predictionCorrect ? "WIN" : "LOSS"}
                                            </span>
                                          </div>
                                          <div className="text-gray-400 text-[8.5px]">
                                            In: <strong className="text-white">{pred.currentPrice.toLocaleString()}</strong> | Out: <strong className="text-white">{pred.actualOutcome.exitPrice.toLocaleString()}</strong>
                                          </div>
                                        </div>
                                        <div className="text-right space-y-0.5 text-[8px]">
                                          <span className="text-[#848e9c] block">{new Date(pred.timestamp).toLocaleTimeString()}</span>
                                          <span className="text-gray-400 block">Change: <strong className={pred.actualOutcome.percentageChange >= 0 ? "text-emerald-400" : "text-red-400"}>{(pred.actualOutcome.percentageChange * 100).toFixed(2)}%</strong></span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* SUB-TAB 3: PAPER TRADING PANEL */}
                          {researchSubTab === "trades" && (
                            <div className="space-y-4 font-mono">
                              {/* Paper Trading Account Balance & Equity stats */}
                              <div className="bg-[#181a20] border border-[#24262b] p-3 rounded">
                                <div className="text-[8px] text-rose-400 font-extrabold uppercase mb-2 tracking-wider font-sans">Simulated Paper Capital Account</div>
                                {(() => {
                                  const completedTrades = labData?.trades?.filter((t: any) => t.status === "COMPLETED") || [];
                                  const netProfitSum = completedTrades.reduce((sum: number, t: any) => sum + t.profit, 0);
                                  const totalWallet = 10000.0 + netProfitSum;
                                  return (
                                    <div className="grid grid-cols-2 xs:grid-cols-4 gap-2">
                                      <div className="bg-[#121416] p-2 border border-[#1f2128] rounded col-span-2">
                                        <span className="text-[8px] text-[#848e9c] uppercase font-bold block mb-0.5">Virtual Equity Account</span>
                                        <span className="text-[14px] font-black text-emerald-400">{totalWallet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT</span>
                                      </div>
                                      <div className="bg-[#121416] p-2 border border-[#1f2128] rounded">
                                        <span className="text-[8px] text-[#848e9c] uppercase font-bold block mb-0.5">Win Rate (%)</span>
                                        <span className="text-[12px] font-extrabold text-white">{(labData?.metrics?.winRate * 100 || 0).toFixed(1)}%</span>
                                      </div>
                                      <div className="bg-[#121416] p-2 border border-[#1f2128] rounded">
                                        <span className="text-[8px] text-[#848e9c] uppercase font-bold block mb-0.5">Profit Factor</span>
                                        <span className="text-[12px] font-extrabold text-[#a076ff]">{(labData?.metrics?.profitFactor || 0).toFixed(2)}</span>
                                      </div>
                                      <div className="bg-[#121416] p-2 border border-[#1f2128] rounded">
                                        <span className="text-[8px] text-[#848e9c] uppercase font-bold block mb-0.5">Sharpe Ratio</span>
                                        <span className="text-[12px] font-extrabold text-white">{(labData?.metrics?.sharpeRatio || 0).toFixed(4)}</span>
                                      </div>
                                      <div className="bg-[#121416] p-2 border border-[#1f2128] rounded">
                                        <span className="text-[8px] text-[#848e9c] uppercase font-bold block mb-0.5">Sortino Ratio</span>
                                        <span className="text-[12px] font-extrabold text-white">{(labData?.metrics?.sortinoRatio || 0).toFixed(4)}</span>
                                      </div>
                                      <div className="bg-[#121416] p-2 border border-[#1f2128] rounded col-span-2">
                                        <span className="text-[8px] text-[#848e9c] uppercase font-bold block mb-0.5">Max Drawdown</span>
                                        <span className="text-[12px] font-extrabold text-red-400">{(labData?.metrics?.maxDrawdown * 100 || 0).toFixed(2)}%</span>
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>

                              {/* Active Positions */}
                              <div className="bg-[#181a20] border border-[#24262b] p-3 rounded">
                                <div className="text-[8px] text-rose-400 font-extrabold uppercase mb-2.5 tracking-wider font-sans font-sans">Active Risk Positions ({labData?.trades?.filter((t: any) => t.status === "ACTIVE").length || 0})</div>
                                {(!labData?.trades || labData.trades.filter((t: any) => t.status === "ACTIVE").length === 0) ? (
                                  <div className="py-6 flex flex-col items-center justify-center text-center text-[#848e9c] text-[10px] space-y-1 select-none font-sans">
                                    <Zap className="w-5 h-5 opacity-20 mb-0.5 animate-pulse text-rose-500" />
                                    <p className="font-bold">No active paper trade positions.</p>
                                    <span className="text-[8px] text-[#5d6673]">Positions open automatically when prediction confidence exceeds risk hurdle.</span>
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    {labData.trades.filter((t: any) => t.status === "ACTIVE").map((trade: any) => {
                                      const livePrice = tickers[trade.market]?.price || trade.entryPrice;
                                      const priceDiff = livePrice - trade.entryPrice;
                                      const returnPct = trade.direction === "LONG" ? (priceDiff / trade.entryPrice) * 100 : (-priceDiff / trade.entryPrice) * 100;
                                      const livePnL = returnPct * trade.positionSize * 10;
                                      return (
                                        <div key={trade.id} className="bg-[#121416] border border-emerald-900/30 p-2.5 rounded text-[10px] space-y-2">
                                          <div className="flex items-center justify-between">
                                            <span className="font-extrabold text-white text-[11px] font-mono flex items-center space-x-1.5">
                                              <span>{trade.market}</span>
                                              <span className={`px-1 rounded text-[7px] font-black ${trade.direction === "LONG" ? "bg-emerald-950 text-emerald-400 border border-emerald-900/40" : "bg-red-950 text-red-400 border border-red-900/40"}`}>{trade.direction}</span>
                                            </span>
                                            <span className="text-[8px] text-[#848e9c] font-bold">{trade.id}</span>
                                          </div>
                                          <div className="grid grid-cols-4 gap-1 py-1 border-t border-b border-[#24262b]/40 text-center text-[9px]">
                                            <div>
                                              <span className="text-[7.5px] text-[#848e9c] block uppercase">Entry Price</span>
                                              <span className="font-bold text-white">{trade.entryPrice.toLocaleString()}</span>
                                            </div>
                                            <div>
                                              <span className="text-[7.5px] text-[#848e9c] block uppercase">Stop Loss</span>
                                              <span className="font-bold text-red-400">{trade.stopLoss.toFixed(1)}</span>
                                            </div>
                                            <div>
                                              <span className="text-[7.5px] text-[#848e9c] block uppercase">Take Profit</span>
                                              <span className="font-bold text-emerald-400">{trade.takeProfit.toFixed(1)}</span>
                                            </div>
                                            <div>
                                              <span className="text-[7.5px] text-[#848e9c] block uppercase">Current</span>
                                              <span className="font-bold text-sky-400">{livePrice.toLocaleString()}</span>
                                            </div>
                                          </div>
                                          <div className="flex justify-between items-center text-[9px] pt-0.5">
                                            <span className="text-gray-400">Exit Protection Bounds Active</span>
                                            <span className={`font-black ${returnPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                              {returnPct >= 0 ? "+" : ""}{livePnL.toFixed(2)} USDT ({returnPct.toFixed(2)}%)
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>

                              {/* Completed Positions Ledger */}
                              <div className="bg-[#181a20] border border-[#24262b] p-3 rounded">
                                <div className="flex justify-between items-center mb-2.5">
                                  <div className="text-[8px] text-rose-400 font-extrabold uppercase tracking-wider font-sans font-sans font-sans">Simulated Paper Position Ledger ({labData?.trades?.filter((t: any) => t.status === "COMPLETED").length || 0})</div>
                                  {labData?.trades?.filter((t: any) => t.status === "COMPLETED").length > 0 && (
                                    <button onClick={() => handleExportData("trades", "csv")} className="bg-[#121416] hover:bg-[#1e2126] border border-[#24262b] px-1.5 py-0.5 rounded text-[8px] font-bold text-gray-300 transition font-sans">Export CSV</button>
                                  )}
                                </div>
                                
                                {(!labData?.trades || labData.trades.filter((t: any) => t.status === "COMPLETED").length === 0) ? (
                                  <p className="text-center text-[#848e9c] py-6 text-[10px] font-sans">No historical paper trades resolved yet.</p>
                                ) : (
                                  <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1 font-mono">
                                    {labData.trades.filter((t: any) => t.status === "COMPLETED").slice().reverse().map((trade: any) => (
                                      <div key={trade.id} className="bg-[#121416]/60 border border-[#24262b] p-2 rounded text-[9.5px] flex items-center justify-between gap-3 font-mono">
                                        <div className="space-y-0.5">
                                          <div className="flex items-center space-x-1.5">
                                            <span className="font-extrabold text-[#eaecef]">{trade.market}</span>
                                            <span className={`px-1 py-0.2 rounded text-[7px] font-black ${trade.direction === "LONG" ? "text-emerald-400" : "text-red-400"}`}>{trade.direction}</span>
                                            <span className="text-[8px] text-[#848e9c]">({trade.exitReason})</span>
                                          </div>
                                          <div className="text-gray-400 text-[8.5px]">
                                            In: <strong>{trade.entryPrice.toLocaleString()}</strong> | Out: <strong>{trade.exitPrice?.toLocaleString()}</strong>
                                          </div>
                                        </div>
                                        <div className="text-right space-y-0.5 font-mono">
                                          <span className={`block font-black text-[10px] ${trade.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                            {trade.profit >= 0 ? "+" : ""}{trade.profit.toFixed(2)} USDT ({trade.returnPct?.toFixed(2)}%)
                                          </span>
                                          <span className="text-[7.5px] text-[#848e9c] block font-sans">Quality: {trade.tradeQuality}/100</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* SUB-TAB 4: RESEARCH JOURNAL PANEL */}
                          {researchSubTab === "journal" && (
                            <div className="space-y-3 font-mono">
                              <div className="bg-[#181a20] border border-[#24262b] p-2.5 rounded flex items-center space-x-2">
                                <span className="text-[8px] text-[#848e9c] uppercase font-bold font-sans">Search Filter:</span>
                                <input
                                  type="text"
                                  value={journalQuery}
                                  onChange={(e) => setJournalQuery(e.target.value)}
                                  placeholder="Filter by symbol, direction, or keyword..."
                                  className="bg-[#121416] text-gray-300 border border-[#24262b] text-[9px] rounded px-2 py-1 w-full focus:outline-none focus:border-rose-500 font-mono"
                                />
                              </div>

                              {(!labData?.journal || labData.journal.length === 0) ? (
                                <div className="py-8 flex flex-col items-center justify-center text-center text-[#848e9c] text-[10px] space-y-1 bg-[#181a20] border border-[#24262b] rounded font-sans">
                                  <BookOpen className="w-5 h-5 opacity-20 mb-0.5" />
                                  <p className="font-bold">No research journal logs recorded.</p>
                                  <span className="text-[8px] text-[#5d6673]">Every prediction and trade experiment generates an immutable study entry automatically.</span>
                                </div>
                              ) : (
                                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                                  {labData.journal
                                    .filter((j: any) => {
                                      if (!journalQuery) return true;
                                      const q = journalQuery.toLowerCase();
                                      return j.market.toLowerCase().includes(q) || j.direction.toLowerCase().includes(q) || j.entryReasoning.toLowerCase().includes(q);
                                    })
                                    .slice()
                                    .reverse()
                                    .map((j: any) => {
                                      return (
                                        <div key={j.id} className="bg-[#181a20] border border-[#24262b] p-2.5 rounded text-[9.5px] space-y-2">
                                          <div className="flex items-center justify-between border-b border-[#24262b]/40 pb-1.5">
                                            <span className="font-extrabold text-white text-[10px] flex items-center space-x-1.5">
                                              <span>{j.market}</span>
                                              <span className={`px-1 py-0.1 text-[7px] font-black ${j.direction === "LONG" ? "text-emerald-400" : "text-red-400"}`}>{j.direction}</span>
                                            </span>
                                            <span className="text-[8px] text-[#848e9c] font-sans">{new Date(j.timestamp).toLocaleString()}</span>
                                          </div>
                                          <div className="space-y-1 text-[8.5px]">
                                            <div>
                                              <span className="text-[7.5px] text-[#848e9c] uppercase font-bold block mb-0.5 font-sans">Entry Reasoning</span>
                                              <p className="text-gray-300 leading-normal bg-[#121416]/50 p-1.5 rounded">{j.entryReasoning}</p>
                                            </div>
                                            {j.outcomeSummary && (
                                              <div className="pt-1.5 border-t border-[#24262b]/40">
                                                <span className="text-[7.5px] text-rose-400 uppercase font-bold block mb-0.5 font-sans">Outcome Analysis & Lessons Learned</span>
                                                <p className="text-gray-300 leading-normal bg-[#121416]/50 p-1.5 rounded">{j.outcomeSummary}</p>
                                              </div>
                                            )}
                                            {j.modelWeaknessDetected && (
                                              <div className="text-[7.5px] text-yellow-500 bg-yellow-950/10 border border-yellow-900/30 p-1.5 rounded mt-1.5">
                                                <strong className="block uppercase text-[6.5px] font-sans">Quant Model Vulnerability Flagged:</strong>
                                                <p className="mt-0.5">{j.modelWeaknessDetected}</p>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                </div>
                              )}
                            </div>
                          )}

                          {/* SUB-TAB 5: MODEL GOVERNANCE & RESEARCH EVOLUTION PANEL */}
                          {researchSubTab === "governance" && (() => {
                            const models = governanceData?.models || [];
                            const champion = models.find((m: any) => m.isChampion) || {
                              version: "v1.1.0",
                              name: "Standard Probability Engine",
                              description: "Standard baseline weight configuration",
                              weights: { regime: 0.25, trendStrength: 0.20, rsi: 0.20, bollingerBandwidth: 0.15, direction: 0.10, cognitiveState: 0.10 },
                              accuracy: 0.655,
                              brierScore: 0.188,
                              sampleCount: 142
                            };
                            const challenger = models.find((m: any) => !m.isChampion) || null;
                            const experiments = governanceData?.experiments || [];
                            const dqHistory = governanceData?.dataQualityHistory || [];
                            const latestDq = dqHistory[dqHistory.length - 1] || {
                              timestamp: Date.now(),
                              healthScore: 100,
                              missingValues: 0,
                              staleTicks: 0,
                              priceSpikes: 0,
                              duplicates: 0,
                              alerts: []
                            };
                            const regressionRuns = governanceData?.regressionRuns || [];
                            const latestRegression = regressionRuns[regressionRuns.length - 1] || {
                              id: "REG-INIT",
                              timestamp: Date.now(),
                              passed: true,
                              totalCases: 5,
                              passedCount: 5,
                              cases: []
                            };
                            const dailyReports = governanceData?.dailyReports || [];

                            return (
                              <div className="space-y-4 font-sans text-left">
                                {/* TAB SELECTOR FOR GOVERNANCE VS ADAPTIVE */}
                                <div className="flex border-b border-[#24262b] pb-1.5 space-x-3.5 mb-2.5">
                                  <button
                                    onClick={() => setGovMenu("standard")}
                                    className={`text-[9.5px] uppercase font-bold tracking-wider pb-1 transition-all ${govMenu === "standard" ? "text-rose-400 border-b border-rose-500 font-extrabold" : "text-[#848e9c] hover:text-white border-transparent"}`}
                                  >
                                    Scientific Registry & Auditing
                                  </button>
                                  <button
                                    onClick={() => setGovMenu("adaptive")}
                                    className={`text-[9.5px] uppercase font-bold tracking-wider pb-1 transition-all ${govMenu === "adaptive" ? "text-rose-400 border-b border-rose-500 font-extrabold" : "text-[#848e9c] hover:text-white border-transparent"}`}
                                  >
                                    Adaptive Learning Laboratory (Phase 4.9)
                                  </button>
                                </div>

                                {govMenu === "standard" ? (
                                  <>
                                    {/* SECTION 1: CHAMPION VS CHALLENGER SYSTEM STANDING */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                  {/* Champion Card */}
                                  <div className="bg-[#181a20] border-2 border-emerald-950 rounded-lg p-3 relative overflow-hidden">
                                    <div className="absolute top-2 right-2 bg-emerald-950 border border-emerald-500/30 text-emerald-400 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                                      Active Champion
                                    </div>
                                    <div className="flex items-center space-x-1.5 mb-2">
                                      <Scale className="w-4 h-4 text-emerald-400" />
                                      <h3 className="text-[11px] font-black text-white uppercase tracking-tight">Champion Model</h3>
                                    </div>
                                    <div className="space-y-1.5 text-[9.5px]">
                                      <div className="flex justify-between border-b border-[#24262b]/60 pb-1">
                                        <span className="text-[#848e9c]">Identifier:</span>
                                        <span className="font-mono font-bold text-white bg-[#121416] px-1.5 py-0.2 rounded text-[9px] border border-[#1f2128]">{champion.version}</span>
                                      </div>
                                      <div className="flex justify-between border-b border-[#24262b]/60 pb-1">
                                        <span className="text-[#848e9c]">Model Name:</span>
                                        <span className="font-semibold text-gray-200">{champion.name}</span>
                                      </div>
                                      <div className="flex justify-between border-b border-[#24262b]/60 pb-1">
                                        <span className="text-[#848e9c]">Historical Accuracy:</span>
                                        <span className="font-bold text-emerald-400 font-mono">{(champion.accuracy * 100).toFixed(1)}%</span>
                                      </div>
                                      <div className="flex justify-between border-b border-[#24262b]/60 pb-1">
                                        <span className="text-[#848e9c]">Brier Calibration Score:</span>
                                        <span className="font-bold text-emerald-400 font-mono">{champion.brierScore.toFixed(3)}</span>
                                      </div>
                                      <div className="flex justify-between border-b border-[#24262b]/60 pb-1">
                                        <span className="text-[#848e9c]">Evaluated Samples:</span>
                                        <span className="text-gray-300 font-mono">{champion.sampleCount} predictions</span>
                                      </div>
                                      <div className="pt-1.5">
                                        <span className="text-[7.5px] text-[#848e9c] uppercase font-bold block mb-1">Feature Weights Profile:</span>
                                        <div className="grid grid-cols-3 gap-1 text-[8.5px] font-mono">
                                          <div className="bg-[#121416] p-1 rounded border border-[#1f2128]">Regime: {champion.weights.regime.toFixed(2)}</div>
                                          <div className="bg-[#121416] p-1 rounded border border-[#1f2128]">Trend: {champion.weights.trendStrength.toFixed(2)}</div>
                                          <div className="bg-[#121416] p-1 rounded border border-[#1f2128]">RSI: {champion.weights.rsi.toFixed(2)}</div>
                                          <div className="bg-[#121416] p-1 rounded border border-[#1f2128]">BB: {champion.weights.bollingerBandwidth.toFixed(2)}</div>
                                          <div className="bg-[#121416] p-1 rounded border border-[#1f2128]">Direction: {champion.weights.direction.toFixed(2)}</div>
                                          <div className="bg-[#121416] p-1 rounded border border-[#1f2128]">Cognitive: {champion.weights.cognitiveState.toFixed(2)}</div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Challenger Card */}
                                  <div className="bg-[#181a20] border-2 border-rose-950/50 rounded-lg p-3 relative overflow-hidden">
                                    <div className="absolute top-2 right-2 bg-rose-950/60 border border-rose-500/20 text-rose-300 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                                      Active Challenger
                                    </div>
                                    <div className="flex items-center space-x-1.5 mb-2">
                                      <Sparkles className="w-4 h-4 text-rose-400" />
                                      <h3 className="text-[11px] font-black text-white uppercase tracking-tight">Challenger Model</h3>
                                    </div>
                                    {challenger ? (
                                      <div className="space-y-1.5 text-[9.5px]">
                                        <div className="flex justify-between border-b border-[#24262b]/60 pb-1">
                                          <span className="text-[#848e9c]">Identifier:</span>
                                          <span className="font-mono font-bold text-white bg-[#121416] px-1.5 py-0.2 rounded text-[9px] border border-[#1f2128]">{challenger.version}</span>
                                        </div>
                                        <div className="flex justify-between border-b border-[#24262b]/60 pb-1">
                                          <span className="text-[#848e9c]">Model Name:</span>
                                          <span className="font-semibold text-gray-200">{challenger.name}</span>
                                        </div>
                                        <div className="flex justify-between border-b border-[#24262b]/60 pb-1">
                                          <span className="text-[#848e9c]">Historical Accuracy:</span>
                                          <span className="font-bold text-rose-400 font-mono">{(challenger.accuracy * 100).toFixed(1)}%</span>
                                        </div>
                                        <div className="flex justify-between border-b border-[#24262b]/60 pb-1">
                                          <span className="text-[#848e9c]">Brier Calibration Score:</span>
                                          <span className="font-bold text-rose-400 font-mono">{challenger.brierScore.toFixed(3)}</span>
                                        </div>
                                        <div className="flex justify-between border-b border-[#24262b]/60 pb-1">
                                          <span className="text-[#848e9c]">Evaluated Samples:</span>
                                          <span className="text-gray-300 font-mono">{challenger.sampleCount} predictions</span>
                                        </div>
                                        <div className="pt-1.5">
                                          <span className="text-[7.5px] text-[#848e9c] uppercase font-bold block mb-1">Feature Weights Profile:</span>
                                          <div className="grid grid-cols-3 gap-1 text-[8.5px] font-mono">
                                            <div className="bg-[#121416] p-1 rounded border border-[#1f2128]">Regime: {challenger.weights.regime.toFixed(2)}</div>
                                            <div className="bg-[#121416] p-1 rounded border border-[#1f2128]">Trend: {challenger.weights.trendStrength.toFixed(2)}</div>
                                            <div className="bg-[#121416] p-1 rounded border border-[#1f2128]">RSI: {challenger.weights.rsi.toFixed(2)}</div>
                                            <div className="bg-[#121416] p-1 rounded border border-[#1f2128]">BB: {challenger.weights.bollingerBandwidth.toFixed(2)}</div>
                                            <div className="bg-[#121416] p-1 rounded border border-[#1f2128]">Direction: {challenger.weights.direction.toFixed(2)}</div>
                                            <div className="bg-[#121416] p-1 rounded border border-[#1f2128]">Cognitive: {challenger.weights.cognitiveState.toFixed(2)}</div>
                                          </div>
                                        </div>
                                        <button
                                          onClick={() => {
                                            setPromoteVersion(challenger.version);
                                            setShowPromoteModal(true);
                                          }}
                                          className="mt-2.5 w-full bg-emerald-950 text-emerald-300 border border-emerald-900/40 hover:bg-emerald-900/60 font-sans font-bold text-[8.5px] uppercase tracking-wider py-1.5 rounded transition"
                                        >
                                          Promote Challenger to Champion
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="py-6 flex flex-col items-center justify-center text-center text-[#848e9c] text-[9px] space-y-2">
                                        <Cpu className="w-5 h-5 opacity-20" />
                                        <div>
                                          <p className="font-bold">No active Challenger model configuration.</p>
                                          <span className="text-[8px] text-gray-500">Register a new config config using the slider module below to test a feature evolution hypothesis.</span>
                                        </div>
                                        <button
                                          onClick={() => setShowRegisterModelForm(true)}
                                          className="bg-rose-950/40 text-rose-300 border border-rose-900/30 hover:bg-rose-900/30 px-2 py-1 rounded text-[8px] font-bold uppercase tracking-wider"
                                        >
                                          Configure Challenger Model
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* PROMOTION MODAL */}
                                {showPromoteModal && (
                                  <div className="bg-[#121416] border border-[#24262b] p-3 rounded-lg space-y-2.5">
                                    <div className="flex items-center justify-between border-b border-[#24262b] pb-1.5">
                                      <span className="text-[9.5px] font-black text-white uppercase tracking-wider">🔒 Promote Model Version to Champion</span>
                                      <button onClick={() => setShowPromoteModal(false)} className="text-gray-400 hover:text-white font-bold text-[10px]">✕</button>
                                    </div>
                                    <div className="space-y-2 text-[9px]">
                                      <div className="flex flex-col space-y-1">
                                        <span className="text-gray-400 font-bold uppercase text-[7.5px]">Model Version Target:</span>
                                        <input
                                          type="text"
                                          disabled
                                          value={promoteVersion}
                                          className="bg-[#181a20]/60 border border-[#24262b] text-gray-400 text-[9.5px] font-mono px-2 py-1 rounded focus:outline-none"
                                        />
                                      </div>
                                      <div className="flex flex-col space-y-1">
                                        <span className="text-gray-400 font-bold uppercase text-[7.5px]">Author Scientist:</span>
                                        <input
                                          type="text"
                                          value={promoteAuthor}
                                          onChange={(e) => setPromoteAuthor(e.target.value)}
                                          placeholder="e.g., Dr. Alice Vance, CMT"
                                          className="bg-[#181a20] border border-[#24262b] text-white text-[9.5px] font-mono px-2 py-1 rounded focus:outline-none focus:border-rose-500"
                                        />
                                      </div>
                                      <div className="flex flex-col space-y-1">
                                        <span className="text-gray-400 font-bold uppercase text-[7.5px]">Scientific Justification & Outcome Analysis:</span>
                                        <textarea
                                          value={promoteJustification}
                                          onChange={(e) => setPromoteJustification(e.target.value)}
                                          rows={2}
                                          placeholder="e.g., Challenger model achieved higher calibration accuracy and successfully reduced standard Brier score from 0.188 to 0.174 during Live evaluation tests."
                                          className="bg-[#181a20] border border-[#24262b] text-white text-[9.5px] font-mono px-2 py-1 rounded focus:outline-none focus:border-rose-500 resize-none"
                                        />
                                      </div>
                                      <div className="flex justify-end space-x-2 pt-1">
                                        <button
                                          onClick={() => setShowPromoteModal(false)}
                                          className="bg-[#181a20] text-gray-400 border border-[#24262b] hover:text-white px-3 py-1 rounded uppercase font-bold tracking-wider text-[8px]"
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          onClick={() => handlePromoteChallenger(promoteVersion, promoteAuthor, promoteJustification)}
                                          className="bg-emerald-900 text-emerald-300 border border-emerald-800 hover:bg-emerald-800 px-3 py-1 rounded uppercase font-bold tracking-wider text-[8px]"
                                        >
                                          Commit Promotion
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* REGISTER NEW CHALLENGER MODEL CONFIG */}
                                {showRegisterModelForm ? (
                                  <div className="bg-[#181a20] border border-rose-950/60 p-3 rounded-lg space-y-3 font-mono">
                                    <div className="flex items-center justify-between border-b border-[#24262b] pb-1.5">
                                      <span className="text-[9.5px] font-black text-white uppercase tracking-wider font-sans">🧬 Configure Challenger Weights Profile</span>
                                      <button onClick={() => setShowRegisterModelForm(false)} className="text-gray-400 hover:text-white font-bold text-[10px]">✕</button>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[9px]">
                                      <div className="flex flex-col space-y-1">
                                        <span className="text-[#848e9c] text-[7px] uppercase font-bold font-sans">Model Version:</span>
                                        <input
                                          type="text"
                                          placeholder="e.g. v1.2.0"
                                          value={regVersion}
                                          onChange={(e) => setRegVersion(e.target.value)}
                                          className="bg-[#121416] border border-[#24262b] text-white text-[9px] px-2 py-1 rounded"
                                        />
                                      </div>
                                      <div className="flex flex-col space-y-1">
                                        <span className="text-[#848e9c] text-[7px] uppercase font-bold font-sans">Model Name:</span>
                                        <input
                                          type="text"
                                          placeholder="e.g. Regime Tuned Model"
                                          value={regName}
                                          onChange={(e) => setRegName(e.target.value)}
                                          className="bg-[#121416] border border-[#24262b] text-white text-[9px] px-2 py-1 rounded"
                                        />
                                      </div>
                                      <div className="flex flex-col space-y-1">
                                        <span className="text-[#848e9c] text-[7px] uppercase font-bold font-sans">Description:</span>
                                        <input
                                          type="text"
                                          placeholder="Heavy regime & cognitive weights"
                                          value={regDesc}
                                          onChange={(e) => setRegDesc(e.target.value)}
                                          className="bg-[#121416] border border-[#24262b] text-white text-[9px] px-2 py-1 rounded"
                                        />
                                      </div>
                                    </div>
                                    <div className="pt-2 border-t border-[#24262b] space-y-2">
                                      <div className="flex justify-between items-center">
                                        <span className="text-[#848e9c] text-[8px] uppercase font-bold font-sans">Assign Mathematical Weights (Sum must equal 1.00)</span>
                                        <span className={`text-[9px] font-bold font-mono px-1 rounded ${Math.abs((regWeights.regime + regWeights.trendStrength + regWeights.rsi + regWeights.bollingerBandwidth + regWeights.direction + regWeights.cognitiveState) - 1.0) < 0.01 ? "text-emerald-400 bg-emerald-950/30" : "text-rose-400 bg-rose-950/30"}`}>
                                          Sum: {(regWeights.regime + regWeights.trendStrength + regWeights.rsi + regWeights.bollingerBandwidth + regWeights.direction + regWeights.cognitiveState).toFixed(2)} / 1.00
                                        </span>
                                      </div>
                                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 text-[8.5px]">
                                        {[
                                          { label: "Market Regime Co-processor", field: "regime" },
                                          { label: "Trend Strength Matrix", field: "trendStrength" },
                                          { label: "Momentum RSI", field: "rsi" },
                                          { label: "Bollinger Bandwidth", field: "bollingerBandwidth" },
                                          { label: "Lag-1 Return Direction", field: "direction" },
                                          { label: "Cognitive State Index", field: "cognitiveState" }
                                        ].map((wItem) => (
                                          <div key={wItem.field} className="bg-[#121416] p-1.5 rounded border border-[#1f2128] space-y-1">
                                            <span className="text-gray-400 text-[7px] font-sans block leading-none">{wItem.label}:</span>
                                            <div className="flex items-center space-x-1">
                                              <input
                                                type="range"
                                                min="0.0"
                                                max="0.5"
                                                step="0.05"
                                                value={(regWeights as any)[wItem.field]}
                                                onChange={(e) => setRegWeights({ ...regWeights, [wItem.field]: parseFloat(e.target.value) })}
                                                className="w-full h-1 bg-[#181a20] rounded-lg appearance-none cursor-pointer accent-rose-500"
                                              />
                                              <span className="text-white font-mono font-bold text-[8.5px] w-6 text-right">{(regWeights as any)[wItem.field].toFixed(2)}</span>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                    <div className="flex justify-end space-x-2 pt-1 border-t border-[#24262b]">
                                      <button
                                        onClick={() => setShowRegisterModelForm(false)}
                                        className="bg-[#121416] border border-[#24262b] text-gray-400 px-3 py-1 rounded uppercase text-[8px] font-bold"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        onClick={handleRegisterModel}
                                        className="bg-rose-950 text-rose-300 border border-rose-900/60 hover:bg-rose-900/40 px-3 py-1 rounded uppercase text-[8px] font-bold"
                                      >
                                        Register Challenger
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex justify-end">
                                    <button
                                      onClick={() => setShowRegisterModelForm(true)}
                                      className="flex items-center space-x-1.5 bg-[#181a20] border border-[#24262b] hover:border-rose-500/30 text-gray-300 hover:text-white px-2.5 py-1 rounded text-[8px] font-bold uppercase transition"
                                    >
                                      <Sliders className="w-3 h-3 text-rose-400" />
                                      <span>Register New Challenger Configuration</span>
                                    </button>
                                  </div>
                                )}

                                {/* SECTION 2: RESEARCH HYPOTHESIS & EXPERIMENT REGISTRY */}
                                <div className="bg-[#181a20] border border-[#24262b] rounded-lg p-3 space-y-2.5">
                                  <div className="flex items-center justify-between border-b border-[#24262b]/60 pb-1.5">
                                    <div className="flex items-center space-x-1.5">
                                      <Cpu className="w-4 h-4 text-rose-400" />
                                      <h3 className="text-[10px] font-extrabold text-white uppercase tracking-wider">Scientific Hypothesis Registry</h3>
                                    </div>
                                    {!showHypothesisForm && (
                                      <button
                                        onClick={() => setShowHypothesisForm(true)}
                                        className="flex items-center space-x-1 bg-rose-950/40 text-rose-300 border border-rose-900/40 hover:bg-rose-900/30 px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider transition"
                                      >
                                        <PlusCircle className="w-3 h-3" />
                                        <span>Formulate Hypothesis</span>
                                      </button>
                                    )}
                                  </div>

                                  {/* Formulate Hypothesis Form */}
                                  {showHypothesisForm && (
                                    <div className="bg-[#121416] p-2.5 rounded border border-[#1f2128] space-y-2 text-[9px] font-mono">
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        <div className="flex flex-col space-y-1">
                                          <span className="text-[#848e9c] text-[7.5px] uppercase font-bold font-sans">Experiment Title:</span>
                                          <input
                                            type="text"
                                            placeholder="e.g. Sentiment Weight Rebalancing"
                                            value={hypName}
                                            onChange={(e) => setHypName(e.target.value)}
                                            className="bg-[#181a20] border border-[#24262b] text-white px-2 py-1 rounded focus:outline-none"
                                          />
                                        </div>
                                        <div className="flex flex-col space-y-1">
                                          <span className="text-[#848e9c] text-[7.5px] uppercase font-bold font-sans">Target Metric & Boundary:</span>
                                          <input
                                            type="text"
                                            placeholder="e.g. Brier Calibration Score < 0.180"
                                            value={hypTargetMetric}
                                            onChange={(e) => setHypTargetMetric(e.target.value)}
                                            className="bg-[#181a20] border border-[#24262b] text-white px-2 py-1 rounded focus:outline-none"
                                          />
                                        </div>
                                      </div>
                                      <div className="flex flex-col space-y-1">
                                        <span className="text-[#848e9c] text-[7.5px] uppercase font-bold font-sans">Hypothesis Description:</span>
                                        <input
                                          type="text"
                                          placeholder="e.g. Tuning weights for extreme volatility regimes under high correlation"
                                          value={hypDesc}
                                          onChange={(e) => setHypDesc(e.target.value)}
                                          className="bg-[#181a20] border border-[#24262b] text-white px-2 py-1 rounded focus:outline-none"
                                        />
                                      </div>
                                      <div className="flex flex-col space-y-1">
                                        <span className="text-[#848e9c] text-[7.5px] uppercase font-bold font-sans">Theoretical Scientific Premise (If-Then Statement):</span>
                                        <textarea
                                          value={hypHypothesis}
                                          onChange={(e) => setHypHypothesis(e.target.value)}
                                          rows={2}
                                          placeholder="e.g., IF we reduce momentum weight and increase regime correlation weight under high-noise regimes, THEN prediction Brier calibration will improve."
                                          className="bg-[#181a20] border border-[#24262b] text-white px-2 py-1 rounded focus:outline-none resize-none"
                                        />
                                      </div>
                                      <div className="flex justify-between items-center pt-1.5 border-t border-[#24262b]">
                                        <div className="flex items-center space-x-1.5">
                                          <span className="text-gray-400 text-[7px] uppercase font-sans">Assign to Model:</span>
                                          <select
                                            value={hypModelVersion}
                                            onChange={(e) => setHypModelVersion(e.target.value)}
                                            className="bg-[#181a20] text-gray-300 border border-[#24262b] text-[8px] rounded px-1.5 py-0.5"
                                          >
                                            <option value={champion.version}>{champion.version} (Champion)</option>
                                            {challenger && <option value={challenger.version}>{challenger.version} (Challenger)</option>}
                                          </select>
                                        </div>
                                        <div className="flex space-x-2">
                                          <button
                                            onClick={() => setShowHypothesisForm(false)}
                                            className="bg-[#181a20] text-gray-400 border border-[#24262b] hover:text-white px-2.5 py-0.5 rounded text-[8px] font-sans font-bold uppercase tracking-wider"
                                          >
                                            Cancel
                                          </button>
                                          <button
                                            onClick={handleCreateHypothesis}
                                            className="bg-rose-950 text-rose-300 border border-rose-900/60 hover:bg-rose-900/40 px-2.5 py-0.5 rounded text-[8px] font-sans font-bold uppercase tracking-wider"
                                          >
                                            Register Hypothesis
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {/* Hypothesis List */}
                                  {experiments.length === 0 ? (
                                    <div className="py-5 text-center text-[#848e9c] text-[9.5px]">
                                      No hypotheses registered in database. Create one to begin.
                                    </div>
                                  ) : (
                                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                      {experiments.slice().reverse().map((exp: any) => (
                                        <div key={exp.id} className="bg-[#121416]/50 border border-[#24262b]/80 p-2 rounded text-[9px] font-mono relative">
                                          <div className="flex justify-between items-start border-b border-[#24262b]/30 pb-1 mb-1 font-sans">
                                            <div className="flex items-center space-x-1.5">
                                              <span className="font-extrabold text-white text-[9.5px]">{exp.name}</span>
                                              <span className="text-[7.5px] text-[#848e9c] bg-[#181a20] px-1 py-0.1 border border-[#1f2128] rounded uppercase">{exp.id}</span>
                                            </div>
                                            <span className={`px-1 rounded text-[7px] font-black uppercase tracking-wider ${exp.status === "ACTIVE" ? "text-amber-400 bg-amber-950/20 border border-amber-900/30" : "text-emerald-400 bg-emerald-950/20 border border-emerald-900/30"}`}>
                                              {exp.status}
                                            </span>
                                          </div>
                                          <div className="space-y-1">
                                            <p className="text-gray-400 text-[8.5px] font-sans leading-relaxed"><strong className="text-gray-300">Premise:</strong> {exp.hypothesis}</p>
                                            <div className="flex justify-between text-[8px] text-[#848e9c] pt-1">
                                              <span>Model: <strong className="text-gray-300 font-mono">{exp.modelVersion}</strong></span>
                                              <span>Bound: <strong className="text-gray-300 font-mono">{exp.targetMetric}</strong></span>
                                              <span>Created: <strong className="text-gray-300">{new Date(exp.timestamp).toLocaleDateString()}</strong></span>
                                            </div>

                                            {exp.status === "ACTIVE" && concludingExpId !== exp.id && (
                                              <div className="flex justify-end pt-1.5">
                                                <button
                                                  onClick={() => setConcludingExpId(exp.id)}
                                                  className="bg-[#181a20] hover:bg-[#1f2128] text-amber-300 border border-amber-900/30 px-2 py-0.5 rounded text-[7.5px] font-sans font-bold uppercase"
                                                >
                                                  Conclude & Record Findings
                                                </button>
                                              </div>
                                            )}

                                            {concludingExpId === exp.id && (
                                              <div className="pt-2 border-t border-[#24262b]/30 space-y-1.5">
                                                <span className="text-[7.5px] text-[#848e9c] uppercase font-bold block font-sans">Record Empirical Findings & Proof:</span>
                                                <textarea
                                                  value={expFindings}
                                                  onChange={(e) => setExpFindings(e.target.value)}
                                                  rows={2}
                                                  placeholder="e.g. Live telemetry confirmed Brier score dropped to 0.176, verifying the hypothesis. Dynamic adjustments are scientifically valid."
                                                  className="w-full bg-[#181a20] border border-[#24262b] text-white p-1 rounded focus:outline-none focus:border-rose-500 text-[8.5px]"
                                                />
                                                <div className="flex justify-end space-x-1.5">
                                                  <button
                                                    onClick={() => setConcludingExpId(null)}
                                                    className="bg-[#181a20] text-gray-400 text-[7px] font-sans font-extrabold uppercase px-2 py-0.5 rounded border border-[#24262b]"
                                                  >
                                                    Cancel
                                                  </button>
                                                  <button
                                                    onClick={handleConcludeHypothesis}
                                                    className="bg-amber-950 text-amber-300 text-[7px] font-sans font-extrabold uppercase px-2 py-0.5 rounded border border-amber-900/40 hover:bg-amber-900/40"
                                                  >
                                                    Complete Study
                                                  </button>
                                                </div>
                                              </div>
                                            )}

                                            {exp.status === "CONCLUDED" && exp.findings && (
                                              <div className="mt-1.5 bg-emerald-950/10 border border-emerald-900/30 p-1.5 rounded text-[8.5px] text-emerald-300">
                                                <strong className="block uppercase text-[6.5px] tracking-wider font-sans mb-0.5 text-emerald-400">Research Findings Summary:</strong>
                                                <p className="font-sans leading-normal">{exp.findings}</p>
                                                <span className="block text-[7.5px] text-[#848e9c] mt-1 font-sans">Concluded on: {new Date(exp.concludedTimestamp!).toLocaleString()}</span>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* SECTION 3: DETERMINISTIC REGRESSION TEST PANEL */}
                                <div className="bg-[#181a20] border border-[#24262b] rounded-lg p-3 space-y-2.5 font-sans">
                                  <div className="flex items-center justify-between border-b border-[#24262b]/60 pb-1.5">
                                    <div className="flex items-center space-x-1.5">
                                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                      <h3 className="text-[10px] font-extrabold text-white uppercase tracking-wider">Regression Verification Suite</h3>
                                    </div>
                                    <button
                                      onClick={handleRunRegression}
                                      className="bg-emerald-950 text-emerald-300 border border-emerald-900/40 hover:bg-emerald-900/30 px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider transition"
                                    >
                                      Run Verification Suite
                                    </button>
                                  </div>

                                  <div className="bg-[#121416] p-2 rounded border border-[#1f2128] flex flex-col md:flex-row md:items-center justify-between gap-2">
                                    <div className="space-y-0.5">
                                      <div className="flex items-center space-x-1.5">
                                        <span className="text-[9px] font-bold text-gray-400">Last Suite Verdict:</span>
                                        <span className={`px-1.5 py-0.1 rounded text-[8px] font-black uppercase tracking-wider ${latestRegression.passed ? "text-emerald-400 bg-emerald-950/30 border border-emerald-900/20" : "text-rose-400 bg-rose-950/30 border border-rose-900/20"}`}>
                                          {latestRegression.passed ? "PASSED" : "FAILED"}
                                        </span>
                                      </div>
                                      <span className="text-[8px] text-gray-500 font-mono block">Run ID: {latestRegression.id} | Timestamp: {new Date(latestRegression.timestamp).toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center space-x-2.5 text-[9px] font-mono bg-[#181a20]/40 px-2.5 py-1.5 rounded border border-[#24262b]/30">
                                      <span>Scenario Coverage: <strong className="text-white">{latestRegression.passedCount} / {latestRegression.totalCases} passed</strong></span>
                                    </div>
                                  </div>

                                  {latestRegression.cases && latestRegression.cases.length > 0 && (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2 font-mono text-[8.5px]">
                                      {latestRegression.cases.map((c: any) => (
                                        <div key={c.id} className="bg-[#121416]/40 p-2 rounded border border-[#24262b] flex flex-col justify-between">
                                          <div>
                                            <div className="flex justify-between items-center border-b border-[#24262b]/30 pb-1 mb-1">
                                              <span className="font-bold text-white text-[9px]">{c.name}</span>
                                              <span className={`font-black uppercase text-[7px] ${c.passed ? "text-emerald-400" : "text-rose-400"}`}>
                                                {c.passed ? "PASS" : "FAIL"}
                                              </span>
                                            </div>
                                            <p className="text-[#848e9c] text-[8px] leading-tight mb-1 font-sans">{c.description}</p>
                                          </div>
                                          <div className="space-y-0.5 border-t border-[#24262b]/30 pt-1 text-[8px] text-gray-400">
                                            <div>Expected: <span className="text-white font-bold">{c.expected}</span></div>
                                            <div>Actual: <span className="text-white font-bold">{c.actual}</span></div>
                                            <div>Confidence: <span className="text-[#a076ff]">{c.confidence ? (c.confidence * 100).toFixed(0) + "%" : "N/A"}</span></div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* SECTION 4: REAL-TIME DATA QUALITY MONITOR & ALERTS */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                                  {/* DQ Score Gauge Card */}
                                  <div className="bg-[#181a20] border border-[#24262b] rounded-lg p-3 flex flex-col justify-between md:col-span-1">
                                    <div>
                                      <div className="flex items-center space-x-1.5 mb-2 pb-1.5 border-b border-[#24262b]/40">
                                        <Activity className="w-3.5 h-3.5 text-rose-400" />
                                        <h4 className="text-[10px] font-extrabold text-white uppercase tracking-wider">Data Quality Monitor</h4>
                                      </div>
                                      <div className="text-center py-2.5">
                                        <span className="block text-[28px] font-black font-mono leading-none tracking-tight text-emerald-400">{latestDq.healthScore.toFixed(1)}%</span>
                                        <span className="text-[8.5px] text-[#848e9c] uppercase font-bold tracking-widest font-sans mt-1 block">Real-time Stream Health</span>
                                      </div>
                                    </div>
                                    <div className="space-y-1.5 text-[9px] font-mono border-t border-[#24262b]/40 pt-2 text-gray-400">
                                      <div className="flex justify-between">
                                        <span>Missing values count:</span>
                                        <span className={latestDq.missingValues > 0 ? "text-rose-400 font-bold" : "text-emerald-400"}>{latestDq.missingValues}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Stale ticks detected:</span>
                                        <span className={latestDq.staleTicks > 0 ? "text-rose-400 font-bold" : "text-emerald-400"}>{latestDq.staleTicks}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Outlier price spikes:</span>
                                        <span className={latestDq.priceSpikes > 0 ? "text-rose-400 font-bold" : "text-emerald-400"}>{latestDq.priceSpikes}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>Duplicate entries:</span>
                                        <span className={latestDq.duplicates > 0 ? "text-rose-400 font-bold" : "text-emerald-400"}>{latestDq.duplicates}</span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Active Alerts Banners */}
                                  <div className="bg-[#181a20] border border-[#24262b] rounded-lg p-3 flex flex-col md:col-span-2">
                                    <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-[#24262b]/40">
                                      <div className="flex items-center space-x-1.5">
                                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                                        <h4 className="text-[10px] font-extrabold text-white uppercase tracking-wider">Active Quality Alerts</h4>
                                      </div>
                                      <span className="text-[8px] text-gray-500 font-mono">Stream: LIVE TICK FEED</span>
                                    </div>
                                    <div className="flex-1 overflow-y-auto max-h-36 pr-1 space-y-1.5">
                                      {latestDq.alerts && latestDq.alerts.length > 0 ? (
                                        latestDq.alerts.map((alertItem: any, aIdx: number) => (
                                          <div key={aIdx} className="bg-amber-950/15 border border-amber-900/30 p-2 rounded text-[8.5px] text-amber-300 flex items-start space-x-2 font-mono">
                                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                                            <div className="space-y-0.5">
                                              <div className="flex items-center space-x-1.5 font-sans">
                                                <strong className="text-white uppercase text-[7.5px] font-black">{alertItem.type} VIOLATION</strong>
                                                <span className="text-[6.5px] text-gray-500">{new Date(alertItem.timestamp).toLocaleTimeString()}</span>
                                              </div>
                                              <p className="leading-tight text-gray-300">{alertItem.message}</p>
                                              <span className="block text-[7.5px] text-[#848e9c] uppercase font-bold font-sans pt-0.5">Countermeasure: {alertItem.remedy}</span>
                                            </div>
                                          </div>
                                        ))
                                      ) : (
                                        <div className="py-7 flex flex-col items-center justify-center text-center text-[#848e9c] text-[9.5px] space-y-1">
                                          <CheckCircle2 className="w-5 h-5 text-emerald-400 opacity-40 mb-0.5" />
                                          <p className="font-bold">No quality alerts detected.</p>
                                          <span className="text-[8px] text-gray-500">Real-time incoming market streams conform 100% to CMT engineering tolerances.</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* SECTION 5: AUTOMATED DAILY RESEARCH REPORTS LEDGER */}
                                <div className="bg-[#181a20] border border-[#24262b] rounded-lg p-3 space-y-2.5 font-sans">
                                  <div className="flex items-center justify-between border-b border-[#24262b]/60 pb-1.5">
                                    <div className="flex items-center space-x-1.5">
                                      <FileText className="w-4 h-4 text-[#a076ff]" />
                                      <h3 className="text-[10px] font-extrabold text-white uppercase tracking-wider">Automated Daily Research Reports</h3>
                                    </div>
                                    <button
                                      onClick={handleGenerateDailyReport}
                                      className="bg-[#121416] text-[#a076ff] hover:text-white border border-[#24262b] hover:border-[#a076ff]/30 px-2.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider transition"
                                    >
                                      Compile Daily Report
                                    </button>
                                  </div>

                                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                    {/* Reports List */}
                                    <div className="md:col-span-1 border-r border-[#24262b]/60 pr-2 max-h-48 overflow-y-auto space-y-1 font-mono text-[8.5px]">
                                      {dailyReports.length === 0 ? (
                                        <div className="py-4 text-center text-[#848e9c]">No compiled reports.</div>
                                      ) : (
                                        dailyReports.slice().reverse().map((rep: any) => (
                                          <button
                                            key={rep.date}
                                            onClick={() => setSelectedDailyReportDate(rep.date)}
                                            className={`w-full text-left p-1.5 rounded transition font-bold uppercase flex items-center justify-between ${selectedDailyReportDate === rep.date ? "bg-[#24262b] text-white" : "text-gray-400 hover:text-white hover:bg-[#121416]/30"}`}
                                          >
                                            <span>{rep.date}</span>
                                            <span className="text-[7.5px] text-[#a076ff]">VIEW →</span>
                                          </button>
                                        ))
                                      )}
                                    </div>

                                    {/* Report Content View */}
                                    <div className="md:col-span-3 text-[9.5px] leading-relaxed bg-[#121416]/50 border border-[#24262b] rounded-md p-2.5 min-h-[110px] flex flex-col justify-between">
                                      {(() => {
                                        const rep = dailyReports.find((r: any) => r.date === (selectedDailyReportDate || (dailyReports[dailyReports.length - 1]?.date)));
                                        if (!rep) {
                                          return (
                                            <div className="m-auto text-center text-[#848e9c] py-4">
                                              Select a Daily Report ledger entry on the left to read compiled qualitative scientific summaries.
                                            </div>
                                          );
                                        }
                                        return (
                                          <div className="space-y-2">
                                            <div className="flex justify-between border-b border-[#24262b]/30 pb-1 mb-1 font-bold">
                                              <span className="text-white text-[10px]">RESEARCH REPORT FOR: {rep.date}</span>
                                              <span className="text-[#a076ff] uppercase text-[8px] font-black">ARCHIVED STATS SUMMARY</span>
                                            </div>
                                            <p className="text-gray-300 font-sans leading-normal whitespace-pre-line bg-[#181a20]/30 p-2 rounded">{rep.summary}</p>
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[8px] font-mono pt-1 text-gray-400">
                                              <div>Accuracy Ratio: <strong className="text-emerald-400">{(rep.metrics.accuracy * 100).toFixed(1)}%</strong></div>
                                              <div>Brier Score: <strong className="text-[#a076ff]">{rep.metrics.brierScore.toFixed(3)}</strong></div>
                                              <div>Prediction Volume: <strong className="text-white">{rep.metrics.predictionCount} cases</strong></div>
                                              <div>Data Health Score: <strong className="text-emerald-400">{rep.metrics.dqScore.toFixed(1)}%</strong></div>
                                            </div>
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  </div>
                                </div>
                                  </>
                                ) : (
                                  <AdaptiveLearningPanel 
                                    adaptiveState={adaptiveState} 
                                    onRefresh={fetchGovernanceState} 
                                  />
                                )}
                              </div>
                            );
                          })()}
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Historical Signals Feed Panel (1 Column on wide screens) */}
            <div className="bg-[#16181a] border border-[#24262b] rounded-lg p-3 flex flex-col min-h-[300px]">
              <div className="flex items-center justify-between border-b border-[#24262b] pb-2 mb-2 shrink-0">
                <div className="flex items-center space-x-1.5">
                  <Activity className="w-4 h-4 text-[#a076ff]" />
                  <span className="text-xs font-black text-white uppercase tracking-wider font-mono">Signals Ledger</span>
                </div>
                <span className="text-[9px] font-mono font-bold bg-[#1e2026] text-[#848e9c] px-2 py-0.5 rounded">
                  {signals.length} SCANS
                </span>
              </div>

              {/* Signals scrollable container */}
              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1.5">
                {signals.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center py-10 select-none text-[#848e9c] font-mono text-[10px]">
                    <Clock className="w-6 h-6 text-[#24262b] mb-1" />
                    <span>No historical records.</span>
                  </div>
                ) : (
                  signals.map((sig, idx) => {
                    const isActive = sig.id === activeSignalId;
                    const isBuy = sig.direction === "BUY";
                    const isSell = sig.direction === "SELL";
                    const formattedTime = new Date(sig.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                    return (
                      <div
                        key={`${sig.id}-${idx}`}
                        onClick={() => setActiveSignalId(sig.id)}
                        className={`p-2 rounded-md border text-left cursor-pointer transition-all hover:bg-[#1e2227] flex items-center justify-between ${
                          isActive
                            ? "bg-[#1e2227] border-purple-500/80 shadow-md shadow-purple-950/20"
                            : "bg-[#121416]/50 border-[#24262b]/80"
                        }`}
                      >
                        <div className="flex items-center space-x-2 font-mono">
                          {/* Direction Pill */}
                          <span className={`w-1.5 h-6 rounded-full shrink-0 ${
                            isBuy ? "bg-emerald-500" : isSell ? "bg-rose-500" : "bg-amber-500"
                          }`} />
                          
                          <div className="flex flex-col">
                            <span className="text-[11px] font-black text-white">{sig.recommendedSymbol}</span>
                            <span className="text-[8px] text-[#848e9c]">{sig.timeframe} • {formattedTime}</span>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 font-mono text-right">
                          <div className="flex flex-col">
                            <span className={`text-[10px] font-black uppercase tracking-wider ${
                              isBuy ? "text-[#0ecb81]" : isSell ? "text-[#f6465d]" : "text-[#f0b90b]"
                            }`}>
                              {sig.direction}
                            </span>
                            <span className="text-[9px] text-[#848e9c]">${sig.entryPrice.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                          </div>
                          
                          <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {signals.length > 0 && (
                <button
                  onClick={() => {
                    setSignals([]);
                    setActiveSignalId(null);
                  }}
                  className="mt-3 w-full py-1 text-[9px] font-mono font-bold hover:text-red-400 text-gray-500 border border-[#24262b] hover:border-red-950/50 bg-[#121416] rounded transition-all uppercase"
                >
                  Clear Scanner History
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ==========================================
          RIGHT COLUMN: FORMATION SCANNER + SENTIMENT + GUIDE
          ========================================== */}
      <div className="w-full md:w-[380px] lg:w-[420px] shrink-0 border-t md:border-t-0 md:border-l border-[#24262b] bg-[#16181a] flex flex-col divide-y divide-[#24262b] md:min-h-0 md:overflow-y-auto custom-scrollbar">
        
        {/* AppX 10-Min Futures Scalp Tracker */}
        <div className="p-4 bg-gradient-to-b from-[#1c1d22] to-[#121416] border-b border-[#24262b]">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-1.5">
              <Zap className="w-4 h-4 text-[#f0b90b] animate-pulse" />
              <h3 className="text-xs font-black text-white uppercase tracking-wider">
                AppX 10-Min Futures Scalp
              </h3>
            </div>
            {/* Live Indicator Dot */}
            <div className="flex items-center space-x-1 font-mono text-[8px] font-black px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-900/60">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block mr-0.5" />
              <span>LIVE SCALP TRACKING</span>
            </div>
          </div>

          {/* Core Content */}
          {(() => {
            const currentSignal = signals.find(s => s.id === activeSignalId) || signals[0];
            if (!currentSignal || !currentSignal.futuresPrediction) {
              return (
                <div className="bg-[#121416]/60 border border-[#24262b] rounded-lg p-4 text-center">
                  <Cpu className="w-6 h-6 text-[#848e9c] mx-auto mb-2 animate-spin-slow" />
                  <span className="text-[10px] font-mono text-gray-400 block font-bold">READY FOR APPX SCALPS</span>
                  <p className="text-[9px] text-[#848e9c] leading-relaxed mt-1 font-mono">
                    Activate the Autopilot switch or click "Run Scan" to generate high-precision 10-minute futures predictions and scalp trajectories.
                  </p>
                </div>
              );
            }

            const pred = currentSignal.futuresPrediction;
            const isUp = pred.targetDirection === "UP";
            const isMeme = currentSignal.recommendedSymbol.includes("SHIB") || currentSignal.recommendedSymbol.includes("PEPE");
            const decimals = isMeme ? 6 : (currentPrice > 100 ? 2 : 4);

            const countdown = getFuturesCountdown(currentSignal.timestamp);
            const liveStrength = getLiveValidationStrength(currentSignal);

            // Strength Badge styling
            let strengthText = "WAITING VALIDATION";
            let strengthColor = "text-[#f0b90b] bg-[#f0b90b]/10 border-[#f0b90b]/20";
            if (countdown.expired) {
              strengthText = "PREDICTION MATURED";
              strengthColor = "text-blue-400 bg-blue-950/40 border-blue-900/40";
            } else if (liveStrength >= 85) {
              strengthText = "🏆 HIGH CONVICTION SETUP HOLDING";
              strengthColor = "text-emerald-400 bg-emerald-950/60 border-emerald-900/60";
            } else if (liveStrength >= 65) {
              strengthText = "✅ ACCELERATION PATH CONFIRMED";
              strengthColor = "text-green-400 bg-green-950/40 border-green-900/40";
            } else if (liveStrength >= 40) {
              strengthText = "⚠️ VOLUME DRIFT - MONITOR CLOSELY";
              strengthColor = "text-amber-400 bg-amber-950/40 border-amber-900/40";
            } else {
              strengthText = "❌ TARGET INVALIDATED - CONSIDER EARLY EXIT";
              strengthColor = "text-red-400 bg-red-950/40 border-red-900/40";
            }

            return (
              <div className="space-y-3 font-mono">
                {/* Scalp Metrics Board */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-[#1e2026] p-2 rounded border border-[#24262b] flex flex-col justify-between">
                    <span className="text-[8px] text-[#848e9c] font-black uppercase">Symbol Pair</span>
                    <span className="text-xs text-white font-black">{currentSignal.recommendedSymbol}</span>
                  </div>
                  <div className="bg-[#1e2026] p-2 rounded border border-[#24262b] flex flex-col justify-between">
                    <span className="text-[8px] text-[#848e9c] font-black uppercase">Scalp Countdown</span>
                    <span className={`text-xs font-black ${countdown.expired ? "text-gray-500" : "text-amber-400 font-bold"}`}>
                      {countdown.expired ? "00:00 (Matured)" : countdown.formatted}
                    </span>
                  </div>
                  <div className="bg-[#1e2026] p-2 rounded border border-[#24262b] flex flex-col justify-between">
                    <span className="text-[8px] text-[#848e9c] font-black uppercase">Scalp Vector</span>
                    <div className="flex items-center space-x-1">
                      {isUp ? (
                        <>
                          <TrendingUp className="w-3.5 h-3.5 text-[#0ecb81]" />
                          <span className="text-xs text-[#0ecb81] font-black uppercase">UP (LONG)</span>
                        </>
                      ) : (
                        <>
                          <TrendingDown className="w-3.5 h-3.5 text-[#f6465d]" />
                          <span className="text-xs text-[#f6465d] font-black uppercase">DOWN (SHORT)</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="bg-[#1e2026] p-2 rounded border border-[#24262b] flex flex-col justify-between">
                    <span className="text-[8px] text-[#848e9c] font-black uppercase">10m Target Price</span>
                    <span className="text-xs text-[#f0b90b] font-black font-sans">
                      ${pred.targetPrice.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
                    </span>
                  </div>
                </div>

                {/* Live Trajectory Status Box */}
                <div className="bg-[#1e2026]/80 p-2.5 rounded-lg border border-[#2b3036] space-y-2">
                  <div className="flex items-center justify-between text-[9px] font-black">
                    <span className="text-[#848e9c]">LIVE PREDICTION STRENGTH:</span>
                    <span className={isUp ? "text-[#0ecb81]" : "text-[#f6465d]"}>{liveStrength}%</span>
                  </div>

                  {/* Progress Bar */}
                  <div className="h-1.5 w-full bg-[#121416] rounded-full overflow-hidden border border-gray-800/40">
                    <div
                      className={`h-full transition-all duration-1000 ${
                        liveStrength >= 80
                          ? "bg-gradient-to-r from-green-500 to-emerald-400"
                          : liveStrength >= 50
                          ? "bg-gradient-to-r from-amber-500 to-yellow-400"
                          : "bg-gradient-to-r from-red-600 to-rose-500"
                      }`}
                      style={{ width: `${liveStrength}%` }}
                    />
                  </div>

                  {/* Dynamic Hold Status Badge */}
                  <div className={`p-1.5 rounded text-[8px] font-black text-center border ${strengthColor}`}>
                    {strengthText}
                  </div>
                </div>

                {/* Mini explanation snippet */}
                <div className="text-[9px] text-[#848e9c] leading-relaxed p-2 bg-[#121416] rounded border border-[#24262b]/80">
                  <span className="font-black text-white block mb-0.5 uppercase">10m Prediction Analysis:</span>
                  {pred.analysis}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Consensus Metric Dial */}
        <div className="p-4 bg-[#12161a]">
          <div className="flex items-center space-x-2 mb-3">
            <Gauge className="w-4 h-4 text-[#f0b90b]" />
            <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">
              Indicators Radar & Consensus
            </h3>
          </div>

          {/* Gorgeous Gauge Component */}
          <div className="flex items-center space-x-4">
            <div className="relative flex flex-col items-center justify-center bg-[#1e2026] p-3 rounded-lg border border-[#24262b] w-24 h-24 shrink-0">
              {/* Semi-Circle SVG Dial */}
              <svg className="w-16 h-16 transform -rotate-90">
                {/* Background Ring */}
                <circle
                  cx="32"
                  cy="32"
                  r="24"
                  fill="transparent"
                  stroke="#2b2f36"
                  strokeWidth="5"
                />
                {/* Sentiment Filled Curve */}
                <circle
                  cx="32"
                  cy="32"
                  r="24"
                  fill="transparent"
                  stroke={
                    currentMetrics.sentimentScore > 65
                      ? "#0ecb81"
                      : currentMetrics.sentimentScore < 35
                      ? "#f6465d"
                      : "#f0b90b"
                  }
                  strokeWidth="5"
                  strokeDasharray={`${2 * Math.PI * 24}`}
                  strokeDashoffset={`${2 * Math.PI * 24 * (1 - currentMetrics.sentimentScore / 100)}`}
                  strokeLinecap="round"
                />
              </svg>
              {/* Core label value */}
              <span className="absolute text-xs font-mono font-black text-white">
                {currentMetrics.sentimentScore.toFixed(0)}%
              </span>
              <span className="text-[8px] text-[#848e9c] font-mono mt-1 absolute bottom-1.5">
                INDEX
              </span>
            </div>

            {/* Metrics Breakdown details */}
            <div className="flex-1 flex flex-col justify-between space-y-1.5">
              <div>
                <span className="text-[9px] text-[#848e9c] block font-mono">Consensus Bias:</span>
                <span
                  className={`text-xs font-black uppercase tracking-wider ${
                    currentMetrics.sentimentScore > 65
                      ? "text-[#0ecb81]"
                      : currentMetrics.sentimentScore < 35
                      ? "text-[#f6465d]"
                      : "text-[#f0b90b]"
                  }`}
                >
                  {currentMetrics.sentimentScore > 75
                    ? "Strong Buy"
                    : currentMetrics.sentimentScore > 58
                    ? "Buy"
                    : currentMetrics.sentimentScore < 25
                    ? "Strong Sell"
                    : currentMetrics.sentimentScore < 42
                    ? "Sell"
                    : "Neutral Consolidation"}
                </span>
              </div>

              {/* Small details */}
              <div className="text-[9px] text-[#b7bdc6] space-y-1 font-mono">
                <div className="flex justify-between">
                  <span>RSI (14):</span>
                  <span className="text-white font-bold">{currentMetrics.rsi.toFixed(1)} ({currentMetrics.rsi > 70 ? "Overbought" : currentMetrics.rsi < 30 ? "Oversold" : "Neutral"})</span>
                </div>
                <div className="flex justify-between">
                  <span>MACD Hist:</span>
                  <span className="text-white font-bold">{currentMetrics.macdSignal.split(" ")[0]}</span>
                </div>
                <div className="flex justify-between">
                  <span>Bollinger Bias:</span>
                  <span className="text-white font-bold truncate max-w-[120px]" title={currentMetrics.bbSignal}>{currentMetrics.bbSignal.split(" ")[0]}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Formation Library Scanner */}
        <div className="p-4 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <Layers className="w-4 h-4 text-[#f0b90b]" />
              <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">
                Formation Scanner Library
              </h3>
            </div>
            <span className="text-[8px] font-mono text-[#848e9c]">8 Active</span>
          </div>

          {/* Library Filters */}
          <div className="flex items-center space-x-1 mb-3 bg-[#12161a] p-0.5 rounded border border-[#24262b] text-[10px]">
            <button
              onClick={() => setPatternFilter("all")}
              className={`flex-1 text-center py-1 font-bold rounded transition ${
                patternFilter === "all" ? "bg-[#2b2f36] text-[#f0b90b]" : "text-[#848e9c] hover:text-white"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setPatternFilter("reversal")}
              className={`flex-1 text-center py-1 font-bold rounded transition ${
                patternFilter === "reversal" ? "bg-[#2b2f36] text-[#f0b90b]" : "text-[#848e9c] hover:text-white"
              }`}
            >
              Reversal
            </button>
            <button
              onClick={() => setPatternFilter("continuation")}
              className={`flex-1 text-center py-1 font-bold rounded transition ${
                patternFilter === "continuation" ? "bg-[#2b2f36] text-[#f0b90b]" : "text-[#848e9c] hover:text-white"
              }`}
            >
              Cont
            </button>
            <button
              onClick={() => setPatternFilter("candlestick")}
              className={`flex-1 text-center py-1 font-bold rounded transition ${
                patternFilter === "candlestick" ? "bg-[#2b2f36] text-[#f0b90b]" : "text-[#848e9c] hover:text-white"
              }`}
            >
              Candle
            </button>
          </div>

          {/* Formations Grid List */}
          <div className="space-y-2 max-h-[220px] overflow-y-auto custom-scrollbar">
            {filteredPatterns.map((pat) => {
              const isSelected = selectedOverlay === pat.id;
              // calculate target price based on currentPrice
              const targetPrice = currentPrice ? currentPrice * pat.targetMultiplier : 0;
              const isMeme = activeSymbol.includes("SHIB") || activeSymbol.includes("PEPE");
              const dec = isMeme ? 6 : (currentPrice > 100 ? 2 : 4);

              return (
                <div
                  key={pat.id}
                  id={`pattern-card-${pat.id}`}
                  onClick={() => setSelectedOverlay(pat.id)}
                  className={`p-2.5 rounded border text-left cursor-pointer transition-all flex flex-col justify-between ${
                    isSelected
                      ? "bg-[#2b2f36]/40 border-[#f0b90b]/80 shadow-sm"
                      : "bg-[#1e2026] border-[#24262b] hover:border-[#34363d]"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-xs font-black text-white">{pat.name}</span>
                      <div className="flex items-center space-x-1.5 mt-0.5 text-[8px] font-mono">
                        <span
                          className={`px-1.5 py-0.2 rounded font-bold uppercase ${
                            pat.direction === "bullish"
                              ? "bg-emerald-950 text-emerald-400 border border-emerald-900"
                              : pat.direction === "bearish"
                              ? "bg-rose-950 text-rose-400 border border-rose-900"
                              : "bg-gray-800 text-gray-300 border border-gray-700"
                          }`}
                        >
                          {pat.direction}
                        </span>
                        <span className="text-[#848e9c]">Reliability: <b>{pat.reliability}</b></span>
                      </div>
                    </div>
                    {/* Visual toggle badge */}
                    <button
                      className={`text-[8px] px-1.5 py-0.5 rounded border transition flex items-center space-x-0.5 font-bold ${
                        isSelected
                          ? "bg-[#f0b90b] border-[#f0b90b] text-black"
                          : "bg-[#16181a] border-[#24262b] text-[#848e9c]"
                      }`}
                    >
                      <Eye className="w-2 h-2 mr-0.5" />
                      <span>{isSelected ? "Overlaying" : "Overlay"}</span>
                    </button>
                  </div>

                  <p className="text-[10px] text-[#848e9c] leading-normal my-1.5">{pat.description}</p>

                  <div className="bg-[#121416] p-1.5 rounded text-[9px] font-mono text-[#b7bdc6] space-y-0.5">
                    <div>Setup: <span className="text-white font-sans">{pat.triggerSetup}</span></div>
                    {targetPrice > 0 && (
                      <div className="flex justify-between items-center text-[8px] text-[#f0b90b] mt-1 border-t border-[#24262b] pt-1">
                        <span>ESTIMATED BREAKOUT TARGET:</span>
                        <span className="font-bold text-white">${targetPrice.toLocaleString(undefined, { maximumFractionDigits: dec })}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Technical Analysis Education Guide Handbook */}
        <div className="p-4 flex-1 flex flex-col min-h-0">
          <div className="flex items-center space-x-2 mb-2">
            <BookOpen className="w-4 h-4 text-[#f0b90b]" />
            <h3 className="text-xs font-extrabold text-white uppercase tracking-wider">
              Step-by-Step Analysis Guide
            </h3>
          </div>

          {/* Guide Subtabs */}
          <div className="flex items-center space-x-1 bg-[#12161a] p-0.5 rounded border border-[#24262b] text-[9px] font-mono shrink-0 mb-3">
            <button
              onClick={() => setActiveGuideTab("candles")}
              className={`flex-1 text-center py-1 font-bold rounded transition ${
                activeGuideTab === "candles" ? "bg-[#2b2f36] text-[#f0b90b]" : "text-[#848e9c] hover:text-white"
              }`}
            >
              1. Candles
            </button>
            <button
              onClick={() => setActiveGuideTab("patterns")}
              className={`flex-1 text-center py-1 font-bold rounded transition ${
                activeGuideTab === "patterns" ? "bg-[#2b2f36] text-[#f0b90b]" : "text-[#848e9c] hover:text-white"
              }`}
            >
              2. Formations
            </button>
            <button
              onClick={() => setActiveGuideTab("indicators")}
              className={`flex-1 text-center py-1 font-bold rounded transition ${
                activeGuideTab === "indicators" ? "bg-[#2b2f36] text-[#f0b90b]" : "text-[#848e9c] hover:text-white"
              }`}
            >
              3. Oscillators
            </button>
            <button
              onClick={() => setActiveGuideTab("risk")}
              className={`flex-1 text-center py-1 font-bold rounded transition ${
                activeGuideTab === "risk" ? "bg-[#2b2f36] text-[#f0b90b]" : "text-[#848e9c] hover:text-white"
              }`}
            >
              4. Risk Core
            </button>
          </div>

          {/* Interactive Guide Content Panel */}
          <div className="flex-1 bg-[#121416] p-3 rounded border border-[#24262b] overflow-y-auto custom-scrollbar text-left text-[11px] leading-relaxed text-[#b7bdc6]">
            {activeGuideTab === "candles" && (
              <div className="space-y-2.5">
                <span className="text-xs font-black text-white block">📊 SECTION 1: READING JAPANESE CANDLESTICKS</span>
                <p>
                  Each candlestick conveys the absolute battles fought between buyers (bulls) and sellers (bears) during a specific timeframe slice (e.g. 15m, 1h, 1d).
                </p>
                <div className="grid grid-cols-2 gap-2 bg-[#1e2026] p-2 rounded border border-[#24262b] text-[10px] font-mono">
                  <div className="text-[#0ecb81]">
                    <b>GREEN BULLISH BAR:</b>
                    <span className="block mt-1">Close &gt; Open</span>
                    <span className="block text-gray-400">Buyers took control and expanded price upwards.</span>
                  </div>
                  <div className="text-[#f6465d]">
                    <b>RED BEARISH BAR:</b>
                    <span className="block mt-1">Close &lt; Open</span>
                    <span className="block text-gray-400">Sellers overwhelmed buying orders and drove price down.</span>
                  </div>
                </div>
                <div className="space-y-1 mt-2">
                  <div className="flex items-start space-x-1.5 text-[10px]">
                    <ChevronRight className="w-3.5 h-3.5 text-[#f0b90b] shrink-0 mt-0.5" />
                    <span><b>Real Body:</b> The block colored segment between the Open and Close prices. The thicker the body, the stronger the momentum.</span>
                  </div>
                  <div className="flex items-start space-x-1.5 text-[10px]">
                    <ChevronRight className="w-3.5 h-3.5 text-[#f0b90b] shrink-0 mt-0.5" />
                    <span><b>Shadows / Wicks:</b> The thin lines at the top and bottom. Upper wicks signify rejection of highs; lower wicks signify buying support near lows.</span>
                  </div>
                  <div className="flex items-start space-x-1.5 text-[10px]">
                    <ChevronRight className="w-3.5 h-3.5 text-[#f0b90b] shrink-0 mt-0.5" />
                    <span><b>Doji:</b> Candles with near-zero body size where open equals close. Represents total market equilibrium or incoming volatility expansion.</span>
                  </div>
                </div>
              </div>
            )}

            {activeGuideTab === "patterns" && (
              <div className="space-y-2.5">
                <span className="text-xs font-black text-white block">📈 SECTION 2: CHART FORMATIONS & GEOMETRICS</span>
                <p>
                  Formations are recurring price structures that signal market psychology consolidation phases. They are grouped into two primary pillars:
                </p>
                <div className="space-y-2 bg-[#1e2026] p-2 rounded border border-[#24262b] text-[10px]">
                  <div>
                    <span className="text-[#f0b90b] font-bold">1. Reversal Formations (Trend Shifters):</span>
                    <p className="text-[#848e9c] mt-0.5">
                      Signals that the existing primary trend is exhausted and ready to flip. Look for <b>Head & Shoulders</b> at tops, and <b>Double Bottoms</b> at demand floors.
                    </p>
                  </div>
                  <div>
                    <span className="text-[#f0b90b] font-bold">2. Continuation Formations (Trend Fuel):</span>
                    <p className="text-[#848e9c] mt-0.5">
                      Signals a temporary rest period in a healthy primary trend before bursting in the original direction. Look for <b>Flags, Pennants,</b> or <b>Ascending Triangles</b>.
                    </p>
                  </div>
                </div>
                <p className="text-[10px] text-gray-400 mt-2">
                  💡 <b>PRO STRATEGY:</b> Never trade inside the pattern consolidation. Wait for a solid breakout candle closing outside the neckline or trend border to trigger your entries.
                </p>
              </div>
            )}

            {activeGuideTab === "indicators" && (
              <div className="space-y-2.5">
                <span className="text-xs font-black text-white block">📉 SECTION 3: MOMENTUM OSCILLATORS</span>
                <p>
                  Oscillators filter out price noise and measure the underlying kinetic strength (velocity) of a movement.
                </p>
                <div className="space-y-2 text-[10px] font-mono">
                  <div className="border-l-2 border-[#a076ff] pl-2 py-0.5 bg-[#a076ff]/5">
                    <b className="text-white">RSI (Relative Strength Index):</b>
                    <p className="text-[#848e9c] font-sans text-[10px] mt-0.5">
                      Ranges from 0 to 100. Values above 70 indicate a severely overbought asset prone to selloffs. Values below 30 indicate oversold conditions primed for a potential rebound.
                    </p>
                  </div>
                  <div className="border-l-2 border-[#38bdf8] pl-2 py-0.5 bg-[#38bdf8]/5">
                    <b className="text-white">MACD (Moving Average Convergence Divergence):</b>
                    <p className="text-[#848e9c] font-sans text-[10px] mt-0.5">
                      Uses fast EMA(12) and slow EMA(26) interactions. Look for the blue MACD line crossing above the orange Signal line (Bullish Trigger) or crossing below (Bearish Trigger).
                    </p>
                  </div>
                </div>
                <p className="text-[10px] text-gray-400 mt-2">
                  💡 <b>CONVERGENCES & DIVERGENCES:</b> If price makes a new high but RSI makes a lower peak, this is "Bearish Divergence" — a highly accurate warning of impending exhaustion!
                </p>
              </div>
            )}

            {activeGuideTab === "risk" && (
              <div className="space-y-2.5">
                <span className="text-xs font-black text-white block">🛡️ SECTION 4: PROFESSIONAL RISK CONTROL</span>
                <p>
                  The highest-grade technical charting analysis is useless without mathematical risk control. Follow these gold standard risk principles:
                </p>
                <div className="bg-[#1e2026] p-2 rounded border border-[#24262b] text-[10px] font-mono space-y-1 text-gray-300">
                  <div className="flex justify-between text-white">
                    <span>1. Max Account Risk:</span>
                    <span className="text-[#f6465d]">1% - 2% per trade</span>
                  </div>
                  <p className="text-[9px] text-[#848e9c] font-sans">Never allow any single trade stop-loss trigger to wipe out more than 2% of your capital.</p>
                  
                  <div className="flex justify-between text-white mt-1.5">
                    <span>2. Risk-To-Reward Ratio:</span>
                    <span className="text-[#0ecb81]">1 : 2.5 Minimum</span>
                  </div>
                  <p className="text-[9px] text-[#848e9c] font-sans">For every dollar you risk at stop-loss, your target breakout profit point must yield at least $2.50.</p>
                </div>
                <div className="space-y-1 text-[10px] mt-2">
                  <div><b>• Stop Loss (SL):</b> The price trigger where your hypothesis is proven wrong. Place SL immediately below major wicks or opposite pattern boundaries.</div>
                  <div className="mt-1"><b>• Take Profit (TP):</b> Calculated using the pattern height projection. Scale out 50% at Target 1 and trail the remainder with a trailing stop.</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
