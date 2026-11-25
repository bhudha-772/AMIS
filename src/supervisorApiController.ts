import { Express, Request, Response } from "express";
import { supervisorEngine } from "./supervisorEngine";
import { supervisorLedger } from "./supervisorLedger";
import { runSupervisorEngineTests } from "./supervisorEngine.test";

/**
 * PURPOSE: Express controller to expose Phase 9 Operational Intelligence APIs.
 * INPUTS: HTTP requests.
 * OUTPUTS: Health JSON, Watchdogs, Anomalies, Ledger logs, Stress results.
 * COMPLIANCE: Adheres strictly to single point of query parameters and returns success flags.
 */
export function registerSupervisorRoutes(app: Express) {
  
  // 1. Get Overall Health
  app.get("/api/supervisor/health", (req: Request, res: Response) => {
    try {
      const state = supervisorEngine.calculateHealth();
      return res.json({ success: true, health: state });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // 2. Get Active Watchdogs
  app.get("/api/supervisor/watchdogs", (req: Request, res: Response) => {
    try {
      const watchdogs = supervisorEngine.calculateWatchdogs();
      return res.json({ success: true, watchdogs });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // 3. Get Anomalies
  app.get("/api/supervisor/anomalies", (req: Request, res: Response) => {
    try {
      const anomalies = supervisorEngine.getAnomalies();
      return res.json({ success: true, anomalies });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // 4. Get Immutable Events Ledger
  app.get("/api/supervisor/ledger", (req: Request, res: Response) => {
    try {
      const events = supervisorLedger.getEvents();
      return res.json({ success: true, ledger: events });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // 5. Resolve Ledger Event
  app.post("/api/supervisor/resolve", (req: Request, res: Response) => {
    try {
      const { eventId } = req.body;
      if (!eventId) {
        return res.status(400).json({ success: false, message: "Missing required eventId field." });
      }
      const success = supervisorLedger.resolveEvent(eventId);
      return res.json({ success, message: success ? "Event marked as resolved." : "Event not found." });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // 6. Fetch Self-Diagnostics
  app.get("/api/supervisor/diagnostics", (req: Request, res: Response) => {
    try {
      const diag = supervisorEngine.fetchDiagnostics();
      return res.json({ success: true, diagnostics: diag });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // 7. Run Compliance Diagnostics (Unit Tests)
  app.post("/api/supervisor/run-tests", (req: Request, res: Response) => {
    try {
      const results = runSupervisorEngineTests();
      return res.json({ success: true, results });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // 8. Trigger Stress Test
  app.post("/api/supervisor/stress-test", async (req: Request, res: Response) => {
    try {
      const results = await supervisorEngine.runStressTest();
      return res.json({ success: true, results });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // 9. Get safety recommendations
  app.get("/api/supervisor/safety", (req: Request, res: Response) => {
    try {
      const rec = supervisorEngine.calculateSafetyRecommendation();
      return res.json({ success: true, recommendation: rec });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // 10. Clear simulator states exclusively for diagnostic sandbox resets
  app.post("/api/supervisor/clear", (req: Request, res: Response) => {
    try {
      supervisorLedger.clearLedger();
      supervisorEngine.clearAnomalies();
      supervisorEngine.setRiskViolations(0);
      supervisorEngine.setCalDev(0.015);
      return res.json({ success: true, message: "Ledger and active anomalies reset." });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });
}
