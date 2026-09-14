"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/apiClient";
import Header from "@/components/Header";

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

export default function NewReportPage() {
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
          originCity,
          originCounty,
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
      const base = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      setResultLink(`${base}/r/${(payload as { publicSlug: string }).publicSlug}`);
    } catch (err) {
      console.error(err);
      setError("Bağlantı kurulamadı. Lütfen daha sonra tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="px-4 py-6 sm:px-6 sm:py-8 mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">Rapor</p>
            <h1 className="text-2xl font-bold text-slate-900">Yeni Rapor Oluştur</h1>
          </div>
          {/* Dashboard link removed as it is in the Header */}
        </div>

        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-2xl shadow p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="origin-city" className="text-xs uppercase text-slate-500 font-semibold">Başlangıç ili</label>
              <select
                id="origin-city"
                value={originCity}
                onChange={(e) => {
                  setOriginCity(e.target.value);
                  setOriginCounty("");
                }}
                className="min-h-11 w-full rounded-xl border border-slate-200 px-3 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                disabled={locationsLoading}
                required
              >
                <option value="">{locationsLoading ? "Yükleniyor..." : "İl seçin"}</option>
                {cities.map((city) => (
                  <option key={city.name} value={city.name}>
                    {city.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="origin-county" className="text-xs uppercase text-slate-500 font-semibold">Başlangıç ilçesi</label>
              <select
                id="origin-county"
                value={originCounty}
                onChange={(e) => setOriginCounty(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-slate-200 px-3 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                disabled={!originCity || originCounties.length === 0 || locationsLoading}
              >
                <option value="">{originCity ? "İlçe seçin (isteğe bağlı)" : "Önce il seçin"}</option>
                {originCounties.map((county) => (
                  <option key={county} value={county}>
                    {county}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="destination-city" className="text-xs uppercase text-slate-500 font-semibold">Varış ili</label>
              <select
                id="destination-city"
                value={destinationCity}
                onChange={(e) => {
                  setDestinationCity(e.target.value);
                  setDestinationCounty("");
                }}
                className="min-h-11 w-full rounded-xl border border-slate-200 px-3 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                disabled={locationsLoading}
                required
              >
                <option value="">{locationsLoading ? "Yükleniyor..." : "İl seçin"}</option>
                {cities.map((city) => (
                  <option key={city.name} value={city.name}>
                    {city.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="destination-county" className="text-xs uppercase text-slate-500 font-semibold">Varış ilçesi</label>
              <select
                id="destination-county"
                value={destinationCounty}
                onChange={(e) => setDestinationCounty(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-slate-200 px-3 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                disabled={!destinationCity || destinationCounties.length === 0 || locationsLoading}
              >
                <option value="">{destinationCity ? "İlçe seçin (isteğe bağlı)" : "Önce il seçin"}</option>
                {destinationCounties.map((county) => (
                  <option key={county} value={county}>
                    {county}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="departure-time" className="text-xs uppercase text-slate-500 font-semibold">Kalkış zamanı (isteğe bağlı)</label>
              <input
                id="departure-time"
                type="datetime-local"
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-slate-200 px-3 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <label htmlFor="use-tolls" className="min-h-11 flex items-center gap-3 text-sm text-slate-700 cursor-pointer select-none">
            <div className={`w-12 h-6 rounded-full p-1 transition-all ${useTolls ? "bg-blue-500" : "bg-slate-300"}`}>
              <div
                className={`bg-white w-4 h-4 rounded-full shadow transform transition ${useTolls ? "translate-x-6" : "translate-x-0"}`}
              />
            </div>
            Ücretli yolları kullan
            <input id="use-tolls" type="checkbox" className="sr-only" checked={useTolls} onChange={(e) => setUseTolls(e.target.checked)} />
          </label>

          {locationsError && (
            <div role="alert" className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              Lokasyon listesi alınamadı: {locationsError}. Lütfen tekrar deneyin.
            </div>
          )}
          {error && <div role="alert" className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
          {reportLink && <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Bu isteğe ait kaydı <Link className="underline font-semibold" href={reportLink}>görüntüleyin</Link>.</div>}
          {resultLink && (
            <div role="status" className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              Rapor hazır. Paylaş:{" "}
              <a className="underline font-semibold" href={resultLink} target="_blank" rel="noreferrer">
                {resultLink}
              </a>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="min-h-11 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl py-3 transition disabled:opacity-70"
          >
            {loading ? "Oluşturuluyor..." : "Rapor Oluştur"}
          </button>
        </form>
      </main>
    </div>
  );
}
