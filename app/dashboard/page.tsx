"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Copy, Check, Trash2, Upload, Plus, Download, FileText } from "lucide-react";
import { authFetch } from "@/lib/apiClient";
import Header from "@/components/Header";
import { publicReportUrl } from "@/lib/publicReportUrl";
import { getReportStatusKind, reportStatusLabel, reportStatusMessage, shouldPollReport, type ReportStatusKind } from "@/lib/reportStatus";

type ReportListItem = {
  id: string;
  public_slug: string;
  origin_city: string;
  destination_city: string;
  status: string;
  created_at: string;
  error_message?: string | null;
};

// Dispatch-board palette: warm paper, ink navy, one signal red. Used only on this screen.
const INK = "#14213D";
const SIGNAL = "#D7192D";
const MONO = "font-['IBM_Plex_Mono',ui-monospace,monospace]";
const SANS = "font-['IBM_Plex_Sans',Inter,system-ui,sans-serif]";

const statusDot: Record<ReportStatusKind, string> = {
  ready: "bg-emerald-600",
  failed: "bg-[#D7192D]",
  preparing: "bg-amber-500 animate-pulse",
  "needs-attention": "bg-orange-500"
};
const statusText: Record<ReportStatusKind, string> = {
  ready: "text-emerald-800",
  failed: "text-[#B3121F]",
  preparing: "text-amber-800",
  "needs-attention": "text-orange-800"
};

const TZ = "Europe/Istanbul";
const dayKey = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: TZ });
const titleCase = (value: string) => value.toLocaleUpperCase("tr-TR");

