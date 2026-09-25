# AI_JMP — Rota Analizi ve Yolculuk Raporları

Lojistik operasyonlarında yolculuk öncesi hazırlığı destekleyen web uygulaması. Başlangıç ve varış noktalarından Google Maps rota bilgisi, Gemini destekli risk/hava değerlendirmesi ve paylaşılabilir bir yolculuk raporu üretir.

**Önemli:** Uygulama tıra özel navigasyon veya yol uygunluğu onayı değildir. Maps otomobil rotasını, tahmini kamyon sürüş süresini ve mola dahil planlama süresini ayrı gösterir. Araç yüksekliği, ağırlığı, yük türü ve geçiş kısıtlarının uygunluğunu garanti etmez.

## Nereden başlamalıyım?

- **Kullanıcı / operatör:** [Türkçe kullanım kılavuzu](docs/KULLANIM_KILAVUZU_TR.md)
- **Teknik ekip:** [Kurulum ve devir rehberi](docs/KURULUM_VE_DEVIR_TR.md)
- **Bu teslimde neler var?** [15 Eylül 2026 sürüm notu](docs/SURUM_NOTLARI_2026-09-15.md)
- **Canlı uygulama:** [AI_JMP](https://jmpai-snowy.vercel.app)

## Başlıca özellikler

- Hesapla giriş ve raporların listelendiği kontrol paneli.
- İl/ilçe, kalkış zamanı ve ücretli yol tercihiyle tek rapor oluşturma.
- Mesafe, Maps otomobil süresi, tahmini kamyon sürüşü ve dinlenme sürelerinin ayrıştırılması.
- Numaralı rota şeması: geniş ekranda üç sütunlu kıvrımlı akış, dar ekranda dikey sıralama.
- Maps adımlarından hesaplanan rota ara noktaları ve teyit edilmemiş mola planlama noktaları.
- Rota boyunca hava tahmini; sağlayıcı arama kaydı yoksa sonuç açıkça AI tahmini olarak işaretlenir.
- Kaynaklı rota koridoru olay adayları, 100 km başına aday yoğunluğu ve resmî kontrol bağlantıları.
- Paylaşım bağlantısı, WhatsApp paylaşımı, navigasyon bağlantısı ve yazdırma/PDF.
- Seçilen raporların listesini CSV olarak dışa aktarma.
- En fazla 20 farklı rotalık CSV kuyruğu; her satırı operatörün tek tek başlatması.

Normal kullanımın varsayılan modeli **Gemini 3.7 Flash**. 2.5 ve 3.8 yönetici karşılaştırması için korunur. 25 Eylül 2026'da Menemen → Arguvan üzerinde 3.7 ve 3.8 sağlayıcı denemeleri yapıldı; model yükseltmesi tek başına kaynak doğruluğunu sağlamadı.

`MAPBOX_TOKEN` varsa Mapbox olayları kontrol edilir. `TOMTOM_API_KEY` varsa Türkiye kapsaması belgelenmiş TomTom kaza, şerit/yol kapanması ve yol çalışması adayları ayrıca sorgulanır; anahtar yoksa bu kaynak kapsamı mevcut sayılmaz. Her iki sağlayıcının Google rotasına yakın olayları yalnızca **koridor adayıdır**; aynı yol ve yön teyidi değildir. KGM sayfalarının ticari otomatik kullanımı için ayrıca kullanım hakkı gerekir; `KGM_COMMERCIAL_DATA_PERMISSION=yes` olmadan modelin KGM araştırma aşaması çalışmaz ve bağlantıları manuel kontrol içindir. Google Weather API adaptörü hazırlanmıştır, ancak mevcut proje anahtarı 403 döndürdüğü ve saatlik tahminlerin saklama sınırı bulunduğu için kalıcı rapora bağlanmamıştır.

## Teknik özet

Next.js 15, React 19, TypeScript, Supabase Auth/veritabanı ve Google Gemini (`@google/genai`). Kesin bağımlılık çözümlemesi `package-lock.json` içindedir.

Mevcut ve uyumlu bir Supabase ortamı ile geçerli servis anahtarları hazırsa:

```bash
npm ci
npm run dev
```

Önce [.env.example](.env.example) dosyasını yerelde `.env.local` adıyla kopyalayıp kendi değerlerinizi girin. Ardından `http://localhost:3000` adresini açın. Bu komutlar veritabanını oluşturmaz. Sıfırdan kurulum öncesinde [devir ön koşullarını](docs/KURULUM_VE_DEVIR_TR.md) okuyun.

Kontroller:

```bash
npm test
npm run typecheck
npm run build
npm run start
```

`npm run start`, başarılı build sonrasında kullanılır. ESLint 9 yapılandırması henüz eklenmediği için bağımsız lint kontrolü geçmiş sayılmamalıdır.

## Yayın ve teslim durumu

GitHub deposu `elandil2/AI_JMP`, Vercel projesi `jmp__ai`; üretim dalı `main`.

15 Eylül 2026 tarihinde Ataşehir → Van/Erciş için tek canlı Gemini 2.5 Flash raporu başarıyla oluşturuldu ve 12 duraklı yeni şema doğrulandı. Bu sonuç tüm rotaların, hesapların, tahminlerin veya güvenlik kontrollerinin eksiksiz doğrulandığı anlamına gelmez.

25 Eylül 2026 yerel dalında Menemen → Arguvan ve Menemen → Eskişehir için yeni raporlar üretildi; rota şeması/hava ara noktaları tarayıcıda görüldü. Bu kod dalı henüz Vercel canlı yayınına alınmadı. Supabase'te 3.7 modeline izin veren geriye uyumlu iki model kısıtı genişletildi ve ikinci raporda kullanım olaylarının kaydı doğrulandı.

Teslim ZIP'i kaynak kod paketidir: **API anahtarları, kullanıcılar ve rapor verileri içermez; tam sistem yedeği değildir.** Mevcut Supabase temel şemasının tam kuruluş migration'ı bu depoda bulunmuyor. Güvenlik sıkılaştırması ve tam geri yükleme testi ayrı devir maddeleridir.

Eski tarihli inceleme/onarım belgeleri tarihsel kayıttır; güncel kurulum ve kullanım için yukarıdaki Türkçe rehberler esas alınmalıdır.
