import { BrainCircuit, Flame } from 'lucide-react';
import { displaySignalType, displaySymbol, formatAge, formatUsd } from '../lib/format';
import { horizonSummary } from '../engine/learning';
import type { EngineSnapshot } from '../types/snapshot';
import { ExternalLinks } from './ExternalLinks';

export function RecentLiquidationsPanel({ snapshot }: { snapshot: EngineSnapshot }) {
  return (
    <section className="side-panel surface">
      <header><span><Flame size={14} /> Son Likidasyonlar</span><small>{snapshot.recentLiquidations.length}</small></header>
      <div className="side-list">
        {snapshot.recentLiquidations.slice(0, 20).map((item) => (
          <div className="liq-row" key={item.id}>
            <span className={`liq-side ${item.liquidationSide.toLowerCase()}`}>{item.liquidationSide === 'LONG' ? '▼L' : '▲S'}</span>
            <b>{displaySymbol(item.symbol)}</b>
            <strong className={item.usd >= snapshot.settings.whaleBaseUsd ? 'whale-value' : ''}>{formatUsd(item.usd, snapshot.settings.moneyFormat)}</strong>
            <time>{formatAge(item.ts, snapshot.settings.absoluteTime, snapshot.now)}</time>
            <ExternalLinks symbol={item.symbol} compact />
          </div>
        ))}
        {!snapshot.recentLiquidations.length && <p className="panel-empty">Likidasyon akışı bekleniyor…</p>}
      </div>
    </section>
  );
}

export function PatternMemoryPanel({ snapshot }: { snapshot: EngineSnapshot }) {
  const rows = Object.entries(snapshot.memory)
    .map(([key, value]) => ({ key, value, symbol: key.split(':')[0], type: key.split(':').slice(1).join(':') }))
    .filter(({ value }) => value.samples >= Math.min(3, snapshot.settings.minimumLearningSamples))
    .sort((a, b) => b.value.samples - a.value.samples)
    .slice(0, 15);
  return (
    <section className="side-panel surface">
      <header><span><BrainCircuit size={14} /> Pattern Hafızası</span><small>{rows.length}</small></header>
      <div className="side-list">
        {rows.map(({ key, value, symbol, type }) => {
          const winRate = value.samples ? value.wins / value.samples : 0;
          return (
            <div className="pattern-row" key={key}>
              <div><span className="category category-LEARN">{displaySymbol(symbol)}</span><small>{displaySignalType(type)}</small><ExternalLinks symbol={symbol} compact /></div>
              <div><strong className={winRate >= 0.6 ? 'positive' : winRate >= 0.45 ? 'tone-orange' : 'negative'}>%{Math.round(winRate * 100)}</strong><span>{value.samples} işlem</span></div>
              <div className="confidence"><i style={{ width: `${winRate * 100}%` }} /></div>
              <em>{horizonSummary(value) || 'horizon bekleniyor'}</em>
            </div>
          );
        })}
        {!rows.length && <p className="panel-empty">Yeterli doğrulama verisi henüz yok.</p>}
      </div>
    </section>
  );
}
