export type Direction = 'LONG' | 'SHORT';
export type LiquidationSide = Direction;
export type OrderSide = 'BUY' | 'SELL';
export type SignalTier = 'S' | 'A' | 'B' | 'C';
export type Regime = 'UNKNOWN' | 'LOW_VOL' | 'RANGE' | 'VOLATILE' | 'TREND_UP' | 'TREND_DOWN';
export type PerceptionCategory = 'LIQ' | 'FLOW' | 'BOOK' | 'MOM' | 'FUND' | 'OI';

export type SignalType =
  | 'WHALE_FLUSH_REVERSAL'
  | 'CASCADE_CONTINUATION'
  | 'ABSORPTION_SETUP'
  | 'BREAKOUT_CONFIRMED'
  | 'MOMENTUM_SURGE'
  | 'FLOW_REVERSAL_LONG'
  | 'FLOW_REVERSAL_SHORT'
  | 'FUND_SQUEEZE_LONG'
  | 'FUND_SQUEEZE_SHORT'
  | 'OI_CONFIRM_LONG'
  | 'OI_CONFIRM_SHORT'
  | 'OI_SQUEEZE';

export type SignalFamily =
  | 'WHALE'
  | 'CASCADE'
  | 'ABSORPTION'
  | 'BREAKOUT'
  | 'MOMENTUM'
  | 'FLOW'
  | 'FUND'
  | 'OI';

export type PerceptionKey =
  | 'LIQ_WHALE_LONG'
  | 'LIQ_WHALE_SHORT'
  | 'LIQ_CASCADE_LONG'
  | 'LIQ_CASCADE_SHORT'
  | 'LIQ_CLUSTER'
  | 'LIQ_TRAP'
  | 'BITE_BUY'
  | 'BITE_SELL'
  | 'FLOW_BUY'
  | 'FLOW_SELL'
  | 'FLOW_FLIP_BUY'
  | 'FLOW_FLIP_SELL'
  | 'OBI_BUY'
  | 'OBI_SELL'
  | 'OBI_ABSORPTION'
  | 'CVD_BEAR_DIV'
  | 'CVD_BULL_DIV'
  | 'TOXIC_BUY'
  | 'TOXIC_SELL'
  | 'OI_LONG'
  | 'OI_SHORT'
  | 'OI_SQUEEZE'
  | 'VOL_SURGE'
  | 'RANGE_BREAK_UP'
  | 'RANGE_BREAK_DOWN'
  | 'SPREAD_NARROW'
  | 'FUND_HIGH'
  | 'FUND_LOW'
  | 'PRICE_PUMP'
  | 'PRICE_DUMP';

export interface TimedPrice {
  ts: number;
  price: number;
}

export interface TimedVolume {
  ts: number;
  value: number;
}

export interface TradePrint {
  ts: number;
  side: OrderSide;
  usd: number;
  price: number;
}

export interface CvdPoint {
  ts: number;
  cvd: number;
  price: number;
}

export interface FlowPoint {
  ts: number;
  buyRatio: number;
}

export interface LiquidationEvent {
  id: string;
  symbol: string;
  liquidationSide: LiquidationSide;
  orderSide: OrderSide;
  usd: number;
  price: number;
  quantity: number;
  ts: number;
  exchange: string;
  source: 'binance' | 'coinglass';
}

export interface MarketState {
  symbol: string;
  price: number;
  prevPrice: number;
  bid: number;
  ask: number;
  bidQuantity: number;
  askQuantity: number;
  bidChangedAt: number;
  askChangedAt: number;
  bookAgeMs: number;
  obi: number;
  volume24h: number;
  lastCumulativeVolume: number;
  fundingRate: number;
  openInterest: number;
  previousOpenInterest: number;
  openInterestPrice: number;
  previousOpenInterestPrice: number;
  openInterestUpdatedAt: number;
  priceHistory: TimedPrice[];
  volumeHistory: TimedVolume[];
  liquidationHistory: LiquidationEvent[];
  tradeHistory: TradePrint[];
  cvd: number;
  cvdHistory: CvdPoint[];
  flowHistory: FlowPoint[];
  regime: Regime;
  regimeUpdatedAt: number;
  cooldownUntil: number;
  lastTickerAt: number;
  hasSignal: boolean;
}

export interface Perception {
  type: PerceptionKey;
  category: PerceptionCategory;
  direction: Direction | 'NEUTRAL';
  power: number;
  label: string;
  detail: string;
  meta?: Record<string, number | string>;
}

