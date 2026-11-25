import { callMoonshotAI } from './server';

// Define interfaces
interface ScanningSession {
  id: string;
  status: 'scanning' | 'completed' | 'failed';
  progress: number;
  marketsAnalyzed: number;
  bestMarket: string | null;
  analysisResults: any[];
  startTime: number;
  lastUpdate: number;
}

interface ChartAnalysisResult {
  symbol: string;
  trendAnalysis: {
    primaryTrend: string;
    trendStrength: number;
    trendLines: Array<{
      type: string;
      slope: number;
      confidence: number;
    }>;
  };
  keyLevels: {
    support: Array<{ level: number; strength: number; description: string }>;
    resistance: Array<{ level: number; strength: number; description: string }>;
    psychological: number[];
  };
  patterns: Array<{
    name: string;
    confidence: number;
    description: string;
  }>;
  liquidityZones: Array<{
    type: string;
    level: number;
    strength: number;
    description: string;
  }>;
  tradingSetup: {
    direction: string;
    entryZone: { min: number; max: number };
    stopLoss: number;
    takeProfit: Array<{ level: number; confidence: number }>;
    riskRewardRatio: number;
    confidence: number;
    positionSizePercent: number;
  };
  marketContext: {
    volatilityRegime: string;
    marketCondition: string;
    timeframeAlignment: string;
  };
}

interface MT5ScanResult {
  success: boolean;
  timestamp?: number;
  markets?: any[];
  best?: {
    symbol: string;
    score: number;
    liquidity?: boolean;
    timeframes?: Record<string, any>;
  };
  error?: string;
}

export class MoonshotAIController {
  private static instance: MoonshotAIController;
  private scanningSessions: Map<string, ScanningSession> = new Map();

  private constructor() {}

  public static getInstance(): MoonshotAIController {
    if (!MoonshotAIController.instance) {
      MoonshotAIController.instance = new MoonshotAIController();
    }
    return MoonshotAIController.instance;
  }

  // Start a scanning session for real-time panel updates.
  // The server calls this from /api/moonshot/scan/enhanced — the session
  // is then polled via getSessionStatus until it reaches completed/failed.
  public async startScanningSession(sessionId: string, _requestData: any): Promise<void> {
    const session: ScanningSession = {
      id: sessionId,
      status: 'scanning',
      progress: 0,
      marketsAnalyzed: 0,
      bestMarket: null,
      analysisResults: [],
      startTime: Date.now(),
      lastUpdate: Date.now()
    };
    this.scanningSessions.set(sessionId, session);
    // The heavy lifting (mt5_scanner.py → Moonshot AI) is invoked separately
    // by the caller; this method just seeds the session so getSessionStatus
    // can report a meaningful state. Progress is updated by callers via the
    // emitUpdate-style pattern or by re-calling startScanningSession to refresh.
    try {
      const { callMoonshotAI } = await import('./server');
      void callMoonshotAI; // imported for side-effects / future use
    } catch { /* server import may be circular — ignore */ }
  }

  // Get session status for real-time panel updates.
  // Returns undefined when the session ID is unknown or expired.
  public getSessionStatus(sessionId: string): ScanningSession | undefined {
    return this.scanningSessions.get(sessionId);
  }
}

export const moonshotController = MoonshotAIController.getInstance();