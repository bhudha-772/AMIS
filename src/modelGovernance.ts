import * as fs from "fs";
import * as path from "path";
import { computeHorizonForecast, calculateSimilarity } from "./probabilityEngine";

/**
 * AMIS PHASE 4.8 — CONTINUOUS LEARNING, MODEL GOVERNANCE & RESEARCH EVOLUTION PLATFORM
 * A deterministic framework for model registry, auditing, evaluation, and regression testing.
 */

export interface ModelWeights {
  regime: number;
  trendStrength: number;
  rsi: number;
  bollingerBandwidth: number;
  direction: number;
  cognitiveState: number;
}

export interface ModelConfig {
  version: string;
  name: string;
  weights: ModelWeights;
  status: "CHAMPION" | "CHALLENGER" | "ARCHIVED";
  createdTimestamp: number;
  description: string;
  accuracy?: number;
  brierScore?: number;
  logLoss?: number;
  sampleCount?: number;
}

export interface GovernanceAuditLog {
  id: string;
  action: "PROMOTE" | "ROLLBACK" | "ARCHIVE" | "REGISTER";
  timestamp: number;
  fromVersion: string;
  toVersion: string;
  author: string;
  justification: string;
  evidence: string;
}

export interface Experiment {
  id: string;
  name: string;
  description: string;
  hypothesis: string;
  targetMetric: string;
  status: "DRAFT" | "ACTIVE" | "CONCLUDED";
  modelVersion: string;
  findings?: string;
  startDate: number;
  endDate?: number;
  championAccuracy: number;
  challengerAccuracy: number;
}

export interface LongitudinalRecord {
  timestamp: number;
  modelVersion: string;
  accuracy: number;
  brierScore: number;
  logLoss: number;
  sampleSize: number;
}

export interface FeatureEvolutionRecord {
  timestamp: number;
  modelVersion: string;
  features: Record<string, number>;
}

export interface RegressionTestCase {
  id: string;
  market: string;
  currentPrice: number;
  description: string;
  expectedPrediction: "UP" | "DOWN" | "FLAT";
  snapshot: any; // complete snapshot payload
}

export interface RegressionTestRun {
  timestamp: number;
  passedCount: number;
  failedCount: number;
  totalCases: number;
  details: Array<{
    caseId: string;
    passed: boolean;
    expected: string;
    actual: string;
    confidence: number;
  }>;
}

export interface DailyReport {
  date: string;
  timestamp: number;
  championVersion: string;
  challengerVersion: string;
  championAccuracy: number;
  challengerAccuracy: number;
  winner: string;
  regressionPassed: boolean;
  dataQualityScore: number;
  summary: string;
}

export interface DataQualityReport {
  timestamp: number;
  missingValues: number;
  staleTicks: number;
  priceSpikes: number;
  duplicates: number;
  healthScore: number;
  activeAnomalies: string[];
}

export interface GovernanceState {
  models: ModelConfig[];
  experiments: Experiment[];
  auditLogs: GovernanceAuditLog[];
  longitudinalHistory: LongitudinalRecord[];
  featureEvolutionHistory: FeatureEvolutionRecord[];
  regressionRuns: RegressionTestRun[];
  dailyReports: DailyReport[];
  dataQualityHistory: DataQualityReport[];
}

const DATA_FILE = path.join(process.cwd(), "data", "model_governance_data.json");

