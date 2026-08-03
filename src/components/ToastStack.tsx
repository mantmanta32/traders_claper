import { X } from 'lucide-react';
import { displaySignalType, displaySymbol } from '../lib/format';
import type { Signal } from '../types/market';
import type { ToastPosition } from '../types/settings';
import { ExternalLinks } from './ExternalLinks';

export interface ToastItem {
  id: string;
  signal: Signal;
}

export function ToastStack({ items, position, onDismiss }: { items: ToastItem[]; position: ToastPosition; onDismiss: (id: string) => void }) {
  return (
    <div className={`toast-stack toast-${position}`} aria-live="assertive">
      {items.map(({ id, signal }) => (
        <div className={`signal-toast surface tier-${signal.tier}`} key={id}>
          <div><strong>{displaySymbol(signal.symbol)} <span className={signal.direction === 'LONG' ? 'positive' : 'negative'}>{signal.direction === 'LONG' ? '▲ AL' : '▼ SAT'}</span></strong><span className={`tier-badge tier-${signal.tier}`}>{signal.tier} {signal.score}</span><button onClick={() => onDismiss(id)} aria-label="Kapat"><X size={13} /></button></div>
          <p>{displaySignalType(signal.type)}</p>
          <ExternalLinks symbol={signal.symbol} />
        </div>
      ))}
    </div>
  );
}
