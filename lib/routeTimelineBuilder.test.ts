import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRouteTimeline, timelineForDisplay } from './routeTimelineBuilder';
import type { CriticalPoint, RouteAnalysis, RouteSchematic } from '../types';

const schematic: RouteSchematic = { totalDistance: '500 km', totalDuration: '9 sa 15 dk', nodes: [
  { name: 'Menemen', type: 'origin', distanceFromStart: '0 km', timeFromStart: '0 sa 0 dk' },
  { name: 'D300', type: 'stop', distanceFromStart: '150 km', timeFromStart: '2 sa 30 dk' },
  { name: '45 dk ara · planlama noktası', type: 'break', distanceFromStart: '270 km', timeFromStart: '5 sa 15 dk' },
  { name: 'Afyon', type: 'stop', distanceFromStart: '350 km', timeFromStart: '6 sa 40 dk' },
  { name: 'Konya', type: 'destination', distanceFromStart: '500 km', timeFromStart: '9 sa 15 dk' }
] };

test('Maps stages and planned break survive when no live road incident is available', () => {
  const timeline = buildRouteTimeline(schematic, [], '2026-09-25T18:00:00Z');
  assert.deepEqual(timeline.map(item => item.type), ['start', 'stop', 'break', 'stop', 'end']);
  assert.match(timeline[1].description, /Gece geçişi/);
  assert.match(timeline[2].description, /Tesis veya park uygunluğu/);
});

test('a sourced corridor candidate is placed among route stages without replacing them', () => {
  const point: CriticalPoint = {
    id: 'work-1', coordinate: '39,30', timeOffsetHours: 4,
    weather: { location: 'D300', temp: '-', condition: '-', icon: 'unknown' },
    traffic: { status: 'unknown', description: '-' },
    incident: { type: 'roadwork', description: 'Şerit çalışması', source: 'https://example.test' }
  };
  const timeline = buildRouteTimeline(schematic, [point], '2026-09-25T18:00:00Z');
  assert.deepEqual(timeline.map(item => item.type), ['start', 'stop', 'warning', 'break', 'stop', 'end']);
  assert.match(timeline[2].description, /Aynı yol ve yön teyit/);
});

test('endpoint-only saved reports gain Maps stages in API responses without changing stored data', () => {
  const analysis = {
    timeline: [
      { id: 'old-start', title: 'Menemen', description: '-', type: 'start' },
      { id: 'old-end', title: 'Konya', description: '-', type: 'end' }
    ],
    summary: { mapsDuration: '8 sa 0 dk' },
    routeSchematic: schematic,
    criticalPoints: []
  } satisfies Pick<RouteAnalysis, 'timeline' | 'routeSchematic' | 'criticalPoints'> & { summary: Pick<RouteAnalysis['summary'], 'mapsDuration'> };
  const hydrated = timelineForDisplay(analysis, '2026-09-25T18:00:00Z');
  assert.equal(hydrated.length, schematic.nodes.length);
  assert.equal(analysis.timeline.length, 2);
  assert.equal(hydrated[2].type, 'break');
});

test('saved detailed timelines are preserved', () => {
  const analysis = { timeline: [
    { id: '1', title: 'A', description: '', type: 'start' },
    { id: '2', title: 'B', description: '', type: 'stop' },
    { id: '3', title: 'C', description: '', type: 'end' }
  ], routeSchematic: schematic } satisfies Pick<RouteAnalysis, 'timeline' | 'routeSchematic' | 'criticalPoints'>;
  assert.equal(timelineForDisplay(analysis), analysis.timeline);
});

test('saved origin-warning-destination timeline gains Maps stages and keeps its event candidate', () => {
  const point: CriticalPoint = {
    id: 'work-2', coordinate: '39,30', timeOffsetHours: 4,
    weather: { location: 'D300', temp: '-', condition: '-', icon: 'unknown' },
    traffic: { status: 'unknown', description: '-' },
    incident: { type: 'roadwork', description: 'Şerit çalışması', source: 'https://example.test' }
  };
  const analysis = {
    summary: { mapsDuration: '8 sa 0 dk' },
    timeline: [
      { id: 'route-origin', title: 'Menemen', description: '', type: 'start' },
      { id: 'route-candidate-1', title: 'D300', description: '', type: 'warning' },
      { id: 'route-destination', title: 'Konya', description: '', type: 'end' }
    ],
    routeSchematic: schematic,
    criticalPoints: [point]
  } satisfies Pick<RouteAnalysis, 'timeline' | 'routeSchematic' | 'criticalPoints'> & { summary: Pick<RouteAnalysis['summary'], 'mapsDuration'> };
  const hydrated = timelineForDisplay(analysis);
  assert.deepEqual(hydrated.map(item => item.type), ['start', 'stop', 'warning', 'break', 'stop', 'end']);
});

test('empty saved timeline still shows valid route endpoints', () => {
  const analysis = {
    summary: { mapsDuration: '8 sa 0 dk' },
    timeline: [],
    routeSchematic: { ...schematic, nodes: [schematic.nodes[0], schematic.nodes.at(-1)!] }
  } satisfies Pick<RouteAnalysis, 'timeline' | 'routeSchematic' | 'criticalPoints'> & { summary: Pick<RouteAnalysis['summary'], 'mapsDuration'> };
  assert.deepEqual(timelineForDisplay(analysis).map(item => item.type), ['start', 'end']);
});

test('legacy critical schematic nodes are never described as Google Maps passages', () => {
  const withLegacyCritical: RouteSchematic = {
    ...schematic,
    nodes: [schematic.nodes[0], { name: 'Model kritik iddiası', type: 'critical', distanceFromStart: '50 km', timeFromStart: '1 sa' }, ...schematic.nodes.slice(1)]
  };
  const timeline = buildRouteTimeline(withLegacyCritical, []);
  assert.equal(timeline.length, schematic.nodes.length);
  assert.ok(timeline.every(item => !item.title.includes('Model kritik iddiası')));
});

test('road warnings follow their route position, not model hours that ignore rests', () => {
  const schematic: RouteSchematic = {
    totalDuration: '43 sa 49 dk', totalDistance: '1219 km',
    nodes: [
      { name: 'Menemen', type: 'origin', distanceFromStart: '0 km', timeFromStart: '0 sa 0 dk' },
      { name: 'Sarayönü · 11 sa Günlük Dinlenme', type: 'break', distanceFromStart: '547 km', timeFromStart: '20 sa 45 dk' },
      { name: 'Ulaş · D260', type: 'stop', distanceFromStart: '1.032 km', timeFromStart: '29 sa 42 dk' },
      { name: 'Arguvan', type: 'destination', distanceFromStart: '1219 km', timeFromStart: '43 sa 49 dk' }
    ]
  };
  const warning = (id: string, location: string, timeOffsetHours: number, progress: number) => ({
    id, coordinate: '39,37', timeOffsetHours, routeVerification: { status: 'corridor_candidate', progress },
    weather: { location, temp: '-', condition: '-', icon: 'unknown' },
    traffic: { status: 'unknown', description: '' },
    incident: { type: 'hazard', description: 'Dikkat.' }
  }) as CriticalPoint;
  const titles = buildRouteTimeline(schematic, [
    warning('kula', 'Kula', 1.5, 0.08),
    warning('aptalbogan', 'Aptalboğan', 14, 0.93)
  ]).map(event => event.title);
  assert.deepEqual(titles, [
    'Menemen', 'Yol uyarısı adayı · Kula', 'Sarayönü · 11 sa Günlük Dinlenme', 'Ulaş · D260', 'Yol uyarısı adayı · Aptalboğan', 'Arguvan'
  ]);
});
