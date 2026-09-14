# AI_JMP Kurulum ve Devir Rehberi

Tarih: 15 Eylül 2026. Teknik devralan ekip içindir; günlük kullanım için [kılavuzu](KULLANIM_KILAVUZU_TR.md) okuyun.

## 1. Doğru proje ve teslim kapsamı

- GitHub: `elandil2/AI_JMP`
- Vercel: `jmp__ai`, üretim dalı `main`
- Canlı adres: `https://jmpai-snowy.vercel.app`
- Bu teslimde uygulama davranışı değiştirilmez; Türkçe belgeler ve güvenli paketleme düzeni eklenir.

ZIP seçilmiş kaynak dosyalarının sürümlü kopyasıdır. `.git`, gerçek ortam dosyaları, API anahtarları, bağımlılık klasörleri, derleme çıktıları, yerel ekran görüntüleri, kullanıcı/rapor veri dökümleri ve eski benchmark/inceleme dosyaları dahil edilmez. `package-lock.json` ve örnek ortam dosyası dahildir.

**ZIP tam sistem yedeği değildir.** GitHub, Vercel, Supabase ve Google hesaplarının sahiplik devri ZIP paylaşımıyla gerçekleşmez. Erişimleri yetkili hesap sahipleri ayrı olarak devretmelidir.

## 2. Başlamadan önce

1. Node.js ve npm kurulu ortam. Kesin paket sürümleri kilit dosyasındadır; ekip Node sürümünü ayrıca standartlaştırmalıdır.
2. Uygulamanın beklediği tabloları, yetkileri ve Auth yapılandırmasını içeren uyumlu Supabase ortamı.
3. Gemini ve mevcut kodun çağırdığı Google Maps Directions hizmeti için geçerli erişim ve faturalama ayarları.
4. Doğru alan adı, Vercel ortam değişkenleri ve Auth yönlendirme adresleri.

`supabase/migrations/20260914153537_benchmark_telemetry.sql` **artımlı** migration'dır. Önceden var olan `batches`, `batch_items` ve `reports` tablolarını bekler; boş veritabanını tek başına kurmaz. Temel tablolar, Auth ilişkileri, fonksiyonlar ve politikalar için kaynak ortamdan doğrulanmış şema/devir çalışması gerekir. Canlıya bu dosyayı körlemesine tekrar uygulamayın.

Yerel veya kurum içi dağıtımda uygulama sunucusu ayrı barındırılabilir; ancak kod Supabase Auth ve API istemcilerine bağlıdır. Yalnız PostgreSQL bağlantısı vererek Supabase yerine geçilemez. Supabase uyumlu hizmetlerin kurulması veya uygulamanın uyarlanması gerekir. Bu teslim on-prem kurulum/geri yükleme sertifikasyonu değildir.

## 3. Ortam değişkenleri

`.env.example` dosyasını `.env.local` olarak kopyalayın ve kendi değerlerinizi yerelde girin. Gerçek dosyayı repoya veya ZIP'e eklemeyin.

| Değişken | İşlev / hassasiyet |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase proje adresi; tarayıcıya açıktır. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Mevcut istemcinin anon anahtarı; tarayıcıya açıktır. RLS ve tablo yetkilerinin yerini tutmaz. |
| `SUPABASE_SERVICE_ROLE_KEY` | Sunucu tarafı ayrıcalıklı erişim. Gizli tutulur; `NEXT_PUBLIC_` öneki verilmez. |
| `GEMINI_API_KEY` | Sunucu tarafı Gemini anahtarı. Kod eski `API_KEY` adını da yedek olarak kabul eder; yeni kurulumda standart adı kullanın. |
| `GOOGLE_MAPS_API_KEY` | Sunucu tarafı Directions çağrısı. Eksikliğinde güvenilir Maps rotası elde edildiği varsayılamaz; tahmin yoluna düşülebilir. |
| `NEXT_PUBLIC_APP_URL` | Paylaşım ve CSV bağlantılarının taban adresi. Yerelde `http://localhost:3000`, üretimde kendi HTTPS adresiniz. |

Kodun Maps isteği `https://maps.googleapis.com/maps/api/directions/json` adresinedir. Ayrı bir Routes API yetkisinin bu çağrıya otomatik erişim verdiğini varsaymayın; hesabın mevcut hizmet erişimini kontrol edin. Bu devirde sağlayıcı/API değişimi yapılmadı.

Vercel değerlerini gerekli Production/Preview/Development kapsamına girin. Preview ortamını istemeden canlı kullanıcı verisine bağlamayın. Anahtarlar için kontrollü gizli bilgi kanalı kullanın; README veya ekran görüntüsüne yapıştırmayın.

## 4. Yerel çalıştırma ve kontrol

