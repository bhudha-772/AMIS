import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Layers,
  ShieldAlert,
  Target,
  Zap,
  Activity,
  Maximize2,
  ChevronDown,
  ChevronUp,
  Sliders,
  Crosshair,
  Compass,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import {
  SMCAnalysisResult,
  SMCTradeSetup,
  OrderBlock,
  FairValueGap,
  MarketStructureEvent,
  LiquiditySweep,
  runSMCAnalysis
} from '../smcEngine';
import { CandleData, buildCandlesFromTicks, normalizeCandles } from '../unifiedCandles';

interface SMCPanelProps {
  analysis?: SMCAnalysisResult | null;
  candles?: CandleData[];
  prices?: number[];
  symbol?: string;
  provider?: 'MT5' | 'DERIV' | 'BINANCE';
  currentPrice?: number;
  onApplySetup?: (setup: SMCTradeSetup) => void;
  compact?: boolean;
}

export const SMCPanel: React.FC<SMCPanelProps> = ({
  analysis: externalAnalysis,
  candles: inputCandles,
  prices: inputPrices,
  symbol = 'MARKET',
  provider = 'DERIV',
  currentPrice,
  onApplySetup,
  compact = false
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'orderBlocks' | 'fvg' | 'structure' | 'liquidity'>('overview');
  const [isExpanded, setIsExpanded] = useState<boolean>(!compact);
  const [lookback, setLookback] = useState<number>(3);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);

  // Compute analysis if not externally supplied
  const smcResult = useMemo<SMCAnalysisResult>(() => {
    if (externalAnalysis) return externalAnalysis;

    let candles: CandleData[] = [];
    if (inputCandles && inputCandles.length > 0) {
      candles = inputCandles;
    } else if (inputPrices && inputPrices.length > 0) {
      candles = buildCandlesFromTicks(inputPrices, 5);
    }

    if (candles.length > 0) {
      return runSMCAnalysis(candles, symbol, provider, lookback);
    }

    return {
      symbol,
      provider,
      candleCount: 0,
      analysisTimestamp: Date.now(),
      overallBias: 'NEUTRAL',
      biasStrength: 'WEAK',
      biasConfidence: 50,
      swingPoints: [],
      orderBlocks: [],
      fairValueGaps: [],
      liquiditySweeps: [],
      equalHighs: [],
      equalLows: [],
      structureEvents: [],
      premiumDiscount: {
        equilibrium: currentPrice || 0,
        premiumTop: (currentPrice || 0) * 1.01,
        premiumBottom: (currentPrice || 0) * 1.005,
        discountTop: (currentPrice || 0) * 0.995,
        discountBottom: (currentPrice || 0) * 0.99,
        currentZone: 'EQUILIBRIUM',
        biasedDirection: 'NEUTRAL'
      },
      inducementLevels: [],
      keyResistance: [],
      keySupport: [],
      nearestOB: null,
      nearestFVG: null,
      lastBOS: null,
      lastChoCH: null,
      tradeSetup: null,
      summary: ['No candle stream available for live SMC evaluation.']
    };
  }, [externalAnalysis, inputCandles, inputPrices, symbol, provider, lookback, currentPrice]);

  const {
    overallBias,
    biasStrength,
    biasConfidence,
    orderBlocks,
    fairValueGaps,
    liquiditySweeps,
    equalHighs,
    equalLows,
    structureEvents,
    premiumDiscount,
    tradeSetup,
    summary,
    nearestOB,
    nearestFVG,
    lastBOS,
    lastChoCH
  } = smcResult;

  const biasColor =
    overallBias === 'BULLISH'
      ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
      : overallBias === 'BEARISH'
      ? 'text-rose-400 border-rose-500/30 bg-rose-500/10'
      : 'text-amber-400 border-amber-500/30 bg-amber-500/10';

  const zoneColor =
    premiumDiscount.currentZone === 'DISCOUNT'
      ? 'text-emerald-400 bg-emerald-500/20 border-emerald-500/40'
      : premiumDiscount.currentZone === 'PREMIUM'
      ? 'text-rose-400 bg-rose-500/20 border-rose-500/40'
      : 'text-amber-400 bg-amber-500/20 border-amber-500/40';

  const handleApply = (setup: SMCTradeSetup) => {
    if (onApplySetup) {
      onApplySetup(setup);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
    }
  };

  return (
    <div className="w-full bg-slate-900/95 border border-slate-800/80 rounded-xl overflow-hidden shadow-2xl backdrop-blur-md">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-950/60 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white tracking-wide">
                Smart Money Concepts (SMC) Engine
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                {provider}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                {symbol}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Institutional Order Flow, Liquidity Sweeps & Market Structure Analysis
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Bias Badge */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${biasColor}`}>
            {overallBias === 'BULLISH' && <TrendingUp className="w-3.5 h-3.5" />}
            {overallBias === 'BEARISH' && <TrendingDown className="w-3.5 h-3.5" />}
            {overallBias === 'NEUTRAL' && <Minus className="w-3.5 h-3.5" />}
            <span>{overallBias}</span>
            <span className="text-[10px] opacity-75 font-mono">({biasConfidence}%)</span>
          </div>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* Market Bias & Strength */}
            <div className="p-3 bg-slate-800/40 border border-slate-700/60 rounded-lg">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                Institutional Bias
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-bold ${overallBias === 'BULLISH' ? 'text-emerald-400' : overallBias === 'BEARISH' ? 'text-rose-400' : 'text-amber-400'}`}>
                  {overallBias}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-300 font-mono">
                  {biasStrength}
                </span>
              </div>
              <div className="w-full bg-slate-700/50 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    overallBias === 'BULLISH'
                      ? 'bg-emerald-500'
                      : overallBias === 'BEARISH'
                      ? 'bg-rose-500'
                      : 'bg-amber-500'
                  }`}
                  style={{ width: `${biasConfidence}%` }}
                />
              </div>
            </div>

            {/* Premium vs Discount Zone */}
            <div className="p-3 bg-slate-800/40 border border-slate-700/60 rounded-lg">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                Structure Zone
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-xs font-bold px-2 py-0.5 rounded border ${zoneColor}`}>
                  {premiumDiscount.currentZone}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  Eq: {premiumDiscount.equilibrium > 0 ? premiumDiscount.equilibrium.toFixed(4) : '--'}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-2 truncate">
                {premiumDiscount.biasedDirection === 'LOOK_FOR_BUYS'
                  ? 'Accumulation (Buy Discount)'
                  : premiumDiscount.biasedDirection === 'LOOK_FOR_SELLS'
                  ? 'Distribution (Sell Premium)'
                  : 'Equilibrium (Balanced)'}
              </p>
            </div>

            {/* Nearest Order Block */}
            <div className="p-3 bg-slate-800/40 border border-slate-700/60 rounded-lg">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                Active Order Block
              </div>
              {nearestOB ? (
                <div>
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-bold ${
                        nearestOB.type === 'BULLISH' ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {nearestOB.type} OB
                    </span>
                    <span className="text-[10px] text-slate-300 font-mono">
                      {nearestOB.midPrice.toFixed(4)}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1 flex justify-between">
                    <span>Range:</span>
                    <span className="font-mono">
                      {nearestOB.bottomPrice.toFixed(4)} - {nearestOB.topPrice.toFixed(4)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-500 italic mt-1">No active unmitigated OB</div>
              )}
            </div>

            {/* Market Structure Shift */}
            <div className="p-3 bg-slate-800/40 border border-slate-700/60 rounded-lg">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                Latest Structure
              </div>
              {lastChoCH || lastBOS ? (
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-400">
                      {lastChoCH ? 'ChoCH' : 'BOS'}
                    </span>
                    <span
                      className={`text-[10px] font-semibold ${
                        (lastChoCH || lastBOS)?.direction === 'BULLISH'
                          ? 'text-emerald-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {(lastChoCH || lastBOS)?.direction}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 truncate">
                    @ {(lastChoCH || lastBOS)?.price.toFixed(4)}
                  </p>
                </div>
              ) : (
                <div className="text-xs text-slate-500 italic mt-1">Structure stable</div>
              )}
            </div>
          </div>

          {/* Trade Setup Alert Card (if any setup triggered) */}
          {tradeSetup && tradeSetup.direction !== 'NONE' && (
            <div className="p-4 bg-gradient-to-r from-indigo-950/40 to-slate-900/60 border border-indigo-500/40 rounded-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-indigo-500/20">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold ${
                      tradeSetup.direction === 'LONG'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                    }`}
                  >
                    {tradeSetup.direction === 'LONG' ? (
                      <ArrowUpRight className="w-5 h-5" />
                    ) : (
                      <ArrowDownRight className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">
                        {tradeSetup.setupType}
                      </span>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded ${
                          tradeSetup.direction === 'LONG'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-rose-500/20 text-rose-400'
                        }`}
                      >
                        {tradeSetup.direction}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400">
                      Confidence: {tradeSetup.confidence}% | RR Ratio: 1:{tradeSetup.riskRewardRatio}
                    </span>
                  </div>
                </div>

                {onApplySetup && (
                  <button
                    onClick={() => handleApply(tradeSetup)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-md hover:shadow-indigo-500/25 transition cursor-pointer"
                  >
                    {copySuccess ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                        <span>Applied to Trader!</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 text-amber-300" />
                        <span>Apply Setup to Trader</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Levels breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3">
                <div className="p-2 bg-slate-900/60 rounded border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase">Entry Zone</span>
                  <div className="text-xs font-mono font-semibold text-white mt-0.5">
                    {tradeSetup.entryZone.bottom.toFixed(4)} - {tradeSetup.entryZone.top.toFixed(4)}
                  </div>
                </div>

                <div className="p-2 bg-slate-900/60 rounded border border-rose-900/40">
                  <span className="text-[10px] text-rose-400 uppercase">Stop Loss</span>
                  <div className="text-xs font-mono font-semibold text-rose-300 mt-0.5">
                    {tradeSetup.stopLoss.toFixed(4)}
                  </div>
                </div>

                <div className="p-2 bg-slate-900/60 rounded border border-emerald-900/40">
                  <span className="text-[10px] text-emerald-400 uppercase">Take Profit 1</span>
                  <div className="text-xs font-mono font-semibold text-emerald-300 mt-0.5">
                    {tradeSetup.takeProfit1.toFixed(4)}
                  </div>
                </div>

                <div className="p-2 bg-slate-900/60 rounded border border-emerald-900/40">
                  <span className="text-[10px] text-emerald-400 uppercase">Take Profit 2</span>
                  <div className="text-xs font-mono font-semibold text-emerald-300 mt-0.5">
                    {tradeSetup.takeProfit2.toFixed(4)}
                  </div>
                </div>
              </div>

              {/* Reasoning points */}
              {tradeSetup.reasoning.length > 0 && (
                <div className="mt-3 pt-2 border-t border-slate-800/80">
                  <div className="text-[11px] text-slate-400 font-semibold mb-1">Setup Confluences:</div>
                  <div className="flex flex-wrap gap-1.5">
                    {tradeSetup.reasoning.map((r, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] px-2 py-0.5 bg-slate-800 text-slate-300 rounded border border-slate-700"
                      >
                        ✓ {r}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sub-tabs Navigation */}
          <div className="flex items-center gap-1 border-b border-slate-800 pb-1">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                activeTab === 'overview'
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Narrative & Zones
            </button>
            <button
              onClick={() => setActiveTab('orderBlocks')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                activeTab === 'orderBlocks'
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Order Blocks ({orderBlocks.filter(ob => !ob.isMitigated).length} active / {orderBlocks.length})
            </button>
            <button
              onClick={() => setActiveTab('fvg')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                activeTab === 'fvg'
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Fair Value Gaps ({fairValueGaps.length})
            </button>
            <button
              onClick={() => setActiveTab('structure')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                activeTab === 'structure'
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              BOS & ChoCH ({structureEvents.length})
            </button>
            <button
              onClick={() => setActiveTab('liquidity')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                activeTab === 'liquidity'
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Sweeps & Pools ({liquiditySweeps.length + equalHighs.length + equalLows.length})
            </button>
          </div>

          {/* Tab 1: Overview & Narrative */}
          {activeTab === 'overview' && (
            <div className="space-y-3">
              {/* Premium / Discount Zone Visual Bar */}
              <div className="p-3 bg-slate-950/40 rounded-lg border border-slate-800">
                <div className="flex justify-between items-center text-xs mb-2">
                  <span className="text-emerald-400 font-semibold">Discount (Accumulation)</span>
                  <span className="text-amber-400 font-semibold">Equilibrium (Fair Value)</span>
                  <span className="text-rose-400 font-semibold">Premium (Distribution)</span>
                </div>
                <div className="relative w-full h-3 bg-gradient-to-r from-emerald-500/40 via-amber-500/40 to-rose-500/40 rounded-full overflow-hidden">
                  {/* Current zone marker */}
                  <div
                    className="absolute top-0 bottom-0 w-2 bg-white rounded-full shadow-lg"
                    style={{
                      left:
                        premiumDiscount.currentZone === 'DISCOUNT'
                          ? '20%'
                          : premiumDiscount.currentZone === 'PREMIUM'
                          ? '80%'
                          : '50%',
                      transform: 'translateX(-50%)'
                    }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1.5">
                  <span>{premiumDiscount.discountBottom > 0 ? premiumDiscount.discountBottom.toFixed(4) : '--'}</span>
                  <span>50%: {premiumDiscount.equilibrium > 0 ? premiumDiscount.equilibrium.toFixed(4) : '--'}</span>
                  <span>{premiumDiscount.premiumTop > 0 ? premiumDiscount.premiumTop.toFixed(4) : '--'}</span>
                </div>
              </div>

              {/* Narrative Summary Points */}
              <div className="p-3 bg-slate-950/40 rounded-lg border border-slate-800">
                <div className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-indigo-400" />
                  Institutional Market Narrative:
                </div>
                <ul className="space-y-1.5">
                  {summary.map((item, idx) => (
                    <li key={idx} className="text-xs text-slate-300 flex items-start gap-2">
                      <span className="text-indigo-400 mt-0.5">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Tab 2: Order Blocks */}
          {activeTab === 'orderBlocks' && (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {orderBlocks.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">No active Order Blocks detected.</div>
              ) : (
                orderBlocks.map((ob) => (
                  <div
                    key={ob.id}
                    className={`p-2.5 rounded-lg border flex items-center justify-between text-xs ${
                      ob.type === 'BULLISH'
                        ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                        : 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{ob.label}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800/80 text-slate-300">
                          Strength: {ob.strength}%
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded ${
                            ob.isMitigated
                              ? 'bg-slate-700/60 text-slate-400'
                              : 'bg-indigo-500/30 text-indigo-200'
                          }`}
                        >
                          {ob.isMitigated ? `Mitigated (${ob.mitigationPct}%)` : 'Active / Unmitigated'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        Range: {ob.bottomPrice.toFixed(4)} - {ob.topPrice.toFixed(4)} (Mid: {ob.midPrice.toFixed(4)})
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400">Vol Ratio</span>
                      <div className="font-mono font-semibold">{ob.volumeRatio}x</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Tab 3: Fair Value Gaps */}
          {activeTab === 'fvg' && (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {fairValueGaps.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">No Fair Value Gaps detected in current window.</div>
              ) : (
                fairValueGaps.map((fvg) => (
                  <div
                    key={fvg.id}
                    className={`p-2.5 rounded-lg border flex items-center justify-between text-xs ${
                      fvg.type === 'BULLISH'
                        ? 'bg-amber-950/20 border-amber-500/30 text-amber-300'
                        : 'bg-cyan-950/20 border-cyan-500/30 text-cyan-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{fvg.label}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded ${
                            fvg.isFilled
                              ? 'bg-slate-700/60 text-slate-400'
                              : 'bg-amber-500/30 text-amber-200'
                          }`}
                        >
                          {fvg.isFilled ? 'Filled' : `Open (${100 - fvg.fillPct}% remaining)`}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        Imbalance: {fvg.bottomPrice.toFixed(4)} - {fvg.topPrice.toFixed(4)} (Mid: {fvg.midPrice.toFixed(4)})
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400">Gap Size</span>
                      <div className="font-mono font-semibold">{fvg.gapPct}%</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Tab 4: Structure (BOS & ChoCH) */}
          {activeTab === 'structure' && (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {structureEvents.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">No structure shift events in recent candles.</div>
              ) : (
                structureEvents.map((ev, idx) => (
                  <div
                    key={idx}
                    className={`p-2.5 rounded-lg border flex items-center justify-between text-xs ${
                      ev.type === 'CHOCH'
                        ? 'bg-purple-950/20 border-purple-500/30 text-purple-300'
                        : 'bg-blue-950/20 border-blue-500/30 text-blue-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-200">
                        {ev.type}
                      </div>
                      <div>
                        <span className="font-semibold text-white">{ev.label}</span>
                        <div className="text-[10px] text-slate-400">
                          {ev.isInternal ? 'Internal Structure Shift' : 'External Major Trend Shift'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400">Break Level</span>
                      <div className="font-mono font-bold">{ev.price.toFixed(4)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Tab 5: Liquidity Pools & Sweeps */}
          {activeTab === 'liquidity' && (
            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {/* Liquidity Sweeps */}
              {liquiditySweeps.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Stop-Hunt Sweeps Detected
                  </div>
                  <div className="space-y-1.5">
                    {liquiditySweeps.map((sweep, idx) => (
                      <div
                        key={idx}
                        className="p-2 bg-rose-950/20 border border-rose-500/30 rounded text-xs flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2 text-rose-300 font-semibold">
                          <ShieldAlert className="w-4 h-4 text-rose-400" />
                          <span>{sweep.type.replace('_', ' ')}</span>
                          {sweep.reversalConfirmed && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">
                              Reversal Confirmed
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-slate-300">
                          Level: {sweep.sweptPrice.toFixed(4)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Equal Highs & Equal Lows */}
              <div>
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Resting Liquidity Targets (EQH / EQL)
                </div>
                {equalHighs.length === 0 && equalLows.length === 0 ? (
                  <div className="text-xs text-slate-500 italic">No equal levels forming liquidity pools.</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {equalHighs.map((eqh, idx) => (
                      <div key={idx} className="p-2 bg-slate-900 rounded border border-slate-800 text-xs flex justify-between">
                        <span className="text-slate-300 font-semibold">Equal Highs ({eqh.touches}x)</span>
                        <span className="font-mono text-rose-400">{eqh.price.toFixed(4)}</span>
                      </div>
                    ))}
                    {equalLows.map((eql, idx) => (
                      <div key={idx} className="p-2 bg-slate-900 rounded border border-slate-800 text-xs flex justify-between">
                        <span className="text-slate-300 font-semibold">Equal Lows ({eql.touches}x)</span>
                        <span className="font-mono text-emerald-400">{eql.price.toFixed(4)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
export default SMCPanel;
