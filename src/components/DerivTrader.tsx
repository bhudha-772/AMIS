import React, { useState, useEffect, useRef } from "react";
import {
  TrendingUp,
  TrendingDown,
  Info,
  Clock,
  Coins,
  ArrowRight,
  RefreshCw,
  Award,
  History,
  CheckCircle,
  XCircle,
  HelpCircle,
  Sliders,
  DollarSign,
  AlertCircle,
  Key,
  LogOut,
  User,
  Shield,
  Lightbulb,
  Sparkles,
  ArrowUpRight,
  Lock,
  X,
  Brain,
  BookOpen
} from "lucide-react";
import { runVolumeProfileAnalysis } from "../smcEngine";
import type { VolumeProfileAnalysis } from "../strategyTypes";
import { buildCandlesFromTicks } from "../unifiedCandles";

// Types for Machine Learning Insight
interface LearnedInsight {
  id: string;
  timestamp: number;
  symbol: string;
  tradeType: "Higher" | "Lower";
  status: "WON" | "LOST";
  lossStreakBefore: number;
  insightText: string;
  ruleCreated: string;
}

// Types for Deriv WebSocket Tick
interface DerivTick {
  ask: number;
  bid: number;
  epoch: number;
  id: string;
  pip_size: number;
  quote: number;
  symbol: string;
}

// Deriv Asset definition
interface DerivAsset {
  symbol: string;
  name: string;
  category: "Volatility Indices" | "Daily Reset Indices";
}

// Active Contract definition
interface DerivContract {
  id: string;
  symbol: string;
  symbolName: string;
  type: "Higher" | "Lower";
  stake: number;
  payout: number;
  barrierOffset: number;
  entryPrice: number;
  barrierPrice: number;
  durationTicks: number;
  durationMinutes: number;
  durationType: "ticks" | "minutes";
  ticksCollected: { tick: number; epoch: number }[];
  status: "PENDING" | "OPEN" | "WON" | "LOST";
  pendingMessage?: string;
  exitPrice?: number;
  createdAt: number;
  ticksRemaining: number;
  secondsRemaining?: number;
  learningAnalysis?: any;
}

const SUPPORTED_ASSETS: DerivAsset[] = [
  { symbol: "R_10", name: "Volatility 10 Index", category: "Volatility Indices" },
  { symbol: "R_25", name: "Volatility 25 Index", category: "Volatility Indices" },
  { symbol: "R_50", name: "Volatility 50 Index", category: "Volatility Indices" },
  { symbol: "R_75", name: "Volatility 75 Index", category: "Volatility Indices" },
  { symbol: "R_100", name: "Volatility 100 Index", category: "Volatility Indices" },
  { symbol: "1HZ10V", name: "Volatility 10 (1s) Index", category: "Volatility Indices" },
  { symbol: "1HZ25V", name: "Volatility 25 (1s) Index", category: "Volatility Indices" },
  { symbol: "1HZ50V", name: "Volatility 50 (1s) Index", category: "Volatility Indices" },
  { symbol: "1HZ75V", name: "Volatility 75 (1s) Index", category: "Volatility Indices" },
  { symbol: "1HZ100V", name: "Volatility 100 (1s) Index", category: "Volatility Indices" },
  { symbol: "RDBULL", name: "Bull Market Index", category: "Daily Reset Indices" },
  { symbol: "RDBEAR", name: "Bear Market Index", category: "Daily Reset Indices" },
];

