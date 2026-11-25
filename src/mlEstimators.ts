/**
 * AMIS PHASE 5.0 — MACHINE LEARNING ESTIMATORS
 * A deterministic library of classical quantitative machine learning models in pure TypeScript.
 * Features an LCG seeded randomizer to guarantee absolute, repeatable reproducibility across environments.
 */

// Simple seeded LCG randomizer for reproducibility
export class SeededRandom {
  private seed: number;
  constructor(seed: number = 42) {
    this.seed = seed;
  }
  public next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }
  // Sample with replacement
  public sampleWithReplacement(n: number): number[] {
    const indices: number[] = [];
    for (let i = 0; i < n; i++) {
      indices.push(Math.floor(this.next() * n));
    }
    return indices;
  }
}

export interface MLEstimator {
  name: string;
  type: string;
  hyperparameters: Record<string, any>;
  train(X: number[][], Y: number[], numClasses: number): void;
  predict(X: number[][]): number[];
  predictProbs(X: number[][]): number[][]; // [sampleIdx][classIdx]
}

// 1. Persistence Predictor
export class PersistencePredictor implements MLEstimator {
  name = "Persistence Predictor";
  type = "BASELINE_PERSISTENCE";
  hyperparameters = {};
  private lastKnownClass = 0;

  train(X: number[][], Y: number[], numClasses: number): void {
    if (Y.length > 0) {
      this.lastKnownClass = Y[Y.length - 1];
    }
  }

  predict(X: number[][]): number[] {
    // For backtesting, persistence predicts that the next label is the previous actual label.
    // In our static batch inference, we'll assign the last known class from training.
    return X.map(() => this.lastKnownClass);
  }

  predictProbs(X: number[][]): number[][] {
    return X.map(() => {
      const probs = new Array(2).fill(0);
      probs[this.lastKnownClass] = 1.0;
      return probs;
    });
  }
}

// 2. Random Predictor (Class Balance Weighted)
export class RandomPredictor implements MLEstimator {
  name = "Random Predictor";
  type = "BASELINE_RANDOM";
  hyperparameters: Record<string, any> = { seed: 42 };
  private classPriors: number[] = [];
  private numClasses = 2;

  constructor(seed: number = 42) {
    this.hyperparameters.seed = seed;
  }

  train(X: number[][], Y: number[], numClasses: number): void {
    this.numClasses = numClasses;
    const counts = new Array(numClasses).fill(0);
    Y.forEach((val) => counts[val]++);
    this.classPriors = counts.map((c) => (Y.length > 0 ? c / Y.length : 1 / numClasses));
  }

  predict(X: number[][]): number[] {
    const rand = new SeededRandom(this.hyperparameters.seed);
    return X.map(() => {
      const r = rand.next();
      let cum = 0;
      for (let i = 0; i < this.numClasses; i++) {
        cum += this.classPriors[i];
        if (r <= cum) return i;
      }
      return this.numClasses - 1;
    });
  }

  predictProbs(X: number[][]): number[][] {
    const rand = new SeededRandom(this.hyperparameters.seed);
    return X.map(() => {
      // Deterministic random probabilities summing to 1.0
      const raw = new Array(this.numClasses).fill(0).map(() => rand.next());
      const sum = raw.reduce((a, b) => a + b, 0);
      return raw.map((r) => r / sum);
    });
  }
}

// 3. Majority-Class Predictor
export class MajorityClassPredictor implements MLEstimator {
  name = "Majority-Class Predictor";
  type = "BASELINE_MAJORITY";
  hyperparameters = {};
  private majorityClass = 0;
  private numClasses = 2;
  private classProbs: number[] = [];

  train(X: number[][], Y: number[], numClasses: number): void {
    this.numClasses = numClasses;
    const counts = new Array(numClasses).fill(0);
    Y.forEach((val) => {
      if (val >= 0 && val < numClasses) counts[val]++;
    });
    let maxIdx = 0;
    let maxVal = -1;
    counts.forEach((c, idx) => {
      if (c > maxVal) {
        maxVal = c;
        maxIdx = idx;
      }
    });
    this.majorityClass = maxIdx;
    this.classProbs = counts.map((c) => (Y.length > 0 ? c / Y.length : 1 / numClasses));
  }

  predict(X: number[][]): number[] {
    return X.map(() => this.majorityClass);
  }

  predictProbs(X: number[][]): number[][] {
    return X.map(() => [...this.classProbs]);
  }
}

