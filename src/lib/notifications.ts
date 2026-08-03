import type { Signal } from '../types/market';
import type { AppSettings } from '../types/settings';
import { binanceFuturesUrl, tradingViewUrl } from './links';

let audioContext: AudioContext | null = null;

function beep(frequency: number, durationMs: number, volume: number): void {
  if (typeof window === 'undefined') return;
  try {
    audioContext ??= new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';
    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + durationMs / 1_000);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + durationMs / 1_000);
  } catch {
    // Browser autoplay policy can reject audio before a user gesture.
  }
}

export function unlockAudio(): void {
  try { void audioContext?.resume(); } catch { /* no-op */ }
}

export function notifySignal(signal: Signal, settings: AppSettings, soundEnabled: boolean): void {
  if (soundEnabled && settings.toastSound) {
    if (signal.tier === 'S') {
      beep(880, 120, 0.35);
      setTimeout(() => beep(1_100, 120, 0.35), 140);
      setTimeout(() => beep(880, 200, 0.3), 280);
    } else if (signal.tier === 'A') {
      beep(660, 100, 0.25);
      setTimeout(() => beep(880, 150, 0.25), 120);
    } else beep(440, 80, 0.18);
  }
  if (soundEnabled && settings.ttsEnabled && signal.tier === 'S' && typeof speechSynthesis !== 'undefined') {
    try {
      const utterance = new SpeechSynthesisUtterance(`${signal.symbol.replace('USDT', '')} ${signal.direction === 'LONG' ? 'Al' : 'Sat'} sinyali, skor ${signal.score}`);
      utterance.lang = 'tr-TR';
      utterance.rate = 1.1;
      utterance.volume = 0.8;
      speechSynthesis.speak(utterance);
    } catch { /* no-op */ }
  }
  if (settings.vibrate && typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(60);
  if (settings.autoOpenTradingView) window.open(tradingViewUrl(signal.symbol), '_blank', 'noopener,noreferrer');
  if (settings.autoOpenBinance) window.open(binanceFuturesUrl(signal.symbol), '_blank', 'noopener,noreferrer');
}
