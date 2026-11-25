export interface HorizonProbabilities {
  horizonLabel: string;
  probabilities: {
    up: number;
    down: number;
    sideways: number;
    continuation: number;
    reversal: number;
    breakout: number;
    fakeout: number;
    highVolatility: number;
    lowVolatility: number;
    liquiditySweep: number;
    trendFailure: number;
  };
  confidence: {
    score: number;
    tier: "VERY_HIGH" | "HIGH" | "MODERATE" | "LOW" | "VERY_LOW";
    explanation: string;
    components: {
      sampleSizeScore: number;
      similarityQualityScore: number;
      agreementScore: number;
      regimeConfidence: number;
      noisePenalty: number;
      contradictionPenalty: number;
    };
  };
  uncertainty: {
    score: number; // 0 to 100
    entropy: number;
    confidenceInterval: {
      lower: number;
      upper: number;
    };
    sampleSize: number;
  };
  expectedExcursions: {
    expectedMove: number;
    expectedDrawdown: number;
    expectedVolatility: number;
  };
  explainability: {
    matchedCases: Array<{
      caseId: string;
      timestamp: number;
      similarity: number;
      outcomeDirection: "UP" | "DOWN" | "FLAT";
      percentageChange: number;
      realizedVolatility: number;
      trendContinuation: boolean;
    }>;
    featureContributions: Array<{
      featureName: string;
      contributionPct: number;
      rawAlignment: number;
    }>;
    reasonsForUncertainty: string[];
    supportingIndicators: string[];
    contradictingIndicators: string[];
  };
}

export const DEFAULTS_PRIORS = {
  up: 0.35,
  down: 0.35,
  sideways: 0.30,
  continuation: 0.45,
  reversal: 0.30,
  breakout: 0.15,
  fakeout: 0.10,
  highVolatility: 0.20,
  lowVolatility: 0.50,
  liquiditySweep: 0.10,
  trendFailure: 0.15
};

const FEATURE_WEIGHTS = {
  regime: 0.25,
  trendStrength: 0.20,
  rsi: 0.20,
  bollingerBandwidth: 0.15,
  direction: 0.10,
  cognitiveState: 0.10
};

// Calculate deterministic similarity score [0, 1] between current and historical snapshot
export function calculateSimilarity(snapA: any, snapB: any, weights?: any): number {
  if (!snapA || !snapB) return 0;

  const regimeMatch = snapA.marketRegime?.dominantRegime === snapB.marketRegime?.dominantRegime ? 1.0 : 0.0;
  
  const trendStrengthDiff = Math.abs((snapA.trendAnalysis?.trendStrength || 0) - (snapB.trendAnalysis?.trendStrength || 0)) / 100;
  const trendStrengthMatch = Math.max(0, 1 - trendStrengthDiff);
  
  const rsiDiff = Math.abs((snapA.momentumAnalysis?.rsi14 || 50) - (snapB.momentumAnalysis?.rsi14 || 50)) / 100;
  const rsiMatch = Math.max(0, 1 - rsiDiff);
  
  const bwA = snapA.volatilityAnalysis?.bollingerBandwidth || 1;
  const bwB = snapB.volatilityAnalysis?.bollingerBandwidth || 1;
  const bwDiff = Math.abs(bwA - bwB) / Math.max(bwA, bwB, 0.0001);
  const bwMatch = Math.max(0, 1 - bwDiff);
  
  const structureMatch = snapA.trendAnalysis?.direction === snapB.trendAnalysis?.direction ? 1.0 : 0.0;
  
  const cogMatch = snapA.relationshipAnalysis?.cognitiveState === snapB.relationshipAnalysis?.cognitiveState ? 1.0 : 0.0;

  const activeWeights = weights || FEATURE_WEIGHTS;
  const similarity = 
    (regimeMatch * activeWeights.regime) + 
    (trendStrengthMatch * activeWeights.trendStrength) + 
    (rsiMatch * activeWeights.rsi) + 
    (bwMatch * activeWeights.bollingerBandwidth) + 
    (structureMatch * activeWeights.direction) + 
    (cogMatch * activeWeights.cognitiveState);
    
  return Number(similarity.toFixed(4));
}

