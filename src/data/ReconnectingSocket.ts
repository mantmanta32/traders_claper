import type { FeedState } from '../types/market';

export interface ReconnectingSocketOptions {
  url: () => string;
  autoReconnect: () => boolean;
  onMessage: (data: string | Blob | ArrayBuffer) => void;
  onState: (state: FeedState, detail?: string) => void;
  onOpen?: (socket: WebSocket) => void;
  debug?: () => boolean;
  staleAfterMs?: number;
}

export class ReconnectingSocket {
  private socket: WebSocket | null = null;
  private stopped = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private staleTimer: ReturnType<typeof setInterval> | null = null;
  private retryMs = 1_000;
  private lastMessageAt = 0;

  constructor(private readonly options: ReconnectingSocketOptions) {}

  connect(): void {
    if (typeof WebSocket === 'undefined') {
      this.options.onState('error', 'WebSocket bu ortamda desteklenmiyor');
      return;
    }
    this.stopped = false;
    if (this.socket && (this.socket.readyState === WebSocket.CONNECTING || this.socket.readyState === WebSocket.OPEN)) return;
    this.clearReconnect();
    this.options.onState('connecting');
    try {
      const socket = new WebSocket(this.options.url());
      this.socket = socket;
      socket.onopen = () => {
        if (socket !== this.socket) return;
        this.retryMs = 1_000;
        this.lastMessageAt = Date.now();
        this.options.onState('live');
        this.options.onOpen?.(socket);
        this.startStaleMonitor();
        this.log('open', this.options.url());
      };
      socket.onmessage = (event) => {
        if (socket !== this.socket) return;
        this.lastMessageAt = Date.now();
        this.options.onMessage(event.data as string | Blob | ArrayBuffer);
      };
      socket.onerror = () => {
        if (socket !== this.socket) return;
        this.options.onState('error', 'WebSocket bağlantı hatası');
      };
      socket.onclose = (event) => {
        if (socket !== this.socket) return;
        this.socket = null;
        this.stopStaleMonitor();
        if (this.stopped) {
          this.options.onState('disabled');
          return;
        }
        this.options.onState('error', `Bağlantı kapandı (${event.code || 'kod yok'})`);
        this.scheduleReconnect();
      };
    } catch (error) {
      this.options.onState('error', error instanceof Error ? error.message : 'WebSocket açılamadı');
      this.scheduleReconnect();
    }
  }

  disconnect(state: FeedState = 'disabled'): void {
    this.stopped = true;
    this.clearReconnect();
    this.stopStaleMonitor();
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, 'client shutdown');
    this.options.onState(state);
  }

  send(data: string): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(data);
    return true;
  }

  isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  private scheduleReconnect(): void {
    if (this.stopped || !this.options.autoReconnect()) return;
    this.clearReconnect();
    const jitter = Math.round(Math.random() * Math.min(500, this.retryMs * 0.2));
    this.reconnectTimer = setTimeout(() => this.connect(), this.retryMs + jitter);
    this.retryMs = Math.min(this.retryMs * 2, 30_000);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private startStaleMonitor(): void {
    this.stopStaleMonitor();
    const staleAfterMs = this.options.staleAfterMs ?? 8_000;
    this.staleTimer = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN && Date.now() - this.lastMessageAt > staleAfterMs) {
        this.options.onState('stale', `${Math.round((Date.now() - this.lastMessageAt) / 1_000)}sn veri yok`);
      }
    }, Math.max(1_000, staleAfterMs / 2));
  }

  private stopStaleMonitor(): void {
    if (this.staleTimer) clearInterval(this.staleTimer);
    this.staleTimer = null;
  }

  private log(...args: unknown[]): void {
    if (this.options.debug?.()) console.debug('[WS]', ...args);
  }
}
