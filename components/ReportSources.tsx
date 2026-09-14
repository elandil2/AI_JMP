import type { GroundingChunk } from '../types';

export function ReportSources({ sources = [] }: { sources?: GroundingChunk[] }) {
  const seen = new Set<string>();
  const links = sources.flatMap(source => {
    const item = source.web ?? source.maps;
    if (!item?.uri) return [];
    try {
      const url = new URL(item.uri);
      if (!['https:', 'http:'].includes(url.protocol) || seen.has(url.href)) return [];
      seen.add(url.href);
      return [{ href: url.href, title: item.title || url.hostname }];
    } catch { return []; }
  }).slice(0, 16);
  return <section className="rounded-xl border border-slate-200 bg-white p-4" aria-label="Rapor kaynakları">
    <h3 className="font-semibold text-slate-800">Rapor kaynakları</h3>
    <p className="mt-1 text-sm text-slate-600">Rapor oluşturulurken bulunan kaynaklar. Yol ve hava koşulları değişebilir.</p>
    {links.length ? <ul className="mt-2 space-y-1">{links.map(link => <li key={link.href}><a href={link.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center break-all text-sm text-blue-700 underline focus-visible:outline focus-visible:outline-2">{link.title}</a></li>)}</ul>
      : <p className="mt-2 text-sm text-slate-600">Bu kayıtta doğrulanabilir kaynak bağlantısı bulunmuyor.</p>}
  </section>;
}
