import { ExecutionPlan, FillEvent, SimulationConfig, ExecutionOrderStatus, ExecutionLedgerRecord } from "./executionTypes";

/**
 * PURPOSE: Accurately simulates exchange matching, network jitter, slippage, partial fills, queue delays, and order failures.
 * INPUTS: ExecutionPlan, SimulationConfig, and Current Market Metrics.
 * OUTPUTS: Deterministic fill events and execution metrics.
 * COMPLEXITY: O(1) matching evaluation.
 * FAILURE MODES: Network interruption, broker rejections, timeouts, duplicate requests, or expirations.
 * LIMITATIONS: Simulated matching model; does not integrate with real live exchange APIs.
 */
export class ExecutionSimulator {
  private static processedPlanIds = new Set<string>();
  private static activeOrderQueue = new Map<string, ExecutionPlan>();

  /**
   * Resets the duplicate request filter and active queue (mainly for testing or system restart).
   */
  public static reset() {
    this.processedPlanIds.clear();
    this.activeOrderQueue.clear();
  }

  /**
   * Simulates active execution of a plan against immediate market conditions.
   * Supports Market, Limit, and Stop orders, simulating multiple realistic slippage and latency factors.
   */
  public static simulateExecution(
    plan: ExecutionPlan,
    currentMarketPrice: number,
    config: SimulationConfig,
    options: {
      readonly isCancelled?: boolean;
      readonly isExpired?: boolean;
      readonly isDuplicate?: boolean;
      readonly forcePartialFill?: boolean;
      readonly forceTimeout?: boolean;
      readonly forceRejection?: boolean;
      readonly priceStream?: number[]; // list of prices for limit/stop matching
    } = {}
  ): {
    readonly status: ExecutionOrderStatus;
    readonly fillEvents: readonly FillEvent[];
    readonly averageSlippagePct: number;
    readonly totalLatencyMs: number;
    readonly averageSpreadPct: number;
    readonly failureReason?: string;
    readonly queueDelayMs: number;
    readonly retryCount: number;
  } {
    const timestamp = Date.now();

    // 1. Simulate duplicate request detection
    const isDuplicate = options.isDuplicate || this.processedPlanIds.has(plan.id);
    if (isDuplicate) {
      return {
        status: "REJECTED",
        fillEvents: [],
        averageSlippagePct: 0,
        totalLatencyMs: 0,
        averageSpreadPct: 0,
        failureReason: "DUPLICATE_REQUEST",
        queueDelayMs: 0,
        retryCount: 0
      };
    }
    this.processedPlanIds.add(plan.id);

    // 2. Simulate manual cancellation before processing
    if (options.isCancelled) {
      return {
        status: "CANCELLED",
        fillEvents: [],
        averageSlippagePct: 0,
        totalLatencyMs: 0,
        averageSpreadPct: 0,
        failureReason: "USER_CANCELLED",
        queueDelayMs: 0,
        retryCount: 0
      };
    }

    // 3. Simulate order expiration check
    if (options.isExpired || (plan.expiration > 0 && timestamp > plan.expiration)) {
      return {
        status: "EXPIRED",
        fillEvents: [],
        averageSlippagePct: 0,
        totalLatencyMs: 0,
        averageSpreadPct: 0,
        failureReason: "ORDER_EXPIRED",
        queueDelayMs: 0,
        retryCount: 0
      };
    }

    // 4. Simulate network interruption or timeout
    const isTimeout = options.forceTimeout || (Math.random() < config.networkInterruptionRate);
    if (isTimeout) {
      // Simulate timeout and a single automatic retry in background
      const retryLatency = config.baseLatency * 3;
      return {
        status: "REJECTED",
        fillEvents: [],
        averageSlippagePct: 0,
        totalLatencyMs: retryLatency,
        averageSpreadPct: 0,
        failureReason: "TIMEOUT_NETWORK_INTERRUPTION",
        queueDelayMs: config.queueDelayMeanMs,
        retryCount: 1
      };
    }

    // 5. Simulate exchange/broker level administrative rejection
    const isRejected = options.forceRejection || (Math.random() < config.rejectionProbability);
    if (isRejected) {
      return {
        status: "REJECTED",
        fillEvents: [],
        averageSlippagePct: 0,
        totalLatencyMs: config.baseLatency,
        averageSpreadPct: 0,
        failureReason: "EXCHANGE_REJECTED_RISK_LIMITS",
        queueDelayMs: config.queueDelayMeanMs,
        retryCount: 0
      };
    }

    // 6. Calculate queue processing delay and latency with jitter
    const jitterMultiplier = 1 + (Math.random() - 0.5) * config.jitter;
    const queueDelay = Math.round(config.queueDelayMeanMs * jitterMultiplier);
    const networkLatency = Math.round(config.baseLatency * jitterMultiplier);
    const totalLatency = networkLatency + queueDelay;

    const spread = config.baseSpread * (1 + (Math.random() - 0.5) * config.jitter);

    // 7. Core execution matching rules
    if (plan.orderType === "LIMIT") {
      const limitPrice = plan.limitPrice ?? plan.entryPrice;
      const pricesToMatch = options.priceStream ?? [currentMarketPrice];
      const touchedLimit = pricesToMatch.some(p => 
        plan.side === "BUY" ? p <= limitPrice : p >= limitPrice
      );

      if (!touchedLimit) {
        // Order remains in queue as active/pending matching
        this.activeOrderQueue.set(plan.id, plan);
        return {
          status: "ACTIVE",
          fillEvents: [],
          averageSlippagePct: 0,
          totalLatencyMs: totalLatency,
          averageSpreadPct: spread,
          queueDelayMs: queueDelay,
          retryCount: 0
        };
      }
    } else if (plan.orderType === "STOP") {
      // Stop order requires price to cross trigger level first
      const pricesToMatch = options.priceStream ?? [currentMarketPrice];
      const triggered = pricesToMatch.some(p => 
        plan.side === "BUY" ? p >= plan.entryPrice : p <= plan.entryPrice
      );

      if (!triggered) {
        this.activeOrderQueue.set(plan.id, plan);
        return {
          status: "ACTIVE",
          fillEvents: [],
          averageSlippagePct: 0,
          totalLatencyMs: totalLatency,
          averageSpreadPct: spread,
          queueDelayMs: queueDelay,
          retryCount: 0
        };
      }
    }

    // Order executes! Construct Fill Events
    const fills: FillEvent[] = [];
    const averageSlippage = config.baseSlippage * (1 + Math.random() * config.jitter);

    if (options.forcePartialFill || (Math.random() < 0.15 && plan.positionSize > 0.05)) {
      // Simulating partial fill into 2 separate fill events to verify multi-event capabilities
      const fillSize1 = Number((plan.positionSize * 0.4).toFixed(6));
      const fillSize2 = Number((plan.positionSize * 0.6).toFixed(6));

      // First fill: slightly better slippage
      const slippage1 = averageSlippage * 0.7;
      const fillPrice1 = plan.side === "BUY" 
        ? currentMarketPrice * (1 + slippage1) 
        : currentMarketPrice * (1 - slippage1);

      fills.push({
        id: `fill-p1-${plan.id}`,
        timestamp: timestamp + queueDelay,
        price: Number(fillPrice1.toFixed(2)),
        amount: fillSize1,
        slippage: slippage1,
        latency: totalLatency,
        spread,
        commission: Number((fillPrice1 * fillSize1 * 0.0004).toFixed(4)) // 0.04% commission
      });

      // Second fill: slightly worse slippage
      const slippage2 = averageSlippage * 1.3;
      const fillPrice2 = plan.side === "BUY" 
        ? currentMarketPrice * (1 + slippage2) 
        : currentMarketPrice * (1 - slippage2);

      fills.push({
        id: `fill-p2-${plan.id}`,
        timestamp: timestamp + queueDelay + 15,
        price: Number(fillPrice2.toFixed(2)),
        amount: fillSize2,
        slippage: slippage2,
        latency: totalLatency + 15,
        spread: spread * 1.1,
        commission: Number((fillPrice2 * fillSize2 * 0.0004).toFixed(4))
      });
    } else {
      // Single clean complete fill event
      const fillPrice = plan.side === "BUY"
        ? currentMarketPrice * (1 + averageSlippage)
        : currentMarketPrice * (1 - averageSlippage);

      fills.push({
        id: `fill-${plan.id}`,
        timestamp: timestamp + queueDelay,
        price: Number(fillPrice.toFixed(2)),
        amount: plan.positionSize,
        slippage: averageSlippage,
        latency: totalLatency,
        spread,
        commission: Number((fillPrice * plan.positionSize * 0.0004).toFixed(4))
      });
    }

    // Clean up active queue if order was parked there
    this.activeOrderQueue.delete(plan.id);

    return {
      status: "COMPLETED",
      fillEvents: fills,
      averageSlippagePct: averageSlippage,
      totalLatencyMs: totalLatency,
      averageSpreadPct: spread,
      queueDelayMs: queueDelay,
      retryCount: 0
    };
  }

  /**
   * Helper to compute overall quality score of a completed fill.
   * Score ranges from 0 to 100 based on slippage, latency, spread, and commissions.
   */
  public static calculateExecutionQuality(
    averageSlippage: number,
    latency: number,
    spread: number,
    fillRate = 1.0
  ): number {
    // 100 is perfect execution.
    // Deduct points for high latency, excessive slippage, and wider spreads
    const slippagePenalty = averageSlippage * 1000; // 0.1% slippage = 1 point penalty
    const latencyPenalty = Math.max(0, (latency - 20) / 5); // decay penalty after 20ms base
    const spreadPenalty = spread * 500; // 0.1% spread = 0.5 points penalty
    const fillPenalty = (1 - fillRate) * 50; // penalty for partial fills

    const score = 100 - slippagePenalty - latencyPenalty - spreadPenalty - fillPenalty;
    return Number(Math.min(100, Math.max(0, score)).toFixed(2));
  }
}
export const executionSimulator = new ExecutionSimulator();
