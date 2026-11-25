/**
 * Unit tests for Volume Profile + POC engine
 * Tests the Fixed Range Volume Profile and POC reaction detection
 * used by the Higher/Lower strategy entry layer.
 */

import { CandleData } from './unifiedCandles';
import {
  calculateFixedRangeVolumeProfile,
  detectPocReaction,
  runVolumeProfileAnalysis,
} from './smcEngine';
import type { FixedRangeVolumeProfile } from './strategyTypes';

function buildBullishCandles(): CandleData[] {
  const candles: CandleData[] = [];
  let price = 100;
  for (let i = 0; i < 60; i++) {
    const trend = Math.floor(i / 10) * 0.5;
    const open = price + trend;
    const high = open + 1 + (i % 3) * 0.5;
    const low = open - 0.5 - (i % 2) * 0.3;
    const close = open + trend + (i % 2 ? 0.4 : -0.2);
    candles.push({ timestamp: Date.now() - (60 - i) * 60000, open, high, low, close, volume: 100 + (i % 5) * 50 });
    price = close;
  }
  return candles;
}

function buildBearishCandles(): CandleData[] {
  const candles: CandleData[] = [];
  let price = 100;
  for (let i = 0; i < 60; i++) {
    const trend = -Math.floor(i / 10) * 0.5;
    const open = price + trend;
    const high = open + 0.3 + (i % 2) * 0.2;
    const low = open - 1 - (i % 3) * 0.5;
    const close = open + trend - (i % 2 ? 0.4 : -0.2);
    candles.push({ timestamp: Date.now() - (60 - i) * 60000, open, high, low, close, volume: 100 + (i % 5) * 50 });
    price = close;
  }
  return candles;
}

