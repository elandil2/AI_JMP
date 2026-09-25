import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TOMTOM_INCIDENT_SCOPE,
  retrieveTomTomIncidents,
} from './tomtomIncidents';

function encodeSignedValue(value: number): string {
  let encoded = value < 0 ? ~(value << 1) : value << 1;
  let output = '';
  while (encoded >= 0x20) {
    output += String.fromCharCode((0x20 | (encoded & 0x1f)) + 63);
    encoded >>= 5;
  }
  return output + String.fromCharCode(encoded + 63);
}

function encodePolyline(points: Array<{ lat: number; lng: number }>): string {
  let previousLat = 0;
  let previousLng = 0;
  let output = '';
  for (const point of points) {
    const lat = Math.round(point.lat * 1e5);
    const lng = Math.round(point.lng * 1e5);
    output += encodeSignedValue(lat - previousLat);
    output += encodeSignedValue(lng - previousLng);
    previousLat = lat;
    previousLng = lng;
  }
  return output;
}

function polylineForDistanceKm(distanceKm: number): string {
  const lat = 39;
  const longitudeDelta = distanceKm * 1.01 / (111.32 * Math.cos(lat * Math.PI / 180));
  return encodePolyline([
    { lat, lng: 28 },
    { lat, lng: 28 + longitudeDelta },
  ]);
}

function approximateBboxAreaKm2(bbox: string): number {
  const [west, south, east, north] = bbox.split(',').map(Number);
  const midLat = (south + north) / 2;
  const widthKm = (east - west) * 111.32 * Math.cos(midLat * Math.PI / 180);
  const heightKm = (north - south) * 110.574;
  return Math.abs(widthKm * heightKm);
}

const shortGooglePolyline = encodePolyline([
  { lat: 41.0, lng: 29.0 },
  { lat: 41.01, lng: 29.02 },
]);
const now = new Date('2026-09-25T12:00:00.000Z');

function incident(
  id: string,
  iconCategory: number,
  coordinates: number[] | number[][],
  options: Record<string, unknown> = {},
): Record<string, unknown> {
  const point = typeof coordinates[0] === 'number';
  return {
    type: 'Feature',
    geometry: point
      ? { type: 'Point', coordinates }
      : { type: 'LineString', coordinates },
    properties: {
      id,
      iconCategory,
      events: [{ description: `${id} description` }],
      timeValidity: 'present',
      ...options,
    },
  };
}

