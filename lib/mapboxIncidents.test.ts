import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAPBOX_INCIDENT_SCOPE,
  retrieveMapboxDrivingIncidents,
} from './mapboxIncidents';

const googlePolyline = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
const now = new Date('2026-09-25T12:00:00.000Z');

function responseFor(legs: Array<Record<string, unknown>>, coordinates?: number[][]): Response {
  return new Response(JSON.stringify({
    code: 'Ok',
    routes: [{
      geometry: {
        type: 'LineString',
        coordinates: coordinates ?? [[-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]],
      },
      legs,
    }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

test('keeps on-corridor construction and closure candidates and filters events off the Google corridor', async () => {
  let requestedUrl: URL | undefined;
  const fetchImpl: typeof fetch = async (input) => {
    requestedUrl = new URL(String(input));
    return responseFor([{
      incidents: [
        {
          id: 'work-1',
          type: 'construction',
          description: 'Roadwork on a nearby segment',
          creation_time: '2026-09-25T11:45:00.000Z',
          start_time: '2026-09-25T10:00:00.000Z',
          end_time: '2026-09-25T18:00:00.000Z',
          geometry_index_start: 0,
          geometry_index_end: 1,
          affected_road_names: ['D260'],
        },
        {
          id: 'off-route-accident',
          type: 'accident',
          description: 'Incident on a different road',
          geometry_index_start: 1,
          geometry_index_end: 1,
        },
      ],
      closures: [{ geometry_index_start: 2, geometry_index_end: 2 }],
    }], [[-120.2, 38.5], [-100, 35], [-126.453, 43.252]]);
  };

  const result = await retrieveMapboxDrivingIncidents({
    googleEncodedPolyline: googlePolyline,
    token: 'test-mapbox-token',
    fetchImpl,
    now,
  });

  assert.equal(result.status, 'available');
  assert.equal(result.providerItemCount, 3);
  assert.deepEqual(result.incidents.map((incident) => incident.id), ['work-1', 'mapbox-closure-2-2']);
  assert.equal(result.incidents[0].type, 'construction');
  assert.equal(result.incidents[0].status, 'active');
  assert.equal(result.incidents[0].timestamp, '2026-09-25T11:45:00.000Z');
  assert.deepEqual(result.incidents[0].affectedRoadNames, ['D260']);
  assert.equal(result.incidents[0].geometry?.type, 'LineString');
  assert.equal(result.incidents[0].coordinate.lat, 38.5);
  assert.equal(result.incidents[0].routeProgress, 0);
  assert.equal(result.incidents[1].type, 'road_closure');
  assert.equal(result.incidents[1].status, 'closed');
  assert.equal(result.incidents[1].timestamp, null);
  assert.match(result.incidents[0].caveat, /does not prove the event is on the Google route/);
  assert.equal(result.sourceScope, MAPBOX_INCIDENT_SCOPE);

  assert.ok(requestedUrl);
  assert.match(requestedUrl!.pathname, /\/mapbox\/driving-traffic\//);
  assert.equal(requestedUrl!.searchParams.get('geometries'), 'geojson');
  assert.equal(requestedUrl!.searchParams.get('overview'), 'full');
  assert.equal(requestedUrl!.searchParams.get('annotations'), 'closure,congestion,congestion_numeric,distance');
  assert.equal(requestedUrl!.searchParams.get('depart_at'), 'now');
  assert.equal(requestedUrl!.searchParams.get('access_token'), 'test-mapbox-token');
  assert.ok(result.incidents.every((incident) => !JSON.stringify(incident).includes('test-mapbox-token')));
});

test('reports an empty provider result as unknown coverage, never as a clear route', async () => {
  const result = await retrieveMapboxDrivingIncidents({
    googleEncodedPolyline: googlePolyline,
    token: 'test-mapbox-token',
    fetchImpl: async () => responseFor([{}]),
    now,
  });

  assert.equal(result.status, 'unknown');
  assert.equal(result.coverageReason, 'no_incidents_returned');
  assert.deepEqual(result.incidents, []);
});

test('measures annotated traffic coverage without calling unknown road segments clear', async () => {
  const result = await retrieveMapboxDrivingIncidents({
    googleEncodedPolyline: googlePolyline,
    token: 'test-mapbox-token',
    fetchImpl: async () => responseFor([{ annotation: {
      distance: [1_000, 2_000, 3_000], congestion: ['low', 'heavy', 'unknown'], congestion_numeric: [10, 80, null]
    } }]), now
  });
  assert.equal(result.status, 'unknown');
  assert.equal(result.trafficCoverage?.knownPercent, 50);
  assert.equal(result.trafficCoverage?.annotatedDistanceKm, 6);
  assert.equal(result.trafficCoverage?.heavyDistanceKm, 2);
  assert.equal(result.incidents.length, 0);
});

test('missing token reports unavailable coverage and does not make a network request', async () => {
  let called = false;
  const result = await retrieveMapboxDrivingIncidents({
    googleEncodedPolyline: googlePolyline,
    token: null,
    fetchImpl: async () => {
      called = true;
      throw new Error('should not be called');
    },
    now,
  });

  assert.equal(result.status, 'unavailable');
  assert.equal(result.coverageReason, 'missing_token');
  assert.deepEqual(result.incidents, []);
  assert.equal(called, false);
});

test('rejects off-corridor provider items without implying the Google route is incident-free', async () => {
  const result = await retrieveMapboxDrivingIncidents({
    googleEncodedPolyline: googlePolyline,
    token: 'test-mapbox-token',
    fetchImpl: async () => responseFor([{
      incidents: [{
        id: 'far-away',
        type: 'accident',
        description: 'Accident far from the Google route',
        geometry_index_start: 1,
        geometry_index_end: 1,
      }],
    }], [[-120.2, 38.5], [-100, 35], [-126.453, 43.252]]),
    now,
  });

  assert.equal(result.status, 'unknown');
  assert.equal(result.coverageReason, 'no_google_corridor_candidates');
  assert.equal(result.providerItemCount, 1);
  assert.deepEqual(result.incidents, []);
});

test('bounds a hanging request and reports the source as unavailable', async () => {
  const result = await retrieveMapboxDrivingIncidents({
    googleEncodedPolyline: googlePolyline,
    token: 'test-mapbox-token',
    fetchImpl: async () => new Promise<Response>(() => {}),
    timeoutMs: 5,
    now,
  });

  assert.equal(result.status, 'unavailable');
  assert.equal(result.coverageReason, 'request_timeout');
});
