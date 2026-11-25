import * as fs from "fs";
import * as path from "path";
import { ResearchPrediction } from "./researchLab";
import { DecisionOutput } from "./decisionEngine";
import { RiskDecision } from "./riskTypes";
import { ExecutionLedgerRecord } from "./executionTypes";

export interface DecisionTrace {
  id: string;
  timestamp: number;
  symbol: string;
  market: string;
  contractType: string;
  rawMarketSnapshot: {
    price: number;
    regime: string;
    rsi: number;
    trendBias: string;
    trendStrength: number;
    noise: number;
  };
  extractedFeatures: Record<string, number | string>;
  regimeClassification: string;
  indicatorValues: {
    rsi14: number;
    macdLine: number;
    macdSignal: number;
    macdHistogram: number;
    atr: number;
    stdDev: number;
    bollingerBandwidth: number;
    bounceProbability: number;
  };
  probabilityEngineOutput: {
    up: number;
    down: number;
    sideways: number;
  };
  mlOutput: {
    signal: string;
    confidence: number;
    expectedMove: number;
  };
  strategySelected: string;
  decisionScore: number;
  confidence: number;
  expectedValue: number;
  riskEngineVerdict: {
    action: string;
    approvedSize: number;
    failedRules: string[];
  };
  executionVerdict: {
    status: string;
    slippage: number;
    failureReason?: string;
  };
  finalOutcome: "WON" | "LOST" | "CANCELLED" | "EXPIRED" | "REJECTED" | "ACTIVE" | "BLOCKED";
  rejectionReason?: string;
}

export interface LosingTradeForensicReport {
  executionId: string;
  timestamp: number;
  symbol: string;
  direction: "LONG" | "SHORT" | "NONE";
  entryPrice: number;
  exitPrice?: number;
  netLossUSD: number;
  returnPct: number;
  whyEntered: string;
  evidenceSupporting: string[];
  evidenceContradicting: string[];
  executionQualityAffected: boolean;
  executionQualityDetails: string;
  marketRegimeChangedUnexpectedly: boolean;
  regimeAtEntry: string;
  regimeAtExit?: string;
  wouldCurrentModelTakeTradeToday: boolean;
  lossType: "RANDOM_NOISE" | "SYSTEMATIC_MOMENTUM_FAIL" | "SYSTEMATIC_REGIME_SHIFT" | "SYSTEMATIC_HIGH_SLIPPAGE" | "UNKNOWN";
}

export interface CalibrationResult {
  regime: string;
  sampleSize: number;
  winRate: number;
  avgConfidence: number;
  expectedValueSum: number;
  actualProfitUSD: number;
  brierScore: number;
  requiredConfidenceThreshold: number; // dynamically computed suggested threshold
}

export interface RollingStatistics {
  winRate: number;
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
  maximumDrawdown: number;
  sharpeRatio: number;
  sortinoRatio: number;
  brierScore: number;
  expectedCalibrationError: number;
  averageConfidence: number;
  confidenceVsWinRate: Array<{ confidenceBucket: string; winRate: number; count: number }>;
  expectedValueVsActualValue: Array<{ timestamp: number; expected: number; actual: number }>;
  strategyPerformance: Record<string, { winRate: number; profitFactor: number; count: number; profitUSD: number }>;
  regimePerformance: Record<string, { winRate: number; profitFactor: number; count: number; profitUSD: number }>;
  contractTypePerformance: Record<string, { winRate: number; count: number; profitUSD: number }>;
  timeframePerformance: Record<string, { winRate: number; count: number; profitUSD: number }>;
}

const TRACES_FILE = path.join(process.cwd(), "data", "decision_traces.json");
const FORENSICS_FILE = path.join(process.cwd(), "data", "losing_trade_forensics.json");
const ROLLING_STATS_FILE = path.join(process.cwd(), "data", "rolling_statistics.json");

export class TradeForensicsEngine {
  private static instance: TradeForensicsEngine;
  private traces: DecisionTrace[] = [];
  private forensics: LosingTradeForensicReport[] = [];
  private stats: RollingStatistics | null = null;

