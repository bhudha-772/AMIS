/**
 * AMIS PHASE 5.0 — STATISTICAL COMPARISON SERVICE
 * Implements bootstrap confidence intervals, McNemar test, Permutation test, and effect sizes.
 * Determines if model performance gains over the Probability Engine are statistically significant.
 */

export interface StatisticalComparisonReport {
  baselineBrier: number;
  modelBrier: number;
  brierDelta: number;
  baselineLogLoss: number;
  modelLogLoss: number;
  logLossDelta: number;
  
  // McNemar Contingency Test
  mcnemarChi2: number;
  mcnemarPValue: number;
  mcnemarSignificant: boolean;

  // Permutation Test
  permutationPValue: number;
  permutationSignificant: boolean;

  // Bootstrap CIs (95% CI)
  baselineAccuracyCI: [number, number];
  modelAccuracyCI: [number, number];
  brierDifferenceCI: [number, number];

  // Effect Size
  cohensD: number;
  statisticalConclusion: string;
}

export class StatisticalComparison {
  private static instance: StatisticalComparison;

  private constructor() {}

  public static getInstance(): StatisticalComparison {
    if (!StatisticalComparison.instance) {
      StatisticalComparison.instance = new StatisticalComparison();
    }
    return StatisticalComparison.instance;
  }

  // Gaussian Error Function (erf) for normal and chi-sq approximation
  private erf(x: number): number {
    // Constants
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;

    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x);

    const t = 1.0 / (1.0 + p * absX);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

