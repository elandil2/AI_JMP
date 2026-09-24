import assert from 'node:assert/strict';
import test from 'node:test';
import { isUsageCostKnown, summarizeUsageTelemetry } from './generationTelemetry';

test('a real zero usage estimate is known and stays distinct from a missing estimate', () => {
  assert.equal(isUsageCostKnown({ provider: 'gemini', tokenCostUsd: 0, searchCostUsd: 0, mapsCostUsd: null }), true);
  assert.equal(isUsageCostKnown({ provider: 'gemini', tokenCostUsd: null, searchCostUsd: 0, mapsCostUsd: null }), false);
  assert.equal(isUsageCostKnown({ provider: 'maps', tokenCostUsd: null, searchCostUsd: null, mapsCostUsd: 0 }), true);
  assert.equal(isUsageCostKnown({ provider: 'maps', tokenCostUsd: null, searchCostUsd: null, mapsCostUsd: null }), false);
});

test('batch telemetry summary marks missing values and ready reports without events as unknown', () => {
  const knownZero = summarizeUsageTelemetry([{
    batch_item_id: 'item-1', provider: 'gemini', outcome: 'ok',
    token_cost_usd: 0, search_cost_usd: 0, prompt_tokens: 0, candidate_tokens: 0
  }], ['item-1']);
  assert.equal(knownZero.usd, 0);
  assert.equal(knownZero.unknownCost, false);
  assert.equal(knownZero.unknownTokenEventCount, 0);

  const missing = summarizeUsageTelemetry([{
    batch_item_id: 'item-1', provider: 'gemini', outcome: 'error',
    token_cost_usd: null, search_cost_usd: 0, prompt_tokens: null, candidate_tokens: null
  }], ['item-1', 'item-2']);
  assert.equal(missing.usd, 0);
  assert.equal(missing.unknownCost, true);
  assert.equal(missing.failedEventCount, 1);
  assert.equal(missing.unknownTokenEventCount, 1);
});