const dayLabel = (key: string, todayKey: string, yesterdayKey: string) => {
  if (key === todayKey) return "Bugün";
  if (key === yesterdayKey) return "Dün";
  return new Date(`${key}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });
};

export default function DashboardPage() {
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  const fetchReports = async (isPolling = false) => {
    if (!isPolling) setLoading(true);
    setError(null);
    try {
      const res = await authFetch("/api/reports");
      if (!res.ok) {
        setError("Raporlar şu anda yüklenemedi. Lütfen daha sonra tekrar deneyin.");
        setLoading(false);
        return;
      }
      const json = await res.json();
      setReports(json.reports || []);
    } catch (err) {
      console.error(err);
      setError("Bir hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  useEffect(() => {
    if (reports.some(r => shouldPollReport(r))) {
      const timer = setTimeout(() => fetchReports(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [reports]);

  const copyLink = async (slug: string) => {
    await navigator.clipboard.writeText(publicReportUrl(slug, window.location.origin, process.env.NEXT_PUBLIC_APP_URL));
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(current => (current === slug ? null : current)), 1600);
  };

  const deleteReport = async (id: string) => {
    if (!confirm("Bu raporu silmek istediğinize emin misiniz?")) return;
    setDeletingIds(prev => new Set(prev).add(id));
    try {
      const res = await authFetch(`/api/reports/${id}`, { method: "DELETE" });
      if (res.ok) {
        setReports(prev => prev.filter(r => r.id !== id));
        setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      } else {
        alert("Silme işlemi başarısız oldu.");
      }
    } catch (err) {
      console.error(err);
      alert("Bir hata oluştu.");
    } finally {
      setDeletingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  const deleteSelected = async () => {
    if (!confirm(`${selectedIds.size} raporu silmek istediğinize emin misiniz?`)) return;
    const idsToDelete = Array.from(selectedIds);
    setDeletingIds(new Set([...deletingIds, ...idsToDelete]));
    for (const id of idsToDelete) {
      try { await authFetch(`/api/reports/${id}`, { method: "DELETE" }); } catch (e) { console.error(e); }
    }
    await fetchReports(true);
    setSelectedIds(new Set());
    setDeletingIds(new Set());
  };

  const exportSelected = async () => {
    setExporting(true);
    try {
      const res = await authFetch("/api/reports/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) })
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = `reports_export_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Dışa aktarma başarısız oldu.");
    } finally {
      setExporting(false);
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };
  const allSelected = reports.length > 0 && selectedIds.size === reports.length;
  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(reports.map(r => r.id)));

  const processingCount = reports.filter(r => shouldPollReport(r)).length;
  const needsAttention = reports.filter(r => getReportStatusKind(r) === "needs-attention");

  const stats = useMemo(() => {
    const now = Date.now();
    const weekAgo = now - 7 * 86_400_000;
    const thisWeek = reports.filter(r => Date.parse(r.created_at) >= weekAgo).length;
    const ready = reports.filter(r => getReportStatusKind(r) === "ready").length;
    const failed = reports.filter(r => getReportStatusKind(r) === "failed").length;
    const destinations = new Map<string, number>();
    for (const r of reports) {
      const key = r.destination_city.trim().toLocaleLowerCase("tr-TR");
      destinations.set(key, (destinations.get(key) ?? 0) + 1);
    }
    const topDestinations = [...destinations.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    return { thisWeek, ready, failed, topDestinations, topMax: topDestinations[0]?.[1] ?? 1 };
  }, [reports]);

  const groups = useMemo(() => {
    const todayKey = dayKey(new Date());
    const yesterdayKey = dayKey(new Date(Date.now() - 86_400_000));
    const byDay = new Map<string, ReportListItem[]>();
    for (const r of reports) {
      const key = dayKey(new Date(r.created_at));
      byDay.set(key, [...(byDay.get(key) ?? []), r]);
    }
    return [...byDay.entries()].map(([key, items]) => ({ key, label: dayLabel(key, todayKey, yesterdayKey), items }));
  }, [reports]);

  const today = new Date().toLocaleDateString("tr-TR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });

  return (
    <div className={`min-h-screen bg-[#F4F2EE] ${SANS}`}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" />
      <Header />

      {/* Masthead */}
      <section className="border-b border-[#14213D]/10 bg-[#14213D] text-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-6 pb-5">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className={`${MONO} text-[11px] uppercase tracking-[0.14em] text-white/60`}>Sefer güvenlik panosu · {today}</p>
              <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight">Rota raporları</h1>
              <p className="mt-2 max-w-xl text-sm text-white/65">Her rapor bir seferin yol, mola ve risk planıdır. Yeni sefer için rapor oluştur, sürücüyle bağlantısını paylaş.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/reports/new" className="group inline-flex min-h-11 items-center gap-2 rounded-md bg-[#D7192D] px-4 text-sm font-semibold text-white shadow-[0_1px_0_rgba(255,255,255,0.2)_inset] hover:bg-[#BC1527] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                <Plus className="h-4 w-4" /> Yeni rapor
              </Link>
              <Link href="/reports/batch" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-white/25 px-4 text-sm font-medium text-white/90 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                <Upload className="h-4 w-4" /> Toplu CSV yükle
              </Link>
            </div>
          </div>

          {/* Counters: a single ruled strip, not floating cards */}
          <dl className="mt-6 grid grid-cols-2 sm:grid-cols-4 border-y border-white/10">
            {[
              { label: "Toplam rapor", value: reports.length },
              { label: "Son 7 gün", value: stats.thisWeek },
              { label: "Hazır", value: stats.ready },
              { label: "Hazırlanıyor", value: processingCount, live: processingCount > 0 }
            ].map(item => (
              <div key={item.label} className="py-4 pr-4 even:border-l even:border-white/10 even:pl-4 sm:border-l sm:border-white/10 sm:pl-4 sm:first:border-l-0 sm:first:pl-0">
                <dt className={`${MONO} text-[10px] uppercase tracking-[0.12em] text-white/60`}>{item.label}</dt>
                <dd className={`${MONO} mt-1 flex items-center gap-2 text-3xl font-medium tabular-nums`}>
                  {loading && !reports.length ? "—" : item.value}
                  {item.live && <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" aria-hidden />}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
        <div className="space-y-3 mb-6">
          {processingCount > 0 && (
            <div role="status" className="flex items-center gap-3 rounded-md border-l-4 border-amber-500 bg-white px-4 py-3 text-sm text-slate-700">
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500 animate-pulse" />
              Arka planda {processingCount} rapor hazırlanıyor. Bitince liste kendiliğinden güncellenir.
            </div>
          )}
          {needsAttention.length > 0 && (
            <div role="alert" className="rounded-md border-l-4 border-orange-500 bg-white px-4 py-3 text-sm text-orange-900">
              {needsAttention.length} rapor 15 dakika içinde tamamlanmadı. Otomatik yenileme durduruldu; kayıtlar değiştirilmedi. {reportStatusMessage(needsAttention[0])}
            </div>
          )}
          {error && <div role="alert" className="rounded-md border-l-4 border-[#D7192D] bg-white px-4 py-3 text-sm text-[#B3121F]">{error}</div>}
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
          {/* Board */}
          <section aria-labelledby="board-title">
            <div className="mb-3 flex min-h-11 items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  aria-label="Tüm raporları seç"
                  className="h-4 w-4 cursor-pointer accent-[#14213D]"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  disabled={!reports.length}
                />
                <h2 id="board-title" className={`${MONO} text-[11px] uppercase tracking-[0.14em] text-slate-500`}>
                  {selectedIds.size > 0 ? `${selectedIds.size} rapor seçildi` : "Sefer listesi"}
                </h2>
              </div>
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-1">
                  <button onClick={exportSelected} disabled={exporting} className="inline-flex min-h-9 items-center gap-1.5 rounded px-3 text-xs font-semibold text-[#14213D] hover:bg-[#14213D]/5 disabled:opacity-50">
                    <Download className="h-3.5 w-3.5" /> {exporting ? "İndiriliyor…" : "CSV indir"}
                  </button>
                  <button onClick={deleteSelected} className="inline-flex min-h-9 items-center gap-1.5 rounded px-3 text-xs font-semibold text-[#B3121F] hover:bg-[#D7192D]/5">
                    <Trash2 className="h-3.5 w-3.5" /> Seçilenleri sil
                  </button>
                </div>
              )}
            </div>

            {loading && !reports.length && (
              <div className="space-y-px overflow-hidden rounded-md border border-[#14213D]/10" role="status" aria-label="Yükleniyor">
                {[0, 1, 2, 3].map(i => <div key={i} className="h-16 animate-pulse bg-white" />)}
              </div>
            )}

            {!loading && !reports.length && !error && (
              <div className="rounded-md border border-dashed border-[#14213D]/20 bg-white px-6 py-14 text-center">
                <FileText className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 font-medium text-slate-800">Henüz rapor yok</p>
                <p className="mt-1 text-sm text-slate-500">İlk seferin rota, mola ve risk planını oluştur.</p>
                <Link href="/reports/new" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md bg-[#14213D] px-4 text-sm font-semibold text-white hover:bg-[#0E1830]">
                  <Plus className="h-4 w-4" /> Yeni rapor
                </Link>
              </div>
            )}

            <div className="space-y-6">
              {groups.map(group => (
                <div key={group.key}>
                  <h3 className={`${MONO} mb-2 flex items-center gap-3 text-[11px] uppercase tracking-[0.12em] text-slate-500`}>
                    {group.label}
                    <span className="h-px flex-1 bg-[#14213D]/10" />
                    <span className="tabular-nums">{group.items.length}</span>
                  </h3>
                  <ul className="overflow-hidden rounded-md border border-[#14213D]/10 bg-white divide-y divide-[#14213D]/[0.07]">
                    {group.items.map(r => {
                      const kind = getReportStatusKind(r);
                      const selected = selectedIds.has(r.id);
                      const time = new Date(r.created_at).toLocaleTimeString("tr-TR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
                      return (
                        <li key={r.id} className={`group relative flex items-center gap-3 px-3 sm:px-4 py-3 transition-colors ${selected ? "bg-[#14213D]/[0.04]" : "hover:bg-[#F9F8F6]"}`}>
                          <span className={`absolute inset-y-0 left-0 w-[3px] ${selected ? "bg-[#14213D]" : "bg-transparent"}`} aria-hidden />
                          <input
                            type="checkbox"
                            aria-label={`${r.origin_city} ile ${r.destination_city} raporunu seç`}
                            className="h-4 w-4 shrink-0 cursor-pointer accent-[#14213D]"
                            checked={selected}
                            onChange={() => toggleSelect(r.id)}
                          />
                          <span className={`${MONO} hidden w-12 shrink-0 text-xs tabular-nums text-slate-400 sm:block`}>{time}</span>
                          <Link href={`/reports/${r.id}`} className="min-w-0 flex-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#14213D]">
                            <span className="flex min-w-0 items-center gap-2 text-[15px] font-semibold tracking-tight text-[#14213D]">
                              <span className="truncate">{titleCase(r.origin_city)}</span>
                              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#D7192D]" />
                              <span className="truncate">{titleCase(r.destination_city)}</span>
                            </span>
                            <span className={`mt-0.5 flex items-center gap-1.5 text-xs ${statusText[kind]}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${statusDot[kind]}`} />
                              {reportStatusLabel(kind)}
                              <span className={`${MONO} text-slate-400 sm:hidden`}>· {time}</span>
                            </span>
                          </Link>
                          <div className="flex shrink-0 items-center gap-0.5 sm:opacity-80 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                            <button
                              onClick={() => copyLink(r.public_slug)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded text-slate-500 hover:bg-[#14213D]/5 hover:text-[#14213D]"
                              aria-label="Sürücü bağlantısını kopyala"
                              title="Sürücü bağlantısını kopyala"
                            >
                              {copiedSlug === r.public_slug ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                            </button>
                            <button
                              onClick={() => deleteReport(r.id)}
                              disabled={deletingIds.has(r.id)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded text-slate-500 hover:bg-[#D7192D]/5 hover:text-[#B3121F] disabled:opacity-40"
                              aria-label="Raporu sil"
                              title="Raporu sil"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                            <Link href={`/reports/${r.id}`} className="ml-1 hidden min-h-9 items-center rounded px-2.5 text-xs font-semibold text-[#14213D] hover:bg-[#14213D]/5 sm:inline-flex">
                              Aç
                            </Link>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* Side rail */}
          <aside className="space-y-8 lg:pt-14">
            <section aria-labelledby="dest-title">
              <h2 id="dest-title" className={`${MONO} mb-3 text-[11px] uppercase tracking-[0.14em] text-slate-500`}>En sık varış</h2>
              {stats.topDestinations.length === 0 ? (
                <p className="text-sm text-slate-500">Rapor oluştukça burada görünür.</p>
              ) : (
                <ol className="space-y-2.5">
                  {stats.topDestinations.map(([city, count]) => (
                    <li key={city}>
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="font-medium text-[#14213D]">{titleCase(city)}</span>
                        <span className={`${MONO} text-xs tabular-nums text-slate-500`}>{count}</span>
                      </div>
                      <div className="mt-1 h-1 rounded-full bg-[#14213D]/10">
                        <div className="h-1 rounded-full bg-[#14213D]" style={{ width: `${Math.max(8, (count / stats.topMax) * 100)}%` }} />
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="rounded-md border border-[#14213D]/10 bg-white p-4">
              <h2 className={`${MONO} text-[11px] uppercase tracking-[0.14em] text-slate-500`}>Planlama kuralları</h2>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                <li className="flex gap-2"><span className={`${MONO} w-14 shrink-0 whitespace-nowrap text-[#D7192D]`}>4,5 sa</span> kesintisiz sürüşten sonra 45 dk mola</li>
                <li className="flex gap-2"><span className={`${MONO} w-14 shrink-0 whitespace-nowrap text-[#D7192D]`}>9 sa</span> günlük sürüş, haftada 2 gün 10 sa</li>
                <li className="flex gap-2"><span className={`${MONO} w-14 shrink-0 whitespace-nowrap text-[#D7192D]`}>11 sa</span> günlük dinlenme</li>
                <li className="flex gap-2"><span className={`${MONO} w-14 shrink-0 whitespace-nowrap text-[#D7192D]`}>60</span> km/sa planlama hızı</li>
              </ul>
            </section>

            {stats.failed > 0 && (
              <p className="text-xs text-slate-500">
                <span className={`${MONO} text-[#B3121F]`}>{stats.failed}</span> rapor tamamlanamadı; ayrıntı rapor sayfasında.
              </p>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
