/** Paid, read-only Mapbox coverage probe for destinations seen in Menemen report history. */
import nextEnv from '@next/env';
import { findLocation } from '../lib/location';

if (process.env.AI_JMP_ALLOW_PAID_PROVIDER_TEST !== 'yes') {
  throw new Error('Set AI_JMP_ALLOW_PAID_PROVIDER_TEST=yes to run paid provider requests.');
}
nextEnv.loadEnvConfig(process.cwd());
const token = process.env.MAPBOX_TOKEN;
if (!token) throw new Error('MAPBOX_TOKEN is missing.');

const destinations = [
  ['malatya', 'arguvan'], ['eskişehir', 'odunpazarı'], ['ankara', 'çankaya'],
  ['ankara', 'yenimahalle'], ['konya', 'karatay'], ['van', 'tuşba'],
  ['antalya', 'serik'], ['antalya', 'kepez'], ['malatya', '']
] as const;
const origin = findLocation('izmir', 'menemen');
if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) throw new Error('Menemen coordinate missing.');

const results = [];
for (const [city, county] of destinations) {
  const destination = findLocation(city, county);
  if (!Number.isFinite(destination.lat) || !Number.isFinite(destination.lng)) {
    results.push({ route: `${city}, ${county}`, status: 'coordinate_missing' });
    continue;
  }
  const coordinates = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coordinates}`);
  url.searchParams.set('overview', 'full');
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('annotations', 'congestion,congestion_numeric,distance');
  url.searchParams.set('steps', 'false');
  url.searchParams.set('access_token', token);
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    const payload = await response.json() as { code?: string; routes?: Array<{ distance?: number; duration?: number; duration_typical?: number; legs?: Array<{ annotation?: { congestion?: string[]; congestion_numeric?: Array<number | null>; distance?: number[] } }> }> };
    const route = payload.routes?.[0];
    if (!response.ok || payload.code !== 'Ok' || !route) {
      results.push({ route: `${city}, ${county}`, status: 'provider_unavailable', httpStatus: response.status, code: payload.code });
      continue;
    }
    let allMeters = 0;
    let knownMeters = 0;
    let heavyMeters = 0;
    let samples = 0;
    let unknownSamples = 0;
    for (const leg of route.legs ?? []) {
      const annotation = leg.annotation;
      const distances = annotation?.distance ?? [];
      const levels = annotation?.congestion ?? [];
      const numeric = annotation?.congestion_numeric ?? [];
      const count = Math.max(distances.length, levels.length, numeric.length);
      for (let index = 0; index < count; index++) {
        const meters = typeof distances[index] === 'number' && Number.isFinite(distances[index]) ? distances[index] : 0;
        const level = levels[index] ?? 'unknown';
        const isKnown = level !== 'unknown' && numeric[index] !== null && numeric[index] !== undefined;
        allMeters += meters;
        samples++;
        if (isKnown) {
          knownMeters += meters;
          if (level === 'heavy' || level === 'severe') heavyMeters += meters;
        } else unknownSamples++;
      }
    }
    results.push({
      route: `${city}, ${county}`, status: 'ok', mapboxKm: Math.round((route.distance ?? 0) / 1000),
      trafficKnownPercent: allMeters > 0 ? Math.round(knownMeters / allMeters * 1000) / 10 : 0,
      knownKm: Math.round(knownMeters / 1000), heavyKm: Math.round(heavyMeters / 1000),
      unknownSamples, samples,
      delayVsTypicalMinutes: route.duration && route.duration_typical
        ? Math.round((route.duration - route.duration_typical) / 60) : null
    });
  } catch {
    results.push({ route: `${city}, ${county}`, status: 'request_failed' });
  }
}
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), source: 'Mapbox driving-traffic; historical Menemen destinations, not approved Total facility points', results }, null, 2));