export type PerceptionMap = Partial<Record<PerceptionKey, Perception>>;

export interface SignalCandidate {
  type: SignalType;
  direction: Direction;
  rawStrength: number;
  perceptions: Perception[];
  reason: string;
}

export interface TradePlan {
  entry: number;
  invalidation: number;
  takeProfit1: number;
  takeProfit2: number;
  riskPerUnit: number;
  riskReward: number;
  estimatedProbability: number;
  kellyFraction: number;
  suggestedPositionFraction: number;
}

export interface Signal {
  id: string;
  symbol: string;
  direction: Direction;
  type: SignalType;
  family: SignalFamily;
  perceptions: Perception[];
  reason: string;
  score: number;
  tier: SignalTier;
  rawStrength: number;
  price: number;
  entryMid: number;
  createdAt: number;
  expiresAt: number;
  ttlMs: number;
  patternId: string;
  learnedWinRate: number | null;
  learnedSamples: number;
  regime: Regime;
  obi: number;
  cvd: number;
  toxicFlow: 'BUY' | 'SELL' | 'NEUTRAL';
  bayesPosterior: number;
  bayesMultiplier: number;
  estimatedProbability: number;
  plan: TradePlan;
}

export interface HorizonStats {
  samples: number;
  wins: number;
  netPnl: number;
}

export interface MemoryEntry {
  samples: number;
  wins: number;
  netPnl: number;
  horizons: Record<string, HorizonStats>;
  lastUpdatedAt: number;
}

export interface PatternEntry {
  patternId: string;
  samples: number;
  wins: number;
  losses: number;
  signals: number;
  direction: Direction;
  horizons: Record<string, HorizonStats>;
  lastUpdatedAt: number;
}

export interface VerificationItem {
  id: string;
  signalId: string;
  memoryKey: string;
  patternId: string;
  symbol: string;
  direction: Direction;
  entryMid: number;
  signalAt: number;
  checkAt: number;
  horizonSeconds: number;
  attempts: number;
}

export interface VerificationRecord {
  id: string;
  signalId: string;
  symbol: string;
  direction: Direction;
  entry: number;
  exit: number;
  grossPnl: number;
  netPnl: number;
  win: boolean;
  horizonSeconds: number;
  verifiedAt: number;
}

export interface MiniTickerUpdate {
  symbol: string;
  price: number;
  quoteVolume: number;
  eventTime: number;
}

export interface MarkPriceUpdate {
  symbol: string;
  markPrice: number;
  fundingRate: number;
  eventTime: number;
}

export interface BookTickerUpdate {
  symbol: string;
  bid: number;
  ask: number;
  bidQuantity: number;
  askQuantity: number;
  eventTime: number;
}

export interface AggTradeUpdate {
  symbol: string;
  price: number;
  quantity: number;
  usd: number;
  side: OrderSide;
  eventTime: number;
  tradeId?: number;
}

export interface OpenInterestUpdate {
  symbol: string;
  openInterest: number;
  time: number;
}

export type FeedState = 'connecting' | 'live' | 'stale' | 'error' | 'disabled';

export interface FeedStatus {
  id: 'market' | 'public' | 'aggTrade' | 'coinglass' | 'rest';
  label: string;
  state: FeedState;
  messagesPerSecond: number;
  lastMessageAt: number;
  detail?: string;
}

export interface SymbolSnapshot {
  symbol: string;
  price: number;
  priceChangePercent: number;
  volume24h: number;
  fundingRate: number;
  openInterestDelta: number;
  openInterestReady: boolean;
  obi: number;
  bookAgeMs: number;
  regime: Regime;
  liquidationCount1h: number;
  liquidationVolume1h: number;
  hasWhaleLiquidation: boolean;
  hasSignal: boolean;
  toxicFlow: 'BUY' | 'SELL' | 'NEUTRAL';
  toxicRatio: number;
}

export interface EngineMetrics {
  trackedSymbols: number;
  activeSymbols: number;
  activeSignals: number;
  totalSignals: number;
  signalsLastHour: number;
  liquidationVolume1h: number;
  liquidationCount1h: number;
  verifiedTrades: number;
  pendingVerifications: number;
  winRate: number | null;
  totalNetPnl: number;
  sTier: number;
  aTier: number;
  longSignals: number;
  shortSignals: number;
  eventsPerSecond: number;
  uptimeSeconds: number;
  openInterestReady: number;
}
