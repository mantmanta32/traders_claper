import type {
  AggTradeUpdate,
  BookTickerUpdate,
  LiquidationEvent,
  MarkPriceUpdate,
  MiniTickerUpdate,
  OpenInterestUpdate,
  OrderSide,
} from '../types/market';
import { finiteNumber } from '../lib/format';

export type BinanceParsedEvent =
  | { kind: 'miniTicker'; data: MiniTickerUpdate[] }
  | { kind: 'markPrice'; data: MarkPriceUpdate[] }
  | { kind: 'bookTicker'; data: BookTickerUpdate }
  | { kind: 'liquidation'; data: LiquidationEvent }
  | { kind: 'aggTrade'; data: AggTradeUpdate }
  | { kind: 'subscription'; data: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(raw: string | unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function unwrapCombined(value: unknown): unknown {
  if (isRecord(value) && 'stream' in value && 'data' in value) return value.data;
  return value;
}

function parseMiniTicker(item: unknown): MiniTickerUpdate | null {
  if (!isRecord(item) || item.e !== '24hrMiniTicker' || typeof item.s !== 'string') return null;
  const price = finiteNumber(item.c, NaN);
  const quoteVolume = finiteNumber(item.q, NaN);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(quoteVolume) || quoteVolume < 0) return null;
  return { symbol: item.s, price, quoteVolume, eventTime: finiteNumber(item.E, Date.now()) };
}

function parseMarkPrice(item: unknown): MarkPriceUpdate | null {
  if (!isRecord(item) || item.e !== 'markPriceUpdate' || typeof item.s !== 'string') return null;
  const markPrice = finiteNumber(item.p, NaN);
  const fundingRate = finiteNumber(item.r, NaN);
  if (!Number.isFinite(markPrice) || markPrice <= 0 || !Number.isFinite(fundingRate)) return null;
  return { symbol: item.s, markPrice, fundingRate, eventTime: finiteNumber(item.E, Date.now()) };
}

function parseBookTicker(item: unknown): BookTickerUpdate | null {
  if (!isRecord(item) || item.e !== 'bookTicker' || typeof item.s !== 'string') return null;
  const bid = finiteNumber(item.b, NaN);
  const ask = finiteNumber(item.a, NaN);
  const bidQuantity = finiteNumber(item.B, NaN);
  const askQuantity = finiteNumber(item.A, NaN);
  if (![bid, ask, bidQuantity, askQuantity].every(Number.isFinite) || bid <= 0 || ask <= 0 || ask < bid) return null;
  return {
    symbol: item.s,
    bid,
    ask,
    bidQuantity,
    askQuantity,
    eventTime: finiteNumber(item.E ?? item.T, Date.now()),
  };
}

function parseLiquidation(item: unknown): LiquidationEvent | null {
  if (!isRecord(item) || item.e !== 'forceOrder' || !isRecord(item.o)) return null;
  const order = item.o;
  if (typeof order.s !== 'string' || (order.S !== 'BUY' && order.S !== 'SELL')) return null;
  const quantity = finiteNumber(order.l ?? order.q, NaN);
  const price = finiteNumber(order.ap ?? order.p, NaN);
  const usd = quantity * price;
  if (![quantity, price, usd].every(Number.isFinite) || quantity <= 0 || price <= 0 || usd <= 0) return null;
  const orderSide = order.S as OrderSide;
  const ts = finiteNumber(order.T ?? item.E, Date.now());
  return {
    id: `binance:${order.s}:${ts}:${orderSide}:${quantity}`,
    symbol: order.s,
    liquidationSide: orderSide === 'SELL' ? 'LONG' : 'SHORT',
    orderSide,
    usd,
    price,
    quantity,
    ts,
    exchange: 'Binance',
    source: 'binance',
  };
}

function parseAggTrade(item: unknown): AggTradeUpdate | null {
  if (!isRecord(item) || item.e !== 'aggTrade' || typeof item.s !== 'string') return null;
  const price = finiteNumber(item.p, NaN);
  const quantity = finiteNumber(item.q, NaN);
  if (![price, quantity].every(Number.isFinite) || price <= 0 || quantity <= 0) return null;
  return {
    symbol: item.s,
    price,
    quantity,
    usd: price * quantity,
    side: item.m === true ? 'SELL' : 'BUY',
    eventTime: finiteNumber(item.T ?? item.E, Date.now()),
    tradeId: Number.isFinite(Number(item.a)) ? Number(item.a) : undefined,
  };
}

export function parseBinanceMessage(raw: string | unknown): BinanceParsedEvent[] {
  const parsed = unwrapCombined(parseJson(raw));
  if (parsed === null) return [];
  if (isRecord(parsed) && ('result' in parsed || 'id' in parsed) && !('e' in parsed)) {
    return [{ kind: 'subscription', data: parsed }];
  }
  if (Array.isArray(parsed)) {
    const miniTickers = parsed.map(parseMiniTicker).filter((item): item is MiniTickerUpdate => item !== null);
    if (miniTickers.length) return [{ kind: 'miniTicker', data: miniTickers }];
    const markPrices = parsed.map(parseMarkPrice).filter((item): item is MarkPriceUpdate => item !== null);
    if (markPrices.length) return [{ kind: 'markPrice', data: markPrices }];
    const liquidations = parsed.map(parseLiquidation).filter((item): item is LiquidationEvent => item !== null);
    return liquidations.map((data) => ({ kind: 'liquidation' as const, data }));
  }
  const miniTicker = parseMiniTicker(parsed);
  if (miniTicker) return [{ kind: 'miniTicker', data: [miniTicker] }];
  const markPrice = parseMarkPrice(parsed);
  if (markPrice) return [{ kind: 'markPrice', data: [markPrice] }];
  const bookTicker = parseBookTicker(parsed);
  if (bookTicker) return [{ kind: 'bookTicker', data: bookTicker }];
  const liquidation = parseLiquidation(parsed);
  if (liquidation) return [{ kind: 'liquidation', data: liquidation }];
  const aggTrade = parseAggTrade(parsed);
  if (aggTrade) return [{ kind: 'aggTrade', data: aggTrade }];
  return [];
}

export function parseExchangeInfo(raw: unknown): string[] {
  if (!isRecord(raw) || !Array.isArray(raw.symbols)) return [];
  return raw.symbols
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .filter((item) => item.status === 'TRADING' && item.contractType === 'PERPETUAL' && item.quoteAsset === 'USDT')
    .map((item) => item.symbol)
    .filter((symbol): symbol is string => typeof symbol === 'string' && /^[A-Z0-9]+USDT$/.test(symbol));
}

export function parseOpenInterest(raw: unknown, symbol: string): OpenInterestUpdate | null {
  if (!isRecord(raw)) return null;
  const openInterest = finiteNumber(raw.openInterest, NaN);
  if (!Number.isFinite(openInterest) || openInterest < 0) return null;
  return { symbol, openInterest, time: finiteNumber(raw.time, Date.now()) };
}
