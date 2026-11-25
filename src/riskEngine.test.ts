import { riskEngine } from "./riskEngine";
import { DecisionOutput } from "./decisionEngine";
import { SizingMethod, RiskDecision } from "./riskTypes";

export interface RiskTestResults {
  passed: number;
  failed: number;
  details: string[];
}

export function runRiskEngineTests(): RiskTestResults {
  const results: RiskTestResults = {
    passed: 0,
    failed: 0,
    details: []
  };

  const assert = (condition: boolean, message: string) => {
    if (condition) {
      results.passed++;
      console.log(`[PASS] ${message}`);
    } else {
      results.failed++;
      console.error(`[FAIL] ${message}`);
      results.details.push(message);
    }
  };

  try {
    console.log("\n================================================================================");
    console.log("RUNNING RISK INTELLIGENCE ENGINE DETERMINISTIC TESTS (PHASE 7)");
    console.log("================================================================================");

    // Prepare a mock clean state
    riskEngine.clearAllHistory();

    // Create a mock DecisionOutput
    const mockDecision: DecisionOutput = {
      id: "DEC-TEST-112233",
      timestamp: Date.now(),
      decisionVersion: "v1.2.0-AMIS",
      market: "BTCUSDT",
      timeframe: "3m",
      decision: "EXECUTE",
      tradeDirection: "LONG",
      decisionScore: 88,
      decisionConfidence: 75,
      remainingUncertainty: 25,
      expectedValue: 0.28,
      expectedMove: 0.05, // 5% predicted up move
      expectedDrawdown: 0.02, // 2% expected drawdown
      expectedVolatility: 0.08,
      historicalSampleSize: 15,
      historicalWinRate: 58,
      probabilitySummary: {
        up: 0.58,
        down: 0.12,
        sideways: 0.30,
        continuation: 0.40,
        reversal: 0.10,
        breakout: 0.15,
        fakeout: 0.05
      },
      riskSummary: {
        expectedDrawdown: 0.02,
        expectedVolatility: 0.08,
        noiseLevel: 0.35,
        isUnhealthyRegime: false,
        isIlliquid: false
      },
      supportingEvidence: [],
      contradictingEvidence: [],
      contradictions: [],
      gates: [],
      passedGates: [],
      failedGates: [],
      scoreBreakdown: [],
      marketRegime: "BULL_EXPANSION",
      primaryStrategyUsed: "SUPPORT_BOUNCE",
      modelConsensus: 88,
      calibrationStatus: "WELL_CALIBRATED",
      featureReliabilitySummary: {
        featureReliabilityIndex: 85,
        topFeatureName: "Trend Strength",
        topFeatureContribution: 28
      },
      dataQualityStatus: "EXCELLENT",
      driftStatus: "STABLE",
      reasonCodes: ["APPROVED_EXECUTE"],
      consensusWeights: {
        probabilityEngineWeight: 0.3,
        mlPredictionWeight: 0.25,
        strategyAgreementWeight: 0.2,
        historicalSimilarityWeight: 0.15,
        adaptiveLearningWeight: 0.1
      },
      scoreWeights: {
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
      },
      predictionId: "PRED-112233",
      strategyVersion: "v1.1",
      modelVersion: "v2.0"
    };

    const currentPrice = 60000;

    // --- TEST 1: CAPITAL MANAGEMENT & DERIVED CALCULATIONS ---
    console.log("\n--- TEST 1: CAPITAL MANAGEMENT & DERIVED CALCULATIONS ---");
    riskEngine.recomputeCapitalDerivedStats();
    const config = riskEngine.getConfig();
    assert(config.capitalState.currentEquity === 100000, "Should initialize capital equity to $100,000.");
    assert(config.capitalState.riskOfRuin < 1, "Ruin probability should be extremely low for well-capitalized baseline.");
    assert(config.capitalState.capitalUtilization === 0, "Capital utilization should read 0% with no positions.");

    // --- TEST 2: POSITION SIZING COMPARISON ---
    console.log("\n--- TEST 2: POSITION SIZING MODELS ---");
    const sizingModels = riskEngine.compareSizingModels(mockDecision, currentPrice);
    assert(sizingModels.length === 10, "Should generate exactly 10 comparative position sizing evaluations.");

    // Verify Kelly sizing specifically
    const kelly = sizingModels.find(s => s.method === "KELLY_CRITERION");
    assert(kelly !== undefined, "Should contain Kelly Sizing Model evaluation.");
    if (kelly) {
      assert(kelly.capitalAllocation > 0, `Kelly allocation should be positive: $${kelly.capitalAllocation}.`);
      assert(kelly.recommendedSize > 0, `Kelly unit size should be positive: ${kelly.recommendedSize} units.`);
    }

    // Verify ATR sizing specifically
    const atrSizing = sizingModels.find(s => s.method === "ATR_BASED");
    assert(atrSizing !== undefined, "Should contain ATR Sizing Model evaluation.");
    if (atrSizing) {
      assert(atrSizing.capitalAllocation === 2000, "ATR allocation should match 2% risk limit ($2000).");
    }

    // --- TEST 3: STANDARD SAFE EVALUATION ---
    console.log("\n--- TEST 3: STANDARD EVALUATION (PASS ALL GATES) ---");
    const decisionPassed = riskEngine.evaluateDecision(mockDecision, currentPrice);
    assert(decisionPassed.action === "ALLOW", "Should ALLOW a safe and strong decision output.");
    assert(decisionPassed.riskScore === 100, "Risk score should be 100 when all parameters pass.");
    assert(decisionPassed.failedRules.length === 0, "No rules should fail in safe environment.");

    // --- TEST 4: MINOR FAILURES - ALLOW WITH REDUCED SIZE ---
    console.log("\n--- TEST 4: MINOR FAILS (ALLOW WITH REDUCED SIZE) ---");
    // Trigger mild spread violation
    const decisionSpreadFail = riskEngine.evaluateDecision(mockDecision, currentPrice, {
      spread: 0.005 // 0.5% spread (threshold limit is 0.3%)
    });
    assert(decisionSpreadFail.action === "ALLOW_WITH_REDUCED_SIZE", "Should transition to ALLOW_WITH_REDUCED_SIZE on high spread.");
    assert(decisionSpreadFail.failedRules.includes("MAX_SPREAD"), "Spread violation should be listed under failedRules.");
    assert(decisionSpreadFail.recommendedCapitalAllocation < decisionPassed.recommendedCapitalAllocation, "Allocation size must be reduced by 50%.");

    // --- TEST 5: DAILY DRAWDOWN LOCKDOWN ---
    console.log("\n--- TEST 5: DAILY DRAWDOWN BLOCKS ---");
    // Simulate negative day's P&L exceeding maximum limit
    config.capitalState.dailyPL = -5500; // Daily maximum limit is $5,000
    riskEngine.recomputeCapitalDerivedStats();

    const decisionDrawdownFail = riskEngine.evaluateDecision(mockDecision, currentPrice);
    assert(decisionDrawdownFail.action === "BLOCK", "Should BLOCK execution when daily limit is breached.");
    assert(decisionDrawdownFail.failedRules.includes("MAX_DAILY_LOSS"), "Drawdown breach should be flagged in failed rules.");
    assert(riskEngine.getConfig().emergencyState === "LOCKDOWN", "Breaching daily maximum loss must trigger administrative LOCKDOWN state.");

    // Restore P&L state for subsequent tests
    config.capitalState.dailyPL = 0;
    riskEngine.transitionToState("NORMAL", "Manual recovery and restart setup override.");

    // --- TEST 6: EMERGENCY CONTROL TRANSITIONS & STATUSES ---
    console.log("\n--- TEST 6: EMERGENCY STATE transitions ---");
    assert(riskEngine.getConfig().emergencyState === "NORMAL", "State must initialize to NORMAL.");
    riskEngine.transitionToState("EMERGENCY_STOP", "Admin manual shutdown signal.");
    assert(riskEngine.getConfig().emergencyState === "EMERGENCY_STOP", "State should transition to EMERGENCY_STOP.");
    
    const blockEmergency = riskEngine.evaluateDecision(mockDecision, currentPrice);
    assert(blockEmergency.action === "BLOCK", "When in EMERGENCY_STOP, all evaluations must be completely BLOCKED.");
    
    // Clear Emergency Stop
    riskEngine.transitionToState("NORMAL", "All systems clear recovery verification.");

    // --- TEST 7: PORTFOLIO STATE & CORRELATIONS ---
    console.log("\n--- TEST 7: PORTFOLIO CONSTRAINTS & COOLING ---");
    // Open some mock positions
    riskEngine.openPosition("BTCUSDT", "LONG", 60000, 0.1, 58000, "TREND_FOLLOWING", "v2.0-CHAMP");
    riskEngine.openPosition("ETHUSDT", "LONG", 3000, 2.0, 2900, "TREND_FOLLOWING", "v2.0-CHAMP"); // Base is ETH, so no coin correlation with BTC

    const portState = riskEngine.getPortfolioRiskState();
    assert(portState.openPositions.length === 2, "Portfolio state should identify 2 open active positions.");
    assert(portState.marketExposure === 12000, "Aggregate market exposure should sum up BTC and ETH values ($12,000).");
    assert(riskEngine.getConfig().capitalState.portfolioRisk === 400, "Portfolio risk must sum risk differences ($200 on BTC + $200 on ETH).");

    // Close position ETHUSDT with a loss
    const closeRes = riskEngine.closePosition("ETHUSDT", 2950); // Loss of $100
    assert(closeRes !== null, "Should return close result.");
    assert(riskEngine.getConfig().capitalState.dailyPL === -100, "Daily P&L should reduce to -$100.");
    assert(riskEngine.getPortfolioRiskState().coolingOffPeriods["ETHUSDT"] !== undefined, "ETHUSDT should enter cooling off restrictions.");

    // --- TEST 8: REPLAY DETERMINISM ---
    console.log("\n--- TEST 8: REPLAY DETERMINISM ---");
    const mockDecision2 = { ...mockDecision, id: "DEC-REPLAY-9988" };
    const initialEval = riskEngine.evaluateDecision(mockDecision2, currentPrice);
    
    // Fetch from history
    const history = riskEngine.getHistory();
    const retrieved = history.find(h => h.decisionId === "DEC-REPLAY-9988");
    assert(retrieved !== undefined, "Should retrieve evaluation record by matching Decision ID.");
    if (retrieved) {
      assert(retrieved.riskScore === initialEval.riskScore, "Replayed risk score should match perfectly.");
      assert(retrieved.action === initialEval.action, "Replayed decision action must match perfectly.");
      assert(retrieved.recommendedCapitalAllocation === initialEval.recommendedCapitalAllocation, "Replayed allocation size must match perfectly.");
    }

    // --- TEST 9: RESTART RECOVERY ---
    console.log("\n--- TEST 9: RESTART RECOVERY ---");
    const preHistoryCount = riskEngine.getHistory().length;
    // We instantiate a direct reload or force recovery reloading
    (riskEngine as any).loadState();
    const postHistoryCount = riskEngine.getHistory().length;
    assert(postHistoryCount === preHistoryCount, `Restart recovery verified. Successfully loaded ${postHistoryCount} risk logs from disk.`);

    console.log("\n================================================================================");
    console.log(`RISK INTELLIGENCE TEST SUITE COMPLETE: ${results.passed} PASSED, ${results.failed} FAILED`);
    console.log("================================================================================\n");

  } catch (err: any) {
    results.failed++;
    console.error("[CRITICAL FAILURE IN RISK TESTS]:", err);
    results.details.push(`[CRITICAL] Test run aborted: ${err.message || err}`);
  }

  return results;
}
