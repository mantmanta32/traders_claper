import { useSyncExternalStore } from 'react';
import type { EngineSnapshot } from '../types/snapshot';
import { MarketEngine } from '../engine/MarketEngine';

export function useEngine(engine: MarketEngine): EngineSnapshot {
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
}
