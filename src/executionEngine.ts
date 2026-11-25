import { ExecutionPlan, ExecutionOrderStatus, FillEvent, SimulationConfig, ExecutionLedgerRecord } from "./executionTypes";
import { ExecutionPlanner } from "./executionPlanner";
import { ExecutionSimulator } from "./executionSimulator";
import { executionLedgerEngine } from "./executionLedger";
import { DerivAdapter, BinanceAdapter } from "./brokerAbstraction";
import { RiskDecision } from "./riskTypes";
import { DecisionOutput } from "./decisionEngine";

/**
 * PURPOSE: Orchestrates the entire simulation-driven Execution Intelligence pipeline.
 * INPUTS: RiskDecision / DecisionOutput signals, Market prices, and Simulation Config.
 * OUTPUTS: Instantiated plan, simulated filled events, and registered ledger audit records.
 * COMPLEXITY: O(1) matching evaluation per pipeline pass.
 * FAILURE MODES: Safety-blocked inputs, execution rejections, latency spikes, or network timeouts.
 * LIMITATIONS: Stub broker execution; performing zero external live network trading.
 */
export class ExecutionIntelligenceLab {
  private activePlans = new Map<string, ExecutionPlan>();
  private defaultSimConfig: SimulationConfig = {
    baseSlippage: 0.0005, // 0.05%
    baseSpread: 0.0004,   // 0.04%
    baseLatency: 35,      // 35ms
    jitter: 0.15,         // 15% random variation
    rejectionProbability: 0.005, // 0.5% rejection chance
    networkInterruptionRate: 0.01, // 1% timeout chance
    queueDelayMeanMs: 5   // 5ms broker queue delay
  };

  private derivAdapter = new DerivAdapter();
  private binanceAdapter = new BinanceAdapter();

  /**
   * Retrieves active simulation config or merges custom overrides.
   */
  public getSimConfig(): SimulationConfig {
    return this.defaultSimConfig;
  }

  /**
   * Updates current simulation parameter boundaries.
   */
  public updateSimConfig(updates: Partial<SimulationConfig>) {
    this.defaultSimConfig = {
      ...this.defaultSimConfig,
      ...updates
    };
  }

