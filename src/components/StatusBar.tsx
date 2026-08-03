import { formatDuration, formatUsd } from '../lib/format';
import { translator } from '../lib/i18n';
import type { EngineSnapshot } from '../types/snapshot';

export function StatusBar({ snapshot }: { snapshot: EngineSnapshot }) {
  const { metrics, feeds, settings } = snapshot;
  const t = translator(settings.language);
  const cards = [
    { label: t('activeSymbols'), value: metrics.activeSymbols, tone: 'blue' },
    { label: t('signalsHour'), value: metrics.signalsLastHour, tone: 'purple' },
    { label: t('successRate'), value: metrics.winRate === null ? '—' : `%${Math.round(metrics.winRate * 100)}`, tone: metrics.winRate !== null && metrics.winRate >= 0.5 ? 'green' : 'orange' },
    { label: t('liqVolume'), value: formatUsd(metrics.liquidationVolume1h, settings.moneyFormat), tone: 'red' },
    { label: 'S-tier', value: metrics.sTier, tone: 'red' },
    { label: 'A-tier', value: metrics.aTier, tone: 'orange' },
    { label: t('uptime'), value: formatDuration(metrics.uptimeSeconds), tone: 'muted' },
  ];
  return (
    <section className="status-panel surface" aria-label="Sistem durumu">
      <div className="status-grid">
        {cards.map((card) => <div className="stat" key={card.label}><small>{card.label}</small><strong className={`tone-${card.tone}`}>{card.value}</strong></div>)}
      </div>
      <div className="feed-list" aria-label={t('feedStatus')}>
        {feeds.map((feed) => (
          <div className="feed-pill" key={feed.id} title={feed.detail}>
            <span className={`feed-dot state-${feed.state}`} />
            <span>{feed.label}</span>
            <small>{feed.messagesPerSecond}/s</small>
          </div>
        ))}
      </div>
    </section>
  );
}
