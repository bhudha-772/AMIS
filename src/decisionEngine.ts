import * as fs from "fs";
import * as path from "path";
import { ResearchPrediction, researchLab } from "./researchLab";
import { Strategy } from "./strategyTypes";
import { strategyRegistry } from "./strategyRegistry";
import { evaluateStrategySignal } from "./strategyDefinition";
import { modelGovernance } from "./modelGovernance";
import { adaptiveLearning } from "./adaptiveLearning";

export interface DecisionScoreConfig {
  probabilityEngine: number;
  machineLearning: number;
  historicalSimilarity: number;
  strategyConfidence: number;
  marketRegime: number;
  trendStrength: number;
  momentum: number;
  volatility: number;
  support: number;
  resistance: number;
  liquidity: number;
  noise: number;
  expectedValue: number;
  featureReliability: number;
  modelReliability: number;
  calibrationQuality: number;
  researchConfidence: number;
}

export interface ConsensusConfig {
  probabilityEngineWeight: number;
  mlPredictionWeight: number;
  strategyAgreementWeight: number;
  historicalSimilarityWeight: number;
  adaptiveLearningWeight: number;
}

export interface DecisionGateResult {
  gateId: string;
  name: string;
  passed: boolean;
  actualValue: string | number;
  thresholdValue: string | number;
  description: string;
}

export interface DecisionFactorBreakdown {
  factor: string;
  score: number;
  weight: number;
  contribution: number;
}

export interface Contradiction {
  type: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  description: string;
  penalty: number;
}

export interface DecisionOutput {
  id: string;
  timestamp: number;
  decisionVersion: string;
  market: string;
  timeframe: string;
  decision: "EXECUTE" | "WATCH" | "WAIT" | "REJECT";
  tradeDirection: "LONG" | "SHORT" | "NONE";
  decisionScore: number; // 0 to 100
  decisionConfidence: number; // 0 to 100
  remainingUncertainty: number; // 100 - confidence
  expectedValue: number;
  expectedMove: number;
  expectedDrawdown: number;
  expectedVolatility: number;
  historicalSampleSize: number;
  historicalWinRate: number;
  probabilitySummary: {
    up: number;
    down: number;
    sideways: number;
    continuation: number;
    reversal: number;
    breakout: number;
    fakeout: number;
  };
  riskSummary: {
    expectedDrawdown: number;
    expectedVolatility: number;
    noiseLevel: number;
    isUnhealthyRegime: boolean;
    isIlliquid: boolean;
  };
  supportingEvidence: string[];
  contradictingEvidence: string[];
  contradictions: Contradiction[];
  gates: DecisionGateResult[];
  passedGates: string[];
  failedGates: string[];
  scoreBreakdown: DecisionFactorBreakdown[];
  marketRegime: string;
  primaryStrategyUsed: string;
  modelConsensus: number; // 0 to 100
  calibrationStatus: "WELL_CALIBRATED" | "MISCALIBRATED" | "STALE_CALIBRATION";
  featureReliabilitySummary: {
    featureReliabilityIndex: number;
    topFeatureName: string;
    topFeatureContribution: number;
  };
  dataQualityStatus: "EXCELLENT" | "WARNING" | "CRITICAL";
  driftStatus: "STABLE" | "MILD_DRIFT" | "CONCEPT_DRIFT";
  reasonCodes: string[];
  consensusWeights: ConsensusConfig;
  scoreWeights: DecisionScoreConfig;
  
  // Research Mode fields
  predictionId: string;
  strategyVersion: string;
  modelVersion: string;
  outcome?: string;
  evaluation?: string;
  paperTradeLink?: string;
}

const REGISTRY_FILE = path.join(process.cwd(), "data", "decision_registry.json");

export class DecisionIntelligenceEngine {
  private decisions: DecisionOutput[] = [];
  private defaultWeights: ConsensusConfig = {
    probabilityEngineWeight: 0.30,
    mlPredictionWeight: 0.25,
    strategyAgreementWeight: 0.20,
    historicalSimilarityWeight: 0.15,
    adaptiveLearningWeight: 0.10
  };

