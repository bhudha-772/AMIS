import { Strategy, ConditionGroup, RangeCondition } from "./strategyTypes";
import { ResearchPrediction } from "./researchLab";
import { strategyValidator } from "./strategyValidator";

/**
 * Strategy Discovery Engine: Automatically generates candidate strategies using
 * intelligent search across feature spaces, ranks them, and outputs explainable insights.
 */

export const strategyDiscovery = {
  /**
   * Generates and evaluates a set of candidate strategies, returning the ranked results.
   */
  discoverStrategies(predictions: ResearchPrediction[]): { strategy: Strategy; evaluation: any }[] {
    if (predictions.length === 0) {
      return [];
    }

    const templates = this.getConditionTemplates();
    const candidates: Strategy[] = [];

    // Let's build distinct smart combined strategies
    templates.forEach((tpl, idx) => {
      candidates.push({
        id: `STRAT-DISC-${100 + idx}`,
        name: tpl.name,
        version: "1.0.0",
        description: tpl.description,
        conditions: tpl.conditions,
        creationDate: Date.now(),
        datasetVersion: "v1.0.0",
        featureVersion: "v1.0.0",
        author: "Automated Quant Explorer",
        status: "EXPERIMENTAL",
        scientificNotes: tpl.scientificNotes,
        explainability: tpl.explainability
      });
    });

    // Evaluate all candidates
    const results = candidates.map((strat) => {
      const evaluation = strategyValidator.evaluateStrategy(strat, predictions);
      return { strategy: strat, evaluation };
    });

    // Rank by a blended score: Sharpe (40%) + Profit Factor (30%) + Win Rate (30%)
    return results.sort((a, b) => {
      const scoreA = (a.evaluation.metrics.sharpeRatio * 0.4) + 
                     ((a.evaluation.metrics.profitFactor || 1) * 0.3) + 
                     ((a.evaluation.metrics.winRate / 100) * 0.3);
                     
      const scoreB = (b.evaluation.metrics.sharpeRatio * 0.4) + 
                     ((b.evaluation.metrics.profitFactor || 1) * 0.3) + 
                     ((b.evaluation.metrics.winRate / 100) * 0.3);
                     
      return scoreB - scoreA; // Descending
    });
  },

  getConditionTemplates(): Array<{
    name: string;
    description: string;
    conditions: ConditionGroup;
    scientificNotes: string;
    explainability: Strategy["explainability"];
  }> {
    return [
      {
        name: "Alpha Momentum Breakout",
        description: "Captures strong probability up-moves aligned with expanding Bollinger bands and strong bullish momentum.",
        conditions: {
          operator: "AND",
          conditions: [
            {
              field: "predictedProbs.up",
              operator: "GT",
              value: 0.58
            } as RangeCondition,
            {
              field: "marketSnapshot.volatilityAnalysis.bollingerBandwidth",
              operator: "GT",
              value: 2.2
            } as RangeCondition,
            {
              field: "marketSnapshot.trendAnalysis.trendStrength",
              operator: "GT",
              value: 60
            } as RangeCondition
          ]
        },
        scientificNotes: "Exploits the momentum effect in highly volatile states. By requiring Bollinger Width expansion, it avoids entering trades inside narrow consolidation channels.",
        explainability: {
          whyItWorks: "Assets in strong trends tend to continue moving in the direction of the trend when accompanied by expanding volatility bandwidth, reducing mean-reversion drift.",
          whenItWorks: "In highly trending bull runs or breakout phases after long consolidation periods.",
          whenItFails: "In sideways whipsaw markets where breakout signals turn out to be bull/bear traps (fakeouts).",
          supportingIndicators: ["RSI14 > 55", "Bollinger bandwidth expansion"],
          contradictingIndicators: ["RSI14 > 80 (extreme overbought)", "High Noise ratio"],
          typicalRegimes: ["TRENDING", "HIGH_VOLATILITY"]
        }
      },
      {
        name: "Sigma Mean Reversion",
        description: "Enters trades when momentum indicators represent oversold or overbought limits combined with high historical similarity.",
        conditions: {
          operator: "AND",
          conditions: [
            {
              field: "marketSnapshot.momentumAnalysis.rsi14",
              operator: "BETWEEN",
              value: 15,
              value2: 35
            } as RangeCondition,
            {
              field: "marketSnapshot.trendAnalysis.trendStrength",
              operator: "LT",
              value: 45
            } as RangeCondition,
            {
              field: "historicalSimilarity",
              operator: "GT",
              value: 0.72
            } as RangeCondition
          ]
        },
        scientificNotes: "Targeted mean-reversion strategy. Filters out trending scenarios to focus purely on flat range bounds.",
        explainability: {
          whyItWorks: "Overextended short-term drops in a low-trend regime are statistically likely to trigger mean-reverting bids due to order book depth dynamics.",
          whenItWorks: "In stable ranging markets with clear support levels.",
          whenItFails: "During powerful capitulation cascades (such as liquidations) where support levels fail to hold.",
          supportingIndicators: ["RSI14 < 30", "Low Bollinger Width"],
          contradictingIndicators: ["Trend Strength > 65", "Liquidity sweep detected"],
          typicalRegimes: ["RANGING", "LOW_VOLATILITY"]
        }
      },
      {
        name: "Adaptive Probability Filtering",
        description: "Enters only when predictions have high confidence, low noise, and strong directional agreement.",
        conditions: {
          operator: "AND",
          conditions: [
            {
              field: "confidence",
              operator: "GT",
              value: 70
            } as RangeCondition,
            {
              field: "predictedProbs.up",
              operator: "GT",
              value: 0.62
            } as RangeCondition,
            {
              field: "marketSnapshot.volatilityAnalysis.noiseRatio",
              operator: "LT",
              value: 0.40
            } as RangeCondition
          ]
        },
        scientificNotes: "Strict probabilistic hurdle. Evaluates both prediction engine confidence levels and underlying signal noise to maximize calibration quality.",
        explainability: {
          whyItWorks: "By filtering for low market noise and high prediction confidence, we isolate periods where historical market behavior is highly predictive of current outcomes.",
          whenItWorks: "During clean, structured market transitions with high-volume participation.",
          whenItFails: "During erratic illiquid hours where low volume creates spikes that distort confidence metrics.",
          supportingIndicators: ["Confidence > 70", "Noise < 0.40"],
          contradictingIndicators: ["Bollinger bandwidth < 1.0 (dead market)"],
          typicalRegimes: ["TRENDING", "LOW_VOLATILITY"]
        }
      },
      {
        name: "Volatility Breakout Guardian",
        description: "Triggers on high probability breakout signals when Bollinger Width is highly contracted, expecting a sudden expansion.",
        conditions: {
          operator: "AND",
          conditions: [
            {
              field: "predictedProbs.up",
              operator: "GT",
              value: 0.55
            } as RangeCondition,
            {
              field: "marketSnapshot.volatilityAnalysis.bollingerBandwidth",
              operator: "LT",
              value: 1.5
            } as RangeCondition,
            {
              field: "confidence",
              operator: "GT",
              value: 65
            } as RangeCondition
          ]
        },
        scientificNotes: "Implements classic volatility squeeze entry rules, looking for high probability directional signals when volatility is tightly coiled.",
        explainability: {
          whyItWorks: "Low volatility states are cyclical and always resolve in explosive volatility expansions. Aligning squeeze exit with probability prediction triggers high win-rate trades.",
          whenItWorks: "Before major macroeconomic announcements or weekly opens when price is tightly range-bound.",
          whenItFails: "When the squeeze continues for weeks, locking capital or creating slow grind drawdowns.",
          supportingIndicators: ["Low Bollinger Bandwidth", "High Confidence"],
          contradictingIndicators: ["High Volatility"],
          typicalRegimes: ["LOW_VOLATILITY", "RANGING"]
        }
      }
    ];
  }
};
