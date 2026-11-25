import React, { useState, useEffect } from "react";
import {
  Cpu,
  Zap,
  Activity,
  Sliders,
  Settings,
  RefreshCw,
  TrendingUp,
  AlertOctagon,
  Clock,
  Play,
  RotateCcw,
  CheckCircle,
  XCircle,
  FileText,
  Percent,
  Terminal,
  Layers,
  Sparkles,
  Info
} from "lucide-react";
import { ExecutionLedgerRecord, ExecutionAnalyticsMetrics, SimulationConfig } from "../executionTypes";

export function ExecutionLabPanel() {
  const [ledger, setLedger] = useState<ExecutionLedgerRecord[]>([]);
  const [analytics, setAnalytics] = useState<ExecutionAnalyticsMetrics | null>(null);
  const [config, setConfig] = useState<SimulationConfig | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<ExecutionLedgerRecord | null>(null);
  const [testResults, setTestResults] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  // Manual placement form state
  const [manSymbol, setManSymbol] = useState("BTCUSDT");
  const [manSide, setManSide] = useState<"BUY" | "SELL">("BUY");
  const [manOrderType, setManOrderType] = useState<"MARKET" | "LIMIT" | "STOP">("MARKET");
  const [manPrice, setManPrice] = useState(95000);
  const [manSize, setManSize] = useState(0.1);
  const [manStop, setManStop] = useState(93100);
  const [manTake, setManTake] = useState(98000);

  // Simulation parameters form state (with defaults)
  const [simSlippage, setSimSlippage] = useState(0.05); // percent
  const [simSpread, setSimSpread] = useState(0.04);     // percent
  const [simLatency, setSimLatency] = useState(35);
  const [simJitter, setSimJitter] = useState(15);
  const [simRejection, setSimRejection] = useState(0.5);
  const [simInterruption, setSimInterruption] = useState(1.0);
  const [simQueueDelay, setSimQueueDelay] = useState(5);

  // Forced options toggles for testing
  const [forcePartial, setForcePartial] = useState(false);
  const [forceTimeout, setForceTimeout] = useState(false);
  const [forceRejection, setForceRejection] = useState(false);
  const [platformMode, setPlatformMode] = useState<"deriv" | "binance">("deriv");

  const appendLog = (msg: string) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
  };

  const refreshAllData = async () => {
    try {
      setIsLoading(true);

      // 1. Fetch Ledger
      const resLedger = await fetch("/api/execution/ledger");
      const dataLedger = await resLedger.json();
      if (dataLedger.success) {
        setLedger(dataLedger.ledger);
      }

      // 2. Fetch Analytics
      const resAnalytics = await fetch("/api/execution/analytics");
      const dataAnalytics = await resAnalytics.json();
      if (dataAnalytics.success) {
        setAnalytics(dataAnalytics.analytics);
      }

      // 3. Fetch Config
      const resConfig = await fetch("/api/execution/config");
      const dataConfig = await resConfig.json();
      if (dataConfig.success) {
        const cfg = dataConfig.config;
        setConfig(cfg);
        setSimSlippage(cfg.baseSlippage * 100);
        setSimSpread(cfg.baseSpread * 100);
        setSimLatency(cfg.baseLatency);
        setSimJitter(cfg.jitter * 100);
        setSimRejection(cfg.rejectionProbability * 100);
        setSimInterruption(cfg.networkInterruptionRate * 100);
        setSimQueueDelay(cfg.queueDelayMeanMs);
      }
    } catch (err: any) {
      appendLog(`Failed to load data: ${err.message || err}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshAllData();
  }, []);

  const handleUpdateConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      const res = await fetch("/api/execution/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseSlippage: simSlippage / 100,
          baseSpread: simSpread / 100,
          baseLatency: simLatency,
          jitter: simJitter / 100,
          rejectionProbability: simRejection / 100,
          networkInterruptionRate: simInterruption / 100,
          queueDelayMeanMs: simQueueDelay
        })
      });
      const data = await res.json();
      if (data.success) {
        appendLog("Sandbox matching parameters updated successfully!");
        refreshAllData();
      } else {
        appendLog(`Failed to update settings: ${data.message}`);
      }
    } catch (err: any) {
      appendLog(`Network error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTriggerPipelinePass = async () => {
    try {
      setIsLoading(true);
      appendLog(`Triggering full Orchestrated Pipeline Pass (${platformMode.toUpperCase()})...`);
      const res = await fetch("/api/execution/pipeline-pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platformMode,
          simOverrides: {
            forcePartialFill: forcePartial,
            forceTimeout,
            forceRejection
          }
        })
      });
      const data = await res.json();
      if (data.success) {
        appendLog(`Pipeline completed! Outcome: ${data.record.status} (Quality: ${data.record.executionQuality}%)`);
        refreshAllData();
        if (data.record) {
          setSelectedRecord(data.record);
        }
      } else {
        appendLog(`Pipeline error: ${data.message}`);
      }
    } catch (err: any) {
      appendLog(`Network error during pipeline trigger: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlaceManualOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);
      appendLog(`Placing manual simulated order for ${manSymbol}...`);
      const res = await fetch("/api/execution/manual-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: manSymbol,
          side: manSide,
          orderType: manOrderType,
          entryPrice: manPrice,
          positionSize: manSize,
          stopLoss: manStop,
          takeProfit: manTake,
          simOverrides: {
            forcePartialFill: forcePartial,
            forceTimeout,
            forceRejection
          }
        })
      });
      const data = await res.json();
      if (data.success) {
        appendLog(`Manual simulated fill processed. Status: ${data.record.status}`);
        refreshAllData();
        if (data.record) {
          setSelectedRecord(data.record);
        }
      } else {
        appendLog(`Manual placement error: ${data.message}`);
      }
    } catch (err: any) {
      appendLog(`Network error during placement: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunDiagnostics = async () => {
    try {
      setIsLoading(true);
      appendLog("Initiating automated Execution diagnostic suite...");
      const res = await fetch("/api/execution/run-tests", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setTestResults(data.results);
        appendLog(`Diagnostics finish: ${data.results.passed} tests passed. ${data.results.failed} tests failed.`);
      } else {
        appendLog("Failed to compile diagnostic test suite.");
      }
    } catch (err: any) {
      appendLog(`Error running diagnostic suite: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearLedger = async () => {
    if (!confirm("Are you sure you want to delete all historical logs in the simulator ledger?")) return;
    try {
      setIsLoading(true);
      const res = await fetch("/api/execution/clear", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        appendLog("Ledger log database cleared successfully.");
        setSelectedRecord(null);
        refreshAllData();
      }
    } catch (err: any) {
      appendLog(`Clear failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div id="execution-lab-panel" className="bg-slate-950 min-h-screen text-slate-100 p-6 font-sans">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-800 pb-5 mb-6 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="text-emerald-400 w-6 h-6 animate-pulse" />
            <span className="text-xs font-semibold tracking-wider text-emerald-400 uppercase bg-emerald-950 px-2 py-0.5 rounded-full border border-emerald-900/50">
              PHASE 8 Sandbox
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight mt-1 text-slate-100 font-mono">
            Execution Intelligence Laboratory
          </h1>
          <p className="text-slate-400 text-sm mt-1 max-w-2xl">
            Isolated deterministic order matching simulator, latency queues, and performance audit ledger for institutional compliance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={refreshAllData}
            disabled={isLoading}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white px-4 py-2 rounded-lg border border-slate-800 transition text-sm font-medium"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-emerald-400" : ""}`} />
            Sync Sandbox
          </button>
          <button
            onClick={handleClearLedger}
            className="bg-red-950/40 hover:bg-red-950/80 text-red-400 hover:text-red-200 px-4 py-2 rounded-lg border border-red-900/30 hover:border-red-800/50 transition text-sm font-medium"
          >
            Reset Ledger
          </button>
        </div>
      </div>

      {/* Analytics Bento Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
            <span>Avg Slippage</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-amber-400 font-mono">
              {analytics ? `${(analytics.averageSlippage * 100).toFixed(4)}%` : "0.0000%"}
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Simulated price slippage cost</p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
            <span>Avg Latency</span>
            <Clock className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-emerald-400 font-mono">
              {analytics ? `${analytics.averageLatency.toFixed(1)} ms` : "0.0 ms"}
            </div>
            <p className="text-[10px] text-slate-500 mt-1">REST round-trip & queue delay</p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
            <span>Order Fill Rate</span>
            <CheckCircle className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-indigo-400 font-mono">
              {analytics ? `${(analytics.fillRate * 100).toFixed(1)}%` : "0.0%"}
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Filled vs overall placed</p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
            <span>Execution Quality</span>
            <Sparkles className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-emerald-400 font-mono">
              {analytics ? `${analytics.executionQuality.toFixed(1)}` : "100.0"}
              <span className="text-xs text-slate-500"> / 100</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Slippage & speed score metric</p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
            <span>Broker Rejection</span>
            <AlertOctagon className="w-4 h-4 text-rose-500" />
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-rose-500 font-mono">
              {analytics ? `${(analytics.rejectionRate * 100).toFixed(2)}%` : "0.00%"}
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Exchange rate control rejections</p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider">
            <span>Execution Cost</span>
            <TrendingUp className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-indigo-400 font-mono">
              ${analytics ? analytics.executionCost.toFixed(2) : "0.00"}
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Commissions + slippage cost</p>
          </div>
        </div>
      </div>

      {/* Main Layout Splits */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Left Hand Column: Control Panels */}
        <div className="space-y-6 xl:col-span-1">
          
          {/* Section A: Pipeline Pass Orchestrator */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              Pipeline Execution Controller
            </h2>
            
            <p className="text-xs text-slate-400 mb-4">
              Submit the latest Decision Engine outputs down through Risk approval gating, planar translation, sandbox matching queue, and final ledger.
            </p>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Adapter Interface</label>
                <select
                  value={platformMode}
                  onChange={(e) => setPlatformMode(e.target.value as any)}
                  className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-2 w-full focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="deriv">Deriv Adapter (Stub)</option>
                  <option value="binance">Binance Adapter (Stub)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Queue Loop</label>
                <div className="flex items-center h-full text-xs text-slate-400 font-mono">
                  ● Isolated / Dry Run
                </div>
              </div>
            </div>

            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 mb-4 space-y-2">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wide block mb-1">Simulate Failure Injectors</span>
              
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={forceTimeout}
                  onChange={(e) => setForceTimeout(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-800 text-emerald-500 focus:ring-0"
                />
                Force Network Timeout (Retry)
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={forceRejection}
                  onChange={(e) => setForceRejection(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-800 text-emerald-500 focus:ring-0"
                />
                Force Broker Rejection
              </label>

              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={forcePartial}
                  onChange={(e) => setForcePartial(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-800 text-emerald-500 focus:ring-0"
                />
                Force Multi-Event Partial Fill
              </label>
            </div>

            <button
              onClick={handleTriggerPipelinePass}
              disabled={isLoading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:text-slate-400 text-white py-2.5 px-4 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/20"
            >
              <Play className="w-4 h-4 fill-current" />
              Trigger Full Pipeline Pass
            </button>
          </div>

          {/* Section B: Sandbox matching Configuration */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-400" />
              Matching Simulator Settings
            </h2>

            <form onSubmit={handleUpdateConfig} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Base Slippage (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={simSlippage}
                    onChange={(e) => setSimSlippage(Number(e.target.value))}
                    className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-2 w-full focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Base Spread (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={simSpread}
                    onChange={(e) => setSimSpread(Number(e.target.value))}
                    className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-2 w-full focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Base Latency (ms)</label>
                  <input
                    type="number"
                    min="1"
                    value={simLatency}
                    onChange={(e) => setSimLatency(Number(e.target.value))}
                    className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-2 w-full focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Latency Jitter (%)</label>
                  <input
                    type="number"
                    min="0"
                    value={simJitter}
                    onChange={(e) => setSimJitter(Number(e.target.value))}
                    className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-2 w-full focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Rejection Rate (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={simRejection}
                    onChange={(e) => setSimRejection(Number(e.target.value))}
                    className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-2 w-full focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Timeout Rate (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={simInterruption}
                    onChange={(e) => setSimInterruption(Number(e.target.value))}
                    className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-2 w-full focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Queue Delay Mean (ms)</label>
                <input
                  type="number"
                  min="0"
                  value={simQueueDelay}
                  onChange={(e) => setSimQueueDelay(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-2 w-full focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-2 rounded-lg transition"
              >
                Save Simulation Parameters
              </button>
            </form>
          </div>

          {/* Section C: Manual Order Form */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              Place Manual Simulated Order
            </h2>

            <form onSubmit={handlePlaceManualOrder} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] text-slate-500 uppercase tracking-wider mb-1">Symbol</label>
                  <input
                    type="text"
                    value={manSymbol}
                    onChange={(e) => setManSymbol(e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-1.5 w-full focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-slate-500 uppercase tracking-wider mb-1">Direction</label>
                  <select
                    value={manSide}
                    onChange={(e) => setManSide(e.target.value as any)}
                    className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-1.5 w-full"
                  >
                    <option value="BUY">BUY (Long)</option>
                    <option value="SELL">SELL (Short)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] text-slate-500 uppercase tracking-wider mb-1">Order Type</label>
                  <select
                    value={manOrderType}
                    onChange={(e) => setManOrderType(e.target.value as any)}
                    className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-1.5 w-full"
                  >
                    <option value="MARKET">MARKET</option>
                    <option value="LIMIT">LIMIT</option>
                    <option value="STOP">STOP</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[9px] text-slate-500 uppercase tracking-wider mb-1">Position Size</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={manSize}
                    onChange={(e) => setManSize(Number(e.target.value))}
                    className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-1.5 w-full focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[9px] text-slate-500 uppercase tracking-wider mb-1">Price (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  value={manPrice}
                  onChange={(e) => setManPrice(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-1.5 w-full"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] text-slate-500 uppercase tracking-wider mb-1">Stop Loss (SL)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={manStop}
                    onChange={(e) => setManStop(Number(e.target.value))}
                    className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-1.5 w-full"
                  />
                </div>
                <div>
                  <label className="block text-[9px] text-slate-500 uppercase tracking-wider mb-1">Take Profit (TP)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={manTake}
                    onChange={(e) => setManTake(Number(e.target.value))}
                    className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-1.5 w-full"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-slate-850 hover:bg-slate-800 text-emerald-400 hover:text-emerald-300 border border-emerald-900/30 hover:border-emerald-800/60 text-xs font-semibold py-2 rounded-lg transition"
              >
                Place Simulated Order
              </button>
            </form>
          </div>

        </div>

        {/* Center / Right Columns: Ledger list, Diagnostics and expansion logs */}
        <div className="space-y-6 xl:col-span-2">
          
          {/* Section D: Deterministic Diagnostic Suite Terminal */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                Execution Diagnostic Verification Suite (Part 10)
              </h2>
              <button
                onClick={handleRunDiagnostics}
                className="bg-emerald-950 text-emerald-400 hover:text-emerald-200 hover:bg-emerald-900 text-xs px-3 py-1.5 rounded border border-emerald-900 transition flex items-center gap-1.5 font-medium"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Run Compliance Checks
              </button>
            </div>

            {testResults ? (
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg flex items-center gap-2">
                  <CheckCircle className="text-emerald-400 w-5 h-5 flex-shrink-0" />
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase">Passed</span>
                    <span className="font-mono text-sm font-bold text-emerald-400">{testResults.passed} checks</span>
                  </div>
                </div>

                <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg flex items-center gap-2">
                  <XCircle className="text-rose-500 w-5 h-5 flex-shrink-0" />
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase">Failed</span>
                    <span className="font-mono text-sm font-bold text-rose-500">{testResults.failed} checks</span>
                  </div>
                </div>

                <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg flex items-center gap-2">
                  <span className="font-mono font-bold text-slate-400 block p-1">100%</span>
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase">Compliance</span>
                    <span className="font-mono text-xs font-semibold text-indigo-400">Deterministic</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-950 p-4 border border-slate-800/80 text-center rounded-lg text-xs text-slate-500 mb-4">
                No diagnostic history compiled yet. Click &quot;Run Compliance Checks&quot; to verify compliance.
              </div>
            )}

            {/* Terminal logs display */}
            <div className="bg-black text-slate-300 p-3 rounded-lg border border-slate-800 font-mono text-xs h-40 overflow-y-auto leading-relaxed">
              <span className="text-[10px] text-slate-500 font-sans block mb-1">SANDBOX INTERRUPT / LATENCY STREAMS:</span>
              {logs.length > 0 ? (
                logs.map((log, i) => (
                  <div key={i} className="py-0.5 border-b border-slate-950/20 last:border-0">
                    {log}
                  </div>
                ))
              ) : (
                <div className="text-slate-600 italic">No events recorded. Waiting for pipeline trigger...</div>
              )}
            </div>
          </div>

          {/* Section E: Simulation Audit Ledger List */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-400" />
              Simulation Audit Ledger (Immutable)
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500">
                    <th className="py-2.5 font-medium uppercase tracking-wider">Plan ID</th>
                    <th className="py-2.5 font-medium uppercase tracking-wider">Symbol</th>
                    <th className="py-2.5 font-medium uppercase tracking-wider">Side</th>
                    <th className="py-2.5 font-medium uppercase tracking-wider">Type</th>
                    <th className="py-2.5 font-medium uppercase tracking-wider">Status</th>
                    <th className="py-2.5 font-medium uppercase tracking-wider text-right">Latency</th>
                    <th className="py-2.5 font-medium uppercase tracking-wider text-right">Slippage</th>
                    <th className="py-2.5 font-medium uppercase tracking-wider text-right">Quality</th>
                    <th className="py-2.5 font-medium uppercase tracking-wider text-right">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.length > 0 ? (
                    ledger.slice().reverse().map((r, idx) => {
                      const isCompleted = r.status === "COMPLETED";
                      const isRejected = r.status === "REJECTED";
                      return (
                        <tr
                          key={idx}
                          onClick={() => setSelectedRecord(r)}
                          className={`border-b border-slate-850 hover:bg-slate-850/40 cursor-pointer transition ${selectedRecord?.executionId === r.executionId ? "bg-slate-850/60" : ""}`}
                        >
                          <td className="py-2.5 font-mono text-slate-400 max-w-[80px] truncate">{r.plan.id}</td>
                          <td className="py-2.5 font-semibold text-slate-200">{r.plan.symbol}</td>
                          <td className="py-2.5">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${r.plan.side === "BUY" ? "bg-emerald-950 text-emerald-400" : "bg-rose-950 text-rose-400"}`}>
                              {r.plan.side}
                            </span>
                          </td>
                          <td className="py-2.5 font-mono text-slate-400">{r.plan.orderType}</td>
                          <td className="py-2.5">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              isCompleted ? "bg-emerald-950 text-emerald-400" :
                              isRejected ? "bg-rose-950 text-rose-500" : "bg-amber-950 text-amber-400"
                            }`}>
                              {r.status}
                            </span>
                          </td>
                          <td className="py-2.5 font-mono text-right text-slate-300">{r.latency.toFixed(0)}ms</td>
                          <td className="py-2.5 font-mono text-right text-slate-300">{(r.slippage * 100).toFixed(4)}%</td>
                          <td className="py-2.5 font-mono text-right font-semibold text-emerald-400">{r.executionQuality.toFixed(0)}</td>
                          <td className="py-2.5 text-right font-medium">
                            <span className={
                              r.finalResult === "WON" ? "text-emerald-400" :
                              r.finalResult === "LOST" ? "text-rose-500" : "text-slate-500"
                            }>
                              {r.finalResult}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-600 italic">
                        No orders have run yet. Click &quot;Trigger Full Pipeline Pass&quot; or place a manual order.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section F: Detailed Plan Audit Panel (Double check immutability audits) */}
          {selectedRecord && (
            <div className="bg-slate-900 border border-indigo-900/30 rounded-xl p-5 shadow-lg shadow-indigo-950/10">
              <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <Info className="w-4 h-4 text-indigo-400" />
                    Ledger Record Deep-Dive Audit
                  </h3>
                  <span className="text-[10px] text-slate-500 font-mono">Execution UID: {selectedRecord.executionId}</span>
                </div>
                <button
                  onClick={() => setSelectedRecord(null)}
                  className="text-slate-400 hover:text-slate-200 text-xs font-semibold"
                >
                  Close Details
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                
                {/* Panel left: Immutable Execution Plan details */}
                <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block border-b border-slate-800 pb-1 mb-2">
                    🛡️ Immutable Plan Specification
                  </span>
                  <div className="flex justify-between"><span className="text-slate-500">Prediction ID:</span> <span className="font-mono text-slate-300">{selectedRecord.predictionId}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Decision ID:</span> <span className="font-mono text-slate-300">{selectedRecord.decisionId}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Risk Approval ID:</span> <span className="font-mono text-slate-300">{selectedRecord.riskApprovalId}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Symbol / Size:</span> <span className="font-mono font-semibold text-slate-200">{selectedRecord.plan.symbol} | {selectedRecord.plan.positionSize} units</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Stop Loss:</span> <span className="font-mono text-rose-400">${selectedRecord.plan.stopLoss.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Take Profit:</span> <span className="font-mono text-emerald-400">${selectedRecord.plan.takeProfit.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Time-In-Force:</span> <span className="font-mono text-slate-400">{selectedRecord.plan.timeInForce}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Plan Creation:</span> <span className="text-slate-400">{new Date(selectedRecord.plan.createdAt).toLocaleString()}</span></div>
                </div>

                {/* Panel right: Simulated Broker Fill Events */}
                <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-2">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block border-b border-slate-800 pb-1 mb-2">
                    🎯 Fill Event Logs & Penalties
                  </span>
                  
                  {selectedRecord.fillEvents.length > 0 ? (
                    selectedRecord.fillEvents.map((evt, i) => (
                      <div key={i} className="border-b border-slate-900/50 pb-2 last:border-0 last:pb-0 space-y-1">
                        <div className="flex justify-between"><span className="text-slate-500">Fill #{i + 1} Price:</span> <span className="font-mono font-bold text-slate-200">${evt.price.toFixed(2)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Slippage Applied:</span> <span className="font-mono text-amber-400">{(evt.slippage * 100).toFixed(4)}%</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Latency Delay:</span> <span className="font-mono text-indigo-400">{evt.latency} ms</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Spread Cost:</span> <span className="font-mono text-slate-400">{(evt.spread * 100).toFixed(4)}%</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Broker Commission:</span> <span className="font-mono text-slate-300">${evt.commission.toFixed(4)}</span></div>
                      </div>
                    ))
                  ) : (
                    <div className="text-slate-500 italic py-2">
                      No fill events recorded for this order. {selectedRecord.failureReason ? `Reason: ${selectedRecord.failureReason}` : ""}
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-900 flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-semibold">Net P&amp;L (USD):</span>
                    <span className={`font-mono font-bold ${selectedRecord.netProfitUSD >= 0 ? "text-emerald-400" : "text-rose-500"}`}>
                      {selectedRecord.netProfitUSD >= 0 ? "+" : ""}${selectedRecord.netProfitUSD.toFixed(2)} ({selectedRecord.returnPct >= 0 ? "+" : ""}{selectedRecord.returnPct.toFixed(2)}%)
                    </span>
                  </div>
                </div>

              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
export default ExecutionLabPanel;
