# Production report repair — 2026-09-14

## Scope and cause

Production is Vercel `jmp__ai`, GitHub `elandil2/AI_JMP`. The earlier two first-row benchmark attempts reached Maps and Gemini successfully, then failed on display-schema validation (`weather.icon`, then `timeline[2]`). This was an application regression, not evidence of a database outage. No existing report rows or database policies are modified by this release.

## Changes

- Restore a complete output prompt compatible with Gemini 2.5 Flash + Search. Normalize presentation categories to explicit neutral states, retain raw categories where useful, and still reject missing substantive analysis or malformed JSON.
- Meter invalid generated responses as errors including their consumed tokens. No automatic provider retry. Add per-call telemetry to single-report generation using the existing telemetry table.
- Sum all Maps legs, including stopovers. Separate Google automobile duration from the conservative truck-planning estimate, with a single deterministic driving/rest calculation used by the summary and schematic destination.
- Show failed/stale processing states, friendly creation errors, provenance links, and uncertainty. Do not mutate old report data to repair presentation.
- Update Next.js within major version 15 and override PostCSS within major version 8 to address the dependency audit findings.

## Routing limitation

Google Directions `mode=driving` is not a truck-restriction-aware route. The existing 60 km/h estimate does not change the geometry or prove height/weight/access legality. The release explicitly labels that distinction. Google Large Vehicle Routing currently lists limited-access coverage in the contiguous USA and experimental Japan, not Türkiye. True Turkish truck routing requires a provider with that coverage (for example HERE) and an authorized account/key plus vehicle parameters. No provider was purchased or silently substituted.

- https://developers.google.com/maps/documentation/routes/lvr
- https://docs.here.com/routing/docs/routing-v8-truck-routing-coverage

## Verification

- Automated mocked-provider/unit tests: 17 passed before final release review.
- Historical compatibility: 29/29 successful saved reports pass the new validator. This is not a fresh-generation benchmark. The corpus remains local and ignored; it is not shipped.
- TypeScript check and production build pass. Build retains a Supabase Edge-runtime warning.
- Dependency audit after updates: zero known vulnerabilities reported at the time of this check.
- Standalone lint remains unconfigured: `npm run lint` opens the existing setup prompt and does not constitute a successful lint run.
- Independent Terra high-reasoning review: PASS, no confirmed P0/P1 blockers; 17/17 tests and typecheck independently rerun. Final production build also passed after the last edits.

## Verified production smoke

- Repair commit: `56a6a4e`; Vercel deployment `2ZTeH4gFU6K52fV2bTxoRSZYcgD6`, Ready and assigned to `jmpai-snowy.vercel.app`.
- Exactly one new single report, Gemini 2.5 Flash, Bursa/Nilüfer → Ankara/Etimesgut, tolls allowed, current departure. Report `7fefa1cc-5b10-48b5-996e-72129a1b2994`, https://jmpai-snowy.vercel.app/r/bibj8philj . No automatic retry or benchmark batch.
- Database status ready; created 2026-09-14 19:16:57 UTC, completed 19:18:04 UTC (about 67 seconds).
- Maps directions: successful, 374 ms. Gemini critical analysis: successful, 38,534 ms. Gemini weather: successful, 25,100 ms. All three usage events persisted.
- Summary and schematic agree: 379 km, Maps automobile 4h21, truck-planning driving 6h19 + rest 45m = total 7h04. Embedded Maps visibly showed the same 379 km / 4h21 route during this check (other alternatives were also visible).
- Estimated list-price costs: tokens USD 0.034918, Search USD 0.070000, Maps USD 0.010000; total USD 0.114918. This is an estimate, not an invoice; account free allowances and actual billed Search usage may differ.
- Critical response returned 14 grounding sources; weather response returned zero grounding sources. A structurally valid weather answer is not independently verified weather truth. No claim is made that every generated risk, restriction, or forecast was fact-checked.
- Public report renders successfully, source links visible, old failed report now shows a clear failure message. Desktop and 320px mobile report inspected; mobile document width equals viewport width (312 CSS px after scrollbar), no horizontal page overflow. Temporary viewport override reset.
- Existing historical reports were preserved; the 29-report local compatibility corpus was not committed.

## Deliberately not completed here

The 10+10 model benchmark, Google invoice reconciliation, database backup/restore, RLS/permission hardening, key restrictions, and check-email hardening remain separate. Do not infer production security certification or true truck routing from a successful report smoke test.
