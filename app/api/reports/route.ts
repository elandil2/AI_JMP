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

  if (!originCity || !destinationCity) {
    return NextResponse.json({ error: "Origin and destination are required" }, { status: 400 });
  }

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
  // Inject KGM context to satisfy spec but will sanitize output
  const originWithKgm = `${originLabel} | KGM: ${KGM_URL}`;
  const destWithKgm = `${destLabel} | KGM: ${KGM_URL}`;

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
      departure_time: departureTime ?? null,
      status: "processing",
      error_message: null
    })
    .select("id, public_slug")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json({ error: insertError?.message || "Failed to create report" }, { status: 500 });
  }

  try {
    const rawAnalysis: RouteAnalysis = await analyzeRoute(originWithKgm, destWithKgm, originCoords, destCoords, {
      useTolls,
      stopName: stopName || undefined,
      stopCoords
    });
    const analysis = sanitizeAnalysis(rawAnalysis);

    await supabase
      .from("reports")
      .update({
        analysis,
        status: "ready",
        error_message: null
      })
      .eq("id", inserted.id);

    return NextResponse.json({ id: inserted.id, publicSlug, analysis });
  } catch (err: any) {
    await supabase
      .from("reports")
      .update({
        status: "failed",
        error_message: err?.message || "Gemini analysis failed"
      })
      .eq("id", inserted.id);

    return NextResponse.json({ error: "Gemini analysis failed", details: err?.message }, { status: 500 });
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
  return NextResponse.json({ reports: data || [] });
}
