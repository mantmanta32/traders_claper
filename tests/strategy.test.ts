import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/config';
import { createMarketState } from '../src/engine/state';
import {
  buildSignalCandidates,
  buildTradePlan,
  calculateKellyFraction,
  calibratedProbability,
  generateSignal,
  primaryVerifySeconds,
  regimeAllowsSignal,
  scoreCandidate,
} from '../src/engine/strategy';
import type { AppSettings } from '../src/types/settings';
import type { MarketState, Perception, PerceptionKey, PerceptionMap } from '../src/types/market';

const NOW = 1_800_000_000_000;
const categories: Record<string, Perception['category']> = {
  LIQ: 'LIQ', BITE: 'FLOW', FLOW: 'FLOW', CVD: 'FLOW', TOXIC: 'FLOW', OBI: 'BOOK', VOL: 'FLOW', RANGE: 'MOM', PRICE: 'MOM', FUND: 'FUND', OI: 'OI',
};

function perception(type: PerceptionKey, power = 1): Perception {
  const prefix = Object.keys(categories).find((key) => type.startsWith(key)) ?? 'FLOW';
  return { type, power, category: categories[prefix], direction: type.includes('SELL') || type.includes('SHORT') || type.includes('DOWN') || type.includes('BEAR') ? 'SHORT' : 'LONG', label: type, detail: `${type} detail` };
}

function map(...items: Array<[PerceptionKey, number?]>): PerceptionMap {
  return Object.fromEntries(items.map(([key, power]) => [key, perception(key, power)])) as PerceptionMap;
}

let state: MarketState;
let settings: AppSettings;

beforeEach(() => {
  state = createMarketState('BTCUSDT');
  state.price = 100;
  state.prevPrice = 99;
  state.bid = 99.99;
  state.ask = 100.01;
  state.volume24h = 1_000_000_000;
  state.regime = 'VOLATILE';
  state.priceHistory = Array.from({ length: 10 }, (_, index) => ({ ts: NOW - (10 - index) * 1_000, price: 99 + index * 0.1 }));
  settings = { ...DEFAULT_SETTINGS, minSignalScore: 20, signalTiers: ['S', 'A', 'B', 'C'], minimumLearningSamples: 3 };
});

describe('strategy candidate preservation and extensions', () => {
  it('builds symmetric whale flush candidates', () => {
    expect(buildSignalCandidates(map(['LIQ_WHALE_SHORT', 3], ['BITE_BUY', 1]))[0]).toMatchObject({ type: 'WHALE_FLUSH_REVERSAL', direction: 'LONG' });
    expect(buildSignalCandidates(map(['LIQ_WHALE_LONG', 3], ['BITE_SELL', 1]))[0]).toMatchObject({ type: 'WHALE_FLUSH_REVERSAL', direction: 'SHORT' });
  });

  it('preserves and mirrors cascade continuation', () => {
    expect(buildSignalCandidates(map(['LIQ_CASCADE_LONG', 2], ['PRICE_DUMP', 2]))[0]).toMatchObject({ type: 'CASCADE_CONTINUATION', direction: 'SHORT' });
    expect(buildSignalCandidates(map(['LIQ_CASCADE_SHORT', 2], ['PRICE_PUMP', 2]))[0]).toMatchObject({ type: 'CASCADE_CONTINUATION', direction: 'LONG' });
  });

  it.each([
    [map(['LIQ_TRAP', 2], ['BITE_BUY', 1]), 'ABSORPTION_SETUP'],
    [map(['RANGE_BREAK_UP', 2], ['VOL_SURGE', 2]), 'BREAKOUT_CONFIRMED'],
    [map(['VOL_SURGE', 3], ['PRICE_PUMP', 2]), 'MOMENTUM_SURGE'],
    [map(['FUND_HIGH', 2], ['BITE_SELL', 1]), 'FUND_SQUEEZE_SHORT'],
    [map(['FUND_LOW', 2], ['BITE_BUY', 1]), 'FUND_SQUEEZE_LONG'],
    [map(['FLOW_FLIP_BUY', 2], ['BITE_BUY', 1]), 'FLOW_REVERSAL_LONG'],
    [map(['FLOW_FLIP_SELL', 2], ['BITE_SELL', 1]), 'FLOW_REVERSAL_SHORT'],
    [map(['OI_LONG', 2], ['PRICE_PUMP', 1]), 'OI_CONFIRM_LONG'],
    [map(['OI_SHORT', 2], ['PRICE_DUMP', 1]), 'OI_CONFIRM_SHORT'],
    [map(['OI_SQUEEZE', 2]), 'OI_SQUEEZE'],
  ])('produces %s strategy family', (perceptions, type) => {
    expect(buildSignalCandidates(perceptions as PerceptionMap).some((candidate) => candidate.type === type)).toBe(true);
  });
});

