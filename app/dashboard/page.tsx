"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/apiClient";
import Header from "@/components/Header";

type ReportListItem = {
  id: string;
  public_slug: string;
  origin_city: string;
  destination_city: string;
  status: string;
  created_at: string;
};

export default function DashboardPage() {
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New state for selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  const fetchReports = async (isPolling = false) => {
    if (!isPolling) setLoading(true);
    setError(null);
    try {
      const res = await authFetch("/api/reports");
      if (!res.ok) {
        const text = await res.text();
        setError(text || "Raporlar alınamadı");
        setLoading(false);
        return;
      }
      const json = await res.json();
      setReports(json.reports || []);
      // Reset selection if list changes drastically or simplify logic
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
    const processing = reports.some(r => ['processing', 'pending', 'creating'].includes(r.status));
    if (processing) {
      const timer = setTimeout(() => fetchReports(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [reports]);

  const copyLink = async (slug: string) => {
    const base = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    const url = `${base}/r/${slug}`;
    await navigator.clipboard.writeText(url);
  };

  const deleteReport = async (id: string) => {
    if (!confirm("Bu raporu silmek istediğinize emin misiniz?")) return;

    setDeletingIds(prev => new Set(prev).add(id));
    try {
      const res = await authFetch(`/api/reports/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setReports(prev => prev.filter(r => r.id !== id));
        setSelectedIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } else {
        alert("Silme işlemi başarısız oldu.");
      }
    } catch (err) {
      console.error(err);
      alert("Bir hata oluştu.");
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  const deleteSelected = async () => {
    if (!confirm(`${selectedIds.size} raporu silmek istediğinize emin misiniz?`)) return;

    const idsToDelete = Array.from(selectedIds);
    // Optimistic update could be tricky with multiple fails, so let's just process
    const newDeleting = new Set(deletingIds);
    idsToDelete.forEach(id => newDeleting.add(id));
    setDeletingIds(newDeleting);

    for (const id of idsToDelete) {
      try {
        await authFetch(`/api/reports/${id}`, { method: 'DELETE' });
      } catch (e) { console.error(e) }
    }

    // Refresh list
    await fetchReports(true);
    setSelectedIds(new Set());
    setDeletingIds(new Set());
  }

  const exportSelected = async () => {
    setExporting(true);
    try {
      const res = await authFetch("/api/reports/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) })
      });

      if (!res.ok) throw new Error("Export failed");

      // Trigger download
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
  }

  const processingCount = reports.filter(r => ['processing', 'pending', 'creating'].includes(r.status)).length;

  // Handler for individual checkbox
  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  // Handler for "Select All"
  const toggleSelectAll = () => {
    if (selectedIds.size === reports.length && reports.length > 0) {
      setSelectedIds(new Set()); // Deselect all
    } else {
      setSelectedIds(new Set(reports.map(r => r.id))); // Select all
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="px-6 py-8 mx-auto max-w-5xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">Dashboard</p>
            <h1 className="text-2xl font-bold text-slate-900">Raporlar</h1>

            {/* Selection stats */}
            {selectedIds.size > 0 && (
              <div className="mt-2 text-sm font-medium flex gap-4 items-center">
                <span className="text-blue-600">{selectedIds.size} rapor seçildi</span>

                <button
                  onClick={exportSelected}
                  disabled={exporting}
                  className="text-slate-600 hover:text-slate-900 text-xs uppercase font-bold tracking-wide flex items-center gap-1 disabled:opacity-50"
                >
                  {exporting ? "İndiriliyor..." : "CSV İndir (Export)"}
                </button>

                <div className="h-4 w-px bg-slate-300 mx-1"></div>

                <button onClick={deleteSelected} className="text-rose-600 hover:text-rose-800 text-xs uppercase font-bold tracking-wide">
                  Seçilenleri Sil
                </button>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <Link href="/reports/new" className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-xl">
              Rapor Oluştur
            </Link>
            <Link href="/reports/batch" className="border border-slate-300 px-4 py-2 rounded-xl text-slate-800 font-semibold">
              CSV Yükle
            </Link>
          </div>
        </header>

        {processingCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3 text-amber-800">
            {/* Uses a pulse animation instead of a spinner to distinguish from page loading */}
            <div className="h-3 w-3 rounded-full bg-amber-500 animate-pulse"></div>
            <span className="font-medium text-sm">
              Arka planda {processingCount} rapor hazırlanıyor. Bu işlem tamamlandığında sayfa otomatik güncellenecektir.
            </span>
          </div>
        )}

        {loading && !reports.length && <div className="text-sm text-slate-500">Yükleniyor...</div>}
        {error && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}

        {!loading && !reports.length && <div className="text-sm text-slate-500">Henüz rapor yok.</div>}

        {reports.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="p-3 w-10">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      checked={reports.length > 0 && selectedIds.size === reports.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="p-3 text-left">Rota</th>
                  <th className="p-3 text-left">Durum</th>
                  <th className="p-3 text-left">Tarih</th>
                  <th className="p-3 text-left">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reports.map((r) => (
                  <tr key={r.id} className={`hover:bg-slate-50 ${selectedIds.has(r.id) ? 'bg-blue-50/50' : ''}`}>
                    <td className="p-3 w-10">
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                      />
                    </td>
                    <td className="p-3 font-semibold text-slate-900">
                      {r.origin_city} → {r.destination_city}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded-full text-xs ${r.status === 'ready' ? 'bg-emerald-100 text-emerald-700' :
                        r.status === 'failed' ? 'bg-rose-100 text-rose-700' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="p-3 text-slate-600">{new Date(r.created_at).toLocaleString("tr-TR")}</td>
                    <td className="p-3 flex gap-3">
                      <Link href={`/reports/${r.id}`} className="text-blue-600 hover:text-blue-800 text-xs font-semibold">
                        Detay
                      </Link>
                      <button
                        onClick={() => copyLink(r.public_slug)}
                        className="text-slate-600 hover:text-slate-900 text-xs font-semibold"
                      >
                        Kopyala
                      </button>

                      <button
                        onClick={() => deleteReport(r.id)}
                        disabled={deletingIds.has(r.id)}
                        className="text-rose-600 hover:text-rose-900 text-xs font-semibold disabled:opacity-50"
                      >
                        {deletingIds.has(r.id) ? "..." : "Sil"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
