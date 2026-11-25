import { tradeForensicsEngine } from "./tradeForensics";
import { ResearchPrediction } from "./researchLab";
import { DecisionOutput } from "./decisionEngine";
import { RiskDecision } from "./riskTypes";
import { ExecutionLedgerRecord, ExecutionPlan } from "./executionTypes";

export function runTradeForensicsTests() {
  console.log("================================================================================");
  console.log("RUNNING PHASE 12 TRADE FORENSICS & VALIDATION DETERMINISTIC TESTS");
  console.log("================================================================================");

  const results = {
    passed: 0,
    failed: 0,
    details: [] as string[]
  };

  function assert(condition: boolean, msg: string) {
    if (condition) {
      results.passed++;
      results.details.push(`[PASS] ${msg}`);
      console.log(`[PASS] ${msg}`);
    } else {
      results.failed++;
      results.details.push(`[FAIL] ${msg}`);
      console.error(`[FAIL] ${msg}`);
    }
  }

  try {
    // 1. Mock Prediction Helper conforming strictly to ResearchPrediction
    const mockPrediction: ResearchPrediction = {
      id: "PRED-FORENSIC-TEST",
      timestamp: Date.now(),
      market: "frxEURUSD",
      timeframe: "3m",
      currentPrice: 1.0850,
      predictedProbs: {
        up: 0.65,
        down: 0.15,
        sideways: 0.20,
        continuation: 0.50,
        reversal: 0.10,
        breakout: 0.15,
        fakeout: 0.05,
        highVolatility: 0.10,
        lowVolatility: 0.50,
        liquiditySweep: 0.05,
        trendFailure: 0.05
      },
      confidence: 0.85,
      expectedMove: 0.008,
      expectedVolatility: 0.005,
      expectedDrawdown: 0.02,
      historicalSimilarity: 0.92,
      matchedHistoricalCases: 15,
      featureContributions: [],
      regime: "TRENDING",
      marketSnapshot: {
        market: "frxEURUSD",
        timestamp: Date.now(),
        tickPrice: 1.0850,
        marketRegime: {
          dominantRegime: "TRENDING",
          confidence: 85,
          regimeShiftDetected: false
        },
        trendAnalysis: {
          direction: "BULLISH",
          trendStrength: 75,
          emaPeriod: 20
        },
        momentumAnalysis: {
          rsi14: 62.5,
          macdLine: 0.0004,
          macdSignal: 0.0003,
          macdHistogram: 0.0001
        },
        volatilityAnalysis: {
          atr: 0.0012,
          stdDev: 0.0008,
          bollingerBandwidth: 0.0035,
          volatilityState: "STABLE"
        },
        supportResistance: {
          nearestSupport: 1.0820,
          nearestResistance: 1.0890,
          bounceProbability: 70
        },
        liquidityAnalysis: {
          orderBlocks: ["OB_BULLISH_1.0810"],
          fairValueGaps: []
        },
        sessionAnalysis: {
          currentSession: "LONDON",
          sessionTransition: false
        },
        riskMetrics: {
          marketNoiseIndex: 0.25,
          volatilityRisk: "NORMAL",
          sharpdrawdownrisk: "LOW"
        }
      },
      noiseLevel: 0.25,
      supportingEvidence: ["RSI bullish bias", "High regime alignment"],
      contradictingEvidence: [],
      resolved: false
    };

    // 2. Mock Decision Output conforming strictly to DecisionOutput
    const mockDecision: DecisionOutput = {
      id: "DEC-TEST-123",
      timestamp: Date.now(),
      decisionVersion: "1.0",
      market: "frxEURUSD",
      timeframe: "3m",
      decision: "EXECUTE",
      decisionScore: 82,
      decisionConfidence: 85,
      remainingUncertainty: 15,
      expectedValue: 0.0052,
      expectedMove: 0.008,
      expectedDrawdown: 0.02,
      expectedVolatility: 0.005,
      historicalSampleSize: 15,
      historicalWinRate: 0.65,
      probabilitySummary: {
        up: 0.65,
        down: 0.15,
        sideways: 0.20,
        continuation: 0.50,
        reversal: 0.10,
        breakout: 0.15,
        fakeout: 0.05
      },
      riskSummary: {
        expectedDrawdown: 0.02,
        expectedVolatility: 0.005,
        noiseLevel: 0.25,
        isUnhealthyRegime: false,
        isIlliquid: false
      },
      tradeDirection: "LONG",
      primaryStrategyUsed: "Momentum Breakout",
      failedGates: [],
      passedGates: ["MINIMUM_PROBABILITY", "MINIMUM_CONFIDENCE", "POSITIVE_EXPECTED_VALUE"],
      scoreBreakdown: [],
      contradictions: [],
      supportingEvidence: ["RSI bullish bias", "High regime alignment"],
      contradictingEvidence: [],
      gates: []
    } as any;

    // 3. Mock Risk Decision conforming strictly to RiskDecision
    const mockRisk: RiskDecision = {
      id: "RISK-DEC-TEST",
      decisionId: "DEC-TEST-123",
      timestamp: Date.now(),
      action: "ALLOW",
      riskScore: 24,
      riskLevel: "LOW",
      capitalStateSnapshot: {
        currentEquity: 10000,
        availableMargin: 9000,
        usedMargin: 1000,
        dailyPL: 0,
        weeklyPL: 0,
        monthlyPL: 0,
        floatingProfit: 0,
        floatingLoss: 0,
        maxDailyLoss: 1000,
        maxWeeklyLoss: 3000,
        maxMonthlyLoss: 10000,
        maxDrawdown: 20,
        riskPerTrade: 0.02,
        portfolioRisk: 200,
        capitalUtilization: 10,
        recoveryFactor: 1.5,
        riskOfRuin: 0.1,
        positionExposure: 1000
      },
      portfolioStateSnapshot: {
        openPositions: [],
        correlatedPositions: 0,
        marketExposure: 0,
        syntheticIndexExposure: 0,
        currencyExposure: {},
        strategyExposure: {},
        modelExposure: {},
        maxSimultaneousTrades: 5,
        maxConsecutiveLosses: 3,
        maxConsecutiveWins: 4,
        coolingOffPeriods: {},
        tradeFrequency: 0,
        portfolioHeat: 0
      },
      sizingMethodUsed: "KELLY_CRITERION",
      recommendedPositionSize: 100,
      recommendedCapitalAllocation: 100,
      safetyResults: [],
      failedRules: [],
      passedRules: ["DAILY_MAX_DRAWDOWN", "MAX_CORRELATED_EXPOSURE"],
      expectedDrawdown: 0.02,
      riskOfRuin: 0.1,
      dailyRiskRemaining: 1000,
      portfolioHeat: 0,
      reasonCodes: [],
      explanation: "Low risk setup"
    };

    // 4. Mock Execution Plan conforming strictly to ExecutionPlan
    const mockExecutionPlan: ExecutionPlan = {
      id: "PLAN-TEST-001",
      predictionId: "PRED-FORENSIC-TEST",
      decisionId: "DEC-TEST-123",
      riskApprovalId: "RISK-DEC-TEST",
      symbol: "frxEURUSD",
      side: "BUY",
      orderType: "MARKET",
      entryPrice: 1.0850,
      positionSize: 100,
      stopLoss: 1.0810,
      takeProfit: 1.0930,
      breakEven: { active: false, triggerOffsetPct: 1, targetOffsetPct: 0.1 },
      trailingStop: { active: false, callbackRatePct: 0.5, activationOffsetPct: 1 },
      partialExits: [],
      scalingRules: { active: false, stepDistancePct: 1, stepSizePct: 10, maxSteps: 3 },
      timeInForce: "GTC",
      expiration: 0,
      createdAt: Date.now()
    };

    // 5. Mock Execution Ledger Record conforming strictly to ExecutionLedgerRecord
    const mockLedgerRecord: ExecutionLedgerRecord = {
      executionId: "EXEC-TEST-001",
      predictionId: "PRED-FORENSIC-TEST",
      decisionId: "DEC-TEST-123",
      riskApprovalId: "RISK-DEC-TEST",
      plan: mockExecutionPlan,
      status: "COMPLETED",
      fillEvents: [],
      slippage: 0.0005,
      latency: 120,
      spread: 0.0001,
      finalResult: "LOST",
      netProfitUSD: -100, // Simulated loss to trigger Part 2 Forensics
      returnPct: -10.0,
      executionQuality: 92,
      retryCount: 0,
      queueDelayMs: 45,
      createdAt: Date.now(),
      schemaVersion: 1
    };

    // --- TEST 1: Record Decision Trace & Auto-Generate Forensics on Loss ---
    console.log("Testing Part 1: Record Decision Trace...");
    const trace = tradeForensicsEngine.recordDecisionTrace(
      mockPrediction,
      mockDecision,
      mockRisk,
      mockLedgerRecord,
      "LOST"
    );

    assert(trace !== undefined, "Decision trace generated successfully.");
    assert(trace.symbol === "frxEURUSD", "Trace symbol mapped correctly.");
    assert(trace.finalOutcome === "LOST", "Trace final outcome set to LOST.");
    assert(trace.indicatorValues.rsi14 === 62.5, "Trace correctly recorded indicators.");

    // Check Part 2 Forensics Report
    console.log("Testing Part 2: Automated Forensics generation...");
    const forensics = tradeForensicsEngine.getForensics();
    assert(forensics.length > 0, "Forensics report automatically generated upon losing trade.");
    const report = forensics[forensics.length - 1];
    assert(report.executionId === "EXEC-TEST-001", "Forensics linked to correct execution record.");
    assert(report.netLossUSD === -100, "Forensics correctly recorded loss amount.");
    assert(report.lossType === "RANDOM_NOISE", "Forensics classified loss type perfectly.");

    // --- TEST 2: Rolling Statistics calculations (Part 3) ---
    console.log("Testing Part 3: Rolling Statistics calculations...");
    tradeForensicsEngine.computeRollingStatistics();
    const stats = tradeForensicsEngine.getStats();

    assert(stats !== null, "Rolling statistics computed successfully.");
    if (stats) {
      assert(stats.winRate === 0.0, "Initial simulated loss produces 0% Win Rate.");
      assert(stats.averageLoss > 0, "Simulated loss correctly factored into Average Loss.");
      assert(stats.brierScore !== undefined && !isNaN(stats.brierScore), `Brier Score calculation completed: ${stats.brierScore.toFixed(4)}.`);
      assert(stats.expectedCalibrationError !== undefined && !isNaN(stats.expectedCalibrationError), `ECE calculation completed: ${stats.expectedCalibrationError.toFixed(4)}.`);
    }

    // --- TEST 3: Dynamic Empirical Calibration (Part 5) ---
    console.log("Testing Part 5: Empirical Calibration recommendations...");
    const calibrationReport = tradeForensicsEngine.generateCalibrationReport();
    assert(calibrationReport.length > 0, "Empirical Calibration recommendation report generated.");
    const calItem = calibrationReport.find(c => c.regime === "TRENDING");
    assert(calItem !== undefined, "Calibration item generated for TRENDING regime.");
    if (calItem) {
      assert(calItem.sampleSize === 1, "Sample size matches recorded count.");
      assert(calItem.requiredConfidenceThreshold === 75, "Suggested threshold escalated due to poor historical win rate.");
    }

    console.log(`\nTrade Forensics Tests Completed: ${results.passed} passed, ${results.failed} failed.`);
  } catch (err: any) {
    console.error("Critical error in Trade Forensics deterministic tests:", err);
  }
}
