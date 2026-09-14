import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { recordReportUsage } from "@/lib/generationTelemetry";
import { requireAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { findLocation } from "@/lib/location";
import { generateSlug } from "@/lib/slug";
import { analyzeRoute } from "@/services/geminiService";
import { sanitizeAnalysis } from "@/lib/analysis";
import type { RouteAnalysis } from "@/types";

export const maxDuration = 300;

type ReportPayload = {
  originCity: string;
  originCounty?: string;
  originLat?: number;
  originLng?: number;
  destinationCity: string;
  destinationCounty?: string;
  destinationLat?: number;
  destinationLng?: number;
  stopName?: string;
  stopLat?: number;
  stopLng?: number;
  useTolls?: boolean;
  departureTime?: string | null;
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

  const body = (await req.json().catch(() => null)) as ReportPayload | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const {
    originCity,
    originCounty,
    originLat,
    originLng,
    destinationCity,
    destinationCounty,
    destinationLat,
    destinationLng,
    stopName,
    stopLat,
    stopLng,
    useTolls = true,
    departureTime
  } = body;

  if (typeof originCity !== 'string' || !originCity.trim() || typeof destinationCity !== 'string' || !destinationCity.trim()) {
    return NextResponse.json({ error: "Origin and destination are required" }, { status: 400 });
  }
  if ((originCounty !== undefined && typeof originCounty !== 'string') || (destinationCounty !== undefined && typeof destinationCounty !== 'string') || typeof useTolls !== 'boolean') return NextResponse.json({ error: 'Geçersiz rota bilgisi.' }, { status: 400 });
  for (const [coordinate, limit] of [[originLat, 90], [originLng, 180], [destinationLat, 90], [destinationLng, 180], [stopLat, 90], [stopLng, 180]] as const) {
    if (coordinate !== undefined && (typeof coordinate !== 'number' || !Number.isFinite(coordinate) || Math.abs(coordinate) > limit)) return NextResponse.json({ error: 'Geçersiz koordinat.' }, { status: 400 });
  }
  if ((departureTime != null && typeof departureTime !== 'string') || (stopName !== undefined && typeof stopName !== 'string')) return NextResponse.json({ error: 'Geçersiz kalkış zamanı veya durak bilgisi.' }, { status: 400 });
  const departure = departureTime ? new Date(departureTime) : new Date();
  if (Number.isNaN(departure.getTime()) || departure.getTime() < Date.now() - 60000) return NextResponse.json({ error: 'Başlangıç zamanı geçerli ve gelecekte olmalıdır.' }, { status: 400 });

  await ensureProfile(auth.userId, auth.email);

  // Resolve coords from dataset if not provided
  const originMatch = findLocation(originCity, originCounty);
  const destMatch = findLocation(destinationCity, destinationCounty);

  const resolvedOriginLat = originLat ?? originMatch.lat;
  const resolvedOriginLng = originLng ?? originMatch.lng;
  const resolvedDestLat = destinationLat ?? destMatch.lat;
  const resolvedDestLng = destinationLng ?? destMatch.lng;
  const resolvedStopLat = stopLat;
  const resolvedStopLng = stopLng;

  const originCoords =
    resolvedOriginLat !== undefined && resolvedOriginLng !== undefined
      ? `${resolvedOriginLat},${resolvedOriginLng}`
      : undefined;
  const destCoords =
    resolvedDestLat !== undefined && resolvedDestLng !== undefined ? `${resolvedDestLat},${resolvedDestLng}` : undefined;
  const stopCoords =
    resolvedStopLat !== undefined && resolvedStopLng !== undefined ? `${resolvedStopLat},${resolvedStopLng}` : undefined;

  const originLabel = `${originCity}${originCounty ? ", " + originCounty : ""}`;
  const destLabel = `${destinationCity}${destinationCounty ? ", " + destinationCounty : ""}`;

  const supabase = getSupabaseAdmin();
  const publicSlug = generateSlug(10);

  // Create initial report row with processing status
  const { data: inserted, error: insertError } = await supabase
    .from("reports")
    .insert({
      public_slug: publicSlug,
      operator_id: auth.userId,
      origin_city: originCity,
      origin_county: originCounty ?? "",
      origin_lat: resolvedOriginLat ?? null,
      origin_lng: resolvedOriginLng ?? null,
      destination_city: destinationCity,
      destination_county: destinationCounty ?? "",
      destination_lat: resolvedDestLat ?? null,
      destination_lng: resolvedDestLng ?? null,
      departure_time: departure.toISOString(),
      status: "processing",
      error_message: null
    })
    .select("id, public_slug")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json({ error: insertError?.message || "Failed to create report" }, { status: 500 });
  }

  try {
    const attemptId = randomUUID();
    const rawAnalysis: RouteAnalysis = await analyzeRoute(originLabel, destLabel, originCoords, destCoords, {
      useTolls,
      stopName: stopName || undefined,
      stopCoords,
      departureTime: departure.toISOString(),
      onUsage: event => recordReportUsage(inserted.id, attemptId, event)
    });
    const analysis = sanitizeAnalysis(rawAnalysis);

    const { error: saveError } = await supabase
      .from("reports")
      .update({
        analysis,
        status: "ready",
        error_message: null
      })
      .eq("id", inserted.id);
    if (saveError) throw new Error('Rapor sonucu kaydedilemedi.');

    return NextResponse.json({ id: inserted.id, publicSlug, analysis });
  } catch (err: any) {
    await supabase
      .from("reports")
      .update({
        status: "failed",
        error_message: err?.message || "Gemini analysis failed"
      })
      .eq("id", inserted.id);

    return NextResponse.json({ error: "Rapor tamamlanamadı. Ayrıntılar rapor sayfasında görüntülenebilir.", reportId: inserted.id }, { status: 500 });
  }
}

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("reports")
    .select("id, public_slug, origin_city, destination_city, status, created_at, updated_at")
    .eq("operator_id", auth.userId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(
    { reports: data || [] },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate" } }
  );
}
