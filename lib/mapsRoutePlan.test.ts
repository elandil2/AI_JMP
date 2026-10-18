import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMapsRoutePlan } from './mapsRoutePlan';
import { getDirections, type DirectionsResult } from './googleMaps';

const makeDirections = (stepCount = 6): DirectionsResult => {
  const steps = Array.from({ length: stepCount }, (_, index) => ({
    instruction: `Devam edin D${index + 1} yolunda`,
    roadLabel: `D${index + 1}`,
    distance: '100 km',
    duration: '1 sa 40 dk',
    distanceMeters: 100_000,
    durationSeconds: 6_000,
    startLocation: { lat: 38 + index * 0.1, lng: 27 + index * 0.1 },
    endLocation: { lat: 38 + (index + 1) * 0.1, lng: 27 + (index + 1) * 0.1 }
  }));
  return {
    distance: { text: `${stepCount * 100} km`, value: stepCount * 100_000 },
    duration: { text: `${stepCount * 100} min`, value: stepCount * 6_000 },
    startAddress: 'Menemen başlangıcı',
    endAddress: 'Arguvan varışı',
    startLocation: { lat: 38, lng: 27 },
    endLocation: { lat: 38 + stepCount * 0.1, lng: 27 + stepCount * 0.1 },
    summary: 'D1 / D2 / D3',
    steps,
    polyline: '',
    warnings: []
  };
};

test('Maps parser preserves numeric step measures, coordinates, and road labels', async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.GOOGLE_MAPS_API_KEY;
  process.env.GOOGLE_MAPS_API_KEY = 'test-only';
  globalThis.fetch = async () => new Response(JSON.stringify({ routes: [{
    description: 'D300 / E96', polyline: { encodedPolyline: 'encoded-route' }, legs: [{
      distanceMeters: 200_000, duration: '7200s', staticDuration: '7200s',
      startLocation: { latLng: { latitude: 38.6, longitude: 27.0667 } }, endLocation: { latLng: { latitude: 38.75, longitude: 30.55 } },
      steps: [
        {
          navigationInstruction: { maneuver: 'STRAIGHT', instructions: 'D300/E96 üzerinden devam edin' },
          distanceMeters: 80_000, staticDuration: '2800s', localizedValues: { distance: { text: '80 km' }, staticDuration: { text: '47 dk' } },
          startLocation: { latLng: { latitude: 38.6, longitude: 27.0667 } }, endLocation: { latLng: { latitude: 38.67, longitude: 28.2 } }
        },
        {
          navigationInstruction: { maneuver: 'TURN_RIGHT', instructions: 'Afyonkarahisar yönüne sağa dönün' },
          distanceMeters: 120_000, staticDuration: '4400s',
          startLocation: { latLng: { latitude: 38.67, longitude: 28.2 } }, endLocation: { latLng: { latitude: 38.75, longitude: 30.55 } }
        },
        {
          navigationInstruction: { instructions: 'Ankara Çevre Yolu yoluna devam edin' },
          distanceMeters: 1_000, staticDuration: '60s'
        }
      ]
    }]
  }] }));

  try {
    const result = await getDirections('38.6,27.0667', '38.75,30.55', { onUsage: () => undefined });
    assert.ok(result);
    assert.deepEqual(result.startLocation, { lat: 38.6, lng: 27.0667 });
    assert.deepEqual(result.endLocation, { lat: 38.75, lng: 30.55 });
    assert.equal(result.steps[0].distanceMeters, 80_000);
    assert.equal(result.steps[0].durationSeconds, 2_800);
    assert.deepEqual(result.steps[0].startLocation, { lat: 38.6, lng: 27.0667 });
    assert.deepEqual(result.steps[0].endLocation, { lat: 38.67, lng: 28.2 });
    assert.equal(result.steps[0].roadLabel, 'D300 / E96');
    assert.equal(result.steps[0].distance, '80 km');
    assert.equal(result.steps[0].maneuver, 'straight');
    assert.equal(result.steps[1].roadLabel, undefined);
    assert.equal(result.steps[1].instruction, 'Afyonkarahisar yönüne sağa dönün');
    assert.equal(result.steps[1].maneuver, 'turn-right');
    assert.equal(result.steps[2].roadLabel, 'Ankara Çevre Yolu');
    assert.equal(result.summary, 'D300 / E96');
    assert.equal(result.polyline, 'encoded-route');
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = oldKey;
  }
});

