import { ENGINE_CONFIG } from '../config';
import { MarketEngine } from '../engine/MarketEngine';
import type { FeedState } from '../types/market';
import { parseBinanceMessage, parseExchangeInfo, parseOpenInterest } from './binanceParser';
import { ReconnectingSocket } from './ReconnectingSocket';

const REST_BASE = 'https://fapi.binance.com';
const MARKET_STREAM = 'wss://fstream.binance.com/market/stream?streams=!miniTicker@arr/!markPrice@arr@1s/!forceOrder@arr';
const PUBLIC_STREAM = 'wss://fstream.binance.com/public/stream?streams=!bookTicker';
const AGG_STREAM = 'wss://fstream.binance.com/market/ws';

interface TrackedAgg {
  expiresAt: number;
  timer: ReturnType<typeof setTimeout>;
}

async function messageText(data: string | Blob | ArrayBuffer): Promise<string> {
  if (typeof data === 'string') return data;
  if (data instanceof Blob) return data.text();
  return new TextDecoder().decode(data);
}

export class BinanceGateway {
  private readonly marketSocket: ReconnectingSocket;
  private readonly publicSocket: ReconnectingSocket;
  private readonly aggSocket: ReconnectingSocket;
  private readonly trackedAgg = new Map<string, TrackedAgg>();
  private requestId = 1;
  private stopped = true;

  constructor(private readonly engine: MarketEngine) {
    const reconnect = () => this.engine.getSettings().autoReconnect;
    const debug = () => this.engine.getSettings().debugWebSocket;
    this.marketSocket = new ReconnectingSocket({
      url: () => MARKET_STREAM,
      autoReconnect: reconnect,
      debug,
      staleAfterMs: ENGINE_CONFIG.staleFeedMs,
      onState: (state, detail) => this.engine.setFeedState('market', state, detail),
      onMessage: (data) => { void this.handleMessage('market', data); },
    });
    this.publicSocket = new ReconnectingSocket({
      url: () => PUBLIC_STREAM,
      autoReconnect: reconnect,
      debug,
      staleAfterMs: ENGINE_CONFIG.staleFeedMs,
      onState: (state, detail) => this.engine.setFeedState('public', state, detail),
      onMessage: (data) => { void this.handleMessage('public', data); },
    });
    this.aggSocket = new ReconnectingSocket({
      url: () => AGG_STREAM,
      autoReconnect: reconnect,
      debug,
      staleAfterMs: 15_000,
      onState: (state, detail) => this.engine.setFeedState('aggTrade', state, detail),
      onOpen: () => this.subscribeAllAgg(),
      onMessage: (data) => { void this.handleMessage('aggTrade', data); },
    });
  }

  async start(): Promise<void> {
    this.stopped = false;
    this.engine.setAggTracker((symbol, seconds) => this.trackAggTrade(symbol, seconds));
    await this.loadSymbols();
    if (this.stopped) return;
    this.marketSocket.connect();
    this.publicSocket.connect();
    await this.refreshOpenInterest();
  }

  stop(): void {
    this.stopped = true;
    this.engine.setAggTracker(null);
    this.marketSocket.disconnect();
    this.publicSocket.disconnect();
    this.aggSocket.disconnect();
    for (const tracked of this.trackedAgg.values()) clearTimeout(tracked.timer);
    this.trackedAgg.clear();
  }

  async loadSymbols(): Promise<string[]> {
    this.engine.setFeedState('rest', 'connecting', 'Sembol listesi yükleniyor');
    try {
      const data = await this.fetchJson(`${REST_BASE}/fapi/v1/exchangeInfo`);
      const symbols = parseExchangeInfo(data);
      if (!symbols.length) throw new Error('exchangeInfo şeması geçersiz veya boş');
      this.engine.registerSymbols(symbols);
      this.engine.setFeedState('rest', 'live', `${symbols.length} perpetual USDT sembol`);
      this.engine.recordFeedMessage('rest');
      return symbols;
    } catch (error) {
      this.engine.setFeedState('rest', 'error', error instanceof Error ? error.message : 'Sembol listesi alınamadı');
      return [];
    }
  }