// 4. Linear Logistic Regression (Gradient Descent with L2 Regularization)
export class LogisticRegressionPredictor implements MLEstimator {
  name = "Logistic Regression";
  type = "LINEAR_LOGISTIC";
  hyperparameters = {
    learningRate: 0.1,
    epochs: 100,
    l2Lambda: 0.01
  };
  private weights: number[] = [];
  private bias = 0;
  private numClasses = 2;

  constructor(lr = 0.1, epochs = 100, lambda = 0.01) {
    this.hyperparameters.learningRate = lr;
    this.hyperparameters.epochs = epochs;
    this.hyperparameters.l2Lambda = lambda;
  }

  private sigmoid(z: number): number {
    return 1 / (1 + Math.exp(-Math.max(-15, Math.min(15, z))));
  }

  train(X: number[][], Y: number[], numClasses: number): void {
    this.numClasses = numClasses;
    if (X.length === 0) return;

    const numFeatures = X[0].length;
    this.weights = new Array(numFeatures).fill(0);
    this.bias = 0;

    const lr = this.hyperparameters.learningRate;
    const epochs = this.hyperparameters.epochs;
    const lambda = this.hyperparameters.l2Lambda;

    // Standard binary gradient descent for Logistic Regression
    for (let epoch = 0; epoch < epochs; epoch++) {
      let gradW = new Array(numFeatures).fill(0);
      let gradB = 0;

      for (let i = 0; i < X.length; i++) {
        const xi = X[i];
        const yi = Y[i] === 1 ? 1 : 0; // Binary target assumption

        // Compute hypothesis
        let dot = 0;
        for (let j = 0; j < numFeatures; j++) {
          dot += xi[j] * this.weights[j];
        }
        const pred = this.sigmoid(dot + this.bias);
        const error = pred - yi;

        for (let j = 0; j < numFeatures; j++) {
          gradW[j] += error * xi[j];
        }
        gradB += error;
      }

      // Update weights and bias with L2 regularization
      for (let j = 0; j < numFeatures; j++) {
        this.weights[j] -= (lr / X.length) * (gradW[j] + lambda * this.weights[j]);
      }
      this.bias -= (lr / X.length) * gradB;
    }
  }

  predict(X: number[][]): number[] {
    const probs = this.predictProbs(X);
    return probs.map((p) => (p[1] >= 0.5 ? 1 : 0));
  }

  predictProbs(X: number[][]): number[][] {
    return X.map((xi) => {
      let dot = 0;
      for (let j = 0; j < xi.length; j++) {
        dot += xi[j] * (this.weights[j] || 0);
      }
      const p1 = this.sigmoid(dot + this.bias);
      return [1 - p1, p1];
    });
  }

  public getWeights() {
    return this.weights;
  }
}

// Helper types for Decision Tree
interface DecisionNode {
  featureIdx?: number;
  splitValue?: number;
  left?: DecisionNode;
  right?: DecisionNode;
  isLeaf: boolean;
  prediction?: number;
  probabilities?: number[];
}

// 5. Decision Tree (Deterministic Gini Classification)
export class DecisionTreePredictor implements MLEstimator {
  name = "Decision Tree";
  type = "DECISION_TREE";
  hyperparameters = {
    maxDepth: 4,
    minSamplesSplit: 5
  };
  private root: DecisionNode | null = null;
  private numClasses = 2;

  constructor(maxDepth = 4, minSamplesSplit = 5) {
    this.hyperparameters.maxDepth = maxDepth;
    this.hyperparameters.minSamplesSplit = minSamplesSplit;
  }

  private calculateGini(Y: number[], numClasses: number): number {
    const n = Y.length;
    if (n === 0) return 0;
    const counts = new Array(numClasses).fill(0);
    Y.forEach((val) => counts[val]++);
    let sumSq = 0;
    counts.forEach((c) => {
      const p = c / n;
      sumSq += p * p;
    });
    return 1 - sumSq;
  }

