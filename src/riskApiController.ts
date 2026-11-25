import express from "express";
import { riskEngine } from "./riskEngine";
import { runRiskEngineTests } from "./riskEngine.test";
import { SizingMethod, EmergencyState } from "./riskTypes";
import { decisionEngine } from "./decisionEngine";

export function registerRiskRoutes(app: express.Express) {
  /**
   * 1. GET /api/risk/current
   * Returns current general configuration, emergency state, and capital levels
   */
  app.get("/api/risk/current", (req, res) => {
    try {
      res.json({
        success: true,
        emergencyState: riskEngine.getConfig().emergencyState,
        config: riskEngine.getConfig(),
        capitalState: riskEngine.getConfig().capitalState
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || err });
    }
  });

  /**
   * 2. GET /api/risk/history
   * Returns list of risk evaluation logs
   */
  app.get("/api/risk/history", (req, res) => {
    try {
      let history = [...riskEngine.getHistory()];
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const market = req.query.market as string;

      if (market) {
        history = history.filter(d => d.portfolioStateSnapshot.openPositions.some(p => p.symbol.toLowerCase() === market.toLowerCase()));
      }

      // Sort newest first
      history.sort((a, b) => b.timestamp - a.timestamp);

      res.json({
        success: true,
        history: history.slice(0, limit)
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || err });
    }
  });

  /**
   * 3. GET /api/risk/portfolio
   * Returns detailed portfolio risk state, exposures, and heat metrics
   */
  app.get("/api/risk/portfolio", (req, res) => {
    try {
      const state = riskEngine.getPortfolioRiskState();
      res.json({
        success: true,
        portfolioState: state
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || err });
    }
  });

  /**
   * 4. GET /api/risk/statistics
   * Returns aggregate risk stats, drawdown levels, and transition metrics
   */
  app.get("/api/risk/statistics", (req, res) => {
    try {
      const history = riskEngine.getHistory();
      const transitions = riskEngine.getTransitionLogs();
      const config = riskEngine.getConfig();

      const totalEvaluations = history.length;
      const allowedCount = history.filter(h => h.action === "ALLOW" || h.action === "ALLOW_WITH_REDUCED_SIZE").length;
      const blockedCount = history.filter(h => h.action === "BLOCK").length;
      const ratioAllowed = totalEvaluations > 0 ? (allowedCount / totalEvaluations) * 100 : 0;

      res.json({
        success: true,
        statistics: {
          totalEvaluations,
          allowedCount,
          blockedCount,
          acceptanceRate: Number(ratioAllowed.toFixed(2)),
          totalTransitionLogsCount: transitions.length,
          lastTransitionEvent: transitions[transitions.length - 1] || null,
          capital: config.capitalState
        }
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || err });
    }
  });

  /**
   * 5. GET /api/risk/explain/:id
   * Exposes detailed risk check explainability output
   */
  app.get("/api/risk/explain/:id", (req, res) => {
    try {
      const id = req.params.id;
      const history = riskEngine.getHistory();
      const found = history.find(h => h.id === id || h.decisionId === id);

      if (!found) {
        return res.status(404).json({
          success: false,
          message: `Risk evaluation decision record for ID '${id}' not found.`
        });
      }

      res.json({
        success: true,
        riskDecision: found
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || err });
    }
  });

  /**
   * 6. POST /api/risk/evaluate
   * Evaluates a target DecisionEngine output under live risk parameters
   */
  app.post("/api/risk/evaluate", (req, res) => {
    try {
      const { decisionId, currentPrice, params } = req.body;
      if (!decisionId || !currentPrice) {
        return res.status(400).json({
          success: false,
          message: "Fields 'decisionId' and 'currentPrice' are required in request body."
        });
      }

      const originalDecision = decisionEngine.replayDecision(decisionId);
      if (!originalDecision) {
        return res.status(404).json({
          success: false,
          message: `Underlying market decision ID '${decisionId}' not found in registry.`
        });
      }

      const riskDecision = riskEngine.evaluateDecision(originalDecision, currentPrice, params || {});
      res.json({
        success: true,
        riskDecision
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || err });
    }
  });

  /**
   * 7. POST /api/risk/configure
   * Allows setting active sizing method, leverage limit, or emergency state manual switches
   */
  app.post("/api/risk/configure", (req, res) => {
    try {
      const {
        sizingMethod,
        riskPerTrade,
        maxDailyLoss,
        coolingOffDuration,
        fixedSizeAmount,
        emergencyState
      } = req.body;

      // Update operations
      riskEngine.updateConfiguration({
        sizingMethod: sizingMethod as SizingMethod,
        riskPerTrade: riskPerTrade !== undefined ? Number(riskPerTrade) : undefined,
        maxDailyLoss: maxDailyLoss !== undefined ? Number(maxDailyLoss) : undefined,
        coolingOffDuration: coolingOffDuration !== undefined ? Number(coolingOffDuration) : undefined,
        fixedSizeAmount: fixedSizeAmount !== undefined ? Number(fixedSizeAmount) : undefined
      });

      // Handle emergency state manual transition
      if (emergencyState) {
        riskEngine.transitionToState(
          emergencyState as EmergencyState,
          "Manual administrative configuration override."
        );
      }

      res.json({
        success: true,
        message: "Risk management parameters updated successfully.",
        config: riskEngine.getConfig()
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || err });
    }
  });

  /**
   * 8. POST /api/risk/run-tests
   * Triggers automated testing and returns report
   */
  app.post("/api/risk/run-tests", (req, res) => {
    try {
      const results = runRiskEngineTests();
      res.json({
        success: true,
        results
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || err });
    }
  });

  /**
   * 9. POST /api/risk/simulate-position
   * Helper endpoint to open/simulate a trade position for researchers to test limits
   */
  app.post("/api/risk/simulate-position", (req, res) => {
    try {
      const { symbol, side, entryPrice, amount, stopLossPrice, strategy, model } = req.body;
      if (!symbol || !side || !entryPrice || !amount || !stopLossPrice) {
        return res.status(400).json({
          success: false,
          message: "All fields: symbol, side, entryPrice, amount, stopLossPrice are required to simulate a position."
        });
      }

      const position = riskEngine.openPosition(
        symbol,
        side,
        Number(entryPrice),
        Number(amount),
        Number(stopLossPrice),
        strategy || "TEST_STRAT",
        model || "TEST_MODEL"
      );

      res.json({
        success: true,
        message: `Successfully opened simulated position for ${symbol}`,
        position,
        portfolio: riskEngine.getPortfolioRiskState()
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || err });
    }
  });

  /**
   * 10. POST /api/risk/simulate-close
   * Helper endpoint to close an active simulated trade position
   */
  app.post("/api/risk/simulate-close", (req, res) => {
    try {
      const { symbol, exitPrice } = req.body;
      if (!symbol || !exitPrice) {
        return res.status(400).json({
          success: false,
          message: "Fields 'symbol' and 'exitPrice' are required to simulate close."
        });
      }

      const result = riskEngine.closePosition(symbol, Number(exitPrice));
      if (!result) {
        return res.status(404).json({
          success: false,
          message: `Active simulated position for '${symbol}' not found.`
        });
      }

      res.json({
        success: true,
        message: `Successfully closed simulated position for ${symbol}. P&L recorded.`,
        profit: result.profit,
        wins: result.wins,
        losses: result.losses,
        portfolio: riskEngine.getPortfolioRiskState()
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || err });
    }
  });
}
