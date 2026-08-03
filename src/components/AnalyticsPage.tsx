import { BarChart3, BrainCircuit, History, TimerReset } from 'lucide-react';
import { displaySignalType, displaySymbol, formatAge, formatUsd } from '../lib/format';
import { horizonSummary } from '../engine/learning';
import { translator } from '../lib/i18n';
import type { EngineSnapshot } from '../types/snapshot';
import { ExternalLinks } from './ExternalLinks';

export function AnalyticsPage({ snapshot }: { snapshot: EngineSnapshot }) {
  const { metrics, settings } = snapshot;
  const t = translator(settings.language);
  const learnedRows = Object.entries(snapshot.memory)
    .map(([key, memory]) => ({ key, memory, symbol: key.split(':')[0], type: key.split(':').slice(1).join(':') }))
    .filter(({ memory }) => memory.samples >= 3)
    .sort((a, b) => (b.memory.wins / b.memory.samples) - (a.memory.wins / a.memory.samples));
  const cards = [
    { label: t('totalSignals'), value: metrics.totalSignals, tone: 'blue' },
    { label: t('learnedPatterns'), value: Object.keys(snapshot.memory).length, tone: 'cyan' },
    { label: t('verifiedTrades'), value: metrics.verifiedTrades, tone: 'purple' },
    { label: t('pendingVerification'), value: metrics.pendingVerifications, tone: 'orange' },
    { label: t('generalWr'), value: metrics.winRate === null ? '—' : `%${Math.round(metrics.winRate * 100)}`, tone: metrics.winRate !== null && metrics.winRate >= 0.5 ? 'green' : 'red' },
    { label: t('totalNetPnl'), value: `${metrics.totalNetPnl >= 0 ? '+' : ''}${(metrics.totalNetPnl * 100).toFixed(2)}%`, tone: metrics.totalNetPnl >= 0 ? 'green' : 'red' },
    { label: t('trackedCoins'), value: metrics.trackedSymbols, tone: 'text' },
    { label: 'OI Snapshot', value: metrics.openInterestReady, tone: 'purple' },
    { label: 'Liq Hacmi · 1h', value: formatUsd(metrics.liquidationVolume1h, settings.moneyFormat), tone: 'red' },
  ];
  return (
    <div className="page-stack">
      <section className="analytics-grid">{cards.map((card) => <div className="analytics-card surface" key={card.label}><small>{card.label}</small><strong className={`tone-${card.tone}`}>{card.value}</strong></div>)}</section>
      <section className="analytics-panel surface">
        <header><span><BrainCircuit size={15} />{t('learningPerformance')}</span><small>en iyi → en kötü</small></header>
        <div className="learning-table table-scroll">
          <div className="table-head"><span>Pattern</span><span>WR</span><span>PnL</span><span>n</span></div>
          {learnedRows.slice(0, 50).map(({ key, memory, symbol, type }) => {
            const winRate = memory.wins / memory.samples;
            const averagePnl = memory.netPnl / memory.samples;
            const filtered = memory.samples >= 15 && winRate < 0.35;
            return (
              <div className={`learning-row ${filtered ? 'filtered' : ''}`} key={key}>
                <span><b>{displaySymbol(symbol)}</b> {displaySignalType(type)} {filtered && <em>⛔ FİLTRELİ</em>}<small>{horizonSummary(memory) || 'horizon bekleniyor'}</small></span>
                <strong className={winRate >= 0.6 ? 'positive' : winRate >= 0.45 ? 'tone-orange' : 'negative'}>%{Math.round(winRate * 100)}</strong>
                <strong className={averagePnl >= 0 ? 'positive' : 'negative'}>{averagePnl >= 0 ? '+' : ''}{(averagePnl * 100).toFixed(2)}%</strong>
                <span>{memory.samples}</span>
              </div>
            );
          })}
          {!learnedRows.length && <p className="panel-empty">Henüz doğrulanmış yeterli örnek yok.</p>}
        </div>
      </section>
      <div className="analytics-split">
        <section className="analytics-panel surface">
          <header><span><History size={15} />{t('signalHistory')}</span><small>{snapshot.signalHistory.length}</small></header>
          <div className="history-list">
            {snapshot.signalHistory.slice(0, 30).map((signal) => (
              <div className="history-row" key={signal.id}><span className={`tier-badge tier-${signal.tier}`}>{signal.tier}</span><b>{displaySymbol(signal.symbol)}</b><span className={`direction-badge ${signal.direction.toLowerCase()}`}>{signal.direction === 'LONG' ? '▲ AL' : '▼ SAT'}</span><span>{displaySignalType(signal.type)}</span><time>{formatAge(signal.createdAt, settings.absoluteTime, snapshot.now)}</time><ExternalLinks symbol={signal.symbol} compact /></div>
            ))}
            {!snapshot.signalHistory.length && <p className="panel-empty">Sinyal geçmişi boş.</p>}
          </div>
        </section>
        <section className="analytics-panel surface">
          <header><span><TimerReset size={15} />Doğrulama Geçmişi</span><small>{snapshot.verificationHistory.length}</small></header>
          <div className="history-list">
            {snapshot.verificationHistory.slice(0, 30).map((record) => (
              <div className="history-row verification-row" key={record.id}><span className={record.win ? 'result-win' : 'result-loss'}>{record.win ? 'WIN' : 'LOSS'}</span><b>{displaySymbol(record.symbol)}</b><span>{record.horizonSeconds}s</span><strong className={record.netPnl >= 0 ? 'positive' : 'negative'}>{record.netPnl >= 0 ? '+' : ''}{(record.netPnl * 100).toFixed(3)}%</strong><time>{formatAge(record.verifiedAt, settings.absoluteTime, snapshot.now)}</time></div>
            ))}
            {!snapshot.verificationHistory.length && <p className="panel-empty">Doğrulama sonucu henüz yok.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
