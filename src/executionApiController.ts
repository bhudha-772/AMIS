import express from "express";
import { executionLedgerEngine } from "./executionLedger";
import { executionIntelligenceLab } from "./executionEngine";
import { runExecutionEngineTests } from "./executionEngine.test";
import { decisionEngine } from "./decisionEngine";
import { riskEngine } from "./riskEngine";
import { ExecutionPlan } from "./executionTypes";
import { ExecutionPlanner } from "./executionPlanner";

/**
 * Registers REST API endpoints for the Execution Intelligence Laboratory.
 */
export function registerExecutionRoutes(app: express.Express) {
  /**
   * 1. GET /api/execution/ledger
   * Returns all persistent simulated executions from the ledger
   */
  app.get("/api/execution/ledger", (req, res) => {
    try {
      const records = executionLedgerEngine.getRecords();
      res.json({
        success: true,
        ledger: records
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || err });
    }
  });

  /**
   * 2. GET /api/execution/analytics
   * Computes and returns continuous execution metrics
   */
  app.get("/api/execution/analytics", (req, res) => {
    try {
      const analytics = executionLedgerEngine.computeAnalytics();
      res.json({
        success: true,
        analytics
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || err });
    }
  });

  /**
   * 3. GET /api/execution/config
   * Returns current simulation configuration boundaries
   */
  app.get("/api/execution/config", (req, res) => {
    try {
      const config = executionIntelligenceLab.getSimConfig();
      res.json({
        success: true,
        config
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || err });
    }
  });

  /**
   * 4. POST /api/execution/config
   * Updates matching environment config (slippage, spread, latency, jitter)
   */
  app.post("/api/execution/config", (req, res) => {
    try {
      const { baseSlippage, baseSpread, baseLatency, jitter, rejectionProbability, networkInterruptionRate, queueDelayMeanMs } = req.body;

      executionIntelligenceLab.updateSimConfig({
        baseSlippage: baseSlippage !== undefined ? Number(baseSlippage) : undefined,
        baseSpread: baseSpread !== undefined ? Number(baseSpread) : undefined,
        baseLatency: baseLatency !== undefined ? Number(baseLatency) : undefined,
        jitter: jitter !== undefined ? Number(jitter) : undefined,
        rejectionProbability: rejectionProbability !== undefined ? Number(rejectionProbability) : undefined,
        networkInterruptionRate: networkInterruptionRate !== undefined ? Number(networkInterruptionRate) : undefined,
        queueDelayMeanMs: queueDelayMeanMs !== undefined ? Number(queueDelayMeanMs) : undefined
      });

      res.json({
        success: true,
        message: "Execution simulation parameters updated successfully.",
        config: executionIntelligenceLab.getSimConfig()
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || err });
    }
  });

  /**
   * 5. POST /api/execution/pipeline-pass
   * Triggers the full system integration pipeline from Decision through Risk approval down to Execution fill
   */
  app.post("/api/execution/pipeline-pass", (req, res) => {
    try {
      const { platformMode, simOverrides } = req.body;

      // Find the latest decision in history
      const decisions = [...decisionEngine.getDecisions()];
      if (decisions.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No Decision records found in registry. Please evaluate market signals first."
        });
      }

      // Sort to get the absolute newest decision
      decisions.sort((a, b) => b.timestamp - a.timestamp);
      const targetDecision = decisions[0];

      // Find corresponding risk clearance
      const riskDecisions = [...riskEngine.getHistory()];
      let targetRisk = riskDecisions.find(r => r.decisionId === targetDecision.id);

      if (!targetRisk) {
        // If no pre-existing clearance, evaluate on the fly
        targetRisk = riskEngine.evaluateDecision(targetDecision, targetDecision.expectedValue || 95000);
      }

      // Execute through the deterministic laboratory
      const record = executionIntelligenceLab.executeDecisionPipeline(
        targetDecision,
        targetRisk,
        targetDecision.expectedValue || 95000,
        platformMode || "deriv",
        simOverrides || {}
      );

      res.json({
        success: true,
        message: "Orchestrated full-system Execution pipeline pass successfully.",
        record,
        analytics: executionLedgerEngine.computeAnalytics()
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || err });
    }
  });

  /**
   * 6. POST /api/execution/manual-order
   * Places a manual simulation order to test extreme limit configurations
   */
  app.post("/api/execution/manual-order", (req, res) => {
    try {
      const { symbol, side, orderType, entryPrice, positionSize, stopLoss, takeProfit, simOverrides } = req.body;

      if (!symbol || !side || !orderType || !entryPrice || !positionSize || !stopLoss || !takeProfit) {
        return res.status(400).json({
          success: false,
          message: "All parameters are required: symbol, side, orderType, entryPrice, positionSize, stopLoss, takeProfit"
        });
      }

      const plan = ExecutionPlanner.generatePlan({
        symbol,
        side,
        orderType,
        entryPrice: Number(entryPrice),
        positionSize: Number(positionSize),
        stopLoss: Number(stopLoss),
        takeProfit: Number(takeProfit)
      });

      const record = executionIntelligenceLab.placeSimulatedOrder(plan, simOverrides || {});

      res.json({
        success: true,
        message: "Simulated manual order placed successfully.",
        record,
        analytics: executionLedgerEngine.computeAnalytics()
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || err });
    }
  });

  /**
   * 7. POST /api/execution/run-tests
   * Executes the comprehensive automated diagnostic tests
   */
  app.post("/api/execution/run-tests", (req, res) => {
    try {
      const results = runExecutionEngineTests();
      res.json({
        success: true,
        results
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || err });
    }
  });

  /**
   * 8. POST /api/execution/clear
   * Resets the execution laboratory database for a clean demo
   */
  app.post("/api/execution/clear", (req, res) => {
    try {
      executionLedgerEngine.clearAllRecords();
      res.json({
        success: true,
        message: "Simulated execution ledger cleared successfully."
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || err });
    }
  });
}
