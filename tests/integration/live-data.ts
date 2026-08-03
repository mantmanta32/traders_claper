import WebSocket from 'ws';
import { BINANCE_ENDPOINTS } from '../../src/data/BinanceGateway';
import { parseBinanceMessage, parseExchangeInfo, parseOpenInterest } from '../../src/data/binanceParser';

type CheckState = 'PASS' | 'FAIL' | 'SKIP';
interface CheckResult {
  name: string;
  state: CheckState;
  required: boolean;
  elapsedMs: number;
  detail: string;
}

class HttpStatusError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

async function check(name: string, required: boolean, task: () => Promise<string>): Promise<CheckResult> {
  const started = Date.now();
  try {
    const detail = await task();
    return { name, state: 'PASS', required, elapsedMs: Date.now() - started, detail };
  } catch (error) {
    const geoRestricted = error instanceof HttpStatusError && error.status === 451;
    return {
      name,
      state: geoRestricted && !required ? 'SKIP' : 'FAIL',
      required,
      elapsedMs: Date.now() - started,
      detail: geoRestricted ? 'HTTP 451 · çalıştırılan ağ bölgesinde Binance REST uygunluk engeli; WS fallback çalışıyor' : error instanceof Error ? error.message : String(error),
    };
  }
}

async function fetchJson(url: string, timeoutMs = 12_000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new HttpStatusError(response.status, `HTTP ${response.status} ${response.statusText}`);
    return await response.json() as unknown;
  } finally {
    clearTimeout(timer);
  }
}

function waitForEvent(url: string, predicate: (raw: string) => string | null, onOpen?: (socket: WebSocket) => void, timeoutMs = 15_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let settled = false;
    const timer = setTimeout(() => {
      socket.terminate();
      finish(new Error(`${timeoutMs}ms içinde doğrulanabilir mesaj gelmedi`));
    }, timeoutMs);
    const finish = (error: Error | null, detail?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (socket.readyState === WebSocket.OPEN) socket.close();
      else socket.terminate();
      if (error) reject(error); else resolve(detail ?? 'ok');
    };
    socket.on('open', () => onOpen?.(socket));
    socket.on('message', (data) => {
      try {
        const detail = predicate(data.toString());
        if (detail) finish(null, detail);
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
    socket.on('unexpected-response', (_request, response) => finish(new Error(`WS HTTP ${response.statusCode}`)));
    socket.on('error', (error) => finish(error));
    socket.on('close', (code, reason) => {
      if (!settled && code !== 1000 && code !== 1005) finish(new Error(`WS kapandı: ${code} ${reason.toString()}`));
    });
  });
}

const restChecks = [
  check('REST exchangeInfo', false, async () => {
    const data = await fetchJson(`${BINANCE_ENDPOINTS.REST_BASE}/fapi/v1/exchangeInfo`);
    const symbols = parseExchangeInfo(data);
    if (symbols.length < 100 || !symbols.includes('BTCUSDT')) throw new Error(`beklenmeyen sembol sayısı: ${symbols.length}`);
    return `${symbols.length} aktif perpetual USDT sembol`;
  }),
  check('REST openInterest', false, async () => {
    const data = await fetchJson(`${BINANCE_ENDPOINTS.REST_BASE}/fapi/v1/openInterest?symbol=BTCUSDT`);
    const parsed = parseOpenInterest(data, 'BTCUSDT');
    if (!parsed || parsed.openInterest <= 0) throw new Error('openInterest şeması/değeri geçersiz');
    return `BTCUSDT OI=${parsed.openInterest}`;
  }),
];

const websocketChecks = [
  check('WS /market combined', true, () => waitForEvent(BINANCE_ENDPOINTS.MARKET_STREAM, (raw) => {
    const events = parseBinanceMessage(raw);
    const market = events.find((event) => event.kind === 'miniTicker' || event.kind === 'markPrice');
    if (!market) return null;
    return market.kind === 'miniTicker' ? `${market.data.length} miniTicker` : `${market.data.length} markPrice`;
  })),
  check('WS /public bookTicker', true, () => waitForEvent(BINANCE_ENDPOINTS.PUBLIC_STREAM, (raw) => {
    const event = parseBinanceMessage(raw).find((item) => item.kind === 'bookTicker');
    return event?.kind === 'bookTicker' ? `${event.data.symbol} bid=${event.data.bid} ask=${event.data.ask}` : null;
  })),
  check('WS /market dynamic aggTrade', true, () => waitForEvent(BINANCE_ENDPOINTS.AGG_STREAM, (raw) => {
    const event = parseBinanceMessage(raw).find((item) => item.kind === 'aggTrade');
    return event?.kind === 'aggTrade' ? `${event.data.symbol} usd=${event.data.usd.toFixed(2)}` : null;
  }, (socket) => socket.send(JSON.stringify({ method: 'SUBSCRIBE', params: ['btcusdt@aggTrade'], id: 1 })))),
];

const results = await Promise.all([...restChecks, ...websocketChecks]);
console.log('\nEWS v3 canlı veri doğrulaması');
console.log('─'.repeat(104));
for (const result of results) {
  console.log(`${result.state.padEnd(5)} ${result.name.padEnd(30)} ${String(result.elapsedMs).padStart(6)}ms  ${result.detail}`);
}
console.log('─'.repeat(104));
console.log(`CoinGlass: ${process.env.VITE_COINGLASS_API_KEY ? 'anahtar bulundu; tarayıcı runtime bağlantısı etkinleştirilebilir' : 'SKIP — VITE_COINGLASS_API_KEY yok (parser unit testleri çalıştırıldı)'}`);
if (results.some((result) => result.required && result.state !== 'PASS')) process.exitCode = 1;
