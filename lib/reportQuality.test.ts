import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPublishableRoute } from './reportQuality';
import type { RouteAnalysis } from '../types';

const report = (distance: string, mapDuration?: string, interior = 0): RouteAnalysis => ({
  summary: { totalDistance: distance, estimatedDuration: '3 sa', mandatoryBreak: '-', breakNote: '-', mapsDuration: mapDuration },
  weather: { origin: { location: 'A', temp: '-', condition: '-', icon: 'unknown' }, destination: { location: 'B', temp: '-', condition: '-', icon: 'unknown' } },
  riskIntensity: [], riskTypes: [], timeline: [],
  routeSchematic: { totalDistance: distance, totalDuration: '3 sa', nodes: [
    { name: 'A', type: 'origin', distanceFromStart: '0 km', timeFromStart: '0 sa' },
    ...Array.from({ length: interior }, (_, index) => ({ name: `D${index}`, type: 'stop' as const, distanceFromStart: `${index + 1} km`, timeFromStart: `${index + 1} sa` })),
    { name: 'B', type: 'destination', distanceFromStart: distance, timeFromStart: '3 sa' }
  ] }
});

test('a report needs Maps and interior route steps before being published as a long route', () => {
  assert.throws(() => assertPublishableRoute(report('500 km', undefined, 5)), /Maps rota verisi/);
  assert.throws(() => assertPublishableRoute(report('500 km', '6 sa', 1)), /ara noktası olmayan/);
  assert.doesNotThrow(() => assertPublishableRoute(report('500 km', '6 sa', 2)));
  assert.doesNotThrow(() => assertPublishableRoute(report('80 km', '1 sa', 0)));
});
