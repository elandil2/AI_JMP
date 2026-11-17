"use client";

import { useState } from "react";
import { notFound } from "next/navigation";
import { SummaryCards } from "@/components/SummaryCards";
import { SourceCoverageNotice } from "@/components/SourceCoverageNotice";
import { RiskCharts } from "@/components/RiskCharts";
import { CriticalPointsTable } from "@/components/CriticalPointsTable";
import { RouteSchematic } from "@/components/RouteSchematic";
import { RouteTimeline } from "@/components/RouteTimeline";
import { ReportSources } from "@/components/ReportSources";
import type { RouteAnalysis } from "@/types";
import type { BreakPlanAudit } from "@/lib/breakPlanAudit";
import { TOTAL_MENEMEN, TOTAL_MENEMEN_COORDS } from "@/lib/totalOperation";

// Total İzmir benchmark routes (dealer coordinates from Total's location list).
const MENEMEN = { name: TOTAL_MENEMEN.name, coords: TOTAL_MENEMEN_COORDS };
const PRESETS = [
  { label: "Eskişehir — Ford Otomotiv Tepebaşı", name: "Eskişehir, Tepebaşı", coords: "39.873146,30.5739579" },
  { label: "Ankara — ABC Grup Yenimahalle", name: "Ankara, Yenimahalle", coords: "39.9484369,32.7122122" },
  { label: "İstanbul Avrupa — Asal Motorlu Araçlar", name: "İstanbul, Bahçelievler", coords: "41.019548,28.8194545" },
  { label: "Malatya — Ahmet Yıldırım Oto", name: "Malatya, Yeşilyurt", coords: "38.3572624,38.2967876" },
  { label: "Van — Bekiroğlu Pazarlama", name: "Van, Edremit", coords: "38.4895808,43.3984555" },
];
const VIA_PRESETS = [
  { label: "Yok", name: "", coords: "" },
  { label: "Aksaray üzerinden", name: "Aksaray", coords: "38.3687,34.0370" },
  { label: "Eskişehir üzerinden", name: "Eskişehir", coords: "39.7767,30.5206" },
  { label: "Afyonkarahisar üzerinden", name: "Afyonkarahisar", coords: "38.7569,30.5387" },
];

type PreviewResponse = {
  analysis: RouteAnalysis;
  audit: BreakPlanAudit;
  breakPoints: Array<{ kind: string; km: number; lat?: number; lng?: number; label: string }>;
  extendedDays: number;
  error?: string;
};

