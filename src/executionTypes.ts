export type ExecutionOrderType = "MARKET" | "LIMIT" | "STOP";
export type ExecutionSide = "BUY" | "SELL";
export type ExecutionTimeInForce = "GTC" | "IOC" | "FOK" | "GTD";
export type ExecutionOrderStatus = "PENDING" | "ACTIVE" | "COMPLETED" | "CANCELLED" | "REJECTED" | "EXPIRED";

export interface BreakEvenRule {
  readonly active: boolean;
  readonly triggerOffsetPct: number; // e.g. 1% gain triggers break-even
  readonly targetOffsetPct: number;  // e.g. moves SL to entry + 0.1%
}

export interface TrailingStopRule {
  readonly active: boolean;
  readonly callbackRatePct: number;   // e.g. 0.5% trailing distance
  readonly activationOffsetPct: number; // e.g. start trailing after 1% profit
}

export interface PartialExitTarget {
  readonly sizePct: number;         // percentage of size to close (e.g. 50%)
  readonly triggerPrice: number;    // price level
  readonly filled: boolean;
}

export interface ScalingRule {
  readonly active: boolean;
  readonly stepDistancePct: number; // percentage drop/rise to add position
  readonly stepSizePct: number;     // position size increment
  readonly maxSteps: number;
}

export interface ExecutionPlan {
  readonly id: string;
  readonly predictionId: string;
  readonly decisionId: string;
  readonly riskApprovalId: string;
  readonly symbol: string;
  readonly side: ExecutionSide;
  readonly orderType: ExecutionOrderType;
  readonly entryPrice: number;
  readonly limitPrice?: number;
  readonly positionSize: number; // in asset units
  readonly stopLoss: number;
  readonly takeProfit: number;
  readonly breakEven: BreakEvenRule;
  readonly trailingStop: TrailingStopRule;
  readonly partialExits: readonly PartialExitTarget[];
  readonly scalingRules: ScalingRule;
  readonly timeInForce: ExecutionTimeInForce;
  readonly expiration: number; // timestamp in ms (0 for never)
  readonly createdAt: number;
}

export interface FillEvent {
  readonly id: string;
  readonly timestamp: number;
  readonly price: number;
  readonly amount: number;
  readonly slippage: number; // actual slippage as percentage
  readonly latency: number;  // execution latency in ms
  readonly spread: number;   // spread at fill time
  readonly commission: number; // trading commission cost
}

export interface ExecutionLedgerRecord {
  readonly executionId: string;
  readonly predictionId: string;
  readonly decisionId: string;
  readonly riskApprovalId: string;
  readonly plan: ExecutionPlan;
  readonly status: ExecutionOrderStatus;
  readonly fillEvents: readonly FillEvent[];
  readonly slippage: number; // average slippage for fills
  readonly latency: number;  // final or average execution latency in ms
  readonly spread: number;   // average spread encountered
  readonly finalResult: "WON" | "LOST" | "CANCELLED" | "EXPIRED" | "REJECTED" | "ACTIVE";
  readonly netProfitUSD: number;
  readonly returnPct: number;
  readonly executionQuality: number; // score from 0 to 100
  readonly failureReason?: string;
  readonly retryCount: number;
  readonly queueDelayMs: number;
  readonly createdAt: number;
  readonly resolvedAt?: number;
  readonly holdingTimeMs?: number;
  readonly schemaVersion: number; // schema version for persistence safety
}

export interface ExecutionAnalyticsMetrics {
  readonly averageSlippage: number;
  readonly averageLatency: number;
  readonly fillRate: number; // completed order count / total placed
  readonly rejectionRate: number;
  readonly retryRate: number; // order retried count / total placed
  readonly executionQuality: number; // overall average execution quality
  readonly missedOpportunities: number; // orders rejected/timed out that would have been profitable
  readonly spreadCost: number; // total spread costs incurred
  readonly executionCost: number; // total commission + slippage costs
  readonly averageHoldingTime: number; // average holding time of trades in ms
  readonly orderLifetime: number; // average time from pending to fill or cancel in ms
  readonly executionReliability: number; // ratio of clean fills to failures
}

export interface SimulationConfig {
  baseSlippage: number;       // default slippage (e.g. 0.0005)
  baseSpread: number;          // default bid/ask spread (e.g. 0.0008)
  baseLatency: number;         // network round-trip latency in ms
  jitter: number;              // latency/slippage random variance coefficient
  rejectionProbability: number; // probability of broker rejecting order (e.g. 0.01)
  networkInterruptionRate: number; // probability of simulated network timeout (e.g. 0.02)
  queueDelayMeanMs: number;    // simulated server processing delay (e.g. 10ms)
}

// Broker Interface (Part 7)
export interface BrokerInterface {
  readonly name: string;
  placeOrder(plan: ExecutionPlan): Promise<FillEvent | "REJECTED" | "TIMEOUT">;
  cancelOrder(orderId: string): Promise<boolean>;
  getMarketPrice(symbol: string): Promise<number>;
  getSpread(symbol: string): Promise<number>;
}
