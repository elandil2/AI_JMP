import assert from 'node:assert/strict';
import test from 'node:test';
import { checkCoordinateAgainstRoute, decodeEncodedPolyline, ROUTE_CORRIDOR_TOLERANCE_KM } from './routeGeometry';

const canonicalPolyline = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';

test('decodes the standard Google encoded-polyline example', () => {
  assert.deepEqual(decodeEncodedPolyline(canonicalPolyline), [
    { lat: 38.5, lng: -120.2 },
    { lat: 40.7, lng: -120.95 },
    { lat: 43.252, lng: -126.453 }
  ]);
});

test('classifies coordinates on or near a Maps route as corridor candidates', () => {
  const onRoute = checkCoordinateAgainstRoute(canonicalPolyline, '38.5,-120.2');
  const nearRoute = checkCoordinateAgainstRoute(canonicalPolyline, '38.5,-120.3');

  assert.equal(onRoute.status, 'corridor_candidate');
  assert.equal(onRoute.distanceKm, 0);
  assert.equal(onRoute.progress, 0);
  assert.equal(nearRoute.status, 'corridor_candidate');
  assert.ok(nearRoute.distanceKm! < ROUTE_CORRIDOR_TOLERANCE_KM);
});

test('does not classify distant points as part of the route corridor', () => {
  const check = checkCoordinateAgainstRoute(canonicalPolyline, '41.0,-121.0');
  assert.equal(check.status, 'off_corridor');
  assert.ok(check.distanceKm! > ROUTE_CORRIDOR_TOLERANCE_KM);
});

test('missing, malformed, or degenerate geometry stays unverified', () => {
  assert.equal(checkCoordinateAgainstRoute(undefined, '38.5,-120.2').status, 'unverified');
  assert.equal(checkCoordinateAgainstRoute('not a polyline', '38.5,-120.2').status, 'unverified');
  assert.equal(checkCoordinateAgainstRoute('??', '38.5,-120.2').status, 'unverified');
  assert.equal(checkCoordinateAgainstRoute(canonicalPolyline, 'invalid').status, 'unverified');
});