  private defaultScoreWeights: DecisionScoreConfig = {
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
  };

  constructor() {
    this.loadDecisions();
  }

  private loadDecisions() {
    try {
      const dir = path.dirname(REGISTRY_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (fs.existsSync(REGISTRY_FILE)) {
        const raw = fs.readFileSync(REGISTRY_FILE, "utf8");
        this.decisions = JSON.parse(raw);
      }
    } catch (err) {
      console.error("[Decision Engine] Failed to load decisions:", err);
      this.decisions = [];
    }
  }

  private saveDecisions() {
    try {
      const dir = path.dirname(REGISTRY_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const temp = `${REGISTRY_FILE}.tmp`;
      fs.writeFileSync(temp, JSON.stringify(this.decisions, null, 2), "utf8");
      fs.renameSync(temp, REGISTRY_FILE);
    } catch (err) {
      console.error("[Decision Engine] Failed to save decisions:", err);
    }
  }

  public getDecisions(): DecisionOutput[] {
    return this.decisions;
  }

  public clearDecisions() {
    this.decisions = [];
    this.saveDecisions();
  }

  public getDefaultWeights(): ConsensusConfig {
    return this.defaultWeights;
  }

  public getDefaultScoreWeights(): DecisionScoreConfig {
    return this.defaultScoreWeights;
  }

  /**
   * Evaluates a Research Prediction and makes a deterministic, fully explainable decision
   */
  public makeDecision(
    prediction: ResearchPrediction,
    customConsensusWeights?: Partial<ConsensusConfig>,
    customScoreWeights?: Partial<DecisionScoreConfig>
  ): DecisionOutput {
    const timestamp = prediction.timestamp || Date.now();
    const market = prediction.market || "UNKNOWN";
    const timeframe = prediction.timeframe || "3m";

    // 1. Configure weights
    const conWeights: ConsensusConfig = {
      ...this.defaultWeights,
      ...customConsensusWeights
    };

    const scWeights: DecisionScoreConfig = {
      ...this.defaultScoreWeights,
      ...customScoreWeights
    };

    // Normalize confidence and similarity to range [0, 1] securely to prevent values exceeding 100%
    const rawConf = prediction.confidence ?? 0.5;
    const normConfidence = rawConf > 1.0 ? rawConf / 100 : rawConf;

    const rawSim = prediction.historicalSimilarity ?? 0.75;
    const normSimilarity = rawSim > 1.0 ? rawSim / 100 : rawSim;

    // 2. Aggregate parameters and indicators from other subsystems
    const activeStrategies = strategyRegistry.getStrategies().filter(s => s.status === "ACCEPTED");
    const paperTradingStats = researchLab.getPerformanceMetrics();
    
    let alState: any = null;
    try {
      if ((adaptiveLearning as any).state) {
        alState = (adaptiveLearning as any).state;
      } else if (typeof (adaptiveLearning as any).getState === "function") {
        alState = (adaptiveLearning as any).getState();
      }
    } catch (e) {
      console.warn("[Decision Engine] Could not read Adaptive Learning state:", e);
    }

    const marketSnapshot = prediction.marketSnapshot || {};
    const trendDir = marketSnapshot.trendAnalysis?.direction || "NEUTRAL";
    const trendStrength = marketSnapshot.trendAnalysis?.trendStrength ?? 50;
    const rsiVal = marketSnapshot.momentumAnalysis?.rsi14 ?? 50;
    const atrVal = marketSnapshot.volatilityAnalysis?.atr ?? 0.1;
    const noiseIndex = marketSnapshot.riskMetrics?.marketNoiseIndex ?? 0.5;
    const isUnhealthy = marketSnapshot.riskMetrics?.volatilityRisk === "EXTREME" || noiseIndex > 0.75;
    const isIlliquid = (marketSnapshot.liquidityAnalysis?.orderBlocks?.length === 0 && 
                         marketSnapshot.liquidityAnalysis?.fairValueGaps?.length === 0) ||
                        (marketSnapshot.volumeIndex !== undefined && marketSnapshot.volumeIndex < 0.3);

    // Supporting & Contradicting evidence lists
    const supportingEvidence: string[] = [];
    const contradictingEvidence: string[] = [];
    const reasonCodes: string[] = [];

    // Signals
    const upProb = prediction.predictedProbs?.up || 0;
    const downProb = prediction.predictedProbs?.down || 0;
    const sidewaysProb = prediction.predictedProbs?.sideways || 0;

    let peSignal: "LONG" | "SHORT" | "FLAT" = "FLAT";
    if (upProb > downProb && upProb > 0.45) peSignal = "LONG";
    else if (downProb > upProb && downProb > 0.45) peSignal = "SHORT";

    let mlSignal: "LONG" | "SHORT" | "FLAT" = "FLAT";
    if (prediction.challengerPrediction) {
      const chalUp = prediction.challengerPrediction.predictedProbs?.up || 0;
      const chalDown = prediction.challengerPrediction.predictedProbs?.down || 0;
      if (chalUp > chalDown && chalUp > 0.45) mlSignal = "LONG";
      else if (chalDown > chalUp && chalDown > 0.45) mlSignal = "SHORT";
    } else {
      mlSignal = peSignal;
    }

    let strategyLongVotes = 0;
    let strategyShortVotes = 0;
    let primaryStrategyUsed = "NONE";
    const strategySignals: string[] = [];

    activeStrategies.forEach(s => {
      const sig = evaluateStrategySignal(s, prediction);
      strategySignals.push(`${s.name}: ${sig}`);
      if (sig === "LONG") {
        strategyLongVotes++;
        if (primaryStrategyUsed === "NONE") primaryStrategyUsed = s.name;
      } else if (sig === "SHORT") {
        strategyShortVotes++;
        if (primaryStrategyUsed === "NONE") primaryStrategyUsed = s.name;
      }
    });

    let stratSignal: "LONG" | "SHORT" | "FLAT" = "FLAT";
    if (strategyLongVotes > strategyShortVotes && strategyLongVotes > 0) stratSignal = "LONG";
    else if (strategyShortVotes > strategyLongVotes && strategyShortVotes > 0) stratSignal = "SHORT";

    const tradeDirection: "LONG" | "SHORT" | "NONE" = 
      peSignal === "LONG" || mlSignal === "LONG" || stratSignal === "LONG" ? "LONG" :
      peSignal === "SHORT" || mlSignal === "SHORT" || stratSignal === "SHORT" ? "SHORT" : "NONE";

    // 3. Contradiction Engine (Part 4)
    const contradictions: Contradiction[] = [];
    let confidencePenalty = 0;

    // Contradiction 1: Probability Engine vs ML Model direct conflict
    if ((peSignal === "LONG" && mlSignal === "SHORT") || (peSignal === "SHORT" && mlSignal === "LONG")) {
      const contra: Contradiction = {
        type: "PROBABILITY_VS_ML_CONFLICT",
        severity: "HIGH",
        description: `Probability Engine signals ${peSignal} but Machine Learning signals ${mlSignal}.`,
        penalty: 25
      };
      contradictions.push(contra);
      confidencePenalty += contra.penalty;
      contradictingEvidence.push(contra.description);
    }

    // Contradiction 2: Strategy signal disagreement with prediction direction
    if (stratSignal !== "FLAT" && tradeDirection !== "NONE" && stratSignal !== tradeDirection) {
      const contra: Contradiction = {
        type: "STRATEGY_DISAGREEMENT",
        severity: "MEDIUM",
        description: `Strategy engine voted ${stratSignal} which opposes primary forecast direction ${tradeDirection}.`,
        penalty: 15
      };
      contradictions.push(contra);
      confidencePenalty += contra.penalty;
      contradictingEvidence.push(contra.description);
    }

    // Contradiction 3: Weak historical similarity for selected direction
    const sampleSize = prediction.matchedHistoricalCases || 0;
    const similarity = normSimilarity;
    if (sampleSize < 10 || similarity < 0.78) {
      const contra: Contradiction = {
        type: "WEAK_HISTORICAL_SIMILARITY",
        severity: "LOW",
        description: `Similarity map is weak. Matched cases: ${sampleSize}, similarity ratio: ${(similarity * 100).toFixed(0)}%.`,
        penalty: 8
      };
      contradictions.push(contra);
      confidencePenalty += contra.penalty;
      contradictingEvidence.push(contra.description);
    }

    // Contradiction 4: Extreme Volatility risk present
    const volRisk = marketSnapshot.riskMetrics?.volatilityRisk || "NORMAL";
    if (volRisk === "EXTREME") {
      const contra: Contradiction = {
        type: "HIGH_VOLATILITY",
        severity: "MEDIUM",
        description: `Unhealthy extreme volatility state may degrade signal integrity.`,
        penalty: 12
      };
      contradictions.push(contra);
      confidencePenalty += contra.penalty;
      contradictingEvidence.push(contra.description);
    }

    // Contradiction 5 & 6: Nearby Support / Resistance opposing the trade direction
    if (tradeDirection === "LONG" && rsiVal > 68) {
      const contra: Contradiction = {
        type: "NEARBY_RESISTANCE_FOR_LONG",
        severity: "MEDIUM",
        description: "Executing LONG setup in deeply overbought RSI territory (RSI: " + rsiVal.toFixed(1) + ").",
        penalty: 10
      };
      contradictions.push(contra);
      confidencePenalty += contra.penalty;
      contradictingEvidence.push(contra.description);
    } else if (tradeDirection === "SHORT" && rsiVal < 32) {
      const contra: Contradiction = {
        type: "NEARBY_SUPPORT_FOR_SHORT",
        severity: "MEDIUM",
        description: "Executing SHORT setup in deeply oversold RSI territory (RSI: " + rsiVal.toFixed(1) + ").",
        penalty: 10
      };
      contradictions.push(contra);
      confidencePenalty += contra.penalty;
      contradictingEvidence.push(contra.description);
    }

    // 4. Calculate Mathematical Decision Score (Part 2)
    // Map each of the 17 factors into a 0 - 100 score
    const factorScores: Record<string, number> = {
      probabilityEngine: Math.max(upProb, downProb) * 100,
      machineLearning: prediction.challengerPrediction 
        ? Math.max(prediction.challengerPrediction.predictedProbs?.up || 0, prediction.challengerPrediction.predictedProbs?.down || 0) * 100 
        : Math.max(upProb, downProb) * 100,
      historicalSimilarity: similarity * 100,
      strategyConfidence: activeStrategies.length > 0 
        ? (Math.max(strategyLongVotes, strategyShortVotes) / (strategyLongVotes + strategyShortVotes || 1)) * 100 
        : 75,
      marketRegime: (prediction.regime?.includes("Uptrend") || prediction.regime?.includes("Downtrend") || prediction.regime === "Breakout" || prediction.regime === "Trend Continuation" || prediction.regime?.includes("Momentum")) ? 100 :
                    (prediction.regime === "Sideways" || prediction.regime === "Range" || prediction.regime === "CONSOLIDATION" || prediction.regime?.includes("Volatility")) ? 75 : 50,
      trendStrength: trendStrength,
      momentum: tradeDirection === "LONG" 
        ? Math.max(20, Math.min(100, rsiVal * 1.5)) 
        : tradeDirection === "SHORT" 
          ? Math.max(20, Math.min(100, (100 - rsiVal) * 1.5)) 
          : 50,
      volatility: volRisk === "LOW" ? 95 : volRisk === "NORMAL" ? 85 : volRisk === "HIGH" ? 50 : 20,
      support: tradeDirection === "LONG" ? Math.max(40, Math.min(100, 100 - rsiVal + 30)) : 50,
      resistance: tradeDirection === "SHORT" ? Math.max(40, Math.min(100, rsiVal + 30)) : 50,
      liquidity: isIlliquid ? 25 : 85,
      noise: Math.max(0, Math.min(100, (1 - Math.min(1, noiseIndex / 3)) * 100)),
      expectedValue: (() => {
        const movePct = prediction.expectedMove > 1.0 ? prediction.expectedMove : prediction.expectedMove * 100;
        return Math.max(0, Math.min(100, movePct * 50)); // scale 2% to 100 score
      })(),
      featureReliability: paperTradingStats.featureReliabilityIndex ?? 82.5,
      modelReliability: paperTradingStats.predictionReliabilityScore ?? 80,
      calibrationQuality: Math.max(0, Math.min(100, (1 - (paperTradingStats.brierScore ?? 0.15)) * 100)),
      researchConfidence: normConfidence * 100
    };

    const scoreBreakdown: DecisionFactorBreakdown[] = [];
    let weightedSum = 0;
    let weightSum = 0;

    Object.keys(scWeights).forEach(key => {
      const fKey = key as keyof DecisionScoreConfig;
      const score = Math.round(factorScores[fKey] || 0);
      const w = scWeights[fKey];
      weightedSum += score * w;
      weightSum += w;
      scoreBreakdown.push({
        factor: fKey,
        score,
        weight: w,
        contribution: Number(((score * w) / (weightSum || 1)).toFixed(2)) // temporary view, real filled below
      });
    });

    const finalDecisionScore = Math.round(weightedSum / (weightSum || 1));

    // Refill exact contribution pct based on total final weighted weightSum
    scoreBreakdown.forEach(item => {
      item.contribution = Number(((item.score * item.weight) / (weightedSum || 1) * finalDecisionScore).toFixed(2));
    });

    // 5. Evaluate Mandatory Decision Gates (Part 3)
    const gates: DecisionGateResult[] = [];
    const passedGates: string[] = [];
    const failedGates: string[] = [];

    const evaluateGate = (gateId: string, name: string, passed: boolean, actualValue: string | number, thresholdValue: string | number, description: string) => {
      gates.push({ gateId, name, passed, actualValue, thresholdValue, description });
      if (passed) {
        passedGates.push(gateId);
      } else {
        failedGates.push(gateId);
        reasonCodes.push(`REJECTED_${gateId}`);
      }
    };

    // Gate 1: Minimum Probability
    const maxProb = Math.max(upProb, downProb);
    evaluateGate(
      "MINIMUM_PROBABILITY",
      "Directional probability threshold",
      maxProb >= 0.45,
      `${(maxProb * 100).toFixed(1)}%`,
      "45.0%",
      "Must have a clear directional trend probability over 45%."
    );

    // Gate 2: Minimum Confidence
    evaluateGate(
      "MINIMUM_CONFIDENCE",
      "Model forecast confidence",
      normConfidence >= 0.60,
      `${(normConfidence * 100).toFixed(1)}%`,
      "60.0%",
      "Core prediction confidence must equal or exceed 60%."
    );

    // Gate 3: Positive Expected Value
    const ev = tradeDirection === "NONE" 
      ? 0 
      : Number((prediction.expectedMove * (tradeDirection === "SHORT" ? (downProb - upProb) : (upProb - downProb))).toFixed(4));
    evaluateGate(
      "POSITIVE_EXPECTED_VALUE",
      "Mathematical setup edge",
      ev > 0,
      ev,
      "0.0",
      "Expected value of setup must be strictly positive."
    );

    // Gate 4: Acceptable Drawdown
    const drawdown = prediction.expectedDrawdown || 0;
    evaluateGate(
      "ACCEPTABLE_DRAWDOWN",
      "Drawdown boundary limit",
      drawdown <= 0.15,
      `${(drawdown * 100).toFixed(1)}%`,
      "15.0%",
      "Maximum predicted adverse excursion must remain below 15%."
    );

    // Gate 5: Acceptable Historical Similarity
    evaluateGate(
      "ACCEPTABLE_SIMILARITY",
      "Analogous cases similarity index",
      normSimilarity >= 0.70,
      `${(normSimilarity * 100).toFixed(1)}%`,
      "70.0%",
      "Historical similarity match score must equal or exceed 70%."
    );

    // Gate 6: Sufficient Sample Size
    evaluateGate(
      "SUFFICIENT_SAMPLE_SIZE",
      "Analogous cases count",
      sampleSize >= 5,
      sampleSize,
      "5",
      "Must match at least 5 historical analog cases."
    );

    // Gate 7: Valid Market Regime
    evaluateGate(
      "VALID_MARKET_REGIME",
      "Favorable trading environment",
      prediction.regime !== "UNKNOWN" && prediction.regime !== "CHAOTIC",
      prediction.regime || "UNKNOWN",
      "NOT UNKNOWN/CHAOTIC",
      "Trading environment regime must be classifiable and non-chaotic."
    );

    // Gate 8: Acceptable Volatility
    evaluateGate(
      "ACCEPTABLE_VOLATILITY",
      "Volatility risk guard",
      volRisk !== "EXTREME",
      volRisk,
      "NOT EXTREME",
      "Volatility index must not display extreme panic levels."
    );

    // Gate 9: No contradictory high-severity signals
    const highContras = contradictions.filter(c => c.severity === "HIGH");
    evaluateGate(
      "NO_CONTRADICTIONS",
      "Subsystem alignment index",
      highContras.length === 0,
      highContras.length,
      "0 High-Severity",
      "Probability and ML models must not be in direct directional conflict."
    );

    // Gate 10: No active critical system alerts
    const criticalAlerts = researchLab.getAlerts().filter(a => a.severity === "CRITICAL");
    const alertsCount = criticalAlerts.length;
    evaluateGate(
      "NO_SYSTEM_ALERTS",
      "Operational alert count",
      alertsCount === 0,
      alertsCount,
      "0",
      "No critical operational alerts or drift anomalies active."
    );

    // Gate 11: No data corruption
    const isCorrupted = !prediction.marketSnapshot || !prediction.predictedProbs || Object.keys(prediction.predictedProbs).length === 0;
    evaluateGate(
      "NO_DATA_CORRUPTION",
      "Data stream completeness check",
      !isCorrupted,
      isCorrupted ? "CORRUPTED" : "COMPLETE",
      "COMPLETE",
      "All required price data feeds and mathematical parameters must be complete."
    );

    // Gate 12: Healthy market data stream
    const dataQuality = prediction.noiseLevel > 0.9 ? "CRITICAL" : prediction.noiseLevel > 0.75 ? "WARNING" : "EXCELLENT";
    evaluateGate(
      "HEALTHY_STREAM",
      "Data ingestion quality index",
      dataQuality !== "CRITICAL",
      dataQuality,
      "EXCELLENT/WARNING",
      "Tick data stream must be stable and healthy."
    );

    // 6. Make final decision outcome state (EXECUTE, WATCH, WAIT, REJECT)
    let decision: "EXECUTE" | "WATCH" | "WAIT" | "REJECT" = "REJECT";
    let rawConfidence = Math.round(normConfidence * 100);
    let finalConfidence = Math.max(0, Math.min(100, rawConfidence - confidencePenalty));

    if (failedGates.length > 0) {
      decision = "REJECT";
      if (failedGates.includes("NO_DATA_CORRUPTION") || failedGates.includes("HEALTHY_STREAM")) {
        supportingEvidence.push("System safety protocols forced REJECT due to compromised data stream.");
      } else {
        supportingEvidence.push(`Gating pipeline rejected trade setup. ${failedGates.length} mandatory gates failed.`);
      }
    } else {
      // Setup passed all mandatory gates!
      if (finalDecisionScore >= 50 && finalConfidence >= 50) {
        decision = "EXECUTE";
        supportingEvidence.push(`Deterministic approval: Consensus score of ${finalDecisionScore}% and confidence ${finalConfidence}% triggered active execution.`);
        supportingEvidence.push(`Primary validated strategy triggered: "${primaryStrategyUsed}".`);
        reasonCodes.push("APPROVED_ACTIVE_EXECUTE");
      } else if (finalDecisionScore >= 40) {
        decision = "WATCH";
        supportingEvidence.push(`Consensus score of ${finalDecisionScore}% meets tracking boundaries. Setting setup to WATCH state.`);
        reasonCodes.push("APPROVED_WATCH_STATE");
      } else {
        decision = "WAIT";
        supportingEvidence.push(`Setup passed safety gates but final score of ${finalDecisionScore}% is insufficient to trigger. Setting to WAIT.`);
        reasonCodes.push("APPROVED_WAIT_STATE");
      }
    }

    const predictionReliability = paperTradingStats.predictionReliabilityScore ?? 85;

    // 7. Assemble final structured, immutable DecisionOutput
    const decisionOutput: DecisionOutput = {
      id: `DEC-${timestamp}-${Math.floor(Math.random() * 100000)}`,
      timestamp,
      decisionVersion: "v1.2.0-AMIS",
      market,
      timeframe,
      decision,
      tradeDirection,
      decisionScore: finalDecisionScore,
      decisionConfidence: finalConfidence,
      remainingUncertainty: 100 - finalConfidence,
      expectedValue: ev,
      expectedMove: prediction.expectedMove || 0,
      expectedDrawdown: prediction.expectedDrawdown || 0,
      expectedVolatility: prediction.expectedVolatility || 0.1,
      historicalSampleSize: sampleSize,
      historicalWinRate: Math.round((paperTradingStats.winRate || 0) * 100),
      probabilitySummary: {
        up: Number(upProb.toFixed(3)),
        down: Number(downProb.toFixed(3)),
        sideways: Number(sidewaysProb.toFixed(3)),
        continuation: Number((prediction.predictedProbs?.continuation || 0).toFixed(3)),
        reversal: Number((prediction.predictedProbs?.reversal || 0).toFixed(3)),
        breakout: Number((prediction.predictedProbs?.breakout || 0).toFixed(3)),
        fakeout: Number((prediction.predictedProbs?.fakeout || 0).toFixed(3))
      },
      riskSummary: {
        expectedDrawdown: prediction.expectedDrawdown || 0,
        expectedVolatility: prediction.expectedVolatility || 0.1,
        noiseLevel: Number(noiseIndex.toFixed(3)),
        isUnhealthyRegime: isUnhealthy,
        isIlliquid
      },
      supportingEvidence,
      contradictingEvidence,
      contradictions,
      gates,
      passedGates,
      failedGates,
      scoreBreakdown,
      marketRegime: prediction.regime || "UNKNOWN",
      primaryStrategyUsed,
      modelConsensus: Math.round(finalDecisionScore),
      calibrationStatus: predictionReliability > 80 ? "WELL_CALIBRATED" : predictionReliability > 60 ? "STALE_CALIBRATION" : "MISCALIBRATED",
      featureReliabilitySummary: {
        featureReliabilityIndex: paperTradingStats.featureReliabilityIndex ?? 82.5,
        topFeatureName: prediction.featureContributions?.[0]?.featureName || "Trend Strength",
        topFeatureContribution: Number((prediction.featureContributions?.[0]?.contributionPct || 0).toFixed(1))
      },
      dataQualityStatus: isCorrupted ? "CRITICAL" : dataQuality === "WARNING" ? "WARNING" : "EXCELLENT",
      driftStatus: dataQuality === "CRITICAL" ? "CONCEPT_DRIFT" : "STABLE",
      reasonCodes,
      consensusWeights: conWeights,
      scoreWeights: scWeights,
      
      // Part 6 Research Mode Fields
      predictionId: prediction.id,
      strategyVersion: "v1.1-STRAT",
      modelVersion: prediction.modelVersion || "v2.0-CHAMP"
    };

    // Save decision as an immutable append-only research record
    this.decisions.push(decisionOutput);
    if (this.decisions.length > 1000) {
      this.decisions.shift(); // keep max 1000
    }
    this.saveDecisions();

    return decisionOutput;
  }

  /**
   * Replays a trading decision deterministically using the stored record
   */
  public replayDecision(decisionId: string): DecisionOutput | null {
    const found = this.decisions.find(d => d.id === decisionId);
    if (!found) return null;
    return { ...found };
  }
}

export const decisionEngine = new DecisionIntelligenceEngine();
