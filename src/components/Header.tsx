import { Activity, BarChart3, Bell, BellOff, Pause, Play, ScanSearch, Settings, Waves } from 'lucide-react';
import { formatUsd } from '../lib/format';
import { translator } from '../lib/i18n';
import type { EngineSnapshot } from '../types/snapshot';

export type AppTab = 'signals' | 'scanner' | 'analytics';

interface HeaderProps {
  snapshot: EngineSnapshot;
  activeTab: AppTab;
  onTab: (tab: AppTab) => void;
  onSettings: () => void;
  onPause: () => void;
  onSound: () => void;
}

export function Header({ snapshot, activeTab, onTab, onSettings, onPause, onSound }: HeaderProps) {
  const { metrics, settings } = snapshot;
  const t = translator(settings.language);
  const tabs: Array<{ id: AppTab; label: string; icon: typeof Waves }> = [
    { id: 'signals', label: t('signals'), icon: Waves },
    { id: 'scanner', label: t('scanner'), icon: ScanSearch },
    { id: 'analytics', label: t('analytics'), icon: BarChart3 },
  ];
  return (
    <header className="app-header">
      <div className="header-main shell">
        <div className="brand" aria-label="EWS v3">
          <div className="brand-mark"><Activity size={19} /><span /></div>
          <div className="brand-copy"><strong>ERKEN UYARI</strong><small>Futures EWS v3.0</small></div>
        </div>
        <div className="header-chips" aria-label="Canlı metrikler">
          <span className="chip chip-green"><i />{metrics.activeSymbols} sembol</span>
          {metrics.sTier > 0 && <span className="chip chip-red">🔥 {metrics.sTier} S-tier</span>}
          <span className="chip chip-blue">⚡ {metrics.eventsPerSecond}/s</span>
          <span className="chip chip-orange">● {formatUsd(metrics.liquidationVolume1h, settings.moneyFormat)} liq</span>
        </div>
        <div className="header-actions">
          <div className="long-short-ratio" title="Aktif long / short sinyalleri">
            <b className="positive">{metrics.longSignals}</b><span>L/S</span><b className="negative">{metrics.shortSignals}</b>
          </div>
          <button className={`button button-small ${snapshot.paused ? 'active-danger' : ''}`} onClick={onPause}>
            {snapshot.paused ? <Play size={14} /> : <Pause size={14} />}{snapshot.paused ? t('resume') : t('pause')}
          </button>
          <button className="icon-button" onClick={onSound} aria-label={snapshot.soundEnabled ? 'Sesi kapat' : 'Sesi aç'}>
            {snapshot.soundEnabled ? <Bell size={16} /> : <BellOff size={16} />}
          </button>
          <button className="icon-button" onClick={onSettings} aria-label={t('settings')}><Settings size={16} /></button>
        </div>
      </div>
      <nav className="top-tabs shell" role="tablist">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} role="tab" aria-selected={activeTab === id} className={activeTab === id ? 'active' : ''} onClick={() => onTab(id)}>
            <Icon size={14} />{label}{id === 'signals' && <span className="tab-count">{metrics.activeSignals}</span>}
          </button>
        ))}
      </nav>
    </header>
  );
}
