import { ENGINE_CONFIG } from '../config';
import { clamp } from '../lib/format';
import type {
  Direction,
  MarketState,
  MemoryEntry,
  Perception,
  PerceptionKey,
  PerceptionMap,
  Regime,
  Signal,
  SignalCandidate,
  SignalFamily,
  SignalTier,
  SignalType,
  TradePlan,
} from '../types/market';
import type { AppSettings } from '../types/settings';
import { calculateAtrPercent, toxicFlowFromTrades } from './perception';

export const PERCEPTION_WEIGHTS: Record<PerceptionKey, number> = {
  LIQ_WHALE_LONG: 25,
  LIQ_WHALE_SHORT: 25,
  LIQ_CASCADE_LONG: 20,
  LIQ_CASCADE_SHORT: 20,
  LIQ_CLUSTER: 12,
  LIQ_TRAP: 14,
  BITE_BUY: 18,
  BITE_SELL: 18,
  FLOW_BUY: 12,
  FLOW_SELL: 12,
  FLOW_FLIP_BUY: 15,
  FLOW_FLIP_SELL: 15,
  OBI_BUY: 12,
  OBI_SELL: 12,
  OBI_ABSORPTION: 16,
  CVD_BEAR_DIV: 14,
  CVD_BULL_DIV: 14,
  TOXIC_BUY: 11,
  TOXIC_SELL: 11,
  OI_LONG: 13,
  OI_SHORT: 13,
  OI_SQUEEZE: 16,
  VOL_SURGE: 10,
  RANGE_BREAK_UP: 15,
  RANGE_BREAK_DOWN: 15,
  SPREAD_NARROW: 7,
  FUND_HIGH: 10,
  FUND_LOW: 10,
  PRICE_PUMP: 10,
  PRICE_DUMP: 10,
};

function selected(keys: PerceptionKey[], perceptions: PerceptionMap): Perception[] {
  return keys.flatMap((key) => perceptions[key] ? [perceptions[key] as Perception] : []);
}

function power(perceptions: PerceptionMap, key: PerceptionKey): number {
  return perceptions[key]?.power ?? 0;
}

function has(perceptions: PerceptionMap, key: PerceptionKey): boolean {
  return Boolean(perceptions[key]);
}

function reason(parts: Array<string | false | null | undefined>, ending: string): string {
  const valid = parts.filter((part): part is string => typeof part === 'string' && part.length > 0);
  return `${valid.join(' · ')}${valid.length ? '. ' : ''}${ending}`;
}

