import { ExecutionPlan, ExecutionSide, ExecutionOrderType, ExecutionTimeInForce, BreakEvenRule, TrailingStopRule, PartialExitTarget, ScalingRule } from "./executionTypes";

/**
 * PURPOSE: Generates immutable, deterministic Execution Plans linking Decisions, Predictions, and Risk approvals.
 * INPUTS: Sizing, entry, exits, and auxiliary rules parameters.
 * OUTPUTS: Immutable ExecutionPlan record.
 * COMPLEXITY: O(1) space and time.
 * FAILURE MODES: Validation errors on negative sizing, invalid stops, or incorrect directions.
 * LIMITATIONS: Purely planning logic; does not manage active positions or exchange connections.
 */
export class ExecutionPlanner {
  /**
   * Generates a fully formed, immutable ExecutionPlan from signals and risk guidance.
   */
  public static generatePlan(params: {
    readonly symbol: string;
    readonly side: ExecutionSide;
    readonly orderType: ExecutionOrderType;
    readonly entryPrice: number;
    readonly positionSize: number;
    readonly stopLoss: number;
    readonly takeProfit: number;
    readonly predictionId?: string;
    readonly decisionId?: string;
    readonly riskApprovalId?: string;
    readonly breakEven?: Partial<BreakEvenRule>;
    readonly trailingStop?: Partial<TrailingStopRule>;
    readonly partialExits?: readonly PartialExitTarget[];
    readonly scalingRules?: Partial<ScalingRule>;
    readonly timeInForce?: ExecutionTimeInForce;
    readonly expirationDurationMs?: number; // duration from now in ms
  }): ExecutionPlan {
    const timestamp = Date.now();

    // 1. Inputs validation
    if (params.positionSize <= 0) {
      throw new Error("[Planner Error] Position size must be strictly positive");
    }
    if (params.entryPrice <= 0) {
      throw new Error("[Planner Error] Entry price must be strictly positive");
    }
    if (params.stopLoss <= 0 || params.takeProfit <= 0) {
      throw new Error("[Planner Error] Stop loss and Take profit levels must be positive");
    }

    // Direction validation
    if (params.side === "BUY") {
      if (params.stopLoss >= params.entryPrice) {
        throw new Error("[Planner Error] Buy stop-loss must be strictly below entry price");
      }
      if (params.takeProfit <= params.entryPrice) {
        throw new Error("[Planner Error] Buy take-profit must be strictly above entry price");
      }
    } else {
      if (params.stopLoss <= params.entryPrice) {
        throw new Error("[Planner Error] Sell stop-loss must be strictly above entry price");
      }
      if (params.takeProfit >= params.entryPrice) {
        throw new Error("[Planner Error] Sell take-profit must be strictly below entry price");
      }
    }

    // Default Break-even rules
    const breakEven: BreakEvenRule = {
      active: params.breakEven?.active ?? false,
      triggerOffsetPct: params.breakEven?.triggerOffsetPct ?? 1.5, // 1.5% profit triggers break-even
      targetOffsetPct: params.breakEven?.targetOffsetPct ?? 0.1     // move SL to entry + 0.1%
    };

    // Default Trailing stop rules
    const trailingStop: TrailingStopRule = {
      active: params.trailingStop?.active ?? false,
      callbackRatePct: params.trailingStop?.callbackRatePct ?? 0.5,    // trail at 0.5% distance
      activationOffsetPct: params.trailingStop?.activationOffsetPct ?? 1.0 // activate after 1.0% profit
    };

    // Default Partial Exits - frozen to preserve immutability
    const partialExits: readonly PartialExitTarget[] = params.partialExits 
      ? Object.freeze(params.partialExits.map(target => Object.freeze({ ...target })))
      : Object.freeze([]);

    // Default Scaling rules
    const scalingRules: ScalingRule = {
      active: params.scalingRules?.active ?? false,
      stepDistancePct: params.scalingRules?.stepDistancePct ?? 1.0,
      stepSizePct: params.scalingRules?.stepSizePct ?? 0.5,
      maxSteps: params.scalingRules?.maxSteps ?? 3
    };

    const timeInForce = params.timeInForce ?? "GTC";
    const expiration = params.expirationDurationMs && params.expirationDurationMs > 0
      ? timestamp + params.expirationDurationMs
      : 0; // 0 indicates GTC / no expiration

    // Create the plan using a frozen object to ensure absolute immutability
    const plan: ExecutionPlan = {
      id: `EXEC-PLAN-${timestamp}-${Math.floor(Math.random() * 100000)}`,
      predictionId: params.predictionId ?? "MOCK-PRED-12345",
      decisionId: params.decisionId ?? "MOCK-DEC-12345",
      riskApprovalId: params.riskApprovalId ?? "MOCK-RISK-12345",
      symbol: params.symbol,
      side: params.side,
      orderType: params.orderType,
      entryPrice: params.entryPrice,
      limitPrice: params.orderType === "LIMIT" ? params.entryPrice : undefined,
      positionSize: params.positionSize,
      stopLoss: params.stopLoss,
      takeProfit: params.takeProfit,
      breakEven,
      trailingStop,
      partialExits,
      scalingRules,
      timeInForce,
      expiration,
      createdAt: timestamp
    };

    return Object.freeze(plan);
  }
}
