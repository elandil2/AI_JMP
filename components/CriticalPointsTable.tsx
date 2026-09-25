import React from 'react';
import type { CriticalPoint, RouteAnalysis, WeatherInfo } from '../types';
import { AlertTriangle, HardHat, Info } from 'lucide-react';

interface CriticalPointsTableProps {
  points: CriticalPoint[];
  weather?: RouteAnalysis['weather'];
  totalDistance?: string;
}

type Row =
  | { kind: 'weather'; id: string; progress: number; weather: WeatherInfo }
  | { kind: 'incident'; id: string; progress: number; point: CriticalPoint };

const weatherSourceLabel = (weather: WeatherInfo) => {
  if (weather.source === 'google_weather') return 'Google Maps hava verisi';
  if (weather.source === 'gemini_search') return 'AI araması';
  if (weather.source === 'ai_unverified') return 'AI tahmini · kaynak kullanımı doğrulanmadı';
  return 'Hava verisi alınamadı';
};

const weatherSymbol = (icon: WeatherInfo['icon']) => ({ rainy: '🌧️', sunny: '☀️', snow: '❄️', storm: '⛈️', fog: '🌫️', cloudy: '☁️', unknown: '?' })[icon];

const validLink = (source?: string) => {
  try {
    const url = new URL(source ?? '');
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined;
  } catch { return undefined; }
};

function buildRows(points: CriticalPoint[], weather?: RouteAnalysis['weather'], totalDistance?: string): Row[] {
  const rows: Row[] = [];
  const totalKm = Number((totalDistance ?? '').replace(/\s/g, '').replace(',', '.').match(/^\d+(?:\.\d+)?/)?.[0]);
  const checkpoints = weather ? [weather.origin, ...(weather.waypoints ?? []), weather.destination] : [];
  checkpoints.forEach((item, index) => {
    const km = Number(item.location.match(/·\s*(\d+(?:[.,]\d+)?)\s*km\b/i)?.[1]?.replace(',', '.'));
    const progress = index === 0 ? 0 : index === checkpoints.length - 1 ? 1
      : Number.isFinite(km) && Number.isFinite(totalKm) && totalKm > 0 ? km / totalKm : index / (checkpoints.length - 1);
    rows.push({ kind: 'weather', id: `weather-${index}`, progress, weather: item });
  });
  points.forEach((point, index) => rows.push({ kind: 'incident', id: point.id || `incident-${index}`,
    progress: point.routeVerification?.progress ?? 1, point }));
  return rows.sort((a, b) => a.progress - b.progress || (a.kind === b.kind ? 0 : a.kind === 'weather' ? -1 : 1));
}

