import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateRouteWarnings } from './riskAggregation';
import type { CriticalPoint } from '../types';

const point = (progress: number, type: CriticalPoint['incident']['type']): CriticalPoint => ({
  id: String(progress), coordinate: '38,27',
  routeVerification: { status: 'corridor_candidate', progress },
  weather: { location: 'Yol', temp: '-', condition: '-', icon: 'unknown' },
  traffic: { status: 'unknown', description: '-' },
  incident: { type, description: 'Kaynaklı aday', source: 'https://example.test' }
});

test('warning density is a sourced-candidate count per 100 km, never a risk percentage', () => {
  const result = aggregateRouteWarnings([point(0.1, 'roadwork'), point(0.75, 'closure')], 400_000,
    [{ name: 'Ara nokta', distanceFromStartMeters: 200_000 }], 'Varış');
  assert.deepEqual(result.riskIntensity.map(segment => ({ value: segment.value, count: segment.eventCount })),
    [{ value: 0.5, count: 1 }, { value: 0.5, count: 1 }]);
  assert.deepEqual(result.riskTypes.map(type => [type.category, type.value]), [['Yol çalışması', 1], ['Yol kapanması', 1]]);
  assert.deepEqual(aggregateRouteWarnings([], 400_000, [], 'Varış').riskIntensity, []);
});
