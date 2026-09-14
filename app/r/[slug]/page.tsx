"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Navigation } from "lucide-react";
import { SummaryCards } from "@/components/SummaryCards";
import { RiskCharts } from "@/components/RiskCharts";
import { CriticalPointsTable } from "@/components/CriticalPointsTable";
import { RouteSchematic } from "@/components/RouteSchematic";
import { ReportSources } from "@/components/ReportSources";
import type { RouteAnalysis } from "@/types";
import { getReportStatusKind, reportStatusMessage, shouldPollReport } from "@/lib/reportStatus";

type PublicReport = {
  id: string;
  public_slug: string;
  origin_city: string;
  origin_county: string;
  origin_lat?: number;
  origin_lng?: number;
  destination_city: string;
  destination_county: string;
  destination_lat?: number;
  destination_lng?: number;
  analysis?: RouteAnalysis | null;
  status: string;
  error_message?: string | null;
  created_at?: string | null;
};

export default function PublicReportPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;

  const [report, setReport] = useState<PublicReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchReport = async (isPolling = false) => {
    if (!slug) return;
    if (!isPolling) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/${slug}`);
      if (!res.ok) {
        setError("Paylaşılan rapor şu anda kullanıma hazır değil. Lütfen raporu oluşturan kişiyle iletişime geçin.");
        setLoading(false);
        return;
      }
      const json = await res.json();
      setReport(json.report);
    } catch (err) {
      console.error(err);
      setError("Bir hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [slug]);

  useEffect(() => {
    if (report && shouldPollReport(report)) {
      const timer = setTimeout(() => fetchReport(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [report]);

  const originLabel = report ? `${report.origin_city}${report.origin_county ? ", " + report.origin_county : ""}` : "";
  const destLabel = report
    ? `${report.destination_city}${report.destination_county ? ", " + report.destination_county : ""}`
    : "";
  const statusKind = report ? getReportStatusKind(report) : null;
  const hasAnalysis = statusKind === "ready" && Boolean(report?.analysis);
  const mapEmbedUrl =
    report && hasAnalysis
      ? `https://maps.google.com/maps?saddr=${report.origin_lat && report.origin_lng
        ? `${report.origin_lat},${report.origin_lng}`
        : encodeURIComponent(originLabel)
      }&daddr=${report.destination_lat && report.destination_lng
        ? `${report.destination_lat},${report.destination_lng}`
        : encodeURIComponent(destLabel)
      }&dirflg=d&t=m&z=6&output=embed`
      : null;

  const navigationUrl = hasAnalysis && report
    ? `https://www.google.com/maps/dir/?api=1&origin=${report.origin_lat && report.origin_lng
      ? `${report.origin_lat},${report.origin_lng}`
      : encodeURIComponent(originLabel)
    }&destination=${report.destination_lat && report.destination_lng
      ? `${report.destination_lat},${report.destination_lng}`
      : encodeURIComponent(destLabel)
    }&travelmode=driving`
    : "";

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 lg:px-8 lg:py-10">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">Sürücü Görünümü</p>
            <h1 className="text-2xl font-bold text-slate-900">{report ? `${originLabel} → ${destLabel}` : "Rapor"}</h1>
          </div>

          {report && hasAnalysis && (
            <button
              onClick={() => window.open(navigationUrl, "_blank")}
              className="min-h-11 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-6 rounded-xl shadow-sm transition-colors"
            >
              <Navigation className="w-4 h-4" /> Navigasyonu Aç
            </button>
          )}
        </div>

        {loading && <div className="text-sm text-slate-500" role="status">Yükleniyor...</div>}
        {error && <div role="alert" className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
        {report && statusKind && statusKind !== "ready" && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{reportStatusMessage(report)}</div>}

        {report && hasAnalysis && (
          <div className="space-y-6">
            <div className="bg-slate-100 border border-slate-200 rounded-2xl overflow-hidden min-h-[360px]">
              {mapEmbedUrl && (
                <iframe
                  title="Google Map"
                  width="100%"
                  height="100%"
                  style={{ border: 0, minHeight: "360px" }}
                  src={mapEmbedUrl}
                  allowFullScreen
                  loading="lazy"
                ></iframe>
              )}
            </div>

            {report.analysis && (
              <div className="space-y-8">
                {/* Summary Cards - Moved to top as requested */}
                <SummaryCards data={report.analysis.summary} weather={report.analysis.weather} />

                {/* Risk Charts */}
                <RiskCharts intensityData={report.analysis.riskIntensity} typeData={report.analysis.riskTypes} />

                {/* Critical Points Table */}
                <section>
                  <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <span className="text-2xl">🚧</span> Bölgesel Riskler ve Yol Durumu
                  </h3>
                  <CriticalPointsTable points={report.analysis.criticalPoints || []} />
                </section>

                {/* Route Schematic - Moved to bottom */}
                {report.analysis.routeSchematic && report.analysis.routeSchematic.nodes && report.analysis.routeSchematic.nodes.length > 0 && (
                  <section>
                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                      <span className="text-2xl">📍</span> Rota Şeması
                    </h3>
                    <RouteSchematic data={report.analysis.routeSchematic} />
                  </section>
                )}

                <ReportSources sources={report.analysis.groundingMetadata} />

                {/* Bottom Navigation Button */}
                <div className="pt-8 pb-12 flex justify-center">
                  <button
                    onClick={() => window.open(navigationUrl, "_blank")}
                    className="min-h-11 flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-10 rounded-2xl shadow-lg transition-all hover:scale-105 active:scale-95"
                  >
                    <Navigation className="w-5 h-5" /> Google Haritalar'da Başlat
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
