/**
 * AMIS PHASE 5.0 — MODEL EVALUATION FRAMEWORK
 * Calculates advanced statistical, calibration, and computational performance metrics.
 */

export interface EvaluationReport {
  accuracy: number;
  balancedAccuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  mcc: number; // Matthews Correlation Coefficient
  rocAuc: number; // Area Under the ROC Curve
  brierScore: number;
  logLoss: number;
  calibrationError: number; // Expected Calibration Error (ECE)
  expectedValue: number; // Mathematical expected return of prediction
  trainingTimeMs: number;
  inferenceTimeMs: number;
  memoryUsageBytes: number;
  confusionMatrix: {
    tp: number;
    tn: number;
    fp: number;
    fn: number;
  };
}

export class EvaluationFramework {
  private static instance: EvaluationFramework;

  private constructor() {}

  public static getInstance(): EvaluationFramework {
    if (!EvaluationFramework.instance) {
      EvaluationFramework.instance = new EvaluationFramework();
    }
    return EvaluationFramework.instance;
  }

  /**
   * Main metrics calculator for binary predictions (UP vs DOWN/FLAT)
   */
  public evaluateModel(
    trueLabels: number[],
    predictedLabels: number[],
    predictedProbs: number[][], // probability of class 1 in column [1]
    trainingTimeMs: number = 0,
    inferenceTimeMs: number = 0,
    memoryUsageBytes: number = 0
  ): EvaluationReport {
    const N = trueLabels.length;
    if (N === 0) {
      return this.emptyReport();
    }

    // 1. Calculate Confusion Matrix (assuming Binary 0 and 1)
    let tp = 0;
    let tn = 0;
    let fp = 0;
    let fn = 0;

    for (let i = 0; i < N; i++) {
      const actual = trueLabels[i] === 1 ? 1 : 0;
      const pred = predictedLabels[i] === 1 ? 1 : 0;

      if (actual === 1 && pred === 1) tp++;
      else if (actual === 0 && pred === 0) tn++;
      else if (actual === 0 && pred === 1) fp++;
      else if (actual === 1 && pred === 0) fn++;
    }

    // 2. Performance Metrics
    const accuracy = (tp + tn) / N;

    // Balanced Accuracy = (Sensitivity + Specificity) / 2
    const sensitivity = tp + fn > 0 ? tp / (tp + fn) : 0;
    const specificity = tn + fp > 0 ? tn / (tn + fp) : 0;
    const balancedAccuracy = (sensitivity + specificity) / 2;

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = sensitivity;
    const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    // Matthews Correlation Coefficient (MCC)
    const mccDenom = Math.sqrt((tp + fp) * (tp + fn) * (tn + fp) * (tn + fn));
    const mcc = mccDenom > 0 ? (tp * tn - fp * fn) / mccDenom : 0;

    // 3. ROC-AUC (Trapezoidal integration)
    const rocAuc = this.calculateBinaryRocAuc(trueLabels, predictedProbs.map((p) => p[1]));

    // 4. Calibration Metrics
    // Brier Score
    let brierSum = 0;
    for (let i = 0; i < N; i++) {
      const p1 = predictedProbs[i][1];
      const y = trueLabels[i] === 1 ? 1 : 0;
      brierSum += Math.pow(p1 - y, 2);
    }
    const brierScore = brierSum / N;

    // Log Loss
    let logLossSum = 0;
    for (let i = 0; i < N; i++) {
      const p1 = Math.max(1e-15, Math.min(1 - 1e-15, predictedProbs[i][1]));
      const y = trueLabels[i] === 1 ? 1 : 0;
      logLossSum += y * Math.log(p1) + (1 - y) * Math.log(1 - p1);
    }
    const logLoss = -logLossSum / N;

    // Expected Calibration Error (ECE) using 5 bins
    const calibrationError = this.calculateECE(trueLabels, predictedProbs.map((p) => p[1]), 5);

    // Expected Value = (Precision * Avg Favorable) - ((1 - Precision) * Avg Adverse)
    // For general classification, let's represent it as the probability-weighted prediction correctness
    const expectedValue = (precision * 2.0) - ((1 - precision) * 1.5); // relative risk ratio representation

    return {
      accuracy,
      balancedAccuracy,
      precision,
      recall,
      f1Score,
      mcc,
      rocAuc,
      brierScore,
      logLoss,
      calibrationError,
      expectedValue,
      trainingTimeMs,
      inferenceTimeMs,
      memoryUsageBytes,
      confusionMatrix: { tp, tn, fp, fn }
    };
  }

