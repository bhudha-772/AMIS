'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useProposal, useBuy } from '@deriv/core';
import type {
  DerivWS,
  ActiveSymbol,
  Tick,
  ProposalInfo,
  ProposalParams,
  BuyResult,
} from '@deriv/core';
import { useBaseTrading } from '@/hooks/use-base-trading';
import type { UseBaseTradingParams } from '@/hooks/use-base-trading';
import type { Direction, DurationSelectUnit, DurationOption, OpenPosition, ClosedPosition } from '../lib/types';
import { getDurationOptions, computeEndTimeEpoch } from '@/lib/duration-utils';
import type { VolumeProfileAnalysis } from '../../src/strategyTypes';

const CONTRACT_TYPES = ['CALL', 'PUT'];

interface UseRiseFallTradingReturn {
  ws: DerivWS | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  symbols: ActiveSymbol[];
  activeSymbol: ActiveSymbol | null;
  selectSymbol: (symbol: string) => void;
  currentTick: Tick | null;
  prices: number[];
  pipSize: number;
  direction: Direction;
  setDirection: (direction: Direction) => void;
  stake: string;
  setStake: (value: string) => void;
  duration: number;
  setDuration: (value: number) => void;
  durationOptions: DurationOption[];
  durationUnit: DurationSelectUnit;
  setDurationUnit: (unit: DurationSelectUnit) => void;
  endDate: Date | undefined;
  setEndDate: (date: Date | undefined) => void;
  endTime: string;
  setEndTime: (time: string) => void;
  proposal: ProposalInfo | null;
  buyContract: () => Promise<void>;
  isBuying: boolean;
  buyResult: BuyResult | null;
  buyError: string | null;
  clearBuyResult: () => void;
  openPositions: OpenPosition[];
  closedPositions: ClosedPosition[];
  sellContract: (contractId: number, bidPrice: string) => Promise<void>;
  sellingId: number | null;
  sellError: string | null;
  clearSellError: () => void;
  // POC-aware execution (Higher/Lower strategy layer)
  pocAnalysis: VolumeProfileAnalysis | null;
  setPocAnalysis: (analysis: VolumeProfileAnalysis | null) => void;
  pocEntryAllowed: boolean;
  pocEntryReason: string;
}

export type UseRiseFallTradingParams = Pick<UseBaseTradingParams, 'ws' | 'isConnected' | 'isExhausted' | 'isAuthenticated' | 'onAuthWSFailed'> & {
  /** Optional POC analysis from SMC engine — gates trade execution when provided */
  pocAnalysis?: VolumeProfileAnalysis | null;
};

