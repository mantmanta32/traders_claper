import { DEFAULT_SETTINGS, ENGINE_CONFIG } from '../config';
import { sanitizeSymbolList } from '../lib/format';
import {
  loadSettings,
  loadSignalHistory,
  normalizeSettings,
  saveSettings,
  saveSignalHistory,
} from '../lib/storage';
import type {
  AggTradeUpdate,
  BookTickerUpdate,
  EngineMetrics,
  FeedState,
  FeedStatus,
  LiquidationEvent,
  MarkPriceUpdate,
  MarketState,
  MiniTickerUpdate,
  OpenInterestUpdate,
  Signal,
  SymbolSnapshot,
} from '../types/market';
import type { EngineSnapshot } from '../types/snapshot';
import type { AppSettings, SettingsPatch } from '../types/settings';
import { LearningEngine, type LearningData } from './learning';
import {
  adaptiveWhaleUsd,
  detectPerceptions,
  detectRegime,
  microstructureWeight,
  toxicFlowFromTrades,
} from './perception';
import { createMarketState, pruneByTimestamp } from './state';
import { generateSignal } from './strategy';

interface FeedCounter extends FeedStatus {
  count: number;
  windowStartedAt: number;
}

export interface MarketEngineOptions {
  settings?: AppSettings;
  learning?: Partial<LearningData>;
  signalHistory?: Signal[];
  now?: () => number;
}

type Listener = () => void;
type SignalListener = (signal: Signal) => void;
type SettingsListener = (settings: AppSettings) => void;
type AggTracker = (symbol: string, durationSeconds: number) => void;

const FEED_DEFAULTS: FeedCounter[] = [
  { id: 'market', label: 'Market · ticker/mark/liq', state: 'connecting', messagesPerSecond: 0, lastMessageAt: 0, count: 0, windowStartedAt: Date.now() },
  { id: 'public', label: 'Public · bookTicker', state: 'connecting', messagesPerSecond: 0, lastMessageAt: 0, count: 0, windowStartedAt: Date.now() },
  { id: 'aggTrade', label: 'aggTrade · akış', state: 'disabled', messagesPerSecond: 0, lastMessageAt: 0, count: 0, windowStartedAt: Date.now() },
  { id: 'coinglass', label: 'CoinGlass · çoklu borsa', state: 'disabled', messagesPerSecond: 0, lastMessageAt: 0, count: 0, windowStartedAt: Date.now() },
  { id: 'rest', label: 'Binance REST · sembol/OI', state: 'connecting', messagesPerSecond: 0, lastMessageAt: 0, count: 0, windowStartedAt: Date.now() },
];

export class MarketEngine {
  private readonly states = new Map<string, MarketState>();
  private readonly activeSignals: Signal[] = [];
  private readonly recentLiquidations: LiquidationEvent[] = [];
  private readonly listeners = new Set<Listener>();
  private readonly signalListeners = new Set<SignalListener>();
  private readonly settingsListeners = new Set<SettingsListener>();
  private readonly nowProvider: () => number;
  private readonly learning: LearningEngine;
  private readonly feeds = new Map<FeedStatus['id'], FeedCounter>();
  private signalHistory: Signal[];
  private settings: AppSettings;
  private snapshot: EngineSnapshot;
  private startedAt: number;
  private paused = false;
  private soundEnabled = true;
  private revision = 0;
  private publishTimer: ReturnType<typeof setTimeout> | null = null;
  private globalEventCount = 0;
  private eventWindowStartedAt: number;
  private eventsPerSecond = 0;
  private aggTracker: AggTracker | null = null;

