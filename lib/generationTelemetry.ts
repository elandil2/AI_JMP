import { getSupabaseAdmin } from './supabaseAdmin';
import type { GenerationEvent } from '../types';

export type UsageWriteResult =
  | { persisted: true }
  | { persisted: false; error: string };

export type UsageDiagnosticEvent = {
  batch_item_id?: string | null;
  provider: string;
  outcome?: string | null;
  token_cost_usd?: unknown;
  search_cost_usd?: unknown;
  maps_cost_usd?: unknown;
  prompt_tokens?: unknown;
  candidate_tokens?: unknown;
};

const finiteNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export function isUsageCostKnown(event: Pick<GenerationEvent, 'provider' | 'tokenCostUsd' | 'searchCostUsd' | 'mapsCostUsd'>) {
  return event.provider === 'gemini'
    ? finiteNumber(event.tokenCostUsd) !== null && finiteNumber(event.searchCostUsd) !== null
    : finiteNumber(event.mapsCostUsd) !== null;
}

/** Keeps a missing estimate distinct from a real zero while summarizing batch diagnostics. */
export function summarizeUsageTelemetry(events: UsageDiagnosticEvent[], readyItemIds: string[] = []) {
  const eventCountByItem = new Map<string, number>();
  let unknownCost = false;
  let usd = 0;
  let failedEventCount = 0;
  let promptTokens = 0;
  let candidateTokens = 0;
  let unknownTokenEventCount = 0;

  for (const event of events) {
    if (event.batch_item_id) eventCountByItem.set(event.batch_item_id, (eventCountByItem.get(event.batch_item_id) ?? 0) + 1);
    if (event.outcome === 'error') failedEventCount += 1;

    const tokenCost = finiteNumber(event.token_cost_usd);
    const searchCost = finiteNumber(event.search_cost_usd);
    const mapsCost = finiteNumber(event.maps_cost_usd);
    if (event.provider === 'gemini') {
      if (tokenCost === null || searchCost === null) unknownCost = true;
      usd += (tokenCost ?? 0) + (searchCost ?? 0);
    } else {
      if (mapsCost === null) unknownCost = true;
      usd += mapsCost ?? 0;
    }

    if (event.provider === 'gemini') {
      const prompt = finiteNumber(event.prompt_tokens);
      const candidate = finiteNumber(event.candidate_tokens);
      if (prompt === null || candidate === null) unknownTokenEventCount += 1;
      promptTokens += prompt ?? 0;
      candidateTokens += candidate ?? 0;
    }
  }

  if (readyItemIds.some(itemId => !eventCountByItem.has(itemId))) unknownCost = true;

  return {
    usd,
    unknownCost,
    eventCount: events.length,
    failedEventCount,
    promptTokens,
    candidateTokens,
    unknownTokenEventCount
  };
}

export async function recordReportUsage(reportId: string, attemptId: string, event: GenerationEvent) {
  try {
    const { error } = await getSupabaseAdmin().from('generation_events').insert({
      report_id: reportId, attempt_id: attemptId, provider: event.provider, stage: event.stage,
      model: event.provider === 'gemini' ? event.model : null,
      outcome: event.outcome === 'error' ? 'error' : 'ok', duration_ms: event.durationMs,
      prompt_tokens: event.promptTokens ?? null, candidate_tokens: event.candidateTokens ?? null,
      thoughts_tokens: event.thoughtsTokens ?? null, cached_tokens: event.cachedTokens ?? null,
      tool_prompt_tokens: event.toolPromptTokens ?? null, search_query_count: event.searchQueryCount ?? null,
      source_count: event.sourceCount ?? null, token_cost_usd: event.tokenCostUsd ?? null,
      search_cost_usd: event.searchCostUsd ?? null, maps_cost_usd: event.mapsCostUsd ?? null,
      route_source: event.routeSource ?? null, error_code: event.errorCode ?? (event.outcome === 'error' ? 'provider_request_failed' : null)
    });
    if (error) {
      console.error('[report-telemetry] Usage event persistence failed; no retry was made.', {
        reportId, attemptId, provider: event.provider, stage: event.stage, error: error.message
      });
      return { persisted: false, error: error.message } satisfies UsageWriteResult;
    }
    return { persisted: true } satisfies UsageWriteResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown telemetry persistence error';
    console.error('[report-telemetry] Usage event persistence threw; no retry was made.', {
      reportId, attemptId, provider: event.provider, stage: event.stage, error: message
    });
    return { persisted: false, error: message } satisfies UsageWriteResult;
  }
}
