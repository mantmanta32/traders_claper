import { ENGINE_CONFIG } from '../config';
import { clamp, formatUsd } from '../lib/format';
import type {
  MarketState,
  Perception,
  PerceptionKey,
  PerceptionMap,
  Regime,
  TradePrint,
} from '../types/market';
import type { AppSettings } from '../types/settings';

const LABELS: Record<PerceptionKey, string> = {
  LIQ_WHALE_LONG: 'Whale Long Likidasyon',
  LIQ_WHALE_SHORT: 'Whale Short Likidasyon',
  LIQ_CASCADE_LONG: 'Cascade Long',
  LIQ_CASCADE_SHORT: 'Cascade Short',
  LIQ_CLUSTER: 'Likidasyon Kümesi',
  LIQ_TRAP: 'Likidasyon Tuzağı',
  BITE_BUY: 'Agresif Alım Baskısı',
  BITE_SELL: 'Agresif Satım Baskısı',
  FLOW_BUY: 'Alım Dominansı',
  FLOW_SELL: 'Satım Dominansı',
  FLOW_FLIP_BUY: 'Akış AL’a Döndü',
  FLOW_FLIP_SELL: 'Akış SAT’a Döndü',
  OBI_BUY: 'OBI Alım Baskısı',
  OBI_SELL: 'OBI Satım Baskısı',
  OBI_ABSORPTION: 'OBI Emilim',
  CVD_BEAR_DIV: 'CVD Ayı Diverjansı',
  CVD_BULL_DIV: 'CVD Boğa Diverjansı',
  TOXIC_BUY: 'Toxic Buy Flow',
  TOXIC_SELL: 'Toxic Sell Flow',
  OI_LONG: 'OI Teyit Long',
  OI_SHORT: 'OI Teyit Short',
  OI_SQUEEZE: 'OI Sıkışma',
  VOL_SURGE: 'Hacim Patlaması',
  RANGE_BREAK_UP: 'Yukarı Kırılım',
  RANGE_BREAK_DOWN: 'Aşağı Kırılım',
  SPREAD_NARROW: 'Spread Sıkışması',
  FUND_HIGH: 'Yüksek Funding (+)',
  FUND_LOW: 'Negatif Funding (−)',
  PRICE_PUMP: 'Fiyat Artışı',
  PRICE_DUMP: 'Fiyat Düşüşü',
};

export function averageAbsoluteMovePercent(prices: Array<{ price: number }>): number {
  if (prices.length < 2) return 0;
  let total = 0;
  let samples = 0;
  for (let index = 1; index < prices.length; index += 1) {
    const previous = prices[index - 1].price;
    const current = prices[index].price;
    if (previous > 0 && current > 0) {
      total += Math.abs(current - previous) / previous;
      samples += 1;
    }
  }
  return samples ? total / samples : 0;
}

export function calculateAtrPercent(state: MarketState, now = Date.now(), lookbackMs = 60_000): number {
  return averageAbsoluteMovePercent(state.priceHistory.filter((point) => point.ts > now - lookbackMs));
}

export function detectRegime(state: MarketState, settings: AppSettings, now = Date.now()): Regime {
  const recent = state.priceHistory.filter((point) => point.ts > now - 60_000 && point.price > 0);
  if (recent.length < 6) return state.volume24h < settings.min24hVolumeUsd * 1.4 ? 'LOW_VOL' : 'RANGE';
  const first = recent[0].price;
  const last = recent.at(-1)?.price ?? first;
  const middle = recent[Math.floor(recent.length * 0.6)].price;
  const high = Math.max(...recent.map((point) => point.price));
  const low = Math.min(...recent.map((point) => point.price));
  const rangePercent = (high - low) / Math.max(first, Number.EPSILON);
  const atrPercent = averageAbsoluteMovePercent(recent);
  const returnPercent = (last - first) / Math.max(first, Number.EPSILON);
  if (state.volume24h < settings.min24hVolumeUsd * 1.3 && rangePercent < 0.004 && atrPercent < 0.0018) return 'LOW_VOL';
  if (rangePercent > 0.028 || atrPercent > 0.012) return 'VOLATILE';
  if (returnPercent > 0.006 && last > middle) return 'TREND_UP';
  if (returnPercent < -0.006 && last < middle) return 'TREND_DOWN';
  return rangePercent > 0.007 ? 'RANGE' : 'LOW_VOL';
}

