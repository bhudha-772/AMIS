import * as fs from "fs";
import * as path from "path";
import { decisionEngine, DecisionOutput } from "./decisionEngine";
import { ResearchPrediction, researchLab } from "./researchLab";

export function runDecisionEngineTests() {
  console.log("================================================================================");
  console.log("RUNNING DECISION INTELLIGENCE ENGINE DETERMINISTIC TESTS (PHASE 6)");
  console.log("================================================================================");

  const originalAlerts = (researchLab as any).alerts;
  (researchLab as any).alerts = [];

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
    // Helper to generate a baseline prediction
    function createMockPrediction(overrides: Partial<ResearchPrediction> = {}): ResearchPrediction {
      return {
        id: `PRED-TEST-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: Date.now(),
        market: "BTCUSDT",
        timeframe: "3m",
        currentPrice: 65000,
        predictedProbs: {
          up: 0.35,
          down: 0.25,
          sideways: 0.40,
          continuation: 0.30,
          reversal: 0.10,
          breakout: 0.15,
          fakeout: 0.05,
          highVolatility: 0.10,
          lowVolatility: 0.40,
          liquiditySweep: 0.05,
          trendFailure: 0.05
        },
        confidence: 0.75,
        expectedMove: 0.15,
        expectedVolatility: 0.12,
        expectedDrawdown: 0.05,
        historicalSimilarity: 0.88,
        matchedHistoricalCases: 12, // Sufficient evidence >= 5
        featureContributions: [
          { featureName: "Trend Strength", contributionPct: 35.5, rawAlignment: 0.82 },
          { featureName: "RSI", contributionPct: 24.2, rawAlignment: -0.65 }
        ],
        regime: "CONSOLIDATION",
        noiseLevel: 0.45,
        supportingEvidence: ["Support boundary bounce", "Strong EMA alignment"],
        contradictingEvidence: ["Declining volume index"],
        resolved: false,
        marketSnapshot: {
          trendAnalysis: { direction: "BULLISH", trendlineSlope: 0.002, trendStrength: 75 },
          momentumAnalysis: { rsi14: 42.5, stochK: 35.0 },
          volatilityAnalysis: { atr: 0.05, stdDev: 0.04, volatilityState: "NORMAL" },
          riskMetrics: { marketNoiseIndex: 0.35, volatilityRisk: "NORMAL" },
          liquidityAnalysis: { orderBlocks: [{}], fairValueGaps: [{}] }
        },
        ...overrides
      };
    }

    // Clear previous tests registry for clean slate testing
    decisionEngine.clearDecisions();

    // TEST 1: EXECUTE LONG Decision
    console.log("\n--- TEST 1: APPROVED EXECUTE LONG DECISION ---");
    const longPred = createMockPrediction({
      predictedProbs: {
        up: 0.72, // Strong up probability
        down: 0.08,
        sideways: 0.20,
        continuation: 0.50,
        reversal: 0.05,
        breakout: 0.25,
        fakeout: 0.02,
        highVolatility: 0.15,
        lowVolatility: 0.35,
        liquiditySweep: 0.02,
        trendFailure: 0.01
      },
      confidence: 0.85,
      expectedMove: 0.45,
      matchedHistoricalCases: 14,
      regime: "BULL_EXPANSION"
    });
    // Ensure we trigger EXECUTE by matching ML and Probability signals
    longPred.challengerPrediction = {
      modelVersion: "v1.1.0",
      predictedProbs: { ...longPred.predictedProbs } as any,
      confidence: 0.80,
      expectedMove: 0.40,
      resolved: false
    };

    const longDecision = decisionEngine.makeDecision(longPred, {}, {
      strategyConfidence: 0,
      momentum: 0,
      modelReliability: 0,
      calibrationQuality: 0,
      support: 0,
      resistance: 0,
      liquidity: 0
    });
    assert(longDecision.decision === "EXECUTE", "Should approve an EXECUTE decision given strong supporting evidence.");
    assert(longDecision.tradeDirection === "LONG", "Trade direction should be LONG.");
    assert(longDecision.decisionConfidence > 0, "Decision confidence should be greater than zero.");
    assert(longDecision.decisionScore >= 70, "Decision score should be high.");
    assert(longDecision.reasonCodes.includes("APPROVED_ACTIVE_EXECUTE"), "Should contain appropriate active execution reason code.");

    // TEST 2: EXECUTE SHORT Decision
    console.log("\n--- TEST 2: APPROVED EXECUTE SHORT DECISION ---");
    const shortPred = createMockPrediction({
      predictedProbs: {
        up: 0.08,
        down: 0.74, // Strong down probability
        sideways: 0.18,
        continuation: 0.45,
        reversal: 0.10,
        breakout: 0.22,
        fakeout: 0.03,
        highVolatility: 0.20,
        lowVolatility: 0.30,
        liquiditySweep: 0.04,
        trendFailure: 0.02
      },
      confidence: 0.85,
      expectedMove: 0.52,
      matchedHistoricalCases: 16,
      regime: "BEAR_EXPANSION"
    });
    shortPred.challengerPrediction = {
      modelVersion: "v1.1.0",
      predictedProbs: { ...shortPred.predictedProbs } as any,
      confidence: 0.82,
      expectedMove: 0.48,
      resolved: false
    };

    const shortDecision = decisionEngine.makeDecision(shortPred, {}, {
      strategyConfidence: 0,
      momentum: 0,
      modelReliability: 0,
      calibrationQuality: 0,
      support: 0,
      resistance: 0,
      liquidity: 0
    });
    assert(shortDecision.decision === "EXECUTE", "Should approve an EXECUTE decision given strong bearish evidence.");
    assert(shortDecision.tradeDirection === "SHORT", "Trade direction should be SHORT.");
    assert(shortDecision.decisionScore >= 70, "Decision score should be high.");
    assert(shortDecision.reasonCodes.includes("APPROVED_ACTIVE_EXECUTE"), "Should contain appropriate active execution reason code.");

    // TEST 3: GATING RULE - Low Historical Evidence (Sample size < 5)
    console.log("\n--- TEST 3: REJECTION - LOW HISTORICAL EVIDENCE ---");
    const lowEvidencePred = createMockPrediction({
      matchedHistoricalCases: 3, // Less than minimum 5 cases
      predictedProbs: {
        up: 0.70,
        down: 0.05,
        sideways: 0.25,
        continuation: 0.40,
        reversal: 0.05,
        breakout: 0.20,
        fakeout: 0.02,
        highVolatility: 0.10,
        lowVolatility: 0.40,
        liquiditySweep: 0.02,
        trendFailure: 0.01
      }
    });

    const lowEvidenceDecision = decisionEngine.makeDecision(lowEvidencePred);
    assert(lowEvidenceDecision.decision === "REJECT", "Should REJECT trade when matched historical cases < 5.");
    assert(lowEvidenceDecision.failedGates.includes("SUFFICIENT_SAMPLE_SIZE"), "Should identify SUFFICIENT_SAMPLE_SIZE as failed gate.");

    // TEST 4: GATING RULE - High Uncertainty / Extreme Noise
    console.log("\n--- TEST 4: REJECTION - HIGH UNCERTAINTY ---");
    const highUncertaintyPred = createMockPrediction({
      noiseLevel: 0.95, // Extreme noise level
      marketSnapshot: {
        trendAnalysis: { direction: "BULLISH", trendlineSlope: 0.002, trendStrength: 75 },
        momentumAnalysis: { rsi14: 42.5, stochK: 35.0 },
        volatilityAnalysis: { atr: 0.05, stdDev: 0.04, volatilityState: "NORMAL" },
        riskMetrics: { marketNoiseIndex: 0.85, volatilityRisk: "EXTREME" }, // Unhealthy noise level
        liquidityAnalysis: { orderBlocks: [{}], fairValueGaps: [{}] }
      }
    });

    const highUncertaintyDecision = decisionEngine.makeDecision(highUncertaintyPred);
    assert(highUncertaintyDecision.decision === "REJECT", "Should REJECT trade when market uncertainty/noise/volatility is too high.");
    assert(highUncertaintyDecision.failedGates.includes("ACCEPTABLE_VOLATILITY"), "Should identify ACCEPTABLE_VOLATILITY as failed gate.");

    // TEST 5: GATING RULE - Negative Expected Value
    console.log("\n--- TEST 5: REJECTION - NEGATIVE EXPECTED VALUE ---");
    const negativeEVPred = createMockPrediction({
      expectedMove: -0.15, // Negative expected return
    });

    const negativeEVDecision = decisionEngine.makeDecision(negativeEVPred);
    assert(negativeEVDecision.decision === "REJECT", "Should REJECT trade when expected move/expected value is negative.");
    assert(negativeEVDecision.failedGates.includes("POSITIVE_EXPECTED_VALUE"), "Should identify POSITIVE_EXPECTED_VALUE as failed gate.");

    // TEST 6: CONTRADICTION DETECTION - Conflicting Models
    console.log("\n--- TEST 6: CONTRADICTION - CONFLICTING MODELS ---");
    const conflictPred = createMockPrediction({
      predictedProbs: {
        up: 0.70, // Prob engine signal is LONG
        down: 0.10,
        sideways: 0.20,
        continuation: 0.40,
        reversal: 0.05,
        breakout: 0.20,
        fakeout: 0.02,
        highVolatility: 0.10,
        lowVolatility: 0.40,
        liquiditySweep: 0.02,
        trendFailure: 0.01
      },
      challengerPrediction: {
        modelVersion: "v1.2.0-test",
        predictedProbs: {
          up: 0.10,
          down: 0.75, // ML signal is SHORT
          sideways: 0.15,
          continuation: 0.40,
          reversal: 0.05,
          breakout: 0.20,
          fakeout: 0.02,
          highVolatility: 0.10,
          lowVolatility: 0.40,
          liquiditySweep: 0.02,
          trendFailure: 0.01
        } as any,
        confidence: 0.80,
        expectedMove: 0.35,
        resolved: false
      }
    });

    const conflictDecision = decisionEngine.makeDecision(conflictPred);
    assert(conflictDecision.decision === "REJECT", "Should REJECT trade when Probability and ML models are in direct conflict.");
    assert(conflictDecision.failedGates.includes("NO_CONTRADICTIONS"), "Should fail NO_CONTRADICTIONS gate.");
    assert(conflictDecision.contradictions.some(c => c.type === "PROBABILITY_VS_ML_CONFLICT"), "Contradictions engine should detect PROBABILITY_VS_ML_CONFLICT.");

    // TEST 7: Robustness & Data Corruption (Empty Snapshot)
    console.log("\n--- TEST 7: ROBUSTNESS - EMPTY SNAPSHOT / CORRUPT DATA ---");
    const corruptPred = createMockPrediction({
      marketSnapshot: undefined // Missing entire snapshot
    });

    const corruptDecision = decisionEngine.makeDecision(corruptPred);
    assert(corruptDecision.decision === "REJECT", "Should safely evaluate corrupt prediction and reject it.");
    assert(corruptDecision.failedGates.includes("NO_DATA_CORRUPTION"), "Gate evaluation must detect data corruption.");

    // TEST 8: Replay Determinism
    console.log("\n--- TEST 8: REPLAY DETERMINISM ---");
    const testDecision = longDecision;
    const replayed = decisionEngine.replayDecision(testDecision.id);
    assert(replayed !== null, "Should recover a stored decision by ID.");
    if (replayed) {
      assert(replayed.decision === testDecision.decision, "Replayed decision must match the original decision state.");
      assert(replayed.decisionConfidence === testDecision.decisionConfidence, "Replayed confidence must match exactly.");
      assert(replayed.decisionScore === testDecision.decisionScore, "Replayed decision score must match exactly.");
    }

    // TEST 9: Restart Recovery
    console.log("\n--- TEST 9: RESTART RECOVERY ---");
    const allDecisionsCountBefore = decisionEngine.getDecisions().length;
    // Simulate restart recovery by clearing in-memory decisions and reloading from disk
    (decisionEngine as any).decisions = [];
    (decisionEngine as any).loadDecisions();
    const loadedCount = decisionEngine.getDecisions().length;
    assert(loadedCount === allDecisionsCountBefore, `Restart recovery verified. Loaded ${loadedCount} decisions correctly from registry.`);

    console.log("\n================================================================================");
    console.log(`DECISION INTELLIGENCE TEST SUITE COMPLETE: ${results.passed} PASSED, ${results.failed} FAILED`);
    console.log("================================================================================");

  } catch (err: any) {
    results.failed++;
    console.error("[CRITICAL FAILURE IN TESTS]:", err);
    results.details.push(`[CRITICAL] Test run aborted: ${err.message || err}`);
  } finally {
    // Restore original alerts
    (researchLab as any).alerts = originalAlerts;
  }

  return results;
}
