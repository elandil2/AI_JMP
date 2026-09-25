import assert from 'node:assert/strict';
import test from 'node:test';
import { extractRouteRoadCodes } from './routeRoadCodes';
import type { RouteSchematic } from '../types';

test('Maps schematic road names become deduplicated manual KGM search hints', () => {
  const schematic: RouteSchematic = { totalDistance: '1200 km', totalDuration: '20 sa', nodes: [
    { name: 'Menemen · D300 / E96', type: 'origin', distanceFromStart: '0 km', timeFromStart: '0 sa' },
    { name: 'Afyon · D260 / E96', type: 'stop', distanceFromStart: '300 km', timeFromStart: '5 sa' },
    { name: 'Balâ · O-21', type: 'stop', distanceFromStart: '600 km', timeFromStart: '10 sa' },
    { name: 'Kayseri · D260', type: 'destination', distanceFromStart: '1200 km', timeFromStart: '20 sa' }
  ] };
  assert.deepEqual(extractRouteRoadCodes(schematic), ['D300', 'E96', 'D260', 'O-21']);
  assert.deepEqual(extractRouteRoadCodes(undefined), []);
});
