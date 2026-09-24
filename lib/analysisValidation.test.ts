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
