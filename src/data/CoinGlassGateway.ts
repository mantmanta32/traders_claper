import { MarketEngine } from '../engine/MarketEngine';
import { parseCoinglassMessage } from './coinglassParser';
import { ReconnectingSocket } from './ReconnectingSocket';

async function messageText(data: string | Blob | ArrayBuffer): Promise<string> {
  if (typeof data === 'string') return data;
  if (data instanceof Blob) return data.text();
  return new TextDecoder().decode(data);
}

export class CoinGlassGateway {
  private socket: ReconnectingSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly engine: MarketEngine, private readonly apiKey?: string) {}

  sync(): void {
    const settings = this.engine.getSettings();
    if (!settings.coinglassEnabled) {
      this.stop();
      this.engine.setFeedState('coinglass', 'disabled', 'Ayar kapalı');
      return;
    }
    if (!this.apiKey) {
      this.stop();
      this.engine.setFeedState('coinglass', 'error', 'VITE_COINGLASS_API_KEY gerekli');
      return;
    }
    if (this.socket?.isOpen()) return;
    this.stop();
    this.socket = new ReconnectingSocket({
      url: () => `wss://open-ws.coinglass.com/ws-api?cg-api-key=${encodeURIComponent(this.apiKey!)}`,
      autoReconnect: () => this.engine.getSettings().autoReconnect && this.engine.getSettings().coinglassEnabled,
      debug: () => this.engine.getSettings().debugWebSocket,
      staleAfterMs: 30_000,
      onState: (state, detail) => this.engine.setFeedState('coinglass', state, detail),
      onOpen: () => {
        this.socket?.send(JSON.stringify({ method: 'subscribe', channels: ['liquidationOrders'] }));
        this.startPing();
      },
      onMessage: (data) => { void this.handleMessage(data); },
    });
    this.socket.connect();
  }

  stop(): void {
    this.stopPing();
    this.socket?.disconnect();
    this.socket = null;
  }

  private async handleMessage(raw: string | Blob | ArrayBuffer): Promise<void> {
    const text = await messageText(raw);
    if (text === 'pong') {
      this.engine.recordFeedMessage('coinglass');
      return;
    }
    const liquidations = parseCoinglassMessage(text);
    this.engine.recordFeedMessage('coinglass');
    liquidations.forEach((event) => this.engine.ingestLiquidation(event));
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => this.socket?.send('ping'), 20_000);
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }
}
