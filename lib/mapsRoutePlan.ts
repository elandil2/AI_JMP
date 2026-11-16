import type { RouteSchematic, RouteSegmentNode } from '../types';
import type { DirectionsResult } from './googleMaps';
import { formatHours, mapsTiming } from './routeTiming';
import type { RouteCoordinate } from './routeGeometry';
import { buildRouteAxis } from './routeAxis';
import { elapsedAtDrivingHours } from './drivingSchedule';

const MIN_ROUTE_COVERAGE = 0.85;
const EPSILON_HOURS = 0.000001;

export interface MapsRoutePlanOptions {
  originName?: string;
  destinationName?: string;
  planningSpeedKmh?: number;
  /** 10 h driving days the plan may use (0–2). Default 2. */
  maxExtendedDays?: number;
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
  /** Route position where the driving threshold is reached (constant planning speed). */
  thresholdDistanceMeters: number;
  /** Point on the Maps route line at that position; absent when Maps returned no usable geometry. */
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

/**
 * Build a deterministic schematic from Google route geometry.
 * Interior points are real Maps step ends, named from their road instructions.
 * Breaks and daily rests sit exactly where the driving threshold is reached on the
 * route line (interpolated, never snapped to a step end — Google steps can be
 * hundreds of kilometres long). If Maps omits step detail, the schematic keeps only
 * the endpoints and the rests.
 */
export function buildMapsRoutePlan(maps: DirectionsResult, options: MapsRoutePlanOptions = {}): MapsRoutePlan {
  const timing = mapsTiming(maps, { planningSpeedKmh: options.planningSpeedKmh, maxExtendedDays: options.maxExtendedDays });
  const totalDistanceMeters = maps.distance.value;
  const drivingHours = timing.drivingHours;
  const schedule = timing.schedule;
  const boundaries = getStepBoundaries(maps);
  const selectedBoundaries = selectInteriorBoundaries(boundaries, totalDistanceMeters, options.interiorNodeCount ?? 5);
  const axis = buildRouteAxis(maps);

  const breakTargets: MapsBreakTarget[] = schedule.rests.map(item => {
    const thresholdDistanceMeters = totalDistanceMeters * item.driveThresholdHours / drivingHours;
    const coordinate = axis.coordinateAt(thresholdDistanceMeters);
    const thresholdLabel = formatHours(item.driveThresholdHours);
    const isDailyRest = item.kind === 'daily_rest';
    return {
      kind: item.kind,
      name: isDailyRest
        ? `Planlama noktası · 11 sa günlük dinlenme (${thresholdLabel} modellenen sürüşten sonra)`
        : `Planlama noktası · 45 dk ara (${thresholdLabel} modellenen sürüşten sonra)`,
      driveThresholdHours: item.driveThresholdHours,
      thresholdDistanceMeters,
      ...(coordinate ? { coordinate } : {}),
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
      timeFromStart: formatHours(elapsedAtDrivingHours(schedule, drivingHoursAtNode))
    };
  });

  const breakNodes: RouteSegmentNode[] = breakTargets.map(target => ({
    name: target.name,
    type: 'break',
    distanceFromStart: `${Math.round(target.thresholdDistanceMeters / 1000)} km`,
    timeFromStart: formatHours(target.timeFromStartHours)
  }));

  const orderedInterior = [
    ...routeNodes.map((node, index) => ({ node, distanceMeters: selectedBoundaries[index].distanceMeters, order: 0 })),
    ...breakNodes.map((node, index) => ({ node, distanceMeters: breakTargets[index].thresholdDistanceMeters, order: 1 }))
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
      timeOffsetHours: elapsedAtDrivingHours(schedule, drivingHoursAtNode)
    };
  });

  return { routeSchematic, weatherCheckpoints, breakTargets };
}

function timeToMinutes(value: string): number {
  const match = value.match(/(\d+)\s*sa\s*(\d+)\s*dk/i);
  return match ? Number(match[1]) * 60 + Number(match[2]) : Number.POSITIVE_INFINITY;
}