export const CriticalPointsTable = ({ points, weather, totalDistance }: CriticalPointsTableProps) => {
  const rows = buildRows(points, weather, totalDistance);
  if (!rows.length) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
      <Info className="mx-auto mb-3 h-8 w-8 text-slate-500" aria-hidden="true" />
      <h4 className="font-semibold text-slate-800">Güzergâh koşulu verisi yok</h4>
      <p className="mt-1 text-sm text-slate-600">Hava veya yol uyarısı alınamadı; bu, yolun sorunsuz olduğu anlamına gelmez.</p>
    </div>;
  }

  return <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
    <ol className="space-y-3 p-3 md:hidden">
      {rows.map(row => row.kind === 'weather' ? <li key={row.id} className="rounded-lg border border-slate-200 p-4">
        <h4 className="break-words font-semibold text-slate-900">{row.weather.location}</h4>
        {row.weather.passageTime && <p className="mt-1 text-xs text-slate-600">Planlanan geçiş: <time dateTime={row.weather.passageTime}>{new Date(row.weather.passageTime).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short' })}</time></p>}
        <p className="mt-2 text-sm text-slate-800"><span aria-hidden="true">{weatherSymbol(row.weather.icon)} </span><strong>{row.weather.temp}</strong> · {row.weather.condition}</p>
        <p className="mt-1 text-xs text-amber-800">{weatherSourceLabel(row.weather)}</p>
        {validLink(row.weather.sourceUrl) && <a className="inline-flex min-h-11 items-center text-xs text-blue-700 underline" href={validLink(row.weather.sourceUrl)} target="_blank" rel="noopener noreferrer">Hava kaynağını aç</a>}
        <p className="mt-2 text-xs text-slate-600">Yol uyarısı: kaynaklı olay eşleşmedi.</p>
      </li> : <li key={row.id} className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <h4 className="break-words font-semibold text-slate-900">{row.point.weather.location} · yol uyarısı adayı</h4>
        <p className="mt-1 font-mono text-xs text-slate-600">{row.point.coordinate}</p>
        <p className="mt-2 text-sm font-medium text-slate-800">{row.point.incident.description}</p>
        <p className="mt-1 text-xs text-slate-600">{row.point.traffic.description}</p>
        <p className="mt-1 text-xs text-amber-900">Rota koridoruna yakın; aynı yol ve yön kesinleşmedi.</p>
        {validLink(row.point.incident.source) && <a className="inline-flex min-h-11 items-center text-xs font-semibold text-blue-700 underline" href={validLink(row.point.incident.source)} target="_blank" rel="noopener noreferrer">
          {row.point.provenance?.provider === 'tomtom' || row.point.provenance?.provider === 'mapbox' ? 'Sağlayıcı yöntemini aç' : 'Olay kaynağını aç'}
        </a>}
      </li>)}
    </ol>
    <div className="hidden overflow-x-auto md:block">
    <table className="min-w-[760px] w-full text-left text-sm text-slate-700">
      <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-700"><tr>
        <th scope="col" className="px-4 py-3">Bölge / geçiş</th>
        <th scope="col" className="px-4 py-3">Hava durumu</th>
        <th scope="col" className="px-4 py-3">Trafik</th>
        <th scope="col" className="px-4 py-3">Yol uyarısı / kaynak</th>
      </tr></thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map(row => row.kind === 'weather' ? <tr key={row.id}>
          <th scope="row" className="px-4 py-4 align-top font-semibold text-slate-900">
            {row.weather.location}
            {row.weather.passageTime && <time className="mt-1 block text-xs font-normal text-slate-600" dateTime={row.weather.passageTime}>
              Planlanan geçiş: {new Date(row.weather.passageTime).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short' })}
            </time>}
          </th>
          <td className="px-4 py-4 align-top">
            <span aria-hidden="true" className="mr-1">{weatherSymbol(row.weather.icon)}</span>
            <strong>{row.weather.temp}</strong> · {row.weather.condition}
            <span className="mt-1 block text-xs text-amber-800">{weatherSourceLabel(row.weather)}</span>
            {validLink(row.weather.sourceUrl) && <a className="mt-1 inline-flex min-h-11 items-center text-xs text-blue-700 underline" href={validLink(row.weather.sourceUrl)} target="_blank" rel="noopener noreferrer">Hava kaynağını aç</a>}
          </td>
          <td className="px-4 py-4 align-top text-slate-600">Canlı trafik verisi yok.</td>
          <td className="px-4 py-4 align-top text-slate-600">Kaynaklı olay eşleşmedi.</td>
        </tr> : <tr key={row.id} className="bg-amber-50/40">
          <th scope="row" className="px-4 py-4 align-top font-semibold text-slate-900">
            {row.point.weather.location}
            <span className="mt-1 block font-mono text-xs font-normal text-slate-600">{row.point.coordinate}</span>
            <span className="mt-1 block text-xs font-normal text-amber-900">Rota koridoru adayı; aynı yol ve yön kesinleşmedi.</span>
          </th>
          <td className="px-4 py-4 align-top text-slate-600">{row.point.weather.icon === 'unknown' ? 'Olay koordinatı için ayrı hava tahmini yok.' : `${row.point.weather.temp} · ${row.point.weather.condition}`}</td>
          <td className="px-4 py-4 align-top">{row.point.traffic.description}</td>
          <td className="px-4 py-4 align-top">
            <div className="flex items-start gap-2">
              {row.point.incident.type === 'accident' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
                : row.point.incident.type === 'roadwork' ? <HardHat className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                  : <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" />}
              <div>
                <p className="font-semibold text-slate-800">{row.point.incident.description}</p>
                {row.point.provenance && <p className="mt-1 text-xs text-slate-600">{row.point.provenance.provider === 'tomtom' ? 'TomTom' : row.point.provenance.provider === 'mapbox' ? 'Mapbox' : 'AI kaynak adayı'}{row.point.provenance.recordId ? ` · ${row.point.provenance.recordId}` : ''}</p>}
                {validLink(row.point.incident.source) && <a className="mt-1 inline-flex min-h-11 items-center text-xs font-semibold text-blue-700 underline" href={validLink(row.point.incident.source)} target="_blank" rel="noopener noreferrer">
                  {row.point.provenance?.provider === 'tomtom' || row.point.provenance?.provider === 'mapbox' ? 'Sağlayıcı yöntemini aç' : 'Olay kaynağını aç'}
                </a>}
              </div>
            </div>
          </td>
        </tr>)}
      </tbody>
    </table>
    </div>
  </div>;
};
