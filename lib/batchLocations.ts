import type { BatchCsvRow } from "./csv";
import { findLocation } from "./location";

/** Free check before queueing: an unknown place would otherwise fail only after paid Gemini calls and stop the batch. */
export const batchLocationErrors = (rows: BatchCsvRow[]) => rows.flatMap((row) => [
  [row.originCity, row.originCounty, "Çıkış"],
  [row.destinationCity, row.destinationCounty, "Varış"]
].flatMap(([city, county, label]) => {
  const match = findLocation(city, county || undefined);
  if (!match.matched) return [`${row.sourceRow}. satır: ${label} ili "${city}" bulunamadı`];
  if (match.countyMatched === false) return [`${row.sourceRow}. satır: ${label} ilçesi "${county}", ${city} ilinde bulunamadı`];
  return [];
}));