export function buildSignalCandidates(perceptions: PerceptionMap): SignalCandidate[] {
  const candidates: SignalCandidate[] = [];

  const addWhale = (direction: Direction) => {
    const whaleKey: PerceptionKey = direction === 'LONG' ? 'LIQ_WHALE_SHORT' : 'LIQ_WHALE_LONG';
    const biteKey: PerceptionKey = direction === 'LONG' ? 'BITE_BUY' : 'BITE_SELL';
    const priceKey: PerceptionKey = direction === 'LONG' ? 'PRICE_PUMP' : 'PRICE_DUMP';
    const divKey: PerceptionKey = direction === 'LONG' ? 'CVD_BULL_DIV' : 'CVD_BEAR_DIV';
    const oppositeObi: PerceptionKey = direction === 'LONG' ? 'OBI_SELL' : 'OBI_BUY';
    const toxicKey: PerceptionKey = direction === 'LONG' ? 'TOXIC_BUY' : 'TOXIC_SELL';
    const conflictingToxic: PerceptionKey = direction === 'LONG' ? 'TOXIC_SELL' : 'TOXIC_BUY';
    if (!has(perceptions, whaleKey)) return;
    let rawStrength = power(perceptions, whaleKey) * 0.5;
    rawStrength += power(perceptions, 'VOL_SURGE') * 0.25;
    rawStrength += power(perceptions, priceKey) * 0.15;
    rawStrength += power(perceptions, biteKey) * 0.4;
    rawStrength += power(perceptions, divKey) * 0.35;
    rawStrength += power(perceptions, oppositeObi) * 0.25;
    rawStrength += power(perceptions, toxicKey) * 0.25;
    rawStrength -= power(perceptions, conflictingToxic) * 0.15;
    const keys: PerceptionKey[] = [whaleKey, 'VOL_SURGE', priceKey, biteKey, divKey, oppositeObi, toxicKey];
    candidates.push({
      type: 'WHALE_FLUSH_REVERSAL',
      direction,
      rawStrength,
      perceptions: selected(keys, perceptions),
      reason: reason([
        perceptions[whaleKey]?.detail,
        perceptions.VOL_SURGE?.detail,
        perceptions[biteKey]?.detail,
        perceptions[divKey]?.detail,
      ], 'Whale flush sonrası dönüş ihtimali.'),
    });
  };
  addWhale('LONG');
  addWhale('SHORT');

  const addCascade = (direction: Direction) => {
    const cascadeKey: PerceptionKey = direction === 'SHORT' ? 'LIQ_CASCADE_LONG' : 'LIQ_CASCADE_SHORT';
    const priceKey: PerceptionKey = direction === 'SHORT' ? 'PRICE_DUMP' : 'PRICE_PUMP';
    const biteKey: PerceptionKey = direction === 'SHORT' ? 'BITE_SELL' : 'BITE_BUY';
    const divKey: PerceptionKey = direction === 'SHORT' ? 'CVD_BEAR_DIV' : 'CVD_BULL_DIV';
    const obiKey: PerceptionKey = direction === 'SHORT' ? 'OBI_BUY' : 'OBI_SELL';
    const toxicKey: PerceptionKey = direction === 'SHORT' ? 'TOXIC_SELL' : 'TOXIC_BUY';
    const conflictKey: PerceptionKey = direction === 'SHORT' ? 'TOXIC_BUY' : 'TOXIC_SELL';
    if (!has(perceptions, cascadeKey) || !has(perceptions, priceKey)) return;
    let rawStrength = power(perceptions, cascadeKey) * 0.6 + power(perceptions, priceKey) * 0.4;
    rawStrength += power(perceptions, biteKey) * 0.3;
    rawStrength += power(perceptions, 'VOL_SURGE') * 0.15;
    rawStrength += power(perceptions, divKey) * 0.35;
    rawStrength += power(perceptions, obiKey) * 0.2;
    rawStrength += power(perceptions, toxicKey) * 0.25;
    rawStrength -= power(perceptions, conflictKey) * 0.15;
    const keys: PerceptionKey[] = [cascadeKey, priceKey, biteKey, 'VOL_SURGE', divKey, obiKey, toxicKey];
    candidates.push({
      type: 'CASCADE_CONTINUATION',
      direction,
      rawStrength,
      perceptions: selected(keys, perceptions),
      reason: reason([perceptions[cascadeKey]?.detail, perceptions[priceKey]?.detail, perceptions[biteKey]?.detail], 'Likidasyon kaskadı yönünde devam sinyali.'),
    });
  };
  addCascade('SHORT');
  addCascade('LONG');

  if ((has(perceptions, 'LIQ_TRAP') || has(perceptions, 'LIQ_CLUSTER') || has(perceptions, 'OBI_ABSORPTION')) && !has(perceptions, 'PRICE_DUMP')) {
    const absorptionDirection = perceptions.OBI_ABSORPTION?.direction;
    const direction: Direction = absorptionDirection === 'SHORT' ? 'SHORT' : 'LONG';
    const biteKey: PerceptionKey = direction === 'LONG' ? 'BITE_BUY' : 'BITE_SELL';
    const fundingKey: PerceptionKey = direction === 'LONG' ? 'FUND_LOW' : 'FUND_HIGH';
    const toxicKey: PerceptionKey = direction === 'LONG' ? 'TOXIC_BUY' : 'TOXIC_SELL';
    let rawStrength = Math.max(power(perceptions, 'LIQ_TRAP'), power(perceptions, 'LIQ_CLUSTER'), power(perceptions, 'OBI_ABSORPTION')) * 0.7;
    rawStrength += power(perceptions, biteKey) * 0.7;
    rawStrength += power(perceptions, fundingKey) * 0.2;
    rawStrength += power(perceptions, toxicKey) * 0.2;
    const keys: PerceptionKey[] = ['LIQ_TRAP', 'LIQ_CLUSTER', 'OBI_ABSORPTION', biteKey, fundingKey, toxicKey];
    candidates.push({
      type: 'ABSORPTION_SETUP',
      direction,
      rawStrength,
      perceptions: selected(keys, perceptions),
      reason: reason([perceptions.LIQ_CLUSTER?.detail, perceptions.OBI_ABSORPTION?.detail, perceptions[biteKey]?.detail], 'Fiyat tepkisiz; karşı taraf likiditeyi emiyor olabilir.'),
    });
  }

  if ((has(perceptions, 'RANGE_BREAK_UP') || has(perceptions, 'RANGE_BREAK_DOWN')) && has(perceptions, 'VOL_SURGE')) {
    const direction: Direction = has(perceptions, 'RANGE_BREAK_UP') ? 'LONG' : 'SHORT';
    const rangeKey: PerceptionKey = direction === 'LONG' ? 'RANGE_BREAK_UP' : 'RANGE_BREAK_DOWN';
    const biteKey: PerceptionKey = direction === 'LONG' ? 'BITE_BUY' : 'BITE_SELL';
    const obiKey: PerceptionKey = direction === 'LONG' ? 'OBI_BUY' : 'OBI_SELL';
    const toxicKey: PerceptionKey = direction === 'LONG' ? 'TOXIC_BUY' : 'TOXIC_SELL';
    let rawStrength = power(perceptions, 'VOL_SURGE') * 0.5 + power(perceptions, rangeKey) * 0.5;
    rawStrength += power(perceptions, biteKey) * 0.25 + power(perceptions, obiKey) * 0.2 + power(perceptions, toxicKey) * 0.2;
    const keys: PerceptionKey[] = [rangeKey, 'VOL_SURGE', biteKey, obiKey, toxicKey, direction === 'LONG' ? 'CVD_BULL_DIV' : 'CVD_BEAR_DIV'];
    candidates.push({
      type: 'BREAKOUT_CONFIRMED', direction, rawStrength, perceptions: selected(keys, perceptions),
      reason: reason([perceptions[rangeKey]?.detail, perceptions.VOL_SURGE?.detail, perceptions[obiKey]?.detail], 'Kırılım hacim ve mikroyapıyla teyitli.'),
    });
  }

  if (has(perceptions, 'VOL_SURGE') && power(perceptions, 'VOL_SURGE') >= 3) {
    const direction: Direction | null = has(perceptions, 'PRICE_PUMP') ? 'LONG' : has(perceptions, 'PRICE_DUMP') ? 'SHORT' : null;
    if (direction) {
      const priceKey: PerceptionKey = direction === 'LONG' ? 'PRICE_PUMP' : 'PRICE_DUMP';
      const biteKey: PerceptionKey = direction === 'LONG' ? 'BITE_BUY' : 'BITE_SELL';
      const obiKey: PerceptionKey = direction === 'LONG' ? 'OBI_BUY' : 'OBI_SELL';
      const toxicKey: PerceptionKey = direction === 'LONG' ? 'TOXIC_BUY' : 'TOXIC_SELL';
      let rawStrength = power(perceptions, 'VOL_SURGE') * 0.65;
      rawStrength += power(perceptions, biteKey) * 0.2 + power(perceptions, obiKey) * 0.2 + power(perceptions, toxicKey) * 0.2;
      const keys: PerceptionKey[] = ['VOL_SURGE', priceKey, biteKey, obiKey, toxicKey];
      candidates.push({
        type: 'MOMENTUM_SURGE', direction, rawStrength, perceptions: selected(keys, perceptions),
        reason: reason([perceptions.VOL_SURGE?.detail, perceptions[priceKey]?.detail, perceptions[toxicKey]?.detail], 'Kısa vadeli momentum patlaması.'),
      });
    }
  }

  if (has(perceptions, 'FUND_HIGH') && power(perceptions, 'FUND_HIGH') >= 2) {
    const rawStrength = power(perceptions, 'FUND_HIGH') * 0.6 + power(perceptions, 'BITE_SELL') * 0.3;
    candidates.push({ type: 'FUND_SQUEEZE_SHORT', direction: 'SHORT', rawStrength, perceptions: selected(['FUND_HIGH', 'BITE_SELL', 'LIQ_WHALE_LONG'], perceptions), reason: 'Pozitif funding aşırı; kalabalık long pozisyona karşı mean-reversion kurulumu.' });
  }
  if (has(perceptions, 'FUND_LOW') && power(perceptions, 'FUND_LOW') >= 2) {
    const rawStrength = power(perceptions, 'FUND_LOW') * 0.6 + power(perceptions, 'BITE_BUY') * 0.3;
    candidates.push({ type: 'FUND_SQUEEZE_LONG', direction: 'LONG', rawStrength, perceptions: selected(['FUND_LOW', 'BITE_BUY', 'LIQ_WHALE_SHORT'], perceptions), reason: 'Negatif funding aşırı; kalabalık short pozisyona karşı mean-reversion kurulumu.' });
  }

  const addFlowReversal = (direction: Direction) => {
    const flipKey: PerceptionKey = direction === 'LONG' ? 'FLOW_FLIP_BUY' : 'FLOW_FLIP_SELL';
    const biteKey: PerceptionKey = direction === 'LONG' ? 'BITE_BUY' : 'BITE_SELL';
    const divKey: PerceptionKey = direction === 'LONG' ? 'CVD_BULL_DIV' : 'CVD_BEAR_DIV';
    const obiKey: PerceptionKey = direction === 'LONG' ? 'OBI_BUY' : 'OBI_SELL';
    if (!has(perceptions, flipKey) || (!has(perceptions, 'VOL_SURGE') && !has(perceptions, biteKey))) return;
    let rawStrength = power(perceptions, flipKey) * 0.6;
    rawStrength += power(perceptions, 'VOL_SURGE') * 0.2 + power(perceptions, biteKey) * 0.3 + power(perceptions, divKey) * 0.35 + power(perceptions, obiKey) * 0.2;
    const keys: PerceptionKey[] = [flipKey, 'VOL_SURGE', biteKey, divKey, obiKey];
    candidates.push({
      type: direction === 'LONG' ? 'FLOW_REVERSAL_LONG' : 'FLOW_REVERSAL_SHORT', direction, rawStrength, perceptions: selected(keys, perceptions),
      reason: reason([perceptions[flipKey]?.detail, perceptions.VOL_SURGE?.detail, perceptions[divKey]?.detail], `Agresif akış ${direction === 'LONG' ? 'alıma' : 'satıma'} döndü.`),
    });
  };
  addFlowReversal('LONG');
  addFlowReversal('SHORT');

  if (has(perceptions, 'OI_LONG') && (has(perceptions, 'PRICE_PUMP') || has(perceptions, 'BITE_BUY'))) {
    const rawStrength = power(perceptions, 'OI_LONG') * 0.7 + power(perceptions, 'PRICE_PUMP') * 0.3 + power(perceptions, 'TOXIC_BUY') * 0.2 + power(perceptions, 'OBI_BUY') * 0.15;
    candidates.push({ type: 'OI_CONFIRM_LONG', direction: 'LONG', rawStrength, perceptions: selected(['OI_LONG', 'PRICE_PUMP', 'BITE_BUY', 'TOXIC_BUY', 'OBI_BUY'], perceptions), reason: reason([perceptions.OI_LONG?.detail, perceptions.PRICE_PUMP?.detail, perceptions.BITE_BUY?.detail], 'Açık pozisyon artışı long yönünü teyit ediyor.') });
  }
  if (has(perceptions, 'OI_SHORT') && (has(perceptions, 'PRICE_DUMP') || has(perceptions, 'BITE_SELL'))) {
    const rawStrength = power(perceptions, 'OI_SHORT') * 0.7 + power(perceptions, 'PRICE_DUMP') * 0.3 + power(perceptions, 'TOXIC_SELL') * 0.2 + power(perceptions, 'OBI_SELL') * 0.15;
    candidates.push({ type: 'OI_CONFIRM_SHORT', direction: 'SHORT', rawStrength, perceptions: selected(['OI_SHORT', 'PRICE_DUMP', 'BITE_SELL', 'TOXIC_SELL', 'OBI_SELL'], perceptions), reason: reason([perceptions.OI_SHORT?.detail, perceptions.PRICE_DUMP?.detail, perceptions.BITE_SELL?.detail], 'Açık pozisyon artışı short yönünü teyit ediyor.') });
  }
  if (has(perceptions, 'OI_SQUEEZE')) {
    const direction: Direction = has(perceptions, 'PRICE_DUMP') ? 'SHORT' : 'LONG';
    const rawStrength = power(perceptions, 'OI_SQUEEZE') * 0.8 + power(perceptions, 'VOL_SURGE') * 0.2;
    candidates.push({ type: 'OI_SQUEEZE', direction, rawStrength, perceptions: selected(['OI_SQUEEZE', 'VOL_SURGE', direction === 'LONG' ? 'OBI_BUY' : 'OBI_SELL'], perceptions), reason: reason([perceptions.OI_SQUEEZE?.detail, perceptions.VOL_SURGE?.detail], 'Açık pozisyon sıkışmasının kırılımı izleniyor.') });
  }

  return candidates;
}

