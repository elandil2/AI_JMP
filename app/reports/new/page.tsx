"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/apiClient";
import Header from "@/components/Header";
import { publicReportUrl } from "@/lib/publicReportUrl";
import { TOTAL_MENEMEN } from "@/lib/totalOperation";

type CityOption = {
  name: string;
  counties: string[];
};

type CreateReportFailure = {
  error?: unknown;
  reportId?: unknown;
};

const friendlyCreateError = (payload: CreateReportFailure | null): string => {
  const error = typeof payload?.error === "string" ? payload.error.toLowerCase() : "";
  if (error.includes("origin") || error.includes("destination") || error.includes("required")) {
    return "Başlangıç ve varış ili seçilmelidir.";
  }
  if (error.includes("departure") || error.includes("future") || error.includes("date")) {
    return "Kalkış zamanı gelecekte olmalıdır.";
  }
  if (error.includes("gemini") || error.includes("analysis") || error.includes("content") || error.includes("valid")) {
    return "AI rapor içeriğini tamamlayamadı. Lütfen daha sonra yeni bir rapor oluşturun.";
  }
  return "Rapor oluşturulamadı. Lütfen bilgileri kontrol edip tekrar deneyin.";
};


// Same palette as the dashboard: warm paper, ink navy, one signal red.
const MONO = "font-['IBM_Plex_Mono',ui-monospace,monospace]";
const SANS = "font-['IBM_Plex_Sans',Inter,system-ui,sans-serif]";
const selectClass = "min-h-11 w-full rounded-md border border-[#14213D]/15 bg-white px-3 py-2.5 text-[15px] text-[#14213D] focus:outline-none focus:ring-2 focus:ring-[#14213D]/40 disabled:bg-[#F4F2EE] disabled:text-slate-400";
const labelClass = `${MONO} text-[11px] uppercase tracking-[0.12em] text-slate-500`;