test('route schematic uses ordered Maps road boundaries with cumulative km and planned times', () => {
  const plan = buildMapsRoutePlan(makeDirections(), { originName: 'Menemen', destinationName: 'Arguvan' });
  const interior = plan.routeSchematic.nodes.filter(node => node.type === 'stop');
  assert.equal(interior.length, 5);
  assert.deepEqual(interior.map(node => node.name), ['D1', 'D2', 'D3', 'D4', 'D5']);
  assert.deepEqual(interior.map(node => node.distanceFromStart), ['100 km', '200 km', '300 km', '400 km', '500 km']);
  assert.deepEqual(interior.map(node => node.timeFromStart), ['1 sa 40 dk', '3 sa 20 dk', '5 sa 45 dk', '7 sa 25 dk', '9 sa 5 dk']);
  assert.deepEqual(plan.weatherCheckpoints.map(point => point.coordinate), makeDirections().steps.slice(0, 5).map(step => step.endLocation));
  assert.deepEqual(plan.weatherCheckpoints.map(point => point.timeOffsetHours), [100 / 60, 200 / 60, 5.75, 7 + 25 / 60, 9 + 5 / 60]);
  assert.equal(plan.routeSchematic.nodes[0].name, 'Menemen');
  assert.equal(plan.routeSchematic.nodes.at(-1)?.name, 'Arguvan');
  assert.equal(plan.routeSchematic.totalDistance, '600 km');
  assert.equal(plan.routeSchematic.totalDuration, '21 sa 45 dk');
});

test('break and daily-rest markers snap to Maps steps and never invent a facility', () => {
  const plan = buildMapsRoutePlan(makeDirections());
  assert.deepEqual(plan.breakTargets.map(target => target.kind), ['break', 'daily_rest']);
  assert.deepEqual(plan.breakTargets.map(target => target.driveThresholdHours), [4.5, 9]);
  assert.deepEqual(plan.breakTargets.map(target => target.snappedBoundaryDistanceMeters), [300_000, 500_000]);
  assert.deepEqual(plan.breakTargets.map(target => target.breakMinutes), [45, 660]);
  assert.deepEqual(plan.breakTargets.map(target => target.timeFromStartHours), [5.25, 20.75]);
  assert.ok(plan.breakTargets.every(target => target.name.startsWith('Planlama noktası')));
  assert.ok(plan.breakTargets.every(target => !/anlaşmalı|tesis|park yeri/i.test(target.name)));
  assert.equal(plan.routeSchematic.nodes.filter(node => node.type === 'break').length, 2);
});

test('exact modeled arrival at 9 hours gets the 4.5-hour break but no post-arrival daily rest', () => {
  const route = { ...makeDirections(6), distance: { text: '540 km', value: 540_000 }, duration: { text: '9 hours', value: 32_400 } };
  const plan = buildMapsRoutePlan(route);
  assert.equal(plan.breakTargets.length, 1);
  assert.equal(plan.breakTargets[0].kind, 'break');
  assert.equal(plan.breakTargets[0].driveThresholdHours, 4.5);
  assert.equal(plan.routeSchematic.totalDuration, '9 sa 45 dk');
});

test('sparse or incomplete Maps steps retain truthful endpoint schematic and no fabricated interior places', () => {
  const sparse = { ...makeDirections(), steps: makeDirections(2).steps };
  const plan = buildMapsRoutePlan(sparse);
  assert.deepEqual(plan.routeSchematic.nodes.map(node => node.type), ['origin', 'destination']);
  assert.deepEqual(plan.weatherCheckpoints, []);
  assert.equal(plan.breakTargets.length, 2);
  assert.ok(plan.breakTargets.every(target => target.snappedBoundaryDistanceMeters === undefined));

  const noSteps = { ...makeDirections(), steps: [] };
  const noStepPlan = buildMapsRoutePlan(noSteps);
  assert.deepEqual(noStepPlan.routeSchematic.nodes.map(node => node.name), ['Menemen başlangıcı', 'Arguvan varışı']);
  assert.deepEqual(noStepPlan.weatherCheckpoints, []);
  assert.ok(noStepPlan.breakTargets.every(target => target.coordinate === undefined));
});

test('interior node count stays between four and eight when the Maps route has enough step geometry', () => {
  const route = makeDirections(12);
  const fewer = buildMapsRoutePlan(route, { interiorNodeCount: 1 });
  const more = buildMapsRoutePlan(route, { interiorNodeCount: 99 });
  assert.equal(fewer.weatherCheckpoints.length, 4);
  assert.equal(more.weatherCheckpoints.length, 8);
});

test('near-identical Maps step boundaries do not create duplicate weather cards', () => {
  const distances = [60_000, 260_000, 1_000, 33_000, 42_000, 84_000];
  const base = makeDirections(6);
  const plan = buildMapsRoutePlan({
    ...base,
    distance: { text: '480 km', value: 480_000 },
    steps: base.steps.map((step, index) => ({ ...step, distanceMeters: distances[index] }))
  });
  const km = plan.weatherCheckpoints.map(point => Math.round(point.distanceFromStartMeters / 1000));
  assert.deepEqual(km, [60, 320, 354, 396]);
});