function evidenceProfile(type: SignalType, direction: Direction): { positive: PerceptionKey[]; negative: PerceptionKey[] } {
  const long = direction === 'LONG';
  switch (type) {
    case 'WHALE_FLUSH_REVERSAL':
      return long
        ? { positive: ['LIQ_WHALE_SHORT', 'BITE_BUY', 'CVD_BULL_DIV', 'OBI_SELL', 'TOXIC_BUY'], negative: ['LIQ_WHALE_LONG', 'BITE_SELL', 'CVD_BEAR_DIV', 'OBI_BUY', 'TOXIC_SELL'] }
        : { positive: ['LIQ_WHALE_LONG', 'BITE_SELL', 'CVD_BEAR_DIV', 'OBI_BUY', 'TOXIC_SELL'], negative: ['LIQ_WHALE_SHORT', 'BITE_BUY', 'CVD_BULL_DIV', 'OBI_SELL', 'TOXIC_BUY'] };
    case 'CASCADE_CONTINUATION':
      return long
        ? { positive: ['LIQ_CASCADE_SHORT', 'PRICE_PUMP', 'BITE_BUY', 'CVD_BULL_DIV', 'OBI_SELL', 'TOXIC_BUY'], negative: ['LIQ_CASCADE_LONG', 'PRICE_DUMP', 'BITE_SELL', 'CVD_BEAR_DIV', 'OBI_BUY', 'TOXIC_SELL'] }
        : { positive: ['LIQ_CASCADE_LONG', 'PRICE_DUMP', 'BITE_SELL', 'CVD_BEAR_DIV', 'OBI_BUY', 'TOXIC_SELL'], negative: ['LIQ_CASCADE_SHORT', 'PRICE_PUMP', 'BITE_BUY', 'CVD_BULL_DIV', 'OBI_SELL', 'TOXIC_BUY'] };
    case 'ABSORPTION_SETUP':
      return long
        ? { positive: ['LIQ_TRAP', 'LIQ_CLUSTER', 'OBI_ABSORPTION', 'BITE_BUY', 'FUND_LOW', 'TOXIC_BUY'], negative: ['PRICE_DUMP', 'BITE_SELL', 'OBI_SELL', 'TOXIC_SELL'] }
        : { positive: ['LIQ_TRAP', 'LIQ_CLUSTER', 'OBI_ABSORPTION', 'BITE_SELL', 'FUND_HIGH', 'TOXIC_SELL'], negative: ['PRICE_PUMP', 'BITE_BUY', 'OBI_BUY', 'TOXIC_BUY'] };
    case 'BREAKOUT_CONFIRMED':
    case 'MOMENTUM_SURGE':
      return long
        ? { positive: ['RANGE_BREAK_UP', 'VOL_SURGE', 'PRICE_PUMP', 'OBI_BUY', 'TOXIC_BUY', 'CVD_BULL_DIV'], negative: ['RANGE_BREAK_DOWN', 'PRICE_DUMP', 'OBI_SELL', 'TOXIC_SELL', 'CVD_BEAR_DIV'] }
        : { positive: ['RANGE_BREAK_DOWN', 'VOL_SURGE', 'PRICE_DUMP', 'OBI_SELL', 'TOXIC_SELL', 'CVD_BEAR_DIV'], negative: ['RANGE_BREAK_UP', 'PRICE_PUMP', 'OBI_BUY', 'TOXIC_BUY', 'CVD_BULL_DIV'] };
    case 'FLOW_REVERSAL_LONG':
      return { positive: ['FLOW_FLIP_BUY', 'VOL_SURGE', 'BITE_BUY', 'CVD_BULL_DIV', 'OBI_BUY', 'TOXIC_BUY'], negative: ['FLOW_FLIP_SELL', 'BITE_SELL', 'CVD_BEAR_DIV', 'OBI_SELL', 'TOXIC_SELL'] };
    case 'FLOW_REVERSAL_SHORT':
      return { positive: ['FLOW_FLIP_SELL', 'VOL_SURGE', 'BITE_SELL', 'CVD_BEAR_DIV', 'OBI_SELL', 'TOXIC_SELL'], negative: ['FLOW_FLIP_BUY', 'BITE_BUY', 'CVD_BULL_DIV', 'OBI_BUY', 'TOXIC_BUY'] };
    case 'FUND_SQUEEZE_LONG':
      return { positive: ['FUND_LOW', 'BITE_BUY', 'OBI_BUY', 'TOXIC_BUY', 'CVD_BULL_DIV'], negative: ['FUND_HIGH', 'BITE_SELL', 'OBI_SELL', 'TOXIC_SELL', 'CVD_BEAR_DIV'] };
    case 'FUND_SQUEEZE_SHORT':
      return { positive: ['FUND_HIGH', 'BITE_SELL', 'OBI_SELL', 'TOXIC_SELL', 'CVD_BEAR_DIV'], negative: ['FUND_LOW', 'BITE_BUY', 'OBI_BUY', 'TOXIC_BUY', 'CVD_BULL_DIV'] };
    case 'OI_CONFIRM_LONG':
      return { positive: ['OI_LONG', 'PRICE_PUMP', 'BITE_BUY', 'TOXIC_BUY', 'OBI_BUY'], negative: ['OI_SHORT', 'PRICE_DUMP', 'BITE_SELL', 'TOXIC_SELL', 'OBI_SELL'] };
    case 'OI_CONFIRM_SHORT':
      return { positive: ['OI_SHORT', 'PRICE_DUMP', 'BITE_SELL', 'TOXIC_SELL', 'OBI_SELL'], negative: ['OI_LONG', 'PRICE_PUMP', 'BITE_BUY', 'TOXIC_BUY', 'OBI_BUY'] };
    case 'OI_SQUEEZE':
      return { positive: ['OI_SQUEEZE', 'VOL_SURGE', 'OBI_ABSORPTION'], negative: direction === 'LONG' ? ['OBI_SELL'] : ['OBI_BUY'] };
  }
}

