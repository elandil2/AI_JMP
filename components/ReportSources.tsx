import React from 'react';
import { BookOpen, ChevronDown, ExternalLink } from 'lucide-react';
import type { GroundingChunk } from '../types';

export function ReportSources({ sources = [] }: { sources?: GroundingChunk[] }) {
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
      <h3 className="font-semibold text-slate-800">Rapor kaynakları</h3>
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-600" aria-label={`${links.length} kaynak`}>{links.length}</span>
    </div>
    <p className="mt-1 text-sm text-slate-600">Rapor oluşturulurken bulunan kaynaklar. Yol ve hava koşulları değişebilir.</p>
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
      : <p className="mt-2 text-sm text-slate-600">Bu kayıtta doğrulanabilir kaynak bağlantısı bulunmuyor.</p>}
  </section>;
}
