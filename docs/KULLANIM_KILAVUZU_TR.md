# AI_JMP Kullanım Kılavuzu

Sürüm tarihi: 15 Eylül 2026. Hedef kullanıcı: yolculuk raporu hazırlayan ve sürücüyle paylaşan operasyon personeli.

## 1. Uygulamanın amacı ve sınırları

AI_JMP, seçtiğiniz başlangıç ve varış noktaları için yolculuk öncesi değerlendirme hazırlar. Harita, süre özeti, rota şeması, risk ve hava bilgileri ile varsa kaynak bağlantılarını bir arada sunar.

Rapor bir karar destek çıktısıdır. Canlı trafik, gerçek park/mola yeri uygunluğu veya araca özel geçiş izni yerine geçmez. Kritik bilgileri güncel kaynaklardan ve operasyon sorumlusundan doğrulayın. Yapay zekâ eksik veya yanlış bilgi üretebilir; kaynak bağlantısının bulunması bütün iddiaların doğrulandığını göstermez.

## 2. Giriş yapma

1. [Uygulamayı açın](https://jmpai-snowy.vercel.app).
2. Size tanımlanmış e-posta adresi ve şifreyle giriş yapın.
3. Giriş sonrasında **Raporlar** ekranını kullanın.
4. Şifrenizi hatırlamıyorsanız giriş ekranındaki şifre yenileme akışını izleyin. E-posta gelmezse gereksiz posta klasörünü kontrol edin ve yöneticinize başvurun.

Hesap oluşturma ve yönetici yetkisi için proje sorumlusuyla iletişime geçin. Ortak cihazlarda işiniz bitince çıkış yapın; şifre ve API anahtarlarını rapor metnine veya destek mesajına yazmayın.

## 3. İlk raporunuzu oluşturma

1. Raporlar ekranında **Yeni Rapor** bölümünü açın.
2. **Başlangıç ili** seçin. İlçe listesinden doğru ilçeyi seçin.
3. **Varış ili** ve varsa ilçesini seçin.
4. **Kalkış zamanı** isteğe bağlıdır. Giriyorsanız cihazınızın yerel saatine göre gelecekte bir tarih/saat seçin. Boş bırakıldığında forma özel bir kalkış zamanı gönderilmez.
5. **Ücretli yolları kullan** tercihini kontrol edin. Açık olması ücretli yol kullanımına izin verir; her rotanın mutlaka ücretli yoldan geçeceği anlamına gelmez.
6. **Rapor Oluştur** düğmesine bir kez basın. Bu işlem ücretli sağlayıcı çağrıları başlatabilir.
7. **Oluşturuluyor...** durumunda bekleyin. **Rapor hazır. Paylaş:** mesajı çıkınca bağlantıyı açın.

Örnek: **İstanbul / Ataşehir → Van / Erciş**. Bu rota ile yapılan son canlı testte 12 durak oluştu. Durak sayısı ve içerik rotaya göre değişebilir.

### Konumu mutlaka kontrol edin

İlçe seçimi isteğe bağlıdır; ilçe yoksa il merkezi koordinatları kullanılabilir. Mevcut konum verisinde eksik/eşleşmeyen ilçeler veya koordinatlar da il merkezine dönüşe neden olabilir. İlçe adının raporda yazması tek başına koordinatının doğru olduğunu kanıtlamaz.

Haritadaki başlangıç ve varışı kontrol edin. Yanlış ilçeye/merkeze gidiyorsa operasyon rotası olarak kullanmayın; yöneticinize bildirin. Form serbest adres, mahalle veya kapı numarası bazlı rota oluşturma ekranı değildir.

## 4. Rapor durumları

| Görünen durum | Anlamı | Yapılacak işlem |
| --- | --- | --- |
| Hazırlanıyor | Üretim henüz bitmemiş. | Bekleyin; durum yenilenir. Aynı isteği tekrar göndermeyin. |
| Hazır | Rapor kaydı tamamlanmış. | Detayı açın, konumu ve çıktıyı inceleyin. |
| Başarısız | Rapor üretimi tamamlanamamış. | Hata bilgisini koruyun; yeniden denemeden önce nedenini kontrol ettirin. |
| İlgi gerekiyor | İşlem 15 dakikayı aşmış veya durum belirsiz. | Yeni ücretli çağrı başlatmadan yöneticiye bildirin. Bu etiket kaydın silindiği anlamına gelmez. |

Bağlantı koparsa veya ekran zaman aşımına uğrarsa önce Raporlar listesini kontrol edin. Sunucuda kayıt oluşmuş olabilir. Körlemesine tekrar deneme ek maliyet yaratabilir. Başarısız çağrının da sağlayıcı maliyeti olabilir.

## 5. Mesafe ve süreleri doğru okuma

Yeni Maps destekli raporlarda farklı süreler ayrı gösterilir:

| Alan | Ne anlatır? |
| --- | --- |
| Toplam Mesafe | Maps otomobil güzergâhından alınan mesafe. Tıra özel yol uygunluğu onayı değildir. |
| Google Maps · otomobil | Maps tarafından döndürülen otomobil yolculuk süresi. |
| Tahmini kamyon sürüşü | Mesafe için 60 km/sa ortalama kabul edilir; Maps süresi daha uzunsa o süre kullanılır. |
| Mola süresi | Uygulamanın planlama varsayımlarından hesaplanan mola/dinlenme toplamı. |
| Tır planlama tahmini (mola dahil) | Tahmini kamyon sürüşü ile mola/dinlenmenin toplamı. |

Örnek canlı testin kayıtlı çıktısı: **1.484 km**, Maps otomobil **16 sa 40 dk**, tahmini kamyon sürüşü **24 sa 44 dk**, mola/dinlenme **24 sa 15 dk**, toplam **48 sa 59 dk**. Bunlar o raporun değerleridir; yeni rapor için sabit sonuç değildir.

Uygulamanın mola hesabı 4,5 saat sürüşe 45 dakika mola, 9 saat sürüşten sonra yolculuk devam ediyorsa 11 saat dinlenme varsayar. Bu açıklama yazılımın hesabını anlatır; yasal uygunluk belgesi değildir. Önceki sürüş, takograf, çoklu sürücü ve araca/yüke özgü şartlar bu hesapla doğrulanmaz.

Haritadaki canlı süre sonradan değişebilir. Kayıtlı rapor otomatik olarak yeni trafik/hava bilgileriyle yeniden hesaplanmaz. Eski raporlarda yeni süre ayrımları bulunmayabilir; eski değerleri güncel Maps ölçümü gibi yorumlamayın.

## 6. Rota şemasını okuma

Rota şeması coğrafi harita değildir; yolculuğun aşamalarını sıralar.

- **Numaraları takip edin.** Geniş ekranda ilk satır soldan sağa, ikinci satır sağdan sola ilerler; sonraki satırlar aynı düzeni sürdürür.
- Dar ekranlarda aşamalar yukarıdan aşağıya tek sütuna geçer.
- Başlangıç, mola ve varış farklı simge/renklerle ayrılır. Sıralama yalnız renge bağlı değildir.
- Durağın altındaki süre **başlangıçtan o noktaya kadar geçen toplam süreyi** anlatır. “5 sa 15 dk”, o molanın 5 saat sürdüğü anlamına gelmez.
- Uzun durak adları satıra bölünebilir. Durak sayısı arttıkça şema yeni satırlara devam eder.
- Şema her molaya sabit bir “45 dk” etiketi eklemez; mevcut durak adı ve birikimli süresini gösterir.

“Sivas yakınları” gibi ifadeler belirli bir tesis rezervasyonu veya güvenli park yeri teyidi değildir. Mola yerini gerçek güzergâh ve uygun tesis bilgisiyle ayrıca doğrulayın.

## 7. Risk, hava ve kaynaklar

Hava değerlendirmelerini, kritik noktaları ve risk bölümlerini yolculuk öncesi okuyun. Kapanma, geçiş yasağı, tehlikeli hava veya yük kısıtı gibi kritik iddiaları bağımsız teyit edin.

**Rapor kaynakları** bölümünde ilk dört bağlantı görünür; fazlası varsa **Diğer … kaynağı göster** ile açılır. Bağlantılar yeni sekmede açılır. Kaynak bulunamadığı yazıyorsa doğrulanabilir bağlantı yoktur; bunu “risk yok” şeklinde yorumlamayın.

## 8. Paylaşma, navigasyon ve PDF

Rapor detayındaki işlemler:

- **Navigasyonu Aç:** harici navigasyon sayfasını açar. Araca özel tır kısıtlarının uygulandığını varsaymayın.
- **WhatsApp ile Paylaş:** paylaşım akışını açar; doğru alıcıyı siz seçin ve mesajı kontrol edin.
- **Bağlantıyı Kopyala:** paylaşım bağlantısını kopyalar. Listede de **Kopyala** bulunur.
- **Yazdır / PDF:** tarayıcının yazdırma penceresini açar. PDF için PDF'ye kaydet hedefini seçin. Önizlemeyi kontrol edin; çok uzun rotaların baskı sayfa bölünmeleri tüm durumlarda doğrulanmış değildir.

**Paylaşım bağlantısı giriş gerektirmez:** `/r/...` bağlantısını bilen kişi raporu okuyabilir. Gizli müşteri bilgisi veya kişisel adres paylaşmadan önce yetki ve alıcıyı kontrol edin. Bağlantı için süreli erişim/parola koruması varmış gibi davranmayın.

## 9. Rapor listesini dışa aktarma ve silme

Raporlar ekranında satırların kutucuklarını seçin ve **CSV İndir (Export)** düğmesini kullanın. CSV rota, durum, tarih ve rapor bağlantısını içerir; tam rapor PDF'i veya veritabanı yedeği değildir.

**Sil** ve toplu silme işlemlerini dikkatli kullanın. Kullanıcıya açık bir çöp kutusu/geri al akışı yoktur. Saklanması gereken çıktıyı önceden koruyun; silme, hata teşhisinin ilk adımı olmamalıdır.

## 10. Birden fazla rota: CSV kuyruğu

1. **CSV Yükle** bölümünü açın.
2. UTF-8 kodlamalı, virgülle ayrılmış `.csv` dosyası seçin veya CSV satırlarını metin alanına yapıştırın. Excel'in noktalı virgülle kaydetmediğinden emin olun.
3. En fazla **10 farklı rota** girin. Aynı rotayı aynı kuyrukta tekrarlamayın. İl alanları zorunlu, ilçe alanları isteğe bağlıdır.
4. Ücretli yol ve kalkış zamanı seçeneklerini kontrol edin. **Gemini 2.5 Flash** ile devam edin.
5. **CSV kuyruğunu oluştur** düğmesine basın. Kayıt oluşturulur; ücretli model/Maps üretimi bu aşamada başlamaz.
6. **Sonraki satırı işle** ile yalnız bir satırı çalıştırın. Sonucu, hata/maliyet bilgisini inceleyip sonraki satıra geçin.

Örnek dosya: [ornek-rotalar.csv](ornek-rotalar.csv).

```csv
Origin City,Origin County,Destination City,Destination County
istanbul,ataşehir,van,erciş
bursa,nilüfer,ankara,etimesgut
```

Kuyruk kendiliğinden 10 raporu arka arkaya çalıştırmaz. Son kuyruk kimliği aynı tarayıcıda hatırlanabilir; başka cihaz veya hesapta devam etme garantisi değildir. İşlem sürerken sayfayı kapatıp yeniden çağrı göndermeyin.

`pending` bekliyor, `processing` işleniyor, `ready` satır hazır, `failed` başarısız anlamına gelir. Kuyruğun `completed` olması işlemlerin bittiğini belirtir; doğruluk için operatör incelemesi yine gerekir.

`STOP`, belirsiz işlem, başarısız satır veya bilinmeyen maliyet uyarısında durun. Yeni kuyruk oluşturarak korumayı aşmaya çalışmayın. Yönetici ekranındaki 3.8 seçeneğinin sağlayıcıda kullanılabilirliği bu teslimde doğrulanmadı; 2.5/3.8 karşılaştırması tamamlanmış değildir.

### Maliyetleri yorumlama

Ekrandaki USD tutarı tahmindir, fatura değildir. Token, Google Search ve Maps ayrı kalemlerdir. Bilinmeyen maliyet sıfır maliyet demek değildir. Batch korumasındaki 9 USD tahmini eşik hesap genelinde kesin harcama tavanı değildir; tek raporlar ve diğer Google kullanımları da maliyet oluşturabilir. Gerçek faturayı yetkili Google hesabından kontrol edin.

## 11. Sorun yaşarsanız

| Sorun | İlk kontrol |
| --- | --- |
| İl/ilçe listesi yüklenmiyor | Bağlantınızı kontrol edin; devam ediyorsa yöneticiye bildirin. |
| Kalkış zamanı kabul edilmiyor | Cihaz saati/saat dilimi ve gelecekte tarih seçimini kontrol edin. |
| Harita yanlış yeri gösteriyor | İl/ilçe eşleşmesini inceleyin; yeni ücretli denemeler yerine koordinat sorunu olarak bildirin. |
| Maps ve toplam süre farklı | Otomobil süresi ile molalı kamyon planlamasının farklı alanlar olduğunu kontrol edin. |
| AI içeriği tamamlanamadı | Rapor kaydı ve hata mesajını koruyun; teknik inceleme isteyin. |
| Paylaşım bağlantısı açılmıyor | Tam kopyalandığını ve kaydın hâlâ mevcut olduğunu kontrol edin. |
| Kaynak yok / hava belirsiz | Bilgi doğrulanmış sayılmaz; operasyon kararından önce ek teyit alın. |

Destek kaydına işlem zamanı, başlangıç/varış, tekli mi CSV mi olduğu, görünen durum/hata ve gerekiyorsa kişisel verileri gizlenmiş ekran görüntüsü ekleyin. Rapor kimliğini yetkili teknik ekiple paylaşın; şifre, oturum çerezi veya servis anahtarı göndermeyin.
