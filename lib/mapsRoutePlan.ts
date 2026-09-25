import type { RouteSchematic, RouteSegmentNode } from '../types';
import type { DirectionsResult } from './googleMaps';
import { formatHours, mapsTiming } from './routeTiming';
import type { RouteCoordinate } from './routeGeometry';

const MIN_ROUTE_COVERAGE = 0.85;
const EPSILON_HOURS = 0.000001;

export interface MapsRoutePlanOptions {
  originName?: string;
  destinationName?: string;
  planningSpeedKmh?: number;
  /** Requested interior road points. Clamped to 4–8; defaults to five. */
  interiorNodeCount?: number;
}

export interface MapsWeatherCheckpoint {
  name: string;
  roadLabel: string;
  coordinate: RouteCoordinate;
  distanceFromStartMeters: number;
  /** Estimated elapsed hours including any modeled rest completed before arrival. */
  timeOffsetHours: number;
}

export interface MapsBreakTarget {
  kind: 'break' | 'daily_rest';
  name: string;
  driveThresholdHours: number;
  thresholdDistanceMeters: number;
  /** Nearest real Maps step boundary; absent when Directions supplied no usable step geometry. */
  snappedBoundaryDistanceMeters?: number;
  coordinate?: RouteCoordinate;
  breakMinutes: number;
  /** Elapsed planning time at the end of the break/rest. */
  timeFromStartHours: number;
}

export interface MapsRoutePlan {
  routeSchematic: RouteSchematic;
  weatherCheckpoints: MapsWeatherCheckpoint[];
  breakTargets: MapsBreakTarget[];
}

interface StepBoundary {
  distanceMeters: number;
  coordinate: RouteCoordinate;
  roadLabel: string;
}

interface BreakScheduleItem {
  kind: MapsBreakTarget['kind'];
  driveThresholdHours: number;
  breakMinutes: number;
  elapsedAtEndHours: number;
}

function isValidCoordinate(value: RouteCoordinate | undefined): value is RouteCoordinate {
  return Boolean(value && Number.isFinite(value.lat) && Number.isFinite(value.lng)
    && Math.abs(value.lat) <= 90 && Math.abs(value.lng) <= 180);
}

function getStepBoundaries(maps: DirectionsResult): StepBoundary[] {
  const totalDistance = maps.distance.value;
  const steps = maps.steps ?? [];
  const measurableSteps = steps.flatMap(step => Number.isFinite(step.distanceMeters) && (step.distanceMeters ?? 0) > 0
    ? [{ step, distanceMeters: step.distanceMeters! }] : []);
  const stepDistance = measurableSteps.reduce((sum, item) => sum + item.distanceMeters, 0);

  // A partial step list cannot support honest cumulative road positions. Keep the
  // endpoint-only schematic instead of stretching sparse steps across the route.
  if (!Number.isFinite(stepDistance) || stepDistance <= 0 || !Number.isFinite(totalDistance) || totalDistance <= 0
    || stepDistance / totalDistance < MIN_ROUTE_COVERAGE) return [];

  // Google returns numeric distances for each step. Normalization absorbs small
  // step/leg rounding differences while retaining Maps' overall route distance.
  const scale = totalDistance / stepDistance;
  let cumulative = 0;
  return measurableSteps.flatMap(({ step, distanceMeters }) => {
    cumulative += distanceMeters * scale;
    if (!isValidCoordinate(step.endLocation) || cumulative <= 0 || cumulative >= totalDistance) return [];
    const fallbackName = step.instruction.trim();
    const roadLabel = (step.roadLabel || fallbackName || maps.summary || 'Google Maps rota adımı').slice(0, 120);
    return [{ distanceMeters: cumulative, coordinate: step.endLocation, roadLabel }];
  });
}

