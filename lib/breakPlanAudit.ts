import type { RouteSegmentNode } from '../types';
import { parseHours } from './routeTiming';

/**
 * Independent rule check for a planned schematic (EU 561/2006 / AETR planning view).
 *
 * The audit trusts only node positions (km) and the plan's average driving speed:
 * driving time up to a stop = km / speed. It does not trust the labels the planner
 * wrote ("4 sa 30 dk sürüşten sonra"), so a rest snapped away from its threshold
 * shows up as a real overrun on the following stint.
 *
 * Planning assumptions: the driver starts fully rested, no other work is done during
 * the trip (FTL, no loading/unloading on the way), weekly and fortnightly limits are unknown.
 */

export type RestKind = 'break' | 'daily_rest';

export interface AuditRest {
  kind: RestKind;
  name: string;
  km: number;
  minutes: number;
  /** Driving hours at the rest position, derived from km / speed. */
  drivingHoursAt: number;
  /** Driving hours the label claims, if it states one. */
  labelledDrivingHours?: number;
}

export interface AuditStint {
  fromKm: number;
  toKm: number;
  drivingHours: number;
  endsWith: RestKind | 'arrival';
}

export type AuditRule = 'continuous_driving' | 'daily_driving' | 'duty_window' | 'rest_position' | 'arrival_rest';

export interface AuditViolation {
  rule: AuditRule;
  severity: 'hard' | 'warning';
  message: string;
  km?: number;
}

export interface BreakPlanAudit {
  totalKm: number;
  drivingHours: number;
  speedKmh: number;
  rests: AuditRest[];
  stints: AuditStint[];
  violations: AuditViolation[];
  /** Largest gap between where a rest should be (by label) and where it was placed. */
  maxRestPositionErrorKm: number;
  /** Share of planned driving between 22:00 and 06:00 Europe/Istanbul; undefined without departure. */
  nightDrivingShare?: number;
  arrivalHourLocal?: number;
}

export interface AuditOptions {
  /** Plan's total driving hours (summary.drivingDuration). */
  drivingHours: number;
  totalKm: number;
  departureTime?: string;
  /** Allow the 10 h daily extension (max twice a week). Default false → 9 h. */
  allowExtendedDay?: boolean;
  /** Tolerance before a stint counts as an overrun. Default 5 minutes. */
  toleranceMinutes?: number;
}

const BREAK_MINUTES = 45;
const DAILY_REST_MINUTES = 11 * 60;
const MAX_CONTINUOUS_HOURS = 4.5;
const DUTY_WINDOW_HOURS = 13; // 24 h minus a regular 11 h daily rest

export const parseKm = (value?: string): number | undefined => {
  const match = /([\d.,]+)\s*km/i.exec(value ?? '');
  if (!match) return undefined;
  const km = Number(match[1].replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  return Number.isFinite(km) ? km : undefined;
};

function restKind(name: string): RestKind {
  return /11\s*sa|günlük\s*dinlenme|daily/i.test(name) ? 'daily_rest' : 'break';
}

function labelledDrivingHours(name: string): number | undefined {
  const match = /\(([^)]*?)\s*(?:modellenen\s*)?sürüşten sonra\)/i.exec(name);
  return match ? parseHours(match[1]) : undefined;
}

function istanbulHour(epochMs: number): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', hourCycle: 'h23' }).format(new Date(epochMs)));
}

function nightShare(departureMs: number, drivingWindows: Array<[number, number]>): number {
  let night = 0;
  let total = 0;
  const stepMs = 5 * 60_000;
  for (const [start, end] of drivingWindows) {
    for (let t = start; t < end; t += stepMs) {
      const slice = Math.min(stepMs, end - t);
      total += slice;
      const hour = istanbulHour(departureMs + t + slice / 2);
      if (hour >= 22 || hour < 6) night += slice;
    }
  }
  return total > 0 ? night / total : 0;
}

