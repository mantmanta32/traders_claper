import { DEFAULT_SETTINGS, STORAGE_VERSION } from '../config';
import type { MemoryEntry, PatternEntry, Signal, VerificationItem, VerificationRecord } from '../types/market';
import type { AppSettings } from '../types/settings';

const SETTINGS_KEY = 'ews3_settings';
const LEARNING_KEY = 'ews3_learning';
const HISTORY_KEY = 'ews3_history';

interface LearningStorage {
  version: number;
  memory: Record<string, MemoryEntry>;
  patterns: Record<string, PatternEntry>;
  verificationQueue: VerificationItem[];
  verificationHistory: VerificationRecord[];
}

interface HistoryStorage {
  version: number;
  signals: Signal[];
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function migrateLegacySettings(): Partial<AppSettings> {
  if (!canUseStorage()) return {};
  const legacy = safeParse<Record<string, unknown>>(localStorage.getItem('ews2_settings'), {});
  if (!Object.keys(legacy).length) return {};
  const mapped: Partial<AppSettings> = {};
  const assign = <K extends keyof AppSettings>(key: K, value: unknown) => {
    if (value !== undefined) mapped[key] = value as AppSettings[K];
  };
  assign('toastEnabled', legacy.toastEnable);
  assign('toastSound', legacy.toastSound);
  assign('ttsEnabled', legacy.ttsEnable);
  assign('vibrate', legacy.vibrate);
  assign('toastPosition', legacy.toastPos);
  assign('toastDurationSeconds', legacy.toastDur);
  assign('toastTiers', legacy.toastTier);
  assign('toastMinScore', legacy.toastMinScore);
  assign('minLiquidationUsd', legacy.liqMin);
  assign('whaleBaseUsd', legacy.liqWhale);
  assign('maxLiquidationUsd', legacy.liqMax);
  assign('liquidationTicker', legacy.liqTicker);
  assign('liquidationTickerWhalesOnly', legacy.liqTickerWhale);
  assign('liquidationTickerSpeedSeconds', legacy.liqTickerSpeed);
  assign('coinglassEnabled', legacy.cgEnable);
  assign('coinglassExchanges', legacy.cgExchanges);
  assign('aggTradeFollowSeconds', legacy.aggDuration);
  assign('minSignalScore', legacy.minScore);
  assign('signalTiers', legacy.signalTier);
  assign('signalCooldownSeconds', legacy.cooldown);
  assign('signalFamilies', legacy.signalTypes);
  assign('autoOpenTradingView', legacy.autoTV);
  assign('autoOpenBinance', legacy.autoBN);
  assign('min24hVolumeUsd', legacy.minVol);
  assign('theme', legacy.theme);
  assign('animations', legacy.anim);
  assign('compactMode', legacy.compact);
  assign('mobileNavigation', legacy.mobileNav);
  assign('language', legacy.lang);
  assign('absoluteTime', legacy.absTime);
  assign('moneyFormat', legacy.moneyFmt);
  assign('autoReconnect', legacy.wsReconnect);
  assign('debugWebSocket', legacy.wsDebug);
  assign('maxAggTradeSymbols', legacy.maxAgg);
  assign('symbolWhitelist', legacy.symbolWhitelist);
  assign('symbolBlacklist', legacy.symbolBlacklist);
  assign('learningEnabled', legacy.learnEnable);
  assign('autoVerify', legacy.autoVerify);
  assign('fallbackVerifyMinutes', legacy.verifyDelay);
  assign('minimumLearningSamples', legacy.learnMin);
  return mapped;
}

function validNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function normalizeSettings(input: Partial<AppSettings>): AppSettings {
  const merged: AppSettings = { ...DEFAULT_SETTINGS, ...input };
  merged.toastDurationSeconds = validNumber(merged.toastDurationSeconds, 9, 3, 60);
  merged.toastMinScore = validNumber(merged.toastMinScore, 55, 20, 100);
  merged.minLiquidationUsd = validNumber(merged.minLiquidationUsd, 10_000, 0, 1e12);
  merged.whaleBaseUsd = validNumber(merged.whaleBaseUsd, 300_000, 1_000, 1e12);
  merged.maxLiquidationUsd = validNumber(merged.maxLiquidationUsd, 0, 0, 1e13);
  merged.liquidationTickerSpeedSeconds = validNumber(merged.liquidationTickerSpeedSeconds, 30, 10, 120);
  merged.aggTradeFollowSeconds = validNumber(merged.aggTradeFollowSeconds, 90, 30, 300);
  merged.minSignalScore = validNumber(merged.minSignalScore, 35, 20, 100);
  merged.signalCooldownSeconds = validNumber(merged.signalCooldownSeconds, 60, 10, 600);
  merged.min24hVolumeUsd = validNumber(merged.min24hVolumeUsd, 5_000_000, 0, 1e14);
  merged.maxPositionPercent = validNumber(merged.maxPositionPercent, 15, 0.1, 25);
  merged.roundTripCostBps = validNumber(merged.roundTripCostBps, 8, 0, 100);
  merged.maxAggTradeSymbols = validNumber(merged.maxAggTradeSymbols, 10, 1, 50);
  merged.fundingThresholdPercent = validNumber(merged.fundingThresholdPercent, 0.01, 0.001, 0.1);
  merged.fallbackVerifyMinutes = validNumber(merged.fallbackVerifyMinutes, 5, 1, 60);
  merged.minimumLearningSamples = validNumber(merged.minimumLearningSamples, 10, 1, 50);
  merged.toastTiers = Array.isArray(merged.toastTiers) ? merged.toastTiers : DEFAULT_SETTINGS.toastTiers;
  merged.signalTiers = Array.isArray(merged.signalTiers) ? merged.signalTiers : DEFAULT_SETTINGS.signalTiers;
  merged.signalFamilies = Array.isArray(merged.signalFamilies) ? merged.signalFamilies : DEFAULT_SETTINGS.signalFamilies;
  merged.coinglassExchanges = Array.isArray(merged.coinglassExchanges) ? merged.coinglassExchanges : ['Binance'];
  return merged;
}

export function loadSettings(): AppSettings {
  if (!canUseStorage()) return { ...DEFAULT_SETTINGS };
  const saved = safeParse<Partial<AppSettings>>(localStorage.getItem(SETTINGS_KEY), {});
  const source = Object.keys(saved).length ? saved : migrateLegacySettings();
  return normalizeSettings(source);
}

export function saveSettings(settings: AppSettings): void {
  if (!canUseStorage()) return;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings, storageVersion: STORAGE_VERSION }));
}

