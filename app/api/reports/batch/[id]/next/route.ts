import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { findLocation } from "@/lib/location";
import { sanitizeAnalysis } from "@/lib/analysis";
import { generateSlug } from "@/lib/slug";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { analyzeRoute } from "@/services/geminiService";
import type { RouteAnalysis } from "@/types";

const KGM_URL = "https://yol.kgm.gov.tr/KazaKaraNoktaWeb/";
const BUDGET_USD = 9;

type RawRow = { originCity: string; originCounty?: string; destinationCity: string; destinationCounty?: string };
type UsageEvent = Record<string, unknown>;

const asNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
const estimate = (name: string, fallback: number) => {
  const value = asNumber(process.env[name]);
  return value !== null && value >= 0 ? value : fallback;
};
const isRawRow = (value: unknown): value is RawRow => {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.originCity === "string" && row.originCity.trim() !== "" && typeof row.destinationCity === "string" && row.destinationCity.trim() !== "";
};

const getOwnedBatch = async (id: string, userId: string) => {
  const { data, error } = await getSupabaseAdmin().from("batches")
    .select("id, operator_id, status, model, use_tolls, departure_time, input_hash")
    .eq("id", id).eq("operator_id", userId).maybeSingle();
  return { batch: data, error };
};

const finishBatchIfSettled = async (batchId: string) => {
  const supabase = getSupabaseAdmin();
  const { data: items, error: itemsError } = await supabase.from("batch_items").select("status").eq("batch_id", batchId);
  if (itemsError) return itemsError;
  const statuses = (items ?? []).map((item) => item.status);
  const status = statuses.some((value) => value === "failed") ? "failed" : statuses.some((value) => value === "pending" || value === "processing") ? "processing" : "completed";
  const values = status === "processing" ? { status } : { status, finished_at: new Date().toISOString() };
  const { error } = await supabase.from("batches").update(values).eq("id", batchId);
  return error;
};

const restorePending = async (itemId: string, reason: string) => {
  const { error } = await getSupabaseAdmin().from("batch_items")
    .update({ status: "pending", attempt_id: null, claimed_at: null, error_message: reason })
    .eq("id", itemId).eq("status", "processing");
  return error;
};

