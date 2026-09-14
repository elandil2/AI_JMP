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
- Risk, hava durumu ve mevcut kaynak bağlantılarının görüntülenmesi.
- Paylaşım bağlantısı, WhatsApp paylaşımı, navigasyon bağlantısı ve yazdırma/PDF.
- Seçilen raporların listesini CSV olarak dışa aktarma.
- En fazla 10 farklı rotalık CSV kuyruğu; her satırı operatörün tek tek başlatması.

Normal kullanımın varsayılan modeli **Gemini 2.5 Flash**. Yönetici ekranında başka model seçeneği görünmesi, sağlayıcı hesabında çalıştığının doğrulandığı anlamına gelmez. 3.8 karşılaştırması tamamlanmış bir test olarak sunulmaz.

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

`npm run start`, başarılı build sonrasında kullanılır. `npm run lint` mevcut durumda ilk yapılandırma ekranını açıyor; lint kontrolü geçmiş sayılmamalıdır.

## Yayın ve teslim durumu

GitHub deposu `elandil2/AI_JMP`, Vercel projesi `jmp__ai`; üretim dalı `main`.

15 Eylül 2026 tarihinde Ataşehir → Van/Erciş için tek canlı Gemini 2.5 Flash raporu başarıyla oluşturuldu ve 12 duraklı yeni şema doğrulandı. Bu sonuç tüm rotaların, hesapların, tahminlerin veya güvenlik kontrollerinin eksiksiz doğrulandığı anlamına gelmez.

Teslim ZIP'i kaynak kod paketidir: **API anahtarları, kullanıcılar ve rapor verileri içermez; tam sistem yedeği değildir.** Mevcut Supabase temel şemasının tam kuruluş migration'ı bu depoda bulunmuyor. Güvenlik sıkılaştırması ve tam geri yükleme testi ayrı devir maddeleridir.

Eski tarihli inceleme/onarım belgeleri tarihsel kayıttır; güncel kurulum ve kullanım için yukarıdaki Türkçe rehberler esas alınmalıdır.
