import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAPBOX_ROUTE_GEOCODING_MAX_CHECKPOINTS,
  MAPBOX_ROUTE_GEOCODING_MAX_CONCURRENCY,
  reverseGeocodeRouteCheckpoints
} from './mapboxGeocoding';

const feature = (context: Record<string, unknown>) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [29.01, 41.02] },
  properties: {
    mapbox_id: 'dXJuOm1ieHBsYzp0ZXN0',
    feature_type: 'address',
    name: 'Rıhtım Caddesi',
    context
  }
});

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' }
});

test('uses the v6 reverse endpoint, Turkish language, and permanent storage for report labels', async () => {
  let requestedUrl = '';
  const labels = await reverseGeocodeRouteCheckpoints([
    { coordinate: { lat: 40.991, lng: 29.027 }, mapsRoadLabel: 'D100, Kadıköy' }
  ], {
    token: 'test-token',
    fetchImpl: async input => {
      requestedUrl = String(input);
      return response({ features: [feature({
        locality: { mapbox_id: 'locality-1', name: 'Kadıköy' },
        place: { mapbox_id: 'place-1', name: 'İstanbul' },
        region: { mapbox_id: 'region-1', name: 'İstanbul' },
        country: { mapbox_id: 'country-1', name: 'Türkiye', country_code: 'TR' }
      })] });
    }
  });

  const request = new URL(requestedUrl);
  assert.equal(request.origin + request.pathname, 'https://api.mapbox.com/search/geocode/v6/reverse');
  assert.equal(request.searchParams.get('longitude'), '29.027');
  assert.equal(request.searchParams.get('latitude'), '40.991');
  assert.equal(request.searchParams.get('language'), 'tr');
  assert.equal(request.searchParams.get('worldview'), 'tr');
  assert.equal(request.searchParams.get('permanent'), 'true');
  assert.equal(request.searchParams.get('access_token'), 'test-token');
  assert.equal(labels[0].label, 'Kadıköy, İstanbul');
  assert.equal(labels[0].district, 'Kadıköy');
  assert.equal(labels[0].city, 'İstanbul');
  assert.equal(labels[0].source, 'mapbox_geocoding_v6');
  assert.equal(labels[0].status, 'resolved');
  assert.equal(labels[0].errorCode, undefined);
});

test('keeps result order while limiting concurrent requests and total checkpoints', async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  let calls = 0;
  const checkpoints = Array.from({ length: MAPBOX_ROUTE_GEOCODING_MAX_CHECKPOINTS + 1 }, (_, index) => ({
    coordinate: { lat: 35 + index / 10, lng: 29 + index / 10 },
    mapsRoadLabel: `Maps checkpoint ${index}`
  }));

  const labels = await reverseGeocodeRouteCheckpoints(checkpoints, {
    token: 'test-token',
    fetchImpl: async input => {
      calls++;
      const latitude = Number(new URL(String(input)).searchParams.get('latitude'));
      const index = Math.round((latitude - 35) * 10);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(resolve => setTimeout(resolve, index % 2 === 0 ? 8 : 2));
      inFlight--;
      return response({ features: [feature({
        district: { mapbox_id: `district-${index}`, name: `İlçe ${index}` },
        place: { mapbox_id: `place-${index}`, name: `Şehir ${index}` }
      })] });
    }
  });

  assert.equal(calls, MAPBOX_ROUTE_GEOCODING_MAX_CHECKPOINTS);
  assert.ok(maxInFlight <= MAPBOX_ROUTE_GEOCODING_MAX_CONCURRENCY);
  assert.equal(labels.length, checkpoints.length);
  assert.deepEqual(labels.slice(0, MAPBOX_ROUTE_GEOCODING_MAX_CHECKPOINTS).map(item => item.index),
    Array.from({ length: MAPBOX_ROUTE_GEOCODING_MAX_CHECKPOINTS }, (_, index) => index));
  assert.equal(labels[0].label, 'İlçe 0, Şehir 0');
  assert.equal(labels[7].label, 'İlçe 7, Şehir 7');
  assert.equal(labels[8].label, 'Maps checkpoint 8');
  assert.equal(labels[8].source, 'google_maps');
  assert.equal(labels[8].status, 'fallback');
  assert.equal(labels[8].errorCode, 'checkpoint_limit');
});

test('uses the Maps road label on provider failure without inventing a city', async () => {
  const labels = await reverseGeocodeRouteCheckpoints([
    { coordinate: '39.9255,32.8663', mapsRoadLabel: 'D200 / Anadolu Bulvarı' }
  ], {
    token: 'test-token',
    fetchImpl: async () => response({ message: 'forbidden' }, 403)
  });

  assert.deepEqual(labels[0], {
    index: 0,
    coordinate: { lat: 39.9255, lng: 32.8663 },
    label: 'D200 / Anadolu Bulvarı',
    district: null,
    city: null,
    source: 'google_maps',
    status: 'fallback',
    errorCode: 'mapbox_request_failed'
  });
});

test('falls back when the response has no locality or city context', async () => {
  const labels = await reverseGeocodeRouteCheckpoints([
    { coordinate: { lat: 40, lng: 30 }, mapsRoadLabel: 'E-80' }
  ], {
    token: 'test-token',
    fetchImpl: async () => response({ features: [feature({
      country: { mapbox_id: 'country-1', name: 'Türkiye', country_code: 'TR' }
    })] })
  });

  assert.equal(labels[0].label, 'E-80');
  assert.equal(labels[0].city, null);
  assert.equal(labels[0].district, null);
  assert.equal(labels[0].source, 'google_maps');
  assert.equal(labels[0].status, 'fallback');
  assert.equal(labels[0].errorCode, 'mapbox_no_administrative_label');
});

test('returns explicit unavailable results for missing credentials and invalid coordinates', async () => {
  let calls = 0;
  const labels = await reverseGeocodeRouteCheckpoints([
    { coordinate: { lat: 91, lng: 30 } },
    { coordinate: 'not-a-coordinate', mapsRoadLabel: 'D100' },
    { coordinate: { lat: 40, lng: 30 } }
  ], {
    token: '',
    fetchImpl: async () => {
      calls++;
      return response({ features: [] });
    }
  });

  assert.equal(calls, 0);
  assert.equal(labels[0].status, 'unavailable');
  assert.equal(labels[0].source, 'none');
  assert.equal(labels[0].errorCode, 'invalid_coordinate');
  assert.equal(labels[1].label, 'D100');
  assert.equal(labels[1].source, 'google_maps');
  assert.equal(labels[1].errorCode, 'invalid_coordinate');
  assert.equal(labels[2].status, 'unavailable');
  assert.equal(labels[2].source, 'none');
  assert.equal(labels[2].errorCode, 'mapbox_token_missing');
});

test('does not turn an empty Mapbox response into a guessed city', async () => {
  const labels = await reverseGeocodeRouteCheckpoints([
    { coordinate: { lat: 0, lng: 0 } }
  ], {
    token: 'test-token',
    fetchImpl: async () => response({ features: [] })
  });

  assert.equal(labels[0].label, null);
  assert.equal(labels[0].city, null);
  assert.equal(labels[0].district, null);
  assert.equal(labels[0].source, 'none');
  assert.equal(labels[0].status, 'unavailable');
  assert.equal(labels[0].errorCode, 'mapbox_no_result');
});
