import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeRoute, setGeminiClientFactoryForTests, type GeminiClient } from './geminiService';
import type { GenerationEvent } from '../types';

type RequestParams = { model: string; config?: { tools?: unknown[] } };
type FakeResponse = { text: string; usageMetadata?: object; candidates?: object[] };

const critical = JSON.stringify({
  riskIntensity: [{ name: 'Bolu', value: 50, color: '#123456' }],
  riskTypes: [], timeline: [{ title: 'Başlangıç', description: 'Yola çıkış', type: 'info' }],
  criticalPoints: [{ id: '1', coordinate: '40.735,31.607', timeOffsetHours: 3.5, weather: { location: 'Bolu', temp: '8°C', condition: 'Parçalı bulutlu', icon: 'partly_cloudy' }, traffic: { status: 'normal', description: 'Akıcı trafik' }, incident: { type: 'terrain_hazard', description: 'Dağ geçidi', source: 'https://www.kgm.gov.tr/road' } }],
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
const canonicalPolyline = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';

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

const installMapsFetch = (payload: unknown = mapsPayload) => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(payload), { status: 200 });
  return () => { globalThis.fetch = original; };
};

const withApiKey = async (run: () => Promise<void>) => {
  const previous = process.env.GEMINI_API_KEY;
  const previousMaps = process.env.GOOGLE_MAPS_API_KEY;
  const previousMapbox = process.env.MAPBOX_TOKEN;
  const previousTomTom = process.env.TOMTOM_API_KEY;
  const previousKgmPermission = process.env.KGM_COMMERCIAL_DATA_PERMISSION;
  process.env.GEMINI_API_KEY = 'test-key';
  process.env.KGM_COMMERCIAL_DATA_PERMISSION = 'yes';
  delete process.env.MAPBOX_TOKEN;
  delete process.env.TOMTOM_API_KEY;
  try { await run(); } finally {
    if (previous === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
    if (previousMaps === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = previousMaps;
    if (previousMapbox === undefined) delete process.env.MAPBOX_TOKEN;
    else process.env.MAPBOX_TOKEN = previousMapbox;
    if (previousTomTom === undefined) delete process.env.TOMTOM_API_KEY;
    else process.env.TOMTOM_API_KEY = previousTomTom;
    if (previousKgmPermission === undefined) delete process.env.KGM_COMMERCIAL_DATA_PERMISSION;
    else process.env.KGM_COMMERCIAL_DATA_PERMISSION = previousKgmPermission;
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
      assert.equal(analysis.criticalPoints?.length, 0);
      assert.equal(analysis.weather.origin.icon, 'cloudy');
      assert.deepEqual(analysis.weather.waypoints, []);
      assert.deepEqual(analysis.routeSchematic?.nodes.map(node => node.type), ['origin', 'destination']);
      assert.equal(analysis.summary.mapsDuration, '6 sa 0 dk');
      assert.equal(analysis.summary.estimatedDuration, '8 sa 15 dk');
      assert.equal(analysis.summary.breakDuration, '0 sa 45 dk');
      assert.equal(analysis.routeSchematic?.nodes.at(-1)?.timeFromStart, analysis.summary.estimatedDuration);
      assert.match(analysis.summary.routeNotice!, /otomobil/);
      assert.equal(analysis.summary.sourceCoverage, 'unverified');
      assert.equal(calls.length, 2);
      assert.deepEqual(calls.map(call => call.model), [model, model]);
      assert.ok(calls.every(call => Array.isArray(call.config?.tools) && call.config.tools.length === 1));
      const mapsEvent = events.find(event => event.provider === 'maps');
      assert.equal(mapsEvent?.routeSource, 'maps');
      assert.equal(mapsEvent?.mapsCostUsd, 0.01);
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

test('Maps geometry keeps only corridor candidates and never trusts Gemini schematic steps', async () => {
  await withApiKey(async () => {
    const calls: RequestParams[] = [];
    const restoreFetch = installMapsFetch({
      ...mapsPayload,
      routes: [{ ...mapsPayload.routes[0], overview_polyline: { points: canonicalPolyline } }]
    });
    process.env.GOOGLE_MAPS_API_KEY = 'test-maps-key';
    const onCorridorCritical = JSON.parse(critical);
    onCorridorCritical.criticalPoints[0].coordinate = '38.5,-120.2';
    const corridorWeather = JSON.stringify([
      ...JSON.parse(weather),
      { location: 'Bolu', temp: '8°C', condition: 'Parçalı bulutlu', icon: 'cloudy' },
      { location: 'OffRouteTown', temp: '35°C', condition: 'Sıcak', icon: 'sunny' }
    ]);
    installFakeGemini([metered(JSON.stringify(onCorridorCritical)), metered(corridorWeather)], calls);
    try {
      const analysis = await analyzeRoute('Origin', 'Destination', '1,1', '2,2', { useTolls: true });
      assert.equal(analysis.criticalPoints?.length, 1);
      assert.equal(analysis.criticalPoints?.[0]?.routeVerification?.status, 'corridor_candidate');
      assert.equal(analysis.criticalPoints?.[0]?.incident.description, 'Dağ geçidi');
      assert.deepEqual(analysis.weather.waypoints, []);
      assert.deepEqual(analysis.routeSchematic?.nodes.map(node => node.type), ['origin', 'destination']);
      assert.equal(calls.length, 2);
    } finally { restoreFetch(); }
  });
});

test('off-corridor Gemini critical points are omitted from the returned route warnings', async () => {
  await withApiKey(async () => {
    const calls: RequestParams[] = [];
    const offRouteCritical = JSON.parse(critical);
    offRouteCritical.criticalPoints.push({
      ...offRouteCritical.criticalPoints[0], id: '2', timeOffsetHours: 4,
      weather: { ...offRouteCritical.criticalPoints[0].weather, location: 'RemoteBreakPoint' },
      incident: { type: 'break', description: 'Yapay mola noktası' }
    });
    const restoreFetch = installMapsFetch({
      ...mapsPayload,
      routes: [{ ...mapsPayload.routes[0], overview_polyline: { points: canonicalPolyline } }]
    });
    process.env.GOOGLE_MAPS_API_KEY = 'test-maps-key';
    installFakeGemini([metered(JSON.stringify(offRouteCritical)), metered(weather)], calls);
    try {
      const analysis = await analyzeRoute('Origin', 'Destination', '1,1', '2,2', { useTolls: true });
      assert.deepEqual(analysis.criticalPoints, []);
      assert.deepEqual(analysis.riskIntensity, []);
      assert.deepEqual(analysis.riskTypes, []);
      assert.deepEqual(analysis.timeline.map(event => event.title), ['Origin', 'Destination']);
      assert.deepEqual(analysis.routeSchematic?.nodes.map(node => node.type), ['origin', 'destination']);
      assert.doesNotMatch(JSON.stringify(analysis), /Bolu|RemoteBreakPoint|Yapay mola noktası/);
    } finally { restoreFetch(); }
  });
});

test('an on-corridor incident without a direct source is omitted, not presented as a verified road event', async () => {
  await withApiKey(async () => {
    const calls: RequestParams[] = [];
    const restoreFetch = installMapsFetch({
      ...mapsPayload,
      routes: [{ ...mapsPayload.routes[0], overview_polyline: { points: canonicalPolyline } }]
    });
    process.env.GOOGLE_MAPS_API_KEY = 'test-maps-key';
    const unsourced = JSON.parse(critical);
    unsourced.criticalPoints[0].coordinate = '38.5,-120.2';
    delete unsourced.criticalPoints[0].incident.source;
    installFakeGemini([metered(JSON.stringify(unsourced)), metered(weather)], calls);
    try {
      const analysis = await analyzeRoute('Origin', 'Destination', '1,1', '2,2', { useTolls: true });
      assert.deepEqual(analysis.criticalPoints, []);
      assert.equal(analysis.summary.omittedUnsourcedPoints, 1);
      assert.deepEqual(analysis.timeline.map(item => item.title), ['Origin', 'Destination']);
      assert.deepEqual(analysis.weather.waypoints, []);
    } finally { restoreFetch(); }
  });
});

test('malformed supplemental research leaves the route available with explicit unknown weather', async () => {
  await withApiKey(async () => {
    const calls: RequestParams[] = [];
    installFakeGemini([metered(route), metered('{"riskIntensity":[]}')], calls);
    const first = await analyzeRoute('Origin', 'Destination', undefined, undefined, { useTolls: true });
    assert.equal(first.routeSchematic?.nodes.length, 2);
    assert.equal(first.weather.origin.icon, 'unknown');
    assert.match(first.summary.routeNotice ?? '', /araştırması tamamlanamadı/);
    installFakeGemini([metered(route), metered(critical), metered('{"location":"Origin"}')], calls);
    const second = await analyzeRoute('Origin', 'Destination', undefined, undefined, { useTolls: true });
    assert.equal(second.weather.destination.icon, 'unknown');
  });
});

test('Gemini errors and telemetry failures never trigger a second paid attempt', async () => {
  await withApiKey(async () => {
    const failedCalls: RequestParams[] = [];
    const errorEvents: GenerationEvent[] = [];
    installFakeGemini([new Error('timeout')], failedCalls);
    await assert.rejects(() => analyzeRoute('Origin', 'Destination', undefined, undefined, { useTolls: true, onUsage: event => { errorEvents.push(event); } }), /Gemini request failed/);
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

test('invalid road research retains billable tokens while the route and weather stage continue', async () => {
  await withApiKey(async () => {
    const calls: RequestParams[] = [];
    const events: GenerationEvent[] = [];
    installFakeGemini([metered(route), metered('{"riskIntensity":[]}')], calls);
    const result = await analyzeRoute('Origin','Destination',undefined,undefined,{useTolls:true,onUsage:event=>{events.push(event);}});
    assert.equal(result.criticalPoints?.length, 0);
    assert.equal(calls.length,3);
    assert.equal(events.length,3);
    assert.equal(events[1].outcome,'error');
    assert.equal(events[1].errorCode,'invalid_generated_output');
    assert.equal(events[1].promptTokens,100);
    assert.ok(events[1].tokenCostUsd! > 0);
  });
});

test('Maps steps create route and weather checkpoints even when no road incident is found', async () => {
  await withApiKey(async () => {
    const calls: RequestParams[] = [];
    const richMapsPayload = {
      ...mapsPayload,
      routes: [{ ...mapsPayload.routes[0], legs: [{ ...mapsPayload.routes[0].legs[0],
        steps: Array.from({ length: 6 }, (_, index) => ({
          html_instructions: `D${300 - index * 10} yönünde ilerle`,
          distance: { text: '75 km', value: 75000 }, duration: { text: '1 sa', value: 3600 },
          start_location: { lat: 38 + index * 0.1, lng: 27 + index },
          end_location: { lat: 38 + (index + 1) * 0.1, lng: 28 + index }
        }))
      }] }]
    };
    const restoreFetch = installMapsFetch(richMapsPayload);
    process.env.GOOGLE_MAPS_API_KEY = 'test-maps-key';
    installFakeGemini([metered('{"criticalPoints":[]}'), metered(JSON.stringify([
      { location: 'Origin (origin, koordinat 38,27)', temp: '20°C', condition: 'Açık', icon: 'sunny' },
      { location: 'Destination (destination, koordinat 38.6,33)', temp: '18°C', condition: 'Bulutlu', icon: 'cloudy' }
    ]))], calls);
    try {
      const analysis = await analyzeRoute('Origin', 'Destination', '38,27', '38.6,33', { useTolls: true });
      assert.ok((analysis.routeSchematic?.nodes.length ?? 0) >= 7);
      assert.equal(analysis.weather.waypoints?.length, 5);
      assert.equal(analysis.weather.origin.temp, '20°C');
      assert.equal(analysis.criticalPoints?.length, 0);
      assert.ok((analysis.routeSchematic?.nodes ?? []).some(node => node.type === 'break'));
      assert.equal(analysis.timeline.length, analysis.routeSchematic?.nodes.length);
      assert.ok(analysis.timeline.some(event => event.type === 'break'));
      assert.match(JSON.stringify(calls[1]), /koordinat/);
    } finally { restoreFetch(); }
  });
});

test('AI road claims without grounding metadata are omitted even when they contain a URL', async () => {
  await withApiKey(async () => {
    const calls: RequestParams[] = [];
    const restoreFetch = installMapsFetch({ ...mapsPayload, routes: [{ ...mapsPayload.routes[0], overview_polyline: { points: canonicalPolyline } }] });
    process.env.GOOGLE_MAPS_API_KEY = 'test-maps-key';
    const claim = JSON.parse(critical);
    claim.criticalPoints[0].coordinate = '38.5,-120.2';
    const ungrounded: FakeResponse = { text: JSON.stringify(claim), usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 10 } };
    installFakeGemini([ungrounded, metered(weather)], calls);
    try {
      const analysis = await analyzeRoute('Origin', 'Destination', '1,1', '2,2', { useTolls: true });
      assert.equal(analysis.criticalPoints?.length, 0);
      assert.equal(analysis.summary.omittedUngroundedPoints, 1);
    } finally { restoreFetch(); }
  });
});

test('unlicensed KGM research is not sent to Gemini', async () => {
  await withApiKey(async () => {
    process.env.KGM_COMMERCIAL_DATA_PERMISSION = 'no';
    const calls: RequestParams[] = [];
    const restoreFetch = installMapsFetch();
    process.env.GOOGLE_MAPS_API_KEY = 'test-maps-key';
    installFakeGemini([metered(weather)], calls);
    try {
      const analysis = await analyzeRoute('Origin', 'Destination', '1,1', '2,2', { useTolls: true });
      assert.equal(calls.length, 1);
      assert.equal(analysis.criticalPoints?.length, 0);
      assert.match(analysis.summary.routeNotice ?? '', /ticari veri izni tanımlı değil/);
    } finally { restoreFetch(); }
  });
});

test('TomTom roadwork candidates enter the report and count-based route density', async () => {
  await withApiKey(async () => {
    process.env.KGM_COMMERCIAL_DATA_PERMISSION = 'no';
    process.env.GOOGLE_MAPS_API_KEY = 'test-maps-key';
    process.env.TOMTOM_API_KEY = 'test-tomtom-key';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async input => String(input).includes('api.tomtom.com')
      ? new Response(JSON.stringify({ incidents: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [-120.2, 38.5] }, properties: {
        id: 'work-1', iconCategory: 9, events: [{ description: 'D260 road works' }], timeValidity: 'present', roadNumbers: ['D260']
      } }] }))
      : new Response(JSON.stringify({ ...mapsPayload, routes: [{ ...mapsPayload.routes[0], overview_polyline: { points: canonicalPolyline } }] }));
    const calls: RequestParams[] = [];
    installFakeGemini([metered(weather)], calls);
    try {
      const analysis = await analyzeRoute('Origin', 'Destination', '1,1', '2,2', { useTolls: true });
      assert.equal(analysis.criticalPoints?.[0]?.provenance?.provider, 'tomtom');
      assert.equal(analysis.criticalPoints?.[0]?.incident.type, 'roadwork');
      assert.equal(analysis.riskTypes[0]?.category, 'Yol çalışması');
      assert.ok(analysis.riskIntensity.length > 0);
    } finally { globalThis.fetch = originalFetch; }
  });
});

test('missing location weather is marked unknown instead of copying another city forecast', async () => {
  await withApiKey(async () => {
    const calls: RequestParams[] = [];
    installFakeGemini([metered(route),metered(critical),metered(JSON.stringify([{location:'Other City',temp:'30°C',condition:'Açık',icon:'sunny'}]))],calls);
    const result=await analyzeRoute('Origin','Destination',undefined,undefined,{useTolls:true});
    assert.equal(result.weather.origin.icon,'unknown');
    assert.equal(result.weather.destination.temp,'-');
    assert.match(result.summary.routeNotice!,/AI tahminidir/);
  });
});
