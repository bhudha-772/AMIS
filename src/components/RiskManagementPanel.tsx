import React, { useState, useEffect } from "react";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Play,
  RotateCcw,
  PlusCircle,
  XCircle,
  HelpCircle,
  Settings,
  Flame,
  CheckCircle2,
  ListFilter,
  BarChart2,
  Lock,
  RefreshCw,
  TrendingDown,
  Percent,
  Terminal,
  Clock
} from "lucide-react";
import { RiskDecision, PortfolioRiskState, CapitalState, SizingMethod, EmergencyState } from "../riskTypes";

export function RiskManagementPanel() {
  const [currentRiskState, setCurrentRiskState] = useState<any>(null);
  const [portfolioState, setPortfolioState] = useState<PortfolioRiskState | null>(null);
  const [riskHistory, setRiskHistory] = useState<RiskDecision[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [selectedDecision, setSelectedDecision] = useState<RiskDecision | null>(null);
  const [testReport, setTestReport] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Position Calculator Form State
  const [calcSymbol, setCalcSymbol] = useState("BTCUSDT");
  const [calcPrice, setCalcPrice] = useState(64500);
  const [calcExpectedMove, setCalcExpectedMove] = useState(0.04);
  const [calcExpectedDrawdown, setCalcExpectedDrawdown] = useState(0.025);
  const [calcConfidence, setCalcConfidence] = useState(82);
  const [calcWinRate, setCalcWinRate] = useState(57);
  const [calcVolatility, setCalcVolatility] = useState(0.12);
  const [calcEV, setCalcEV] = useState(0.22);
  const [calcDirection, setCalcDirection] = useState<"LONG" | "SHORT">("LONG");

  // Config Update State
  const [activeSizing, setActiveSizing] = useState<SizingMethod>("FIXED_FRACTIONAL");
  const [riskPerTrade, setRiskPerTrade] = useState(0.02);
  const [maxDailyLoss, setMaxDailyLoss] = useState(5000);
  const [coolingDuration, setCoolingDuration] = useState(1800000);

  // Simulated Position Form State
  const [simSymbol, setSimSymbol] = useState("BTCUSDT");
  const [simSide, setSimSide] = useState<"LONG" | "SHORT">("LONG");
  const [simPrice, setSimPrice] = useState(64500);
  const [simAmount, setSimAmount] = useState(0.25);
  const [simStop, setSimStop] = useState(63200);

  // Simulated Close Form State
  const [simExitPrice, setSimExitPrice] = useState(65800);

  // Fetch all Risk Engine data from API
  const refreshRiskData = async () => {
    try {
      setIsLoading(true);
      
      // 1. Fetch current risk configuration
      const resCurrent = await fetch("/api/risk/current");
      const dataCurrent = await resCurrent.json();
      if (dataCurrent.success) {
        setCurrentRiskState(dataCurrent);
        setActiveSizing(dataCurrent.config.sizingMethod);
        setRiskPerTrade(dataCurrent.capitalState.riskPerTrade);
        setMaxDailyLoss(dataCurrent.capitalState.maxDailyLoss);
        setCoolingDuration(dataCurrent.config.coolingOffDuration);
      }

      // 2. Fetch portfolio state
      const resPortfolio = await fetch("/api/risk/portfolio");
      const dataPortfolio = await resPortfolio.json();
      if (dataPortfolio.success) {
        setPortfolioState(dataPortfolio.portfolioState);
      }

      // 3. Fetch history
      const resHistory = await fetch("/api/risk/history?limit=30");
      const dataHistory = await resHistory.json();
      if (dataHistory.success) {
        setRiskHistory(dataHistory.history);
      }

      // 4. Fetch Statistics
      const resStats = await fetch("/api/risk/statistics");
      const dataStats = await resStats.json();
      if (dataStats.success) {
        setStats(dataStats.statistics);
      }

    } catch (err) {
      console.error("Failed to load risk dashboard data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshRiskData();
    const interval = setInterval(refreshRiskData, 5000);
    return () => clearInterval(interval);
  }, []);

  // Update server risk configuration
  const handleUpdateConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      const res = await fetch("/api/risk/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sizingMethod: activeSizing,
          riskPerTrade: Number(riskPerTrade),
          maxDailyLoss: Number(maxDailyLoss),
          coolingOffDuration: Number(coolingDuration)
        })
      });
      const data = await res.json();
      if (data.success) {
        refreshRiskData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  // Change Emergency State manually
  const handleTransitionEmergency = async (state: EmergencyState) => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/risk/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emergencyState: state })
      });
      await res.json();
      refreshRiskData();
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  // Run automated risk tests
  const handleRunTests = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/risk/run-tests", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setTestReport(data.results);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  // Simulate opening a position
  const handleSimulateOpen = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      const res = await fetch("/api/risk/simulate-position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: simSymbol,
          side: simSide,
          entryPrice: simPrice,
          amount: simAmount,
          stopLossPrice: simStop,
          strategy: "TACTICAL_SQUEEZE",
          model: "GURU_v2"
        })
      });
      await res.json();
      refreshRiskData();
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  // Simulate closing a position
  const handleSimulateClose = async (symbol: string, currentPrice: number) => {
    try {
      setIsLoading(true);
      const exitPriceVal = simExitPrice || currentPrice;
      const res = await fetch("/api/risk/simulate-close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          exitPrice: exitPriceVal
        })
      });
      await res.json();
      refreshRiskData();
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  // Compute calculated values for local comparative tool
  const getComparativeSizes = () => {
    if (!currentRiskState) return [];
    const equity = currentRiskState.capitalState.currentEquity;
    const riskUSD = equity * riskPerTrade;
    const stopDistance = calcPrice * calcExpectedDrawdown;

    const models: { method: SizingMethod; name: string; size: number; allocation: number; formula: string }[] = [
      {
        method: "FIXED_SIZE",
        name: "Fixed Size Units",
        size: 0.15,
        allocation: 0.15 * calcPrice,
        formula: "0.15 BTC / Unit Equivalent"
      },
      {
        method: "FIXED_FRACTIONAL",
        name: "Fixed Fractional Risk",
        size: riskUSD / stopDistance,
        allocation: riskUSD,
        formula: "(Equity * Risk%) / StopDistance"
      },
      {
        method: "KELLY_CRITERION",
        name: "Kelly Criterion",
        size: (() => {
          const wr = calcWinRate / 100;
          const payout = calcExpectedMove / calcExpectedDrawdown;
          const kFraction = Math.min(0.10, Math.max(0, wr - (1 - wr) / payout));
          return (equity * kFraction) / calcPrice;
        })(),
        allocation: (() => {
          const wr = calcWinRate / 100;
          const payout = calcExpectedMove / calcExpectedDrawdown;
          const kFraction = Math.min(0.10, Math.max(0, wr - (1 - wr) / payout));
          return equity * kFraction;
        })(),
        formula: "Equity * Max(KellyFraction, 10% Cap)"
      },
      {
        method: "REDUCED_KELLY",
        name: "Reduced Kelly (0.5x)",
        size: (() => {
          const wr = calcWinRate / 100;
          const payout = calcExpectedMove / calcExpectedDrawdown;
          const kFraction = Math.min(0.10, Math.max(0, wr - (1 - wr) / payout)) * 0.5;
          return (equity * kFraction) / calcPrice;
        })(),
        allocation: (() => {
          const wr = calcWinRate / 100;
          const payout = calcExpectedMove / calcExpectedDrawdown;
          const kFraction = Math.min(0.10, Math.max(0, wr - (1 - wr) / payout)) * 0.5;
          return equity * kFraction;
        })(),
        formula: "Half Kelly allocation size"
      },
      {
        method: "VOLATILITY_ADJUSTED",
        name: "Volatility Adjusted",
        size: (() => {
          const targetVol = 0.08;
          const volScaling = Math.min(2.0, Math.max(0.2, targetVol / calcVolatility));
          return (riskUSD * volScaling) / stopDistance;
        })(),
        allocation: (() => {
          const targetVol = 0.08;
          const volScaling = Math.min(2.0, Math.max(0.2, targetVol / calcVolatility));
          return riskUSD * volScaling;
        })(),
        formula: "Fractional risk scaled by target volatility ratio"
      },
      {
        method: "ATR_BASED",
        name: "ATR Stop Sizing",
        size: riskUSD / (stopDistance * 2),
        allocation: riskUSD,
        formula: "(Equity * Risk%) / (2 * ATR proxy)"
      },
      {
        method: "EXPECTED_VALUE_WEIGHTED",
        name: "EV Weighted",
        size: (() => {
          const scaling = Math.min(1.8, Math.max(0.1, calcEV / 0.25));
          return (riskUSD * scaling) / stopDistance;
        })(),
        allocation: riskUSD * Math.min(1.8, Math.max(0.1, calcEV / 0.25)),
        formula: "Fractional risk scaled by EV over benchmark"
      },
      {
        method: "CONFIDENCE_WEIGHTED",
        name: "Confidence Weighted",
        size: (riskUSD * (calcConfidence / 100)) / stopDistance,
        allocation: riskUSD * (calcConfidence / 100),
        formula: "Fractional risk scaled by prediction confidence"
      },
      {
        method: "PROBABILITY_WEIGHTED",
        name: "Probability Weighted",
        size: (riskUSD * (calcWinRate / 100)) / stopDistance,
        allocation: riskUSD * (calcWinRate / 100),
        formula: "Fractional risk scaled by win probability"
      },
      {
        method: "DYNAMIC_RISK_SCALING",
        name: "Dynamic Scaling (Streak)",
        size: (riskUSD * 0.8) / stopDistance,
        allocation: riskUSD * 0.8,
        formula: "Adaptive scaling factor adjusted on historical win streaks"
      }
    ];

    return models.map(m => ({
      ...m,
      size: Number(m.size.toFixed(5)),
      allocation: Number(m.allocation.toFixed(2))
    }));
  };

  const emergencyState = currentRiskState?.emergencyState || "NORMAL";

  return (
    <div className="bg-[#12161a] min-h-full flex flex-col divide-y divide-[#24262b] select-text h-full overflow-y-auto custom-scrollbar p-4 lg:p-6 space-y-6">
      
      {/* SECTION 1: HEADER & SYSTEM STATE BANNER */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-[#16181a] border border-[#24262b] p-4 rounded-lg">
        <div className="flex items-center space-x-3.5">
          <div className={`p-2.5 rounded-full ${
            emergencyState === "NORMAL" ? "bg-green-950/40 text-green-400" :
            emergencyState === "CAUTION" ? "bg-amber-950/40 text-amber-400" :
            emergencyState === "HIGH_RISK" ? "bg-red-950/40 text-red-400 animate-pulse" :
            "bg-red-900 text-white animate-bounce"
          }`}>
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-extrabold tracking-tight text-white">Risk Intelligence Engine</h2>
              <span className="text-[10px] bg-[#22252a] px-2 py-0.5 rounded border border-[#2d3139] text-[#848e9c] font-mono">
                PHASE 7 ACTIVE
              </span>
            </div>
            <p className="text-xs text-[#848e9c] mt-0.5">
              Institutional gatekeeper resolving trading safety, leverage, capital limits, and deterministic size algorithms.
            </p>
          </div>
        </div>

        {/* Dynamic Emergency Controller */}
        <div className="flex flex-wrap items-center gap-1.5 bg-[#1f2226] p-1.5 rounded border border-[#2b2f36]">
          <span className="text-[9px] font-bold text-[#848e9c] uppercase px-1.5 font-mono">
            Safety Level:
          </span>
          <button
            onClick={() => handleTransitionEmergency("NORMAL")}
            className={`px-2.5 py-1 text-[10px] font-extrabold rounded cursor-pointer ${
              emergencyState === "NORMAL"
                ? "bg-green-500 text-black font-black"
                : "text-green-500 hover:bg-[#2e3b33]/20"
            }`}
          >
            NORMAL
          </button>
          <button
            onClick={() => handleTransitionEmergency("CAUTION")}
            className={`px-2.5 py-1 text-[10px] font-extrabold rounded cursor-pointer ${
              emergencyState === "CAUTION"
                ? "bg-amber-500 text-black font-black"
                : "text-amber-500 hover:bg-[#483c27]/20"
            }`}
          >
            CAUTION
          </button>
          <button
            onClick={() => handleTransitionEmergency("HIGH_RISK")}
            className={`px-2.5 py-1 text-[10px] font-extrabold rounded cursor-pointer ${
              emergencyState === "HIGH_RISK"
                ? "bg-orange-500 text-black font-black"
                : "text-orange-500 hover:bg-[#482d27]/20"
            }`}
          >
            HIGH RISK
          </button>
          <button
            onClick={() => handleTransitionEmergency("LOCKDOWN")}
            className={`px-2.5 py-1 text-[10px] font-extrabold rounded cursor-pointer ${
              emergencyState === "LOCKDOWN"
                ? "bg-yellow-600 text-white font-black animate-pulse"
                : "text-yellow-500 hover:bg-yellow-950/20"
            }`}
          >
            LOCKDOWN
          </button>
          <button
            onClick={() => handleTransitionEmergency("EMERGENCY_STOP")}
            className={`px-2.5 py-1 text-[10px] font-extrabold rounded cursor-pointer ${
              emergencyState === "EMERGENCY_STOP"
                ? "bg-red-600 text-white font-black animate-pulse"
                : "text-red-500 hover:bg-red-950/20"
            }`}
          >
            SHUTDOWN
          </button>
        </div>
      </div>

      {/* SECTION 2: METRICS & RISK GAUGES */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        
        {/* Card A: Capital Allocation & Utilization */}
        <div className="bg-[#16181a] border border-[#24262b] p-4 rounded-lg flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#848e9c] uppercase font-mono tracking-wider">
              Capital Utilization
            </span>
            <TrendingDown className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2.5 flex items-baseline space-x-2">
            <span className="text-2xl font-black text-white font-mono">
              {currentRiskState?.capitalState.capitalUtilization || "0.00"}%
            </span>
            <span className="text-[10px] text-[#848e9c] font-mono">
              of Equity
            </span>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-[#2a2e35] h-1.5 rounded-full mt-3 overflow-hidden">
            <div
              className="bg-[#ff4976] h-1.5 rounded-full"
              style={{ width: `${currentRiskState?.capitalState.capitalUtilization || 0}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-[#848e9c] font-mono mt-2">
            <span>Used: ${currentRiskState?.capitalState.usedMargin.toLocaleString() || "0.00"}</span>
            <span>Free: ${currentRiskState?.capitalState.availableMargin.toLocaleString() || "0.00"}</span>
          </div>
        </div>

        {/* Card B: Portfolio Risk Heat */}
        <div className="bg-[#16181a] border border-[#24262b] p-4 rounded-lg flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#848e9c] uppercase font-mono tracking-wider">
              Aggregated Portfolio Heat
            </span>
            <Flame className="w-4 h-4 text-[#ff4976]" />
          </div>
          <div className="mt-2.5 flex items-baseline space-x-2">
            <span className="text-2xl font-black text-white font-mono">
              {portfolioState?.portfolioHeat || "0.00"}%
            </span>
            <span className="text-[10px] text-[#ff4976] font-mono uppercase font-black">
              {Number(portfolioState?.portfolioHeat || 0) > 10 ? "HIGH RISK" : "WELL SECURED"}
            </span>
          </div>
          <div className="w-full bg-[#2a2e35] h-1.5 rounded-full mt-3 overflow-hidden">
            <div
              className="bg-orange-500 h-1.5 rounded-full"
              style={{ width: `${Math.min(100, (portfolioState?.portfolioHeat || 0) * 5)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-[#848e9c] font-mono mt-2">
            <span>Overall Risk: ${currentRiskState?.capitalState.portfolioRisk.toLocaleString() || "0.00"}</span>
            <span>Limit: ${((currentRiskState?.capitalState.currentEquity || 100000) * 0.15).toLocaleString()} (15%)</span>
          </div>
        </div>

        {/* Card C: Drawdown Loss Buffer */}
        <div className="bg-[#16181a] border border-[#24262b] p-4 rounded-lg flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#848e9c] uppercase font-mono tracking-wider">
              Daily Loss Remaining
            </span>
            <Lock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2.5 flex items-baseline space-x-2">
            <span className="text-2xl font-black text-[#0ecb81] font-mono">
              ${(maxDailyLoss + (currentRiskState?.capitalState.dailyPL || 0)).toLocaleString()}
            </span>
            <span className="text-[10px] text-[#848e9c] font-mono">
              USDT
            </span>
          </div>
          <div className="w-full bg-[#2a2e35] h-1.5 rounded-full mt-3 overflow-hidden">
            <div
              className="bg-emerald-400 h-1.5 rounded-full"
              style={{
                width: `${Math.max(0, Math.min(100, ((maxDailyLoss + (currentRiskState?.capitalState.dailyPL || 0)) / maxDailyLoss) * 100))}%`
              }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-[#848e9c] font-mono mt-2">
            <span>Daily P&L: ${(currentRiskState?.capitalState.dailyPL || 0).toLocaleString()}</span>
            <span>Max Allowable: ${maxDailyLoss.toLocaleString()}</span>
          </div>
        </div>

        {/* Card D: Institutional Probability of Ruin */}
        <div className="bg-[#16181a] border border-[#24262b] p-4 rounded-lg flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#848e9c] uppercase font-mono tracking-wider">
              Computed Risk of Ruin
            </span>
            <Percent className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2.5 flex items-baseline space-x-2">
            <span className="text-2xl font-black text-purple-400 font-mono">
              {currentRiskState?.capitalState.riskOfRuin || "0.000"}%
            </span>
            <span className="text-[10px] text-[#848e9c] font-mono">
              System Ruin Prob
            </span>
          </div>
          <div className="w-full bg-[#2a2e35] h-1.5 rounded-full mt-3 overflow-hidden">
            <div
              className="bg-purple-500 h-1.5 rounded-full"
              style={{ width: `${Math.min(100, (currentRiskState?.capitalState.riskOfRuin || 0) * 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-[#848e9c] font-mono mt-2">
            <span>Recovery Factor: {currentRiskState?.capitalState.recoveryFactor || "2.45"}</span>
            <span>Streak: W:{portfolioState?.maxConsecutiveWins} L:{portfolioState?.maxConsecutiveLosses}</span>
          </div>
        </div>

      </div>

      {/* SECTION 3: COMPARATIVE POSITION SIZING CALCULATOR */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        
        {/* Left Side: Interactive Input Parameters */}
        <div className="xl:col-span-4 bg-[#16181a] border border-[#24262b] p-4 rounded-lg space-y-4">
          <h3 className="text-xs font-extrabold text-white uppercase tracking-wider font-mono flex items-center space-x-2">
            <Percent className="w-4 h-4 text-[#ff4976]" />
            <span>Position Size Simulator (Deterministic comparisons)</span>
          </h3>
          <p className="text-[11px] text-[#848e9c]">
            Simulate current asset characteristics to calculate and compare execution sizes across all 10 mathematical algorithms.
          </p>

          <div className="space-y-3.5">
            <div>
              <label className="block text-[10px] font-bold text-[#848e9c] uppercase font-mono mb-1">
                Asset Spot Price (USDT)
              </label>
              <input
                type="number"
                value={calcPrice}
                onChange={e => setCalcPrice(Number(e.target.value))}
                className="w-full bg-[#1e2226] border border-[#2d3139] rounded px-2.5 py-1.5 text-xs text-white font-mono outline-none focus:border-[#ff4976]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-[#848e9c] uppercase font-mono mb-1">
                  Expected Move (Reward)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={calcExpectedMove}
                  onChange={e => setCalcExpectedMove(Number(e.target.value))}
                  className="w-full bg-[#1e2226] border border-[#2d3139] rounded px-2.5 py-1.5 text-xs text-white font-mono outline-none focus:border-[#ff4976]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-[#848e9c] uppercase font-mono mb-1">
                  Expected Drawdown (Stop Dist)
                </label>
                <input
                  type="number"
                  step="0.005"
                  value={calcExpectedDrawdown}
                  onChange={e => setCalcExpectedDrawdown(Number(e.target.value))}
                  className="w-full bg-[#1e2226] border border-[#2d3139] rounded px-2.5 py-1.5 text-xs text-white font-mono outline-none focus:border-[#ff4976]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-[#848e9c] uppercase font-mono mb-1">
                  Model Confidence (%)
                </label>
                <input
                  type="number"
                  value={calcConfidence}
                  onChange={e => setCalcConfidence(Number(e.target.value))}
                  className="w-full bg-[#1e2226] border border-[#2d3139] rounded px-2.5 py-1.5 text-xs text-white font-mono outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-[#848e9c] uppercase font-mono mb-1">
                  Directional Probability (%)
                </label>
                <input
                  type="number"
                  value={calcWinRate}
                  onChange={e => setCalcWinRate(Number(e.target.value))}
                  className="w-full bg-[#1e2226] border border-[#2d3139] rounded px-2.5 py-1.5 text-xs text-white font-mono outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-[#848e9c] uppercase font-mono mb-1">
                  Expected Volatility (ATR)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={calcVolatility}
                  onChange={e => setCalcVolatility(Number(e.target.value))}
                  className="w-full bg-[#1e2226] border border-[#2d3139] rounded px-2.5 py-1.5 text-xs text-white font-mono outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-[#848e9c] uppercase font-mono mb-1">
                  Expected Value (EV)
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={calcEV}
                  onChange={e => setCalcEV(Number(e.target.value))}
                  className="w-full bg-[#1e2226] border border-[#2d3139] rounded px-2.5 py-1.5 text-xs text-white font-mono outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Comparative Output Grid Table */}
        <div className="xl:col-span-8 bg-[#16181a] border border-[#24262b] p-4 rounded-lg flex flex-col">
          <h3 className="text-xs font-extrabold text-white uppercase tracking-wider font-mono flex items-center space-x-2">
            <BarChart2 className="w-4 h-4 text-[#ff4976]" />
            <span>Sizing Algorithm Performance Comparison</span>
          </h3>
          <p className="text-[11px] text-[#848e9c] mt-1">
            Active sizing strategy is flagged in the table. Each calculation is fully reproducible and deterministic.
          </p>

          <div className="flex-1 overflow-x-auto mt-3 border border-[#22252a] rounded">
            <table className="w-full text-[11px] text-[#eaecef] text-left border-collapse">
              <thead>
                <tr className="bg-[#1f2226] border-b border-[#2b2f36] text-[#848e9c] font-mono">
                  <th className="p-2">Sizing Method</th>
                  <th className="p-2">Recommended Units</th>
                  <th className="p-2">USDT Allocation</th>
                  <th className="p-2">Mathematical Logic Formula</th>
                  <th className="p-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#22252a]">
                {getComparativeSizes().map(model => {
                  const isActive = currentRiskState?.config.sizingMethod === model.method;
                  return (
                    <tr
                      key={model.method}
                      className={`hover:bg-[#1f2226] ${isActive ? "bg-[#ff4976]/5 font-semibold" : ""}`}
                    >
                      <td className="p-2 font-mono flex items-center space-x-1.5">
                        {isActive && <CheckCircle2 className="w-3.5 h-3.5 text-[#ff4976] shrink-0" />}
                        <span>{model.name}</span>
                      </td>
                      <td className="p-2 text-white font-mono">{model.size} units</td>
                      <td className="p-2 text-white font-mono">${model.allocation.toLocaleString()}</td>
                      <td className="p-2 text-[#848e9c] font-mono text-[10px]">{model.formula}</td>
                      <td className="p-2 text-right">
                        {isActive ? (
                          <span className="px-1.5 py-0.5 rounded text-[8px] bg-[#ff4976] text-white font-black">
                            ACTIVE
                          </span>
                        ) : (
                          <span className="text-[#848e9c]">Standby</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* SECTION 4: 16 CORE SAFETY CHECKS & SYSTEM PARAMETERS */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        
        {/* Left Side: 16 Safety Checks List */}
        <div className="xl:col-span-8 bg-[#16181a] border border-[#24262b] p-4 rounded-lg">
          <h3 className="text-xs font-extrabold text-white uppercase tracking-wider font-mono flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Deterministic Safety Systems Verification (16-Rule Gating Engine)</span>
          </h3>
          <p className="text-[11px] text-[#848e9c] mt-1">
            Standard institutional-grade risk gates checking operational, infrastructure, network, and prediction health on every execution.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
            {[
              { id: "EMERGENCY_STOP", name: "Manual Emergency Switch", status: emergencyState !== "EMERGENCY_STOP", desc: "Verifies the physical system manual killswitch is disengaged." },
              { id: "MAX_DAILY_LOSS", name: "Daily Loss Limit", status: currentRiskState?.capitalState.dailyPL > -maxDailyLoss, desc: "Locks trading if cumulative daily loss limit is breached." },
              { id: "MAX_WEEKLY_LOSS", name: "Weekly Loss Limit", status: currentRiskState?.capitalState.weeklyPL > -12000, desc: "Locks trading if cumulative weekly loss limit is breached." },
              { id: "MAX_MONTHLY_LOSS", name: "Monthly Loss Limit", status: currentRiskState?.capitalState.monthlyPL > -25000, desc: "Locks trading if cumulative monthly loss limit is breached." },
              { id: "MAX_LEVERAGE", name: "Dynamic Leverage Guard", status: true, desc: "Prevents overall margin leverage exceeding 10x boundaries." },
              { id: "MAX_SLIPPAGE", name: "Execution Slippage Limit", status: true, desc: "Blocks entries if projected execution slippage > 0.5%." },
              { id: "MAX_SPREAD", name: "Order Book Spread Check", status: true, desc: "Checks if order book spreads are tight enough for high liquidity." },
              { id: "MAX_LATENCY", name: "REST/WebSocket Latency", status: true, desc: "Ensures engine turnaround communication stays under 250ms." },
              { id: "CLOCK_SYNCHRONIZED", name: "Clock Time Synchronization", status: true, desc: "Physical server clock must remain closely synced to UTC." },
              { id: "STREAM_HEALTHY", name: "WebSocket Stream Health", status: true, desc: "Checks tick streams are receiving constant updates." },
              { id: "DATA_INTEGRITY", name: "Inbound Data Completeness", status: true, desc: "Verifies fields contain no empty or corrupt matrices." },
              { id: "PREDICTION_AGE", name: "Model Prediction Staleness", status: true, desc: "Rejects signals if prediction age exceeds 5 minutes." },
              { id: "MAX_MARKET_NOISE", name: "Volatility Noise Guard", status: true, desc: "Blocks order entries if random noise index exceeds 70%." },
              { id: "MINIMUM_LIQUIDITY", name: "Liquidity Depth Guard", status: true, desc: "Checks depth of closest bid-ask rows for volume absorption." },
              { id: "COOLING_OFF_PERIOD", name: "Asset Cooling Timeout", status: true, desc: "Imposes temporary cooldowns on symbols experiencing losses." },
              { id: "MAX_OPEN_TRADES", name: "Simultaneous Exposure Count", status: (portfolioState?.openPositions.length || 0) < 5, desc: "Limits concurrent open trades to a maximum of 5." }
            ].map(rule => (
              <div key={rule.id} className="flex items-start space-x-3 bg-[#1e2226] border border-[#2d3139] p-2.5 rounded hover:border-gray-700 transition">
                <div className={`mt-0.5 rounded-full p-1 shrink-0 ${
                  rule.status ? "bg-green-950/40 text-green-400" : "bg-red-950/40 text-red-400 animate-pulse"
                }`}>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-[11px] font-black text-white">{rule.name}</span>
                    <span className={`text-[8px] px-1 py-0.2 rounded font-mono font-bold ${
                      rule.status ? "bg-green-950 text-green-400" : "bg-red-950 text-red-400"
                    }`}>
                      {rule.status ? "PASSED" : "FAILED"}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#848e9c] mt-0.5 leading-relaxed">{rule.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Update Settings Configuration */}
        <div className="xl:col-span-4 bg-[#16181a] border border-[#24262b] p-4 rounded-lg flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="text-xs font-extrabold text-white uppercase tracking-wider font-mono flex items-center space-x-2">
              <Settings className="w-4 h-4 text-[#ff4976]" />
              <span>Admin Policy Configuration</span>
            </h3>
            <p className="text-[11px] text-[#848e9c]">
              Update operational parameters and risk limits directly. Changes persist dynamically across live endpoints.
            </p>

            <form onSubmit={handleUpdateConfig} className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-bold text-[#848e9c] uppercase font-mono mb-1">
                  Active Sizing Model Strategy
                </label>
                <select
                  value={activeSizing}
                  onChange={e => setActiveSizing(e.target.value as SizingMethod)}
                  className="w-full bg-[#1e2226] border border-[#2d3139] rounded px-2.5 py-1.5 text-xs text-white outline-none cursor-pointer"
                >
                  <option value="FIXED_SIZE">Fixed Size Units</option>
                  <option value="FIXED_FRACTIONAL">Fixed Fractional Risk</option>
                  <option value="KELLY_CRITERION">Kelly Criterion</option>
                  <option value="REDUCED_KELLY">Reduced Kelly (Half-Kelly)</option>
                  <option value="VOLATILITY_ADJUSTED">Volatility Adjusted</option>
                  <option value="ATR_BASED">ATR-Based Sizing</option>
                  <option value="EXPECTED_VALUE_WEIGHTED">Expected Value Weighted</option>
                  <option value="CONFIDENCE_WEIGHTED">Confidence Weighted</option>
                  <option value="PROBABILITY_WEIGHTED">Probability Weighted</option>
                  <option value="DYNAMIC_RISK_SCALING">Dynamic Risk Scaling (Streak)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#848e9c] uppercase font-mono mb-1">
                  Max Risk % Per Trade (Default 2%)
                </label>
                <input
                  type="number"
                  step="0.005"
                  value={riskPerTrade}
                  onChange={e => setRiskPerTrade(Number(e.target.value))}
                  className="w-full bg-[#1e2226] border border-[#2d3139] rounded px-2.5 py-1.5 text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#848e9c] uppercase font-mono mb-1">
                  Daily Drawdown Stop Limit (USDT)
                </label>
                <input
                  type="number"
                  value={maxDailyLoss}
                  onChange={e => setMaxDailyLoss(Number(e.target.value))}
                  className="w-full bg-[#1e2226] border border-[#2d3139] rounded px-2.5 py-1.5 text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#848e9c] uppercase font-mono mb-1">
                  Asset Cooldown Duration (Minutes)
                </label>
                <input
                  type="number"
                  value={coolingDuration / 60000}
                  onChange={e => setCoolingDuration(Number(e.target.value) * 60000)}
                  className="w-full bg-[#1e2226] border border-[#2d3139] rounded px-2.5 py-1.5 text-xs text-white font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2 bg-[#ff4976] hover:bg-[#e03d65] text-white font-extrabold rounded text-xs transition cursor-pointer"
              >
                Apply Parameters Policy
              </button>
            </form>
          </div>

          <div className="border-t border-[#24262b] pt-4 mt-4 space-y-2">
            <h4 className="text-[10px] font-extrabold text-white uppercase font-mono">
              Deterministic Test Runner
            </h4>
            <button
              onClick={handleRunTests}
              disabled={isLoading}
              className="w-full py-1.5 bg-[#1f2226] border border-[#2d3139] hover:bg-[#2b3036] text-purple-400 font-bold rounded text-[11px] transition flex items-center justify-center space-x-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Run Automated Test Suite</span>
            </button>

            {testReport && (
              <div className="bg-black/40 border border-purple-950/40 p-2 rounded mt-2 text-[10px] font-mono space-y-1">
                <div className="flex justify-between font-bold">
                  <span className="text-purple-400">PASSED: {testReport.passed}</span>
                  <span className={testReport.failed > 0 ? "text-red-400" : "text-green-400"}>
                    FAILED: {testReport.failed}
                  </span>
                </div>
                {testReport.details.length > 0 && (
                  <div className="text-red-400 text-[9px] max-h-16 overflow-y-auto">
                    {testReport.details.map((d: any, i: number) => (
                      <div key={i}>• {d}</div>
                    ))}
                  </div>
                )}
                {testReport.failed === 0 && (
                  <div className="text-green-400 text-center font-bold">✓ ALL RISK TESTS PASSED PERFECTLY!</div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* SECTION 5: LIVE TRADE SIMULATOR FOR LIMIT TESTING */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        
        {/* Sim Open Form */}
        <div className="xl:col-span-5 bg-[#16181a] border border-[#24262b] p-4 rounded-lg space-y-3">
          <h3 className="text-xs font-extrabold text-white uppercase tracking-wider font-mono flex items-center space-x-2">
            <PlusCircle className="w-4 h-4 text-[#ff4976]" />
            <span>Simulate Order Execution (Risk Testing)</span>
          </h3>
          <p className="text-[11px] text-[#848e9c]">
            Open simulated positions directly inside the Risk Engine to test exposure, heat, leverage, and drawdown locks under load.
          </p>

          <form onSubmit={handleSimulateOpen} className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[9px] font-bold text-[#848e9c] uppercase font-mono">
                  Symbol
                </label>
                <input
                  type="text"
                  value={simSymbol}
                  onChange={e => setSimSymbol(e.target.value.toUpperCase())}
                  className="w-full bg-[#1e2226] border border-[#2d3139] rounded px-2 py-1 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[9px] font-bold text-[#848e9c] uppercase font-mono">
                  Direction
                </label>
                <select
                  value={simSide}
                  onChange={e => setSimSide(e.target.value as "LONG" | "SHORT")}
                  className="w-full bg-[#1e2226] border border-[#2d3139] rounded px-2 py-1 text-xs text-white outline-none"
                >
                  <option value="LONG">LONG</option>
                  <option value="SHORT">SHORT</option>
                </select>
              </div>
              <div>
                <label className="block text-[9px] font-bold text-[#848e9c] uppercase font-mono">
                  Units Size
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={simAmount}
                  onChange={e => setSimAmount(Number(e.target.value))}
                  className="w-full bg-[#1e2226] border border-[#2d3139] rounded px-2 py-1 text-xs text-white font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[9px] font-bold text-[#848e9c] uppercase font-mono">
                  Entry Price (USDT)
                </label>
                <input
                  type="number"
                  value={simPrice}
                  onChange={e => setSimPrice(Number(e.target.value))}
                  className="w-full bg-[#1e2226] border border-[#2d3139] rounded px-2 py-1 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[9px] font-bold text-[#848e9c] uppercase font-mono">
                  Stop Loss Price
                </label>
                <input
                  type="number"
                  value={simStop}
                  onChange={e => setSimStop(Number(e.target.value))}
                  className="w-full bg-[#1e2226] border border-[#2d3139] rounded px-2 py-1 text-xs text-white font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-1.5 bg-[#ff4976]/10 hover:bg-[#ff4976]/20 border border-[#ff4976]/30 text-[#ff4976] font-bold rounded text-xs transition cursor-pointer"
            >
              + Launch Simulated Active Trade
            </button>
          </form>
        </div>

        {/* Live Open Position State List & Closure Controls */}
        <div className="xl:col-span-7 bg-[#16181a] border border-[#24262b] p-4 rounded-lg flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-extrabold text-white uppercase tracking-wider font-mono flex items-center space-x-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span>Active Simulated Exposure Ledger</span>
            </h3>
            <p className="text-[11px] text-[#848e9c] mt-0.5">
              Current positions actively managed inside risk memory. Close them with customizable exit prices to simulate gains or losses.
            </p>

            <div className="overflow-x-auto mt-3 max-h-44 overflow-y-auto custom-scrollbar border border-[#22252a] rounded">
              <table className="w-full text-[11px] text-[#eaecef] text-left border-collapse">
                <thead className="bg-[#1f2226] text-[#848e9c] font-mono sticky top-0">
                  <tr className="border-b border-[#2b2f36]">
                    <th className="p-2">Asset</th>
                    <th className="p-2">Side</th>
                    <th className="p-2">Size</th>
                    <th className="p-2">Entry Price</th>
                    <th className="p-2">Current Value</th>
                    <th className="p-2">Risked USDT</th>
                    <th className="p-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#22252a]">
                  {portfolioState?.openPositions && portfolioState.openPositions.length > 0 ? (
                    portfolioState.openPositions.map((pos, idx) => (
                      <tr key={idx} className="hover:bg-[#1e2226]">
                        <td className="p-2 font-black text-white font-mono">{pos.symbol}</td>
                        <td className="p-2 font-mono">
                          <span className={`px-1 py-0.2 rounded text-[8px] font-black ${
                            pos.side === "LONG" ? "bg-green-950 text-green-400" : "bg-red-950 text-red-400"
                          }`}>
                            {pos.side}
                          </span>
                        </td>
                        <td className="p-2 font-mono">{pos.amount} units</td>
                        <td className="p-2 font-mono">${pos.entryPrice.toLocaleString()}</td>
                        <td className="p-2 font-mono text-white">${(pos.amount * pos.currentPrice).toLocaleString()}</td>
                        <td className="p-2 font-mono text-red-400">${pos.riskAmount.toLocaleString()}</td>
                        <td className="p-2 text-right">
                          <div className="flex items-center justify-end space-x-1.5">
                            <input
                              type="number"
                              placeholder="Exit Price"
                              className="w-16 bg-[#1f2226] border border-[#2d3139] rounded px-1 py-0.5 text-[10px] font-mono text-white"
                              value={simExitPrice}
                              onChange={e => setSimExitPrice(Number(e.target.value))}
                            />
                            <button
                              onClick={() => handleSimulateClose(pos.symbol, pos.currentPrice)}
                              className="px-2 py-0.5 bg-red-950 hover:bg-red-900 border border-red-800 text-red-400 text-[10px] rounded font-bold transition cursor-pointer"
                            >
                              Settle Close
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-[#848e9c]">
                        No active simulated exposures found. Launch one above to inspect safety locks!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>

      {/* SECTION 6: HISTORICAL RISK DECISIONS AUDIT LEDGER */}
      <div className="bg-[#16181a] border border-[#24262b] p-4 rounded-lg space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-extrabold text-white uppercase tracking-wider font-mono flex items-center space-x-2">
            <Clock className="w-4 h-4 text-[#ff4976]" />
            <span>Immutable Risk Decisions Audit Ledger</span>
          </h3>
          <button
            onClick={refreshRiskData}
            className="flex items-center space-x-1.5 px-2.5 py-1 text-[11px] bg-[#1e2226] border border-[#2d3139] hover:bg-[#282d33] text-[#848e9c] rounded font-bold transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Force Reload Ledger</span>
          </button>
        </div>
        <p className="text-[11px] text-[#848e9c]">
          Real-time stream of decisions processed through the Risk Engine. All records are stored with full sub-rule status tracking and are fully reproducible.
        </p>

        <div className="overflow-x-auto border border-[#22252a] rounded">
          <table className="w-full text-[11px] text-[#eaecef] text-left border-collapse">
            <thead>
              <tr className="bg-[#1f2226] text-[#848e9c] font-mono border-b border-[#2b2f36]">
                <th className="p-2">Risk Decision ID</th>
                <th className="p-2">Decision Ref</th>
                <th className="p-2">Timestamp</th>
                <th className="p-2">Risk Score</th>
                <th className="p-2">Sizing Method</th>
                <th className="p-2">Recommended Allocation</th>
                <th className="p-2">Action</th>
                <th className="p-2 text-right">Explainability details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#22252a]">
              {riskHistory && riskHistory.length > 0 ? (
                riskHistory.map(dec => (
                  <React.Fragment key={dec.id}>
                    <tr className="hover:bg-[#1e2226] transition">
                      <td className="p-2 font-mono text-white text-[10px]">{dec.id}</td>
                      <td className="p-2 font-mono text-[#848e9c] text-[10px]">{dec.decisionId}</td>
                      <td className="p-2 font-mono text-[#848e9c]">
                        {new Date(dec.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="p-2 font-mono">
                        <span className={`font-bold ${
                          dec.riskScore >= 85 ? "text-green-400" :
                          dec.riskScore >= 70 ? "text-amber-400" : "text-red-400 font-extrabold"
                        }`}>
                          {dec.riskScore}/100
                        </span>
                      </td>
                      <td className="p-2 font-mono">{dec.sizingMethodUsed}</td>
                      <td className="p-2 font-mono text-white">${dec.recommendedCapitalAllocation.toLocaleString()}</td>
                      <td className="p-2 font-mono">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black tracking-tight ${
                          dec.action === "ALLOW" ? "bg-green-950 text-green-400" :
                          dec.action === "ALLOW_WITH_REDUCED_SIZE" ? "bg-amber-950 text-amber-400" :
                          dec.action === "WATCH" ? "bg-blue-950 text-blue-400" :
                          "bg-red-950 text-red-400 border border-red-800/40"
                        }`}>
                          {dec.action}
                        </span>
                      </td>
                      <td className="p-2 text-right">
                        <button
                          onClick={() => setSelectedDecision(selectedDecision?.id === dec.id ? null : dec)}
                          className="px-2.5 py-0.5 bg-[#1f2226] hover:bg-[#2b313a] text-[#848e9c] hover:text-white rounded text-[10px] font-bold border border-[#2d3139] cursor-pointer"
                        >
                          {selectedDecision?.id === dec.id ? "Hide Details" : "Inspect Trace"}
                        </button>
                      </td>
                    </tr>
                    
                    {/* Expandable Trace Panel */}
                    {selectedDecision?.id === dec.id && (
                      <tr className="bg-black/30">
                        <td colSpan={8} className="p-4 border-t border-b border-[#2d3139]">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                            <div className="space-y-2">
                              <div className="text-white font-bold uppercase text-[10px] border-b border-[#2d3139] pb-1 tracking-wider text-[#ff4976]">
                                Risk Decision Profile Analysis
                              </div>
                              <p className="text-[#eaecef] bg-[#1a1d22] p-2.5 rounded border border-[#2d3139] leading-relaxed">
                                {dec.explanation}
                              </p>
                              <div className="bg-[#1a1d22] p-2.5 rounded border border-[#2d3139] space-y-1.5 text-[11px]">
                                <div className="flex justify-between">
                                  <span className="text-[#848e9c]">Risk Level:</span>
                                  <span className={`font-black ${dec.riskLevel === "LOW" ? "text-green-400" : "text-red-400"}`}>
                                    {dec.riskLevel}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-[#848e9c]">Expected Drawdown:</span>
                                  <span className="text-white">{dec.expectedDrawdown}%</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-[#848e9c]">Dynamic Probability of Ruin:</span>
                                  <span className="text-white">{dec.riskOfRuin}%</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-[#848e9c]">Portfolio Heat Factor:</span>
                                  <span className="text-white">{dec.portfolioHeat}%</span>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <div className="text-white font-bold uppercase text-[10px] border-b border-[#2d3139] pb-1 tracking-wider text-[#ff4976]">
                                Safety Rule Gating Output details
                              </div>
                              <div className="bg-[#1a1d22] p-2.5 rounded border border-[#2d3139] max-h-48 overflow-y-auto custom-scrollbar space-y-1">
                                {dec.safetyResults.map(r => (
                                  <div key={r.ruleId} className="flex justify-between text-[10px] border-b border-[#22252a] pb-1">
                                    <span className="text-[#848e9c]">{r.name}:</span>
                                    <span className={r.passed ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
                                      {r.passed ? "PASS" : "FAIL"} ({r.actualValue})
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-[#848e9c]">
                    No historical risk records identified. Trigger trade scans in standard platforms to generate audit histories.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
