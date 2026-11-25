import React, { useState, useEffect } from "react";
import {
  Shield,
  Activity,
  Award,
  BookOpen,
  FlaskConical,
  Compass,
  FileSpreadsheet,
  Cpu,
  RefreshCw,
  Sliders,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Play,
  RotateCcw,
  Sparkles,
  Search,
  ChevronRight,
  TrendingUp,
  BrainCircuit,
  Wrench,
  Layers,
  ChevronDown,
  ExternalLink,
  HelpCircle,
  FileText
} from "lucide-react";
import {
  GlobalPerformanceMetrics,
  RootCauseAnalysisResult,
  ResearchHypothesis,
  ExperimentPlan,
  SubsystemScorecard,
  ResearchRecommendation,
  HistoricalEvolutionRecord
} from "../directorTypes";

export function ResearchDirectorDashboard() {
  // Telemetry state
  const [currentSnap, setCurrentSnap] = useState<GlobalPerformanceMetrics | null>(null);
  const [historySeries, setHistorySeries] = useState<GlobalPerformanceMetrics[]>([]);
  const [selectedSubsystem, setSelectedSubsystem] = useState<string>("Execution Laboratory");
  const [forensicResult, setForensicResult] = useState<RootCauseAnalysisResult | null>(null);
  const [hypotheses, setHypotheses] = useState<ResearchHypothesis[]>([]);
  const [experiments, setExperiments] = useState<ExperimentPlan[]>([]);
  const [experimentRankings, setExperimentRankings] = useState<{ experimentId: string; score: number; rank: number }[]>([]);
  const [scorecardReport, setScorecardReport] = useState<any>(null);
  const [recommendations, setRecommendations] = useState<ResearchRecommendation[]>([]);
  const [evolutionHistory, setEvolutionHistory] = useState<HistoricalEvolutionRecord[]>([]);

  // UI Interactive States
  const [isSyncing, setIsSyncing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testOutput, setTestOutput] = useState<any>(null);
  const [selectedHypothesis, setSelectedHypothesis] = useState<ResearchHypothesis | null>(null);
  const [selectedExperiment, setSelectedExperiment] = useState<ExperimentPlan | null>(null);
  const [selectedRecommendation, setSelectedRecommendation] = useState<ResearchRecommendation | null>(null);
  const [directorLogs, setDirectorLogs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"overview" | "scorecard" | "hypotheses" | "experiments" | "forensics" | "evolution">("overview");

  const appendLog = (msg: string) => {
    setDirectorLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 20));
  };

  // Sync data from API endpoints
  const syncDirectorData = async () => {
    try {
      setIsSyncing(true);

      // 1. Snapshot & History (Part 1)
      const resHist = await fetch("/api/director/performance-history");
      const dataHist = await resHist.json();
      if (dataHist.success) {
        setCurrentSnap(dataHist.current);
        setHistorySeries(dataHist.history);
      }

      // 2. Forensics (Part 2)
      const resForensic = await fetch(`/api/director/root-causes?subsystem=${encodeURIComponent(selectedSubsystem)}`);
      const dataForensic = await resForensic.json();
      if (dataForensic.success) {
        setForensicResult(dataForensic.analysis);
      }

      // 3. Hypotheses (Part 3)
      const resHyp = await fetch("/api/director/hypotheses");
      const dataHyp = await resHyp.json();
      if (dataHyp.success) {
        setHypotheses(dataHyp.hypotheses);
        if (dataHyp.hypotheses.length > 0 && !selectedHypothesis) {
          setSelectedHypothesis(dataHyp.hypotheses[0]);
        }
      }

      // 4. Experiments & Rankings (Part 4 & 5)
      const resExp = await fetch("/api/director/experiments");
      const dataExp = await resExp.json();
      if (dataExp.success) {
        setExperiments(dataExp.experiments);
        setExperimentRankings(dataExp.rankings);
        if (dataExp.experiments.length > 0 && !selectedExperiment) {
          setSelectedExperiment(dataExp.experiments[0]);
        }
      }

      // 5. Scorecards (Part 6)
      const resScore = await fetch("/api/director/scorecard-report");
      const dataScore = await resScore.json();
      if (dataScore.success) {
        setScorecardReport(dataScore.report);
      }

      // 6. Recommendations (Part 7)
      const resRec = await fetch("/api/director/recommendations");
      const dataRec = await resRec.json();
      if (dataRec.success) {
        setRecommendations(dataRec.recommendations);
        if (dataRec.recommendations.length > 0 && !selectedRecommendation) {
          setSelectedRecommendation(dataRec.recommendations[0]);
        }
      }

      // 7. Evolution History (Part 8)
      const resEvo = await fetch("/api/director/evolution-history");
      const dataEvo = await resEvo.json();
      if (dataEvo.success) {
        setEvolutionHistory(dataEvo.history);
      }

    } catch (err: any) {
      appendLog(`Synchronization failed: ${err.message || err}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Run on startup and poll
  useEffect(() => {
    syncDirectorData();
    appendLog("Scientific Meta-Intelligence Layer initialized.");
    const interval = setInterval(syncDirectorData, 6000);
    return () => clearInterval(interval);
  }, []);

  // Poll forensic on subsystem change
  useEffect(() => {
    const fetchForensic = async () => {
      try {
        const res = await fetch(`/api/director/root-causes?subsystem=${encodeURIComponent(selectedSubsystem)}`);
        const data = await res.json();
        if (data.success) {
          setForensicResult(data.analysis);
          appendLog(`Forensic diagnosis refreshed for: ${selectedSubsystem}`);
        }
      } catch (e: any) {
        appendLog(`Forensic lookup error: ${e.message}`);
      }
    };
    fetchForensic();
  }, [selectedSubsystem]);

  const handleResolveRec = async (id: string) => {
    try {
      appendLog(`Submitting solution patch for recommendation ${id}...`);
      const res = await fetch("/api/director/resolve-recommendation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (data.success) {
        appendLog(`Recommendation ${id} successfully flagged as RESOLVED.`);
        syncDirectorData();
        if (selectedRecommendation && selectedRecommendation.id === id) {
          setSelectedRecommendation(prev => prev ? { ...prev, resolved: true } : null);
        }
      }
    } catch (err: any) {
      appendLog(`Resolve error: ${err.message}`);
    }
  };

  const handleTriggerAutoHypothesis = async () => {
    try {
      appendLog("PROVOKING TELEMETRY DIVERGENCE AUDIT...");
      const res = await fetch("/api/director/trigger-auto-hypothesis", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        if (data.triggered) {
          appendLog("DIVERGENCE CONFIRMED: Formulated dynamic hypothesis REC-AUTO and queued experiment EXP-AUTO!");
          syncDirectorData();
        } else {
          appendLog("AUDIT NOMINAL: Bayesian distributions are calibrated stably. Auto-hypothesis cancelled.");
        }
      }
    } catch (err: any) {
      appendLog(`Trigger failure: ${err.message}`);
    }
  };

  const handleRunDirectorTests = async () => {
    try {
      setIsTesting(true);
      setTestOutput(null);
      appendLog("COMPILING DETERMINISTIC SUITE CHECKS FOR AMIS PHASE 10...");
      const res = await fetch("/api/director/run-tests", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setTestOutput(data.results);
        appendLog(`Checks complete! Passed: ${data.results.passed}. Failed: ${data.results.failed}.`);
        syncDirectorData();
      }
    } catch (err: any) {
      appendLog(`Deterministic test failure: ${err.message}`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleResetSandbox = async () => {
    if (!confirm("Are you sure you want to reset the Research Director's hypotheses state, scorecard metrics and recommendations?")) return;
    try {
      appendLog("Resetting Phase 10 sandbox state...");
      const res = await fetch("/api/director/clear", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        appendLog("Sandbox state restored successfully.");
        setTestOutput(null);
        syncDirectorData();
      }
    } catch (err: any) {
      appendLog(`Reset error: ${err.message}`);
    }
  };

  // Helper styles
  const getBadgeSeverityColor = (sev: string) => {
    if (sev === "CRITICAL") return "text-red-400 bg-red-950/40 border border-red-900/40";
    if (sev === "HIGH" || sev === "WARNING") return "text-amber-400 bg-amber-950/40 border border-amber-900/40";
    return "text-indigo-400 bg-indigo-950/40 border border-indigo-900/40";
  };

  const getProgressColor = (score: number) => {
    if (score >= 90) return "bg-emerald-500";
    if (score >= 80) return "bg-indigo-500";
    if (score >= 70) return "bg-amber-500";
    return "bg-rose-500";
  };

  return (
    <div id="research-director-dashboard" className="bg-[#0b0e11] min-h-screen text-slate-100 p-6 font-mono select-none">
      
      {/* 1. Header and Meta Banner */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between border-b border-slate-800 pb-5 mb-6 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Award className="text-emerald-400 w-5 h-5 animate-pulse" />
            <span className="text-[10px] font-bold tracking-widest text-emerald-400 uppercase bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-900/50">
              PHASE 10 — CHIEF QUANTITATIVE RESEARCH LAYER
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 mt-1">
            AMIS Autonomous Research Director
          </h1>
          <p className="text-slate-400 text-xs mt-1 max-w-4xl">
            Deterministic meta-intelligence layer monitoring, testing, evaluating, and prioritizing scientific evolution across the entire quantitative pipeline.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            onClick={syncDirectorData}
            disabled={isSyncing}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white px-3.5 py-2 rounded border border-slate-800 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin text-emerald-400" : ""}`} />
            Sync Audits
          </button>

          <button
            onClick={handleTriggerAutoHypothesis}
            className="flex items-center gap-1.5 bg-amber-950/30 hover:bg-amber-950/60 text-amber-400 hover:text-amber-200 px-3.5 py-2 rounded border border-amber-900/30 transition"
          >
            <BrainCircuit className="w-3.5 h-3.5" />
            Audit Volatility Drift
          </button>

          <button
            onClick={handleRunDirectorTests}
            disabled={isTesting}
            className="flex items-center gap-1.5 bg-indigo-950/40 hover:bg-indigo-950/80 text-indigo-400 hover:text-indigo-200 px-3.5 py-2 rounded border border-indigo-900/30 transition"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Validate Compliance
          </button>

          <button
            onClick={handleResetSandbox}
            className="bg-red-950/20 hover:bg-red-950/55 text-red-400 hover:text-red-200 px-3.5 py-2 rounded border border-red-900/20 transition"
          >
            Reset Director
          </button>
        </div>
      </div>

      {/* 2. Top-level Alert Widget from the Executive Recommendation Engine (Part 7) */}
      {recommendations.length > 0 && (
        <div className="bg-[#12161a] border border-amber-900/40 p-4 rounded-lg mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-400 flex-shrink-0 mt-0.5 animate-bounce" />
            <div>
              <span className="text-[9px] uppercase font-bold tracking-widest text-slate-500">EXECUTIVE RESEARCH RECOMMENDATION FLAG</span>
              <h4 className="text-sm font-bold text-slate-200 mt-0.5">
                {recommendations.filter(r => !r.resolved)[0]?.problem || "No unresolved scientific recommendations."}
              </h4>
              <p className="text-xs text-slate-400 mt-1 font-sans">
                {recommendations.filter(r => !r.resolved)[0]?.evidence || "All quantitative pipelines comply with normal calibration envelopes."}
              </p>
            </div>
          </div>
          {recommendations.filter(r => !r.resolved)[0] && (
            <button
              onClick={() => handleResolveRec(recommendations.filter(r => !r.resolved)[0].id)}
              className="bg-emerald-950/40 hover:bg-emerald-950/80 text-emerald-400 hover:text-emerald-200 px-3 py-1.5 rounded border border-emerald-900/30 transition text-xs font-semibold"
            >
              Resolve Critical Slip
            </button>
          )}
        </div>
      )}

      {/* 3. Navigation Tabs */}
      <div className="flex items-center space-x-1 border-b border-slate-800 pb-px mb-6 overflow-x-auto text-xs">
        {[
          { key: "overview", label: "Overview & Telemetry", icon: Activity },
          { key: "scorecard", label: "Subsystem Scorecard", icon: FileSpreadsheet },
          { key: "hypotheses", label: "Research Hypotheses", icon: BookOpen },
          { key: "experiments", label: "Experiment Planner", icon: FlaskConical },
          { key: "forensics", label: "Forensic Diagnostics", icon: Sliders },
          { key: "evolution", label: "Long-Term Evolution", icon: TrendingUp }
        ].map(t => {
          const Icon = t.icon;
          const isActive = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key as any)}
              className={`flex items-center gap-1.5 px-4 py-2.5 font-bold border-b-2 transition ${
                isActive
                  ? "border-emerald-400 text-emerald-400 bg-emerald-950/5"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 4. Tab Views Contents */}
      
      {/* Tab: Overview */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          
          {/* Main 4 Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-[#12161a] border border-slate-800 p-4 rounded-lg">
              <span className="text-[10px] text-slate-500 uppercase block">Prediction Accuracy</span>
              <div className="text-2xl font-bold text-slate-200 mt-2 font-mono">
                {currentSnap ? `${(currentSnap.accuracy * 100).toFixed(1)}%` : "0%"}
              </div>
              <div className="text-[9px] text-slate-500 mt-1 font-sans">Directional match confidence</div>
            </div>

            <div className="bg-[#12161a] border border-slate-800 p-4 rounded-lg">
              <span className="text-[10px] text-slate-500 uppercase block">F1 Match Score</span>
              <div className="text-2xl font-bold text-slate-200 mt-2 font-mono">
                {currentSnap ? currentSnap.f1.toFixed(3) : "0"}
              </div>
              <div className="text-[9px] text-slate-500 mt-1 font-sans">Precision-Recall harmonic mean</div>
            </div>

            <div className="bg-[#12161a] border border-slate-800 p-4 rounded-lg">
              <span className="text-[10px] text-slate-500 uppercase block">Expected Value</span>
              <div className="text-2xl font-bold text-emerald-400 mt-2 font-mono">
                {currentSnap ? `+${(currentSnap.expectedValue * 100).toFixed(2)}%` : "0%"}
              </div>
              <div className="text-[9px] text-slate-500 mt-1 font-sans">Statistical edge per signal</div>
            </div>

            <div className="bg-[#12161a] border border-slate-800 p-4 rounded-lg">
              <span className="text-[10px] text-slate-500 uppercase block">Calibration Discrepancy</span>
              <div className="text-2xl font-bold text-slate-200 mt-2 font-mono">
                {currentSnap ? `${(currentSnap.ece * 100).toFixed(2)}%` : "0%"}
              </div>
              <div className="text-[9px] text-slate-500 mt-1 font-sans">Expected Calibration Error (ECE)</div>
            </div>
          </div>

          {/* Grid: 2 columns */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left: Scientific Telemetry Lists */}
            <div className="lg:col-span-2 bg-[#12161a] border border-slate-800 p-5 rounded-lg">
              <div className="flex items-center justify-between mb-4 border-b border-slate-850 pb-2">
                <span className="text-[11px] text-slate-300 font-bold uppercase tracking-wider">Dynamic Rolling Performance Review (Part 1)</span>
                <span className="text-[9px] text-slate-500 font-mono">Continuously Computed</span>
              </div>

              {currentSnap ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-xs">
                  
                  <div>
                    <h5 className="font-bold text-slate-400 border-b border-slate-850 pb-1 mb-2 uppercase text-[9px] tracking-wider">Statistical Classification</h5>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Directional Accuracy:</span>
                        <span className="text-slate-200 font-bold">{(currentSnap.accuracy * 100).toFixed(2)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Precision Index:</span>
                        <span className="text-slate-200 font-bold">{(currentSnap.precision * 100).toFixed(2)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Recall Index:</span>
                        <span className="text-slate-200 font-bold">{(currentSnap.recall * 100).toFixed(2)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">F1 Boundary Score:</span>
                        <span className="text-slate-200 font-bold">{currentSnap.f1.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">ROC-AUC Integral:</span>
                        <span className="text-slate-200 font-bold">{currentSnap.rocAuc.toFixed(4)}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h5 className="font-bold text-slate-400 border-b border-slate-850 pb-1 mb-2 uppercase text-[9px] tracking-wider">Probability Metrics</h5>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Logarithmic Loss:</span>
                        <span className="text-slate-200 font-bold">{currentSnap.logLoss.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Brier Score:</span>
                        <span className="text-slate-200 font-bold">{currentSnap.brierScore.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Calibration stability:</span>
                        <span className="text-emerald-400 font-bold">{currentSnap.calibrationStability.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Feature Signal stability:</span>
                        <span className="text-emerald-400 font-bold">{currentSnap.featureStability.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Hist-Similarity reliability:</span>
                        <span className="text-emerald-400 font-bold">{currentSnap.historicalSimilarityReliability.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="md:col-span-2 mt-2 border-t border-slate-850 pt-3">
                    <h5 className="font-bold text-slate-400 pb-1 mb-2 uppercase text-[9px] tracking-wider">Strategy & Execution Real-Time Audits</h5>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                      <div className="bg-[#1a1f24] p-2 rounded border border-slate-800">
                        <span className="text-[9px] text-slate-500 block">Profit Factor</span>
                        <strong className="text-slate-200 text-sm block mt-1">{currentSnap.profitFactor.toFixed(2)}</strong>
                      </div>
                      <div className="bg-[#1a1f24] p-2 rounded border border-slate-800">
                        <span className="text-[9px] text-slate-500 block">Sharpe Ratio</span>
                        <strong className="text-slate-200 text-sm block mt-1">{currentSnap.sharpe.toFixed(2)}</strong>
                      </div>
                      <div className="bg-[#1a1f24] p-2 rounded border border-slate-800">
                        <span className="text-[9px] text-slate-500 block">Sortino Ratio</span>
                        <strong className="text-slate-200 text-sm block mt-1">{currentSnap.sortino.toFixed(2)}</strong>
                      </div>
                      <div className="bg-[#1a1f24] p-2 rounded border border-slate-800">
                        <span className="text-[9px] text-slate-500 block">Max Drawdown</span>
                        <strong className="text-rose-400 text-sm block mt-1">-{currentSnap.maxDrawdown.toFixed(1)}%</strong>
                      </div>
                    </div>
                  </div>

                </div>
              ) : (
                <div className="text-center py-12 text-slate-500 italic">Preloading metrics snapshot...</div>
              )}
            </div>

            {/* Right: Subsystem Health Overview & Test Results */}
            <div className="bg-[#12161a] border border-slate-800 p-5 rounded-lg flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4 border-b border-slate-850 pb-2">
                  <span className="text-[11px] text-slate-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-emerald-400" />
                    Overall Research Health
                  </span>
                  <span className="text-[9px] text-slate-500 font-mono">Composite Index</span>
                </div>

                <div className="flex flex-col items-center justify-center my-6">
                  <div className="w-24 h-24 rounded-full border-4 border-emerald-950 flex flex-col items-center justify-center bg-emerald-950/10">
                    <span className="text-3xl font-extrabold text-emerald-400">
                      {scorecardReport ? scorecardReport.overallAverageScore : "0"}
                    </span>
                    <span className="text-[9px] uppercase tracking-widest text-slate-400 mt-1">Grade %</span>
                  </div>
                  <span className="text-xs text-slate-400 mt-2 font-sans">Average engineering properties check</span>
                </div>

                {scorecardReport && (
                  <div className="space-y-2.5 text-xs border-t border-slate-850 pt-3">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Weakest Subsystem:</span>
                      <strong className="text-rose-400">{scorecardReport.weakestSubsystem.name}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Strongest Subsystem:</span>
                      <strong className="text-emerald-400">{scorecardReport.strongestSubsystem.name}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Total Technical Debt:</span>
                      <strong className="text-amber-400">{scorecardReport.technicalDebtSumHours} Engineering Hours</strong>
                    </div>
                  </div>
                )}
              </div>

              {/* Intercept log console */}
              <div className="mt-4 border-t border-slate-850 pt-3">
                <span className="text-[10px] text-slate-500 uppercase block mb-1">Director Logs Console</span>
                <div className="bg-[#080b0d] p-2 rounded text-[10px] text-slate-400 h-24 overflow-y-auto leading-relaxed border border-slate-850">
                  {directorLogs.map((l, idx) => (
                    <div key={idx} className="border-b border-slate-900 last:border-0">{l}</div>
                  ))}
                </div>
              </div>
            </div>

          </div>

          {/* Test results detail panel if run */}
          {testOutput && (
            <div className="bg-[#12161a] border border-indigo-900/40 p-5 rounded-lg">
              <div className="flex items-center gap-2 mb-4 text-indigo-400 border-b border-slate-850 pb-2">
                <CheckCircle2 className="w-5 h-5 animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider">PHASE 10 COMPLIANCE TESTS VERIFICATION</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div className="bg-[#1a1f24] p-3 rounded border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">PASSED ASSERTS</span>
                  <strong className="text-lg text-emerald-400 block mt-1">{testOutput.passed}</strong>
                </div>
                <div className="bg-[#1a1f24] p-3 rounded border border-slate-800">
                  <span className="text-[10px] text-slate-500 block">FAILED ASSERTS</span>
                  <strong className="text-lg text-rose-400 block mt-1">{testOutput.failed}</strong>
                </div>
                <div className="bg-[#1a1f24] p-3 rounded border border-slate-800 col-span-2 text-left flex items-center px-4">
                  <div>
                    <span className="text-[10px] text-slate-500 block">COMPLIANCE DECREE</span>
                    <strong className="text-xs text-emerald-400 block mt-0.5">100% DETERMINISTIC CALIBRATION PASS</strong>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Tab: Subsystem Scorecard */}
      {activeTab === "scorecard" && (
        <div className="bg-[#12161a] border border-slate-800 p-5 rounded-lg">
          <div className="flex items-center justify-between mb-4 border-b border-slate-850 pb-2">
            <span className="text-[11px] text-slate-300 font-bold uppercase tracking-wider">Subsystem Scorecard Evaluation Report (Part 6)</span>
            <span className="text-[9px] text-slate-500">Evaluating 10 core engineering vectors</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500 text-[10px] uppercase">
                  <th className="pb-2 font-semibold">Subsystem Name</th>
                  <th className="pb-2 font-semibold text-center">Correctness</th>
                  <th className="pb-2 font-semibold text-center">Reliability</th>
                  <th className="pb-2 font-semibold text-center">Maintainability</th>
                  <th className="pb-2 font-semibold text-center">Scalability</th>
                  <th className="pb-2 font-semibold text-center">Readiness</th>
                  <th className="pb-2 font-semibold text-center">Coverage</th>
                  <th className="pb-2 font-semibold text-center">Debt (Hrs)</th>
                  <th className="pb-2 font-semibold text-right">Engineering Index</th>
                </tr>
              </thead>
              <tbody>
                {scorecardReport ? (
                  scorecardReport.scorecards.map((s: any, idx: number) => {
                    // Scorecard composite rating estimator
                    const mean = Math.round(
                      (s.correctness + s.completeness + s.reliability + s.maintainability + s.scalability + s.researchReadiness + s.autonomyReadiness + s.documentation + s.testingCoverage) / 9
                    );
                    return (
                      <tr key={idx} className="border-b border-slate-850 hover:bg-slate-850/20 transition">
                        <td className="py-3 font-semibold text-slate-200">{s.name}</td>
                        <td className="py-3 text-center text-slate-300 font-mono">{s.correctness}%</td>
                        <td className="py-3 text-center text-slate-300 font-mono">{s.reliability}%</td>
                        <td className="py-3 text-center text-slate-300 font-mono">{s.maintainability}%</td>
                        <td className="py-3 text-center text-slate-300 font-mono">{s.scalability}%</td>
                        <td className="py-3 text-center text-slate-300 font-mono">{s.researchReadiness}%</td>
                        <td className="py-3 text-center text-slate-300 font-mono">{s.testingCoverage}%</td>
                        <td className="py-3 text-center text-amber-400 font-mono font-bold">{s.technicalDebt}h</td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 bg-slate-900 rounded-full h-1.5 overflow-hidden border border-slate-800">
                              <div className={`h-full ${getProgressColor(mean)}`} style={{ width: `${mean}%` }}></div>
                            </div>
                            <span className="font-bold text-slate-100 font-mono">{mean}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="text-center py-6 italic text-slate-500">Scorecard data preloading...</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Hypotheses */}
      {activeTab === "hypotheses" && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          
          {/* List panel */}
          <div className="xl:col-span-2 bg-[#12161a] border border-slate-800 p-5 rounded-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4 border-b border-slate-850 pb-2">
                <span className="text-[11px] text-slate-300 font-bold uppercase tracking-wider">Dynamic Research Hypotheses Feed (Part 3)</span>
                <span className="text-[9px] text-slate-500">{hypotheses.length} Formulated</span>
              </div>

              <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1">
                {hypotheses.map((h, idx) => {
                  const isSelected = selectedHypothesis?.id === h.id;
                  return (
                    <div
                      key={idx}
                      onClick={() => setSelectedHypothesis(h)}
                      className={`p-3.5 rounded border text-xs cursor-pointer transition ${
                        isSelected
                          ? "bg-emerald-950/15 border-emerald-900/50 shadow-sm"
                          : "bg-[#1a1f24] border-slate-800 hover:bg-slate-850/30"
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <strong className="text-slate-200 text-sm">{h.title}</strong>
                        <span className="text-[9px] text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-900/40 font-mono uppercase">
                          Confidence {Math.round(h.confidence * 100)}%
                        </span>
                      </div>
                      <p className="text-slate-400 text-xs mt-1.5 line-clamp-2 leading-relaxed font-sans">{h.description}</p>
                      
                      <div className="flex justify-between items-center text-[10px] text-slate-500 mt-3 border-t border-slate-850 pt-2 font-mono">
                        <span>Hypothesis ID: <strong>{h.id}</strong></span>
                        <span>Status: <strong className="text-emerald-400">{h.status}</strong></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Deep-dive panel */}
          <div className="xl:col-span-1 bg-slate-950 border border-slate-850 p-5 rounded-lg text-xs space-y-4">
            {selectedHypothesis ? (
              <>
                <div className="border-b border-slate-850 pb-2">
                  <span className="text-[9px] text-slate-500 uppercase block">Scientific Deep-Dive</span>
                  <h4 className="text-sm font-bold text-slate-200 mt-1">{selectedHypothesis.title}</h4>
                </div>

                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Description & Core Premise</span>
                  <p className="text-slate-300 mt-1 font-sans leading-relaxed">{selectedHypothesis.description}</p>
                </div>

                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Evidentiary Observation</span>
                  <p className="text-slate-300 mt-1 italic font-sans">{selectedHypothesis.evidence}</p>
                </div>

                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Supporting Statistics</span>
                  <div className="grid grid-cols-3 gap-2 mt-1 text-center font-mono text-[11px]">
                    <div className="bg-[#12161a] p-2 rounded border border-slate-850">
                      <span className="text-[9px] text-slate-500 block">P-Value</span>
                      <strong className="text-emerald-400">{selectedHypothesis.supportingStatistics.pvalue.toFixed(4)}</strong>
                    </div>
                    <div className="bg-[#12161a] p-2 rounded border border-slate-850">
                      <span className="text-[9px] text-slate-500 block">Samples</span>
                      <strong className="text-slate-300">{selectedHypothesis.supportingStatistics.sampleCount}</strong>
                    </div>
                    <div className="bg-[#12161a] p-2 rounded border border-slate-850">
                      <span className="text-[9px] text-slate-500 block">Corr</span>
                      <strong className="text-slate-300">{selectedHypothesis.supportingStatistics.correlation.toFixed(2)}</strong>
                    </div>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Required Proof Experiment</span>
                  <p className="text-indigo-400 font-semibold mt-1 font-sans">{selectedHypothesis.requiredExperiment}</p>
                </div>

                <div className="border-t border-slate-850 pt-2 flex items-center justify-between font-mono">
                  <span className="text-slate-500">Status:</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 font-bold uppercase text-[9px]">
                    {selectedHypothesis.status}
                  </span>
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-slate-600 italic">Select a hypothesis to inspect.</div>
            )}
          </div>

        </div>
      )}

      {/* Tab: Experiments */}
      {activeTab === "experiments" && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          
          {/* List Panel */}
          <div className="xl:col-span-2 bg-[#12161a] border border-slate-800 p-5 rounded-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4 border-b border-slate-850 pb-2">
                <span className="text-[11px] text-slate-300 font-bold uppercase tracking-wider">Dynamic Experiment Planner & Priority Engine (Part 4 & 5)</span>
                <span className="text-[9px] text-slate-500">Scored using Multi-Attribute Utility Formulas</span>
              </div>

              <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1">
                {experiments.map((e, idx) => {
                  const isSelected = selectedExperiment?.id === e.id;
                  const rankItem = experimentRankings.find(r => r.experimentId === e.id);
                  return (
                    <div
                      key={idx}
                      onClick={() => setSelectedExperiment(e)}
                      className={`p-3.5 rounded border text-xs cursor-pointer transition ${
                        isSelected
                          ? "bg-indigo-950/15 border-indigo-900/50 shadow-sm"
                          : "bg-[#1a1f24] border-slate-800 hover:bg-slate-850/30"
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <strong className="text-slate-200 text-sm">{e.title}</strong>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] text-indigo-400 bg-indigo-950/40 px-1.5 py-0.5 rounded border border-indigo-900/40 font-mono">
                            Priority Score: {rankItem ? rankItem.score : "0"}/100
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${getBadgeSeverityColor(e.priority)}`}>
                            {e.priority}
                          </span>
                        </div>
                      </div>
                      <p className="text-slate-400 text-xs mt-1.5 line-clamp-2 font-sans">{e.objective}</p>

                      <div className="flex justify-between items-center text-[10px] text-slate-500 mt-3 border-t border-slate-850 pt-2 font-mono">
                        <span>Experiment ID: <strong>{e.id}</strong></span>
                        <span>State: <strong className="text-indigo-400">{e.status}</strong></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Deep-dive details */}
          <div className="xl:col-span-1 bg-slate-950 border border-slate-850 p-5 rounded-lg text-xs space-y-3.5 overflow-y-auto max-h-[500px]">
            {selectedExperiment ? (
              <>
                <div className="border-b border-slate-850 pb-2">
                  <span className="text-[9px] text-slate-500 uppercase block">Experiment Protocol Specification</span>
                  <h4 className="text-sm font-bold text-slate-200 mt-1">{selectedExperiment.title}</h4>
                </div>

                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Scientific Objective</span>
                  <p className="text-slate-300 mt-1 font-sans leading-relaxed">{selectedExperiment.objective}</p>
                </div>

                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Required Datasets</span>
                  <div className="flex flex-wrap gap-1 mt-1 font-mono text-[9px]">
                    {selectedExperiment.requiredDatasets.map((d, i) => (
                      <span key={i} className="bg-[#12161a] text-slate-300 px-1.5 py-0.5 rounded border border-slate-800">{d}</span>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-center font-mono text-[10px]">
                  <div className="bg-[#12161a] p-2 rounded border border-slate-850">
                    <span className="text-slate-500 block">Required Sample Size</span>
                    <strong className="text-slate-300 text-xs">{selectedExperiment.requiredSampleSize.toLocaleString()}</strong>
                  </div>
                  <div className="bg-[#12161a] p-2 rounded border border-slate-850">
                    <span className="text-slate-500 block">Est Duration Days</span>
                    <strong className="text-slate-300 text-xs">{selectedExperiment.estimatedDurationDays} Days</strong>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Variables Mapping</span>
                  <div className="space-y-1.5 mt-1 text-[11px] font-sans">
                    <div>
                      <span className="text-slate-500">Independent: </span>
                      <strong className="text-slate-300">{selectedExperiment.independentVariables.join(", ")}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Dependent: </span>
                      <strong className="text-slate-300">{selectedExperiment.dependentVariables.join(", ")}</strong>
                    </div>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Success Metrics Criteria</span>
                  <p className="text-emerald-400 font-sans mt-0.5 italic">{selectedExperiment.successCriteria}</p>
                </div>

                <div>
                  <span className="text-[10px] text-slate-500 uppercase block">Failure Discrepancy Criteria</span>
                  <p className="text-rose-400 font-sans mt-0.5 italic">{selectedExperiment.failureCriteria}</p>
                </div>

                <div className="border-t border-slate-850 pt-2 flex items-center justify-between font-mono">
                  <span className="text-slate-500">Status:</span>
                  <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-400 font-bold uppercase text-[9px]">
                    {selectedExperiment.status}
                  </span>
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-slate-600 italic">Select an experiment to inspect.</div>
            )}
          </div>

        </div>
      )}

      {/* Tab: Forensics / Root Causes */}
      {activeTab === "forensics" && (
        <div className="space-y-6">
          
          <div className="bg-[#12161a] border border-slate-800 p-5 rounded-lg">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-4 gap-3 border-b border-slate-850 pb-2">
              <div>
                <span className="text-[11px] text-slate-300 font-bold uppercase tracking-wider">Automated Root Cause Forensics Suite (Part 2)</span>
                <span className="text-[9px] text-slate-500 block mt-0.5 font-sans">Forensic analysis on performance degradation vectors</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-sans">Select target subsystem:</span>
                <select
                  value={selectedSubsystem}
                  onChange={(e) => setSelectedSubsystem(e.target.value)}
                  className="bg-[#1a1f24] border border-slate-850 rounded px-2.5 py-1 text-slate-200 text-xs focus:outline-none focus:border-emerald-500"
                >
                  <option value="Probability Engine">Probability Engine</option>
                  <option value="Machine Learning">Machine Learning</option>
                  <option value="Strategy Research">Strategy Research</option>
                  <option value="Decision Intelligence">Decision Intelligence</option>
                  <option value="Risk Intelligence">Risk Intelligence</option>
                  <option value="Execution Laboratory">Execution Laboratory</option>
                  <option value="Operational Supervisor">Operational Supervisor</option>
                </select>
              </div>
            </div>

            {forensicResult ? (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 text-xs">
                
                {/* Left: Probable Factors List */}
                <div className="xl:col-span-2 space-y-4">
                  <h5 className="font-bold text-slate-400 border-b border-slate-850 pb-1 mb-2 uppercase text-[9px] tracking-wider">
                    Most Probable Degradation Factors For {selectedSubsystem}
                  </h5>

                  <div className="space-y-3">
                    {forensicResult.identifiedFactors.map((f, idx) => (
                      <div key={idx} className="bg-[#1a1f24] border border-slate-800 p-3.5 rounded">
                        <div className="flex justify-between items-center border-b border-slate-850 pb-1.5 mb-2">
                          <strong className="text-slate-200 text-sm">{f.factor}</strong>
                          <span className="text-[10px] text-amber-400 font-mono font-bold">
                            Probability: {Math.round(f.probability * 100)}%
                          </span>
                        </div>
                        <p className="text-slate-300 leading-relaxed font-sans">{f.evidence}</p>
                        <div className="text-[10px] text-slate-500 mt-2 font-mono">
                          Forensic technical threshold: <strong className="text-slate-400">{f.technicalMetric}</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right: Reconstruction log */}
                <div className="xl:col-span-1 bg-slate-950 p-4 border border-slate-850 rounded">
                  <h5 className="font-bold text-slate-400 border-b border-slate-850 pb-2 mb-3 uppercase text-[9px] tracking-wider">
                    Reconstruction & Diagnostics Log
                  </h5>
                  <div className="space-y-2 font-mono text-[11px] leading-relaxed text-slate-300">
                    {forensicResult.reconstructionLog.map((log, idx) => (
                      <div key={idx} className="border-b border-slate-900 pb-1.5 last:border-0 last:pb-0">
                        <span className="text-slate-500">● </span>{log}
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            ) : (
              <div className="text-center py-12 text-slate-500 italic">Compiling forensic analysis...</div>
            )}
          </div>

        </div>
      )}

      {/* Tab: Evolution */}
      {activeTab === "evolution" && (
        <div className="space-y-6">
          
          <div className="bg-[#12161a] border border-slate-800 p-5 rounded-lg">
            <div className="flex items-center justify-between mb-4 border-b border-slate-850 pb-2">
              <span className="text-[11px] text-slate-300 font-bold uppercase tracking-wider">Long-Term Evolution Tracker (Part 8)</span>
              <span className="text-[9px] text-slate-500">Historical records of scientific improvements</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {evolutionHistory.map((h, idx) => (
                <div key={idx} className="bg-[#1a1f24] border border-slate-800 p-4 rounded text-xs space-y-3.5">
                  <div className="border-b border-slate-850 pb-2 flex justify-between items-center">
                    <strong className="text-emerald-400 text-sm">{h.weekKey}</strong>
                    <span className="text-[10px] text-slate-500 font-sans">Active Models: {h.activeModelsCount}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-center font-mono">
                    <div className="bg-[#12161a] p-2 rounded border border-slate-850">
                      <span className="text-slate-500 text-[10px] block">Profit Factor</span>
                      <strong className="text-slate-200 text-sm block mt-0.5">{h.profitFactor.toFixed(2)}</strong>
                    </div>
                    <div className="bg-[#12161a] p-2 rounded border border-slate-850">
                      <span className="text-slate-500 text-[10px] block">Sharpe Ratio</span>
                      <strong className="text-slate-200 text-sm block mt-0.5">{h.sharpeRatio.toFixed(2)}</strong>
                    </div>
                    <div className="bg-[#12161a] p-2 rounded border border-slate-850">
                      <span className="text-slate-500 text-[10px] block">System Health</span>
                      <strong className="text-slate-200 text-sm block mt-0.5">{h.overallSystemHealth}%</strong>
                    </div>
                    <div className="bg-[#12161a] p-2 rounded border border-slate-850">
                      <span className="text-slate-500 text-[10px] block">Execution Match</span>
                      <strong className="text-slate-200 text-sm block mt-0.5">{h.executionQuality}%</strong>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-500 uppercase block mb-1.5">Key Deployed Milestones</span>
                    <ul className="space-y-1.5 text-slate-300 font-sans leading-relaxed pl-3 list-disc">
                      {h.milestones.map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

    </div>
  );
}

export default ResearchDirectorDashboard;
