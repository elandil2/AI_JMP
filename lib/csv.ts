export type BatchCsvRow = {
  originCity: string;
  originCounty: string;
  destinationCity: string;
  destinationCounty: string;
  /** Optional route-shaping waypoint ("X üzerinden"), not a delivery stop. */
  viaCity?: string;
  viaCounty?: string;
  sourceRow: number;
};

export type BatchCsvOptions = {
  /** Total mode: the origin is the fixed terminal, so rows only carry destination (+ via). */
  fixedOrigin?: { city: string; county: string };
};

export type CsvParseResult = {
  rows: BatchCsvRow[];
  errors: string[];
};

// Folds Turkish letters so "Çıkış İli", "CIKIS ILI" and "cikis_ili" compare equal.
const normalizeHeader = (value: string) => value.replace(/^\uFEFF/, "").trim().toLocaleLowerCase("tr-TR").replace(/ı/g, "i")
  .normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ");

const ORIGIN_CITY_HEADERS = ["origin city", "origin", "cikis ili", "cikis", "baslangic ili", "baslangic", "kalkis ili", "kalkis", "nereden"];
const DESTINATION_CITY_HEADERS = ["destination city", "destination", "varis ili", "varis", "bitis ili", "bitis", "hedef ili", "hedef", "nereye"];
const ORIGIN_COUNTY_HEADERS = ["origin county", "cikis ilcesi", "cikis ilce", "baslangic ilcesi", "baslangic ilce", "kalkis ilcesi", "kalkis ilce"];
const VIA_CITY_HEADERS = ["via", "via city", "ara durak", "ara durak ili", "guzergah", "guzergah ili", "uzerinden"];
const VIA_COUNTY_HEADERS = ["via county", "ara durak ilcesi", "ara durak ilce", "guzergah ilcesi"];
const DESTINATION_COUNTY_HEADERS = ["destination county", "varis ilcesi", "varis ilce", "bitis ilcesi", "bitis ilce", "hedef ilcesi", "hedef ilce"];

/** Excel in Turkish locale saves "CSV" with semicolons; pick the delimiter used most on the first line. */
const detectDelimiter = (text: string): string => {
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && char === "\n") break;
    else if (!quoted && char in counts) counts[char] += 1;
  }
  return Object.entries(counts).reduce((best, entry) => (entry[1] > best[1] ? entry : best), [",", 0] as [string, number])[0];
};

type CsvRecord = { values: string[]; line: number };

/** Each record keeps its physical start line, so errors point at the right row even after blank lines. */
const parseRecords = (text: string, delimiter: string): { records: CsvRecord[]; errors: string[] } => {
  const records: CsvRecord[] = [];
  const errors: string[] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let recordLine = 1;

  const pushRecord = () => {
    record.push(field);
    if (record.some((value) => value.trim())) records.push({ values: record, line: recordLine });
    record = [];
    field = "";
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        if (char === "\n") line += 1;
        field += char;
      }
      continue;
    }
    if (char === '"') {
      if (field.length > 0) errors.push(`${line}. satır: tırnak işareti alanın ortasında kullanılmış`);
      quoted = true;
    } else if (char === delimiter) {
      record.push(field);
      field = "";
    } else if (char === "\n") {
      pushRecord();
      line += 1;
      recordLine = line;
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (quoted) errors.push(`${recordLine}. satır: kapanmamış tırnak işareti`);
  if (field.length > 0 || record.length > 0) pushRecord();
  return { records, errors };
};

const headerIndex = (headers: string[], names: string[]) =>
  headers.findIndex((header) => names.includes(normalizeHeader(header)));

