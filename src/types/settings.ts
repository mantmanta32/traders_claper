import type { SignalFamily, SignalTier } from './market';

export type ThemeMode = 'candy' | 'dark' | 'auto';
export type ToastPosition = 'br' | 'tr' | 'bl' | 'tl' | 'tc';
export type MoneyFormat = 'short' | 'full' | 'k';

export interface AppSettings {
  toastEnabled: boolean;
  toastSound: boolean;
  ttsEnabled: boolean;
  vibrate: boolean;
  toastPosition: ToastPosition;
  toastDurationSeconds: number;
  toastTiers: SignalTier[];
  toastMinScore: number;

  minLiquidationUsd: number;
  whaleBaseUsd: number;
  maxLiquidationUsd: number;
  liquidationTicker: boolean;
  liquidationTickerWhalesOnly: boolean;
  liquidationTickerSpeedSeconds: number;
  coinglassEnabled: boolean;
  coinglassExchanges: string[];
  aggTradeFollowSeconds: number;

  minSignalScore: number;
  signalTiers: SignalTier[];
  signalCooldownSeconds: number;
  signalFamilies: SignalFamily[];
  autoOpenTradingView: boolean;
  autoOpenBinance: boolean;
  min24hVolumeUsd: number;
  maxPositionPercent: number;
  roundTripCostBps: number;

  theme: ThemeMode;
  animations: boolean;
  compactMode: boolean;
  mobileNavigation: boolean;
  language: 'tr' | 'en';
  absoluteTime: boolean;
  moneyFormat: MoneyFormat;

  autoReconnect: boolean;
  debugWebSocket: boolean;
  maxAggTradeSymbols: number;
  symbolWhitelist: string;
  symbolBlacklist: string;
  fundingThresholdPercent: number;

  learningEnabled: boolean;
  autoVerify: boolean;
  adaptiveVerifyHorizon: boolean;
  fallbackVerifyMinutes: number;
  minimumLearningSamples: number;
}

export type SettingsPatch = Partial<AppSettings>;
