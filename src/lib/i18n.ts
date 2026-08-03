export type TranslationKey =
  | 'signals' | 'scanner' | 'analytics' | 'pause' | 'resume' | 'settings'
  | 'activeSymbols' | 'signalsHour' | 'successRate' | 'liqVolume' | 'uptime' | 'feedStatus'
  | 'direction' | 'all' | 'buy' | 'sell' | 'tier' | 'noSignals' | 'marketWatching'
  | 'recentLiquidations' | 'patternMemory' | 'searchCoin' | 'hot' | 'whale' | 'funding'
  | 'totalSignals' | 'learnedPatterns' | 'verifiedTrades' | 'pendingVerification' | 'generalWr'
  | 'totalNetPnl' | 'trackedCoins' | 'signalHistory' | 'learningPerformance';

const translations: Record<'tr' | 'en', Record<TranslationKey, string>> = {
  tr: {
    signals: 'Sinyaller', scanner: 'Tarayıcı', analytics: 'Analitik', pause: 'Duraklat', resume: 'Devam', settings: 'Ayarlar',
    activeSymbols: 'Aktif Sembol', signalsHour: 'Son 1sa Sinyal', successRate: 'Başarı', liqVolume: 'Liq Hacmi', uptime: 'Uptime', feedStatus: 'Veri Akışları',
    direction: 'Yön', all: 'Tümü', buy: 'AL', sell: 'SAT', tier: 'Tier', noSignals: 'Sinyal yok', marketWatching: 'Piyasa ve mikroyapı akışı izleniyor',
    recentLiquidations: 'Son Likidasyonlar', patternMemory: 'Pattern Hafızası', searchCoin: 'Coin ara…', hot: 'Aktif', whale: 'Whale Liq', funding: 'Aşırı Funding',
    totalSignals: 'Toplam Sinyal', learnedPatterns: 'Öğrenilen Pattern', verifiedTrades: 'Doğrulanan İşlem', pendingVerification: 'Bekleyen Doğrulama', generalWr: 'Genel WR',
    totalNetPnl: 'Toplam Net PnL', trackedCoins: 'İzlenen Coin', signalHistory: 'Sinyal Geçmişi', learningPerformance: 'Öğrenilen Pattern Performansı',
  },
  en: {
    signals: 'Signals', scanner: 'Scanner', analytics: 'Analytics', pause: 'Pause', resume: 'Resume', settings: 'Settings',
    activeSymbols: 'Active Symbols', signalsHour: 'Signals · 1h', successRate: 'Win Rate', liqVolume: 'Liq Volume', uptime: 'Uptime', feedStatus: 'Data Feeds',
    direction: 'Direction', all: 'All', buy: 'BUY', sell: 'SELL', tier: 'Tier', noSignals: 'No signals', marketWatching: 'Market and microstructure feeds are being monitored',
    recentLiquidations: 'Recent Liquidations', patternMemory: 'Pattern Memory', searchCoin: 'Search coin…', hot: 'Hot', whale: 'Whale Liq', funding: 'Extreme Funding',
    totalSignals: 'Total Signals', learnedPatterns: 'Learned Patterns', verifiedTrades: 'Verified Trades', pendingVerification: 'Pending Verification', generalWr: 'Overall WR',
    totalNetPnl: 'Total Net PnL', trackedCoins: 'Tracked Coins', signalHistory: 'Signal History', learningPerformance: 'Learned Pattern Performance',
  },
};

export function translator(language: 'tr' | 'en'): (key: TranslationKey) => string {
  return (key) => translations[language][key];
}
