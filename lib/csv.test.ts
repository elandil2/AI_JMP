import assert from "node:assert/strict";
import test from "node:test";
import { parseBatchCsv } from "./csv.ts";

test("parses quoted commas and a header row", () => {
  const result = parseBatchCsv('Origin City,Origin County,Destination City,Destination County\n"A, City",County,Bursa,Nilüfer');
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.rows, [{ originCity: "A, City", originCounty: "County", destinationCity: "Bursa", destinationCounty: "Nilüfer", sourceRow: 2 }]);
});

test("reports malformed and incomplete rows instead of silently dropping them", () => {
  const result = parseBatchCsv('Origin City,Destination City\nAnkara,\n"broken');
  assert.equal(result.rows.length, 0);
  assert.match(result.errors.join("\n"), /kapanmamış tırnak/);
});

test("keeps UTF-8 Turkish fields and a trailing empty destination county", () => {
  const result = parseBatchCsv("İstanbul,Üsküdar,Çanakkale,");
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows[0]?.destinationCounty, "");
  assert.equal(result.rows[0]?.originCity, "İstanbul");
});

test("accepts semicolon-separated Excel exports with CRLF line endings", () => {
  const result = parseBatchCsv("Origin City;Origin County;Destination City;Destination County\r\nİzmir;Menemen;Ankara;Çankaya\r\n");
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.rows, [{ originCity: "İzmir", originCounty: "Menemen", destinationCity: "Ankara", destinationCounty: "Çankaya", sourceRow: 2 }]);
});

test("keeps commas inside quoted fields when the file uses semicolons", () => {
  const result = parseBatchCsv('"Bursa, merkez";Nilüfer;Ankara;');
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows[0]?.originCity, "Bursa, merkez");
});

test("recognises Turkish headers regardless of case and diacritics", () => {
  for (const header of ["Çıkış İli,Çıkış İlçesi,Varış İli,Varış İlçesi", "CIKIS ILI,CIKIS ILCESI,VARIS ILI,VARIS ILCESI", "kalkış_ili,kalkış_ilçesi,varış_ili,varış_ilçesi"]) {
    const result = parseBatchCsv(`${header}\nİzmir,Menemen,Ankara,Çankaya`);
    assert.deepEqual(result.errors, [], header);
    assert.deepEqual(result.rows, [{ originCity: "İzmir", originCounty: "Menemen", destinationCity: "Ankara", destinationCounty: "Çankaya", sourceRow: 2 }], header);
  }
});

test("row numbers in errors are physical CSV lines, skipping blank lines and quoted newlines", () => {
  const result = parseBatchCsv('Origin City,Origin County,Destination City,Destination County\n\n"Bursa\nmerkez",Nilüfer,Ankara,\n,,Ankara,');
  assert.equal(result.rows[0]?.sourceRow, 3);
  assert.deepEqual(result.errors, ["5. satır: çıkış ili ve varış ili zorunlu"]);
});
