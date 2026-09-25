import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RiskCharts } from '../components/RiskCharts';

test('partial traffic observations show their actual coverage without a risk score', () => {
  const html = renderToStaticMarkup(React.createElement(RiskCharts, {
    intensityData: [], typeData: [],
    trafficCoverage: { routeDistanceKm: 1218, knownDistanceKm: 24, knownPercent: 2, moderateDistanceKm: 0.6, heavyDistanceKm: 0 }
  }));
  assert.match(html, /24\/1\.218 km/);
  assert.match(html, /%2/);
  assert.match(html, /Diğer kesimlerin yoğunluğu bilinmiyor/);
  assert.doesNotMatch(html, /Risk Puanı|%100/);
});
