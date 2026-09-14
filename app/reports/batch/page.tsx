"use client";

import { useCallback, useEffect, useState } from "react";
import Header from "@/components/Header";
import { authFetch } from "@/lib/apiClient";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

type BatchItem = { id: string; row_index: number; raw_json: { originCity: string; originCounty?: string; destinationCity: string; destinationCounty?: string }; status: string; error_message?: string | null; attempt_count: number; route_source?: string | null; maps_error_code?: string | null };
type BatchStatus = { batch: { id: string; status: string; model: string }; items: BatchItem[]; cost: { usd: number; unknown: boolean } };

const SAVED_BATCH_KEY = "jmp.batch.last-id";

export default function BatchUploadPage() {
  const [csv, setCsv] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [batch, setBatch] = useState<BatchStatus | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [useTolls, setUseTolls] = useState(true);
  const [startTime, setStartTime] = useState("");
  const [model, setModel] = useState("gemini-2.5-flash");

  const loadBatch = useCallback(async (id: string, quiet = false) => {
    const response = await authFetch(`/api/reports/batch/${id}`);
    if (!response.ok) {
      if (!quiet) setError((await response.json().catch(() => ({ error: "Batch status could not be loaded" }))).error);
      return;
    }
    setBatch(await response.json());
  }, []);

  useEffect(() => {
    const restore = async () => {
      const saved = window.localStorage.getItem(SAVED_BATCH_KEY);
      if (saved) { setBatchId(saved); await loadBatch(saved, true); }
      const supabase = getSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
      setIsAdmin(Boolean(profile?.is_admin));
    };
    void restore();
  }, [loadBatch]);

  useEffect(() => {
    if (!batchId || !batch || !["pending", "processing"].includes(batch.batch.status)) return;
    const interval = window.setInterval(() => void loadBatch(batchId, true), 3000);
    return () => window.clearInterval(interval);
  }, [batch, batchId, loadBatch]);

  const processFile = (selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith(".csv")) { setError("Lütfen geçerli bir .csv dosyası yükleyin."); return; }
    setFile(selectedFile);
    const reader = new FileReader();
    reader.onload = (event) => { setCsv(event.target?.result as string); setError(null); };
    reader.onerror = () => { setError("Dosya okunamadı."); setCsv(""); };
    reader.readAsText(selectedFile, "utf-8");
  };

  const submit = async () => {
    if (!csv.trim()) { setError("Lütfen bir CSV dosyası seçin."); return; }
    setLoading(true); setError(null);
    const response = await authFetch("/api/reports/batch", { method: "POST", body: JSON.stringify({ csv, fileName: file?.name, useTolls, departureTime: startTime ? new Date(startTime).toISOString() : null, model }) });
    const json = await response.json().catch(() => ({ error: "CSV yüklenemedi" }));
    setLoading(false);
    if (!response.ok) { setError(json.errors?.join("; ") || json.error); return; }
    setIsAdmin(Boolean(json.isAdmin));
    setBatchId(json.batchId);
    window.localStorage.setItem(SAVED_BATCH_KEY, json.batchId);
    await loadBatch(json.batchId);
  };

  const processNext = async () => {
    if (!batchId) return;
    setRunning(true); setError(null);
    const response = await authFetch(`/api/reports/batch/${batchId}/next`, { method: "POST" });
    const json = await response.json().catch(() => ({ error: "Satır işlenemedi" }));
    setRunning(false);
    if (!response.ok) setError(json.error || "Satır işlenemedi");
    await loadBatch(batchId, true);
  };

  const active = batch?.batch.status !== "failed" && batch?.batch.status !== "completed" && (batch?.items.some((item) => item.status === "pending") ?? false);
  return <div className="min-h-screen bg-slate-50">
    <Header />
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 lg:px-8 lg:py-10">
      <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Toplu Rota</p><h1 className="text-2xl font-bold text-slate-900">CSV Kuyruğu</h1><p className="text-sm text-slate-600">En fazla 10 farklı rota. Her satır: Origin City, Origin County, Destination City, Destination County.</p><p className="mt-1 text-sm font-medium text-amber-700">Kuyruk oluşturmak ücretli çağrı başlatmaz. Her satır yalnızca “Sonraki satırı işle” ile tek tek çalışır ve her satırdan sonra operatör incelemesi için durur.</p></div>
      <div className="flex flex-wrap items-end gap-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="flex items-center gap-3 text-sm text-slate-700"><input type="checkbox" checked={useTolls} onChange={(event) => setUseTolls(event.target.checked)} className="h-5 w-5 rounded" />Ücretli yolları kullan</label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">Başlangıç zamanı<input type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2" /></label>
        {isAdmin ? <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">Model<select value={model} onChange={(event) => setModel(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2"><option value="gemini-2.5-flash">Gemini 2.5 Flash</option><option value="gemini-3.8-flash">Gemini 3.8 Flash</option></select></label> : <p className="text-sm text-slate-600">Model: Gemini 2.5 Flash</p>}
      </div>
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow">
        <div onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={(event) => { event.preventDefault(); setIsDragging(false); const dropped = event.dataTransfer.files[0]; if (dropped) processFile(dropped); }} className={`rounded-xl border-2 border-dashed p-6 text-center focus-within:outline focus-within:outline-2 focus-within:outline-blue-600 ${isDragging ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}><label className="cursor-pointer text-sm text-slate-700"><span className="font-semibold text-blue-600">Dosya seçin</span> veya sürükleyip bırakın (.csv)<input type="file" accept=".csv,text/csv" aria-label="CSV dosyası seç" onChange={(event) => { const selected = event.target.files?.[0]; if (selected) processFile(selected); }} className="sr-only" /></label>{file && <p className="mt-2 text-xs text-slate-500">Seçilen dosya: {file.name}</p>}</div>
        <label htmlFor="batch-csv" className="text-sm font-medium text-slate-700">CSV satırları</label>
        <textarea id="batch-csv" className="h-40 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-sm focus:outline focus:outline-2 focus:outline-blue-600" value={csv} onChange={(event) => setCsv(event.target.value)} placeholder="İstanbul,,Ankara," />
        {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <button onClick={() => void submit()} disabled={loading || !csv.trim()} className="min-h-11 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-70">{loading ? "Kuyruk oluşturuluyor..." : "CSV kuyruğunu oluştur"}</button>
      </section>
      {batch && <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-900">Batch: {batch.batch.id}</h2><p className="text-sm text-slate-600">Durum: {batch.batch.status} · Model: {batch.batch.model} · Çalışan maliyet: ${batch.cost.usd.toFixed(4)}{batch.cost.unknown ? " (BİLİNMİYOR — durduruldu)" : ""}</p></div><button onClick={() => void processNext()} disabled={running || !active || batch.cost.unknown} className="min-h-11 rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white disabled:opacity-60">{running ? "Bir satır işleniyor..." : "Sonraki satırı işle"}</button></div><div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-slate-700"><tr><th className="p-2">Satır</th><th className="p-2">Rota</th><th className="p-2">Durum</th><th className="p-2">Kaynak</th><th className="p-2">Deneme</th><th className="p-2">Hata</th></tr></thead><tbody>{batch.items.map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="p-2">{item.row_index + 1}</td><td className="p-2">{item.raw_json.originCity} → {item.raw_json.destinationCity}</td><td className="p-2">{item.status}</td><td className="p-2">{item.route_source === "maps" ? "Maps" : item.route_source === "gemini_fallback" ? "Gemini tahmini" : item.route_source === "unavailable" ? "Belirsiz" : "-"}{item.maps_error_code ? ` (Maps: ${item.maps_error_code})` : ""}</td><td className="p-2">{item.attempt_count}</td><td className="p-2 text-rose-700">{item.error_message || "-"}</td></tr>)}</tbody></table></div></section>}
    </main>
  </div>;
}