function createBreakSchedule(totalDrivingHours: number): BreakScheduleItem[] {
  const schedule: BreakScheduleItem[] = [];
  let remainingDrive = totalDrivingHours;
  let driven = 0;
  let currentDailyDrive = 0;
  let accumulatedBreakHours = 0;

  while (remainingDrive > EPSILON_HOURS) {
    const segmentDrive = Math.min(4.5, 9 - currentDailyDrive, remainingDrive);
    remainingDrive -= segmentDrive;
    driven += segmentDrive;
    currentDailyDrive += segmentDrive;

    // Arrival ends the plan. Never append a break/rest after the trip is done.
    if (remainingDrive <= EPSILON_HOURS) break;

    const isDailyRest = currentDailyDrive >= 9 - EPSILON_HOURS;
    const breakMinutes = isDailyRest ? 11 * 60 : 45;
    accumulatedBreakHours += breakMinutes / 60;
    schedule.push({
      kind: isDailyRest ? 'daily_rest' : 'break',
      driveThresholdHours: driven,
      breakMinutes,
      elapsedAtEndHours: driven + accumulatedBreakHours
    });

    if (isDailyRest) currentDailyDrive = 0;
  }
  return schedule;
}

function closestBoundary(boundaries: StepBoundary[], targetDistanceMeters: number): StepBoundary | undefined {
  let closest: StepBoundary | undefined;
  let closestDifference = Number.POSITIVE_INFINITY;
  for (const boundary of boundaries) {
    const difference = Math.abs(boundary.distanceMeters - targetDistanceMeters);
    if (difference < closestDifference) {
      closest = boundary;
      closestDifference = difference;
    }
  }
  return closest;
}

function selectInteriorBoundaries(boundaries: StepBoundary[], totalDistanceMeters: number, requestedCount: number): StepBoundary[] {
  const requested = Number.isFinite(requestedCount) ? Math.floor(requestedCount) : 5;
  const count = Math.min(boundaries.length, Math.max(4, Math.min(8, requested)));
  if (count === 0) return [];

  const selected: StepBoundary[] = [];
  let previousIndex = -1;
  for (let slot = 1; slot <= count; slot++) {
    const targetDistance = totalDistanceMeters * slot / (count + 1);
    const remainingSlots = count - slot;
    const lastAllowedIndex = boundaries.length - 1 - remainingSlots;
    let chosenIndex = previousIndex + 1;
    for (let index = chosenIndex + 1; index <= lastAllowedIndex; index++) {
      if (Math.abs(boundaries[index].distanceMeters - targetDistance)
        < Math.abs(boundaries[chosenIndex].distanceMeters - targetDistance)) chosenIndex = index;
    }
    selected.push(boundaries[chosenIndex]);
    previousIndex = chosenIndex;
  }
  // A single long Directions step can leave several requested slots clustered
  // around one junction. One visible checkpoint is more honest than duplicates.
  const minimumSpacingMeters = Math.max(20_000, totalDistanceMeters / (count + 1) / 4);
  const distinct: StepBoundary[] = [];
  for (const boundary of selected) {
    if (!distinct.length || boundary.distanceMeters - distinct[distinct.length - 1].distanceMeters >= minimumSpacingMeters) {
      distinct.push(boundary);
    }
  }
  return distinct;
}

function elapsedHoursAtDrivingTime(drivingHoursAtNode: number, schedule: BreakScheduleItem[]): number {
  const breaksCompleted = schedule.filter(item => item.driveThresholdHours < drivingHoursAtNode - EPSILON_HOURS)
    .reduce((sum, item) => sum + item.breakMinutes / 60, 0);
  return drivingHoursAtNode + breaksCompleted;
}

/**
 * Build a deterministic schematic from Google Directions step geometry.
 * Interior points are real Maps step ends, named from their road instructions,
 * with cumulative distance and planning time. If Maps omits enough step detail,
 * the function intentionally returns only the origin and destination.
 */
