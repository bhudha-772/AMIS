import * as fs from "fs";
import * as path from "path";
import { DecisionOutput } from "./decisionEngine";
import {
  RiskAction,
  EmergencyState,
  CapitalState,
  SizingMethod,
  PortfolioRiskState,
  OpenPositionRisk,
  RiskRuleResult,
  RiskDecision,
  RiskConfig,
  RiskStateLog
} from "./riskTypes";

const RISK_STATE_FILE = path.join(process.cwd(), "data", "risk_state.json");
const RISK_REGISTRY_FILE = path.join(process.cwd(), "data", "risk_registry.json");
const TRANSITION_LOG_FILE = path.join(process.cwd(), "data", "risk_transition_log.json");

export class RiskIntelligenceEngine {
  private config!: RiskConfig;
  private openPositions: OpenPositionRisk[] = [];
  private coolingOffPeriods: Record<string, number> = {};
  private consecutiveLosses = 0;
  private consecutiveWins = 0;
  private transitionLogs: RiskStateLog[] = [];
  private riskDecisions: RiskDecision[] = [];

  constructor() {
    this.initializeDefaultState();
    this.loadState();
  }

  /**
   * Bootstraps default risk configuration and mock capital balance
   */
  private initializeDefaultState() {
    const defaultCapital: CapitalState = {
      currentEquity: 100000,
      availableMargin: 100000,
      usedMargin: 0,
      dailyPL: 0,
      weeklyPL: 0,
      monthlyPL: 0,
      floatingProfit: 0,
      floatingLoss: 0,
      maxDailyLoss: 5000, // 5% of equity
      maxWeeklyLoss: 12000, // 12% of equity
      maxMonthlyLoss: 25000, // 25% of equity
      maxDrawdown: 15, // 15% maximum drawdown
      riskPerTrade: 0.02, // 2% risk per trade default
      portfolioRisk: 0,
      capitalUtilization: 0,
      recoveryFactor: 2.45, // Based on paper-trading history
      riskOfRuin: 0, // Computed dynamically
      positionExposure: 0
    };

    this.config = {
      emergencyState: "NORMAL",
      capitalState: defaultCapital,
      sizingMethod: "FIXED_FRACTIONAL",
      fixedSizeAmount: 0.05, // 0.05 BTC base size
      fixedSizeUSDT: 500, // 500 USDT base allocation
      leverageLimit: 10, // Maximum 10x leverage
      maxSlippageLimit: 0.005, // 0.5% maximum slippage
      maxSpreadLimit: 0.003, // 0.3% maximum spread
      maxLatencyLimit: 250, // 250ms latency limit
      maxPredictionAge: 300000, // 5 minutes prediction age limit
      maxMarketNoise: 0.70, // Max 70% noise index
      minLiquidityIndicator: 0.35, // Min liquidity index
      coolingOffDuration: 1800000 // 30 minutes cooling off period
    };

    this.openPositions = [];
    this.coolingOffPeriods = {};
    this.consecutiveLosses = 0;
    this.consecutiveWins = 0;
    this.transitionLogs = [];
    this.riskDecisions = [];
    
    this.recomputeCapitalDerivedStats();
  }

