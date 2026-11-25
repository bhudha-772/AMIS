import * as fs from "fs";
import * as path from "path";
import {
  ResearchHypothesis,
  ExperimentPlan,
  ResearchRecommendation,
  HistoricalEvolutionRecord,
  SubsystemScorecard,
  ExecutiveResearchState
} from "./directorTypes";

const DIRECTOR_FILE = path.join(process.cwd(), "data", "research_director_ledger.json");

export class DirectorLedger {
  private static instance: DirectorLedger;

  private scorecards: SubsystemScorecard[] = [];
  private hypotheses: ResearchHypothesis[] = [];
  private experiments: ExperimentPlan[] = [];
  private recommendations: ResearchRecommendation[] = [];
  private evolutionHistory: HistoricalEvolutionRecord[] = [];

  public static getInstance(): DirectorLedger {
    if (!this.instance) {
      this.instance = new DirectorLedger();
    }
    return this.instance;
  }

  private constructor() {
    this.loadState();
  }

  /**
   * Loads state from disk, or seeds with rigorous default scientific values.
   */
  private loadState() {
    try {
      const dir = path.dirname(DIRECTOR_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(DIRECTOR_FILE)) {
        const raw = fs.readFileSync(DIRECTOR_FILE, "utf8");
        const parsed: ExecutiveResearchState = JSON.parse(raw);
        this.scorecards = parsed.scorecards || [];
        this.hypotheses = parsed.hypotheses || [];
        this.experiments = parsed.experiments || [];
        this.recommendations = parsed.recommendations || [];
        this.evolutionHistory = parsed.evolutionHistory || [];
      } else {
        this.seedInitialState();
      }
    } catch (err) {
      console.error("[Research Director Ledger] Error reading state from disk, loading defaults:", err);
      this.seedInitialState();
    }
  }

