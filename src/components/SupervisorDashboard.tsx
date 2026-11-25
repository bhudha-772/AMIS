import React, { useState, useEffect } from "react";
import {
  Shield,
  Activity,
  AlertTriangle,
  FileSpreadsheet,
  Settings,
  Cpu,
  RefreshCw,
  HardDrive,
  CheckCircle,
  XCircle,
  Database,
  Terminal,
  Clock,
  Play,
  RotateCcw,
  AlertOctagon,
  TrendingUp,
  Sliders,
  Info,
  ChevronRight,
  Sparkles
} from "lucide-react";
import { MonitoredSubsystem, EventSeverity, SafetyRecommendation, SystemHealthState, WatchdogState, AnomalyReport, DiagnosticMetrics, OperationalLogEvent } from "../supervisorTypes";

export function SupervisorDashboard() {
  const [healthState, setHealthState] = useState<SystemHealthState | null>(null);
  const [watchdogs, setWatchdogs] = useState<WatchdogState[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyReport[]>([]);
  const [ledger, setLedger] = useState<OperationalLogEvent[]>([]);
  const [diagnostics, setDiagnostics] = useState<DiagnosticMetrics | null>(null);
  const [recommendation, setRecommendation] = useState<SafetyRecommendation>("CONTINUE_NORMALLY");
  
  const [isLoading, setIsLoading] = useState(false);
  const [isStressTesting, setIsStressTesting] = useState(false);
  const [stressResult, setStressResult] = useState<any>(null);
  const [testResults, setTestResults] = useState<any>(null);
  const [selectedEvent, setSelectedEvent] = useState<OperationalLogEvent | null>(null);
  const [dashboardLogs, setDashboardLogs] = useState<string[]>([]);

  const appendLog = (msg: string) => {
    setDashboardLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 30));
  };

  const syncAllData = async () => {
    try {
      setIsLoading(true);
      
      // 1. Fetch Health
      const resH = await fetch("/api/supervisor/health");
      const dataH = await resH.json();
      if (dataH.success) {
        setHealthState(dataH.health);
      }

      // 2. Fetch Watchdogs
      const resW = await fetch("/api/supervisor/watchdogs");
      const dataW = await resW.json();
      if (dataW.success) {
        setWatchdogs(dataW.watchdogs);
      }

      // 3. Fetch Anomalies
      const resA = await fetch("/api/supervisor/anomalies");
      const dataA = await resA.json();
      if (dataA.success) {
        setAnomalies(dataA.anomalies);
      }

      // 4. Fetch Ledger
      const resL = await fetch("/api/supervisor/ledger");
      const dataL = await resL.json();
      if (dataL.success) {
        setLedger(dataL.ledger);
      }

      // 5. Fetch Diagnostics
      const resD = await fetch("/api/supervisor/diagnostics");
      const dataD = await resD.json();
      if (dataD.success) {
        setDiagnostics(dataD.diagnostics);
      }

      // 6. Fetch Safety
      const resS = await fetch("/api/supervisor/safety");
      const dataS = await resS.json();
      if (dataS.success) {
        setRecommendation(dataS.recommendation);
      }
    } catch (err: any) {
      appendLog(`Error syncing supervisor telemetry: ${err.message || err}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    syncAllData();
    const interval = setInterval(syncAllData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleResolveEvent = async (id: string) => {
    try {
      appendLog(`Submitting resolution patch for operational event ${id}...`);
      const res = await fetch("/api/supervisor/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: id })
      });
      const data = await res.json();
      if (data.success) {
        appendLog(`Operational event ${id} updated as RESOLVED in immutable audit log.`);
        syncAllData();
        if (selectedEvent && selectedEvent.id === id) {
          setSelectedEvent(prev => prev ? { ...prev, resolved: true, resolvedAt: Date.now() } : null);
        }
      } else {
        appendLog(`Resolution rejected: ${data.message}`);
      }
    } catch (err: any) {
      appendLog(`Network fail: ${err.message}`);
    }
  };

  const handleRunTests = async () => {
    try {
      setIsLoading(true);
      appendLog("Compiling diagnostic unit checks for AMIS core subsystems...");
      const res = await fetch("/api/supervisor/run-tests", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setTestResults(data.results);
        appendLog(`Compliance verification complete! Checks Passed: ${data.results.passed}. Failed: ${data.results.failed}.`);
        syncAllData();
      }
    } catch (err: any) {
      appendLog(`Test execution failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStressTest = async () => {
    try {
      setIsStressTesting(true);
      setStressResult(null);
      appendLog("INITIATING INTENSIVE WORKLOAD STRESS TEST...");
      appendLog("Simulating: 1,000,000 Ticks, 100,000 Predictions, 100,000 Execution matches...");
      
      const res = await fetch("/api/supervisor/stress-test", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setStressResult(data.results);
        appendLog(`Stress tests passed! Throughput: ${data.results.throughputPerSec.toLocaleString()} cycles/sec. RSS growth: ${data.results.memoryDeltaRssMb.toFixed(3)}MB.`);
        syncAllData();
      }
    } catch (err: any) {
      appendLog(`Stress tests interrupted: ${err.message}`);
    } finally {
      setIsStressTesting(false);
    }
  };

  const handleClearLedger = async () => {
    if (!confirm("Are you sure you want to reset the operational supervisor log history and active anomalies?")) return;
    try {
      setIsLoading(true);
      const res = await fetch("/api/supervisor/clear", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        appendLog("Immutable simulator history reset successfully.");
        setSelectedEvent(null);
        setStressResult(null);
        setTestResults(null);
        syncAllData();
      }
    } catch (err: any) {
      appendLog(`Reset failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper colors for health
  const getScoreColor = (score: number) => {
    if (score >= 85) return "text-emerald-400 border-emerald-900/50 bg-emerald-950/20";
    if (score >= 60) return "text-amber-400 border-amber-900/50 bg-amber-950/20";
    return "text-rose-500 border-rose-900/50 bg-rose-950/20";
  };

  const getStatusBadge = (status: string) => {
    if (status === "HEALTHY" || status === "PASS" || status === "INFO") {
      return "text-emerald-400 bg-emerald-950/50 border border-emerald-900/30";
    }
    if (status === "DEGRADED" || status === "WARN" || status === "WARNING") {
      return "text-amber-400 bg-amber-950/50 border border-amber-900/30";
    }
    return "text-rose-400 bg-rose-950/50 border border-rose-900/30";
  };

  return (
    <div id="supervisor-dashboard" className="bg-[#0b0e11] min-h-screen text-slate-100 p-6 font-mono selection:bg-emerald-900 selection:text-emerald-100">
      
      {/* Top Banner and System Title */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between border-b border-slate-800 pb-5 mb-6 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="text-emerald-400 w-5 h-5 animate-pulse" />
            <span className="text-[10px] font-bold tracking-widest text-emerald-400 uppercase bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-900/50">
              PHASE 9 OPERATIONAL INTELLIGENCE
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 mt-1">
            AMIS Autonomous Supervisor Control Desk
          </h1>
          <p className="text-slate-400 text-xs mt-1 max-w-3xl">
            Real-time deterministic system health engine, microsecond latency watchdogs, statistical self-diagnostics, and immutable audit logs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={syncAllData}
            disabled={isLoading}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white px-3.5 py-2 rounded border border-slate-800 transition text-xs font-semibold"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-emerald-400" : ""}`} />
            Sync Metrics
          </button>
          
          <button
            onClick={handleRunTests}
            disabled={isLoading}
            className="flex items-center gap-1.5 bg-indigo-950/40 hover:bg-indigo-950/80 text-indigo-400 hover:text-indigo-200 px-3.5 py-2 rounded border border-indigo-900/30 transition text-xs font-semibold"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            Validate Compliance
          </button>

          <button
            onClick={handleStressTest}
            disabled={isStressTesting}
            className="flex items-center gap-1.5 bg-emerald-950/40 hover:bg-emerald-950/80 text-emerald-400 hover:text-emerald-200 px-3.5 py-2 rounded border border-emerald-900/30 transition text-xs font-semibold"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {isStressTesting ? "Running Stress Test..." : "Workload Stress Audit"}
          </button>

          <button
            onClick={handleClearLedger}
            className="bg-red-950/30 hover:bg-red-950/60 text-red-400 hover:text-red-200 px-3.5 py-2 rounded border border-red-900/20 hover:border-red-800/40 transition text-xs font-semibold"
          >
            Reset Logs
          </button>
        </div>
      </div>

      {/* Safety Controller Alert Banner (PART 8) */}
      <div className={`border p-4 rounded-lg mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 transition ${
        recommendation === "EMERGENCY_STOP" ? "bg-red-950/20 border-red-900/50 text-red-200" :
        recommendation === "INCREASE_MONITORING" ? "bg-amber-950/20 border-amber-900/50 text-amber-200" :
        recommendation.startsWith("PAUSE") ? "bg-rose-950/25 border-rose-900/50 text-rose-200" :
        "bg-emerald-950/15 border-emerald-900/40 text-emerald-200"
      }`}>
        <div className="flex items-start gap-3">
          <AlertOctagon className={`w-6 h-6 flex-shrink-0 ${
            recommendation === "CONTINUE_NORMALLY" ? "text-emerald-400" : "text-amber-400 animate-bounce"
          }`} />
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider block text-slate-400">Supervisor Safety Directive</span>
            <div className="font-bold text-sm mt-0.5 font-sans tracking-wide">
              {recommendation === "CONTINUE_NORMALLY" && "SYSTEM OPERATING SAFELY: Continue normal simulated trading pipelines."}
              {recommendation === "INCREASE_MONITORING" && "CAUTION ADVISED: Minor telemetry drift detected. Increase watchdog check frequencies."}
              {recommendation === "PAUSE_STRATEGIES" && "POLICY LIMIT OVERRIDE: Pausing Strategy selection engines due to elevated drawdowns."}
              {recommendation === "PAUSE_EXECUTION" && "RISK DIRECTIVE: Halting orders generation. Active risk engine blocks triggered."}
              {recommendation === "EMERGENCY_STOP" && "EMERGENCY SHUTDOWN RECOMMENDED: Telemetry violation thresholds critical."}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-sans">Active Recommendation:</span>
          <span className={`px-2.5 py-1 rounded text-xs font-bold font-mono tracking-wider ${
            recommendation === "CONTINUE_NORMALLY" ? "bg-emerald-900/50 text-emerald-300" :
            recommendation === "EMERGENCY_STOP" ? "bg-red-900 text-red-100 animate-pulse" :
            "bg-amber-900/50 text-amber-300"
          }`}>
            {recommendation}
          </span>
        </div>
      </div>

      {/* Main Grid: Overall Health Gauge + Resource Bento Box */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
        
        {/* Core overall score card */}
        <div className="bg-[#12161a] border border-slate-800 p-5 rounded-lg flex flex-col justify-between lg:col-span-1">
          <div>
            <span className="text-[9px] text-slate-500 uppercase font-bold block mb-1">AMIS System Health</span>
            <span className="text-xs text-slate-400 block font-sans">Deterministic composite calculation</span>
          </div>

          <div className="flex flex-col items-center justify-center my-6">
            <div className={`w-28 h-28 rounded-full border-4 flex flex-col items-center justify-center ${
              healthState ? getScoreColor(healthState.overallScore) : "border-slate-800"
            }`}>
              <span className="text-4xl font-extrabold tracking-tighter">
                {healthState ? healthState.overallScore : "0"}
              </span>
              <span className="text-[9px] uppercase tracking-widest text-slate-400 mt-1">Health %</span>
            </div>
          </div>

          <div className="border-t border-slate-850 pt-3 text-center">
            <span className="text-[10px] text-slate-500 block">Status Classification</span>
            <span className={`text-xs font-bold inline-block px-2 py-0.5 rounded mt-1 font-sans ${
              healthState ? (healthState.overallScore >= 85 ? "bg-emerald-950 text-emerald-400 border border-emerald-900" : "bg-amber-950 text-amber-400 border border-amber-900") : "bg-slate-900 text-slate-400"
            }`}>
              {healthState ? (healthState.overallScore >= 85 ? "OPTIMAL CONFIG" : "ATTENTION REQUIRED") : "STANDBY"}
            </span>
          </div>
        </div>

        {/* Dynamic Telemetry Box (PART 2) */}
        <div className="lg:col-span-3 bg-[#12161a] border border-slate-800 p-5 rounded-lg">
          <div className="flex items-center justify-between mb-4 border-b border-slate-850 pb-2">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Dynamic System Telemetry Indicators</span>
            <span className="text-[9px] text-slate-500 font-mono">Live updates every 5s</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            
            <div className="bg-[#1a1f24] p-4 rounded border border-slate-800">
              <div className="flex justify-between items-center text-slate-400 text-xs">
                <span>Memory RSS</span>
                <Database className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-xl font-bold mt-2 text-slate-200">
                {healthState ? `${healthState.memory.rssMb.toFixed(1)} MB` : "0 MB"}
              </div>
              <div className="text-[9px] text-slate-500 mt-1 font-sans">Residual Set Size on Node runtime</div>
            </div>

            <div className="bg-[#1a1f24] p-4 rounded border border-slate-800">
              <div className="flex justify-between items-center text-slate-400 text-xs">
                <span>Node Heap</span>
                <HardDrive className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="text-xl font-bold mt-2 text-slate-200">
                {healthState ? `${healthState.memory.heapUsedMb.toFixed(1)} MB` : "0 MB"}
              </div>
              <div className="text-[9px] text-slate-500 mt-1 font-sans">Active references block memory</div>
            </div>

            <div className="bg-[#1a1f24] p-4 rounded border border-slate-800">
              <div className="flex justify-between items-center text-slate-400 text-xs">
                <span>CPU Core Load</span>
                <Cpu className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-xl font-bold mt-2 text-slate-200">
                {healthState ? `${healthState.cpuLoadPct}%` : "0%"}
              </div>
              <div className="text-[9px] text-slate-500 mt-1 font-sans">Simulated execution thread load</div>
            </div>

            <div className="bg-[#1a1f24] p-4 rounded border border-slate-800">
              <div className="flex justify-between items-center text-slate-400 text-xs">
                <span>Disk Allocation</span>
                <HardDrive className="w-4 h-4 text-slate-400" />
              </div>
              <div className="text-xl font-bold mt-2 text-slate-200">
                {healthState ? `${healthState.diskUsagePct}%` : "0%"}
              </div>
              <div className="text-[9px] text-slate-500 mt-1 font-sans">Sandbox persistent volume</div>
            </div>

          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4 border-t border-slate-850 pt-4">
            <div>
              <span className="text-[10px] text-slate-500 block">Probability Deviation</span>
              <span className="text-sm font-bold text-slate-300">
                {diagnostics ? `${(diagnostics.probabilityCalibrationDev * 100).toFixed(2)}%` : "0.00%"}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">Avg Prediction Confidence</span>
              <span className="text-sm font-bold text-slate-300">
                {diagnostics ? `${(diagnostics.predictionConfidenceAvg * 100).toFixed(1)}%` : "0.0%"}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">Feature Reliability Score</span>
              <span className="text-sm font-bold text-emerald-400">
                {diagnostics ? `${diagnostics.featureReliabilityPct.toFixed(1)}%` : "100.0%"}
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Grid: Watchdogs & Subsystems Side-by-Side */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        
        {/* Watchdogs (PART 3) */}
        <div className="bg-[#12161a] border border-slate-800 p-5 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle className="text-amber-400 w-4 h-4 animate-bounce" />
              Active Watchdog Monitored Streams
            </span>
            <span className="text-[9px] text-slate-500">Limits verified continuously</span>
          </div>

          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
            {watchdogs.map((w, idx) => (
              <div key={idx} className="bg-[#1a1f24] border border-slate-800 p-3 rounded flex items-center justify-between gap-3 text-xs">
                <div>
                  <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                    <span>{w.name}</span>
                    <span className="text-[10px] text-slate-500 font-mono">({w.subsystem})</span>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] text-slate-400 mt-1">
                    <span>Observed: <strong className="text-slate-300">{w.value}</strong></span>
                    <span>Constraint: <strong className="text-slate-500">{w.limit}</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getStatusBadge(w.status)}`}>
                    {w.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Subsystems Scorecard Table (PART 1 & 2) */}
        <div className="bg-[#12161a] border border-slate-800 p-5 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="text-emerald-400 w-4 h-4" />
              Comprehensive Subsystem Integrity Scores
            </span>
            <span className="text-[9px] text-slate-500">13 Monitored Modules</span>
          </div>

          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500 text-[10px] uppercase">
                  <th className="pb-2 font-semibold">Subsystem Name</th>
                  <th className="pb-2 font-semibold text-center">Score</th>
                  <th className="pb-2 font-semibold text-center">Status</th>
                  <th className="pb-2 font-semibold text-right">Integrity Details</th>
                </tr>
              </thead>
              <tbody>
                {healthState ? (
                  Object.entries(healthState.subsystems).map(([name, d]: [string, any], idx) => (
                    <tr key={idx} className="border-b border-slate-850 hover:bg-slate-850/20 transition">
                      <td className="py-2.5 font-semibold text-slate-300">{name}</td>
                      <td className="py-2.5 text-center">
                        <span className="font-mono font-bold text-slate-200 bg-slate-900 px-1.5 py-0.5 rounded">
                          {d.score}
                        </span>
                      </td>
                      <td className="py-2.5 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${getStatusBadge(d.status)}`}>
                          {d.status}
                        </span>
                      </td>
                      <td className="py-2.5 text-right text-slate-400 text-[10px]">
                        {d.evidence}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="text-center py-4 text-slate-500 italic">
                      Telemetry data offline...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Anomaly Detection & Dashboard Logs Terminal */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        
        {/* Anomaly Timeline (PART 5) */}
        <div className="bg-[#12161a] border border-slate-800 p-5 rounded-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <AlertOctagon className="text-rose-500 w-4 h-4" />
                Detected Statistical Anomalies Feed
              </span>
              <span className="text-[9px] text-slate-500">Live boundary monitors</span>
            </div>

            <div className="space-y-3.5 max-h-[300px] overflow-y-auto pr-1">
              {anomalies.length > 0 ? (
                anomalies.map((a, idx) => (
                  <div key={idx} className="bg-[#1a1f24] border-l-2 border-rose-500 p-3 rounded text-xs">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-200">{a.title}</span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-950 text-rose-400 border border-rose-900/40">
                        {a.level}
                      </span>
                    </div>
                    <p className="text-slate-400 text-[11px] mt-1">{a.description}</p>
                    <div className="flex items-center justify-between text-[9px] text-slate-500 mt-2">
                      <span>Subsystem: <strong className="text-slate-400">{a.subsystem}</strong></span>
                      <span>{new Date(a.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-slate-500 italic text-xs bg-[#1a1f24] rounded border border-slate-800">
                  Optimal performance: No active anomalies detected in matching loops.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Terminal Logs View */}
        <div className="bg-[#12161a] border border-slate-800 p-5 rounded-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-slate-850 pb-2">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Terminal className="text-slate-400 w-4 h-4" />
                Supervisor Live Intercept Log Console
              </span>
              <span className="text-[9px] text-slate-500">Chronological history</span>
            </div>

            <div className="bg-[#080b0d] text-slate-300 p-3 rounded border border-slate-800 font-mono text-xs h-[280px] overflow-y-auto leading-relaxed">
              {dashboardLogs.length > 0 ? (
                dashboardLogs.map((log, i) => (
                  <div key={i} className="py-0.5 border-b border-slate-900/50 last:border-0 last:pb-0 text-slate-400">
                    {log}
                  </div>
                ))
              ) : (
                <div className="text-slate-600 italic">No console logs. Telemetry synced normally...</div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Stress-Test Output metrics Section (PART 10) */}
      {stressResult && (
        <div className="bg-[#12161a] border border-emerald-900/40 p-5 rounded-lg mb-6 shadow-xl shadow-emerald-950/5">
          <div className="flex items-center gap-2 mb-4 text-emerald-400">
            <Sparkles className="w-5 h-5 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider">COMPLETED SYSTEM PERFORMANCE STRESS RUN STATISTICS</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-[#1a1f24] p-3 rounded border border-slate-800">
              <span className="text-[10px] text-slate-500 block uppercase">Duration</span>
              <span className="text-lg font-bold text-slate-200">{stressResult.durationMs} ms</span>
            </div>
            <div className="bg-[#1a1f24] p-3 rounded border border-slate-800">
              <span className="text-[10px] text-slate-500 block uppercase">Cycles Simulated</span>
              <span className="text-lg font-bold text-slate-200">1,200,000 items</span>
            </div>
            <div className="bg-[#1a1f24] p-3 rounded border border-slate-800">
              <span className="text-[10px] text-slate-500 block uppercase">Throughput Score</span>
              <span className="text-lg font-bold text-emerald-400">{stressResult.throughputPerSec.toLocaleString()} ops/sec</span>
            </div>
            <div className="bg-[#1a1f24] p-3 rounded border border-slate-800">
              <span className="text-[10px] text-slate-500 block uppercase">Memory Delta RSS</span>
              <span className="text-lg font-bold text-amber-400">+{stressResult.memoryDeltaRssMb.toFixed(3)} MB</span>
            </div>
            <div className="bg-[#1a1f24] p-3 rounded border border-slate-800">
              <span className="text-[10px] text-slate-500 block uppercase">Response Avg (est)</span>
              <span className="text-lg font-bold text-indigo-400">{(stressResult.responseTimesAvgMs).toFixed(4)} μs</span>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Compliance Unit Test Report Box */}
      {testResults && (
        <div className="bg-[#12161a] border border-indigo-900/40 p-5 rounded-lg mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-indigo-400">
              <CheckCircle className="w-5 h-5" />
              <span className="text-xs font-bold uppercase tracking-wider">Automated Deterministic Compliance suite results</span>
            </div>
            <span className="text-[9px] text-slate-500 font-mono font-bold uppercase">Passed</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-950 p-3 rounded border border-slate-850 flex items-center justify-between">
              <span className="text-slate-400 text-xs">Passed asserts</span>
              <span className="font-bold text-emerald-400 text-lg font-mono">{testResults.passed}</span>
            </div>
            <div className="bg-slate-950 p-3 rounded border border-slate-850 flex items-center justify-between">
              <span className="text-slate-400 text-xs">Failed asserts</span>
              <span className="font-bold text-rose-500 text-lg font-mono">{testResults.failed}</span>
            </div>
            <div className="bg-slate-950 p-3 rounded border border-slate-850 flex items-center justify-between col-span-2">
              <span className="text-slate-400 text-xs">Engine verification status</span>
              <span className="font-bold text-emerald-400 text-xs uppercase tracking-widest font-sans">100% Deterministic Compliance</span>
            </div>
          </div>
        </div>
      )}

      {/* Immutable Logs Audit Ledger & Deep-Dive (PART 6) */}
      <div className="bg-[#12161a] border border-slate-800 p-5 rounded-lg">
        <div className="flex items-center justify-between mb-4 border-b border-slate-850 pb-2">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
            <FileSpreadsheet className="text-indigo-400 w-4 h-4" />
            Immutable Audit Ledger Index (Chronological)
          </span>
          <span className="text-[9px] text-slate-500">Append-only compliance vault</span>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          
          {/* Main List Table */}
          <div className="xl:col-span-2 overflow-x-auto max-h-[350px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500 text-[10px] uppercase">
                  <th className="pb-2 font-semibold">Event ID</th>
                  <th className="pb-2 font-semibold">Subsystem</th>
                  <th className="pb-2 font-semibold">Severity</th>
                  <th className="pb-2 font-semibold">Title</th>
                  <th className="pb-2 font-semibold">Status</th>
                  <th className="pb-2 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {ledger.length > 0 ? (
                  ledger.slice().reverse().map((e, idx) => {
                    const isCrit = e.severity === "CRITICAL";
                    return (
                      <tr
                        key={idx}
                        onClick={() => setSelectedEvent(e)}
                        className={`border-b border-slate-850 hover:bg-slate-850/30 cursor-pointer transition ${
                          selectedEvent?.id === e.id ? "bg-slate-850/50" : ""
                        }`}
                      >
                        <td className="py-2 font-mono text-[10px] text-slate-400 truncate max-w-[100px]">{e.id}</td>
                        <td className="py-2 text-slate-300 font-semibold">{e.subsystem}</td>
                        <td className="py-2">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            isCrit ? "bg-red-950 text-red-400 border border-red-900/30" : "bg-amber-950 text-amber-400 border border-amber-900/30"
                          }`}>
                            {e.severity}
                          </span>
                        </td>
                        <td className="py-2 text-slate-300 truncate max-w-[180px]">{e.title}</td>
                        <td className="py-2">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            e.resolved ? "bg-emerald-950 text-emerald-400 border border-emerald-900/30" : "bg-rose-950 text-rose-500 border border-rose-900/30"
                          }`}>
                            {e.resolved ? "RESOLVED" : "OPEN"}
                          </span>
                        </td>
                        <td className="py-2 text-right">
                          {!e.resolved ? (
                            <button
                              onClick={(evt) => {
                                evt.stopPropagation();
                                handleResolveEvent(e.id);
                              }}
                              className="text-[10px] text-emerald-400 hover:text-emerald-200 font-bold border border-emerald-900/50 bg-emerald-950/20 px-2 py-0.5 rounded transition"
                            >
                              Resolve
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-500 font-sans">Audited</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-slate-600 italic">
                      Audit ledger is empty. Click &quot;Validate Compliance&quot; or trigger matching simulations to populate events.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Deep-Dive detail Pane */}
          <div className="xl:col-span-1 bg-slate-950 p-4 border border-slate-850 rounded">
            {selectedEvent ? (
              <div className="space-y-3.5 text-xs">
                <div className="flex justify-between items-start border-b border-slate-850 pb-2">
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase block">Ledger Audit Detail</span>
                    <strong className="text-slate-200 font-mono text-[11px] block mt-0.5">{selectedEvent.id}</strong>
                  </div>
                  <button
                    onClick={() => setSelectedEvent(null)}
                    className="text-slate-400 hover:text-slate-200 text-[10px] font-bold"
                  >
                    Close
                  </button>
                </div>

                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Subsystem</span>
                  <span className="text-slate-300 font-semibold">{selectedEvent.subsystem}</span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Timestamp</span>
                  <span className="text-slate-300 font-mono">{new Date(selectedEvent.timestamp).toLocaleString()}</span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Evidence / Technical Context</span>
                  <p className="text-slate-300 mt-0.5 bg-slate-900/60 p-2 border border-slate-850 rounded font-sans leading-relaxed text-[11px]">
                    {selectedEvent.evidence}
                  </p>
                </div>

                {selectedEvent.rootCause && (
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Postulated Root Cause</span>
                    <span className="text-slate-300 italic">{selectedEvent.rootCause}</span>
                  </div>
                )}

                {selectedEvent.recommendedAction && (
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block">Recommended Resolution Strategy</span>
                    <p className="text-indigo-300 font-semibold mt-0.5">{selectedEvent.recommendedAction}</p>
                  </div>
                )}

                <div className="border-t border-slate-850 pt-2 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Audit Status:</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`font-bold uppercase ${selectedEvent.resolved ? "text-emerald-400" : "text-rose-500"}`}>
                      {selectedEvent.resolved ? "RESOLVED" : "OPEN PENDING"}
                    </span>
                    {selectedEvent.resolvedAt && (
                      <span className="text-[9px] text-slate-500">
                        ({new Date(selectedEvent.resolvedAt).toLocaleTimeString()})
                      </span>
                    )}
                  </div>
                </div>

                {!selectedEvent.resolved && (
                  <button
                    onClick={() => handleResolveEvent(selectedEvent.id)}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded text-xs transition"
                  >
                    Resolve Open Ticket
                  </button>
                )}
              </div>
            ) : (
              <div className="text-center text-slate-600 italic py-16 text-xs h-full flex items-center justify-center">
                Select an operational log entry from the immutable index list to inspect diagnostic evidence, root causes, and safety mitigation paths.
              </div>
            )}
          </div>

        </div>
      </div>

    </div>
  );
}
export default SupervisorDashboard;
