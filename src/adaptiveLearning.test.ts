import { adaptiveLearning, FeatureReliabilitySnapshot, CandidateEvaluation, FailureCase, SuccessCase } from "./adaptiveLearning";
import { modelGovernance, ModelWeights, ModelConfig } from "./modelGovernance";

/**
 * DETERMINISTIC AUTOMATED TEST SUITE FOR ADAPTIVE LEARNING ENGINE
 * Phase 4.10 Verification Suite
 */

export function runDeterministicTests() {
  console.log("================================================================================");
  console.log("RUNNING AMIS PHASE 4.10 DETERMINISTIC TESTS");
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
    // Test 1: Weight Generation
    const baseWeights: ModelWeights = {
      regime: 0.25,
      trendStrength: 0.20,
      rsi: 0.20,
      bollingerBandwidth: 0.15,
      direction: 0.10,
      cognitiveState: 0.10
    };

    const candidates = adaptiveLearning.generateCandidates(baseWeights, 3);
    assert(candidates.length === 3, "Should generate exactly 3 candidate weight configurations.");
    
    // Check that each candidate's weights sum to exactly 1.0
    candidates.forEach((cand, idx) => {
      const sum = cand.regime + cand.trendStrength + cand.rsi + cand.bollingerBandwidth + cand.direction + cand.cognitiveState;
      assert(Math.abs(sum - 1.0) < 0.0001, `Candidate ${idx + 1} weights must sum to exactly 1.0 (Sum: ${sum})`);
    });

    // Test 2: Chronological Integrity & Candidate Evaluation
    const champion: ModelConfig = {
      version: "v1.0.0",
      name: "Champion",
      weights: baseWeights,
      status: "CHAMPION",
      createdTimestamp: Date.now() - 100000,
      description: "Production Champion"
    };

    const mockHistoricalRecords = [
      {
        timestamp: 1720000000000,
        market: "BTCUSDT",
        marketRegime: { dominantRegime: "BULL_EXPANSION" },
        trendAnalysis: { trendStrength: 75, direction: "UP" },
        momentumAnalysis: { rsi14: 65 },
        volatilityAnalysis: { bollingerBandwidth: 0.08 },
        relationshipAnalysis: { cognitiveState: "ACCELERATING" },
        outcomes: {
          horizons: {
            "3m": {
              elapsed: true,
              percentageChange: 0.08,
              realizedVolatility: 0.12,
              maxAdverseExcursion: 0.01,
              maxFavorableExcursion: 0.09,
              trendContinuation: true,
              trendFailure: false,
              finalRegime: "BULL_EXPANSION"
            }
          }
        }
      },
      {
        timestamp: 1720000060000,
        market: "BTCUSDT",
        marketRegime: { dominantRegime: "BULL_EXPANSION" },
        trendAnalysis: { trendStrength: 80, direction: "UP" },
        momentumAnalysis: { rsi14: 72 },
        volatilityAnalysis: { bollingerBandwidth: 0.10 },
        relationshipAnalysis: { cognitiveState: "ACCELERATING" },
        outcomes: {
          horizons: {
            "3m": {
              elapsed: true,
              percentageChange: 0.11,
              realizedVolatility: 0.15,
              maxAdverseExcursion: 0.01,
              maxFavorableExcursion: 0.12,
              trendContinuation: true,
              trendFailure: false,
              finalRegime: "BULL_EXPANSION"
            }
          }
        }
      }
    ];

    const evaluation = adaptiveLearning.evaluateCandidate(candidates[0], mockHistoricalRecords, champion);
    assert(evaluation.id !== undefined, "Evaluation should produce a valid candidate ID.");
    assert(evaluation.accuracy >= 0 && evaluation.accuracy <= 1.0, "Evaluated accuracy should be a valid percentage between 0 and 1.0.");
    assert(evaluation.brierScore >= 0, "Brier score should be a non-negative value.");
    assert(evaluation.logLoss >= 0, "Log loss should be a non-negative value.");

    // Test 3: Failure and Success Clustering
    const testFailures = adaptiveLearning.getFailures();
    assert(testFailures.length > 0, "Should load initial seeded failures.");
    
    const testFailureClusters = adaptiveLearning.getFailureClusters();
    assert(testFailureClusters.length > 0, "Should group/cluster seeded failures correctly.");
    assert(testFailureClusters[0].weaknessScore >= 0 && testFailureClusters[0].weaknessScore <= 100, "Weakness score should be on a standard 0-100 scale.");

    const testSuccessClusters = adaptiveLearning.getSuccessClusters();
    assert(testSuccessClusters.length > 0, "Should group/cluster seeded successes correctly.");
    assert(testSuccessClusters[0].successRate >= 0 && testSuccessClusters[0].successRate <= 1.0, "Success rate should be a valid ratio.");

    // Test 4: Searchable Knowledge Base Persistence
    const kbResults = adaptiveLearning.queryKnowledgeBase("Trend");
    assert(kbResults.length > 0, "Knowledge Base search should return relevant cases for 'Trend'.");
    assert(kbResults[0].evidenceReference !== undefined, "KB entries must reference underlying evidence.");

    // Test 5: Model Evolution Timeline Integrity
    const genealogy = adaptiveLearning.getModelGenealogy();
    assert(genealogy.length > 0, "Genealogy should maintain complete model history timeline.");
    assert(genealogy[0].scientificJustification !== undefined, "Timeline events must contain clear scientific justification.");

    // Test 6: Trigger Learning updates loop
    const triggerReport = adaptiveLearning.runAdaptiveLearningLoop(mockHistoricalRecords);
    assert(triggerReport.successCount !== undefined, "Learning loop trigger should report successes analyzed.");
    assert(triggerReport.failureCount !== undefined, "Learning loop trigger should report failures analyzed.");
    assert(adaptiveLearning.getLastLearningTimestamp() > 0, "Learning loop execution should record modern epoch timestamp.");

    console.log(`================================================================================`);
    console.log(`TEST COMPLETED: ${results.passed} PASSED, ${results.failed} FAILED`);
    console.log(`================================================================================`);

  } catch (error: any) {
    results.failed++;
    console.error("CRITICAL ERROR IN AUTOMATED TEST EXECUTION:", error);
  }

  return results;
}
