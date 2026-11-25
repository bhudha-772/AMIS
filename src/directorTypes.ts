export type ResearchStatus = "BACKLOG" | "HYPOTHESIS_FORMULATED" | "EXPERIMENT_DESIGNED" | "EXPERIMENT_ACTIVE" | "COMPLETED" | "REJECTED";
export type ExperimentPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type RecommendationSeverity = "INFO" | "WARNING" | "CRITICAL";

export interface GlobalPerformanceMetrics {
  timestamp: number;
  // Part 1 Metric Streams
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  rocAuc: number;
  logLoss: number;
  brierScore: number;
  ece: number; // Expected Calibration Error
  profitFactor: number;
  sharpe: number;
  sortino: number;
  maxDrawdown: number;
  expectedValue: number;
  latencyMs: number;
  predictionThroughputSec: number;
  executionQuality: number;
  systemHealthScore: number;
  featureStability: number;
  calibrationStability: number;
  historicalSimilarityReliability: number;
}

export interface RootCauseFactor {
  factor: string;
  probability: number; // 0 - 1
  evidence: string;
  technicalMetric: string;
}

export interface RootCauseAnalysisResult {
  timestamp: number;
  degradedSubsystem: string;
  detectedIssue: string;
  identifiedFactors: RootCauseFactor[];
  reconstructionLog: string[];
}

export interface ResearchHypothesis {
  id: string;
  title: string;
  description: string;
  evidence: string;
  supportingStatistics: {
    pvalue: number;
    sampleCount: number;
    correlation: number;
  };
  confidence: number; // 0.0 - 1.0
  requiredExperiment: string;
  status: ResearchStatus;
  timestamp: number;
}

export interface ExperimentPlan {
  id: string;
  title: string;
  objective: string;
  requiredDatasets: string[];
  requiredSampleSize: number;
  independentVariables: string[];
  dependentVariables: string[];
  successCriteria: string;
  failureCriteria: string;
  estimatedDurationDays: number;
  dependencies: string[];
  priority: ExperimentPriority;
  status: "DRAFT" | "READY" | "RUNNING" | "EVALUATED" | "ARCHIVED";
  timestamp: number;
}

export interface SubsystemScorecard {
  name: string;
  correctness: number; // 0 - 100
  completeness: number; // 0 - 100
  reliability: number; // 0 - 100
  maintainability: number; // 0 - 100
  scalability: number; // 0 - 100
  researchReadiness: number; // 0 - 100
  autonomyReadiness: number; // 0 - 100
  documentation: number; // 0 - 100
  testingCoverage: number; // 0 - 100
  technicalDebt: number; // 0 - 100 (lower is better, but here we can represent a final combined index)
}

export interface ResearchRecommendation {
  id: string;
  problem: string;
  evidence: string;
  severity: RecommendationSeverity;
  affectedSubsystem: string;
  suggestedCorrection: string;
  expectedBenefit: string;
  estimatedImplementationEffortHours: number;
  priority: ExperimentPriority;
  resolved: boolean;
  timestamp: number;
}

export interface HistoricalEvolutionRecord {
  weekKey: string; // e.g. "Week 1", "Week 2"
  overallSystemHealth: number;
  profitFactor: number;
  sharpeRatio: number;
  calibrationStability: number;
  activeModelsCount: number;
  executionQuality: number;
  milestones: string[];
}

export interface ExecutiveResearchState {
  scorecards: SubsystemScorecard[];
  hypotheses: ResearchHypothesis[];
  experiments: ExperimentPlan[];
  recommendations: ResearchRecommendation[];
  evolutionHistory: HistoricalEvolutionRecord[];
}
