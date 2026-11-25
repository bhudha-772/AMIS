import React, { useState } from "react";
import { BinanceProvider, useBinance } from "./context/BinanceContext";
import { DerivWSProvider } from "./context/DerivWSContext";
import { MarketHeader } from "./components/MarketHeader";
import { TradingChart } from "./components/TradingChart";
import { TickerList } from "./components/TickerList";
import { OrderBook } from "./components/OrderBook";
import { MarketTrades } from "./components/MarketTrades";
import { TradeForm } from "./components/TradeForm";
import { UserPositions } from "./components/UserPositions";
import { DualChartSection } from "./components/DualChartSection";
import { AnalysisDesk } from "./components/AnalysisDesk";
import { DerivTrader } from "./components/DerivTrader";
import { DerivRiseFallTrader } from "./components/DerivRiseFallTrader";
import { DerivAccumulatorTrader } from "./components/DerivAccumulatorTrader";
import { DerivDigitsTrader } from "./components/DerivDigitsTrader";
import { ForexMT5Trader } from "./components/ForexMT5Trader";
import { StrategyResearchLab } from "./components/StrategyResearchLab";
import { DecisionIntelligencePanel } from "./components/DecisionIntelligencePanel";
import { RiskManagementPanel } from "./components/RiskManagementPanel";
import { ExecutionLabPanel } from "./components/ExecutionLabPanel";
import { SupervisorDashboard } from "./components/SupervisorDashboard";
import { ResearchDirectorDashboard } from "./components/ResearchDirectorDashboard";
import { SMCPanel } from "./components/SMCPanel";
import { KimiAnalysisDashboard } from "./components/KimiAnalysisDashboard";
import {
  TrendingUp,
  BarChart3,
  RefreshCw,
  LayoutGrid,
  Activity,
  History,
  Coins,
  DollarSign,
  Layers,
  Monitor,
  Compass,
  ShieldCheck,
  ShieldAlert,
  Cpu,
  Shield,
  Award,
  Brain
} from "lucide-react";

