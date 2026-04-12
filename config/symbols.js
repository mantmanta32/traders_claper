// Sample configuration for SYMBOL_META and core market data
const SYMBOL_META = {
    'AAPL': { name: 'Apple Inc.', sector: 'Technology' },
    'GOOGL': { name: 'Alphabet Inc.', sector: 'Communication Services' },
    'AMZN': { name: 'Amazon.com Inc.', sector: 'Consumer Discretionary' }
};

const CORE_MARKET_DATA = {
    'AAPL': { price: 175.64, volume: 12000000 },
    'GOOGL': { price: 2754.01, volume: 1000000 },
    'AMZN': { price: 3345.33, volume: 1500000 }
};

module.exports = { SYMBOL_META, CORE_MARKET_DATA };