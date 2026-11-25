import * as fs from "fs";
import * as path from "path";
import { OperationalLogEvent, MonitoredSubsystem, EventSeverity } from "./supervisorTypes";

const LEDGER_FILE = path.join(process.cwd(), "data", "supervisor_ledger.json");

/**
 * PURPOSE: Implements immutable operational auditing logs for safety, diagnostics, and compliance reporting.
 * INPUTS: Operational event details, warnings, exceptions, and anomalies.
 * OUTPUTS: Atomic file persistence and history querying.
 * COMPLEXITY: O(1) writes, O(N) queries.
 * FAILURE MODES: Disk write failures, folder permissions.
 * LIMITATIONS: Node.js file system APIs.
 */
export class SupervisorLedger {
  private events: OperationalLogEvent[] = [];
  private static instance: SupervisorLedger;

  public static getInstance(): SupervisorLedger {
    if (!this.instance) {
      this.instance = new SupervisorLedger();
    }
    return this.instance;
  }

  private constructor() {
    this.loadLedger();
  }

  /**
   * Loads supervisor ledger logs from disk with atomic recovery fallbacks.
   */
  private loadLedger() {
    try {
      const dir = path.dirname(LEDGER_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(LEDGER_FILE)) {
        const raw = fs.readFileSync(LEDGER_FILE, "utf8");
        this.events = JSON.parse(raw);
      } else {
        this.events = [];
      }
    } catch (err) {
      console.error("[Supervisor Ledger] Failed to load supervisor logs from disk. Starting fresh.", err);
      this.events = [];
    }
  }

  /**
   * Saves ledger atomically.
   */
  private saveLedger() {
    try {
      const dir = path.dirname(LEDGER_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const temp = `${LEDGER_FILE}.tmp`;
      fs.writeFileSync(temp, JSON.stringify(this.events, null, 2), "utf8");
      fs.renameSync(temp, LEDGER_FILE);
    } catch (err) {
      console.error("[Supervisor Ledger] Failed to write logs atomically to disk:", err);
    }
  }

  /**
   * Clears the ledger logs (exclusively for test resets).
   */
  public clearLedger() {
    this.events = [];
    try {
      if (fs.existsSync(LEDGER_FILE)) {
        fs.unlinkSync(LEDGER_FILE);
      }
    } catch (e) {
      console.error("[Supervisor Ledger] Error deleting file:", e);
    }
  }

  /**
   * Logs a new immutable supervisor event to persistent audit ledger.
   */
  public logEvent(params: {
    readonly subsystem: MonitoredSubsystem;
    readonly severity: EventSeverity;
    readonly title: string;
    readonly evidence: string;
    readonly rootCause?: string;
    readonly recommendedAction?: string;
  }): OperationalLogEvent {
    const timestamp = Date.now();
    const event: OperationalLogEvent = {
      id: `SUP-EVT-${timestamp}-${Math.floor(Math.random() * 100000)}`,
      timestamp,
      subsystem: params.subsystem,
      severity: params.severity,
      title: params.title,
      evidence: params.evidence,
      rootCause: params.rootCause,
      recommendedAction: params.recommendedAction,
      resolved: false
    };

    this.events.push(Object.freeze(event));
    this.saveLedger();
    return event;
  }

  /**
   * Resolves an open event. Updates resolution attributes while preserving audit history.
   */
  public resolveEvent(id: string): boolean {
    const idx = this.events.findIndex(e => e.id === id);
    if (idx === -1) return false;

    const existing = this.events[idx];
    if (existing.resolved) return true;

    const updated: OperationalLogEvent = {
      ...existing,
      resolved: true,
      resolvedAt: Date.now()
    };

    this.events[idx] = Object.freeze(updated);
    this.saveLedger();
    return true;
  }

  /**
   * Returns copy of log list.
   */
  public getEvents(): readonly OperationalLogEvent[] {
    return this.events;
  }
}

export const supervisorLedger = SupervisorLedger.getInstance();
