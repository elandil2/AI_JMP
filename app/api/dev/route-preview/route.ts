import { NextResponse } from "next/server";
import { getDirections } from "@/lib/googleMaps";
import { buildMapsRoutePlan } from "@/lib/mapsRoutePlan";
import { mapsTiming } from "@/lib/routeTiming";
import { buildRouteTimeline } from "@/lib/routeTimelineBuilder";
import { auditBreakPlan } from "@/lib/breakPlanAudit";
import { analyzeRoute } from "@/services/geminiService";
import type { RouteAnalysis } from "@/types";

/**
 * Local-only report preview. Never saves anything and is disabled in production.
 *  - mode "plan": Google route + break plan only (one Routes request, no Gemini).
 *  - mode "full": the same analyzeRoute pipeline the live report uses (Gemini + Maps).
 */
export const maxDuration = 300;

const COORDINATE = /^-?\d{1,2}(\.\d+)?,\s*-?\d{1,3}(\.\d+)?$/;

type PreviewBody = {
  origin?: string; originName?: string;
  destination?: string; destinationName?: string;
  via?: string; viaName?: string;
  departureTime?: string;
  mode?: "plan" | "full";
  maxExtendedDays?: number;
};

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as PreviewBody;
  const origin = body.origin?.trim() ?? "";
  const destination = body.destination?.trim() ?? "";
  const via = body.via?.trim() || undefined;
  if (!COORDINATE.test(origin) || !COORDINATE.test(destination) || (via && !COORDINATE.test(via))) {
    return NextResponse.json({ error: "Koordinatlar 'enlem,boylam' biçiminde olmalı." }, { status: 400 });
  }
  const departure = body.departureTime ? new Date(body.departureTime) : new Date();
  if (!Number.isFinite(departure.getTime())) return NextResponse.json({ error: "Geçersiz kalkış zamanı." }, { status: 400 });
  const originName = body.originName?.trim() || origin;
  const destinationName = body.destinationName?.trim() || destination;
  const maxExtendedDays = Number.isFinite(body.maxExtendedDays) ? body.maxExtendedDays : undefined;

  try {
    let analysis: RouteAnalysis;
    let auditInput: { totalKm: number; drivingHours: number; extendedDays: number };
    let breakPoints: Array<{ kind: string; km: number; lat?: number; lng?: number; label: string }> = [];

    const maps = await getDirections(origin, destination, { useTolls: true, stopCoords: via, departureTime: departure });
    if (!maps) return NextResponse.json({ error: "Google rota alınamadı (anahtar veya Routes API yetkisi)." }, { status: 502 });
    const timing = mapsTiming(maps, { maxExtendedDays, departureTime: departure });
    const plan = buildMapsRoutePlan(maps, { originName, destinationName, maxExtendedDays });
    auditInput = { totalKm: maps.distance.value / 1000, drivingHours: timing.drivingHours, extendedDays: timing.schedule.extendedDays };
    breakPoints = plan.breakTargets.map(target => ({
      kind: target.kind, km: Math.round(target.thresholdDistanceMeters / 1000),
      lat: target.coordinate?.lat, lng: target.coordinate?.lng, label: target.name
    }));

    if (body.mode === "full") {
      analysis = await analyzeRoute(originName, destinationName, origin, destination, {
        useTolls: true, stopName: body.viaName, stopCoords: via, departureTime: departure.toISOString(), maxExtendedDays
      });
    } else {
      analysis = {
        summary: timing.summary,
        weather: {
          origin: { location: originName, temp: "-", condition: "Önizlemede hava durumu alınmadı", icon: "unknown", source: "unavailable" },
          destination: { location: destinationName, temp: "-", condition: "Önizlemede hava durumu alınmadı", icon: "unknown", source: "unavailable" },
          waypoints: []
        },
        riskIntensity: [], riskTypes: [], criticalPoints: [],
        routeSchematic: plan.routeSchematic,
        timeline: buildRouteTimeline(plan.routeSchematic, [], departure.toISOString())
      };
    }

    const nodes = analysis.routeSchematic?.nodes ?? plan.routeSchematic.nodes;
    const audit = auditBreakPlan(nodes, {
      totalKm: auditInput.totalKm, drivingHours: auditInput.drivingHours,
      allowExtendedDay: auditInput.extendedDays > 0, departureTime: departure.toISOString()
    });
    return NextResponse.json({ analysis, audit, breakPoints, extendedDays: auditInput.extendedDays, mapsPolylineAvailable: Boolean(maps.polyline) });
  } catch (error) {
    console.error("Route preview failed:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Önizleme başarısız." }, { status: 500 });
  }
}