  private buildTree(
    X: number[][],
    Y: number[],
    depth: number,
    featureSubsetIndices?: number[]
  ): DecisionNode {
    const nSamples = X.length;
    const nFeatures = X.length > 0 ? X[0].length : 0;

    // Check stop conditions
    const uniqueClasses = Array.from(new Set(Y));
    if (
      depth >= this.hyperparameters.maxDepth ||
      nSamples < this.hyperparameters.minSamplesSplit ||
      uniqueClasses.length <= 1
    ) {
      return this.createLeaf(Y);
    }

    // Determine features to evaluate
    const featureIndices = featureSubsetIndices || Array.from({ length: nFeatures }, (_, i) => i);

    let bestGiniGain = -1;
    let bestSplitFeature = -1;
    let bestSplitVal = 0;
    let bestLeftIdx: number[] = [];
    let bestRightIdx: number[] = [];

    const parentGini = this.calculateGini(Y, this.numClasses);

    // Evaluate splits
    featureIndices.forEach((featIdx) => {
      // Find candidate split values (percentiles/sorted values)
      const values = X.map((row) => row[featIdx]);
      const sortedValues = [...values].sort((a, b) => a - b);

      // Evaluate 5 splits to keep it fast and deterministic
      const candidates: number[] = [];
      const step = Math.max(1, Math.floor(sortedValues.length / 5));
      for (let s = step; s < sortedValues.length; s += step) {
        candidates.push((sortedValues[s - 1] + sortedValues[s]) / 2);
      }

      candidates.forEach((val) => {
        const left: number[] = [];
        const right: number[] = [];

        for (let i = 0; i < nSamples; i++) {
          if (X[i][featIdx] <= val) {
            left.push(i);
          } else {
            right.push(i);
          }
        }

        if (left.length === 0 || right.length === 0) return;

        const leftY = left.map((i) => Y[i]);
        const rightY = right.map((i) => Y[i]);

        const giniLeft = this.calculateGini(leftY, this.numClasses);
        const giniRight = this.calculateGini(rightY, this.numClasses);

        const wGini = (left.length / nSamples) * giniLeft + (right.length / nSamples) * giniRight;
        const gain = parentGini - wGini;

        if (gain > bestGiniGain) {
          bestGiniGain = gain;
          bestSplitFeature = featIdx;
          bestSplitVal = val;
          bestLeftIdx = left;
          bestRightIdx = right;
        }
      });
    });

    if (bestGiniGain <= 1e-6) {
      return this.createLeaf(Y);
    }

    // Recurse
    const leftX = bestLeftIdx.map((i) => X[i]);
    const leftY = bestLeftIdx.map((i) => Y[i]);
    const rightX = bestRightIdx.map((i) => X[i]);
    const rightY = bestRightIdx.map((i) => Y[i]);

    const leftNode = this.buildTree(leftX, leftY, depth + 1, featureSubsetIndices);
    const rightNode = this.buildTree(rightX, rightY, depth + 1, featureSubsetIndices);

    return {
      isLeaf: false,
      featureIdx: bestSplitFeature,
      splitValue: bestSplitVal,
      left: leftNode,
      right: rightNode
    };
  }

  private createLeaf(Y: number[]): DecisionNode {
    const counts = new Array(this.numClasses).fill(0);
    Y.forEach((val) => {
      if (val >= 0 && val < this.numClasses) counts[val]++;
    });

    let majorityClass = 0;
    let maxCount = -1;
    counts.forEach((c, idx) => {
      if (c > maxCount) {
        maxCount = c;
        majorityClass = idx;
      }
    });

    const probabilities = counts.map((c) => (Y.length > 0 ? c / Y.length : 1 / this.numClasses));

    return {
      isLeaf: true,
      prediction: majorityClass,
      probabilities
    };
  }

  train(X: number[][], Y: number[], numClasses: number): void {
    this.numClasses = numClasses;
    this.root = this.buildTree(X, Y, 0);
  }

  private predictRowProbs(node: DecisionNode, row: number[]): number[] {
    if (node.isLeaf) {
      return node.probabilities || new Array(this.numClasses).fill(0);
    }

    const val = row[node.featureIdx!];
    if (val <= node.splitValue!) {
      return this.predictRowProbs(node.left!, row);
    } else {
      return this.predictRowProbs(node.right!, row);
    }
  }

  predictProbs(X: number[][]): number[][] {
    if (!this.root) {
      return X.map(() => new Array(this.numClasses).fill(1 / this.numClasses));
    }
    return X.map((row) => this.predictRowProbs(this.root!, row));
  }

  predict(X: number[][]): number[] {
    const probs = this.predictProbs(X);
    return probs.map((rowProbs) => {
      let maxIdx = 0;
      let maxVal = -1;
      rowProbs.forEach((p, idx) => {
        if (p > maxVal) {
          maxVal = p;
          maxIdx = idx;
        }
      });
      return maxIdx;
    });
  }

