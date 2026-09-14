import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeRoute, setGeminiClientFactoryForTests, type GeminiClient } from './geminiService';
import type { GenerationEvent } from '../types';

type RequestParams = { model: string; config?: { tools?: unknown[] } };
type FakeResponse = { text: string; usageMetadata?: object; candidates?: object[] };

const critical = JSON.stringify({
  riskIntensity: [{ name: 'Bolu', value: 50, color: '#123456' }],
  riskTypes: [], timeline: [{ title: 'Başlangıç', description: 'Yola çıkış', type: 'info' }],
  criticalPoints: [{ id: '1', coordinate: '40.735,31.607', timeOffsetHours: 3.5, weather: { location: 'Bolu', temp: '8°C', condition: 'Parçalı bulutlu', icon: 'partly_cloudy' }, traffic: { status: 'normal', description: 'Akıcı trafik' }, incident: { type: 'terrain_hazard', description: 'Dağ geçidi' } }],
  routeSchematic: { nodes: [{ name: 'İstanbul', type: 'origin', distanceFromStart: '0 km', timeFromStart: '0s 0dk' }, { name: 'Bolu', type: 'critical', distanceFromStart: '260 km', timeFromStart: '3s 30dk' }, { name: 'Düzce', type: 'intermediate', distanceFromStart: '220 km', timeFromStart: '3s 0dk' }], totalDistance: '450 km', totalDuration: '5s 30dk' },
  mandatoryBreak: 'Gerekir', breakNote: '45 dakika mola'
});
const weather = JSON.stringify([
  { location: 'Origin', temp: '10°C', condition: 'Bulutlu', icon: 'cloudy' },
  { location: 'Destination', temp: '12°C', condition: 'Açık', icon: 'sunny' }
]);
const route = JSON.stringify({ totalDistance: '450 km', estimatedDuration: '8 sa', routeDescription: 'Rota', estimatedArrivalHours: 8 });

const metered = (text: string): FakeResponse => ({
  text,
  usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 40, thoughtsTokenCount: 10, cachedContentTokenCount: 5, toolUsePromptTokenCount: 3, totalTokenCount: 158 },
  candidates: [{ groundingMetadata: { webSearchQueries: ['query'], groundingChunks: [
    { web: { uri: 'https://example.test', title: 'Example', ignored: 'not retained' } },
    { maps: { uri: 'https://maps.example.test', title: 'Map source', placeId: 'place-1', ignored: 'not retained' } }
  ] } }]
});

const mapsPayload = {
  status: 'OK',
  routes: [{ summary: 'D100', overview_polyline: { points: 'abc' }, warnings: [], legs: [{
    distance: { text: '450 km', value: 450000 }, duration: { text: '6 saat', value: 21600 }, start_address: 'Origin', end_address: 'Destination',
    steps: [{ html_instructions: 'Düz git', distance: { text: '10 km' }, duration: { text: '10 dk' } }]
  }] }]
};

const installFakeGemini = (responses: Array<FakeResponse | Error>, calls: RequestParams[]) => {
  setGeminiClientFactoryForTests(() => ({
    models: {
      generateContent: async (params: RequestParams) => {
        calls.push(params);
        const next = responses.shift();
        if (!next) throw new Error('Unexpected Gemini call');
        if (next instanceof Error) throw next;
        return next;
      }
    }
  } as unknown as GeminiClient));
};

const installMapsFetch = () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(mapsPayload), { status: 200 });
  return () => { globalThis.fetch = original; };
};

