"use client";

import { useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/apiClient";
import Header from "@/components/Header";

type BatchResult = { row: number; status: string; error?: string };

export default function BatchUploadPage() {
  const [csv, setCsv] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [results, setResults] = useState<BatchResult[] | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const processFile = (selectedFile: File) => {
    if (selectedFile && selectedFile.name.endsWith(".csv")) {
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onload = (e) => {
        setCsv(e.target?.result as string);
        setError(null);
      };
      reader.onerror = () => {
        setError("Dosya okunamadı.");
        setCsv("");
      };
      reader.readAsText(selectedFile);
    } else {
      setError("Lütfen geçerli bir .csv dosyası yükleyin.");
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      processFile(selectedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      processFile(droppedFile);
    }
  };

  const submit = async () => {
    if (!csv.trim()) {
      setError("Lütfen bir CSV dosyası seçin.");
      return;
    }
    setLoading(true);
    setError(null);
    setResults(null);
    setBatchId(null);

    const res = await authFetch("/api/reports/batch", {
      method: "POST",
      body: JSON.stringify({
        csv,
        useTolls,
        departureTime: startTime ? new Date(startTime).toISOString() : undefined
      })
    });

    if (!res.ok) {
      const text = await res.text();
      setError(text || "CSV yüklenemedi");
      setLoading(false);
      return;
    }

    const json = await res.json();
    setResults(json.results || []);
    setBatchId(json.batchId || null);
    setLoading(false);
  };

  // Global Settings State
  const [useTolls, setUseTolls] = useState(true);
  const [startTime, setStartTime] = useState("");

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="px-4 py-6 lg:px-8 lg:py-10 mx-auto w-full max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500 font-semibold">Toplu Rota</p>
            <h1 className="text-2xl font-bold text-slate-900">CSV Yükle</h1>
            <p className="text-sm text-slate-600">
              Her satır: Origin City, Origin County, Destination City, Destination County
            </p>
          </div>
          {/* Dashboard link removed */}
        </div>

        {/* Global Settings Panel */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 flex flex-wrap gap-6 items-end">
          <div className="flex items-center gap-3">
            <div className="flex items-center h-5">
              <input
                id="useTolls"
                type="checkbox"
                checked={useTolls}
                onChange={(e) => setUseTolls(e.target.checked)}
                className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
            </div>
            <div className="text-sm">
              <label htmlFor="useTolls" className="font-medium text-slate-700">Ücretli Yolları Kullan</label>
              <p className="text-slate-500 text-xs">İşaretlenmezse ücretsiz rotalar tercih edilir.</p>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="startTime" className="block text-sm font-medium text-slate-700">
              Başlangıç Zamanı (İsteğe Bağlı)
            </label>
            <input
              type="datetime-local"
              id="startTime"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
            />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow p-6 space-y-4">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex flex-col gap-2 border-2 border-dashed rounded-xl p-6 transition-colors ${isDragging ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-blue-400"
              }`}
          >
            <label className="block text-sm font-medium text-slate-700 text-center cursor-pointer">
              <span className="text-blue-600 font-semibold">Dosya seçin</span> veya sürükleyip bırakın (.csv)
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
            {file && (
              <p className="text-xs text-center text-slate-500 mt-1">
                Seçilen dosya: <span className="font-medium text-slate-900">{file.name}</span>
              </p>
            )}
          </div>

          <div className="relative">
            <div className="absolute top-3 left-3 pointer-events-none">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Manuel Giriş</span>
            </div>
            <textarea
              className="w-full h-40 rounded-xl border border-slate-200 bg-slate-50 px-3 pt-8 pb-2 text-sm text-slate-900 font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              placeholder="Origin City, Origin County, Destination City, Destination County"
            />
          </div>
          {error && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}
          <button
            onClick={submit}
            disabled={loading || !csv.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl px-5 py-3 disabled:opacity-70"
          >
            {loading ? "Yükleniyor..." : "CSV Gönder"}
          </button>

          {results && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-800">
                Sonuçlar {batchId ? `| Batch: ${batchId}` : ""}
              </p>
              <div className="overflow-hidden border border-slate-200 rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-700">
                    <tr>
                      <th className="p-2 text-left">Satır</th>
                      <th className="p-2 text-left">Durum</th>
                      <th className="p-2 text-left">Hata</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {results.map((r) => (
                      <tr key={r.row}>
                        <td className="p-2 font-semibold text-slate-900">{r.row + 1}</td>
                        <td className="p-2">
                          <span
                            className={`px-2 py-1 rounded-full text-xs ${r.status === "ready"
                              ? "bg-emerald-100 text-emerald-700"
                              : r.status === "failed"
                                ? "bg-rose-100 text-rose-700"
                                : "bg-slate-200 text-slate-700"
                              }`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="p-2 text-slate-600">{r.error || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
