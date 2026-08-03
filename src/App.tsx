import { useEffect, useRef, useState } from 'react';
import { AnalyticsPage } from './components/AnalyticsPage';
import { Header, type AppTab } from './components/Header';
import { LiquidationTicker } from './components/LiquidationTicker';
import { MobileNav } from './components/MobileNav';
import { ScannerPage } from './components/ScannerPage';
import { SettingsDrawer } from './components/SettingsDrawer';
import { SignalsPage } from './components/SignalsPage';
import { ToastStack, type ToastItem } from './components/ToastStack';
import { MarketRuntime } from './data/MarketRuntime';
import { MarketEngine } from './engine/MarketEngine';
import { useEngine } from './hooks/useEngine';
import { notifySignal, unlockAudio } from './lib/notifications';

export interface AppProps {
  engine: MarketEngine;
  autoStart?: boolean;
}

export default function App({ engine, autoStart = true }: AppProps) {
  const snapshot = useEngine(engine);
  const [tab, setTab] = useState<AppTab>('signals');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const unsubscribe = engine.subscribeSignals((signal) => {
      const current = engine.getSnapshot();
      const settings = current.settings;
      notifySignal(signal, settings, current.soundEnabled);
      if (!settings.toastEnabled || !settings.toastTiers.includes(signal.tier) || signal.score < settings.toastMinScore) return;
      const id = `toast:${signal.id}`;
      setToasts((items) => [{ id, signal }, ...items].slice(0, 5));
      const timer = setTimeout(() => {
        setToasts((items) => items.filter((item) => item.id !== id));
        toastTimers.current.delete(id);
      }, settings.toastDurationSeconds * 1_000);
      toastTimers.current.set(id, timer);
    });
    return () => {
      unsubscribe();
      toastTimers.current.forEach((timer) => clearTimeout(timer));
      toastTimers.current.clear();
    };
  }, [engine]);

  useEffect(() => {
    if (!autoStart) return;
    const runtime = new MarketRuntime(engine, import.meta.env.VITE_COINGLASS_API_KEY);
    void runtime.start();
    return () => runtime.stop();
  }, [engine, autoStart]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = snapshot.settings.theme;
    root.dataset.animations = String(snapshot.settings.animations);
    root.dataset.compact = String(snapshot.settings.compactMode);
    root.lang = snapshot.settings.language;
  }, [snapshot.settings]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === '1') setTab('signals');
      if (event.key === '2') setTab('scanner');
      if (event.key === '3') setTab('analytics');
      if (event.key === ' ') { event.preventDefault(); engine.togglePause(); }
    };
    const onFirstPointer = () => unlockAudio();
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onFirstPointer, { once: true });
    return () => window.removeEventListener('keydown', onKey);
  }, [engine]);

  const dismissToast = (id: string) => {
    const timer = toastTimers.current.get(id);
    if (timer) clearTimeout(timer);
    toastTimers.current.delete(id);
    setToasts((items) => items.filter((item) => item.id !== id));
  };

  return (
    <div className="app-shell">
      <Header snapshot={snapshot} activeTab={tab} onTab={setTab} onSettings={() => setSettingsOpen(true)} onPause={() => engine.togglePause()} onSound={() => engine.toggleSound()} />
      <div className="shell app-content">
        <LiquidationTicker snapshot={snapshot} />
        {tab === 'signals' && <SignalsPage snapshot={snapshot} />}
        {tab === 'scanner' && <ScannerPage snapshot={snapshot} />}
        {tab === 'analytics' && <AnalyticsPage snapshot={snapshot} />}
      </div>
      <MobileNav tab={tab} onTab={setTab} language={snapshot.settings.language} visible={snapshot.settings.mobileNavigation} />
      <SettingsDrawer open={settingsOpen} engine={engine} onClose={() => setSettingsOpen(false)} />
      <ToastStack items={toasts} position={snapshot.settings.toastPosition} onDismiss={dismissToast} />
    </div>
  );
}
