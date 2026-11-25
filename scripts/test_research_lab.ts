import { researchLab, ResearchPrediction, PaperTrade, JournalEntry } from "../src/researchLab";

/**
 * AMIS LIVE RESEARCH LABORATORY & SIMULATION AUTOMATED VERIFICATION SUITE
 */

function runVerificationSuite() {
  console.log("==========================================================================");
  console.log("🧪 AMIS PHASE 4.7 VERIFICATION SUITE: LABORATORY & PAPER TRADING");
  console.log("==========================================================================\n");

  const mockSnapshot = {
    market: "BTCUSDT",
    timestamp: Date.now() - 200000, // 200 seconds ago
    currentPrice: 95000,
    trendAnalysis: {
      direction: "BULLISH",
      trendStrength: 85,
      trendlineR2: 0.9,
      trendlineSlope: 2.5
    },
    momentumAnalysis: {
      rsi14: 65
    },
    volatilityAnalysis: {
      bollingerBandwidth: 2.5,
      noiseRatio: 0.25,
      stdDev: 1500
    },
    marketRegime: {
      dominantRegime: "BULLISH_TREND"
    }
  };

  const mockHistory = [
    {
      ...mockSnapshot,
      timestamp: Date.now() - 500000,
      outcomes: {
        horizons: {
          "3m": { elapsed: true, percentageChange: 1.5, finalRegime: "BULLISH_TREND" }
        }
      }
    },
    {
      ...mockSnapshot,
      timestamp: Date.now() - 400000,
      outcomes: {
        horizons: {
          "3m": { elapsed: true, percentageChange: -0.8, finalRegime: "BULLISH_TREND" }
        }
      }
    }
  ];

  // 1. Test Prediction Generation
  console.log("🤖 Step 1: Testing Prediction Generation...");
  const prediction = researchLab.registerLivePrediction(
    "BTCUSDT",
    "3m",
    95000,
    mockSnapshot,
    mockHistory
  );

  if (!prediction.id || prediction.market !== "BTCUSDT" || prediction.currentPrice !== 95000) {
    throw new Error("❌ Prediction Generation failed to map fields correctly.");
  }
  console.log(`✅ Live Prediction generated: ${prediction.id}`);
  console.log(`   Confidence Score: ${prediction.confidence.toFixed(1)}%`);
  console.log(`   Regime: ${prediction.regime}`);

  // 2. Test Paper Trading & Journal Log Initialization
  console.log("\n📈 Step 2: Testing Paper Trading & Journal Creation...");
  const activeTrades = researchLab.getTrades();
  const activeJournal = researchLab.getJournal();

  const correspondingTrade = activeTrades.find(t => t.predictionId === prediction.id);
  const correspondingJournal = activeJournal.find(j => j.tradeId === correspondingTrade?.id);

  if (!correspondingTrade) {
    throw new Error("❌ Paper Trade was not auto-opened despite high prediction confidence.");
  }
  console.log(`✅ Paper Trade initialized: ${correspondingTrade.id}`);
  console.log(`   Direction: ${correspondingTrade.direction} | Entry: ${correspondingTrade.entryPrice} USDT`);
  console.log(`   Stop Loss: ${correspondingTrade.stopLoss.toFixed(2)} USDT | Take Profit: ${correspondingTrade.takeProfit.toFixed(2)} USDT`);

  if (!correspondingJournal) {
    throw new Error("❌ Journal Entry was not created for the active paper trade.");
  }
  console.log(`✅ Immutable Research Journal Entry logged: ${correspondingJournal.id}`);
  console.log(`   Reasoning Summary: ${correspondingJournal.entryReasoning}`);

  // 3. Test Outcome Evaluation (Simulating TP hit)
  console.log("\n⚖️ Step 3: Testing Outcome Evaluation Loop...");
  const tpPrice = correspondingTrade.takeProfit + 500; // price exceeds TP target
  const evalTime = Date.now() + 250000; // elapsed past prediction horizon

  researchLab.evaluateOutcomes(tpPrice, evalTime, "BULLISH_TREND");

  const updatedTrade = researchLab.getTrades().find(t => t.id === correspondingTrade.id);
  const updatedPrediction = researchLab.getPredictions().find(p => p.id === prediction.id);

  if (updatedTrade?.status !== "COMPLETED" || updatedTrade.exitReason !== "TAKE_PROFIT") {
    throw new Error(`❌ Paper Trade failed to resolve correctly. Status: ${updatedTrade?.status}, Reason: ${updatedTrade?.exitReason}`);
  }
  console.log(`✅ Paper Trade closed successfully! Reason: ${updatedTrade.exitReason}`);
  console.log(`   Simulated Net Profit: ${updatedTrade.profit?.toFixed(2)} USDT (${updatedTrade.returnPct?.toFixed(2)}%)`);
  console.log(`   Execution Trade Quality Score: ${updatedTrade.tradeQuality}/100`);

  if (!updatedPrediction?.resolved || !updatedPrediction.actualOutcome) {
    throw new Error("❌ Prediction was not marked as resolved/evaluated.");
  }
  console.log(`✅ Live Prediction resolved correctly!`);
  console.log(`   Directional Correctness: ${updatedPrediction.actualOutcome.predictionCorrect ? "WIN" : "LOSS"}`);
  console.log(`   Max Favorable Excursion (MFE): ${updatedPrediction.actualOutcome.maxFavorableExcursion.toFixed(2)}%`);

  // 4. Test Performance Metrics and Analytics Engine
  console.log("\n📊 Step 4: Testing Performance Metrics Calculation...");
  const metrics = researchLab.getPerformanceMetrics();
  console.log(`✅ Metrics Engine initialized:`);
  console.log(`   Overall Forecast Accuracy: ${(metrics.overallAccuracy * 100).toFixed(1)}%`);
  console.log(`   Brier Score: ${metrics.brierScore.toFixed(4)} | Log Loss: ${metrics.logLoss.toFixed(4)}`);
  console.log(`   Simulated Paper Win Rate: ${(metrics.winRate * 100).toFixed(1)}%`);
  console.log(`   Profit Factor: ${metrics.profitFactor.toFixed(2)}`);
  console.log(`   Sharpe Ratio: ${metrics.sharpeRatio.toFixed(4)} | Sortino Ratio: ${metrics.sortinoRatio.toFixed(4)}`);

  // 5. Test Self-Diagnostics and Alert Triggers
  console.log("\n🚨 Step 5: Testing Continuous Self-Diagnostics...");
  const alerts = researchLab.getAlerts();
  console.log(`✅ Self-Diagnostics completed successfully:`);
  console.log(`   Active Alerts Count: ${alerts.length}`);
  alerts.forEach(alt => {
    console.log(`   [${alt.severity}] ${alt.type}: ${alt.message} -> Action: ${alt.suggestedAction}`);
  });

  // 6. Test Data Export Feature
  console.log("\n💾 Step 6: Testing Multiformat Data Export...");
  const jsonExport = researchLab.exportData("trades", "json");
  const csvExport = researchLab.exportData("trades", "csv");

  if (!jsonExport.startsWith("[") || !csvExport.includes("id")) {
    throw new Error("❌ Export generation failed or format corrupted.");
  }
  console.log(`✅ Data Export Verified: JSON string is valid, CSV contains headers.`);

  console.log("\n==========================================================================");
  console.log("🔬 AUDIT LOG SUMMARY: ALL LIVE RESEARCH LABORATORY VERIFICATIONS PASSED!");
  console.log("==========================================================================\n");
}

try {
  runVerificationSuite();
} catch (error: any) {
  console.error("❌ VERIFICATION TEST FAILED:", error.message || error);
  process.exit(1);
}