const localDateTime = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export default function RoutePreviewPage() {
  const [destination, setDestination] = useState(PRESETS[1].coords);
  const [destinationName, setDestinationName] = useState(PRESETS[1].name);
  const [via, setVia] = useState("");
  const [viaName, setViaName] = useState("");
  const [departure, setDeparture] = useState(() => {
    const tomorrow = new Date(Date.now() + 86_400_000);
    tomorrow.setHours(6, 0, 0, 0);
    return localDateTime(tomorrow);
  });
  const [mode, setMode] = useState<"plan" | "full">("plan");
  const [allowExtension, setAllowExtension] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PreviewResponse | null>(null);

  if (process.env.NODE_ENV === "production") notFound();

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/dev/route-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          origin: MENEMEN.coords, originName: MENEMEN.name,
          destination, destinationName,
          via: via || undefined, viaName: viaName || undefined,
          departureTime: new Date(departure).toISOString(),
          mode,
          ...(allowExtension ? {} : { maxExtendedDays: 0 })
        })
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Önizleme başarısız.");
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Önizleme başarısız.");
    } finally {
      setLoading(false);
    }
  };

  const hard = result?.audit.violations.filter(v => v.severity === "hard") ?? [];
  const warnings = result?.audit.violations.filter(v => v.severity === "warning") ?? [];

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Yalnızca yerel geliştirme · hiçbir şey kaydedilmez</p>
          <h1 className="text-2xl font-bold text-slate-900">Rota ve mola önizlemesi</h1>
          <p className="text-sm text-slate-600 mt-1">Çıkış: {MENEMEN.name}. Ara durak yalnızca güzergâhı belirler; yükleme/boşaltma yoktur.</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700 grid gap-1">
            Varış (Total bayi)
            <select className="border rounded-lg px-3 py-2" value={destination} onChange={e => {
              const preset = PRESETS.find(p => p.coords === e.target.value);
              setDestination(e.target.value);
              if (preset) setDestinationName(preset.name);
            }}>
              {PRESETS.map(p => <option key={p.coords} value={p.coords}>{p.label}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700 grid gap-1">
            Varış koordinatı (elle değiştirilebilir)
            <input className="border rounded-lg px-3 py-2 font-mono" value={destination} onChange={e => { setDestination(e.target.value); setDestinationName(e.target.value); }} />
          </label>
          <label className="text-sm font-medium text-slate-700 grid gap-1">
            Ara durak (güzergâh)
            <select className="border rounded-lg px-3 py-2" value={via} onChange={e => {
              const preset = VIA_PRESETS.find(p => p.coords === e.target.value);
              setVia(e.target.value);
              setViaName(preset?.name ?? "");
            }}>
              {VIA_PRESETS.map(p => <option key={p.label} value={p.coords}>{p.label}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700 grid gap-1">
            Kalkış zamanı
            <input type="datetime-local" className="border rounded-lg px-3 py-2" value={departure} onChange={e => setDeparture(e.target.value)} />
          </label>
          <fieldset className="text-sm text-slate-700 grid gap-1">
            <legend className="font-medium mb-1">Mod</legend>
            <label className="flex gap-2 items-center"><input type="radio" checked={mode === "plan"} onChange={() => setMode("plan")} /> Sadece rota + mola (Gemini yok, 1 Google isteği)</label>
            <label className="flex gap-2 items-center"><input type="radio" checked={mode === "full"} onChange={() => setMode("full")} /> Tam rapor (Gemini dahil, canlıdaki akışın aynısı)</label>
          </fieldset>
          <label className="text-sm text-slate-700 flex gap-2 items-center">
            <input type="checkbox" checked={allowExtension} onChange={e => setAllowExtension(e.target.checked)} />
            10 saatlik uzatılmış sürüş gününe izin ver (haftada en fazla 2)
          </label>
          <div className="md:col-span-2">
            <button onClick={run} disabled={loading} className="bg-blue-600 text-white px-5 py-2 rounded-lg font-medium disabled:opacity-50">
              {loading ? (mode === "full" ? "Tam rapor hazırlanıyor (1–2 dk)…" : "Hesaplanıyor…") : "Önizle"}
            </button>
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">{error}</div>}

        {result && (
          <>
            <section className={`rounded-xl border p-5 ${hard.length ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200"}`}>
              <h2 className="font-semibold text-slate-900 mb-2">Bağımsız kural denetimi</h2>
              <p className="text-sm text-slate-700">
                {hard.length ? `${hard.length} sert ihlal` : "Sert kural ihlali yok (4,5 sa kesintisiz · 9 sa / 10 sa günlük · 13 sa görev penceresi)"}
                {" · "}Sürüş bölümleri: {result.audit.stints.map(s => `${s.drivingHours.toFixed(2)} sa`).join(" → ")}
                {" · "}Gece sürüşü: %{Math.round((result.audit.nightDrivingShare ?? 0) * 100)}
                {result.audit.arrivalHourLocal !== undefined && ` · Varış saati ≈ ${result.audit.arrivalHourLocal}:00`}
                {result.extendedDays > 0 && ` · ${result.extendedDays} gün 10 sa uzatma kullanıldı`}
              </p>
              {[...hard, ...warnings].length > 0 && (
                <ul className="mt-2 text-sm list-disc pl-5 space-y-1">
                  {[...hard, ...warnings].map((v, i) => <li key={i} className={v.severity === "hard" ? "text-red-700" : "text-amber-800"}>{v.message}</li>)}
                </ul>
              )}
              {result.breakPoints.length > 0 && (
                <div className="mt-3 text-sm">
                  <p className="font-medium text-slate-800">Mola noktaları (haritada kontrol et):</p>
                  <ul className="mt-1 space-y-1">
                    {result.breakPoints.map((p, i) => (
                      <li key={i}>
                        {p.kind === "daily_rest" ? "11 sa dinlenme" : "45 dk mola"} · {p.km} km ·{" "}
                        {p.lat !== undefined
                          ? <a className="text-blue-700 underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`}>{p.lat.toFixed(4)}, {p.lng!.toFixed(4)}</a>
                          : "koordinat yok"}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <SummaryCards data={result.analysis.summary} weather={result.analysis.weather} />
            <SourceCoverageNotice analysis={result.analysis} />
            {mode === "full" && (
              <>
                <RiskCharts intensityData={result.analysis.riskIntensity} typeData={result.analysis.riskTypes} trafficCoverage={result.analysis.summary.mapboxTrafficCoverage} />
                <CriticalPointsTable points={result.analysis.criticalPoints || []} weather={result.analysis.weather} totalDistance={result.analysis.summary.totalDistance} />
              </>
            )}
            {result.analysis.timeline?.length > 0 && <RouteTimeline events={result.analysis.timeline} />}
            {result.analysis.routeSchematic && result.analysis.routeSchematic.nodes.length > 0 && <RouteSchematic data={result.analysis.routeSchematic} />}
            {mode === "full" && <ReportSources sources={result.analysis.groundingMetadata} routeSchematic={result.analysis.routeSchematic} />}
          </>
        )}
      </div>
    </div>
  );
}