  async refreshOpenInterest(): Promise<void> {
    const symbols = this.engine.topOpenInterestSymbols();
    if (!symbols.length) return;
    const results = await Promise.allSettled(symbols.map(async (symbol) => {
      const raw = await this.fetchJson(`${REST_BASE}/fapi/v1/openInterest?symbol=${encodeURIComponent(symbol)}`, 8_000);
      const parsed = parseOpenInterest(raw, symbol);
      if (!parsed) throw new Error(`${symbol} openInterest şeması geçersiz`);
      this.engine.ingestOpenInterest(parsed);
      return parsed;
    }));
    const succeeded = results.filter((result) => result.status === 'fulfilled').length;
    if (succeeded) {
      this.engine.setFeedState('rest', 'live', `OI ${succeeded}/${symbols.length}`);
      this.engine.recordFeedMessage('rest', succeeded);
    } else {
      this.engine.setFeedState('rest', 'error', 'OI isteklerinin tamamı başarısız');
    }
  }

  trackAggTrade(symbol: string, durationSeconds: number): void {
    const normalized = symbol.toUpperCase();
    const current = this.trackedAgg.get(normalized);
    if (current) {
      clearTimeout(current.timer);
      current.expiresAt = Date.now() + durationSeconds * 1_000;
      current.timer = setTimeout(() => this.untrackAggTrade(normalized), durationSeconds * 1_000);
      return;
    }
    const maxSymbols = this.engine.getSettings().maxAggTradeSymbols;
    if (this.trackedAgg.size >= maxSymbols) {
      const oldest = [...this.trackedAgg.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0]?.[0];
      if (oldest) this.untrackAggTrade(oldest);
    }
    const timer = setTimeout(() => this.untrackAggTrade(normalized), durationSeconds * 1_000);
    this.trackedAgg.set(normalized, { expiresAt: Date.now() + durationSeconds * 1_000, timer });
    if (!this.aggSocket.isOpen()) this.aggSocket.connect();
    else this.sendAggCommand('SUBSCRIBE', [normalized]);
  }

  private untrackAggTrade(symbol: string): void {
    const tracked = this.trackedAgg.get(symbol);
    if (!tracked) return;
    clearTimeout(tracked.timer);
    this.trackedAgg.delete(symbol);
    this.sendAggCommand('UNSUBSCRIBE', [symbol]);
    if (!this.trackedAgg.size) this.aggSocket.disconnect('disabled');
  }

  private subscribeAllAgg(): void {
    if (this.trackedAgg.size) this.sendAggCommand('SUBSCRIBE', [...this.trackedAgg.keys()]);
  }

  private sendAggCommand(method: 'SUBSCRIBE' | 'UNSUBSCRIBE', symbols: string[]): void {
    const params = symbols.map((symbol) => `${symbol.toLowerCase()}@aggTrade`);
    if (!params.length) return;
    this.aggSocket.send(JSON.stringify({ method, params, id: this.requestId++ }));
  }

  private async handleMessage(feed: 'market' | 'public' | 'aggTrade', raw: string | Blob | ArrayBuffer): Promise<void> {
    try {
      const text = await messageText(raw);
      const events = parseBinanceMessage(text);
      this.engine.recordFeedMessage(feed, 1);
      for (const event of events) {
        switch (event.kind) {
          case 'miniTicker': this.engine.ingestMiniTickers(event.data); break;
          case 'markPrice': this.engine.ingestMarkPrices(event.data); break;
          case 'bookTicker': this.engine.ingestBookTicker(event.data); break;
          case 'liquidation': this.engine.ingestLiquidation(event.data); break;
          case 'aggTrade': this.engine.ingestAggTrade(event.data); break;
          case 'subscription': break;
        }
      }
    } catch (error) {
      const state: FeedState = 'error';
      this.engine.setFeedState(feed, state, error instanceof Error ? error.message : 'Mesaj işlenemedi');
    }
  }

  private async fetchJson(url: string, timeoutMs = 12_000): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      return await response.json() as unknown;
    } finally {
      clearTimeout(timer);
    }
  }
}

export const BINANCE_ENDPOINTS = { REST_BASE, MARKET_STREAM, PUBLIC_STREAM, AGG_STREAM } as const;
