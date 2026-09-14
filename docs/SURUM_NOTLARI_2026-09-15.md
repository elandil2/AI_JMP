# 15 Eylül 2026 — Rota şeması ve Türkçe teslim

## Kullanıcıya yansıyan son değişiklik

`d80e271` yalnız rota şemasının görünümünü yeniler: numaralı, üç sütunlu kıvrımlı masaüstü akışı; dar ekranda dikey sıra; uzun isimlerin sarılması; fazla duraklarda yeni satırlar.

Rapor kaynakları ve diğer onaylı tasarım alanları korunmuştur. Model, hesaplama, API ve veritabanı görsel değişiklikte değiştirilmemiştir.

## Son canlı kontrol

Gemini 2.5 Flash ile İstanbul/Ataşehir → Van/Erciş için bir rapor oluşturuldu: 1.484 km, 12 aşama, Maps otomobil süresi 16 sa 40 dk; molalı kamyon planlama tahmini 48 sa 59 dk. Şema üretimde aynı kayıt üzerinde doğrulandı; ikinci rapor üretilmedi.

Bu, tek rota smoke testidir. Tüm konumlar, bütün hava/risk iddiaları, tıra özel yol uygunluğu veya 10+10 model karşılaştırması doğrulandı anlamına gelmez.

## Teslim dokümantasyonu

- Türkçe README, günlük kullanım kılavuzu, örnek CSV ve teknik devir rehberi.
- Boş `.env` dosyasının Git takibinden çıkarılması; yerel dosya korunur.
- Ortam dosyalarının yanlışlıkla eklenmesini önleyen ignore kuralları.
- Maps anahtar adının yalnız örnek değerle `.env.example` içine eklenmesi.
- Gerçek sırlar, veri dökümleri ve yerel QA çıktıları olmadan kaynak paketleme.

Bu dokümantasyon teslimi yeni ücretli rapor, DB migration'ı veya canlı ayar değişikliği içermez.

## Doğrulama sınırları

Rota şeması sürümünde 24 test, typecheck ve production build geçti. 320/768/1184 piksel yerel görsel kontrollerde 12 duraklı şema yatay taşma üretmedi. Bağımsız incelemede doğrulanmış yayın engeli bulunmadı.

Lint ilk yapılandırma gerektirdiği için geçmiş sayılmıyor. Bütün baskı sayfaları, izole veritabanına restore, kapsamlı güvenlik düzeltmeleri ve 3.8 erişimi doğrulanmadı. Bu teslim yeni UI değişikliği yapmaz.
