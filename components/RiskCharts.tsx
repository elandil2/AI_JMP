import React from 'react';
import type { RiskSegment, RiskType, SummaryStats } from '../types';

interface RiskChartsProps {
  intensityData: RiskSegment[];
  typeData: RiskType[];
  trafficCoverage?: SummaryStats['mapboxTrafficCoverage'];
}

const TrafficCoverage = ({ data }: { data?: SummaryStats['mapboxTrafficCoverage'] }) => data ? <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
  <h4 className="text-sm font-semibold text-slate-800">Mevcut trafik ölçüm kapsamı</h4>
  <p className="mt-1 text-xs leading-5 text-slate-600">Mapbox otomobil rotasında {data.knownDistanceKm.toLocaleString('tr-TR')}/{data.routeDistanceKm.toLocaleString('tr-TR')} km (%{data.knownPercent.toLocaleString('tr-TR')}) ölçülmüş. Diğer kesimlerin yoğunluğu bilinmiyor; Google rotasıyla yol ve yön eşleşmesi teyit edilmedi.</p>
  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200" role="img" aria-label={`Mapbox trafik kapsamı yüzde ${data.knownPercent.toLocaleString('tr-TR')}`}>
    <div className="h-full bg-blue-600" style={{ width: `${Math.max(0, Math.min(100, data.knownPercent))}%` }} />
  </div>
  {(data.moderateDistanceKm > 0 || data.heavyDistanceKm > 0) && <p className="mt-2 text-xs text-slate-700">Ölçülen kesimde orta yoğunluk: {data.moderateDistanceKm.toLocaleString('tr-TR')} km · yüksek yoğunluk: {data.heavyDistanceKm.toLocaleString('tr-TR')} km.</p>}
</div> : null;

export const RiskCharts = ({ intensityData, typeData, trafficCoverage }: RiskChartsProps) => {
  if (!intensityData?.length && !typeData?.length) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-slate-700" aria-label="Uyarı yoğunluğu">
        <h3 className="font-semibold text-slate-900">Rota bazlı uyarı yoğunluğu hesaplanamadı</h3>
        <p className="mt-1 text-sm leading-6">Kaynaklı ve rota koridoruna yakın olay adayı bulunmadı. Bu, güzergâhın risksiz olduğunu göstermez.</p>
        <TrafficCoverage data={trafficCoverage} />
      </section>
    );
  }

  const maximum = Math.max(1, ...intensityData.map(segment => segment.value));
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-label="Kaynaklı yol uyarısı yoğunluğu">
      <h3 className="text-lg font-bold text-slate-900">Kaynaklı Yol Uyarısı Yoğunluğu</h3>
      <p className="mt-1 text-sm leading-6 text-slate-600">Değerler her etapta 100 km başına düşen olay adayı sayısıdır; kaza olasılığı veya sürüş güvenliği puanı değildir. Aynı yol ve yön ayrıca doğrulanmalıdır.</p>
      <TrafficCoverage data={trafficCoverage} />
      <div className="mt-5 grid gap-7 lg:grid-cols-[minmax(0,2fr)_minmax(220px,1fr)]">
        <div>
          <h4 className="text-sm font-semibold text-slate-800">Etaplar</h4>
          <ol className="mt-3 space-y-3">
            {intensityData.map((segment, index) => (
              <li key={`${segment.name}-${index}`} className="min-w-0">
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
                  <span className="min-w-0 break-words font-medium text-slate-700">{segment.name}</span>
                  <span className="shrink-0 tabular-nums text-slate-600">{segment.eventCount ?? 0} aday · {segment.distanceKm ?? '-'} km · {segment.value.toLocaleString('tr-TR')} / 100 km</span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                  <div className="h-full rounded-full bg-amber-600" style={{ width: `${Math.max(0, Math.min(100, segment.value / maximum * 100))}%` }} />
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-slate-800">Uyarı türleri</h4>
          <ul className="mt-3 space-y-2 text-sm">
            {typeData.map(type => <li key={type.category} className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-slate-700">{type.category}</span>
              <strong className="tabular-nums text-slate-900">{type.value}</strong>
            </li>)}
          </ul>
        </div>
      </div>
    </section>
  );
};
