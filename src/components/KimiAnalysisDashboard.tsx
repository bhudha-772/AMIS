import React, { useState, useEffect, useRef } from "react";
import {
  Activity, Brain, TrendingUp, TrendingDown, Minus,
  CheckCircle, XCircle, Clock, AlertTriangle, RefreshCw,
  Eye, Target, BarChart3
} from "lucide-react";
import { useDerivWS, SUPPORTED_ASSETS } from "../context/DerivWSContext";

interface MarketAnalysis {
  symbol: string;
  name: string;
  currentPrice: number;
  signal: "HIGHER" | "LOWER" | "NEUTRAL";
  confidence: number;
  expectedMove: number;
  analysis: string;
  timestamp: number;
  status: "analyzing" | "complete" | "error";
  error?: string;
}

interface TradeOutcome {
  id: string;
  symbol: string;
  signal: "HIGHER" | "LOWER";
  entryPrice: number;
  exitPrice: number;
  result: "WON" | "LOST" | "PENDING";
  confidence: number;
  timestamp: number;
  duration: number;
}

interface KimiStatus {
  isAnalyzing: boolean;
  lastAnalysisTime: number;
  totalMarkets: number;
  completedMarkets: number;
  errors: string[];
  bestPick: MarketAnalysis | null;
}
export function KimiAnalysisDashboard() {
  const { ticks, histories, isConnected } = useDerivWS();
  const [analyses, setAnalyses] = useState<Record<string, MarketAnalysis>>({});
  const [tradeOutcomes, setTradeOutcomes] = useState<TradeOutcome[]>([]);
  const [kimiStatus, setKimiStatus] = useState<KimiStatus>({
    isAnalyzing: false, lastAnalysisTime: 0,
    totalMarkets: SUPPORTED_ASSETS.length, completedMarkets: 0,
    errors: [], bestPick: null
  });
  const [selectedMarket, setSelectedMarket] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const analysisIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const tradeCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const analyzeMarket = async (symbol: string, currentPrice: number, history: number[]) => {
    try {
      setAnalyses(prev => ({ ...prev, [symbol]: {
        symbol, name: SUPPORTED_ASSETS.find(a => a.symbol === symbol)?.name || symbol,
        currentPrice, signal: "NEUTRAL", confidence: 0, expectedMove: 0,
        analysis: "Analyzing...", timestamp: Date.now(), status: "analyzing"
      }}));
      const response = await fetch("/api/moonshot/deriv-predict", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, currentPrice, tickHistory: history.slice(-50), contractHistory: [], accumulatedLessons: [] })
      });
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      const data = await response.json();
      setAnalyses(prev => ({ ...prev, [symbol]: {
        ...prev[symbol], signal: data.signal || "NEUTRAL", confidence: data.confidence || 0,
        expectedMove: data.expectedMove || 0, analysis: data.analysis || "No analysis",
        timestamp: Date.now(), status: "complete"
      }}));
    } catch (err: any) {
      setAnalyses(prev => ({ ...prev, [symbol]: { ...prev[symbol], status: "error", error: err.message || "Failed", timestamp: Date.now() }}));
      setKimiStatus(prev => ({ ...prev, errors: [...prev.errors.slice(-9), `${symbol}: ${err.message || "Error"}`] }));
    }
  };

  const analyzeAllMarkets = async () => {
    setKimiStatus(prev => ({ ...prev, isAnalyzing: true, errors: [] }));
    const promises = SUPPORTED_ASSETS.map(async (asset) => {
      const tick = ticks[asset.symbol];
      const history = histories[asset.symbol] || [];
      const currentPrice = tick?.quote || history[history.length - 1] || 0;
      if (currentPrice === 0) {
        setAnalyses(prev => ({ ...prev, [asset.symbol]: {
          symbol: asset.symbol, name: asset.name, currentPrice: 0, signal: "NEUTRAL",
          confidence: 0, expectedMove: 0, analysis: "Waiting for tick data...",
          timestamp: Date.now(), status: "error", error: "No tick data"
        }}));
        return;
      }
      await analyzeMarket(asset.symbol, currentPrice, history);
    });
    await Promise.all(promises);
    setAnalyses((current: Record<string, MarketAnalysis>) => {
      const completed = Object.values(current).filter((a: MarketAnalysis) => a.status === "complete" && a.signal !== "NEUTRAL");
      const best = completed.sort((a: MarketAnalysis, b: MarketAnalysis) => b.confidence - a.confidence)[0] || null;
      setKimiStatus(prev => ({ ...prev, isAnalyzing: false, lastAnalysisTime: Date.now(),
        completedMarkets: Object.values(current).filter((a: MarketAnalysis) => a.status === "complete").length, bestPick: best }));
      return current;
    });
  };

  const trackTradeOutcomes = () => {
    SUPPORTED_ASSETS.forEach(asset => {
      const analysis = analyses[asset.symbol];
      const tick = ticks[asset.symbol];
      const history = histories[asset.symbol] || [];
      if (!analysis || analysis.status !== "complete" || analysis.signal === "NEUTRAL") return;
      const currentPrice = tick?.quote || history[history.length - 1];
      const entryPrice = analysis.currentPrice;
      const timeSinceAnalysis = Date.now() - analysis.timestamp;
      if (timeSinceAnalysis > 30000 && !tradeOutcomes.find(t => t.symbol === asset.symbol && t.timestamp === analysis.timestamp)) {
        const priceChange = currentPrice - entryPrice;
        const expectedDirection = analysis.signal === "HIGHER" ? 1 : -1;
        const actualDirection = priceChange > 0 ? 1 : priceChange < 0 ? -1 : 0;
        const isWon = actualDirection === expectedDirection;
        setTradeOutcomes(prev => [{
          id: `${asset.symbol}-${analysis.timestamp}`, symbol: asset.symbol,
          signal: analysis.signal, entryPrice, exitPrice: currentPrice,
          result: isWon ? "WON" : "LOST", confidence: analysis.confidence,
          timestamp: analysis.timestamp, duration: Math.floor(timeSinceAnalysis / 1000)
        }, ...prev].slice(0, 50));
      }
    });
  };

  useEffect(() => {
    if (!autoRefresh || !isConnected) return;
    analyzeAllMarkets();
    analysisIntervalRef.current = setInterval(analyzeAllMarkets, 30000);
    tradeCheckIntervalRef.current = setInterval(trackTradeOutcomes, 5000);
    return () => {
      if (analysisIntervalRef.current) clearInterval(analysisIntervalRef.current);
      if (tradeCheckIntervalRef.current) clearInterval(tradeCheckIntervalRef.current);
    };
  }, [autoRefresh, isConnected, ticks, histories]);

  const completedTrades = tradeOutcomes.filter(t => t.result !== "PENDING");
  const wonTrades = completedTrades.filter(t => t.result === "WON");
  const winRate = completedTrades.length > 0 ? (wonTrades.length / completedTrades.length * 100).toFixed(1) : "0";

  const getSignalIcon = (signal: string) => {
    if (signal === "HIGHER") return <TrendingUp className="w-4 h-4 text-green-500" />;
    if (signal === "LOWER") return <TrendingDown className="w-4 h-4 text-red-500" />;
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.7) return "text-green-500";
    if (confidence >= 0.5) return "text-yellow-500";
    return "text-red-500";
  };
  return (
    <div className="flex flex-col h-full bg-slate-900 text-white font-sans overflow-hidden">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <div className="bg-purple-600 text-white p-2 rounded-lg"><Brain className="w-5 h-5" /></div>
          <div>
            <h2 className="text-sm font-bold">KIMI Analysis Dashboard</h2>
            <p className="text-xs text-slate-400">Moonshot AI ・ Real-time Market Analysis</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${autoRefresh ? "bg-green-600 text-white" : "bg-slate-700 text-slate-300"}`}>
            {autoRefresh ? "Auto: ON" : "Auto: OFF"}
          </button>
          <button onClick={analyzeAllMarkets} disabled={kimiStatus.isAnalyzing}
            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 rounded-lg text-xs font-medium flex items-center space-x-1">
            <RefreshCw className={`w-3 h-3 ${kimiStatus.isAnalyzing ? "animate-spin" : ""}`} />
            <span>{kimiStatus.isAnalyzing ? "Analyzing..." : "Analyze All"}</span>
          </button>
        </div>
      </div>
      {/* Status Bar */}
      <div className="bg-slate-800/50 border-b border-slate-700 px-4 py-2 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1">
            <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
            <span className="text-slate-400">{isConnected ? "Connected" : "Disconnected"}</span>
          </div>
          <div className="text-slate-400">Markets: {kimiStatus.completedMarkets}/{kimiStatus.totalMarkets}</div>
          <div className="text-slate-400">Win Rate: <span className="text-green-400 font-bold">{winRate}%</span></div>
          <div className="text-slate-400">Trades: {completedTrades.length}</div>
        </div>
        <div className="text-slate-500">Last: {kimiStatus.lastAnalysisTime ? new Date(kimiStatus.lastAnalysisTime).toLocaleTimeString() : "Never"}</div>
      </div>
      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left - Market List */}
        <div className="w-1/2 border-r border-slate-700 overflow-y-auto"><div className="p-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center space-x-1"><Eye className="w-3 h-3" /><span>All Markets</span></h3>
          <div className="space-y-2">
            {SUPPORTED_ASSETS.map(asset => {
              const analysis = analyses[asset.symbol];
              const isBest = kimiStatus.bestPick?.symbol === asset.symbol;
              const isSelected = selectedMarket === asset.symbol;
              return (
                <div key={asset.symbol} onClick={() => setSelectedMarket(asset.symbol)}
                  className={`p-3 rounded-lg cursor-pointer transition-all ${
                    isBest ? "bg-purple-900/40 border border-purple-500" :
                    isSelected ? "bg-slate-700 border border-slate-600" :
                    "bg-slate-800 border border-slate-700 hover:border-slate-600"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center space-x-2">
                      {isBest && <Target className="w-3 h-3 text-purple-400" />}
                      <span className="text-sm font-medium">{asset.name}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      {analysis && getSignalIcon(analysis.signal)}
                      {analysis?.status === "analyzing" && <div className="w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />}
                      {analysis?.status === "error" && <AlertTriangle className="w-3 h-3 text-red-400" />}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">{analysis ? `$${analysis.currentPrice.toFixed(4)}` : "---"}</span>
                    {analysis && analysis.status === "complete" && <span className={`font-bold ${getConfidenceColor(analysis.confidence)}`}>{(analysis.confidence * 100).toFixed(0)}%</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div></div>
        {/* Right - Details */}
        <div className="w-1/2 overflow-y-auto">
          {kimiStatus.bestPick && (
            <div className="p-3 border-b border-slate-700 bg-purple-900/20">
              <h3 className="text-xs font-bold text-purple-400 uppercase mb-2 flex items-center space-x-1"><Target className="w-3 h-3" /><span>Best Pick</span></h3>
              <div className="p-3 bg-purple-900/30 rounded-lg border border-purple-500/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold">{kimiStatus.bestPick.name}</span>
                  <div className="flex items-center space-x-1">
                    {getSignalIcon(kimiStatus.bestPick.signal)}
                    <span className={`text-sm font-bold ${kimiStatus.bestPick.signal === "HIGHER" ? "text-green-400" : "text-red-400"}`}>{kimiStatus.bestPick.signal}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span>Confidence: <span className="text-white font-bold">{(kimiStatus.bestPick.confidence * 100).toFixed(0)}%</span></span>
                  <span>Expected Move: <span className="text-white font-bold">{(kimiStatus.bestPick.expectedMove * 100).toFixed(3)}%</span></span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">{kimiStatus.bestPick.analysis}</p>
              </div>
            </div>
          )}
          {/* Trade Outcomes */}
          <div className="p-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center space-x-1"><BarChart3 className="w-3 h-3" /><span>Trade Outcomes</span></h3>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {tradeOutcomes.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">No trades yet. Analysis runs every 30s.</p>
              ) : (
                tradeOutcomes.map(outcome => (
                  <div key={outcome.id} className="flex items-center justify-between p-2 bg-slate-800 rounded text-xs">
                    <div className="flex items-center space-x-2">
                      {outcome.result === "WON" ? <CheckCircle className="w-3 h-3 text-green-500" /> :
                       outcome.result === "LOST" ? <XCircle className="w-3 h-3 text-red-500" /> :
                       <Clock className="w-3 h-3 text-yellow-500" />}
                      <span className="font-medium">{outcome.symbol}</span>
                      <span className={outcome.signal === "HIGHER" ? "text-green-400" : "text-red-400"}>{outcome.signal}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-slate-400">
                      <span>{(outcome.confidence * 100).toFixed(0)}%</span>
                      <span>{outcome.duration}s</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          {/* Errors */}
          {kimiStatus.errors.length > 0 && (
            <div className="p-3 border-t border-slate-700">
              <h3 className="text-xs font-bold text-red-400 uppercase mb-2 flex items-center space-x-1"><AlertTriangle className="w-3 h-3" /><span>Errors</span></h3>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {kimiStatus.errors.map((error, i) => (
                  <div key={i} className="text-xs text-red-400 bg-red-900/20 p-2 rounded">{error}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
