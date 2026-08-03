import { ENGINE_CONFIG } from '../config';
import { MarketEngine } from '../engine/MarketEngine';
import { BinanceGateway } from './BinanceGateway';
import { CoinGlassGateway } from './CoinGlassGateway';

export class MarketRuntime {
  readonly binance: BinanceGateway;
  readonly coinglass: CoinGlassGateway;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private openInterestTimer: ReturnType<typeof setInterval> | null = null;
  private unsubscribeSettings: (() => void) | null = null;
  private started = false;

  constructor(readonly engine: MarketEngine, coinglassApiKey?: string) {
    this.binance = new BinanceGateway(engine);
    this.coinglass = new CoinGlassGateway(engine, coinglassApiKey);
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.tickTimer = setInterval(() => this.engine.tick(), 1_000);
    this.openInterestTimer = setInterval(() => { void this.binance.refreshOpenInterest(); }, ENGINE_CONFIG.openInterestRefreshMs);
    this.unsubscribeSettings = this.engine.subscribeSettings(() => this.coinglass.sync());
    this.coinglass.sync();
    await this.binance.start();
  }

  stop(): void {
    this.started = false;
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.openInterestTimer) clearInterval(this.openInterestTimer);
    this.tickTimer = null;
    this.openInterestTimer = null;
    this.unsubscribeSettings?.();
    this.unsubscribeSettings = null;
    this.binance.stop();
    this.coinglass.stop();
  }
}
