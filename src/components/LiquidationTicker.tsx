import { displaySymbol, formatUsd } from '../lib/format';
import type { EngineSnapshot } from '../types/snapshot';

export function LiquidationTicker({ snapshot }: { snapshot: EngineSnapshot }) {
  const { settings } = snapshot;
  if (!settings.liquidationTicker) return null;
  const liquidations = snapshot.recentLiquidations
    .filter((item) => !settings.liquidationTickerWhalesOnly || item.usd >= settings.whaleBaseUsd)
    .slice(0, 40);
  const loop = liquidations.length ? [...liquidations, ...liquidations] : [];
  return (
    <section className="liquidation-ticker surface" aria-label="Likidasyon akışı">
      <strong>🔥 LİKİDASYONLAR</strong>
      <div className="ticker-window">
        {loop.length ? (
          <div className="ticker-track" style={{ animationDuration: `${settings.liquidationTickerSpeedSeconds}s` }}>
            {loop.map((item, index) => (
              <span key={`${item.id}:${index}`} className={`liq-pill ${item.liquidationSide === 'LONG' ? 'long-liq' : 'short-liq'} ${item.usd >= settings.whaleBaseUsd ? 'whale-liq' : ''}`}>
                {displaySymbol(item.symbol)} {item.liquidationSide === 'LONG' ? '▼' : '▲'} {formatUsd(item.usd, settings.moneyFormat)}
              </span>
            ))}
          </div>
        ) : <span className="ticker-empty">Akış bekleniyor…</span>}
      </div>
    </section>
  );
}
