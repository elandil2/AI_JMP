import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CriticalPointsTable } from '../components/CriticalPointsTable';
import type { CriticalPoint, RouteAnalysis } from '../types';

const weather: RouteAnalysis['weather'] = {
  origin: { location: 'Menemen', temp: '20°C', condition: 'Açık', icon: 'sunny', source: 'ai_unverified' },
  waypoints: [{ location: 'Afyon · 200 km', temp: '10°C', condition: 'Bulutlu', icon: 'cloudy', source: 'ai_unverified' }],
  destination: { location: 'Konya', temp: '12°C', condition: 'Açık', icon: 'sunny', source: 'ai_unverified' }
};

test('regional conditions keep route weather visible even without any incident', () => {
  const html = renderToStaticMarkup(React.createElement(CriticalPointsTable, { points: [], weather, totalDistance: '400 km' }));
  assert.ok(html.indexOf('Menemen') < html.indexOf('Afyon · 200 km'));
  assert.ok(html.indexOf('Afyon · 200 km') < html.indexOf('Konya'));
  assert.match(html, /20°C/);
  assert.match(html, /AI tahmini · kaynak kullanımı doğrulanmadı/);
  assert.doesNotMatch(html, /Güzergâh koşulu verisi yok/);
});

test('sourced roadwork is inserted at its route position among weather rows', () => {
  const point: CriticalPoint = {
    id: 'work-1', coordinate: '39,30', routeVerification: { status: 'corridor_candidate', progress: 0.4 },
    weather: { location: 'D300', temp: '-', condition: '-', icon: 'unknown' },
    traffic: { status: 'unknown', description: 'Trafik doğrulanmadı' },
    incident: { type: 'roadwork', description: 'Şerit çalışması', source: 'https://www.kgm.gov.tr/example' }
  };
  const html = renderToStaticMarkup(React.createElement(CriticalPointsTable, { points: [point], weather, totalDistance: '400 km' }));
  assert.ok(html.indexOf('Menemen') < html.indexOf('Şerit çalışması'));
  assert.ok(html.indexOf('Şerit çalışması') < html.indexOf('Afyon · 200 km'));
  assert.match(html, /Olay kaynağını aç/);
});
