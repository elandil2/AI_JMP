import type { EstimatedUsageCost, GenerationTokens } from '../types';
import type { GeminiModel } from './aiModels';

const PRICING_VERSION = 'Google Gemini standard paid rates, September 2026';

const TOKEN_PRICING: Record<GeminiModel, { inputPerMillion: number; outputPerMillion: number }> = {
  'gemini-2.5-flash': { inputPerMillion: 0.30, outputPerMillion: 2.50 },
  'gemini-3.8-flash': { inputPerMillion: 0.75, outputPerMillion: 3.75 }
};

export interface GeminiUsageInput {
  model: GeminiModel;
  tokens?: GenerationTokens;
  groundedPromptCount?: number;
  searchQueryCount?: number;
  freeGroundedPromptAllowance?: number;
  freeSearchQueryAllowance?: number;
}

const roundUsd = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

/**
 * Estimates list-price usage. Free Search allowance is caller-supplied because account usage is
 * not available in a request; zero means the estimate assumes the allowance is exhausted.
 */
export function estimateGeminiUsageCost(input: GeminiUsageInput): EstimatedUsageCost {
  const prices = TOKEN_PRICING[input.model];
  const prompt = input.tokens?.prompt;
  const candidate = input.tokens?.candidate;
  const thoughts = input.tokens?.thoughts ?? 0;
  const toolUse = input.tokens?.toolUse ?? 0;
  const total = input.tokens?.total;
  const hasTokenMetadata = prompt !== undefined && candidate !== undefined
    && [prompt, candidate, thoughts, toolUse, total ?? 0].every(value => Number.isFinite(value) && value >= 0);
  // Thinking is billed as output. Count tool-use prompts as input conservatively;
  // unclassified total-token residual is priced at the higher output rate.
  const unclassified = Math.max(0, (total ?? 0) - (prompt ?? 0) - (candidate ?? 0) - thoughts - toolUse);
  const tokenUsd = (((prompt ?? 0) + toolUse) / 1_000_000) * prices.inputPerMillion
    + ((candidate ?? 0) + thoughts + unclassified) / 1_000_000 * prices.outputPerMillion;
  const rawSearchUnits = input.model === 'gemini-2.5-flash'
    ? input.groundedPromptCount ?? 0
    : input.searchQueryCount ?? 0;
  const allowance = input.model === 'gemini-2.5-flash'
    ? input.freeGroundedPromptAllowance ?? 0
    : input.freeSearchQueryAllowance ?? 0;
  const searchUnits = Math.max(0, rawSearchUnits - allowance);
  const searchUsd = searchUnits * (input.model === 'gemini-2.5-flash' ? 0.035 : 0.014);

  return {
    currency: 'USD',
    pricingVersion: PRICING_VERSION,
    tokenUsd: hasTokenMetadata ? roundUsd(tokenUsd) : null,
    searchUsd: roundUsd(searchUsd),
    totalUsd: hasTokenMetadata ? roundUsd(tokenUsd + searchUsd) : null,
    assumption: 'Conservative list-price estimate: thoughts and unclassified tokens use output price, tool-use prompts use input price, and Search free allowances are assumed exhausted.'
  };
}

export function estimatedDirectionsCost(trafficAware = false): EstimatedUsageCost {
  return {
    currency: 'USD',
    pricingVersion: `Google Maps Directions Legacy ${trafficAware ? 'Advanced' : 'Essentials'} list price, September 2026`,
    directionsUsd: trafficAware ? 0.01 : 0.005,
    totalUsd: trafficAware ? 0.01 : 0.005,
    assumption: 'List-price estimate per attempted Directions request; traffic requests use Advanced. Actual billing depends on free caps and account pricing.'
  };
}
