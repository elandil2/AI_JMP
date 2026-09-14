# Route schematic visual QA — 2026-09-15

final result: passed

## Scope and selected target

Only `components/RouteSchematic.tsx` changes production UI. Report sources, surrounding pages, route calculations, API calls, Gemini defaults and database configuration are untouched.

Source visual truth: `C:/Users/safix/.codex/generated_images/01a0930f-a0e7-7303-a854-cb15a88c34f3/exec-4f7ba8b6-6bc3-45bf-9505-7f52a36bc5cb.png` (2106 × 747 pixels).

## Browser evidence

- Local synthetic preview: `http://127.0.0.1:4318/compare`. The harness imports and server-renders the actual production component; it is outside the Next route tree and is not committed/deployed.
- Combined reference and implementation comparison: `design-audit-2026-09-14/route-compare-initial.png`. Both artifacts appear together in one browser capture. The reference is scaled proportionally to a 1184 CSS-pixel-wide image; implementation uses the existing report-compatible 1184px container. The reference has baked-in outer margins, so outer image-edge differences are not treated as component drift.
- Responsive fixture: `http://127.0.0.1:4318/frames`. Actual same-origin iframe widths: 320, 768 and 1184 CSS pixels, each with 12 synthetic stops and overnight-rest wording.
- Focused narrow-screen capture: `design-audit-2026-09-14/route-mobile-320.png`.
- Long desktop capture: `design-audit-2026-09-14/route-mobile-320-initial.png` (despite the initial filename, this capture shows the 1184px long-route fixture).
- Narrow iframe document width/scrollWidth: 305/305px (320px frame less vertical scrollbar). Tablet: 768/768px. Desktop: 1184/1184px. All have 12 nodes and zero horizontally clipped stop names.
- Captures use the browser's existing viewport and native capture density. Explicit CDP full-page captures timed out; the supported screenshot surface captured the rendered comparison and responsive content successfully. No screenshot is claimed to be a pixel-perfect normalized overlay.

## Findings and fidelity surfaces

No actionable P0/P1/P2 findings in the captured component states.

- Typography: existing Inter/system stack; readable navy headings and slate time labels. Full input names wrap without ellipses. Names are not heuristically split into invented subfields as the illustration does.
- Layout: three chronological columns, alternating visual direction, numbered circular nodes, continuous rounded turns. Twelve-node route spans four rows. On narrow containers the same ordered DOM becomes a vertical timeline; connectors do not overlap labels.
- Color: indigo origin, amber rest, emerald destination, slate intermediate nodes; component-scoped styles prevent changes to approved report sections.
- Asset fidelity: existing Lucide outline icons match the chosen mock's icon family. No raster assets, external icon fetches or invented map imagery. Connecting lines are decorative layout infrastructure.
- Copy/data: all supplied names and cumulative times remain unchanged and escaped as React text. No hardcoded 45-minute or overnight duration is added: the current data type has no per-rest-duration field. Mock-only captions are not included in production.

## Comparison history

The first rendered comparison found no actionable P0/P1/P2 drift. No visual-fix iteration was required. Focused mobile and long-route captures extended coverage after the six-node comparison.

## Validation and limits

- 24 automated tests passed, including 0/1/2/3/4/5/6/7/8/12/20 nodes, partial rows, chronological DOM, numbering, full long names, escaping, unchanged times and no invented duration labels.
- Typecheck passed; Next production build passed.
- Local preview browser error log: no entries at verification time.
- Independent high-reasoning Terra review: PASS, no confirmed release blocker; independently ran tests and typecheck.
- Lint is not verified: existing `next lint` requests initial ESLint configuration; no unrelated configuration change was made.
- No interactive controls were added. Ordered-list semantics and decorative connector hiding checked. No animation introduced.
- Print rules preserve text and avoid splitting individual nodes; print pagination across very long routes has not been visually verified.
- Existing unknown-location fallback and coordinate quality are outside this UI change. Long live test uses explicitly populated Ataşehir/Erciş coordinates instead of null-coordinate İpekyolu.

## Follow-up polish

If a future backend supplies explicit rest durations, the selected mock's rest-duration badge can be added without guessing from cumulative times. No such claim is added in this release.
