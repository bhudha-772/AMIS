export type RiskAction = "ALLOW" | "ALLOW_WITH_REDUCED_SIZE" | "WATCH" | "BLOCK" | "EMERGENCY_STOP";
export type EmergencyState = "NORMAL" | "CAUTION" | "HIGH_RISK" | "LOCKDOWN" | "EMERGENCY_STOP";

export interface CapitalState {
  currentEquity: number;
  availableMargin: number;
  usedMargin: number;
  dailyPL: number;
  weeklyPL: number;
  monthlyPL: number;
  floatingProfit: number;
  floatingLoss: number;
  maxDailyLoss: number; // in USDT, e.g. 1000
  maxWeeklyLoss: number;
  maxMonthlyLoss: number;
  maxDrawdown: number; // as percentage, e.g. 20 for 20%
  riskPerTrade: number; // as fractional value, e.g. 0.02 for 2%
  portfolioRisk: number; // overall combined risk of open positions in USDT
  capitalUtilization: number; // percentage of capital used, 0 to 100
  recoveryFactor: number;
  riskOfRuin: number; // computed probability, 0 to 100
  positionExposure: number; // current open total position value in USDT
}

export type SizingMethod =
  | "FIXED_SIZE"
  | "FIXED_FRACTIONAL"
  | "KELLY_CRITERION"
  | "REDUCED_KELLY"
  | "VOLATILITY_ADJUSTED"
  | "ATR_BASED"
  | "EXPECTED_VALUE_WEIGHTED"
  | "CONFIDENCE_WEIGHTED"
  | "PROBABILITY_WEIGHTED"
  | "DYNAMIC_RISK_SCALING";

export interface OpenPositionRisk {
  symbol: string;
  side: "LONG" | "SHORT";
  entryPrice: number;
  currentPrice: number;
  amount: number;
  riskAmount: number; // USDT at risk (entry to stop loss)
  exposureValue: number; // amount * currentPrice
  strategy: string;
  model: string;
  timestamp: number;
}

export interface PortfolioRiskState {
  openPositions: OpenPositionRisk[];
  correlatedPositions: number; // count of open positions in highly correlated pairs
  marketExposure: number; // overall USDT value of open positions
  syntheticIndexExposure: number; // exposure to synthetic indices in USDT
  currencyExposure: Record<string, number>; // exposure per base currency in USDT
  strategyExposure: Record<string, number>; // exposure per strategy in USDT
  modelExposure: Record<string, number>; // exposure per model in USDT
  maxSimultaneousTrades: number;
  maxConsecutiveLosses: number;
  maxConsecutiveWins: number;
  coolingOffPeriods: Record<string, number>; // symbol -> timestamp until which trading is blocked
  tradeFrequency: number; // trades per hour
  portfolioHeat: number; // total portfolio risk / total equity (percentage)
}

export interface RiskRuleResult {
  ruleId: string;
  name: string;
  passed: boolean;
  actualValue: string | number;
  thresholdValue: string | number;
  description: string;
}

export interface RiskDecision {
  id: string; // RISK-DEC-xxx
  decisionId: string; // DEC-xxx (referencing original Decision)
  timestamp: number;
  riskScore: number; // 0 to 100
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  capitalStateSnapshot: CapitalState;
  portfolioStateSnapshot: PortfolioRiskState;
  sizingMethodUsed: SizingMethod;
  recommendedPositionSize: number; // size in asset units (e.g., 0.05 BTC)
  recommendedCapitalAllocation: number; // size in USDT value
  safetyResults: RiskRuleResult[];
  failedRules: string[];
  passedRules: string[];
  expectedDrawdown: number; // percentage
  riskOfRuin: number; // percentage
  dailyRiskRemaining: number; // remaining loss allowance for the day
  portfolioHeat: number; // percentage
  reasonCodes: string[];
  action: RiskAction;
  explanation: string;
}

export interface RiskConfig {
  emergencyState: EmergencyState;
  capitalState: CapitalState;
  sizingMethod: SizingMethod;
  fixedSizeAmount: number; // fixed sizing base units, e.g. 0.02 units
  fixedSizeUSDT: number; // fallback size in USDT, e.g. 100 USDT
  leverageLimit: number;
  maxSlippageLimit: number; // percentage
  maxSpreadLimit: number; // percentage
  maxLatencyLimit: number; // ms
  maxPredictionAge: number; // ms
  maxMarketNoise: number;
  minLiquidityIndicator: number;
  coolingOffDuration: number; // ms
}

export interface RiskStateLog {
  timestamp: number;
  fromState: EmergencyState;
  toState: EmergencyState;
  triggerEvent: string;
  userEmail: string;
}