function responseFor(incidents: Array<Record<string, unknown>>): Response {
  return new Response(JSON.stringify({ incidents }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('requests supported present and future categories and returns only Google-corridor candidates', async () => {
  let requestedUrl: URL | undefined;
  const fetchImpl: typeof fetch = async (input) => {
    requestedUrl = new URL(String(input));
    return responseFor([
      incident('accident-1', 1, [29.01, 41.005], {
        startTime: '2026-09-25T11:30:00.000Z',
        endTime: '2026-09-25T13:00:00.000Z',
        from: 'D100',
        roadNumbers: ['D100'],
        delay: 120,
        magnitudeOfDelay: 2,
      }),
      incident('works-1', 9, [[29.005, 41.002], [29.015, 41.008]], {
        timeValidity: 'future',
      }),
      incident('off-route-1', 8, [36.0, 40.0]),
      incident('unsupported-1', 6, [29.01, 41.005]),
    ]);
  };

  const result = await retrieveTomTomIncidents({
    googleEncodedPolyline: shortGooglePolyline,
    apiKey: 'test-tomtom-api-key',
    fetchImpl,
    now,
  });

  assert.equal(result.status, 'available');
  assert.equal(result.coverageComplete, true);
  assert.equal(result.providerItemCount, 4);
  assert.deepEqual(result.incidents.map((item) => item.id).sort(), ['accident-1', 'works-1']);
  const accident = result.incidents.find((item) => item.id === 'accident-1')!;
  const works = result.incidents.find((item) => item.id === 'works-1')!;
  assert.equal(accident.category, 'accident');
  assert.equal(accident.categoryId, 1);
  assert.equal(accident.description, 'accident-1 description');
  assert.equal(accident.timeValidity, 'present');
  assert.equal(accident.delaySeconds, 120);
  assert.deepEqual(accident.roadNumbers, ['D100']);
  assert.equal(accident.geometry.type, 'Point');
  assert.equal(works.category, 'road_works');
  assert.equal(works.timeValidity, 'future');
  assert.equal(works.geometry.type, 'LineString');
  assert.equal(accident.routeProgress > 0 && accident.routeProgress < 1, true);
  assert.ok(result.incidents.every((item) => item.distanceToGoogleRouteKm <= 20));
  assert.match(accident.caveat, /does not prove the same road, direction/);
  assert.equal(result.sourceScope, TOMTOM_INCIDENT_SCOPE);
  assert.ok(requestedUrl);
  assert.equal(requestedUrl!.pathname, '/traffic/services/5/incidentDetails');
  assert.equal(requestedUrl!.searchParams.get('key'), 'test-tomtom-api-key');
  assert.equal(requestedUrl!.searchParams.get('categoryFilter'), '1,7,8,9');
  assert.equal(requestedUrl!.searchParams.get('timeValidityFilter'), 'present,future');
  assert.equal(requestedUrl!.searchParams.get('language'), 'tr-TR');
  assert.match(requestedUrl!.searchParams.get('fields') ?? '', /properties\{id,iconCategory/);
  assert.ok(requestedUrl!.searchParams.has('bbox'));
  assert.ok(!JSON.stringify(result).includes('test-tomtom-api-key'));
});

test('deduplicates IDs returned by overlapping boxes along the route', async () => {
  const googleEncodedPolyline = encodePolyline([
    { lat: 41.0, lng: 29.0 },
    { lat: 41.0, lng: 29.6 },
  ]);
  const requestedBboxes = new Set<string>();
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    requestedBboxes.add(url.searchParams.get('bbox') ?? '');
    return responseFor([incident('repeat-1', 7, [29.3, 41.0])]);
  };

  const result = await retrieveTomTomIncidents({
    googleEncodedPolyline,
    apiKey: 'test-key',
    fetchImpl,
    now,
  });

  assert.equal(result.status, 'available');
  assert.equal(requestedBboxes.size, 2);
  assert.equal(result.requestedBboxCount, 2);
  assert.equal(result.providerItemCount, 2);
  assert.deepEqual(result.incidents.map((item) => item.id), ['repeat-1']);
  assert.equal(result.incidents[0].category, 'lane_closed');
});

test('a successful empty result is unknown coverage, never a clear-route result', async () => {
  const result = await retrieveTomTomIncidents({
    googleEncodedPolyline: shortGooglePolyline,
    apiKey: 'test-key',
    fetchImpl: async () => responseFor([]),
    now,
  });

  assert.equal(result.status, 'unknown');
  assert.equal(result.coverageReason, 'no_incidents_returned');
  assert.equal(result.coverageComplete, true);
  assert.deepEqual(result.incidents, []);
});

test('a successful response with only off-route items remains unknown', async () => {
  const result = await retrieveTomTomIncidents({
    googleEncodedPolyline: shortGooglePolyline,
    apiKey: 'test-key',
    fetchImpl: async () => responseFor([incident('far-away', 1, [36.0, 40.0])]),
    now,
  });

  assert.equal(result.status, 'unknown');
  assert.equal(result.coverageReason, 'no_google_corridor_candidates');
  assert.equal(result.providerItemCount, 1);
  assert.deepEqual(result.incidents, []);
});

test('missing API key reports unavailable and does not make a request', async () => {
  let called = false;
  const result = await retrieveTomTomIncidents({
    googleEncodedPolyline: shortGooglePolyline,
    apiKey: null,
    fetchImpl: async () => {
      called = true;
      throw new Error('should not be called');
    },
    now,
  });

  assert.equal(result.status, 'unavailable');
  assert.equal(result.coverageReason, 'missing_api_key');
  assert.deepEqual(result.incidents, []);
  assert.equal(called, false);
});

test('limits box requests and labels truncated route coverage partial', async () => {
  const longPolyline = encodePolyline([
    { lat: 41.0, lng: 29.0 },
    { lat: 41.0, lng: 29.6 },
  ]);
  let calls = 0;
  const result = await retrieveTomTomIncidents({
    googleEncodedPolyline: longPolyline,
    apiKey: 'test-key',
    fetchImpl: async () => {
      calls++;
      return responseFor([]);
    },
    maxBboxRequests: 1,
    now,
  });

  assert.equal(calls, 1);
  assert.equal(result.status, 'partial');
  assert.equal(result.coverageComplete, false);
  assert.equal(result.coverageReason, 'max_bounding_boxes_reached');
});

test('covers long routes up to 1,800 km within the bounded box budget and area limit', async () => {
  for (const routeLengthKm of [1_250, 1_800]) {
    const requestedBboxes: string[] = [];
    const result = await retrieveTomTomIncidents({
      googleEncodedPolyline: polylineForDistanceKm(routeLengthKm),
      apiKey: 'test-key',
      fetchImpl: async (input) => {
        requestedBboxes.push(new URL(String(input)).searchParams.get('bbox') ?? '');
        return responseFor([]);
      },
      now,
    });

    assert.equal(result.status, 'unknown');
    assert.equal(result.coverageReason, 'no_incidents_returned');
    assert.equal(result.coverageComplete, true);
    assert.equal(result.requestedBboxCount, requestedBboxes.length);
    assert.ok(requestedBboxes.length > routeLengthKm / 50);
    assert.ok(requestedBboxes.length <= 48);
    assert.ok(requestedBboxes.every((bbox) => approximateBboxAreaKm2(bbox) < 10_000));
  }
});

test('bounds a hanging request and reports timeout coverage', async () => {
  const result = await retrieveTomTomIncidents({
    googleEncodedPolyline: shortGooglePolyline,
    apiKey: 'test-key',
    fetchImpl: async () => new Promise<Response>(() => {}),
    timeoutMs: 5,
    now,
  });

  assert.equal(result.status, 'unavailable');
  assert.equal(result.coverageReason, 'request_timeout');
  assert.deepEqual(result.incidents, []);
});
