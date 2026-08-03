import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { displayRegime, displaySymbol, formatPercent, formatPrice, formatUsd } from '../lib/format';
import { translator } from '../lib/i18n';
import type { SymbolSnapshot } from '../types/market';
import type { EngineSnapshot } from '../types/snapshot';
import { ExternalLinks } from './ExternalLinks';

type ScannerFilter = 'all' | 'hot' | 'whale' | 'funding' | 'oi';

function SymbolCard({ symbol, snapshot }: { symbol: SymbolSnapshot; snapshot: EngineSnapshot }) {
  const tags: Array<{ className: string; label: string }> = [];
  if (symbol.hasSignal || symbol.liquidationCount1h > 3) tags.push({ className: 'hot', label: '🔥 Aktif' });
  if (symbol.hasWhaleLiquidation) tags.push({ className: 'whale', label: '🐋 Whale' });
  if (Math.abs(symbol.priceChangePercent) >= 0.8) tags.push({ className: 'mom', label: `⚡ MOM ${formatPercent(symbol.priceChangePercent)}` });
  if (Math.abs(symbol.fundingRate * 100) >= snapshot.settings.fundingThresholdPercent) tags.push({ className: 'fund', label: `💰 FUND ${formatPercent(symbol.fundingRate * 100, 3)}` });
  if (symbol.regime !== 'UNKNOWN') tags.push({ className: 'regime', label: `🧭 ${displayRegime(symbol.regime)}` });
  if (Math.abs(symbol.obi) > 0.6) tags.push({ className: 'obi', label: `📘 OBI ${formatPercent(symbol.obi * 100, 0)}` });
  if (symbol.bookAgeMs > 0) tags.push({ className: 'book', label: `⏱ BOOK ${symbol.bookAgeMs < 100 ? 'spoof?' : symbol.bookAgeMs > 500 ? 'stable' : 'mixed'}` });
  if (symbol.toxicFlow !== 'NEUTRAL') tags.push({ className: 'toxic', label: `🧨 TOX ${symbol.toxicFlow} ${Math.round(symbol.toxicRatio * 100)}%` });
  if (symbol.openInterestReady && Math.abs(symbol.openInterestDelta) > 0.01) tags.push({ className: 'oi', label: `🧠 OI ${formatPercent(symbol.openInterestDelta * 100)}` });
  if (symbol.liquidationCount1h) tags.push({ className: 'liq', label: `${symbol.liquidationCount1h} liq · ${formatUsd(symbol.liquidationVolume1h, snapshot.settings.moneyFormat)}` });
  return (
    <article className={`symbol-card surface ${symbol.hasWhaleLiquidation ? 'whale-card' : symbol.hasSignal ? 'hot-card' : ''}`}>
      <div className="symbol-top"><div><strong>{displaySymbol(symbol.symbol)}</strong><span>{formatPrice(symbol.price)}</span><b className={symbol.priceChangePercent >= 0 ? 'positive' : 'negative'}>{formatPercent(symbol.priceChangePercent)}</b></div><ExternalLinks symbol={symbol.symbol} compact /></div>
      <div className="symbol-tags">{tags.map((tag) => <span className={`symbol-tag ${tag.className}`} key={`${tag.className}:${tag.label}`}>{tag.label}</span>)}</div>
    </article>
  );
}

export function ScannerPage({ snapshot }: { snapshot: EngineSnapshot }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ScannerFilter>('all');
  const t = translator(snapshot.settings.language);
  const symbols = useMemo(() => snapshot.symbols
    .filter((symbol) => symbol.volume24h >= snapshot.settings.min24hVolumeUsd)
    .filter((symbol) => !query || symbol.symbol.includes(query.trim().toUpperCase()))
    .filter((symbol) => filter !== 'hot' || symbol.hasSignal || symbol.liquidationCount1h > 2)
    .filter((symbol) => filter !== 'whale' || symbol.hasWhaleLiquidation)
    .filter((symbol) => filter !== 'funding' || Math.abs(symbol.fundingRate * 100) >= snapshot.settings.fundingThresholdPercent)
    .filter((symbol) => filter !== 'oi' || symbol.openInterestReady && Math.abs(symbol.openInterestDelta) > 0.01)
    .sort((a, b) => Number(b.hasSignal) - Number(a.hasSignal) || b.liquidationCount1h - a.liquidationCount1h || b.volume24h - a.volume24h),
  [snapshot.symbols, snapshot.settings.min24hVolumeUsd, snapshot.settings.fundingThresholdPercent, query, filter]);
  const filters: Array<{ id: ScannerFilter; label: string }> = [
    { id: 'all', label: t('all') }, { id: 'hot', label: `🔥 ${t('hot')}` }, { id: 'whale', label: `🐋 ${t('whale')}` }, { id: 'funding', label: `💰 ${t('funding')}` }, { id: 'oi', label: '🧠 OI' },
  ];
  return (
    <div className="page-stack">
      <section className="scanner-toolbar surface">
        <label><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`${t('searchCoin')} (BTCUSDT)`} /></label>
        {filters.map((item) => <button key={item.id} className={filter === item.id ? 'active' : ''} onClick={() => setFilter(item.id)}>{item.label}</button>)}
        <strong>{symbols.length}</strong>
      </section>
      <div className="scanner-grid">{symbols.map((symbol) => <SymbolCard key={symbol.symbol} symbol={symbol} snapshot={snapshot} />)}</div>
      {!symbols.length && <div className="empty-state surface"><strong>Sembol bulunamadı</strong><p>Filtreyi veya minimum hacim ayarını kontrol et.</p></div>}
    </div>
  );
}
