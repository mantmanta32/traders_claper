export function tradingViewUrl(symbol: string): string {
  return `https://www.tradingview.com/chart/?symbol=BINANCE:${encodeURIComponent(symbol)}.P&interval=1`;
}

export function binanceFuturesUrl(symbol: string): string {
  return `https://www.binance.com/futures/${encodeURIComponent(symbol.replace(/USDT$/, '_USDT'))}`;
}
