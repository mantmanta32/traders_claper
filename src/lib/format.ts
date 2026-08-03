import type { Regime, SignalType } from '../types/market';
import type { MoneyFormat } from '../types/settings';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function formatUsd(value: number, format: MoneyFormat = 'short'): string {
  if (!Number.isFinite(value) || value === 0) return '$0';
  if (format === 'full') {
    return `$${value.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`;
  }
  if (format === 'k') {
    if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(3)}B`;
    if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(3)}M`;
    if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(3)}K`;
    return value.toFixed(2);
  }
  if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export function formatPrice(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—';
  if (value >= 10_000) return value.toLocaleString('tr-TR', { maximumFractionDigits: 0 });
  if (value >= 100) return value.toFixed(2);
  if (value >= 1) return value.toFixed(4);
  if (value >= 0.01) return value.toFixed(5);
  return value.toPrecision(5);
}

export function formatPercent(value: number, digits = 2, signed = true): string {
  if (!Number.isFinite(value)) return '—';
  const sign = signed && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}%`;
}

export function formatAge(timestamp: number, absolute = false, now = Date.now()): string {
  if (absolute) {
    return new Date(timestamp).toLocaleTimeString('tr-TR', { hour12: false });
  }
  const delta = Math.max(0, now - timestamp);
  if (delta < 60_000) return `${Math.floor(delta / 1_000)}sn`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}dk`;
  return `${Math.floor(delta / 3_600_000)}sa`;
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3_600);
  const m = Math.floor((seconds % 3_600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function displaySymbol(symbol: string): string {
  return symbol.replace(/USDT$/, '');
}

export function displaySignalType(type: SignalType | string): string {
  return type.replaceAll('_', ' ');
}

export function displayRegime(regime: Regime): string {
  const labels: Record<Regime, string> = {
    UNKNOWN: 'Bilinmiyor',
    LOW_VOL: 'Düşük Vol',
    RANGE: 'Yatay',
    VOLATILE: 'Volatil',
    TREND_UP: 'Yukarı Trend',
    TREND_DOWN: 'Aşağı Trend',
  };
  return labels[regime];
}

export function sanitizeSymbolList(value: string): string[] {
  return [...new Set(value.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean))];
}