  /**
   * Orchestrates the complete pipeline:
   * Decision -> Risk Clearance -> Plan -> Simulation Fill -> Ledger Persistence -> Broker Stub
   */
  public executeDecisionPipeline(
    decision: DecisionOutput,
    riskDecision: RiskDecision,
    currentMarketPrice: number,
    platform: "binance" | "deriv" = "deriv",
    simOverrides: {
      readonly forcePartialFill?: boolean;
      readonly forceTimeout?: boolean;
      readonly forceRejection?: boolean;
    } = {}
  ): ExecutionLedgerRecord {
    const isApproved = riskDecision.action === "ALLOW" || riskDecision.action === "ALLOW_WITH_REDUCED_SIZE";

    if (!isApproved) {
      // Pipeline rejects at the risk boundary
      const dummyPlan = ExecutionPlanner.generatePlan({
        symbol: decision.market,
        side: decision.tradeDirection === "LONG" ? "BUY" : "SELL",
        orderType: "MARKET",
        entryPrice: currentMarketPrice,
        positionSize: 0.0001, // dummy small size
        stopLoss: decision.tradeDirection === "LONG" ? currentMarketPrice * 0.95 : currentMarketPrice * 1.05,
        takeProfit: decision.tradeDirection === "LONG" ? currentMarketPrice * 1.05 : currentMarketPrice * 0.95,
        predictionId: decision.predictionId,
        decisionId: decision.id,
        riskApprovalId: riskDecision.id
      });

      return executionLedgerEngine.recordExecution(
        dummyPlan,
        "REJECTED",
        {
          fillEvents: [],
          averageSlippagePct: 0,
          totalLatencyMs: 0,
          averageSpreadPct: 0,
          failureReason: `RISK_GATING_BLOCKED: ${riskDecision.explanation}`,
          queueDelayMs: 0,
          retryCount: 0
        },
        {
          finalResult: "REJECTED",
          netProfitUSD: 0,
          returnPct: 0
        }
      );
    }

    // 1. Generate deterministic, immutable execution plan
    const direction = decision.tradeDirection === "LONG" ? "BUY" : "SELL";
    const stopLoss = decision.tradeDirection === "LONG" 
      ? currentMarketPrice * (1 - (decision.expectedDrawdown || 0.02))
      : currentMarketPrice * (1 + (decision.expectedDrawdown || 0.02));
      
    const takeProfit = decision.tradeDirection === "LONG"
      ? currentMarketPrice * (1 + (decision.expectedMove || 0.05))
      : currentMarketPrice * (1 - (decision.expectedMove || 0.05));

    const plan = ExecutionPlanner.generatePlan({
      symbol: decision.market,
      side: direction,
      orderType: "MARKET", // default market order
      entryPrice: currentMarketPrice,
      positionSize: riskDecision.recommendedPositionSize || 0.05,
      stopLoss,
      takeProfit,
      predictionId: decision.predictionId,
      decisionId: decision.id,
      riskApprovalId: riskDecision.id,
      breakEven: { active: true, triggerOffsetPct: 1.2, targetOffsetPct: 0.1 },
      trailingStop: { active: true, callbackRatePct: 0.5, activationOffsetPct: 0.8 },
      timeInForce: "GTC"
    });

    // 2. Select abstract broker adapter (Execution depends only on BrokerInterface)
    const broker = platform === "binance" ? this.binanceAdapter : this.derivAdapter;

    // 3. Simulate order execution with realistic latency, slippage, and spread
    const simResult = ExecutionSimulator.simulateExecution(plan, currentMarketPrice, this.defaultSimConfig, simOverrides);

    // 4. Simulate a simple random market walk outcome for COMPLETED orders to generate realistic statistics
    let finalResult: "WON" | "LOST" | "CANCELLED" | "EXPIRED" | "REJECTED" | "ACTIVE" = "ACTIVE";
    let netProfitUSD = 0;
    let returnPct = 0;
    let holdingTimeMs = 0;

    if (simResult.status === "COMPLETED") {
      const isWin = Math.random() < (decision.historicalWinRate / 100 || 0.55);
      finalResult = isWin ? "WON" : "LOST";
      
      const multiplier = isWin ? (decision.expectedMove || 0.03) : -(decision.expectedDrawdown || 0.02);
      returnPct = multiplier * 100;
      
      const totalNotional = plan.positionSize * currentMarketPrice;
      netProfitUSD = Number((totalNotional * multiplier).toFixed(2));
      holdingTimeMs = Math.round(15000 + Math.random() * 600000); // 15s to 10m holding
    } else {
      finalResult = simResult.status as any;
    }

    // 5. Commit record permanently to ledger
    const ledgerRecord = executionLedgerEngine.recordExecution(
      plan,
      simResult.status,
      simResult,
      {
        finalResult,
        netProfitUSD,
        returnPct,
        holdingTimeMs: holdingTimeMs > 0 ? holdingTimeMs : undefined
      }
    );

    return ledgerRecord;
  }

  /**
   * Manually place a test plan to simulate and dry run specific boundary conditions.
   */
  public placeSimulatedOrder(plan: ExecutionPlan, simOverrides: any = {}): ExecutionLedgerRecord {
    const currentPrice = plan.entryPrice;
    const simResult = ExecutionSimulator.simulateExecution(plan, currentPrice, this.defaultSimConfig, simOverrides);
    
    let finalResult: "WON" | "LOST" | "CANCELLED" | "EXPIRED" | "REJECTED" | "ACTIVE" = "ACTIVE";
    let netProfitUSD = 0;
    let returnPct = 0;
    let holdingTimeMs = 0;

    if (simResult.status === "COMPLETED") {
      const isWin = Math.random() < 0.55;
      finalResult = isWin ? "WON" : "LOST";
      const outcomePct = isWin ? 0.035 : -0.015;
      returnPct = outcomePct * 100;
      netProfitUSD = Number((plan.positionSize * currentPrice * outcomePct).toFixed(2));
      holdingTimeMs = Math.round(10000 + Math.random() * 300000);
    } else {
      finalResult = simResult.status as any;
    }

    return executionLedgerEngine.recordExecution(
      plan,
      simResult.status,
      simResult,
      {
        finalResult,
        netProfitUSD,
        returnPct,
        holdingTimeMs: holdingTimeMs > 0 ? holdingTimeMs : undefined
      }
    );
  }
}

export const executionIntelligenceLab = new ExecutionIntelligenceLab();