describe('Volume Profile Engine', () => {
  describe('calculateFixedRangeVolumeProfile', () => {
    it('should return null for invalid range', () => {
      const candles: CandleData[] = [];
      expect(calculateFixedRangeVolumeProfile(candles, 0, 5, 'BULLISH')).toBeNull();
      expect(calculateFixedRangeVolumeProfile(buildBullishCandles(), 10, 5, 'BULLISH')).toBeNull();
    });

    it('should calculate POC for a bullish range', () => {
      const candles = buildBullishCandles();
      const profile = calculateFixedRangeVolumeProfile(candles, 5, 25, 'BULLISH');
      expect(profile).not.toBeNull();
      if (profile) {
        expect(profile.direction).toBe('BULLISH');
        expect(profile.poc.price).toBeGreaterThan(0);
        expect(profile.poc.volume).toBeGreaterThan(0);
        expect(profile.bins.length).toBeGreaterThan(0);
        expect(profile.totalVolume).toBeGreaterThan(0);
        expect(profile.pocZone.top).toBeGreaterThanOrEqual(profile.pocZone.bottom);
      }
    });

    it('should calculate POC for a bearish range', () => {
      const candles = buildBearishCandles();
      const profile = calculateFixedRangeVolumeProfile(candles, 5, 25, 'BEARISH');
      expect(profile).not.toBeNull();
      if (profile) {
        expect(profile.direction).toBe('BEARISH');
        expect(profile.poc.price).toBeGreaterThan(0);
      }
    });

    it('should identify correct POC when volume is concentrated', () => {
      const candles: CandleData[] = [];
      for (let i = 0; i < 20; i++) {
        candles.push({ timestamp: Date.now() - (20 - i) * 60000, open: 104, high: 106, low: 104, close: 105, volume: 1000 });
      }
      for (let i = 0; i < 20; i++) {
        candles.push({ timestamp: Date.now() - (40 - i) * 60000, open: 99, high: 101, low: 99, close: 100, volume: 10 });
      }
      const profile = calculateFixedRangeVolumeProfile(candles, 0, 39, 'BULLISH');
      expect(profile).not.toBeNull();
      if (profile) {
        expect(profile.poc.price).toBeGreaterThan(103);
        expect(profile.poc.price).toBeLessThan(107);
      }
    });
  });

  describe('detectPocReaction', () => {
    it('should detect bullish bounce at POC', () => {
      const candles: CandleData[] = [];
      const pocPrice = 105;
      for (let i = 0; i < 10; i++) {
        candles.push({ timestamp: Date.now() - 20 * 60000 + i * 60000, open: 108, high: 109, low: 107, close: 108, volume: 100 });
      }
      for (let i = 0; i < 5; i++) {
        candles.push({ timestamp: Date.now() - 10 * 60000 + i * 60000, open: 106, high: 107, low: 104, close: 105, volume: 100 });
      }
      candles.push({ timestamp: Date.now() - 4 * 60000, open: 105, high: 107, low: 104.5, close: 106.5, volume: 150 });
      candles.push({ timestamp: Date.now() - 3 * 60000, open: 106.5, high: 108, low: 106, close: 107.5, volume: 150 });

      const profile: FixedRangeVolumeProfile = {
        rangeStart: 100, rangeEnd: 110, direction: 'BULLISH',
        bins: [], poc: { price: pocPrice, volume: 500, touchCount: 10 },
        pocZone: { top: 105.5, bottom: 104.5 }, totalVolume: 1000, binCount: 50,
      };

      const reaction = detectPocReaction(candles, profile, 'BULLISH', 1.0);
      expect(reaction).not.toBeNull();
      if (reaction) {
        expect(reaction.priceReturnedToPoc).toBe(true);
        expect(reaction.reactionConfirmed).toBe(true);
        expect(reaction.reactionType).toBe('BOUNCE');
      }
    });

    it('should detect bearish rejection at POC', () => {
      const candles: CandleData[] = [];
      const pocPrice = 95;
      for (let i = 0; i < 10; i++) {
        candles.push({ timestamp: Date.now() - 20 * 60000 + i * 60000, open: 92, high: 93, low: 91, close: 92, volume: 100 });
      }
      for (let i = 0; i < 5; i++) {
        candles.push({ timestamp: Date.now() - 10 * 60000 + i * 60000, open: 94, high: 96, low: 93, close: 95, volume: 100 });
      }
      candles.push({ timestamp: Date.now() - 4 * 60000, open: 95, high: 95.5, low: 93.5, close: 94, volume: 150 });
      candles.push({ timestamp: Date.now() - 3 * 60000, open: 94, high: 94.5, low: 92.5, close: 93, volume: 150 });

      const profile: FixedRangeVolumeProfile = {
        rangeStart: 100, rangeEnd: 90, direction: 'BEARISH',
        bins: [], poc: { price: pocPrice, volume: 500, touchCount: 10 },
        pocZone: { top: 95.5, bottom: 94.5 }, totalVolume: 1000, binCount: 50,
      };

      const reaction = detectPocReaction(candles, profile, 'BEARISH', 1.0);
      expect(reaction).not.toBeNull();
      if (reaction) {
        expect(reaction.priceReturnedToPoc).toBe(true);
        expect(reaction.reactionConfirmed).toBe(true);
        expect(reaction.reactionType).toBe('REJECTION');
      }
    });

    it('should return null for insufficient candles', () => {
      const candles: CandleData[] = [{ timestamp: Date.now(), open: 100, high: 101, low: 99, close: 100, volume: 10 }];
      const profile: FixedRangeVolumeProfile = {
        rangeStart: 90, rangeEnd: 110, direction: 'BULLISH',
        bins: [], poc: { price: 100, volume: 10, touchCount: 1 },
        pocZone: { top: 100.5, bottom: 99.5 }, totalVolume: 10, binCount: 50,
      };
      expect(detectPocReaction(candles, profile, 'BULLISH', 1.0)).toBeNull();
    });
  });

  describe('runVolumeProfileAnalysis', () => {
    it('should return empty result for insufficient data', () => {
      const candles: CandleData[] = [];
      const result = runVolumeProfileAnalysis(candles, 'BULLISH', 1.0);
      expect(result.profile).toBeNull();
      expect(result.reaction).toBeNull();
      expect(result.pocAlignedBias).toBe('NEUTRAL');
      expect(result.confidence).toBe(0);
    });

    it('should return NEUTRAL for NEUTRAL bias', () => {
      const candles = buildBullishCandles();
      const result = runVolumeProfileAnalysis(candles, 'NEUTRAL', 1.0);
      expect(result.pocAlignedBias).toBe('NEUTRAL');
    });

    it('should produce POC analysis for bullish candles without crashing', () => {
      const candles = buildBullishCandles();
      const result = runVolumeProfileAnalysis(candles, 'BULLISH', 1.0);
      expect(result).toBeDefined();
      expect(typeof result.confidence).toBe('number');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(90);
    });

    it('should produce POC analysis for bearish candles without crashing', () => {
      const candles = buildBearishCandles();
      const result = runVolumeProfileAnalysis(candles, 'BEARISH', 1.0);
      expect(result).toBeDefined();
      expect(typeof result.confidence).toBe('number');
    });
  });
});