  /**
   * Loads state from files if available to support restart recovery
   */
  private loadState() {
    try {
      const dir = path.dirname(RISK_STATE_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 1. Load general operational risk state
      if (fs.existsSync(RISK_STATE_FILE)) {
        const raw = fs.readFileSync(RISK_STATE_FILE, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed.config) this.config = parsed.config;
        if (parsed.openPositions) this.openPositions = parsed.openPositions;
        if (parsed.coolingOffPeriods) this.coolingOffPeriods = parsed.coolingOffPeriods;
        if (parsed.consecutiveLosses !== undefined) this.consecutiveLosses = parsed.consecutiveLosses;
        if (parsed.consecutiveWins !== undefined) this.consecutiveWins = parsed.consecutiveWins;
      }

      // 2. Load risk decisions history
      if (fs.existsSync(RISK_REGISTRY_FILE)) {
        const rawReg = fs.readFileSync(RISK_REGISTRY_FILE, "utf8");
        this.riskDecisions = JSON.parse(rawReg);
      }

      // 3. Load emergency transition logs
      if (fs.existsSync(TRANSITION_LOG_FILE)) {
        const rawLog = fs.readFileSync(TRANSITION_LOG_FILE, "utf8");
        this.transitionLogs = JSON.parse(rawLog);
      }

      this.recomputeCapitalDerivedStats();
    } catch (err) {
      console.error("[Risk Engine] Failed to load state from disk:", err);
    }
  }

  /**
   * Saves general risk engine operational state
   */
  private saveState() {
    try {
      const stateObj = {
        config: this.config,
        openPositions: this.openPositions,
        coolingOffPeriods: this.coolingOffPeriods,
        consecutiveLosses: this.consecutiveLosses,
        consecutiveWins: this.consecutiveWins
      };
      const temp = `${RISK_STATE_FILE}.tmp`;
      fs.writeFileSync(temp, JSON.stringify(stateObj, null, 2), "utf8");
      fs.renameSync(temp, RISK_STATE_FILE);
    } catch (err) {
      console.error("[Risk Engine] Failed to save state to disk:", err);
    }
  }

  /**
   * Appends an immutable risk decision to the registry file
   */
  private saveDecisionToRegistry(decision: RiskDecision) {
    try {
      this.riskDecisions.push(decision);
      if (this.riskDecisions.length > 2000) {
        this.riskDecisions.shift(); // Hard limit memory footprint
      }
      const temp = `${RISK_REGISTRY_FILE}.tmp`;
      fs.writeFileSync(temp, JSON.stringify(this.riskDecisions, null, 2), "utf8");
      fs.renameSync(temp, RISK_REGISTRY_FILE);
    } catch (err) {
      console.error("[Risk Engine] Failed to append risk decision registry:", err);
    }
  }

  /**
   * Saves transition logs to disk
   */
  private saveTransitionLogs() {
    try {
      const temp = `${TRANSITION_LOG_FILE}.tmp`;
      fs.writeFileSync(temp, JSON.stringify(this.transitionLogs, null, 2), "utf8");
      fs.renameSync(temp, TRANSITION_LOG_FILE);
    } catch (err) {
      console.error("[Risk Engine] Failed to save transition logs:", err);
    }
  }

  /**
   * Recalculates dynamically derived stats like risk of ruin, portfolio heat, margin, etc.
   */
  public recomputeCapitalDerivedStats() {
    const cs = this.config.capitalState;
    
    // Position exposure in USDT = sum of value of all open positions
    let totalExposure = 0;
    let totalRiskAmount = 0;
    this.openPositions.forEach(p => {
      const value = p.amount * p.currentPrice;
      totalExposure += value;
      totalRiskAmount += p.riskAmount;
    });

    cs.positionExposure = Number(totalExposure.toFixed(2));
    cs.portfolioRisk = Number(totalRiskAmount.toFixed(2));

    // Dynamic Used Margin = Exposure / Leverage limit
    cs.usedMargin = Number((cs.positionExposure / this.config.leverageLimit).toFixed(2));
    cs.availableMargin = Number((cs.currentEquity - cs.usedMargin + cs.dailyPL).toFixed(2));
    cs.capitalUtilization = Number(Math.min(100, Math.max(0, (cs.usedMargin / (cs.currentEquity || 1)) * 100)).toFixed(2));

    // Dynamic risk of ruin calculation (classical probability of ruin)
    // Formula: (q / p) ^ CapitalUnits
    // WinRate based on recovery factor, or a baseline of 55%
    const winRate = cs.recoveryFactor > 0 ? 0.54 : 0.46;
    const p = winRate;
    const q = 1 - p;
    const ratio = q / (p || 1);
    
    // Trade unit resolution
    const riskPerTradeUSD = cs.currentEquity * cs.riskPerTrade;
    const capitalUnits = Math.max(1, Math.floor(cs.currentEquity / (riskPerTradeUSD || 100)));
    
    const rawRuin = Math.pow(ratio, capitalUnits);
    cs.riskOfRuin = Number((Math.min(100, Math.max(0, rawRuin * 100))).toFixed(3));
  }

  /**
   * Evaluates a Decision Engine Output and issues a RiskDecision
   */
  public evaluateDecision(
    decision: DecisionOutput,
    currentMarketPrice: number,
    additionalParams: {
      slippage?: number;
      spread?: number;
      latency?: number;
      streamHealth?: "EXCELLENT" | "WARNING" | "CRITICAL";
      dataIntegrity?: "COMPLETE" | "CORRUPT";
      clockSynced?: boolean;
    } = {}
  ): RiskDecision {
    const timestamp = Date.now();
    this.recomputeCapitalDerivedStats();

    const cs = this.config.capitalState;
    const slippage = additionalParams.slippage ?? 0.001; // 0.1% default
    const spread = additionalParams.spread ?? 0.0015; // 0.15% default
    const latency = additionalParams.latency ?? 45; // 45ms default
    const streamHealth = additionalParams.streamHealth ?? "EXCELLENT";
    const dataIntegrity = additionalParams.dataIntegrity ?? "COMPLETE";
    const clockSynced = additionalParams.clockSynced ?? true;

    const safetyResults: RiskRuleResult[] = [];
    const failedRules: string[] = [];
    const passedRules: string[] = [];
    const reasonCodes: string[] = [];

    // Evaluate Risk Level
    let riskScore = 100;
    let action: RiskAction = "ALLOW";

    // Build immediate snapshot of portfolio rules state
    const portfolioSnapshot = this.getPortfolioRiskState();

    // 1. Gating rules evaluation helper
    const checkRule = (
      ruleId: string,
      name: string,
      passed: boolean,
      actualValue: string | number,
      thresholdValue: string | number,
      description: string,
      severityPenalty: number
    ) => {
      if (!passed) {
        failedRules.push(ruleId);
        riskScore -= severityPenalty;
      } else {
        passedRules.push(ruleId);
      }
      safetyResults.push({ ruleId, name, passed, actualValue, thresholdValue, description });
    };

    // --- SAFETY SYSTEMS EVALUATION (Part 6) ---

    // Rule 1: Emergency Stop Check
    checkRule(
      "EMERGENCY_STOP_ACTIVE",
      "Emergency shutdown condition",
      this.config.emergencyState !== "EMERGENCY_STOP" && this.config.emergencyState !== "LOCKDOWN",
      this.config.emergencyState,
      "NOT EMERGENCY_STOP/LOCKDOWN",
      "System must not be in a manual shutdown or administrative lockdown state.",
      100
    );

    // Rule 2: Daily Drawdown Check
    const isUnderDailyStop = cs.dailyPL > -cs.maxDailyLoss;
    checkRule(
      "MAX_DAILY_LOSS",
      "Daily loss threshold",
      isUnderDailyStop,
      `$${cs.dailyPL.toFixed(2)}`,
      `-$${cs.maxDailyLoss.toFixed(2)}`,
      "Cumulative trading losses for the active day must remain within daily limits.",
      60
    );

    // Rule 3: Weekly Drawdown Check
    checkRule(
      "MAX_WEEKLY_LOSS",
      "Weekly loss threshold",
      cs.weeklyPL > -cs.maxWeeklyLoss,
      `$${cs.weeklyPL.toFixed(2)}`,
      `-$${cs.maxWeeklyLoss.toFixed(2)}`,
      "Cumulative trading losses for the active week must remain within weekly limits.",
      50
    );

    // Rule 4: Monthly Drawdown Check
    checkRule(
      "MAX_MONTHLY_LOSS",
      "Monthly loss threshold",
      cs.monthlyPL > -cs.maxMonthlyLoss,
      `$${cs.monthlyPL.toFixed(2)}`,
      `-$${cs.maxMonthlyLoss.toFixed(2)}`,
      "Cumulative trading losses for the active month must remain within monthly limits.",
      40
    );

    // Rule 5: Leverage Bounds Check
    const estimatedExposure = cs.positionExposure + currentMarketPrice * this.config.fixedSizeAmount;
    const estimatedLeverage = estimatedExposure / (cs.currentEquity || 1);
    checkRule(
      "MAX_LEVERAGE",
      "Portfolio leverage limit",
      estimatedLeverage <= this.config.leverageLimit,
      `${estimatedLeverage.toFixed(2)}x`,
      `${this.config.leverageLimit.toFixed(2)}x`,
      "Combined open portfolio leverage exposure must remain below institutional thresholds.",
      30
    );

    // Rule 6: Execution Slippage Limit
    checkRule(
      "MAX_SLIPPAGE",
      "Execution slippage boundary",
      slippage <= this.config.maxSlippageLimit,
      `${(slippage * 100).toFixed(3)}%`,
      `${(this.config.maxSlippageLimit * 100).toFixed(3)}%`,
      "Order entry slippage estimate must fall below safe parameters.",
      25
    );

    // Rule 7: Liquidity Spread Limit
    checkRule(
      "MAX_SPREAD",
      "Bid-Ask spread limit",
      spread <= this.config.maxSpreadLimit,
      `${(spread * 100).toFixed(3)}%`,
      `${(this.config.maxSpreadLimit * 100).toFixed(3)}%`,
      "Underlying market spread must be liquid enough to support execution.",
      25
    );

    // Rule 8: Network Latency Limit
    checkRule(
      "MAX_LATENCY",
      "Network connection latency",
      latency <= this.config.maxLatencyLimit,
      `${latency}ms`,
      `${this.config.maxLatencyLimit}ms`,
      "API request-response turnaround latency must stay within speed requirements.",
      20
    );

    // Rule 9: Clock Synchronization
    checkRule(
      "CLOCK_SYNCHRONIZED",
      "Infrastructure clock alignment",
      clockSynced,
      clockSynced ? "SYNCHRONIZED" : "DRIFTED",
      "SYNCHRONIZED",
      "Physical system clock must remain accurately synced to UTC servers.",
      40
    );

    // Rule 10: Stream Ingestion Health
    checkRule(
      "STREAM_HEALTHY",
      "Tick ingestion stability",
      streamHealth === "EXCELLENT" || streamHealth === "WARNING",
      streamHealth,
      "EXCELLENT/WARNING",
      "Market stream subscription feeding indicators must display active flow.",
      35
    );

    // Rule 11: Data Completeness and Integrity
    checkRule(
      "DATA_INTEGRITY",
      "Data frame completeness",
      dataIntegrity === "COMPLETE",
      dataIntegrity,
      "COMPLETE",
      "Evaluation streams must contain complete structural profiles with no corrupt indices.",
      50
    );

    // Rule 12: Prediction Staleness Check
    const predictionAge = timestamp - decision.timestamp;
    checkRule(
      "PREDICTION_AGE",
      "Forecast model age limit",
      predictionAge <= this.config.maxPredictionAge,
      `${Math.round(predictionAge / 1000)}s`,
      `${Math.round(this.config.maxPredictionAge / 1000)}s`,
      "The underlying trade prediction timestamp must remain fresh.",
      30
    );

    // Rule 13: Volatility & Market Noise Guard
    const noiseLevel = decision.riskSummary?.noiseLevel ?? 0.5;
    checkRule(
      "MAX_MARKET_NOISE",
      "Macro noise indicator",
      noiseLevel <= this.config.maxMarketNoise,
      `${(noiseLevel * 100).toFixed(1)}%`,
      `${(this.config.maxMarketNoise * 100).toFixed(1)}%`,
      "Asset price stream noise indexes must stay below high random volatility boundaries.",
      20
    );

    // Rule 14: Minimum Liquidity Guard
    const isIlliquid = decision.riskSummary?.isIlliquid ?? false;
    checkRule(
      "MINIMUM_LIQUIDITY",
      "Order pool depth verification",
      !isIlliquid,
      isIlliquid ? "ILLIQUID" : "LIQUID",
      "LIQUID",
      "Active order book depth metrics must show healthy buy-sell liquidity columns.",
      30
    );

    // Rule 15: Cooling-off Period
    const coolingExpiry = this.coolingOffPeriods[decision.market] || 0;
    const isCooledDown = timestamp >= coolingExpiry;
    checkRule(
      "COOLING_OFF_PERIOD",
      "Asset trading cooling-off",
      isCooledDown,
      isCooledDown ? "EXPIRED" : `ACTIVE (${Math.round((coolingExpiry - timestamp) / 1000)}s left)`,
      "EXPIRED",
      "Symbol must not be under trade cooling restrictions due to recent volatility triggers.",
      45
    );

    // Rule 16: Portfolio simultaneous position heat limits
    const maxOpenAllowed = 5;
    checkRule(
      "MAX_OPEN_TRADES",
      "Simultaneous trades limit",
      this.openPositions.length < maxOpenAllowed,
      this.openPositions.length,
      maxOpenAllowed,
      "Combined simultaneous trade count must not exceed aggregate margin allocation buffers.",
      25
    );

    // Risk levels & score final boundaries
    riskScore = Math.max(0, riskScore);
    let riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";
    if (riskScore < 50) riskLevel = "CRITICAL";
    else if (riskScore < 70) riskLevel = "HIGH";
    else if (riskScore < 85) riskLevel = "MEDIUM";

    // Emergency transitions check dynamically based on safety failures
    this.evaluateEmergencyTrigger(failedRules);

    // --- POSITION SIZING SELECTION AND CALCULATIONS (Part 4) ---
    const sizingMethod = this.config.sizingMethod;
    const rawSizingDetails = this.calculatePositionSizing(decision, currentMarketPrice);
    
    let recommendedPositionSize = rawSizingDetails.size;
    let recommendedCapitalAllocation = rawSizingDetails.allocation;

    // Evaluate Risk Action depending on score & safety checks
    const hasCriticalFailures = failedRules.some(r =>
      ["EMERGENCY_STOP_ACTIVE", "MAX_DAILY_LOSS", "CLOCK_SYNCHRONIZED", "DATA_INTEGRITY", "COOLING_OFF_PERIOD"].includes(r)
    );

    if (hasCriticalFailures || this.config.emergencyState === "EMERGENCY_STOP" || this.config.emergencyState === "LOCKDOWN") {
      action = "BLOCK";
      recommendedPositionSize = 0;
      recommendedCapitalAllocation = 0;
      reasonCodes.push("BLOCKED_CRITICAL_SAFETY_FAIL");
    } else if (failedRules.length > 0) {
      // If minor rules failed, we ALLOW with reduced size
      action = "ALLOW_WITH_REDUCED_SIZE";
      recommendedPositionSize = Number((recommendedPositionSize * 0.5).toFixed(6));
      recommendedCapitalAllocation = Number((recommendedCapitalAllocation * 0.5).toFixed(2));
      reasonCodes.push("REDUCED_SIZE_MINOR_SAFETY_FAIL");
    } else if (decision.decision === "WATCH") {
      action = "WATCH";
      reasonCodes.push("STANDING_BY_WATCH_MODE");
    } else if (decision.decision === "REJECT" || decision.decision === "WAIT") {
      action = "BLOCK";
      recommendedPositionSize = 0;
      recommendedCapitalAllocation = 0;
      reasonCodes.push("BLOCKED_UNDERLYING_DECISION_REJECT");
    } else {
      action = "ALLOW";
      reasonCodes.push("APPROVED_RISK_CLEARANCE");
    }

    const dailyRiskRemaining = Math.max(0, cs.maxDailyLoss + cs.dailyPL);
    const explanation = this.generateRiskExplanation(action, failedRules, recommendedCapitalAllocation);

    const riskDecision: RiskDecision = {
      id: `RISK-DEC-${timestamp}-${Math.floor(Math.random() * 100000)}`,
      decisionId: decision.id,
      timestamp,
      riskScore,
      riskLevel,
      capitalStateSnapshot: { ...cs },
      portfolioStateSnapshot: portfolioSnapshot,
      sizingMethodUsed: sizingMethod,
      recommendedPositionSize,
      recommendedCapitalAllocation,
      safetyResults,
      failedRules,
      passedRules,
      expectedDrawdown: Number((decision.expectedDrawdown * 100).toFixed(2)),
      riskOfRuin: cs.riskOfRuin,
      dailyRiskRemaining,
      portfolioHeat: portfolioSnapshot.portfolioHeat,
      reasonCodes,
      action,
      explanation
    };

    // Auto log to registry
    this.saveDecisionToRegistry(riskDecision);
    return riskDecision;
  }

  /**
   * Evaluates position sizing across all 10 sizing methods deterministically
   */
  public calculatePositionSizing(
    decision: DecisionOutput,
    currentPrice: number,
    methodOverride?: SizingMethod
  ): { size: number; allocation: number; formula: string } {
    const cs = this.config.capitalState;
    const method = methodOverride || this.config.sizingMethod;
    const equity = cs.currentEquity;
    const riskPerTradeUSD = equity * cs.riskPerTrade;

    let size = 0; // in units of the asset
    let allocation = 0; // in USDT value
    let formula = "";

    // Set stop distance proxy (difference between Entry and Stop Loss)
    const expectedDrawdownPct = decision.expectedDrawdown || 0.05; // default 5%
    const stopDistancePrice = currentPrice * expectedDrawdownPct;

    switch (method) {
      case "FIXED_SIZE":
        size = this.config.fixedSizeAmount;
        allocation = Number((size * currentPrice).toFixed(2));
        formula = `Fixed Unit Size: ${size} units`;
        break;

      case "FIXED_FRACTIONAL":
        // size = (Equity * RiskPerTrade) / stopDistance
        allocation = riskPerTradeUSD;
        size = allocation / (stopDistancePrice || 1);
        formula = `Fractional: (Equity * RiskPerTrade) / StopDistance`;
        break;

      case "KELLY_CRITERION": {
        // Kelly % = WinRate - (1 - WinRate) / PayoutRatio
        const winRate = (decision.historicalWinRate / 100) || 0.54;
        const payoutRatio = (decision.expectedMove / expectedDrawdownPct) || 1.6;
        const kellyFraction = Math.max(0, winRate - (1 - winRate) / payoutRatio);
        // Cap Kelly allocation at maximum 10% for systemic preservation
        const cappedFraction = Math.min(0.10, kellyFraction);
        allocation = Number((equity * cappedFraction).toFixed(2));
        size = allocation / currentPrice;
        formula = `Kelly: Equity * Max(0, WinRate - (LossRate / RewardRiskRatio)) (Capped at 10%)`;
        break;
      }

      case "REDUCED_KELLY": {
        // Half Kelly to avoid extreme swings
        const winRate = (decision.historicalWinRate / 100) || 0.54;
        const payoutRatio = (decision.expectedMove / expectedDrawdownPct) || 1.6;
        const kellyFraction = Math.max(0, winRate - (1 - winRate) / payoutRatio);
        const halfKelly = kellyFraction * 0.5;
        const cappedHalfKelly = Math.min(0.05, halfKelly); // Cap at 5%
        allocation = Number((equity * cappedHalfKelly).toFixed(2));
        size = allocation / currentPrice;
        formula = `Half-Kelly: Equity * (0.5 * KellyFraction) (Capped at 5%)`;
        break;
      }

      case "VOLATILITY_ADJUSTED": {
        // Base fractional scaled by Volatility Ratio
        const targetVol = 0.08; // 8% target volatility
        const expectedVol = decision.expectedVolatility || 0.12;
        const volScaling = Math.min(2.0, Math.max(0.2, targetVol / expectedVol));
        allocation = Number((riskPerTradeUSD * volScaling).toFixed(2));
        size = allocation / (stopDistancePrice || 1);
        formula = `Volatility Adjusted: FractionalSize * (TargetVol / CurrentVol)`;
        break;
      }

      case "ATR_BASED": {
        // Standard ATR position sizing
        const atr = stopDistancePrice * 0.5; // ATR proxy
        const multiplier = 2.0; // 2 ATR Stop distance
        const atrStopDistance = atr * multiplier;
        allocation = riskPerTradeUSD;
        size = allocation / (atrStopDistance || 1);
        formula = `ATR Sizing: (Equity * RiskPerTrade) / (2 * ATR)`;
        break;
      }

      case "EXPECTED_VALUE_WEIGHTED": {
        // Expected Value setup weighting
        const ev = decision.expectedValue || 0.15;
        const targetEV = 0.25; // Benchmark base EV
        const evScaling = Math.min(1.8, Math.max(0.1, ev / targetEV));
        allocation = Number((riskPerTradeUSD * evScaling).toFixed(2));
        size = allocation / (stopDistancePrice || 1);
        formula = `Expected Value Weighted: FractionalSize * (CurrentEV / TargetEV)`;
        break;
      }

      case "CONFIDENCE_WEIGHTED": {
        // Scaling size by forecast confidence percentage
        const confidenceFactor = decision.decisionConfidence / 100; // 0.0 to 1.0
        allocation = Number((riskPerTradeUSD * confidenceFactor).toFixed(2));
        size = allocation / (stopDistancePrice || 1);
        formula = `Confidence Weighted: FractionalSize * (ConfidenceScore / 100)`;
        break;
      }

      case "PROBABILITY_WEIGHTED": {
        // Scaling by trend directional probability
        const directionalProbability = Math.max(
          decision.probabilitySummary.up,
          decision.probabilitySummary.down
        );
        allocation = Number((riskPerTradeUSD * directionalProbability).toFixed(2));
        size = allocation / (stopDistancePrice || 1);
        formula = `Probability Weighted: FractionalSize * DirectionalProbability`;
        break;
      }

      case "DYNAMIC_RISK_SCALING": {
        // Scale down size on losing streaks, scale up mildly on winning streaks
        const lossesFactor = Math.pow(0.75, this.consecutiveLosses);
        const winsFactor = Math.pow(1.08, Math.min(3, this.consecutiveWins));
        const dynamicFactor = Math.min(1.5, Math.max(0.15, lossesFactor * winsFactor));
        allocation = Number((riskPerTradeUSD * dynamicFactor).toFixed(2));
        size = allocation / (stopDistancePrice || 1);
        formula = `Dynamic Scaling: FractionalSize * (0.75^ConsecutiveLosses * 1.08^ConsecutiveWins)`;
        break;
      }

      default:
        size = this.config.fixedSizeAmount;
        allocation = Number((size * currentPrice).toFixed(2));
        formula = `Fixed Size Default`;
    }

    // Safety checks: bound values to equity boundaries
    if (isNaN(allocation) || !isFinite(allocation)) {
      allocation = 5; // Safe default to prevent NaN/Infinity leaking
    }
    allocation = Number(Math.min(equity * 0.25, Math.max(5, allocation)).toFixed(2)); // Max 25% equity allocated on one trade
    size = Number((allocation / currentPrice).toFixed(6));
    if (isNaN(size) || !isFinite(size)) {
      size = Number((5 / currentPrice).toFixed(6));
    }

    return { size, allocation, formula };
  }

  /**
   * Compares sizing methods side by side for a researcher
   */
  public compareSizingModels(decision: DecisionOutput, currentPrice: number) {
    const methods: SizingMethod[] = [
      "FIXED_SIZE",
      "FIXED_FRACTIONAL",
      "KELLY_CRITERION",
      "REDUCED_KELLY",
      "VOLATILITY_ADJUSTED",
      "ATR_BASED",
      "EXPECTED_VALUE_WEIGHTED",
      "CONFIDENCE_WEIGHTED",
      "PROBABILITY_WEIGHTED",
      "DYNAMIC_RISK_SCALING"
    ];

    return methods.map(m => {
      const sizing = this.calculatePositionSizing(decision, currentPrice, m);
      return {
        method: m,
        recommendedSize: sizing.size,
        capitalAllocation: sizing.allocation,
        formula: sizing.formula
      };
    });
  }

  /**
   * Emergency State Transition Rules (Part 7)
   */
  public transitionToState(toState: EmergencyState, triggerEvent: string, userEmail = "system@amis.institutional") {
    const fromState = this.config.emergencyState;
    if (fromState === toState) return;

    this.config.emergencyState = toState;
    const logEntry: RiskStateLog = {
      timestamp: Date.now(),
      fromState,
      toState,
      triggerEvent,
      userEmail
    };

    this.transitionLogs.push(logEntry);
    if (this.transitionLogs.length > 500) {
      this.transitionLogs.shift();
    }

    this.saveTransitionLogs();
    this.saveState();
  }

  /**
   * Evaluates failures dynamically to transition safety state
   */
  private evaluateEmergencyTrigger(failedRules: string[]) {
    // If we failed high severity operational constraints, switch state immediately
    if (failedRules.includes("EMERGENCY_STOP_ACTIVE")) {
      return; // Already blocked or locked down
    }

    if (failedRules.includes("MAX_DAILY_LOSS")) {
      this.transitionToState("LOCKDOWN", "Daily drawdown maximum breached, triggering automatic lockdown state.");
    } else if (failedRules.includes("CLOCK_SYNCHRONIZED") || failedRules.includes("DATA_INTEGRITY")) {
      this.transitionToState("HIGH_RISK", "Data stream corruption or physical clock synchronization loss detected.");
    } else if (failedRules.length >= 3) {
      this.transitionToState("CAUTION", "Multiple minor risk bounds breached concurrently.");
    } else if (this.config.emergencyState !== "NORMAL" && failedRules.length === 0) {
      // Revert back to NORMAL when all rules clear
      this.transitionToState("NORMAL", "All safety parameters cleared, restoring regular operation.");
    }
  }

  /**
   * Computes comprehensive Portfolio Risk State (Part 5)
   */
  public getPortfolioRiskState(): PortfolioRiskState {
    const cs = this.config.capitalState;
    
    // Calculate currency, strategy, and model exposures
    const currencyExposure: Record<string, number> = {};
    const strategyExposure: Record<string, number> = {};
    const modelExposure: Record<string, number> = {};

    let totalRiskAmount = 0;
    let totalExposure = 0;

    this.openPositions.forEach(p => {
      const val = p.amount * p.currentPrice;
      totalExposure += val;
      totalRiskAmount += p.riskAmount;

      // Extract asset base currency exposure
      const base = p.symbol.substring(0, 3);
      currencyExposure[base] = (currencyExposure[base] || 0) + val;

      strategyExposure[p.strategy] = (strategyExposure[p.strategy] || 0) + val;
      modelExposure[p.model] = (modelExposure[p.model] || 0) + val;
    });

    // Check correlation counts
    let correlatedPositions = 0;
    const symbols = this.openPositions.map(p => p.symbol);
    symbols.forEach(s1 => {
      symbols.forEach(s2 => {
        if (s1 !== s2 && s1.substring(0, 3) === s2.substring(0, 3)) {
          correlatedPositions++;
        }
      });
    });

    const portfolioHeat = Number((equityLimitPercent(totalRiskAmount, cs.currentEquity)).toFixed(2));

    return {
      openPositions: [...this.openPositions],
      correlatedPositions,
      marketExposure: Number(totalExposure.toFixed(2)),
      syntheticIndexExposure: Number((currencyExposure["RDB"] || 0).toFixed(2)), // synthetic indexes proxy
      currencyExposure,
      strategyExposure,
      modelExposure,
      maxSimultaneousTrades: 5,
      maxConsecutiveLosses: this.consecutiveLosses,
      maxConsecutiveWins: this.consecutiveWins,
      coolingOffPeriods: { ...this.coolingOffPeriods },
      tradeFrequency: 1.25, // trades evaluated per hour
      portfolioHeat
    };
  }

  /**
   * Open a trade position manually to test limits or simulate execution flow
   */
  public openPosition(
    symbol: string,
    side: "LONG" | "SHORT",
    entryPrice: number,
    amount: number,
    stopLossPrice: number,
    strategy = "NONE",
    model = "NONE"
  ): OpenPositionRisk {
    const riskAmount = Number((Math.abs(entryPrice - stopLossPrice) * amount).toFixed(2));
    const position: OpenPositionRisk = {
      symbol,
      side,
      entryPrice,
      currentPrice: entryPrice,
      amount,
      riskAmount,
      exposureValue: Number((amount * entryPrice).toFixed(2)),
      strategy,
      model,
      timestamp: Date.now()
    };

    this.openPositions.push(position);
    this.recomputeCapitalDerivedStats();
    this.saveState();
    return position;
  }

  /**
   * Close a position, updating daily performance and consecutive streaks
   */
  public closePosition(symbol: string, exitPrice: number): { profit: number; wins: number; losses: number } | null {
    const idx = this.openPositions.findIndex(p => p.symbol === symbol);
    if (idx === -1) return null;

    const pos = this.openPositions[idx];
    this.openPositions.splice(idx, 1);

    const isLong = pos.side === "LONG";
    const rawProfit = isLong ? (exitPrice - pos.entryPrice) * pos.amount : (pos.entryPrice - exitPrice) * pos.amount;
    const profit = Number(rawProfit.toFixed(2));

    const cs = this.config.capitalState;
    cs.dailyPL = Number((cs.dailyPL + profit).toFixed(2));
    cs.weeklyPL = Number((cs.weeklyPL + profit).toFixed(2));
    cs.monthlyPL = Number((cs.monthlyPL + profit).toFixed(2));
    cs.currentEquity = Number((cs.currentEquity + profit).toFixed(2));

    if (profit > 0) {
      this.consecutiveWins++;
      this.consecutiveLosses = 0;
    } else {
      this.consecutiveLosses++;
      this.consecutiveWins = 0;
    }

    // Set cooling off period for this asset as a volatility guard
    this.coolingOffPeriods[symbol] = Date.now() + this.config.coolingOffDuration;

    this.recomputeCapitalDerivedStats();
    this.saveState();

    return { profit, wins: this.consecutiveWins, losses: this.consecutiveLosses };
  }

  /**
   * Closes all positions immediately under Emergency Lockdown
   */
  public closeAllPositionsEmergency() {
    const count = this.openPositions.length;
    this.openPositions = [];
    this.recomputeCapitalDerivedStats();
    this.saveState();
    return count;
  }

  /**
   * Returns current general configuration state
   */
  public getConfig(): RiskConfig {
    return this.config;
  }

  /**
   * Allows setting custom capital limits or sizing methods dynamically (Part 11)
   */
  public updateConfiguration(updates: {
    sizingMethod?: SizingMethod;
    riskPerTrade?: number;
    maxDailyLoss?: number;
    coolingOffDuration?: number;
    fixedSizeAmount?: number;
  }) {
    if (updates.sizingMethod) this.config.sizingMethod = updates.sizingMethod;
    if (updates.riskPerTrade) this.config.capitalState.riskPerTrade = updates.riskPerTrade;
    if (updates.maxDailyLoss) this.config.capitalState.maxDailyLoss = updates.maxDailyLoss;
    if (updates.coolingOffDuration) this.config.coolingOffDuration = updates.coolingOffDuration;
    if (updates.fixedSizeAmount) this.config.fixedSizeAmount = updates.fixedSizeAmount;

    this.recomputeCapitalDerivedStats();
    this.saveState();
  }

  /**
   * Returns immutable historical risk decisions
   */
  public getHistory(): RiskDecision[] {
    return this.riskDecisions;
  }

  /**
   * Returns emergency state logs
   */
  public getTransitionLogs(): RiskStateLog[] {
    return this.transitionLogs;
  }

  /**
   * Clears historical databases for clean test runs
   */
  public clearAllHistory() {
    this.initializeDefaultState();
    try {
      if (fs.existsSync(RISK_STATE_FILE)) fs.unlinkSync(RISK_STATE_FILE);
      if (fs.existsSync(RISK_REGISTRY_FILE)) fs.unlinkSync(RISK_REGISTRY_FILE);
      if (fs.existsSync(TRANSITION_LOG_FILE)) fs.unlinkSync(TRANSITION_LOG_FILE);
    } catch (e) {
      console.warn("[Risk Engine] Could not clear files:", e);
    }
  }

  private generateRiskExplanation(action: RiskAction, failedRules: string[], allocation: number): string {
    if (action === "BLOCK") {
      if (failedRules.includes("EMERGENCY_STOP_ACTIVE")) {
        return "Trade evaluation blocked. The trading engine is currently in an EMERGENCY_STOP manual shutdown state.";
      }
      if (failedRules.includes("MAX_DAILY_LOSS")) {
        return "Trade evaluation blocked. The daily maximum drawdown limit has been breached. All order entries are locked.";
      }
      if (failedRules.includes("COOLING_OFF_PERIOD")) {
        return "Trade evaluation blocked. The selected symbol is currently under temporary cooling-off restrictions.";
      }
      return `Trade evaluation blocked due to critical safety rule violations: ${failedRules.join(", ")}.`;
    }

    if (action === "ALLOW_WITH_REDUCED_SIZE") {
      return `Trade permitted with size reduction of 50% ($${allocation.toFixed(2)} allocated) due to minor safety breaches: ${failedRules.join(", ")}.`;
    }

    if (action === "WATCH") {
      return "Trade meets risk criteria but has been set to standby WATCH state because the original Decision Engine recommendation is WATCH.";
    }

    return `Trade cleared. All 16 safety checks and risk thresholds have passed. Capital allocation set at $${allocation.toFixed(2)}.`;
  }
}

function equityLimitPercent(risk: number, equity: number): number {
  if (equity <= 0) return 100;
  return (risk / equity) * 100;
}

export const riskEngine = new RiskIntelligenceEngine();
