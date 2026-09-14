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
- Independent Terra high-reasoning review: PASS, no confirmed P0/P1 blockers; 17/17 tests and typecheck independently rerun. Final production build also passed after the last edits. Live smoke remains pending at commit time.

## Deliberately not completed here

The 10+10 model benchmark, Google invoice reconciliation, database backup/restore, RLS/permission hardening, key restrictions, and check-email hardening remain separate. Do not infer production security certification or true truck routing from a successful report smoke test.