function evidenceWeight(keys: PerceptionKey[], perceptions: PerceptionMap): number {
  return keys.reduce((sum, key) => sum + power(perceptions, key) * (PERCEPTION_WEIGHTS[key] / 10), 0);
}

export interface ScoreResult {
  final: number;
  tier: SignalTier;
  filtered: boolean;
  bayesPosterior: number;
  bayesMultiplier: number;
  support: number;
  conflict: number;
  learnedWinRate: number | null;
  learnedSamples: number;
}

export function scoreCandidate(candidate: SignalCandidate, perceptions: PerceptionMap, memory: MemoryEntry | undefined, settings: AppSettings): ScoreResult {
  let base = candidate.perceptions.reduce((sum, perception) => sum + (PERCEPTION_WEIGHTS[perception.type] ?? 10) * perception.power, 0);
  base = Math.min(100, base * 1.3);
  let boost = 1;
  let filtered = false;
  const learnedSamples = memory?.samples ?? 0;
  const learnedWinRate = memory && memory.samples > 0 ? memory.wins / memory.samples : null;
  if (memory && memory.samples >= settings.minimumLearningSamples) {
    const averagePnl = memory.netPnl / memory.samples;
    const confidence = (learnedWinRate ?? 0) * Math.tanh(Math.abs(averagePnl) * 20);
    if (memory.samples >= ENGINE_CONFIG.learningFilterSamples && (learnedWinRate ?? 0) < ENGINE_CONFIG.learningFilterWinRate) filtered = true;
    if (confidence > ENGINE_CONFIG.learningBoostConfidence) boost = 1.2;
  }

  const profile = evidenceProfile(candidate.type, candidate.direction);
  const support = evidenceWeight(profile.positive, perceptions);
  const conflict = evidenceWeight(profile.negative, perceptions);
  const prior = clamp(0.5 + Math.tanh((candidate.rawStrength - 3.5) / 12) * 0.12, 0.25, 0.75);
  const positiveLikelihood = prior * (1 + support);
  const negativeLikelihood = (1 - prior) * (1 + conflict * 1.15);
  const bayesPosterior = positiveLikelihood / (positiveLikelihood + negativeLikelihood + Number.EPSILON);
  const bayesMultiplier = 0.7 + bayesPosterior * 0.8;
  if (memory && memory.samples >= settings.minimumLearningSamples && conflict > support * 2.2) filtered = true;
  const evidenceCount = candidate.perceptions.length;
  const categoryCount = new Set(candidate.perceptions.map((item) => item.category)).size;
  const diversityCap = evidenceCount <= 1 ? 59 : categoryCount <= 1 ? 74 : evidenceCount === 2 ? 79 : 100;
  const final = Math.min(diversityCap, 100, Math.round(base * boost * bayesMultiplier));
  const tier: SignalTier = final >= 80 ? 'S' : final >= 60 ? 'A' : final >= 40 ? 'B' : 'C';
  return { final, tier, filtered, bayesPosterior, bayesMultiplier, support, conflict, learnedWinRate, learnedSamples };
}

