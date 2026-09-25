# Mevcut Mapbox trafik verisi: Menemen rota örneklemi

25 Eylül 2026 17:57 UTC'de, Supabase rapor geçmişinde görülen dokuz Menemen varışı için mevcut `MAPBOX_TOKEN` ile yalnızca okuma amaçlı `mapbox/driving-traffic` sorguları yapıldı. Başlangıç/varış, gerçek Total tesisi değil il/ilçe merkezi koordinatlarıdır. Bu liste onaylı Total lokasyon listesi değildir.

`annotation.distance` ile yol uzunluğu, `annotation.congestion` ve `annotation.congestion_numeric` ile trafik seviyesi kapsaması ölçüldü. Bir kesim ancak hem seviye `unknown` dışında hem sayısal değer mevcutsa **ölçülen** sayıldı. Kalan kısım için yoğunluk bilinmiyor. Bu ölçüm Mapbox'ın kendi otomobil rotasına aittir; kayıtlı Google rotasının aynı yolu ve yönü kullanması garanti değildir.

| Menemen → varış | Mapbox km | Trafik seviyesi bilinen km | Bilinen pay |
|---|---:|---:|---:|
| Malatya / Arguvan | 1.216 | 38 | %3,1 |
| Eskişehir / Odunpazarı | 481 | 280 | %58,3 |
| Ankara / Çankaya | 628 | 51 | %8,0 |
| Ankara / Yenimahalle | 603 | 51 | %8,4 |
| Konya / Karatay | 577 | 38 | %6,6 |
| Van / Tuşba | 1.792 | 38 | %2,1 |
| Antalya / Serik | 529 | 231 | %43,8 |
| Antalya / Kepez | 491 | 220 | %44,8 |
| Malatya il merkezi | 1.199 | 38 | %3,2 |

Bu örneklemde ölçülen kesimlerde `heavy`/`severe` uzunluğu sıfır çıktı. Bu, özellikle Malatya ve Van gibi %97–98'i bilinmeyen rotalar için “trafik sakin” veya “risk yok” sonucu vermez. Menemen → Arguvan olay sorgusunda yakın aralıklı iki denemeden biri sağlayıcı olayı döndürdü, diğeri döndürmedi; olay yokluğu anlık ve eksiksiz veri kanıtı değildir.

Rapor üretimi artık aynı mevcut Mapbox sorgusundan ölçülen km/pay bilgisini kaydedebilir; yeni API açılması gerekmez. Trafik kapsamı, olay/kaza/yol çalışması kapsamından farklıdır. Alanların anlamı ve `unknown` davranışı [Mapbox Directions API belgelerinde](https://docs.mapbox.com/api/navigation/directions/) açıklanır.
