/** Paid provider-only probe. No Supabase write. */
import nextEnv from '@next/env';
import { findLocation } from '../lib/location';
import { getDirections } from '../lib/googleMaps';
import { retrieveMapboxDrivingIncidents } from '../lib/mapboxIncidents';

if (process.env.AI_JMP_ALLOW_PAID_PROVIDER_TEST !== 'yes') {
  throw new Error('Set AI_JMP_ALLOW_PAID_PROVIDER_TEST=yes to run paid provider requests.');
}
nextEnv.loadEnvConfig(process.cwd());
const origin = findLocation('izmir', 'menemen');
const destination = findLocation('malatya', 'arguvan');
if (![origin.lat, origin.lng, destination.lat, destination.lng].every(Number.isFinite)) throw new Error('Route coordinates missing.');
const maps = await getDirections(`${origin.lat},${origin.lng}`, `${destination.lat},${destination.lng}`, { useTolls: true });
if (!maps) throw new Error('Maps route unavailable.');
const coverage = await retrieveMapboxDrivingIncidents({ googleEncodedPolyline: maps.polyline });
console.log(JSON.stringify({
  checkedAt: new Date().toISOString(), mapsKm: Math.round(maps.distance.value / 1000),
  status: coverage.status, coverageReason: coverage.coverageReason,
  trafficCoverage: coverage.trafficCoverage,
  providerItemCount: coverage.providerItemCount,
  incidents: coverage.incidents.map(item => ({
    id: item.id, type: item.type, description: item.description, status: item.status,
    roadNames: item.affectedRoadNames, coordinate: item.coordinate,
    distanceToGoogleRouteKm: item.distanceToGoogleRouteKm, progress: item.routeProgress,
    startTime: item.startTime, endTime: item.endTime
  }))
}, null, 2));