export const parseBatchCsv = (text: string, options: BatchCsvOptions = {}): CsvParseResult => {
  const { records, errors } = parseRecords(text, detectDelimiter(text));
  if (errors.length || records.length === 0) return { rows: [], errors: errors.length ? errors : ["CSV boş"] };

  const fixed = options.fixedOrigin;
  const first = records[0].values;
  const originCityIndex = headerIndex(first, ORIGIN_CITY_HEADERS);
  const destinationCityIndex = headerIndex(first, DESTINATION_CITY_HEADERS);
  const hasHeader = destinationCityIndex >= 0 && (originCityIndex >= 0 || Boolean(fixed));
  // Without a header: Genel = çıkış ili, çıkış ilçesi, varış ili, varış ilçesi[, ara durak ili, ara durak ilçesi]
  //                   Total = varış ili, varış ilçesi[, ara durak ili, ara durak ilçesi]
  const layout = fixed ? { oc: -1, ocn: -1, dc: 0, dcn: 1, vc: 2, vcn: 3, max: 4 } : { oc: 0, ocn: 1, dc: 2, dcn: 3, vc: 4, vcn: 5, max: 6 };
  const col = hasHeader
    ? { oc: originCityIndex, ocn: headerIndex(first, ORIGIN_COUNTY_HEADERS), dc: destinationCityIndex, dcn: headerIndex(first, DESTINATION_COUNTY_HEADERS), vc: headerIndex(first, VIA_CITY_HEADERS), vcn: headerIndex(first, VIA_COUNTY_HEADERS) }
    : layout;
  const at = (values: string[], index: number) => (index >= 0 ? values[index] || "" : "");
  const same = (a: string, b: string) => a.trim().normalize("NFC").toLocaleLowerCase("tr-TR") === b.trim().normalize("NFC").toLocaleLowerCase("tr-TR");
  // Total mode guard: a Genel-format file (with its own origin columns) must not be silently re-read as destinations.
  if (fixed && hasHeader && originCityIndex >= 0) {
    const otherOrigin = records.slice(1).some(record => { const value = (record.values[originCityIndex] || "").trim(); return value !== "" && !same(value, fixed.city); });
    if (otherOrigin) return { rows: [], errors: ["CSV'de Menemen dışında bir çıkış ili var. Farklı çıkışlar için Genel sekmesini kullanın."] };
  }
  const start = hasHeader ? 1 : 0;
  const rows: BatchCsvRow[] = [];

  for (let index = start; index < records.length; index += 1) {
    const values = records[index].values.map((value) => value.trim());
    const sourceRow = records[index].line;
    if (!hasHeader && values.length > layout.max) {
      errors.push(fixed
        ? `${sourceRow}. satır: en fazla dört sütun olmalı (varış ili, varış ilçesi, ara durak ili, ara durak ilçesi)`
        : `${sourceRow}. satır: en fazla altı sütun olmalı (çıkış ili, çıkış ilçesi, varış ili, varış ilçesi, ara durak ili, ara durak ilçesi)`);
      continue;
    }
    const originCity = fixed ? fixed.city : at(values, col.oc);
    const destinationCity = at(values, col.dc);
    if (!originCity || !destinationCity) {
      errors.push(fixed ? `${sourceRow}. satır: varış ili zorunlu` : `${sourceRow}. satır: çıkış ili ve varış ili zorunlu`);
      continue;
    }
    if (fixed && same(destinationCity, fixed.city) && (!at(values, col.dcn) || same(at(values, col.dcn), fixed.county))) {
      errors.push(`${sourceRow}. satır: varış, Total çıkış noktasıyla aynı (${fixed.city}/${fixed.county}). Bu satır çıkış sütunları içeriyorsa Genel sekmesini kullanın.`);
      continue;
    }
    const viaCity = at(values, col.vc);
    rows.push({
      originCity,
      originCounty: fixed ? fixed.county : at(values, col.ocn),
      destinationCity,
      destinationCounty: at(values, col.dcn),
      ...(viaCity ? { viaCity, viaCounty: at(values, col.vcn) } : {}),
      sourceRow
    });
  }
  return { rows, errors };
};
