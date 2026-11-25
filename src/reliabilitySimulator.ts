import { modelGovernance } from "./modelGovernance";
import { supervisorEngine } from "./supervisorEngine";
import { calculateEMA, calculateBollingerBands, calculateRSI } from "./utils/technicalIndicators";
import * as fs from "fs";
import * as path from "path";

export interface ReliabilityResult {
  totalTicksSimulated: number;
  durationMs: number;
  ticksPerSecond: number;
  initialHeapMb: number;
  finalHeapMb: number;
  heapDeltaMb: number;
  anomaliesDetected: number;
  peakLatencyMs: number;
  averageLatencyMs: number;
}

/**
 * Runs a high-performance 100,000 tick simulation to demonstrate system reliability,
 * O(1) scaling properties, and resource leak prevention (Part 6).
 */
export function runLongRunReliabilityTest(ticksCount: number = 100000): ReliabilityResult {
  console.log(`[RELIABILITY] Launching high-speed stress test with ${ticksCount} ticks...`);
  
  const initialMemory = process.memoryUsage().heapUsed;
  const startTime = Date.now();
  
  let currentPrice = 12500.0;
  const slidingWindow: number[] = [];
  const windowLimit = 50; // Strict sliding window boundary to prevent memory leaks

  let anomaliesCount = 0;
  let maxTickTime = 0;
  let totalTickTime = 0;

  for (let i = 0; i < ticksCount; i++) {
    const tickStart = performance.now();

    // 1. Brownian motion tick generation
    const drift = (Math.random() - 0.498) * 2; // Slight upward bias
    currentPrice += drift;

    // Maintain sliding window of prices
    slidingWindow.push(currentPrice);
    if (slidingWindow.length > windowLimit) {
      slidingWindow.shift();
    }

    // 2. Validate data quality
    const prevPrice = slidingWindow[slidingWindow.length - 2] || currentPrice;
    const isHealthy = modelGovernance.monitorDataQuality(
      "R_100",
      currentPrice,
      prevPrice,
      startTime + i * 1000,
      startTime + (i - 1) * 1000
    );
    
    if (!isHealthy) {
      anomaliesCount++;
    }

    // 3. Centralized indicators (EMA, BB, RSI)
    if (slidingWindow.length >= 14) {
      calculateEMA(slidingWindow, 5);
      calculateRSI(slidingWindow, 14);
      calculateBollingerBands(slidingWindow, 20);
    }

    // 4. Feed supervisor metrics
    supervisorEngine.recordTick(currentPrice);

    const tickEnd = performance.now();
    const elapsed = tickEnd - tickStart;
    totalTickTime += elapsed;
    if (elapsed > maxTickTime) {
      maxTickTime = elapsed;
    }
  }

  const endTime = Date.now();
  const durationMs = endTime - startTime;
  const finalMemory = process.memoryUsage().heapUsed;

  const initialHeapMb = Number((initialMemory / 1024 / 1024).toFixed(2));
  const finalHeapMb = Number((finalMemory / 1024 / 1024).toFixed(2));
  const heapDeltaMb = Number(((finalMemory - initialMemory) / 1024 / 1024).toFixed(2));
  const ticksPerSecond = Math.round(ticksCount / (durationMs / 1000 || 1));
  const averageLatencyMs = Number((totalTickTime / ticksCount).toFixed(4));
  const peakLatencyMs = Number(maxTickTime.toFixed(4));

  const result: ReliabilityResult = {
    totalTicksSimulated: ticksCount,
    durationMs,
    ticksPerSecond,
    initialHeapMb,
    finalHeapMb,
    heapDeltaMb,
    anomaliesDetected: anomaliesCount,
    peakLatencyMs,
    averageLatencyMs
  };

  // Persist long-term reliability logs
  try {
    const reportDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    const reportPath = path.join(reportDir, "long_run_reliability_report.json");
    fs.writeFileSync(reportPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      ...result
    }, null, 2), "utf8");
    console.log(`[RELIABILITY] Long-run report saved successfully at: ${reportPath}`);
  } catch (err) {
    console.error("[RELIABILITY] Failed to write report file:", err);
  }

  return result;
}