export function regimeAllowsSignal(regime: Regime, type: SignalType): boolean {
  if (regime === 'TREND_UP' || regime === 'TREND_DOWN') return !type.includes('REVERSAL') && !type.startsWith('FUND_SQUEEZE');
  if (regime === 'RANGE') return type !== 'BREAKOUT_CONFIRMED' && type !== 'MOMENTUM_SURGE';
  if (regime === 'LOW_VOL') return type.startsWith('OI_') || type.startsWith('FUND_') || type.includes('FLOW');
  return true;
}

export function signalFamily(type: SignalType): SignalFamily {
  return type.split('_')[0] as SignalFamily;
}

export function primaryVerifySeconds(type: SignalType, settings: AppSettings): number {
  if (!settings.adaptiveVerifyHorizon) return settings.fallbackVerifyMinutes * 60;
  switch (type) {
    case 'MOMENTUM_SURGE':
    case 'FLOW_REVERSAL_LONG':
    case 'FLOW_REVERSAL_SHORT': return 30;
    case 'FUND_SQUEEZE_LONG':
    case 'FUND_SQUEEZE_SHORT': return 600;
    case 'ABSORPTION_SETUP':
    case 'OI_SQUEEZE': return 300;
    default: return 60;
  }
}

export function calculateKellyFraction(probability: number, riskReward: number): number {
  if (!Number.isFinite(probability) || !Number.isFinite(riskReward) || riskReward <= 0) return 0;
  return (probability * riskReward - (1 - probability)) / riskReward;
}

