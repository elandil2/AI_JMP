import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RouteSchematic } from '../components/RouteSchematic';
import type { RouteSegmentNode } from '../types';

const nodes = (count: number): RouteSegmentNode[] => Array.from({ length: count }, (_, index) => ({
    name: `Durak ${index + 1}`, type: index === 0 ? 'origin' : index === count - 1 ? 'destination' : 'stop',
    timeFromStart: `${index * 4} sa 0 dk`, distanceFromStart: `${index * 200} km`
}));
const render = (items: RouteSegmentNode[]) => renderToStaticMarkup(React.createElement(RouteSchematic, { data: { nodes: items, totalDistance: '-', totalDuration: '-' } }));

test('route empty state does not add a panel', () => assert.equal(render([]), ''));
test('route keeps every stop once in chronological DOM order for short and long routes', () => {
    for (const count of [1, 2, 3, 4, 5, 6, 7, 8, 12, 20]) {
        const html = render(nodes(count));
        const names = [...html.matchAll(/<h4[^>]*>(.*?)<\/h4>/g)].map(match => match[1]);
        assert.deepEqual(names, nodes(count).map(item => item.name));
        assert.equal((html.match(/<li /g) ?? []).length, count);
        assert.equal((html.match(/class="jmp-route__number"/g) ?? []).length, count);
        assert.equal((html.match(/class="jmp-route__turn"/g) ?? []).length, Math.floor((count - 1) / 3));
        assert.equal((html.match(/class="jmp-route__segment"/g) ?? []).length, count - 1 - Math.floor((count - 1) / 3));
    }
});
test('route positions use three-column serpentine without reversing input data', () => {
    const data = nodes(8);
    const original = JSON.stringify(data);
    const html = render(data);
    const positions = [...html.matchAll(/style="--route-column:(\d);--route-row:(\d)"/g)].map(match => [Number(match[1]), Number(match[2])]);
    assert.deepEqual(positions, [[1,1],[2,1],[3,1],[3,2],[2,2],[1,2],[1,3],[2,3]]);
    assert.equal(JSON.stringify(data), original);
});
test('route preserves long names and raw times without inventing rest duration', () => {
    const data = nodes(3);
    data[1] = { ...data[1], type: 'break', name: 'Uzun dinlenme durağı <script>alert(1)</script> ' + 'ÇokUzunDurak'.repeat(25), timeFromStart: '29 sa 15 dk' };
    const html = render(data);
    assert.ok(html.includes('29 sa 15 dk'));
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(html.includes('ÇokUzunDurak'.repeat(25)));
    assert.ok(!html.includes('45 dk mola'));
    assert.ok(!html.includes('11 sa dinlenme'));
    assert.ok(!html.includes('truncate'));
    assert.match(html, /<ol[^>]+role="list"/);
});