export function adaptiveWhaleUsd(state: MarketState, settings: AppSettings, now = Date.now()): number {
  const atrPercent = Math.max(calculateAtrPercent(state, now), 0.0015);
  const atrScale = clamp(atrPercent / 0.006, 0.55, 3.5);
  const volumeScale = state.volume24h ? clamp(Math.sqrt(state.volume24h / 100_000_000), 0.4, 4.5) : 1;
  const priceScale = state.price ? clamp(Math.log10(Math.max(state.price, 1)) / 3, 0.4, 2.2) : 1;
  return Math.round(settings.whaleBaseUsd * atrScale * volumeScale * priceScale);
}

export interface ToxicFlowResult {
  side: 'BUY' | 'SELL' | 'NEUTRAL';
  ratio: number;
  power: number;
}

export function toxicFlowFromTrades(trades: TradePrint[], now = Date.now()): ToxicFlowResult | null {
  const recent = trades.filter((trade) => trade.ts > now - 30_000).slice(-50);
  if (recent.length < 10) return null;
  const largest = [...recent].sort((a, b) => b.usd - a.usd).slice(0, 5);
  const buy = largest.filter((trade) => trade.side === 'BUY').reduce((sum, trade) => sum + trade.usd, 0);
  const sell = largest.filter((trade) => trade.side === 'SELL').reduce((sum, trade) => sum + trade.usd, 0);
  const total = buy + sell;
  if (total <= 0) return null;
  const buyRatio = buy / total;
  if (buyRatio > 0.7) return { side: 'BUY', ratio: buyRatio, power: clamp((buyRatio - 0.7) * 5, 0, 3) };
  if (buyRatio < 0.3) return { side: 'SELL', ratio: 1 - buyRatio, power: clamp((0.3 - buyRatio) * 5, 0, 3) };
  return { side: 'NEUTRAL', ratio: buyRatio, power: 0 };
}

export function microstructureWeight(ageMs: number): number {
  if (!Number.isFinite(ageMs) || ageMs <= 0) return 0.2;
  if (ageMs < 100) return 0.2;
  if (ageMs > 500) return 1;
  return 0.2 + ((ageMs - 100) / 400) * 0.8;
}

export function volumeSurgeRatio(state: MarketState, now = Date.now()): number {
  const recent = state.volumeHistory.filter((point) => point.ts > now - 10_000);
  const older = state.volumeHistory.filter((point) => point.ts <= now - 10_000 && point.ts > now - 50_000);
  if (recent.length < 3 || older.length < 8) return 1;
  const recentAverage = recent.reduce((sum, point) => sum + point.value, 0) / recent.length;
  const olderAverage = older.reduce((sum, point) => sum + point.value, 0) / older.length;
  return olderAverage > 0 ? recentAverage / olderAverage : 1;
}

export function cvdDivergence(state: MarketState, now = Date.now()): { key: 'CVD_BEAR_DIV' | 'CVD_BULL_DIV'; power: number } | null {
  const history = state.cvdHistory.filter((point) => point.ts > now - 45_000);
  if (history.length < 8) return null;
  const split = Math.max(3, Math.floor(history.length / 2));
  const old = history.slice(0, split);
  const recent = history.slice(split);
  if (old.length < 3 || recent.length < 3) return null;
  const oldPriceHigh = Math.max(...old.map((point) => point.price));
  const newPriceHigh = Math.max(...recent.map((point) => point.price));
  const oldPriceLow = Math.min(...old.map((point) => point.price));
  const newPriceLow = Math.min(...recent.map((point) => point.price));
  const oldCvdHigh = Math.max(...old.map((point) => point.cvd));
  const newCvdHigh = Math.max(...recent.map((point) => point.cvd));
  const oldCvdLow = Math.min(...old.map((point) => point.cvd));
  const newCvdLow = Math.min(...recent.map((point) => point.cvd));
  if (newPriceHigh > oldPriceHigh * 1.001 && newCvdHigh < oldCvdHigh * 0.97) {
    const priceExpansion = newPriceHigh / Math.max(oldPriceHigh, Number.EPSILON) - 1;
    const cvdContraction = Math.abs(newCvdHigh - oldCvdHigh) / Math.max(Math.abs(oldCvdHigh), 1);
    return { key: 'CVD_BEAR_DIV', power: clamp((priceExpansion + cvdContraction) * 3, 0.1, 3) };
  }
  if (newPriceLow < oldPriceLow * 0.999 && newCvdLow > oldCvdLow * 1.03) {
    const priceExpansion = oldPriceLow / Math.max(newPriceLow, Number.EPSILON) - 1;
    const cvdExpansion = Math.abs(newCvdLow - oldCvdLow) / Math.max(Math.abs(oldCvdLow), 1);
    return { key: 'CVD_BULL_DIV', power: clamp((priceExpansion + cvdExpansion) * 3, 0.1, 3) };
  }
  return null;
}

