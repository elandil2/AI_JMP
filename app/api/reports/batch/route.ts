import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { findLocation } from "@/lib/location";
import { generateSlug } from "@/lib/slug";
import { analyzeRoute } from "@/services/geminiService";
import { sanitizeAnalysis } from "@/lib/analysis";
import type { RouteAnalysis } from "@/types";

const KGM_URL =
  "https://yol.kgm.gov.tr/KazaKaraNoktaWeb/?_gl=1*1a3m75w*_ga*MTMyOTk2MTAzMC4xNzY1MjI5NjMy*_ga_P1MD63L4M4*czE3NjU0ODE5OTIkbzMkZzAkdDE3NjU0ODE5OTIkajYwJGwwJGgxNzU4NDg4NTAw";

type ParsedRow = {
  originCity: string;
  originCounty?: string;
  destinationCity: string;
  destinationCounty?: string;
};

const parseCsv = (text: string): ParsedRow[] => {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [oCity, oCounty, dCity, dCounty] = line.split(",").map((s) => s?.trim());
      return {
        originCity: oCity || "",
        originCounty: oCounty || "",
        destinationCity: dCity || "",
        destinationCounty: dCounty || ""
      };
    })
    .filter((r) => r.originCity && r.destinationCity);
};

const ensureProfile = async (userId: string, email?: string | null) => {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (data) return;
  await supabase.from("profiles").insert({ id: userId, email: email ?? "" });
};

export async function POST(req: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("text/csv") && !contentType.includes("application/json")) {
    return NextResponse.json({ error: "Send CSV text or JSON {csv: \"...\"}" }, { status: 400 });
  }

  let csvText = "";
  let useTolls = true;
  let departureTime: string | undefined;

  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.csv !== "string") return NextResponse.json({ error: "Missing csv field" }, { status: 400 });
    csvText = body.csv;
    if (typeof body.useTolls === "boolean") useTolls = body.useTolls;
    if (typeof body.departureTime === "string") departureTime = body.departureTime;
  } else {
    csvText = await req.text();
  }

  const rows = parseCsv(csvText);
  if (!rows.length) return NextResponse.json({ error: "No valid rows found" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  await ensureProfile(auth.userId, auth.email);

  const { data: batch, error: batchError } = await supabase
    .from("batches")
    .insert({
      operator_id: auth.userId,
      file_name: "upload.csv",
      status: "processing"
    })
    .select("id")
    .single();

  if (batchError || !batch) return NextResponse.json({ error: batchError?.message || "Failed to create batch" }, { status: 500 });

  const results: any[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const { originCity, originCounty, destinationCity, destinationCounty } = row;

    const { data: batchItem } = await supabase
      .from("batch_items")
      .insert({
        batch_id: batch.id,
        row_index: i,
        raw_json: row,
        status: "processing"
      })
      .select("id")
      .single();

    const originMatch = findLocation(originCity, originCounty);
    const destMatch = findLocation(destinationCity, destinationCounty);

    const originCoords =
      originMatch.lat !== undefined && originMatch.lng !== undefined ? `${originMatch.lat},${originMatch.lng}` : undefined;
    const destCoords =
      destMatch.lat !== undefined && destMatch.lng !== undefined ? `${destMatch.lat},${destMatch.lng}` : undefined;

    const originLabel = `${originCity}${originCounty ? ", " + originCounty : ""}`;
    const destLabel = `${destinationCity}${destinationCounty ? ", " + destinationCounty : ""}`;
    const originWithKgm = `${originLabel} | KGM: ${KGM_URL}`;
    const destWithKgm = `${destLabel} | KGM: ${KGM_URL}`;

    const slug = generateSlug(10);

    try {
      const { data: reportInsert, error: reportError } = await supabase
        .from("reports")
        .insert({
          public_slug: slug,
          operator_id: auth.userId,
          origin_city: originCity,
          origin_county: originCounty ?? "",
          origin_lat: originMatch.lat ?? null,
          origin_lng: originMatch.lng ?? null,
          destination_city: destinationCity,
          destination_county: destinationCounty ?? "",
          destination_lat: destMatch.lat ?? null,
          destination_lng: destMatch.lng ?? null,
          status: "processing"
        })
        .select("id")
        .single();

      if (reportError || !reportInsert) throw new Error(reportError?.message || "Insert failed");

      const rawAnalysis: RouteAnalysis = await analyzeRoute(originWithKgm, destWithKgm, originCoords, destCoords, {
        useTolls,
        departureTime
      });
      const analysis = sanitizeAnalysis(rawAnalysis);

      await supabase
        .from("reports")
        .update({ analysis, status: "ready", error_message: null })
        .eq("id", reportInsert.id);

      if (batchItem?.id) {
        await supabase
          .from("batch_items")
          .update({ status: "ready", report_id: reportInsert.id })
          .eq("id", batchItem.id);
      }

      results.push({ row: i, status: "ready" });
    } catch (err: any) {
      if (batchItem?.id) {
        await supabase
          .from("batch_items")
          .update({ status: "failed", error_message: err?.message || "Analysis failed" })
          .eq("id", batchItem.id);
      }
      results.push({ row: i, status: "failed", error: err?.message });
    }
  }

  const hasFailure = results.some((r) => r.status === "failed");
  await supabase
    .from("batches")
    .update({ status: hasFailure ? "failed" : "completed", finished_at: new Date().toISOString() })
    .eq("id", batch.id);

  return NextResponse.json({ batchId: batch.id, results });
}
