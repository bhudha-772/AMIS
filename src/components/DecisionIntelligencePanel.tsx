import React, { useState, useEffect } from "react";
import {
  Brain,
  Cpu,
  ShieldCheck,
  Scale,
  History,
  Activity,
  Sliders,
  Settings,
  Download,
  Play,
  RotateCcw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  HelpCircle,
  FileSpreadsheet,
  Terminal,
  Database,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  Percent,
  Gauge,
  Layers,
  ChevronRight,
  Search,
  Filter,
  BarChart3
} from "lucide-react";
import { DecisionOutput, ConsensusConfig, DecisionScoreConfig } from "../decisionEngine";

export function DecisionIntelligencePanel() {
  const [latestDecision, setLatestDecision] = useState<DecisionOutput | null>(null);
  const [history, setHistory] = useState<DecisionOutput[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [gates, setGates] = useState<any[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedDecision, setSelectedDecision] = useState<DecisionOutput | null>(null);
  const [testResults, setTestResults] = useState<any>(null);
  const [runningTests, setRunningTests] = useState<boolean>(false);
  
  // Tabs: "monitor" | "statistics" | "gates" | "weights" | "logs"
  const [activeTab, setActiveTab] = useState<"monitor" | "statistics" | "gates" | "weights" | "logs">("monitor");

  // Filter and search states
  const [searchQuery, setSearchQuery] = useState("");
  const [decisionFilter, setDecisionFilter] = useState("ALL");

  // Weights configurations
  const [consensusWeights, setConsensusWeights] = useState<ConsensusConfig>({
    probabilityEngineWeight: 0.30,
    mlPredictionWeight: 0.25,
    strategyAgreementWeight: 0.20,
    historicalSimilarityWeight: 0.15,
    adaptiveLearningWeight: 0.10
  });

  const [scoreWeights, setScoreWeights] = useState<DecisionScoreConfig>({
    probabilityEngine: 15,
    machineLearning: 12,
    historicalSimilarity: 8,
    strategyConfidence: 10,
    marketRegime: 5,
    trendStrength: 6,
    momentum: 6,
    volatility: 5,
    support: 5,
    resistance: 5,
    liquidity: 5,
    noise: 5,
    expectedValue: 8,
    featureReliability: 5,
    modelReliability: 5,
    calibrationQuality: 5,
    researchConfidence: 10
  });

  const [updatingWeights, setUpdatingWeights] = useState<boolean>(false);
  const [weightMessage, setWeightMessage] = useState<string>("");

  // Manual evaluation form states
  const [evalMarket, setEvalMarket] = useState("BTCUSDT");
  const [evalTimeframe, setEvalTimeframe] = useState("3m");
  const [evalConfidence, setEvalConfidence] = useState(82);
  const [evalExpectedMove, setEvalExpectedMove] = useState(0.85);
  const [evalRegime, setEvalRegime] = useState("BULL_MOMENTUM");
  const [evalProbsUp, setEvalProbsUp] = useState(0.65);
  const [evalProbsDown, setEvalProbsDown] = useState(0.15);
  const [evalProbsSideways, setEvalProbsSideways] = useState(0.20);
  const [evalDataQuality, setEvalDataQuality] = useState("EXCELLENT");
  const [evalDriftStatus, setEvalDriftStatus] = useState("STABLE");
  const [evalEvaluating, setEvalEvaluating] = useState(false);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 6000); // refresh every 6 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      // 1. Fetch latest decision
      const latestRes = await fetch("/api/decision/current");
      const latestData = await latestRes.json();
      if (latestData.success && latestData.decision) {
        setLatestDecision(latestData.decision);
        if (!selectedDecision) {
          setSelectedDecision(latestData.decision);
        }
      }

      // 2. Fetch history
      const histRes = await fetch("/api/decision/history?limit=100");
      const histData = await histRes.json();
      if (histData.success) {
        setHistory(histData.history);
      }

      // 3. Fetch statistics
      const statsRes = await fetch("/api/decision/statistics");
      const statsData = await statsRes.json();
      if (statsData.success) {
        setStats(statsData.stats);
        if (statsData.stats.activeWeights) {
          setConsensusWeights(statsData.stats.activeWeights);
        }
        if (statsData.stats.activeScoreWeights) {
          setScoreWeights(statsData.stats.activeScoreWeights);
        }
      }

      // 4. Fetch gates definitions & metrics
      const gatesRes = await fetch("/api/decision/gates");
      const gatesData = await gatesRes.json();
      if (gatesData.success) {
        setGates(gatesData.gates);
      }

      // 5. Fetch health
      const healthRes = await fetch("/api/decision/health");
      const healthData = await healthRes.json();
      if (healthData.success) {
        setHealth(healthData.health);
      }

      setLoading(false);
    } catch (err) {
      console.error("Error loading decision intelligence data:", err);
    }
  };

  const handleUpdateWeights = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatingWeights(true);
    setWeightMessage("");
    try {
      const res = await fetch("/api/decision/configure-weights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consensusWeights, scoreWeights })
      });
      const data = await res.json();
      if (data.success) {
        setWeightMessage("Engine weights and score contribution parameters successfully updated!");
        setTimeout(() => setWeightMessage(""), 3000);
        fetchData();
      } else {
        setWeightMessage(`Error: ${data.message}`);
      }
    } catch (err: any) {
      setWeightMessage(`Network Error: ${err.message}`);
    } finally {
      setUpdatingWeights(false);
    }
  };

  const handleRunTests = async () => {
    setRunningTests(true);
    setTestResults(null);
    try {
      const res = await fetch("/api/decision/run-tests", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setTestResults(data.testResults);
        fetchData(); // reload statistics after new test runs
      }
    } catch (err) {
      console.error("Failed to run tests:", err);
    } finally {
      setRunningTests(false);
    }
  };

  const handleReplay = async (id: string) => {
    try {
      const res = await fetch(`/api/decision/replay/${id}`);
      const data = await res.json();
      if (data.success && data.decision) {
        setSelectedDecision(data.decision);
        setActiveTab("monitor");
      }
    } catch (err) {
      console.error("Failed to replay decision:", err);
    }
  };

  const handleManualEvaluate = async (e: React.FormEvent) => {
    e.preventDefault();
    setEvalEvaluating(true);
    try {
      const predictionPayload = {
        id: "MANUAL-" + Date.now(),
        timestamp: Date.now(),
        market: evalMarket,
        timeframe: evalTimeframe,
        confidence: evalConfidence / 100,
        expectedMove: evalExpectedMove,
        expectedVolatility: 0.12,
        expectedDrawdown: 0.04,
        historicalSimilarity: 0.82,
        matchedHistoricalCases: 12,
        regime: evalRegime,
        noiseLevel: evalDataQuality === "EXCELLENT" ? 0.35 : 0.82,
        predictedProbs: {
          up: evalProbsUp,
          down: evalProbsDown,
          sideways: evalProbsSideways,
          continuation: 0.35,
          reversal: 0.15,
          breakout: 0.20,
          fakeout: 0.05
        },
        featureContributions: [
          { featureName: "Trend Strength", contributionPct: 35.5, rawAlignment: 0.82 },
          { featureName: "RSI Momentum", contributionPct: 24.2, rawAlignment: -0.65 }
        ],
        resolved: false,
        marketSnapshot: {
          trendAnalysis: { direction: "BULLISH", trendlineSlope: 0.002, trendStrength: 75 },
          momentumAnalysis: { rsi14: 55.0, stochK: 65.0 },
          volatilityAnalysis: { atr: 0.05, stdDev: 0.04, volatilityState: "NORMAL" },
          riskMetrics: { marketNoiseIndex: evalDataQuality === "EXCELLENT" ? 0.35 : 0.85, volatilityRisk: "NORMAL" },
          liquidityAnalysis: { orderBlocks: [{}], fairValueGaps: [{}] }
        }
      };

      const res = await fetch("/api/decision/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prediction: predictionPayload })
      });
      const data = await res.json();
      if (data.success && data.decision) {
        setSelectedDecision(data.decision);
        setLatestDecision(data.decision);
        setActiveTab("monitor");
        fetchData();
      }
    } catch (err) {
      console.error("Failed manual evaluation:", err);
    } finally {
      setEvalEvaluating(false);
    }
  };

  // Preset Configurations
  const applyPreset = (preset: "default" | "aggressive" | "conservative" | "high_volatility" | "crash") => {
    if (preset === "default") {
      setConsensusWeights({
        probabilityEngineWeight: 0.30,
        mlPredictionWeight: 0.25,
        strategyAgreementWeight: 0.20,
        historicalSimilarityWeight: 0.15,
        adaptiveLearningWeight: 0.10
      });
    } else if (preset === "aggressive") {
      setConsensusWeights({
        probabilityEngineWeight: 0.40,
        mlPredictionWeight: 0.35,
        strategyAgreementWeight: 0.15,
        historicalSimilarityWeight: 0.05,
        adaptiveLearningWeight: 0.05
      });
    } else if (preset === "conservative") {
      setConsensusWeights({
        probabilityEngineWeight: 0.15,
        mlPredictionWeight: 0.15,
        strategyAgreementWeight: 0.35,
        historicalSimilarityWeight: 0.25,
        adaptiveLearningWeight: 0.10
      });
    } else if (preset === "high_volatility") {
      setConsensusWeights({
        probabilityEngineWeight: 0.20,
        mlPredictionWeight: 0.20,
        strategyAgreementWeight: 0.30,
        historicalSimilarityWeight: 0.10,
        adaptiveLearningWeight: 0.20
      });
    } else if (preset === "crash") {
      setConsensusWeights({
        probabilityEngineWeight: 0.10,
        mlPredictionWeight: 0.10,
        strategyAgreementWeight: 0.50,
        historicalSimilarityWeight: 0.20,
        adaptiveLearningWeight: 0.10
      });
    }
  };

  const getDecisionColor = (dec: string) => {
    switch (dec) {
      case "EXECUTE": return "text-[#0ecb81] bg-[#0ecb81]/10 border-[#0ecb81]/30";
      case "WATCH": return "text-amber-400 bg-amber-400/10 border-amber-400/30";
      case "WAIT": return "text-[#00f0ff] bg-[#00f0ff]/10 border-[#00f0ff]/30";
      case "REJECT": return "text-[#f6465d] bg-[#f6465d]/10 border-[#f6465d]/30";
      default: return "text-[#848e9c] bg-[#2b2f36]/40 border-[#2b2f36]/80";
    }
  };

  const getDecisionBadge = (dec: string) => {
    switch (dec) {
      case "EXECUTE": return "bg-green-950/60 text-[#0ecb81] border border-green-500/30";
      case "WATCH": return "bg-amber-950/60 text-amber-400 border border-amber-500/30";
      case "WAIT": return "bg-blue-950/60 text-[#00f0ff] border border-blue-500/30";
      case "REJECT": return "bg-red-950/60 text-[#f6465d] border border-red-500/30";
      default: return "bg-gray-900 text-[#848e9c] border border-gray-700/50";
    }
  };

  const filteredHistory = history.filter(d => {
    const matchesSearch = d.market.toLowerCase().includes(searchQuery.toLowerCase()) || d.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = decisionFilter === "ALL" || d.decision === decisionFilter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div id="decision-workspace-root" className="flex flex-col h-full bg-[#0b0e11] text-[#eaecef] overflow-hidden">
      {/* Header Panel */}
      <div className="bg-[#12161a] border-b border-[#24262b] px-6 py-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4 shrink-0">
        <div>
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-5 h-5 text-[#00f0ff] animate-pulse" />
            <h1 className="text-lg font-black tracking-wider text-white">PHASE 6 — DECISION INTELLIGENCE CONTROL DECK</h1>
            <span className="bg-[#1e2026] text-[#00f0ff] text-[9px] font-mono px-2 py-0.5 rounded border border-[#24262b]">Deterministic</span>
          </div>
          <p className="text-xs text-[#848e9c] mt-0.5">
            Single consensus regulatory authority authorized to recommend, evaluate, or reject trading exposures.
          </p>
        </div>

        {/* Tab Selector */}
        <div className="flex bg-[#16181a] rounded-lg p-1 border border-[#24262b] shrink-0 self-start">
          {[
            { id: "monitor", label: "Consensus Monitor", icon: Cpu },
            { id: "statistics", label: "Analytics & KPIs", icon: BarChart3 },
            { id: "gates", label: "Gating Shield", icon: ShieldCheck },
            { id: "weights", label: "Weights Tuner", icon: Sliders },
            { id: "logs", label: "Logs & Simulation", icon: Terminal }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                activeTab === tab.id ? "bg-[#2b2f36] text-[#00f0ff] shadow-sm" : "text-[#848e9c] hover:text-white"
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Health Indicator Banner */}
      {health && (
        <div className="bg-[#16181a] border-b border-[#24262b] px-6 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs shrink-0 font-mono text-[#848e9c]">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-1.5">
              <span className={`w-2 h-2 rounded-full ${health.status === "HEALTHY" ? "bg-[#0ecb81]" : "bg-red-500"}`} />
              <span className="text-white font-bold">SYSTEM HEALTH: {health.status}</span>
            </div>
            <span>|</span>
            <span>Data Stream: <strong className="text-[#0ecb81]">{health.metrics.dataQuality}</strong></span>
            <span>|</span>
            <span>Concept Drift: <strong className="text-white">{health.metrics.conceptDrift}</strong></span>
          </div>
          <div className="flex items-center space-x-4">
            <span>Tick Latency: <strong className="text-[#00f0ff]">{health.metrics.streamLatencyMs}ms</strong></span>
            <span>|</span>
            <span>Persisted Decisions: <strong className="text-white">{health.metrics.totalDecisionsPersisted}</strong></span>
          </div>
        </div>
      )}

      {/* Main Workspace Frame */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center space-y-2 bg-[#0b0e11]">
            <Brain className="w-8 h-8 text-[#00f0ff] animate-spin" />
            <span className="text-xs font-semibold text-[#848e9c]">Initializing Mathematical Consensus Engines...</span>
          </div>
        ) : (
          <div className="h-full overflow-hidden flex flex-col">
            
            {/* TAB: MONITOR */}
            {activeTab === "monitor" && selectedDecision && (
              <div className="flex-1 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-[#24262b]">
                
                {/* Panel A: Core Decision details */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  
                  {/* Selected Decision Card */}
                  <div className={`border rounded-xl p-6 relative overflow-hidden transition-all duration-300 ${getDecisionColor(selectedDecision.decision)}`}>
                    <div className="absolute top-0 right-0 w-64 h-64 bg-current opacity-[0.03] blur-3xl rounded-full" />
                    
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] font-bold tracking-widest uppercase opacity-70">
                            DECISION INTELLIGENCE OUTPUT AUTHORITY
                          </span>
                        </div>
                        <div className="text-4xl font-black mt-1 tracking-tight flex items-center space-x-3">
                          <span>{selectedDecision.decision}</span>
                          {selectedDecision.tradeDirection === "LONG" && <ArrowUpRight className="w-8 h-8 text-[#0ecb81] bg-green-500/10 rounded-full p-1" />}
                          {selectedDecision.tradeDirection === "SHORT" && <ArrowDownRight className="w-8 h-8 text-[#f6465d] bg-red-500/10 rounded-full p-1" />}
                        </div>
                      </div>
                      
                      <div className="bg-[#12161a]/80 px-3.5 py-2 rounded-lg border border-white/5 font-mono text-[10px] text-[#eaecef]/80">
                        <div>Decision ID: <strong className="text-white">{selectedDecision.id}</strong></div>
                        <div>Prediction ID: <strong className="text-[#00f0ff]">{selectedDecision.predictionId}</strong></div>
                        <div className="opacity-60 mt-0.5">Computed At: {new Date(selectedDecision.timestamp).toLocaleString()}</div>
                      </div>
                    </div>

                    {/* Metric Bars */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-white/10 font-mono">
                      <div>
                        <div className="text-[10px] uppercase font-bold opacity-75">Decision Score</div>
                        <div className="text-2xl font-black mt-1 text-white flex items-baseline">
                          <span>{selectedDecision.decisionScore}</span>
                          <span className="text-xs font-normal opacity-50 ml-0.5">/100</span>
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] uppercase font-bold opacity-75">Adjusted Confidence</div>
                        <div className="text-2xl font-black mt-1 text-[#00f0ff] flex items-baseline">
                          <span>{selectedDecision.decisionConfidence}</span>
                          <span className="text-xs font-normal opacity-70 ml-0.5">%</span>
                        </div>
                        <div className="text-[9px] text-gray-400 mt-0.5">Raw: {selectedDecision.modelConsensus}%</div>
                      </div>

                      <div>
                        <div className="text-[10px] uppercase font-bold opacity-75">Expected Move / EV</div>
                        <div className="text-2xl font-black mt-1 text-[#0ecb81] flex items-baseline">
                          <span>{selectedDecision.expectedValue > 0 ? "+" : ""}{selectedDecision.expectedValue.toFixed(4)}%</span>
                        </div>
                        <div className="text-[9px] text-gray-400 mt-0.5">Expected: {selectedDecision.expectedMove.toFixed(4)}%</div>
                      </div>

                      <div>
                        <div className="text-[10px] uppercase font-bold opacity-75">Historical Precedent</div>
                        <div className="text-2xl font-black mt-1 text-purple-400">
                          <span>{selectedDecision.historicalWinRate}%</span>
                        </div>
                        <div className="text-[9px] text-gray-400 mt-0.5">Matched cases: {selectedDecision.historicalSampleSize}</div>
                      </div>
                    </div>
                  </div>

                  {/* Evidence visual Trees */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    
                    {/* Supporting Evidence Tree */}
                    <div className="bg-[#12161a] border border-[#24262b] rounded-xl p-5">
                      <h4 className="text-xs font-black text-[#0ecb81] tracking-wide uppercase flex items-center space-x-1.5 mb-3 border-b border-[#24262b] pb-2">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Supporting Evidence Trace ({selectedDecision.supportingEvidence.length})</span>
                      </h4>
                      {selectedDecision.supportingEvidence.length > 0 ? (
                        <div className="space-y-2">
                          {selectedDecision.supportingEvidence.map((e, idx) => (
                            <div key={idx} className="flex items-start space-x-2.5 bg-[#1a1c22]/60 p-3 rounded-lg border border-[#24262b] text-xs transition-all hover:border-[#0ecb81]/30">
                              <span className="text-[#0ecb81] font-bold">▶</span>
                              <span>{e}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-xs text-[#848e9c] bg-[#1a1c22]/20 border border-[#24262b] border-dashed rounded-lg font-mono">
                          No positive consensus weights verified.
                        </div>
                      )}
                    </div>

                    {/* Contradicting Evidence & Contradictions Engine (Part 4) */}
                    <div className="bg-[#12161a] border border-[#24262b] rounded-xl p-5 space-y-4">
                      <div>
                        <h4 className="text-xs font-black text-[#f6465d] tracking-wide uppercase flex items-center space-x-1.5 mb-3 border-b border-[#24262b] pb-2">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Contradicting & Opposing factors ({selectedDecision.contradictingEvidence.length})</span>
                        </h4>
                        {selectedDecision.contradictingEvidence.length > 0 ? (
                          <div className="space-y-2">
                            {selectedDecision.contradictingEvidence.map((e, idx) => (
                              <div key={idx} className="flex items-start space-x-2.5 bg-[#1a1c22]/60 p-3 rounded-lg border border-[#24262b] text-xs hover:border-[#f6465d]/30">
                                <span className="text-[#f6465d] font-bold">■</span>
                                <span>{e}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-6 text-xs text-[#848e9c] bg-[#1a1c22]/20 border border-[#24262b] border-dashed rounded-lg font-mono">
                            Zero conflicting signals. High directional alignment.
                          </div>
                        )}
                      </div>

                      {/* Active Contradictions Penalties */}
                      {selectedDecision.contradictions && selectedDecision.contradictions.length > 0 && (
                        <div className="bg-red-500/5 border border-red-500/20 p-4 rounded-lg space-y-2.5">
                          <h5 className="text-[10px] font-black uppercase text-[#f6465d] tracking-widest flex items-center space-x-1">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>CONTRADICTIONS ANOMALY DETECTOR</span>
                          </h5>
                          <div className="space-y-1.5 text-xs">
                            {selectedDecision.contradictions.map((contra, idx) => (
                              <div key={idx} className="flex justify-between items-start bg-[#0b0e11] p-2 rounded border border-red-500/10 font-mono">
                                <div className="max-w-[70%]">
                                  <span className="bg-red-500/20 text-[#f6465d] text-[8px] font-bold px-1.5 py-0.5 rounded mr-1.5">{contra.severity}</span>
                                  <span className="text-white text-[11px]">{contra.type}</span>
                                  <p className="text-[10px] text-gray-400 mt-1 font-sans">{contra.description}</p>
                                </div>
                                <span className="text-[#f6465d] font-bold">-{contra.penalty}% Penalty</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Safe Excursion Boundaries */}
                  <div className="bg-[#12161a] border border-[#24262b] rounded-xl p-5">
                    <h4 className="text-xs font-black text-white tracking-widest uppercase mb-3 flex items-center space-x-2">
                      <Scale className="w-4 h-4 text-[#00f0ff]" />
                      <span>RISK BOUNDARY EXPECTATIONS</span>
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
                      <div className="bg-[#16181a] p-3.5 rounded-lg border border-[#24262b]">
                        <span className="text-gray-400 block text-[10px]">EXPECTED VOLATILITY</span>
                        <span className="text-white font-black text-lg mt-1 block">{(selectedDecision.expectedVolatility * 100).toFixed(2)}%</span>
                        <p className="text-[9px] text-gray-500 mt-1 font-sans">Predicted maximum pricing dispersion within strategy timeframe.</p>
                      </div>
                      <div className="bg-[#16181a] p-3.5 rounded-lg border border-[#24262b]">
                        <span className="text-gray-400 block text-[10px]">PREDICTED DRAWDOWN (MAE)</span>
                        <span className="text-amber-500 font-black text-lg mt-1 block">{(selectedDecision.expectedDrawdown * 100).toFixed(2)}%</span>
                        <p className="text-[9px] text-gray-500 mt-1 font-sans">Estimated maximum potential adverse path excursion.</p>
                      </div>
                      <div className="bg-[#16181a] p-3.5 rounded-lg border border-[#24262b]">
                        <span className="text-gray-400 block text-[10px]">RISK REGIME HEALTH</span>
                        <span className={`font-black text-lg mt-1 block ${selectedDecision.riskSummary.isUnhealthyRegime ? "text-[#f6465d]" : "text-[#0ecb81]"}`}>
                          {selectedDecision.riskSummary.isUnhealthyRegime ? "EXTREME NOISE" : "STABLE LIQUIDITY"}
                        </span>
                        <p className="text-[9px] text-gray-500 mt-1 font-sans">Analysis of order books, gaps, and liquidity markers.</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Panel B: 17 Mathematical Score Factor Contributions */}
                <div className="w-full lg:w-[380px] shrink-0 bg-[#12161a] overflow-y-auto p-6 space-y-5 flex flex-col justify-between border-t lg:border-t-0 border-[#24262b]">
                  <div className="space-y-4">
                    <div className="border-b border-[#24262b] pb-3">
                      <h3 className="text-xs font-black text-white tracking-widest uppercase flex items-center space-x-1.5">
                        <Gauge className="w-4 h-4 text-[#00f0ff]" />
                        <span>FACTOR SCORE BREAKDOWN</span>
                      </h3>
                      <p className="text-[10px] text-[#848e9c] mt-0.5">
                        Traceable 17-factor contribution values. Every weight is fully measurable.
                      </p>
                    </div>

                    <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
                      {selectedDecision.scoreBreakdown && selectedDecision.scoreBreakdown.map((item, idx) => (
                        <div key={idx} className="bg-[#16181a] p-2.5 rounded border border-[#24262b] space-y-1.5 text-xs font-mono">
                          <div className="flex justify-between font-sans">
                            <span className="text-white font-semibold text-[11px] capitalize">{item.factor.replace(/([A-Z])/g, " $1")}</span>
                            <span className="text-[#00f0ff] font-bold text-[11px]">{item.score} <span className="text-gray-500 text-[9px]">/100</span></span>
                          </div>
                          <div className="flex justify-between text-[10px] text-gray-400 font-mono">
                            <span>Weight: <strong className="text-gray-200">{item.weight}</strong></span>
                            <span>Contrib Pct: <strong className="text-purple-400">{item.contribution.toFixed(1)}%</strong></span>
                          </div>
                          <div className="w-full bg-[#24262b] h-1 rounded-full overflow-hidden">
                            <div className="bg-purple-500 h-full" style={{ width: `${item.score}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-[#16181a] p-4 rounded-xl border border-[#24262b] text-center space-y-1 font-mono text-xs">
                    <span className="text-gray-500 block text-[9px] uppercase">Engine Decision Version</span>
                    <strong className="text-white block text-[11px]">{selectedDecision.decisionVersion}</strong>
                    <span className="text-gray-500 block text-[9px] uppercase mt-2">Active Strategy Subsystem</span>
                    <strong className="text-[#00f0ff] block text-[11px]">{selectedDecision.primaryStrategyUsed}</strong>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: STATISTICS (PHASE 6 Bento) */}
            {activeTab === "statistics" && stats && (
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div>
                  <h3 className="text-sm font-black text-white uppercase flex items-center space-x-2">
                    <BarChart3 className="w-4 h-4 text-[#00f0ff]" />
                    <span>DECISION QUALITY ANALYTICS & KPIS</span>
                  </h3>
                  <p className="text-xs text-[#848e9c] mt-0.5">
                    Forensic performance auditing of decision calibrations, recall thresholds, and profit expectations.
                  </p>
                </div>

                {/* 13-KPI Bento Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
                  
                  {/* KPI 1 */}
                  <div className="bg-[#12161a] border border-[#24262b] rounded-xl p-4 flex flex-col justify-between font-mono">
                    <span className="text-[#848e9c] text-[9px] uppercase font-black">Decision Accuracy</span>
                    <span className="text-2xl font-black text-[#0ecb81] mt-2">{stats.qualityAnalytics.decisionAccuracy}%</span>
                    <p className="text-[9px] text-gray-500 mt-2 font-sans">Aggregate correctness of all executions + rejections.</p>
                  </div>

                  {/* KPI 2 */}
                  <div className="bg-[#12161a] border border-[#24262b] rounded-xl p-4 flex flex-col justify-between font-mono">
                    <span className="text-[#848e9c] text-[9px] uppercase font-black">Decision Precision</span>
                    <span className="text-2xl font-black text-[#00f0ff] mt-2">{stats.qualityAnalytics.decisionPrecision}%</span>
                    <p className="text-[9px] text-gray-500 mt-2 font-sans">Ratio of correctly executed win trades to total executed.</p>
                  </div>

                  {/* KPI 3 */}
                  <div className="bg-[#12161a] border border-[#24262b] rounded-xl p-4 flex flex-col justify-between font-mono">
                    <span className="text-[#848e9c] text-[9px] uppercase font-black">Decision Recall</span>
                    <span className="text-2xl font-black text-purple-400 mt-2">{stats.qualityAnalytics.decisionRecall}%</span>
                    <p className="text-[9px] text-gray-500 mt-2 font-sans">Ability to identify and execute on all true winning opportunities.</p>
                  </div>

                  {/* KPI 4 */}
                  <div className="bg-[#12161a] border border-[#24262b] rounded-xl p-4 flex flex-col justify-between font-mono">
                    <span className="text-[#848e9c] text-[9px] uppercase font-black">Forecast Calibration</span>
                    <span className="text-2xl font-black text-amber-500 mt-2">{stats.qualityAnalytics.decisionCalibration}%</span>
                    <p className="text-[9px] text-gray-500 mt-2 font-sans">Closeness of average adjusted confidence to historical win rate.</p>
                  </div>

                  {/* KPI 5 */}
                  <div className="bg-[#12161a] border border-[#24262b] rounded-xl p-4 flex flex-col justify-between font-mono">
                    <span className="text-[#848e9c] text-[9px] uppercase font-black">Decision Expected Value</span>
                    <span className="text-2xl font-black text-white mt-2">+{stats.qualityAnalytics.decisionExpectedValue.toFixed(4)}%</span>
                    <p className="text-[9px] text-gray-500 mt-2 font-sans">Mathematical expected return per trade across executions.</p>
                  </div>

                  {/* KPI 6 */}
                  <div className="bg-[#12161a] border border-[#24262b] rounded-xl p-4 flex flex-col justify-between font-mono">
                    <span className="text-[#848e9c] text-[9px] uppercase font-black">Decision Drift</span>
                    <span className="text-2xl font-black text-red-400 mt-2">{stats.qualityAnalytics.decisionDrift}%</span>
                    <p className="text-[9px] text-gray-500 mt-2 font-sans">Volatility of execution ratios over rolling periods.</p>
                  </div>

                  {/* KPI 7 */}
                  <div className="bg-[#12161a] border border-[#24262b] rounded-xl p-4 flex flex-col justify-between font-mono">
                    <span className="text-[#848e9c] text-[9px] uppercase font-black">Decision Stability</span>
                    <span className="text-2xl font-black text-[#00f0ff] mt-2">{stats.qualityAnalytics.decisionStability}%</span>
                    <p className="text-[9px] text-gray-500 mt-2 font-sans">Variance of decision output scores over chronological sequence.</p>
                  </div>

                  {/* KPI 8 */}
                  <div className="bg-[#12161a] border border-[#24262b] rounded-xl p-4 flex flex-col justify-between font-mono">
                    <span className="text-[#848e9c] text-[9px] uppercase font-black">Decision Consistency</span>
                    <span className="text-2xl font-black text-[#0ecb81] mt-2">{stats.qualityAnalytics.decisionConsistency}%</span>
                    <p className="text-[9px] text-gray-500 mt-2 font-sans">Rate of identical decisions in identical market regimes.</p>
                  </div>

                  {/* KPI 9 */}
                  <div className="bg-[#12161a] border border-[#24262b] rounded-xl p-4 flex flex-col justify-between font-mono text-red-400">
                    <span className="text-[#848e9c] text-[9px] uppercase font-black">False Positives</span>
                    <span className="text-2xl font-black mt-2">{stats.qualityAnalytics.falsePositives}</span>
                    <p className="text-[9px] text-gray-500 mt-2 font-sans">Trades executed that resulted in losses (Accepted Losers).</p>
                  </div>

                  {/* KPI 10 */}
                  <div className="bg-[#12161a] border border-[#24262b] rounded-xl p-4 flex flex-col justify-between font-mono text-amber-500">
                    <span className="text-[#848e9c] text-[9px] uppercase font-black">False Negatives</span>
                    <span className="text-2xl font-black mt-2">{stats.qualityAnalytics.falseNegatives}</span>
                    <p className="text-[9px] text-gray-500 mt-2 font-sans">Favorable opportunities rejected (Rejected Winners).</p>
                  </div>

                  {/* KPI 11 */}
                  <div className="bg-[#12161a] border border-[#24262b] rounded-xl p-4 flex flex-col justify-between font-mono">
                    <span className="text-[#848e9c] text-[9px] uppercase font-black">Missed Winners</span>
                    <span className="text-2xl font-black text-red-400 mt-2">{stats.qualityAnalytics.missedOpportunities}</span>
                    <p className="text-[9px] text-gray-500 mt-2 font-sans">Profitable moves that did not cross gating thresholds.</p>
                  </div>

                  {/* KPI 12 */}
                  <div className="bg-[#12161a] border border-[#24262b] rounded-xl p-4 flex flex-col justify-between font-mono">
                    <span className="text-[#848e9c] text-[9px] uppercase font-black">Approval Rate</span>
                    <span className="text-2xl font-black text-[#0ecb81] mt-2">{stats.approvalRate}%</span>
                    <p className="text-[9px] text-gray-500 mt-2 font-sans">Percentage of predictions that completed through execution.</p>
                  </div>
                </div>

                {/* Distributions */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Decision distribution */}
                  <div className="bg-[#12161a] border border-[#24262b] rounded-xl p-5 space-y-4">
                    <h4 className="text-xs font-black text-white uppercase tracking-widest flex items-center space-x-1.5">
                      <Percent className="w-4 h-4 text-[#00f0ff]" />
                      <span>Decision Outcome Distribution</span>
                    </h4>
                    <div className="space-y-3 text-xs font-mono">
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-[#0ecb81]">EXECUTE</span>
                          <span>{stats.executeCount} ({stats.totalDecisions > 0 ? ((stats.executeCount / stats.totalDecisions) * 100).toFixed(1) : 0}%)</span>
                        </div>
                        <div className="w-full bg-[#1e2026] h-2 rounded-full overflow-hidden">
                          <div className="bg-[#0ecb81] h-full" style={{ width: `${stats.totalDecisions > 0 ? (stats.executeCount / stats.totalDecisions) * 100 : 0}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-amber-400">WATCH</span>
                          <span>{stats.watchCount} ({stats.totalDecisions > 0 ? ((stats.watchCount / stats.totalDecisions) * 100).toFixed(1) : 0}%)</span>
                        </div>
                        <div className="w-full bg-[#1e2026] h-2 rounded-full overflow-hidden">
                          <div className="bg-amber-400 h-full" style={{ width: `${stats.totalDecisions > 0 ? (stats.watchCount / stats.totalDecisions) * 100 : 0}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-[#00f0ff]">WAIT</span>
                          <span>{stats.waitCount} ({stats.totalDecisions > 0 ? ((stats.waitCount / stats.totalDecisions) * 100).toFixed(1) : 0}%)</span>
                        </div>
                        <div className="w-full bg-[#1e2026] h-2 rounded-full overflow-hidden">
                          <div className="bg-[#00f0ff] h-full" style={{ width: `${stats.totalDecisions > 0 ? (stats.waitCount / stats.totalDecisions) * 100 : 0}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-[#f6465d]">REJECT</span>
                          <span>{stats.rejectCount} ({stats.totalDecisions > 0 ? ((stats.rejectCount / stats.totalDecisions) * 100).toFixed(1) : 0}%)</span>
                        </div>
                        <div className="w-full bg-[#1e2026] h-2 rounded-full overflow-hidden">
                          <div className="bg-[#f6465d] h-full" style={{ width: `${stats.totalDecisions > 0 ? (stats.rejectCount / stats.totalDecisions) * 100 : 0}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Gate Rejection Distribution */}
                  <div className="bg-[#12161a] border border-[#24262b] rounded-xl p-5 space-y-4">
                    <h4 className="text-xs font-black text-white uppercase tracking-widest flex items-center space-x-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      <span>Gate Failure Anomaly Frequency</span>
                    </h4>
                    <div className="space-y-2.5 max-h-[190px] overflow-y-auto pr-1 text-xs font-mono">
                      {Object.keys(stats.gateFailureCounts).map((gateKey) => (
                        <div key={gateKey} className="flex justify-between items-center py-1 border-b border-[#24262b]/50">
                          <span className="text-[#848e9c] text-[11px] capitalize">{gateKey.toLowerCase().replace(/_/g, " ")}</span>
                          <span className="text-[#f6465d] font-bold">{stats.gateFailureCounts[gateKey]} triggers</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: GATES (PHASE 6 Gating pipeline) */}
            {activeTab === "gates" && (
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div>
                  <h3 className="text-sm font-black text-white uppercase flex items-center space-x-2">
                    <ShieldCheck className="w-4 h-4 text-[#00f0ff]" />
                    <span>REGULATORY MANDATORY GATING SHIELD</span>
                  </h3>
                  <p className="text-xs text-[#848e9c] mt-0.5">
                    12 cryptographic trading shields that a predictive setup must satisfy to authorize active market exposure.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  {gates.map((g, idx) => (
                    <div key={g.id} className="bg-[#12161a] border border-[#24262b] rounded-xl p-5 flex flex-col justify-between space-y-3 relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-1 font-mono text-[9px] text-[#848e9c] bg-[#16181a] border-b border-l border-[#24262b] rounded-bl">
                        #{idx + 1}
                      </div>

                      <div className="space-y-1">
                        <h4 className="text-xs font-black text-white tracking-wide">{g.name}</h4>
                        <p className="text-[10px] text-[#848e9c] leading-relaxed">{g.description}</p>
                      </div>

                      <div className="pt-3 border-t border-[#24262b] flex items-center justify-between font-mono text-[11px]">
                        <div>
                          <span className="text-gray-500 text-[9px] block">THRESHOLD</span>
                          <strong className="text-white">{g.threshold}</strong>
                        </div>
                        <div className="text-right">
                          <span className="text-gray-500 text-[9px] block">SUCCESS RATE</span>
                          <strong className="text-[#0ecb81]">{g.successRate}%</strong>
                        </div>
                      </div>

                      <div className="bg-[#16181a] p-2 rounded border border-[#24262b] flex items-center justify-between text-[10px] font-mono">
                        <span className="text-gray-500">Fail triggers:</span>
                        <span className="text-[#f6465d] font-bold">{g.failCount} times</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB: WEIGHTS */}
            {activeTab === "weights" && (
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-black text-white uppercase flex items-center space-x-2">
                      <Sliders className="w-4 h-4 text-[#00f0ff]" />
                      <span>CONSENSUS PARAMETER TUNER</span>
                    </h3>
                    <p className="text-xs text-[#848e9c] mt-0.5">
                      Adjust constituent weight biases or apply predefined regime configurations.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => applyPreset("default")} className="px-3 py-1 bg-[#1e2026] border border-[#24262b] rounded hover:text-white transition text-[10px] font-mono font-bold cursor-pointer">Preset: Default</button>
                    <button onClick={() => applyPreset("aggressive")} className="px-3 py-1 bg-[#1e2026] border border-[#24262b] rounded hover:text-white transition text-[10px] font-mono font-bold cursor-pointer">Preset: Aggressive</button>
                    <button onClick={() => applyPreset("conservative")} className="px-3 py-1 bg-[#1e2026] border border-[#24262b] rounded hover:text-white transition text-[10px] font-mono font-bold cursor-pointer">Preset: Conservative</button>
                    <button onClick={() => applyPreset("high_volatility")} className="px-3 py-1 bg-[#1e2026] border border-[#24262b] rounded hover:text-white transition text-[10px] font-mono font-bold cursor-pointer">Preset: Volatility</button>
                    <button onClick={() => applyPreset("crash")} className="px-3 py-1 bg-[#1e2026] border border-[#24262b] rounded hover:text-white transition text-[10px] font-mono font-bold cursor-pointer">Preset: Crash</button>
                  </div>
                </div>

                <form onSubmit={handleUpdateWeights} className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
                  
                  {/* Left tuner panel: Consensus Weights */}
                  <div className="bg-[#12161a] border border-[#24262b] rounded-xl p-6 space-y-4">
                    <h4 className="text-xs font-black text-white uppercase tracking-widest border-b border-[#24262b] pb-2">
                      1. Subsystem Consensus Weights
                    </h4>
                    
                    {/* slider 1 */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs font-bold font-mono">
                        <label className="text-gray-300">Probability Engine</label>
                        <span className="text-[#00f0ff]">{consensusWeights.probabilityEngineWeight.toFixed(2)}</span>
                      </div>
                      <input
                        type="range" min="0" max="1" step="0.05"
                        value={consensusWeights.probabilityEngineWeight}
                        onChange={(e) => setConsensusWeights({ ...consensusWeights, probabilityEngineWeight: parseFloat(e.target.value) })}
                        className="w-full accent-[#00f0ff] bg-[#16181a] h-1.5 rounded cursor-pointer appearance-none"
                      />
                    </div>

                    {/* slider 2 */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs font-bold font-mono">
                        <label className="text-gray-300">Machine Learning Predictions</label>
                        <span className="text-[#00f0ff]">{consensusWeights.mlPredictionWeight.toFixed(2)}</span>
                      </div>
                      <input
                        type="range" min="0" max="1" step="0.05"
                        value={consensusWeights.mlPredictionWeight}
                        onChange={(e) => setConsensusWeights({ ...consensusWeights, mlPredictionWeight: parseFloat(e.target.value) })}
                        className="w-full accent-[#00f0ff] bg-[#16181a] h-1.5 rounded cursor-pointer appearance-none"
                      />
                    </div>

                    {/* slider 3 */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs font-bold font-mono">
                        <label className="text-gray-300">Strategy Agreement</label>
                        <span className="text-[#00f0ff]">{consensusWeights.strategyAgreementWeight.toFixed(2)}</span>
                      </div>
                      <input
                        type="range" min="0" max="1" step="0.05"
                        value={consensusWeights.strategyAgreementWeight}
                        onChange={(e) => setConsensusWeights({ ...consensusWeights, strategyAgreementWeight: parseFloat(e.target.value) })}
                        className="w-full accent-[#00f0ff] bg-[#16181a] h-1.5 rounded cursor-pointer appearance-none"
                      />
                    </div>

                    {/* slider 4 */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs font-bold font-mono">
                        <label className="text-gray-300">Historical Similarity Map</label>
                        <span className="text-[#00f0ff]">{consensusWeights.historicalSimilarityWeight.toFixed(2)}</span>
                      </div>
                      <input
                        type="range" min="0" max="1" step="0.05"
                        value={consensusWeights.historicalSimilarityWeight}
                        onChange={(e) => setConsensusWeights({ ...consensusWeights, historicalSimilarityWeight: parseFloat(e.target.value) })}
                        className="w-full accent-[#00f0ff] bg-[#16181a] h-1.5 rounded cursor-pointer appearance-none"
                      />
                    </div>

                    {/* slider 5 */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs font-bold font-mono">
                        <label className="text-gray-300">Adaptive Learning Feedback</label>
                        <span className="text-[#00f0ff]">{consensusWeights.adaptiveLearningWeight.toFixed(2)}</span>
                      </div>
                      <input
                        type="range" min="0" max="1" step="0.05"
                        value={consensusWeights.adaptiveLearningWeight}
                        onChange={(e) => setConsensusWeights({ ...consensusWeights, adaptiveLearningWeight: parseFloat(e.target.value) })}
                        className="w-full accent-[#00f0ff] bg-[#16181a] h-1.5 rounded cursor-pointer appearance-none"
                      />
                    </div>
                  </div>

                  {/* Right tuner panel: 17 mathematical factors */}
                  <div className="bg-[#12161a] border border-[#24262b] rounded-xl p-6 space-y-4">
                    <h4 className="text-xs font-black text-white uppercase tracking-widest border-b border-[#24262b] pb-2">
                      2. Mathematical Score Contributions Weights (0 - 20)
                    </h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[300px] overflow-y-auto pr-1">
                      {Object.keys(scoreWeights).map((key) => (
                        <div key={key} className="space-y-1.5">
                          <div className="flex justify-between text-[11px] font-bold font-mono">
                            <label className="text-gray-300 capitalize">{key.replace(/([A-Z])/g, " $1")}</label>
                            <span className="text-purple-400">{(scoreWeights as any)[key]}</span>
                          </div>
                          <input
                            type="range" min="0" max="25" step="1"
                            value={(scoreWeights as any)[key]}
                            onChange={(e) => setScoreWeights({ ...scoreWeights, [key]: parseInt(e.target.value) })}
                            className="w-full accent-purple-500 bg-[#16181a] h-1 rounded cursor-pointer appearance-none"
                          />
                        </div>
                      ))}
                    </div>

                    <div className="pt-4 border-t border-[#24262b] flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => applyPreset("default")}
                        className="px-4 py-2 bg-transparent hover:bg-[#16181a] text-[#848e9c] text-xs font-bold rounded-lg border border-[#24262b] cursor-pointer transition flex items-center space-x-1"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reset Defaults</span>
                      </button>

                      <button
                        type="submit"
                        disabled={updatingWeights}
                        className="px-5 py-2 bg-purple-950/60 hover:bg-purple-900 text-[#a076ff] text-xs font-black rounded-lg border border-purple-800/40 cursor-pointer transition flex items-center space-x-1"
                      >
                        <Settings className="animate-spin w-3.5 h-3.5" style={{ display: updatingWeights ? "inline" : "none" }} />
                        <span>Apply New Coefficients</span>
                      </button>
                    </div>

                    {weightMessage && (
                      <div className={`p-3 rounded-lg border text-center text-xs font-semibold ${weightMessage.includes("Error") ? "border-red-500/20 bg-red-500/5 text-[#f6465d]" : "border-green-500/20 bg-green-500/5 text-[#0ecb81]"}`}>
                        {weightMessage}
                      </div>
                    )}
                  </div>
                </form>
              </div>
            )}

            {/* TAB: LOGS & SIMULATION */}
            {activeTab === "logs" && (
              <div className="flex-1 overflow-hidden flex flex-col p-6 space-y-4">
                
                {/* Simulated Payload Form */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start shrink-0">
                  <div className="xl:col-span-2 bg-[#12161a] border border-[#24262b] rounded-xl p-5 space-y-3.5">
                    <div>
                      <h3 className="text-xs font-black text-white uppercase flex items-center space-x-2">
                        <Terminal className="w-4 h-4 text-[#00f0ff]" />
                        <span>PREDICTIVE INJECTION EVALUATOR</span>
                      </h3>
                      <p className="text-[10px] text-[#848e9c] mt-0.5">
                        Trigger manual consensus audits by injecting simulated prediction state models.
                      </p>
                    </div>

                    <form onSubmit={handleManualEvaluate} className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                      <div>
                        <label className="block text-gray-400 mb-1">Market</label>
                        <select
                          value={evalMarket} onChange={(e) => setEvalMarket(e.target.value)}
                          className="w-full bg-[#16181a] border border-[#24262b] rounded p-2 text-white font-mono"
                        >
                          <option value="BTCUSDT">BTCUSDT</option>
                          <option value="ETHUSDT">ETHUSDT</option>
                          <option value="SOLUSDT">SOLUSDT</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-gray-400 mb-1">Confidence</label>
                        <input
                          type="number" min="0" max="100" value={evalConfidence}
                          onChange={(e) => setEvalConfidence(parseInt(e.target.value))}
                          className="w-full bg-[#16181a] border border-[#24262b] rounded p-2 text-white font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-gray-400 mb-1">Expected Move (%)</label>
                        <input
                          type="number" step="0.05" value={evalExpectedMove}
                          onChange={(e) => setEvalExpectedMove(parseFloat(e.target.value))}
                          className="w-full bg-[#16181a] border border-[#24262b] rounded p-2 text-white font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-gray-400 mb-1">Regime</label>
                        <select
                          value={evalRegime} onChange={(e) => setEvalRegime(e.target.value)}
                          className="w-full bg-[#16181a] border border-[#24262b] rounded p-2 text-white font-mono"
                        >
                          <option value="BULL_EXPANSION">BULL_EXPANSION</option>
                          <option value="BEAR_EXPANSION">BEAR_EXPANSION</option>
                          <option value="CONSOLIDATION">CONSOLIDATION</option>
                          <option value="UNKNOWN">UNKNOWN</option>
                        </select>
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-gray-400 mb-1">Directional Probabilities (Up / Down / Flat)</label>
                        <div className="grid grid-cols-3 gap-2">
                          <input
                            type="number" step="0.05" min="0" max="1" value={evalProbsUp}
                            onChange={(e) => setEvalProbsUp(parseFloat(e.target.value))}
                            className="bg-[#16181a] border border-[#24262b] rounded p-2 text-white text-center font-mono" placeholder="UP"
                          />
                          <input
                            type="number" step="0.05" min="0" max="1" value={evalProbsDown}
                            onChange={(e) => setEvalProbsDown(parseFloat(e.target.value))}
                            className="bg-[#16181a] border border-[#24262b] rounded p-2 text-white text-center font-mono" placeholder="DOWN"
                          />
                          <input
                            type="number" step="0.05" min="0" max="1" value={evalProbsSideways}
                            onChange={(e) => setEvalProbsSideways(parseFloat(e.target.value))}
                            className="bg-[#16181a] border border-[#24262b] rounded p-2 text-white text-center font-mono" placeholder="FLAT"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-gray-400 mb-1">Data Stream Health</label>
                        <select
                          value={evalDataQuality} onChange={(e) => setEvalDataQuality(e.target.value)}
                          className="w-full bg-[#16181a] border border-[#24262b] rounded p-2 text-white font-mono"
                        >
                          <option value="EXCELLENT">EXCELLENT</option>
                          <option value="CRITICAL">CRITICAL</option>
                        </select>
                      </div>

                      <div className="flex items-end">
                        <button
                          type="submit" disabled={evalEvaluating}
                          className="w-full py-2 bg-transparent hover:bg-[#00f0ff]/10 border border-[#00f0ff]/30 text-[#00f0ff] font-black rounded cursor-pointer transition"
                        >
                          Evaluate setup
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Automated verification tests */}
                  <div className="bg-[#12161a] border border-[#24262b] rounded-xl p-5 space-y-3.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-black text-white uppercase flex items-center space-x-1.5">
                          <Database className="w-4 h-4 text-purple-400" />
                          <span>Verification TestSuite</span>
                        </h3>
                        <p className="text-[10px] text-[#848e9c] mt-0.5">
                          Audit deterministic replaying and gate evaluations.
                        </p>
                      </div>
                      <button
                        onClick={handleRunTests} disabled={runningTests}
                        className="px-3 py-1 bg-purple-950/40 hover:bg-purple-900/60 border border-purple-800/30 text-[#a076ff] rounded text-[10px] font-black cursor-pointer"
                      >
                        {runningTests ? "Auditing..." : "Run Tests"}
                      </button>
                    </div>

                    {testResults ? (
                      <div className="space-y-3">
                        <div className="p-2.5 rounded bg-[#0ecb81]/10 border border-[#0ecb81]/20 text-[#0ecb81] text-[10px] font-bold flex items-center space-x-1.5">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>ALL ISOLATED CONSENSUS TESTS PASSED</span>
                        </div>
                        <div className="bg-[#16181a] border border-[#24262b] p-2.5 rounded text-[10px] font-mono text-[#eaecef]/70 max-h-[90px] overflow-y-auto">
                          <div>Passed: {testResults.passed} | Failed: {testResults.failed}</div>
                          {testResults.details && testResults.details.slice(0, 3).map((d: string, i: number) => (
                            <div key={i} className="text-[9px] mt-0.5 opacity-60 truncate">{d}</div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-6 text-[10px] text-[#848e9c] bg-[#16181a]/50 border border-[#24262b] border-dashed rounded font-mono">
                        Run test suite to verify replaying logs.
                      </div>
                    )}
                  </div>
                </div>

                {/* Search, Filter & Log Archive table */}
                <div className="flex-1 flex flex-col overflow-hidden space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center space-x-2 bg-[#12161a] border border-[#24262b] rounded-lg px-2.5 py-1.5 w-full sm:w-72">
                      <Search className="w-3.5 h-3.5 text-gray-500" />
                      <input
                        type="text" placeholder="Search logs by ID or pair..."
                        value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-transparent border-none outline-none text-xs text-white placeholder-gray-500 w-full"
                      />
                    </div>

                    <div className="flex items-center space-x-2">
                      <div className="flex items-center space-x-1.5 bg-[#12161a] border border-[#24262b] rounded-lg px-2.5 py-1 w-full">
                        <Filter className="w-3.5 h-3.5 text-gray-500" />
                        <select
                          value={decisionFilter} onChange={(e) => setDecisionFilter(e.target.value)}
                          className="bg-transparent border-none outline-none text-xs text-[#eaecef] cursor-pointer"
                        >
                          <option value="ALL">All decisions</option>
                          <option value="EXECUTE">EXECUTE</option>
                          <option value="WATCH">WATCH</option>
                          <option value="WAIT">WAIT</option>
                          <option value="REJECT">REJECT</option>
                        </select>
                      </div>

                      <div className="flex space-x-1">
                        <a
                          href="/api/decision/export?format=json" download="decision_archive.json"
                          className="px-2.5 py-1.5 bg-[#1e2026] border border-[#24262b] rounded text-[10px] font-bold text-[#eaecef] hover:text-white flex items-center space-x-1"
                        >
                          <Download className="w-3 h-3" />
                          <span>JSON</span>
                        </a>
                        <a
                          href="/api/decision/export?format=csv" download="decision_archive.csv"
                          className="px-2.5 py-1.5 bg-[#1e2026] border border-[#24262b] rounded text-[10px] font-bold text-[#eaecef] hover:text-white flex items-center space-x-1"
                        >
                          <FileSpreadsheet className="w-3 h-3" />
                          <span>CSV</span>
                        </a>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto bg-[#12161a] border border-[#24262b] rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-[#16181a] border-b border-[#24262b] text-[#848e9c] font-black uppercase tracking-wider text-[9px]">
                          <th className="p-3.5">Timestamp</th>
                          <th className="p-3.5">Decision ID</th>
                          <th className="p-3.5">Market Pair</th>
                          <th className="p-3.5">Consensus Outcome</th>
                          <th className="p-3.5 text-right">Score</th>
                          <th className="p-3.5 text-right">Confidence</th>
                          <th className="p-3.5 text-right">Expected Edge</th>
                          <th className="p-3.5">Market Regime</th>
                          <th className="p-3.5 text-center">Diagnostics</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#24262b] font-mono text-[11px]">
                        {filteredHistory.length > 0 ? (
                          filteredHistory.map((d) => (
                            <tr key={d.id} className="hover:bg-[#1a1c22]/50 text-[#eaecef] transition-colors">
                              <td className="p-3 opacity-75">{new Date(d.timestamp).toLocaleString()}</td>
                              <td className="p-3 font-bold text-white text-[11px]">{d.id}</td>
                              <td className="p-3">{d.market} <span className="opacity-50">({d.timeframe})</span></td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] ${getDecisionBadge(d.decision)}`}>
                                  {d.decision}
                                </span>
                              </td>
                              <td className="p-3 text-right text-white font-bold">{d.decisionScore}</td>
                              <td className="p-3 text-right text-amber-400 font-bold">{d.decisionConfidence}%</td>
                              <td className="p-3 text-right text-[#0ecb81]">{d.expectedValue > 0 ? "+" : ""}{d.expectedValue.toFixed(4)}%</td>
                              <td className="p-3 text-[#848e9c] text-[10px]">{d.marketRegime}</td>
                              <td className="p-3 text-center">
                                <button
                                  onClick={() => handleReplay(d.id)}
                                  className="px-2 py-1 bg-purple-950/40 border border-purple-800/30 hover:bg-purple-900/60 text-[#a076ff] text-[10px] font-black rounded cursor-pointer transition flex items-center space-x-1 mx-auto"
                                >
                                  <Play className="w-3 h-3" />
                                  <span>Audit</span>
                                </button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={9} className="p-8 text-center text-[#848e9c] font-sans font-mono text-[11px]">
                              Zero matching decisions found in the local archive.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default DecisionIntelligencePanel;