  constructor(options: MarketEngineOptions = {}) {
    this.nowProvider = options.now ?? (() => Date.now());
    this.startedAt = this.nowProvider();
    this.eventWindowStartedAt = this.startedAt;
    this.settings = normalizeSettings(options.settings ?? loadSettings());
    this.learning = new LearningEngine(options.learning);
    this.signalHistory = (options.signalHistory ?? loadSignalHistory()).slice(0, ENGINE_CONFIG.maxSignalHistory);
    for (const feed of FEED_DEFAULTS) this.feeds.set(feed.id, { ...feed, windowStartedAt: this.startedAt });
    this.snapshot = this.buildSnapshot(this.startedAt);
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  subscribeSignals(listener: SignalListener): () => void {
    this.signalListeners.add(listener);
    return () => this.signalListeners.delete(listener);
  }

  subscribeSettings(listener: SettingsListener): () => void {
    this.settingsListeners.add(listener);
    return () => this.settingsListeners.delete(listener);
  }

  getSnapshot = (): EngineSnapshot => this.snapshot;

  getSettings(): AppSettings {
    return this.settings;
  }

  getState(symbol: string): MarketState {
    const normalized = symbol.toUpperCase();
    let state = this.states.get(normalized);
    if (!state) {
      state = createMarketState(normalized);
      this.states.set(normalized, state);
    }
    return state;
  }

  getStates(): ReadonlyMap<string, MarketState> {
    return this.states;
  }

  setAggTracker(tracker: AggTracker | null): void {
    this.aggTracker = tracker;
  }

  registerSymbols(symbols: string[]): void {
    symbols.forEach((symbol) => this.getState(symbol));
    this.schedulePublish();
  }

  ingestMiniTickers(updates: MiniTickerUpdate[]): void {
    const wallNow = this.nowProvider();
    for (const update of updates) {
      if (!Number.isFinite(update.price) || update.price <= 0 || !Number.isFinite(update.quoteVolume)) continue;
      const state = this.getState(update.symbol);
      const ts = Number.isFinite(update.eventTime) ? update.eventTime : wallNow;
      state.prevPrice = state.price || update.price;
      state.price = update.price;
      state.volume24h = update.quoteVolume;
      let volumeDelta = 0;
      if (state.lastCumulativeVolume > 0 && update.quoteVolume >= state.lastCumulativeVolume) volumeDelta = update.quoteVolume - state.lastCumulativeVolume;
      state.lastCumulativeVolume = update.quoteVolume;
      state.volumeHistory.push({ ts, value: volumeDelta });
      state.priceHistory.push({ ts, price: update.price });
      state.lastTickerAt = wallNow;
      pruneByTimestamp(state.volumeHistory, wallNow - ENGINE_CONFIG.retention.volumeMs);
      pruneByTimestamp(state.priceHistory, wallNow - ENGINE_CONFIG.retention.priceMs);
      if (wallNow - state.regimeUpdatedAt > 2_000) {
        state.regime = detectRegime(state, this.settings, wallNow);
        state.regimeUpdatedAt = wallNow;
      }
    }
    this.globalEventCount += 1;
    this.schedulePublish();
  }

  ingestMarkPrices(updates: MarkPriceUpdate[]): void {
    for (const update of updates) {
      if (!Number.isFinite(update.fundingRate)) continue;
      const state = this.getState(update.symbol);
      state.fundingRate = update.fundingRate;
      if (state.price <= 0 && update.markPrice > 0) state.price = update.markPrice;
    }
    this.globalEventCount += 1;
    this.schedulePublish();
  }

  ingestBookTicker(update: BookTickerUpdate): void {
    const now = this.nowProvider();
    const state = this.getState(update.symbol);
    if (update.bid !== state.bid) state.bidChangedAt = now;
    if (update.ask !== state.ask) state.askChangedAt = now;
    state.bid = update.bid;
    state.ask = update.ask;
    state.bidQuantity = update.bidQuantity;
    state.askQuantity = update.askQuantity;
    const bidAge = now - (state.bidChangedAt || now);
    const askAge = now - (state.askChangedAt || now);
    state.bookAgeMs = Math.min(bidAge, askAge);
    const total = state.bidQuantity + state.askQuantity;
    const rawObi = total > 0 ? (state.bidQuantity - state.askQuantity) / total : 0;
    state.obi = rawObi * microstructureWeight(state.bookAgeMs);
    this.globalEventCount += 1;
  }

  ingestAggTrade(update: AggTradeUpdate): void {
    if (!Number.isFinite(update.usd) || update.usd <= 0) return;
    const now = this.nowProvider();
    const state = this.getState(update.symbol);
    const ts = update.eventTime || now;
    state.tradeHistory.push({ ts, side: update.side, usd: update.usd, price: update.price });
    state.cvd += update.side === 'BUY' ? update.usd : -update.usd;
    pruneByTimestamp(state.tradeHistory, now - ENGINE_CONFIG.retention.tradeMs);
    const lastCvd = state.cvdHistory.at(-1);
    if (!lastCvd || ts - lastCvd.ts >= 1_000) {
      state.cvdHistory.push({ ts, cvd: state.cvd, price: state.price || update.price });
      pruneByTimestamp(state.cvdHistory, now - ENGINE_CONFIG.retention.cvdMs);
    }
    const lastFlow = state.flowHistory.at(-1);
    if (!lastFlow || ts - lastFlow.ts >= 1_000) {
      const recentTrades = state.tradeHistory.filter((trade) => trade.ts > now - 15_000);
      const buy = recentTrades.filter((trade) => trade.side === 'BUY').reduce((sum, trade) => sum + trade.usd, 0);
      const total = recentTrades.reduce((sum, trade) => sum + trade.usd, 0);
      if (total > 0) state.flowHistory.push({ ts, buyRatio: buy / total });
      pruneByTimestamp(state.flowHistory, now - ENGINE_CONFIG.retention.flowMs);
    }
    this.globalEventCount += 1;
    this.schedulePublish();
  }

  ingestOpenInterest(update: OpenInterestUpdate): void {
    if (!Number.isFinite(update.openInterest) || update.openInterest < 0) return;
    const state = this.getState(update.symbol);
    if (state.openInterest > 0) {
      state.previousOpenInterest = state.openInterest;
      state.previousOpenInterestPrice = state.openInterestPrice || state.price;
    }
    state.openInterest = update.openInterest;
    state.openInterestPrice = state.price;
    state.openInterestUpdatedAt = update.time || this.nowProvider();
    if (state.previousOpenInterest > 0) this.evaluate(update.symbol, this.nowProvider());
    this.schedulePublish();
  }

  ingestLiquidation(event: LiquidationEvent): boolean {
    if (this.paused) return false;
    if (!Number.isFinite(event.usd) || event.usd <= 0 || event.usd < this.settings.minLiquidationUsd) return false;
    if (this.settings.maxLiquidationUsd > 0 && event.usd > this.settings.maxLiquidationUsd) return false;
    if (event.source === 'coinglass' && !this.settings.coinglassExchanges.includes(event.exchange)) return false;
    const duplicate = this.recentLiquidations.find((existing) =>
      existing.symbol === event.symbol
      && existing.liquidationSide === event.liquidationSide
      && Math.abs(existing.ts - event.ts) < 1_500
      && Math.abs(existing.usd - event.usd) / Math.max(existing.usd, event.usd) < 0.03,
    );
    if (duplicate) return false;

    const now = this.nowProvider();
    const state = this.getState(event.symbol);
    state.liquidationHistory.push(event);
    this.recentLiquidations.unshift(event);
    pruneByTimestamp(state.liquidationHistory, now - ENGINE_CONFIG.retention.liquidationMs);
    if (this.recentLiquidations.length > ENGINE_CONFIG.maxLiquidations) this.recentLiquidations.length = ENGINE_CONFIG.maxLiquidations;
    const detection = detectPerceptions(state, this.settings, now);
    state.regime = detection.regime;
    state.regimeUpdatedAt = now;
    if (detection.perceptions.LIQ_WHALE_LONG || detection.perceptions.LIQ_WHALE_SHORT || detection.perceptions.LIQ_CLUSTER) {
      this.aggTracker?.(event.symbol, this.settings.aggTradeFollowSeconds);
    }
    this.evaluate(event.symbol, now, detection.perceptions);
    this.globalEventCount += 1;
    this.schedulePublish();
    return true;
  }

  evaluate(symbol: string, now = this.nowProvider(), precomputed?: ReturnType<typeof detectPerceptions>['perceptions']): Signal | null {
    if (this.paused || !this.symbolAllowed(symbol)) return null;
    const state = this.getState(symbol);
    const detection = precomputed ? { perceptions: precomputed, regime: state.regime } : detectPerceptions(state, this.settings, now);
    state.regime = detection.regime;
    state.regimeUpdatedAt = now;
    if (!Object.keys(detection.perceptions).length) return null;
    const signal = generateSignal({ state, perceptions: detection.perceptions, settings: this.settings, memory: this.learning.memory, now });
    if (!signal) return null;
    const existing = this.activeSignals.findIndex((item) => item.symbol === symbol);
    if (existing >= 0) this.activeSignals.splice(existing, 1);
    this.activeSignals.unshift(signal);
    if (this.activeSignals.length > ENGINE_CONFIG.maxSignals) this.activeSignals.length = ENGINE_CONFIG.maxSignals;
    this.signalHistory.unshift(signal);
    if (this.signalHistory.length > ENGINE_CONFIG.maxSignalHistory) this.signalHistory.length = ENGINE_CONFIG.maxSignalHistory;
    state.cooldownUntil = now + this.settings.signalCooldownSeconds * 1_000;
    state.hasSignal = true;
    this.learning.registerSignal(signal, this.settings);
    saveSignalHistory(this.signalHistory);
    this.signalListeners.forEach((listener) => listener(signal));
    this.schedulePublish(true);
    return signal;
  }

  tick(now = this.nowProvider()): void {
    for (let index = this.activeSignals.length - 1; index >= 0; index -= 1) {
      if (this.activeSignals[index].expiresAt <= now) this.activeSignals.splice(index, 1);
    }
    const activeSymbols = new Set(this.activeSignals.map((signal) => signal.symbol));
    for (const state of this.states.values()) {
      pruneByTimestamp(state.priceHistory, now - ENGINE_CONFIG.retention.priceMs);
      pruneByTimestamp(state.volumeHistory, now - ENGINE_CONFIG.retention.volumeMs);
      pruneByTimestamp(state.liquidationHistory, now - ENGINE_CONFIG.retention.liquidationMs);
      pruneByTimestamp(state.tradeHistory, now - ENGINE_CONFIG.retention.tradeMs);
      pruneByTimestamp(state.cvdHistory, now - ENGINE_CONFIG.retention.cvdMs);
      pruneByTimestamp(state.flowHistory, now - ENGINE_CONFIG.retention.flowMs);
      state.hasSignal = activeSymbols.has(state.symbol);
      if (!this.paused && state.lastTickerAt > now - 2_500) this.evaluate(state.symbol, now);
    }
    while (this.recentLiquidations.length && this.recentLiquidations.at(-1)!.ts < now - ENGINE_CONFIG.retention.liquidationMs) {
      this.recentLiquidations.pop();
    }
    this.learning.verifyDue((symbol) => this.states.get(symbol)?.price, this.settings, now);
    this.updateRates(now);
    this.publishNow(now);
  }

  topOpenInterestSymbols(limit = ENGINE_CONFIG.openInterestTopSymbols): string[] {
    const active = new Set(this.activeSignals.map((signal) => signal.symbol));
    return [...this.states.values()]
      .filter((state) => state.volume24h >= this.settings.min24hVolumeUsd)
      .sort((a, b) => Number(active.has(b.symbol)) - Number(active.has(a.symbol)) || b.volume24h - a.volume24h)
      .slice(0, limit)
      .map((state) => state.symbol);
  }

  setFeedState(id: FeedStatus['id'], state: FeedState, detail?: string): void {
    const feed = this.feeds.get(id);
    if (!feed) return;
    feed.state = state;
    feed.detail = detail;
    this.schedulePublish();
  }

  recordFeedMessage(id: FeedStatus['id'], count = 1): void {
    const feed = this.feeds.get(id);
    if (!feed) return;
    const now = this.nowProvider();
    feed.count += count;
    feed.lastMessageAt = now;
    feed.state = 'live';
    this.globalEventCount += count;
    this.updateRates(now);
  }

  updateSettings(patch: SettingsPatch): void {
    this.settings = normalizeSettings({ ...this.settings, ...patch });
    saveSettings(this.settings);
    this.settingsListeners.forEach((listener) => listener(this.settings));
    this.schedulePublish(true);
  }

  replaceSettings(settings: Partial<AppSettings>): void {
    this.settings = normalizeSettings({ ...DEFAULT_SETTINGS, ...settings });
    saveSettings(this.settings);
    this.settingsListeners.forEach((listener) => listener(this.settings));
    this.schedulePublish(true);
  }

  togglePause(): void {
    this.paused = !this.paused;
    this.schedulePublish(true);
  }

  toggleSound(): void {
    this.soundEnabled = !this.soundEnabled;
    this.schedulePublish(true);
  }

  clearSignals(): void {
    this.activeSignals.length = 0;
    this.states.forEach((state) => { state.hasSignal = false; });
    this.schedulePublish(true);
  }

  clearLiquidations(): void {
    this.recentLiquidations.length = 0;
    this.states.forEach((state) => { state.liquidationHistory.length = 0; });
    this.schedulePublish(true);
  }

  resetLearning(): void {
    this.learning.reset();
    this.schedulePublish(true);
  }

  replaceLearning(data: Partial<LearningData>): void {
    this.learning.replace(data);
    this.schedulePublish(true);
  }

  clearSignalHistory(): void {
    this.signalHistory.length = 0;
    saveSignalHistory([]);
    this.schedulePublish(true);
  }

  exportData(): object {
    return {
      version: '3.0.0',
      exportedAt: this.nowProvider(),
      settings: this.settings,
      learning: this.learning.snapshot(),
      signalHistory: this.signalHistory,
    };
  }

  importData(raw: unknown): void {
    if (typeof raw !== 'object' || raw === null) throw new Error('Geçersiz yedek dosyası');
    const data = raw as { settings?: Partial<AppSettings>; learning?: Partial<LearningData>; signalHistory?: Signal[] };
    if (data.settings) this.replaceSettings(data.settings);
    if (data.learning) this.replaceLearning(data.learning);
    if (Array.isArray(data.signalHistory)) {
      this.signalHistory = data.signalHistory.slice(0, ENGINE_CONFIG.maxSignalHistory);
      saveSignalHistory(this.signalHistory);
    }
    this.schedulePublish(true);
  }

  flush(): void {
    this.publishNow(this.nowProvider());
  }

  dispose(): void {
    if (this.publishTimer) clearTimeout(this.publishTimer);
    this.publishTimer = null;
    this.listeners.clear();
    this.signalListeners.clear();
    this.settingsListeners.clear();
  }

  private symbolAllowed(symbol: string): boolean {
    const whitelist = sanitizeSymbolList(this.settings.symbolWhitelist);
    const blacklist = sanitizeSymbolList(this.settings.symbolBlacklist);
    const normalized = symbol.toUpperCase();
    const matches = (token: string) => normalized === token || normalized === `${token}USDT`;
    if (whitelist.length && !whitelist.some(matches)) return false;
    return !blacklist.some(matches);
  }

  private schedulePublish(immediate = false): void {
    if (immediate) {
      if (this.publishTimer) clearTimeout(this.publishTimer);
      this.publishTimer = null;
      this.publishNow(this.nowProvider());
      return;
    }
    if (this.publishTimer) return;
    this.publishTimer = setTimeout(() => {
      this.publishTimer = null;
      this.publishNow(this.nowProvider());
    }, ENGINE_CONFIG.publishThrottleMs);
  }

  private publishNow(now: number): void {
    if (this.publishTimer) clearTimeout(this.publishTimer);
    this.publishTimer = null;
    this.updateRates(now);
    this.revision += 1;
    this.snapshot = this.buildSnapshot(now);
    this.listeners.forEach((listener) => listener());
  }

  private updateRates(now: number): void {
    const globalElapsed = (now - this.eventWindowStartedAt) / 1_000;
    if (globalElapsed >= 2) {
      this.eventsPerSecond = Math.round(this.globalEventCount / globalElapsed);
      this.globalEventCount = 0;
      this.eventWindowStartedAt = now;
    }
    for (const feed of this.feeds.values()) {
      const elapsed = (now - feed.windowStartedAt) / 1_000;
      if (elapsed >= 2) {
        feed.messagesPerSecond = Math.round(feed.count / elapsed);
        feed.count = 0;
        feed.windowStartedAt = now;
      }
      if (feed.state === 'live' && feed.lastMessageAt && now - feed.lastMessageAt > ENGINE_CONFIG.staleFeedMs) feed.state = 'stale';
    }
  }

  private buildSnapshot(now: number): EngineSnapshot {
    const recentHour = this.recentLiquidations.filter((item) => item.ts > now - 3_600_000);
    const activeSignals = this.activeSignals.filter((signal) => signal.expiresAt > now);
    const verified = this.learning.verificationHistory;
    const totalWins = verified.filter((record) => record.win).length;
    const symbols = [...this.states.values()].map((state): SymbolSnapshot => {
      const hourLiquidations = state.liquidationHistory.filter((item) => item.ts > now - 3_600_000);
      const firstPrice = state.priceHistory.find((point) => point.price > 0)?.price ?? state.prevPrice;
      const change = firstPrice > 0 ? ((state.price - firstPrice) / firstPrice) * 100 : 0;
      const openInterestDelta = state.previousOpenInterest > 0 ? (state.openInterest - state.previousOpenInterest) / state.previousOpenInterest : 0;
      const toxic = toxicFlowFromTrades(state.tradeHistory, now);
      const whaleThreshold = adaptiveWhaleUsd(state, this.settings, now);
      return {
        symbol: state.symbol,
        price: state.price,
        priceChangePercent: change,
        volume24h: state.volume24h,
        fundingRate: state.fundingRate,
        openInterestDelta,
        openInterestReady: state.previousOpenInterest > 0,
        obi: state.obi,
        bookAgeMs: state.bookAgeMs,
        regime: state.regime,
        liquidationCount1h: hourLiquidations.length,
        liquidationVolume1h: hourLiquidations.reduce((sum, item) => sum + item.usd, 0),
        hasWhaleLiquidation: hourLiquidations.some((item) => item.usd >= whaleThreshold),
        hasSignal: state.hasSignal,
        toxicFlow: toxic?.side ?? 'NEUTRAL',
        toxicRatio: toxic?.ratio ?? 0,
      };
    });
    const metrics: EngineMetrics = {
      trackedSymbols: this.states.size,
      activeSymbols: symbols.filter((symbol) => symbol.volume24h >= this.settings.min24hVolumeUsd).length,
      activeSignals: activeSignals.length,
      totalSignals: this.signalHistory.length,
      signalsLastHour: this.signalHistory.filter((signal) => signal.createdAt > now - 3_600_000).length,
      liquidationVolume1h: recentHour.reduce((sum, item) => sum + item.usd, 0),
      liquidationCount1h: recentHour.length,
      verifiedTrades: verified.length,
      pendingVerifications: this.learning.verificationQueue.length,
      winRate: verified.length ? totalWins / verified.length : null,
      totalNetPnl: verified.reduce((sum, record) => sum + record.netPnl, 0),
      sTier: activeSignals.filter((signal) => signal.tier === 'S').length,
      aTier: activeSignals.filter((signal) => signal.tier === 'A').length,
      longSignals: activeSignals.filter((signal) => signal.direction === 'LONG').length,
      shortSignals: activeSignals.filter((signal) => signal.direction === 'SHORT').length,
      eventsPerSecond: this.eventsPerSecond,
      uptimeSeconds: Math.floor((now - this.startedAt) / 1_000),
      openInterestReady: symbols.filter((symbol) => symbol.openInterestReady).length,
    };
    return {
      revision: this.revision,
      startedAt: this.startedAt,
      now,
      paused: this.paused,
      soundEnabled: this.soundEnabled,
      settings: this.settings,
      feeds: [...this.feeds.values()].map(({ count: _count, windowStartedAt: _window, ...feed }) => ({ ...feed })),
      metrics,
      activeSignals,
      signalHistory: this.signalHistory,
      recentLiquidations: this.recentLiquidations,
      symbols,
      memory: this.learning.memory,
      patterns: this.learning.patterns,
      verificationQueue: this.learning.verificationQueue,
      verificationHistory: this.learning.verificationHistory,
    };
  }
}
