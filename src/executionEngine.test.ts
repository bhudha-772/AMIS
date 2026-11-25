import { ExecutionPlanner } from "./executionPlanner";
import { ExecutionSimulator } from "./executionSimulator";
import { executionLedgerEngine } from "./executionLedger";
import { executionIntelligenceLab } from "./executionEngine";
import { ExecutionPlan, SimulationConfig } from "./executionTypes";

export interface ExecutionTestResults {
  passed: number;
  failed: number;
  details: string[];
}

/**
 * Runs the complete automated deterministic test suite for the Phase 8 Execution Intelligence Laboratory.
 */
export function runExecutionEngineTests(): ExecutionTestResults {
  const results: ExecutionTestResults = {
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
    console.log("RUNNING EXECUTION INTELLIGENCE LABORATORY DETERMINISTIC TESTS (PHASE 8)");
    console.log("================================================================================");

    // 1. Reset simulators and ledger for clean isolated test runs
    ExecutionSimulator.reset();
    executionLedgerEngine.clearAllRecords();

    const testSimConfig: SimulationConfig = {
      baseSlippage: 0.001,       // 0.1%
      baseSpread: 0.0005,        // 0.05%
      baseLatency: 30,           // 30ms
      jitter: 0.1,               // 10% jitter
      rejectionProbability: 0.0, // force deterministic outcomes
      networkInterruptionRate: 0.0,
      queueDelayMeanMs: 5
    };

    // 2. Test 1: Execution Planner (Immutability and Constraints Validation)
    console.log("\n🧪 Test 1: Execution Planner - Immutability & Validation");
    try {
      const plan = ExecutionPlanner.generatePlan({
        symbol: "BTCUSDT",
        side: "BUY",
        orderType: "MARKET",
        entryPrice: 95000,
        positionSize: 0.1,
        stopLoss: 93100, // 2% drawdown
        takeProfit: 98000  // ~3.1% win
      });

      assert(plan.symbol === "BTCUSDT", "Planner maps fields correctly.");
      assert(Object.isFrozen(plan), "Execution Plan is frozen and immutable.");
      
      // Test invalid inputs throwing errors
      let validationThrown = false;
      try {
        ExecutionPlanner.generatePlan({
          symbol: "BTCUSDT",
          side: "BUY",
          orderType: "MARKET",
          entryPrice: 95000,
          positionSize: -0.1, // invalid negative size
          stopLoss: 93000,
          takeProfit: 98000
        });
      } catch (err) {
        validationThrown = true;
      }
      assert(validationThrown, "Planner validates and rejects negative position sizes.");

      // Test incorrect stops mapping
      let invalidStopsThrown = false;
      try {
        ExecutionPlanner.generatePlan({
          symbol: "BTCUSDT",
          side: "BUY",
          orderType: "MARKET",
          entryPrice: 95000,
          positionSize: 0.1,
          stopLoss: 96000, // stop-loss above entry price on Buy is invalid
          takeProfit: 98000
        });
      } catch (err) {
        invalidStopsThrown = true;
      }
      assert(invalidStopsThrown, "Planner validates and rejects unsafe stop loss bounds.");
    } catch (e: any) {
      assert(false, `Execution Planner raised unexpected error: ${e.message}`);
    }

    // 3. Test 2: Execution Simulator (Market Order Filling & Slippage Simulation)
    console.log("\n🧪 Test 2: Execution Simulator - Fill Operations & Slippage");
    const plan = ExecutionPlanner.generatePlan({
      symbol: "BTCUSDT",
      side: "BUY",
      orderType: "MARKET",
      entryPrice: 95000,
      positionSize: 0.2,
      stopLoss: 93000,
      takeProfit: 98000
    });

    const sim = ExecutionSimulator.simulateExecution(plan, 95000, testSimConfig);
    assert(sim.status === "COMPLETED", "Market orders are automatically completed.");
    assert(sim.fillEvents.length === 1, "Market order filled in a single event by default.");
    assert(sim.fillEvents[0].amount === 0.2, "Fill maps exact planned position size.");
    assert(sim.fillEvents[0].price > 95000, "Buy order slippage increases final entry fill price.");

    // 4. Test 3: Network Latency & Jitter Calculations
    console.log("\n🧪 Test 3: Latency Simulation");
    assert(sim.totalLatencyMs >= 25 && sim.totalLatencyMs <= 40, "Fill latency simulates base latency with minor jitter.");

    // 5. Test 4: Duplicate Request Prevention
    console.log("\n🧪 Test 4: Duplicate Request Prevention Gating");
    const duplicateSim = ExecutionSimulator.simulateExecution(plan, 95000, testSimConfig);
    assert(duplicateSim.status === "REJECTED", "Re-evaluating the exact same plan ID blocks order execution.");
    assert(duplicateSim.failureReason === "DUPLICATE_REQUEST", "Rejection lists proper duplicate request reason.");

    // 6. Test 5: Forced Network Interruptions & Timeout Failures
    console.log("\n🧪 Test 5: Network Timeout & Retry Simulation");
    const planTimeout = ExecutionPlanner.generatePlan({
      symbol: "ETHUSDT",
      side: "BUY",
      orderType: "MARKET",
      entryPrice: 2800,
      positionSize: 1.5,
      stopLoss: 2700,
      takeProfit: 3000
    });
    const timeoutSim = ExecutionSimulator.simulateExecution(planTimeout, 2800, testSimConfig, { forceTimeout: true });
    assert(timeoutSim.status === "REJECTED", "Forced timeout blocks immediate order completing.");
    assert(timeoutSim.failureReason === "TIMEOUT_NETWORK_INTERRUPTION", "Timeout reports network interruption.");
    assert(timeoutSim.retryCount === 1, "Simulated network timeout triggers exactly 1 retry.");

    // 7. Test 6: Partial Fills Multi-Event Simulation
    console.log("\n🧪 Test 6: Multi-Event Partial Fills Sizing");
    const planPartial = ExecutionPlanner.generatePlan({
      symbol: "SOLUSDT",
      side: "SELL",
      orderType: "MARKET",
      entryPrice: 150,
      positionSize: 10.0,
      stopLoss: 160,
      takeProfit: 130
    });
    const partialSim = ExecutionSimulator.simulateExecution(planPartial, 150, testSimConfig, { forcePartialFill: true });
    assert(partialSim.status === "COMPLETED", "Partial filled sets status to complete when fully cleared.");
    assert(partialSim.fillEvents.length === 2, "Partial fill splits order execution across multiple fill events.");
    const totalPartialFilled = partialSim.fillEvents.reduce((acc, f) => acc + f.amount, 0);
    assert(Math.abs(totalPartialFilled - 10.0) < 0.00001, "Combined partial fill segments match overall planned size.");

    // 8. Test 7: Order Expirations Gating
    console.log("\n🧪 Test 7: Expiration Timestamp Gating");
    const planExpired = ExecutionPlanner.generatePlan({
      symbol: "BTCUSDT",
      side: "BUY",
      orderType: "MARKET",
      entryPrice: 95000,
      positionSize: 0.1,
      stopLoss: 93000,
      takeProfit: 98000,
      expirationDurationMs: -10 // expired 10ms ago
    });
    const expiredSim = ExecutionSimulator.simulateExecution(planExpired, 95000, testSimConfig);
    assert(expiredSim.status === "EXPIRED", "Order execution blocks and sets status as EXPIRED past its lifetime.");

    // 9. Test 8: Execution Ledger Persistence
    console.log("\n🧪 Test 8: Ledger Persistence & Immutability");
    const beforeRecords = executionLedgerEngine.getRecords().length;
    executionLedgerEngine.recordExecution(plan, sim.status, sim);
    const afterRecords = executionLedgerEngine.getRecords().length;
    assert(afterRecords === beforeRecords + 1, "Simulated execution is appended to the ledger.");
    const recorded = executionLedgerEngine.getRecords()[afterRecords - 1];
    assert(recorded.plan.id === plan.id, "Saved record maps execution plan accurately.");

    // 10. Test 9: Execution Analytics Engine Computation
    console.log("\n🧪 Test 9: Execution Analytics Computation");
    const analytics = executionLedgerEngine.computeAnalytics();
    assert(analytics.fillRate > 0 && analytics.fillRate <= 1, "Fill rate is correctly calculated as a percentage fraction.");
    assert(analytics.averageLatency > 0, "Average latency maps correctly.");
    assert(analytics.executionQuality > 0 && analytics.executionQuality <= 100, "Execution Quality score stays in [0,100] range.");

    // 11. Test 10: Restart Recovery State Restoration
    console.log("\n🧪 Test 10: Restart Recovery");
    const memoryRecordCount = executionLedgerEngine.getRecords().length;
    // Instantiate a new engine instance to force file-based reload
    // @ts-ignore (private constructor bypassed to verify recovery state)
    const recoveredEngine = new (executionLedgerEngine.constructor)();
    const recoveredRecordCount = recoveredEngine.getRecords().length;
    assert(recoveredRecordCount === memoryRecordCount, "Restart recovery matches cache with file-backed ledger state.");

    console.log("\n================================================================================");
    console.log(`EXECUTION INTELLIGENCE TESTING VERDICT: ${results.passed} PASSED | ${results.failed} FAILED`);
    console.log("================================================================================\n");

  } catch (err: any) {
    results.failed++;
    results.details.push(`Fatal Suite Crash: ${err.message || err}`);
    console.error("❌ Test suite execution crashed fatally:", err);
  }

  return results;
}
