import type { LiquidationEvent, OrderSide } from '../types/market';
import { finiteNumber } from '../lib/format';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseCoinglassMessage(raw: string | unknown): LiquidationEvent[] {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.data)) return [];
  const channel = String(parsed.channel ?? '');
  if (channel !== 'liquidationOrders' && channel !== 'liq') return [];

  return parsed.data.flatMap((item): LiquidationEvent[] => {
    if (!isRecord(item)) return [];
    const exchange = String(item.exName ?? item.exchangeName ?? 'Unknown');
    let symbol = String(item.originalSymbol ?? item.symbol ?? '').toUpperCase().replace(/[-_/]/g, '');
    if (symbol && !symbol.endsWith('USDT') && /^[A-Z0-9]+$/.test(symbol)) symbol += 'USDT';
    if (!/^[A-Z0-9]+USDT$/.test(symbol)) return [];
    const price = finiteNumber(item.price, NaN);
    const usd = finiteNumber(item.volUsd, NaN);
    const quantity = finiteNumber(item.qty, Number.isFinite(usd / price) ? usd / price : 0);
    if (![price, usd].every(Number.isFinite) || price <= 0 || usd <= 0) return [];

    const numericSide = Number(item.side);
    let orderSide: OrderSide;
    if (numericSide === 1) orderSide = 'SELL'; // Long liquidation
    else if (numericSide === 2) orderSide = 'BUY'; // Short liquidation
    else if (item.side === 'SELL' || item.side === 'BUY') orderSide = item.side;
    else return [];

    const ts = finiteNumber(item.time ?? item.ts, Date.now());
    return [{
      id: `coinglass:${exchange}:${symbol}:${ts}:${orderSide}:${usd}`,
      symbol,
      liquidationSide: orderSide === 'SELL' ? 'LONG' : 'SHORT',
      orderSide,
      usd,
      price,
      quantity: Number.isFinite(quantity) ? quantity : 0,
      ts,
      exchange,
      source: 'coinglass',
    }];
  });
}