function DashboardContent() {
  const { wsConnected, currentPrice, klines, activeSymbol } = useBinance();
  
  // Platform selection: "binance" (Pro Terminal), "deriv" (DTrader Options), "deriv-rise-fall" (Rise & Fall App), "deriv-accumulators" (Accumulators App), or "forex" (MetaTrader 5)
  const [platformMode, setPlatformMode] = useState<
    "binance" | "deriv" | "deriv-rise-fall" | "deriv-accumulators" | "deriv-digits" | "forex"
  >("deriv-rise-fall");

  // Workspace selection: "standard" pro grid, "dual-chart" desk, "analysis" desk, "research-lab", "decision-intelligence", "risk-management", "execution-lab" or "supervisor" or "director" or "smc" or "kimi"
  const [activeWorkspace, setActiveWorkspace] = useState<"standard" | "dual-chart" | "analysis" | "research-lab" | "decision-intelligence" | "risk-management" | "execution-lab" | "supervisor" | "director" | "smc" | "kimi">("standard");

  // Mobile active tab view: "chart", "book", "trades", "markets"
  const [mobileTab, setMobileTab] = useState<"chart" | "book" | "trades" | "markets">("chart");

  // System Theme / Dark / Light states
  const [themeMode, setThemeMode] = useState<"system" | "dark" | "light">("system");

  React.useEffect(() => {
    const handleThemeUpdate = () => {
      const root = document.getElementById("app-root-container");
      if (!root) return;

      const isDark =
        platformMode !== "deriv" && (
          themeMode === "dark" ||
          (themeMode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
        );

      if (isDark) {
        root.classList.remove("light-mode");
      } else {
        root.classList.add("light-mode");
      }
    };

    handleThemeUpdate();

    if (themeMode === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      mediaQuery.addEventListener("change", handleThemeUpdate);
      return () => mediaQuery.removeEventListener("change", handleThemeUpdate);
    }
  }, [themeMode, platformMode]);

  return (
    <div id="app-root-container" className="flex flex-col h-screen max-h-screen bg-[#0b0e11] text-[#eaecef] overflow-hidden select-none font-sans">
      {/* 1. BRAND GLOBAL TOP NAVBAR */}
      <header id="global-navbar" className="bg-[#12161a] border-b border-[#24262b] px-4 py-2 flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center space-x-3">
          {/* Logo */}
          <div className="relative flex items-center justify-center bg-[#f0b90b] rounded w-6 h-6 animate-pulse">
            <span className="text-black font-black text-xs">X</span>
          </div>
          <span className="font-extrabold tracking-tight text-white text-base">AppX</span>
          <span className="text-[9px] bg-[#2b2f36] px-1.5 py-0.5 rounded font-mono text-[#f0b90b] font-bold">
            CMT EXPERT TERMINAL
          </span>

          {/* Main Platform Selector Tabs */}
          <div className="flex items-center space-x-1 bg-[#1a1c22] p-0.5 rounded-md border border-[#24262b] ml-4">
            <button
              type="button"
              onClick={() => setPlatformMode("binance")}
              className={`px-3 py-1 text-[10px] sm:text-xs font-black rounded transition-all flex items-center space-x-1.5 cursor-pointer ${
                platformMode === "binance"
                  ? "bg-[#f0b90b] text-black shadow-sm"
                  : "text-[#848e9c] hover:text-white"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${platformMode === "binance" ? "bg-black" : "bg-[#f0b90b]"}`} />
              <span>Binance Pro</span>
            </button>
            <button
              type="button"
              onClick={() => setPlatformMode("deriv")}
              className={`px-3 py-1 text-[10px] sm:text-xs font-black rounded transition-all flex items-center space-x-1.5 cursor-pointer ${
                platformMode === "deriv"
                  ? "bg-[#ff444f] text-white shadow-sm"
                  : "text-[#848e9c] hover:text-white"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${platformMode === "deriv" ? "bg-white" : "bg-[#ff444f]"}`} />
              <span>Deriv DTrader</span>
            </button>
            <button
              type="button"
              onClick={() => setPlatformMode("deriv-rise-fall")}
              className={`px-3 py-1 text-[10px] sm:text-xs font-black rounded transition-all flex items-center space-x-1.5 cursor-pointer ${
                platformMode === "deriv-rise-fall"
                  ? "bg-[#0ecb81] text-white shadow-sm"
                  : "text-[#848e9c] hover:text-white"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${platformMode === "deriv-rise-fall" ? "bg-white" : "bg-[#0ecb81]"}`} />
              <span>Deriv Rise &amp; Fall</span>
            </button>
            <button
              type="button"
              onClick={() => setPlatformMode("deriv-accumulators")}
              className={`px-3 py-1 text-[10px] sm:text-xs font-black rounded-md transition-all flex items-center space-x-1.5 cursor-pointer ${
                platformMode === "deriv-accumulators"
                  ? "bg-[#f0b90b] text-white shadow-sm"
                  : "text-[#848e9c] hover:text-white"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${platformMode === "deriv-accumulators" ? "bg-white" : "bg-[#f0b90b]"}`} />
              <span>Deriv Accumulators</span>
            </button>
            <button
              type="button"
              onClick={() => setPlatformMode("deriv-digits")}
              className={`px-3 py-1 text-[10px] sm:text-xs font-black rounded-md transition-all flex items-center space-x-1.5 cursor-pointer ${
                platformMode === "deriv-digits"
                  ? "bg-[#7c3aed] text-white shadow-sm"
                  : "text-[#848e9c] hover:text-white"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${platformMode === "deriv-digits" ? "bg-white" : "bg-[#7c3aed]"}`} />
              <span>Deriv Digits</span>
            </button>
            <button
              type="button"
              onClick={() => setPlatformMode("forex")}
              className={`px-3 py-1 text-[10px] sm:text-xs font-black rounded transition-all flex items-center space-x-1.5 cursor-pointer ${
                platformMode === "forex"
                  ? "bg-[#58a6ff] text-black shadow-sm"
                  : "text-[#848e9c] hover:text-white"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${platformMode === "forex" ? "bg-black" : "bg-[#58a6ff]"}`} />
              <span>Forex MT5</span>
            </button>
          </div>

          {/* Workspace Tabs Switcher (Visible for all platforms to enable full-system supervision)}
            <div className="flex items-center space-x-1 bg-[#1a1c22] p-0.5 rounded-md border border-[#24262b] ml-2">
              <button
                id="workspace-btn-standard"
                onClick={() => setActiveWorkspace("standard")}
                className={`px-2 py-1 text-[10px] sm:text-xs font-bold rounded transition-all flex items-center space-x-1 ${
                  activeWorkspace === "standard"
                    ? "bg-[#2b2f36] text-[#f0b90b] shadow-sm"
                    : "text-[#848e9c] hover:text-white"
                }`}
              >
                <LayoutGrid className="w-3 h-3" />
                <span className="hidden xs:inline">Grid Desk</span>
              </button>
              <button
                id="workspace-btn-dual"
                onClick={() => setActiveWorkspace("dual-chart")}
                className={`px-2 py-1 text-[10px] sm:text-xs font-bold rounded transition-all flex items-center space-x-1 ${
                  activeWorkspace === "dual-chart"
                    ? "bg-[#2b2f36] text-[#f0b90b] shadow-sm"
                    : "text-[#848e9c] hover:text-white"
                }`}
              >
                <Layers className="w-3 h-3" />
                <span>Multi-Chart</span>
              </button>
              <button
                id="workspace-btn-analysis"
                onClick={() => setActiveWorkspace("analysis")}
                className={`px-2 py-1 text-[10px] sm:text-xs font-bold rounded transition-all flex items-center space-x-1 ${
                  activeWorkspace === "analysis"
                    ? "bg-[#2b2f36] text-[#f0b90b] shadow-sm"
                    : "text-[#848e9c] hover:text-white"
                }`}
              >
                <Activity className="w-3 h-3 text-[#f0b90b]" />
                <span>Analysis Desk</span>
              </button>
              <button
                id="workspace-btn-research"
                onClick={() => setActiveWorkspace("research-lab")}
                className={`px-2 py-1 text-[10px] sm:text-xs font-bold rounded transition-all flex items-center space-x-1 ${
                  activeWorkspace === "research-lab"
                    ? "bg-[#2b2f36] text-[#a076ff] shadow-sm"
                    : "text-[#848e9c] hover:text-white"
                }`}
              >
                <Compass className="w-3 h-3 text-[#a076ff]" />
                <span>Strategy Lab</span>
              </button>
              <button
                id="workspace-btn-decision"
                onClick={() => setActiveWorkspace("decision-intelligence")}
                className={`px-2 py-1 text-[10px] sm:text-xs font-bold rounded transition-all flex items-center space-x-1 ${
                  activeWorkspace === "decision-intelligence"
                    ? "bg-[#2b2f36] text-[#00f0ff] shadow-sm"
                    : "text-[#848e9c] hover:text-white"
                }`}
              >
                <ShieldCheck className="w-3 h-3 text-[#00f0ff] animate-pulse" />
                <span>Decision Intelligence</span>
              </button>
              <button
                id="workspace-btn-risk"
                onClick={() => setActiveWorkspace("risk-management")}
                className={`px-2 py-1 text-[10px] sm:text-xs font-bold rounded transition-all flex items-center space-x-1 ${
                  activeWorkspace === "risk-management"
                    ? "bg-[#2b2f36] text-[#ff4976] shadow-sm"
                    : "text-[#848e9c] hover:text-white"
                }`}
              >
                <ShieldAlert className="w-3 h-3 text-[#ff4976] animate-pulse" />
                <span>Risk Engine</span>
              </button>
              <button
                id="workspace-btn-execution"
                onClick={() => setActiveWorkspace("execution-lab")}
                className={`px-2 py-1 text-[10px] sm:text-xs font-bold rounded transition-all flex items-center space-x-1 ${
                  activeWorkspace === "execution-lab"
                    ? "bg-[#2b2f36] text-[#10b981] shadow-sm"
                    : "text-[#848e9c] hover:text-white"
                }`}
              >
                <Cpu className="w-3 h-3 text-[#10b981] animate-pulse" />
                <span>Execution Lab</span>
              </button>
              <button
                id="workspace-btn-supervisor"
                onClick={() => setActiveWorkspace("supervisor")}
                className={`px-2 py-1 text-[10px] sm:text-xs font-bold rounded transition-all flex items-center space-x-1 ${
                  activeWorkspace === "supervisor"
                    ? "bg-[#2b2f36] text-[#34d399] shadow-sm"
                    : "text-[#848e9c] hover:text-white"
                }`}
              >
                <Shield className="w-3 h-3 text-emerald-400 animate-pulse" />
                <span>Supervisor Desk</span>
              </button>
              <button
                id="workspace-btn-director"
                onClick={() => setActiveWorkspace("director")}
                className={`px-2 py-1 text-[10px] sm:text-xs font-bold rounded transition-all flex items-center space-x-1 ${
                  activeWorkspace === "director"
                    ? "bg-[#2b2f36] text-emerald-400 shadow-sm"
                    : "text-[#848e9c] hover:text-white"
                }`}
              >
                <Award className="w-3 h-3 text-emerald-400 animate-pulse" />
                <span>Research Director</span>
              </button>
              <button
                id="workspace-btn-smc"
                onClick={() => setActiveWorkspace("smc")}
                className={`px-2 py-1 text-[10px] sm:text-xs font-bold rounded transition-all flex items-center space-x-1 cursor-pointer ${
                  activeWorkspace === "smc"
                    ? "bg-[#2b2f36] text-[#a076ff] shadow-sm"
                    : "text-[#848e9c] hover:text-white"
                }`}
              >
                <Layers className="w-3 h-3 text-[#a076ff] animate-pulse" />
                <span>SMC Institutional</span>
              </button>
              <button
                id="workspace-btn-kimi"
                onClick={() => setActiveWorkspace("kimi")}
                className={`px-2 py-1 text-[10px] sm:text-xs font-bold rounded transition-all flex items-center space-x-1 cursor-pointer ${
                  activeWorkspace === "kimi"
                    ? "bg-[#2b2f36] text-purple-400 shadow-sm"
                    : "text-[#848e9c] hover:text-white"
                }`}
              >
                <Brain className="w-3 h-3 text-purple-400 animate-pulse" />
                <span>Kimi AI</span>
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-4">
          {/* Live system state indicators */}
          <div className="hidden lg:flex items-center space-x-2 text-[10px] text-[#848e9c]">
            <span className="flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0ecb81]" />
              <span>Real-time Streams</span>
            </span>
            <span className="text-gray-700">•</span>
            <span>Paper Trading: <b>Enabled (No Risk)</b></span>
          </div>

          <div className="flex items-center space-x-2">
            {/* Live Theme Toggle Pills */}
            <div className="flex items-center space-x-1 bg-[#1a1c22] p-0.5 rounded border border-[#24262b] text-[9px] font-mono">
              <button
                onClick={() => setThemeMode("system")}
                className={`px-1.5 py-0.5 rounded text-[8px] font-black tracking-tight transition ${
                  themeMode === "system"
                    ? "bg-purple-950 text-[#a076ff] border border-purple-800/40"
                    : "text-[#848e9c] hover:text-white"
                }`}
                title="System Auto Preference"
              >
                SYS
              </button>
              <button
                onClick={() => setThemeMode("dark")}
                className={`px-1.5 py-0.5 rounded text-[8px] font-black tracking-tight transition ${
                  themeMode === "dark"
                    ? "bg-purple-950 text-[#a076ff] border border-purple-800/40"
                    : "text-[#848e9c] hover:text-white"
                }`}
                title="Force Dark Mode"
              >
                DARK
              </button>
              <button
                onClick={() => setThemeMode("light")}
                className={`px-1.5 py-0.5 rounded text-[8px] font-black tracking-tight transition ${
                  themeMode === "light"
                    ? "bg-purple-950 text-[#a076ff] border border-purple-800/40"
                    : "text-[#848e9c] hover:text-white"
                }`}
                title="Force Light Mode"
              >
                LIGHT
              </button>
            </div>

            <span className="text-[10px] text-[#848e9c] font-mono hidden md:inline">
              UTC Local: {new Date().toLocaleTimeString()}
            </span>
          </div>
        </div>
      </header>

      {/* 2. REAL-TIME MARKET STATISTICS PANEL (Only shown for Binance Pro) */}
      {platformMode === "binance" && <MarketHeader />}

      {/* 3. MOBILE NAVIGATION BOTTOM BAR / TABS BAR (Only shown when on standard workspace of Binance Pro) */}
      {platformMode === "binance" && activeWorkspace === "standard" && (
        <div id="mobile-tabs-bar" className="md:hidden grid grid-cols-4 border-b border-[#24262b] bg-[#1a1c22] select-none text-[11px] shrink-0">
          <button
            id="mobile-tab-chart"
            onClick={() => setMobileTab("chart")}
            className={`py-3 text-center font-bold flex flex-col items-center space-y-1 transition ${
              mobileTab === "chart"
                ? "text-[#f0b90b] border-b-2 border-[#f0b90b] bg-[#12161a]"
                : "text-[#848e9c] hover:text-white"
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Chart & Trade</span>
          </button>
          <button
            id="mobile-tab-book"
            onClick={() => setMobileTab("book")}
            className={`py-3 text-center font-bold flex flex-col items-center space-y-1 transition ${
              mobileTab === "book"
                ? "text-[#f0b90b] border-b-2 border-[#f0b90b] bg-[#12161a]"
                : "text-[#848e9c] hover:text-white"
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>Order Book</span>
          </button>
          <button
            id="mobile-tab-trades"
            onClick={() => setMobileTab("trades")}
            className={`py-3 text-center font-bold flex flex-col items-center space-y-1 transition ${
              mobileTab === "trades"
                ? "text-[#f0b90b] border-b-2 border-[#f0b90b] bg-[#12161a]"
                : "text-[#848e9c] hover:text-white"
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Live Trades</span>
          </button>
          <button
            id="mobile-tab-markets"
            onClick={() => setMobileTab("markets")}
            className={`py-3 text-center font-bold flex flex-col items-center space-y-1 transition ${
              mobileTab === "markets"
                ? "text-[#f0b90b] border-b-2 border-[#f0b90b] bg-[#12161a]"
                : "text-[#848e9c] hover:text-white"
            }`}
          >
            <Coins className="w-4 h-4" />
            <span>20 Markets</span>
          </button>
        </div>
      )}

      {/* 4. MASTER RENDERING REGION */}
      <div className="flex-1 flex overflow-hidden min-h-0 w-full relative">
        {activeWorkspace === "kimi" ? (
          <div className="flex-1 h-full min-h-0 overflow-hidden">
            <KimiAnalysisDashboard />
          </div>
        ) : activeWorkspace === "smc" ? (
          <div className="flex-1 h-full min-h-0 overflow-y-auto p-4 bg-slate-950">
            <div className="max-w-6xl mx-auto space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black text-white flex items-center gap-2">
                    <Layers className="w-5 h-5 text-indigo-400" />
                    Institutional Smart Money Concepts (SMC) Command Desk
                  </h2>
                  <p className="text-xs text-slate-400">
                    Order Blocks • Fair Value Gaps • Liquidity Sweeps • BOS / ChoCH • Premium / Discount Equilibrium
                  </p>
                </div>
                <div className="text-xs font-mono text-indigo-400 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30">
                  Active Asset: {activeSymbol} (${currentPrice ? currentPrice.toLocaleString() : "--"})
                </div>
              </div>
              <SMCPanel
                candles={klines.map(k => ({
                  timestamp: k.openTime,
                  open: k.open,
                  high: k.high,
                  low: k.low,
                  close: k.close,
                  volume: k.volume
                }))}
                symbol={activeSymbol}
                provider="BINANCE"
                currentPrice={currentPrice}
              />
            </div>
          </div>
        ) : activeWorkspace === "supervisor" ? (
          <div className="flex-1 h-full min-h-0 overflow-y-auto">
            <SupervisorDashboard />
          </div>
        ) : activeWorkspace === "director" ? (
          <div className="flex-1 h-full min-h-0 overflow-y-auto">
            <ResearchDirectorDashboard />
          </div>
        ) : platformMode === "deriv" ? (
          <div className="flex-1 h-full min-h-0">
            <DerivTrader />
          </div>
        ) : platformMode === "deriv-rise-fall" ? (
          <div className="flex-1 h-full min-h-0">
            <DerivRiseFallTrader />
          </div>
        ) : platformMode === "deriv-accumulators" ? (
          <div className="flex-1 h-full min-h-0">
            <DerivAccumulatorTrader />
          </div>
        ) : platformMode === "deriv-digits" ? (
          <div className="flex-1 h-full min-h-0">
            <DerivDigitsTrader />
          </div>
        ) : platformMode === "forex" ? (
          <div className="flex-1 h-full min-h-0">
            <ForexMT5Trader />
          </div>
        ) : activeWorkspace === "analysis" ? (
          <div className="flex-1 h-full min-h-0 overflow-y-auto md:overflow-hidden">
            <AnalysisDesk />
          </div>
        ) : activeWorkspace === "research-lab" ? (
          <div className="flex-1 h-full min-h-0 overflow-hidden">
            <StrategyResearchLab />
          </div>
        ) : activeWorkspace === "decision-intelligence" ? (
          <div className="flex-1 h-full min-h-0 overflow-hidden">
            <DecisionIntelligencePanel />
          </div>
        ) : activeWorkspace === "risk-management" ? (
          <div className="flex-1 h-full min-h-0 overflow-hidden">
            <RiskManagementPanel />
          </div>
        ) : activeWorkspace === "execution-lab" ? (
          <div className="flex-1 h-full min-h-0 overflow-hidden font-mono">
            <ExecutionLabPanel />
          </div>
        ) : activeWorkspace === "dual-chart" ? (
          <div className="flex-1 h-full min-h-0 overflow-y-auto lg:overflow-hidden">
            <DualChartSection />
          </div>
        ) : (
          <>
            {/* DESKTOP VIEWPORT (md and up) */}
            <div id="desktop-grid" className="hidden md:grid grid-cols-12 w-full h-full min-h-0 overflow-hidden divide-x divide-[#24262b]">
              {/* A. LEFT RAIL Column: Order Book */}
              <div className="col-span-3 lg:col-span-2.5 h-full min-h-0 flex flex-col overflow-hidden bg-[#16181a]">
                <OrderBook />
              </div>

              {/* B. CENTER Column: Chart, Trade Desk & Positions */}
              <div className="col-span-6 lg:col-span-6.5 h-full min-h-0 flex flex-col divide-y divide-[#24262b] overflow-hidden">
                {/* Chart Area */}
                <div className="flex-1 min-h-0 overflow-hidden">
                  <TradingChart />
                </div>

                {/* Bottom Panel Grid split horizontally: Trade Form (left) + Market Trades (right) */}
                <div className="h-[280px] lg:h-[320px] grid grid-cols-12 divide-x divide-[#24262b] bg-[#16181a] shrink-0">
                  <div className="col-span-7 h-full overflow-hidden">
                    <TradeForm />
                  </div>
                  <div className="col-span-5 h-full overflow-hidden">
                    <MarketTrades />
                  </div>
                </div>

                {/* Bottom Full-width User Holdings Section */}
                <div className="h-[220px] lg:h-[260px] bg-[#16181a] shrink-0 overflow-hidden">
                  <UserPositions />
                </div>
              </div>

              {/* C. RIGHT Column: Tickers & search */}
              <div className="col-span-3 h-full min-h-0 flex flex-col bg-[#16181a]">
                <TickerList />
              </div>
            </div>

            {/* MOBILE VIEWPORT (Switching between tabs) */}
            <div id="mobile-viewport" className="md:hidden flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-[#16181a]">
              {mobileTab === "chart" && (
                <div className="flex-1 flex flex-col overflow-y-auto divide-y divide-[#24262b] custom-scrollbar">
                  {/* Responsive Chart Container */}
                  <div className="h-[300px] shrink-0">
                    <TradingChart />
                  </div>
                  
                  {/* Direct transaction trade buttons */}
                  <div className="shrink-0 bg-[#1e2026]">
                    <TradeForm />
                  </div>

                  {/* Positions and orders tables */}
                  <div className="shrink-0 bg-[#1e2026] border-t border-[#24262b]">
                    <UserPositions />
                  </div>
                </div>
              )}

              {mobileTab === "book" && (
                <div className="flex-1 overflow-hidden">
                  <OrderBook />
                </div>
              )}

              {mobileTab === "trades" && (
                <div className="flex-1 overflow-hidden">
                  <MarketTrades />
                </div>
              )}

              {mobileTab === "markets" && (
                <div className="flex-1 overflow-hidden">
                  <TickerList />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <DerivWSProvider>
      <BinanceProvider>
        <DashboardContent />
      </BinanceProvider>
    </DerivWSProvider>
  );
}