export function auditBreakPlan(nodes: RouteSegmentNode[], options: AuditOptions): BreakPlanAudit {
  const { drivingHours, totalKm } = options;
  if (!(drivingHours > 0) || !(totalKm > 0)) throw new Error('Audit needs positive driving hours and distance.');
  const speedKmh = totalKm / drivingHours;
  const toleranceHours = (options.toleranceMinutes ?? 5) / 60;
  const maxDaily = options.allowExtendedDay ? 10 : 9;

  const rests: AuditRest[] = nodes
    .filter(node => node.type === 'break')
    .flatMap(node => {
      const km = parseKm(node.distanceFromStart);
      if (km === undefined) return [];
      const kind = restKind(node.name);
      return [{
        kind, name: node.name, km,
        minutes: kind === 'daily_rest' ? DAILY_REST_MINUTES : BREAK_MINUTES,
        drivingHoursAt: km / speedKmh,
        labelledDrivingHours: labelledDrivingHours(node.name)
      }];
    })
    .sort((a, b) => a.km - b.km);

  const violations: AuditViolation[] = [];
  const stints: AuditStint[] = [];
  let previousKm = 0;
  for (const rest of rests) {
    stints.push({ fromKm: previousKm, toKm: rest.km, drivingHours: (rest.km - previousKm) / speedKmh, endsWith: rest.kind });
    previousKm = rest.km;
  }
  stints.push({ fromKm: previousKm, toKm: totalKm, drivingHours: (totalKm - previousKm) / speedKmh, endsWith: 'arrival' });

  // Continuous driving: a 45 min break or a daily rest resets the 4.5 h counter.
  for (const stint of stints) {
    if (stint.drivingHours > MAX_CONTINUOUS_HOURS + toleranceHours) {
      violations.push({
        rule: 'continuous_driving', severity: 'hard', km: stint.toKm,
        message: `${Math.round(stint.fromKm)}–${Math.round(stint.toKm)} km arası ${stint.drivingHours.toFixed(2)} sa kesintisiz sürüş (sınır 4,5 sa).`
      });
    }
  }

  // Daily driving and duty window, per working day (split at daily rests).
  let dayDriving = 0;
  let dayElapsed = 0;
  let dayStartKm = 0;
  for (const stint of stints) {
    dayDriving += stint.drivingHours;
    dayElapsed += stint.drivingHours;
    if (stint.endsWith === 'break') {
      dayElapsed += BREAK_MINUTES / 60;
      continue;
    }
    if (dayDriving > maxDaily + toleranceHours) {
      violations.push({
        rule: 'daily_driving', severity: 'hard', km: stint.toKm,
        message: `${Math.round(dayStartKm)}–${Math.round(stint.toKm)} km iş gününde ${dayDriving.toFixed(2)} sa sürüş (sınır ${maxDaily} sa).`
      });
    }
    if (dayElapsed > DUTY_WINDOW_HOURS + toleranceHours) {
      violations.push({
        rule: 'duty_window', severity: 'hard', km: stint.toKm,
        message: `${Math.round(dayStartKm)}–${Math.round(stint.toKm)} km iş günü ${dayElapsed.toFixed(2)} sa sürüyor; günlük dinlenme 13 sa içinde başlamalı.`
      });
    }
    dayDriving = 0;
    dayElapsed = 0;
    dayStartKm = stint.toKm;
  }

  let maxRestPositionErrorKm = 0;
  for (const rest of rests) {
    if (rest.labelledDrivingHours === undefined) continue;
    const errorKm = Math.abs(rest.drivingHoursAt - rest.labelledDrivingHours) * speedKmh;
    maxRestPositionErrorKm = Math.max(maxRestPositionErrorKm, errorKm);
    if (errorKm > 15) {
      violations.push({
        rule: 'rest_position', severity: 'warning', km: rest.km,
        message: `"${rest.name}" etiketi ${rest.labelledDrivingHours.toFixed(2)} sa sürüş diyor, konum ${rest.drivingHoursAt.toFixed(2)} sa sürüşe denk geliyor (${Math.round(errorKm)} km fark).`
      });
    }
  }

  const finalStint = stints[stints.length - 1];
  const lastRest = rests[rests.length - 1];
  // The 10 h extension adds at most one driving hour, so only a final stint that fits in it qualifies.
  if (lastRest?.kind === 'daily_rest' && finalStint.drivingHours <= 1 + toleranceHours) {
    violations.push({
      rule: 'arrival_rest', severity: 'warning', km: lastRest.km,
      message: `Varışa ${Math.round(finalStint.toKm - finalStint.fromKm)} km kala 11 sa günlük dinlenme planlanmış; 10 sa uzatma hakkı değerlendirilebilir.`
    });
  }

  let nightDrivingShare: number | undefined;
  let arrivalHourLocal: number | undefined;
  const departureMs = Date.parse(options.departureTime ?? '');
  if (Number.isFinite(departureMs)) {
    const windows: Array<[number, number]> = [];
    let clockMs = 0;
    stints.forEach((stint, index) => {
      const durationMs = stint.drivingHours * 3_600_000;
      windows.push([clockMs, clockMs + durationMs]);
      clockMs += durationMs;
      const rest = rests[index];
      if (rest) clockMs += rest.minutes * 60_000;
    });
    nightDrivingShare = nightShare(departureMs, windows);
    arrivalHourLocal = istanbulHour(departureMs + clockMs);
  }

  return { totalKm, drivingHours, speedKmh, rests, stints, violations, maxRestPositionErrorKm, nightDrivingShare, arrivalHourLocal };
}

/** Convenience for stored reports: reads totals from the schematic and summary strings. */
export function auditStoredSchematic(
  nodes: RouteSegmentNode[],
  summary: { totalDistance?: string; drivingDuration?: string },
  options: Omit<AuditOptions, 'drivingHours' | 'totalKm'> = {}
): BreakPlanAudit | undefined {
  const totalKm = parseKm(summary.totalDistance);
  const drivingHours = parseHours(summary.drivingDuration ?? '');
  if (!totalKm || !drivingHours) return undefined;
  return auditBreakPlan(nodes, { ...options, totalKm, drivingHours });
}
