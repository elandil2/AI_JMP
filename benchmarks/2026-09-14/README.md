# Gemini Flash route benchmark, 2026-09-14

`routes.csv` is the fixed UTF-8, headerless four-column input. The first nine lines preserve the city/county pairs of nine earlier successful reports. The last line is the smoke-test route. An empty destination county is intentional. Submit the exact same bytes once for `gemini-2.5-flash`, then once for `gemini-3.8-flash`. Use toll roads and leave departure time unset; never reuse historical departure timestamps.

## Execution gates

1. The already-created single-report smoke is `22246273-1aab-4404-a50e-25915a1d9fc3` (Kocaeli/Gebze to Ankara). It reached `ready`; its Google Maps log reported 395 km / 4 h 3 min. It is **not** one of the 20 benchmark reports.
2. Run only the first 2.5 Flash batch item. Check `ready`, complete structured output, non-null token metering, Search/Maps events and durable report/item links before requesting item two.
3. Advance one pending item per request. If a request times out or an item remains `processing`, stop: inspect state and billing; never automatically retry a potentially billable generation.
4. Stop before a new item whenever observed plus projected total reaches USD 9. Target is USD 5. The estimate must track token, Search and Maps separately, and flag unknown amounts rather than treating them as zero. Delayed provider billing means USD 10 is not a guaranteed cap.
5. If any row fails or 3.8 Flash with Search cannot be used on this account, stop and report the comparison as incomplete. No automatic retry.

## Comparison

Join the two batches by `row_index` and identical input hash. For each route, compare structured completeness, cited source relevance, distance/duration/break consistency, unsupported assertions, elapsed provider time, prompt/output/thought tokens and estimated token cost. Show Search and Maps costs in separate columns. Compare estimates with the Google billing console when charges have posted; do not call estimates invoices.

The smoke report already exposed a consistency risk: the UI summary stated 7 h 20 min while its break note discussed 5.7 h driving. Use this as a concrete QA check, not an automatic correction to the output.
