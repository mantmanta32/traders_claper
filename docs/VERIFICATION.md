# EWS v3 Doğrulama Raporu

**Tarih:** 2026-08-03  
**Ortam:** Node.js 20.20.2, Chromium 151 (Playwright), Vite 8, TypeScript 7

## 1. Statik ve otomatik testler

```bash
npm run typecheck
npm test
npm run test:coverage
npm run build
npm run test:e2e
```

Sonuçlar:

| Kontrol | Sonuç |
|---|---:|
| TypeScript strict typecheck | PASS |
| Test dosyası | 9/9 PASS |
| Unit/component testi | 59/59 PASS |
| Chromium masaüstü E2E | PASS |
| Chromium mobil E2E | PASS |
| Production build | PASS |
| npm audit | 0 vulnerability |

Coverage için zorunlu alt sınırlar:

- Statements: %70
- Branches: %60
- Functions: %70
- Lines: %75

Ölçülen son core kapsamı yaklaşık %82 line coverage'dır. Kapsama engine, parser ve yardımcı katmanlar dahildir.

## 2. Canlı veri testi

```bash
npm run test:live
```

Test doğrudan üretim endpoint'lerine bağlanır ve gelen payload'ı uygulamanın gerçek parser'ından geçirir.

| Kaynak | Sonuç | Not |
|---|---|---|
| Binance `/market` combined | PASS | Canlı miniTicker/markPrice array alındı ve parse edildi |
| Binance `/public` bookTicker | PASS | Canlı sembol, bid, ask ve miktar alındı |
| Binance `/market/ws` dynamic aggTrade | PASS | `btcusdt@aggTrade` JSON SUBSCRIBE çalıştı |
| Binance REST exchangeInfo | SKIP | Bu test ağında HTTP 451 bölgesel uygunluk yanıtı |
| Binance REST openInterest | SKIP | Bu test ağında HTTP 451 bölgesel uygunluk yanıtı |
| CoinGlass live | SKIP | API anahtarı verilmedi |

Uygulamanın REST 451 durumundaki davranışı ayrıca Chromium E2E ile doğrulandı: miniTicker akışı sembolleri otomatik yaratıyor, scanner doluyor ve market/public feed göstergeleri canlı oluyor. OI alanı REST erişimi gelene kadar boş kalıyor.

## 3. Test edilen veri kuralları

### Binance parser

- Combined stream wrapper (`{ stream, data }`)
- `24hrMiniTicker` array
- `markPriceUpdate` array
- `bookTicker`
- `forceOrder`
- `aggTrade`
- Subscription ACK
- Sayısal alan ve negatif değer doğrulaması
- Long liquidation = `SELL`, short liquidation = `BUY`

### CoinGlass parser

- Güncel `liquidationOrders` şeması
- Eski `liq` şeması migrasyonu
- `side=1` long liquidation, `side=2` short liquidation
- Borsa/simge normalizasyonu
- Geçersiz sembol ve kanal reddi

### Strateji/engine

- Adaptif whale eşiği
- Long/short cascade
- Gerçek önceki-range breakout
- Rolling volume surge
- Rolling aggTrade bite ve toxic flow
- CVD bull/bear divergence
- OI snapshot fiyat yönü
- Funding ayar eşiği
- Regime gate
- Bayes destek/çatışma hesabı
- Kanıt çeşitliliği confidence cap
- Kelly ve pozisyon üst sınırı
- Fee sonrası long/short doğrulama
- Verification retry
- Rolling 1 saatlik liquidation metrikleri
- Çift kaynak liquidation deduplication
- Whitelist ve strateji filtresi
- v2 ayar migrasyonu

## 4. E2E senaryoları

Masaüstü Chromium testi:

1. React uygulamasını açar.
2. Market ve Public WebSocket feed'lerinin `live` olmasını bekler.
3. WS fallback ile sembol sayısının sıfırdan büyük olduğunu doğrular.
4. Scanner'a geçer ve 20'den fazla kart geldiğini kontrol eder.
5. BTCUSDT aramasını doğrular.
6. Settings drawer'ı açar.
7. Dark tema kaydedilir ve `data-theme=dark` doğrulanır.
8. Unhandled page error olmadığını doğrular.

Mobil Chromium testi:

1. 390×844 viewport açar.
2. Alt navigasyonun görünür olduğunu doğrular.
3. Scanner ve Analytics sekmelerine geçer.
4. Ana içeriklerin görünür kaldığını doğrular.

Görsel çıktı: [`../artifacts/ews-v3-desktop.png`](../artifacts/ews-v3-desktop.png)

## 5. Bilinen çevresel sınırlar

- HTTP 451 bir parser veya uygulama hatası değildir; Binance'ın isteği alan IP için uygunluk kararıdır.
- Bölgesel kısıtı aşan proxy kodu eklenmemiştir. Uygulama bunun yerine yasal olarak erişilebilir WS kanallarında degrade olur.
- CoinGlass anahtarı olmadan canlı çoklu borsa testi yapılamaz. Anahtar istemciye gömülmemelidir; production proxy önerilir.
- Likidasyon olayı deterministik aralıklarla gelmediği için canlı test WS bağlantısı ve market payload'larını doğrular; `forceOrder` parser'ı fixture/unit test ile deterministik doğrulanır.
