import { Express, Request, Response } from "express";
import { tradeForensicsEngine } from "./tradeForensics";

/**
 * PURPOSE: Express controller to expose Phase 12 Trade Forensics, Traces, Stats, and Calibration APIs.
 * COMPLIANCE: Adheres strictly to returning standardized JSON payloads.
 */
export function registerForensicsRoutes(app: Express) {
  
  // 1. Get all decision traces
  app.get("/api/forensics/traces", (req: Request, res: Response) => {
    try {
      const traces = tradeForensicsEngine.getTraces();
      return res.json({ success: true, count: traces.length, traces });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // 2. Get all losing trade forensic reports
  app.get("/api/forensics/reports", (req: Request, res: Response) => {
    try {
      const reports = tradeForensicsEngine.getForensics();
      return res.json({ success: true, count: reports.length, reports });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // 3. Get rolling statistical validation metrics
  app.get("/api/forensics/stats", (req: Request, res: Response) => {
    try {
      let stats = tradeForensicsEngine.getStats();
      if (!stats) {
        tradeForensicsEngine.computeRollingStatistics();
        stats = tradeForensicsEngine.getStats();
      }
      return res.json({ success: true, stats });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // 4. Get dynamic calibration recommendations
  app.get("/api/forensics/calibration", (req: Request, res: Response) => {
    try {
      const calibration = tradeForensicsEngine.generateCalibrationReport();
      return res.json({ success: true, calibration });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  });
}