describe('scoring and risk model', () => {
  it('caps confidence when only one independent data point exists', () => {
    const perceptions = map(['FUND_HIGH', 5]);
    const candidate = buildSignalCandidates(perceptions)[0];
    const result = scoreCandidate(candidate, perceptions, undefined, settings);
    expect(result.final).toBeLessThan(60);
    expect(result.tier).toBe('B');
  });

  it('bounds Bayesian score and applies learned filtering', () => {
    const perceptions = map(['LIQ_WHALE_SHORT', 4], ['BITE_BUY', 1], ['TOXIC_SELL', 3]);
    const candidate = buildSignalCandidates(perceptions)[0];
    const result = scoreCandidate(candidate, perceptions, { samples: 20, wins: 3, netPnl: -0.1, horizons: {}, lastUpdatedAt: NOW }, settings);
    expect(result.final).toBeGreaterThanOrEqual(0);
    expect(result.final).toBeLessThanOrEqual(100);
    expect(result.bayesPosterior).toBeGreaterThan(0);
    expect(result.bayesPosterior).toBeLessThan(1);
    expect(result.filtered).toBe(true);
  });

  it('calculates Kelly correctly and rejects invalid odds', () => {
    expect(calculateKellyFraction(0.6, 2)).toBeCloseTo(0.4);
    expect(calculateKellyFraction(0.4, 1)).toBeCloseTo(-0.2);
    expect(calculateKellyFraction(0.6, 0)).toBe(0);
  });

  it('shrinks score probability toward beta-smoothed learned outcomes', () => {
    expect(calibratedProbability(80)).toBeCloseTo(0.68);
    const learned = calibratedProbability(80, { samples: 30, wins: 6, netPnl: -0.1, horizons: {}, lastUpdatedAt: NOW });
    expect(learned).toBeLessThan(0.5);
    expect(learned).toBeGreaterThan(0);
  });

  it('builds volatility-aware quarter-Kelly plans capped by settings', () => {
    const candidate = buildSignalCandidates(map(['LIQ_WHALE_SHORT', 4], ['BITE_BUY', 1]))[0];
    settings.maxPositionPercent = 5;
    const plan = buildTradePlan(state, candidate, 90, 0.7, settings, NOW);
    expect(plan.invalidation).toBeLessThan(plan.entry);
    expect(plan.takeProfit1).toBeGreaterThan(plan.entry);
    expect(plan.suggestedPositionFraction).toBeLessThanOrEqual(0.05);
  });
});

describe('signal generation and regime gates', () => {
  it('generates a complete signal with pattern, Bayes and trade plan', () => {
    const perceptions = map(['LIQ_WHALE_SHORT', 5], ['BITE_BUY', 1], ['VOL_SURGE', 1]);
    const signal = generateSignal({ state, perceptions, settings, memory: {}, now: NOW });
    expect(signal).toMatchObject({ symbol: 'BTCUSDT', type: 'WHALE_FLUSH_REVERSAL', direction: 'LONG' });
    expect(signal?.score).toBeGreaterThanOrEqual(settings.minSignalScore);
    expect(signal?.patternId).toContain('LIQ_WHALE_SHORT');
    expect(signal?.plan.suggestedPositionFraction).toBeGreaterThan(0);
  });

  it('respects cooldown, family and tier filters', () => {
    const perceptions = map(['LIQ_WHALE_SHORT', 5]);
    state.cooldownUntil = NOW + 1;
    expect(generateSignal({ state, perceptions, settings, memory: {}, now: NOW })).toBeNull();
    state.cooldownUntil = 0;
    settings.signalFamilies = ['OI'];
    expect(generateSignal({ state, perceptions, settings, memory: {}, now: NOW })).toBeNull();
  });

  it('gates strategies by regime', () => {
    expect(regimeAllowsSignal('RANGE', 'BREAKOUT_CONFIRMED')).toBe(false);
    expect(regimeAllowsSignal('LOW_VOL', 'OI_SQUEEZE')).toBe(true);
    expect(regimeAllowsSignal('TREND_UP', 'FLOW_REVERSAL_LONG')).toBe(false);
    expect(regimeAllowsSignal('VOLATILE', 'MOMENTUM_SURGE')).toBe(true);
  });

  it('uses strategy-specific and fixed verification horizons', () => {
    expect(primaryVerifySeconds('MOMENTUM_SURGE', settings)).toBe(30);
    expect(primaryVerifySeconds('FUND_SQUEEZE_LONG', settings)).toBe(600);
    settings.adaptiveVerifyHorizon = false;
    settings.fallbackVerifyMinutes = 7;
    expect(primaryVerifySeconds('MOMENTUM_SURGE', settings)).toBe(420);
  });
});
