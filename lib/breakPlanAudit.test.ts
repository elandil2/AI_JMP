import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import type { RouteSegmentNode } from '../types';
import { auditBreakPlan, auditStoredSchematic } from './breakPlanAudit';
import type { DirectionsResult } from './googleMaps';
import { buildMapsRoutePlan } from './mapsRoutePlan';
import { mapsTiming } from './routeTiming';

const node = (type: RouteSegmentNode['type'], name: string, km: number, time = '0 sa 0 dk'): RouteSegmentNode =>
  ({ type, name, distanceFromStart: `${km} km`, timeFromStart: time });

test('a plan with rests exactly at 4.5 h / 9 h passes every hard rule', () => {
  // 600 km at 60 km/h = 10 h driving: 45 min at 270 km, 11 h rest at 540 km.
  const audit = auditBreakPlan([
    node('origin', 'Menemen', 0),
    node('break', 'Planlama noktası · 45 dk ara (4 sa 30 dk modellenen sürüşten sonra)', 270),
    node('break', 'Planlama noktası · 11 sa günlük dinlenme (9 sa 0 dk modellenen sürüşten sonra)', 540),
    node('destination', 'Varış', 600)
  ], { totalKm: 600, drivingHours: 10 });
  assert.deepEqual(audit.violations.filter(v => v.severity === 'hard'), []);
  assert.equal(audit.maxRestPositionErrorKm, 0);
  assert.equal(audit.stints.length, 3);
  // A daily rest one hour before arrival is legal but worth a 10 h-day suggestion.
  assert.ok(audit.violations.some(v => v.rule === 'arrival_rest'));
});

test('a rest placed early makes the next stint overrun, even though its label says 4.5 h', () => {
  const audit = auditBreakPlan([
    node('origin', 'Menemen', 0),
    node('break', 'Merkez, Uşak · 45 dk Mola (4 sa 30 dk sürüşten sonra)', 232),
    node('break', 'Polatlı · 11 sa Günlük Dinlenme (9 sa sürüşten sonra)', 523),
    node('destination', 'Varış', 700)
  ], { totalKm: 700, drivingHours: 700 / 60 });
  const continuous = audit.violations.filter(v => v.rule === 'continuous_driving');
  assert.equal(continuous.length, 1);
  assert.equal(continuous[0].km, 523); // 232 → 523 km = 4.85 h
  assert.ok(audit.violations.some(v => v.rule === 'rest_position' && v.km === 232));
  assert.ok(Math.round(audit.maxRestPositionErrorKm) === 38);
});

test('missing daily rest is caught by both the 9 h and 13 h duty rules', () => {
  // 11 h driving with two breaks only: no daily rest.
  const audit = auditBreakPlan([
    node('origin', 'A', 0),
    node('break', '45 dk ara', 260),
    node('break', '45 dk ara', 520),
    node('destination', 'B', 660)
  ], { totalKm: 660, drivingHours: 11 });
  assert.ok(audit.violations.some(v => v.rule === 'daily_driving'));
  assert.ok(!audit.violations.some(v => v.rule === 'duty_window')); // 11 h + 1.5 h = 12.5 h < 13 h
  const extended = auditBreakPlan([
    node('origin', 'A', 0), node('break', '45 dk ara', 260), node('break', '45 dk ara', 520), node('break', '45 dk ara', 600), node('destination', 'B', 780)
  ], { totalKm: 780, drivingHours: 13, allowExtendedDay: true });
  assert.ok(extended.violations.some(v => v.rule === 'duty_window'));
});

test('night driving share and arrival hour use Istanbul time', () => {
  // Departure 20:00 Istanbul (17:00 UTC), 6 h driving + 45 min break at 4.5 h.
  const audit = auditBreakPlan([
    node('origin', 'A', 0), node('break', '45 dk ara', 270), node('destination', 'B', 360)
  ], { totalKm: 360, drivingHours: 6, departureTime: '2026-11-16T17:00:00Z' });
  // Driving 20:00–00:30 then 01:15–02:45 → night from 22:00: 2.5 h + 1.5 h of 6 h.
  assert.ok(Math.abs((audit.nightDrivingShare ?? 0) - 4 / 6) < 0.02);
  assert.equal(audit.arrivalHourLocal, 2);
});

test('stored report helper reads totals from summary strings', () => {
  const audit = auditStoredSchematic(
    [node('origin', 'A', 0), node('break', '45 dk ara', 270), node('destination', 'B', 1235)],
    { totalDistance: '1.235 km', drivingDuration: '20 sa 35 dk' }
  );
  assert.ok(audit);
  assert.equal(audit.totalKm, 1235);
  assert.ok(audit.violations.some(v => v.rule === 'daily_driving'));
});

// Golden routes: captured Google responses for real Total trips (fixtures/routes, git-ignored,
// recorded with scripts/capture-route-fixtures.ts). Every plan must pass the independent audit.
const fixtureDir = 'fixtures/routes';
const fixtureFiles = existsSync(fixtureDir) ? readdirSync(fixtureDir).filter(file => file.endsWith('.json')) : [];
for (const file of fixtureFiles) {
  test(`golden route ${file}: plan obeys 4.5 h / 9 h (10 h at most twice) / 13 h`, () => {
    const { directions } = JSON.parse(readFileSync(join(fixtureDir, file), 'utf8')) as { directions: DirectionsResult };
    const plan = buildMapsRoutePlan(directions);
    const { drivingHours, schedule } = mapsTiming(directions);
    assert.ok(schedule.extendedDays <= 2);
    const audit = auditBreakPlan(plan.routeSchematic.nodes, {
      totalKm: directions.distance.value / 1000, drivingHours, allowExtendedDay: schedule.extendedDays > 0
    });
    assert.deepEqual(audit.violations.filter(v => v.severity === 'hard'), []);
    assert.ok(audit.maxRestPositionErrorKm < 1, `rest position error ${audit.maxRestPositionErrorKm} km`);
    assert.ok(plan.breakTargets.every(target => target.coordinate), 'every rest has a point on the route line');
  });
}
