import { describe, expect, it } from 'vitest';
import { parseCoinglassMessage } from '../src/data/coinglassParser';

describe('CoinGlass parser', () => {
  it('parses official liquidationOrders schema and side semantics', () => {
    const result = parseCoinglassMessage(JSON.stringify({ channel: 'liquidationOrders', data: [
      { baseAsset: 'BTC', exName: 'Binance', price: 56738, side: 1, symbol: 'BTCUSDT', time: 1725416318379, volUsd: 3858.184 },
      { baseAsset: 'ETH', exName: 'OKX', price: 2500, side: 2, symbol: 'ETH-USDT', time: 1725416318380, volUsd: 5000 },
    ] }));
    expect(result[0]).toMatchObject({ exchange: 'Binance', symbol: 'BTCUSDT', liquidationSide: 'LONG', orderSide: 'SELL' });
    expect(result[1]).toMatchObject({ exchange: 'OKX', symbol: 'ETHUSDT', liquidationSide: 'SHORT', orderSide: 'BUY' });
  });

  it('supports the legacy liq schema without trusting malformed rows', () => {
    const result = parseCoinglassMessage({ channel: 'liq', data: [
      { exchangeName: 'Bybit', originalSymbol: 'SOLUSDT', price: '150', side: 'SELL', volUsd: '30000', time: 1 },
      { exchangeName: 'Bybit', originalSymbol: '<script>', price: 1, side: 1, volUsd: 10 },
    ] });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ symbol: 'SOLUSDT', quantity: 200, liquidationSide: 'LONG' });
  });

  it('rejects unrelated channels and bad JSON', () => {
    expect(parseCoinglassMessage('{')).toEqual([]);
    expect(parseCoinglassMessage({ channel: 'trades', data: [] })).toEqual([]);
  });
});
