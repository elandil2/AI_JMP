import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const asNumber = (value: unknown) => typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : null;

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { data: batch, error: batchError } = await supabase
    .from("batches")
    .select("id, file_name, status, model, use_tolls, departure_time, input_hash, created_at, finished_at")
    .eq("id", id)
    .eq("operator_id", auth.userId)
    .maybeSingle();
  if (batchError) return NextResponse.json({ error: batchError.message }, { status: 500 });
  if (!batch) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: items, error: itemsError } = await supabase
    .from("batch_items")
    .select("id, row_index, raw_json, status, report_id, error_message, attempt_id, claimed_at, attempt_count")
    .eq("batch_id", batch.id)
    .order("row_index", { ascending: true });
  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });

  const { data: events, error: eventsError } = await supabase
    .from("generation_events")
    .select("batch_item_id, provider, stage, outcome, route_source, error_code, token_cost_usd, search_cost_usd, maps_cost_usd")
    .eq("batch_id", batch.id);
  if (eventsError) return NextResponse.json({ error: eventsError.message }, { status: 500 });
  const unknownCost = (events ?? []).some((event) =>
    event.provider === "gemini"
      ? asNumber(event.token_cost_usd) === null || asNumber(event.search_cost_usd) === null
      : asNumber(event.maps_cost_usd) === null
  );
  const cost = (events ?? []).reduce((total, event) => total + (asNumber(event.token_cost_usd) ?? 0) + (asNumber(event.search_cost_usd) ?? 0) + (asNumber(event.maps_cost_usd) ?? 0), 0);

  const enrichedItems = (items ?? []).map((item) => {
    const itemEvents = (events ?? []).filter((event) => event.batch_item_id === item.id);
    const mapsEvent = itemEvents.find((event) => event.provider === "maps");
    const fallbackEvent = itemEvents.find((event) => event.provider === "gemini" && event.stage === "route");
    const routeSource = mapsEvent?.outcome === "ok" ? "maps" : fallbackEvent?.outcome === "ok" ? "gemini_fallback" : mapsEvent ? "unavailable" : null;
    return { ...item, route_source: routeSource, maps_error_code: mapsEvent?.outcome === "error" ? mapsEvent.error_code : null };
  });
  return NextResponse.json({ batch, items: enrichedItems, cost: { usd: cost, unknown: unknownCost } });
}
