import type { SummaryStats } from '@/types';

export function SourceCoverageNotice({ summary }: { summary: SummaryStats }) {
  if (summary.sourceCoverage === 'verified') return null;

  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-amber-950" aria-label="Kaynak kapsamı">
      <h2 className="text-base font-semibold">Kaynak kapsamı doğrulanmadı</h2>
      <p className="mt-1 text-sm leading-6">
        Bu raporda kaza kara noktası ve yol çalışması kaynakları tek tek zorunlu olarak kontrol edilmedi.
        Bir uyarı görünmemesi, güzergâhta olay olmadığı anlamına gelmez.
      </p>
      {summary.omittedUnsourcedPoints ? (
        <p className="mt-1 text-sm leading-6">
          Modelin doğrudan kaynak bağlantısı vermediği {summary.omittedUnsourcedPoints} rota adayı rapora alınmadı.
        </p>
      ) : null}
    </section>
  );
}
