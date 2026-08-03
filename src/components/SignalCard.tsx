import { ChevronDown, Clock3, Gauge, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { displayRegime, displaySignalType, displaySymbol, formatAge, formatPrice } from '../lib/format';
import type { MemoryEntry, Signal } from '../types/market';
import type { AppSettings } from '../types/settings';
import { ExternalLinks } from './ExternalLinks';

export function SignalCard({ signal, memory, settings, now }: { signal: Signal; memory?: MemoryEntry; settings: AppSettings; now: number }) {
  const [expanded, setExpanded] = useState(false);
  const ttlPercent = Math.max(0, Math.min(100, ((signal.expiresAt - now) / signal.ttlMs) * 100));
  const learned = memory && memory.samples >= settings.minimumLearningSamples
    ? `%${Math.round((memory.wins / memory.samples) * 100)} WR (${memory.samples})`
    : settings.language === 'tr' ? 'Öğreniyor…' : 'Learning…';
  return (
    <article className={`signal-card surface tier-${signal.tier}`}>
      <div className={`ttl-progress ${signal.direction.toLowerCase()}`} style={{ width: `${ttlPercent}%` }} />
      <button className="signal-summary" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
        <span className={`direction-icon ${signal.direction.toLowerCase()}`}>{signal.direction === 'LONG' ? '↗' : '↘'}</span>
        <span className="signal-main">
          <span className="signal-title-row">
            <span className={`direction-badge ${signal.direction.toLowerCase()}`}>{signal.direction === 'LONG' ? '▲ AL' : '▼ SAT'}</span>
            <strong>{displaySymbol(signal.symbol)}</strong>
            <span className={`tier-badge tier-${signal.tier}`}>{signal.tier}-tier</span>
          </span>
          <span className="signal-meta">
            <span>@ {formatPrice(signal.price)}</span>
            <span><Clock3 size={11} />{formatAge(signal.createdAt, settings.absoluteTime, now)}</span>
            <span>🧠 {learned}</span>
            <span>🧭 {displayRegime(signal.regime)}</span>
            <span>OBI {signal.obi >= 0 ? '+' : ''}{(signal.obi * 100).toFixed(0)}%</span>
            <span>Bayes {signal.bayesPosterior.toFixed(2)}</span>
          </span>
        </span>
        <span className="category-stack">{[...new Set(signal.perceptions.map((item) => item.category))].map((category) => <i className={`category category-${category}`} key={category}>{category}</i>)}</span>
        <span className={`signal-score score-${signal.tier}`}><b>{signal.score}</b><small>güven</small></span>
        <ChevronDown className={expanded ? 'rotate' : ''} size={16} />
      </button>
      <div className="score-track"><span className={`score-fill score-${signal.tier}`} style={{ width: `${signal.score}%` }} /></div>
      <div className="sizing-line">
        <Gauge size={12} /> Quarter-Kelly {(signal.plan.suggestedPositionFraction * 100).toFixed(1)}% · p̂ {(signal.estimatedProbability * 100).toFixed(1)}% · R:R {signal.plan.riskReward.toFixed(1)}x
      </div>
      {expanded && (
        <div className="signal-details">
          <h4>⚡ NEDENSELLİK ZİNCİRİ</h4>
          <div className="reason-chain">
            {signal.perceptions.map((perception, index) => (
              <div className="reason-row" key={perception.type}>
                <span className="tree">{index === signal.perceptions.length - 1 ? '└─' : '├─'}</span>
                <span className={`category category-${perception.category}`}>{perception.category}</span>
                <span><b>{perception.label}</b> · {perception.detail}</span>
              </div>
            ))}
            <div className="reason-row"><span className="tree">└─</span><span className="category category-LEARN">LEARN</span><span>{learned}</span></div>
          </div>
          <div className="perception-bars">
            {signal.perceptions.map((perception) => (
              <div className="perception-row" key={perception.type}>
                <span>{perception.label}</span><i><b style={{ width: `${Math.min(100, perception.power * 100)}%` }} /></i><em>{Math.round(perception.power * 100)}%</em>
              </div>
            ))}
          </div>
          <p className="signal-reason">{signal.reason}</p>
          <div className="pattern-code">PATTERN: {signal.patternId || '—'}</div>
          <div className="trade-plan">
            <h4><ShieldAlert size={13} /> İşlem planı</h4>
            <div className="plan-grid">
              <span>Entry<b>{formatPrice(signal.plan.entry)}</b></span>
              <span>Invalid<b className="negative">{formatPrice(signal.plan.invalidation)}</b></span>
              <span>Risk<b className="tone-orange">{formatPrice(signal.plan.riskPerUnit)}</b></span>
              <span>TP1<b className="positive">{formatPrice(signal.plan.takeProfit1)}</b></span>
              <span>TP2<b className="tone-blue">{formatPrice(signal.plan.takeProfit2)}</b></span>
              <span>R:R<b className="tone-purple">{signal.plan.riskReward.toFixed(1)}x</b></span>
            </div>
          </div>
          <ExternalLinks symbol={signal.symbol} />
        </div>
      )}
    </article>
  );
}
