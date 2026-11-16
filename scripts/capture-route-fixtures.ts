/**
 * Capture Google Routes responses for the Total benchmark routes.
 *
 *   npx tsx --env-file=<path-to-env-with-GOOGLE_MAPS_API_KEY> scripts/capture-route-fixtures.ts [routeId ...]
 *
 * Uses traffic-unaware routing so repeated captures are comparable. Output goes to
 * fixtures/routes/<id>.json, which is git-ignored. Costs one Routes request per route.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDirections } from '../lib/googleMaps';
import { FIXTURE_DIR, ROUTE_FIXTURES } from './route-fixtures';

const only = new Set(process.argv.slice(2));
const targets = ROUTE_FIXTURES.filter(spec => only.size === 0 || only.has(spec.id));
if (!process.env.GOOGLE_MAPS_API_KEY) {
  console.error('GOOGLE_MAPS_API_KEY is not set. Pass --env-file=<path>.');
  process.exit(1);
}

mkdirSync(FIXTURE_DIR, { recursive: true });
let failures = 0;
for (const spec of targets) {
  const result = await getDirections(spec.origin, spec.destination, { useTolls: true, stopCoords: spec.via?.coords });
  if (!result) {
    failures++;
    console.error(`✗ ${spec.id}: no route returned`);
    continue;
  }
  const file = join(FIXTURE_DIR, `${spec.id}.json`);
  writeFileSync(file, JSON.stringify({ spec, capturedAt: new Date().toISOString(), directions: result }, null, 2));
  console.log(`✓ ${spec.id}: ${Math.round(result.distance.value / 1000)} km, ${result.steps.length} steps → ${file}`);
}
process.exit(failures ? 1 : 0);
