import { BrokerInterface, ExecutionPlan, FillEvent } from "./executionTypes";

/**
 * PURPOSE: Stub adapter for Deriv binary option / contract broker.
 * INPUTS: ExecutionPlan or order commands.
 * OUTPUTS: FillEvent stub or rejection/timeout status.
 * COMPLEXITY: O(1) deterministic stubs.
 * FAILURE MODES: None (isolated sandbox).
 * LIMITATIONS: Performs zero network communication.
 */
export class DerivAdapter implements BrokerInterface {
  public readonly name = "DerivBroker";

  public async placeOrder(plan: ExecutionPlan): Promise<FillEvent | "REJECTED" | "TIMEOUT"> {
    // Return a compiled stub for Deriv platform
    return {
      id: `deriv-fill-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: Date.now(),
      price: plan.entryPrice,
      amount: plan.positionSize,
      slippage: 0.0,
      latency: 12, // simulated fast connection
      spread: 0.0005,
      commission: plan.positionSize * plan.entryPrice * 0.0002 // 0.02%
    };
  }

  public async cancelOrder(orderId: string): Promise<boolean> {
    return true;
  }

  public async getMarketPrice(symbol: string): Promise<number> {
    return 95000.0; // stub placeholder
  }

  public async getSpread(symbol: string): Promise<number> {
    return 0.0005;
  }
}

/**
 * PURPOSE: Stub adapter for Binance spot / futures broker.
 * INPUTS: ExecutionPlan or order commands.
 * OUTPUTS: FillEvent stub or rejection/timeout status.
 * COMPLEXITY: O(1) deterministic stubs.
 * FAILURE MODES: None (isolated sandbox).
 * LIMITATIONS: Performs zero network communication.
 */
export class BinanceAdapter implements BrokerInterface {
  public readonly name = "BinanceBroker";

  public async placeOrder(plan: ExecutionPlan): Promise<FillEvent | "REJECTED" | "TIMEOUT"> {
    // Return a compiled stub for Binance platform
    return {
      id: `binance-fill-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: Date.now(),
      price: plan.entryPrice,
      amount: plan.positionSize,
      slippage: 0.0001,
      latency: 45, // typical REST latency
      spread: 0.0002,
      commission: plan.positionSize * plan.entryPrice * 0.0004 // 0.04% commission
    };
  }

  public async cancelOrder(orderId: string): Promise<boolean> {
    return true;
  }

  public async getMarketPrice(symbol: string): Promise<number> {
    return 95000.0; // stub placeholder
  }

  public async getSpread(symbol: string): Promise<number> {
    return 0.0002;
  }
}