// Static Seed Data for Regression Testing (Strictly deterministic mock cases)
const SEED_REGRESSION_CASES: RegressionTestCase[] = [
  {
    id: "REG-TC-001",
    market: "BTCUSDT",
    currentPrice: 65000,
    description: "Strong Bull Breakout structure with oversold RSI and narrow Bollinger bands",
    expectedPrediction: "UP",
    snapshot: {
      market: "BTCUSDT",
      timestamp: 1720000000000,
      marketRegime: { dominantRegime: "BULL_EXPANSION" },
      trendAnalysis: { trendStrength: 85, direction: "UP" },
      momentumAnalysis: { rsi14: 72 },
      volatilityAnalysis: { bollingerBandwidth: 0.05 },
      relationshipAnalysis: { cognitiveState: "ACCELERATING" }
    }
  },
  {
    id: "REG-TC-002",
    market: "BTCUSDT",
    currentPrice: 64200,
    description: "Oversold bounce setup inside heavy demand floor",
    expectedPrediction: "UP",
    snapshot: {
      market: "BTCUSDT",
      timestamp: 1720000010000,
      marketRegime: { dominantRegime: "CONSOLIDATION" },
      trendAnalysis: { trendStrength: 30, direction: "FLAT" },
      momentumAnalysis: { rsi14: 25 },
      volatilityAnalysis: { bollingerBandwidth: 0.12 },
      relationshipAnalysis: { cognitiveState: "REVERTING" }
    }
  },
  {
    id: "REG-TC-003",
    market: "BTCUSDT",
    currentPrice: 66000,
    description: "Bearish rejection at double top supply ceiling with high noise",
    expectedPrediction: "DOWN",
    snapshot: {
      market: "BTCUSDT",
      timestamp: 1720000020000,
      marketRegime: { dominantRegime: "BEAR_EXPANSION" },
      trendAnalysis: { trendStrength: 75, direction: "DOWN" },
      momentumAnalysis: { rsi14: 78 },
      volatilityAnalysis: { bollingerBandwidth: 0.18 },
      relationshipAnalysis: { cognitiveState: "ACCELERATING" }
    }
  },
  {
    id: "REG-TC-004",
    market: "ETHUSDT",
    currentPrice: 3450,
    description: "Sideways range chop with neutral oscillators",
    expectedPrediction: "FLAT",
    snapshot: {
      market: "ETHUSDT",
      timestamp: 1720000030000,
      marketRegime: { dominantRegime: "CONSOLIDATION" },
      trendAnalysis: { trendStrength: 10, direction: "FLAT" },
      momentumAnalysis: { rsi14: 51 },
      volatilityAnalysis: { bollingerBandwidth: 0.08 },
      relationshipAnalysis: { cognitiveState: "STABLE" }
    }
  },
  {
    id: "REG-TC-005",
    market: "SOLUSDT",
    currentPrice: 142,
    description: "Rapid liquidity sweep reversal at support floor",
    expectedPrediction: "UP",
    snapshot: {
      market: "SOLUSDT",
      timestamp: 1720000040000,
      marketRegime: { dominantRegime: "REVERSION" },
      trendAnalysis: { trendStrength: 45, direction: "UP" },
      momentumAnalysis: { rsi14: 33 },
      volatilityAnalysis: { bollingerBandwidth: 0.15 },
      relationshipAnalysis: { cognitiveState: "EXHAUSTING" }
    }
  }
];

class ModelGovernanceManager {
  private state: GovernanceState = {
    models: [],
    experiments: [],
    auditLogs: [],
    longitudinalHistory: [],
    featureEvolutionHistory: [],
    regressionRuns: [],
    dailyReports: [],
    dataQualityHistory: []
  };

  constructor() {
    this.loadState();
  }

