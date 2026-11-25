/**
 * AMIS PHASE 5.0 — CENTRALIZED FEATURE STORE
 * Guarantees that training and inference always use identical feature definitions,
 * mathematical transforms, and validation rules.
 */

export interface FeatureDefinition {
  name: string;
  description: string;
  mathematicalDefinition: string;
  units: string;
  normalizationMethod: "MIN_MAX" | "Z_SCORE" | "RAW";
  version: string;
  dependencies: string[];
  validationRules: {
    min?: number;
    max?: number;
  };
  missingValueStrategy: "ZERO" | "MEAN" | "FORWARD_FILL";
}

export class FeatureStore {
  private static instance: FeatureStore;
  private registry: Map<string, FeatureDefinition> = new Map();
  private featureStats: Map<string, { min: number; max: number; mean: number; std: number }> = new Map();

  private constructor() {
    this.initializeRegistry();
  }

  public static getInstance(): FeatureStore {
    if (!FeatureStore.instance) {
      FeatureStore.instance = new FeatureStore();
    }
    return FeatureStore.instance;
  }

  private initializeRegistry() {
    // 1. Trend Strength (0 to 100)
    this.registerFeature({
      name: "trendStrength",
      description: "Linear strength of the trend computed over the lookback window.",
      mathematicalDefinition: "Coefficient of determination multiplied by direction multiplier.",
      units: "index",
      normalizationMethod: "MIN_MAX",
      version: "1.0.0",
      dependencies: ["trendAnalysis.trendStrength"],
      validationRules: { min: 0, max: 100 },
      missingValueStrategy: "MEAN"
    });

    // 2. Trend Slope
    this.registerFeature({
      name: "trendSlope",
      description: "The slope of the linear regression trendline.",
      mathematicalDefinition: "dY / dX of the fitted linear regression model.",
      units: "pct/interval",
      normalizationMethod: "Z_SCORE",
      version: "1.0.0",
      dependencies: ["trendAnalysis.trendlineSlope"],
      validationRules: { min: -1000, max: 1000 },
      missingValueStrategy: "ZERO"
    });

    // 3. Trend R2
    this.registerFeature({
      name: "trendR2",
      description: "R-squared value indicating the goodness of fit of the trendline.",
      mathematicalDefinition: "Explained Variance / Total Variance.",
      units: "ratio",
      normalizationMethod: "RAW",
      version: "1.0.0",
      dependencies: ["trendAnalysis.trendlineR2"],
      validationRules: { min: 0, max: 1 },
      missingValueStrategy: "ZERO"
    });

    // 4. RSI 14
    this.registerFeature({
      name: "rsi14",
      description: "Relative Strength Index calculated over 14 intervals.",
      mathematicalDefinition: "100 - (100 / (1 + RS)) where RS = avg_gain / avg_loss.",
      units: "percent",
      normalizationMethod: "MIN_MAX",
      version: "1.0.0",
      dependencies: ["momentumAnalysis.rsi14"],
      validationRules: { min: 0, max: 100 },
      missingValueStrategy: "MEAN"
    });

    // 5. Bollinger Bandwidth
    this.registerFeature({
      name: "bollingerBandwidth",
      description: "The width of the Bollinger Bands indicating current volatility compression.",
      mathematicalDefinition: "(Upper Band - Lower Band) / Middle Band.",
      units: "ratio",
      normalizationMethod: "Z_SCORE",
      version: "1.0.0",
      dependencies: ["volatilityAnalysis.bollingerBandwidth"],
      validationRules: { min: 0, max: 100 },
      missingValueStrategy: "MEAN"
    });

    // 6. Noise Ratio
    this.registerFeature({
      name: "noiseRatio",
      description: "The proportion of total volatility attributed to high-frequency noise.",
      mathematicalDefinition: "Noise Variance / Total Variance.",
      units: "ratio",
      normalizationMethod: "RAW",
      version: "1.0.0",
      dependencies: ["volatilityAnalysis.noiseRatio"],
      validationRules: { min: 0, max: 1 },
      missingValueStrategy: "ZERO"
    });

    // 7. Standard Deviation
    this.registerFeature({
      name: "stdDev",
      description: "Standard deviation of prices over the volatility window.",
      mathematicalDefinition: "Square root of variance.",
      units: "currency",
      normalizationMethod: "Z_SCORE",
      version: "1.0.0",
      dependencies: ["volatilityAnalysis.stdDev"],
      validationRules: { min: 0, max: 100000 },
      missingValueStrategy: "MEAN"
    });
  }

