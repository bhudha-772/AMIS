export type MonitoredSubsystem =
  | "MARKET_FEED"
  | "INDICATORS"
  | "PROBABILITY"
  | "RESEARCH"
  | "MACHINE_LEARNING"
  | "STRATEGY"
  | "DECISION"
  | "RISK"
  | "EXECUTION"
  | "PERSISTENCE"
  | "API"
  | "FRONTEND"
  | "BROKER_ADAPTER";

export type EventSeverity = "INFO" | "WARNING" | "CRITICAL";

export type SafetyRecommendation =
  | "CONTINUE_NORMALLY"
  | "INCREASE_MONITORING"
  | "PAUSE_PREDICTIONS"
  | "PAUSE_STRATEGIES"
  | "PAUSE_EXECUTION"
  | "PAUSE_BROKER"
  | "EMERGENCY_STOP";

export interface OperationalLogEvent {
  readonly id: string;
  readonly timestamp: number;
  readonly subsystem: MonitoredSubsystem;
  readonly severity: EventSeverity;
  readonly title: string;
  readonly evidence: string;
  readonly rootCause?: string;
  readonly recommendedAction?: string;
  readonly resolved: boolean;
  readonly resolvedAt?: number;
}

export interface SubsystemHealthDetail {
  readonly score: number; // 0 to 100
  readonly status: "HEALTHY" | "DEGRADED" | "CRITICAL";
  readonly checksPassed: number;
  readonly checksFailed: number;
  readonly lastActiveTimestamp: number;
  readonly evidence: string;
}

export interface SystemHealthState {
  readonly overallScore: number;
  readonly subsystems: Record<MonitoredSubsystem, SubsystemHealthDetail>;
  readonly memory: {
    readonly rssMb: number;
    readonly heapUsedMb: number;
    readonly heapTotalMb: number;
  };
  readonly cpuLoadPct: number;
  readonly diskUsagePct: number;
  readonly timestamp: number;
}

export interface WatchdogState {
  readonly name: string;
  readonly subsystem: MonitoredSubsystem;
  readonly status: "PASS" | "WARN" | "FAIL";
  readonly severity: EventSeverity;
  readonly value: string;
  readonly limit: string;
  readonly lastChecked: number;
}

export interface AnomalyReport {
  readonly id: string;
  readonly timestamp: number;
  readonly title: string;
  readonly subsystem: MonitoredSubsystem;
  readonly description: string;
  readonly metricValue: number;
  readonly threshold: number;
  readonly level: "MINOR" | "MAJOR" | "CRITICAL";
}

export interface DiagnosticMetrics {
  readonly probabilityCalibrationDev: number; // discrepancy between predicted win rate and empirical win rate
  readonly predictionConfidenceAvg: number;
  readonly averageExecutionQuality: number;
  readonly strategyDrawdownMax: number;
  readonly riskViolationCount: number;
  readonly featureReliabilityPct: number;
  readonly lastDiagnosticRun: number;
}
