import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCriticalAnalysis } from './analysisValidation';

test('an empty sourced-event result stays empty instead of requiring an invented risk point', () => {
  const result = validateCriticalAnalysis({ criticalPoints: [] });
  assert.deepEqual(result.criticalPoints, []);
  assert.deepEqual((result.routeSchematic as { nodes: unknown[] }).nodes, []);
});

test('critical analysis still rejects a missing event list', () => {
  assert.throws(() => validateCriticalAnalysis({}), /invalid shape/);
});

test('report mode drops malformed points while retaining valid candidates and the omission count', () => {
  const valid = {
    id: 'ok', coordinate: '38.5,27.1', timeOffsetHours: 1,
    weather: { location: 'İzmir', temp: '-', condition: 'Doğrulanamadı', icon: 'unknown' },
    traffic: { status: 'unknown', description: 'Doğrulanamadı' },
    incident: { type: 'info', description: 'Kaynak adayı', source: 'https://example.test' }
  };
  const result = validateCriticalAnalysis({ criticalPoints: [{ ...valid, coordinate: 'invalid' }, valid] }, { dropInvalidPoints: true });
  assert.equal(result.invalidCriticalPointCount, 1);
  assert.equal((result.criticalPoints as unknown[]).length, 1);
  assert.equal((result.criticalPoints as Array<{ id: string }>)[0].id, 'ok');
});

test('research candidate needs only coordinates and sourced event; weather and traffic are separate', () => {
  const result = validateCriticalAnalysis({ criticalPoints: [{
    latitude: 38.5, longitude: 27.1, location: 'D300',
    incident: { type: 'roadwork', description: 'Şerit daralması', source: 'https://example.test/work' }
  }] }, { dropInvalidPoints: true });
  const point = (result.criticalPoints as Array<{ coordinate: string; weather: { icon: string }; traffic: { status: string } }>)[0];
  assert.equal(point.coordinate, '38.5,27.1');
  assert.equal(point.weather.icon, 'unknown');
  assert.equal(point.traffic.status, 'unknown');
  assert.equal(result.invalidCriticalPointCount, 0);
});
