"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/apiClient";
import Header from "@/components/Header";

type CityOption = {
  name: string;
  counties: string[];
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
    setLoading(true);
    setError(null);
    setResultLink(null);

    const res = await authFetch("/api/reports", {
      method: "POST",
      body: JSON.stringify({
        originCity,
        originCounty,
        destinationCity,
        destinationCounty,
        departureTime: departureTime || null,
        useTolls
      })
    });

    if (!res.ok) {
      const text = await res.text();
      setError(text || "Rapor oluşturulamadı");
      setLoading(false);
      return;
    }

    const json = await res.json();
    const base = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    setResultLink(`${base}/r/${json.publicSlug}`);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="px-6 py-8 mx-auto max-w-4xl space-y-6">
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
              <label className="text-xs uppercase text-slate-500 font-semibold">Origin City</label>
              <select
                value={originCity}
                onChange={(e) => {
                  setOriginCity(e.target.value);
                  setOriginCounty("");
                }}
                className="w-full rounded-xl border border-slate-200 px-3 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
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
              <label className="text-xs uppercase text-slate-500 font-semibold">Origin County</label>
              <select
                value={originCounty}
                onChange={(e) => setOriginCounty(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
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
              <label className="text-xs uppercase text-slate-500 font-semibold">Destination City</label>
              <select
                value={destinationCity}
                onChange={(e) => {
                  setDestinationCity(e.target.value);
                  setDestinationCounty("");
                }}
                className="w-full rounded-xl border border-slate-200 px-3 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
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
              <label className="text-xs uppercase text-slate-500 font-semibold">Destination County</label>
              <select
                value={destinationCounty}
                onChange={(e) => setDestinationCounty(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
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
              <label className="text-xs uppercase text-slate-500 font-semibold">Departure Time (optional)</label>
              <input
                type="datetime-local"
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <label className="flex items-center gap-3 text-sm text-slate-700 cursor-pointer select-none">
            <div className={`w-12 h-6 rounded-full p-1 transition-all ${useTolls ? "bg-blue-500" : "bg-slate-300"}`}>
              <div
                className={`bg-white w-4 h-4 rounded-full shadow transform transition ${useTolls ? "translate-x-6" : "translate-x-0"}`}
              />
            </div>
            Ücretli yolları kullan
            <input type="checkbox" className="hidden" checked={useTolls} onChange={(e) => setUseTolls(e.target.checked)} />
          </label>

          {locationsError && (
            <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              Lokasyon listesi alınamadı: {locationsError}. Lütfen tekrar deneyin.
            </div>
          )}
          {error && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
          {resultLink && (
            <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              Rapor hazır. Paylaş:{" "}
              <a className="underline font-semibold" href={resultLink} target="_blank" rel="noreferrer">
                {resultLink}
              </a>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl py-3 transition disabled:opacity-70"
          >
            {loading ? "Oluşturuluyor..." : "Rapor Oluştur"}
          </button>
        </form>
      </main>
    </div>
  );
}