// Compute multi-horizon forecasts
export function computeHorizonForecast(
  horizonLabel: string,
  currentSnap: any,
  marketHistory: any[],
  weights?: any
): HorizonProbabilities {
  // 1. Find resolved cases (where the specific horizon has elapsed and symbol matches)
  const resolvedCases = marketHistory.filter(h => {
    return (
      h.market === currentSnap.market &&
      h.timestamp !== currentSnap.timestamp &&
      h.outcomes?.horizons?.[horizonLabel]?.elapsed === true
    );
  });

  // Calculate similarity for each resolved case
  const matches = resolvedCases
    .map(h => {
      const similarity = calculateSimilarity(currentSnap, h, weights);
      return { snapshot: h, similarity };
    })
    // Filter cases with similarity >= 0.70 (decent matches)
    .filter(m => m.similarity >= 0.70)
    // Sort by similarity descending
    .sort((a, b) => b.similarity - a.similarity)
    // Limit to top 30 cases to keep it highly performant
    .slice(0, 30);

  const sampleSize = matches.length;

  // 2. Compute probabilities
  const probs = { ...DEFAULTS_PRIORS };
  let avgSimilarity = 0.85; // baseline prior matching
  let expectedMove = 0.0;
  let expectedDrawdown = 0.0;
  let expectedVolatility = 0.20;

  const matchedCasesExplain: any[] = [];
  const featureAlignmentsSum = {
    regime: 0,
    trendStrength: 0,
    rsi: 0,
    bollingerBandwidth: 0,
    direction: 0,
    cognitiveState: 0
  };

  if (sampleSize > 0) {
    let upCount = 0;
    let downCount = 0;
    let sidewaysCount = 0;
    let continuationCount = 0;
    let reversalCount = 0;
    let breakoutCount = 0;
    let fakeoutCount = 0;
    let highVolCount = 0;
    let lowVolCount = 0;
    let liquiditySweepCount = 0;
    let trendFailureCount = 0;

    let similaritySum = 0;
    let priceChangeSum = 0;
    let realizedVolSum = 0;
    let drawdownSum = 0;

    matches.forEach(m => {
      const hSnap = m.snapshot;
      const sim = m.similarity;
      const hOutcome = hSnap.outcomes.horizons[horizonLabel];

      similaritySum += sim;
      priceChangeSum += hOutcome.percentageChange;
      realizedVolSum += hOutcome.realizedVolatility;
      drawdownSum += hOutcome.maxAdverseExcursion;

      // Evaluation counters
      const pct = hOutcome.percentageChange;
      if (pct > 0.05) upCount++;
      else if (pct < -0.05) downCount++;
      else sidewaysCount++;

      if (hOutcome.trendContinuation) continuationCount++;
      if (hOutcome.trendFailure) trendFailureCount++;

      // Reversal definition
      const dir = currentSnap.trendAnalysis?.direction || "CONSOLIDATING";
      const isReversal = (dir === "BULLISH" && pct < -0.05) || (dir === "BEARISH" && pct > 0.05);
      if (isReversal) reversalCount++;

      // Breakout definition
      const isBreakout = Math.abs(pct) > 0.15 || hOutcome.realizedVolatility > 0.40;
      if (isBreakout) breakoutCount++;

      // Fakeout definition
      const isFakeout = hOutcome.maxFavorableExcursion > 0.10 && Math.abs(pct) < 0.03;
      if (isFakeout) fakeoutCount++;

      // Volatility
      if (hOutcome.realizedVolatility > 0.35) highVolCount++;
      if (hOutcome.realizedVolatility < 0.12) lowVolCount++;

      // Sweep
      if (hSnap.liquidityAnalysis?.liquiditySweepHigh || hSnap.liquidityAnalysis?.liquiditySweepLow) {
        liquiditySweepCount++;
      }

      // Feature alignments
      featureAlignmentsSum.regime += currentSnap.marketRegime?.dominantRegime === hSnap.marketRegime?.dominantRegime ? 1.0 : 0.0;
      featureAlignmentsSum.trendStrength += 1 - Math.abs((currentSnap.trendAnalysis?.trendStrength || 0) - (hSnap.trendAnalysis?.trendStrength || 0)) / 100;
      featureAlignmentsSum.rsi += 1 - Math.abs((currentSnap.momentumAnalysis?.rsi14 || 50) - (hSnap.momentumAnalysis?.rsi14 || 50)) / 100;
      
      const bwCurr = currentSnap.volatilityAnalysis?.bollingerBandwidth || 1;
      const bwMatch = hSnap.volatilityAnalysis?.bollingerBandwidth || 1;
      featureAlignmentsSum.bollingerBandwidth += 1 - Math.abs(bwCurr - bwMatch) / Math.max(bwCurr, bwMatch, 0.0001);
      
      featureAlignmentsSum.direction += currentSnap.trendAnalysis?.direction === hSnap.trendAnalysis?.direction ? 1.0 : 0.0;
      featureAlignmentsSum.cognitiveState += currentSnap.relationshipAnalysis?.cognitiveState === hSnap.relationshipAnalysis?.cognitiveState ? 1.0 : 0.0;

      matchedCasesExplain.push({
        caseId: hSnap.marketCaseFile?.caseId || `CASE-${hSnap.timestamp}`,
        timestamp: hSnap.timestamp,
        similarity: sim,
        outcomeDirection: pct > 0.05 ? "UP" : pct < -0.05 ? "DOWN" : "FLAT",
        percentageChange: pct,
        realizedVolatility: hOutcome.realizedVolatility,
        trendContinuation: hOutcome.trendContinuation
      });
    });

    // Compute Empirical Ratios
    probs.up = upCount / sampleSize;
    probs.down = downCount / sampleSize;
    probs.sideways = sidewaysCount / sampleSize;
    probs.continuation = continuationCount / sampleSize;
    probs.reversal = reversalCount / sampleSize;
    probs.breakout = breakoutCount / sampleSize;
    probs.fakeout = fakeoutCount / sampleSize;
    probs.highVolatility = highVolCount / sampleSize;
    probs.lowVolatility = lowVolCount / sampleSize;
    probs.liquiditySweep = liquiditySweepCount / sampleSize;
    probs.trendFailure = trendFailureCount / sampleSize;

    avgSimilarity = similaritySum / sampleSize;
    expectedMove = priceChangeSum / sampleSize;
    expectedDrawdown = drawdownSum / sampleSize;
    expectedVolatility = realizedVolSum / sampleSize;
  }

  // 3. Compute Confidence components
  const sampleSizeScore = Math.min(100, Math.round(100 * (1 - Math.exp(-sampleSize / 5))));
  const similarityQualityScore = Math.round(avgSimilarity * 100);
  const agreementScore = currentSnap.understandingConfidence?.score || 70;
  const regimeConfidence = currentSnap.marketRegime?.confidence || 80;
  const noisePenalty = Math.round((currentSnap.riskMetrics?.marketNoiseIndex || 1) * 6);
  const contradictionPenalty = currentSnap.relationshipAnalysis?.cognitiveState === "CONTRADICTION" ? 25 : currentSnap.relationshipAnalysis?.cognitiveState === "CONFLICT" ? 10 : 0;

  const confidenceScore = Math.max(10, Math.min(99, Math.round(
    (sampleSizeScore * 0.35) +
    (similarityQualityScore * 0.35) +
    (agreementScore * 0.15) +
    (regimeConfidence * 0.15) -
    noisePenalty -
    contradictionPenalty
  )));

  let confidenceTier: "VERY_HIGH" | "HIGH" | "MODERATE" | "LOW" | "VERY_LOW" = "MODERATE";
  if (confidenceScore >= 85) confidenceTier = "VERY_HIGH";
  else if (confidenceScore >= 70) confidenceTier = "HIGH";
  else if (confidenceScore >= 50) confidenceTier = "MODERATE";
  else if (confidenceScore >= 30) confidenceTier = "LOW";
  else confidenceTier = "VERY_LOW";

  const confidenceExplanation = `Estimated from ${sampleSize} historical instances. Statistical confidence is ${confidenceTier} (${confidenceScore}/100) based on similarity quality of ${similarityQualityScore}% and regime alignment.`;

  // 4. Compute Uncertainty & Entropy
  // Shannon Entropy: H = -sum(p * log2(p))
  const entropyTerms = [probs.up, probs.down, probs.sideways].map(p => {
    if (p <= 0 || p >= 1) return 0;
    return -p * Math.log2(p);
  });
  const entropy = entropyTerms.reduce((a, b) => a + b, 0);
  const maxEntropy = Math.log2(3); // 1.585 for 3 states
  const entropyPct = Math.round((entropy / maxEntropy) * 100);

  // Confidence Interval for Up Probability (Wald with Agresti-Coull correction)
  const adjustedN = sampleSize + 4;
  const adjustedP = (probs.up * sampleSize + 2) / adjustedN;
  const marginOfError = 1.96 * Math.sqrt((adjustedP * (1 - adjustedP)) / adjustedN);
  const lowerCI = Math.max(0.0, adjustedP - marginOfError);
  const upperCI = Math.min(1.0, adjustedP + marginOfError);

  const uncertaintyScore = Math.round((entropyPct * 0.6) + (adjustedN > 0 ? (100 / Math.sqrt(adjustedN)) : 100) * 0.4);

  // 5. Feature Contributions
  const alignments = {
    regime: sampleSize > 0 ? featureAlignmentsSum.regime / sampleSize : 1.0,
    trendStrength: sampleSize > 0 ? featureAlignmentsSum.trendStrength / sampleSize : 1.0,
    rsi: sampleSize > 0 ? featureAlignmentsSum.rsi / sampleSize : 1.0,
    bollingerBandwidth: sampleSize > 0 ? featureAlignmentsSum.bollingerBandwidth / sampleSize : 1.0,
    direction: sampleSize > 0 ? featureAlignmentsSum.direction / sampleSize : 1.0,
    cognitiveState: sampleSize > 0 ? featureAlignmentsSum.cognitiveState / sampleSize : 1.0
  };

  const weightedSum = 
    (alignments.regime * FEATURE_WEIGHTS.regime) +
    (alignments.trendStrength * FEATURE_WEIGHTS.trendStrength) +
    (alignments.rsi * FEATURE_WEIGHTS.rsi) +
    (alignments.bollingerBandwidth * FEATURE_WEIGHTS.bollingerBandwidth) +
    (alignments.direction * FEATURE_WEIGHTS.direction) +
    (alignments.cognitiveState * FEATURE_WEIGHTS.cognitiveState) || 1.0;

  const featureContributions = [
    { featureName: "Market Regime", rawAlignment: alignments.regime, contributionPct: Math.round(((alignments.regime * FEATURE_WEIGHTS.regime) / weightedSum) * 100) },
    { featureName: "Trend Strength", rawAlignment: alignments.trendStrength, contributionPct: Math.round(((alignments.trendStrength * FEATURE_WEIGHTS.trendStrength) / weightedSum) * 100) },
    { featureName: "RSI Momentum", rawAlignment: alignments.rsi, contributionPct: Math.round(((alignments.rsi * FEATURE_WEIGHTS.rsi) / weightedSum) * 100) },
    { featureName: "Bollinger Squeeze", rawAlignment: alignments.bollingerBandwidth, contributionPct: Math.round(((alignments.bollingerBandwidth * FEATURE_WEIGHTS.bollingerBandwidth) / weightedSum) * 100) },
    { featureName: "Trend Vector", rawAlignment: alignments.direction, contributionPct: Math.round(((alignments.direction * FEATURE_WEIGHTS.direction) / weightedSum) * 100) },
    { featureName: "Cognitive State", rawAlignment: alignments.cognitiveState, contributionPct: Math.round(((alignments.cognitiveState * FEATURE_WEIGHTS.cognitiveState) / weightedSum) * 100) }
  ];

  // 6. Reasons for Uncertainty & Indicators
  const reasonsForUncertainty: string[] = [];
  if (sampleSize < 5) {
    reasonsForUncertainty.push(`Extremely small historical sample size (${sampleSize} similar cases). Estimates revert close to priors.`);
  }
  if (entropy > 1.2) {
    reasonsForUncertainty.push("High directional entropy indicating historical results were evenly split between bullish, bearish, and sideways.");
  }
  if (currentSnap.relationshipAnalysis?.cognitiveState === "CONTRADICTION") {
    reasonsForUncertainty.push("Cognitive state shows a deep technical contradiction (momentum divergence vs heavy trend strength).");
  }
  if (currentSnap.riskMetrics?.marketNoiseIndex > 2.0) {
    reasonsForUncertainty.push("Significant short-term market noise, reducing pattern prediction reliability.");
  }

  const supportingIndicators: string[] = [];
  const contradictingIndicators: string[] = [];

  const mainDir = currentSnap.trendAnalysis?.direction;
  if (mainDir === "BULLISH") {
    supportingIndicators.push(`Macro trend EMA crossover is bullish.`);
    if (currentSnap.momentumAnalysis?.rsi14 > 50) supportingIndicators.push(`RSI is expanding above 50.`);
    if (currentSnap.momentumAnalysis?.macdLine > currentSnap.momentumAnalysis?.macdSignal) supportingIndicators.push(`MACD Line is above Signal.`);
    else contradictingIndicators.push(`MACD shows localized bearish divergence / compression.`);
  } else if (mainDir === "BEARISH") {
    supportingIndicators.push(`Macro trend EMA crossover is bearish.`);
    if (currentSnap.momentumAnalysis?.rsi14 < 50) supportingIndicators.push(`RSI is compressing below 50.`);
    if (currentSnap.momentumAnalysis?.macdLine < currentSnap.momentumAnalysis?.macdSignal) supportingIndicators.push(`MACD Line is below Signal.`);
    else contradictingIndicators.push(`MACD shows bullish momentum expansion.`);
  }

  return {
    horizonLabel,
    probabilities: probs,
    confidence: {
      score: confidenceScore,
      tier: confidenceTier,
      explanation: confidenceExplanation,
      components: {
        sampleSizeScore,
        similarityQualityScore,
        agreementScore,
        regimeConfidence,
        noisePenalty,
        contradictionPenalty
      }
    },
    uncertainty: {
      score: uncertaintyScore,
      entropy: Number(entropy.toFixed(4)),
      confidenceInterval: {
        lower: Number(lowerCI.toFixed(4)),
        upper: Number(upperCI.toFixed(4))
      },
      sampleSize
    },
    expectedExcursions: {
      expectedMove: Number(expectedMove.toFixed(4)),
      expectedDrawdown: Number(expectedDrawdown.toFixed(4)),
      expectedVolatility: Number(expectedVolatility.toFixed(4))
    },
    explainability: {
      matchedCases: matchedCasesExplain,
      featureContributions,
      reasonsForUncertainty,
      supportingIndicators,
      contradictingIndicators
    }
  };
}
