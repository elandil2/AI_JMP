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