  public getRoot() {
    return this.root;
  }
}

// 6. Random Forest Predictor (Deterministic Feature Bagging Ensemble)
export class RandomForestPredictor implements MLEstimator {
  name = "Random Forest";
  type = "RANDOM_FOREST";
  hyperparameters = {
    numTrees: 8,
    maxDepth: 4,
    minSamplesSplit: 5,
    seed: 42
  };
  private trees: DecisionTreePredictor[] = [];
  private numClasses = 2;

  constructor(numTrees = 8, maxDepth = 4, minSamplesSplit = 5, seed = 42) {
    this.hyperparameters.numTrees = numTrees;
    this.hyperparameters.maxDepth = maxDepth;
    this.hyperparameters.minSamplesSplit = minSamplesSplit;
    this.hyperparameters.seed = seed;
  }

  train(X: number[][], Y: number[], numClasses: number): void {
    this.numClasses = numClasses;
    this.trees = [];

    const numSamples = X.length;
    const numFeatures = X[0]?.length || 0;
    const rand = new SeededRandom(this.hyperparameters.seed);

    // Number of random features per node: Math.sqrt(numFeatures)
    const mTry = Math.max(1, Math.floor(Math.sqrt(numFeatures)));

    for (let t = 0; t < this.hyperparameters.numTrees; t++) {
      // 1. Generate bootstrap sample (with replacement)
      const bootstrapIndices = rand.sampleWithReplacement(numSamples);
      const bX = bootstrapIndices.map((i) => X[i]);
      const bY = bootstrapIndices.map((i) => Y[i]);

      // 2. Select a deterministic subset of features
      const featuresArr = Array.from({ length: numFeatures }, (_, i) => i);
      const featureSubset: number[] = [];
      const clonedFeatures = [...featuresArr];

      while (featureSubset.length < mTry && clonedFeatures.length > 0) {
        const idx = Math.floor(rand.next() * clonedFeatures.length);
        featureSubset.push(clonedFeatures[idx]);
        clonedFeatures.splice(idx, 1);
      }

      // 3. Create and train tree on bootstrap sample & feature subset
      const tree = new DecisionTreePredictor(
        this.hyperparameters.maxDepth,
        this.hyperparameters.minSamplesSplit
      );
      // We pass the subset down
      (tree as any).trainWithFeatures = (tx: number[][], ty: number[], featSub: number[]) => {
        (tree as any).numClasses = numClasses;
        (tree as any).root = (tree as any).buildTree(tx, ty, 0, featSub);
      };

      if ((tree as any).trainWithFeatures) {
        (tree as any).trainWithFeatures(bX, bY, featureSubset);
      } else {
        tree.train(bX, bY, numClasses);
      }

      this.trees.push(tree);
    }
  }

  predictProbs(X: number[][]): number[][] {
    const probs = X.map(() => new Array(this.numClasses).fill(0));

    this.trees.forEach((tree) => {
      const treeProbs = tree.predictProbs(X);
      for (let i = 0; i < X.length; i++) {
        for (let c = 0; c < this.numClasses; c++) {
          probs[i][c] += treeProbs[i][c];
        }
      }
    });

    // Average the predictions
    return probs.map((row) => row.map((sumVal) => sumVal / this.trees.length));
  }

  predict(X: number[][]): number[] {
    const probs = this.predictProbs(X);
    return probs.map((rowProbs) => {
      let maxIdx = 0;
      let maxVal = -1;
      rowProbs.forEach((p, idx) => {
        if (p > maxVal) {
          maxVal = p;
          maxIdx = idx;
        }
      });
      return maxIdx;
    });
  }
}

// 7. Gradient Boosting Classifier (Deterministic Log-Loss Boosting)
export class GradientBoostingPredictor implements MLEstimator {
  name = "Gradient Boosting";
  type = "GRADIENT_BOOSTING";
  hyperparameters = {
    numIterations: 8,
    learningRate: 0.1,
    maxDepth: 3,
    minSamplesSplit: 5
  };
  private basePrediction = 0;
  private trees: DecisionTreePredictor[] = []; // will fit pseudo-residuals
  private numClasses = 2;

  constructor(numIterations = 8, learningRate = 0.1, maxDepth = 3, minSamplesSplit = 5) {
    this.hyperparameters.numIterations = numIterations;
    this.hyperparameters.learningRate = learningRate;
    this.hyperparameters.maxDepth = maxDepth;
    this.hyperparameters.minSamplesSplit = minSamplesSplit;
  }

