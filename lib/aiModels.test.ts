import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveGeminiModel } from './aiModels';
import { parseJsonResponse, validateRouteFallback, validateWeatherResults } from './analysisValidation';
import { estimateGeminiUsageCost, estimatedDirectionsCost } from './usageCost';

test('only approved Gemini models resolve', () => {
  assert.equal(resolveGeminiModel(), 'gemini-2.5-flash');
  assert.equal(resolveGeminiModel('gemini-3.8-flash'), 'gemini-3.8-flash');
  assert.throws(() => resolveGeminiModel('gemini-1.5-pro'), /Unsupported Gemini model/);
});

test('token pricing preserves an unknown token estimate when metadata is absent', () => {
  const unknown = estimateGeminiUsageCost({ model: 'gemini-2.5-flash', groundedPromptCount: 1 });
  assert.equal(unknown.tokenUsd, null);
  assert.equal(unknown.totalUsd, null);
  assert.equal(unknown.searchUsd, 0.035);
  const known = estimateGeminiUsageCost({ model: 'gemini-3.8-flash', tokens: { prompt: 1_000_000, candidate: 1_000_000 }, searchQueryCount: 2 });
  assert.equal(known.tokenUsd, 4.5);
  assert.equal(known.searchUsd, 0.028);
  assert.equal(known.totalUsd, 4.528);
  const withThinking = estimateGeminiUsageCost({ model: 'gemini-2.5-flash', tokens: { prompt: 1_000_000, candidate: 1_000_000, thoughts: 1_000_000, toolUse: 1_000_000, total: 4_000_000 } });
  assert.equal(withThinking.tokenUsd, 5.6);
  assert.equal(estimateGeminiUsageCost({ model: 'gemini-2.5-flash', tokens: { prompt: 100 } }).tokenUsd, null);
  const directions = estimatedDirectionsCost();
  assert.equal(directions.directionsUsd, 0.005);
  assert.equal(directions.totalUsd, 0.005);
});

test('JSON validation accepts arrays for weather and rejects invalid payloads', () => {
  const weather = validateWeatherResults(parseJsonResponse('[{"location":"Ankara","temp":"10°C","condition":"Bulutlu","icon":"cloudy"}]'));
  assert.equal(weather.length, 1);
  assert.throws(() => validateWeatherResults(parseJsonResponse('{"location":"Ankara"}')), /non-empty array/);
  assert.throws(() => validateRouteFallback(parseJsonResponse('{"totalDistance":"1 km"}')), /invalid shape/);
});
