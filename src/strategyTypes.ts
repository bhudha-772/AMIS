export type LogicalOperator = "AND" | "OR" | "NOT";
export type ComparisonOperator = "LT" | "LTE" | "GT" | "GTE" | "EQ" | "NEQ" | "BETWEEN";

export interface RangeCondition {
  field: string; // e.g. "predictedProbs.up", "confidence", "marketSnapshot.momentumAnalysis.rsi14"
  operator: ComparisonOperator;
  value: number | string; // value or upper-bound for BETWEEN
  value2?: number; // secondary value for BETWEEN
}

export interface ConditionGroup {
  operator: LogicalOperator;
  conditions: (RangeCondition | ConditionGroup)[];
}

export interface Strategy {
  id: string;
  name: string;
  version: string;
  description: string;
  conditions: ConditionGroup; // Root logic
  creationDate: number;
  datasetVersion: string;
  featureVersion: string;
  author: string;
  status: "ACCEPTED" | "REJECTED" | "EXPERIMENTAL";
  scientificNotes: string;
  explainability: {
    whyItWorks: string;
    whenItWorks: string;
    whenItFails: string;
    supportingIndicators: string[];
    contradictingIndicators: string[];
    typicalRegimes: string[];
  };
}

export interface BacktestTrade {
  predictionId: string;
  timestamp: number;
  direction: "LONG" | "SHORT" | "FLAT";
  entryPrice: number;
  exitPrice: number;
  pctChange: number;
  pnl: number;
  resolvedAt: number;
  holdingTime: number; // in minutes/hours
  wasWin: boolean;
  maxDrawdown: number;
}

export interface PerformanceMetrics {
  winRate: number;
  lossRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  expectedValue: number; // average return
  profitFactor: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  avgHoldingTime: number; // minutes
  tradeFrequency: number; // trades per day
  exposure: number; // percentage of time in trades
  riskRewardRatio: number;
  calibrationScore: number; // difference in expected/actual
  brierScore: number;
  totalReturn: number;
}

export interface BaselineComparison {
  name: string;
  metrics: PerformanceMetrics;
  statDifferencePValue: number; // significance p-value
  significantImprovement: boolean;
}

export interface StressTestResult {
  regime: string; // Trending, Ranging, High Vol, Low Vol, etc.
  numTrades: number;
  winRate: number;
  totalReturn: number;
  profitFactor: number;
  maxDrawdown: number;
  robustnessScore: number; // 0 to 100
}

export interface StrategyEvaluation {
  strategyId: string;
  runDate: number;
  metrics: PerformanceMetrics;
  baselines: BaselineComparison[];
  stressTests: StressTestResult[];
  equityCurve: { timestamp: number; equity: number }[];
  drawdownCurve: { timestamp: number; drawdown: number }[];
  isStable: boolean;
  reproducible: boolean;
}

/* ============================================================================
   Volume Profile + Point of Control (POC) Types
   Supports the "Market Structure + Fixed Range Volume Profile Pullback"
   Higher/Lower strategy entry concept.
   ============================================================================ */

export interface VolumeProfileBin {
  price: number;
  volume: number;      // tick volume for Deriv/MT5, real volume for Binance
  touchCount: number;  // how many candles touched this price bin
}

export interface FixedRangeVolumeProfile {
  rangeStart: number;   // swing low (bullish) or swing high (bearish) price
  rangeEnd: number;     // swing high (bullish) or swing low (bearish) price
  direction: 'BULLISH' | 'BEARISH';
  bins: VolumeProfileBin[];
  poc: VolumeProfileBin;                    // highest-volume price bin
  pocZone: { top: number; bottom: number }; // POC ± half bin size buffer
  totalVolume: number;
  binCount: number;
}

export interface PocReaction {
  priceReturnedToPoc: boolean;
  reactionConfirmed: boolean;
  reactionType: 'BOUNCE' | 'REJECTION' | 'BREAKTHROUGH' | 'NONE';
  confirmationCandleIndex: number;  // index into recent candles where reaction confirmed
  entryPrice: number;               // suggested entry price at POC
  stopLossPrice: number;            // suggested stop loss based on structure
  takeProfit1: number;              // first target
  takeProfit2: number;              // second target
}

export interface VolumeProfileAnalysis {
  profile: FixedRangeVolumeProfile | null;
  reaction: PocReaction | null;
  pocAlignedBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number; // 0-100, combines structure bias + POC reaction strength
  analysisTimestamp?: number;
  symbol?: string;
  provider?: string;
}