export function buildMapsRoutePlan(maps: DirectionsResult, options: MapsRoutePlanOptions = {}): MapsRoutePlan {
  const timing = mapsTiming(maps, { planningSpeedKmh: options.planningSpeedKmh });
  const totalDistanceMeters = maps.distance.value;
  const drivingHours = timing.drivingHours;
  const boundaries = getStepBoundaries(maps);
  const selectedBoundaries = selectInteriorBoundaries(boundaries, totalDistanceMeters, options.interiorNodeCount ?? 5);
  const breakSchedule = createBreakSchedule(drivingHours);

  const breakTargets: MapsBreakTarget[] = breakSchedule.map(item => {
    const thresholdDistanceMeters = totalDistanceMeters * item.driveThresholdHours / drivingHours;
    const boundary = closestBoundary(boundaries, thresholdDistanceMeters);
    const thresholdLabel = formatHours(item.driveThresholdHours);
    const isDailyRest = item.kind === 'daily_rest';
    return {
      kind: item.kind,
      name: isDailyRest
        ? `Planlama noktası · 11 sa günlük dinlenme (${thresholdLabel} modellenen sürüşten sonra)`
        : `Planlama noktası · 45 dk ara (${thresholdLabel} modellenen sürüşten sonra)`,
      driveThresholdHours: item.driveThresholdHours,
      thresholdDistanceMeters,
      ...(boundary ? { snappedBoundaryDistanceMeters: boundary.distanceMeters, coordinate: boundary.coordinate } : {}),
      breakMinutes: item.breakMinutes,
      timeFromStartHours: item.elapsedAtEndHours
    };
  });

  const originName = options.originName?.trim() || maps.startAddress || 'Başlangıç';
  const destinationName = options.destinationName?.trim() || maps.endAddress || 'Varış';
  const routeNodes: RouteSegmentNode[] = selectedBoundaries.map((boundary, index) => {
    const drivingHoursAtNode = drivingHours * boundary.distanceMeters / totalDistanceMeters;
    return {
      name: boundary.roadLabel || `Google Maps rota noktası ${index + 1}`,
      type: 'stop',
      distanceFromStart: `${Math.round(boundary.distanceMeters / 1000)} km`,
      timeFromStart: formatHours(elapsedHoursAtDrivingTime(drivingHoursAtNode, breakSchedule))
    };
  });

  const breakNodes: RouteSegmentNode[] = breakTargets.flatMap(target => {
    if (target.snappedBoundaryDistanceMeters === undefined) return [];
    return [{
      name: target.name,
      type: 'break',
      distanceFromStart: `${Math.round(target.snappedBoundaryDistanceMeters / 1000)} km`,
      timeFromStart: formatHours(target.timeFromStartHours)
    }];
  });

  const orderedInterior = [
    ...routeNodes.map((node, index) => ({ node, distanceMeters: selectedBoundaries[index].distanceMeters, order: 0 })),
    ...breakNodes.map(node => {
      const target = breakTargets.find(item => item.name === node.name)!;
      return { node, distanceMeters: target.snappedBoundaryDistanceMeters!, order: 1 };
    })
  ].sort((a, b) => {
    const timeDifference = timeToMinutes(a.node.timeFromStart) - timeToMinutes(b.node.timeFromStart);
    return timeDifference || a.distanceMeters - b.distanceMeters || a.order - b.order;
  }).map(item => item.node);

  const routeSchematic: RouteSchematic = {
    nodes: [
      { name: originName, type: 'origin', distanceFromStart: '0 km', timeFromStart: '0 sa 0 dk' },
      ...orderedInterior,
      { name: destinationName, type: 'destination', distanceFromStart: timing.summary.totalDistance, timeFromStart: timing.summary.estimatedDuration }
    ],
    totalDistance: timing.summary.totalDistance,
    totalDuration: timing.summary.estimatedDuration
  };

  const weatherCheckpoints: MapsWeatherCheckpoint[] = selectedBoundaries.map((boundary, index) => {
    const drivingHoursAtNode = drivingHours * boundary.distanceMeters / totalDistanceMeters;
    return {
      name: boundary.roadLabel || `Güzergâh noktası ${index + 1}`,
      roadLabel: boundary.roadLabel,
      coordinate: boundary.coordinate,
      distanceFromStartMeters: boundary.distanceMeters,
      timeOffsetHours: elapsedHoursAtDrivingTime(drivingHoursAtNode, breakSchedule)
    };
  });

  return { routeSchematic, weatherCheckpoints, breakTargets };
}

function timeToMinutes(value: string): number {
  const match = value.match(/(\d+)\s*sa\s*(\d+)\s*dk/i);
  return match ? Number(match[1]) * 60 + Number(match[2]) : Number.POSITIVE_INFINITY;
}
