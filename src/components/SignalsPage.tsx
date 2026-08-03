import { useMemo, useState } from 'react';
import { translator } from '../lib/i18n';
import type { Direction, SignalFamily, SignalTier } from '../types/market';
import type { EngineSnapshot } from '../types/snapshot';
import { EmptyState } from './EmptyState';
import { SignalCard } from './SignalCard';
import { PatternMemoryPanel, RecentLiquidationsPanel } from './SidePanels';
import { StatusBar } from './StatusBar';

type DirectionFilter = Direction | 'ALL';
const FAMILIES: SignalFamily[] = ['WHALE', 'CASCADE', 'ABSORPTION', 'BREAKOUT', 'MOMENTUM', 'FLOW', 'OI', 'FUND'];
const TIERS: SignalTier[] = ['S', 'A', 'B', 'C'];

export function SignalsPage({ snapshot }: { snapshot: EngineSnapshot }) {
  const [direction, setDirection] = useState<DirectionFilter>('ALL');
  const [family, setFamily] = useState<SignalFamily | null>(null);
  const [tiers, setTiers] = useState<Set<SignalTier>>(() => new Set(['S', 'A', 'B']));
  const t = translator(snapshot.settings.language);
  const signals = useMemo(() => snapshot.activeSignals
    .filter((signal) => direction === 'ALL' || signal.direction === direction)
    .filter((signal) => !family || signal.family === family)
    .filter((signal) => tiers.has(signal.tier))
    .sort((a, b) => b.score - a.score), [snapshot.activeSignals, direction, family, tiers]);
  const toggleTier = (tier: SignalTier) => setTiers((current) => {
    const next = new Set(current);
    if (next.has(tier)) next.delete(tier); else next.add(tier);
    return next;
  });
  const anyLive = snapshot.feeds.some((feed) => feed.state === 'live');
  return (
    <div className="page-stack">
      <StatusBar snapshot={snapshot} />
      <section className="filter-bar surface">
        <span>{t('direction')}:</span>
        {(['ALL', 'LONG', 'SHORT'] as DirectionFilter[]).map((value) => <button key={value} className={direction === value ? `active ${value.toLowerCase()}` : ''} onClick={() => setDirection(value)}>{value === 'ALL' ? t('all') : value === 'LONG' ? `▲ ${t('buy')}` : `▼ ${t('sell')}`}</button>)}
        <i />
        <span>Sinyal:</span>
        <div className="family-filters">{FAMILIES.map((value) => <button key={value} className={family === value ? 'active' : ''} onClick={() => setFamily((current) => current === value ? null : value)}>{value}</button>)}</div>
        <div className="tier-filters"><span>{t('tier')}:</span>{TIERS.map((tier) => <button key={tier} className={`tier-filter tier-${tier} ${tiers.has(tier) ? 'on' : ''}`} onClick={() => toggleTier(tier)}>{tier}</button>)}</div>
        <strong>{signals.length} {t('signals').toLocaleLowerCase(snapshot.settings.language === 'tr' ? 'tr-TR' : 'en-US')}</strong>
      </section>
      <div className="content-grid">
        <main className="signal-list">
          {signals.map((signal) => <SignalCard key={signal.id} signal={signal} memory={snapshot.memory[`${signal.symbol}:${signal.type}`]} settings={snapshot.settings} now={snapshot.now} />)}
          {!signals.length && <EmptyState title={anyLive ? t('noSignals') : 'Bağlanıyor…'} detail={anyLive ? `${t('marketWatching')} · ${snapshot.metrics.trackedSymbols} coin` : 'Binance veri akışları kuruluyor'} />}
        </main>
        <aside className="sidebar"><RecentLiquidationsPanel snapshot={snapshot} /><PatternMemoryPanel snapshot={snapshot} /></aside>
      </div>
    </div>
  );
}
