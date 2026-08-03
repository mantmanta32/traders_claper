import type {
  EngineMetrics,
  FeedStatus,
  LiquidationEvent,
  MemoryEntry,
  PatternEntry,
  Signal,
  SymbolSnapshot,
  VerificationItem,
  VerificationRecord,
} from './market';
import type { AppSettings } from './settings';

export interface EngineSnapshot {
  revision: number;
  startedAt: number;
  now: number;
  paused: boolean;
  soundEnabled: boolean;
  settings: AppSettings;
  feeds: FeedStatus[];
  metrics: EngineMetrics;
  activeSignals: Signal[];
  signalHistory: Signal[];
  recentLiquidations: LiquidationEvent[];
  symbols: SymbolSnapshot[];
  memory: Record<string, MemoryEntry>;
  patterns: Record<string, PatternEntry>;
  verificationQueue: VerificationItem[];
  verificationHistory: VerificationRecord[];
}
