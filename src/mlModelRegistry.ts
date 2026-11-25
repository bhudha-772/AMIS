import * as fs from "fs";
import * as path from "path";
import { FeatureDefinition } from "./mlFeatureStore";
import { EvaluationReport } from "./mlEvaluationFramework";

export interface RegisteredModel {
  modelId: string;
  version: string;
  type: string; // LINEAR_LOGISTIC, DECISION_TREE, etc.
  trainingDatasetId: string;
  trainingPeriod: { start: number; end: number };
  hyperparameters: Record<string, any>;
  features: string[];
  metrics: EvaluationReport;
  trainingLogs: string[];
  creationDate: number;
  author: string;
  gitCommitHash: string;
}

export class ModelRegistry {
  private static instance: ModelRegistry;
  private filePath = path.join(process.cwd(), "data", "ml_model_registry.json");
  private registry: RegisteredModel[] = [];

  private constructor() {
    this.ensureDirectory();
    this.loadRegistry();
  }

  public static getInstance(): ModelRegistry {
    if (!ModelRegistry.instance) {
      ModelRegistry.instance = new ModelRegistry();
    }
    return ModelRegistry.instance;
  }

  private ensureDirectory() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private loadRegistry() {
    if (!fs.existsSync(this.filePath)) {
      this.registry = [];
      this.saveRegistryAtomic();
      return;
    }
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      this.registry = JSON.parse(raw);
    } catch (err) {
      console.error("[MODEL REGISTRY ERROR] Failed to parse model registry, using empty fallback", err);
      this.registry = [];
    }
  }

  private saveRegistryAtomic() {
    try {
      const tempPath = `${this.filePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.registry, null, 2), "utf8");
      fs.renameSync(tempPath, this.filePath);
    } catch (err) {
      console.error("[MODEL REGISTRY ERROR] Failed atomic write:", err);
    }
  }

  /**
   * Registers a model in the registry. Crucial rule: nothing may be overwritten or deleted.
   */
  public registerModel(model: RegisteredModel): void {
    // Check duplicate
    const exists = this.registry.some(
      (m) => m.modelId === model.modelId && m.version === model.version
    );

    if (exists) {
      throw new Error(`CRITICAL INTEGRITY FAILURE: Model ${model.modelId} with version ${model.version} already exists. Overwrites are forbidden.`);
    }

    this.registry.push(model);
    this.saveRegistryAtomic();
  }

  public getModels(): RegisteredModel[] {
    return [...this.registry];
  }

  public getModel(modelId: string, version: string): RegisteredModel | undefined {
    return this.registry.find((m) => m.modelId === modelId && m.version === version);
  }
}

export const mlModelRegistry = ModelRegistry.getInstance();
