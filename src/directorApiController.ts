import { Express, Request, Response } from "express";
import { directorEngine } from "./directorEngine";
import { directorLedger } from "./directorLedger";
import { runDirectorEngineTests } from "./directorEngine.test";
import { runCompletePipelineIntegrationAudit } from "./integrationAudit";
import { runLongRunReliabilityTest } from "./reliabilitySimulator";
import { runFailureInjectionTest } from "./failureInjection";

/**
 * PURPOSE: Expose REST endpoints for AMIS Phase 10 Operational Research Director.
 * INPUTS: Express requests.
 * OUTPUTS: Scientific evaluations, forensic audits, prioritizations, and compliance reports.
 */
export function registerDirectorRoutes(app: Express) {
  
  // New Endpoint: Complete 11-Stage Pipeline Integration Audit (Part 1, 4 & 5)
  app.post("/api/director/integration-audit", (req: Request, res: Response) => {
    try {
      const results = runCompletePipelineIntegrationAudit();
      return res.json({ success: true, results });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // New Endpoint: Long-Run Reliability Stress Test (Part 6)
  app.post("/api/director/reliability-test", (req: Request, res: Response) => {
    try {
      const ticks = req.body.ticks ? parseInt(req.body.ticks) : 100000;
      const results = runLongRunReliabilityTest(ticks);
      return res.json({ success: true, results });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // New Endpoint: Failure Injection Resilience Audit (Part 7)
  app.post("/api/director/failure-injection", (req: Request, res: Response) => {
    try {
      const results = runFailureInjectionTest();
      return res.json({ success: true, results });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // 1. Snapshot + Historical Performance Reviews (Part 1)
  app.get("/api/director/performance-history", (req: Request, res: Response) => {
    try {
      const history = directorEngine.getPerformanceHistory();
      const current = directorEngine.generateCurrentPerformanceSnapshot();
      return res.json({ success: true, current, history });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // 2. Root Cause Forensic Analysis (Part 2)
  app.get("/api/director/root-causes", (req: Request, res: Response) => {
    try {
      const subsystem = (req.query.subsystem as string) || "Execution Laboratory";
      const analysis = directorEngine.analyzeRootCauses(subsystem);
      const allHistory = directorEngine.getLastRootCauseAnalysis();
      return res.json({ success: true, analysis, history: allHistory });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // 3. Hypotheses (Part 3)
  app.get("/api/director/hypotheses", (req: Request, res: Response) => {
    try {
      const list = directorLedger.getHypotheses();
      return res.json({ success: true, hypotheses: list });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // 4. Experiments List & Dynamic Scored Prioritizations (Part 4 & 5)
  app.get("/api/director/experiments", (req: Request, res: Response) => {
    try {
      const experiments = directorLedger.getExperiments();
      const rankings = directorEngine.scoreAndRankExperiments(experiments);
      return res.json({ success: true, experiments, rankings });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // 5. System Scorecard (Part 6)
  app.get("/api/director/scorecard-report", (req: Request, res: Response) => {
    try {
      const report = directorEngine.generateSubsystemScorecardReport();
      return res.json({ success: true, report });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // 6. Recommendations Index (Part 7)
  app.get("/api/director/recommendations", (req: Request, res: Response) => {
    try {
      const list = directorLedger.getRecommendations();
      return res.json({ success: true, recommendations: list });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // 7. Resolve Recommendation
  app.post("/api/director/resolve-recommendation", (req: Request, res: Response) => {
    try {
      const { id } = req.body;
      if (!id) {
        return res.status(400).json({ success: false, message: "Missing required recommendation ID." });
      }
      const success = directorLedger.resolveRecommendation(id);
      return res.json({ success, message: success ? "Recommendation marked resolved." : "Recommendation not found." });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // 8. Dynamic Auto-Generation of Scientific Hypothesis (Part 3 & 4)
  app.post("/api/director/trigger-auto-hypothesis", (req: Request, res: Response) => {
    try {
      const hypothesis = directorEngine.attemptAutoGenerateHypothesis();
      if (hypothesis) {
        return res.json({
          success: true,
          triggered: true,
          hypothesis,
          message: "Calibration divergence detected! Generated research hypotheses and dynamic experiments."
        });
      } else {
        return res.json({
          success: true,
          triggered: false,
          message: "System calibration stable. No anomalous divergence observed to justify auto-hypothesis."
        });
      }
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // 9. Long-term Evolution History (Part 8)
  app.get("/api/director/evolution-history", (req: Request, res: Response) => {
    try {
      const history = directorLedger.getEvolutionHistory();
      return res.json({ success: true, history });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // 10. Clear/Reset Ledger (For testing resets)
  app.post("/api/director/clear", (req: Request, res: Response) => {
    try {
      directorLedger.clearState();
      return res.json({ success: true, message: "Research Director state reset to standard template." });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // 11. Run Deterministic Suite Verification Checks (Part 10)
  app.post("/api/director/run-tests", (req: Request, res: Response) => {
    try {
      const results = runDirectorEngineTests();
      return res.json({ success: true, results });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });
}
