import { MLEstimator } from "./mlEstimators";
import { mlEvaluationFramework, EvaluationReport } from "./mlEvaluationFramework";

export interface TimeSeriesSplit {
  trainIndices: number[];
  testIndices: number[];
}

export interface TrainingProgressEvent {
  epoch: number;
  trainLoss: number;
  valLoss: number;
}

export interface ValidationFoldReport {
  foldIdx: number;
  trainRange: { startIdx: number; endIdx: number };
  testRange: { startIdx: number; endIdx: number };
  metrics: EvaluationReport;
}

export interface TrainingPipelineReport {
  pipelineType: "WALK_FORWARD" | "EXPANDING_WINDOW" | "ROLLING_WINDOW" | "CHRONOLOGICAL_SPLIT";
  numFolds: number;
  aggregateMetrics: EvaluationReport;
  foldReports: ValidationFoldReport[];
  trainingLogs: string[];
}

export class MLTrainingPipeline {
  private static instance: MLTrainingPipeline;

  private constructor() {}

  public static getInstance(): MLTrainingPipeline {
    if (!MLTrainingPipeline.instance) {
      MLTrainingPipeline.instance = new MLTrainingPipeline();
    }
    return MLTrainingPipeline.instance;
  }

  /**
   * Generates Walk-Forward Validation Splits (Non-overlapping test sets, expanding train sets)
   */
  public generateWalkForwardSplits(
    totalSamples: number,
    numFolds: number = 4,
    minTrainRatio: number = 0.5
  ): TimeSeriesSplit[] {
    const splits: TimeSeriesSplit[] = [];
    const minTrainSamples = Math.floor(totalSamples * minTrainRatio);
    const testSpace = totalSamples - minTrainSamples;
    const foldSize = Math.floor(testSpace / numFolds);

    for (let f = 0; f < numFolds; f++) {
      const splitPoint = minTrainSamples + f * foldSize;
      const trainIndices = Array.from({ length: splitPoint }, (_, i) => i);
      const testIndices = Array.from({ length: Math.min(foldSize, totalSamples - splitPoint) }, (_, i) => splitPoint + i);

      if (testIndices.length > 0) {
        splits.push({ trainIndices, testIndices });
      }
    }

    return splits;
  }

  /**
   * Generates Rolling Window Validation Splits (Fixed-size training window sliding forward)
   */
  public generateRollingWindowSplits(
    totalSamples: number,
    windowSize: number,
    testSize: number
  ): TimeSeriesSplit[] {
    const splits: TimeSeriesSplit[] = [];
    let start = 0;

    while (start + windowSize + testSize <= totalSamples) {
      const trainIndices = Array.from({ length: windowSize }, (_, i) => start + i);
      const testIndices = Array.from({ length: testSize }, (_, i) => start + windowSize + i);

      splits.push({ trainIndices, testIndices });
      // slide forward by the testSize
      start += testSize;
    }

    return splits;
  }

  /**
   * Run full walk-forward validation for a given model on a dataset
   */
  public runWalkForwardPipeline(
    estimator: MLEstimator,
    X: number[][],
    Y: number[],
    numFolds: number = 4,
    minTrainRatio: number = 0.5
  ): TrainingPipelineReport {
    const totalSamples = X.length;
    const splits = this.generateWalkForwardSplits(totalSamples, numFolds, minTrainRatio);
    const foldReports: ValidationFoldReport[] = [];
    const logs: string[] = [];

    logs.push(`Starting Walk-Forward Pipeline for model ${estimator.name}...`);
    logs.push(`Total dataset samples: ${totalSamples}. Configured folds: ${numFolds}`);

    let totalTrainingTime = 0;
    let totalInferenceTime = 0;

    // To aggregate out-of-fold predictions
    const allOutOfFoldTrue: number[] = [];
    const allOutOfFoldPreds: number[] = [];
    const allOutOfFoldProbs: number[][] = [];

    splits.forEach((split, foldIdx) => {
      logs.push(`[FOLD ${foldIdx + 1}/${splits.length}] Slicing train subset: 0-${split.trainIndices.length - 1}, test subset: ${split.testIndices[0]}-${split.testIndices[split.testIndices.length - 1]}`);

      // Extract slices
      const trainX = split.trainIndices.map((i) => X[i]);
      const trainY = split.trainIndices.map((i) => Y[i]);
      const testX = split.testIndices.map((i) => X[i]);
      const testY = split.testIndices.map((i) => Y[i]);

      // Measure training performance profile
      const startTrain = Date.now();
      const startMem = typeof process !== 'undefined' ? process.memoryUsage().heapUsed : 0;
      
      estimator.train(trainX, trainY, 2); // Binary classification assumption
      
      const endTrain = Date.now();
      const endMem = typeof process !== 'undefined' ? process.memoryUsage().heapUsed : 0;
      const trainTime = endTrain - startTrain;
      const memDiff = Math.max(0, endMem - startMem);
      totalTrainingTime += trainTime;

      // Predict
      const startInf = Date.now();
      const preds = estimator.predict(testX);
      const probs = estimator.predictProbs(testX);
      const endInf = Date.now();
      const infTime = endInf - startInf;
      totalInferenceTime += infTime;

      // Evaluate Fold
      const foldMetrics = mlEvaluationFramework.evaluateModel(
        testY,
        preds,
        probs,
        trainTime,
        infTime,
        memDiff
      );

      foldReports.push({
        foldIdx,
        trainRange: { startIdx: split.trainIndices[0], endIdx: split.trainIndices[split.trainIndices.length - 1] },
        testRange: { startIdx: split.testIndices[0], endIdx: split.testIndices[split.testIndices.length - 1] },
        metrics: foldMetrics
      });

      logs.push(`[FOLD ${foldIdx + 1} COMPLETE] Accuracy: ${(foldMetrics.accuracy * 100).toFixed(1)}%, Brier: ${foldMetrics.brierScore.toFixed(3)}, LogLoss: ${foldMetrics.logLoss.toFixed(3)}`);

      // Store out-of-fold results for aggregate analysis
      allOutOfFoldTrue.push(...testY);
      allOutOfFoldPreds.push(...preds);
      allOutOfFoldProbs.push(...probs);
    });

    // Compute final out-of-fold aggregate metrics
    logs.push("Walk-Forward splits completed. Calculating aggregate out-of-fold research metrics...");
    const aggregateMetrics = mlEvaluationFramework.evaluateModel(
      allOutOfFoldTrue,
      allOutOfFoldPreds,
      allOutOfFoldProbs,
      totalTrainingTime,
      totalInferenceTime,
      0 // aggregated memory
    );

    logs.push(`[PIPELINE SUCCESS] Aggregate Out-Of-Fold Accuracy: ${(aggregateMetrics.accuracy * 100).toFixed(1)}%, Expected Brier: ${aggregateMetrics.brierScore.toFixed(4)}, LogLoss: ${aggregateMetrics.logLoss.toFixed(4)}`);

    return {
      pipelineType: "WALK_FORWARD",
      numFolds: splits.length,
      aggregateMetrics,
      foldReports,
      trainingLogs: logs
    };
  }
}

export const mlTrainingPipeline = MLTrainingPipeline.getInstance();
