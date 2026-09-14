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
  assert.match(result.errors.join("\n"), /unterminated quoted field/);
});

test("keeps UTF-8 Turkish fields and a trailing empty destination county", () => {
  const result = parseBatchCsv("İstanbul,Üsküdar,Çanakkale,");
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows[0]?.destinationCounty, "");
  assert.equal(result.rows[0]?.originCity, "İstanbul");
});
