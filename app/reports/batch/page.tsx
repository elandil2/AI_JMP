"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, FileUp, Play } from "lucide-react";
import Header from "@/components/Header";
import { authFetch } from "@/lib/apiClient";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

type BatchItem = {
  id: string; row_index: number;
  raw_json: { originCity: string; originCounty?: string; destinationCity: string; destinationCounty?: string; viaCity?: string; viaCounty?: string; operation?: string };
  status: string; report_id?: string | null; error_message?: string | null; attempt_count: number; route_source?: string | null; maps_error_code?: string | null;
};
type BatchStatus = {
  batch: { id: string; status: string; model: string };
  items: BatchItem[];
  usage: { available: boolean; costKnown: boolean; eventCount: number; failedEventCount: number; promptTokens: number; candidateTokens: number; unknownTokenEventCount: number };
};

const SAVED_BATCH_KEY = "jmp.batch.last-id";

// Same palette as the dashboard: warm paper, ink navy, one signal red.
const MONO = "font-['IBM_Plex_Mono',ui-monospace,monospace]";
const SANS = "font-['IBM_Plex_Sans',Inter,system-ui,sans-serif]";
const labelClass = `${MONO} text-[11px] uppercase tracking-[0.12em] text-slate-500`;
const inputClass = "min-h-11 w-full rounded-md border border-[#14213D]/15 bg-white px-3 py-2.5 text-[15px] text-[#14213D] focus:outline-none focus:ring-2 focus:ring-[#14213D]/40";

const EXAMPLES = {
  total: "varış ili,varış ilçesi,ara durak ili,ara durak ilçesi\nankara,beypazarı,eskişehir,\nmalatya,yeşilyurt,aksaray,\nistanbul,bahçelievler,,",
  genel: "çıkış ili,çıkış ilçesi,varış ili,varış ilçesi,ara durak ili,ara durak ilçesi\nkocaeli,gebze,ankara,yenimahalle,,\nizmir,menemen,malatya,yeşilyurt,aksaray,"
};

const statusStyle: Record<string, { dot: string; text: string; label: string }> = {
  ready: { dot: "bg-emerald-600", text: "text-emerald-800", label: "Hazır" },
  processing: { dot: "bg-amber-500 animate-pulse", text: "text-amber-800", label: "İşleniyor" },
  pending: { dot: "bg-slate-300", text: "text-slate-500", label: "Sırada" },
  failed: { dot: "bg-[#D7192D]", text: "text-[#B3121F]", label: "Hata" }
};
const batchStatusLabel: Record<string, string> = { pending: "Sırada", processing: "İşleniyor", completed: "Tamamlandı", failed: "Durdu" };

