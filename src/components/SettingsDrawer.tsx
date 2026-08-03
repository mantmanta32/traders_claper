import { AlertTriangle, Bell, BrainCircuit, ChartNoAxesCombined, Database, Download, Palette, Radio, RotateCcw, Save, Settings, Upload, X, Zap } from 'lucide-react';
import { type ChangeEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { APP_VERSION, DEFAULT_SETTINGS } from '../config';
import { clearAllStorage } from '../lib/storage';
import type { MarketEngine } from '../engine/MarketEngine';
import type { SignalFamily, SignalTier } from '../types/market';
import type { AppSettings, MoneyFormat, ThemeMode, ToastPosition } from '../types/settings';

interface SettingsDrawerProps {
  open: boolean;
  engine: MarketEngine;
  onClose: () => void;
}

type SettingsTab = 'notifications' | 'liquidations' | 'signals' | 'appearance' | 'data' | 'learning' | 'system';
const SIGNAL_FAMILIES: SignalFamily[] = ['WHALE', 'CASCADE', 'ABSORPTION', 'BREAKOUT', 'MOMENTUM', 'FLOW', 'OI', 'FUND'];
const TIERS: SignalTier[] = ['S', 'A', 'B', 'C'];
const EXCHANGES = ['Binance', 'OKX', 'Bybit', 'Bitget', 'Deribit', 'Gate', 'MEXC', 'HTX'];

function Group({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return <section className="settings-group"><h3>{icon}{title}</h3>{children}</section>;
}

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  return <label className="toggle-row"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i /><span>{children}</span></label>;
}

function RangeField({ label, value, min, max, step = 1, suffix = '', onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange: (value: number) => void }) {
  return <label className="range-field"><span>{label}<b>{value}{suffix}</b></span><input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /><small><i>{min}{suffix}</i><i>{max}{suffix}</i></small></label>;
}

function NumberField({ label, value, min = 0, step = 1, onChange }: { label: string; value: number; min?: number; step?: number; onChange: (value: number) => void }) {
  return <label className="number-field"><span>{label}</span><input type="number" value={value} min={min} step={step} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

export function SettingsDrawer({ open, engine, onClose }: SettingsDrawerProps) {
  const [tab, setTab] = useState<SettingsTab>('notifications');
  const [draft, setDraft] = useState<AppSettings>(engine.getSettings());
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) setDraft({ ...engine.getSettings() }); }, [open, engine]);
  const patch = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const toggleItem = <T extends string>(key: keyof AppSettings, value: T) => setDraft((current) => {
    const values = current[key] as T[];
    return { ...current, [key]: values.includes(value) ? values.filter((item) => item !== value) : [...values, value] };
  });
  const apply = (close: boolean) => {
    engine.replaceSettings(draft);
    if (close) onClose();
  };
  const exportData = () => {
    const blob = new Blob([JSON.stringify(engine.exportData(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `ews3_backup_${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const importData = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      engine.importData(JSON.parse(await file.text()) as unknown);
      setDraft({ ...engine.getSettings() });
      window.alert('Yedek başarıyla yüklendi.');
    } catch (error) {
      window.alert(`Yedek yüklenemedi: ${error instanceof Error ? error.message : 'bilinmeyen hata'}`);
    } finally {
      event.target.value = '';
    }
  };
  const tabs: Array<{ id: SettingsTab; label: string; icon: typeof Bell }> = [
    { id: 'notifications', label: 'Bildirim', icon: Bell },
    { id: 'liquidations', label: 'Liq', icon: Zap },
    { id: 'signals', label: 'Sinyal', icon: ChartNoAxesCombined },
    { id: 'appearance', label: 'Tema', icon: Palette },
    { id: 'data', label: 'Veri', icon: Radio },
    { id: 'learning', label: 'Hafıza', icon: BrainCircuit },
    { id: 'system', label: 'Sistem', icon: Database },
  ];
  if (!open) return null;
  return (
    <div className="settings-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="settings-drawer" role="dialog" aria-modal="true" aria-label="Ayarlar">
        <header className="settings-header"><strong><Settings size={17} /> Ayarlar</strong><button className="button button-small" onClick={onClose}><X size={14} />Kapat</button></header>
        <nav className="settings-tabs">{tabs.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon size={13} />{label}</button>)}</nav>
        <div className="settings-content">
          {tab === 'notifications' && <>
            <Group title="Toast Bildirimleri" icon={<Bell size={14} />}>
              <Toggle checked={draft.toastEnabled} onChange={(value) => patch('toastEnabled', value)}>Toast bildirimleri açık</Toggle>
              <Toggle checked={draft.toastSound} onChange={(value) => patch('toastSound', value)}>Sesli uyarı</Toggle>
              <Toggle checked={draft.ttsEnabled} onChange={(value) => patch('ttsEnabled', value)}>S-tier için Türkçe TTS</Toggle>
              <Toggle checked={draft.vibrate} onChange={(value) => patch('vibrate', value)}>Mobil titreşim</Toggle>
            </Group>
            <Group title="Toast Pozisyonu"><div className="option-grid two">{([['br', '↘ Sağ Alt'], ['tr', '↗ Sağ Üst'], ['bl', '↙ Sol Alt'], ['tl', '↖ Sol Üst'], ['tc', '↑ Merkez Üst']] as Array<[ToastPosition, string]>).map(([value, label]) => <button className={draft.toastPosition === value ? 'active' : ''} key={value} onClick={() => patch('toastPosition', value)}>{label}</button>)}</div></Group>
            <Group title="Eşikler">
              <RangeField label="Toast süresi" value={draft.toastDurationSeconds} min={3} max={60} suffix="sn" onChange={(value) => patch('toastDurationSeconds', value)} />
              <RangeField label="Minimum toast skoru" value={draft.toastMinScore} min={30} max={100} onChange={(value) => patch('toastMinScore', value)} />
              <div className="chip-options">{TIERS.map((tier) => <label key={tier}><input type="checkbox" checked={draft.toastTiers.includes(tier)} onChange={() => toggleItem('toastTiers', tier)} />{tier}</label>)}</div>
            </Group>
          </>}

          {tab === 'liquidations' && <>
            <Group title="Likidasyon Eşikleri" icon={<Zap size={14} />}>
              <NumberField label="Minimum Liq (USD)" value={draft.minLiquidationUsd} step={1_000} onChange={(value) => patch('minLiquidationUsd', value)} />
              <NumberField label="Temel Whale Eşiği (USD)" value={draft.whaleBaseUsd} min={1_000} step={10_000} onChange={(value) => patch('whaleBaseUsd', value)} />
              <NumberField label="Maksimum Liq · 0=sınırsız" value={draft.maxLiquidationUsd} step={10_000} onChange={(value) => patch('maxLiquidationUsd', value)} />
              <p className="settings-note">Whale eşiği volatilite, fiyat ve 24 saatlik hacme göre sembol bazında adaptif ölçeklenir.</p>
            </Group>
            <Group title="Likidasyon Ticker">
              <Toggle checked={draft.liquidationTicker} onChange={(value) => patch('liquidationTicker', value)}>Ticker göster</Toggle>
              <Toggle checked={draft.liquidationTickerWhalesOnly} onChange={(value) => patch('liquidationTickerWhalesOnly', value)}>Yalnızca whale olayları</Toggle>
              <RangeField label="Ticker tur süresi" value={draft.liquidationTickerSpeedSeconds} min={10} max={120} suffix="sn" onChange={(value) => patch('liquidationTickerSpeedSeconds', value)} />
            </Group>
            <Group title="CoinGlass Çoklu Borsa">
              <Toggle checked={draft.coinglassEnabled} onChange={(value) => patch('coinglassEnabled', value)}>CoinGlass liquidationOrders akışı</Toggle>
              <div className="chip-options exchanges">{EXCHANGES.map((exchange) => <label key={exchange}><input type="checkbox" checked={draft.coinglassExchanges.includes(exchange)} onChange={() => toggleItem('coinglassExchanges', exchange)} />{exchange}</label>)}</div>
              <p className="settings-note warning"><AlertTriangle size={12} /> Ücretli API anahtarı gerekir. İstemci anahtarları görünür; üretimde backend proxy kullan.</p>
            </Group>
            <Group title="AggTrade Takibi"><RangeField label="Liq sonrası akış takibi" value={draft.aggTradeFollowSeconds} min={30} max={300} suffix="sn" onChange={(value) => patch('aggTradeFollowSeconds', value)} /></Group>
          </>}

          {tab === 'signals' && <>
            <Group title="Skor & Tier" icon={<ChartNoAxesCombined size={14} />}>
              <RangeField label="Minimum sinyal skoru" value={draft.minSignalScore} min={20} max={100} onChange={(value) => patch('minSignalScore', value)} />
              <RangeField label="Sembol cooldown" value={draft.signalCooldownSeconds} min={10} max={600} suffix="sn" onChange={(value) => patch('signalCooldownSeconds', value)} />
              <div className="chip-options">{TIERS.map((tier) => <label key={tier}><input type="checkbox" checked={draft.signalTiers.includes(tier)} onChange={() => toggleItem('signalTiers', tier)} />{tier}</label>)}</div>
            </Group>
            <Group title="Sinyal Stratejileri"><div className="chip-options strategy-options">{SIGNAL_FAMILIES.map((family) => <label key={family}><input type="checkbox" checked={draft.signalFamilies.includes(family)} onChange={() => toggleItem('signalFamilies', family)} />{family}</label>)}</div></Group>
            <Group title="Risk Modeli">
              <RangeField label="Maksimum pozisyon" value={draft.maxPositionPercent} min={1} max={25} step={0.5} suffix="%" onChange={(value) => patch('maxPositionPercent', value)} />
              <RangeField label="Round-trip maliyet" value={draft.roundTripCostBps} min={0} max={50} suffix="bps" onChange={(value) => patch('roundTripCostBps', value)} />
              <p className="settings-note">Pozisyon oranı quarter-Kelly ile hesaplanır ve bu üst sınırla kırpılır.</p>
            </Group>
            <Group title="Otomatik Açılış">
              <Toggle checked={draft.autoOpenTradingView} onChange={(value) => patch('autoOpenTradingView', value)}>Sinyalde TradingView aç</Toggle>
              <Toggle checked={draft.autoOpenBinance} onChange={(value) => patch('autoOpenBinance', value)}>Sinyalde Binance aç</Toggle>
              <NumberField label="Minimum 24h hacim (USD)" value={draft.min24hVolumeUsd} step={100_000} onChange={(value) => patch('min24hVolumeUsd', value)} />
            </Group>
          </>}

          {tab === 'appearance' && <>
            <Group title="Tema" icon={<Palette size={14} />}><div className="option-grid three">{([['candy', '🍬 Candy'], ['dark', '🌑 Dark'], ['auto', '🌗 Auto']] as Array<[ThemeMode, string]>).map(([value, label]) => <button key={value} className={draft.theme === value ? 'active' : ''} onClick={() => patch('theme', value)}>{label}</button>)}</div></Group>
            <Group title="Arayüz">
              <Toggle checked={draft.animations} onChange={(value) => patch('animations', value)}>Animasyonlar</Toggle>
              <Toggle checked={draft.compactMode} onChange={(value) => patch('compactMode', value)}>Compact mode</Toggle>
              <Toggle checked={draft.mobileNavigation} onChange={(value) => patch('mobileNavigation', value)}>Mobil alt navigasyon</Toggle>
            </Group>
            <Group title="Dil"><div className="option-grid two"><button className={draft.language === 'tr' ? 'active' : ''} onClick={() => patch('language', 'tr')}>🇹🇷 Türkçe</button><button className={draft.language === 'en' ? 'active' : ''} onClick={() => patch('language', 'en')}>🇬🇧 English</button></div></Group>
            <Group title="Format">
              <Toggle checked={draft.absoluteTime} onChange={(value) => patch('absoluteTime', value)}>Mutlak zaman (12:34:56)</Toggle>
              <div className="option-grid three">{([['short', '$1.2K'], ['full', '$1,234'], ['k', '1.234K']] as Array<[MoneyFormat, string]>).map(([value, label]) => <button key={value} className={draft.moneyFormat === value ? 'active' : ''} onClick={() => patch('moneyFormat', value)}>{label}</button>)}</div>
            </Group>
          </>}

          {tab === 'data' && <>
            <Group title="WebSocket" icon={<Radio size={14} />}>
              <Toggle checked={draft.autoReconnect} onChange={(value) => patch('autoReconnect', value)}>Otomatik yeniden bağlan</Toggle>
              <Toggle checked={draft.debugWebSocket} onChange={(value) => patch('debugWebSocket', value)}>Debug console log</Toggle>
              <RangeField label="Maksimum aggTrade sembolü" value={draft.maxAggTradeSymbols} min={1} max={50} onChange={(value) => patch('maxAggTradeSymbols', value)} />
              <p className="settings-note">Yeni Binance /market ve /public URL ayrımı kullanılıyor; 2026’da kapanan legacy /ws endpoint’i kullanılmıyor.</p>
            </Group>
            <Group title="Sembol Filtreleri">
              <label className="text-field"><span>Whitelist · virgülle ayır</span><input value={draft.symbolWhitelist} onChange={(event) => patch('symbolWhitelist', event.target.value)} placeholder="BTC,ETH,BNB" /></label>
              <label className="text-field"><span>Blacklist · virgülle ayır</span><input value={draft.symbolBlacklist} onChange={(event) => patch('symbolBlacklist', event.target.value)} placeholder="SHIB,DOGE,PEPE" /></label>
              <RangeField label="Funding mutlak eşik" value={draft.fundingThresholdPercent} min={0.001} max={0.1} step={0.001} suffix="%" onChange={(value) => patch('fundingThresholdPercent', value)} />
            </Group>
          </>}

          {tab === 'learning' && <>
            <Group title="Pattern Öğrenme" icon={<BrainCircuit size={14} />}>
              <Toggle checked={draft.learningEnabled} onChange={(value) => patch('learningEnabled', value)}>Pattern öğrenme aktif</Toggle>
              <Toggle checked={draft.autoVerify} onChange={(value) => patch('autoVerify', value)}>Otomatik sonuç doğrulama</Toggle>
              <Toggle checked={draft.adaptiveVerifyHorizon} onChange={(value) => patch('adaptiveVerifyHorizon', value)}>Stratejiye özel horizon (30/60/300/600sn)</Toggle>
              {!draft.adaptiveVerifyHorizon && <RangeField label="Sabit doğrulama gecikmesi" value={draft.fallbackVerifyMinutes} min={1} max={60} suffix="dk" onChange={(value) => patch('fallbackVerifyMinutes', value)} />}
              <RangeField label="Minimum öğrenme örneği" value={draft.minimumLearningSamples} min={1} max={50} onChange={(value) => patch('minimumLearningSamples', value)} />
            </Group>
            <Group title="Temizlik">
              <button className="danger-action" onClick={() => { if (window.confirm('Öğrenme hafızası ve doğrulamalar silinsin mi?')) engine.resetLearning(); }}>🗑️ Hafızayı sıfırla</button>
              <button className="warning-action" onClick={() => engine.clearLiquidations()}>🧹 Likidasyon geçmişini temizle</button>
              <button className="warning-action" onClick={() => engine.clearSignals()}>🗑️ Aktif sinyalleri temizle</button>
              <button className="warning-action" onClick={() => engine.clearSignalHistory()}>🗃️ Sinyal geçmişini temizle</button>
            </Group>
          </>}

          {tab === 'system' && <>
            <Group title="Yedekleme" icon={<Database size={14} />}>
              <button className="success-action" onClick={exportData}><Download size={14} /> JSON yedek dışa aktar</button>
              <button className="primary-action" onClick={() => fileRef.current?.click()}><Upload size={14} /> JSON yedek içe aktar</button>
              <input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={importData} />
            </Group>
            <Group title="Varsayılanlar"><button className="warning-action" onClick={() => setDraft({ ...DEFAULT_SETTINGS })}><RotateCcw size={14} /> Ayar formunu varsayılana döndür</button></Group>
            <Group title="Tehlikeli Alan" icon={<AlertTriangle size={14} />}><button className="danger-action" onClick={() => { if (window.confirm('Tüm EWS ayarları, hafıza ve geçmiş silinsin mi?')) { clearAllStorage(); window.location.reload(); } }}><RotateCcw size={14} /> Factory reset</button></Group>
            <Group title="Hakkında"><div className="about-grid"><span>Version</span><b>v{APP_VERSION}</b><span>Build</span><b>2026-08-03</b><span>Data</span><b>Binance + CoinGlass*</b><span>Stack</span><b>React · Vite · TypeScript</b></div></Group>
          </>}
        </div>
        <footer className="settings-footer"><button className="success-action" onClick={() => apply(true)}><Save size={14} />Kaydet</button><button className="primary-action" onClick={() => apply(false)}><Zap size={14} />Uygula</button><button onClick={onClose}><X size={14} />İptal</button></footer>
      </aside>
    </div>
  );
}
