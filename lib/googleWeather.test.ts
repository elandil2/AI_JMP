import assert from 'node:assert/strict';
import test from 'node:test';
import { lookupGoogleWeatherAtArrival } from './googleWeather';

const HOUR_MS = 60 * 60 * 1000;
const now = Date.parse('2026-09-25T12:30:00Z');

function hourlyRecord(startMs: number, overrides: Record<string, unknown> = {}) {
  return {
    interval: {
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(startMs + HOUR_MS).toISOString(),
    },
    weatherCondition: {
      type: 'LIGHT_TO_MODERATE_RAIN',
      description: { text: 'Hafif-orta şiddette yağmur', languageCode: 'tr' },
    },
    temperature: { degrees: 18.5, unit: 'CELSIUS' },
    precipitation: {
      probability: { percent: 70, type: 'RAIN' },
      qpf: { quantity: 1.2, unit: 'MILLIMETERS' },
    },
    wind: {
      speed: { value: 21, unit: 'KILOMETERS_PER_HOUR' },
      gust: { value: 32, unit: 'KILOMETERS_PER_HOUR' },
    },
    visibility: { distance: 8, unit: 'KILOMETERS' },
    thunderstormProbability: 15,
    cloudCover: 85,
    relativeHumidity: 62,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function requestUrl(input: RequestInfo | URL): URL {
  if (input instanceof URL) return input;
  if (typeof input === 'string') return new URL(input);
  return new URL(input.url);
}

const baseInput = {
  latitude: 38.6,
  longitude: 27.0667,
  location: 'Menemen',
  apiKey: 'test-key',
  now,
};

test('maps a Google hourly forecast into Turkish WeatherInfo and keeps source metadata', async () => {
  const fetchImpl: typeof fetch = async (input) => {
    const url = requestUrl(input);
    assert.equal(url.pathname, '/v1/forecast/hours:lookup');
    assert.equal(url.searchParams.get('languageCode'), 'tr');
    assert.equal(url.searchParams.get('unitsSystem'), 'METRIC');
    assert.equal(url.searchParams.get('hours'), '1');
    assert.equal(url.searchParams.get('pageSize'), '24');
    return jsonResponse({
      forecastHours: [hourlyRecord(Date.parse('2026-09-25T12:00:00Z'))],
      timeZone: { id: 'Europe/Istanbul' },
    });
  };

  const result = await lookupGoogleWeatherAtArrival({
    ...baseInput,
    arrivalTime: '2026-09-25T12:45:00Z',
    fetchImpl,
  });

  assert.equal(result.status, 'available');
  assert.equal(result.source, 'google_weather');
  assert.deepEqual(result.weather, {
    location: 'Menemen',
    temp: '18,5°C',
    condition: 'Hafif-orta şiddette yağmur',
    icon: 'rainy',
  });
  assert.equal(result.forecast?.precipitationProbabilityPercent, 70);
  assert.equal(result.forecast?.precipitationMm, 1.2);
  assert.equal(result.forecast?.windKmh, 21);
  assert.equal(result.forecast?.windGustKmh, 32);
  assert.equal(result.forecast?.visibilityKm, 8);
  assert.deepEqual(result.provenance, {
    provider: 'google_maps_weather',
    status: 'available',
    sourceName: 'Google Maps Platform Weather API',
    requestedArrivalTime: '2026-09-25T12:45:00.000Z',
    forecastTime: '2026-09-25T12:00:00.000Z',
    timeZone: 'Europe/Istanbul',
    latitude: 38.6,
    longitude: 27.0667,
  });
});

test('paginates only as far as needed to find an arrival hour', async () => {
  const currentHour = Date.parse('2026-09-25T12:00:00Z');
  const expectedStart = currentHour + 25 * HOUR_MS;
  const requests: URL[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = requestUrl(input);
    requests.push(url);
    if (requests.length === 1) {
      return jsonResponse({
        forecastHours: Array.from({ length: 24 }, (_, index) => hourlyRecord(currentHour + index * HOUR_MS)),
        nextPageToken: 'page-two-token',
      });
    }
    return jsonResponse({
      forecastHours: [
        hourlyRecord(currentHour + 24 * HOUR_MS),
        hourlyRecord(expectedStart, {
          weatherCondition: { type: 'CLEAR', description: { text: 'Açık', languageCode: 'tr' } },
          precipitation: { probability: { percent: 0, type: 'NONE' } },
          temperature: { degrees: 24, unit: 'CELSIUS' },
        }),
      ],
    });
  };

  const result = await lookupGoogleWeatherAtArrival({
    ...baseInput,
    arrivalTime: new Date(expectedStart + 15 * 60 * 1000),
    fetchImpl,
  });

  assert.equal(requests.length, 2);
  assert.equal(requests[0].searchParams.get('hours'), '26');
  assert.equal(requests[0].searchParams.get('pageToken'), null);
  assert.equal(requests[1].searchParams.get('pageToken'), 'page-two-token');
  assert.equal(result.status, 'available');
  assert.equal(result.weather.condition, 'Açık');
  assert.equal(result.weather.icon, 'sunny');
  assert.equal(result.weather.temp, '24°C');
  assert.equal(result.provenance.forecastTime, new Date(expectedStart).toISOString());
});

test('403 returns a detectable forbidden result without invented weather', async () => {
  let requests = 0;
  const fetchImpl: typeof fetch = async () => {
    requests += 1;
    return jsonResponse({ error: { code: 403, status: 'PERMISSION_DENIED' } }, 403);
  };

  const result = await lookupGoogleWeatherAtArrival({
    ...baseInput,
    arrivalTime: '2026-09-25T12:45:00Z',
    fetchImpl,
  });

  assert.equal(requests, 1);
  assert.equal(result.status, 'forbidden');
  assert.equal(result.source, 'unavailable');
  assert.equal(result.weather.temp, '-');
  assert.equal(result.weather.condition, 'Hava durumu alınamadı');
  assert.equal(result.weather.icon, 'unknown');
  assert.equal(result.forecast, undefined);
  assert.equal(result.provenance.status, 'forbidden');
  assert.equal(result.provenance.reason, 'forbidden');
  assert.equal(result.provenance.httpStatus, 403);
});

test('arrival outside Google’s 240-hour forecast window returns unavailable without a request', async () => {
  let requests = 0;
  const fetchImpl: typeof fetch = async () => {
    requests += 1;
    return jsonResponse({ forecastHours: [] });
  };
  const arrivalAt = now - (now % HOUR_MS) + 240 * HOUR_MS;

  const result = await lookupGoogleWeatherAtArrival({
    ...baseInput,
    arrivalTime: arrivalAt,
    fetchImpl,
  });

  assert.equal(requests, 0);
  assert.equal(result.status, 'unavailable');
  assert.equal(result.provenance.reason, 'forecast_out_of_range');
  assert.equal(result.provenance.requestedArrivalTime, new Date(arrivalAt).toISOString());
});

test('a slow paginated provider returns the bounded timeout state', async () => {
  const fetchImpl: typeof fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  });

  const result = await lookupGoogleWeatherAtArrival({
    ...baseInput,
    arrivalTime: '2026-09-25T12:45:00Z',
    timeoutMs: 5,
    fetchImpl,
  });

  assert.equal(result.status, 'unavailable');
  assert.equal(result.provenance.reason, 'timeout');
  assert.equal(result.weather.temp, '-');
});
