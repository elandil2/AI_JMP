import { getSupabaseAdmin } from './supabaseAdmin';
import type { GenerationEvent } from '../types';

export async function recordReportUsage(reportId: string, attemptId: string, event: GenerationEvent) {
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
  if (error) throw new Error('Usage record could not be saved. No automatic retry was made.');
}
