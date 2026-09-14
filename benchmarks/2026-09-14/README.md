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

## First production gate (stopped)

The 2.5 Flash queue `9109405a-50cb-4838-8cbd-daf1170956a0` was created with 10 pending rows, the frozen input hash `7da261de4d870f014c25b4bfe87a03f6dec601024c1be297f4050e3003573c5e`, toll roads enabled, and no departure time. Only row 0 (Bursa/Nilüfer → Ankara/Etimesgut) was submitted. It made one successful Maps request and one successful Gemini critical-analysis request, then failed local validation with `criticalPoints[0].weather.icon is invalid.` No weather request or subsequent batch row ran. The batch is `failed` and its next-item action is disabled. Logged estimated costs for this failed attempt: tokens $0.015294, Search $0.035000, Maps $0.005000; total $0.055294. This is an estimate, not a Google invoice.

Historical successful reports include meaningful composite icons such as `partly_cloudy` and `thunderstorm`; the validator was broadened to normalize recognized weather terms while still rejecting unrelated values. No paid row has been retried. The ten-pair comparison is **not complete** until a new controlled run succeeds; do not count the failed row as a benchmark report.
