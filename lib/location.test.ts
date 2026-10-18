import assert from "node:assert/strict";
import test from "node:test";
import { findLocation } from "./location";

test("matches provinces with dotless ı in any casing or ASCII spelling", () => {
  for (const name of ["Aydın", "AYDIN", "Aydin", "aydin"]) assert.equal(findLocation(name).city, "aydın", name);
  for (const name of ["Isparta", "ISPARTA", "ısparta"]) assert.equal(findLocation(name).matched, true, name);
  for (const name of ["Iğdır", "IĞDIR", "Igdir"]) assert.equal(findLocation(name).matched, true, name);
  for (const name of ["BALIKESİR", "Balikesir", "Diyarbakir", "ŞANLIURFA", "Kirsehir"]) assert.equal(findLocation(name).matched, true, name);
});

test("matches counties with Turkish casing and flags unknown counties", () => {
  const sariyer = findLocation("İSTANBUL", "SARIYER");
  assert.equal(sariyer.countyMatched, true);
  assert.notEqual(sariyer.lat, findLocation("İstanbul").lat);
  assert.equal(findLocation("Ankara", "Çankya").countyMatched, false);
  assert.equal(findLocation("Ankara").countyMatched, undefined);
  assert.equal(findLocation("Ankra").matched, false);
});
