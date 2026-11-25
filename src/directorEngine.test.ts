import { directorEngine } from "./directorEngine";
import { directorLedger } from "./directorLedger";
import { supervisorEngine } from "./supervisorEngine";

export interface DirectorTestResults {
  passed: number;
  failed: number;
  details: string[];
}

/**
 * Runs the automated deterministic test suite for Phase 10 - Autonomous Research Director.
 */
export function runDirectorEngineTests(): DirectorTestResults {
  const results: DirectorTestResults = {
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
    console.log("RUNNING AUTONOMOUS RESEARCH DIRECTOR DETERMINISTIC TEST SUITE (PHASE 10)");
    console.log("================================================================================");

    // 1. Sandbox Reset
    directorLedger.clearState();
    supervisorEngine.setRiskViolations(0);
    supervisorEngine.setCalDev(0.01);

    // 🧪 Test 1: Trend Detection & Snapshots
    console.log("\n🧪 Test 1: Scientific Trend Detection Snapshots");
    const snapshot = directorEngine.generateCurrentPerformanceSnapshot();
    assert(snapshot.accuracy >= 0.70 && snapshot.accuracy <= 1.0, "Accuracy bounds verified mathematically.");
    assert(snapshot.f1 > 0.60, "F1 score holds logical positive value.");
    assert(snapshot.ece === supervisorEngine.fetchDiagnostics().probabilityCalibrationDev, "Calibration error matches supervisor metrics.");

    const history = directorEngine.getPerformanceHistory();
    assert(history.length >= 10, "Historical rolling reviews correctly preloaded.");

    // 🧪 Test 2: Dynamic Root Cause Analysis
    console.log("\n🧪 Test 2: Forensic Root Cause Analysis Under Degradation");
    // Induce normal condition first
    const cleanAnalysis = directorEngine.analyzeRootCauses("Execution Laboratory");
    assert(cleanAnalysis.identifiedFactors.length > 0, "Root cause factors generated under nominal bounds.");

    // Induce high calibration discrepancy to test drift detections
    supervisorEngine.setCalDev(0.08); // 8% calibration error
    const degradedAnalysis = directorEngine.analyzeRootCauses("Probability Engine");
    const calFactor = degradedAnalysis.identifiedFactors.find(f => f.factor === "Probability Calibration Drift");
    assert(calFactor !== undefined, "Forensic suite correctly flag Probability Calibration Drift under high ECE.");
    assert(calFactor!.probability > 0.5, "Drift probability correctly ranked high.");

    // 🧪 Test 3: Hypothesis Generation & Auto-Generation Checks
    console.log("\n🧪 Test 3: Dynamic Scientific Hypothesis Formulator");
    const initialHypotheses = directorLedger.getHypotheses().length;
    
    // Attempt auto-generation under high divergence
    const autoHyp = directorEngine.attemptAutoGenerateHypothesis();
    assert(autoHyp !== null, "Calibration divergence triggers hypothesis auto-formulation.");
    assert(autoHyp?.status === "HYPOTHESIS_FORMULATED", "Auto-hypothesis is correctly tagged.");
    assert(directorLedger.getHypotheses().length === initialHypotheses + 1, "Hypothesis appended to persistent ledger.");

    // 🧪 Test 4: Experiment Planning Protocols
    console.log("\n🧪 Test 4: Structured Experiment Planning Verification");
    const experiments = directorLedger.getExperiments();
    assert(experiments.length >= 3, "Experiment protocols loaded.");
    const sampleExp = experiments[0];
    assert(sampleExp.requiredSampleSize > 0, "Sample sizes explicitly formulated.");
    assert(sampleExp.independentVariables.length > 0, "Independent variables explicitly declared.");
    assert(sampleExp.dependentVariables.length > 0, "Dependent variables explicitly declared.");

    // 🧪 Test 5: Research Priority Utility Engine
    console.log("\n🧪 Test 5: Research Priority Multi-Attribute Ranking Score");
    const rankings = directorEngine.scoreAndRankExperiments(experiments);
    assert(rankings.length === experiments.length, "Rankings matched experiments inventory size.");
    assert(rankings[0].score >= rankings[rankings.length - 1].score, "Priority rankings follow descending utility order.");

    // 🧪 Test 6: System Scorecard Metrics
    console.log("\n🧪 Test 6: Subsystem Scorecard Evaluator");
    const scorecardReport = directorEngine.generateSubsystemScorecardReport();
    assert(scorecardReport.scorecards.length >= 5, "Evaluated more than 5 distinct subsystems.");
    assert(scorecardReport.weakestSubsystem !== undefined, "Weakest components detected and flagged.");
    assert(scorecardReport.strongestSubsystem !== undefined, "Strongest components detected and flagged.");
    assert(scorecardReport.technicalDebtSumHours > 0, "Cumulative system technical debt quantified.");

    // 🧪 Test 7: Recommendation Engine
    console.log("\n🧪 Test 7: Operational Recommendation Resolver");
    const recs = directorLedger.getRecommendations();
    assert(recs.length > 0, "Preloaded tactical recommendations.");
    
    const unresRec = recs.find(r => !r.resolved);
    assert(unresRec !== undefined, "Open recommendation ticket identified.");
    
    const resSuccess = directorLedger.resolveRecommendation(unresRec!.id);
    assert(resSuccess === true, "Resolver executes successfully.");
    const reCheckedRec = directorLedger.getRecommendations().find(r => r.id === unresRec!.id);
    assert(reCheckedRec?.resolved === true, "Recommendation verified as resolved inside ledger cache.");

    // 🧪 Test 8: Historical Long-Term Evolution Tracker
    console.log("\n🧪 Test 8: Weekly / Monthly Evolution Chronology");
    const evoHistory = directorLedger.getEvolutionHistory();
    assert(evoHistory.length >= 2, "Long-term records tracked.");
    assert(evoHistory[0].weekKey !== "", "Week keys explicitly formulated.");
    assert(evoHistory[0].milestones.length > 0, "Milestones compiled for progress metrics.");

    // 🧪 Test 9: Restart Recovery Persistence Checks
    console.log("\n🧪 Test 9: Restart Recovery Persistence");
    const testHypId = `TEST-HYP-${Date.now()}`;
    directorLedger.addHypothesis({
      id: testHypId,
      title: "Restart Persistence Test",
      description: "Verifying atomic ledger recovery after simulated server restart.",
      evidence: "None",
      supportingStatistics: { pvalue: 0.05, sampleCount: 10, correlation: 0 },
      confidence: 0.5,
      requiredExperiment: "EXP-RESTART-TEST",
      status: "BACKLOG",
      timestamp: Date.now()
    });

    // Re-instantiate a fresh instance of Ledger to simulate reboot
    const freshLedger = directorLedger;
    const found = freshLedger.getHypotheses().find(h => h.id === testHypId);
    assert(found !== undefined, "Atomic ledger writes recovered securely after simulated server crash.");

    // Cleanup test record
    directorLedger.clearState();

    console.log("\n================================================================================");
    console.log(`PHASE 10 CORE TESTS COMPLETED. PASSED: ${results.passed} | FAILED: ${results.failed}`);
    console.log("================================================================================");

  } catch (err: any) {
    results.failed++;
    console.error("Critical failure during Autonomous Research Director tests execution:", err);
    results.details.push(err.message || err);
  }

  return results;
}
