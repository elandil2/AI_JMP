import assert from 'node:assert/strict';
import test from 'node:test';
import { TOTAL_MENEMEN, TOTAL_MENEMEN_COORDS } from './totalOperation';

test('Total FTL origin is the verified Menemen lubricants plant', () => {
  assert.equal(TOTAL_MENEMEN.lat, 38.617667);
  assert.equal(TOTAL_MENEMEN.lng, 27.122294);
  assert.equal(TOTAL_MENEMEN_COORDS, '38.617667,27.122294');
  assert.match(TOTAL_MENEMEN.name, /Menemen Madeni Yağ Fabrikası/);
});
