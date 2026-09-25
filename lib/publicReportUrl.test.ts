import assert from 'node:assert/strict';
import test from 'node:test';
import { publicReportUrl } from './publicReportUrl';

test('local report links use the active preview port while production uses its configured origin', () => {
  assert.equal(publicReportUrl('abc', 'http://127.0.0.1:3001', 'http://localhost:3000'), 'http://127.0.0.1:3001/r/abc');
  assert.equal(publicReportUrl('abc', 'https://preview.example.test', 'https://jmp.example.test/'), 'https://jmp.example.test/r/abc');
});
