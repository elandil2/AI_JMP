export type BatchCsvRow = {
  originCity: string;
  originCounty: string;
  destinationCity: string;
  destinationCounty: string;
  sourceRow: number;
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

const parseRecords = (text: string, delimiter: string): { records: string[][]; errors: string[] } => {
  const records: string[][] = [];
  const errors: string[] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let row = 1;

  const pushRecord = () => {
    record.push(field);
    if (record.some((value) => value.trim())) records.push(record);
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
        field += char;
      }
      continue;
    }
    if (char === '"') {
      if (field.length > 0) errors.push(`${row}. satır: tırnak işareti alanın ortasında kullanılmış`);
      quoted = true;
    } else if (char === delimiter) {
      record.push(field);
      field = "";
    } else if (char === "\n") {
      pushRecord();
      row += 1;
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (quoted) errors.push(`${row}. satır: kapanmamış tırnak işareti`);
  if (field.length > 0 || record.length > 0) pushRecord();
  return { records, errors };
};

const headerIndex = (headers: string[], names: string[]) =>
  headers.findIndex((header) => names.includes(normalizeHeader(header)));

export const parseBatchCsv = (text: string): CsvParseResult => {
  const { records, errors } = parseRecords(text, detectDelimiter(text));
  if (errors.length || records.length === 0) return { rows: [], errors: errors.length ? errors : ["CSV boş"] };

  const first = records[0];
  const originCityIndex = headerIndex(first, ORIGIN_CITY_HEADERS);
  const destinationCityIndex = headerIndex(first, DESTINATION_CITY_HEADERS);
  const hasHeader = originCityIndex >= 0 && destinationCityIndex >= 0;
  const originCountyIndex = hasHeader ? headerIndex(first, ORIGIN_COUNTY_HEADERS) : 1;
  const destinationCountyIndex = hasHeader ? headerIndex(first, DESTINATION_COUNTY_HEADERS) : 3;
  const start = hasHeader ? 1 : 0;
  const rows: BatchCsvRow[] = [];

  for (let index = start; index < records.length; index += 1) {
    const values = records[index].map((value) => value.trim());
    const sourceRow = index + 1;
    if (!hasHeader && values.length > 4) {
      errors.push(`${sourceRow}. satır: en fazla dört sütun olmalı (çıkış ili, çıkış ilçesi, varış ili, varış ilçesi)`);
      continue;
    }
    const originCity = values[hasHeader ? originCityIndex : 0] || "";
    const destinationCity = values[hasHeader ? destinationCityIndex : 2] || "";
    if (!originCity || !destinationCity) {
      errors.push(`${sourceRow}. satır: çıkış ili ve varış ili zorunlu`);
      continue;
    }
    rows.push({
      originCity,
      originCounty: values[originCountyIndex] || "",
      destinationCity,
      destinationCounty: values[destinationCountyIndex] || "",
      sourceRow
    });
  }
  return { rows, errors };
};