export function calibratedProbability(score: number, memory?: MemoryEntry): number {
  const scoreProbability = clamp(0.5 + (score - 50) * 0.006, 0.2, 0.8);
  if (!memory || memory.samples <= 0) return scoreProbability;
  const betaPosterior = (memory.wins + 2) / (memory.samples + 4);
  const learnedWeight = clamp(memory.samples / 30, 0, 0.75);
  return clamp(scoreProbability * (1 - learnedWeight) + betaPosterior * learnedWeight, 0.05, 0.95);
}

export function buildTradePlan(state: MarketState, candidate: SignalCandidate, score: number, probability: number, settings: AppSettings, now = Date.now()): TradePlan {
  const strategyRisk = candidate.type.includes('MOMENTUM') ? 0.004 : candidate.type.includes('CASCADE') ? 0.006 : candidate.type.includes('FUND') ? 0.008 : 0.005;
  const volatilityRisk = calculateAtrPercent(state, now) * 2.5;
  const riskPercent = clamp(Math.max(strategyRisk, volatilityRisk), strategyRisk * 0.75, 0.02);
  const riskReward = score >= 80 ? 2.2 : score >= 65 ? 1.8 : 1.4;
  const riskPerUnit = state.price * riskPercent;
  const invalidation = candidate.direction === 'LONG' ? state.price - riskPerUnit : state.price + riskPerUnit;
  const takeProfit1 = candidate.direction === 'LONG' ? state.price + riskPerUnit * riskReward : state.price - riskPerUnit * riskReward;
  const takeProfit2 = candidate.direction === 'LONG' ? state.price + riskPerUnit * riskReward * 1.8 : state.price - riskPerUnit * riskReward * 1.8;
  const kellyFraction = Math.max(0, calculateKellyFraction(probability, riskReward));
  const suggestedPositionFraction = Math.min(kellyFraction * 0.25, settings.maxPositionPercent / 100);
  return { entry: state.price, invalidation, takeProfit1, takeProfit2, riskPerUnit, riskReward, estimatedProbability: probability, kellyFraction, suggestedPositionFraction };
}