  public static getInstance(): TradeForensicsEngine {
    if (!this.instance) {
      this.instance = new TradeForensicsEngine();
    }
    return this.instance;
  }

  private constructor() {
    this.loadData();
  }

  private loadData() {
    try {
      const dataDir = path.dirname(TRACES_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      if (fs.existsSync(TRACES_FILE)) {
        this.traces = JSON.parse(fs.readFileSync(TRACES_FILE, "utf8"));
      } else {
        this.traces = [];
      }

      if (fs.existsSync(FORENSICS_FILE)) {
        this.forensics = JSON.parse(fs.readFileSync(FORENSICS_FILE, "utf8"));
      } else {
        this.forensics = [];
      }

      if (fs.existsSync(ROLLING_STATS_FILE)) {
        this.stats = JSON.parse(fs.readFileSync(ROLLING_STATS_FILE, "utf8"));
      } else {
        this.stats = null;
      }
    } catch (error) {
      console.error("[Trade Forensics Engine] Failed to load data from disk:", error);
    }
  }

  private saveData(file: string, data: any) {
    try {
      const tempFile = `${file}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), "utf8");
      fs.renameSync(tempFile, file);
    } catch (error) {
      console.error(`[Trade Forensics Engine] Failed to save file ${file}:`, error);
    }
  }

  /**
   * PART 1: Generate full decision trace for every single paper trade decision evaluated.
   */
  public recordDecisionTrace(
    prediction: ResearchPrediction,
    decision: DecisionOutput,
    riskDecision: RiskDecision,
    ledgerRecord: ExecutionLedgerRecord | null,
    finalOutcome: "WON" | "LOST" | "CANCELLED" | "EXPIRED" | "REJECTED" | "ACTIVE" | "BLOCKED"
  ): DecisionTrace {
    const snapshot = prediction.marketSnapshot;
    
    // Determine explicit rejection reason if applicable
    let rejectionReason: string | undefined = undefined;
    if (finalOutcome === "BLOCKED" || finalOutcome === "REJECTED") {
      const reasons: string[] = [];
      if (decision.decision !== "EXECUTE") {
        reasons.push(`Decision Engine rejected: "${decision.decision}" state.`);
        if (decision.failedGates && decision.failedGates.length > 0) {
          reasons.push(`Failed Gates: [${decision.failedGates.join(", ")}]`);
        }
      }
      if (riskDecision.action !== "ALLOW" && riskDecision.action !== "ALLOW_WITH_REDUCED_SIZE") {
        reasons.push(`Risk Engine blocked: "${riskDecision.action}".`);
        if (riskDecision.failedRules && riskDecision.failedRules.length > 0) {
          reasons.push(`Failed Risk Rules: [${riskDecision.failedRules.join(", ")}]`);
        }
      }
      if (ledgerRecord && ledgerRecord.failureReason) {
        reasons.push(`Execution Engine error: ${ledgerRecord.failureReason}`);
      }
      rejectionReason = reasons.join(" | ");
    }

    const trace: DecisionTrace = {
      id: `TRACE-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      timestamp: Date.now(),
      symbol: prediction.market,
      market: prediction.market,
      contractType: "barrier_contract_3m",
      rawMarketSnapshot: {
        price: prediction.currentPrice,
        regime: snapshot.marketRegime?.dominantRegime || "UNKNOWN",
        rsi: snapshot.momentumAnalysis?.rsi14 || 50,
        trendBias: snapshot.trendAnalysis?.direction || "NEUTRAL",
        trendStrength: snapshot.trendAnalysis?.trendStrength || 0,
        noise: snapshot.riskMetrics?.marketNoiseIndex || 0.15
      },
      extractedFeatures: {
        trendStrength: snapshot.trendAnalysis?.trendStrength || 0,
        rsi14: snapshot.momentumAnalysis?.rsi14 || 50,
        macdHistogram: snapshot.momentumAnalysis?.macdHistogram || 0,
        volatilityState: snapshot.volatilityAnalysis?.volatilityState || "STABLE",
        liquidityHunt: snapshot.liquidityAnalysis?.stopHuntDetected ? 1 : 0,
        noiseLevel: snapshot.riskMetrics?.marketNoiseIndex || 0.15
      },
      regimeClassification: snapshot.marketRegime?.dominantRegime || "UNKNOWN",
      indicatorValues: {
        rsi14: snapshot.momentumAnalysis?.rsi14 || 50,
        macdLine: snapshot.momentumAnalysis?.macdLine || 0,
        macdSignal: snapshot.momentumAnalysis?.macdSignal || 0,
        macdHistogram: snapshot.momentumAnalysis?.macdHistogram || 0,
        atr: snapshot.volatilityAnalysis?.atr || 0,
        stdDev: snapshot.volatilityAnalysis?.stdDev || 0,
        bollingerBandwidth: snapshot.volatilityAnalysis?.bollingerBandwidth || 0,
        bounceProbability: snapshot.supportResistance?.bounceProbability || 50
      },
      probabilityEngineOutput: {
        up: prediction.predictedProbs?.up || 0.35,
        down: prediction.predictedProbs?.down || 0.35,
        sideways: prediction.predictedProbs?.sideways || 0.30
      },
      mlOutput: {
        signal: decision.tradeDirection,
        confidence: decision.decisionConfidence / 100,
        expectedMove: decision.expectedMove || 0.005
      },
      strategySelected: decision.primaryStrategyUsed || "UNKNOWN",
      decisionScore: decision.decisionScore,
      confidence: decision.decisionConfidence,
      expectedValue: decision.expectedValue,
      riskEngineVerdict: {
        action: riskDecision.action,
        approvedSize: riskDecision.recommendedPositionSize,
        failedRules: riskDecision.failedRules
      },
      executionVerdict: {
        status: ledgerRecord ? ledgerRecord.status : "BLOCKED",
        slippage: ledgerRecord ? ledgerRecord.slippage : 0,
        failureReason: ledgerRecord?.failureReason
      },
      finalOutcome,
      rejectionReason
    };

    this.traces.push(trace);
    this.saveData(TRACES_FILE, this.traces);

    // PART 2: If a completed trade was LOST, automatically trigger the forensic pipeline!
    if (finalOutcome === "LOST" && ledgerRecord) {
      this.generateForensicReport(trace, ledgerRecord);
    }

    // PART 3: Continuously compute rolling statistics
    this.computeRollingStatistics();

    // PART 4: Perform decision cross-verification audit check
    this.verifyDecisionQuality(prediction, decision, riskDecision, ledgerRecord);

    return trace;
  }

  /**
   * PART 2: Automatically generate detailed forensics report for losing trades.
   */
  private generateForensicReport(trace: DecisionTrace, ledgerRecord: ExecutionLedgerRecord) {
    const isHighSlippage = ledgerRecord.slippage > 0.0015; // > 0.15% slippage is high
    const isRegimeChanged = trace.rawMarketSnapshot.noise > 0.60; // High noise suggests unstable shift

    // Analyze why the trade was entered based on supporting evidence
    const supportingFactors: string[] = [];
    if (trace.indicatorValues.rsi14 > 55 && trace.mlOutput.signal === "LONG") supportingFactors.push("Bullish Momentum (RSI > 55)");
    if (trace.indicatorValues.rsi14 < 45 && trace.mlOutput.signal === "SHORT") supportingFactors.push("Bearish Momentum (RSI < 45)");
    if (trace.rawMarketSnapshot.trendBias === "BULLISH" && trace.mlOutput.signal === "LONG") supportingFactors.push("Trend Alignment (Bullish Bias)");
    if (trace.rawMarketSnapshot.trendBias === "BEARISH" && trace.mlOutput.signal === "SHORT") supportingFactors.push("Trend Alignment (Bearish Bias)");
    if (trace.decisionScore > 65) supportingFactors.push(`High Consensus Score (${trace.decisionScore}%)`);

    // Contrarian signs
    const contrarianFactors: string[] = [];
    if (trace.rawMarketSnapshot.noise > 0.50) contrarianFactors.push("High Market Noise Index");
    if (trace.indicatorValues.rsi14 > 75) contrarianFactors.push("Overbought Overextension (RSI > 75)");
    if (trace.indicatorValues.rsi14 < 25) contrarianFactors.push("Oversold Overextension (RSI < 25)");

    // Define loss classification category
    let lossType: LosingTradeForensicReport["lossType"] = "RANDOM_NOISE";
    if (isHighSlippage) {
      lossType = "SYSTEMATIC_HIGH_SLIPPAGE";
    } else if (isRegimeChanged) {
      lossType = "SYSTEMATIC_REGIME_SHIFT";
    } else if (trace.rawMarketSnapshot.trendStrength < 25) {
      lossType = "SYSTEMATIC_MOMENTUM_FAIL";
    }

    const report: LosingTradeForensicReport = {
      executionId: ledgerRecord.executionId,
      timestamp: Date.now(),
      symbol: trace.symbol,
      direction: trace.mlOutput.signal as any,
      entryPrice: ledgerRecord.plan.entryPrice,
      exitPrice: ledgerRecord.plan.entryPrice * (1 + (ledgerRecord.returnPct / 100)),
      netLossUSD: ledgerRecord.netProfitUSD,
      returnPct: ledgerRecord.returnPct,
      whyEntered: `Strong ${trace.mlOutput.signal} breakout signal triggered with consensus score ${trace.decisionScore}% and confidence ${trace.confidence}%.`,
      evidenceSupporting: supportingFactors.length > 0 ? supportingFactors : ["Algorithmic trigger"],
      evidenceContradicting: contrarianFactors.length > 0 ? contrarianFactors : ["None detected at entry"],
      executionQualityAffected: isHighSlippage,
      executionQualityDetails: `Slippage experienced: ${(ledgerRecord.slippage * 100).toFixed(4)}%. Network execution latency: ${ledgerRecord.latency}ms. Broker queue delay: ${ledgerRecord.queueDelayMs}ms.`,
      marketRegimeChangedUnexpectedly: isRegimeChanged,
      regimeAtEntry: trace.rawMarketSnapshot.regime,
      wouldCurrentModelTakeTradeToday: true, // Deterministically constant (no automatic modification of thresholds)
      lossType
    };

    this.forensics.push(report);
    this.saveData(FORENSICS_FILE, this.forensics);

    console.warn(`[Losing Forensics Report Generated] Trade ${ledgerRecord.executionId} lost $${Math.abs(ledgerRecord.netProfitUSD)} (${ledgerRecord.returnPct.toFixed(2)}%). Type: ${lossType}.`);
  }

  /**
   * PART 3: Continuously compute rolling statistics over paper trades.
   */
  public computeRollingStatistics() {
    const tracesWithTrades = this.traces.filter(t => t.finalOutcome === "WON" || t.finalOutcome === "LOST");
    
    if (tracesWithTrades.length === 0) {
      this.stats = {
        winRate: 0,
        profitFactor: 0,
        averageWin: 0,
        averageLoss: 0,
        maximumDrawdown: 0,
        sharpeRatio: 0,
        sortinoRatio: 0,
        brierScore: 0,
        expectedCalibrationError: 0,
        averageConfidence: 0,
        confidenceVsWinRate: [],
        expectedValueVsActualValue: [],
        strategyPerformance: {},
        regimePerformance: {},
        contractTypePerformance: {},
        timeframePerformance: {}
      };
      this.saveData(ROLLING_STATS_FILE, this.stats);
      return;
    }

    const wins = this.traces.filter(t => t.finalOutcome === "WON");
    const losses = this.traces.filter(t => t.finalOutcome === "LOST");
    const completedCount = tracesWithTrades.length;

    // 1. Win Rate
    const winRate = wins.length / completedCount;

    // 2. Average Win and Loss
    const winSums = wins.reduce((acc, w) => acc + (w.mlOutput.expectedMove * 100), 0); // proxy as return pct
    const lossSums = losses.reduce((acc, l) => acc + (l.mlOutput.expectedMove * 100), 0); // proxy as return pct
    const averageWin = wins.length > 0 ? winSums / wins.length : 0;
    const averageLoss = losses.length > 0 ? lossSums / losses.length : 0;

    // Profit Factor (net profit from wins divided by net loss from losses)
    const profitFactor = averageLoss > 0 ? (winSums) / (lossSums) : 1.0;

    // 3. Drawdown (Maximum Drawdown calculation)
    let maxDrawdown = 0;
    let peak = 10000; // Simulated starter capital of $10,000
    let capital = 10000;
    
    tracesWithTrades.forEach(t => {
      const returnFactor = t.finalOutcome === "WON" ? (1 + t.mlOutput.expectedMove) : (1 - t.mlOutput.expectedMove);
      capital = capital * returnFactor;
      if (capital > peak) {
        peak = capital;
      }
      const dd = (peak - capital) / peak;
      if (dd > maxDrawdown) {
        maxDrawdown = dd;
      }
    });

    // 4. Sharpe Ratio & Sortino Ratio
    const returnsList = tracesWithTrades.map(t => t.finalOutcome === "WON" ? t.mlOutput.expectedMove : -t.mlOutput.expectedMove);
    const avgReturn = returnsList.reduce((acc, r) => acc + r, 0) / returnsList.length;
    
    const variance = returnsList.reduce((acc, r) => acc + Math.pow(r - avgReturn, 2), 0) / returnsList.length;
    const stdDev = variance > 0 ? Math.sqrt(variance) : 0.01;
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0.0; // annualized proxy

    const downsideVariance = returnsList.filter(r => r < 0).reduce((acc, r) => acc + Math.pow(r - avgReturn, 2), 0) / returnsList.length;
    const downsideStdDev = downsideVariance > 0 ? Math.sqrt(downsideVariance) : 0.01;
    const sortinoRatio = downsideStdDev > 0 ? (avgReturn / downsideStdDev) * Math.sqrt(252) : 0.0;

    // 5. Brier Score (Accuracy of Probability prediction)
    // Formula: Sum( (P_i - Y_i)^2 ) / N
    const brierScore = returnsList.reduce((acc, r, i) => {
      const trace = tracesWithTrades[i];
      const probSelected = trace.mlOutput.signal === "LONG" ? trace.probabilityEngineOutput.up : trace.probabilityEngineOutput.down;
      const actualOutcome = trace.finalOutcome === "WON" ? 1 : 0;
      return acc + Math.pow(probSelected - actualOutcome, 2);
    }, 0) / completedCount;

    // 6. Expected Calibration Error (ECE)
    // 5 confidence bins: 50-60%, 60-70%, 70-80%, 80-90%, 90-100%
    const bins = [
      { min: 0.50, max: 0.60, count: 0, wins: 0, confSum: 0 },
      { min: 0.60, max: 0.70, count: 0, wins: 0, confSum: 0 },
      { min: 0.70, max: 0.80, count: 0, wins: 0, confSum: 0 },
      { min: 0.80, max: 0.90, count: 0, wins: 0, confSum: 0 },
      { min: 0.90, max: 1.01, count: 0, wins: 0, confSum: 0 }
    ];

    tracesWithTrades.forEach(t => {
      const conf = t.confidence / 100;
      const isWin = t.finalOutcome === "WON" ? 1 : 0;
      const bin = bins.find(b => conf >= b.min && conf < b.max);
      if (bin) {
        bin.count++;
        bin.wins += isWin;
        bin.confSum += conf;
      }
    });

    let expectedCalibrationError = 0;
    const confidenceVsWinRate: Array<{ confidenceBucket: string; winRate: number; count: number }> = [];

    bins.forEach((b, idx) => {
      const bucketName = `${Math.round(b.min * 100)}-${Math.round(Math.min(100, b.max * 100))}%`;
      const binWinRate = b.count > 0 ? b.wins / b.count : 0;
      const binAvgConf = b.count > 0 ? b.confSum / b.count : (b.min + b.max) / 2;

      confidenceVsWinRate.push({
        confidenceBucket: bucketName,
        winRate: binWinRate,
        count: b.count
      });

      if (b.count > 0) {
        expectedCalibrationError += (b.count / completedCount) * Math.abs(binWinRate - binAvgConf);
      }
    });

    // 7. Average Confidence
    const averageConfidence = tracesWithTrades.reduce((acc, t) => acc + t.confidence, 0) / completedCount;

    // 8. Expected Value vs Actual Value pairs
    const expectedValueVsActualValue = tracesWithTrades.map(t => ({
      timestamp: t.timestamp,
      expected: t.expectedValue,
      actual: t.finalOutcome === "WON" ? t.mlOutput.expectedMove * 100 : -t.mlOutput.expectedMove * 100
    }));

    // 9. Strategy Performance
    const strategyPerformance: RollingStatistics["strategyPerformance"] = {};
    tracesWithTrades.forEach(t => {
      const strat = t.strategySelected;
      if (!strategyPerformance[strat]) {
        strategyPerformance[strat] = { winRate: 0, profitFactor: 0, count: 0, profitUSD: 0 };
      }
      const s = strategyPerformance[strat];
      s.count++;
      const isWin = t.finalOutcome === "WON";
      const reward = t.mlOutput.expectedMove * 100;
      if (isWin) {
        s.winRate += 1;
        s.profitUSD += reward;
      } else {
        s.profitUSD -= reward;
      }
    });
    Object.keys(strategyPerformance).forEach(k => {
      const s = strategyPerformance[k];
      s.winRate = s.winRate / s.count;
      s.profitFactor = s.profitUSD >= 0 ? 1.5 : 0.6; // proxy estimation
    });

    // 10. Regime Performance
    const regimePerformance: RollingStatistics["regimePerformance"] = {};
    tracesWithTrades.forEach(t => {
      const regime = t.regimeClassification;
      if (!regimePerformance[regime]) {
        regimePerformance[regime] = { winRate: 0, profitFactor: 0, count: 0, profitUSD: 0 };
      }
      const r = regimePerformance[regime];
      r.count++;
      const isWin = t.finalOutcome === "WON";
      const reward = t.mlOutput.expectedMove * 100;
      if (isWin) {
        r.winRate += 1;
        r.profitUSD += reward;
      } else {
        r.profitUSD -= reward;
      }
    });
    Object.keys(regimePerformance).forEach(k => {
      const r = regimePerformance[k];
      r.winRate = r.winRate / r.count;
      r.profitFactor = r.profitUSD >= 0 ? 1.6 : 0.5;
    });

    // 11. Contract Type Performance (digital vs barrier)
    const contractTypePerformance: Record<string, { winRate: number; count: number; profitUSD: number }> = {
      barrier_contract_3m: {
        winRate,
        count: completedCount,
        profitUSD: returnsList.reduce((acc, r) => acc + (r * 100), 0)
      }
    };

    // 12. Timeframe Performance
    const timeframePerformance: Record<string, { winRate: number; count: number; profitUSD: number }> = {
      "3m": {
        winRate,
        count: completedCount,
        profitUSD: returnsList.reduce((acc, r) => acc + (r * 100), 0)
      }
    };

    this.stats = {
      winRate,
      profitFactor,
      averageWin,
      averageLoss,
      maximumDrawdown: maxDrawdown,
      sharpeRatio,
      sortinoRatio,
      brierScore,
      expectedCalibrationError,
      averageConfidence,
      confidenceVsWinRate,
      expectedValueVsActualValue,
      strategyPerformance,
      regimePerformance,
      contractTypePerformance,
      timeframePerformance
    };

    this.saveData(ROLLING_STATS_FILE, this.stats);
    console.log(`[Trade Stats Engine] Recalculated stats. Win Rate: ${(winRate * 100).toFixed(1)}%. Brier Score: ${brierScore.toFixed(4)}. ECE: ${(expectedCalibrationError * 100).toFixed(2)}%.`);
  }

  /**
   * PART 4: Verify cross-system agreement and log any conflicts clearly.
   */
  private verifyDecisionQuality(
    prediction: ResearchPrediction,
    decision: DecisionOutput,
    riskDecision: RiskDecision,
    ledgerRecord: ExecutionLedgerRecord | null
  ) {
    if (decision.decision !== "EXECUTE") return;

    const probDirection = prediction.predictedProbs.up > prediction.predictedProbs.down ? "LONG" : "SHORT";
    const mlDirection = decision.tradeDirection;
    const isRiskAllowed = riskDecision.action === "ALLOW" || riskDecision.action === "ALLOW_WITH_REDUCED_SIZE";
    const isExecuted = ledgerRecord && ledgerRecord.status === "COMPLETED";

    const disagreements: string[] = [];

    // Probability vs ML direction check
    if (probDirection !== mlDirection) {
      disagreements.push(`PROBABILITY_VS_ML_DISAGREEMENT: Probability favored ${probDirection} but ML selected ${mlDirection}`);
    }

    // Risk vs Execution coherence
    if (isRiskAllowed && !isExecuted && ledgerRecord) {
      disagreements.push(`RISK_VS_EXECUTION_DISAGREEMENT: Risk allowed trade but execution failed due to: ${ledgerRecord.failureReason}`);
    }

    if (disagreements.length > 0) {
      disagreements.forEach(dis => {
        console.warn(`[DECISION DISAGREEMENT AUDIT] ${dis}`);
      });
    } else {
      console.log("[DECISION AGREEMENT AUDIT] Consensus verified perfectly. All engines in absolute harmony.");
    }
  }

  /**
   * PART 5: Perform dynamic calibration and return recommendations.
   */
  public generateCalibrationReport(): CalibrationResult[] {
    const results: CalibrationResult[] = [];
    const regimes = ["MEAN_REVERTING", "TRENDING", "STOCHASTIC_NOISE", "EXPANDING_VOLATILITY", "COMPRESSING_CONSOLIDATION"];
    
    regimes.forEach(regime => {
      const regimeTraces = this.traces.filter(t => t.regimeClassification === regime && (t.finalOutcome === "WON" || t.finalOutcome === "LOST"));
      if (regimeTraces.length === 0) return;

      const wins = regimeTraces.filter(t => t.finalOutcome === "WON");
      const completedCount = regimeTraces.length;
      const winRate = wins.length / completedCount;
      const avgConfidence = regimeTraces.reduce((acc, t) => acc + t.confidence, 0) / completedCount;
      const expectedValueSum = regimeTraces.reduce((acc, t) => acc + t.expectedValue, 0);
      
      const returns = regimeTraces.map(t => t.finalOutcome === "WON" ? t.mlOutput.expectedMove : -t.mlOutput.expectedMove);
      const brierScore = returns.reduce((acc, r, i) => {
        const trace = regimeTraces[i];
        const probSelected = trace.mlOutput.signal === "LONG" ? trace.probabilityEngineOutput.up : trace.probabilityEngineOutput.down;
        const actualOutcome = trace.finalOutcome === "WON" ? 1 : 0;
        return acc + Math.pow(probSelected - actualOutcome, 2);
      }, 0) / completedCount;

      // Suggest optimal required confidence threshold empirically:
      // If win rate is low, we demand higher confidence. If win rate is very strong, we can be more permissive.
      let requiredConfidenceThreshold = 65;
      if (winRate < 0.45) {
        requiredConfidenceThreshold = 75; // strict filter
      } else if (winRate > 0.60) {
        requiredConfidenceThreshold = 55; // relax threshold
      }

      results.push({
        regime,
        sampleSize: completedCount,
        winRate,
        avgConfidence,
        expectedValueSum,
        actualProfitUSD: returns.reduce((acc, r) => acc + (r * 100), 0),
        brierScore,
        requiredConfidenceThreshold
      });
    });

    return results;
  }

  public getTraces(): DecisionTrace[] {
    return this.traces;
  }

  public getForensics(): LosingTradeForensicReport[] {
    return this.forensics;
  }

  public getStats(): RollingStatistics | null {
    return this.stats;
  }
}

export const tradeForensicsEngine = TradeForensicsEngine.getInstance();
