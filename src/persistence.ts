import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");

// Helper to ensure data directory exists
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// Atomic write helper to prevent file corruption
function saveJSONAtomic(filename: string, data: any) {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, filename);
  const tempPath = `${filePath}.tmp`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    console.error(`[PERSISTENCE ERROR] Failed to save ${filename}:`, error);
  }
}

// Read helper with fallback
function loadJSONWithFallback<T>(filename: string, fallback: T): T {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    console.error(`[PERSISTENCE ERROR] Failed to read ${filename}. Using fallback:`, error);
    return fallback;
  }
}

export interface TickData {
  timestamp: number;
  price: number;
  regime: string;
}

export function loadMarketHistory(fallback: any[]): any[] {
  return loadJSONWithFallback("marketHistory.json", fallback);
}

export function saveMarketHistory(history: any[]) {
  saveJSONAtomic("marketHistory.json", history);
}

export function loadFeaturePerformance(fallback: Record<string, any>): Record<string, any> {
  return loadJSONWithFallback("featurePerformanceRegistry.json", fallback);
}

export function saveFeaturePerformance(registry: Record<string, any>) {
  saveJSONAtomic("featurePerformanceRegistry.json", registry);
}

export function loadSymbolTicks(fallback: Record<string, TickData[]>): Record<string, TickData[]> {
  return loadJSONWithFallback("symbolTicks.json", fallback);
}

export function saveSymbolTicks(ticks: Record<string, TickData[]>) {
  saveJSONAtomic("symbolTicks.json", ticks);
}

export interface MT5AccountConfig {
  login: number;
  server: string;
  currency: string;
  leverage: string;
  balance: number;
  equity: number;
  marginFree: number;
  marginLevel: number;
  connected: boolean;
  lastConnectedAt: string;
}

export function loadMT5AccountConfig(fallback: MT5AccountConfig): MT5AccountConfig {
  return loadJSONWithFallback("mt5AccountConfig.json", fallback);
}

export function saveMT5AccountConfig(config: MT5AccountConfig) {
  saveJSONAtomic("mt5AccountConfig.json", config);
}

// MT5 prediction ledger — every AI prediction is stored so it can later be
// observed against live prices and scored WIN / LOSS (see src/mt5PredictionLedger.ts).
export function loadMT5Predictions<T>(fallback: T): T {
  return loadJSONWithFallback("mt5Predictions.json", fallback);
}

export function saveMT5Predictions(predictions: any) {
  saveJSONAtomic("mt5Predictions.json", predictions);
}
