/** Paid Maps-only check of destinations observed in existing Menemen report history. No database writes. */
import nextEnv from '@next/env';
import { findLocation } from '../lib/location';
import { getDirections } from '../lib/googleMaps';
import { buildMapsRoutePlan } from '../lib/mapsRoutePlan';
import { mapsTiming } from '../lib/routeTiming';

if (process.env.AI_JMP_ALLOW_PAID_PROVIDER_TEST !== 'yes') {
  throw new Error('Set AI_JMP_ALLOW_PAID_PROVIDER_TEST=yes to run paid Maps requests.');
}
nextEnv.loadEnvConfig(process.cwd());

const destinations = [
  ['malatya', 'arguvan'], ['eskişehir', 'odunpazarı'], ['ankara', 'çankaya'],
  ['ankara', 'yenimahalle'], ['konya', 'karatay'], ['van', 'tuşba'],
  ['antalya', 'serik'], ['antalya', 'kepez'], ['malatya', '']
] as const;
const origin = findLocation('izmir', 'menemen');
if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) throw new Error('Menemen coordinate unavailable.');

const results = [];
for (const [city, county] of destinations) {
  const destination = findLocation(city, county);
  if (!Number.isFinite(destination.lat) || !Number.isFinite(destination.lng)) {
    results.push({ route: `${city}, ${county}`, result: 'coordinate_missing' });
    continue;
  }
  const maps = await getDirections(`${origin.lat},${origin.lng}`, `${destination.lat},${destination.lng}`, { useTolls: true });
  if (!maps) {
    results.push({ route: `${city}, ${county}`, result: 'maps_unavailable' });
    continue;
  }
  const plan = buildMapsRoutePlan(maps, { originName: 'izmir, menemen', destinationName: `${city}, ${county}` });
  const timing = mapsTiming(maps);
  results.push({
    route: `${city}, ${county}`, result: 'ok', distanceKm: Math.round(maps.distance.value / 1000),
    roadStops: plan.routeSchematic.nodes.filter(node => node.type === 'stop').length,
    schematicNodes: plan.routeSchematic.nodes.length,
    weatherCheckpoints: plan.weatherCheckpoints.length,
    breakCount: plan.breakTargets.length,
    lastRestKmToGo: plan.breakTargets.filter(item => item.kind === 'daily_rest').at(-1)
      ? Math.round((maps.distance.value - plan.breakTargets.filter(item => item.kind === 'daily_rest').at(-1)!.thresholdDistanceMeters) / 1000) : null,
    drivingDuration: timing.summary.drivingDuration, totalDuration: timing.summary.estimatedDuration,
    planningSpeedKmh: timing.summary.routeNotice?.match(/(60|65) km\/sa/)?.[1] ?? '?'
  });
}
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), source: 'existing Menemen report destinations; not the approved Total location list', results }, null, 2));
