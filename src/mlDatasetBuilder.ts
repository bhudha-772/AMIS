import { mlFeatureStore, FeatureDefinition } from "./mlFeatureStore";

export interface DatasetStatistics {
  missingValueRatio: number;
  classBalance: Record<string, number>; // class ID to percentage/count
  featureStats: Record<string, { min: number; max: number; mean: number; std: number }>;
}

export interface MLDataset {
  datasetId: string;
  creationTimestamp: number;
  version: string;
  featureSchema: FeatureDefinition[];
  targetSchema: {
    name: string;
    description: string;
    type: "BINARY" | "MULTICLASS";
    classes: string[];
  };
  sourceDataRange: {
    start: number;
    end: number;
  };
  numSamples: number;
  numMarkets: number;
  numFeatures: number;
  X: number[][]; // [sampleIdx][featureIdx] - normalized
  Y: number[];   // [sampleIdx] - target classes
  metadata: {
    horizon: string;
    symbolList: string[];
    rawIds: string[];
    rawTimestamps: number[];
  };
  statistics: DatasetStatistics;
  missingValueReport: Record<string, number>; // feature name to missing count
}

export class DatasetBuilder {
  private static instance: DatasetBuilder;

  private constructor() {}

  public static getInstance(): DatasetBuilder {
    if (!DatasetBuilder.instance) {
      DatasetBuilder.instance = new DatasetBuilder();
    }
    return DatasetBuilder.instance;
  }

  /**
   * Main function to build an ML dataset from research predictions
   */
  public buildDataset(
    predictions: any[],
    horizon: string = "3m",
    version: string = "v1.0.0",
    isMulticlass: boolean = false,
    flatThresholdPct: number = 0.05
  ): MLDataset {
    // 1. Sort chronologically to preserve chronological integrity (Critical Rule)
    const sortedPredictions = [...predictions]
      .filter((p) => p && p.timestamp)
      .sort((a, b) => a.timestamp - b.timestamp);

    const featureSchema = mlFeatureStore.getAllFeatures();
    const X_raw: Record<string, number>[] = [];
    const Y: number[] = [];
    const validPredictionsUsed: any[] = [];
    const missingValueReport: Record<string, number> = {};

    // Initialize missing value report counts
    featureSchema.forEach((f) => {
      missingValueReport[f.name] = 0;
    });

    const marketsSet = new Set<string>();

    for (const pred of sortedPredictions) {
      // Ensure the prediction timeframe aligns with our desired horizon or is usable
      // Wait, let's use all resolved predictions that have a valid price outcome
      const outcome = pred.actualOutcome;
      if (!pred.resolved || !outcome || outcome.percentageChange === undefined || outcome.percentageChange === null) {
        continue;
      }

      // Extract raw features
      const featuresObj: Record<string, number> = {};
      let isSampleUsable = true;

      for (const f of featureSchema) {
        let val = mlFeatureStore.extractFeatureRawValue(f.name, pred);

        if (val === null) {
          missingValueReport[f.name]++;
          // Apply missing value strategy
          if (f.missingValueStrategy === "ZERO") {
            val = 0;
          } else {
            // Placeholder: will fill with mean after we compute stats
            val = NaN;
          }
        }

        featuresObj[f.name] = val;
      }

      // Determine Target Y (binary or multi-class)
      const changePct = outcome.percentageChange; // in percent (e.g. +0.5%)
      let targetVal = 0;

      if (isMulticlass) {
        if (changePct > flatThresholdPct) {
          targetVal = 1; // UP
        } else if (changePct < -flatThresholdPct) {
          targetVal = 2; // DOWN
        } else {
          targetVal = 0; // FLAT
        }
      } else {
        // Binary: UP vs DOWN (with flat folded into 0 or ignored, let's do UP > 0 is 1, else 0)
        targetVal = changePct > 0 ? 1 : 0;
      }

      X_raw.push(featuresObj);
      Y.push(targetVal);
      validPredictionsUsed.push(pred);
      if (pred.market) marketsSet.add(pred.market);
    }

    if (X_raw.length === 0) {
      throw new Error(`Zero samples found with resolved outcomes for horizon ${horizon}.`);
    }

    // Compute stats for scaling/normalization (Feature Store)
    // We filter out any remaining NaNs in X_raw to compute the stats properly
    mlFeatureStore.calculateStats(X_raw);

    // Apply scaling/normalization and handle "MEAN" missing value strategy
    const X: number[][] = [];
    X_raw.forEach((sampleObj) => {
      const normalizedSample: number[] = [];
      featureSchema.forEach((f) => {
        let val = sampleObj[f.name];
        if (isNaN(val)) {
          // Fill with mean calculated from Feature Store
          const stats = mlFeatureStore.getStats(f.name);
          val = stats.mean;
        }
        // Normalize
        const normVal = mlFeatureStore.normalize(f.name, val);
        normalizedSample.push(normVal);
      });
      X.push(normalizedSample);
    });

    // Calculate detailed statistics
    const totalFeatureSlots = X_raw.length * featureSchema.length;
    const totalMissing = Object.values(missingValueReport).reduce((a, b) => a + b, 0);
    const missingValueRatio = totalMissing / totalFeatureSlots;

    // Class balance counts
    const classCounts: Record<number, number> = {};
    Y.forEach((val) => {
      classCounts[val] = (classCounts[val] || 0) + 1;
    });

    const classBalance: Record<string, number> = {};
    const classNames = isMulticlass ? ["FLAT", "UP", "DOWN"] : ["DOWN_FLAT", "UP"];
    classNames.forEach((name, idx) => {
      const count = classCounts[idx] || 0;
      classBalance[name] = count / Y.length;
    });

    const featureStats: Record<string, { min: number; max: number; mean: number; std: number }> = {};
    featureSchema.forEach((f) => {
      featureStats[f.name] = mlFeatureStore.getStats(f.name);
    });

    const datasetId = `DS-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const creationTimestamp = Date.now();

    const startTimestamp = validPredictionsUsed[0].timestamp;
    const endTimestamp = validPredictionsUsed[validPredictionsUsed.length - 1].timestamp;

    return {
      datasetId,
      creationTimestamp,
      version,
      featureSchema,
      targetSchema: {
        name: "marketDirection",
        description: isMulticlass 
          ? "Market direction classified as UP, DOWN, or FLAT based on price change."
          : "Market direction classified as UP or DOWN/FLAT.",
        type: isMulticlass ? "MULTICLASS" : "BINARY",
        classes: classNames
      },
      sourceDataRange: {
        start: startTimestamp,
        end: endTimestamp
      },
      numSamples: X.length,
      numMarkets: marketsSet.size,
      numFeatures: featureSchema.length,
      X,
      Y,
      metadata: {
        horizon,
        symbolList: Array.from(marketsSet),
        rawIds: validPredictionsUsed.map((p) => p.id),
        rawTimestamps: validPredictionsUsed.map((p) => p.timestamp)
      },
      statistics: {
        missingValueRatio,
        classBalance,
        featureStats
      },
      missingValueReport
    };
  }
}

export const mlDatasetBuilder = DatasetBuilder.getInstance();