const Toggle = ({ on }: { on: boolean }) => (
  <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-[#14213D]" : "bg-slate-300"}`} aria-hidden>
    <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`} />
  </span>
);

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
  const [model, setModel] = useState("gemini-3.7-flash");
  const [telemetryWarning, setTelemetryWarning] = useState<string | null>(null);
  const [operation, setOperation] = useState<"total" | "genel">("total");
  const [driverHasExtension, setDriverHasExtension] = useState(true);

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
    selectedFile.arrayBuffer().then((buffer) => {
      // Excel's plain "CSV" in Turkish Windows is Windows-1254, not UTF-8; reading it as UTF-8 garbles İ, ı, ş, ğ.
      let text: string;
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
      catch { text = new TextDecoder("windows-1254").decode(buffer); }
      setCsv(text); setError(null);
    }, () => { setError("Dosya okunamadı."); setCsv(""); });
  };

  const submit = async () => {
    if (!csv.trim()) { setError("Lütfen bir CSV dosyası seçin."); return; }
    setLoading(true); setError(null); setTelemetryWarning(null);
    const response = await authFetch("/api/reports/batch", {
      method: "POST",
      body: JSON.stringify({ csv, fileName: file?.name, useTolls, departureTime: startTime ? new Date(startTime).toISOString() : null, model, operation, driverHasExtension })
    });
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
    setRunning(true); setError(null); setTelemetryWarning(null);
    const response = await authFetch(`/api/reports/batch/${batchId}/next`, { method: "POST" });
    const json = await response.json().catch(() => ({ error: "Satır işlenemedi" }));
    setRunning(false);
    if (!response.ok) setError(json.error || "Satır işlenemedi");
    if (typeof json.telemetry?.warning === "string") setTelemetryWarning(json.telemetry.warning);
    await loadBatch(batchId, true);
  };

  const active = batch?.batch.status !== "failed" && batch?.batch.status !== "completed" && (batch?.items.some((item) => item.status === "pending") ?? false);
  const readyCount = batch?.items.filter(item => item.status === "ready").length ?? 0;
  const columns = operation === "total"
    ? "varış ili, varış ilçesi, ara durak ili, ara durak ilçesi"
    : "çıkış ili, çıkış ilçesi, varış ili, varış ilçesi, ara durak ili, ara durak ilçesi";

  return (
    <div className={`min-h-screen bg-[#F4F2EE] ${SANS}`}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" />
      <Header />

      <section className="bg-[#14213D] text-white">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-6 pb-6">
          <Link href="/dashboard" className={`${MONO} text-[11px] uppercase tracking-[0.14em] text-white/60 hover:text-white`}>← Rota raporları</Link>
          <h1 className="mt-2 text-3xl sm:text-4xl font-semibold tracking-tight">Toplu rapor</h1>
          <p className="mt-2 max-w-2xl text-sm text-white/65">CSV ile en fazla 20 sefer kuyruğa alınır. Kuyruk oluşturmak ücretli çağrı başlatmaz; her satır &quot;Sonraki satırı işle&quot; ile tek tek çalışır ve ardından inceleme için durur.</p>
          <div role="radiogroup" aria-label="Operasyon" className="mt-6 grid w-full grid-cols-2 gap-1 rounded-lg bg-white/10 p-1 sm:inline-grid sm:w-auto">
            {([
              { key: "total", title: "Total FTL", sub: "Menemen terminalinden" },
              { key: "genel", title: "Genel", sub: "Çıkış CSV'de" }
            ] as const).map(option => {
              const on = operation === option.key;
              return (
                <button key={option.key} type="button" role="radio" aria-checked={on} onClick={() => setOperation(option.key)}
                  className={`min-h-12 rounded-md px-4 py-2 text-left transition sm:min-w-[200px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white ${on ? "bg-white text-[#14213D] shadow-sm" : "text-white/75 hover:bg-white/10 hover:text-white"}`}>
                  <span className="block text-sm font-semibold">{option.title}</span>
                  <span className={`block text-xs ${on ? "text-slate-500" : "text-white/55"}`}>{option.sub}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-5xl space-y-6 px-4 sm:px-6 py-8">
        {/* 01 CSV */}
        <section className="rounded-md border border-[#14213D]/10 bg-white p-5 sm:p-6" aria-labelledby="sec-csv">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="sec-csv" className="flex items-baseline gap-3 text-base font-semibold text-[#14213D]"><span className={`${MONO} text-xs text-[#D7192D]`}>01</span> Seferler</h2>
            <button type="button" onClick={() => { setCsv(EXAMPLES[operation]); setFile(null); setError(null); }} className="text-xs font-semibold text-[#14213D] underline underline-offset-2 hover:text-[#D7192D]">Örnek CSV doldur</button>
          </div>
          <p className="mt-3 border-l-2 border-amber-400 pl-3 text-xs leading-5 text-slate-600">
            {operation === "total"
              ? <>Çıkış her satırda <strong className="text-[#14213D]">Total Menemen terminali</strong>. </>
              : <>Çıkış her satırda CSV&apos;den okunur (il/ilçe merkezi). </>}
            Sütunlar: <span className={`${MONO} text-[#14213D]`}>{columns}</span>. Ara durak ve ilçeler isteğe bağlı; başlık satırı olabilir, virgül veya noktalı virgül kabul edilir.
          </p>

          <div
            onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => { event.preventDefault(); setIsDragging(false); const dropped = event.dataTransfer.files[0]; if (dropped) processFile(dropped); }}
            className={`mt-5 rounded-md border-2 border-dashed p-5 text-center transition focus-within:outline focus-within:outline-2 focus-within:outline-[#14213D] ${isDragging ? "border-[#14213D] bg-[#14213D]/5" : "border-[#14213D]/15"}`}
          >
            <label className="flex cursor-pointer flex-col items-center gap-2 text-sm text-slate-600">
              <FileUp className="h-6 w-6 text-[#14213D]/60" />
              <span><span className="font-semibold text-[#14213D] underline underline-offset-2">Dosya seç</span> veya sürükleyip bırak (.csv)</span>
              <input type="file" accept=".csv,text/csv" aria-label="CSV dosyası seç" onChange={(event) => { const selected = event.target.files?.[0]; if (selected) processFile(selected); }} className="sr-only" />
            </label>
            {file && <p className={`${MONO} mt-2 text-xs text-slate-500`}>{file.name}</p>}
          </div>

          <label htmlFor="batch-csv" className={`${labelClass} mt-5 block`}>CSV satırları</label>
          <textarea
            id="batch-csv"
            className={`${MONO} mt-1 h-44 w-full rounded-md border border-[#14213D]/15 bg-[#F9F8F6] p-3 text-sm text-[#14213D] focus:outline-none focus:ring-2 focus:ring-[#14213D]/40`}
            value={csv}
            onChange={(event) => setCsv(event.target.value)}
            placeholder={operation === "total" ? "ankara,beypazarı,eskişehir," : "kocaeli,gebze,ankara,,,"}
          />
        </section>

        {/* 02 Options */}
        <section className="rounded-md border border-[#14213D]/10 bg-white p-5 sm:p-6" aria-labelledby="sec-opts">
          <h2 id="sec-opts" className="flex items-baseline gap-3 text-base font-semibold text-[#14213D]"><span className={`${MONO} text-xs text-[#D7192D]`}>02</span> Zaman ve sürücü</h2>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="batch-start" className={labelClass}>Kalkış zamanı · tüm satırlar için</label>
              <input id="batch-start" type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} className={inputClass} />
              <p className="text-xs text-slate-500">Boş bırakılırsa her satır işlendiği an kabul edilir.</p>
            </div>
            <div className="space-y-1">
              <span className={labelClass}>Model</span>
              {isAdmin ? (
                <select value={model} onChange={(event) => setModel(event.target.value)} className={inputClass} aria-label="Model">
                  <option value="gemini-3.7-flash">Gemini 3.7 Flash</option>
                  <option value="gemini-3.8-flash">Gemini 3.8 Flash</option>
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash (karşılaştırma)</option>
                </select>
              ) : <p className="flex min-h-11 items-center text-sm text-[#14213D]">Gemini 3.7 Flash</p>}
            </div>
          </div>
          <div className="mt-5 divide-y divide-[#14213D]/[0.07] border-t border-[#14213D]/[0.07]">
            <label htmlFor="batch-tolls" className="flex min-h-12 cursor-pointer select-none items-center justify-between gap-4 py-3 text-sm text-[#14213D]">
              <span>Ücretli yolları kullan <span className="block text-xs text-slate-500">Otoyol ve köprü gişeleri rotaya dahil edilir.</span></span>
              <Toggle on={useTolls} />
              <input id="batch-tolls" type="checkbox" className="sr-only" checked={useTolls} onChange={(event) => setUseTolls(event.target.checked)} />
            </label>
            <label htmlFor="batch-extension" className="flex min-h-12 cursor-pointer select-none items-center justify-between gap-4 py-3 text-sm text-[#14213D]">
              <span>Sürücülerin bu hafta 10 saatlik uzatma hakkı var <span className="block text-xs text-slate-500">Tüm satırlara uygulanır. Hakkı yoksa kapat; plan 9 saatlik günle yapılır.</span></span>
              <Toggle on={driverHasExtension} />
              <input id="batch-extension" type="checkbox" className="sr-only" checked={driverHasExtension} onChange={(event) => setDriverHasExtension(event.target.checked)} />
            </label>
          </div>
        </section>

        {error && <div role="alert" className="rounded-md border-l-4 border-[#D7192D] bg-white px-4 py-3 text-sm text-[#B3121F]">{error}</div>}

        <button
          onClick={() => void submit()}
          disabled={loading || !csv.trim()}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[#D7192D] px-4 text-base font-semibold text-white hover:bg-[#BC1527] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D] disabled:opacity-60"
        >
          {loading ? "Kuyruk oluşturuluyor…" : "Kuyruğu oluştur"}
        </button>

        {/* Queue */}
        {batch && (
          <section className="rounded-md border border-[#14213D]/10 bg-white" aria-labelledby="sec-queue">
            <div className="flex flex-col gap-3 border-b border-[#14213D]/10 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 id="sec-queue" className="flex items-baseline gap-3 text-base font-semibold text-[#14213D]">
                  <span className={`${MONO} text-xs text-[#D7192D]`}>03</span> Kuyruk
                  <span className={`${MONO} text-xs font-normal text-slate-500`}>{readyCount}/{batch.items.length} hazır · {batchStatusLabel[batch.batch.status] ?? batch.batch.status}</span>
                </h2>
                <p className={`${MONO} mt-1 text-[11px] text-slate-400`}>
                  {batch.batch.id.slice(0, 8)} · {batch.batch.model} · telemetri: {batch.usage.available ? batch.usage.costKnown ? batch.usage.eventCount ? "mevcut" : "henüz yok" : "eksik" : "okunamadı"} · {batch.usage.eventCount} olay · hata {batch.usage.failedEventCount} · token {batch.usage.promptTokens.toLocaleString("tr-TR")}/{batch.usage.candidateTokens.toLocaleString("tr-TR")}
                  {batch.usage.unknownTokenEventCount ? ` (${batch.usage.unknownTokenEventCount} kayıtta token eksik)` : ""}
                </p>
              </div>
              <button onClick={() => void processNext()} disabled={running || !active}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#14213D] px-5 text-sm font-semibold text-white hover:bg-[#0E1830] disabled:opacity-50">
                {running ? <span className="h-2 w-2 animate-pulse rounded-full bg-white" aria-hidden /> : <Play className="h-4 w-4" />}
                {running ? "Bir satır işleniyor…" : "Sonraki satırı işle"}
              </button>
            </div>
            {telemetryWarning && <div role="status" className="border-b border-[#14213D]/10 bg-amber-50 px-5 py-2 text-sm text-amber-900">{telemetryWarning}</div>}
            <div className="h-1 bg-[#14213D]/10" aria-hidden><div className="h-1 bg-emerald-600 transition-all" style={{ width: `${batch.items.length ? (readyCount / batch.items.length) * 100 : 0}%` }} /></div>
            <ul className="divide-y divide-[#14213D]/[0.07]">
              {batch.items.map(item => {
                const style = statusStyle[item.status] ?? statusStyle.pending;
                const raw = item.raw_json;
                return (
                  <li key={item.id} className="flex items-center gap-3 px-5 py-3">
                    <span className={`${MONO} w-6 shrink-0 text-xs tabular-nums text-slate-400`}>{item.row_index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="flex min-w-0 items-center gap-2 text-[15px] font-semibold text-[#14213D]">
                        <span className="truncate">{(raw.originCity || "").toLocaleUpperCase("tr-TR")}</span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#D7192D]" />
                        <span className="truncate">{(raw.destinationCity || "").toLocaleUpperCase("tr-TR")}{raw.destinationCounty ? <span className="font-normal text-slate-500"> · {raw.destinationCounty}</span> : null}</span>
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs">
                        <span className={`flex items-center gap-1.5 ${style.text}`}><span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />{style.label}</span>
                        {raw.viaCity && <span className="text-slate-500">{raw.viaCity} üzerinden</span>}
                        {item.route_source && <span className="text-slate-400">{item.route_source === "maps" ? "Google rotası" : item.route_source === "gemini_fallback" ? "Gemini tahmini" : "Rota belirsiz"}{item.maps_error_code ? ` (Maps: ${item.maps_error_code})` : ""}</span>}
                        {item.attempt_count > 1 && <span className="text-slate-400">{item.attempt_count}. deneme</span>}
                      </p>
                      {item.error_message && <p className="mt-1 text-xs text-[#B3121F]">{item.error_message}</p>}
                    </div>
                    {item.report_id && item.status === "ready" && (
                      <Link href={`/reports/${item.report_id}`} className="inline-flex min-h-9 shrink-0 items-center rounded px-2.5 text-xs font-semibold text-[#14213D] hover:bg-[#14213D]/5">Aç</Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
