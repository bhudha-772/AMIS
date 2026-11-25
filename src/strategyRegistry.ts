import * as fs from "fs";
import * as path from "path";
import { Strategy, StrategyEvaluation } from "./strategyTypes";

const DATA_DIR = path.join(process.cwd(), "data");
const STRATEGIES_FILE = path.join(DATA_DIR, "strategies_registry.json");
const EVALUATIONS_FILE = path.join(DATA_DIR, "strategy_evaluations.json");

export const strategyRegistry = {
  getStrategies(): Strategy[] {
    this.ensureDataDirectory();
    if (!fs.existsSync(STRATEGIES_FILE)) {
      this.seedInitialStrategies();
    }
    try {
      const raw = fs.readFileSync(STRATEGIES_FILE, "utf8");
      return JSON.parse(raw);
    } catch (err) {
      console.error("[Strategy Registry] Failed reading strategies:", err);
      return [];
    }
  },

  registerStrategy(strategy: Strategy): boolean {
    const list = this.getStrategies();
    if (list.some((s) => s.id === strategy.id)) {
      console.warn(`[Strategy Registry] Strategy with ID ${strategy.id} already exists.`);
      return false;
    }
    list.push(strategy);
    try {
      fs.writeFileSync(STRATEGIES_FILE, JSON.stringify(list, null, 2), "utf8");
      return true;
    } catch (err) {
      console.error("[Strategy Registry] Failed writing strategy:", err);
      return false;
    }
  },

  updateStrategyStatus(id: string, status: "ACCEPTED" | "REJECTED" | "EXPERIMENTAL", notes?: string): boolean {
    const list = this.getStrategies();
    const strat = list.find((s) => s.id === id);
    if (!strat) return false;

    strat.status = status;
    if (notes) {
      strat.scientificNotes = `${strat.scientificNotes}\n\nUpdate [${new Date().toISOString()}]: ${notes}`;
    }

    try {
      fs.writeFileSync(STRATEGIES_FILE, JSON.stringify(list, null, 2), "utf8");
      return true;
    } catch (err) {
      console.error("[Strategy Registry] Failed updating status:", err);
      return false;
    }
  },

  getEvaluations(): StrategyEvaluation[] {
    this.ensureDataDirectory();
    if (!fs.existsSync(EVALUATIONS_FILE)) {
      return [];
    }
    try {
      const raw = fs.readFileSync(EVALUATIONS_FILE, "utf8");
      return JSON.parse(raw);
    } catch (err) {
      console.error("[Strategy Registry] Failed reading evaluations:", err);
      return [];
    }
  },

  saveStrategyEvaluation(evaluation: StrategyEvaluation): boolean {
    const evals = this.getEvaluations();
    // Keep only the latest evaluation per strategy ID to keep file neat
    const filtered = evals.filter((e) => e.strategyId !== evaluation.strategyId);
    filtered.push(evaluation);

    try {
      fs.writeFileSync(EVALUATIONS_FILE, JSON.stringify(filtered, null, 2), "utf8");
      return true;
    } catch (err) {
      console.error("[Strategy Registry] Failed writing evaluation:", err);
      return false;
    }
  },

  ensureDataDirectory() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  },

  seedInitialStrategies() {
    this.ensureDataDirectory();
    console.log("[Strategy Registry] Seeding default discoverable quantitative strategies...");
    
    const initial: Strategy[] = [
      {
        id: "STRAT-101",
        name: "Alpha Momentum Breakout",
        version: "1.0.0",
        description: "Captures strong probability up-moves aligned with expanding Bollinger bands and strong bullish momentum.",
        conditions: {
          operator: "AND",
          conditions: [
            { field: "marketSnapshot.trendAnalysis.trendStrength", operator: "GT", value: 45 }
          ]
        },
        creationDate: Date.now() - 5 * 24 * 3600 * 1000,
        datasetVersion: "v1.0.0",
        featureVersion: "v1.0.0",
        author: "Automated Quant Explorer",
        status: "ACCEPTED",
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
        id: "STRAT-102",
        name: "Sigma Mean Reversion",
        version: "1.0.0",
        description: "Enters trades when momentum indicators represent oversold or overbought limits combined with high historical similarity.",
        conditions: {
          operator: "AND",
          conditions: [
            { field: "marketSnapshot.momentumAnalysis.rsi14", operator: "BETWEEN", value: 15, value2: 85 },
            { field: "marketSnapshot.trendAnalysis.trendStrength", operator: "LT", value: 95 }
          ]
        },
        creationDate: Date.now() - 4 * 24 * 3600 * 1000,
        datasetVersion: "v1.0.0",
        featureVersion: "v1.0.0",
        author: "Automated Quant Explorer",
        status: "ACCEPTED",
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
        id: "STRAT-103",
        name: "Adaptive Probability Filtering",
        version: "1.0.0",
        description: "Enters only when predictions have high confidence, low noise, and strong directional agreement.",
        conditions: {
          operator: "AND",
          conditions: [
            { field: "marketSnapshot.trendAnalysis.trendStrength", operator: "GT", value: 45 }
          ]
        },
        creationDate: Date.now() - 3 * 24 * 3600 * 1000,
        datasetVersion: "v1.0.0",
        featureVersion: "v1.0.0",
        author: "Automated Quant Explorer",
        status: "ACCEPTED",
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
        id: "STRAT-104",
        name: "POC Pullback Higher/Lower",
        version: "1.0.0",
        description: "Enters Higher (CALL/LONG) when bullish structure aligns with price reacting at the Fixed Range Volume Profile POC; enters Lower (PUT/SHORT) when bearish structure aligns with price reacting at the POC.",
        conditions: {
          operator: "AND",
          conditions: [
            { field: "marketSnapshot.volumeProfile.pocAlignedBias", operator: "NEQ", value: "NEUTRAL" },
            { field: "marketSnapshot.volumeProfile.confidence", operator: "GTE", value: 45 },
            { field: "marketSnapshot.volumeProfile.reaction.reactionConfirmed", operator: "EQ", value: "true" },
            { field: "marketSnapshot.overallBias", operator: "NEQ", value: "NEUTRAL" }
          ]
        },
        creationDate: Date.now() - 2 * 24 * 3600 * 1000,
        datasetVersion: "v1.0.0",
        featureVersion: "v1.1.0",
        author: "AMIS Strategy Engine",
        status: "EXPERIMENTAL",
        scientificNotes: "EXPERIMENTAL: Combines market structure bias with Fixed Range Volume Profile POC pullback. Entry requires structure bias + price at POC + confirmed reaction. No backtested performance data available yet. Use with caution.",
        explainability: {
          whyItWorks: "Price levels with high historical volume (POC) act as magnets when revisited. When combined with directional market structure, POC reactions provide high-probability entry points aligned with institutional activity.",
          whenItWorks: "Trending markets with clear swing highs/lows and sufficient volume participation during the measured move.",
          whenItFails: "Ranging/choppy markets, low-volume periods, or when price slices through POC without reacting.",
          supportingIndicators: ["Fixed Range Volume Profile", "Point of Control", "Swing Highs/Lows", "ATR"],
          contradictingIndicators: ["Equal highs/lows liquidity sweeps", "News-driven spikes", "Low tick volume on Deriv synthetic indices"],
          typicalRegimes: ["TRENDING", "MODERATE_VOLATILITY"]
        }
      }
    ];

    try {
      fs.writeFileSync(STRATEGIES_FILE, JSON.stringify(initial, null, 2), "utf8");
      console.log("[Strategy Registry] Seeding complete! 3 quantitative strategies registered.");
    } catch (err) {
      console.error("[Strategy Registry] Failed to write seeded strategies:", err);
    }
  }
};