const withApiKey = async (run: () => Promise<void>) => {
  const previous = process.env.GEMINI_API_KEY;
  const previousMaps = process.env.GOOGLE_MAPS_API_KEY;
  process.env.GEMINI_API_KEY = 'test-key';
  try { await run(); } finally {
    if (previous === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
    if (previousMaps === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = previousMaps;
    setGeminiClientFactoryForTests();
  }
};

test('full Maps-backed flow forwards each allowlisted model and emits metered Search events', async () => {
  await withApiKey(async () => {
    for (const model of ['gemini-2.5-flash', 'gemini-3.8-flash'] as const) {
      const calls: RequestParams[] = [];
      const events: GenerationEvent[] = [];
      const restoreFetch = installMapsFetch();
      installFakeGemini([metered(critical), metered(weather)], calls);
      let analysis: Awaited<ReturnType<typeof analyzeRoute>> | undefined;
      try {
        process.env.GOOGLE_MAPS_API_KEY = 'test-maps-key';
        analysis = await analyzeRoute('Origin', 'Destination', '1,1', '2,2', { useTolls: true, model, onUsage: event => { events.push(event); } });
      } finally { restoreFetch(); }
      assert.ok(analysis);
      assert.equal(analysis.criticalPoints?.[0]?.weather.icon, 'cloudy');
      assert.equal(analysis.criticalPoints?.[0]?.traffic.status, 'fluid');
      assert.equal(analysis.criticalPoints?.[0]?.incident.type, 'hazard');
      assert.equal(analysis.criticalPoints?.[0]?.incident.rawType, 'terrain_hazard');
      assert.equal(analysis.routeSchematic?.nodes[2]?.type, 'stop');
      assert.equal(analysis.routeSchematic?.nodes[2]?.rawType, 'intermediate');
      assert.equal(calls.length, 2);
      assert.deepEqual(calls.map(call => call.model), [model, model]);
      assert.ok(calls.every(call => Array.isArray(call.config?.tools) && call.config.tools.length === 1));
      const mapsEvent = events.find(event => event.provider === 'maps');
      assert.equal(mapsEvent?.routeSource, 'maps');
      assert.equal(mapsEvent?.mapsCostUsd, 0.005);
      const geminiEvents = events.filter(event => event.provider === 'gemini');
      assert.equal(geminiEvents.length, 2);
      assert.ok(geminiEvents.every(event => event.searchQueryCount === 1 && event.sourceCount === 2 && event.promptTokens === 100 && event.candidateTokens === 40));
      assert.ok(geminiEvents.every(event => event.tokenCostUsd !== null));
      assert.deepEqual(analysis.groundingMetadata, [
        { web: { uri: 'https://example.test', title: 'Example' } },
        { maps: { uri: 'https://maps.example.test', title: 'Map source', placeId: 'place-1' } }
      ]);
    }
  });
});

test('malformed critical and weather responses fail the full analysis flow', async () => {
  await withApiKey(async () => {
    const calls: RequestParams[] = [];
    installFakeGemini([metered(route), metered('{"riskIntensity":[]}')], calls);
    await assert.rejects(() => analyzeRoute('Origin', 'Destination', undefined, undefined, { useTolls: true }), /invalid shape/);
    assert.equal(calls.length, 2);
    installFakeGemini([metered(route), metered(critical), metered('{"location":"Origin"}')], calls);
    await assert.rejects(() => analyzeRoute('Origin', 'Destination', undefined, undefined, { useTolls: true }), /non-empty array/);
  });
});

test('Gemini errors and telemetry failures never trigger a second paid attempt', async () => {
  await withApiKey(async () => {
    const failedCalls: RequestParams[] = [];
    const errorEvents: GenerationEvent[] = [];
    installFakeGemini([new Error('timeout')], failedCalls);
    await assert.rejects(() => analyzeRoute('Origin', 'Destination', undefined, undefined, { useTolls: true, onUsage: event => { errorEvents.push(event); } }), /timeout/);
    assert.equal(failedCalls.length, 1);
    assert.equal(errorEvents.length, 1);
    assert.equal(errorEvents[0]?.outcome, 'error');

    const successfulCalls: RequestParams[] = [];
    installFakeGemini([metered(route)], successfulCalls);
    await assert.rejects(
      () => analyzeRoute('Origin', 'Destination', undefined, undefined, { useTolls: true, onUsage: async () => { throw new Error('telemetry unavailable'); } }),
      /telemetry unavailable/
    );
    assert.equal(successfulCalls.length, 1);
  });
});
