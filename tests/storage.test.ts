import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/config';
import { loadSettings, normalizeSettings, saveSettings } from '../src/lib/storage';

describe('settings persistence and validation', () => {
  beforeEach(() => localStorage.clear());

  it('clamps unsafe or impossible numeric settings', () => {
    const settings = normalizeSettings({ minSignalScore: -5, maxPositionPercent: 100, roundTripCostBps: -1, fundingThresholdPercent: 9 });
    expect(settings.minSignalScore).toBe(20);
    expect(settings.maxPositionPercent).toBe(25);
    expect(settings.roundTripCostBps).toBe(0);
    expect(settings.fundingThresholdPercent).toBe(0.1);
  });

  it('round-trips current settings', () => {
    saveSettings({ ...DEFAULT_SETTINGS, theme: 'dark', minSignalScore: 64 });
    expect(loadSettings()).toMatchObject({ theme: 'dark', minSignalScore: 64 });
  });

  it('migrates legacy v2 setting names', () => {
    localStorage.setItem('ews2_settings', JSON.stringify({ minScore: 73, liqWhale: 900000, signalTypes: ['WHALE', 'OI'], wsReconnect: false }));
    expect(loadSettings()).toMatchObject({ minSignalScore: 73, whaleBaseUsd: 900000, signalFamilies: ['WHALE', 'OI'], autoReconnect: false });
  });
});
