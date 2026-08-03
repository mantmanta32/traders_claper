import type { MarketState } from '../types/market';

export function createMarketState(symbol: string): MarketState {
  return {
    symbol,
    price: 0,
    prevPrice: 0,
    bid: 0,
    ask: 0,
    bidQuantity: 0,
    askQuantity: 0,
    bidChangedAt: 0,
    askChangedAt: 0,
    bookAgeMs: 0,
    obi: 0,
    volume24h: 0,
    lastCumulativeVolume: 0,
    fundingRate: 0,
    openInterest: 0,
    previousOpenInterest: 0,
    openInterestPrice: 0,
    previousOpenInterestPrice: 0,
    openInterestUpdatedAt: 0,
    priceHistory: [],
    volumeHistory: [],
    liquidationHistory: [],
    tradeHistory: [],
    cvd: 0,
    cvdHistory: [],
    flowHistory: [],
    regime: 'UNKNOWN',
    regimeUpdatedAt: 0,
    cooldownUntil: 0,
    lastTickerAt: 0,
    hasSignal: false,
  };
}

export function pruneByTimestamp<T extends { ts: number }>(items: T[], cutoff: number): void {
  let index = 0;
  while (index < items.length && items[index].ts < cutoff) index += 1;
  if (index > 0) items.splice(0, index);
}