  /**
   * Atomically saves the state to disk.
   */
  public saveState() {
    try {
      const dir = path.dirname(DIRECTOR_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const state: ExecutiveResearchState = {
        scorecards: this.scorecards,
        hypotheses: this.hypotheses,
        experiments: this.experiments,
        recommendations: this.recommendations,
        evolutionHistory: this.evolutionHistory
      };

      const temp = `${DIRECTOR_FILE}.tmp`;
      fs.writeFileSync(temp, JSON.stringify(state, null, 2), "utf8");
      fs.renameSync(temp, DIRECTOR_FILE);
    } catch (err) {
      console.error("[Research Director Ledger] Failed to save state atomically:", err);
    }
  }

  /**
   * Resets the entire ledger (exclusively for sandbox testing).
   */
  public clearState() {
    this.seedInitialState();
    this.saveState();
  }

  private seedInitialState() {
    // Part 6 Subsystem Scorecard Seeds
    this.scorecards = [
      {
        name: "Probability Engine",
        correctness: 94,
        completeness: 92,
        reliability: 95,
        maintainability: 90,
        scalability: 88,
        researchReadiness: 96,
        autonomyReadiness: 92,
        documentation: 85,
        testingCoverage: 91,
        technicalDebt: 18
      },
      {
        name: "Machine Learning",
        correctness: 90,
        completeness: 88,
        reliability: 92,
        maintainability: 86,
        scalability: 84,
        researchReadiness: 94,
        autonomyReadiness: 88,
        documentation: 80,
        testingCoverage: 85,
        technicalDebt: 24
      },
      {
        name: "Strategy Research",
        correctness: 88,
        completeness: 85,
        reliability: 89,
        maintainability: 80,
        scalability: 82,
        researchReadiness: 90,
        autonomyReadiness: 85,
        documentation: 78,
        testingCoverage: 76,
        technicalDebt: 32
      },
      {
        name: "Decision Intelligence",
        correctness: 91,
        completeness: 90,
        reliability: 93,
        maintainability: 88,
        scalability: 86,
        researchReadiness: 92,
        autonomyReadiness: 90,
        documentation: 82,
        testingCoverage: 88,
        technicalDebt: 20
      },
      {
        name: "Risk Intelligence",
        correctness: 96,
        completeness: 94,
        reliability: 97,
        maintainability: 92,
        scalability: 90,
        researchReadiness: 95,
        autonomyReadiness: 96,
        documentation: 90,
        testingCoverage: 95,
        technicalDebt: 12
      },
      {
        name: "Execution Laboratory",
        correctness: 85,
        completeness: 80,
        reliability: 84,
        maintainability: 75,
        scalability: 78,
        researchReadiness: 82,
        autonomyReadiness: 80,
        documentation: 70,
        testingCoverage: 65,
        technicalDebt: 45 // Highest technical debt (weakest)
      },
      {
        name: "Operational Supervisor",
        correctness: 98, // Strongest subsystem
        completeness: 96,
        reliability: 98,
        maintainability: 95,
        scalability: 92,
        researchReadiness: 98,
        autonomyReadiness: 98,
        documentation: 92,
        testingCoverage: 98,
        technicalDebt: 8
      }
    ];

    // Part 3 Hypotheses Seeds
    this.hypotheses = [
      {
        id: "HYP-001",
        title: "RSI unreliability during peak regime volatility",
        description: "Relative Strength Index signals produce elevated false breakout rates during periods where average true range (ATR) expands beyond the 90th percentile.",
        evidence: "High false breakout rates observed in BTC backtests during microsecond slippage expansions.",
        supportingStatistics: { pvalue: 0.012, sampleCount: 1450, correlation: -0.42 },
        confidence: 0.85,
        requiredExperiment: "EXP-001: Multi-regime ATR-conditioned RSI threshold dynamic calibration",
        status: "EXPERIMENT_DESIGNED",
        timestamp: Date.now() - 3600000 * 24 * 3
      },
      {
        id: "HYP-002",
        title: "Trend Strength (ADX) predictive decay in range channels",
        description: "ADX indicators exhibit a critical delay of 4-6 bars when transitioning from trending to high-frequency ranging channels, yielding lagging execution entries.",
        evidence: "Historical Similarity engine reports lower cosine similarity indexes during range contractions.",
        supportingStatistics: { pvalue: 0.024, sampleCount: 890, correlation: -0.38 },
        confidence: 0.78,
        requiredExperiment: "EXP-002: Dynamic ADX weighting using standard deviation filters",
        status: "HYPOTHESIS_FORMULATED",
        timestamp: Date.now() - 3600000 * 24 * 5
      },
      {
        id: "HYP-003",
        title: "Historical Similarity model collapse during rapid tail expansions",
        description: "Standard Euclidean distance metric in Historical Similarity matches historical regimes that suffer from catastrophic slippage under flash expansions.",
        evidence: "Severe slippage (>0.05%) matches historic crash events, failing prediction calibration.",
        supportingStatistics: { pvalue: 0.004, sampleCount: 520, correlation: -0.55 },
        confidence: 0.92,
        requiredExperiment: "EXP-003: Mahalanobis distance metric substitution for regime correlation matrices",
        status: "EXPERIMENT_ACTIVE",
        timestamp: Date.now() - 3600000 * 24 * 1
      }
    ];

    // Part 4 Experiment Seeds
    this.experiments = [
      {
        id: "EXP-001",
        title: "Multi-regime ATR-conditioned RSI threshold dynamic calibration",
        objective: "Establish dynamic, ATR-conditioned RSI trading bands (e.g. 80/20 instead of 70/30) during high volatility to reduce false breakout signals by >= 35%.",
        requiredDatasets: ["BTCUSDT-M1-L2-Ticks", "ETHUSDT-M1-L2-Ticks"],
        requiredSampleSize: 25000,
        independentVariables: ["ATR Percentile Thresholds", "RSI Lookback Window"],
        dependentVariables: ["False Positive Breakout Rate", "Execution Slippage %"],
        successCriteria: "False breakout signals drop by >= 35% with a confidence interval of p < 0.01.",
        failureCriteria: "Average returns decay due to high signal omission or late entries.",
        estimatedDurationDays: 7,
        dependencies: ["Probability Engine Calibration Core"],
        priority: "HIGH",
        status: "READY",
        timestamp: Date.now() - 3600000 * 24 * 2
      },
      {
        id: "EXP-002",
        title: "Dynamic ADX weighting using standard deviation filters",
        objective: "Assess if dynamic ADX dampening using a Bollinger Band width filter reduces range whipsaw entries by 15%.",
        requiredDatasets: ["USDT-Pairs-Range-Regimes"],
        requiredSampleSize: 12000,
        independentVariables: ["BB Width Filter Factor", "ADX Period"],
        dependentVariables: ["Whipsaw Trade Rate", "Profit Factor Score"],
        successCriteria: "Whipsaw trades reduce by 15% and Profit Factor improves by >= 0.15.",
        failureCriteria: "Lag in trend entry increases by more than 2 bars.",
        estimatedDurationDays: 5,
        dependencies: ["Strategy Research Laboratory Pipeline"],
        priority: "MEDIUM",
        status: "DRAFT",
        timestamp: Date.now() - 3600000 * 24 * 4
      },
      {
        id: "EXP-003",
        title: "Mahalanobis distance metric substitution for regime correlation matrices",
        objective: "Replace Euclidean distance with Mahalanobis distance in the Historical Similarity Engine to evaluate correlation of multidimensional risk parameters.",
        requiredDatasets: ["Flash-Crash-History-2022-2026", "L2-Slippage-Anomalies"],
        requiredSampleSize: 8000,
        independentVariables: ["Distance Covariance Estimator", "Feature Dimensions"],
        dependentVariables: ["Calibration Stability Index", "Brier Score Error"],
        successCriteria: "Calibration stability improves by 20% and expected calibration error (ECE) falls below 0.03.",
        failureCriteria: "Calculation latency exceeds 15ms per tick lookup.",
        estimatedDurationDays: 10,
        dependencies: ["Machine Learning Framework", "Probability Engine"],
        priority: "CRITICAL",
        status: "RUNNING",
        timestamp: Date.now() - 3600000 * 12
      }
    ];

    // Part 7 Recommendations Seeds
    this.recommendations = [
      {
        id: "REC-001",
        problem: "Catastrophic execution degradation under high network latency",
        evidence: "Execution Laboratory reports quality decay to 58.4% and slippage expanding to 5.2% during flash-crash simulation tests.",
        severity: "CRITICAL",
        affectedSubsystem: "Execution Laboratory",
        suggestedCorrection: "Implement client-side predictive slippage adjustments and transition network handlers to binary WebSockets.",
        expectedBenefit: "Restores execution quality to >= 92% and reduces slippage to < 0.5% during tail events.",
        estimatedImplementationEffortHours: 36,
        priority: "CRITICAL",
        resolved: false,
        timestamp: Date.now() - 3600000 * 2
      },
      {
        id: "REC-002",
        problem: "Probability model calibration decay over 24-hour windows",
        evidence: "Empirical discrepancy between predicted probabilities and historical outcomes expands from 1.5% to 4.8% without daily recalibration.",
        severity: "WARNING",
        affectedSubsystem: "Probability Engine",
        suggestedCorrection: "Schedule an automated cron pipeline to recalibrate Bayesian prior probability distributions daily.",
        expectedBenefit: "Preserves Expected Calibration Error (ECE) < 0.02 stably over months.",
        estimatedImplementationEffortHours: 12,
        priority: "HIGH",
        resolved: false,
        timestamp: Date.now() - 3600000 * 6
      },
      {
        id: "REC-003",
        problem: "Machine learning model overfitting on high-frequency noise",
        evidence: "F1 Score drops from 0.84 to 0.59 when transitioning from backtest to paper trading simulations due to excessive indicator features.",
        severity: "WARNING",
        affectedSubsystem: "Machine Learning",
        suggestedCorrection: "Introduce L1 regularization penalty (Lasso) and drop correlated indicator features to focus on robust ATR variables.",
        expectedBenefit: "Improves out-of-sample prediction stability and generalizability.",
        estimatedImplementationEffortHours: 16,
        priority: "MEDIUM",
        resolved: true,
        timestamp: Date.now() - 3600000 * 24 * 2
      }
    ];

    // Part 8 Long-Term Evolution Tracker Seeds
    this.evolutionHistory = [
      {
        weekKey: "Month 1 (Base)",
        overallSystemHealth: 82,
        profitFactor: 1.45,
        sharpeRatio: 1.38,
        calibrationStability: 84.5,
        activeModelsCount: 2,
        executionQuality: 80.2,
        milestones: [
          "Beta release of AMIS trading platform.",
          "Integration of multi-horizon Probability Engine.",
          "Initialization of microsecond execution sandbox."
        ]
      },
      {
        weekKey: "Month 2 (Optimized)",
        overallSystemHealth: 88,
        profitFactor: 1.62,
        sharpeRatio: 1.65,
        calibrationStability: 89.2,
        activeModelsCount: 4,
        executionQuality: 86.4,
        milestones: [
          "Enhanced Feature Engineering pipeline deployed.",
          "Integrated Risk Intelligence margin bounds check.",
          "Reduced database query overhead by 45%."
        ]
      },
      {
        weekKey: "Month 3 (Active)",
        overallSystemHealth: 93,
        profitFactor: 1.88,
        sharpeRatio: 1.95,
        calibrationStability: 94.8,
        activeModelsCount: 6,
        executionQuality: 93.8,
        milestones: [
          "Autonomous Research Director (Phase 10) integrated.",
          "Dynamic ATR-conditioned volatility models promoted.",
          "Secured 100% deterministic test coverage on core models."
        ]
      }
    ];
  }

  // State mutation operations
  public getScorecards(): SubsystemScorecard[] {
    return this.scorecards;
  }

  public getHypotheses(): ResearchHypothesis[] {
    return this.hypotheses;
  }

  public getExperiments(): ExperimentPlan[] {
    return this.experiments;
  }

  public getRecommendations(): ResearchRecommendation[] {
    return this.recommendations;
  }

  public getEvolutionHistory(): HistoricalEvolutionRecord[] {
    return this.evolutionHistory;
  }

  public addHypothesis(hyp: ResearchHypothesis) {
    this.hypotheses = [hyp, ...this.hypotheses];
    this.saveState();
  }

  public addExperiment(exp: ExperimentPlan) {
    this.experiments = [exp, ...this.experiments];
    this.saveState();
  }

  public addRecommendation(rec: ResearchRecommendation) {
    this.recommendations = [rec, ...this.recommendations];
    this.saveState();
  }

  public resolveRecommendation(id: string): boolean {
    const idx = this.recommendations.findIndex(r => r.id === id);
    if (idx === -1) return false;
    this.recommendations[idx].resolved = true;
    this.saveState();
    return true;
  }

  public updateExperimentStatus(id: string, status: any): boolean {
    const idx = this.experiments.findIndex(e => e.id === id);
    if (idx === -1) return false;
    this.experiments[idx].status = status;
    this.saveState();
    return true;
  }

  public updateHypothesisStatus(id: string, status: any): boolean {
    const idx = this.hypotheses.findIndex(h => h.id === id);
    if (idx === -1) return false;
    this.hypotheses[idx].status = status;
    this.saveState();
    return true;
  }
}

export const directorLedger = DirectorLedger.getInstance();
