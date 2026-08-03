# Changelog

## 3.0.0 — 2026-08-03

- React 19, Vite ve TypeScript ile tam yeniden yazım.
- 2026 Binance `/market` ve `/public` WebSocket ayrımına geçiş.
- Modüler market engine, parser, reconnect, strategy ve learning katmanları.
- Eski stratejiler korundu; whale/cascade yön simetrisi eklendi.
- Rolling flow, liquidation, CVD ve OI snapshot hesapları.
- Kanıt çeşitliliği confidence cap ve kalibre edilmiş quarter-Kelly.
- CoinGlass authenticated adapter.
- Candy/dark/auto tema ve responsive React arayüzü.
- v2 localStorage migrasyonu ve JSON backup.
- 59 unit/component testi, 2 Chromium E2E ve canlı WS entegrasyon testi.
- Orijinal uygulama `legacy/index.html` altında korundu.
