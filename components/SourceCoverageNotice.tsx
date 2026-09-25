import type { RouteAnalysis } from '@/types';

export function SourceCoverageNotice({ analysis }: { analysis: RouteAnalysis }) {
  const { summary } = analysis;
  const weather = [analysis.weather.origin, ...(analysis.weather.waypoints ?? []), analysis.weather.destination];
  const availableWeather = weather.filter(point => point.icon !== 'unknown' && point.temp !== '-').length;
  const providerWeather = weather.filter(point => point.source === 'google_weather').length;
  const schematicNodes = analysis.routeSchematic?.nodes.length ?? 0;
  const incidentCandidates = analysis.criticalPoints?.length ?? 0;

  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-amber-950" aria-label="Rapor veri kapsamı">
      <h2 className="text-base font-semibold">Rapor veri kapsamı</h2>
      <dl className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
        <div><dt className="font-medium">Rota şeması</dt><dd>{schematicNodes} nokta · {summary.mapsDuration ? 'Google Maps yolu' : 'AI tahmini'}</dd></div>
        <div><dt className="font-medium">Hava durumu</dt><dd>{availableWeather}/{weather.length} noktada tahmin · {providerWeather} sağlayıcı verisi</dd></div>
        <div><dt className="font-medium">Yol uyarıları</dt><dd>{incidentCandidates} kaynaklı rota adayı</dd></div>
      </dl>
      <p className="mt-1 text-sm leading-6">
        {summary.sourceCoverage === 'verified' ? 'Uyarı kaynakları kontrol edildi.' : 'Yol çalışması ve kaza kaynaklarının tüm rota kapsamı doğrulanmadı.'}
        Bir uyarı görünmemesi, güzergâhta olay olmadığı anlamına gelmez.
      </p>
      <p className="mt-1 text-sm leading-6">
        Trafik sağlayıcısı kapsamı: {summary.incidentProviderCoverage === 'available' ? 'rota koridorunda olay adayı bulundu' : summary.incidentProviderCoverage === 'partial' ? 'rotanın bir kısmı sorgulanabildi' : summary.incidentProviderCoverage === 'unknown' ? 'olay dönmedi; kapsama kesinleşmedi' : 'sağlayıcı verisi alınamadı'}.
      </p>
      {summary.omittedUnsourcedPoints ? (
        <p className="mt-1 text-sm leading-6">
          Modelin doğrudan kaynak bağlantısı vermediği {summary.omittedUnsourcedPoints} rota adayı rapora alınmadı.
        </p>
      ) : null}
      {summary.omittedUngroundedPoints ? (
        <p className="mt-1 text-sm leading-6">Arama kaydı olmayan {summary.omittedUngroundedPoints} AI yol uyarısı adayı rapora alınmadı.</p>
      ) : null}
      {summary.omittedMalformedPoints ? (
        <p className="mt-1 text-sm leading-6">
          Modelin eksik veya geçersiz alanlarla verdiği {summary.omittedMalformedPoints} nokta adayı rapora alınmadı.
        </p>
      ) : null}
    </section>
  );
}
