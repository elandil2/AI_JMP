import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveGeminiModel } from './aiModels';
import { parseJsonResponse, validateCriticalAnalysis, validateRouteFallback, validateWeatherResults } from './analysisValidation';
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

test('known composite weather labels normalize without accepting unrelated icons', () => {
  const weather = validateWeatherResults([
    { location: 'Bursa', temp: '12°C', condition: 'Parçalı bulutlu', icon: 'partly_cloudy' },
    { location: 'Ankara', temp: '2°C', condition: 'Karla karışık yağmur', icon: 'rain_snow_mix' },
    { location: 'Afyon', temp: '8°C', condition: 'Gök gürültüsü', icon: 'thunderstorm' }
  ]);
  assert.deepEqual(weather.map((item) => item.icon), ['cloudy', 'snow', 'storm']);
  const turkish = validateWeatherResults([
    { location: 'Bursa', temp: '10°C', condition: 'Bulutlu', icon: 'parçalı bulutlu' },
    { location: 'Ankara', temp: '2°C', condition: 'Yağmurlu', icon: 'sağanak yağmur' },
    { location: 'Bolu', temp: '0°C', condition: 'Sisli', icon: 'sis' }
  ]);
  assert.deepEqual(turkish.map((item) => item.icon), ['cloudy', 'rainy', 'fog']);
  assert.throws(() => validateWeatherResults([{ location: 'Bursa', temp: '12°C', condition: 'Bilinmiyor', icon: 'decorative-star' }]), /icon is invalid/);
});

test('critical categories normalize known labels and reject unknown or negated labels', () => {
  const sample = () => ({
    riskIntensity: [{ name: 'Bolu', value: 50, color: '#123456' }],
    timeline: [{ title: 'Uyarı', description: 'Kontrol', type: 'warning' }],
    criticalPoints: [{ id: '1', coordinate: '40.7,31.6', weather: { location: 'Bolu', temp: '8°C', condition: 'Bulutlu', icon: 'cloudy' }, traffic: { status: 'normal', description: 'Akıcı' }, incident: { type: 'road_work', description: 'Bakım' } }],
    routeSchematic: { nodes: [{ name: 'Bolu', type: 'checkpoint', distanceFromStart: '1 km', timeFromStart: '1 dk' }], totalDistance: '1 km', totalDuration: '1 dk' },
    mandatoryBreak: 'Gerekmez', breakNote: 'Kısa rota'
  });
  const valid = validateCriticalAnalysis(sample());
  assert.equal((valid.criticalPoints as Array<{ traffic: { status: string }; incident: { type: string } }>)[0].incident.type, 'roadwork');
  const badTraffic = sample();
  badTraffic.criticalPoints[0].traffic.status = 'not-heavy';
  assert.throws(() => validateCriticalAnalysis(badTraffic), /traffic.status is invalid/);
  const badIncident = sample();
  badIncident.criticalPoints[0].incident.type = 'collision';
  assert.throws(() => validateCriticalAnalysis(badIncident), /incident.type is invalid/);
});