  train(X: number[][], Y: number[], numClasses: number): void {
    this.numClasses = numClasses;
    this.trees = [];

    if (X.length === 0) return;

    // For simplicity, let's focus on binary classification (majority target UP vs DOWN/FLAT)
    // 1. Initialize base prediction with log-odds of the positive class
    const positiveCount = Y.filter((y) => y === 1).length;
    const priorProb = positiveCount / Y.length || 0.5;
    this.basePrediction = Math.log(priorProb / (1 - priorProb || 1e-6));

    let F = new Array(X.length).fill(this.basePrediction);

    const lr = this.hyperparameters.learningRate;

    for (let iter = 0; iter < this.hyperparameters.numIterations; iter++) {
      // 2. Compute pseudo-residuals (gradients of log-loss): residual_i = y_i - p_i
      const residuals: number[] = [];
      const probs: number[] = [];

      for (let i = 0; i < X.length; i++) {
        const p = 1 / (1 + Math.exp(-F[i]));
        probs.push(p);
        const y = Y[i] === 1 ? 1 : 0;
        residuals.push(y - p);
      }

      // 3. Train a regression-style tree to predict the residual
      // Since our Decision Tree is a classifier, we can adapt it for residuals
      // by mapping residuals to binary labels (positive residuals vs negative residuals),
      // and storing the average residual of each leaf node.
      const tree = new DecisionTreePredictor(
        this.hyperparameters.maxDepth,
        this.hyperparameters.minSamplesSplit
      );

      // Create a copy of residuals to use as targets for splitting
      const residualClasses = residuals.map((r) => (r >= 0 ? 1 : 0));
      tree.train(X, residualClasses, 2);

      // Mutate the tree leaves to store average residuals (leaf values) instead of class probabilities!
      // This is a beautiful hack that leverages our existing decision tree code as a regressor!
      this.convertLeafValuesToAverageResiduals(tree.getRoot()!, X, residuals);

      this.trees.push(tree);

      // 4. Update the ensemble predictions
      for (let i = 0; i < X.length; i++) {
        const stepVal = this.getTreeRegressorPrediction(tree.getRoot()!, X[i]);
        F[i] += lr * stepVal;
      }
    }
  }

  // Recursive leaf converter
  private convertLeafValuesToAverageResiduals(
    node: DecisionNode,
    X: number[][],
    residuals: number[]
  ) {
    if (node.isLeaf) {
      // Store the average residual value directly in the node
      const n = X.length;
      if (n === 0) {
        node.prediction = 0;
        return;
      }
      let sum = 0;
      residuals.forEach((r) => (sum += r));
      node.prediction = sum / n;
      return;
    }

    // Split residuals and X
    const leftX: number[][] = [];
    const leftRes: number[] = [];
    const rightX: number[][] = [];
    const rightRes: number[] = [];

    for (let i = 0; i < X.length; i++) {
      if (X[i][node.featureIdx!] <= node.splitValue!) {
        leftX.push(X[i]);
        leftRes.push(residuals[i]);
      } else {
        rightX.push(X[i]);
        rightRes.push(residuals[i]);
      }
    }

    this.convertLeafValuesToAverageResiduals(node.left!, leftX, leftRes);
    this.convertLeafValuesToAverageResiduals(node.right!, rightX, rightRes);
  }

  private getTreeRegressorPrediction(node: DecisionNode, row: number[]): number {
    if (node.isLeaf) {
      return node.prediction || 0;
    }
    const val = row[node.featureIdx!];
    if (val <= node.splitValue!) {
      return this.getTreeRegressorPrediction(node.left!, row);
    } else {
      return this.getTreeRegressorPrediction(node.right!, row);
    }
  }

  predictProbs(X: number[][]): number[][] {
    return X.map((row) => {
      let logOdds = this.basePrediction;
      this.trees.forEach((tree) => {
        logOdds += this.hyperparameters.learningRate * this.getTreeRegressorPrediction(tree.getRoot()!, row);
      });
      const p1 = 1 / (1 + Math.exp(-logOdds));
      return [1 - p1, p1];
    });
  }

  predict(X: number[][]): number[] {
    const probs = this.predictProbs(X);
    return probs.map((rowProbs) => (rowProbs[1] >= 0.5 ? 1 : 0));
  }
}
