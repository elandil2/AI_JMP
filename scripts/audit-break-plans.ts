/**
 * Faz 0 measurement: run the independent break-plan audit over
 *  - captured Google routes (fixtures/routes/*.json) planned by the current engine, and
 *  - compact snapshots of live reports (fixtures/live-reports/*.txt).
 *
 *   npx tsx scripts/audit-break-plans.ts
 *
 * Live snapshot line format:
 *   id;created;route;departureISO;totalDistance;drivingDuration;B232@4 sa 30 dk|D547@9 sa
 * (B = 45 min break, D = 11 h daily rest, number = km, after @ = the label's driving time).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RouteSegmentNode } from '../types';
import { auditBreakPlan, auditStoredSchematic, type BreakPlanAudit } from '../lib/breakPlanAudit';
import type { DirectionsResult } from '../lib/googleMaps';
import { buildMapsRoutePlan } from '../lib/mapsRoutePlan';
import { mapsTiming } from '../lib/routeTiming';

const rows: Array<{ source: string; route: string; audit: BreakPlanAudit; totalElapsed?: string }> = [];

const routeDir = 'fixtures/routes';
if (existsSync(routeDir)) {
  for (const file of readdirSync(routeDir).filter(name => name.endsWith('.json'))) {
    const { spec, directions } = JSON.parse(readFileSync(join(routeDir, file), 'utf8')) as { spec: { label: string }; directions: DirectionsResult };
    const plan = buildMapsRoutePlan(directions);
    const timing = mapsTiming(directions);
    rows.push({
      source: 'motor', route: spec.label, totalElapsed: timing.summary.estimatedDuration,
      audit: auditBreakPlan(plan.routeSchematic.nodes, { totalKm: directions.distance.value / 1000, drivingHours: timing.drivingHours, allowExtendedDay: timing.schedule.extendedDays > 0 })
    });
  }
}

const liveDir = 'fixtures/live-reports';
if (existsSync(liveDir)) {
  for (const file of readdirSync(liveDir).filter(name => name.endsWith('.txt'))) {
    for (const line of readFileSync(join(liveDir, file), 'utf8').split(/\r?\n/).filter(Boolean)) {
      const [id, , route, departure, totalDistance, drivingDuration, rests] = line.split(';');
      const nodes: RouteSegmentNode[] = (rests ?? '').split('|').filter(Boolean).map(token => {
        const match = /^([BD])(\d+)@(.*)$/.exec(token)!;
        const label = match[1] === 'D' ? '11 sa Günlük Dinlenme' : '45 dk Mola';
        return { type: 'break', name: `${label} (${match[3]} sürüşten sonra)`, distanceFromStart: `${match[2]} km`, timeFromStart: '' };
      });
      const audit = auditStoredSchematic(nodes, { totalDistance, drivingDuration }, { departureTime: departure });
      if (audit) rows.push({ source: `canlı ${id}`, route, audit });
    }
  }
}

const pct = (value?: number) => value === undefined ? '-' : `%${Math.round(value * 100)}`;
for (const { source, route, audit, totalElapsed } of rows) {
  const hard = audit.violations.filter(v => v.severity === 'hard');
  console.log(`\n${route}  [${source}]  ${Math.round(audit.totalKm)} km · ${audit.drivingHours.toFixed(1)} sa sürüş${totalElapsed ? ` · plan ${totalElapsed}` : ''}`);
  console.log(`  molalar: ${audit.rests.map(r => `${r.kind === 'daily_rest' ? '11sa' : '45dk'}@${Math.round(r.km)}km`).join(', ') || 'yok'}`);
  console.log(`  bölümler (sa): ${audit.stints.map(s => s.drivingHours.toFixed(2)).join(' → ')}`);
  console.log(`  en büyük mola konum hatası: ${Math.round(audit.maxRestPositionErrorKm)} km · gece sürüşü: ${pct(audit.nightDrivingShare)} · varış saati: ${audit.arrivalHourLocal ?? '-'}`);
  for (const violation of audit.violations) console.log(`  ${violation.severity === 'hard' ? '✗' : '!'} ${violation.message}`);
  if (!audit.violations.length) console.log('  ✓ kural ihlali yok');
  if (hard.length === 0 && audit.violations.length) console.log('  (sert ihlal yok)');
}
const failing = rows.filter(row => row.audit.violations.some(v => v.severity === 'hard')).length;
console.log(`\nÖzet: ${rows.length} plan, ${failing} tanesinde sert kural ihlali.`);
