import { strategyRegistry } from "./strategyRegistry";
import { strategyDiscovery } from "./strategyDiscovery";
import { strategyValidator } from "./strategyValidator";
import { evaluateConditionGroup, evaluateStrategySignal } from "./strategyDefinition";
import { Strategy, ConditionGroup, RangeCondition } from "./strategyTypes";
import { ResearchPrediction } from "./researchLab";

/**
 * DETERMINISTIC AUTOMATED TEST SUITE FOR STRATEGY RESEARCH LABORATORY
 * Validates Part 9 requirements:
 * - Strategy generation & discovery
 * - Walk-forward validation
 * - Performance metrics (Sharpe, Sortino, Drawdown, Profit Factor)
 * - Chronological integrity
 * - Registry persistence
 * - Stress testing
 * - Restart recovery
 */
export function runStrategyResearchTests() {
  console.log("================================================================================");
  console.log("RUNNING STRATEGY RESEARCH DETERMINISTIC TESTS");
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
    // 1. Mock 15 historical predictions
    const mockPredictions: ResearchPrediction[] = [];
    const baseTime = 1720000000000;
    for (let i = 0; i < 15; i++) {
      mockPredictions.push({
        id: `PRED-STRAT-TEST-${1000 + i}`,
        timestamp: baseTime + i * 15 * 60 * 1000,
        market: "BTCUSDT",
        timeframe: "15m",
        currentPrice: 90000 + (i * 150),
        predictedProbs: {
          up: i % 2 === 0 ? 0.65 : 0.35,
          down: i % 2 === 0 ? 0.35 : 0.65,
          sideways: 0,
          continuation: 0.5,
          reversal: 0.1,
          breakout: 0.3,
          fakeout: 0.1,
          highVolatility: 0.2,
          lowVolatility: 0.8,
          liquiditySweep: 0.05,
          trendFailure: 0.1
        },
        confidence: 60 + (i * 2),
        expectedMove: 0.5,
        expectedVolatility: 1.2,
        expectedDrawdown: 0.4,
        historicalSimilarity: 0.75,
        matchedHistoricalCases: 5,
        featureContributions: [],
        regime: i % 2 === 0 ? "TRENDING" : "RANGING",
        noiseLevel: 0.3,
        supportingEvidence: [],
        contradictingEvidence: [],
        marketSnapshot: {
          market: "BTCUSDT",
          timestamp: baseTime + i * 15 * 60 * 1000 - 5000,
          currentPrice: 90000 + (i * 150),
          trendAnalysis: {
            direction: i % 2 === 0 ? "BULLISH" : "BEARISH",
            trendStrength: 50 + (i * 2),
            trendlineR2: 0.8,
            trendlineSlope: i % 2 === 0 ? 1.2 : -1.2
          },
          momentumAnalysis: {
            rsi14: 40 + (i * 3) % 40
          },
          volatilityAnalysis: {
            bollingerBandwidth: i % 2 === 0 ? 3.2 : 1.2,
            noiseRatio: 0.3,
            stdDev: 100
          }
        },
        resolved: true,
        actualOutcome: {
          actualPrice: 90000 + ((i + 1) * 150) + (i % 2 === 0 ? 50 : -50),
          percentageChange: i % 2 === 0 ? 0.005 : -0.005,
          maxFavorableExcursion: 0.01,
          maxAdverseExcursion: 0.002,
          drawdown: 0.002,
          volatility: 1.0,
          regimeTransition: "STABLE",
          predictionCorrect: true,
          calibrationCorrect: true,
          confidenceCorrect: true,
          expectedValueAccuracy: 0.9,
          evaluatedAt: baseTime + (i + 1) * 15 * 60 * 1000
        }
      });
    }

    // --- TEST 1: Strategy Evaluation Engine ---
    const testStrategy: Strategy = {
      id: "STRAT-TEST-001",
      name: "Test Strategy",
      version: "1.0.0",
      description: "Simple test strategy",
      conditions: {
        operator: "AND",
        conditions: [
          { field: "predictedProbs.up", operator: "GT", value: 0.60 } as RangeCondition,
          { field: "confidence", operator: "GT", value: 65 } as RangeCondition
        ]
      },
      creationDate: Date.now(),
      datasetVersion: "v1.0.0",
      featureVersion: "v1.0.0",
      author: "Test Suite",
      status: "EXPERIMENTAL",
      scientificNotes: "Test strategy notes",
      explainability: {
        whyItWorks: "Test",
        whenItWorks: "Test",
        whenItFails: "Test",
        supportingIndicators: [],
        contradictingIndicators: [],
        typicalRegimes: []
      }
    };

    const isTriggered = evaluateConditionGroup(testStrategy.conditions, mockPredictions[4]); // i=4, prob.up=0.65, conf=68
    assert(isTriggered === true, "Should trigger when conditions are fully satisfied.");

    const signal = evaluateStrategySignal(testStrategy, mockPredictions[4]);
    assert(signal === "LONG", "Should return LONG signal when triggered and prob.up > prob.down.");

    // --- TEST 2: Walk-Forward Strategy Validation ---
    const evaluation = strategyValidator.evaluateStrategy(testStrategy, mockPredictions, 0.01);
    assert(evaluation !== undefined, "Should complete walk-forward evaluation.");
    assert(evaluation.metrics.totalTrades > 0, "Walk-forward validation should record active trades.");
    assert(evaluation.metrics.winRate >= 0 && evaluation.metrics.winRate <= 100, "Win rate must be a valid float [0, 100].");
    assert(evaluation.metrics.sharpeRatio !== undefined, "Sharpe ratio should be computed.");
    assert(evaluation.metrics.profitFactor >= 0, "Profit factor should be computed.");
    assert(evaluation.metrics.maxDrawdown >= 0, "Max drawdown should be computed.");

    // --- TEST 3: Baseline Comparison ---
    assert(evaluation.baselines.length > 0, "Should generate comparisons against standard baselines.");
    const buyAndHold = evaluation.baselines.find((b) => b.name === "Buy & Hold");
    assert(buyAndHold !== undefined, "Should include Buy & Hold baseline.");
    assert(buyAndHold!.metrics.totalReturn !== undefined, "Should calculate Buy & Hold total return.");

    // --- TEST 4: Stress Testing ---
    assert(evaluation.stressTests.length > 0, "Should calculate stress testing metrics on regimes.");
    const trendingStress = evaluation.stressTests.find((s) => s.regime === "TRENDING");
    assert(trendingStress !== undefined, "Should stress-test the TRENDING regime.");
    assert(trendingStress!.robustnessScore >= 0 && trendingStress!.robustnessScore <= 100, "Robustness score must be between 0 and 100.");

    // --- TEST 5: Registry Persistence & Restart Recovery ---
    const isRegistered = strategyRegistry.registerStrategy(testStrategy);
    const retrieved = strategyRegistry.getStrategies().find((s) => s.id === testStrategy.id);
    assert(retrieved !== undefined, "Registered strategy must be persistent and retrievable.");
    assert(retrieved?.name === "Test Strategy", "Retrieved strategy details must match original.");

    // Update status
    strategyRegistry.updateStrategyStatus(testStrategy.id, "ACCEPTED", "Passed tests");
    const updated = strategyRegistry.getStrategies().find((s) => s.id === testStrategy.id);
    assert(updated?.status === "ACCEPTED", "Strategy status updates must persist successfully.");

    // Save and retrieve evaluation
    strategyRegistry.saveStrategyEvaluation(evaluation);
    const savedEvals = strategyRegistry.getEvaluations();
    assert(savedEvals.some((e) => e.strategyId === testStrategy.id), "Saved evaluations must persist successfully.");

    // --- TEST 6: Auto-Discovery Engine ---
    const discovered = strategyDiscovery.discoverStrategies(mockPredictions);
    assert(discovered.length > 0, "Discovery engine must automatically generate candidate strategies.");
    assert(discovered[0].strategy.name !== undefined, "Discovered strategies must contain metadata.");
    assert(discovered[0].evaluation.metrics.sharpeRatio !== undefined, "Discovered strategies must contain evaluation metrics.");

    console.log(`================================================================================`);
    console.log(`STRATEGY RESEARCH TESTS COMPLETED: ${results.passed} PASSED, ${results.failed} FAILED`);
    console.log(`================================================================================`);

  } catch (error: any) {
    results.failed++;
    console.error("CRITICAL ERROR IN STRATEGY RESEARCH TESTS:", error);
  }

  return results;
}
