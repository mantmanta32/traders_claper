import { ExternalLink } from 'lucide-react';
import { binanceFuturesUrl, tradingViewUrl } from '../lib/links';

export function ExternalLinks({ symbol, compact = false }: { symbol: string; compact?: boolean }) {
  return (
    <div className="external-links" onClick={(event) => event.stopPropagation()}>
      <a className="link-btn" href={tradingViewUrl(symbol)} target="_blank" rel="noopener noreferrer" aria-label={`${symbol} TradingView`}>
        <ExternalLink size={12} /> {compact ? 'TV' : 'TradingView'}
      </a>
      {!compact && (
        <a className="link-btn link-binance" href={binanceFuturesUrl(symbol)} target="_blank" rel="noopener noreferrer" aria-label={`${symbol} Binance Futures`}>
          ⚡ Binance
        </a>
      )}
    </div>
  );
}
