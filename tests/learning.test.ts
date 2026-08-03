import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/config';
import { LearningEngine, horizonSummary } from '../src/engine/learning';
import type { Signal } from '../src/types/market';
import type { AppSettings } from '../src/types/settings';

const NOW = 1_800_000_000_000;
let settings: AppSettings;
let signal: Signal;

beforeEach(() => {
  localStorage.clear();
  settings = { ...DEFAULT_SETTINGS, adaptiveVerifyHorizon: false, fallbackVerifyMinutes: 1, roundTripCostBps: 8 };
  signal = {
    id: 'sig-1', symbol: 'BTCUSDT', direction: 'LONG', type: 'WHALE_FLUSH_REVERSAL', family: 'WHALE', perceptions: [], reason: 'test', score: 80, tier: 'S', rawStrength: 3,
    price: 100, entryMid: 100, createdAt: NOW, expiresAt: NOW + 60_000, ttlMs: 60_000, patternId: 'A+B', learnedWinRate: null, learnedSamples: 0,
    regime: 'VOLATILE', obi: 0, cvd: 0, toxicFlow: 'NEUTRAL', bayesPosterior: 0.7, bayesMultiplier: 1.2, estimatedProbability: 0.65,
    plan: { entry: 100, invalidation: 99, takeProfit1: 102, takeProfit2: 103, riskPerUnit: 1, riskReward: 2, estimatedProbability: 0.65, kellyFraction: 0.4, suggestedPositionFraction: 0.1 },
  };
});

describe('learning engine', () => {
  it('queues, verifies and learns net-of-cost outcomes', () => {
    const engine = new LearningEngine({ memory: {}, patterns: {}, verificationQueue: [], verificationHistory: [] });
    engine.registerSignal(signal, settings);
    expect(engine.verificationQueue).toHaveLength(1);
    expect(engine.patterns['A+B'].signals).toBe(1);

    const records = engine.verifyDue(() => 101, settings, NOW + 60_001);
    expect(records).toHaveLength(1);
    expect(records[0].grossPnl).toBeCloseTo(0.01);
    expect(records[0].netPnl).toBeCloseTo(0.0092);
    expect(records[0].win).toBe(true);
    expect(engine.memory['BTCUSDT:WHALE_FLUSH_REVERSAL']).toMatchObject({ samples: 1, wins: 1 });
    expect(engine.patterns['A+B']).toMatchObject({ samples: 1, wins: 1, losses: 0 });
    expect(horizonSummary(engine.memory['BTCUSDT:WHALE_FLUSH_REVERSAL'])).toContain('60s %100 (1)');
  });

  it('calculates short PnL in the correct direction', () => {
    signal.direction = 'SHORT';
    const engine = new LearningEngine({ memory: {}, patterns: {}, verificationQueue: [], verificationHistory: [] });
    engine.registerSignal(signal, settings);
    const [record] = engine.verifyDue(() => 99, settings, NOW + 60_001);
    expect(record.win).toBe(true);
    expect(record.grossPnl).toBeCloseTo(0.01);
  });

  it('retries a due verification when a live price is unavailable', () => {
    const engine = new LearningEngine({ memory: {}, patterns: {}, verificationQueue: [], verificationHistory: [] });
    engine.registerSignal(signal, settings);
    expect(engine.verifyDue(() => undefined, settings, NOW + 60_001)).toEqual([]);
    expect(engine.verificationQueue[0]).toMatchObject({ attempts: 1, checkAt: NOW + 65_001 });
  });

  it('can reset and replace learning data', () => {
    const engine = new LearningEngine({ memory: {}, patterns: {}, verificationQueue: [], verificationHistory: [] });
    engine.registerSignal(signal, settings);
    engine.reset();
    expect(engine.verificationQueue).toHaveLength(0);
    expect(Object.keys(engine.patterns)).toHaveLength(0);
    engine.replace({ memory: { test: { samples: 3, wins: 2, netPnl: 0.1, horizons: {}, lastUpdatedAt: NOW } } });
    expect(engine.memory.test.samples).toBe(3);
  });
});