export interface GenerateSignalInput {
  state: MarketState;
  perceptions: PerceptionMap;
  settings: AppSettings;
  memory: Record<string, MemoryEntry>;
  now?: number;
}

export function generateSignal(input: GenerateSignalInput): Signal | null {
  const { state, perceptions, settings, memory } = input;
  const now = input.now ?? Date.now();
  if (now < state.cooldownUntil || state.price <= 0) return null;
  const candidates = buildSignalCandidates(perceptions).sort((a, b) => b.rawStrength - a.rawStrength);
  const candidate = candidates[0];
  if (!candidate || !regimeAllowsSignal(state.regime, candidate.type)) return null;

  const toxic = toxicFlowFromTrades(state.tradeHistory, now);
  if (toxic && toxic.side !== 'NEUTRAL') {
    const aligned = (toxic.side === 'BUY' && candidate.direction === 'LONG') || (toxic.side === 'SELL' && candidate.direction === 'SHORT');
    if (aligned) candidate.rawStrength *= 1.08;
    else if (candidate.rawStrength < 3.5) return null;
  }

  const memoryKey = `${state.symbol}:${candidate.type}`;
  const learned = memory[memoryKey];
  const scored = scoreCandidate(candidate, perceptions, learned, settings);
  if (scored.final < settings.minSignalScore || scored.filtered || !settings.signalTiers.includes(scored.tier)) return null;
  const family = signalFamily(candidate.type);
  if (!settings.signalFamilies.includes(family)) return null;

  const estimatedProbability = calibratedProbability(scored.final, learned);
  const plan = buildTradePlan(state, candidate, scored.final, estimatedProbability, settings, now);
  if (plan.kellyFraction <= 0 || plan.suggestedPositionFraction <= 0) return null;
  const ttlMs = ENGINE_CONFIG.ttlMs[candidate.type];
  const entryMid = state.bid > 0 && state.ask > 0 ? (state.bid + state.ask) / 2 : state.price;
  const patternId = [...new Set(candidate.perceptions.map((perception) => perception.type))].sort().join('+');

  return {
    id: `${state.symbol}_${candidate.type}_${now}`,
    symbol: state.symbol,
    direction: candidate.direction,
    type: candidate.type,
    family,
    perceptions: candidate.perceptions,
    reason: candidate.reason,
    score: scored.final,
    tier: scored.tier,
    rawStrength: candidate.rawStrength,
    price: state.price,
    entryMid,
    createdAt: now,
    expiresAt: now + ttlMs,
    ttlMs,
    patternId,
    learnedWinRate: scored.learnedWinRate,
    learnedSamples: scored.learnedSamples,
    regime: state.regime,
    obi: state.obi,
    cvd: state.cvd,
    toxicFlow: toxic?.side ?? 'NEUTRAL',
    bayesPosterior: scored.bayesPosterior,
    bayesMultiplier: scored.bayesMultiplier,
    estimatedProbability,
    plan,
  };
}