    return sign * y;
  }

  /**
   * McNemar paired test with continuity correction
   */
  public calculateMcNemar(
    trueLabels: number[],
    predA: number[], // Baseline (Probability Engine)
    predB: number[]  // Challenger (ML Model)
  ) {
    const N = trueLabels.length;
    let b = 0; // Baseline correct, Challenger incorrect
    let c = 0; // Baseline incorrect, Challenger correct

    for (let i = 0; i < N; i++) {
      const y = trueLabels[i] === 1 ? 1 : 0;
      const correctA = predA[i] === y;
      const correctB = predB[i] === y;

      if (correctA && !correctB) b++;
      else if (!correctA && correctB) c++;
    }

    if (b + c === 0) {
      return { chi2: 0, pValue: 1.0, significant: false };
    }

    // Continuity corrected McNemar Chi-Squared
    const chi2 = Math.pow(Math.abs(b - c) - 1, 2) / (b + c);

    // Compute p-value from chi2 with 1 DOF. 
    // Since df=1, p-value = 1 - CDF_chi2(chi2) = 1 - erf(sqrt(chi2 / 2))
    const z = Math.sqrt(chi2);
    const pValue = 1.0 - this.erf(z / Math.sqrt(2));

    return {
      chi2,
      pValue,
      significant: pValue < 0.05
    };
  }

  /**
   * Permutation test of accuracy difference
   */
  public calculatePermutationTest(
    trueLabels: number[],
    predA: number[],
    predB: number[],
    numPermutations: number = 300
  ): { pValue: number; significant: boolean } {
    const N = trueLabels.length;
    if (N === 0) return { pValue: 1.0, significant: false };

    // Calculate actual difference in accuracy
    let correctA = 0;
    let correctB = 0;
    for (let i = 0; i < N; i++) {
      const y = trueLabels[i] === 1 ? 1 : 0;
      if (predA[i] === y) correctA++;
      if (predB[i] === y) correctB++;
    }

    const observedDiff = Math.abs((correctB - correctA) / N);

    // Run randomized permutations
    let extremeCount = 0;
    let seed = 42;

    for (let p = 0; p < numPermutations; p++) {
      let permCorrectA = 0;
      let permCorrectB = 0;

      for (let i = 0; i < N; i++) {
        const y = trueLabels[i] === 1 ? 1 : 0;
        
        // Simple LCG inside permutation loop for deterministic execution
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        const swap = seed / 4294967296 < 0.5;

        const actualPredA = swap ? predB[i] : predA[i];
        const actualPredB = swap ? predA[i] : predB[i];

        if (actualPredA === y) permCorrectA++;
        if (actualPredB === y) permCorrectB++;
      }

      const permDiff = Math.abs((permCorrectB - permCorrectA) / N);
      if (permDiff >= observedDiff) {
        extremeCount++;
      }
    }

    const pValue = extremeCount / numPermutations;
    return {
      pValue,
      significant: pValue < 0.05
    };
  }

  /**
   * Bootstrap resampler for 95% Confidence Intervals
   */
  public calculateBootstrapCIs(
    trueLabels: number[],
    probsA: number[], // probability of class 1
    probsB: number[],
    numResamples: number = 200
  ) {
    const N = trueLabels.length;
    const accuraciesA: number[] = [];
    const accuraciesB: number[] = [];
    const brierDifferences: number[] = [];

    let seed = 101;

    for (let r = 0; r < numResamples; r++) {
      let correctA = 0;
      let correctB = 0;
      let brierSumA = 0;
      let brierSumB = 0;

      for (let i = 0; i < N; i++) {
        // Sample with replacement
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        const sampleIdx = Math.floor((seed / 4294967296) * N);

        const y = trueLabels[sampleIdx] === 1 ? 1 : 0;
        const pA = probsA[sampleIdx];
        const pB = probsB[sampleIdx];

        const predA = pA >= 0.5 ? 1 : 0;
        const predB = pB >= 0.5 ? 1 : 0;

        if (predA === y) correctA++;
        if (predB === y) correctB++;

        brierSumA += Math.pow(pA - y, 2);
        brierSumB += Math.pow(pB - y, 2);
      }

      accuraciesA.push(correctA / N);
      accuraciesB.push(correctB / N);
      brierDifferences.push((brierSumB / N) - (brierSumA / N));
    }

    // Sort to extract percentiles (2.5th and 97.5th)
    accuraciesA.sort((a, b) => a - b);
    accuraciesB.sort((a, b) => a - b);
    brierDifferences.sort((a, b) => a - b);

    const lowIdx = Math.floor(numResamples * 0.025);
    const highIdx = Math.floor(numResamples * 0.975);

    const baselineAccuracyCI: [number, number] = [accuraciesA[lowIdx], accuraciesA[highIdx]];
    const modelAccuracyCI: [number, number] = [accuraciesB[lowIdx], accuraciesB[highIdx]];
    const brierDifferenceCI: [number, number] = [brierDifferences[lowIdx], brierDifferences[highIdx]];

    return {
      baselineAccuracyCI,
      modelAccuracyCI,
      brierDifferenceCI
    };
  }

  /**
   * Compares an ML Challenger model against the Probability Engine baseline
   */
  public compareModels(
    trueLabels: number[],
    probsPE: number[], // Probability Engine probs
    probsML: number[]  // ML Model probs
  ): StatisticalComparisonReport {
    const N = trueLabels.length;

    // Convert probabilities to binary prediction labels
    const predPE = probsPE.map((p) => (p >= 0.5 ? 1 : 0));
    const predML = probsML.map((p) => (p >= 0.5 ? 1 : 0));

    // Brier metrics
    let brierSumPE = 0;
    let brierSumML = 0;
    let logLossSumPE = 0;
    let logLossSumML = 0;

    const brierDiffs: number[] = [];

    for (let i = 0; i < N; i++) {
      const y = trueLabels[i] === 1 ? 1 : 0;
      const pPE = probsPE[i];
      const pML = probsML[i];

      const diffPE = pPE - y;
      const diffML = pML - y;

      const sqPE = diffPE * diffPE;
      const sqML = diffML * diffML;

      brierSumPE += sqPE;
      brierSumML += sqML;

      brierDiffs.push(sqML - sqPE);

      const pClampPE = Math.max(1e-15, Math.min(1 - 1e-15, pPE));
      const pClampML = Math.max(1e-15, Math.min(1 - 1e-15, pML));

      logLossSumPE += y * Math.log(pClampPE) + (1 - y) * Math.log(1 - pClampPE);
      logLossSumML += y * Math.log(pClampML) + (1 - y) * Math.log(1 - pClampML);
    }

    const baselineBrier = brierSumPE / N;
    const modelBrier = brierSumML / N;
    const brierDelta = modelBrier - baselineBrier;

    const baselineLogLoss = -logLossSumPE / N;
    const modelLogLoss = -logLossSumML / N;
    const logLossDelta = modelLogLoss - baselineLogLoss;

    // Paired statistical tests
    const mcnemar = this.calculateMcNemar(trueLabels, predPE, predML);
    const permutation = this.calculatePermutationTest(trueLabels, predPE, predML, 200);
    const bootstrap = this.calculateBootstrapCIs(trueLabels, probsPE, probsML, 150);

    // Calculate effect size (Cohen's d on Brier score differences)
    const sumDiffs = brierDiffs.reduce((a, b) => a + b, 0);
    const meanDiff = sumDiffs / N;
    const sqDiffSum = brierDiffs.map((d) => Math.pow(d - meanDiff, 2)).reduce((a, b) => a + b, 0);
    const stdDiff = Math.sqrt(sqDiffSum / N) || 1e-6;
    const cohensD = meanDiff / stdDiff;

    // Formulation of the final scientific conclusion
    let statisticalConclusion = "";
    if (mcnemar.significant && permutation.significant) {
      if (brierDelta < 0) {
        statisticalConclusion = "SUCCESS: Challenger model shows a statistically significant improvement over the Probability Engine with reliable effect size.";
      } else {
        statisticalConclusion = "REGRESSION: Challenger model has statistically significant POORER performance compared to the Probability Engine.";
      }
    } else {
      statisticalConclusion = "EQUIVALENCE: Performance differences are NOT statistically significant. Null hypothesis retained. Challenger rejected.";
    }

    return {
      baselineBrier,
      modelBrier,
      brierDelta,
      baselineLogLoss,
      modelLogLoss,
      logLossDelta,
      mcnemarChi2: mcnemar.chi2,
      mcnemarPValue: mcnemar.pValue,
      mcnemarSignificant: mcnemar.significant,
      permutationPValue: permutation.pValue,
      permutationSignificant: permutation.significant,
      baselineAccuracyCI: bootstrap.baselineAccuracyCI,
      modelAccuracyCI: bootstrap.modelAccuracyCI,
      brierDifferenceCI: bootstrap.brierDifferenceCI,
      cohensD,
      statisticalConclusion
    };
  }
}

export const mlStatisticalComparison = StatisticalComparison.getInstance();
