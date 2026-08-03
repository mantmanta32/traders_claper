import { BarChart3, ScanSearch, Waves } from 'lucide-react';
import { translator } from '../lib/i18n';
import type { AppTab } from './Header';

export function MobileNav({ tab, onTab, language, visible }: { tab: AppTab; onTab: (tab: AppTab) => void; language: 'tr' | 'en'; visible: boolean }) {
  if (!visible) return null;
  const t = translator(language);
  const tabs = [
    { id: 'signals' as const, label: t('signals'), icon: Waves },
    { id: 'scanner' as const, label: t('scanner'), icon: ScanSearch },
    { id: 'analytics' as const, label: t('analytics'), icon: BarChart3 },
  ];
  return <nav className="mobile-nav">{tabs.map(({ id, label, icon: Icon }) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => onTab(id)}><Icon size={17} /><span>{label}</span></button>)}</nav>;
}
