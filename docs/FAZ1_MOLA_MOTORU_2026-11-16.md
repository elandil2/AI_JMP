# Faz 1 — Mola motoru (16 Kasım 2026)

Durum: yerel dal `faz0/olcum-altyapisi`, **commit/push yok**. Kullanıcı yerelde test edip onaylayınca push edilecek.

## Ne değişti

| Önce | Şimdi |
| --- | --- |
| Mola, en yakın Google adım sonuna yapıştırılıyordu (adım 384 km'ye kadar uzayabiliyor → 27–180 km kayma, 5,1–8,1 sa kesintisiz sürüş). | Mola tam 4,5 / 9 sa sürüş noktasında; konum rota çizgisi üzerinde enterpolasyonla bulunur (`lib/routeAxis.ts`). |
| Varışa 50 km kala dinlenme çıkarsa hız 65 km/sa'e çekiliyordu. | Hız 60 km/sa sabit. Kalan sürüş tek günde 10 saate sığıyorsa 10 sa uzatılmış gün kullanılır (haftada en fazla 2). Özet notu, sürücünün hakkı yoksa varışın ne kadar gecikeceğini yazar. |
| Google adım verisi eksikse mola şemadan düşüyordu. | Mola her zaman km'siyle şemada; geometri yoksa yalnız koordinatı boş kalır. |
| Mola etiketi gerçeği yansıtmıyordu. | Bağımsız denetim (`lib/breakPlanAudit.ts`) 6 gerçek Total rotasında zorunlu test: sıfır sert ihlal, konum hatası < 1 km. |

Yeni dosyalar: `lib/drivingSchedule.ts` (sürüş/mola takvimi), `lib/routeAxis.ts` (km → koordinat).
Değişen: `lib/routeTiming.ts`, `lib/mapsRoutePlan.ts`, `services/geminiService.ts` (koordinatsız mola etiketi), `types.ts` (`extendedDrivingDays`), testler.

## Sonuçlar (kayıtlı Google rotaları)

| Rota | Önce (plan) | Şimdi (plan) | Sert ihlal önce → şimdi |
| --- | --- | --- | --- |
| Ankara | 21 sa 36 dk | 11 sa 21 dk (10 sa gün) | 2 → 0 |
| Eskişehir | 9 sa 0 dk | 9 sa 0 dk | 1 → 0 |
| İstanbul Avrupa | 8 sa 56 dk | 8 sa 56 dk | 1 → 0 |
| Malatya | 43 sa 44 dk | 43 sa 44 dk | 4 → 0 |
| Malatya, Aksaray üzerinden | 43 sa 31 dk | 43 sa 31 dk | 4 → 0 |
| Van | 65 sa 16 dk | 65 sa 16 dk | 5 → 0 |

Toplam süreler çoğu rotada aynı kalır (aynı mola sayısı); değişen, molaların gerçekte nerede olduğudur.

## Yerelde test

```bash
npm run dev
```

Tarayıcıda `http://localhost:3000/dev/rota-onizleme` (yalnız geliştirmede açılır, giriş ve Supabase gerektirmez, hiçbir şey kaydetmez):

- **Sadece rota + mola:** 1 Google isteği, Gemini yok. Bağımsız denetim kutusu ve mola noktalarının Google Maps bağlantıları görünür.
- **Tam rapor:** canlıdaki `analyzeRoute` akışının aynısı (Gemini + Maps), kaydedilmez.

Normal rapor akışını (`/reports/new`) yerelde denemek için `.env.local`'a Supabase değerleri de gerekir; o durumda yerel raporlar canlı veritabanına yazılır.

Doğrulama: `npm test` (115/115), `npm run typecheck`, `npx tsx scripts/audit-break-plans.ts`.

## Sonraki fazlar

- Faz 2: ara durak listesi (birden çok güzergâh noktası) + `reports.via_points` kolonu + yeni rapor ekranında alan.
- Faz 3: Total mola tesisleri (önce 5 koridor) — mola penceresinde tesis tercih edilir, yoksa hesaplanan nokta kalır.
- Faz 4: bayi gece giriş kuralları.