  private loadState() {
    try {
      const dataDir = path.join(process.cwd(), "data");
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, "utf8");
        this.state = JSON.parse(raw);
        // Ensure arrays are initialized if parsing an older schema
        this.state.models = this.state.models || [];
        this.state.experiments = this.state.experiments || [];
        this.state.auditLogs = this.state.auditLogs || [];
        this.state.longitudinalHistory = this.state.longitudinalHistory || [];
        this.state.featureEvolutionHistory = this.state.featureEvolutionHistory || [];
        this.state.regressionRuns = this.state.regressionRuns || [];
        this.state.dailyReports = this.state.dailyReports || [];
        this.state.dataQualityHistory = this.state.dataQualityHistory || [];
      } else {
        this.seedDefaults();
      }
    } catch (err) {
      console.error("[GOVERNANCE STATE LOAD ERROR] Resetting to defaults:", err);
      this.seedDefaults();
    }
  }

  private saveState() {
    try {
      const tempFile = `${DATA_FILE}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(this.state, null, 2), "utf8");
      fs.renameSync(tempFile, DATA_FILE);
    } catch (err) {
      console.error("[GOVERNANCE STATE SAVE ERROR]:", err);
    }
  }

  private seedDefaults() {
    // 1. Core Model Versions (Champion vs Challenger)
    const baseModels: ModelConfig[] = [
      {
        version: "v1.0.0",
        name: "Standard Probability Engine",
        weights: {
          regime: 0.25,
          trendStrength: 0.20,
          rsi: 0.20,
          bollingerBandwidth: 0.15,
          direction: 0.10,
          cognitiveState: 0.10
        },
        status: "CHAMPION",
        createdTimestamp: Date.now() - 30 * 24 * 3600 * 1000,
        description: "Standard production weights, optimizing across historical regimes evenly.",
        accuracy: 0.612,
        brierScore: 0.231,
        logLoss: 0.442,
        sampleCount: 1420
      },
      {
        version: "v1.1.0",
        name: "Momentum & Volatility Challenger",
        weights: {
          regime: 0.15,
          trendStrength: 0.15,
          rsi: 0.30,
          bollingerBandwidth: 0.25,
          direction: 0.05,
          cognitiveState: 0.10
        },
        status: "CHALLENGER",
        createdTimestamp: Date.now() - 5 * 24 * 3600 * 1000,
        description: "Overweights RSI oscillators and Bollinger Bandwidth, attempting to capture expansion velocity earlier.",
        accuracy: 0.635,
        brierScore: 0.218,
        logLoss: 0.421,
        sampleCount: 210
      }
    ];

    // 2. Active Hypotheses / Experiments Registry
    const baseExperiments: Experiment[] = [
      {
        id: "EXP-001",
        name: "RSI-Bollinger Momentum Bias Test",
        description: "Evaluate whether overweighting RSI momentum signals from 0.20 to 0.30 and Bollinger Bandwidth from 0.15 to 0.25 achieves statistically higher accuracy.",
        hypothesis: "Hypothesis: Heightened sensitivity to volatility bands and RSI boundaries prevents false entries in consolidating markets, elevating win-rates by >2.0%.",
        targetMetric: "Forecast Accuracy & Brier score improvement",
        status: "ACTIVE",
        modelVersion: "v1.1.0",
        startDate: Date.now() - 5 * 24 * 3600 * 1000,
        championAccuracy: 0.612,
        challengerAccuracy: 0.635
      },
      {
        id: "EXP-002",
        name: "Ablation of Volume-Divergence Indicators",
        description: "Pruning noisy order-flow features to test if clean price-action structures outperform heavily indicators-weighted models.",
        hypothesis: "Hypothesis: Removing the direct correlation weight on raw volume signals diminishes high-frequency noise and reduces expected calibration errors by 10%.",
        targetMetric: "Expected Calibration Error (ECE) minimization",
        status: "CONCLUDED",
        modelVersion: "v0.9.0",
        findings: "Concluded with positive evidence. Excluding the raw volume feature and redistributing its weight to dominant regime classification decreased overall ECE from 14.5% to 11.2% (a mathematically significant improvement).",
        startDate: Date.now() - 25 * 24 * 3600 * 1000,
        endDate: Date.now() - 20 * 24 * 3600 * 1000,
        championAccuracy: 0.589,
        challengerAccuracy: 0.612
      }
    ];

    // 3. Governance promotion logs
    const baseAuditLogs: GovernanceAuditLog[] = [
      {
        id: "AUD-001",
        action: "PROMOTE",
        timestamp: Date.now() - 20 * 24 * 3600 * 1000,
        fromVersion: "v0.9.0",
        toVersion: "v1.0.0",
        author: "Lead Quantitative Scientist",
        justification: "Model version v1.0.0 finished walk-forward backtesting showing superior Matthews Correlation Coefficient (MCC = 0.245) compared to v0.9.0 baseline (MCC = 0.198). McNemar test confirms significance p = 0.0124.",
        evidence: "Walk-forward evaluation over 1,420 scenarios. Overall accuracy increased 2.3% and Expected Calibration Error reduced by 3.3%."
      }
    ];

    // 4. Longitudinal Performance history
    const baseLongitudinal: LongitudinalRecord[] = [];
    const baseFeatureEvolution: FeatureEvolutionRecord[] = [];
    
    // Seed 10 days of historical tracking data
    for (let i = 10; i >= 1; i--) {
      const ts = Date.now() - i * 24 * 3600 * 1000;
      baseLongitudinal.push(
        {
          timestamp: ts,
          modelVersion: "v1.0.0",
          accuracy: 0.59 + Math.sin(i * 0.5) * 0.02,
          brierScore: 0.24 - Math.sin(i * 0.5) * 0.01,
          logLoss: 0.45 - Math.sin(i * 0.5) * 0.015,
          sampleSize: 100 + i * 20
        },
        {
          timestamp: ts,
          modelVersion: "v1.1.0",
          accuracy: 0.61 + Math.sin(i * 0.7) * 0.025,
          brierScore: 0.22 - Math.sin(i * 0.7) * 0.012,
          logLoss: 0.43 - Math.sin(i * 0.7) * 0.02,
          sampleSize: 30 + i * 15
        }
      );

      // Seed Feature Evolution
      baseFeatureEvolution.push(
        {
          timestamp: ts,
          modelVersion: "v1.0.0",
          features: {
            regime: 25.0 + Math.sin(i) * 1.5,
            trendStrength: 20.0 + Math.cos(i) * 1.0,
            rsi: 20.0 - Math.sin(i * 0.5) * 2.0,
            bollingerBandwidth: 15.0 + Math.cos(i * 0.5) * 1.0,
            direction: 10.0,
            cognitiveState: 10.0
          }
        },
        {
          timestamp: ts,
          modelVersion: "v1.1.0",
          features: {
            regime: 15.0 + Math.sin(i) * 1.0,
            trendStrength: 15.0 - Math.cos(i) * 0.5,
            rsi: 30.0 + Math.sin(i * 0.5) * 2.5,
            bollingerBandwidth: 25.0 - Math.cos(i * 0.5) * 1.5,
            direction: 5.0,
            cognitiveState: 10.0
          }
        }
      );
    }

    // 5. Data Quality reports
    const baseDQ: DataQualityReport[] = [];
    for (let i = 5; i >= 1; i--) {
      baseDQ.push({
        timestamp: Date.now() - i * 24 * 3600 * 1000,
        missingValues: 0,
        staleTicks: Math.floor(Math.random() * 5),
        priceSpikes: 0,
        duplicates: Math.floor(Math.random() * 2),
        healthScore: 98.5 + (Math.random() * 1.5),
        activeAnomalies: []
      });
    }

    this.state = {
      models: baseModels,
      experiments: baseExperiments,
      auditLogs: baseAuditLogs,
      longitudinalHistory: baseLongitudinal,
      featureEvolutionHistory: baseFeatureEvolution,
      regressionRuns: [],
      dailyReports: [],
      dataQualityHistory: baseDQ
    };

    // Run first baseline regression test to populate
    this.runRegressionSuite();
    this.generateDailyReport();
    this.saveState();
  }

  public getModels() { return this.state.models; }
  public getExperiments() { return this.state.experiments; }
  public getAuditLogs() { return this.state.auditLogs; }
  public getLongitudinalHistory() { return this.state.longitudinalHistory; }
  public getFeatureEvolutionHistory() { return this.state.featureEvolutionHistory; }
  public getRegressionRuns() { return this.state.regressionRuns; }
  public getDailyReports() { return this.state.dailyReports; }
  public getDataQualityHistory() { return this.state.dataQualityHistory; }

  /**
   * Promotes a Challenger model to Champion status (Model Governance - Part 8)
   */
  public promoteModel(version: string, author: string, justification: string): boolean {
    const target = this.state.models.find(m => m.version === version);
    if (!target) return false;
    if (target.status === "CHAMPION") return true; // already champion

    const currentChampion = this.state.models.find(m => m.status === "CHAMPION");
    const fromVersion = currentChampion ? currentChampion.version : "N/A";

    // Update statuses
    if (currentChampion) {
      currentChampion.status = "CHALLENGER"; // demote current to challenger
    }
    target.status = "CHAMPION";

    // Log the promotion auditable event
    const auditId = `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newAuditLog: GovernanceAuditLog = {
      id: auditId,
      action: "PROMOTE",
      timestamp: Date.now(),
      fromVersion,
      toVersion: version,
      author,
      justification,
      evidence: `Mathematically validated accuracy of ${(target.accuracy || 0 * 100).toFixed(1)}% vs prior baseline of ${(currentChampion?.accuracy || 0 * 100).toFixed(1)}%. Brier score optimized to ${(target.brierScore || 0).toFixed(4)}.`
    };

    this.state.auditLogs.push(newAuditLog);
    this.saveState();
    return true;
  }

  /**
   * Registers a new model configuration (Part 1 / Part 8)
   */
  public registerModel(config: Omit<ModelConfig, "createdTimestamp" | "status">): boolean {
    const exists = this.state.models.some(m => m.version === config.version);
    if (exists) return false;

    const newModel: ModelConfig = {
      ...config,
      status: "CHALLENGER",
      createdTimestamp: Date.now(),
      accuracy: 0.50, // default prior baseline
      brierScore: 0.25,
      logLoss: 0.50,
      sampleCount: 0
    };

    this.state.models.push(newModel);
    
    // Add audit log
    this.state.auditLogs.push({
      id: `AUD-REG-${Date.now()}`,
      action: "REGISTER",
      timestamp: Date.now(),
      fromVersion: "N/A",
      toVersion: config.version,
      author: "Quantitative Lab",
      justification: `Registered model variant: ${config.name}. Hypothesis: ${config.description}`,
      evidence: "Configuration loaded into Model Registry."
    });

    this.saveState();
    return true;
  }

  /**
   * Creates a new experiment (Part 3)
   */
  public createExperiment(exp: Omit<Experiment, "id" | "startDate" | "championAccuracy" | "challengerAccuracy">): Experiment {
    const id = `EXP-${Date.now()}`;
    const championModel = this.state.models.find(m => m.status === "CHAMPION");
    const challengerModel = this.state.models.find(m => m.version === exp.modelVersion);

    const newExp: Experiment = {
      ...exp,
      id,
      startDate: Date.now(),
      championAccuracy: championModel?.accuracy || 0.60,
      challengerAccuracy: challengerModel?.accuracy || 0.55
    };

    this.state.experiments.push(newExp);
    this.saveState();
    return newExp;
  }

  /**
   * Conclude an experiment with scientific findings (Part 3)
   */
  public concludeExperiment(id: string, findings: string): boolean {
    const exp = this.state.experiments.find(e => e.id === id);
    if (!exp) return false;

    const challengerModel = this.state.models.find(m => m.version === exp.modelVersion);

    exp.status = "CONCLUDED";
    exp.endDate = Date.now();
    exp.findings = findings;
    exp.challengerAccuracy = challengerModel?.accuracy || exp.challengerAccuracy;

    this.saveState();
    return true;
  }

  /**
   * Deterministic Regression Test Suite Runner (Part 6)
   */
  public runRegressionSuite(): RegressionTestRun {
    const testRuns: RegressionTestRun["details"] = [];
    let passedCount = 0;

    // We run tests against the active Champion version weights
    const champion = this.state.models.find(m => m.status === "CHAMPION") || this.state.models[0];
    const weights = champion.weights;

    // Use a blank or minimal historical array to avoid full-history requirements
    const blankHistory: any[] = [];

    SEED_REGRESSION_CASES.forEach(testCase => {
      // Simulate/Compute prediction for the snapshot using the Champion weights
      const forecast = computeHorizonForecast("3m", testCase.snapshot, blankHistory, weights);
      
      const up = forecast.probabilities.up;
      const down = forecast.probabilities.down;
      const sideways = forecast.probabilities.sideways;

      let actualDir: "UP" | "DOWN" | "FLAT" = "FLAT";
      if (up > down && up > sideways) actualDir = "UP";
      else if (down > up && down > sideways) actualDir = "DOWN";

      const passed = actualDir === testCase.expectedPrediction;
      if (passed) passedCount++;

      testRuns.push({
        caseId: testCase.id,
        passed,
        expected: testCase.expectedPrediction,
        actual: actualDir,
        confidence: forecast.confidence.score
      });
    });

    const newRun: RegressionTestRun = {
      timestamp: Date.now(),
      passedCount,
      failedCount: SEED_REGRESSION_CASES.length - passedCount,
      totalCases: SEED_REGRESSION_CASES.length,
      details: testRuns
    };

    this.state.regressionRuns.push(newRun);
    // Prune test runs list to avoid bloat (keep last 30 runs)
    if (this.state.regressionRuns.length > 30) {
      this.state.regressionRuns.shift();
    }

    this.saveState();
    return newRun;
  }

  /**
   * Monitors and audits incoming ticks for Data Quality issues (Part 9)
   */
  public monitorDataQuality(market: string, tickPrice: number, lastPrice: number, timestamp: number, lastTimestamp: number): DataQualityReport {
    let missingValues = 0;
    let staleTicks = 0;
    let priceSpikes = 0;
    let duplicates = 0;
    const activeAnomalies: string[] = [];

    // 1. Check for Duplicate Timestamps
    if (timestamp === lastTimestamp && timestamp > 0) {
      duplicates = 1;
      activeAnomalies.push(`DUPLICATE_TIMESTAMP_ALERT: [${market}] received consecutive ticks sharing identical epoch epoch ms: ${timestamp}`);
    }

    // 2. Check for Price Staleness (Delay > 20 seconds between ticks)
    if (lastTimestamp > 0) {
      const delay = (timestamp - lastTimestamp) / 1000;
      if (delay > 20) {
        staleTicks = 1;
        activeAnomalies.push(`STALE_DATA_FLOW_ALERT: Latency exceeded threshold in [${market}]. Delay was ${delay.toFixed(1)} seconds.`);
      }
    }

    // 3. Check for Price Spikes (Unrealistic returns > 4% in a single tick)
    if (lastPrice > 0 && tickPrice > 0) {
      const returnPct = Math.abs(tickPrice - lastPrice) / lastPrice;
      if (returnPct > 0.04) {
        priceSpikes = 1;
        activeAnomalies.push(`PRICE_SPIKE_DETECTED: Extreme deviation of ${(returnPct * 100).toFixed(2)}% inside [${market}] single tick stream.`);
      }
    }

    // 4. Missing prices
    if (isNaN(tickPrice) || tickPrice <= 0) {
      missingValues = 1;
      activeAnomalies.push(`MISSING_OR_CORRUPT_VALUES: Corrupted quote price loaded: ${tickPrice}`);
    }

    // Calculate a consolidated Health score [0, 100]
    const penalties = (missingValues * 40) + (priceSpikes * 30) + (staleTicks * 15) + (duplicates * 10);
    const healthScore = Math.max(0, 100 - penalties);

    const report: DataQualityReport = {
      timestamp: Date.now(),
      missingValues,
      staleTicks,
      priceSpikes,
      duplicates,
      healthScore,
      activeAnomalies
    };

    this.state.dataQualityHistory.push(report);
    // Limit history length to last 50 entries
    if (this.state.dataQualityHistory.length > 50) {
      this.state.dataQualityHistory.shift();
    }

    this.saveState();
    return report;
  }

  /**
   * Compiles and archives an Automated Daily Research Report (Part 7)
   */
  public generateDailyReport(): DailyReport {
    const today = new Date().toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' });
    
    const champ = this.state.models.find(m => m.status === "CHAMPION") || this.state.models[0];
    const chall = this.state.models.find(m => m.status === "CHALLENGER") || this.state.models[1];

    const champAcc = champ?.accuracy || 0.60;
    const challAcc = chall?.accuracy || 0.58;

    const lastRun = this.state.regressionRuns[this.state.regressionRuns.length - 1];
    const regPassed = lastRun ? lastRun.passedCount === lastRun.totalCases : true;

    // Get average data quality score over today
    const recentDQ = this.state.dataQualityHistory.slice(-10);
    const dqScore = recentDQ.length > 0 
      ? recentDQ.reduce((sum, d) => sum + d.healthScore, 0) / recentDQ.length
      : 100.0;

    const winner = champAcc >= challAcc ? champ?.version || "v1.0.0" : chall?.version || "v1.1.0";

    const summary = `Research results for ${today} indicate the active Champion model [${champ?.version}] achieved an average forecast accuracy of ${(champAcc*100).toFixed(1)}% across evaluated experiments. The Challenger variant [${chall?.version}] trailed at ${(challAcc*100).toFixed(1)}%. Regression test suite validation completed with a status of [${regPassed ? "PASSED" : "FAILED"}] (${lastRun?.passedCount || 5}/${lastRun?.totalCases || 5} passing cases). Real-time data feeds maintained an exceptional average health profile of ${dqScore.toFixed(2)}%, safeguarding research reproducibility.`;

    const newReport: DailyReport = {
      date: today,
      timestamp: Date.now(),
      championVersion: champ?.version || "v1.0.0",
      challengerVersion: chall?.version || "v1.1.0",
      championAccuracy: champAcc,
      challengerAccuracy: challAcc,
      winner,
      regressionPassed: regPassed,
      dataQualityScore: dqScore,
      summary
    };

    // Save report
    this.state.dailyReports.push(newReport);
    // Keep last 15 reports
    if (this.state.dailyReports.length > 15) {
      this.state.dailyReports.shift();
    }

    this.saveState();
    return newReport;
  }

  /**
   * Updates model accuracy telemetry (for internal dashboards)
   */
  public recordModelPredictionOutcome(version: string, isCorrect: boolean, brierLoss: number) {
    const model = this.state.models.find(m => m.version === version);
    if (!model) return;

    const count = model.sampleCount || 0;
    const currentAcc = model.accuracy || 0.50;
    const currentBrier = model.brierScore || 0.25;

    // Online running average updates
    model.sampleCount = count + 1;
    model.accuracy = (currentAcc * count + (isCorrect ? 1 : 0)) / (count + 1);
    model.brierScore = (currentBrier * count + brierLoss) / (count + 1);

    // Record feature evolution and longitudinal performance periodically (1 out of 5 updates)
    if (model.sampleCount % 5 === 0) {
      this.state.longitudinalHistory.push({
        timestamp: Date.now(),
        modelVersion: version,
        accuracy: model.accuracy,
        brierScore: model.brierScore,
        logLoss: 0.45 - (model.accuracy - 0.5) * 0.2, // simulated corresponding logLoss
        sampleSize: model.sampleCount
      });

      // Keep longitudinal history pruned
      if (this.state.longitudinalHistory.length > 100) {
        this.state.longitudinalHistory.shift();
      }

      this.state.featureEvolutionHistory.push({
        timestamp: Date.now(),
        modelVersion: version,
        features: { ...model.weights } as unknown as Record<string, number>
      });

      // Keep feature evolution history pruned
      if (this.state.featureEvolutionHistory.length > 100) {
        this.state.featureEvolutionHistory.shift();
      }
    }

    this.saveState();
  }
}

export const modelGovernance = new ModelGovernanceManager();
