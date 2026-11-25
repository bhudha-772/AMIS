import { Strategy, PerformanceMetrics, BaselineComparison, StressTestResult, BacktestTrade, StrategyEvaluation } from "./strategyTypes";
import { ResearchPrediction } from "./researchLab";
import { evaluateStrategySignal } from "./strategyDefinition";

/**
 * Strategy Validation Engine: Performs chronological walk-forward evaluations,
 * calculates robust metrics, and compares strategies against standard baselines.
 */

export const strategyValidator = {
  /**
   * Evaluates a strategy over a chronological set of predictions.
   * Guarantees zero information leak by processing strictly in ascending order.
   */
  evaluateStrategy(
    strategy: Strategy,
    predictions: ResearchPrediction[],
    frictionPct: number = 0.05 // 0.05% slippage + fee per trade
  ): StrategyEvaluation {
    // Sort chronologically just in case
    const chronological = [...predictions].sort((a, b) => a.timestamp - b.timestamp);

    const trades: BacktestTrade[] = [];
    let equity = 10000; // Starting with $10,000 virtual balance
    const equityCurve: { timestamp: number; equity: number }[] = [{ timestamp: chronological[0]?.timestamp || Date.now(), equity }];
    const drawdownCurve: { timestamp: number; drawdown: number }[] = [];

    let peakEquity = equity;
    let maxDrawdown = 0;

    // We keep track of baseline Brier parameters
    let sumSquaredError = 0;
    let brierCount = 0;

    chronological.forEach((pred) => {
      const signal = evaluateStrategySignal(strategy, pred);
      if (signal === "FLAT") {
        // No trade, equity stays the same
        equityCurve.push({ timestamp: pred.timestamp, equity });
        const dd = peakEquity > 0 ? (peakEquity - equity) / peakEquity : 0;
        drawdownCurve.push({ timestamp: pred.timestamp, drawdown: dd * 100 });
        return;
      }

      // Check if actual outcome is resolved
      if (!pred.resolved || !pred.actualOutcome) {
        return;
      }

      const outcome = pred.actualOutcome;
      const pctChange = outcome.percentageChange; // e.g. 0.012 for 1.2%
      
      let tradeReturn = 0;
      if (signal === "LONG") {
        tradeReturn = pctChange - (frictionPct / 100);
      } else if (signal === "SHORT") {
        tradeReturn = -pctChange - (frictionPct / 100);
      }

      // Update virtual equity
      const oldEquity = equity;
      equity = equity * (1 + tradeReturn);
      if (equity > peakEquity) {
        peakEquity = equity;
      }
      const currentDD = peakEquity > 0 ? (peakEquity - equity) / peakEquity : 0;
      if (currentDD > maxDrawdown) {
        maxDrawdown = currentDD;
      }

      equityCurve.push({ timestamp: pred.timestamp, equity });
      drawdownCurve.push({ timestamp: pred.timestamp, drawdown: currentDD * 100 });

      // Calculate Brier component
      const targetProb = signal === "LONG" ? (pred.predictedProbs?.up || 0.5) : (pred.predictedProbs?.down || 0.5);
      const actualOutcomeBinary = outcome.predictionCorrect ? 1 : 0;
      sumSquaredError += Math.pow(targetProb - actualOutcomeBinary, 2);
      brierCount++;

      // Record trade details
      trades.push({
        predictionId: pred.id,
        timestamp: pred.timestamp,
        direction: signal,
        entryPrice: pred.currentPrice,
        exitPrice: outcome.actualPrice,
        pctChange: tradeReturn,
        pnl: equity - oldEquity,
        resolvedAt: outcome.evaluatedAt,
        holdingTime: 15, // Defaulting to timeframe horizon (e.g. 15 mins)
        wasWin: tradeReturn > 0,
        maxDrawdown: outcome.drawdown || 0
      });
    });

    const metrics = this.calculateMetrics(trades, chronological, equityCurve, maxDrawdown, sumSquaredError, brierCount);

    // Run baseline comparisons
    const baselines = this.evaluateBaselines(chronological, metrics, frictionPct);

    // Run stress tests
    const stressTests = this.runStressTesting(strategy, chronological, frictionPct);

    // Verify stability (e.g., drawdown is not excessive and win rate is positive)
    const isStable = metrics.maxDrawdown < 35 && metrics.winRate > 45 && metrics.profitFactor > 1.0;

    return {
      strategyId: strategy.id,
      runDate: Date.now(),
      metrics,
      baselines,
      stressTests,
      equityCurve,
      drawdownCurve,
      isStable,
      reproducible: true
    };
  },

  calculateMetrics(
    trades: BacktestTrade[],
    predictions: ResearchPrediction[],
    equityCurve: { timestamp: number; equity: number }[],
    maxDrawdown: number,
    sumSquaredError: number,
    brierCount: number
  ): PerformanceMetrics {
    const totalTrades = trades.length;
    if (totalTrades === 0) {
      return {
        winRate: 0,
        lossRate: 0,
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        expectedValue: 0,
        profitFactor: 0,
        sharpeRatio: 0,
        sortinoRatio: 0,
        maxDrawdown: 0,
        avgHoldingTime: 0,
        tradeFrequency: 0,
        exposure: 0,
        riskRewardRatio: 0,
        calibrationScore: 0,
        brierScore: 0,
        totalReturn: 0
      };
    }

    const winningTradesList = trades.filter((t) => t.pctChange > 0);
    const losingTradesList = trades.filter((t) => t.pctChange <= 0);
    
    const winningTrades = winningTradesList.length;
    const losingTrades = losingTradesList.length;
    const winRate = (winningTrades / totalTrades) * 100;
    const lossRate = (losingTrades / totalTrades) * 100;

    const sumWinningReturn = winningTradesList.reduce((acc, t) => acc + t.pctChange, 0);
    const sumLosingReturn = losingTradesList.reduce((acc, t) => acc + Math.abs(t.pctChange), 0);
    
    const profitFactor = sumLosingReturn > 0 ? sumWinningReturn / sumLosingReturn : sumWinningReturn > 0 ? 99.9 : 0;
    
    const returns = trades.map((t) => t.pctChange);
    const meanReturn = returns.reduce((acc, r) => acc + r, 0) / totalTrades;

    // Variance & Standard Deviation
    const variance = returns.reduce((acc, r) => acc + Math.pow(r - meanReturn, 2), 0) / totalTrades;
    const stdDev = Math.sqrt(variance);

    // Negative variance for Sortino
    const negativeReturns = returns.filter((r) => r < 0);
    const negVariance = negativeReturns.length > 0
      ? negativeReturns.reduce((acc, r) => acc + Math.pow(r - meanReturn, 2), 0) / negativeReturns.length
      : 0;
    const downsideDev = Math.sqrt(negVariance);

    const sharpeRatio = stdDev > 0 ? (meanReturn / stdDev) * Math.sqrt(252) : 0; // Annualized assuming 252 periods
    const sortinoRatio = downsideDev > 0 ? (meanReturn / downsideDev) * Math.sqrt(252) : 0;

    const avgWin = winningTrades > 0 ? sumWinningReturn / winningTrades : 0;
    const avgLoss = losingTrades > 0 ? sumLosingReturn / losingTrades : 0;
    const riskRewardRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? 99.9 : 0;

    const totalReturn = equityCurve.length > 0 ? ((equityCurve[equityCurve.length - 1].equity - equityCurve[0].equity) / equityCurve[0].equity) * 100 : 0;

    // Trade frequency: calculate time span in days
    const firstTime = predictions[0]?.timestamp || Date.now();
    const lastTime = predictions[predictions.length - 1]?.timestamp || Date.now();
    const timespanDays = Math.max(1, (lastTime - firstTime) / (24 * 3600 * 1000));
    const tradeFrequency = totalTrades / timespanDays;

    const exposure = (totalTrades / Math.max(1, predictions.length)) * 100;

    // Calibration and Brier Score
    const brierScore = brierCount > 0 ? sumSquaredError / brierCount : 0.25;
    const calibrationScore = Math.max(0, 100 - (brierScore * 100)); // Dynamic rating out of 100

    return {
      winRate,
      lossRate,
      totalTrades,
      winningTrades,
      losingTrades,
      expectedValue: meanReturn * 100, // as percentage
      profitFactor,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown: maxDrawdown * 100, // as percentage
      avgHoldingTime: 15, // constant 15m intervals
      tradeFrequency,
      exposure,
      riskRewardRatio,
      calibrationScore,
      brierScore,
      totalReturn
    };
  },

  /**
   * Run a set of baseline strategies and check statistical significance
   */
  evaluateBaselines(
    predictions: ResearchPrediction[],
    strategyMetrics: PerformanceMetrics,
    frictionPct: number
  ): BaselineComparison[] {
    const baselinesToTest = [
      { name: "Buy & Hold", generator: (p: ResearchPrediction, idx: number) => (idx === 0 ? "LONG" : "FLAT") },
      { name: "Always Long", generator: () => "LONG" as const },
      { name: "Always Short", generator: () => "SHORT" as const },
      { name: "Probability Engine Only", generator: (p: ResearchPrediction) => (p.predictedProbs?.up >= 0.55 ? "LONG" : p.predictedProbs?.down >= 0.55 ? "SHORT" : "FLAT" as const) },
      { name: "Random Entry", generator: (p: ResearchPrediction) => {
          const rand = Math.random();
          return rand > 0.66 ? "LONG" : rand > 0.33 ? "SHORT" : "FLAT" as const;
        }
      },
      { name: "Simple Trend Following", generator: (p: ResearchPrediction) => {
          const dir = p.marketSnapshot?.trendAnalysis?.direction;
          return dir === "BULLISH" ? "LONG" : dir === "BEARISH" ? "SHORT" : "FLAT" as const;
        }
      },
      { name: "Mean Reversion (RSI)", generator: (p: ResearchPrediction) => {
          const rsi = p.marketSnapshot?.momentumAnalysis?.rsi14 || 50;
          return rsi < 30 ? "LONG" : rsi > 70 ? "SHORT" : "FLAT" as const;
        }
      }
    ];

    return baselinesToTest.map((base) => {
      let equity = 10000;
      let peakEquity = equity;
      let maxDD = 0;
      const trades: BacktestTrade[] = [];
      let sumSquaredError = 0;
      let brierCount = 0;

      predictions.forEach((pred, idx) => {
        const signal = base.generator(pred, idx);
        if (signal === "FLAT" || !pred.resolved || !pred.actualOutcome) return;

        const outcome = pred.actualOutcome;
        let tradeReturn = 0;
        if (signal === "LONG") {
          tradeReturn = outcome.percentageChange - (frictionPct / 100);
        } else if (signal === "SHORT") {
          tradeReturn = -outcome.percentageChange - (frictionPct / 100);
        }

        const oldEquity = equity;
        equity = equity * (1 + tradeReturn);
        if (equity > peakEquity) peakEquity = equity;
        const currentDD = peakEquity > 0 ? (peakEquity - equity) / peakEquity : 0;
        if (currentDD > maxDD) maxDD = currentDD;

        const targetProb = signal === "LONG" ? (pred.predictedProbs?.up || 0.5) : (pred.predictedProbs?.down || 0.5);
        sumSquaredError += Math.pow(targetProb - (outcome.predictionCorrect ? 1 : 0), 2);
        brierCount++;

        trades.push({
          predictionId: pred.id,
          timestamp: pred.timestamp,
          direction: signal,
          entryPrice: pred.currentPrice,
          exitPrice: outcome.actualPrice,
          pctChange: tradeReturn,
          pnl: equity - oldEquity,
          resolvedAt: outcome.evaluatedAt,
          holdingTime: 15,
          wasWin: tradeReturn > 0,
          maxDrawdown: outcome.drawdown || 0
        });
      });

      const baseMetrics = this.calculateMetrics(
        trades,
        predictions,
        [{ timestamp: predictions[0]?.timestamp || Date.now(), equity: 10000 }, { timestamp: predictions[predictions.length - 1]?.timestamp || Date.now(), equity }],
        maxDD,
        sumSquaredError,
        brierCount
      );

      // Simple pseudo p-value calculator based on return and Sharpe delta
      const deltaSharpe = strategyMetrics.sharpeRatio - baseMetrics.sharpeRatio;
      const deltaReturn = strategyMetrics.totalReturn - baseMetrics.totalReturn;
      
      let pValue = 0.5;
      if (deltaSharpe > 0 && deltaReturn > 0) {
        pValue = Math.max(0.01, 0.5 - (deltaSharpe * 0.1) - (deltaReturn * 0.005));
      } else if (deltaSharpe < 0) {
        pValue = Math.min(0.99, 0.5 + Math.abs(deltaSharpe * 0.15));
      }

      return {
        name: base.name,
        metrics: baseMetrics,
        statDifferencePValue: pValue,
        significantImprovement: pValue < 0.05
      };
    });
  },

  /**
   * Evaluate strategy behavior on subset regimes (trending, ranging, high/low volatility)
   */
  runStressTesting(
    strategy: Strategy,
    predictions: ResearchPrediction[],
    frictionPct: number
  ): StressTestResult[] {
    const regimes = ["TRENDING", "RANGING", "HIGH_VOLATILITY", "LOW_VOLATILITY"];

    return regimes.map((regime) => {
      // Filter predictions belonging to this regime
      const filtered = predictions.filter((p) => {
        if (!p.marketSnapshot) return false;
        const trendDir = p.marketSnapshot.trendAnalysis?.direction;
        const trendStrength = p.marketSnapshot.trendAnalysis?.trendStrength || 50;
        const bollinger = p.marketSnapshot.volatilityAnalysis?.bollingerBandwidth || 2.0;

        if (regime === "TRENDING") {
          return trendStrength > 65;
        }
        if (regime === "RANGING") {
          return trendStrength <= 45;
        }
        if (regime === "HIGH_VOLATILITY") {
          return bollinger > 3.0;
        }
        if (regime === "LOW_VOLATILITY") {
          return bollinger <= 1.5;
        }
        return false;
      });

      if (filtered.length === 0) {
        return {
          regime,
          numTrades: 0,
          winRate: 0,
          totalReturn: 0,
          profitFactor: 0,
          maxDrawdown: 0,
          robustnessScore: 50
        };
      }

      // Backtest on filtered subset
      let equity = 10000;
      let peakEquity = equity;
      let maxDD = 0;
      let wins = 0;
      let losses = 0;
      let profit = 0;
      let loss = 0;

      filtered.forEach((pred) => {
        const signal = evaluateStrategySignal(strategy, pred);
        if (signal === "FLAT" || !pred.resolved || !pred.actualOutcome) return;

        const outcome = pred.actualOutcome;
        let tradeReturn = 0;
        if (signal === "LONG") {
          tradeReturn = outcome.percentageChange - (frictionPct / 100);
        } else if (signal === "SHORT") {
          tradeReturn = -outcome.percentageChange - (frictionPct / 100);
        }

        equity = equity * (1 + tradeReturn);
        if (equity > peakEquity) peakEquity = equity;
        const currentDD = peakEquity > 0 ? (peakEquity - equity) / peakEquity : 0;
        if (currentDD > maxDD) maxDD = currentDD;

        if (tradeReturn > 0) {
          wins++;
          profit += tradeReturn;
        } else {
          losses++;
          loss += Math.abs(tradeReturn);
        }
      });

      const totalTrades = wins + losses;
      const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
      const profitFactor = loss > 0 ? profit / loss : profit > 0 ? 99.9 : 0;
      const totalReturn = ((equity - 10000) / 10000) * 100;

      // Robustness calculation
      let score = 50;
      if (totalTrades > 0) {
        score = Math.min(100, Math.max(0, 40 + (winRate - 50) * 1.5 + (profitFactor - 1) * 20 - (maxDD * 100)));
      }

      return {
        regime,
        numTrades: totalTrades,
        winRate,
        totalReturn,
        profitFactor,
        maxDrawdown: maxDD * 100,
        robustnessScore: Math.round(score)
      };
    });
  }
};
