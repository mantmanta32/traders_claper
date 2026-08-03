import { ENGINE_CONFIG } from '../config';
import { loadLearning, saveLearning } from '../lib/storage';
import type {
  Direction,
  HorizonStats,
  MemoryEntry,
  PatternEntry,
  Signal,
  VerificationItem,
  VerificationRecord,
} from '../types/market';
import type { AppSettings } from '../types/settings';
import { primaryVerifySeconds } from './strategy';

export interface LearningData {
  memory: Record<string, MemoryEntry>;
  patterns: Record<string, PatternEntry>;
  verificationQueue: VerificationItem[];
  verificationHistory: VerificationRecord[];
}

function emptyHorizon(): HorizonStats {
  return { samples: 0, wins: 0, netPnl: 0 };
}

function emptyMemory(): MemoryEntry {
  return { samples: 0, wins: 0, netPnl: 0, horizons: {}, lastUpdatedAt: 0 };
}

function emptyPattern(patternId: string, direction: Direction): PatternEntry {
  return { patternId, samples: 0, wins: 0, losses: 0, signals: 0, direction, horizons: {}, lastUpdatedAt: 0 };
}

export class LearningEngine {
  readonly memory: Record<string, MemoryEntry>;
  readonly patterns: Record<string, PatternEntry>;
  readonly verificationQueue: VerificationItem[];
  readonly verificationHistory: VerificationRecord[];

  constructor(initial?: Partial<LearningData>) {
    const loaded = initial ?? loadLearning();
    this.memory = loaded.memory ?? {};
    this.patterns = loaded.patterns ?? {};
    this.verificationQueue = loaded.verificationQueue ?? [];
    this.verificationHistory = loaded.verificationHistory ?? [];
  }

  registerSignal(signal: Signal, settings: AppSettings): void {
    if (!settings.learningEnabled) return;
    const pattern = this.patterns[signal.patternId] ?? emptyPattern(signal.patternId, signal.direction);
    pattern.signals += 1;
    pattern.lastUpdatedAt = signal.createdAt;
    this.patterns[signal.patternId] = pattern;
    if (settings.autoVerify && !this.verificationQueue.some((item) => item.signalId === signal.id)) {
      const horizonSeconds = primaryVerifySeconds(signal.type, settings);
      this.verificationQueue.push({
        id: `verify:${signal.id}:${horizonSeconds}`,
        signalId: signal.id,
        memoryKey: `${signal.symbol}:${signal.type}`,
        patternId: signal.patternId,
        symbol: signal.symbol,
        direction: signal.direction,
        entryMid: signal.entryMid,
        signalAt: signal.createdAt,
        checkAt: signal.createdAt + horizonSeconds * 1_000,
        horizonSeconds,
        attempts: 0,
      });
    }
    this.persist();
  }

  verifyDue(getPrice: (symbol: string) => number | undefined, settings: AppSettings, now = Date.now()): VerificationRecord[] {
    const records: VerificationRecord[] = [];
    for (let index = this.verificationQueue.length - 1; index >= 0; index -= 1) {
      const item = this.verificationQueue[index];
      if (item.checkAt > now) continue;
      const exit = getPrice(item.symbol) ?? 0;
      if (!Number.isFinite(exit) || exit <= 0 || item.entryMid <= 0) {
        item.attempts += 1;
        if (item.attempts >= 12 || now - item.checkAt > 5 * 60_000) this.verificationQueue.splice(index, 1);
        else item.checkAt = now + 5_000;
        continue;
      }
      const rawReturn = (exit - item.entryMid) / item.entryMid;
      const grossPnl = item.direction === 'LONG' ? rawReturn : -rawReturn;
      const netPnl = grossPnl - settings.roundTripCostBps / 10_000;
      const record: VerificationRecord = {
        id: item.id,
        signalId: item.signalId,
        symbol: item.symbol,
        direction: item.direction,
        entry: item.entryMid,
        exit,
        grossPnl,
        netPnl,
        win: netPnl > 0,
        horizonSeconds: item.horizonSeconds,
        verifiedAt: now,
      };
      this.applyRecord(item, record);
      this.verificationQueue.splice(index, 1);
      this.verificationHistory.unshift(record);
      records.push(record);
    }
    if (this.verificationHistory.length > ENGINE_CONFIG.maxVerificationHistory) {
      this.verificationHistory.length = ENGINE_CONFIG.maxVerificationHistory;
    }
    if (records.length) this.persist();
    return records;
  }

  private applyRecord(item: VerificationItem, record: VerificationRecord): void {
    const memory = this.memory[item.memoryKey] ?? emptyMemory();
    memory.samples += 1;
    if (record.win) memory.wins += 1;
    memory.netPnl += record.netPnl;
    memory.lastUpdatedAt = record.verifiedAt;
    const memoryHorizon = memory.horizons[String(item.horizonSeconds)] ?? emptyHorizon();
    memoryHorizon.samples += 1;
    if (record.win) memoryHorizon.wins += 1;
    memoryHorizon.netPnl += record.netPnl;
    memory.horizons[String(item.horizonSeconds)] = memoryHorizon;
    this.memory[item.memoryKey] = memory;

    if (item.patternId) {
      const pattern = this.patterns[item.patternId] ?? emptyPattern(item.patternId, item.direction);
      pattern.samples += 1;
      if (record.win) pattern.wins += 1;
      else pattern.losses += 1;
      pattern.lastUpdatedAt = record.verifiedAt;
      const patternHorizon = pattern.horizons[String(item.horizonSeconds)] ?? emptyHorizon();
      patternHorizon.samples += 1;
      if (record.win) patternHorizon.wins += 1;
      patternHorizon.netPnl += record.netPnl;
      pattern.horizons[String(item.horizonSeconds)] = patternHorizon;
      this.patterns[item.patternId] = pattern;
    }
  }

  reset(): void {
    Object.keys(this.memory).forEach((key) => delete this.memory[key]);
    Object.keys(this.patterns).forEach((key) => delete this.patterns[key]);
    this.verificationQueue.length = 0;
    this.verificationHistory.length = 0;
    this.persist();
  }

  replace(data: Partial<LearningData>): void {
    this.reset();
    Object.assign(this.memory, data.memory ?? {});
    Object.assign(this.patterns, data.patterns ?? {});
    this.verificationQueue.push(...(data.verificationQueue ?? []));
    this.verificationHistory.push(...(data.verificationHistory ?? []));
    this.persist();
  }

  snapshot(): LearningData {
    return {
      memory: this.memory,
      patterns: this.patterns,
      verificationQueue: this.verificationQueue,
      verificationHistory: this.verificationHistory,
    };
  }

  persist(): void {
    saveLearning({
      memory: this.memory,
      patterns: this.patterns,
      verificationQueue: this.verificationQueue,
      verificationHistory: this.verificationHistory,
    });
  }
}

export function horizonSummary(entry: Pick<MemoryEntry, 'horizons'> | Pick<PatternEntry, 'horizons'>): string {
  return [30, 60, 300, 600]
    .flatMap((seconds) => {
      const bucket = entry.horizons[String(seconds)];
      if (!bucket?.samples) return [];
      return [`${seconds}s %${Math.round((bucket.wins / bucket.samples) * 100)} (${bucket.samples})`];
    })
    .join(' · ');
}