const budgetGate = async (inputHash: string, operatorId: string, currentItemId: string) => {
  const supabase = getSupabaseAdmin();
  const estimates = { token: estimate("BENCHMARK_ESTIMATED_TOKEN_COST_USD", 0.5), search: estimate("BENCHMARK_ESTIMATED_SEARCH_COST_USD", 0.2), maps: estimate("BENCHMARK_ESTIMATED_MAPS_COST_USD", 0.005) };
  const { data: batches, error: batchesError } = await supabase.from("batches").select("id").eq("operator_id", operatorId).eq("input_hash", inputHash);
  if (batchesError) return { error: `STOP: cannot read benchmark batches (${batchesError.message})` };
  const batchIds = (batches ?? []).map((batch) => batch.id);
  if (!batchIds.length) return { error: "STOP: benchmark batch group is unavailable" };
  const { data: processing, error: processingError } = await supabase.from("batch_items").select("id").in("batch_id", batchIds).eq("status", "processing").neq("id", currentItemId);
  if (processingError) return { error: `STOP: cannot inspect uncertain items (${processingError.message})` };
  if ((processing ?? []).length) return { error: "STOP: an earlier item remains in an uncertain processing state" };
  const { data: events, error: eventsError } = await supabase.from("generation_events")
    .select("provider, token_cost_usd, search_cost_usd, maps_cost_usd").in("batch_id", batchIds);
  if (eventsError) return { error: `STOP: cannot read cost telemetry (${eventsError.message})` };
  for (const event of events ?? []) {
    if (event.provider === "gemini" && (asNumber(event.token_cost_usd) === null || asNumber(event.search_cost_usd) === null)) return { error: "STOP: Gemini cost telemetry is missing or unknown" };
    if (event.provider === "maps" && asNumber(event.maps_cost_usd) === null) return { error: "STOP: Maps cost telemetry is missing or unknown" };
  }
  const spent = (events ?? []).reduce((total, event) => total + (asNumber(event.token_cost_usd) ?? 0) + (asNumber(event.search_cost_usd) ?? 0) + (asNumber(event.maps_cost_usd) ?? 0), 0);
  const projected = spent + estimates.token! + estimates.search! + estimates.maps!;
  return projected >= BUDGET_USD ? { error: `STOP: projected benchmark cost $${projected.toFixed(4)} reaches the $${BUDGET_USD} limit` } : { spent, projected };
};

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const { batch, error: batchError } = await getOwnedBatch(id, auth.userId);
  if (batchError) return NextResponse.json({ error: batchError.message }, { status: 500 });
  if (!batch) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (batch.status === "failed" || batch.status === "completed") return NextResponse.json({ error: `STOP: batch is ${batch.status}` }, { status: 409 });

  const supabase = getSupabaseAdmin();
  const { data: inProgress, error: inProgressError } = await supabase.from("batch_items").select("id").eq("batch_id", batch.id).eq("status", "processing").limit(1);
  if (inProgressError) return NextResponse.json({ error: inProgressError.message }, { status: 500 });
  if ((inProgress ?? []).length) return NextResponse.json({ error: "STOP: this batch already has an uncertain processing item" }, { status: 409 });
  const { data: failedItems, error: failedItemsError } = await supabase.from("batch_items").select("id").eq("batch_id", batch.id).eq("status", "failed").limit(1);
  if (failedItemsError) return NextResponse.json({ error: failedItemsError.message }, { status: 500 });
  if ((failedItems ?? []).length) return NextResponse.json({ error: "STOP: an earlier batch item failed" }, { status: 409 });
  const { data: candidate, error: candidateError } = await supabase.from("batch_items")
    .select("id, row_index, raw_json, attempt_count").eq("batch_id", batch.id).eq("status", "pending").order("row_index").limit(1).maybeSingle();
  if (candidateError) return NextResponse.json({ error: candidateError.message }, { status: 500 });
  if (!candidate) {
    const finishError = await finishBatchIfSettled(batch.id);
    if (finishError) return NextResponse.json({ error: finishError.message }, { status: 500 });
    return NextResponse.json({ processed: false, message: "No pending item" });
  }

  const attemptId = randomUUID();
  const { data: claimed, error: claimError } = await supabase.from("batch_items")
    .update({ status: "processing", attempt_id: attemptId, claimed_at: new Date().toISOString(), attempt_count: (candidate.attempt_count ?? 0) + 1, error_message: null })
    .eq("id", candidate.id).eq("batch_id", batch.id).eq("status", "pending")
    .select("id, raw_json").maybeSingle();
  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 });
  if (!claimed) return NextResponse.json({ error: "Item was claimed by another worker" }, { status: 409 });

  if (!batch.input_hash) {
    const restoreError = await restorePending(claimed.id, "STOP: benchmark input hash is missing");
    if (restoreError) return NextResponse.json({ error: restoreError.message }, { status: 500 });
    return NextResponse.json({ error: "STOP: benchmark input hash is missing" }, { status: 409 });
  }
  const gate = await budgetGate(batch.input_hash, auth.userId, claimed.id);
  if ("error" in gate && gate.error) {
    const restoreError = await restorePending(claimed.id, gate.error);
    if (restoreError) return NextResponse.json({ error: restoreError.message }, { status: 500 });
    return NextResponse.json({ error: gate.error }, { status: 409 });
  }
  if (!isRawRow(claimed.raw_json)) {
    const restoreError = await restorePending(claimed.id, "STOP: invalid queued row");
    if (restoreError) return NextResponse.json({ error: restoreError.message }, { status: 500 });
    return NextResponse.json({ error: "STOP: invalid queued row" }, { status: 409 });
  }

  const row = claimed.raw_json;
  const origin = findLocation(row.originCity, row.originCounty);
  const destination = findLocation(row.destinationCity, row.destinationCounty);
  const originCoords = origin.lat !== undefined && origin.lng !== undefined ? `${origin.lat},${origin.lng}` : undefined;
  const destCoords = destination.lat !== undefined && destination.lng !== undefined ? `${destination.lat},${destination.lng}` : undefined;
  const originLabel = `${row.originCity}${row.originCounty ? `, ${row.originCounty}` : ""}`;
  const destinationLabel = `${row.destinationCity}${row.destinationCounty ? `, ${row.destinationCounty}` : ""}`;
  const { data: report, error: reportError } = await supabase.from("reports").insert({ public_slug: generateSlug(10), operator_id: auth.userId, origin_city: row.originCity, origin_county: row.originCounty ?? "", origin_lat: origin.lat ?? null, origin_lng: origin.lng ?? null, destination_city: row.destinationCity, destination_county: row.destinationCounty ?? "", destination_lat: destination.lat ?? null, destination_lng: destination.lng ?? null, departure_time: batch.departure_time, status: "processing", error_message: null }).select("id").single();
  if (reportError || !report) {
    const restoreError = await restorePending(claimed.id, reportError?.message || "Failed to create report");
    if (restoreError) return NextResponse.json({ error: restoreError.message }, { status: 500 });
    return NextResponse.json({ error: reportError?.message || "Failed to create report" }, { status: 500 });
  }

  let telemetryWrites = 0;
  let telemetryFailure: string | null = null;
  let unknownTelemetryCost = false;
  const onUsage = async (event: UsageEvent) => {
    const provider = event.provider === "maps" ? "maps" : "gemini";
    const estimatedCost = event.estimatedCost && typeof event.estimatedCost === "object" ? event.estimatedCost as Record<string, unknown> : {};
    const tokenCost = asNumber(event.tokenCostUsd ?? event.token_cost_usd ?? estimatedCost.tokenUsd);
    const searchCost = asNumber(event.searchCostUsd ?? event.search_cost_usd ?? estimatedCost.searchUsd);
    const mapsCost = asNumber(event.mapsCostUsd ?? event.maps_cost_usd ?? estimatedCost.directionsUsd);
    if ((provider === "gemini" && (tokenCost === null || searchCost === null)) || (provider === "maps" && mapsCost === null)) unknownTelemetryCost = true;
    const routeSource = event.routeSource === "maps" ? "maps" : event.routeSource === "gemini_fallback" ? "gemini_fallback" : "unavailable";
    const { error } = await supabase.from("generation_events").insert({ batch_id: batch.id, batch_item_id: claimed.id, report_id: report.id, attempt_id: attemptId, provider, stage: typeof event.stage === "string" ? event.stage.slice(0, 100) : "analysis", model: batch.model, outcome: event.outcome === "error" ? "error" : "ok", duration_ms: asNumber(event.durationMs ?? event.duration_ms), prompt_tokens: asNumber(event.promptTokens ?? event.prompt_tokens), candidate_tokens: asNumber(event.candidateTokens ?? event.candidate_tokens), thoughts_tokens: asNumber(event.thoughtsTokens ?? event.thoughts_tokens), cached_tokens: asNumber(event.cachedTokens ?? event.cached_tokens), tool_prompt_tokens: asNumber(event.toolPromptTokens ?? event.tool_prompt_tokens), search_query_count: asNumber(event.searchQueryCount ?? event.search_query_count), source_count: asNumber(event.sourceCount ?? event.source_count), token_cost_usd: tokenCost, search_cost_usd: searchCost, maps_cost_usd: mapsCost, route_source: routeSource, error_code: typeof event.errorCode === "string" ? event.errorCode.slice(0, 100) : null });
    if (error) { telemetryFailure = error.message; throw new Error(`Telemetry write failed: ${error.message}`); }
    telemetryWrites += 1;
  };

  try {
    const options = { useTolls: batch.use_tolls, departureTime: batch.departure_time ?? undefined, model: batch.model, onUsage };
    const analysis: RouteAnalysis = sanitizeAnalysis(await analyzeRoute(`${originLabel} | KGM: ${KGM_URL}`, `${destinationLabel} | KGM: ${KGM_URL}`, originCoords, destCoords, options));
    if (telemetryWrites === 0) throw new Error("STOP: paid-call telemetry is missing");
    if (telemetryFailure) throw new Error(`STOP: telemetry persistence failed (${telemetryFailure})`);
    if (unknownTelemetryCost) throw new Error("STOP: paid-call cost telemetry is missing or unknown");
    const { error: reportUpdateError } = await supabase.from("reports").update({ analysis, status: "ready", error_message: null }).eq("id", report.id).eq("operator_id", auth.userId);
    if (reportUpdateError) throw new Error(reportUpdateError.message);
    const { error: itemUpdateError } = await supabase.from("batch_items").update({ status: "ready", report_id: report.id, error_message: null }).eq("id", claimed.id).eq("status", "processing");
    if (itemUpdateError) throw new Error(itemUpdateError.message);
    const finishError = await finishBatchIfSettled(batch.id);
    if (finishError) throw new Error(finishError.message);
    return NextResponse.json({ processed: true, itemId: claimed.id, reportId: report.id, spent: gate.spent, projected: gate.projected });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Analysis failed";
    const { error: reportUpdateError } = await supabase.from("reports").update({ status: "failed", error_message: message }).eq("id", report.id).eq("operator_id", auth.userId);
    const { error: itemUpdateError } = await supabase.from("batch_items").update({ status: "failed", report_id: report.id, error_message: message }).eq("id", claimed.id).eq("status", "processing");
    if (reportUpdateError || itemUpdateError) return NextResponse.json({ error: `STOP: processing state is uncertain (${reportUpdateError?.message || itemUpdateError?.message})` }, { status: 500 });
    const finishError = await finishBatchIfSettled(batch.id);
    if (finishError) return NextResponse.json({ error: finishError.message }, { status: 500 });
    return NextResponse.json({ processed: true, itemId: claimed.id, status: "failed", error: telemetryFailure ?? message }, { status: 500 });
  }
}
