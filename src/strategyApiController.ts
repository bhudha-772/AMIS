import * as fs from "fs";
import * as path from "path";
import express from "express";
import { strategyRegistry } from "./strategyRegistry";
import { strategyDiscovery } from "./strategyDiscovery";
import { strategyValidator } from "./strategyValidator";
import { runStrategyResearchTests } from "./strategyResearch.test";

const DATA_DIR = path.join(process.cwd(), "data");

function readPredictionsRaw(): any[] {
  const filePath = path.join(DATA_DIR, "research_predictions.json");
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("[Strategy API] Failed to read research predictions:", err);
    return [];
  }
}

export function registerStrategyRoutes(app: express.Express) {
  /**
   * 1. GET /api/market/research/strategies
   * Returns registered quantitative strategies
   */
  app.get("/api/market/research/strategies", (req, res) => {
    try {
      const list = strategyRegistry.getStrategies();
      res.json({
        success: true,
        strategies: list
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || err });
    }
  });

  /**
   * 2. POST /api/market/research/strategies/register
   * Registers a new quantitative strategy
   */
  app.post("/api/market/research/strategies/register", (req, res) => {
    try {
      const { strategy } = req.body;
      if (!strategy || !strategy.id || !strategy.name || !strategy.conditions) {
        return res.status(400).json({ success: false, message: "Invalid strategy structure. Missing required fields." });
      }

      const success = strategyRegistry.registerStrategy(strategy);
      if (!success) {
        return res.status(400).json({ success: false, message: "Strategy already exists or registry write failed." });
      }

      res.json({
        success: true,
        message: `Strategy ${strategy.name} successfully registered.`
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || err });
    }
  });

  /**
   * 3. POST /api/market/research/strategies/status
   * Updates status of a registered strategy
   */
  app.post("/api/market/research/strategies/status", (req, res) => {
    try {
      const { id, status, notes } = req.body;
      if (!id || !status) {
        return res.status(400).json({ success: false, message: "id and status are required." });
      }

      const success = strategyRegistry.updateStrategyStatus(id, status, notes);
      if (!success) {
        return res.status(404).json({ success: false, message: `Strategy with ID ${id} not found.` });
      }

      res.json({
        success: true,
        message: `Strategy ${id} status successfully updated to ${status}.`
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || err });
    }
  });

  /**
   * 4. GET /api/market/research/strategies/evaluations
   * Returns saved strategy evaluations
   */
  app.get("/api/market/research/strategies/evaluations", (req, res) => {
    try {
      const evaluations = strategyRegistry.getEvaluations();
      res.json({
        success: true,
        evaluations
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || err });
    }
  });

  /**
   * 5. POST /api/market/research/strategies/evaluate
   * Executes a strict walk-forward evaluation for a specific registered strategy
   */
  app.post("/api/market/research/strategies/evaluate", (req, res) => {
    try {
      const { strategyId, frictionPct = 0.05 } = req.body;
      if (!strategyId) {
        return res.status(400).json({ success: false, message: "strategyId is required." });
      }

      const strategies = strategyRegistry.getStrategies();
      const strat = strategies.find((s) => s.id === strategyId);
      if (!strat) {
        return res.status(404).json({ success: false, message: `Strategy ${strategyId} not found.` });
      }

      const predictions = readPredictionsRaw();
      if (predictions.length === 0) {
        return res.status(400).json({ success: false, message: "No research predictions found to run backtest." });
      }

      const evaluation = strategyValidator.evaluateStrategy(strat, predictions, frictionPct);
      strategyRegistry.saveStrategyEvaluation(evaluation);

      res.json({
        success: true,
        evaluation
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || err });
    }
  });

  /**
   * 6. POST /api/market/research/strategies/discover
   * Triggers the discovery engine to find optimal candidate strategies
   */
  app.post("/api/market/research/strategies/discover", (req, res) => {
    try {
      const predictions = readPredictionsRaw();
      if (predictions.length === 0) {
        return res.status(400).json({ success: false, message: "No research predictions found to perform strategy discovery." });
      }

      const discovered = strategyDiscovery.discoverStrategies(predictions);

      // Register the discovered strategies automatically to build up our registry!
      discovered.forEach((item) => {
        strategyRegistry.registerStrategy(item.strategy);
        strategyRegistry.saveStrategyEvaluation(item.evaluation);
      });

      res.json({
        success: true,
        message: `Successfully discovered and registered ${discovered.length} trading strategies.`,
        discovered
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || err });
    }
  });

  /**
   * 7. POST /api/market/research/strategies/run-tests
   * Triggers deterministic testing of strategies
   */
  app.post("/api/market/research/strategies/run-tests", (req, res) => {
    try {
      const results = runStrategyResearchTests();
      res.json({
        success: true,
        message: "Strategy Research deterministic testing complete.",
        results
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || err });
    }
  });
}
