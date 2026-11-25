import * as fs from "fs";
import * as path from "path";
import { EvaluationReport } from "./mlEvaluationFramework";

export interface MLExperiment {
  experimentId: string;
  timestamp: number;
  datasetId: string;
  datasetVersion: string;
  modelId: string;
  modelVersion: string;
  modelType: string;
  featureVersion: string;
  trainingConfig: {
    pipelineType: string;
    numFolds: number;
  };
  evaluationMetrics: EvaluationReport;
  statisticalComparison: {
    mcnemarPValue: number;
    permutationPValue: number;
    statisticallySignificant: boolean;
    effectSize: number;
    probabilityEngineBrier: number;
    modelBrier: number;
  };
  researchNotes: string;
  conclusions: string;
  status: "ACCEPTED" | "REJECTED" | "PENDING";
}

export class ExperimentTracker {
  private static instance: ExperimentTracker;
  private filePath = path.join(process.cwd(), "data", "ml_experiment_history.json");
  private experiments: MLExperiment[] = [];

  private constructor() {
    this.ensureDirectory();
    this.loadHistory();
  }

  public static getInstance(): ExperimentTracker {
    if (!ExperimentTracker.instance) {
      ExperimentTracker.instance = new ExperimentTracker();
    }
    return ExperimentTracker.instance;
  }

  private ensureDirectory() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private loadHistory() {
    if (!fs.existsSync(this.filePath)) {
      this.experiments = [];
      this.saveHistoryAtomic();
      return;
    }
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      this.experiments = JSON.parse(raw);
    } catch (err) {
      console.error("[EXPERIMENT TRACKER ERROR] Failed to parse experiment history, using empty fallback", err);
      this.experiments = [];
    }
  }

  private saveHistoryAtomic() {
    try {
      const tempPath = `${this.filePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.experiments, null, 2), "utf8");
      fs.renameSync(tempPath, this.filePath);
    } catch (err) {
      console.error("[EXPERIMENT TRACKER ERROR] Failed atomic write:", err);
    }
  }

  /**
   * Logs a new experiment. Crucial rule: nothing may be deleted.
   */
  public logExperiment(exp: MLExperiment): void {
    const exists = this.experiments.some((e) => e.experimentId === exp.experimentId);
    if (exists) {
      throw new Error(`CRITICAL INTEGRITY FAILURE: Experiment ${exp.experimentId} already exists. Overwrites are forbidden.`);
    }

    this.experiments.push(exp);
    this.saveHistoryAtomic();
  }

  /**
   * Update notes or status of an existing experiment (strictly additive updates, no deletion)
   */
  public updateExperimentStatus(
    experimentId: string,
    status: "ACCEPTED" | "REJECTED",
    notes?: string,
    conclusions?: string
  ): void {
    const exp = this.experiments.find((e) => e.experimentId === experimentId);
    if (!exp) {
      throw new Error(`Experiment ${experimentId} not found.`);
    }

    exp.status = status;
    if (notes) exp.researchNotes = `${exp.researchNotes}\n[UPDATE ${new Date().toLocaleString()}]: ${notes}`;
    if (conclusions) exp.conclusions = conclusions;

    this.saveHistoryAtomic();
  }

  public getExperiments(): MLExperiment[] {
    return [...this.experiments];
  }
}

export const mlExperimentTracker = ExperimentTracker.getInstance();