export function useRiseFallTrading({ ws, isConnected, isExhausted, isAuthenticated, onAuthWSFailed, pocAnalysis: externalPocAnalysis }: UseRiseFallTradingParams): UseRiseFallTradingReturn {

  // Internal POC analysis state — allows external override or internal management
  const [pocAnalysis, setPocAnalysis] = useState<VolumeProfileAnalysis | null>(externalPocAnalysis ?? null);

  // Sync external POC analysis when it changes
  useEffect(() => {
    if (externalPocAnalysis !== pocAnalysis) {
      setPocAnalysis(externalPocAnalysis);
    }
  }, [externalPocAnalysis, pocAnalysis]);

  const [direction, setDirection] = useState<Direction>('CALL');
  const [stake, setStake] = useState<string>('10');
  const [duration, setDuration] = useState<number>(1);
  const [durationUnit, setDurationUnitRaw] = useState<DurationSelectUnit>('t');
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [endTime, setEndTime] = useState<string>('');
  const [durationOptionsSymbol, setDurationOptionsSymbol] = useState<string | null>(null);

  const durationOptions = useMemo(() => getDurationOptions(contracts), [contracts]);

  // Track durationUnit and activeSymbol in refs so the duration-options effect doesn't list them in deps
  const durationUnitRef = useRef(durationUnit);
  const activeSymbolKeyRef = useRef(activeSymbol?.underlying_symbol);

  useEffect(() => {
    durationUnitRef.current = durationUnit;
  }, [durationUnit]);

  useEffect(() => {
    activeSymbolKeyRef.current = activeSymbol?.underlying_symbol;
  }, [activeSymbol?.underlying_symbol]);

  /* eslint-disable react-hooks/set-state-in-effect -- reset duration/end-time state when contracts-derived options change */
  useEffect(() => {
    if (!durationOptions.length) return;
    setEndDate(undefined);
    setEndTime('');
    setDurationOptionsSymbol(activeSymbolKeyRef.current ?? null);
    const currentOpt = durationOptions.find(o => o.unit === durationUnitRef.current);
    if (!currentOpt) {
      const first = durationOptions[0];
      setDurationUnitRaw(first.unit);
      if (first.unit !== 'end-time') setDuration(first.min);
    } else if (currentOpt.unit !== 'end-time') {
      setDuration(prev => (prev < currentOpt.min || prev > currentOpt.max) ? currentOpt.min : prev);
    }
  }, [durationOptions]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const setDurationUnit = useCallback((unit: DurationSelectUnit) => {
    setDurationUnitRaw(unit);
    const opt = durationOptions.find(o => o.unit === unit);
    if (opt && unit !== 'end-time') setDuration(opt.min);
  }, [durationOptions]);

  /* ── POC-aware execution gate (Higher/Lower strategy layer) ──
   * Blocks buyContract unless the selected direction aligns with
   * the confirmed Volume Profile POC reaction and market structure bias.
   */
  const pocEntryAllowed = useMemo(() => {
    if (!pocAnalysis) {
      return { allowed: true, reason: 'No POC analysis provided — execution unfiltered' };
    }
    const { reaction, pocAlignedBias, confidence } = pocAnalysis;
    if (!reaction || !reaction.reactionConfirmed) {
      return { allowed: false, reason: 'POC reaction not confirmed — wait for price reaction at POC level' };
    }
    if (confidence < 45) {
      return { allowed: false, reason: `POC confidence too low (${confidence}%) — minimum 45% required` };
    }
    if (pocAlignedBias === 'NEUTRAL') {
      return { allowed: false, reason: 'POC bias is NEUTRAL — no directional edge' };
    }
    // Map POC bias to contract direction
    const requiredDirection: Direction = pocAlignedBias === 'BULLISH' ? 'CALL' : 'PUT';
    if (direction !== requiredDirection) {
      return { allowed: false, reason: `POC bias is ${pocAlignedBias} (${requiredDirection}) but selected direction is ${direction}` };
    }
    return {
      allowed: true,
      reason: `POC ${pocAlignedBias} reaction confirmed at ${reaction.entryPrice?.toFixed?.(5) ?? 'POC'} — entry aligned`,
    };
  }, [pocAnalysis, direction]);

  const { buyContract: buyWithProposal, isBuying, buyResult, buyError, clearBuyResult } =
    useBuy(tradingWs, tradingIsConnected);

  const proposalParams: ProposalParams | null = useMemo(() => {
    if (isBuying || !activeSymbol || !durationOptions.length) return null;
    if (durationOptionsSymbol !== activeSymbol.underlying_symbol) return null;
    const stakeNum = parseFloat(stake);
    if (!stakeNum || stakeNum <= 0) return null;

    const base = {
      contractType: direction, // Strictly Higher (CALL) or Lower (PUT) — no CALLE/PUTE variants
      symbol: activeSymbol.underlying_symbol,
      amount: stakeNum,
      basis: 'stake' as const,
      currency: 'USD',
    };

    if (durationUnit === 'end-time') {
      const dateExpiry = computeEndTimeEpoch(endDate, endTime);
      if (!dateExpiry) return null;
      return { ...base, duration: 0, durationUnit: 'd', dateExpiry };
    }

    const opt = durationOptions.find(o => o.unit === durationUnit);
    if (!opt || duration < opt.min || duration > opt.max) return null;

    if (durationUnit === 'h') {
      return { ...base, duration: duration * 60, durationUnit: 'm' };
    }

    return { ...base, duration, durationUnit };
  }, [activeSymbol, direction, stake, duration, durationUnit, endDate, endTime, isBuying, durationOptions, durationOptionsSymbol]);

  const { proposal } = useProposal(tradingWs, tradingIsConnected, proposalParams);

  const buyContract = useCallback(async () => {
    // POC execution gate — block if POC analysis says no
    if (!pocEntryAllowed.allowed) {
      console.warn(`[POC Gate] Trade blocked: ${pocEntryAllowed.reason}`);
      return;
    }
    if (proposal) await buyWithProposal(proposal);
  }, [proposal, buyWithProposal, pocEntryAllowed]);

  return {
    ws: tradingWs,
    isConnected: tradingIsConnected,
    isLoading,
    error,
    symbols,
    activeSymbol,
    selectSymbol,
    currentTick,
    prices,
    pipSize,
    direction,
    setDirection,
    stake,
    setStake,
    duration,
    setDuration,
    durationOptions,
    durationUnit,
    setDurationUnit,
    endDate,
    setEndDate,
    endTime,
    setEndTime,
    proposal,
    buyContract,
    isBuying,
    buyResult,
    buyError,
    clearBuyResult,
    openPositions,
    closedPositions,
    sellContract,
    sellingId,
    sellError,
    clearSellError,
    // POC-aware execution outputs
    pocAnalysis,
    setPocAnalysis,
    pocEntryAllowed: pocEntryAllowed.allowed,
    pocEntryReason: pocEntryAllowed.reason,
  };
}