  public registerFeature(definition: FeatureDefinition) {
    this.registry.set(definition.name, definition);
  }

  public getFeature(name: string): FeatureDefinition | undefined {
    return this.registry.get(name);
  }

  public getAllFeatures(): FeatureDefinition[] {
    return Array.from(this.registry.values());
  }

  /**
   * Safe extraction of feature values from standard market predictions / snapshots
   */
  public extractFeatureRawValue(featureName: string, prediction: any): number | null {
    const def = this.getFeature(featureName);
    if (!def) return null;

    const snapshot = prediction?.marketSnapshot || prediction;
    if (!snapshot) return null;

    try {
      let val: any = null;
      if (featureName === "trendStrength") {
        val = snapshot.trendAnalysis?.trendStrength;
      } else if (featureName === "trendSlope") {
        val = snapshot.trendAnalysis?.trendlineSlope;
      } else if (featureName === "trendR2") {
        val = snapshot.trendAnalysis?.trendlineR2;
      } else if (featureName === "rsi14") {
        val = snapshot.momentumAnalysis?.rsi14;
      } else if (featureName === "bollingerBandwidth") {
        val = snapshot.volatilityAnalysis?.bollingerBandwidth;
      } else if (featureName === "noiseRatio") {
        val = snapshot.volatilityAnalysis?.noiseRatio;
      } else if (featureName === "stdDev") {
        val = snapshot.volatilityAnalysis?.stdDev;
      }

      if (val === undefined || val === null || isNaN(val)) {
        return null;
      }
      return Number(val);
    } catch (e) {
      return null;
    }
  }

  /**
   * Sets statistics for normalization
   */
  public calculateStats(featuresArray: Record<string, number>[]) {
    const keys = Array.from(this.registry.keys());
    keys.forEach((key) => {
      const vals = featuresArray
        .map((f) => f[key])
        .filter((v) => v !== undefined && v !== null && !isNaN(v));

      if (vals.length === 0) {
        this.featureStats.set(key, { min: 0, max: 1, mean: 0, std: 1 });
        return;
      }

      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const sum = vals.reduce((a, b) => a + b, 0);
      const mean = sum / vals.length;
      const squaredDiffs = vals.map((v) => Math.pow(v - mean, 2));
      const variance = squaredDiffs.reduce((a, b) => a + b, 0) / vals.length;
      const std = Math.sqrt(variance) || 1e-6;

      this.featureStats.set(key, { min, max, mean, std });
    });
  }

  public getStats(featureName: string) {
    return this.featureStats.get(featureName) || { min: 0, max: 1, mean: 0, std: 1 };
  }

  /**
   * Normalize a value based on registered method
   */
  public normalize(featureName: string, value: number): number {
    const def = this.getFeature(featureName);
    if (!def) return value;

    const stats = this.getStats(featureName);

    // Apply validation limits before normalization
    let checkedVal = value;
    if (def.validationRules.min !== undefined && checkedVal < def.validationRules.min) {
      checkedVal = def.validationRules.min;
    }
    if (def.validationRules.max !== undefined && checkedVal > def.validationRules.max) {
      checkedVal = def.validationRules.max;
    }

    if (def.normalizationMethod === "MIN_MAX") {
      const denom = (stats.max - stats.min) || 1e-6;
      return (checkedVal - stats.min) / denom;
    } else if (def.normalizationMethod === "Z_SCORE") {
      return (checkedVal - stats.mean) / stats.std;
    }

    return checkedVal; // RAW
  }
}

export const mlFeatureStore = FeatureStore.getInstance();
