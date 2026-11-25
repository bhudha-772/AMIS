import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Activity,
  Layers,
  TrendingUp,
  AlertTriangle,
  FileText,
  Sliders,
  Check,
  Award,
  Shield,
  Clock,
  Compass,
  Cpu,
  Bookmark,
  RefreshCw
} from "lucide-react";
import { Strategy, StrategyEvaluation } from "../strategyTypes";

export function StrategyResearchLab() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(null);
  const [evaluations, setEvaluations] = useState<Record<string, StrategyEvaluation>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [testResults, setTestResults] = useState<any | null>(null);
  const [showTestModal, setShowTestModal] = useState(false);
  const [statusNote, setStatusNote] = useState("");
  const [actionSuccessMsg, setActionSuccessMsg] = useState("");

  const selectedStrategy = strategies.find((s) => s.id === selectedStrategyId) || null;
  const selectedEval = selectedStrategyId ? evaluations[selectedStrategyId] || null : null;

  useEffect(() => {
    fetchStrategiesAndEvaluations();
  }, []);

  const fetchStrategiesAndEvaluations = async () => {
    try {
      setIsLoading(true);
      const resStrat = await fetch("/api/market/research/strategies");
      const dataStrat = await resStrat.json();
      if (dataStrat.success) {
        setStrategies(dataStrat.strategies);
        if (dataStrat.strategies.length > 0 && !selectedStrategyId) {
          setSelectedStrategyId(dataStrat.strategies[0].id);
        }
      }

      const resEval = await fetch("/api/market/research/strategies/evaluations");
      const dataEval = await resEval.json();
      if (dataEval.success && dataEval.evaluations) {
        const evMap: Record<string, StrategyEvaluation> = {};
        dataEval.evaluations.forEach((ev: StrategyEvaluation) => {
          evMap[ev.strategyId] = ev;
        });
        setEvaluations(evMap);
      }
    } catch (err) {
      console.error("Failed to load strategies/evaluations:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDiscoverStrategies = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/market/research/strategies/discover", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setActionSuccessMsg(`Successfully discovered and registered ${data.discovered?.length || 0} quantitative strategies.`);
        setTimeout(() => setActionSuccessMsg(""), 5000);
        await fetchStrategiesAndEvaluations();
      }
    } catch (err) {
      console.error("Error discovering strategies:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEvaluateStrategy = async (strategyId: string) => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/market/research/strategies/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategyId })
      });
      const data = await res.json();
      if (data.success) {
        setEvaluations((prev) => ({
          ...prev,
          [strategyId]: data.evaluation
        }));
        setActionSuccessMsg(`Walk-forward validation completed for strategy ${strategyId}.`);
        setTimeout(() => setActionSuccessMsg(""), 4000);
      }
    } catch (err) {
      console.error("Error evaluating strategy:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateStatus = async (strategyId: string, status: "ACCEPTED" | "REJECTED" | "EXPERIMENTAL") => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/market/research/strategies/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: strategyId, status, notes: statusNote || undefined })
      });
      const data = await res.json();
      if (data.success) {
        setActionSuccessMsg(`Strategy ${strategyId} updated to ${status}.`);
        setStatusNote("");
        setTimeout(() => setActionSuccessMsg(""), 4000);
        await fetchStrategiesAndEvaluations();
      }
    } catch (err) {
      console.error("Error updating strategy status:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunTests = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/market/research/strategies/run-tests", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setTestResults(data.results);
        setShowTestModal(true);
      }
    } catch (err) {
      console.error("Error running tests:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Render Strategy Conditions Tree recursively
  const renderConditions = (cond: any): React.ReactNode => {
    if (!cond) return null;
    if ("operator" in cond && "conditions" in cond) {
      return (
        <div className="pl-4 border-l border-gray-700/60 my-2">
          <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase mr-2 ${
            cond.operator === "AND" ? "bg-blue-900/50 text-blue-300" :
            cond.operator === "OR" ? "bg-orange-900/50 text-orange-300" : "bg-red-900/50 text-red-300"
          }`}>
            {cond.operator}
          </span>
          <div className="space-y-1.5 mt-1">
            {cond.conditions.map((sub: any, i: number) => (
              <div key={i}>{renderConditions(sub)}</div>
            ))}
          </div>
        </div>
      );
    } else {
      return (
        <div className="flex items-center space-x-2 text-xs bg-gray-900/50 px-2.5 py-1.5 rounded border border-gray-800/80 my-1">
          <span className="text-gray-400 font-mono text-[11px]">{cond.field}</span>
          <span className="text-purple-400 font-bold text-[10px]">{cond.operator}</span>
          <span className="text-white font-mono text-[11px]">
            {cond.value} {cond.value2 !== undefined ? `AND ${cond.value2}` : ""}
          </span>
        </div>
      );
    }
  };

  // Helper for rendering custom SVG sparklines for the curves
  const renderSVGLineChart = (data: { timestamp: number; equity?: number; drawdown?: number }[], isDrawdown: boolean) => {
    if (!data || data.length < 2) {
      return <div className="text-center text-xs text-gray-500 py-6">Insufficient history data to chart.</div>;
    }

    const width = 500;
    const height = 120;
    const padding = 10;

    const values = data.map(d => isDrawdown ? (d.drawdown || 0) : (d.equity || 10000));
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const valRange = maxVal - minVal || 1;

    const points = data.map((d, i) => {
      const val = isDrawdown ? (d.drawdown || 0) : (d.equity || 10000);
      const x = padding + (i / (data.length - 1)) * (width - 2 * padding);
      const y = height - padding - ((val - minVal) / valRange) * (height - 2 * padding);
      return `${x},${y}`;
    }).join(" ");

    const strokeColor = isDrawdown ? "#ff4d4d" : "#00e676";
    const fillColor = isDrawdown ? "rgba(255, 77, 77, 0.1)" : "rgba(0, 230, 118, 0.1)";

    const areaPoints = `${padding},${height - padding} ${points} ${width - padding},${height - padding}`;

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
        {/* Grid lines */}
        <line x1="0" y1={padding} x2={width} y2={padding} stroke="#24262b" strokeDasharray="3,3" />
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="#24262b" strokeDasharray="3,3" />
        <line x1="0" y1={height - padding} x2={width} y2={height - padding} stroke="#24262b" strokeDasharray="3,3" />

        {/* Shaded Area */}
        <polygon points={areaPoints} fill={fillColor} />

        {/* Main Line */}
        <polyline fill="none" stroke={strokeColor} strokeWidth="2.5" points={points} />

        {/* Start & End Points */}
        <circle cx={padding} cy={height - padding - ((values[0] - minVal) / valRange) * (height - 2 * padding)} r="4" fill={strokeColor} />
        <circle cx={width - padding} cy={height - padding - ((values[values.length - 1] - minVal) / valRange) * (height - 2 * padding)} r="4" fill={strokeColor} />
      </svg>
    );
  };

  return (
    <div id="strategy-research-lab-workspace" className="flex flex-col h-full bg-[#0b0e11] text-gray-200 overflow-hidden font-sans select-text">
      {/* 1. SECTION BAR */}
      <div className="bg-[#12161a] border-b border-[#24262b] px-4 py-2.5 flex items-center justify-between shrink-0 select-none">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-[#a076ff]" />
          <span className="font-extrabold tracking-tight text-white text-xs sm:text-sm uppercase">
            Phase 5.1 — Quantitative Strategy Research Laboratory
          </span>
          {isLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#a076ff]" />}
        </div>
        
        <div className="flex items-center space-x-2">
          {/* Scientific State Notification */}
          <span className="hidden md:inline-flex items-center space-x-1.5 text-[10px] bg-purple-950/40 text-purple-300 px-2.5 py-1 rounded border border-purple-800/30 font-mono">
            <Shield className="w-3 h-3 text-[#a076ff]" />
            <span>Scientific Validity Over Returns</span>
          </span>

          <button
            type="button"
            onClick={handleRunTests}
            className="bg-[#24262b] hover:bg-[#2e3138] border border-[#3c414d] text-[#eaecef] text-[10px] sm:text-xs font-bold px-3 py-1.5 rounded transition flex items-center space-x-1.5 cursor-pointer"
          >
            <Cpu className="w-3.5 h-3.5 text-blue-400" />
            <span>Run Suite Tests</span>
          </button>

          <button
            type="button"
            onClick={handleDiscoverStrategies}
            className="bg-purple-900 hover:bg-purple-800 text-white text-[10px] sm:text-xs font-extrabold px-3 py-1.5 rounded transition flex items-center space-x-1.5 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
            <span>Auto Discover Strategies</span>
          </button>
        </div>
      </div>

      {/* SUCCESS / FEEDBACK NOTIFICATION BANNER */}
      {actionSuccessMsg && (
        <div className="bg-emerald-950 border-b border-emerald-800 text-emerald-300 text-xs px-4 py-2 font-mono flex items-center justify-between animate-fade-in">
          <span>[SYSTEM NOTICE] {actionSuccessMsg}</span>
          <button onClick={() => setActionSuccessMsg("")} className="text-emerald-500 hover:text-emerald-300 font-bold">✕</button>
        </div>
      )}

      {/* 2. BODY LAYOUT */}
      <div className="flex-1 grid grid-cols-12 overflow-hidden min-h-0 divide-x divide-[#24262b]">
        
        {/* A. LEFT COLUMN: Strategies List / Leaderboard */}
        <div className="col-span-12 md:col-span-4 lg:col-span-3.5 h-full min-h-0 flex flex-col bg-[#111317]">
          <div className="p-3 bg-[#16181e] border-b border-[#24262b] flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 font-mono">
              Strategy Leaderboard ({strategies.length})
            </span>
            <button 
              onClick={fetchStrategiesAndEvaluations} 
              className="p-1 hover:bg-[#2b2f36] rounded transition text-gray-400 hover:text-white"
              title="Reload Strategies"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-gray-800/60 custom-scrollbar">
            {strategies.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-500">
                No quantitative strategies registered. Click "Auto Discover Strategies" to bootstrap!
              </div>
            ) : (
              strategies.map((strat) => {
                const isSelected = strat.id === selectedStrategyId;
                const ev = evaluations[strat.id];
                const stats = ev?.metrics;

                return (
                  <div
                    key={strat.id}
                    onClick={() => setSelectedStrategyId(strat.id)}
                    className={`p-3.5 cursor-pointer transition flex flex-col space-y-1.5 border-l-4 ${
                      isSelected
                        ? "bg-[#181c24] border-[#a076ff] text-white"
                        : "hover:bg-[#15181e]/80 border-transparent text-gray-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-wider">
                        {strat.id} v{strat.version}
                      </span>
                      <span className={`px-2 py-0.5 text-[8px] font-black rounded font-mono ${
                        strat.status === "ACCEPTED" ? "bg-emerald-950/80 text-emerald-400 border border-emerald-800/30" :
                        strat.status === "REJECTED" ? "bg-rose-950/80 text-rose-400 border border-rose-800/30" :
                        "bg-amber-950/80 text-amber-400 border border-amber-800/30"
                      }`}>
                        {strat.status}
                      </span>
                    </div>

                    <span className="font-extrabold text-xs tracking-tight text-[#eaecef]">
                      {strat.name}
                    </span>

                    <span className="text-[11px] text-gray-400 line-clamp-1">
                      {strat.description}
                    </span>

                    {/* Miniature stats if evaluated */}
                    {stats ? (
                      <div className="grid grid-cols-3 gap-1 pt-1 font-mono text-[9px] text-gray-500">
                        <div>
                          WR: <span className="text-[#0ecb81]">{stats.winRate.toFixed(1)}%</span>
                        </div>
                        <div>
                          Sharpe: <span className="text-purple-300">{stats.sharpeRatio.toFixed(2)}</span>
                        </div>
                        <div>
                          PnL: <span className={stats.totalReturn >= 0 ? "text-[#0ecb81]" : "text-[#f6465d]"}>
                            {stats.totalReturn >= 0 ? "+" : ""}{stats.totalReturn.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-[9px] text-purple-400/80 font-mono italic">
                        Validation Pending
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* B. RIGHT COLUMN: Interactive Evaluation and Details Pane */}
        <div className="col-span-12 md:col-span-8 lg:col-span-8.5 h-full min-h-0 flex flex-col bg-[#14161b] overflow-y-auto custom-scrollbar">
          {selectedStrategy ? (
            <div className="p-4 space-y-6">
              
              {/* i. Header summary block */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between bg-[#16181e] p-4 rounded-lg border border-[#24262b] gap-4">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-mono font-bold text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/40">
                      {selectedStrategy.id}
                    </span>
                    <span className="text-xs text-gray-400 font-mono">
                      v{selectedStrategy.version} • Dataset {selectedStrategy.datasetVersion}
                    </span>
                  </div>
                  <h2 className="text-base sm:text-lg font-extrabold text-white tracking-tight">
                    {selectedStrategy.name}
                  </h2>
                  <p className="text-xs text-gray-400">
                    {selectedStrategy.description}
                  </p>
                </div>

                <div className="flex items-center space-x-2 shrink-0 self-start md:self-center">
                  {!selectedEval ? (
                    <button
                      onClick={() => handleEvaluateStrategy(selectedStrategy.id)}
                      className="bg-emerald-900 hover:bg-emerald-800 text-white text-xs font-bold px-3.5 py-2 rounded transition flex items-center space-x-1.5 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Run Chronological Walk-Forward</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleEvaluateStrategy(selectedStrategy.id)}
                      className="bg-[#24262b] hover:bg-[#2e3138] border border-[#3c414d] text-[#eaecef] text-xs font-bold px-3 py-2 rounded transition flex items-center space-x-1.5 cursor-pointer"
                      title="Re-run backtest evaluation"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Re-Validate</span>
                    </button>
                  )}
                </div>
              </div>

              {/* ii. PERFORMANCE METRICS GRID */}
              {selectedEval ? (
                <div className="space-y-4">
                  <div className="flex items-center space-x-1.5">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-extrabold text-white uppercase tracking-wider font-mono">
                      Walk-Forward Performance Benchmarks
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                    <div className="bg-[#1b1d24] p-3 rounded border border-gray-800 flex flex-col justify-between h-20">
                      <span className="text-[10px] text-gray-400 font-bold uppercase">Total Return</span>
                      <span className={`text-base font-black font-mono ${selectedEval.metrics.totalReturn >= 0 ? "text-[#0ecb81]" : "text-[#f6465d]"}`}>
                        {selectedEval.metrics.totalReturn >= 0 ? "+" : ""}{selectedEval.metrics.totalReturn.toFixed(2)}%
                      </span>
                    </div>

                    <div className="bg-[#1b1d24] p-3 rounded border border-gray-800 flex flex-col justify-between h-20">
                      <span className="text-[10px] text-gray-400 font-bold uppercase">Win Rate</span>
                      <span className="text-base font-black font-mono text-[#0ecb81]">
                        {selectedEval.metrics.winRate.toFixed(1)}%
                      </span>
                    </div>

                    <div className="bg-[#1b1d24] p-3 rounded border border-gray-800 flex flex-col justify-between h-20">
                      <span className="text-[10px] text-gray-400 font-bold uppercase">Sharpe Ratio</span>
                      <span className="text-base font-black font-mono text-purple-300">
                        {selectedEval.metrics.sharpeRatio.toFixed(2)}
                      </span>
                    </div>

                    <div className="bg-[#1b1d24] p-3 rounded border border-gray-800 flex flex-col justify-between h-20">
                      <span className="text-[10px] text-gray-400 font-bold uppercase">Sortino Ratio</span>
                      <span className="text-base font-black font-mono text-purple-400">
                        {selectedEval.metrics.sortinoRatio.toFixed(2)}
                      </span>
                    </div>

                    <div className="bg-[#1b1d24] p-3 rounded border border-gray-800 flex flex-col justify-between h-20">
                      <span className="text-[10px] text-gray-400 font-bold uppercase">Profit Factor</span>
                      <span className="text-base font-black font-mono text-emerald-400">
                        {selectedEval.metrics.profitFactor.toFixed(2)}
                      </span>
                    </div>

                    <div className="bg-[#1b1d24] p-3 rounded border border-gray-800 flex flex-col justify-between h-20">
                      <span className="text-[10px] text-gray-400 font-bold uppercase">Max Drawdown</span>
                      <span className="text-base font-black font-mono text-rose-400">
                        -{selectedEval.metrics.maxDrawdown.toFixed(2)}%
                      </span>
                    </div>
                  </div>

                  {/* Sub-details block */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-3 bg-gray-900/40 rounded border border-gray-800/60 font-mono text-[11px] text-gray-400">
                    <div>
                      Total Trades: <span className="text-white font-bold">{selectedEval.metrics.totalTrades}</span>
                    </div>
                    <div>
                      Risk/Reward: <span className="text-white font-bold">{selectedEval.metrics.riskRewardRatio.toFixed(2)}</span>
                    </div>
                    <div>
                      Trade Frequency: <span className="text-white font-bold">{selectedEval.metrics.tradeFrequency.toFixed(1)}/day</span>
                    </div>
                    <div>
                      Market Exposure: <span className="text-white font-bold">{selectedEval.metrics.exposure.toFixed(1)}%</span>
                    </div>
                  </div>

                  {/* CHARTS CONTAINER: EQUITY CURVE AND DRAWDOWN CURVE */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="bg-[#16181e] p-3.5 rounded-lg border border-gray-800/80">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase text-gray-300">Equity Curve (Walk-Forward)</span>
                        <span className="text-[10px] font-mono text-emerald-400">Initial: $10,000</span>
                      </div>
                      <div className="h-32 bg-[#0d0e12] rounded border border-gray-900 overflow-hidden p-2">
                        {renderSVGLineChart(selectedEval.equityCurve, false)}
                      </div>
                    </div>

                    <div className="bg-[#16181e] p-3.5 rounded-lg border border-gray-800/80">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase text-gray-300">Drawdown Curve (%)</span>
                        <span className="text-[10px] font-mono text-rose-400">Max: {selectedEval.metrics.maxDrawdown.toFixed(1)}%</span>
                      </div>
                      <div className="h-32 bg-[#0d0e12] rounded border border-gray-900 overflow-hidden p-2">
                        {renderSVGLineChart(selectedEval.drawdownCurve, true)}
                      </div>
                    </div>
                  </div>

                  {/* STRESS TESTING REGIMES ANALYSIS */}
                  <div className="space-y-2.5">
                    <div className="flex items-center space-x-1.5">
                      <Compass className="w-4 h-4 text-blue-400" />
                      <span className="text-xs font-extrabold text-white uppercase tracking-wider font-mono">
                        Stress Testing Regime Performance Profile
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {selectedEval.stressTests.map((st) => (
                        <div key={st.regime} className="bg-[#16181e] p-3.5 rounded border border-gray-800/80 flex flex-col space-y-2">
                          <span className="text-[10px] uppercase font-bold text-gray-400 font-mono tracking-wide">
                            {st.regime.replace("_", " ")}
                          </span>
                          
                          <div className="flex items-baseline justify-between">
                            <span className="text-xs text-gray-400">Win Rate</span>
                            <span className="text-sm font-bold font-mono text-emerald-400">{st.winRate.toFixed(1)}%</span>
                          </div>

                          <div className="flex items-baseline justify-between">
                            <span className="text-xs text-gray-400">Profit Factor</span>
                            <span className="text-sm font-bold font-mono text-white">{st.profitFactor.toFixed(2)}</span>
                          </div>

                          <div className="flex items-baseline justify-between">
                            <span className="text-xs text-gray-400">Robustness</span>
                            <span className={`text-sm font-black font-mono ${
                              st.robustnessScore > 75 ? "text-emerald-400" :
                              st.robustnessScore > 50 ? "text-amber-400" : "text-rose-400"
                            }`}>
                              {st.robustnessScore}/100
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* BASELINE COMPARISON BENCHMARKS */}
                  <div className="space-y-2.5">
                    <div className="flex items-center space-x-1.5">
                      <Award className="w-4 h-4 text-yellow-400" />
                      <span className="text-xs font-extrabold text-white uppercase tracking-wider font-mono">
                        Benchmarking vs Baseline Strategies
                      </span>
                    </div>

                    <div className="bg-[#16181e] rounded-lg border border-gray-800 overflow-hidden">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-[#1a1c24] text-gray-400 font-mono uppercase text-[9px] border-b border-gray-800">
                            <th className="p-2.5">Baseline Strategy</th>
                            <th className="p-2.5 text-right">Total Return</th>
                            <th className="p-2.5 text-right">Sharpe</th>
                            <th className="p-2.5 text-right">Max DD</th>
                            <th className="p-2.5 text-right">Significance (p-value)</th>
                            <th className="p-2.5 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800 font-mono text-[11px]">
                          {/* Selected strategy itself */}
                          <tr className="bg-purple-950/20 font-bold">
                            <td className="p-2.5 text-white flex items-center space-x-1.5">
                              <span className="w-2 h-2 rounded-full bg-[#a076ff]" />
                              <span>{selectedStrategy.name} (Challenger)</span>
                            </td>
                            <td className="p-2.5 text-right text-emerald-400">+{selectedEval.metrics.totalReturn.toFixed(1)}%</td>
                            <td className="p-2.5 text-right text-purple-300">{selectedEval.metrics.sharpeRatio.toFixed(2)}</td>
                            <td className="p-2.5 text-right text-rose-400">-{selectedEval.metrics.maxDrawdown.toFixed(1)}%</td>
                            <td className="p-2.5 text-right text-gray-400">-</td>
                            <td className="p-2.5 text-center">
                              <span className="bg-purple-900/50 text-purple-300 border border-purple-700/30 px-1.5 py-0.5 rounded text-[9px]">ACTIVE</span>
                            </td>
                          </tr>
                          
                          {selectedEval.baselines.map((base) => (
                            <tr key={base.name} className="hover:bg-gray-900/30">
                              <td className="p-2.5 text-gray-300">{base.name}</td>
                              <td className="p-2.5 text-right text-gray-400">{base.metrics.totalReturn >= 0 ? "+" : ""}{base.metrics.totalReturn.toFixed(1)}%</td>
                              <td className="p-2.5 text-right text-gray-400">{base.metrics.sharpeRatio.toFixed(2)}</td>
                              <td className="p-2.5 text-right text-rose-500">-{base.metrics.maxDrawdown.toFixed(1)}%</td>
                              <td className="p-2.5 text-right font-mono text-[#a076ff]">{base.statDifferencePValue.toFixed(4)}</td>
                              <td className="p-2.5 text-center">
                                {base.significantImprovement ? (
                                  <span className="bg-emerald-950 text-emerald-400 px-1.5 py-0.5 rounded text-[9px] font-black border border-emerald-800/40" title="Challenger is statistically significantly better than baseline">
                                    OUTPERFORM
                                  </span>
                                ) : (
                                  <span className="bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded text-[9px]">COMPETENT</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-[#1b1d24]/50 p-6 rounded-lg border border-dashed border-gray-800 text-center space-y-3.5">
                  <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
                  <div className="space-y-1">
                    <h3 className="text-xs font-bold text-white uppercase font-mono">Walk-Forward Validation Pending</h3>
                    <p className="text-xs text-gray-400 max-w-md mx-auto">
                      Before applying this strategy, we must compile historical backtest logs to compute Sharpe, Sortino, expected drawdown, and verify zero future data leaks.
                    </p>
                  </div>
                  <button
                    onClick={() => handleEvaluateStrategy(selectedStrategy.id)}
                    className="bg-purple-900 hover:bg-purple-800 text-white text-xs font-bold px-4 py-2 rounded transition mx-auto flex items-center space-x-1.5 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Run Validation Now</span>
                  </button>
                </div>
              )}

              {/* iii. STRATEGY DEFINITION BLOCK */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                
                {/* Rules Condition Logic */}
                <div className="bg-[#16181e] p-4 rounded-lg border border-gray-800 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center space-x-1.5">
                      <Sliders className="w-4 h-4 text-purple-400" />
                      <span className="text-xs font-extrabold text-white uppercase tracking-wider font-mono">
                        Rule Condition Schema Logic
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400">
                      Nested logic definitions that must be fully satisfied chronologically to trigger action bounds.
                    </p>
                    <div className="bg-[#0b0e11] p-3 rounded border border-gray-900">
                      {renderConditions(selectedStrategy.conditions)}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-800/60 flex items-center justify-between text-[10px] text-gray-500 font-mono">
                    <span>Creator: {selectedStrategy.author}</span>
                    <span>Created: {new Date(selectedStrategy.creationDate).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Explainability profile */}
                <div className="bg-[#16181e] p-4 rounded-lg border border-gray-800 space-y-4">
                  <div className="flex items-center space-x-1.5">
                    <FileText className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-extrabold text-white uppercase tracking-wider font-mono">
                      Strategy Explainability Profile
                    </span>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <h4 className="text-[11px] font-black text-gray-300 font-mono uppercase">Why it works</h4>
                      <p className="text-gray-400 text-[11px] mt-0.5">{selectedStrategy.explainability.whyItWorks}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <h4 className="text-[11px] font-black text-emerald-400 font-mono uppercase">When it works</h4>
                        <p className="text-gray-400 text-[11px] mt-0.5">{selectedStrategy.explainability.whenItWorks}</p>
                      </div>
                      <div>
                        <h4 className="text-[11px] font-black text-rose-400 font-mono uppercase">When it fails</h4>
                        <p className="text-gray-400 text-[11px] mt-0.5">{selectedStrategy.explainability.whenItFails}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1 text-[11px]">
                      <div>
                        <h4 className="text-[11px] font-black text-gray-300 font-mono uppercase">Supporting indicators</h4>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {selectedStrategy.explainability.supportingIndicators.map((ind, i) => (
                            <span key={i} className="bg-emerald-950/50 text-emerald-400 text-[9px] px-1.5 py-0.5 rounded font-mono">
                              {ind}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h4 className="text-[11px] font-black text-gray-300 font-mono uppercase">Contradicting indicators</h4>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {selectedStrategy.explainability.contradictingIndicators.map((ind, i) => (
                            <span key={i} className="bg-rose-950/50 text-rose-400 text-[9px] px-1.5 py-0.5 rounded font-mono">
                              {ind}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              {/* iv. GOVERNANCE AND SCIENTIFIC RE-EVALUATION PANEL */}
              <div className="bg-[#16181e] p-4 rounded-lg border border-gray-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <Shield className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-extrabold text-white uppercase tracking-wider font-mono">
                      Research Lab Governance & Consensus
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-400 font-mono">Author: {selectedStrategy.author}</span>
                </div>

                <div className="space-y-3">
                  <p className="text-xs text-gray-400">
                    No quantitative model is certified for deployment on live decision desks without explicit consensus validation by the quantitative researcher. Review research logs and update status below:
                  </p>

                  <div className="bg-[#0b0e11] p-3 rounded border border-gray-900 font-mono text-[11px] text-gray-300 whitespace-pre-wrap">
                    {selectedStrategy.scientificNotes}
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-bold text-gray-400 font-mono block">Consensus Scientific Update Notes:</label>
                    <textarea
                      value={statusNote}
                      onChange={(e) => setStatusNote(e.target.value)}
                      placeholder="Add research observations, stress limits, calibration limits, or validation reasons..."
                      className="w-full h-20 bg-[#0d0f12] text-xs text-gray-200 border border-gray-800 rounded p-2.5 focus:outline-none focus:border-purple-800"
                    />
                  </div>

                  <div className="flex items-center space-x-2 pt-1.5">
                    <button
                      onClick={() => handleUpdateStatus(selectedStrategy.id, "ACCEPTED")}
                      className="bg-emerald-900 hover:bg-emerald-800 text-white text-xs font-bold px-3 py-1.5 rounded transition flex items-center space-x-1 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Accept Strategy</span>
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(selectedStrategy.id, "REJECTED")}
                      className="bg-rose-950 hover:bg-rose-900 border border-rose-800/40 text-rose-200 text-xs font-bold px-3 py-1.5 rounded transition flex items-center space-x-1 cursor-pointer"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Reject Strategy</span>
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(selectedStrategy.id, "EXPERIMENTAL")}
                      className="bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-bold px-3 py-1.5 rounded transition flex items-center space-x-1 cursor-pointer"
                    >
                      <Bookmark className="w-3.5 h-3.5 text-amber-400" />
                      <span>Experimental Status</span>
                    </button>
                  </div>
                </div>
              </div>

            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-20 text-center space-y-3">
              <Compass className="w-12 h-12 text-[#a076ff] animate-spin" />
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white uppercase font-mono">Select a strategy</h3>
                <p className="text-xs text-gray-500 max-w-sm">
                  Click a strategy in the leaderboard list on the left to evaluate its parameters, stress tests, explainability, and baseline stats.
                </p>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* 3. DETERMINISTIC TEST SUITE STATUS MODAL (PORT 9) */}
      {showTestModal && testResults && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-fade-in select-text">
          <div className="bg-[#12161a] border border-[#24262b] w-full max-w-2xl rounded-lg shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            <div className="p-4 bg-[#16181e] border-b border-[#24262b] flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <Cpu className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-extrabold text-white uppercase tracking-tight font-mono">
                  Automated Deterministic Testing Suite
                </h3>
              </div>
              <button
                onClick={() => setShowTestModal(false)}
                className="text-gray-400 hover:text-white font-bold font-mono text-xs"
              >
                ✕ CLOSE
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 font-mono text-xs space-y-3 custom-scrollbar">
              <div className="p-3 bg-blue-950/20 border border-blue-900/40 text-blue-300 rounded flex items-center justify-between">
                <span>Deterministic Testing Phase Complete:</span>
                <span className="font-extrabold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                  {testResults.passed} Passed / {testResults.failed} Failed
                </span>
              </div>

              <div className="space-y-1 bg-[#0b0e11] p-3 rounded border border-gray-900">
                {testResults.details?.map((log: string, i: number) => {
                  const isPass = log.includes("[PASS]");
                  return (
                    <div key={i} className={`py-0.5 flex items-center space-x-1.5 ${isPass ? "text-emerald-400" : "text-rose-400"}`}>
                      {isPass ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                      <span>{log}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-3 bg-[#16181e] border-t border-[#24262b] flex justify-end shrink-0">
              <button
                onClick={() => setShowTestModal(false)}
                className="bg-blue-900 hover:bg-blue-850 text-white text-xs font-bold px-4 py-2 rounded transition cursor-pointer"
              >
                Accept and Acknowledge
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
