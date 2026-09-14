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

const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/^\uFEFF/, "").replace(/[_-]+/g, " ");

const parseRecords = (text: string): { records: string[][]; errors: string[] } => {
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
      if (field.length > 0) errors.push(`Row ${row}: unexpected quote in an unquoted field`);
      quoted = true;
    } else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n") {
      pushRecord();
      row += 1;
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (quoted) errors.push(`Row ${row}: unterminated quoted field`);
  if (field.length > 0 || record.length > 0) pushRecord();
  return { records, errors };
};

const headerIndex = (headers: string[], names: string[]) =>
  headers.findIndex((header) => names.includes(normalizeHeader(header)));

export const parseBatchCsv = (text: string): CsvParseResult => {
  const { records, errors } = parseRecords(text);
  if (errors.length || records.length === 0) return { rows: [], errors: errors.length ? errors : ["CSV is empty"] };

  const first = records[0];
  const originCityIndex = headerIndex(first, ["origin city", "origin", "origin_city"]);
  const destinationCityIndex = headerIndex(first, ["destination city", "destination", "destination_city"]);
  const hasHeader = originCityIndex >= 0 && destinationCityIndex >= 0;
  const originCountyIndex = hasHeader ? headerIndex(first, ["origin county", "origin_county"]) : 1;
  const destinationCountyIndex = hasHeader ? headerIndex(first, ["destination county", "destination_county"]) : 3;
  const start = hasHeader ? 1 : 0;
  const rows: BatchCsvRow[] = [];

  for (let index = start; index < records.length; index += 1) {
    const values = records[index].map((value) => value.trim());
    const sourceRow = index + 1;
    if (!hasHeader && values.length > 4) {
      errors.push(`Row ${sourceRow}: expected at most four columns`);
      continue;
    }
    const originCity = values[hasHeader ? originCityIndex : 0] || "";
    const destinationCity = values[hasHeader ? destinationCityIndex : 2] || "";
    if (!originCity || !destinationCity) {
      errors.push(`Row ${sourceRow}: origin city and destination city are required`);
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
