import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/config';
import { createMarketState } from '../src/engine/state';
import {
  adaptiveWhaleUsd,
  cvdDivergence,
  detectPerceptions,
  microstructureWeight,
  toxicFlowFromTrades,
  volumeSurgeRatio,
} from '../src/engine/perception';
import type { AppSettings } from '../src/types/settings';
import type { MarketState } from '../src/types/market';

const NOW = 1_800_000_000_000;
let state: MarketState;
let settings: AppSettings;

beforeEach(() => {
  state = createMarketState('TESTUSDT');
  settings = { ...DEFAULT_SETTINGS, min24hVolumeUsd: 1_000_000 };
  state.price = 100;
  state.prevPrice = 100;
  state.volume24h = 100_000_000;
  for (let index = 0; index < 12; index += 1) state.priceHistory.push({ ts: NOW - (12 - index) * 1_000, price: 100 });
});

function liquidation(side: 'LONG' | 'SHORT', usd: number, ageMs = 500) {
  const orderSide = side === 'LONG' ? 'SELL' as const : 'BUY' as const;
  return { id: `${side}:${usd}:${ageMs}`, symbol: state.symbol, liquidationSide: side, orderSide, usd, price: 100, quantity: usd / 100, ts: NOW - ageMs, exchange: 'Binance', source: 'binance' as const };
}

describe('perception engine', () => {
  it('calculates an adaptive whale threshold and detects whale liquidations without TDZ failure', () => {
    const threshold = adaptiveWhaleUsd(state, settings, NOW);
    expect(threshold).toBeGreaterThan(0);
    state.liquidationHistory.push(liquidation('LONG', threshold * 2));
    const result = detectPerceptions(state, settings, NOW);
    expect(result.perceptions.LIQ_WHALE_LONG).toMatchObject({ direction: 'SHORT' });
    expect(result.perceptions.LIQ_WHALE_LONG?.power).toBeCloseTo(2);
  });

  it('detects cascade, cluster and a true trap only while price is stable', () => {
    for (let index = 0; index < 5; index += 1) state.liquidationHistory.push(liquidation('LONG', 120_000, index * 500));
    let perceptions = detectPerceptions(state, settings, NOW).perceptions;
    expect(perceptions.LIQ_CASCADE_LONG).toBeDefined();
    expect(perceptions.LIQ_CLUSTER).toBeDefined();
    expect(perceptions.LIQ_TRAP).toBeDefined();

    state.price = 101;
    state.priceHistory.push({ ts: NOW, price: 101 });
    perceptions = detectPerceptions(state, settings, NOW).perceptions;
    expect(perceptions.PRICE_PUMP).toBeDefined();
    expect(perceptions.LIQ_TRAP).toBeUndefined();
  });

  it('detects a buffered range breakout against the previous range, excluding the current point', () => {
    state.priceHistory = [99.98, 100, 100.01, 99.99].map((price, index) => ({ ts: NOW - 3_500 + index * 800, price }));
    state.price = 100.08;
    state.priceHistory.push({ ts: NOW, price: state.price });
    expect(detectPerceptions(state, settings, NOW).perceptions.RANGE_BREAK_UP).toBeDefined();
  });

  it('detects rolling volume surge instead of cumulative lifetime flow', () => {
    state.volumeHistory = [];
    for (let index = 0; index < 10; index += 1) state.volumeHistory.push({ ts: NOW - 45_000 + index * 3_000, value: 10 });
    for (let index = 0; index < 4; index += 1) state.volumeHistory.push({ ts: NOW - 8_000 + index * 2_000, value: 100 });
    expect(volumeSurgeRatio(state, NOW)).toBeGreaterThan(3);
    expect(detectPerceptions(state, settings, NOW).perceptions.VOL_SURGE).toBeDefined();
  });

  it('honors the funding threshold setting', () => {
    settings.fundingThresholdPercent = 0.01;
    state.fundingRate = 0.00015; // 0.015%
    expect(detectPerceptions(state, settings, NOW).perceptions.FUND_HIGH).toBeDefined();
    settings.fundingThresholdPercent = 0.02;
    expect(detectPerceptions(state, settings, NOW).perceptions.FUND_HIGH).toBeUndefined();
  });

  it('uses OI snapshot price rather than the latest one-second tick', () => {
    state.previousOpenInterest = 100;
    state.openInterest = 103;
    state.previousOpenInterestPrice = 99;
    state.prevPrice = 100.99;
    state.price = 101;
    expect(detectPerceptions(state, settings, NOW).perceptions.OI_LONG).toBeDefined();
  });

  it('classifies toxic flow from the five largest recent prints', () => {
    state.tradeHistory = Array.from({ length: 10 }, (_, index) => ({ ts: NOW - index * 500, side: index < 7 ? 'BUY' as const : 'SELL' as const, usd: index < 5 ? 10_000 - index : 10, price: 100 }));
    expect(toxicFlowFromTrades(state.tradeHistory, NOW)).toMatchObject({ side: 'BUY' });
    expect(detectPerceptions(state, settings, NOW).perceptions.TOXIC_BUY).toBeDefined();
  });

  it('detects CVD divergence with stable power bounds', () => {
    state.cvdHistory = [
      { ts: NOW - 40_000, price: 100, cvd: 1000 }, { ts: NOW - 38_000, price: 101, cvd: 1200 }, { ts: NOW - 36_000, price: 102, cvd: 1400 }, { ts: NOW - 34_000, price: 103, cvd: 1500 },
      { ts: NOW - 10_000, price: 103, cvd: 1000 }, { ts: NOW - 8_000, price: 104, cvd: 1100 }, { ts: NOW - 6_000, price: 105, cvd: 1200 }, { ts: NOW - 4_000, price: 104, cvd: 1150 },
    ];
    const divergence = cvdDivergence(state, NOW);
    expect(divergence?.key).toBe('CVD_BEAR_DIV');
    expect(divergence?.power).toBeGreaterThan(0);
    expect(divergence?.power).toBeLessThanOrEqual(3);
  });

  it('discounts rapidly changing book levels as possible spoofing', () => {
    expect(microstructureWeight(50)).toBe(0.2);
    expect(microstructureWeight(300)).toBeCloseTo(0.6);
    expect(microstructureWeight(700)).toBe(1);
  });

  it('returns no perceptions below the volume floor', () => {
    state.volume24h = 10;
    state.liquidationHistory.push(liquidation('LONG', 10_000_000));
    expect(detectPerceptions(state, settings, NOW).perceptions).toEqual({});
  });
});
