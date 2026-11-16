/**
 * Driving-time schedule for a single FTL trip (EU 561/2006 / AETR planning view).
 *
 * Rules applied:
 *  - a 45 min break after at most 4.5 h of continuous driving;
 *  - at most 9 h driving per working day, followed by an 11 h daily rest;
 *  - the daily limit may be extended to 10 h (at most twice a week) when that lets the
 *    trip arrive the same day instead of stopping for 11 h just before the destination.
 *
 * Assumptions, stated in the report: the driver starts fully rested, does no other work
 * on the way (FTL, no loading/unloading), and weekly/fortnightly totals are unknown.
 * The 13 h duty window cannot bind here: a 10 h day with two breaks spans 11.5 h.
 */

export const MAX_CONTINUOUS_DRIVING_HOURS = 4.5;
export const MAX_DAILY_DRIVING_HOURS = 9;
export const EXTENDED_DAILY_DRIVING_HOURS = 10;
export const BREAK_MINUTES = 45;
export const DAILY_REST_MINUTES = 11 * 60;
/** EU 561/2006 Art. 6(1): the 10 h day may be used at most twice in a week. */
export const MAX_EXTENDED_DAYS_PER_WEEK = 2;

const EPSILON_HOURS = 1e-6;

export interface ScheduleRest {
  kind: 'break' | 'daily_rest';
  /** Cumulative driving hours when the rest starts. */
  driveThresholdHours: number;
  breakMinutes: number;
  /** Elapsed planning hours (driving + all rests so far) when the rest ends. */
  elapsedAtEndHours: number;
}

export interface DrivingDay {
  startDrivingHours: number;
  drivingHours: number;
  limitHours: number;
  extended: boolean;
}

export interface DrivingSchedule {
  totalDrivingHours: number;
  rests: ScheduleRest[];
  days: DrivingDay[];
  totalRestMinutes: number;
  totalElapsedHours: number;
  extendedDays: number;
  /** Same trip without any 10 h day: how much later it would arrive. Undefined when no day was extended. */
  withoutExtension?: { totalElapsedHours: number; extraRestMinutes: number };
}

export interface DrivingScheduleOptions {
  /** How many 10 h days the plan may use. Default 2 (the weekly maximum); 0 disables. */
  maxExtendedDays?: number;
}

export function planDrivingSchedule(totalDrivingHours: number, options: DrivingScheduleOptions = {}): DrivingSchedule {
  if (!Number.isFinite(totalDrivingHours) || totalDrivingHours < 0) throw new Error('Driving duration must be a non-negative number.');
  const maxExtendedDays = Math.max(0, Math.min(MAX_EXTENDED_DAYS_PER_WEEK, Math.floor(options.maxExtendedDays ?? MAX_EXTENDED_DAYS_PER_WEEK)));

  const rests: ScheduleRest[] = [];
  const days: DrivingDay[] = [];
  let driven = 0;
  let restHours = 0;
  let extendedDays = 0;

  while (totalDrivingHours - driven > EPSILON_HOURS) {
    const remaining = totalDrivingHours - driven;
    // Extend only when the whole remainder fits in a 10 h day; otherwise the 11 h rest is needed anyway.
    const extend = remaining > MAX_DAILY_DRIVING_HOURS + EPSILON_HOURS
      && remaining <= EXTENDED_DAILY_DRIVING_HOURS + EPSILON_HOURS
      && extendedDays < maxExtendedDays;
    const limit = extend ? EXTENDED_DAILY_DRIVING_HOURS : MAX_DAILY_DRIVING_HOURS;
    if (extend) extendedDays++;

    const dayStart = driven;
    let dayDriven = 0;
    while (true) {
      const stint = Math.min(MAX_CONTINUOUS_DRIVING_HOURS, limit - dayDriven, totalDrivingHours - driven);
      driven += stint;
      dayDriven += stint;
      if (totalDrivingHours - driven <= EPSILON_HOURS) break; // arrival ends the plan
      if (dayDriven >= limit - EPSILON_HOURS) {
        restHours += DAILY_REST_MINUTES / 60;
        rests.push({ kind: 'daily_rest', driveThresholdHours: driven, breakMinutes: DAILY_REST_MINUTES, elapsedAtEndHours: driven + restHours });
        break;
      }
      restHours += BREAK_MINUTES / 60;
      rests.push({ kind: 'break', driveThresholdHours: driven, breakMinutes: BREAK_MINUTES, elapsedAtEndHours: driven + restHours });
    }
    days.push({ startDrivingHours: dayStart, drivingHours: dayDriven, limitHours: limit, extended: extend });
  }

  const totalRestMinutes = rests.reduce((sum, rest) => sum + rest.breakMinutes, 0);
  const schedule: DrivingSchedule = {
    totalDrivingHours, rests, days, totalRestMinutes,
    totalElapsedHours: totalDrivingHours + totalRestMinutes / 60,
    extendedDays
  };
  if (extendedDays > 0) {
    const plain = planDrivingSchedule(totalDrivingHours, { maxExtendedDays: 0 });
    schedule.withoutExtension = { totalElapsedHours: plain.totalElapsedHours, extraRestMinutes: plain.totalRestMinutes - totalRestMinutes };
  }
  return schedule;
}

/** Elapsed planning hours at a point reached after `drivingHours` of driving (rests started before it are complete). */
export function elapsedAtDrivingHours(schedule: Pick<DrivingSchedule, 'rests'>, drivingHours: number): number {
  return drivingHours + schedule.rests
    .filter(rest => rest.driveThresholdHours < drivingHours - EPSILON_HOURS)
    .reduce((sum, rest) => sum + rest.breakMinutes / 60, 0);
}