const Toggle = ({ on }: { on: boolean }) => (
  <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-[#14213D]" : "bg-slate-300"}`} aria-hidden>
    <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`} />
  </span>
);

export default function NewReportPage() {
  const [fromTotalTerminal, setFromTotalTerminal] = useState(true);
  const [viaCity, setViaCity] = useState("");
  const [viaCounty, setViaCounty] = useState("");
  const [driverHasExtension, setDriverHasExtension] = useState(true);
  const [originCity, setOriginCity] = useState("");
  const [originCounty, setOriginCounty] = useState("");
  const [destinationCity, setDestinationCity] = useState("");
  const [destinationCounty, setDestinationCounty] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [useTolls, setUseTolls] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultLink, setResultLink] = useState<string | null>(null);
  const [reportLink, setReportLink] = useState<string | null>(null);
  const [cities, setCities] = useState<CityOption[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationsError, setLocationsError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLocations = async () => {
      setLocationsLoading(true);
      setLocationsError(null);
      try {
        const res = await fetch("/api/locations");
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Lokasyon listesi alınamadı");
        }
        const json = await res.json();
        setCities(json.cities || []);
      } catch (err: any) {
        console.error(err);
        setLocationsError(err?.message || "Lokasyon listesi alınamadı");
      } finally {
        setLocationsLoading(false);
      }
    };
    fetchLocations();
  }, []);

  const originCounties = useMemo(() => {
    return cities.find((c) => c.name === originCity)?.counties || [];
  }, [cities, originCity]);

  const destinationCounties = useMemo(() => {
    return cities.find((c) => c.name === destinationCity)?.counties || [];
  }, [cities, destinationCity]);

  const viaCounties = useMemo(() => {
    return cities.find((c) => c.name === viaCity)?.counties || [];
  }, [cities, viaCity]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResultLink(null);
    setReportLink(null);

    let departureTimeIso: string | null = null;
    if (departureTime) {
      const departureDate = new Date(departureTime);
      if (Number.isNaN(departureDate.getTime()) || departureDate.getTime() <= Date.now()) {
        setError("Kalkış zamanı gelecekte olmalıdır.");
        return;
      }
      departureTimeIso = departureDate.toISOString();
    }

    setLoading(true);
    try {
      const res = await authFetch("/api/reports", {
        method: "POST",
        body: JSON.stringify({
          ...(fromTotalTerminal
            ? { originCity: TOTAL_MENEMEN.city, originCounty: TOTAL_MENEMEN.county, originLat: TOTAL_MENEMEN.lat, originLng: TOTAL_MENEMEN.lng }
            : { originCity, originCounty }),
          ...(viaCity ? { stopCity: viaCity, stopCounty: viaCounty || undefined } : {}),
          driverHasExtension,
          destinationCity,
          destinationCounty,
          departureTime: departureTimeIso,
          useTolls
        })
      });
      const payload = await res.json().catch(() => null) as CreateReportFailure | { publicSlug?: unknown } | null;

      if (!res.ok) {
        const failure = payload as CreateReportFailure | null;
        setError(friendlyCreateError(failure));
        if (typeof failure?.reportId === "string" && failure.reportId) {
          setReportLink(`/reports/${encodeURIComponent(failure.reportId)}`);
        }
        return;
      }

      if (!payload || typeof (payload as { publicSlug?: unknown }).publicSlug !== "string") {
        setError("Rapor oluşturuldu ancak paylaşım bağlantısı hazırlanamadı.");
        return;
      }
      setResultLink(publicReportUrl((payload as { publicSlug: string }).publicSlug, window.location.origin, process.env.NEXT_PUBLIC_APP_URL));
    } catch (err) {
      console.error(err);
      setError("Bağlantı kurulamadı. Lütfen daha sonra tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`min-h-screen bg-[#F4F2EE] ${SANS}`}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" />
      <Header />

      {/* Masthead with the operation switch */}
      <section className="bg-[#14213D] text-white">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-6 pb-6">
          <Link href="/dashboard" className={`${MONO} text-[11px] uppercase tracking-[0.14em] text-white/60 hover:text-white`}>← Rota raporları</Link>
          <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight">Yeni sefer raporu</h1>
          <p className="mt-2 max-w-xl text-sm text-white/65">Rota, mola planı ve yol uyarıları yaklaşık bir dakikada hazırlanır.</p>
          <div role="radiogroup" aria-label="Operasyon" className="mt-6 grid w-full grid-cols-2 gap-1 rounded-lg bg-white/10 p-1 sm:inline-grid sm:w-auto">
            {[
              { total: true, title: "Total FTL", sub: "Menemen fabrikasından" },
              { total: false, title: "Genel", sub: "Başlangıcı sen seç" }
            ].map(option => {
              const active = fromTotalTerminal === option.total;
              return (
                <button
                  key={option.title}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setFromTotalTerminal(option.total)}
                  className={`min-h-12 rounded-md px-4 py-2 text-left transition sm:min-w-[200px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${active ? "bg-white text-[#14213D] shadow-sm" : "text-white/75 hover:bg-white/10 hover:text-white"}`}
                >
                  <span className="block text-sm font-semibold">{option.title}</span>
                  <span className={`block text-xs ${active ? "text-slate-500" : "text-white/55"}`}>{option.sub}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 01 Route */}
            <section className="rounded-md border border-[#14213D]/10 bg-white p-5 sm:p-6" aria-labelledby="sec-route">
              <h2 id="sec-route" className="flex items-baseline gap-3 text-base font-semibold text-[#14213D]">
                <span className={`${MONO} text-xs text-[#D7192D]`}>01</span> Güzergâh
              </h2>
              <p className="mt-3 border-l-2 border-amber-400 pl-3 text-xs leading-5 text-slate-600">
                {fromTotalTerminal
                  ? "Çıkış TotalEnergies Menemen Madeni Yağ Fabrikası'nın koordinatıdır. Varış ve ara durak için il/ilçe merkez koordinatı kullanılır; bayi giriş noktası seçilmediği için varış tarafı yaklaşık kalır."
                  : "İl ve ilçe seçimi merkez koordinatlarını kullanır. Gerçek tesis giriş noktası seçilmediği için mesafe, harita ve mola konumları yaklaşık kalır."}
              </p>

              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                {fromTotalTerminal ? (
                  <div className="space-y-1 md:col-span-2">
                    <span className={labelClass}>Çıkış</span>
                    <div className="flex min-h-11 items-center gap-3 rounded-md border border-[#14213D]/10 bg-[#F4F2EE] px-3">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-[#14213D]" aria-hidden />
                      <span className="font-medium text-[#14213D]">{TOTAL_MENEMEN.name}</span>
                      <span className={`${MONO} ml-auto hidden text-xs text-slate-400 sm:inline`}>{TOTAL_MENEMEN.lat.toFixed(4)}, {TOTAL_MENEMEN.lng.toFixed(4)}</span>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1">
                      <label htmlFor="origin-city" className={labelClass}>Başlangıç ili</label>
                      <select id="origin-city" value={originCity} onChange={(e) => { setOriginCity(e.target.value); setOriginCounty(""); }} className={selectClass} disabled={locationsLoading} required>
                        <option value="">{locationsLoading ? "Yükleniyor..." : "İl seçin"}</option>
                        {cities.map((city) => <option key={city.name} value={city.name}>{city.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="origin-county" className={labelClass}>Başlangıç ilçesi</label>
                      <select id="origin-county" value={originCounty} onChange={(e) => setOriginCounty(e.target.value)} className={selectClass} disabled={!originCity || originCounties.length === 0 || locationsLoading}>
                        <option value="">{originCity ? "İlçe seçin (isteğe bağlı)" : "Önce il seçin"}</option>
                        {originCounties.map((county) => <option key={county} value={county}>{county}</option>)}
                      </select>
                    </div>
                  </>
                )}

                <div className="space-y-1">
                  <label htmlFor="destination-city" className={labelClass}>Varış ili</label>
                  <select id="destination-city" value={destinationCity} onChange={(e) => { setDestinationCity(e.target.value); setDestinationCounty(""); }} className={selectClass} disabled={locationsLoading} required>
                    <option value="">{locationsLoading ? "Yükleniyor..." : "İl seçin"}</option>
                    {cities.map((city) => <option key={city.name} value={city.name}>{city.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="destination-county" className={labelClass}>Varış ilçesi</label>
                  <select id="destination-county" value={destinationCounty} onChange={(e) => setDestinationCounty(e.target.value)} className={selectClass} disabled={!destinationCity || destinationCounties.length === 0 || locationsLoading}>
                    <option value="">{destinationCity ? "İlçe seçin (isteğe bağlı)" : "Önce il seçin"}</option>
                    {destinationCounties.map((county) => <option key={county} value={county}>{county}</option>)}
                  </select>
                </div>

                <div className="mt-1 grid grid-cols-1 gap-4 border-t border-dashed border-[#14213D]/15 pt-4 md:col-span-2 md:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor="via-city" className={labelClass}>Ara durak ili · isteğe bağlı</label>
                    <select id="via-city" value={viaCity} onChange={(e) => { setViaCity(e.target.value); setViaCounty(""); }} className={selectClass} disabled={locationsLoading}>
                      <option value="">Yok — Google en hızlı yolu seçer</option>
                      {cities.map((city) => <option key={city.name} value={city.name}>{city.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="via-county" className={labelClass}>Ara durak ilçesi</label>
                    <select id="via-county" value={viaCounty} onChange={(e) => setViaCounty(e.target.value)} className={selectClass} disabled={!viaCity || viaCounties.length === 0 || locationsLoading}>
                      <option value="">{viaCity ? "İl merkezi" : "Önce ara durak ili seçin"}</option>
                      {viaCounties.map((county) => <option key={county} value={county}>{county}</option>)}
                    </select>
                  </div>
                  <p className="text-xs text-slate-500 md:col-span-2">Ara durak yükleme/boşaltma değildir; yalnızca rotanın oradan geçmesini sağlar (ör. dağ yolu yerine &quot;Eskişehir üzerinden&quot;).</p>
                </div>
              </div>
            </section>

            {/* 02 Time and driver */}
            <section className="rounded-md border border-[#14213D]/10 bg-white p-5 sm:p-6" aria-labelledby="sec-time">
              <h2 id="sec-time" className="flex items-baseline gap-3 text-base font-semibold text-[#14213D]">
                <span className={`${MONO} text-xs text-[#D7192D]`}>02</span> Zaman ve sürücü
              </h2>
              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="departure-time" className={labelClass}>Kalkış zamanı · isteğe bağlı</label>
                  <input id="departure-time" type="datetime-local" value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} className={selectClass} />
                  <p className="text-xs text-slate-500">Boş bırakılırsa şu an kabul edilir.</p>
                </div>
              </div>
              <div className="mt-5 divide-y divide-[#14213D]/[0.07] border-t border-[#14213D]/[0.07]">
                <label htmlFor="use-tolls" className="flex min-h-12 cursor-pointer select-none items-center justify-between gap-4 py-3 text-sm text-[#14213D]">
                  <span>Ücretli yolları kullan <span className="block text-xs text-slate-500">Otoyol ve köprü gişeleri rotaya dahil edilir.</span></span>
                  <Toggle on={useTolls} />
                  <input id="use-tolls" type="checkbox" className="sr-only" checked={useTolls} onChange={(e) => setUseTolls(e.target.checked)} />
                </label>
                <label htmlFor="driver-extension" className="flex min-h-12 cursor-pointer select-none items-center justify-between gap-4 py-3 text-sm text-[#14213D]">
                  <span>Sürücünün bu hafta 10 saatlik uzatma hakkı var <span className="block text-xs text-slate-500">Haftada en fazla 2 kez. Hakkı yoksa kapat; plan 9 saatlik günle yapılır.</span></span>
                  <Toggle on={driverHasExtension} />
                  <input id="driver-extension" type="checkbox" className="sr-only" checked={driverHasExtension} onChange={(e) => setDriverHasExtension(e.target.checked)} />
                </label>
              </div>
            </section>

            {locationsError && <div role="alert" className="rounded-md border-l-4 border-[#D7192D] bg-white px-4 py-3 text-sm text-[#B3121F]">Lokasyon listesi alınamadı: {locationsError}. Lütfen tekrar deneyin.</div>}
            {error && <div role="alert" className="rounded-md border-l-4 border-[#D7192D] bg-white px-4 py-3 text-sm text-[#B3121F]">{error}</div>}
            {reportLink && <div className="rounded-md border-l-4 border-amber-500 bg-white px-4 py-3 text-sm text-amber-900">Bu isteğe ait kaydı <Link className="font-semibold underline" href={reportLink}>görüntüleyin</Link>.</div>}
            {resultLink && (
              <div role="status" className="rounded-md border-l-4 border-emerald-600 bg-white px-4 py-3 text-sm text-emerald-800">
                Rapor hazır. Sürücü bağlantısı:{" "}
                <a className="break-all font-semibold underline" href={resultLink} target="_blank" rel="noreferrer">{resultLink}</a>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[#D7192D] px-4 text-base font-semibold text-white hover:bg-[#BC1527] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D] disabled:opacity-70"
            >
              {loading && <span className="h-2 w-2 animate-pulse rounded-full bg-white" aria-hidden />}
              {loading ? "Rapor hazırlanıyor… (yaklaşık 1 dk)" : "Raporu oluştur"}
            </button>
          </form>

          {/* Side rail */}
          <aside className="space-y-6">
            <section className="rounded-md border border-[#14213D]/10 bg-white p-4">
              <h2 className={labelClass}>Raporda neler var</h2>
              <ul className="mt-3 space-y-2.5 text-sm text-slate-700">
                {["Google rotası, mesafe ve süre", "Kurallara göre mola ve gece dinlenmesi", "Yol uyarıları ve bölgesel risk", "Güzergâh hava durumu", "Sürücüyle paylaşılacak bağlantı"].map(item => (
                  <li key={item} className="flex gap-2"><span className={`${MONO} w-4 shrink-0 text-[#D7192D]`}>→</span>{item}</li>
                ))}
              </ul>
            </section>
            <section className="rounded-md border border-[#14213D]/10 bg-white p-4">
              <h2 className={labelClass}>Planlama kuralları</h2>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                <li className="flex gap-2"><span className={`${MONO} w-14 shrink-0 whitespace-nowrap text-[#D7192D]`}>4,5 sa</span> sürüşten sonra 45 dk mola</li>
                <li className="flex gap-2"><span className={`${MONO} w-14 shrink-0 whitespace-nowrap text-[#D7192D]`}>9 sa</span> günlük sürüş, haftada 2 gün 10 sa</li>
                <li className="flex gap-2"><span className={`${MONO} w-14 shrink-0 whitespace-nowrap text-[#D7192D]`}>11 sa</span> günlük dinlenme</li>
                <li className="flex gap-2"><span className={`${MONO} w-14 shrink-0 whitespace-nowrap text-[#D7192D]`}>60</span> km/sa planlama hızı</li>
              </ul>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