  /**
   * Deterministic Area Under ROC curve calculation
   */
  private calculateBinaryRocAuc(trueLabels: number[], predictedProbs: number[]): number {
    const samples = trueLabels.map((y, idx) => ({ y: y === 1 ? 1 : 0, prob: predictedProbs[idx] }));
    // Sort descending by probability
    samples.sort((a, b) => b.prob - a.prob);

    const totalPositives = samples.filter((s) => s.y === 1).length;
    const totalNegatives = samples.length - totalPositives;

    if (totalPositives === 0 || totalNegatives === 0) {
      return 0.5; // Undefined or random baseline
    }

    let area = 0;
    let tpCount = 0;
    let fpCount = 0;
    let prevTpFp = { tp: 0, fp: 0 };

    for (let i = 0; i < samples.length; i++) {
      if (samples[i].y === 1) {
        tpCount++;
      } else {
        fpCount++;
      }

      // Trapezoidal rule integration step
      const currentFpr = fpCount / totalNegatives;
      const prevFpr = prevTpFp.fp / totalNegatives;
      const currentTpr = tpCount / totalPositives;
      const prevTpr = prevTpFp.tp / totalPositives;

      area += ((currentFpr - prevFpr) * (currentTpr + prevTpr)) / 2;
      prevTpFp = { tp: tpCount, fp: fpCount };
    }

    return area;
  }

  /**
   * Expected Calibration Error (ECE)
   */
  private calculateECE(trueLabels: number[], predictedProbs: number[], numBins: number = 5): number {
    const N = trueLabels.length;
    const binBoundaries = Array.from({ length: numBins + 1 }, (_, i) => i / numBins);

    let ece = 0;

    for (let b = 0; b < numBins; b++) {
      const lowerBound = binBoundaries[b];
      const upperBound = binBoundaries[b + 1];

      // Collect items in this bin
      const binIndices: number[] = [];
      for (let i = 0; i < N; i++) {
        const p = predictedProbs[i];
        if (p >= lowerBound && (b === numBins - 1 ? p <= upperBound : p < upperBound)) {
          binIndices.push(i);
        }
      }

      const binSize = binIndices.length;
      if (binSize === 0) continue;

      // Calculate accuracy and mean confidence inside this bin
      let binCorrect = 0;
      let binConfSum = 0;

      binIndices.forEach((idx) => {
        const y = trueLabels[idx] === 1 ? 1 : 0;
        const p = predictedProbs[idx];

        // For binary prediction, confidence in the prediction is max(p, 1-p)
        const pred = p >= 0.5 ? 1 : 0;
        const conf = p >= 0.5 ? p : 1 - p;

        if (pred === y) binCorrect++;
        binConfSum += conf;
      });

      const binAccuracy = binCorrect / binSize;
      const binConfidence = binConfSum / binSize;

      // ECE is weighted average of absolute calibration differences
      ece += (binSize / N) * Math.abs(binAccuracy - binConfidence);
    }

    return ece;
  }

  private emptyReport(): EvaluationReport {
    return {
      accuracy: 0,
      balancedAccuracy: 0,
      precision: 0,
      recall: 0,
      f1Score: 0,
      mcc: 0,
      rocAuc: 0.5,
      brierScore: 0,
      logLoss: 0,
      calibrationError: 0,
      expectedValue: 0,
      trainingTimeMs: 0,
      inferenceTimeMs: 0,
      memoryUsageBytes: 0,
      confusionMatrix: { tp: 0, tn: 0, fp: 0, fn: 0 }
    };
  }
}

export const mlEvaluationFramework = EvaluationFramework.getInstance();
