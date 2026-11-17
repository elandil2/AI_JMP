# Faz 2 — Ara durak, Menemen terminali, 10 sa hakkı (17 Kasım 2026)

Durum: yerel dal `faz0/olcum-altyapisi`, **commit/push yok**.

## Yeni rapor ekranı
- **Çıkış: Total Menemen terminali** (varsayılan işaretli) → 38.617667, 27.122294 (TotalEnergies Menemen Madeni Yağ Fabrikası, Google Haritalar ile doğrulandı; 17 Kasım'a kadar Total listesindeki isimsiz 38.6266, 27.0559 noktası kullanılıyordu). İşaret kaldırılırsa eski il/ilçe seçimi gelir.
- **Ara durak ili / ilçesi** (isteğe bağlı): yalnızca güzergâhı belirler, yükleme/boşaltma değildir. Google Routes'a `via: true` geçiş noktası olarak gider.
- **Sürücünün bu hafta 10 sa uzatma hakkı var** (varsayılan işaretli). Kaldırılırsa plan 9 saatlik günle yapılır.

## Rapor
- Ara durak raporun `analysis.via` alanına yazılır; veritabanı şeması değişmedi.
- Başlık "… (Eskişehir üzerinden)", gömülü harita ve "Navigasyonu Aç" ara durağı içerir (operatör ve sürücü sayfası).
- Mola ve dinlenme yeri artık yalnız mola motorundan gelir: Gemini'nin `mandatoryBreak`/`breakNote` metni Maps planı varken kullanılmaz, Gemini'nin önerdiği mola/tır parkı noktaları atılır, istemde mola yeri önermemesi söylenir.

## Örnek (yerel, 18.11 08:00 kalkış)
Menemen terminali → Beypazarı, Eskişehir üzerinden: 643 km, 45 dk mola Karacabey, 11 sa dinlenme Alpu (Eskişehir); dağ yolu (Taraklı–Göynük) yerine Eskişehir koridoru.

## Ertelenenler
- Total bayi listesi: Gemini kontrolüne göre 389 noktanın 179'u adresle uyuşuyor, 88'i hatalı, 49'u ilçe merkezine düşmüş. Liste düzelene kadar varış il/ilçe merkezi.
- Faz 3: tır parkı olan dinlenme tesisleri listesi (departmandan istenecek).

## Dashboard
Giriş sonrası ekran yenilendi: lacivert başlık, sayaç şeridi, güne göre gruplu sefer listesi, en sık varış ve planlama kuralları. Seçme, CSV indirme, silme, bağlantı kopyalama aynı.