export function loadLearning(): LearningStorage {
  const empty: LearningStorage = { version: STORAGE_VERSION, memory: {}, patterns: {}, verificationQueue: [], verificationHistory: [] };
  if (!canUseStorage()) return empty;
  const saved = safeParse<Partial<LearningStorage>>(localStorage.getItem(LEARNING_KEY), {});
  if (saved.memory) {
    return {
      version: STORAGE_VERSION,
      memory: saved.memory,
      patterns: saved.patterns ?? {},
      verificationQueue: (saved.verificationQueue ?? []).filter((item) => item.checkAt > Date.now() - 3_600_000),
      verificationHistory: saved.verificationHistory ?? [],
    };
  }
  const legacyMemory = safeParse<Record<string, { n?: number; w?: number; pnl?: number; horizons?: Record<string, { n?: number; w?: number; pnl?: number }> }>>(localStorage.getItem('ews2_mem'), {});
  const memory: Record<string, MemoryEntry> = {};
  for (const [key, entry] of Object.entries(legacyMemory)) {
    const horizons: MemoryEntry['horizons'] = {};
    for (const [horizon, bucket] of Object.entries(entry.horizons ?? {})) {
      horizons[horizon] = { samples: bucket.n ?? 0, wins: bucket.w ?? 0, netPnl: bucket.pnl ?? 0 };
    }
    memory[key] = { samples: entry.n ?? 0, wins: entry.w ?? 0, netPnl: entry.pnl ?? 0, horizons, lastUpdatedAt: Date.now() };
  }
  return { ...empty, memory };
}

export function saveLearning(data: Omit<LearningStorage, 'version'>): void {
  if (!canUseStorage()) return;
  localStorage.setItem(LEARNING_KEY, JSON.stringify({ version: STORAGE_VERSION, ...data }));
}

export function loadSignalHistory(): Signal[] {
  if (!canUseStorage()) return [];
  return safeParse<HistoryStorage>(localStorage.getItem(HISTORY_KEY), { version: STORAGE_VERSION, signals: [] }).signals ?? [];
}

export function saveSignalHistory(signals: Signal[]): void {
  if (!canUseStorage()) return;
  localStorage.setItem(HISTORY_KEY, JSON.stringify({ version: STORAGE_VERSION, signals } satisfies HistoryStorage));
}

export function clearAllStorage(): void {
  if (!canUseStorage()) return;
  [SETTINGS_KEY, LEARNING_KEY, HISTORY_KEY, 'ews2_settings', 'ews2_mem', 'ews2_vq'].forEach((key) => localStorage.removeItem(key));
}