Proje klasöründe:

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run start
```

Geliştirme için `npm run dev` kullanılır. `npm ci` kilit dosyasına göre kurar. Testler sahte sağlayıcı yanıtlarıyla çalışır; gerçek rapor üretimine eşdeğer değildir. Bu komutlar migration çalıştırmaz veya Auth kullanıcıları oluşturmaz.

`npm run lint` mevcut haliyle ilk ESLint yapılandırmasını ister. Lint geçişi iddia edilmez. Build/typecheck başarısı canlı Auth, tablo erişimi, SMTP veya bütün senaryoların çalıştığını tek başına kanıtlamaz.

## 5. Vercel yayını

1. Repo/Vercel eşleşmesini doğrulayın; benzer isimli başka projeyi değiştirmeyin.
2. Production Branch'in `main` olduğunu kontrol edin.
3. Ortam değerlerini ve üretim alan adını kontrol edin.
4. Test edilmiş commit'i `main` dalına fast-forward pushlayın. Başkalarının değişikliklerini force-push ile ezmeyin.
5. Deployment ekranında doğru commit ve **Ready** durumunu kontrol edin.
6. Canlıda giriş, listeleme ve mevcut rapor açma kontrollerini yapın. Yeni rapor maliyet doğurur; yalnız yetkili test kapsamında oluşturun.

`vercel.json`, günlük `GET /api/cron/keep-alive` zamanlaması içerir. Endpoint heartbeat yazar ve eski heartbeat kayıtlarını temizler; salt okunur sağlık kontrolü değildir. Bu teslimde çağrılmadı/değiştirilmedi. Endpoint koruması ve platform zamanlaması ayrı takip maddesidir.

Geri dönüş gerekirse bilinen sağlıklı Vercel deployment'ına dönüşü kontrollü planlayın. Bu işlem veritabanını veya raporları geri yüklemez.

## 6. Maliyet ve operasyon sınırları

Varsayılan model `gemini-2.5-flash`. Kodda `gemini-3.8-flash` seçeneği bulunması sağlayıcı erişiminin/fiyat doğruluğunun kanıtı değildir. Bu teslimde 3.8 çalıştırılmadı; 10+10 karşılaştırma tamamlanmadı.

Maliyet hesabı kodda tutulan tahminlere dayanır. Token, Search ve Maps ayrı izlenir; gerçek faturayla karşılaştırılmalıdır. Tarifeler, kota ve ücretsiz haklar ayrıca doğrulanmalıdır. Başarısız yanıtlar da ücretli olabilir.

Batch bütçe kontrolü aynı operatörün aynı girdi özetiyle ilişkilendirilen batch kayıtları üzerinden çalışır; tekli raporlar veya Google hesabının tüm tüketimi için bütçe sistemi değildir. Tahmini 9 USD eşiği kesin 10 USD fatura tavanı sağlamaz. Belirsiz işlem ve bilinmeyen maliyet durma nedenidir; tekrar ile aşılmamalıdır.

## 7. Güvenlik ve veri devri: açık takip maddeleri

Bu yayın güvenlik sertifikasyonu değildir. Önceki incelemelerde belirtilen aşağıdaki maddeler tamamlandı kabul edilmemelidir; güncel durum yetkili ekip tarafından doğrulanmalıdır:

- Veritabanı yedeği, kapsamı ve ayrı hedefte tam geri yükleme denemesi.
- `profiles` / `user_roles` RLS ve anonim tablo yetkileri.
- Yönetici alanlarının istemciden yazılmasının engellenmesi.
- Doğrudan anonim rapor erişimi ile kontrollü paylaşım API'sinin ayrımı.
- Açık `SECURITY DEFINER` çağrıları, `check-email` hesap keşfi ve anahtar kısıtları.
- Cron koruması, lint yapılandırması ve bağımsız canlı erişim testleri.

İki kullanıcıyla kullanım, doğrudan internete açık veri/API erişimini kendiliğinden sınırlamaz. Veri sahibi, yetkili kullanıcılar, rapor saklama süresi ve paylaşım kuralları devirde netleşmelidir.

Bu çalışma boş ve takip edilen `.env` dosyasını Git takibinden çıkarır; yerel kopya korunur. Git geçmişinde sır taraması veya anahtar rotasyonu yapılmış sayılmaz. Geçmişte gerçek anahtar paylaşımı tespit edilirse yetkili kişiyle ayrı rotasyon süreci gerekir.

## 8. Teslim kabul listesi

- [ ] Kaynak ZIP, commit kimliği ve SHA-256 alındı.
- [ ] Kullanım kılavuzu operasyon sorumlusuna iletildi.
- [ ] GitHub/Vercel/Supabase/Google sahipleri ve erişimleri netleşti.
- [ ] Gerçek anahtarlar kaynak paketi dışında güvenli olarak sağlandı.
- [ ] Veritabanı temel şeması, verisi ve Auth kapsamı ayrıca alındı.
- [ ] İzole hedefte kurulum/geri yükleme ve erişim testleri tamamlandı.
- [ ] Koordinat doğruluğu, maliyet ve güvenlik takip maddeleri kabul edildi.

Kutular teslim alan ekibin kontrol listesidir; otomatik tamamlanmış kabul edilmemelidir.
