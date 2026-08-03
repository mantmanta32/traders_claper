import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/config';
import { MarketEngine } from '../src/engine/MarketEngine';
import type { AppSettings } from '../src/types/settings';
import type { LiquidationEvent } from '../src/types/market';

let now: number;
let settings: AppSettings;
let engine: MarketEngine;

beforeEach(() => {
  localStorage.clear();
  now = 1_800_000_000_000;
  settings = { ...DEFAULT_SETTINGS, min24hVolumeUsd: 1_000_000, minLiquidationUsd: 1_000, signalTiers: ['S', 'A', 'B', 'C'], minSignalScore: 20 };
  engine = new MarketEngine({ settings, learning: { memory: {}, patterns: {}, verificationQueue: [], verificationHistory: [] }, signalHistory: [], now: () => now });
});

function ticker(price = 100, quoteVolume = 100_000_000) {
  engine.ingestMiniTickers([{ symbol: 'BTCUSDT', price, quoteVolume, eventTime: now }]);
}

function shortLiquidation(usd = 1_000_000): LiquidationEvent {
  return { id: `liq:${now}:${usd}`, symbol: 'BTCUSDT', liquidationSide: 'SHORT', orderSide: 'BUY', usd, price: 100, quantity: usd / 100, ts: now, exchange: 'Binance', source: 'binance' };
}

describe('MarketEngine integration', () => {
  it('ingests normalized market data and publishes symbol snapshots', () => {
    engine.registerSymbols(['BTCUSDT', 'ETHUSDT']);
    ticker();
    engine.ingestMarkPrices([{ symbol: 'BTCUSDT', markPrice: 100.1, fundingRate: 0.0002, eventTime: now }]);
    engine.ingestBookTicker({ symbol: 'BTCUSDT', bid: 99.9, ask: 100.1, bidQuantity: 8, askQuantity: 2, eventTime: now });
    now += 700;
    engine.ingestBookTicker({ symbol: 'BTCUSDT', bid: 99.9, ask: 100.1, bidQuantity: 8, askQuantity: 2, eventTime: now });
    engine.flush();
    const symbol = engine.getSnapshot().symbols.find((item) => item.symbol === 'BTCUSDT');
    expect(symbol).toMatchObject({ price: 100, fundingRate: 0.0002 });
    expect(symbol?.obi).toBeCloseTo(0.6);
    expect(engine.getSnapshot().metrics.trackedSymbols).toBe(2);
  });

  it('turns a whale liquidation into a signal, deduplicates it and requests aggTrade tracking', () => {
    ticker();
    const tracked: string[] = [];
    engine.setAggTracker((symbol) => tracked.push(symbol));
    const event = shortLiquidation();
    expect(engine.ingestLiquidation(event)).toBe(true);
    expect(engine.ingestLiquidation({ ...event, id: 'copy', source: 'coinglass' })).toBe(false);
    engine.flush();
    expect(tracked).toContain('BTCUSDT');
    expect(engine.getSnapshot().activeSignals[0]).toMatchObject({ symbol: 'BTCUSDT', direction: 'LONG', type: 'WHALE_FLUSH_REVERSAL' });
    expect(engine.getSnapshot().metrics.liquidationCount1h).toBe(1);
  });

  it('verifies generated signals against a later price net of costs', () => {
    ticker();
    engine.ingestLiquidation(shortLiquidation());
    expect(engine.getSnapshot().verificationQueue).toHaveLength(1);
    now += 61_000;
    ticker(102);
    engine.tick(now);
    expect(engine.getSnapshot().verificationHistory).toHaveLength(1);
    expect(engine.getSnapshot().verificationHistory[0].win).toBe(true);
    expect(engine.getSnapshot().memory['BTCUSDT:WHALE_FLUSH_REVERSAL'].samples).toBe(1);
  });

  it('enforces whitelist and signal family settings', () => {
    ticker();
    engine.updateSettings({ symbolWhitelist: 'ETH', signalFamilies: ['OI'] });
    engine.ingestLiquidation(shortLiquidation());
    expect(engine.getSnapshot().activeSignals).toHaveLength(0);
  });

  it('maintains rolling liquidation metrics instead of hourly wall-clock resets', () => {
    ticker();
    engine.ingestLiquidation(shortLiquidation(100_000));
    now += 3_599_000;
    engine.tick(now);
    expect(engine.getSnapshot().metrics.liquidationCount1h).toBe(1);
    now += 2_000;
    engine.tick(now);
    expect(engine.getSnapshot().metrics.liquidationCount1h).toBe(0);
  });

  it('updates feed health and message rates', () => {
    engine.setFeedState('market', 'connecting');
    engine.recordFeedMessage('market', 10);
    now += 2_000;
    engine.tick(now);
    const feed = engine.getSnapshot().feeds.find((item) => item.id === 'market');
    expect(feed).toMatchObject({ state: 'live', messagesPerSecond: 5 });
  });
});
