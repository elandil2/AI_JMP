import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReportSources } from '../components/ReportSources';
import type { GroundingChunk } from '../types';

const render = (sources: GroundingChunk[]) => renderToStaticMarkup(React.createElement(ReportSources, { sources }));

test('source cards filter unsafe URLs, deduplicate URLs, and retain both source kinds', () => {
  const html = render([
    { web: { uri: 'javascript:alert(1)' } },
    { web: { uri: '/relative' } },
    { web: { uri: 'https://example.com/a', title: '<script>test</script>' }, maps: { uri: 'https://maps.google.com/place' } },
    { web: { uri: 'https://example.com/a' } },
    { web: {}, maps: { uri: 'https://example.com/map' } }
  ]);
  assert.equal((html.match(/<a /g) ?? []).length, 3);
  assert.match(html, /aria-label="3 kaynak"/);
  assert.ok(!html.includes('javascript:'));
  assert.ok(!html.includes('<script>'));
  assert.match(html, /&lt;script&gt;test&lt;\/script&gt;/);
  assert.equal((html.match(/rel="noopener noreferrer"/g) ?? []).length, 3);
  assert.ok(!html.includes('<details'));
});

test('source preview shows four links and preserves more than sixteen through native disclosure', () => {
  const html = render(Array.from({ length: 20 }, (_, index) => ({ web: { uri: `https://example.com/${index}`, title: 'Same title' } })));
  assert.match(html, /aria-label="20 kaynak"/);
  const [preview, disclosure] = html.split('<details');
  assert.equal((preview.match(/<a /g) ?? []).length, 4);
  assert.equal((disclosure.match(/<a /g) ?? []).length, 16);
  assert.match(disclosure, /Diğer 16 kaynağı göster/);
  assert.ok(!/<details[^>]*\sopen(?:[\s=>])/.test(html));
  assert.match(html, /Kaynak 20, yeni sekmede açılır/);
});

test('empty and invalid sources retain the honest empty state', () => {
  const html = render([{ web: { uri: 'data:text/html,hello' } }]);
  assert.match(html, /Bu kayıtta doğrulanabilir kaynak bağlantısı bulunmuyor/);
  assert.match(html, /aria-label="0 kaynak"/);
  assert.ok(!html.includes('<a '));
  assert.ok(!html.includes('<details'));
});
