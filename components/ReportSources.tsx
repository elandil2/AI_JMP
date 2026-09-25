import React from 'react';
import { BookOpen, ChevronDown, ExternalLink } from 'lucide-react';
import type { GroundingChunk, RouteSchematic } from '../types';
import { extractRouteRoadCodes } from '../lib/routeRoadCodes';

export function ReportSources({ sources = [], routeSchematic }: { sources?: GroundingChunk[]; routeSchematic?: RouteSchematic }) {
  const roadCodes = extractRouteRoadCodes(routeSchematic);
  const seen = new Set<string>();
  const links = sources.flatMap(source => [source.web, source.maps]).flatMap(item => {
    if (!item?.uri) return [];
    try {
      const url = new URL(item.uri);
      if (!['https:', 'http:'].includes(url.protocol) || seen.has(url.href)) return [];
      seen.add(url.href);
      return [{ href: url.href, title: item.title?.trim() || url.hostname, host: url.hostname }];
    } catch { return []; }
  });
  const renderLinks = (start: number, end?: number) => <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
    {links.slice(start, end).map((link, index) => <li key={link.href} className="min-w-0">
      <a href={link.href} target="_blank" rel="noopener noreferrer"
        className="group flex min-h-16 items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 transition-colors hover:border-indigo-300 hover:bg-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
        <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-xs font-semibold tabular-nums text-slate-600">{String(start + index + 1).padStart(2, '0')}</span>
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm font-medium text-slate-800 [overflow-wrap:anywhere] group-hover:text-indigo-700">{link.title}</span>
          <span className="mt-0.5 block break-all text-xs text-slate-600">{link.host === 'vertexaisearch.cloud.google.com' ? 'Google kaynak bağlantısı' : link.host}</span>
          <span className="sr-only"> · Kaynak {start + index + 1}, yeni sekmede açılır</span>
        </span>
        <ExternalLink aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500 group-hover:text-indigo-600" />
      </a>
    </li>)}
  </ul>;
  return <section className="rounded-xl border border-slate-200 bg-white p-4" aria-label="Rapor kaynakları">
    <div className="flex items-center gap-2.5">
      <BookOpen aria-hidden="true" className="h-5 w-5 shrink-0 text-indigo-600" />
      <h3 className="font-semibold text-slate-800">Kaynak ve kontrol bağlantıları</h3>
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-600" aria-label={`${links.length} model arama kaynağı`}>{links.length} arama kaynağı</span>
    </div>
    <p className="mt-1 text-sm text-slate-600">Aşağıdaki arama bağlantıları model yanıtından gelir. Tek başlarına bir uyarıyı kanıtlamazlar.</p>
    {links.length ? <div className="mt-4 space-y-2">
      {renderLinks(0, 4)}
      {links.length > 4 && <details className="group/sources rounded-lg border border-slate-200">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 [&::-webkit-details-marker]:hidden">
          <span className="group-open/sources:hidden">Diğer {links.length - 4} kaynağı göster</span>
          <span className="hidden group-open/sources:inline">Daha az göster</span>
          <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 transition-transform group-open/sources:rotate-180" />
        </summary>
        <div className="border-t border-slate-200 p-2">{renderLinks(4)}</div>
      </details>}
    </div>
      : <p className="mt-2 text-sm text-slate-600">Bu kayıtta modelin kullandığı aramaya ait kaynak bağlantısı bulunmuyor.</p>}
    <div className="mt-4 border-t border-slate-200 pt-4">
      <h4 className="text-sm font-semibold text-slate-800">Resmî kontrol sayfaları</h4>
      <p className="mt-1 text-xs leading-5 text-slate-600">Bunlar operatörün güncel durumu ayrıca kontrol etmesi içindir; bu raporda otomatik tarandıkları anlamına gelmez.</p>
      {roadCodes.length > 0 && <div className="mt-3">
        <p className="text-xs font-medium text-slate-700">Maps şemasından çıkan arama ipuçları (KGM kontrol kesim numarası değildir):</p>
        <ul className="mt-1 flex flex-wrap gap-2" aria-label="Kontrol edilecek yol kodları">
          {roadCodes.map(code => <li key={code} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs text-slate-800">{code}</li>)}
        </ul>
      </div>}
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        <li><a className="inline-flex min-h-11 items-center text-sm font-medium text-blue-700 underline" href="https://www.kgm.gov.tr/Sayfalar/KGM/SiteTr/YolDanisma/CalismaYapilanYollar.aspx" target="_blank" rel="noopener noreferrer">KGM çalışma yapılan yollar</a></li>
        <li><a className="inline-flex min-h-11 items-center text-sm font-medium text-blue-700 underline" href="https://www.turkiye.gov.tr/karayollari-calisma-yapilan-yol-sorgulama" target="_blank" rel="noopener noreferrer">e-Devlet çalışma yapılan yol sorgulama</a></li>
        <li><a className="inline-flex min-h-11 items-center text-sm font-medium text-blue-700 underline" href="https://www.turkiye.gov.tr/karayollari-trafige-kapali-yol-sorgulama" target="_blank" rel="noopener noreferrer">e-Devlet trafiğe kapalı yol sorgulama</a></li>
        <li><a className="inline-flex min-h-11 items-center text-sm font-medium text-blue-700 underline" href="https://www.mgm.gov.tr/tahmin/khts.aspx" target="_blank" rel="noopener noreferrer">MGM karayolları hava tahmini</a></li>
      </ul>
    </div>
  </section>;
}