export function DerivTrader() {
  // Demo & Real API Tokens and Account States
  const [demoToken, setDemoToken] = useState<string>(() => {
    return localStorage.getItem("deriv_demo_token") || "";
  });
  const [realToken, setRealToken] = useState<string>(() => {
    return localStorage.getItem("deriv_real_token") || "";
  });
  const [activeAccountType, setActiveAccountType] = useState<"demo" | "real">(() => {
    return (localStorage.getItem("deriv_active_account_type") as "demo" | "real") || "demo";
  });

  const [demoAuthInfo, setDemoAuthInfo] = useState<{
    balance: number;
    currency: string;
    email: string;
    fullname: string;
    is_virtual: number;
    loginid: string;
    scopes: string[];
  } | null>(() => {
    const saved = localStorage.getItem("deriv_demo_auth_info");
    return saved ? JSON.parse(saved) : null;
  });

  const [realAuthInfo, setRealAuthInfo] = useState<{
    balance: number;
    currency: string;
    email: string;
    fullname: string;
    is_virtual: number;
    loginid: string;
    scopes: string[];
  } | null>(() => {
    const saved = localStorage.getItem("deriv_real_auth_info");
    return saved ? JSON.parse(saved) : null;
  });

  const [demoInput, setDemoInput] = useState<string>("");
  const [realInput, setRealInput] = useState<string>("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);
  const [showTokenHelp, setShowTokenHelp] = useState<boolean>(false);

  // Derived active values
  const derivToken = activeAccountType === "demo" ? demoToken : realToken;
  const authInfo = activeAccountType === "demo" ? demoAuthInfo : realAuthInfo;

  // Fallback / Demo Account Balance
  const [sandboxBalance, setSandboxBalance] = useState<number>(() => {
    const saved = localStorage.getItem("deriv_sandbox_balance");
    return saved ? Number(saved) : 10000.0;
  });

  // Effective Balance based on authentication state
  const balance = authInfo ? Number(authInfo.balance) : sandboxBalance;
  const currencySymbol = authInfo ? authInfo.currency : "USD";

  // Save sandbox balance
  useEffect(() => {
    localStorage.setItem("deriv_sandbox_balance", sandboxBalance.toFixed(2));
  }, [sandboxBalance]);

  // Save active account type
  useEffect(() => {
    localStorage.setItem("deriv_active_account_type", activeAccountType);
  }, [activeAccountType]);

  // UI state
  const [activeAsset, setActiveAsset] = useState<DerivAsset>(SUPPORTED_ASSETS[11]); // RDBEAR default
  const [selectedContractForAnalysis, setSelectedContractForAnalysis] = useState<DerivContract | null>(null);
  const [lastTick, setLastTick] = useState<DerivTick | null>(null);
  const [tickHistory, setTickHistory] = useState<number[]>([]);
  const [tickTimes, setTickTimes] = useState<number[]>([]);
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "disconnected">("disconnected");
  const [isWsAuthorized, setIsWsAuthorized] = useState<boolean>(false);
  const [reconnectTrigger, setReconnectTrigger] = useState<number>(0);

  // Multi-market real-time tick states for all 10 assets
  const [allAssetTicks, setAllAssetTicks] = useState<Record<string, DerivTick>>({});
  const [allAssetHistories, setAllAssetHistories] = useState<Record<string, number[]>>({});

  // Auto-Pilot Mode State
  const [autoPilotEnabled, setAutoPilotEnabled] = useState<boolean>(false);
  const [lastAutoPilotTradeTime, setLastAutoPilotTradeTime] = useState<number>(0);
  const [showPocOverlay, setShowPocOverlay] = useState<boolean>(true);
  const [activePocAnalysis, setActivePocAnalysis] = useState<VolumeProfileAnalysis | null>(null);
  const [autoPilotPocOnly, setAutoPilotPocOnly] = useState<boolean>(true);

  // JYSR Research & AI Signals states
  const [jysrStrategy, setJysrStrategy] = useState<"scalping" | "reversion" | "breakout">("scalping");
  const [jysrSensitivity, setJysrSensitivity] = useState<"low" | "medium" | "high">("medium");
  const [jysrSignalsHistory, setJysrSignalsHistory] = useState<Array<{ id: string; time: string; text: string; type: "bullish" | "bearish" | "system" }>>([
    { id: "1", time: new Date().toLocaleTimeString(), text: "JYSR High-Frequency Analyzer online.", type: "system" },
    { id: "2", time: new Date().toLocaleTimeString(), text: "Monitoring volatility grids & trend momentum.", type: "system" }
  ]);

  // Gemini AI Predict states
  const [geminiPredicting, setGeminiPredicting] = useState<boolean>(false);
  const [geminiAnalysis, setGeminiAnalysis] = useState<string>("");
  const [geminiSignal, setGeminiSignal] = useState<"HIGHER" | "LOWER" | "NEUTRAL" | null>(null);
  const [geminiConfidence, setGeminiConfidence] = useState<number | null>(null);
  const [geminiRecommendedOffset, setGeminiRecommendedOffset] = useState<number | null>(null);
  const [geminiError, setGeminiError] = useState<string | null>(null);

  const [apiLimitsReached, setApiLimitsReached] = useState<boolean>(false);
  
  // Custom non-blocking Toast notification state
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; type: "error" | "warning" | "success" | "info" }>>([]);

  const addToast = (message: string, type: "error" | "warning" | "success" | "info" = "error") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
  };
  
  // Market Snapshot States
  const [latestSnapshot, setLatestSnapshot] = useState<any>(null);
  const [snapshotHistory, setSnapshotHistory] = useState<any[]>([]);
  const [intelTab, setIntelTab] = useState<"narrative" | "dimensions" | "history" | "research">("narrative");
  
  // Research state variables
  const [researchFeatures, setResearchFeatures] = useState<any[]>([]);
  const [predictabilityStats, setPredictabilityStats] = useState<any>(null);
  const [datasetHorizon, setDatasetHorizon] = useState<string>("3m");
  const [validationReport, setValidationReport] = useState<any>(null);
  const [isResearchValidating, setIsResearchValidating] = useState<boolean>(false);
  
  // Persistent Martingale Recovery System States & Refs
  const [martingaleEnabled, setMartingaleEnabled] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem("deriv_martingale_enabled");
      return stored !== null ? stored === "true" : true;
    } catch {
      return true;
    }
  });

  const [martingaleMultiplier, setMartingaleMultiplierState] = useState<number>(() => {
    try {
      const stored = localStorage.getItem("deriv_martingale_multiplier");
      return stored ? Number(stored) : 2.2; // Sensible default multiplier for binary options (instead of aggressive 10.5)
    } catch {
      return 2.2;
    }
  });

  const [martingaleMode, setMartingaleModeState] = useState<"fixed" | "dynamic">(() => {
    try {
      const stored = localStorage.getItem("deriv_martingale_mode");
      return (stored as "fixed" | "dynamic") || "fixed";
    } catch {
      return "fixed";
    }
  });

  const [martingaleMaxCap, setMartingaleMaxCapState] = useState<number>(() => {
    try {
      const stored = localStorage.getItem("deriv_martingale_max_cap");
      return stored ? Number(stored) : 500.00;
    } catch {
      return 500.00;
    }
  });

  const [consecutiveLosses, setConsecutiveLossesState] = useState<number>(() => {
    try {
      const stored = localStorage.getItem("deriv_martingale_losses");
      return stored ? Number(stored) : 0;
    } catch {
      return 0;
    }
  });

  const [martingaleLossAccumulator, setMartingaleLossAccumulatorState] = useState<number>(() => {
    try {
      const stored = localStorage.getItem("deriv_martingale_accumulator");
      return stored ? Number(stored) : 0;
    } catch {
      return 0;
    }
  });

  const martingaleMultiplierRef = useRef<number>(martingaleMultiplier);
  const martingaleModeRef = useRef<"fixed" | "dynamic">(martingaleMode);
  const martingaleMaxCapRef = useRef<number>(martingaleMaxCap);
  const consecutiveLossesRef = useRef<number>(consecutiveLosses);
  const martingaleLossAccumulatorRef = useRef<number>(martingaleLossAccumulator);

  // Synchronizers for Refs and LocalStorage
  const setConsecutiveLosses = (val: number) => {
    consecutiveLossesRef.current = val;
    setConsecutiveLossesState(val);
    try {
      localStorage.setItem("deriv_martingale_losses", String(val));
    } catch (e) {
      console.warn("Storage sync failed:", e);
    }
  };

  const setMartingaleLossAccumulator = (val: number) => {
    martingaleLossAccumulatorRef.current = val;
    setMartingaleLossAccumulatorState(val);
    try {
      localStorage.setItem("deriv_martingale_accumulator", String(val));
    } catch (e) {
      console.warn("Storage sync failed:", e);
    }
  };

  const setMartingaleMultiplier = (val: number) => {
    martingaleMultiplierRef.current = val;
    setMartingaleMultiplierState(val);
    try {
      localStorage.setItem("deriv_martingale_multiplier", String(val));
    } catch (e) {
      console.warn("Storage sync failed:", e);
    }
  };

  const setMartingaleMode = (val: "fixed" | "dynamic") => {
    martingaleModeRef.current = val;
    setMartingaleModeState(val);
    try {
      localStorage.setItem("deriv_martingale_mode", val);
    } catch (e) {
      console.warn("Storage sync failed:", e);
    }
  };

  const setMartingaleMaxCap = (val: number) => {
    martingaleMaxCapRef.current = val;
    setMartingaleMaxCapState(val);
    try {
      localStorage.setItem("deriv_martingale_max_cap", String(val));
    } catch (e) {
      console.warn("Storage sync failed:", e);
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem("deriv_martingale_enabled", String(martingaleEnabled));
    } catch (e) {
      console.warn("Storage sync failed:", e);
    }
  }, [martingaleEnabled]);

  const handleContractSettlementMartingale = (contract: DerivContract) => {
    const isWin = contract.status === "WON";
    if (isWin) {
      console.log(`[MARTINGALE ENGINE] WON. Resetting consecutive losses from ${consecutiveLossesRef.current} and loss accumulator from $${martingaleLossAccumulatorRef.current} to 0.`);
      setConsecutiveLosses(0);
      setMartingaleLossAccumulator(0);
    } else {
      const nextLosses = consecutiveLossesRef.current + 1;
      setConsecutiveLosses(nextLosses);
      const loss = contract.stake;
      const nextAccum = martingaleLossAccumulatorRef.current + loss;
      console.log(`[MARTINGALE ENGINE] LOST. Previous consecutive losses: ${consecutiveLossesRef.current}. New losses: ${nextLosses}. Previous accumulator: $${martingaleLossAccumulatorRef.current}. Added loss: $${loss}. New accumulator: $${nextAccum}.`);
      setMartingaleLossAccumulator(nextAccum);
    }
  };

  // Machine Learning & Persistent Trading Journal states
  const [accumulatedLessons, setAccumulatedLessons] = useState<LearnedInsight[]>(() => {
    try {
      const stored = localStorage.getItem("deriv_ai_lessons");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [isJournalOpen, setIsJournalOpen] = useState<boolean>(false);
  const [activeLedgerTab, setActiveLedgerTab] = useState<"profit_table" | "statement" | "ml_lessons">("profit_table");

  useEffect(() => {
    localStorage.setItem("deriv_ai_lessons", JSON.stringify(accumulatedLessons));
  }, [accumulatedLessons]);

  const recordTradeToLearningMemory = (contract: DerivContract) => {
    const isWin = contract.status === "WON";
    const directionText = contract.type === "Higher" ? "bullish" : "bearish";
    
    let insightText = "";
    let ruleCreated = "";

    if (isWin) {
      insightText = `Perfect timing in predicting ${directionText} momentum on ${contract.symbolName || contract.symbol}. The entry spot was $${contract.entryPrice.toFixed(4)} and the exit spot was $${(contract.exitPrice || contract.entryPrice).toFixed(4)}.`;
      ruleCreated = `Maintain standard barrier configuration (+-${Math.abs(contract.barrierOffset).toFixed(4)}) for ${contract.symbolName || contract.symbol} when similar trend patterns emerge.`;
    } else {
      const deviation = Math.abs(contract.barrierOffset);
      insightText = `A prediction of ${directionText} on ${contract.symbolName || contract.symbol} failed. The exit spot was $${(contract.exitPrice || contract.entryPrice).toFixed(4)}, breaching the barrier offset of ${contract.barrierOffset >= 0 ? "+" : ""}${contract.barrierOffset.toFixed(4)}.`;
      
      if (contract.symbol === "RDBEAR") {
        ruleCreated = `Ensure the Bear Market Index barrier offset remains at least 1.0 or higher to absorb negative fluctuations.`;
      } else {
        const saferOffset = Number((deviation * 1.8).toFixed(4));
        ruleCreated = `Expand the dynamic barrier offset of ${contract.symbol} by 80% (to +-${saferOffset}) in subsequent setups to prevent premature barrier touches.`;
      }
    }

    const newLesson: LearnedInsight = {
      id: String(Date.now()),
      timestamp: Date.now(),
      symbol: contract.symbol,
      tradeType: contract.type,
      status: contract.status as "WON" | "LOST",
      lossStreakBefore: consecutiveLossesRef.current,
      insightText,
      ruleCreated
    };

    setAccumulatedLessons((prev) => [newLesson, ...prev].slice(0, 50));
  };

  const forceSettleContract = (contractId: string) => {
    const contract = activeContractsRef.current.find(c => c.id === contractId);
    if (!contract) return;

    const currentSpot = lastTick ? lastTick.quote : contract.entryPrice;
    const isWin = contract.type === "Higher" 
      ? currentSpot > contract.barrierPrice 
      : currentSpot < contract.barrierPrice;

    const settled: DerivContract = {
      ...contract,
      status: isWin ? "WON" : "LOST",
      exitPrice: currentSpot,
      ticksRemaining: 0,
      learningAnalysis: `[FORCE SETTLED] Settled via manual fallback. Spot: $${currentSpot.toFixed(4)}`
    };

    handleContractSettlementMartingale(settled);
    recordTradeToLearningMemory(settled);

    setContractHistory((hist) => {
      if (hist.some((h) => h.id === settled.id)) return hist;
      return [settled, ...hist].slice(0, 100);
    });

    updateActiveContracts(activeContractsRef.current.filter(c => c.id !== contractId));
    setSelectedContractForAnalysis(settled);
    console.log(`[FORCE SETTLE] Contract ${contractId} resolved manually.`);
  };

  // Silent scanner market availability state
  const [marketAvailability, setMarketAvailability] = useState<Record<string, boolean>>({});

  const isMarketAvailable = (symbol: string) => {
    if (wsStatus !== "connected") return true; // Default to true if not connected, allowing sandbox practice
    return marketAvailability[symbol] !== false;
  };

  // Higher/Lower Contract Form states
  const [durationType, setDurationType] = useState<"ticks" | "minutes">("ticks");
  const [durationValue, setDurationValue] = useState<number>(5); // 5 ticks
  const [barrierOffset, setBarrierOffset] = useState<number>(0.15); // Offset from spot
  const [stake, setStake] = useState<number>(1); // USD
  const [showAssetDropdown, setShowAssetDropdown] = useState<boolean>(false);

  // Enforce RDBEAR / Bear Market Index barrier constraints
  useEffect(() => {
    if (activeAsset.symbol === "RDBEAR" && barrierOffset < 1.0) {
      setBarrierOffset(1.0);
    }
  }, [activeAsset.symbol, barrierOffset]);

  // Technical Indicators & Interactive Hover tracking states
  const [showSma, setShowSma] = useState<boolean>(true);
  const [showBbands, setShowBbands] = useState<boolean>(false);
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; val: number; index: number } | null>(null);

  interface BarrierConfig {
    defaultOffset: number;
    step: number;
    decimals: number;
  }

  const HARDCODED_USER_BARRIERS: Record<string, { higher: number; lower: number; step: number; decimals: number }> = {
    "1HZ100V": { higher: 0.52, lower: -0.52, step: 0.05, decimals: 2 },
    "1HZ75V": { higher: 0.52, lower: -0.52, step: 0.05, decimals: 2 },
    "1HZ50V": { higher: 15.0, lower: -15.0, step: 1.0, decimals: 2 },
    "1HZ25V": { higher: 25.0, lower: -25.0, step: 1.0, decimals: 2 },
    "1HZ10V": { higher: 0.52, lower: -0.52, step: 0.05, decimals: 2 },
    "R_100": { higher: 0.52, lower: -0.52, step: 0.05, decimals: 2 },
    "R_75": { higher: 3.5, lower: -3.5, step: 0.5, decimals: 2 },
    "R_50": { higher: 0.0569, lower: -0.0569, step: 0.005, decimals: 4 },
    "R_25": { higher: 0.52, lower: -0.52, step: 0.05, decimals: 2 },
    "R_10": { higher: 0.52, lower: -0.52, step: 0.05, decimals: 2 },
    "RDBULL": { higher: 1.0, lower: -1.0, step: 0.1, decimals: 2 },
    "RDBEAR": { higher: 1.0, lower: -1.0, step: 0.1, decimals: 2 },
  };

  const getAssetBarrierConfig = (symbol: string): BarrierConfig => {
    const item = HARDCODED_USER_BARRIERS[symbol];
    if (item) {
      return { defaultOffset: Math.abs(item.higher), step: item.step, decimals: item.decimals };
    }
    return { defaultOffset: 0.5, step: 0.05, decimals: 2 };
  };

  // Reset manual barrier offset when asset changes to match its price range
  useEffect(() => {
    const config = getAssetBarrierConfig(activeAsset.symbol);
    setBarrierOffset(config.defaultOffset);
  }, [activeAsset]);

  // Auto-Barrier Solver state (defaults to true per requirements)
  const [autoBarrierMode, setAutoBarrierMode] = useState<boolean>(true);
  const [autoBarrierTarget, setAutoBarrierTarget] = useState<"usd_0_02" | "yield_2">("usd_0_02");

  // Active contracts and history
  const [activeContracts, setActiveContracts] = useState<DerivContract[]>([]);
  const activeContractsRef = useRef<DerivContract[]>([]);

  useEffect(() => {
    activeContractsRef.current = activeContracts;
  }, [activeContracts]);

  const updateActiveContracts = (newContracts: DerivContract[]) => {
    activeContractsRef.current = newContracts;
    setActiveContracts(newContracts);
  };

  const [contractHistory, setContractHistory] = useState<DerivContract[]>(() => {
    const saved = localStorage.getItem("deriv_contract_history");
    if (!saved) return [];
    try {
      const parsed: DerivContract[] = JSON.parse(saved);
      const unique: DerivContract[] = [];
      const seen = new Set<string>();
      parsed.forEach((item) => {
        if (item && item.id && !seen.has(item.id)) {
          seen.add(item.id);
          unique.push(item);
        }
      });
      return unique;
    } catch {
      return [];
    }
  });

  // Save history
  useEffect(() => {
    localStorage.setItem("deriv_contract_history", JSON.stringify(contractHistory));
  }, [contractHistory]);

  const uniqueContractHistory = React.useMemo(() => {
    const seen = new Set<string>();
    return contractHistory.filter((c) => {
      if (!c || !c.id || seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
  }, [contractHistory]);

  const ledgerEntries = React.useMemo(() => {
    const sorted = [...uniqueContractHistory].sort((a, b) => a.createdAt - b.createdAt);
    
    const currentBal = authInfo ? balance : sandboxBalance;
    const netProfitOfSession = uniqueContractHistory.reduce((acc, c) => {
      const isWin = c.status === "WON";
      return acc + (isWin ? (c.payout - c.stake) : -c.stake);
    }, 0);
    
    let runningBalance = Math.max(0, currentBal - netProfitOfSession);
    const entries: {
      id: string;
      refId: string;
      timestamp: number;
      action: "PURCHASE" | "PAYOUT" | "EXPIRY";
      description: string;
      amount: number;
      type: "debit" | "credit";
      runningBalance: number;
    }[] = [];

    sorted.forEach((contract) => {
      // 1. Purchase Transaction
      runningBalance -= contract.stake;
      entries.push({
        id: `${contract.id}-purchase`,
        refId: contract.id,
        timestamp: contract.createdAt,
        action: "PURCHASE",
        description: `Contract Purchase (${contract.type} on ${contract.symbolName || contract.symbol})`,
        amount: contract.stake,
        type: "debit",
        runningBalance: Number(runningBalance.toFixed(2))
      });

      // 2. Settlement Transaction
      if (contract.status === "WON") {
        runningBalance += contract.payout;
        entries.push({
          id: `${contract.id}-payout`,
          refId: contract.id,
          timestamp: contract.createdAt + (contract.durationType === "ticks" ? contract.durationTicks * 1000 : contract.durationMinutes * 60000),
          action: "PAYOUT",
          description: `Contract Win Payout (${contract.type} on ${contract.symbolName || contract.symbol})`,
          amount: contract.payout,
          type: "credit",
          runningBalance: Number(runningBalance.toFixed(2))
        });
      } else if (contract.status === "LOST") {
        entries.push({
          id: `${contract.id}-expiry`,
          refId: contract.id,
          timestamp: contract.createdAt + (contract.durationType === "ticks" ? contract.durationTicks * 1000 : contract.durationMinutes * 60000),
          action: "EXPIRY",
          description: `Contract Expired (${contract.type} on ${contract.symbolName || contract.symbol})`,
          amount: 0,
          type: "debit",
          runningBalance: Number(runningBalance.toFixed(2))
        });
      }
    });

    return entries.reverse();
  }, [uniqueContractHistory, balance, sandboxBalance, authInfo]);

  const socketRef = useRef<WebSocket | null>(null);

  // Mathematical approximation of standard normal Cumulative Distribution Function (CDF)
  const normalCDF = (x: number): number => {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.39894228 * Math.exp(-x * x / 2);
    const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    return x >= 0 ? 1 - p : p;
  };

  // Mathematical approximation of inverse standard normal CDF (Probit function)
  const normalInverseCDF = (p: number): number => {
    if (p <= 0) return -6;
    if (p >= 1) return 6;
    const t = Math.sqrt(-2 * Math.log(p < 0.5 ? p : 1 - p));
    const c0 = 2.515517;
    const c1 = 0.802853;
    const c2 = 0.010328;
    const d1 = 1.432788;
    const d2 = 0.189269;
    const d3 = 0.001308;
    const num = t - ((c2 * t + c1) * t + c0) / (((d3 * t + d2) * t + d1) * t + 1);
    return p < 0.5 ? -num : num;
  };

  const getAssetFallbackSpot = (symbol: string): number => {
    switch (symbol) {
      case "1HZ100V": return 10000000.0;
      case "1HZ75V": return 1000000.0;
      case "1HZ50V": return 350000.0;
      case "1HZ25V": return 300000.0;
      case "1HZ10V": return 1000000.0;
      case "R_100": return 10000.0;
      case "R_75": return 350000.0;
      case "R_50": return 150.0;
      case "R_25": return 220.0;
      case "R_10": return 3200.0;
      case "RDBULL":
      case "RDBEAR": return 500.0;
      default: return 100.0;
    }
  };

  // Get standard deviation (volatility scale factor) of the active asset over the selected duration
  const getAssetSigma = (symbol: string, spotOverride?: number): number => {
    const currentSpot = spotOverride ?? (lastTick ? lastTick.quote : getAssetFallbackSpot(symbol));
    
    // Determine the annual volatility percentage based on the asset symbol
    let volPercent = 0.15; // default 15%
    if (symbol === "1HZ100V" || symbol === "R_100") {
      volPercent = 1.00; // 100% volatility
    } else if (symbol === "1HZ75V" || symbol === "R_75") {
      volPercent = 0.75; // 75% volatility
    } else if (symbol === "1HZ50V" || symbol === "R_50") {
      volPercent = 0.50; // 50% volatility
    } else if (symbol === "1HZ25V" || symbol === "R_25") {
      volPercent = 0.25; // 25% volatility
    } else if (symbol === "1HZ10V" || symbol === "R_10") {
      volPercent = 0.10; // 10% volatility
    } else if (symbol === "RDBULL" || symbol === "RDBEAR") {
      volPercent = 0.20; // 20% volatility
    }

    // Scale with duration: random walk scales with square root of ticks
    const ticksCount = durationType === "ticks" ? durationValue : durationValue * 60;
    const durFactor = Math.sqrt(ticksCount / 5);
    
    // Calculate final sigma scaled to spot price
    const sigma = currentSpot * (volPercent * 0.0035) * durFactor;
    return sigma;
  };

  // Solve for the exact barrier offset required to achieve the target profit
  const getAutoSolvedOffset = (type: "Higher" | "Lower"): number => {
    const sigma = getAssetSigma(activeAsset.symbol);
    
    // Target payout multiplier (factor)
    let targetFactor = 1.02; // Default to 2% yield (0.02 profit payout factor)
    if (autoBarrierTarget === "usd_0_02") {
      targetFactor = 1 + 0.02 / stake;
    }

    // Since payout = stake * factor = stake * 0.95 / p_win
    // factor = 0.95 / p_win => p_win = 0.95 / factor
    let p_win = 0.95 / targetFactor;
    p_win = Math.max(0.01, Math.min(0.99, p_win));

    // For HIGHER: a safe contract has a negative barrier offset (below spot).
    // B = S + offset, and we want B < S, so offset < 0.
    // p_win = 1 - CDF(offset / sigma) => CDF(offset / sigma) = 1 - p_win => offset = normalInverseCDF(1 - p_win) * sigma
    if (type === "Higher") {
      let offset = Number((normalInverseCDF(1 - p_win) * sigma).toFixed(activeAsset.symbol.includes("frx") ? 5 : 2));
      if (activeAsset.symbol === "RDBEAR") {
        offset = -Math.max(1.0, Math.abs(offset));
      }
      return offset;
    } else {
      // For LOWER: a safe contract has a positive barrier offset (above spot).
      // B = S + offset, and we want B > S, so offset > 0.
      // p_win = CDF(offset / sigma) => offset = normalInverseCDF(p_win) * sigma
      let offset = Number((normalInverseCDF(p_win) * sigma).toFixed(activeAsset.symbol.includes("frx") ? 5 : 2));
      if (activeAsset.symbol === "RDBEAR") {
        offset = Math.max(1.0, Math.abs(offset));
      }
      return offset;
    }
  };

  const barrierOffsetHigher = autoBarrierMode 
    ? Math.abs(getAutoSolvedOffset("Higher"))
    : Math.abs(barrierOffset);

  const barrierOffsetLower = autoBarrierMode 
    ? -Math.abs(getAutoSolvedOffset("Lower"))
    : -Math.abs(barrierOffset);

  // Dynamic Payout estimation based on barrierOffset size (using CDF to get actual win probability)
  const getPayoutPercentageForOffset = (type: "Higher" | "Lower", offset: number) => {
    const sigma = getAssetSigma(activeAsset.symbol);
    let p_win = 0.5;
    if (type === "Higher") {
      p_win = 1 - normalCDF(offset / sigma);
    } else {
      p_win = normalCDF(offset / sigma);
    }
    
    p_win = Math.max(0.005, Math.min(0.995, p_win));
    const factor = 0.95 / p_win;
    const pct = Math.max(0.1, (factor - 1) * 100);
    return Number(pct.toFixed(1));
  };

  const payoutPercentageHigher = getPayoutPercentageForOffset("Higher", barrierOffsetHigher);
  const payoutPercentageLower = getPayoutPercentageForOffset("Lower", barrierOffsetLower);

  const estimatedPayoutHigher = Number((stake * (1 + payoutPercentageHigher / 100)).toFixed(2));
  const estimatedPayoutLower = Number((stake * (1 + payoutPercentageLower / 100)).toFixed(2));

  const estimatedNetProfitHigher = Number((estimatedPayoutHigher - stake).toFixed(2));
  const estimatedNetProfitLower = Number((estimatedPayoutLower - stake).toFixed(2));

  // Connect and handle WebSocket
  useEffect(() => {
    let pingInterval: any;
    let reconnectTimeout: any;
    let scannerInterval: any;
    let isMounted = true;
    let ws: WebSocket | null = null;

    const connectWS = () => {
      if (!isMounted) return;
      setWsStatus("connecting");
      setAuthError(null);
      if (derivToken) {
        setIsAuthenticating(true);
      }

      if (socketRef.current) {
        try {
          socketRef.current.onclose = null;
          socketRef.current.onerror = null;
          socketRef.current.close();
        } catch (e) {}
      }

      const wsUrl = `wss://ws.derivws.com/websockets/v3?app_id=71710`;
      ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        if (!isMounted) return;
        setWsStatus("connected");

        // 1. If we have a token, authorize FIRST
        if (derivToken && derivToken.trim() !== "") {
          ws.send(JSON.stringify({ authorize: derivToken.trim() }));
        }

        // 2. Request history and subscribe to live ticks together (ticks_history + subscribe)
        ws.send(
          JSON.stringify({
            ticks_history: activeAsset.symbol,
            adjust_start_time: 1,
            count: 150,
            end: "latest",
            start: 1,
            style: "ticks",
            subscribe: 1,
          })
        );

        // 3. Subscribe to live tick feeds for ALL other supported assets as well, so our AI Signal table operates live
        SUPPORTED_ASSETS.forEach((asset) => {
          if (asset.symbol !== activeAsset.symbol) {
            ws.send(
              JSON.stringify({
                ticks: asset.symbol,
                subscribe: 1,
              })
            );
          }
        });

        // 4. Launch initial silent background scanner check
        ws.send(JSON.stringify({ active_symbols: "brief", product_type: "basic" }));

        // Ping every 30 seconds to keep connection alive
        pingInterval = setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ ping: 1 }));
          }
        }, 30000);

        // Silent scanner check every 40 seconds to find locked/unavailable markets
        scannerInterval = setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ active_symbols: "brief", product_type: "basic" }));
          }
        }, 40000);
      };

      ws.onmessage = (event) => {
        if (!isMounted) return;
        const data = JSON.parse(event.data);

        // A. Handle Authorization Response
        if (data.msg_type === "authorize") {
          setIsAuthenticating(false);
          if (data.error) {
            console.warn("Deriv Auth Failed:", data.error);
            setIsWsAuthorized(false);
            setAuthError(data.error.message || "Invalid or expired Deriv API token.");
            if (activeAccountType === "demo") {
              setDemoAuthInfo(null);
              localStorage.removeItem("deriv_demo_auth_info");
              setDemoToken("");
              localStorage.removeItem("deriv_demo_token");
            } else {
              setRealAuthInfo(null);
              localStorage.removeItem("deriv_real_auth_info");
              setRealToken("");
              localStorage.removeItem("deriv_real_token");
            }
          } else if (data.authorize) {
            const auth = data.authorize;
            const scopes = auth.scopes || [];
            if (!scopes.includes("trade")) {
              setAuthError("Your API token is missing the required 'trade' scope. Please create a new token with 'read' and 'trade' scopes.");
              setIsWsAuthorized(false);
              return;
            }

            const updatedAuth = {
              balance: Number(auth.balance),
              currency: auth.currency || "USD",
              email: auth.email || "",
              fullname: auth.fullname || "",
              is_virtual: Number(auth.is_virtual),
              loginid: auth.loginid || "",
              scopes: scopes,
            };
            setIsWsAuthorized(true);
            if (auth.is_virtual) {
              setDemoAuthInfo(updatedAuth);
              localStorage.setItem("deriv_demo_auth_info", JSON.stringify(updatedAuth));
              if (derivToken) {
                localStorage.setItem("deriv_demo_token", derivToken);
              }
            } else {
              setRealAuthInfo(updatedAuth);
              localStorage.setItem("deriv_real_auth_info", JSON.stringify(updatedAuth));
              if (derivToken) {
                localStorage.setItem("deriv_real_token", derivToken);
              }
            }
            // Subscribe to live balance stream as requested
            ws.send(JSON.stringify({ balance: 1, subscribe: 1 }));
            // Subscribe to live open contracts updates from Deriv
            ws.send(JSON.stringify({ proposal_open_contract: 1, subscribe: 1 }));
          }
        }

        // B. Handle Live Balance Updates
        if (data.msg_type === "balance" && data.balance) {
          const balanceVal = Number(data.balance.balance);
          if (activeAccountType === "demo") {
            setDemoAuthInfo((prev) => {
              if (prev) {
                const updated = { ...prev, balance: balanceVal };
                localStorage.setItem("deriv_demo_auth_info", JSON.stringify(updated));
                return updated;
              }
              return null;
            });
          } else {
            setRealAuthInfo((prev) => {
              if (prev) {
                const updated = { ...prev, balance: balanceVal };
                localStorage.setItem("deriv_real_auth_info", JSON.stringify(updated));
                return updated;
              }
              return null;
            });
          }
        }

        // C. Handle History Response (ticks history from before)
        if (data.msg_type === "history" && data.history) {
          const historyData = data.history;
          const prices: number[] = historyData.prices || [];
          const times: number[] = historyData.times || [];
          if (prices.length > 0 && isMounted) {
            setTickHistory(prices.slice(-150));
            setTickTimes(times.slice(-150));
            const lastPrice = prices[prices.length - 1];
            const lastEpoch = times[times.length - 1] || Math.floor(Date.now() / 1000);

            // Populate all asset dictionaries as well for fallback consistency
            setAllAssetTicks((prev) => ({
              ...prev,
              [activeAsset.symbol]: {
                ask: lastPrice,
                bid: lastPrice,
                epoch: lastEpoch,
                id: "",
                pip_size: 2,
                quote: lastPrice,
                symbol: activeAsset.symbol,
              }
            }));
            setAllAssetHistories((prev) => ({
              ...prev,
              [activeAsset.symbol]: prices.slice(-30)
            }));

            // Set the last tick immediately so UI displays current spot price & barrier offset works instantly
            const mockTick: DerivTick = {
              ask: lastPrice,
              bid: lastPrice,
              epoch: lastEpoch,
              id: "",
              pip_size: 2,
              quote: lastPrice,
              symbol: activeAsset.symbol,
            };
            setLastTick(mockTick);
          }
        }

        // C.5 Handle Live Proposal Open Contract (Authoritative Settlement from Deriv)
        if (data.msg_type === "proposal_open_contract" && data.proposal_open_contract) {
          const poc = data.proposal_open_contract;
          const cid = String(poc.contract_id);
          console.log("[DERIV REALTIME CONTRACT UPDATE]", cid, poc.status, "profit:", poc.profit);

          const existingContract = activeContractsRef.current.find(c => c.id === cid);
          if (existingContract) {
            const isFinished = poc.status === "won" || poc.status === "lost" || poc.status === "sold";
            const currentSpot = poc.current_spot || poc.exit_spot || existingContract.exitPrice || (lastTick ? lastTick.quote : existingContract.entryPrice);

            if (isFinished) {
              const derivWin = poc.status === "won";
              const finishedContract: DerivContract = {
                ...existingContract,
                status: derivWin ? "WON" : "LOST",
                exitPrice: poc.exit_spot || currentSpot,
                payout: poc.payout || existingContract.payout,
                ticksRemaining: 0,
                learningAnalysis: generateLearningAnalysis(existingContract, poc.exit_spot || currentSpot, derivWin)
              };

              console.log("[DERIV REALTIME CONTRACT SETTLED]", finishedContract.id, finishedContract.status);

              // 1. Process Martingale recovery
              handleContractSettlementMartingale(finishedContract);

              // 2. Add to contract history (our journal)
              setContractHistory((hist) => {
                if (hist.some((h) => h.id === finishedContract.id)) return hist;
                return [finishedContract, ...hist].slice(0, 100);
              });

              // 3. Select for analysis
              setSelectedContractForAnalysis(finishedContract);

              // 4. Update active contracts (remove it)
              updateActiveContracts(activeContractsRef.current.filter(c => c.id !== cid));

              // 5. Machine Learning feedback update
              recordTradeToLearningMemory(finishedContract);
            } else {
              // Still open. Update ticks count
              updateActiveContracts(
                activeContractsRef.current.map((c) => {
                  if (c.id === cid) {
                    const updatedTicks = poc.tick_stream 
                      ? poc.tick_stream.map((t: any) => ({ tick: t.tick, epoch: t.epoch }))
                      : c.ticksCollected;
                    return {
                      ...c,
                      status: "OPEN",
                      ticksCollected: updatedTicks,
                      ticksRemaining: poc.tick_count ? Math.max(0, poc.tick_count - updatedTicks.length) : c.ticksRemaining,
                    };
                  }
                  return c;
                    })
              );
            }
          }
        }

        // D. Handle Live Tick Updates
        if (data.msg_type === "tick" && data.tick) {
          const tickData: DerivTick = data.tick;

          // Track in all asset tick/history maps for full-market AI dashboard
          setAllAssetTicks((prev) => ({
            ...prev,
            [tickData.symbol]: tickData
          }));

          setAllAssetHistories((prev) => {
            const currentHistory = prev[tickData.symbol] || [];
            const updated = [...currentHistory, tickData.quote].slice(-150);
            return {
              ...prev,
              [tickData.symbol]: updated
            };
          });

          // Resolve active contracts for this specific symbol!
          processContractsWithNewTick(tickData.symbol, tickData.quote, tickData.epoch);

          if (tickData.symbol === activeAsset.symbol) {
            setLastTick(tickData);
            setTickHistory((prev) => {
              const next = [...prev, tickData.quote];
              return next.slice(-150); // Keep last 150 ticks for POC analysis and chart
            });
            setTickTimes((prev) => {
              const next = [...prev, tickData.epoch];
              return next.slice(-150);
            });
          }
        }

        // E. Handle Active Symbols Scanner Response
        if (data.msg_type === "active_symbols" && data.active_symbols) {
          const availability: Record<string, boolean> = {};
          // Initialize all supported assets as unavailable by default
          SUPPORTED_ASSETS.forEach((asset) => {
            availability[asset.symbol] = false;
          });

          data.active_symbols.forEach((sym: any) => {
            if (availability[sym.symbol] !== undefined) {
              // It exists in our supported assets list. Check if exchange is open (1)
              availability[sym.symbol] = sym.exchange_is_open === 1;
            }
          });

          setMarketAvailability(availability);
        }

        // F. Handle Proposal Response (for purchasing contracts)
        if (data.msg_type === "proposal" && data.req_id) {
          const reqIdNum = Number(data.req_id);
          if (reqIdNum >= 1000000 && reqIdNum < 2000000) {
            const conId = String(reqIdNum - 1000000);
            if (data.error) {
              console.error("Proposal error:", data.error);
              const pendingContract = activeContractsRef.current.find(c => c.id === conId);
              if (pendingContract && !(pendingContract as any)._barrierRetried) {
                console.log("[DERIV RETRY] Proposal rejected. Retrying with safe barrier offset ±0.50...");
                (pendingContract as any)._barrierRetried = true;
                const safeOffset = pendingContract.type === "Higher" ? "+0.50" : "-0.50";
                const retryPayload = {
                  proposal: 1,
                  amount: pendingContract.stake,
                  basis: "stake",
                  contract_type: pendingContract.type === "Higher" ? "HIGHER" : "LOWER",
                  currency: authInfo ? authInfo.currency : "USD",
                  duration: 5,
                  duration_unit: "t",
                  symbol: pendingContract.symbol,
                  underlying_symbol: pendingContract.symbol,
                  barrier: safeOffset,
                  req_id: reqIdNum
                };
                ws.send(JSON.stringify(retryPayload));
                return;
              }
              addToast(`Deriv Proposal Failed: ${data.error.message || "Unknown error"}`, "error");
              // Remove the pending contract from activeContracts
              updateActiveContracts(activeContractsRef.current.filter(c => c.id !== conId));
            } else if (data.proposal) {
              console.log("Proposal received, sending buy request...", data.proposal.id);
              // Update contract status message to reflect we are sending buy order
              updateActiveContracts(
                activeContractsRef.current.map((c) => {
                  if (c.id === conId) {
                    return {
                      ...c,
                      pendingMessage: "Executing buy order on Deriv..."
                    };
                  }
                  return c;
                })
              );
              // Send the buy request!
              ws.send(JSON.stringify({
                buy: data.proposal.id,
                price: data.proposal.ask_price || 1.0,
                req_id: 2000000 + Number(conId)
              }));
            }
          }
        }

        // G. Handle Buy Response
        if (data.msg_type === "buy" && data.req_id) {
          const reqIdNum = Number(data.req_id);
          if (reqIdNum >= 2000000 && reqIdNum < 3000000) {
            const conId = String(reqIdNum - 2000000);
            if (data.error) {
              console.error("Buy error:", data.error);
              addToast(`Deriv Buy Failed: ${data.error.message || "Unknown error"}`, "error");
              // Remove the pending contract
              updateActiveContracts(activeContractsRef.current.filter(c => c.id !== conId));
            } else if (data.buy) {
              console.log("Purchase Confirmed on Deriv:", data.buy.contract_id);
              // Update the contract with real contract_id and transition status to OPEN to start counting ticks!
              updateActiveContracts(
                activeContractsRef.current.map((c) => {
                  if (c.id === conId) {
                    return {
                      ...c,
                      id: String(data.buy.contract_id), // update to real contract ID from Deriv!
                      status: "OPEN", // officially start tracking ticks!
                      entryPrice: data.buy.start_time ? data.buy.start_time : c.entryPrice,
                    };
                  }
                  return c;
                })
              );
            }
          }
        }
      };

      ws.onerror = (err) => {
        if (!isMounted) return;
        console.warn("Deriv WS Warning (silent fallback active):", err);
        setWsStatus("disconnected");
        setIsWsAuthorized(false);
        setIsAuthenticating(false);
      };

      ws.onclose = () => {
        if (!isMounted) return;
        setWsStatus("disconnected");
        setIsWsAuthorized(false);
        setIsAuthenticating(false);
        clearInterval(pingInterval);
        clearInterval(scannerInterval);

        // Schedule auto-reconnect after 3 seconds
        reconnectTimeout = setTimeout(() => {
          console.log("Attempting to reconnect to Deriv WS...");
          connectWS();
        }, 3000);
      };
    };

    connectWS();

    return () => {
      isMounted = false;
      if (ws) {
        ws.close();
      }
      clearInterval(pingInterval);
      clearInterval(scannerInterval);
      clearTimeout(reconnectTimeout);
    };
  }, [activeAsset.symbol, derivToken, activeAccountType, reconnectTrigger]);

  // Reset chart when asset changes
  useEffect(() => {
    setTickHistory([]);
    setTickTimes([]);
    setLastTick(null);
  }, [activeAsset.symbol]);

  const generateLearningAnalysis = (contract: DerivContract, exitPrice: number, isWin: boolean) => {
    const pDiff = exitPrice - contract.entryPrice;
    const directionText = contract.type === "Higher" ? "stay above" : "stay below";
    
    // Calculate stats on the ticks collected
    const priceList = contract.ticksCollected.map(t => t.tick);
    const minPrice = priceList.length > 0 ? Math.min(...priceList, contract.entryPrice, exitPrice) : Math.min(contract.entryPrice, exitPrice);
    const maxPrice = priceList.length > 0 ? Math.max(...priceList, contract.entryPrice, exitPrice) : Math.max(contract.entryPrice, exitPrice);
    const totalRange = maxPrice - minPrice;
    
    let details = "";
    if (isWin) {
      details = `🎉 WINNER LESSON: The ${contract.symbolName} trade settled successfully in-the-money at $${exitPrice.toFixed(4)}.\n\n` +
        `Your trade predicted the market would ${directionText} the target barrier of $${contract.barrierPrice.toFixed(4)} (offset: ${contract.barrierOffset >= 0 ? "+" : ""}${contract.barrierOffset.toFixed(4)}).\n\n` +
        `With an entry spot of $${contract.entryPrice.toFixed(4)}, the asset moved by ${pDiff >= 0 ? "+" : ""}${pDiff.toFixed(4)} points over the duration.\n\n` +
        `The tick path remained safely contained (high: $${maxPrice.toFixed(4)}, low: $${minPrice.toFixed(4)}, total path spread: $${totalRange.toFixed(4)}), confirming that the auto-barrier safety solver properly calculated the standard variance threshold.\n\n` +
        `This validates that the selected strategy was well-matched to the consolidating structure of the Bear Market Index.`;
    } else {
      const breachAmount = contract.type === "Higher" 
        ? contract.barrierPrice - exitPrice 
        : exitPrice - contract.barrierPrice;
        
      details = `⚠️ BREACHED LESSON: The ${contract.symbolName} trade closed out-of-the-money at $${exitPrice.toFixed(4)} (breaching the barrier by $${Math.abs(breachAmount).toFixed(4)}).\n\n` +
        `The option required the exit spot to ${directionText} $${contract.barrierPrice.toFixed(4)} (offset: ${contract.barrierOffset >= 0 ? "+" : ""}${contract.barrierOffset.toFixed(4)}), but the market surged or plunged past it.\n\n` +
        `Throughout the duration, ticks fluctuated widely between $${minPrice.toFixed(4)} and $${maxPrice.toFixed(4)} (total volatility spread of $${totalRange.toFixed(4)}).\n\n` +
        `This sudden price swing indicates a high-velocity momentum spike which breached the statistical normal-distribution envelope.\n\n` +
        `KEY TAKEAWAY: When high-volatility spikes occur on the Bear Market Index, it is highly recommended to increase the barrier offset buffer, select a shorter duration (e.g. 5 ticks), or wait for the RSI to revert from extreme zones before placing another option.`;
    }
    return details;
  };



  // Dynamic alerts for JYSR feed as ticks arrive
  useEffect(() => {
    if (!lastTick) return;
    
    // 12% probability event to add real-time alerts
    if (Math.random() < 0.12) {
      const { signal, trend, confidence } = getJYSRAnalysis();
      const timeStr = new Date().toLocaleTimeString();
      let alertText = "";
      let type: "bullish" | "bearish" | "system" = "system";

      if (signal.includes("BUY")) {
        alertText = `[JYSR SIGNAL] Trend model detects strong upward breakthrough on ${activeAsset.name}. Target confidence: ${confidence}%.`;
        type = "bullish";
      } else if (signal.includes("SELL")) {
        alertText = `[JYSR SIGNAL] Reversal model flags local overbought pivot on ${activeAsset.name}. Target confidence: ${confidence}%.`;
        type = "bearish";
      } else {
        alertText = `[JYSR BULLETIN] Range-bound consolidation on ${activeAsset.name} index at quote ${lastTick.quote.toFixed(2)}.`;
        type = "system";
      }

      setJysrSignalsHistory((prev) => [
        { id: String(Date.now()), time: timeStr, text: alertText, type },
        ...prev
      ].slice(0, 15));
    }
  }, [lastTick]);

  // Poll market intelligence history from server
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    const fetchHistory = async () => {
      try {
        const res = await fetch(`/api/market/history?market=${activeAsset.symbol}&limit=20`, { signal });
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.snapshots)) {
            setSnapshotHistory(data.snapshots);
          }
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          const isTransient = err.message?.includes("Failed to fetch") || err.message?.includes("Load failed");
          if (isTransient) {
            console.warn("Transient connection warning (retrying):", err.message || err);
          } else {
            console.error("Error fetching market snapshot history:", err);
          }
        }
      }
    };
    
    fetchHistory();
    const interval = setInterval(fetchHistory, 10000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [activeAsset.symbol]);

  // Poll research features and predictability stats from server
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    const fetchResearchData = async () => {
      try {
        const [featuresRes, predictabilityRes] = await Promise.all([
          fetch("/api/market/research/features", { signal }),
          fetch("/api/market/research/predictability", { signal })
        ]);

        if (featuresRes.ok) {
          const featuresData = await featuresRes.json();
          if (featuresData.success && Array.isArray(featuresData.features)) {
            setResearchFeatures(featuresData.features);
          }
        }

        if (predictabilityRes.ok) {
          const predictabilityData = await predictabilityRes.json();
          if (predictabilityData.success) {
            setPredictabilityStats(predictabilityData);
          }
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          const isTransient = err.message?.includes("Failed to fetch") || err.message?.includes("Load failed");
          if (isTransient) {
            console.warn("Transient connection warning (retrying):", err.message || err);
          } else {
            console.error("Error fetching quantitative research data:", err);
          }
        }
      }
    };

    fetchResearchData();
    const interval = setInterval(fetchResearchData, 10000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [intelTab]);

  // Call the server-side Gemini Predict & Learning engine
  const fetchGeminiPrediction = async (symbol: string, currentPrice: number, history: number[], contracts: DerivContract[]) => {
    setGeminiPredicting(true);
    setGeminiError(null);
    try {
      const response = await fetch("/api/gemini/deriv-predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          currentPrice,
          tickHistory: history.slice(-50),
          contractHistory: contracts.slice(0, 10),
          accumulatedLessons
        })
      });
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error("Non-JSON response received:", text.slice(0, 200));
        throw new Error("Server returned non-JSON. Please wait and try again.");
      }

      const data = await response.json();
      setGeminiSignal(data.signal || "NEUTRAL");
      setGeminiConfidence(data.confidence || 50);
      setGeminiRecommendedOffset(data.barrierOffset || 0.15);
      setGeminiAnalysis(data.analysis || "No analysis provided.");
      setApiLimitsReached(!!data.apiLimitsReached);
      
      if (data.snapshot) {
        setLatestSnapshot(data.snapshot);
        setSnapshotHistory((prev) => [data.snapshot, ...prev].slice(0, 30));
      }
      
      // Update signal console history feed
      if (data.signal && data.signal !== "NEUTRAL") {
        const type = data.signal === "HIGHER" ? ("bullish" as const) : ("bearish" as const);
        setJysrSignalsHistory((prev) => [
          {
            id: String(Date.now()),
            time: new Date().toLocaleTimeString(),
            text: `[GEMINI BRAIN] Predicted ${data.signal} (${data.confidence}% confidence) for ${symbol}. Recommended Offset: ${data.barrierOffset}.`,
            type
          },
          ...prev
        ].slice(0, 30));
      }
      
      return data;
    } catch (err: any) {
      console.error("[GEMINI FETCH ERROR]", err);
      setGeminiError(err.message || "Failed to contact Gemini AI Server.");
      return null;
    } finally {
      setGeminiPredicting(false);
    }
  };

  // Technical Calculations for JYSR Research (analyzes any given price list)
  const computeAssetAISignal = (symbol: string, currentSpot: number, historyList?: number[]) => {
    const prices = historyList || allAssetHistories[symbol] || [];
    
    if (prices.length < 5) {
      // Seed initial mock history for startup scan before ticks arrive
      const fallbackSpot = getAssetFallbackSpot(symbol);
      const seedHistory: number[] = [];
      const sigma = getAssetSigma(symbol, fallbackSpot);
      let temp = fallbackSpot;
      for (let i = 0; i < 20; i++) {
        temp += (Math.random() - 0.5) * sigma * 0.25;
        seedHistory.push(temp);
      }
      return computeAssetAISignal(symbol, currentSpot || fallbackSpot, seedHistory);
    }

    const len = prices.length;
    const latest = currentSpot || prices[len - 1];
    
    // Simple Moving Average
    const sum = prices.reduce((acc, p) => acc + p, 0);
    const sma = sum / len;

    // Volatility (Standard Deviation)
    const variance = prices.reduce((acc, p) => acc + Math.pow(p - sma, 2), 0) / len;
    const stdDev = Math.sqrt(variance);

    // RSI
    let gains = 0;
    let losses = 0;
    for (let i = 1; i < len; i++) {
      const diff = prices[i] - prices[i - 1];
      if (diff > 0) gains += diff;
      else losses += Math.abs(diff);
    }
    const rs = gains / (losses || 1);
    const rsi = Math.round(100 - (100 / (1 + rs)));

    // Fundamental trend slopes over different window intervals
    const shortChange = latest - prices[Math.max(0, len - 5)];
    const longChange = latest - prices[0];
    
    let trend: "BULLISH" | "BEARISH" | "CONSOLIDATING" = "CONSOLIDATING";
    if (shortChange > 0 && longChange > 0) {
      trend = "BULLISH";
    } else if (shortChange < 0 && longChange < 0) {
      trend = "BEARISH";
    }

    // Structural Breakout detection (detecting breaking points of Support / Resistance)
    // Support is the minimum over previous 15 ticks, Resistance is the maximum
    const prevSegment = prices.slice(0, -1);
    const resistance = Math.max(...prevSegment);
    const support = Math.min(...prevSegment);

    let breakout: "BULLISH BREAKOUT" | "BEARISH BREAKDOWN" | "STABLE RANGE" = "STABLE RANGE";
    if (latest > resistance + stdDev * 0.1) {
      breakout = "BULLISH BREAKOUT";
    } else if (latest < support - stdDev * 0.1) {
      breakout = "BEARISH BREAKDOWN";
    }

    // Combine Technical, Fundamental slope, and Breakout points to formulate a high-confidence trade signal
    let signal: "HIGHER" | "LOWER" | "NEUTRAL" = "NEUTRAL";
    let confidence = 50 + Math.abs(rsi - 50) * 0.4;

    // Strategy rule weighting
    if (jysrStrategy === "scalping") {
      // Scalping favors fast breakout trades and micro crossovers
      if (breakout === "BULLISH BREAKOUT" || (rsi < 45 && trend === "BULLISH")) {
        signal = "HIGHER";
        confidence += 20;
      } else if (breakout === "BEARISH BREAKDOWN" || (rsi > 55 && trend === "BEARISH")) {
        signal = "LOWER";
        confidence += 20;
      }
    } else if (jysrStrategy === "reversion") {
      // Reversion trades extreme peaks
      if (rsi < 30) {
        signal = "HIGHER";
        confidence += 30;
      } else if (rsi > 70) {
        signal = "LOWER";
        confidence += 30;
      }
    } else if (jysrStrategy === "breakout") {
      // Breakout mode strictly focuses on breaching support and resistance channels
      if (breakout === "BULLISH BREAKOUT") {
        signal = "HIGHER";
        confidence += 35;
      } else if (breakout === "BEARISH BREAKDOWN") {
        signal = "LOWER";
        confidence += 35;
      }
    }

    // Normalize confidence bounds
    confidence = Math.round(Math.min(99, Math.max(35, confidence)));

    // Optimal Barrier Offset Solve
    let optimalOffset = stdDev * 1.35;
    const config = getAssetBarrierConfig(symbol);
    optimalOffset = Math.max(config.defaultOffset * 0.3, optimalOffset);

    return {
      signal,
      confidence,
      rsi,
      sma,
      volatility: stdDev,
      optimalOffset,
      trend,
      breakout,
      description: signal === "HIGHER" 
        ? `JYSR AI detects Bullish breakout with ${confidence}% confidence. Support holds at ${support.toFixed(config.decimals)}.`
        : signal === "LOWER"
        ? `JYSR AI detects Bearish breakdown with ${confidence}% confidence. Resistance capped at ${resistance.toFixed(config.decimals)}.`
        : `Sideways volume profile. Mean reversion is favored around the dynamic median support channels.`
    };
  };

  // Legacy active-asset wrapper for backward compatibility with chart and manual widgets
  const getJYSRAnalysis = () => {
    return computeAssetAISignal(activeAsset.symbol, lastTick ? lastTick.quote : 0, tickHistory);
  };

  // Track minutes contracts countdown
  useEffect(() => {
    const timer = setInterval(() => {
      const currentContracts = activeContractsRef.current;
      let changed = false;
      const stillActive: DerivContract[] = [];
      const finishedContracts: DerivContract[] = [];

      currentContracts.forEach((contract) => {
        if (contract.status === "PENDING") {
          stillActive.push(contract);
          return;
        }
        if (contract.durationType === "minutes" && contract.secondsRemaining !== undefined) {
          changed = true;
          const nextSecs = contract.secondsRemaining - 1;
          if (nextSecs <= 0) {
            // Time's up! Exit spot is the latest spot we have
            const currentSpot = lastTick ? lastTick.quote : contract.entryPrice;
            const isWin = contract.type === "Higher" 
              ? currentSpot > contract.barrierPrice 
              : currentSpot < contract.barrierPrice;

            const finishedContract: DerivContract = {
              ...contract,
              status: isWin ? "WON" : "LOST",
              secondsRemaining: 0,
              exitPrice: currentSpot,
              learningAnalysis: generateLearningAnalysis(contract, currentSpot, isWin)
            };
            finishedContracts.push(finishedContract);
          } else {
            stillActive.push({ ...contract, secondsRemaining: nextSecs });
          }
        } else {
          stillActive.push(contract);
        }
      });

      if (changed) {
        // Resolve side effects for finished contracts outside of state updater
        finishedContracts.forEach((contract) => {
          handleContractSettlementMartingale(contract);
          const isWin = contract.status === "WON";
          if (isWin) {
            if (authInfo) {
              if (activeAccountType === "demo") {
                setDemoAuthInfo(prevAuth => prevAuth ? { ...prevAuth, balance: prevAuth.balance + contract.payout } : null);
              } else {
                setRealAuthInfo(prevAuth => prevAuth ? { ...prevAuth, balance: prevAuth.balance + contract.payout } : null);
              }
            } else {
              setSandboxBalance((b) => b + contract.payout);
            }
          }

          // Save to history
          setContractHistory((hist) => {
            if (hist.some((h) => h.id === contract.id)) return hist;
            return [contract, ...hist].slice(0, 100);
          });
          setSelectedContractForAnalysis(contract);
          recordTradeToLearningMemory(contract); // Record to persistent ML database!
        });

        updateActiveContracts(stillActive);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [lastTick, authInfo, activeAccountType]);

  // ── FIXED RANGE VOLUME PROFILE & POINT OF CONTROL (POC) ANALYSIS ENGINE ──
  useEffect(() => {
    if (tickHistory.length < 20) return;
    const candles = buildCandlesFromTicks(tickHistory, 5);
    if (candles.length < 4) return;

    // Run both Bullish (swing low to swing high) and Bearish (swing high to swing low)
    const bullish = runVolumeProfileAnalysis(candles, "BULLISH", 1.0);
    const bearish = runVolumeProfileAnalysis(candles, "BEARISH", 1.0);

    // Pick analysis with higher confidence / confirmed reaction
    if (bullish.confidence >= bearish.confidence) {
      setActivePocAnalysis(bullish);
    } else {
      setActivePocAnalysis(bearish);
    }
  }, [tickHistory]);

  // Automated Auto-Pilot Trading Loop powered by Gemini AI
  useEffect(() => {
    if (!autoPilotEnabled) return;

    // If user is authenticated with Deriv, they must be online/connected. Otherwise (Sandbox), we allow offline practice trading.
    if (authInfo && wsStatus !== "connected") return;
 
    // Do NOT trade on Autopilot if ANY active or pending contracts exist in progress (strict settlement rule)
    if (activeContractsRef.current.length > 0) return;
 
    // Throttle checks to at least 15 seconds to let previous contracts resolve and prevent overlapping spikes
    if (Date.now() - lastAutoPilotTradeTime < 15000) return;
 
    const runAutopilotGeminiAnalysis = async () => {
      // Focus on the user's selected asset for complete flexibility and correct offline tick feed routing
      const targetAsset = activeAsset;
      const liveTick = lastTick;
      if (!liveTick) return;
 
      const history = allAssetHistories[targetAsset.symbol] || [];
      if (history.length < 5) return;
 
      // Lock trade time to prevent duplicate calls
      setLastAutoPilotTradeTime(Date.now());
 
      console.log(`[AUTOPILOT] Invoking Gemini Predict & Learn Engine for ${targetAsset.name}...`);
      const data = await fetchGeminiPrediction(targetAsset.symbol, liveTick.quote, history, contractHistory);
       
      if (data && data.signal && data.signal !== "NEUTRAL" && data.confidence >= 65) {
        const direction: "Higher" | "Lower" = data.signal === "HIGHER" ? "Higher" : "Lower";

        // ── POC SNIPER GATE: Only trade if Point of Control confirms pullback reaction ──
        if (autoPilotPocOnly && activePocAnalysis) {
          const requiredBias = direction === "Higher" ? "BULLISH" : "BEARISH";
          const pocReady =
            activePocAnalysis.pocAlignedBias === requiredBias &&
            !!activePocAnalysis.reaction?.reactionConfirmed &&
            activePocAnalysis.confidence >= 35;
          if (!pocReady) {
            console.log(
              `[POC GATE] Autopilot trade held for ${targetAsset.name}: POC bias=${activePocAnalysis.pocAlignedBias} (${activePocAnalysis.confidence}%, reaction=${activePocAnalysis.reaction?.reactionType || "none"}), needed confirmed ${requiredBias} reaction.`
            );
            return;
          }
          console.log(
            `[POC GATE] ✅ Confirmed ${requiredBias} POC reaction (${activePocAnalysis.confidence}%). Proceeding with Higher/Lower contract.`
          );
        }
 
        console.log(`[AUTOPILOT SUCCESS] Gemini Signal: ${data.signal}, Confidence: ${data.confidence}%. Placing Higher/Lower trade using mathematically solved barriers!`);
        purchaseContract(direction, targetAsset, stake, 5, data.barrierOffset);
      } else {
        console.log(`[AUTOPILOT CONSOLIDATION] Gemini returned Neutral or Low Confidence (${data ? data.confidence : 0}%). Retrying in next cycle...`);
      }
    };
 
    runAutopilotGeminiAnalysis();
  }, [allAssetTicks, autoPilotEnabled, wsStatus, authInfo, lastAutoPilotTradeTime, contractHistory, activeAsset, lastTick, allAssetHistories, autoPilotPocOnly, activePocAnalysis]);

  // Match active contracts tick-by-tick for ANY symbol
  const processContractsWithNewTick = (symbol: string, currentPrice: number, epoch: number) => {
    const currentContracts = activeContractsRef.current;
    const stillActive: DerivContract[] = [];
    const finishedContracts: DerivContract[] = [];

    currentContracts.forEach((contract) => {
      if (contract.status === "PENDING") {
        stillActive.push(contract);
        return;
      }

      if (contract.symbol !== symbol) {
        stillActive.push(contract);
        return;
      }

      if (isWsAuthorized && contract.id.length > 8) {
        // This is a live trade with a real Deriv contract ID. 
        // We let the WS 'proposal_open_contract' message handle the official authoritative settlement.
        stillActive.push(contract);
        return;
      }

      if (contract.durationType === "ticks") {
        const updatedTicks = [...contract.ticksCollected, { tick: currentPrice, epoch }];
        const ticksLeft = contract.durationTicks - updatedTicks.length;

        if (ticksLeft <= 0) {
          // Contract completes on this exact tick
          const finalSpot = currentPrice;
          const isWin = contract.type === "Higher" 
            ? finalSpot > contract.barrierPrice 
            : finalSpot < contract.barrierPrice;

          const finished: DerivContract = {
            ...contract,
            ticksCollected: updatedTicks,
            status: isWin ? "WON" : "LOST",
            ticksRemaining: 0,
            exitPrice: finalSpot,
            learningAnalysis: generateLearningAnalysis({ ...contract, ticksCollected: updatedTicks }, finalSpot, isWin)
          };
          finishedContracts.push(finished);
        } else {
          stillActive.push({
            ...contract,
            ticksCollected: updatedTicks,
            ticksRemaining: ticksLeft,
          });
        }
      } else {
        // If minutes duration, we collect tick points for reference
        stillActive.push({
          ...contract,
          ticksCollected: [...contract.ticksCollected, { tick: currentPrice, epoch }]
        });
      }
    });

    if (finishedContracts.length > 0) {
      finishedContracts.forEach((contract) => {
        handleContractSettlementMartingale(contract);
        const isWin = contract.status === "WON";
        if (isWin) {
          if (authInfo) {
            // Live account balance is updated directly by the real Deriv server balance subscription updates,
            // so we do not modify the balance state here locally to avoid UI conflicts.
          } else {
            setSandboxBalance((b) => b + contract.payout);
          }
        }

        setContractHistory((hist) => {
          if (hist.some((h) => h.id === contract.id)) return hist;
          return [contract, ...hist].slice(0, 100);
        });
        setSelectedContractForAnalysis(contract);
        recordTradeToLearningMemory(contract); // Record to persistent ML database!
      });

      updateActiveContracts(stillActive);
    } else {
      // Even if no contract finished, some ticks might be collected - update if changed
      const tickCountChanged = stillActive.some((c, i) => c.ticksCollected.length !== currentContracts[i].ticksCollected.length);
      if (tickCountChanged) {
        updateActiveContracts(stillActive);
      }
    }
  };

  // Helper solvers for multi-asset AI scanner
  const getAssetAutoSolvedOffset = (symbol: string, type: "Higher" | "Lower", spot: number, stakeVal: number, durType: "ticks" | "minutes", durVal: number): number => {
    const sigma = getAssetSigma(symbol, spot);
    let targetFactor = 1.02; // Default 2% yield
    if (autoBarrierTarget === "usd_0_02") {
      targetFactor = 1 + 0.02 / stakeVal;
    }
    let p_win = 0.95 / targetFactor;
    p_win = Math.max(0.01, Math.min(0.99, p_win));

    const isFrx = symbol.includes("frx");
    const decimals = isFrx ? 5 : 2;

    if (type === "Higher") {
      let offset = Number((normalInverseCDF(1 - p_win) * sigma).toFixed(decimals));
      if (symbol === "RDBEAR") {
        offset = -Math.max(1.0, Math.abs(offset));
      }
      return offset;
    } else {
      let offset = Number((normalInverseCDF(p_win) * sigma).toFixed(decimals));
      if (symbol === "RDBEAR") {
        offset = Math.max(1.0, Math.abs(offset));
      }
      return offset;
    }
  };

  const getAssetPayoutPercentageForOffset = (symbol: string, type: "Higher" | "Lower", offset: number, spot: number): number => {
    const sigma = getAssetSigma(symbol, spot);
    let p_win = 0.5;
    if (type === "Higher") {
      p_win = 1 - normalCDF(offset / sigma);
    } else {
      p_win = normalCDF(offset / sigma);
    }
    
    p_win = Math.max(0.005, Math.min(0.995, p_win));
    const factor = 0.95 / p_win;
    const pct = Math.max(0.1, (factor - 1) * 100);
    return Number(pct.toFixed(1));
  };

  // Generalized Place Higher/Lower Contract (with multi-asset override support for AI scanner)
  const purchaseContract = (
    type: "Higher" | "Lower", 
    assetOverride?: DerivAsset, 
    stakeOverride?: number, 
    durationOverride?: number,
    customOffsetOverride?: number
  ) => {
    // 1. Strict single active trade constraint:
    // We shouldn't trade until we settle the last trade being traded (both manual and autopilot).
    if (activeContractsRef.current.length > 0) {
      console.warn("[Deriv Trader] A trade is currently active. Please wait for the current trade to settle before placing another.");
      return;
    }

    const targetAsset = assetOverride || activeAsset;
    const baseStake = stakeOverride || stake;
    const targetDuration = durationOverride || durationValue;

    const targetTick = targetAsset.symbol === activeAsset.symbol 
      ? lastTick 
      : allAssetTicks[targetAsset.symbol];

    if (!targetTick) {
      console.warn(`[Deriv Trader] No price feed available for ${targetAsset.name} yet. Wait a brief second for connection.`);
      return;
    }

    const currentSpot = targetTick.quote;
    
    // Resolve barriers and offsets
    let activeOffset = 0;

    if (!autoBarrierMode) {
      activeOffset = type === "Higher" ? barrierOffsetHigher : barrierOffsetLower;
    } else if (customOffsetOverride !== undefined) {
      activeOffset = type === "Higher" ? Math.abs(customOffsetOverride) : -Math.abs(customOffsetOverride);
    } else if (assetOverride) {
      const solved = getAssetAutoSolvedOffset(targetAsset.symbol, type, currentSpot, baseStake, "ticks", 5);
      activeOffset = type === "Higher" ? Math.abs(solved) : -Math.abs(solved);
    } else {
      activeOffset = type === "Higher" ? barrierOffsetHigher : barrierOffsetLower;
    }

    // Force Bear Market Index barrier to stay at +1 or above / -1 or below ONLY when in auto-solver mode
    if (autoBarrierMode && targetAsset.symbol === "RDBEAR") {
      activeOffset = type === "Higher" ? Math.max(1.0, Math.abs(activeOffset)) : -Math.max(1.0, Math.abs(activeOffset));
    }

    // Safeguard: Ensure barrier offset is non-zero. If it is smaller than config.step, adjust it while preserving user's manual sign.
    const config = getAssetBarrierConfig(targetAsset.symbol);
    if (Math.abs(activeOffset) < config.step) {
      const userSign = activeOffset < 0 ? -1 : 1;
      activeOffset = userSign * config.step;
    }

    // Align with step requirements and format to correct decimals
    if (config.step >= 1) {
      const userSign = activeOffset < 0 ? -1 : 1;
      activeOffset = Math.round(Math.abs(activeOffset) / config.step) * config.step * userSign;
      if (activeOffset === 0) {
        activeOffset = userSign * config.step;
      }
    }
    activeOffset = Number(activeOffset.toFixed(config.decimals));

    let targetStake = baseStake;

    // Apply Martingale Stake Calculation if enabled
    if (martingaleEnabled && consecutiveLossesRef.current > 0) {
      if (martingaleModeRef.current === "fixed") {
        // Multiplier-based Martingale
        const calculatedStake = baseStake * Math.pow(martingaleMultiplierRef.current, consecutiveLossesRef.current);
        const martingaleCap = martingaleMaxCapRef.current;
        
        if (calculatedStake > martingaleCap) {
          console.warn(`[MARTINGALE] Calculated stake of $${calculatedStake.toFixed(2)} exceeds cap of $${martingaleCap}. Resetting Martingale.`);
          setConsecutiveLosses(0);
          setMartingaleLossAccumulator(0);
          targetStake = baseStake;
        } else {
          targetStake = Number(calculatedStake.toFixed(2));
          console.log(`[MARTINGALE MULTIPLIER APPLIED] Stake calculated: $${targetStake} using multiplier: ${martingaleMultiplierRef.current} for ${consecutiveLossesRef.current} losses.`);
        }
      } else {
        // Dynamic Recovery Martingale
        const payoutPct = getAssetPayoutPercentageForOffset(targetAsset.symbol, type, activeOffset, currentSpot);
        if (payoutPct > 0) {
          const calculatedStake = (martingaleLossAccumulatorRef.current + baseStake) / (payoutPct / 100);
          const martingaleCap = martingaleMaxCapRef.current;
          
          if (calculatedStake > martingaleCap) {
            console.warn(`[MARTINGALE] Calculated stake of $${calculatedStake.toFixed(2)} exceeds cap of $${martingaleCap}. Resetting Martingale.`);
            setConsecutiveLosses(0);
            setMartingaleLossAccumulator(0);
            targetStake = baseStake;
          } else {
            targetStake = Number(Math.max(1.00, calculatedStake).toFixed(2));
            console.log(`[MARTINGALE APPLIED] Stake calculated: $${targetStake} to recover: $${martingaleLossAccumulatorRef.current} with payout %: ${payoutPct}`);
          }
        }
      }
    }

    if (balance < targetStake) {
      addToast(`Insufficient Balance ($${balance.toFixed(2)}) to purchase DTrader option with stake $${targetStake.toFixed(2)}.`, "warning");
      return;
    }

    const payoutPct = getAssetPayoutPercentageForOffset(targetAsset.symbol, type, activeOffset, currentSpot);
    const activePayout = Number((targetStake * (1 + payoutPct / 100)).toFixed(2));

    const barrier = currentSpot + activeOffset;

    // Verify WebSocket is actually connected and authorized with the server
    const isLiveTrading = isWsAuthorized && socketRef.current && socketRef.current.readyState === WebSocket.OPEN;

    // Deduct stake locally ONLY if we are in Sandbox mode.
    // For live trading, Deriv's server will deduct it and push a balance update automatically.
    if (!isLiveTrading) {
      setSandboxBalance((b) => b - targetStake);
    }

    const numericId = Math.floor(100000 + Math.random() * 900000);
    const conId = String(numericId);

    const newContract: DerivContract = {
      id: conId, // pure numeric id as a string
      symbol: targetAsset.symbol,
      symbolName: targetAsset.name,
      type,
      stake: targetStake,
      payout: activePayout,
      barrierOffset: activeOffset,
      entryPrice: currentSpot,
      barrierPrice: barrier,
      durationType: assetOverride ? "ticks" : durationType,
      durationTicks: assetOverride ? 5 : targetDuration,
      durationMinutes: assetOverride ? 5 : targetDuration,
      ticksCollected: [{ tick: currentSpot, epoch: targetTick.epoch }],
      status: isLiveTrading ? "PENDING" : "OPEN", // Live trades start as PENDING until verified by Deriv
      pendingMessage: "Requesting price proposal...",
      createdAt: Date.now(),
      ticksRemaining: (assetOverride ? "ticks" : durationType) === "ticks" ? (assetOverride ? 5 : targetDuration) : 0,
      secondsRemaining: (assetOverride ? "ticks" : durationType) === "minutes" ? (targetDuration * 60) : undefined,
    };

    updateActiveContracts([newContract, ...activeContractsRef.current]);

    // Send real trade proposal to Deriv if authenticated
    if (isLiveTrading) {
      const contractType = type === "Higher" ? "HIGHER" : "LOWER";
      const durationUnit = (assetOverride ? "ticks" : durationType) === "ticks" ? "t" : "m";
      const durationVal = assetOverride ? 5 : targetDuration;
      
      // format offset as positive or negative string relative offset (e.g. "+0.52", "-0.52")
      const absOffset = Math.abs(activeOffset);
      const signedOffset = type === "Higher" ? `+${absOffset}` : `-${absOffset}`;

      const proposalPayload = {
        proposal: 1,
        amount: targetStake,
        basis: "stake",
        contract_type: contractType,
        currency: authInfo ? authInfo.currency : "USD",
        duration: durationVal,
        duration_unit: durationUnit,
        symbol: targetAsset.symbol,
        underlying_symbol: targetAsset.symbol,
        barrier: signedOffset,
        req_id: 1000000 + numericId
      };

      try {
        socketRef.current.send(JSON.stringify(proposalPayload));
        console.log("Sent real trade proposal to Deriv:", proposalPayload);

        // Safety timeout check: if Deriv doesn't confirm within 10 seconds, remove the pending contract and warn the user
        setTimeout(() => {
          const checkContract = activeContractsRef.current.find(c => c.id === conId && c.status === "PENDING");
          if (checkContract) {
            console.warn(`Trade placement timed out for contract ${conId}. Deriv server didn't respond in time.`);
            updateActiveContracts(activeContractsRef.current.filter(c => c.id !== conId));
            addToast("Trade Execution Timeout: Deriv server is not responding. Please check your token scopes or network connection.", "warning");
          }
        }, 10000);

      } catch (err) {
        console.error("Failed to send proposal:", err);
        updateActiveContracts(activeContractsRef.current.filter(c => c.id !== conId));
        addToast(`Failed to send trade proposal: ${(err as Error).message}`, "error");
      }
    } else {
      // If the user entered a token but isWsAuthorized is false, warn them
      if (derivToken && derivToken.trim() !== "") {
        addToast("Warning: Trade is executed in Sandbox mode because the live WebSocket connection is not authorized yet.", "warning");
      }
    }

    // Send warning/update alert to signal console
    const formattedSpot = currentSpot.toFixed(targetAsset.symbol.includes("frx") ? 5 : 2);
    const textAlert = isLiveTrading
      ? `Initiating real ${type} contract on Deriv for ${targetAsset.name} at spot ${formattedSpot}. Stake: $${targetStake.toFixed(2)}.`
      : `Placed Sandbox ${type} contract on ${targetAsset.name} at spot ${formattedSpot}. Stake: $${targetStake.toFixed(2)}.`;
    
    setJysrSignalsHistory((prev) => [
      { id: String(Date.now()), time: new Date().toLocaleTimeString(), text: textAlert, type: type === "Higher" ? ("bullish" as const) : ("bearish" as const) },
      ...prev
    ].slice(0, 30));
  };

  // Save a token for either demo or real accounts
  const handleSaveToken = (type: "demo" | "real", value: string) => {
    if (!value.trim()) return;
    setAuthError(null);
    setIsAuthenticating(true);

    if (type === "demo") {
      setDemoToken(value.trim());
      localStorage.setItem("deriv_demo_token", value.trim());
      setDemoAuthInfo(null);
      localStorage.removeItem("deriv_demo_auth_info");
      setActiveAccountType("demo");
      localStorage.setItem("deriv_active_account_type", "demo");
      setDemoInput("");
    } else {
      setRealToken(value.trim());
      localStorage.setItem("deriv_real_token", value.trim());
      setRealAuthInfo(null);
      localStorage.removeItem("deriv_real_auth_info");
      setActiveAccountType("real");
      localStorage.setItem("deriv_active_account_type", "real");
      setRealInput("");
    }
  };

  // Clear credentials for a specific account type
  const handleClearToken = (type: "demo" | "real") => {
    setAuthError(null);
    if (type === "demo") {
      setDemoToken("");
      localStorage.removeItem("deriv_demo_token");
      setDemoAuthInfo(null);
      localStorage.removeItem("deriv_demo_auth_info");
    } else {
      setRealToken("");
      localStorage.removeItem("deriv_real_token");
      setRealAuthInfo(null);
      localStorage.removeItem("deriv_real_auth_info");
    }
  };

  // Switch between accounts active type
  const handleSwitchAccount = (type: "demo" | "real") => {
    setAuthError(null);
    setActiveAccountType(type);
    localStorage.setItem("deriv_active_account_type", type);
  };

  // Reset Sandbox Account
  const handleResetSandbox = () => {
    setSandboxBalance(10000.0);
    setContractHistory([]);
    updateActiveContracts([]);
  };

  // Svg coordinates calculations for the light theme chart with proper price & time scales
  const getSvgCoordinates = () => {
    if (tickHistory.length < 2) return [];
    const min = Math.min(...tickHistory);
    const max = Math.max(...tickHistory);
    const padding = (max - min) * 0.1 || 1;
    const yMin = min - padding;
    const yMax = max + padding;

    const width = 1000;
    const height = 300;

    const paddingLeft = 100;
    const paddingRight = 40;
    const paddingTop = 20;
    const paddingBottom = 40;

    const plotWidth = width - paddingLeft - paddingRight;
    const plotHeight = height - paddingTop - paddingBottom;

    return tickHistory.map((val, idx) => {
      const x = paddingLeft + (idx / (tickHistory.length - 1)) * plotWidth;
      const y = paddingTop + plotHeight - ((val - yMin) / (yMax - yMin)) * plotHeight;
      return { x, y, val };
    });
  };

  // Simple Moving Average (SMA) Calculation over tickHistory
  const getSmaValues = (period: number) => {
    return tickHistory.map((_, idx) => {
      const start = Math.max(0, idx - period + 1);
      const sub = tickHistory.slice(start, idx + 1);
      const sum = sub.reduce((acc, v) => acc + v, 0);
      return sum / sub.length;
    });
  };

  // Bollinger Bands (Middle, Upper, Lower) over tickHistory
  const getBbandsValues = (period: number) => {
    const sma = getSmaValues(period);
    return tickHistory.map((_, idx) => {
      const start = Math.max(0, idx - period + 1);
      const sub = tickHistory.slice(start, idx + 1);
      const mean = sma[idx];
      const variance = sub.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / sub.length;
      const stdDev = Math.sqrt(variance);
      return {
        middle: mean,
        upper: mean + 1.2 * stdDev,
        lower: mean - 1.2 * stdDev,
      };
    });
  };

  const svgCoords = getSvgCoordinates();

  return (
    <div id="deriv-dtrader-container" className="flex flex-col h-full bg-[#f8fafc] text-slate-800 font-sans">
      
      {/* Dynamic Light Theme Platform Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-sm z-10">
        <div className="flex items-center space-x-3">
          <div className="bg-[#ff444f] text-white px-2 py-1 rounded-lg font-black text-xs tracking-wider flex items-center shadow-sm">
            <span>D</span>
            <span className="text-[10px] ml-0.5 font-bold">TRADER</span>
          </div>
          <span className="text-slate-300 font-extrabold text-sm font-mono">/</span>
          <span className="text-xs text-slate-500 font-black tracking-wider uppercase">
            Higher &amp; Lower Options Terminal
          </span>
        </div>

        {/* Live Status and Account Center */}
        <div className="flex items-center space-x-3">
          {/* Connection Status Indicator */}
          <div className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black border uppercase tracking-wider ${
            wsStatus === "connected" 
              ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
              : "bg-rose-50 text-rose-700 border-rose-200 animate-pulse"
          }`}>
            <span className={`w-2 h-2 rounded-full ${wsStatus === "connected" ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
            <span>{wsStatus === "connected" ? "Deriv Online" : "Deriv Offline"}</span>
          </div>

          {/* Quick Account Switcher */}
          <div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200 text-xs font-bold">
            <button
              type="button"
              onClick={() => handleSwitchAccount("demo")}
              className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase transition cursor-pointer ${
                activeAccountType === "demo"
                  ? "bg-[#ff444f] text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-800"
              }`}
            >
              Demo
            </button>
            <button
              type="button"
              onClick={() => handleSwitchAccount("real")}
              className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase transition cursor-pointer ${
                activeAccountType === "real"
                  ? "bg-[#ff444f] text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-800"
              }`}
            >
              Real
            </button>
          </div>

          {/* Balance Presentation */}
          <div className={`flex items-center space-x-2.5 px-3.5 py-1.5 rounded-xl border shadow-xs ${
            authInfo 
              ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
              : "bg-slate-50 border-slate-200 text-slate-800"
          }`}>
            <div className="text-left font-mono">
              <span className="text-[8px] font-bold block uppercase text-slate-400 tracking-wider">
                {activeAccountType === "demo" 
                  ? (demoToken ? "Demo (Authorized)" : "Demo Sandbox") 
                  : (realToken ? "Real (Authorized)" : "Real Token Missing")
                }
              </span>
              <span className="text-xs font-black">
                {currencySymbol} {balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            {authInfo ? (
              <button
                type="button"
                onClick={() => handleClearToken(activeAccountType)}
                title="Disconnect Current Token"
                className="p-1 hover:bg-emerald-100 rounded-lg text-emerald-700 transition cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            ) : (
              activeAccountType === "demo" && (
                <button
                  type="button"
                  onClick={handleResetSandbox}
                  title="Reset Sandbox Balance & Trade History"
                  className="p-1 hover:bg-slate-200 rounded-lg text-slate-500 hover:text-[#ff444f] transition cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              )
            )}
          </div>

          {/* Trading Journal Button */}
          <button
            type="button"
            id="trading-journal-header-btn"
            onClick={() => setIsJournalOpen(!isJournalOpen)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border font-bold text-xs transition cursor-pointer ${
              isJournalOpen 
                ? "bg-purple-100 text-purple-800 border-purple-300" 
                : "bg-purple-50/50 hover:bg-purple-100 text-purple-700 border-purple-200"
            }`}
          >
            <BookOpen className="w-4 h-4 text-purple-600" />
            <span className="hidden sm:inline">Trading Journal</span>
            {accumulatedLessons.length > 0 && (
              <span className="bg-purple-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-black font-mono">
                {accumulatedLessons.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowTokenHelp(!showTokenHelp)}
            className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded-full transition cursor-pointer"
            title="API Token Help"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Help Banner if clicked */}
      {showTokenHelp && !authInfo && (
        <div className="bg-amber-50 border-b border-amber-200 p-4 text-xs text-amber-900 text-left transition-all">
          <div className="max-w-4xl mx-auto flex items-start space-x-3">
            <Shield className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <h4 className="font-extrabold flex items-center space-x-1">
                <span>Secure API Token Authentication</span>
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              </h4>
              <p className="leading-relaxed text-amber-800">
                To connect your actual Deriv account balance (Demo VRTC or Real CR):
              </p>
              <ol className="list-decimal pl-4 space-y-1 text-amber-800">
                <li>Log in to your Deriv.com platform.</li>
                <li>Go to <strong>Settings &gt; API Token</strong>.</li>
                <li>Create a token with <strong>"Read"</strong> and <strong>"Trade"</strong> scopes enabled.</li>
                <li>Copy the generated token, paste it in the field above, and click <strong>Authorize</strong>.</li>
              </ol>
              <p className="text-[10px] text-amber-700 italic pt-1">
                Note: Your token is held strictly in local secure client memory and dispatched directly to Deriv's certified WebSocket gate. We never collect or log your private credentials.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowTokenHelp(false)}
              className="text-amber-600 hover:text-amber-900 font-black cursor-pointer px-2"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Authorization Error Message if any */}
      {authError && (
        <div className="bg-red-50 border-b border-red-100 px-4 py-2.5 text-xs text-red-700 font-semibold text-center flex items-center justify-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span>{authError} Logging into sandbox simulator mode instead.</span>
          <button type="button" onClick={() => setAuthError(null)} className="text-red-900 font-black ml-2 hover:underline cursor-pointer">✕</button>
        </div>
      )}

      {/* Main trading desk content: split into Left (Asset choice & Chart) & Right (Contract parameters) */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-y-auto lg:overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
        
        {/* Left pane: Asset selection, chart & contract records */}
        <div className="flex-1 flex flex-col min-h-0 bg-slate-50 lg:overflow-y-auto custom-scrollbar">
          
          {/* Top section: Asset Picker & Live quote display */}
          <div className="bg-white border-b border-slate-200 p-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowAssetDropdown(!showAssetDropdown)}
                className={`bg-white border px-3.5 py-2 rounded-xl text-xs font-black flex items-center space-x-2 transition cursor-pointer shadow-xs ${
                  !isMarketAvailable(activeAsset.symbol)
                    ? "border-rose-300 hover:border-rose-400 text-rose-700 bg-rose-50/30"
                    : "border-slate-300 hover:border-slate-400 text-slate-800"
                }`}
              >
                <Coins className={`w-4 h-4 ${!isMarketAvailable(activeAsset.symbol) ? "text-rose-500 animate-pulse" : "text-[#ff444f]"}`} />
                <span>
                  {activeAsset.name} ({activeAsset.symbol})
                  {!isMarketAvailable(activeAsset.symbol) && " [LOCKED / SUSPENDED]"}
                </span>
                {!isMarketAvailable(activeAsset.symbol) ? (
                  <Lock className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                ) : (
                  <Sliders className="w-3 h-3 text-slate-400" />
                )}
              </button>

              {showAssetDropdown && (
                <div className="absolute left-0 mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 divide-y divide-slate-100 overflow-hidden">
                  <div className="p-2 bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center justify-between">
                    <span>Select Deriv Index / Asset</span>
                    <span className="text-[9px] text-emerald-500 font-bold font-mono">Silent Scanner Live</span>
                  </div>
                  <div className="max-h-72 overflow-y-auto custom-scrollbar p-1 space-y-0.5">
                    {SUPPORTED_ASSETS.map((asset) => {
                      const available = isMarketAvailable(asset.symbol);
                      return (
                        <button
                          key={asset.symbol}
                          type="button"
                          onClick={() => {
                            setActiveAsset(asset);
                            setShowAssetDropdown(false);
                          }}
                          className={`w-full text-left px-3 py-2.5 rounded-lg text-xs flex items-center justify-between transition cursor-pointer ${
                            activeAsset.symbol === asset.symbol
                              ? "bg-red-50 text-[#ff444f] font-black border border-red-100"
                              : "text-slate-700 hover:bg-slate-50 border border-transparent"
                          } ${!available ? "opacity-60 bg-slate-50/60" : ""}`}
                        >
                          <div className="flex items-center space-x-2">
                            {!available && <Lock className="w-3 h-3 text-rose-500 shrink-0" />}
                            <div>
                              <div className={`font-bold ${!available ? "text-slate-400 line-through" : "text-slate-800"}`}>
                                {asset.name}
                              </div>
                              <div className="text-[9px] text-slate-400 font-semibold font-mono">{asset.category}</div>
                            </div>
                          </div>
                          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                            !available 
                              ? "text-rose-500 bg-rose-50 border border-rose-100/60 font-black" 
                              : "text-slate-500 bg-slate-100"
                          }`}>
                            {!available ? "Locked" : asset.symbol}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Current Spot Quote */}
            <div className="flex items-center space-x-3">
              <div className="text-right">
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Spot Price</span>
                <span className={`text-base font-black font-mono transition-colors duration-200 ${
                  tickHistory.length > 1 && tickHistory[tickHistory.length - 1] >= tickHistory[tickHistory.length - 2]
                    ? "text-[#0ecb81]"
                    : "text-[#f6465d]"
                }`}>
                  {lastTick ? lastTick.quote.toFixed(activeAsset.symbol.includes("frx") ? 5 : 2) : "Fetching..."}
                </span>
              </div>

              {/* Status Dot */}
              <div className="flex items-center space-x-1.5 bg-slate-100 px-2.5 py-1 rounded-lg text-[10px] font-mono border border-slate-200">
                <span className={`w-2 h-2 rounded-full ${
                  wsStatus === "connected" ? "bg-emerald-500 animate-pulse" : wsStatus === "connecting" ? "bg-amber-400" : "bg-rose-500"
                }`} />
                <span className="text-slate-600 uppercase font-black tracking-tight">{wsStatus}</span>
                {wsStatus === "disconnected" && (
                  <button
                    type="button"
                    onClick={() => {
                      setReconnectTrigger((prev) => prev + 1);
                    }}
                    className="ml-1 text-[#ff444f] hover:underline font-extrabold cursor-pointer"
                    title="Force immediate reconnect"
                  >
                    (Retry)
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Interactive Tick Chart with SVG in Light Theme */}
          <div className="bg-white m-4 p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center min-h-[350px] relative">
            
            {/* HUD Indicator Toolbar */}
            {tickHistory.length > 1 && (
              <div className="absolute top-2.5 right-2.5 flex items-center space-x-1.5 bg-slate-50/95 border border-slate-200 p-1 rounded-xl text-[10px] font-mono shadow-xs z-25">
                <span className="text-slate-400 font-bold px-1.5 uppercase tracking-wider text-[8px] border-r border-slate-200">HUD Overlay</span>
                
                <button
                  type="button"
                  onClick={() => setShowSma(!showSma)}
                  className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase transition-all cursor-pointer ${
                    showSma 
                      ? "bg-purple-600 text-white shadow-xs" 
                      : "bg-white text-slate-500 hover:text-slate-800 border border-slate-200/85"
                  }`}
                >
                  SMA (9)
                </button>
                
                <button
                  type="button"
                  onClick={() => setShowBbands(!showBbands)}
                  className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase transition-all cursor-pointer ${
                    showBbands 
                      ? "bg-purple-600 text-white shadow-xs" 
                      : "bg-white text-slate-500 hover:text-slate-800 border border-slate-200/85"
                  }`}
                >
                  B-Bands
                </button>

                <button
                  type="button"
                  onClick={() => setShowPocOverlay(!showPocOverlay)}
                  className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase transition-all cursor-pointer ${
                    showPocOverlay 
                      ? "bg-red-600 text-white shadow-xs" 
                      : "bg-white text-slate-500 hover:text-slate-800 border border-slate-200/85"
                  }`}
                >
                  POC
                </button>

                {activePocAnalysis?.profile && (
                  <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase font-mono ${
                    activePocAnalysis.reaction?.reactionConfirmed 
                      ? "bg-emerald-100 text-emerald-800 border border-emerald-300" 
                      : activePocAnalysis.reaction?.priceReturnedToPoc 
                        ? "bg-amber-100 text-amber-800 border border-amber-300" 
                        : "bg-slate-100 text-slate-600"
                  }`}>
                    POC {activePocAnalysis.pocAlignedBias} {activePocAnalysis.reaction?.reactionType || "WAIT"} ({activePocAnalysis.confidence}%)
                  </span>
                )}
              </div>
            )}

            {/* Interactive Cursor Tracking HUD */}
            {hoveredPoint && (
              <div className="absolute bottom-2.5 left-2.5 bg-slate-900 text-white px-2.5 py-1.5 rounded-xl text-[9px] font-mono space-x-2 border border-slate-800 shadow-xl opacity-95 z-25 flex items-center">
                <span className="text-[#ff444f] font-black">TICK #{hoveredPoint.index + 1}:</span>
                <span className="font-extrabold text-slate-100">${hoveredPoint.val.toFixed(activeAsset.symbol.includes("frx") ? 5 : 2)}</span>
              </div>
            )}

            {/* SVG Tick Chart */}
            {tickHistory.length > 1 ? (
              <div className="relative w-full h-[300px] select-none">
                <svg 
                  viewBox="0 0 1000 300" 
                  className="w-full h-full overflow-visible"
                  preserveAspectRatio="none"
                  onMouseMove={(e) => {
                    if (tickHistory.length < 2) return;
                    const svg = e.currentTarget;
                    const rect = svg.getBoundingClientRect();
                    const clientX = e.clientX - rect.left;
                    const svgX = (clientX / rect.width) * 1000;

                    // Compute matching coords
                    const min = Math.min(...tickHistory);
                    const max = Math.max(...tickHistory);
                    const padding = (max - min) * 0.1 || 1;
                    const yMin = min - padding;
                    const yMax = max + padding;

                    const width = 1000;
                    const height = 300;
                    const paddingLeft = 100;
                    const paddingRight = 40;
                    const paddingTop = 20;
                    const paddingBottom = 40;
                    const plotWidth = width - paddingLeft - paddingRight;
                    const plotHeight = height - paddingTop - paddingBottom;

                    const coords = tickHistory.map((val, idx) => {
                      const x = paddingLeft + (idx / (tickHistory.length - 1)) * plotWidth;
                      const y = paddingTop + plotHeight - ((val - yMin) / (yMax - yMin)) * plotHeight;
                      return { x, y, val };
                    });

                    let closestIndex = 0;
                    let minDiff = Infinity;
                    coords.forEach((coord, idx) => {
                      const diff = Math.abs(coord.x - svgX);
                      if (diff < minDiff) {
                        minDiff = diff;
                        closestIndex = idx;
                      }
                    });

                    const closest = coords[closestIndex];
                    if (closest) {
                      setHoveredPoint({
                        x: closest.x,
                        y: closest.y,
                        val: closest.val,
                        index: closestIndex
                      });
                    }
                  }}
                  onMouseLeave={() => setHoveredPoint(null)}
                >
                  <defs>
                    <linearGradient id="tickLineGradientLight" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ff444f" stopOpacity="0.15" />
                      <stop offset="100%" stopColor="#ff444f" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Axis lines */}
                  {/* Bottom X-Axis */}
                  <line 
                    x1={100} 
                    y1={260} 
                    x2={960} 
                    y2={260} 
                    stroke="#cbd5e1" 
                    strokeWidth="1.5" 
                  />
                  {/* Left Y-Axis */}
                  <line 
                    x1={100} 
                    y1={20} 
                    x2={100} 
                    y2={260} 
                    stroke="#cbd5e1" 
                    strokeWidth="1.5" 
                  />

                  {/* Horizontal grid lines & Price scale labels on Y-Axis */}
                  {(() => {
                    const min = Math.min(...tickHistory);
                    const max = Math.max(...tickHistory);
                    const padding = (max - min) * 0.1 || 1;
                    const yMin = min - padding;
                    const yMax = max + padding;

                    return [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                      const priceVal = yMax - ratio * (yMax - yMin);
                      const y = 20 + ratio * 240;
                      return (
                        <g key={ratio}>
                          <line
                            x1={100}
                            y1={y}
                            x2={960}
                            y2={y}
                            stroke="#f1f5f9"
                            strokeWidth="1.5"
                            strokeDasharray="5,5"
                          />
                          <text
                            x={88}
                            y={y + 4}
                            fill="#64748b"
                            fontSize="10"
                            fontFamily="monospace"
                            fontWeight="black"
                            textAnchor="end"
                          >
                            {priceVal.toFixed(activeAsset.symbol.includes("frx") ? 5 : 2)}
                          </text>
                        </g>
                      );
                    });
                  })()}

                  {/* Vertical grid lines & Timestamps on X-Axis */}
                  {(() => {
                    const numTicks = tickHistory.length;
                    if (numTicks < 2) return null;
                    
                    const numGridLines = 5;
                    return Array.from({ length: numGridLines }).map((_, i) => {
                      const idx = Math.min(numTicks - 1, Math.floor((i / (numGridLines - 1)) * (numTicks - 1)));
                      const x = 100 + (idx / (numTicks - 1)) * 860;
                      
                      const epoch = tickTimes[idx] || (Math.floor(Date.now() / 1000) - (numTicks - 1 - idx));
                      const date = new Date(epoch * 1000);
                      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                      
                      return (
                        <g key={i}>
                          <line
                            x1={x}
                            y1={20}
                            x2={x}
                            y2={260}
                            stroke="#f1f5f9"
                            strokeWidth="1.5"
                            strokeDasharray="5,5"
                          />
                          <line
                            x1={x}
                            y1={260}
                            x2={x}
                            y2={265}
                            stroke="#cbd5e1"
                            strokeWidth="1.5"
                          />
                          <text
                            x={x}
                            y={280}
                            fill="#64748b"
                            fontSize="9"
                            fontFamily="monospace"
                            fontWeight="bold"
                            textAnchor="middle"
                          >
                            {timeStr}
                          </text>
                        </g>
                      );
                    });
                  })()}

                  {/* Active Contract Winning/Losing Shaded Target Zone & Barrier Overlay */}
                  {(() => {
                    const activeContract = activeContracts.find(
                      (c) => c.symbol === activeAsset.symbol && c.status === "OPEN"
                    );
                    if (!activeContract) return null;

                    const min = Math.min(...tickHistory);
                    const max = Math.max(...tickHistory);
                    const padding = (max - min) * 0.1 || 1;
                    const yMin = min - padding;
                    const yMax = max + padding;
                    const getPriceY = (val: number) => {
                      return 20 + 240 - ((val - yMin) / (yMax - yMin)) * 240;
                    };

                    const contractY = getPriceY(activeContract.barrierPrice);
                    if (contractY < 20 || contractY > 260) return null;

                    const isWinning = activeContract.type === "Higher"
                      ? (lastTick && lastTick.quote > activeContract.barrierPrice)
                      : (lastTick && lastTick.quote < activeContract.barrierPrice);

                    const zoneColor = isWinning ? "#10b981" : "#ef4444";
                    const isHigher = activeContract.type === "Higher";

                    return (
                      <g key="active-contract-overlay">
                        {/* Shaded winning/losing target zone */}
                        {isHigher ? (
                          <rect
                            x={100}
                            y={20}
                            width={860}
                            height={Math.max(0, contractY - 20)}
                            fill={zoneColor}
                            fillOpacity={0.06}
                          />
                        ) : (
                          <rect
                            x={100}
                            y={contractY}
                            width={860}
                            height={Math.max(0, 260 - contractY)}
                            fill={zoneColor}
                            fillOpacity={0.06}
                          />
                        )}

                        {/* Barrier Line */}
                        <line
                          x1={100}
                          y1={contractY}
                          x2={960}
                          y2={contractY}
                          stroke={isWinning ? "#10b981" : "#ef4444"}
                          strokeWidth="2"
                          strokeDasharray="4,3"
                        />

                        {/* Horizontal badge label */}
                        <rect
                          x={400}
                          y={contractY - 9}
                          width={200}
                          height="18"
                          rx="4"
                          fill={isWinning ? "#ecfdf5" : "#fef2f2"}
                          stroke={isWinning ? "#10b981" : "#ef4444"}
                          strokeWidth="1"
                        />
                        <text
                          x={500}
                          y={contractY + 3}
                          fill={isWinning ? "#065f46" : "#991b1b"}
                          fontSize="9"
                          fontFamily="monospace"
                          fontWeight="black"
                          textAnchor="middle"
                        >
                          ACTIVE {activeContract.type.toUpperCase()} BARRIER: ${activeContract.barrierPrice.toFixed(activeAsset.symbol.includes("frx") ? 5 : 2)}
                        </text>
                      </g>
                    );
                  })()}

                  {/* Prospective Barrier horizontal indicator lines (DTrader settings offset preview) */}
                  {lastTick && !activeContracts.some(c => c.symbol === activeAsset.symbol && c.status === "OPEN") && (
                    (() => {
                      const min = Math.min(...tickHistory);
                      const max = Math.max(...tickHistory);
                      const padding = (max - min) * 0.1 || 1;
                      const yMin = min - padding;
                      const yMax = max + padding;

                      const getPriceY = (val: number) => {
                        return 20 + 240 - ((val - yMin) / (yMax - yMin)) * 240;
                      };

                      const renderBarrierLine = (offset: number, label: string, strokeColor: string, bgColor: string, textColor: string, borderColor: string, xOffset: number = 50) => {
                        const barrierVal = lastTick.quote + offset;
                        const y = getPriceY(barrierVal);
                        if (y >= 20 && y <= 260) {
                          const formattedOffset = offset >= 0 ? `+${offset.toFixed(activeAsset.symbol.includes("frx") ? 5 : 2)}` : offset.toFixed(activeAsset.symbol.includes("frx") ? 5 : 2);
                          return (
                            <g key={label}>
                              <line
                                x1={100}
                                y1={y}
                                x2={960}
                                y2={y}
                                stroke={strokeColor}
                                strokeWidth="2"
                                strokeDasharray="6,4"
                              />
                              <rect
                                x={xOffset}
                                y={y - 20}
                                width="205"
                                height="16"
                                rx="3"
                                fill={bgColor}
                                stroke={borderColor}
                                strokeWidth="1"
                              />
                              <text
                                x={xOffset + 6}
                                y={y - 8}
                                fill={textColor}
                                fontSize="9"
                                fontWeight="900"
                                fontFamily="monospace"
                              >
                                {label}: {formattedOffset} ({barrierVal.toFixed(activeAsset.symbol.includes("frx") ? 5 : 2)})
                              </text>
                            </g>
                          );
                        }
                        return null;
                      };

                      return (
                        <>
                          {renderBarrierLine(barrierOffsetHigher, autoBarrierMode ? "HIGHER BARRIER" : "HIGHER BARRIER (MANUAL)", "#10b981", "#ecfdf5", "#065f46", "#a7f3d0", 115)}
                          {renderBarrierLine(barrierOffsetLower, autoBarrierMode ? "LOWER BARRIER" : "LOWER BARRIER (MANUAL)", "#ef4444", "#fef2f2", "#991b1b", "#fca5a5", 330)}
                        </>
                      );
                    })()
                  )}

                  {/* Volume Profile Point of Control (POC) Overlay */}
                  {showPocOverlay && activePocAnalysis?.profile && (
                    (() => {
                      const min = Math.min(...tickHistory);
                      const max = Math.max(...tickHistory);
                      const padding = (max - min) * 0.1 || 1;
                      const yMin = min - padding;
                      const yMax = max + padding;
                      const getPriceY = (val: number) => 20 + 240 - ((val - yMin) / (yMax - yMin)) * 240;

                      const { poc, pocZone } = activePocAnalysis.profile!;
                      const reaction = activePocAnalysis.reaction;
                      const pocY = getPriceY(poc.price);
                      const topY = getPriceY(pocZone.top);
                      const botY = getPriceY(pocZone.bottom);
                      const isConfirmed = !!reaction?.reactionConfirmed;
                      const isAtPoc = !!reaction?.priceReturnedToPoc;
                      const color = activePocAnalysis.pocAlignedBias === "BULLISH" ? "#10b981" : activePocAnalysis.pocAlignedBias === "BEARISH" ? "#ef4444" : "#f59e0b";

                      if (pocY < 20 || pocY > 260) return null;

                      return (
                        <g key="poc-profile-overlay">
                          {/* POC reaction zone */}
                          <rect
                            x={100}
                            y={Math.min(topY, botY)}
                            width={860}
                            height={Math.max(4, Math.abs(botY - topY))}
                            fill={color}
                            fillOpacity={isConfirmed ? 0.15 : 0.08}
                          />
                          {/* Red horizontal POC line */}
                          <line
                            x1={100}
                            y1={pocY}
                            x2={960}
                            y2={pocY}
                            stroke={color}
                            strokeWidth={isConfirmed ? "2.5" : "1.5"}
                            strokeDasharray={isConfirmed ? "none" : "6,3"}
                          />
                          {/* Label badge */}
                          <rect
                            x={560}
                            y={pocY - 18}
                            width="280"
                            height="16"
                            rx="3"
                            fill="#1e293b"
                            fillOpacity="0.9"
                            stroke={color}
                            strokeWidth="1"
                          />
                          <text
                            x={566}
                            y={pocY - 6}
                            fill="#f8fafc"
                            fontSize="9"
                            fontWeight="900"
                            fontFamily="monospace"
                          >
                            POC: {poc.price.toFixed(activeAsset.symbol.includes("frx") ? 5 : 2)} | {isConfirmed ? "✓ REACT CONFIRMED" : isAtPoc ? "⟲ RETESTING POC" : "→ WAITING PULLBACK"} ({activePocAnalysis.confidence}%)
                          </text>
                        </g>
                      );
                    })()
                  )}

                  {/* Bollinger Bands Shaded Channel */}
                  {showBbands && (
                    (() => {
                      const min = Math.min(...tickHistory);
                      const max = Math.max(...tickHistory);
                      const padding = (max - min) * 0.1 || 1;
                      const yMin = min - padding;
                      const yMax = max + padding;
                      const getPriceY = (val: number) => {
                        return 20 + 240 - ((val - yMin) / (yMax - yMin)) * 240;
                      };

                      const bBandsPeriod = 10;
                      const smaForBbands = getSmaValues(bBandsPeriod);
                      const bBandsValues = tickHistory.map((_, idx) => {
                        const start = Math.max(0, idx - bBandsPeriod + 1);
                        const sub = tickHistory.slice(start, idx + 1);
                        const mean = smaForBbands[idx];
                        const variance = sub.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / sub.length;
                        const stdDev = Math.sqrt(variance);
                        return {
                          upper: mean + 1.2 * stdDev,
                          lower: mean - 1.2 * stdDev,
                        };
                      });
                      
                      const bBandsCoords = bBandsValues.map((bands, idx) => {
                        const x = 100 + (idx / (tickHistory.length - 1)) * 860;
                        const yUpper = getPriceY(bands.upper);
                        const yLower = getPriceY(bands.lower);
                        return { x, yUpper, yLower };
                      });

                      if (bBandsCoords.length < 2) return null;

                      return (
                        <g key="bollinger-bands">
                          {/* Shaded channel path */}
                          <path
                            d={`M ${bBandsCoords.map(c => `${c.x},${c.yUpper}`).join(" L ")} L ${bBandsCoords.slice().reverse().map(c => `${c.x},${c.yLower}`).join(" L ")} Z`}
                            fill="#818cf8"
                            fillOpacity="0.06"
                          />
                          {/* Upper line */}
                          <path
                            d={`M ${bBandsCoords.map(c => `${c.x},${c.yUpper}`).join(" L ")}`}
                            fill="none"
                            stroke="#818cf8"
                            strokeWidth="1.5"
                            strokeDasharray="4,3"
                            strokeOpacity="0.8"
                          />
                          {/* Lower line */}
                          <path
                            d={`M ${bBandsCoords.map(c => `${c.x},${c.yLower}`).join(" L ")}`}
                            fill="none"
                            stroke="#818cf8"
                            strokeWidth="1.5"
                            strokeDasharray="4,3"
                            strokeOpacity="0.8"
                          />
                        </g>
                      );
                    })()
                  )}

                  {/* SMA (9) Trend Line Overlay */}
                  {showSma && (
                    (() => {
                      const min = Math.min(...tickHistory);
                      const max = Math.max(...tickHistory);
                      const padding = (max - min) * 0.1 || 1;
                      const yMin = min - padding;
                      const yMax = max + padding;
                      const getPriceY = (val: number) => {
                        return 20 + 240 - ((val - yMin) / (yMax - yMin)) * 240;
                      };

                      const smaValues = getSmaValues(9);
                      const smaCoords = smaValues.map((val, idx) => {
                        const x = 100 + (idx / (tickHistory.length - 1)) * 860;
                        const y = getPriceY(val);
                        return { x, y };
                      });

                      if (smaCoords.length < 2) return null;

                      return (
                        <path
                          key="sma-trendline"
                          d={`M ${smaCoords.map(c => `${c.x},${c.y}`).join(" L ")}`}
                          fill="none"
                          stroke="#3b82f6"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeOpacity="0.8"
                        />
                      );
                    })()
                  )}

                  {/* ADVANCED GURU ANALYSING OVERLAY: TRENDLINES & S/R ZONES */}
                  {tickHistory.length > 5 && (
                    (() => {
                      const min = Math.min(...tickHistory);
                      const max = Math.max(...tickHistory);
                      const padding = (max - min) * 0.1 || 1;
                      const yMin = min - padding;
                      const yMax = max + padding;
                      const getPriceY = (val: number) => {
                        return 20 + 240 - ((val - yMin) / (yMax - yMin)) * 240;
                      };
                      const getX = (idx: number) => {
                        return 100 + (idx / (tickHistory.length - 1)) * 860;
                      };

                      const prices = tickHistory;
                      const len = prices.length;

                      // Swings detection (Pivot High / Pivot Low with window size 3)
                      const swingHighs: { idx: number; val: number }[] = [];
                      const swingLows: { idx: number; val: number }[] = [];

                      for (let i = 2; i < len - 2; i++) {
                        if (prices[i] >= prices[i - 1] && prices[i] >= prices[i - 2] && prices[i] >= prices[i + 1] && prices[i] >= prices[i + 2]) {
                          swingHighs.push({ idx: i, val: prices[i] });
                        }
                        if (prices[i] <= prices[i - 1] && prices[i] <= prices[i - 2] && prices[i] <= prices[i + 1] && prices[i] <= prices[i + 2]) {
                          swingLows.push({ idx: i, val: prices[i] });
                        }
                      }

                      // Find highest peaks / troughs if not enough swings found
                      if (swingHighs.length < 2) {
                        const sortedIndexes = [...prices.keys()].sort((a, b) => prices[b] - prices[a]);
                        const h1 = sortedIndexes[0] || 0;
                        let h2 = sortedIndexes[1] || 0;
                        for (let i = 1; i < sortedIndexes.length; i++) {
                          if (Math.abs(sortedIndexes[i] - h1) > 3) {
                            h2 = sortedIndexes[i];
                            break;
                          }
                        }
                        swingHighs.push({ idx: Math.min(h1, h2), val: prices[Math.min(h1, h2)] });
                        swingHighs.push({ idx: Math.max(h1, h2), val: prices[Math.max(h1, h2)] });
                      }

                      if (swingLows.length < 2) {
                        const sortedIndexes = [...prices.keys()].sort((a, b) => prices[a] - prices[b]);
                        const l1 = sortedIndexes[0] || 0;
                        let l2 = sortedIndexes[1] || 0;
                        for (let i = 1; i < sortedIndexes.length; i++) {
                          if (Math.abs(sortedIndexes[i] - l1) > 3) {
                            l2 = sortedIndexes[i];
                            break;
                          }
                        }
                        swingLows.push({ idx: Math.min(l1, l2), val: prices[Math.min(l1, l2)] });
                        swingLows.push({ idx: Math.max(l1, l2), val: prices[Math.max(l1, l2)] });
                      }

                      swingHighs.sort((a, b) => a.idx - b.idx);
                      swingLows.sort((a, b) => a.idx - b.idx);

                      const lastTwoHighs = swingHighs.slice(-2);
                      const lastTwoLows = swingLows.slice(-2);

                      const lines: React.ReactNode[] = [];

                      // Horizontal Support
                      const supportY = getPriceY(min);
                      lines.push(
                        <g key="horizontal-sup">
                          <line
                            x1={100}
                            y1={supportY}
                            x2={960}
                            y2={supportY}
                            stroke="#10b981"
                            strokeWidth="1.5"
                            strokeDasharray="4,4"
                            strokeOpacity="0.4"
                          />
                          <text
                            x={955}
                            y={supportY - 5}
                            fill="#10b981"
                            fontSize="8"
                            fontFamily="monospace"
                            fontWeight="bold"
                            textAnchor="end"
                            fillOpacity="0.7"
                          >
                            SUPPORT ({min.toFixed(activeAsset.symbol.includes("frx") ? 5 : 2)})
                          </text>
                        </g>
                      );

                      // Horizontal Resistance
                      const resistanceY = getPriceY(max);
                      lines.push(
                        <g key="horizontal-res">
                          <line
                            x1={100}
                            y1={resistanceY}
                            x2={960}
                            y2={resistanceY}
                            stroke="#ef4444"
                            strokeWidth="1.5"
                            strokeDasharray="4,4"
                            strokeOpacity="0.4"
                          />
                          <text
                            x={955}
                            y={resistanceY + 11}
                            fill="#ef4444"
                            fontSize="8"
                            fontFamily="monospace"
                            fontWeight="bold"
                            textAnchor="end"
                            fillOpacity="0.7"
                          >
                            RESISTANCE ({max.toFixed(activeAsset.symbol.includes("frx") ? 5 : 2)})
                          </text>
                        </g>
                      );

                      // Peak Trendline
                      if (lastTwoHighs.length === 2) {
                        const h1 = lastTwoHighs[0];
                        const h2 = lastTwoHighs[1];
                        const x1 = getX(h1.idx);
                        const y1 = getPriceY(h1.val);
                        const x2 = getX(h2.idx);
                        const y2 = getPriceY(h2.val);

                        const slope = (y2 - y1) / (x2 - x1);
                        const intercept = y1 - slope * x1;
                        const startY = slope * 100 + intercept;
                        const endY = slope * 960 + intercept;

                        if (startY >= 20 && startY <= 260 && endY >= 20 && endY <= 260) {
                          lines.push(
                            <g key="peak-trend">
                              <line
                                x1={100}
                                y1={startY}
                                x2={960}
                                y2={endY}
                                stroke="#f59e0b"
                                strokeWidth="2"
                                strokeDasharray="3,3"
                                strokeOpacity="0.75"
                              />
                              <text
                                x={900}
                                y={Math.max(25, Math.min(255, endY - 6))}
                                fill="#f59e0b"
                                fontSize="8"
                                fontFamily="monospace"
                                fontWeight="black"
                                textAnchor="end"
                              >
                                BEAR TRENDLINE
                              </text>
                            </g>
                          );
                        }
                      }

                      // Trough Trendline
                      if (lastTwoLows.length === 2) {
                        const l1 = lastTwoLows[0];
                        const l2 = lastTwoLows[1];
                        const x1 = getX(l1.idx);
                        const y1 = getPriceY(l1.val);
                        const x2 = getX(l2.idx);
                        const y2 = getPriceY(l2.val);

                        const slope = (y2 - y1) / (x2 - x1);
                        const intercept = y1 - slope * x1;
                        const startY = slope * 100 + intercept;
                        const endY = slope * 960 + intercept;

                        if (startY >= 20 && startY <= 260 && endY >= 20 && endY <= 260) {
                          lines.push(
                            <g key="trough-trend">
                              <line
                                x1={100}
                                y1={startY}
                                x2={960}
                                y2={endY}
                                stroke="#10b981"
                                strokeWidth="2"
                                strokeDasharray="3,3"
                                strokeOpacity="0.75"
                              />
                              <text
                                x={900}
                                y={Math.max(25, Math.min(255, endY + 12))}
                                fill="#10b981"
                                fontSize="8"
                                fontFamily="monospace"
                                fontWeight="black"
                                textAnchor="end"
                              >
                                BULL TRENDLINE
                              </text>
                            </g>
                          );
                        }
                      }

                      return <>{lines}</>;
                    })()
                  )}

                  {/* Area fill under tick path */}
                  <path
                    d={`M ${svgCoords[0]?.x},260 L ${svgCoords.map(c => `${c.x},${c.y}`).join(" L ")} L ${svgCoords[svgCoords.length - 1]?.x},260 Z`}
                    fill="url(#tickLineGradientLight)"
                  />

                  {/* Plot connecting smooth path */}
                  <path
                    d={`M ${svgCoords.map(c => `${c.x},${c.y}`).join(" L ")}`}
                    fill="none"
                    stroke="#ff444f"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Live Horizontal Tracking line for last tick */}
                  {lastTick && (
                    (() => {
                      const min = Math.min(...tickHistory);
                      const max = Math.max(...tickHistory);
                      const padding = (max - min) * 0.1 || 1;
                      const yMin = min - padding;
                      const yMax = max + padding;

                      const currentPrice = lastTick.quote;
                      const y = 20 + 240 - ((currentPrice - yMin) / (yMax - yMin)) * 240;
                      
                      if (y >= 20 && y <= 260) {
                        const isUp = tickHistory.length > 1 && tickHistory[tickHistory.length - 1] >= tickHistory[tickHistory.length - 2];
                        const color = isUp ? "#10b981" : "#ef4444";
                        
                        return (
                          <g>
                            <line
                              x1={100}
                              y1={y}
                              x2={960}
                              y2={y}
                              stroke={color}
                              strokeWidth="1"
                              strokeDasharray="3,3"
                            />
                            
                            <circle
                              cx={svgCoords[svgCoords.length - 1]?.x}
                              cy={y}
                              r="5"
                              fill={color}
                              stroke="#ffffff"
                              strokeWidth="2"
                            />
                            
                            <circle
                              cx={svgCoords[svgCoords.length - 1]?.x}
                              cy={y}
                              r="12"
                              fill="none"
                              stroke={color}
                              strokeWidth="2"
                              className="animate-ping"
                              style={{ transformOrigin: `${svgCoords[svgCoords.length - 1]?.x}px ${y}px` }}
                            />

                            <rect
                              x={4}
                              y={y - 9}
                              width={92}
                              height="18"
                              rx="3"
                              fill={color}
                            />
                            <text
                              x={50}
                              y={y + 3}
                              fill="#ffffff"
                              fontSize="10"
                              fontFamily="monospace"
                              fontWeight="black"
                              textAnchor="middle"
                            >
                              {currentPrice.toFixed(activeAsset.symbol.includes("frx") ? 5 : 2)}
                            </text>
                          </g>
                        );
                      }
                      return null;
                    })()
                  )}

                  {/* Highlight dots for live ticks collected since active contract opened */}
                  {(() => {
                    const activeContract = activeContracts.find(
                      (c) => c.symbol === activeAsset.symbol && c.status === "OPEN"
                    );
                    if (!activeContract) return null;

                    const lastN = activeContract.ticksCollected.length;
                    if (lastN <= 0) return null;

                    return svgCoords.slice(-lastN).map((coord, idx) => {
                      const isWinPoint = activeContract.type === "Higher"
                        ? coord.val > activeContract.barrierPrice
                        : coord.val < activeContract.barrierPrice;

                      return (
                        <g key={`collected-tick-${idx}`}>
                          <circle
                            cx={coord.x}
                            cy={coord.y}
                            r="6"
                            fill={isWinPoint ? "#10b981" : "#ef4444"}
                            stroke="#ffffff"
                            strokeWidth="2"
                          />
                          <text
                            x={coord.x}
                            y={coord.y - 12}
                            fill={isWinPoint ? "#047857" : "#b91c1c"}
                            fontSize="8"
                            fontFamily="monospace"
                            fontWeight="black"
                            textAnchor="middle"
                          >
                            T{idx + 1}
                          </text>
                        </g>
                      );
                    });
                  })()}

                  {/* Interactive Cursor crosshair lines */}
                  {hoveredPoint && (
                    <g key="interactive-cursor">
                      {/* Vertical line */}
                      <line
                        x1={hoveredPoint.x}
                        y1={20}
                        x2={hoveredPoint.x}
                        y2={260}
                        stroke="#6366f1"
                        strokeWidth="1"
                        strokeDasharray="4,4"
                        strokeOpacity="0.7"
                      />
                      {/* Horizontal line */}
                      <line
                        x1={100}
                        y1={hoveredPoint.y}
                        x2={960}
                        y2={hoveredPoint.y}
                        stroke="#6366f1"
                        strokeWidth="1"
                        strokeDasharray="4,4"
                        strokeOpacity="0.7"
                      />
                      {/* Hover dot */}
                      <circle
                        cx={hoveredPoint.x}
                        cy={hoveredPoint.y}
                        r="6"
                        fill="#6366f1"
                        stroke="#ffffff"
                        strokeWidth="2"
                      />
                    </g>
                  )}

                  {/* Dot for each historical tick point */}
                  {svgCoords.map((coord, idx) => {
                    const isLast = idx === svgCoords.length - 1;
                    if (isLast) return null;
                    return (
                      <circle
                        key={idx}
                        cx={coord.x}
                        cy={coord.y}
                        r="3"
                        fill="#94a3b8"
                      />
                    );
                  })}
                </svg>

                {/* Legend overlay */}
                <div className="absolute top-2 left-10 bg-white/95 border border-slate-200 p-2 rounded-xl text-[9px] font-mono space-y-1 shadow-xs z-10 text-left">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-3 h-0.5 bg-[#ff444f]" />
                    <span className="text-slate-600 font-extrabold">Ticks Feed (Live)</span>
                  </div>
                  {showSma && (
                    <div className="flex items-center space-x-1.5">
                      <span className="w-3 h-0.5 bg-blue-500" />
                      <span className="text-slate-600 font-extrabold">SMA (9-period)</span>
                    </div>
                  )}
                  {showBbands && (
                    <div className="flex items-center space-x-1.5">
                      <span className="w-3 h-0.5 bg-indigo-400" />
                      <span className="text-slate-600 font-extrabold">Bollinger Bands</span>
                    </div>
                  )}
                  {autoBarrierMode ? (
                    <>
                      <div className="flex items-center space-x-1.5">
                        <span className="w-3 h-0.5 bg-[#10b981] border-dashed border-t" />
                        <span className="text-slate-600 font-extrabold">Auto solved Upper ({autoBarrierTarget === "usd_0_02" ? "2% Yield" : "Yield mode"})</span>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <span className="w-3 h-0.5 bg-[#ef4444] border-dashed border-t" />
                        <span className="text-slate-600 font-extrabold">Auto solved Lower</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center space-x-1.5">
                      <span className="w-3 h-0.5 bg-[#ff444f] border-dashed border-t" />
                      <span className="text-slate-600 font-extrabold">Manual Offset Target</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center space-y-3 h-[300px] p-6 text-center">
                <RefreshCw className={`w-8 h-8 text-[#ff444f] ${wsStatus === "connecting" ? "animate-spin" : ""}`} />
                <span className="text-xs text-slate-500 font-bold font-mono">
                  {wsStatus === "connecting" 
                    ? `Connecting to live Deriv tick stream (${activeAsset.name})...` 
                    : wsStatus === "disconnected" 
                    ? `Stream disconnected. Click below to reconnect or use sandbox mode.`
                    : "Stream paused. Subscribing to live ticks..."}
                </span>
                {wsStatus === "disconnected" && (
                  <button
                    type="button"
                    onClick={() => {
                      setReconnectTrigger((prev) => prev + 1);
                    }}
                    className="mt-2 bg-[#ff444f] hover:bg-[#e03a43] text-white text-xs font-black px-4 py-2 rounded-xl shadow-sm cursor-pointer transition flex items-center space-x-1.5 animate-bounce"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Reconnect WebSocket Stream</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* JYSR Settlement Learning & Post-Trade Analysis Center */}
          <div className="bg-white border border-slate-200 p-5 m-4 rounded-2xl shadow-sm text-left">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3.5 mb-4">
              <div className="flex items-center space-x-2.5">
                <div className="bg-amber-500 text-white p-1.5 rounded-lg shadow-sm">
                  <Lightbulb className="w-4 h-4 animate-bounce" />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center space-x-1.5">
                    <span>JYSR Settlement Learning &amp; Post-Trade Analysis</span>
                  </h3>
                  <p className="text-[10px] text-slate-400 font-semibold">
                    Real-time pedagogical feedback of settlement forces &amp; random-walk lessons
                  </p>
                </div>
              </div>
              <span className="text-[9px] bg-amber-100 text-amber-800 font-black px-2 py-0.5 rounded uppercase tracking-wider">
                Pedagogical Engine
              </span>
            </div>

            {(() => {
              // Source of truth: either selected contract or the absolute latest finished contract
              const activeForAnalysis = selectedContractForAnalysis || (contractHistory.length > 0 ? contractHistory[0] : null);

              if (!activeForAnalysis) {
                return (
                  <div className="py-8 text-center text-slate-400 text-xs flex flex-col items-center justify-center space-y-2">
                    <div className="bg-slate-50 p-3 rounded-full border border-slate-100">
                      <Lightbulb className="w-6 h-6 text-slate-400" />
                    </div>
                    <span className="font-black text-slate-700">Awaiting Settlement Learning Logs...</span>
                    <p className="text-[10px] text-slate-400 max-w-sm">
                      When a contract settles, the system will instantly analyze the exact forces that led to the Win or Loss so you can learn from the settlement.
                    </p>
                  </div>
                );
              }

              const isWin = activeForAnalysis.status === "WON";
              const priceList = activeForAnalysis.ticksCollected.map(t => t.tick);
              const minPrice = priceList.length > 0 ? Math.min(...priceList, activeForAnalysis.entryPrice) : activeForAnalysis.entryPrice;
              const maxPrice = priceList.length > 0 ? Math.max(...priceList, activeForAnalysis.entryPrice) : activeForAnalysis.entryPrice;
              const totalSpread = maxPrice - minPrice;

              return (
                <div className="space-y-4">
                  {/* Summary Header */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 border border-slate-150 p-3 rounded-xl">
                    <div className="space-y-0.5">
                      <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider block">Target Contract</span>
                      <span className="text-xs font-mono font-black text-slate-800">#{activeForAnalysis.id}</span>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider block">Symbol</span>
                      <span className="text-xs font-mono font-black text-slate-800">{activeForAnalysis.symbol}</span>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider block">Verdict Status</span>
                      <span className={`text-xs font-mono font-black flex items-center space-x-1 ${isWin ? "text-emerald-600" : "text-rose-600"}`}>
                        {isWin ? (
                          <>
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>WON</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5" />
                            <span>LOST</span>
                          </>
                        )}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider block">Trade Direction</span>
                      <span className={`text-[10px] font-mono font-black px-1.5 py-0.5 rounded inline-block ${
                        activeForAnalysis.type === "Higher" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                      }`}>
                        {activeForAnalysis.type.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  {/* Quantitative Analysis Matrix */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="border border-slate-150 p-2.5 rounded-xl text-left bg-white shadow-xs">
                      <span className="text-[9px] text-slate-400 font-bold block">Entry Spot</span>
                      <span className="text-xs font-mono font-black text-slate-700">${activeForAnalysis.entryPrice.toFixed(4)}</span>
                    </div>
                    <div className="border border-slate-150 p-2.5 rounded-xl text-left bg-white shadow-xs">
                      <span className="text-[9px] text-slate-400 font-bold block">Barrier Spot</span>
                      <span className="text-xs font-mono font-black text-slate-700">${activeForAnalysis.barrierPrice.toFixed(4)}</span>
                    </div>
                    <div className="border border-slate-150 p-2.5 rounded-xl text-left bg-white shadow-xs">
                      <span className="text-[9px] text-slate-400 font-bold block">Exit Spot</span>
                      <span className="text-xs font-mono font-black text-slate-700">${activeForAnalysis.exitPrice?.toFixed(4) || "N/A"}</span>
                    </div>
                    <div className="border border-slate-150 p-2.5 rounded-xl text-left bg-white shadow-xs">
                      <span className="text-[9px] text-slate-400 font-bold block">Path Volatility Spread</span>
                      <span className="text-xs font-mono font-black text-slate-700">${totalSpread.toFixed(4)}</span>
                    </div>
                  </div>

                  {/* Written Pedagogical Verdict & Lesson */}
                  <div className={`p-4 rounded-xl border leading-relaxed ${
                    isWin 
                      ? "bg-emerald-50/30 border-emerald-100 text-emerald-900" 
                      : "bg-rose-50/30 border-rose-100 text-rose-900"
                  }`}>
                    <div className="flex items-center space-x-2 mb-2 font-black text-xs uppercase tracking-wider">
                      <Lightbulb className={`w-4 h-4 ${isWin ? "text-emerald-600" : "text-rose-500"}`} />
                      <span>Post-Settlement Analysis &amp; Actionable Insights</span>
                    </div>
                    <p className="text-[11px] font-medium leading-relaxed whitespace-pre-line text-left">
                      {activeForAnalysis.learningAnalysis || generateLearningAnalysis(activeForAnalysis, activeForAnalysis.exitPrice || activeForAnalysis.entryPrice, isWin)}
                    </p>
                  </div>

                  {/* Help notice */}
                  <p className="text-[9px] text-slate-400 font-mono text-center">
                    (Click any row in the **Options Contract Statement** below to load and inspect that specific trade's post-settlement learning log.)
                  </p>
                </div>
              );
            })()}
          </div>

          {/* Automated AI Breakout & Trend Multi-Market Signal Terminal */}
          <div className="bg-white border border-slate-200 p-5 m-4 rounded-2xl shadow-sm">
            <div className="flex flex-wrap items-center justify-between border-b border-slate-200 pb-3.5 mb-4 gap-3">
              <div className="flex items-center space-x-2.5">
                <div className="bg-purple-600 text-white p-1.5 rounded-lg">
                  <Sparkles className="w-4 h-4 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center space-x-1.5">
                    <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                      Automated AI Breakout &amp; Trend Terminal
                    </h3>
                    <span className="text-[8px] bg-purple-100 text-purple-700 font-black px-1.5 py-0.5 rounded uppercase tracking-wider animate-pulse">
                      Live Multi-Scanner
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-semibold text-left">
                    Automated multi-market trend scanning and support/resistance breakout detection
                  </p>
                </div>
              </div>

              {/* Autopilot Master Toggle & POC Sniper Gate */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center space-x-3 bg-purple-50/50 border border-purple-100 px-3 py-1.5 rounded-xl">
                  <span className="text-[10px] text-purple-900 font-black uppercase tracking-wider">
                    MASTER AUTOPILOT:
                  </span>
                  <button
                    type="button"
                    onClick={() => setAutoPilotEnabled(!autoPilotEnabled)}
                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition cursor-pointer border ${
                      autoPilotEnabled
                        ? "bg-purple-600 text-white border-purple-700 shadow-md shadow-purple-500/20"
                        : "bg-white text-slate-500 border-slate-200 hover:text-slate-800"
                    }`}
                  >
                    {autoPilotEnabled ? "● AUTOPILOT ACTIVE" : "AUTOPILOT OFF"}
                  </button>
                </div>

                <div className="flex items-center space-x-2 bg-red-50/50 border border-red-100 px-3 py-1.5 rounded-xl">
                  <span className="text-[10px] text-red-900 font-black uppercase tracking-wider">
                    POC SNIPER:
                  </span>
                  <button
                    type="button"
                    onClick={() => setAutoPilotPocOnly(!autoPilotPocOnly)}
                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition cursor-pointer border ${
                      autoPilotPocOnly
                        ? "bg-red-600 text-white border-red-700 shadow-xs"
                        : "bg-white text-slate-500 border-slate-200 hover:text-slate-800"
                    }`}
                  >
                    {autoPilotPocOnly ? "● POC GATE ON" : "POC GATE OFF"}
                  </button>
                  {activePocAnalysis?.profile && (
                    <span className="text-[9px] font-mono font-bold text-slate-600">
                      {activePocAnalysis.pocAlignedBias} {activePocAnalysis.reaction?.reactionType || "WAIT"} ({activePocAnalysis.confidence}%)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Matrix / List of Symbols Scanner */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 text-left">
              
              {/* Left Column: Multi-Market Live Signal Grid */}
              <div className="md:col-span-8 space-y-2">
                <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider block mb-1">
                  Active Market Scanner Matrix ({SUPPORTED_ASSETS.length} Indices)
                </span>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {SUPPORTED_ASSETS.map((asset) => {
                    // Calculate live signal for each asset based on its live tick history
                    const liveTick = asset.symbol === activeAsset.symbol ? lastTick : allAssetTicks[asset.symbol];
                    const liveHistory = allAssetHistories[asset.symbol] || [];
                    const analysis = computeAssetAISignal(asset.symbol, liveTick ? liveTick.quote : 0, liveHistory);
                    
                    const hasActiveContract = activeContracts.some((c) => c.symbol === asset.symbol);
                    const isScanning = wsStatus === "connected";

                    let signalBadgeColor = "bg-slate-50 text-slate-500 border-slate-200";
                    if (analysis.signal === "HIGHER") signalBadgeColor = "bg-emerald-50 text-emerald-700 border-emerald-200 font-black animate-pulse";
                    if (analysis.signal === "LOWER") signalBadgeColor = "bg-rose-50 text-rose-700 border-rose-200 font-black animate-pulse";

                    return (
                      <div 
                        key={asset.symbol}
                        onClick={() => {
                          setActiveAsset(asset);
                        }}
                        className={`p-2.5 rounded-xl border transition duration-150 cursor-pointer text-left relative overflow-hidden flex flex-col justify-between h-20 ${
                          activeAsset.symbol === asset.symbol
                            ? "bg-purple-50/20 border-purple-300 shadow-xs"
                            : "bg-white hover:bg-slate-50 border-slate-150"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-[9px] font-black text-slate-800 tracking-tight block max-w-[110px] truncate" title={asset.name}>
                              {asset.name}
                            </span>
                            <span className="text-[8px] text-slate-400 font-mono font-bold block">
                              {asset.symbol}
                            </span>
                          </div>
                          
                          {/* Live Signal Badge */}
                          <div className={`text-[8px] font-mono border px-1.5 py-0.5 rounded uppercase font-black ${signalBadgeColor}`}>
                            {analysis.signal === "NEUTRAL" ? "Scanning..." : `${analysis.signal} ${analysis.confidence}%`}
                          </div>
                        </div>

                        <div className="flex items-center justify-between border-t border-slate-100 pt-1.5 mt-1.5">
                          <span className="text-[9px] font-mono font-black text-slate-700">
                            {liveTick ? liveTick.quote.toFixed(asset.symbol.includes("frx") ? 5 : 2) : "Loading..."}
                          </span>
                          
                          {hasActiveContract ? (
                            <span className="text-[8px] bg-amber-50 text-amber-700 border border-amber-200 font-mono font-black px-1.5 py-0.5 rounded animate-pulse">
                              TRADE LIVE
                            </span>
                          ) : (
                            <span className="text-[7px] text-slate-400 font-mono font-bold uppercase tracking-wider">
                              {isScanning ? "Connected" : "Offline"}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Autonomous Market Intelligence System Panel */}
              <div className="md:col-span-4 flex flex-col justify-between p-4 bg-slate-900 text-slate-100 rounded-xl border border-slate-800 shadow-xl relative overflow-hidden min-h-[420px]">
                {/* Background glow for tech style */}
                <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />
                
                <div>
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
                    <span className="text-[10px] text-purple-400 font-bold uppercase tracking-wider flex items-center space-x-1.5">
                      <Brain className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                      <span>Autonomous Market Intelligence</span>
                    </span>
                    <span className="text-[8px] bg-purple-500/10 text-purple-400 font-mono px-2 py-0.5 rounded border border-purple-500/20 flex items-center space-x-1 font-black">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-ping inline-block" />
                      <span>INTELLIGENCE V2</span>
                    </span>
                  </div>

                  {/* Tab selectors */}
                  <div className="grid grid-cols-4 gap-1 mb-3.5 bg-slate-950 p-1 rounded-lg border border-slate-800/80">
                    <button
                      type="button"
                      onClick={() => setIntelTab("narrative")}
                      className={`text-[8.5px] font-bold py-1.5 rounded-md transition font-mono cursor-pointer ${
                        intelTab === "narrative"
                          ? "bg-slate-800 text-slate-100 border border-slate-700/80"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      NARRATIVE
                    </button>
                    <button
                      type="button"
                      onClick={() => setIntelTab("dimensions")}
                      className={`text-[8.5px] font-bold py-1.5 rounded-md transition font-mono cursor-pointer ${
                        intelTab === "dimensions"
                          ? "bg-slate-800 text-slate-100 border border-slate-700/80"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      9D METRICS
                    </button>
                    <button
                      type="button"
                      onClick={() => setIntelTab("history")}
                      className={`text-[8.5px] font-bold py-1.5 rounded-md transition font-mono cursor-pointer ${
                        intelTab === "history"
                          ? "bg-slate-800 text-slate-100 border border-slate-700/80"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      LOGS ({snapshotHistory.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setIntelTab("research")}
                      className={`text-[8.5px] font-bold py-1.5 rounded-md transition font-mono cursor-pointer ${
                        intelTab === "research"
                          ? "bg-slate-800 text-slate-100 border border-slate-700/80"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      RESEARCH
                    </button>
                  </div>

                  {geminiPredicting ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
                      <RefreshCw className="w-8 h-8 text-purple-400 animate-spin" />
                      <div className="space-y-1">
                        <span className="text-xs font-bold text-slate-200 block font-mono">Analyzing Snapshot...</span>
                        <p className="text-[10px] text-slate-400 max-w-xs leading-relaxed">
                          Co-processor is calculating advanced market intelligence dimensions across the last 50 ticks of {activeAsset.name}...
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      
                      {/* High-Level Cognitive Overview (Phase 2 Anchor) */}
                      {latestSnapshot && (
                        <div className="bg-slate-950 p-2 rounded-xl border border-slate-800/80 space-y-2 text-left">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-[7px] text-slate-500 uppercase font-black block tracking-wider">Current Market Regime</span>
                              <span className="text-[10px] font-black text-slate-100 flex items-center space-x-1.5">
                                <span className={`w-2 h-2 rounded-full inline-block ${
                                  latestSnapshot.marketRegime?.dominantRegime?.includes("Uptrend") || latestSnapshot.marketRegime?.dominantRegime?.includes("Breakout") ? "bg-emerald-500" :
                                  latestSnapshot.marketRegime?.dominantRegime?.includes("Downtrend") ? "bg-rose-500" : "bg-amber-500"
                                }`} />
                                <span>{latestSnapshot.marketRegime?.dominantRegime || "Stable Consolidation"}</span>
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-[7px] text-slate-500 uppercase font-black block tracking-wider">Regime Confidence</span>
                              <span className="text-[10px] font-bold text-purple-400 font-mono">
                                {latestSnapshot.marketRegime?.confidence || 100}%
                              </span>
                            </div>
                          </div>

                          {/* Understanding Confidence & Cognitive State */}
                          <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-slate-900/50">
                            <div>
                              <span className="text-[7px] text-slate-500 uppercase font-black block tracking-wider">Model Understanding</span>
                              <span className={`text-[8.5px] font-black ${
                                latestSnapshot.understandingConfidence?.tier === "VERY_HIGH" || latestSnapshot.understandingConfidence?.tier === "HIGH" ? "text-emerald-400" :
                                latestSnapshot.understandingConfidence?.tier === "MODERATE" ? "text-amber-400" : "text-rose-400"
                              }`}>
                                {latestSnapshot.understandingConfidence?.tier?.replace("_", " ") || "HIGH"} ({latestSnapshot.understandingConfidence?.score || 90}%)
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-[7px] text-slate-500 uppercase font-black block tracking-wider">Cognitive State</span>
                              <span className={`text-[8.5px] font-black ${
                                latestSnapshot.relationshipAnalysis?.cognitiveState === "AGREEMENT" ? "text-emerald-400" :
                                latestSnapshot.relationshipAnalysis?.cognitiveState === "CONTRADICTION" ? "text-rose-400 text-rose-400 animate-pulse" :
                                latestSnapshot.relationshipAnalysis?.cognitiveState === "CONFLICT" ? "text-amber-400" : "text-slate-400"
                              }`}>
                                {latestSnapshot.relationshipAnalysis?.cognitiveState || "NEUTRAL"}
                              </span>
                            </div>
                          </div>

                          {/* Anomaly banner if active */}
                          {latestSnapshot.anomalyDetection?.isAbnormal && (
                            <div className="bg-rose-500/10 border border-rose-500/20 px-2 py-1 rounded-lg text-[8px] text-rose-400 font-bold flex items-center justify-between animate-pulse">
                              <span>⚠️ ANOMALOUS BEHAVIOR DETECTED</span>
                              <span className="bg-rose-500 text-slate-950 font-black px-1 rounded text-[7px]">{latestSnapshot.anomalyDetection.severity}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 1. NARRATIVE VIEW */}
                      {intelTab === "narrative" && (
                        <div>
                          {geminiSignal ? (
                            <div>
                              <div className="p-2 rounded-lg border text-center font-bold uppercase text-[9px] tracking-wider bg-slate-950 border-slate-800 text-slate-400">
                                🛡️ AUTOPILOT STANDING ASIDE (PHASE 1 INTEGRATION)
                              </div>

                              {/* Dynamic Parameters list */}
                              <div className="mt-2 grid grid-cols-2 gap-2">
                                <div className="bg-slate-800/40 p-2 rounded-lg border border-slate-800 text-left">
                                  <span className="text-[8px] text-slate-400 block font-bold uppercase tracking-wider">Dynamic Barrier Offset</span>
                                  <span className="text-xs text-slate-200 font-mono font-bold">
                                    {geminiRecommendedOffset >= 0 ? "+" : ""}{geminiRecommendedOffset?.toFixed(activeAsset.symbol.includes("frx") ? 5 : 2)}
                                  </span>
                                </div>
                                <div className="bg-slate-800/40 p-2 rounded-lg border border-slate-800 text-left">
                                  <span className="text-[8px] text-slate-400 block font-bold uppercase tracking-wider">Target Asset</span>
                                  <span className="text-xs text-slate-200 font-mono font-bold truncate block">{activeAsset.symbol}</span>
                                </div>
                              </div>

                              {/* Case File View (Phase 2 Structured Narrative Integration) */}
                              {latestSnapshot && latestSnapshot.marketCaseFile ? (
                                <div className="mt-2.5 bg-slate-950 p-2.5 rounded-xl border border-slate-800 max-h-[140px] overflow-y-auto text-left space-y-2 font-sans text-[9px]">
                                  <div className="flex justify-between items-center text-[8px] border-b border-slate-900 pb-1 mb-1 font-mono">
                                    <span className="text-purple-400 font-bold uppercase tracking-wider">
                                      📁 CASE FILE: {latestSnapshot.marketCaseFile.caseId}
                                    </span>
                                    <span className="text-slate-500">
                                      {new Date(latestSnapshot.marketCaseFile.timestamp).toLocaleTimeString()}
                                    </span>
                                  </div>
                                  
                                  {/* Narrative sentences */}
                                  <div className="space-y-1 text-slate-300 font-medium">
                                    {latestSnapshot.marketContext?.narrativeSentences?.map((s: string, i: number) => (
                                      <p key={i} className="leading-relaxed pl-2 border-l border-purple-500/30">{s}</p>
                                    ))}
                                  </div>

                                  {/* Strengths / Weaknesses */}
                                  <div className="grid grid-cols-2 gap-2 pt-1">
                                    <div className="bg-emerald-500/5 p-1.5 rounded border border-emerald-500/10">
                                      <span className="text-[7px] text-emerald-400 uppercase font-bold block mb-0.5">Primary Strengths</span>
                                      <ul className="list-disc list-inside text-slate-300 text-[7.5px] space-y-0.5">
                                        {latestSnapshot.marketCaseFile.primaryStrengths.map((s: string, i: number) => (
                                          <li key={i} className="truncate">{s}</li>
                                        ))}
                                      </ul>
                                    </div>
                                    <div className="bg-rose-500/5 p-1.5 rounded border border-rose-500/10">
                                      <span className="text-[7px] text-rose-400 uppercase font-bold block mb-0.5">Primary Weaknesses</span>
                                      <ul className="list-disc list-inside text-slate-300 text-[7.5px] space-y-0.5">
                                        {latestSnapshot.marketCaseFile.primaryWeaknesses.map((w: string, i: number) => (
                                          <li key={i} className="truncate">{w}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  </div>

                                  {/* Historical similarity */}
                                  <div className="bg-purple-500/5 p-2 rounded border border-purple-500/10 text-[8px] text-purple-300 font-mono">
                                    <span className="text-[7px] text-purple-400 uppercase font-bold block mb-0.5">Historical Similarity Query</span>
                                    <div className="flex justify-between">
                                      <span>Matched: <strong className="text-slate-200">{latestSnapshot.historicalSimilarity?.similarMatchesFound || 0} patterns</strong></span>
                                      <span>Avg Score: <strong className="text-slate-200">{latestSnapshot.historicalSimilarity?.averageSimilarityScore?.toFixed(1) || "0.0"}%</strong></span>
                                    </div>
                                    <div className="mt-1 text-[7.5px] text-slate-400">
                                      Future projection: <strong className={`font-bold ${
                                        latestSnapshot.historicalSimilarity?.mostCommonFutureState === "UP" ? "text-emerald-400" :
                                        latestSnapshot.historicalSimilarity?.mostCommonFutureState === "DOWN" ? "text-rose-400" : "text-amber-400"
                                      }`}>{latestSnapshot.historicalSimilarity?.mostCommonFutureState || "UNKNOWN"}</strong> | Volatility: <span className="text-slate-300">{latestSnapshot.historicalSimilarity?.mostCommonVolatilityBehavior}</span>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                /* Fallback narrative */
                                <div className="mt-2.5 bg-slate-950 p-3 rounded-xl border border-slate-800 max-h-[140px] overflow-y-auto text-left leading-relaxed">
                                  <span className="text-[8px] text-purple-400 font-mono font-black uppercase tracking-wider block mb-1">
                                    Live Multi-Dimensional Technical Narrative
                                  </span>
                                  <p className="text-[10px] text-slate-300 font-medium whitespace-pre-line leading-relaxed font-sans">
                                    {geminiAnalysis}
                                  </p>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 py-8 text-center text-slate-400 text-xs flex flex-col items-center justify-center space-y-2.5">
                              <div className="bg-slate-900 p-2.5 rounded-full border border-slate-800">
                                <Brain className="w-5 h-5 text-purple-400 animate-pulse" />
                              </div>
                              <span className="font-bold text-slate-200 font-mono">Intelligence Engine Active</span>
                              <p className="text-[10px] text-slate-400 max-w-xs leading-relaxed">
                                The autonomous technical analyzer operates on every tick. Enable Autopilot scan above to stream multi-dimensional technical reports.
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 2. 9D METRICS VIEW */}
                      {intelTab === "dimensions" && (
                        <div>
                          {!latestSnapshot ? (
                            <div className="bg-slate-950 p-8 rounded-xl border border-slate-800 text-center text-slate-500 font-mono text-[10px]">
                              Waiting for next market snapshot generation cycle...
                            </div>
                          ) : (
                            <div className="grid grid-cols-3 gap-2 max-h-[260px] overflow-y-auto pr-1 text-left">
                              {/* Trend */}
                              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/80 flex flex-col justify-between">
                                <div>
                                  <span className="text-[8px] text-slate-400 uppercase font-bold block mb-1">1. Trend</span>
                                  <div className="space-y-1">
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded inline-block ${
                                      latestSnapshot.trendAnalysis.direction === 'BULLISH' ? 'bg-emerald-500/15 text-emerald-400' :
                                      latestSnapshot.trendAnalysis.direction === 'BEARISH' ? 'bg-rose-500/15 text-rose-400' : 'bg-slate-800 text-slate-300'
                                    }`}>
                                      {latestSnapshot.trendAnalysis.direction}
                                    </span>
                                    <span className="text-[8px] text-slate-400 font-mono block">R²: {latestSnapshot.trendAnalysis.trendlineR2.toFixed(2)}</span>
                                  </div>
                                </div>
                                {latestSnapshot.featureEvolution && (
                                  <div className="mt-1.5 border-t border-slate-900/50 pt-1 flex justify-between text-[7.5px] font-mono text-slate-500">
                                    <span>Evo:</span>
                                    <span className={`font-bold ${
                                      latestSnapshot.featureEvolution.trendState === "STRENGTHENING" ? "text-emerald-400 animate-pulse" :
                                      latestSnapshot.featureEvolution.trendState === "WEAKENING" ? "text-rose-400" : "text-slate-400"
                                    }`}>{latestSnapshot.featureEvolution.trendState}</span>
                                  </div>
                                )}
                              </div>
                              {/* Momentum */}
                              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/80 flex flex-col justify-between">
                                <div>
                                  <span className="text-[8px] text-slate-400 uppercase font-bold block mb-1">2. Momentum</span>
                                  <div className="space-y-1 font-mono text-[9px] text-slate-300">
                                    <div>RSI: <span className="font-bold text-purple-400">{latestSnapshot.momentumAnalysis.rsi14.toFixed(1)}</span></div>
                                    <div className="truncate text-[8px]">Hist: {latestSnapshot.momentumAnalysis.macdHistogram.toFixed(4)}</div>
                                  </div>
                                </div>
                                {latestSnapshot.featureEvolution && (
                                  <div className="mt-1.5 border-t border-slate-900/50 pt-1 flex justify-between text-[7.5px] font-mono text-slate-500">
                                    <span>Evo:</span>
                                    <span className={`font-bold ${
                                      latestSnapshot.featureEvolution.momentumState === "ACCELERATING" ? "text-emerald-400 animate-pulse" :
                                      latestSnapshot.featureEvolution.momentumState === "DECELERATING" ? "text-rose-400" : "text-slate-400"
                                    }`}>{latestSnapshot.featureEvolution.momentumState}</span>
                                  </div>
                                )}
                              </div>
                              {/* Volatility */}
                              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/80 flex flex-col justify-between">
                                <div>
                                  <span className="text-[8px] text-slate-400 uppercase font-bold block mb-1">3. Volatility</span>
                                  <div className="space-y-1">
                                    <span className="text-[9px] font-bold text-slate-300 block truncate">{latestSnapshot.volatilityAnalysis.volatilityState}</span>
                                    <span className="text-[8px] text-slate-500 font-mono block">ATR: {latestSnapshot.volatilityAnalysis.atr.toFixed(4)}</span>
                                  </div>
                                </div>
                                {latestSnapshot.featureEvolution && (
                                  <div className="mt-1.5 border-t border-slate-900/50 pt-1 flex justify-between text-[7.5px] font-mono text-slate-500">
                                    <span>Evo:</span>
                                    <span className={`font-bold ${
                                      latestSnapshot.featureEvolution.volatilityState === "EXPANDING" ? "text-amber-400 animate-pulse" :
                                      latestSnapshot.featureEvolution.volatilityState === "CONTRACTING" ? "text-emerald-400" : "text-slate-400"
                                    }`}>{latestSnapshot.featureEvolution.volatilityState}</span>
                                  </div>
                                )}
                              </div>
                              {/* Structure */}
                              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/80 flex flex-col justify-between">
                                <div>
                                  <span className="text-[8px] text-slate-400 uppercase font-bold block mb-1">4. Structure</span>
                                  <div className="space-y-1 text-[9px] text-slate-300 font-mono">
                                    <div>BoS: <span className={latestSnapshot.marketStructure.breakOfStructure ? "text-emerald-400 font-bold" : "text-slate-500"}>{latestSnapshot.marketStructure.breakOfStructure ? "YES" : "NO"}</span></div>
                                    <div className="truncate text-[8px]">Rev: {latestSnapshot.marketStructure.reversalDetection}</div>
                                  </div>
                                </div>
                                {latestSnapshot.featureEvolution && (
                                  <div className="mt-1.5 border-t border-slate-900/50 pt-1 flex justify-between text-[7.5px] font-mono text-slate-500">
                                    <span>Shift:</span>
                                    <span className="font-bold text-indigo-400">{latestSnapshot.featureEvolution.structureShift ? "SHIFT" : "STABLE"}</span>
                                  </div>
                                )}
                              </div>
                              {/* Liquidity */}
                              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/80 flex flex-col justify-between">
                                <div>
                                  <span className="text-[8px] text-slate-400 uppercase font-bold block mb-1">5. Liquidity</span>
                                  <div className="space-y-1 text-[9px] text-slate-300 font-mono">
                                    <div>Hunt: <span className={latestSnapshot.liquidityAnalysis.stopHuntDetected ? "text-amber-400 font-bold" : "text-slate-500"}>{latestSnapshot.liquidityAnalysis.stopHuntDetected ? "YES" : "NO"}</span></div>
                                    <div>FVG: {latestSnapshot.liquidityAnalysis.fairValueGaps.length}</div>
                                  </div>
                                </div>
                                {latestSnapshot.featureEvolution && (
                                  <div className="mt-1.5 border-t border-slate-900/50 pt-1 flex justify-between text-[7.5px] font-mono text-slate-500">
                                    <span>Evo:</span>
                                    <span className="font-bold text-slate-400">{latestSnapshot.featureEvolution.liquidityState}</span>
                                  </div>
                                )}
                              </div>
                              {/* S & R */}
                              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/80 flex flex-col justify-between">
                                <div>
                                  <span className="text-[8px] text-slate-400 uppercase font-bold block mb-1">6. Supp/Res</span>
                                  <div className="space-y-1 text-[9px] text-slate-300 font-mono">
                                    <div className="truncate text-[8.5px]">Res: {latestSnapshot.supportResistance.dynamicResistance.toFixed(1)}</div>
                                    <div className="truncate text-[8.5px]">Sup: {latestSnapshot.supportResistance.dynamicSupport.toFixed(1)}</div>
                                  </div>
                                </div>
                                {latestSnapshot.featureEvolution && (
                                  <div className="mt-1.5 border-t border-slate-900/50 pt-1 flex justify-between text-[7.5px] font-mono text-slate-500">
                                    <span>Supp:</span>
                                    <span className="font-bold text-slate-400">{latestSnapshot.featureEvolution.supportState === "STRENGTHENING" ? "STR" : "WEK"}</span>
                                  </div>
                                )}
                              </div>
                              {/* Session */}
                              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/80 flex flex-col justify-between">
                                <div>
                                  <span className="text-[8px] text-slate-400 uppercase font-bold block mb-1">7. Session</span>
                                  <div className="space-y-1">
                                    <span className="text-[9px] font-bold text-indigo-400 block truncate">{latestSnapshot.sessionAnalysis.currentSession}</span>
                                    <span className="text-[8px] text-slate-500 font-mono block">Transit: {latestSnapshot.sessionAnalysis.sessionTransition ? "YES" : "NO"}</span>
                                  </div>
                                </div>
                                <div className="mt-1.5 border-t border-slate-900/50 pt-1 text-[7px] text-slate-500 uppercase font-mono">
                                  <span>Dynamic Session</span>
                                </div>
                              </div>
                              {/* Statistical */}
                              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/80 flex flex-col justify-between">
                                <div>
                                  <span className="text-[8px] text-slate-400 uppercase font-bold block mb-1">8. Statistical</span>
                                  <div className="space-y-1 text-[9px] text-slate-300 font-mono">
                                    <div>Z-Score: <span className="font-bold">{latestSnapshot.statisticalAnalysis.zScore.toFixed(2)}</span></div>
                                    <div className="truncate text-[8px]">Auto: {latestSnapshot.statisticalAnalysis.autocorrelation.toFixed(3)}</div>
                                  </div>
                                </div>
                                <div className="mt-1.5 border-t border-slate-900/50 pt-1 text-[7px] text-slate-500 uppercase font-mono">
                                  <span>Co-Variance</span>
                                </div>
                              </div>
                              {/* Risk & Noise */}
                              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/80 flex flex-col justify-between">
                                <div>
                                  <span className="text-[8px] text-slate-400 uppercase font-bold block mb-1">9. Risk & Noise</span>
                                  <div className="space-y-1 text-[9px] text-slate-300 font-mono">
                                    <div className="truncate text-[8px]">Exp: {latestSnapshot.riskMetrics.exposureRatio.toFixed(2)}%</div>
                                    <div className="truncate text-[8px]">Noise: {latestSnapshot.riskMetrics.marketNoiseIndex.toFixed(2)}</div>
                                  </div>
                                </div>
                                <div className="mt-1.5 border-t border-slate-900/50 pt-1 text-[7px] text-slate-500 uppercase font-mono">
                                  <span>Risk Bound</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 3. LOGS DATABASE VIEW */}
                      {intelTab === "history" && (
                        <div>
                          {snapshotHistory.length === 0 ? (
                            <div className="bg-slate-950 p-8 rounded-xl border border-slate-800 text-center text-slate-500 font-mono text-[10px]">
                              No snapshots logged in database history yet.
                            </div>
                          ) : (
                            <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1 text-left font-mono text-[9px]">
                              {snapshotHistory.map((snap: any, idx: number) => (
                                <div key={idx} className="bg-slate-950 p-2 rounded-lg border border-slate-800 flex flex-col space-y-1">
                                  <div className="flex justify-between items-center text-slate-400 border-b border-slate-800/50 pb-1 mb-1">
                                    <span className="font-bold text-purple-400">{snap.market} Snap #{snapshotHistory.length - idx}</span>
                                    <span className="text-[8px] text-slate-500">{new Date(snap.timestamp).toLocaleTimeString()}</span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-slate-300">
                                    <div>Spot: <span className="text-slate-100">${snap.currentPrice ? snap.currentPrice.toFixed(snap.market.includes("frx") ? 5 : 2) : (snap.spotPrice || 0).toFixed(2)}</span></div>
                                    <div>Regime: <span className="text-purple-400 font-bold text-[8px] truncate">{snap.marketRegime?.dominantRegime || "Uncertain"}</span></div>
                                    <div>Trend: <span className={snap.trendAnalysis?.direction === 'BULLISH' ? 'text-emerald-400 font-bold' : snap.trendAnalysis?.direction === 'BEARISH' ? 'text-rose-400 font-bold' : 'text-slate-400 font-bold'}>{snap.trendAnalysis?.direction || "NEUTRAL"}</span></div>
                                    <div>Confidence: <span className="text-indigo-400">{snap.understandingConfidence?.score || 100}%</span></div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* 4. QUANTITATIVE RESEARCH & EVIDENCE PANEL */}
                      {intelTab === "research" && (
                        <div className="space-y-3 text-left font-sans text-[10px]">
                          {/* Predictability Engine Stats */}
                          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 space-y-2">
                            <div className="flex justify-between items-center border-b border-slate-900/50 pb-1.5">
                              <span className="text-[8px] text-purple-400 font-mono font-black uppercase tracking-wider block">
                                Predictability Engine Stats
                              </span>
                              <span className="text-[8px] text-slate-500 font-mono font-bold">
                                Total: {predictabilityStats?.totalEvaluated || 0} Snaps
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 items-center">
                              <div>
                                <span className="text-[8px] text-slate-400 font-mono">Average predictability Score:</span>
                                <div className="text-sm font-black text-slate-100 font-mono flex items-baseline space-x-1">
                                  <span>{predictabilityStats?.averagePredictabilityScore?.toFixed(1) || "70.0"}%</span>
                                  <span className="text-[8px] text-purple-400">
                                    ({(predictabilityStats?.averagePredictabilityScore || 70) >= 80 ? "EXCELLENT" : (predictabilityStats?.averagePredictabilityScore || 70) >= 60 ? "HIGH" : "MODERATE"})
                                  </span>
                                </div>
                              </div>
                              {/* Small mini progress bar */}
                              <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden border border-slate-800">
                                <div 
                                  className="bg-purple-500 h-1.5 rounded-full" 
                                  style={{ width: `${predictabilityStats?.averagePredictabilityScore || 70}%` }}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Live Outcome Horizon Tracking */}
                          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 space-y-2">
                            <span className="text-[8px] text-purple-400 font-mono font-black uppercase tracking-wider block border-b border-slate-900/50 pb-1.5">
                              Outcome Horizon Tracking (Active Symbol: {activeAsset.symbol})
                            </span>
                            {!latestSnapshot?.outcomes ? (
                              <div className="text-center text-slate-500 py-2 font-mono text-[8.5px]">
                                No outcomes tracking for active asset yet. Click Auto Pilot or higher/lower to trigger snapshots.
                              </div>
                            ) : (
                              <div className="grid grid-cols-4 gap-1.5 max-h-[140px] overflow-y-auto pr-1">
                                {Object.entries(latestSnapshot.outcomes.horizons).map(([label, horizon]: [string, any]) => (
                                  <div key={label} className="bg-slate-900/50 p-1.5 rounded border border-slate-800 flex flex-col justify-between font-mono text-[8px]">
                                    <div className="flex justify-between items-center text-slate-400 border-b border-slate-900 pb-0.5 mb-1 font-bold">
                                      <span>{label}</span>
                                      <span className={horizon.elapsed ? "text-emerald-400" : "text-amber-400 font-bold"}>
                                        {horizon.elapsed ? "DONE" : "TRACK"}
                                      </span>
                                    </div>
                                    <div className="space-y-0.5 text-slate-300">
                                      <div className="truncate">Chg: <strong className={horizon.percentageChange >= 0 ? "text-emerald-400" : "text-rose-400"}>{horizon.percentageChange >= 0 ? "+" : ""}{horizon.percentageChange?.toFixed(3)}%</strong></div>
                                      <div className="truncate">MFE: <span className="text-emerald-500">{horizon.maxFavorableExcursion?.toFixed(3)}%</span></div>
                                      <div className="truncate">MAE: <span className="text-rose-400">{horizon.maxAdverseExcursion?.toFixed(3)}%</span></div>
                                      <div className="truncate">Vol: <span>{horizon.realizedVolatility?.toFixed(3)}%</span></div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Feature Performance registry */}
                          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 space-y-2">
                            <span className="text-[8px] text-purple-400 font-mono font-black uppercase tracking-wider block border-b border-slate-900/50 pb-1.5">
                              Evaluated Feature Performance Registry
                            </span>
                            {researchFeatures.length === 0 ? (
                              <div className="text-center text-slate-500 py-3 font-mono text-[8.5px]">
                                No features evaluated yet. Trigger more snapshots to accumulate evaluations.
                              </div>
                            ) : (
                              <div className="space-y-1 max-h-[120px] overflow-y-auto pr-1 font-mono text-[8.5px]">
                                {researchFeatures.map((f: any, idx: number) => {
                                  const total = f.continuationCount + f.reversalCount;
                                  const continuationRate = total > 0 ? (f.continuationCount / total * 100) : 50;
                                  return (
                                    <div key={idx} className="flex justify-between items-center bg-slate-900/60 p-1 px-1.5 rounded border border-slate-800">
                                      <span className="text-slate-200 font-bold max-w-[130px] truncate">{f.featureName}</span>
                                      <div className="flex space-x-2 text-slate-400">
                                        <span>Cont: <strong className="text-emerald-400">{f.continuationCount}</strong></span>
                                        <span>Rev: <strong className="text-rose-400">{f.reversalCount}</strong></span>
                                        <span className={`font-bold ${continuationRate >= 50 ? "text-emerald-400" : "text-rose-400"}`}>
                                          {continuationRate.toFixed(1)}%
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Action Block: Validate Outcomes & ML-Ready Dataset Builder */}
                          <div className="grid grid-cols-2 gap-2">
                            {/* Dataset exporter block */}
                            <div className="bg-slate-950 p-2 rounded-xl border border-slate-800 flex flex-col justify-between space-y-1.5">
                              <span className="text-[7.5px] text-purple-400 font-mono font-black uppercase block tracking-wider">
                                Export ML-Ready Dataset
                              </span>
                              <div className="flex space-x-1.5 items-center">
                                <select 
                                  value={datasetHorizon}
                                  onChange={(e) => setDatasetHorizon(e.target.value)}
                                  className="bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-[8px] font-mono text-slate-300 focus:outline-none"
                                >
                                  <option value="30s">30s</option>
                                  <option value="1m">1m</option>
                                  <option value="3m">3m</option>
                                  <option value="5m">5m</option>
                                  <option value="10m">10m</option>
                                </select>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      const res = await fetch("/api/market/research/dataset", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ format: "csv", horizonFilter: datasetHorizon })
                                      });
                                      if (res.ok) {
                                        const csvText = await res.text();
                                        const blob = new Blob([csvText], { type: "text/csv" });
                                        const url = window.URL.createObjectURL(blob);
                                        const a = document.createElement("a");
                                        a.setAttribute("href", url);
                                        a.setAttribute("download", `market_intelligence_dataset_${datasetHorizon}.csv`);
                                        a.click();
                                      }
                                    } catch (err) {
                                      console.error("Export error:", err);
                                    }
                                  }}
                                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-black py-0.5 px-2 rounded text-[8px] transition font-mono uppercase tracking-wider cursor-pointer text-center"
                                >
                                  Download CSV
                                </button>
                              </div>
                            </div>

                            {/* Validation Suite Block */}
                            <div className="bg-slate-950 p-2 rounded-xl border border-slate-800 flex flex-col justify-between space-y-1.5">
                              <span className="text-[7.5px] text-purple-400 font-mono font-black uppercase block tracking-wider">
                                Rigorous Validation Suite
                              </span>
                              <button
                                type="button"
                                onClick={async () => {
                                  setIsResearchValidating(true);
                                  try {
                                    const res = await fetch("/api/market/research/validate", { method: "POST" });
                                    if (res.ok) {
                                      const data = await res.json();
                                      setValidationReport(data);
                                    }
                                  } catch (err) {
                                    console.error("Validation error:", err);
                                  } finally {
                                    setIsResearchValidating(false);
                                  }
                                }}
                                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-black py-0.5 px-2 rounded text-[8px] transition font-mono uppercase tracking-wider cursor-pointer text-center"
                              >
                                {isResearchValidating ? "VALIDATING..." : "RUN VALIDATION SWEEP"}
                              </button>
                            </div>
                          </div>

                          {/* Validation success modal or report banner */}
                          {validationReport && (
                            <div className={`p-2 rounded-xl border text-[8px] font-mono leading-normal ${
                              validationReport.success 
                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                                : "bg-rose-500/10 border-rose-500/20 text-rose-400"
                            }`}>
                              <div className="flex justify-between items-center font-bold mb-1">
                                <span>SWEEP COMPLETE: {validationReport.success ? "100% HEALTHY" : "HEALTH WARNING"}</span>
                                <button type="button" onClick={() => setValidationReport(null)} className="text-slate-500 hover:text-slate-300 font-black">X</button>
                              </div>
                              <div className="grid grid-cols-2 gap-1.5">
                                <div>Tested: {validationReport.validationSummary.totalTested} snaps</div>
                                <div>Gaps: {validationReport.validationSummary.missingOutcomes} missing</div>
                                <div>Outliers: {validationReport.validationSummary.invalidOutbounds} detected</div>
                                <div className="col-span-2 text-[7.5px] text-slate-400">
                                  {validationReport.issues.length > 0 ? validationReport.issues[0] : "All outcomes are mathematically healthy."}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                    </div>
                  )}
                </div>

                <div className="space-y-2 mt-4 pt-3.5 border-t border-slate-800/80">
                  {/* Both API Limits Reached Warning banner */}
                  {apiLimitsReached && (
                    <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-2 rounded-lg text-center text-[10px] font-bold animate-pulse leading-snug">
                      ⚠️ BOTH API LIMITS REACHED: Local Quant CMT Co-Processor Engaged!
                    </div>
                  )}

                  <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-800/80 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="text-left">
                        <span className="text-[10px] text-slate-200 block font-bold">Martingale Recovery System</span>
                        <span className="text-[8px] text-slate-400 leading-normal block">
                          Streak: <strong className="text-rose-400">{consecutiveLosses} loss(es)</strong> (${martingaleLossAccumulator.toFixed(2)} accum.)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setMartingaleEnabled(!martingaleEnabled)}
                        className={`text-[10px] font-black px-3 py-1.5 rounded-lg border uppercase transition cursor-pointer shadow-sm ${
                          martingaleEnabled
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                            : "bg-slate-800 text-slate-400 border-slate-700"
                        }`}
                      >
                        {martingaleEnabled ? "ACTIVE" : "DISABLED"}
                      </button>
                    </div>

                    {martingaleEnabled && (
                      <div className="border-t border-slate-700/50 pt-2 space-y-2 text-left">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[8px] text-slate-400 font-extrabold uppercase block mb-1">Mode</label>
                            <select
                              value={martingaleMode}
                              onChange={(e) => setMartingaleMode(e.target.value as "fixed" | "dynamic")}
                              className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-[10px] font-mono text-slate-300 focus:outline-none"
                            >
                              <option value="fixed">Fixed Multiplier</option>
                              <option value="dynamic">Dynamic Recovery</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-[8px] text-slate-400 font-extrabold uppercase block mb-1">Max Cap (USD)</label>
                            <input
                              type="number"
                              value={martingaleMaxCap}
                              onChange={(e) => setMartingaleMaxCap(Math.max(1, Number(e.target.value)))}
                              className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-[10px] font-mono text-slate-300 focus:outline-none"
                            />
                          </div>
                        </div>

                        {martingaleMode === "fixed" && (
                          <div>
                            <label className="text-[8px] text-slate-400 font-extrabold uppercase block mb-1">Multiplier</label>
                            <div className="flex items-center space-x-1">
                              <input
                                type="number"
                                step="0.1"
                                min="1.1"
                                value={martingaleMultiplier}
                                onChange={(e) => setMartingaleMultiplier(Math.max(1.1, Number(e.target.value)))}
                                className="flex-1 bg-slate-900 border border-slate-700 rounded p-1 text-[10px] font-mono text-slate-300 focus:outline-none"
                              />
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => setMartingaleMultiplier(2.2)}
                                  className="px-1.5 py-0.5 bg-slate-800 text-slate-300 text-[8px] font-bold rounded hover:bg-slate-700 transition cursor-pointer"
                                >
                                  2.2x
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setMartingaleMultiplier(10.5)}
                                  className="px-1.5 py-0.5 bg-slate-800 text-slate-300 text-[8px] font-bold rounded hover:bg-slate-700 transition cursor-pointer"
                                >
                                  10.5x
                                </button>
                              </div>
                            </div>
                            <span className="text-[7.5px] text-slate-400 leading-relaxed block mt-1">
                              Next Stake: <strong className="text-emerald-400">${(stake * Math.pow(martingaleMultiplier, consecutiveLosses)).toFixed(2)}</strong> (Base: ${stake})
                            </span>
                          </div>
                        )}
                        {martingaleMode === "dynamic" && (
                          <span className="text-[7.5px] text-slate-400 leading-relaxed block mt-0.5">
                            Auto calculates required stake to recover <strong className="text-rose-400">${martingaleLossAccumulator.toFixed(2)}</strong> lost funds + user base stake.
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {geminiError && (
                    <p className="text-[8px] text-rose-400 font-mono text-center">
                      Error: {geminiError}
                    </p>
                  )}
                  <p className="text-[8.5px] text-slate-500 font-mono text-center leading-relaxed">
                    AI updates automatically on Autopilot. Multi-asset memory is preserved to prevent recurring barrier breach setups.
                  </p>
                </div>
              </div>

            </div>
          </div>

          {/* Live Indicator Panel: active contract counts */}
          {activeContracts.length > 0 && (
            <div className="m-4 p-3 bg-red-50 border border-red-100 rounded-xl text-left">
              <h4 className="text-[10px] font-black text-[#ff444f] uppercase tracking-wider flex items-center space-x-1.5 mb-2">
                <Clock className="w-3.5 h-3.5" />
                <span>Pending DTrader Options Resolution ({activeContracts.length})</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(() => {
                  const seen = new Set<string>();
                  return activeContracts.filter((c) => {
                    if (!c || !c.id || seen.has(c.id)) return false;
                    seen.add(c.id);
                    return true;
                  }).map((contract) => (
                    <div key={`${contract.id}-active`} className="bg-white p-2.5 rounded-lg border border-slate-200 text-[10px] flex items-center justify-between font-mono shadow-xs">
                      <div className="space-y-0.5">
                        <div className="flex items-center space-x-1.5">
                          <span className={`px-1 py-0.5 rounded text-[8px] font-black ${
                            contract.type === "Higher" ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-rose-50 text-rose-600 border border-rose-100"
                          }`}>
                            {contract.type}
                          </span>
                          <span className="font-extrabold text-slate-800">{contract.symbol}</span>
                        </div>
                        {contract.status === "PENDING" ? (
                          <div className="text-[9px] text-purple-600 flex items-center space-x-1 pt-0.5 font-bold">
                            <span className="inline-block w-2 h-2 rounded-full border-t border-r border-purple-600 animate-spin" style={{ width: "8px", height: "8px" }} />
                            <span>{contract.pendingMessage || "Awaiting Deriv..."}</span>
                          </div>
                        ) : (
                          <div className="text-slate-500 text-[9px]">
                            Barrier: <span className="text-slate-700 font-extrabold">${contract.barrierPrice.toFixed(4)}</span>
                          </div>
                        )}
                      </div>
                      <div className="text-right flex flex-col items-end justify-center">
                        {contract.status === "PENDING" ? (
                          <span className="text-[9px] text-purple-600 block font-black animate-pulse">
                            PENDING LIVE
                          </span>
                        ) : (
                          <span className="text-[9px] text-[#ff444f] block font-black animate-pulse">
                            {contract.durationType === "ticks" 
                              ? `${contract.ticksRemaining} Ticks Left` 
                              : `${contract.secondsRemaining} Secs Left`}
                          </span>
                        )}
                        <span className="text-slate-500 text-[9px]">Stake: ${contract.stake}</span>
                        {Date.now() - contract.createdAt > 15000 && (
                          <button
                            type="button"
                            onClick={() => forceSettleContract(contract.id)}
                            className="mt-1 bg-rose-500 hover:bg-rose-600 text-white font-extrabold px-1.5 py-0.5 rounded text-[7.5px] uppercase tracking-wider transition cursor-pointer"
                          >
                            Force Settle
                          </button>
                        )}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}

          {/* DTrader Trade Records Area (Statement of options) */}
          <div className="bg-white border-t border-slate-200 p-4 m-4 rounded-2xl shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-3 mb-3 gap-2">
              <div className="flex items-center space-x-2">
                <History className="w-4 h-4 text-[#ff444f]" />
                <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                  DTrader Official Trading Ledger
                </h3>
              </div>
              
              {/* Tabs for Profit Table, Statement, and ML Lessons */}
              <div className="flex items-center bg-slate-100/80 p-0.5 rounded-lg border border-slate-200 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setActiveLedgerTab("profit_table")}
                  className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider transition ${
                    activeLedgerTab === "profit_table" ? "bg-white text-slate-800 shadow-xs" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Profit Table
                </button>
                <button
                  type="button"
                  onClick={() => setActiveLedgerTab("statement")}
                  className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider transition ${
                    activeLedgerTab === "statement" ? "bg-white text-slate-800 shadow-xs" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Statement
                </button>
                <button
                  type="button"
                  onClick={() => setActiveLedgerTab("ml_lessons")}
                  className={`px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider transition ${
                    activeLedgerTab === "ml_lessons" ? "bg-white text-slate-800 shadow-xs" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  ML lessons
                </button>
              </div>
            </div>

            {activeLedgerTab === "profit_table" && (
              <div>
                {contractHistory.length === 0 ? (
                  <div className="py-10 text-center text-slate-400 text-xs flex flex-col items-center justify-center space-y-2">
                    <Award className="w-8 h-8 text-slate-300 animate-bounce" />
                    <span className="font-bold">No historical options transactions in this session.</span>
                    <span className="text-[10px] text-slate-400">Click Higher or Lower to buy.</span>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11px] font-mono">
                      <thead>
                        <tr className="text-slate-400 border-b border-slate-100 pb-2 uppercase tracking-wider font-extrabold">
                          <th className="py-2.5">Contract ID</th>
                          <th className="py-2.5">Time</th>
                          <th className="py-2.5">Asset</th>
                          <th className="py-2.5">Trade Type</th>
                          <th className="py-2.5">Stake</th>
                          <th className="py-2.5">Barrier Spot</th>
                          <th className="py-2.5">Exit Spot</th>
                          <th className="py-2.5 text-right">Result / Profit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {uniqueContractHistory.slice(0, 10).map((hist) => {
                          const isWin = hist.status === "WON";
                          const diff = isWin ? (hist.payout - hist.stake) : -hist.stake;
                          const isSelected = selectedContractForAnalysis?.id === hist.id;
                          return (
                            <tr 
                              key={`${hist.id}-hist`} 
                              onClick={() => setSelectedContractForAnalysis(hist)}
                              className={`cursor-pointer transition duration-150 border-l-2 ${
                                isSelected 
                                  ? "bg-purple-50/40 border-l-[#ff444f] text-slate-800 font-semibold" 
                                  : "hover:bg-slate-50 text-slate-600 border-l-transparent"
                              }`}
                            >
                              <td className="py-3 font-bold text-slate-400">{hist.id}</td>
                              <td className="py-3 text-slate-400">
                                {new Date(hist.createdAt).toLocaleTimeString()}
                              </td>
                              <td className="py-3 text-slate-800 font-black">{hist.symbol}</td>
                              <td className="py-3">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-black ${
                                  hist.type === "Higher" ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-rose-50 text-rose-600 border border-rose-100"
                                }`}>
                                  {hist.type}
                                </span>
                              </td>
                              <td className="py-3 text-slate-800 font-bold">${hist.stake.toFixed(2)}</td>
                              <td className="py-3 text-slate-500 font-semibold">${hist.barrierPrice.toFixed(4)}</td>
                              <td className="py-3 text-slate-500 font-semibold">${hist.exitPrice?.toFixed(4) || "N/A"}</td>
                              <td className={`py-3 text-right font-black ${
                                isWin ? "text-emerald-500" : "text-rose-500"
                              }`}>
                                <span className="flex items-center justify-end space-x-1">
                                  {isWin ? <CheckCircle className="w-3.5 h-3.5 shrink-0 text-emerald-500" /> : <XCircle className="w-3.5 h-3.5 shrink-0 text-rose-500" />}
                                  <span>{isWin ? `+$${diff.toFixed(2)}` : `-$${Math.abs(diff).toFixed(2)}`}</span>
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeLedgerTab === "statement" && (
              <div>
                {ledgerEntries.length === 0 ? (
                  <div className="py-10 text-center text-slate-400 text-xs flex flex-col items-center justify-center space-y-2">
                    <Coins className="w-8 h-8 text-slate-300 animate-bounce" />
                    <span className="font-bold">No ledger transactions found in this session.</span>
                    <span className="text-[10px] text-slate-400">Your deposits, purchases, and contract payouts will appear here.</span>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11px] font-mono">
                      <thead>
                        <tr className="text-slate-400 border-b border-slate-100 pb-2 uppercase tracking-wider font-extrabold">
                          <th className="py-2.5">Date / Time</th>
                          <th className="py-2.5">Reference ID</th>
                          <th className="py-2.5">Action</th>
                          <th className="py-2.5">Description</th>
                          <th className="py-2.5 text-right">Credit / Debit</th>
                          <th className="py-2.5 text-right">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {ledgerEntries.slice(0, 15).map((entry) => {
                          const isCredit = entry.type === "credit";
                          return (
                            <tr key={entry.id} className="hover:bg-slate-50 transition text-slate-600">
                              <td className="py-3 text-slate-400">
                                {new Date(entry.timestamp).toLocaleTimeString()}
                              </td>
                              <td className="py-3 font-semibold text-slate-400">{entry.refId}</td>
                              <td className="py-3 font-black">
                                <span className={`px-1.5 py-0.5 rounded text-[8px] uppercase ${
                                  entry.action === "PURCHASE" 
                                    ? "bg-blue-50 text-blue-600 border border-blue-100" 
                                    : entry.action === "PAYOUT" 
                                    ? "bg-emerald-50 text-emerald-600 border border-emerald-100" 
                                    : "bg-slate-100 text-slate-500 border border-slate-200"
                                }`}>
                                  {entry.action}
                                </span>
                              </td>
                              <td className="py-3 text-slate-800 font-medium">{entry.description}</td>
                              <td className={`py-3 text-right font-black ${
                                isCredit ? "text-emerald-500" : entry.amount > 0 ? "text-rose-500" : "text-slate-400"
                              }`}>
                                {isCredit ? `+$${entry.amount.toFixed(2)}` : entry.amount > 0 ? `-$${entry.amount.toFixed(2)}` : "—"}
                              </td>
                              <td className="py-3 text-right font-bold text-slate-800">${entry.runningBalance.toFixed(2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeLedgerTab === "ml_lessons" && (
              <div>
                {accumulatedLessons.length === 0 ? (
                  <div className="py-10 text-center text-slate-400 text-xs flex flex-col items-center justify-center space-y-2">
                    <Brain className="w-8 h-8 text-slate-300 animate-pulse" />
                    <span className="font-bold">Machine Learning Memory is empty.</span>
                    <span className="text-[10px] text-slate-400">The AI learning system automatically processes wins and losses to construct memory insights here.</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-[10px] text-purple-600 font-bold bg-purple-50/50 border border-purple-100 rounded-lg p-2.5 text-left mb-2">
                      💡 <strong>Machine Learning Memory Synced Successfully:</strong> The predictive autopilot directly references these historical memory instances to continuously optimize predictions, offset barrier decisions, and confidence calibration.
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {accumulatedLessons.slice(0, 10).map((lesson) => (
                        <div key={lesson.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-left font-mono text-[10px] space-y-1.5 shadow-2xs hover:border-purple-300 transition duration-150">
                          <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                            <span className="font-bold text-slate-400">LESSON ID: {lesson.id.substring(0, 8)}...</span>
                            <span className={`px-1 rounded text-[8px] font-black ${
                              lesson.status === "WON" ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-rose-50 text-rose-600 border border-rose-100"
                            }`}>
                              {lesson.status}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-1 text-[9px] text-slate-500">
                            <div>Asset: <strong className="text-slate-800">{lesson.symbol}</strong></div>
                            <div>Trade: <strong className="text-slate-800">{lesson.tradeType}</strong></div>
                            <div>Streak context: <strong className="text-slate-800">{lesson.lossStreakBefore} Loss(es)</strong></div>
                            <div>Timestamp: <strong className="text-slate-800">{new Date(lesson.timestamp).toLocaleTimeString()}</strong></div>
                          </div>
                          <div className="bg-white border border-slate-100 rounded p-2 text-slate-700 text-[9.5px] leading-relaxed">
                            <span className="text-purple-600 font-bold block mb-0.5">🧠 Root Cause Insight:</span>
                            {lesson.insightText}
                          </div>
                          <div className="bg-purple-50 border border-purple-100 rounded p-2 text-purple-800 text-[9.5px] leading-relaxed">
                            <span className="font-black block mb-0.5 text-purple-900">🛡️ Defensive Rule:</span>
                            {lesson.ruleCreated}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right pane: Contract Settings & buy buttons */}
        <div className="w-full lg:w-80 bg-white p-4 flex flex-col justify-between lg:overflow-y-auto custom-scrollbar shrink-0 space-y-4 shadow-md z-10 text-left">
          
          <div className="space-y-4">
            {/* Account Credentials & Token Configuration Center */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-3 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-[11px] font-black text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
                  <Shield className="w-4 h-4 text-[#ff444f]" />
                  <span>Credential Management</span>
                </span>
                <span className="text-[9px] font-bold text-slate-400 font-mono">Secure Token</span>
              </div>

              {/* Toggle Selector */}
              <div className="grid grid-cols-2 gap-2 bg-slate-200/80 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => handleSwitchAccount("demo")}
                  className={`py-1.5 rounded-lg text-[10px] font-black uppercase text-center transition cursor-pointer ${
                    activeAccountType === "demo"
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Demo Account
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchAccount("real")}
                  className={`py-1.5 rounded-lg text-[10px] font-black uppercase text-center transition cursor-pointer ${
                    activeAccountType === "real"
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Real Account
                </button>
              </div>

              {/* Conditional Account Details or Inputs */}
              {activeAccountType === "demo" ? (
                <div className="space-y-2">
                  {demoToken ? (
                    <div className="bg-emerald-50 border border-emerald-150 rounded-xl p-3 text-left space-y-1.5 relative overflow-hidden">
                      <div className="flex items-center space-x-1.5 text-[9px] text-emerald-800 font-black uppercase tracking-wider">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span>VRTC Authorized ({demoAuthInfo?.loginid || "VRTC"})</span>
                      </div>
                      <div className="text-sm font-black text-emerald-700 font-mono">
                        USD {demoAuthInfo ? Number(demoAuthInfo.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "..."}
                      </div>
                      <div className="text-[9px] text-slate-500 font-bold max-w-xs truncate">
                        Name: {demoAuthInfo?.fullname || "Virtual User"}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleClearToken("demo")}
                        className="w-full mt-1.5 py-1 text-center bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 hover:text-slate-800 text-[9px] font-black uppercase rounded-lg transition cursor-pointer"
                      >
                        Disconnect Demo Token
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-[10px] text-slate-500 leading-normal bg-slate-100/60 p-2.5 rounded-xl border border-dashed border-slate-200 text-center font-bold">
                        🌿 Sandbox mode is currently running with virtual $10,000.00. Enter a VRTC token to authorize your demo trade stream.
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <input
                          type="password"
                          placeholder="Enter Demo API Token..."
                          value={demoInput}
                          onChange={(e) => setDemoInput(e.target.value)}
                          className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-[#ff444f] w-full"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveToken("demo", demoInput)}
                          className="bg-[#ff444f] hover:bg-[#e03a43] text-white font-black text-[10px] px-3 py-2 rounded-lg transition shrink-0 uppercase cursor-pointer"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {realToken ? (
                    <div className="bg-emerald-50 border border-emerald-150 rounded-xl p-3 text-left space-y-1.5 relative overflow-hidden">
                      <div className="flex items-center space-x-1.5 text-[9px] text-emerald-800 font-black uppercase tracking-wider">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span>CR Authorized ({realAuthInfo?.loginid || "CR"})</span>
                      </div>
                      <div className="text-sm font-black text-emerald-700 font-mono">
                        {realAuthInfo?.currency || "USD"} {realAuthInfo ? Number(realAuthInfo.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "..."}
                      </div>
                      <div className="text-[9px] text-slate-500 font-bold max-w-xs truncate">
                        Owner: {realAuthInfo?.fullname || "Deriv Client"}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleClearToken("real")}
                        className="w-full mt-1.5 py-1 text-center bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 hover:text-slate-800 text-[9px] font-black uppercase rounded-lg transition cursor-pointer"
                      >
                        Disconnect Real Token
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-[10px] text-slate-500 leading-normal bg-rose-50/50 p-2.5 rounded-xl border border-dashed border-rose-100 text-center font-semibold">
                        ❌ Real trading requires a Deriv CR token with Read + Trade permissions.
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <input
                          type="password"
                          placeholder="Enter Real API Token..."
                          value={realInput}
                          onChange={(e) => setRealInput(e.target.value)}
                          className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-[#ff444f] w-full"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveToken("real", realInput)}
                          className="bg-[#ff444f] hover:bg-[#e03a43] text-white font-black text-[10px] px-3 py-2 rounded-lg transition shrink-0 uppercase cursor-pointer"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Header section of config */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center space-x-1">
                <Sliders className="w-3.5 h-3.5 text-[#ff444f]" />
                <span>Contract Settings</span>
              </span>
              <Info className="w-4 h-4 text-slate-400" />
            </div>

            {/* Trade Type Selector display */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
              <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">Contract Category</span>
              <div className="flex items-center space-x-2 text-slate-800 font-extrabold text-sm">
                <Sliders className="w-4 h-4 text-[#ff444f]" />
                <span>Higher / Lower Options</span>
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed pt-1">
                Predict whether the exit spot at the end of the duration is strictly <strong>Higher</strong> or <strong>Lower</strong> than the custom barrier level.
              </p>
            </div>

            {/* Duration Locked Panel */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5 relative overflow-hidden">
              <div className="absolute top-2.5 right-2.5 flex items-center space-x-1 bg-[#ff444f]/10 text-[#ff444f] px-1.5 py-0.5 rounded text-[8px] font-black">
                <Lock className="w-2.5 h-2.5" />
                <span>LOCKED</span>
              </div>
              <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">Duration Settings</span>
              <div className="flex items-center space-x-2 text-slate-800 font-extrabold text-sm">
                <Clock className="w-4 h-4 text-[#ff444f]" />
                <span>5 Ticks Duration</span>
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed pt-0.5">
                Contract duration is strictly constrained to **5 Ticks** per trade specifications to maximize predictive accuracy.
              </p>
            </div>

            {/* Auto Barrier solver section */}
            <div className="bg-gradient-to-r from-slate-50 to-emerald-50/20 border border-slate-200 rounded-xl p-3 space-y-2 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider flex items-center space-x-1">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                  <span>Auto-Barrier Solver</span>
                </span>
                <span className={`text-[9px] font-black font-mono px-1.5 py-0.5 rounded ${
                  autoBarrierMode ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"
                }`}>
                  {autoBarrierMode ? "ACTIVE" : "OFF"}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setAutoBarrierMode(true)}
                  className={`flex-1 py-1 px-2 rounded-lg text-[10px] font-black cursor-pointer text-center border transition ${
                    autoBarrierMode 
                      ? "bg-emerald-500 text-white border-emerald-600 shadow-xs" 
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  On
                </button>
                <button
                  type="button"
                  onClick={() => setAutoBarrierMode(false)}
                  className={`flex-1 py-1 px-2 rounded-lg text-[10px] font-black cursor-pointer text-center border transition ${
                    !autoBarrierMode 
                      ? "bg-slate-600 text-white border-slate-700 shadow-xs" 
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  Manual
                </button>
              </div>
              
              {autoBarrierMode && (
                <div className="space-y-1.5 pt-1 border-t border-slate-100">
                  <span className="text-[9px] text-slate-400 font-bold block">Solver Profit Target:</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setAutoBarrierTarget("usd_0_02")}
                      className={`py-1 rounded font-mono font-black text-[10px] cursor-pointer text-center transition border ${
                        autoBarrierTarget === "usd_0_02"
                          ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                          : "bg-white text-slate-500 border-slate-150 hover:text-slate-700"
                      }`}
                    >
                      $0.02 Net Profit
                    </button>
                    <button
                      type="button"
                      onClick={() => setAutoBarrierTarget("yield_2")}
                      className={`py-1 rounded font-mono font-black text-[10px] cursor-pointer text-center transition border ${
                        autoBarrierTarget === "yield_2"
                          ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                          : "bg-white text-slate-500 border-slate-150 hover:text-slate-700"
                      }`}
                    >
                      2.0% Yield (0.02)
                    </button>
                  </div>
                  <p className="text-[9px] text-slate-500 leading-relaxed font-semibold">
                    Automatically calculates safe offsets per market to return precisely{" "}
                    <strong>{autoBarrierTarget === "usd_0_02" ? "+$0.02" : "+2.0%"}</strong> profit payout.
                  </p>
                </div>
              )}
            </div>

            {/* Barrier Offset configuration */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider">
                  Barrier Offset level
                </span>
                <span className="text-xs font-black text-[#ff444f] font-mono">
                  {`H: ${barrierOffsetHigher >= 0 ? `+${barrierOffsetHigher}` : barrierOffsetHigher} | L: ${barrierOffsetLower >= 0 ? `+${barrierOffsetLower}` : barrierOffsetLower}`}
                </span>
              </div>
              
              {autoBarrierMode ? (
                <div className="bg-slate-50 border border-slate-150 rounded-xl p-2.5 text-[10px] text-slate-500 font-mono space-y-1 text-center shadow-xs">
                  <div className="text-emerald-600 font-black flex items-center justify-center space-x-1 text-[11px]">
                    <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                    <span>Auto-Solver Active</span>
                  </div>
                  <div>
                    Higher Offset: <span className="text-slate-800 font-extrabold">{barrierOffsetHigher >= 0 ? `+${barrierOffsetHigher}` : barrierOffsetHigher}</span>
                  </div>
                  <div>
                    Lower Offset: <span className="text-slate-800 font-extrabold">{barrierOffsetLower >= 0 ? `+${barrierOffsetLower}` : barrierOffsetLower}</span>
                  </div>
                  <div className="text-[9px] text-slate-400 pt-0.5">
                    (Manual change of offset will disable auto-mode)
                  </div>
                </div>
              ) : (
                <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl shadow-xs">
                  <button
                    type="button"
                    onClick={() => {
                      const cfg = getAssetBarrierConfig(activeAsset.symbol);
                      setBarrierOffset(Number((barrierOffset - cfg.step).toFixed(cfg.decimals)));
                      setAutoBarrierMode(false);
                    }}
                    className="px-3.5 py-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 font-black cursor-pointer font-mono rounded-l-xl transition"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    step={getAssetBarrierConfig(activeAsset.symbol).step}
                    value={barrierOffset}
                    onChange={(e) => {
                      const cfg = getAssetBarrierConfig(activeAsset.symbol);
                      setBarrierOffset(Number(Number(e.target.value).toFixed(cfg.decimals)));
                      setAutoBarrierMode(false);
                    }}
                    className="w-full bg-transparent border-none text-center font-black text-slate-800 text-xs font-mono focus:outline-none focus:ring-0"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const cfg = getAssetBarrierConfig(activeAsset.symbol);
                      setBarrierOffset(Number((barrierOffset + cfg.step).toFixed(cfg.decimals)));
                      setAutoBarrierMode(false);
                    }}
                    className="px-3.5 py-2 text-slate-500 hover:text-[#ff444f] hover:bg-slate-100 font-black cursor-pointer font-mono rounded-r-xl transition"
                  >
                    +
                  </button>
                </div>
              )}
              
              <div className="text-[9px] text-slate-500 font-mono text-center flex items-center justify-center space-x-1.5">
                <span>Absolute Barriers:</span>
                <span className="text-slate-800 font-extrabold bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200 font-mono">
                  {lastTick ? (
                    `H: ${(lastTick.quote + barrierOffsetHigher).toFixed(activeAsset.symbol.includes("frx") ? 5 : 2)} | L: ${(lastTick.quote + barrierOffsetLower).toFixed(activeAsset.symbol.includes("frx") ? 5 : 2)}`
                  ) : "..."}
                </span>
              </div>
            </div>

            {/* Stake Input Area */}
            <div className="space-y-1.5">
              <span className="text-[10px] text-slate-400 uppercase font-black block tracking-wider">Stake Amount (USD)</span>
              <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl shadow-xs">
                <span className="px-3 text-slate-400 font-black font-mono">$</span>
                <input
                  type="number"
                  min="1"
                  value={stake}
                  onChange={(e) => setStake(Math.max(1, Number(e.target.value)))}
                  className="w-full bg-transparent py-2 border-none text-slate-800 font-black text-xs font-mono focus:outline-none"
                />
                <span className="px-3 text-[10px] text-slate-400 font-black font-mono">USD</span>
              </div>
            </div>

            {/* Real-time DTrader Payout / Yield stats panel */}
            <div className="bg-slate-50 rounded-xl border border-slate-150 p-3.5 text-xs font-mono space-y-2 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 font-semibold">
                <span>Contract Yields</span>
                <span className="text-slate-800 font-black">
                  H: +{payoutPercentageHigher}% | L: +{payoutPercentageLower}%
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-500 font-semibold border-t border-slate-200 pt-2">
                <span>Estimated Payouts</span>
                <span className="text-emerald-600 font-black">
                  H: ${estimatedPayoutHigher} | L: ${estimatedPayoutLower}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold">
                <span>Net Profits</span>
                <span className="text-emerald-500 font-black">
                  H: +${estimatedNetProfitHigher} | L: +${estimatedNetProfitLower}
                </span>
              </div>
            </div>
          </div>

          {/* Action Buy Buttons with optimized Light contrast colors */}
          <div className="space-y-2.5 pt-4">
            <button
              type="button"
              disabled={!lastTick || wsStatus !== "connected" || !isMarketAvailable(activeAsset.symbol)}
              onClick={() => purchaseContract("Higher")}
              className="w-full bg-[#10b981] hover:bg-[#059669] disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-black py-3 rounded-xl flex items-center justify-between px-4 transition duration-200 shadow-md shadow-emerald-500/10 cursor-pointer"
            >
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-5 h-5 fill-white" />
                <div className="text-left">
                  <span className="block text-xs font-black uppercase tracking-wider">HIGHER</span>
                  <span className="block text-[8px] opacity-90 font-semibold font-mono">
                    Barrier: {(() => {
                      const offset = autoBarrierMode ? barrierOffsetHigher : barrierOffset;
                      const formattedOffset = offset >= 0 ? `+${offset.toFixed(activeAsset.symbol.includes("frx") ? 5 : 2)}` : offset.toFixed(activeAsset.symbol.includes("frx") ? 5 : 2);
                      const barrierVal = lastTick ? (lastTick.quote + offset).toFixed(activeAsset.symbol.includes("frx") ? 5 : 2) : "...";
                      return `${formattedOffset} (${barrierVal})`;
                    })()}
                  </span>
                </div>
              </div>
              <div className="text-right font-mono">
                <span className="block text-[9px] text-white opacity-80 font-bold">Payout:</span>
                <span className="block text-xs font-black">${estimatedPayoutHigher}</span>
              </div>
            </button>

            <button
              type="button"
              disabled={!lastTick || wsStatus !== "connected" || !isMarketAvailable(activeAsset.symbol)}
              onClick={() => purchaseContract("Lower")}
              className="w-full bg-[#ef4444] hover:bg-[#dc2626] disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-black py-3 rounded-xl flex items-center justify-between px-4 transition duration-200 shadow-md shadow-red-500/10 cursor-pointer"
            >
              <div className="flex items-center space-x-2">
                <TrendingDown className="w-5 h-5 fill-white" />
                <div className="text-left">
                  <span className="block text-xs font-black uppercase tracking-wider">LOWER</span>
                  <span className="block text-[8px] opacity-90 font-semibold font-mono">
                    Barrier: {(() => {
                      const offset = autoBarrierMode ? barrierOffsetLower : barrierOffset;
                      const formattedOffset = offset >= 0 ? `+${offset.toFixed(activeAsset.symbol.includes("frx") ? 5 : 2)}` : offset.toFixed(activeAsset.symbol.includes("frx") ? 5 : 2);
                      const barrierVal = lastTick ? (lastTick.quote + offset).toFixed(activeAsset.symbol.includes("frx") ? 5 : 2) : "...";
                      return `${formattedOffset} (${barrierVal})`;
                    })()}
                  </span>
                </div>
              </div>
              <div className="text-right font-mono">
                <span className="block text-[9px] text-white opacity-80 font-bold">Payout:</span>
                <span className="block text-xs font-black">${estimatedPayoutLower}</span>
              </div>
            </button>

            {!isMarketAvailable(activeAsset.symbol) && wsStatus === "connected" && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-[10px] text-rose-700 font-mono text-center flex flex-col items-center justify-center space-y-1 shadow-xs">
                <div className="flex items-center space-x-1 font-black uppercase text-rose-800">
                  <Lock className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  <span>Market Suspended</span>
                </div>
                <span>The background scanner detected this asset is currently closed or restricted.</span>
              </div>
            )}

            {(!lastTick || wsStatus !== "connected") && (
              <div className="flex items-center space-x-1.5 justify-center pt-1 text-[9px] text-amber-500 font-mono text-center">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Connecting to live streaming node...</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* TRADING JOURNAL OVERLAY PANEL */}
      {isJournalOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs cursor-pointer" 
            onClick={() => setIsJournalOpen(false)}
          />

          {/* Panel */}
          <div className="relative w-full max-w-xl bg-white h-full shadow-2xl flex flex-col z-10 animate-slide-in font-sans">
            {/* Header */}
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <BookOpen className="w-5 h-5 text-purple-600 animate-pulse" />
                <div>
                  <h3 className="font-black text-slate-900 text-sm tracking-tight uppercase">Deriv Official Trading Journal</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono">Real-Time Machine Learning Ledger</p>
                </div>
              </div>
              <button 
                onClick={() => setIsJournalOpen(false)}
                className="p-1 hover:bg-slate-200 text-slate-500 hover:text-slate-800 rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Core Analytics Card */}
              <div className="grid grid-cols-3 gap-3 bg-slate-900 text-white p-4 rounded-2xl shadow-md border border-slate-800">
                {/* Total Trades */}
                <div className="text-center">
                  <span className="block text-[8px] uppercase tracking-wider text-slate-400 font-bold">Total Trades</span>
                  <span className="block text-lg font-black font-mono mt-1">
                    {contractHistory.length}
                  </span>
                </div>

                {/* Total Profit/Loss */}
                <div className="text-center border-x border-slate-800 px-2">
                  <span className="block text-[8px] uppercase tracking-wider text-slate-400 font-bold">Total P&amp;L</span>
                  {(() => {
                    const totalPL = contractHistory.reduce((acc, c) => {
                      const amount = c.status === "WON" ? (c.payout - c.stake) : -c.stake;
                      return acc + amount;
                    }, 0);
                    const isPositive = totalPL >= 0;
                    return (
                      <span className={`block text-lg font-black font-mono mt-1 ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
                        {isPositive ? "+" : ""}${totalPL.toFixed(2)}
                      </span>
                    );
                  })()}
                </div>

                {/* Win Rate */}
                <div className="text-center">
                  <span className="block text-[8px] uppercase tracking-wider text-slate-400 font-bold">Win Rate</span>
                  {(() => {
                    const wins = contractHistory.filter(c => c.status === "WON").length;
                    const rate = contractHistory.length > 0 ? (wins / contractHistory.length) * 100 : 0;
                    return (
                      <span className="block text-lg font-black font-mono mt-1 text-purple-400">
                        {rate.toFixed(1)}%
                      </span>
                    );
                  })()}
                </div>
              </div>

              {/* Machine Learning Lessons Section */}
              <div className="border border-purple-200 bg-purple-50/40 rounded-2xl p-4 space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <Brain className="w-4 h-4 text-purple-600 animate-pulse" />
                    <span className="text-xs font-black text-purple-900 uppercase tracking-tight">Active ML Learning Database</span>
                  </div>
                  {accumulatedLessons.length > 0 && (
                    <button
                      onClick={() => {
                        if (confirm("Reset local machine learning lessons?")) {
                          setAccumulatedLessons([]);
                        }
                      }}
                      className="text-[9px] font-black text-rose-600 hover:text-rose-800 uppercase tracking-wider font-mono cursor-pointer"
                    >
                      Reset Memory
                    </button>
                  )}
                </div>

                {accumulatedLessons.length === 0 ? (
                  <p className="text-[10px] text-slate-500 font-mono italic">
                    Database is empty. Execute higher/lower option contracts either in Demo/Real mode to train the ML engine.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1 animate-fadeIn">
                    {accumulatedLessons.slice(0, 5).map((lesson) => (
                      <div key={lesson.id} className="bg-white/80 border border-purple-100 p-2.5 rounded-xl text-[10px] space-y-1 shadow-2xs">
                        <div className="flex items-center justify-between">
                          <span className="font-black text-purple-950 uppercase tracking-tight">
                            {lesson.symbol} • {lesson.tradeType}
                          </span>
                          <span className={`px-1.5 py-0.2 rounded font-black text-[8px] uppercase tracking-wider font-mono ${
                            lesson.status === "WON" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                          }`}>
                            {lesson.status}
                          </span>
                        </div>
                        <p className="text-slate-600 leading-relaxed font-medium">{lesson.insightText}</p>
                        <div className="pt-1 border-t border-purple-50 flex items-start space-x-1">
                          <span className="text-[9px] font-black text-purple-600 uppercase font-mono">RULE UPDATE:</span>
                          <span className="text-purple-900 font-bold leading-normal">{lesson.ruleCreated}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Journal / Trade History */}
              <div className="space-y-2">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-tight">Settled Contract Log</h4>
                
                {contractHistory.length === 0 ? (
                  <div className="text-center py-8 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                    <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider font-mono">No Trades Logged Yet</p>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
                    {contractHistory.map((contract) => {
                      const isWin = contract.status === "WON";
                      const netPL = isWin ? (contract.payout - contract.stake) : -contract.stake;
                      return (
                        <div key={contract.id} className="border border-slate-150 rounded-2xl bg-white p-3.5 space-y-2.5 shadow-2xs hover:shadow-xs transition duration-150">
                          {/* Top row */}
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center space-x-1.5">
                                <span className="text-xs font-black text-slate-900 uppercase tracking-tight">
                                  {contract.symbolName || contract.symbol}
                                </span>
                                <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded font-mono ${
                                  contract.type === "Higher" ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-700"
                                }`}>
                                  {contract.type}
                                </span>
                              </div>
                              <span className="text-[9px] text-slate-400 font-mono block">ID: {contract.id}</span>
                            </div>

                            <div className="text-right">
                              <span className={`block text-xs font-black font-mono ${isWin ? "text-emerald-600" : "text-rose-600"}`}>
                                {isWin ? "+" : "-"}${Math.abs(netPL).toFixed(2)}
                              </span>
                              <span className="text-[8px] font-mono text-slate-400 block">Stake: ${contract.stake.toFixed(2)}</span>
                            </div>
                          </div>

                          {/* Stats row */}
                          <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded-xl text-[9px] font-mono">
                            <div>
                              <span className="text-slate-400 block font-bold uppercase text-[7px]">Entry Spot</span>
                              <span className="text-slate-700 font-bold">${contract.entryPrice.toFixed(4)}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block font-bold uppercase text-[7px]">Exit Spot</span>
                              <span className="text-slate-700 font-bold">${contract.exitPrice?.toFixed(4) || "N/A"}</span>
                            </div>
                          </div>

                          {/* ML Analysis line */}
                          {contract.learningAnalysis && (
                            <div className="bg-slate-50/50 border-l-2 border-purple-500 pl-2 py-1 text-[9px] text-slate-600 leading-normal font-medium">
                              <span className="font-black text-purple-700 uppercase tracking-wider block text-[7px] font-mono mb-0.5">Guru Analysis</span>
                              {contract.learningAnalysis}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification Container */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-2xl shadow-lg border backdrop-blur-md transition-all duration-300 transform translate-y-0 ${
              toast.type === "error"
                ? "bg-rose-50/95 border-rose-200 text-rose-950"
                : toast.type === "warning"
                ? "bg-amber-50/95 border-amber-200 text-amber-950"
                : toast.type === "success"
                ? "bg-emerald-50/95 border-emerald-200 text-emerald-950"
                : "bg-blue-50/95 border-blue-200 text-blue-950"
            }`}
          >
            {toast.type === "error" && <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />}
            {toast.type === "warning" && <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />}
            {toast.type === "success" && <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />}
            {toast.type === "info" && <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />}
            
            <div className="flex-1 text-xs font-bold leading-normal">
              {toast.message}
            </div>

            <button
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="text-slate-400 hover:text-slate-600 shrink-0 cursor-pointer transition p-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
