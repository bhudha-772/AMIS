import { supervisorEngine } from "./supervisorEngine";
import { supervisorLedger } from "./supervisorLedger";

export interface SupervisorTestResults {
  passed: number;
  failed: number;
  details: string[];
}

/**
 * Runs the automated deterministic test suite for Phase 9 - Supervisor & Operational Intelligence.
 */
export function runSupervisorEngineTests(): SupervisorTestResults {
  const results: SupervisorTestResults = {
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
    console.log("RUNNING OPERATIONAL INTELLIGENCE & SUPERVISOR DETERMINISTIC TESTS (PHASE 9)");
    console.log("================================================================================");

    // 1. Reset ledger
    supervisorLedger.clearLedger();
    supervisorEngine.clearAnomalies();
    supervisorEngine.setRiskViolations(0);
    supervisorEngine.setCalDev(0.01);

    // 2. Test Core Event Logging (Part 6)
    console.log("\n🧪 Test 1: Immutable Operational Log Ledger");
    const log1 = supervisorLedger.logEvent({
      subsystem: "RISK",
      severity: "CRITICAL",
      title: "Simulated Risk Breach",
      evidence: "Test loss threshold limit of 5.0% reached on index contract BTCUSDT",
      rootCause: "Extreme tail volatility",
      recommendedAction: "Halt automated execution flow and alert desk"
    });

    assert(log1.subsystem === "RISK", "Subsystem logged correctly.");
    assert(log1.severity === "CRITICAL", "Severity parsed correctly.");
    assert(log1.resolved === false, "Event initializes as unresolved.");
    assert(log1.id.startsWith("SUP-EVT-"), "Event ID is prefixed properly.");

    const events = supervisorLedger.getEvents();
    assert(events.length === 1, "Ledger contains exactly 1 logged event.");

    // Resolve event
    const res = supervisorLedger.resolveEvent(log1.id);
    assert(res === true, "Successfully marked event as resolved.");
    assert(supervisorLedger.getEvents()[0].resolved === true, "Event is marked resolved inside ledger cache.");
    assert(supervisorLedger.getEvents()[0].resolvedAt !== undefined, "Resolution timestamp is populated.");

    // 3. Test Health Engine & Evidence Scoring (Part 2)
    console.log("\n🧪 Test 2: Evidence-Based Health Engine Calculations");
    const initHealth = supervisorEngine.calculateHealth();
    assert(initHealth.overallScore >= 90, "Initial overall health score is optimal.");
    assert(initHealth.subsystems.RISK.score === 100, "Initial Risk health score is 100.");

    // Induce a series of risk violations to verify health decay
    supervisorEngine.setRiskViolations(10);
    const degradedHealth = supervisorEngine.calculateHealth();
    assert(degradedHealth.subsystems.RISK.score < 100, "Induced violations correctly decay subsystem health.");
    assert(degradedHealth.overallScore < initHealth.overallScore, "Decayed subsystem reduces overall health.");

    // 4. Test Watchdog Monitors (Part 3)
    console.log("\n🧪 Test 3: Watchdog Verification Suite");
    const watchdogs = supervisorEngine.calculateWatchdogs();
    assert(watchdogs.length >= 5, "Watchdogs are monitoring at least 5 different system properties.");
    
    // Check fields of a representative watchdog
    const memWatchdog = watchdogs.find(w => w.name === "Memory usage limits");
    assert(memWatchdog !== undefined, "Memory Watchdog exists.");
    assert(memWatchdog?.subsystem === "PERSISTENCE", "Memory Watchdog mapped to Persistence.");

    // 5. Test Anomaly Detection (Part 5)
    console.log("\n🧪 Test 4: Anomaly Detection Triggering");
    // Induce impossible market price to trigger anomaly
    supervisorEngine.recordTick(-500); // Impossible negative price
    const activeAnomalies = supervisorEngine.getAnomalies();
    assert(activeAnomalies.length > 0, "Anomalous tick triggers an active system anomaly.");
    assert(activeAnomalies[0].level === "CRITICAL", "Impossible price classified as critical.");

    // 6. Test Safety Controller & Directives (Part 8)
    console.log("\n🧪 Test 5: Safety Controller Decision Matrix");
    // Induce multiple warnings to trigger emergency pause recommendation
    supervisorEngine.setRiskViolations(30);
    supervisorEngine.setCalDev(0.12); // Extreme probability drift
    const rec = supervisorEngine.calculateSafetyRecommendation();
    assert(rec === "EMERGENCY_STOP" || rec === "PAUSE_EXECUTION", "Safety recommendations adapt appropriately to degradation.");

    console.log("\n================================================================================");
    console.log(`OPERATIONAL TESTS COMPLETED. PASSED: ${results.passed} | FAILED: ${results.failed}`);
    console.log("================================================================================");

  } catch (err: any) {
    results.failed++;
    console.error("Critical crash inside supervisor test suite:", err);
    results.details.push(err.message || err);
  }

  return results;
}
