import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../src/App';
import { DEFAULT_SETTINGS } from '../src/config';
import { MarketEngine } from '../src/engine/MarketEngine';

function createEngine() {
  return new MarketEngine({ settings: { ...DEFAULT_SETTINGS }, learning: { memory: {}, patterns: {}, verificationQueue: [], verificationHistory: [] }, signalHistory: [] });
}

describe('React application shell', () => {
  it('renders navigation and switches between primary pages', () => {
    const engine = createEngine();
    render(<App engine={engine} autoStart={false} />);
    expect(screen.getByText('ERKEN UYARI')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Sinyaller/i })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: /Tarayıcı/i }));
    expect(screen.getByPlaceholderText(/Coin ara/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Analitik/i }));
    expect(screen.getByText('Toplam Sinyal')).toBeInTheDocument();
  });

  it('opens settings, applies theme, and toggles pause', () => {
    const engine = createEngine();
    render(<App engine={engine} autoStart={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ayarlar' }));
    expect(screen.getByRole('dialog', { name: 'Ayarlar' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Tema/ }));
    fireEvent.click(screen.getByRole('button', { name: /Dark/ }));
    fireEvent.click(screen.getByRole('button', { name: /Kaydet/ }));
    expect(engine.getSettings().theme).toBe('dark');
    fireEvent.click(screen.getByRole('button', { name: /Duraklat/ }));
    expect(engine.getSnapshot().paused).toBe(true);
    expect(screen.getByRole('button', { name: /Devam/ })).toBeInTheDocument();
  });
});
