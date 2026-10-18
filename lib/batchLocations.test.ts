import assert from "node:assert/strict";
import test from "node:test";
import { batchLocationErrors } from "./batchLocations";

test("queue validation reports unknown provinces and counties by CSV row", () => {
  const errors = batchLocationErrors([
    { originCity: "AYDIN", originCounty: "Efeler", destinationCity: "Isparta", destinationCounty: "", sourceRow: 2 },
    { originCity: "Ankra", originCounty: "", destinationCity: "Ankara", destinationCounty: "Çankya", sourceRow: 3 }
  ]);
  assert.deepEqual(errors, [
    '3. satır: Çıkış ili "Ankra" bulunamadı',
    '3. satır: Varış ilçesi "Çankya", Ankara ilinde bulunamadı'
  ]);
});