function makePerception(
  type: PerceptionKey,
  category: Perception['category'],
  direction: Perception['direction'],
  power: number,
  detail: string,
  meta?: Perception['meta'],
): Perception {
  return { type, category, direction, power: clamp(power, 0, 5), label: LABELS[type], detail, meta };
}

function priceMoveOverWindow(state: MarketState, now: number): number {
  const history = state.priceHistory.filter((point) => point.ts >= now - 5_000 && point.price > 0);
  const reference = history.length >= 2 ? history[0].price : state.prevPrice;
  return reference > 0 && state.price > 0 ? (state.price - reference) / reference : 0;
}

export interface DetectionResult {
  perceptions: PerceptionMap;
  regime: Regime;
  whaleThresholdUsd: number;
}

export function detectPerceptions(state: MarketState, settings: AppSettings, now = Date.now()): DetectionResult {
  const map: PerceptionMap = {};
  const regime = detectRegime(state, settings, now);
  const whaleThresholdUsd = adaptiveWhaleUsd(state, settings, now);
  if (state.volume24h < settings.min24hVolumeUsd || state.price <= 0) return { perceptions: map, regime, whaleThresholdUsd };

  const put = (perception: Perception) => { map[perception.type] = perception; };
  const recentLiquidations = state.liquidationHistory.filter((item) => item.ts > now - ENGINE_CONFIG.liquidationClusterWindowMs);
  const cascadeLongUsd = recentLiquidations
    .filter((item) => item.ts > now - ENGINE_CONFIG.liquidationCascadeWindowMs && item.liquidationSide === 'LONG')
    .reduce((sum, item) => sum + item.usd, 0);
  const cascadeShortUsd = recentLiquidations
    .filter((item) => item.ts > now - ENGINE_CONFIG.liquidationCascadeWindowMs && item.liquidationSide === 'SHORT')
    .reduce((sum, item) => sum + item.usd, 0);
  if (cascadeLongUsd >= ENGINE_CONFIG.liquidationCascadeUsd) {
    put(makePerception('LIQ_CASCADE_LONG', 'LIQ', 'SHORT', cascadeLongUsd / ENGINE_CONFIG.liquidationCascadeUsd, `10sn'de ${formatUsd(cascadeLongUsd, settings.moneyFormat)}`, { usd: cascadeLongUsd }));
  }
  if (cascadeShortUsd >= ENGINE_CONFIG.liquidationCascadeUsd) {
    put(makePerception('LIQ_CASCADE_SHORT', 'LIQ', 'LONG', cascadeShortUsd / ENGINE_CONFIG.liquidationCascadeUsd, `10sn'de ${formatUsd(cascadeShortUsd, settings.moneyFormat)}`, { usd: cascadeShortUsd }));
  }

  const recentWhale = [...recentLiquidations]
    .filter((item) => item.ts > now - 5_000 && item.usd >= whaleThresholdUsd)
    .sort((a, b) => b.usd - a.usd)[0];
  if (recentWhale) {
    const type = recentWhale.liquidationSide === 'LONG' ? 'LIQ_WHALE_LONG' : 'LIQ_WHALE_SHORT';
    put(makePerception(type, 'LIQ', recentWhale.liquidationSide === 'LONG' ? 'SHORT' : 'LONG', recentWhale.usd / whaleThresholdUsd, `${formatUsd(recentWhale.usd, settings.moneyFormat)} likidasyon`, { usd: recentWhale.usd, thresholdUsd: whaleThresholdUsd }));
  }

  if (recentLiquidations.length >= ENGINE_CONFIG.liquidationClusterCount) {
    put(makePerception('LIQ_CLUSTER', 'LIQ', 'NEUTRAL', recentLiquidations.length / ENGINE_CONFIG.liquidationClusterCount, `${recentLiquidations.length} likidasyon / 30sn`, { count: recentLiquidations.length }));
  }

  const surge = volumeSurgeRatio(state, now);
  if (surge >= ENGINE_CONFIG.volumeSurgeMultiplier) {
    put(makePerception('VOL_SURGE', 'FLOW', 'NEUTRAL', surge / ENGINE_CONFIG.volumeSurgeMultiplier, `${surge.toFixed(1)}× ortalama hacim`, { ratio: surge }));
  }

  const move = priceMoveOverWindow(state, now);
  if (move >= ENGINE_CONFIG.priceMovePercent) {
    put(makePerception('PRICE_PUMP', 'MOM', 'LONG', move / ENGINE_CONFIG.priceMovePercent, `+${(move * 100).toFixed(2)}% / 5sn`, { percent: move }));
  } else if (move <= -ENGINE_CONFIG.priceMovePercent) {
    put(makePerception('PRICE_DUMP', 'MOM', 'SHORT', Math.abs(move) / ENGINE_CONFIG.priceMovePercent, `${(move * 100).toFixed(2)}% / 5sn`, { percent: move }));
  }

  const shortWindow = state.priceHistory.filter((point) => point.ts > now - ENGINE_CONFIG.rangeBreakWindowMs && point.ts <= now && point.price > 0);
  const rangeHistory = shortWindow.length > 1 ? shortWindow.slice(0, -1) : shortWindow;
  if (rangeHistory.length >= 3) {
    const priorHigh = Math.max(...rangeHistory.map((point) => point.price));
    const priorLow = Math.min(...rangeHistory.map((point) => point.price));
    if (state.price > priorHigh * (1 + ENGINE_CONFIG.rangeBreakBufferPercent)) {
      const breakPercent = state.price / priorHigh - 1;
      put(makePerception('RANGE_BREAK_UP', 'MOM', 'LONG', clamp(1 + breakPercent / ENGINE_CONFIG.rangeBreakBufferPercent, 1, 3), `4sn tepe üzeri +${(breakPercent * 100).toFixed(3)}%`));
    } else if (state.price < priorLow * (1 - ENGINE_CONFIG.rangeBreakBufferPercent)) {
      const breakPercent = priorLow > 0 ? priorLow / state.price - 1 : 0;
      put(makePerception('RANGE_BREAK_DOWN', 'MOM', 'SHORT', clamp(1 + breakPercent / ENGINE_CONFIG.rangeBreakBufferPercent, 1, 3), `4sn dip altı -${(breakPercent * 100).toFixed(3)}%`));
    }
  }

  if (Math.abs(state.obi) > 0.6) {
    const type = state.obi > 0 ? 'OBI_BUY' : 'OBI_SELL';
    put(makePerception(type, 'BOOK', state.obi > 0 ? 'LONG' : 'SHORT', (Math.abs(state.obi) - 0.6) / 0.4, `OBI ${(state.obi * 100).toFixed(0)}%`, { ratio: state.obi }));
  }

  const trades15s = state.tradeHistory.filter((trade) => trade.ts > now - 15_000);
  const buyUsd = trades15s.filter((trade) => trade.side === 'BUY').reduce((sum, trade) => sum + trade.usd, 0);
  const sellUsd = trades15s.filter((trade) => trade.side === 'SELL').reduce((sum, trade) => sum + trade.usd, 0);
  const tradeTotal = buyUsd + sellUsd;
  if (tradeTotal > 0) {
    const buyRatio = buyUsd / tradeTotal;
    if (buyRatio > 0.72) put(makePerception('BITE_BUY', 'FLOW', 'LONG', (buyRatio - 0.5) * 2, `%${(buyRatio * 100).toFixed(0)} alım baskısı`, { ratio: buyRatio }));
    else if (buyRatio < 0.28) put(makePerception('BITE_SELL', 'FLOW', 'SHORT', (0.5 - buyRatio) * 2, `%${((1 - buyRatio) * 100).toFixed(0)} satım baskısı`, { ratio: 1 - buyRatio }));
    else if (buyRatio > 0.58) put(makePerception('FLOW_BUY', 'FLOW', 'LONG', (buyRatio - 0.5) * 2, `%${(buyRatio * 100).toFixed(0)} alım dominansı`, { ratio: buyRatio }));
    else if (buyRatio < 0.42) put(makePerception('FLOW_SELL', 'FLOW', 'SHORT', (0.5 - buyRatio) * 2, `%${((1 - buyRatio) * 100).toFixed(0)} satım dominansı`, { ratio: 1 - buyRatio }));

    const oldFlow = state.flowHistory.filter((point) => point.ts > now - 30_000 && point.ts < now - 8_000);
    if (oldFlow.length >= 2) {
      const oldAverage = oldFlow.reduce((sum, point) => sum + point.buyRatio, 0) / oldFlow.length;
      const flip = buyRatio - oldAverage;
      if (flip > 0.18) put(makePerception('FLOW_FLIP_BUY', 'FLOW', 'LONG', flip * 4, `akış %${(oldAverage * 100).toFixed(0)}→%${(buyRatio * 100).toFixed(0)}`, { from: oldAverage, to: buyRatio }));
      if (flip < -0.18) put(makePerception('FLOW_FLIP_SELL', 'FLOW', 'SHORT', Math.abs(flip) * 4, `akış %${(oldAverage * 100).toFixed(0)}→%${(buyRatio * 100).toFixed(0)}`, { from: oldAverage, to: buyRatio }));
    }
  }

  const fundingThreshold = settings.fundingThresholdPercent / 100;
  if (Math.abs(state.fundingRate) > fundingThreshold) {
    if (state.fundingRate > 0) put(makePerception('FUND_HIGH', 'FUND', 'SHORT', state.fundingRate / fundingThreshold, `+${(state.fundingRate * 100).toFixed(4)}% funding`, { rate: state.fundingRate }));
    else put(makePerception('FUND_LOW', 'FUND', 'LONG', Math.abs(state.fundingRate) / fundingThreshold, `${(state.fundingRate * 100).toFixed(4)}% funding`, { rate: state.fundingRate }));
  }

  if (state.previousOpenInterest > 0 && state.openInterest > 0) {
    const openInterestDelta = (state.openInterest - state.previousOpenInterest) / state.previousOpenInterest;
    const priceReference = state.previousOpenInterestPrice || state.prevPrice;
    const priceDelta = priceReference > 0 ? (state.price - priceReference) / priceReference : 0;
    if (openInterestDelta > 0.01) {
      if (priceDelta >= 0) put(makePerception('OI_LONG', 'OI', 'LONG', openInterestDelta / 0.01, `OI +${(openInterestDelta * 100).toFixed(2)}%`, { delta: openInterestDelta }));
      else put(makePerception('OI_SHORT', 'OI', 'SHORT', openInterestDelta / 0.01, `OI +${(openInterestDelta * 100).toFixed(2)}%`, { delta: openInterestDelta }));
      if (openInterestDelta > 0.02 && Math.abs(priceDelta) < 0.002) {
        put(makePerception('OI_SQUEEZE', 'OI', 'NEUTRAL', openInterestDelta / 0.02, `OI +${(openInterestDelta * 100).toFixed(2)}% · fiyat sıkışık`, { delta: openInterestDelta }));
      }
    }
  }

  const divergence = cvdDivergence(state, now);
  if (divergence) {
    put(makePerception(divergence.key, 'FLOW', divergence.key === 'CVD_BULL_DIV' ? 'LONG' : 'SHORT', divergence.power, divergence.key === 'CVD_BULL_DIV' ? 'Fiyat yeni dip · CVD güçleniyor' : 'Fiyat yeni tepe · CVD zayıflıyor'));
  }

  const toxic = toxicFlowFromTrades(state.tradeHistory, now);
  if (toxic?.side === 'BUY') put(makePerception('TOXIC_BUY', 'FLOW', 'LONG', toxic.power, `En büyük 5 trade · %${(toxic.ratio * 100).toFixed(0)} alım`, { ratio: toxic.ratio }));
  if (toxic?.side === 'SELL') put(makePerception('TOXIC_SELL', 'FLOW', 'SHORT', toxic.power, `En büyük 5 trade · %${(toxic.ratio * 100).toFixed(0)} satım`, { ratio: toxic.ratio }));

  if (map.LIQ_CLUSTER && !map.PRICE_PUMP && !map.PRICE_DUMP) {
    put(makePerception('LIQ_TRAP', 'LIQ', 'LONG', map.LIQ_CLUSTER.power * 0.8, 'Likidasyon kümesi var, fiyat tepki vermiyor'));
  }

  if ((map.LIQ_WHALE_LONG && state.obi < -0.6) || (map.LIQ_WHALE_SHORT && state.obi > 0.6)) {
    const whale = map.LIQ_WHALE_LONG ?? map.LIQ_WHALE_SHORT;
    if (whale) put(makePerception('OBI_ABSORPTION', 'BOOK', whale.direction === 'SHORT' ? 'LONG' : 'SHORT', Math.abs(state.obi), 'Whale likidasyonu + ters OBI · emilim', { ratio: state.obi }));
  }

  if (state.bid > 0 && state.ask > 0) {
    const spread = (state.ask - state.bid) / state.bid;
    if (spread < 0.0001) put(makePerception('SPREAD_NARROW', 'BOOK', 'NEUTRAL', 1.2, `Spread ${(spread * 10_000).toFixed(2)} bps`, { spread }));
  }

  return { perceptions: map, regime, whaleThresholdUsd };
}
