import { describe, expect, it } from 'vitest';
import { parseBinanceMessage, parseExchangeInfo, parseOpenInterest } from '../src/data/binanceParser';

describe('Binance websocket parser', () => {
  it('parses a combined mini ticker array', () => {
    const result = parseBinanceMessage(JSON.stringify({
      stream: '!miniTicker@arr',
      data: [
        { e: '24hrMiniTicker', E: 1_700_000_000_000, s: 'BTCUSDT', c: '64123.4', q: '123456789.2' },
        { e: '24hrMiniTicker', E: 1_700_000_000_001, s: 'ETHUSDT', c: '3210.5', q: '45678901' },
      ],
    }));
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe('miniTicker');
    if (result[0].kind === 'miniTicker') {
      expect(result[0].data).toHaveLength(2);
      expect(result[0].data[0]).toMatchObject({ symbol: 'BTCUSDT', price: 64123.4 });
    }
  });

  it('parses all-market mark price updates', () => {
    const result = parseBinanceMessage({ stream: '!markPrice@arr@1s', data: [{ e: 'markPriceUpdate', E: 100, s: 'BTCUSDT', p: '60000', r: '0.0001' }] });
    expect(result[0]).toEqual({ kind: 'markPrice', data: [{ symbol: 'BTCUSDT', markPrice: 60000, fundingRate: 0.0001, eventTime: 100 }] });
  });

  it('maps Binance force order sides to liquidated position sides', () => {
    const longLiquidation = parseBinanceMessage({ stream: '!forceOrder@arr', data: { e: 'forceOrder', E: 101, o: { s: 'BTCUSDT', S: 'SELL', q: '2', ap: '50000', T: 100 } } });
    const shortLiquidation = parseBinanceMessage({ e: 'forceOrder', E: 101, o: { s: 'ETHUSDT', S: 'BUY', l: '3', p: '2000', T: 100 } });
    expect(longLiquidation[0]).toMatchObject({ kind: 'liquidation', data: { liquidationSide: 'LONG', orderSide: 'SELL', usd: 100000 } });
    expect(shortLiquidation[0]).toMatchObject({ kind: 'liquidation', data: { liquidationSide: 'SHORT', orderSide: 'BUY', usd: 6000 } });
  });

  it('parses book ticker and aggTrade events', () => {
    expect(parseBinanceMessage({ stream: '!bookTicker', data: { e: 'bookTicker', E: 12, s: 'BTCUSDT', b: '10', B: '5', a: '10.1', A: '4' } })[0]).toMatchObject({ kind: 'bookTicker', data: { bid: 10, ask: 10.1, bidQuantity: 5, askQuantity: 4 } });
    expect(parseBinanceMessage({ e: 'aggTrade', E: 12, T: 11, s: 'BTCUSDT', p: '10', q: '2', m: true, a: 44 })[0]).toEqual({ kind: 'aggTrade', data: { symbol: 'BTCUSDT', price: 10, quantity: 2, usd: 20, side: 'SELL', eventTime: 11, tradeId: 44 } });
  });

  it('rejects malformed or economically invalid events', () => {
    expect(parseBinanceMessage('not-json')).toEqual([]);
    expect(parseBinanceMessage({ e: 'bookTicker', s: 'BTCUSDT', b: '11', a: '10', B: '1', A: '1' })).toEqual([]);
    expect(parseBinanceMessage({ e: 'forceOrder', o: { s: 'BTCUSDT', S: 'SELL', q: '-1', p: '10' } })).toEqual([]);
  });
});

describe('Binance REST parser', () => {
  it('keeps only active perpetual USDT contracts', () => {
    const symbols = parseExchangeInfo({ symbols: [
      { symbol: 'BTCUSDT', status: 'TRADING', contractType: 'PERPETUAL', quoteAsset: 'USDT' },
      { symbol: 'ETHUSDT_260925', status: 'TRADING', contractType: 'CURRENT_QUARTER', quoteAsset: 'USDT' },
      { symbol: 'BTCBUSD', status: 'TRADING', contractType: 'PERPETUAL', quoteAsset: 'BUSD' },
      { symbol: 'OLDUSDT', status: 'BREAK', contractType: 'PERPETUAL', quoteAsset: 'USDT' },
    ] });
    expect(symbols).toEqual(['BTCUSDT']);
  });

  it('validates open interest', () => {
    expect(parseOpenInterest({ openInterest: '123.45', time: 99 }, 'BTCUSDT')).toEqual({ symbol: 'BTCUSDT', openInterest: 123.45, time: 99 });
    expect(parseOpenInterest({ openInterest: '-1' }, 'BTCUSDT')).toBeNull();
  });
});
