/**
 * Google Maps Routes API Service
 * Direct API calls for accurate route data
 */

import type { GenerationEvent } from '../types';
import type { RouteCoordinate } from './routeGeometry';
import { estimatedDirectionsCost } from './usageCost';

export interface DirectionsResult {
  distance: {
    text: string;      // "1,534 km"
    value: number;     // meters
  };
  duration: {
    text: string;      // "18 saat 45 dk"
    value: number;     // seconds
  };
  durationInTraffic?: {
    text: string;
    value: number;
  };
  /** Routes API returns no formatted address; these hold the requested "lat,lng". */
  startAddress: string;
  endAddress: string;
  startLocation?: RouteCoordinate;
  endLocation?: RouteCoordinate;
  summary: string;     // Main road names, e.g. "D100/E-80"
  steps: DirectionStep[];
  polyline: string;    // Encoded polyline for map display
  warnings: string[];
}

export interface DirectionStep {
  instruction: string;
  distance: string;
  duration: string;
  distanceMeters?: number;
  durationSeconds?: number;
  startLocation?: RouteCoordinate;
  endLocation?: RouteCoordinate;
  /** Best-effort road name/code preserved from the Maps instruction markup. */
  roadLabel?: string;
  maneuver?: string;
}

export interface DirectionsOptions {
  useTolls?: boolean;
  stopCoords?: string;    // "lat,lng" for waypoint
  departureTime?: Date;
  mode?: 'driving' | 'walking' | 'bicycling' | 'transit';
  onUsage?: (event: GenerationEvent) => Promise<void> | void;
}

export const MIN_TRUCK_PLANNING_SPEED_KMH = 60;
export const MAX_TRUCK_PLANNING_SPEED_KMH = 65;
export const DEFAULT_TRUCK_PLANNING_SPEED_KMH = 60;

const emitUsage = async (callback: DirectionsOptions['onUsage'], event: GenerationEvent) => {
  if (callback) await callback(event);
};

function parseRouteCoordinate(value: unknown): RouteCoordinate | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const location = value as { lat?: unknown; lng?: unknown };
  if (typeof location.lat !== 'number' || typeof location.lng !== 'number'
    || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return undefined;
  const lat = location.lat as number;
  const lng = location.lng as number;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  return { lat, lng };
}

const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const ROUTES_FIELD_MASK = [
  'routes.description', 'routes.warnings', 'routes.polyline.encodedPolyline',
  'routes.legs.distanceMeters', 'routes.legs.duration', 'routes.legs.staticDuration',
  'routes.legs.startLocation', 'routes.legs.endLocation',
  'routes.legs.steps.distanceMeters', 'routes.legs.steps.staticDuration',
  'routes.legs.steps.startLocation', 'routes.legs.steps.endLocation',
  'routes.legs.steps.navigationInstruction', 'routes.legs.steps.localizedValues'
].join(',');
const TRAVEL_MODES = { driving: 'DRIVE', walking: 'WALK', bicycling: 'BICYCLE', transit: 'TRANSIT' } as const;

function toWaypoint(coords: string) {
  const [latitude, longitude] = coords.split(',').map(part => Number(part.trim()));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error(`Invalid coordinate: ${coords}`);
  return { location: { latLng: { latitude, longitude } } };
}

/** Routes API durations are strings such as "16879s". */
function parseDurationSeconds(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const match = /^(\d+(?:\.\d+)?)s$/.exec(value);
  return match ? Number(match[1]) : undefined;
}

function parseRoutesLocation(value: unknown): RouteCoordinate | undefined {
  const latLng = (value as { latLng?: { latitude?: unknown; longitude?: unknown } } | undefined)?.latLng;
  return parseRouteCoordinate({ lat: latLng?.latitude, lng: latLng?.longitude });
}

/** Routes API instructions are plain text, so road codes and names are matched directly. */
function parsePlainRoadLabel(instruction: string): string | undefined {
  const routeCodes = [...instruction.matchAll(/\b[DEOKA]-?\d{1,4}\b/g)].map(match => match[0]);
  const roadNames = routeCodes.length ? [] : [...instruction.matchAll(/(?:[A-ZÇĞİÖŞÜ][\p{L}\d.'-]*\s+)+(?:Otoyolu|Çevre Yolu|Yolu|Caddesi|Cad\.|Bulvarı|Köprüsü|Tüneli)/gu)]
    .map(match => match[0].trim());
  const selected = routeCodes.length ? routeCodes : roadNames;
  if (!selected.length) return undefined;
  return [...new Set(selected)].join(' / ').slice(0, 120);
}

function routesErrorMessage(data: unknown, httpStatus: number): { code: string; message: string } {
  const error = (data as { error?: { status?: unknown; message?: unknown } } | null)?.error;
  return {
    code: typeof error?.status === 'string' ? error.status : `HTTP_${httpStatus}`,
    message: typeof error?.message === 'string' ? error.message : 'invalid response'
  };
}

/**
 * Calls Google Maps Routes API (computeRoutes) with coordinates.
 * Directions API (Legacy) cannot be enabled on new Google Cloud projects.
 */
export async function getDirections(
  originCoords: string,     // "41.0082,28.9784"
  destCoords: string,       // "38.5012,43.4089"
  options: DirectionsOptions = {}
): Promise<DirectionsResult | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    console.warn("GOOGLE_MAPS_API_KEY not set - falling back to Gemini estimation");
    await emitUsage(options.onUsage, {
      provider: 'maps', stage: 'directions', model: 'directions', outcome: 'error', durationMs: 0,
      estimatedCost: { currency: 'USD', pricingVersion: 'No Maps request', directionsUsd: 0, totalUsd: 0 },
      mapsCostUsd: 0, routeSource: 'unavailable', errorCode: 'maps_key_missing', error: 'GOOGLE_MAPS_API_KEY is not configured.'
    });
    return null;
  }

  const travelMode = TRAVEL_MODES[options.mode || 'driving'];
  // Traffic-aware routing (billed as Compute Routes Pro) only when a departure time is requested.
  const trafficAware = Boolean(options.departureTime) && travelMode === 'DRIVE';

  const startedAt = Date.now();
  let result: DirectionsResult | null = null;
  let failure: string | undefined;
  let failureCode: string | undefined;
  try {
    const body: Record<string, unknown> = {
      origin: toWaypoint(originCoords),
      destination: toWaypoint(destCoords),
      travelMode,
      languageCode: 'tr',  // Turkish language for instructions
      units: 'METRIC',
      // Truck-specific: avoid ferries typically
      routeModifiers: { avoidFerries: true, ...(options.useTolls === false ? { avoidTolls: true } : {}) },
      ...(options.stopCoords ? { intermediates: [toWaypoint(options.stopCoords)] } : {}),
      ...(travelMode === 'DRIVE' ? { routingPreference: trafficAware ? 'TRAFFIC_AWARE' : 'TRAFFIC_UNAWARE' } : {})
    };
    // Routes API rejects past departure times; omitting it means "now".
    if (trafficAware && options.departureTime!.getTime() > Date.now() + 60_000) {
      body.departureTime = options.departureTime!.toISOString();
    }

    const response = await fetch(ROUTES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': ROUTES_FIELD_MASK },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000)
    });
    const data: unknown = await response.json();
    const route = (data as { routes?: any[] } | null)?.routes?.[0];

    if (!response.ok || !route) {
      const { code, message } = response.ok
        ? { code: 'ZERO_RESULTS', message: 'Routes API returned no route.' }
        : routesErrorMessage(data, response.status);
      console.error("Google Maps Routes API error:", code, message);
      failure = `Routes request failed: ${code} - ${message}`;
      failureCode = code;
    } else {
      if (!route.legs?.length) throw new Error('Routes response did not contain a route leg.');
      const legs = route.legs.map((leg: any) => ({
        ...leg,
        distance: leg.distanceMeters,
        staticSeconds: parseDurationSeconds(leg.staticDuration) ?? parseDurationSeconds(leg.duration),
        trafficSeconds: parseDurationSeconds(leg.duration)
      }));
      if (legs.some((leg: any) => !Number.isFinite(leg.distance) || leg.distance <= 0 || !Number.isFinite(leg.staticSeconds) || leg.staticSeconds <= 0)) throw new Error('Routes response has invalid distance or duration.');
      const distance = legs.reduce((sum: number, leg: any) => sum + leg.distance, 0);
      const duration = legs.reduce((sum: number, leg: any) => sum + leg.staticSeconds, 0);
      const trafficDuration = trafficAware && legs.every((leg: any) => Number.isFinite(leg.trafficSeconds) && leg.trafficSeconds > 0)
        ? legs.reduce((sum: number, leg: any) => sum + leg.trafficSeconds, 0) : undefined;
      const durationText = (seconds: number) => { const minutes = Math.round(seconds / 60); return `${Math.floor(minutes / 60)} sa ${minutes % 60} dk`; };
      const steps: DirectionStep[] = legs.flatMap((leg: any) => (leg.steps ?? []).map((step: any) => {
        const instruction = typeof step.navigationInstruction?.instructions === 'string'
          ? step.navigationInstruction.instructions.replace(/\s+/g, ' ').trim() : '';
        const distanceMeters = Number.isFinite(step.distanceMeters) && step.distanceMeters >= 0 ? step.distanceMeters : undefined;
        const durationSeconds = parseDurationSeconds(step.staticDuration);
        const startLocation = parseRoutesLocation(step.startLocation);
        const endLocation = parseRoutesLocation(step.endLocation);
        const roadLabel = parsePlainRoadLabel(instruction);
        const maneuver = step.navigationInstruction?.maneuver;
        return {
          instruction, distance: step.localizedValues?.distance?.text || '', duration: step.localizedValues?.staticDuration?.text || '',
          ...(distanceMeters === undefined ? {} : { distanceMeters }),
          ...(durationSeconds === undefined ? {} : { durationSeconds }),
          ...(startLocation ? { startLocation } : {}),
          ...(endLocation ? { endLocation } : {}),
          ...(roadLabel ? { roadLabel } : {}),
          ...(typeof maneuver === 'string' ? { maneuver: maneuver.toLowerCase().replace(/_/g, '-') } : {})
        };
      }));
      const startLocation = parseRoutesLocation(legs[0].startLocation);
      const endLocation = parseRoutesLocation(legs.at(-1).endLocation);
      result = {
        distance: { text: `${Math.round(distance / 1000)} km`, value: distance }, duration: { text: durationText(duration), value: duration },
        durationInTraffic: trafficDuration === undefined ? undefined : { text: durationText(trafficDuration), value: trafficDuration },
        startAddress: originCoords, endAddress: destCoords,
        ...(startLocation ? { startLocation } : {}), ...(endLocation ? { endLocation } : {}),
        summary: route.description || "", steps, polyline: route.polyline?.encodedPolyline || "", warnings: route.warnings || []
      };
      console.log(`Google Maps Routes API: Distance = ${result.distance.text}, Duration = ${result.duration.text}`);
    }

  } catch (error) {
    console.error("Failed to call Google Maps Routes API:", error);
    failure = error instanceof Error ? error.message : 'Routes request failed.';
    failureCode = 'maps_request_error';
  }
  // Deliberately outside the request try/catch: telemetry persistence failure is never hidden or retried.
  await emitUsage(options.onUsage, {
    provider: 'maps', stage: 'directions', model: 'directions', outcome: result ? 'success' : 'error', durationMs: Date.now() - startedAt,
    estimatedCost: estimatedDirectionsCost(trafficAware), mapsCostUsd: trafficAware ? 0.01 : 0.005, routeSource: result ? 'maps' : 'unavailable', errorCode: failureCode, error: failure
  });
  return result;
}

/**
 * Estimate truck driving time from route distance using a configurable average
 * planning speed. This is not a vehicle-specific Google route or a legal/actual
 * driver-hours calculation.
 */
export function calculateTruckDuration(
  distanceMeters: number,
  planningSpeedKmh = DEFAULT_TRUCK_PLANNING_SPEED_KMH
): {
  hours: number;
  text: string;
} {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) {
    throw new Error('Distance must be a non-negative number.');
  }
  if (!Number.isFinite(planningSpeedKmh) || planningSpeedKmh < MIN_TRUCK_PLANNING_SPEED_KMH || planningSpeedKmh > MAX_TRUCK_PLANNING_SPEED_KMH) {
    throw new Error(`Truck planning speed must be between ${MIN_TRUCK_PLANNING_SPEED_KMH} and ${MAX_TRUCK_PLANNING_SPEED_KMH} km/h.`);
  }

  const distanceKm = distanceMeters / 1000;
  const hours = distanceKm / planningSpeedKmh;
  const totalMinutes = Math.round(hours * 60);
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return {
    hours,
    text: `${wholeHours} sa ${minutes} dk`,
  };
}

/**
 * Calculate required breaks based on tachograph rules
 * - 4.5 hours driving → 45 min break
 * - 9 hours max daily driving
 */
/**
 * Calculate required breaks based on tachograph rules
 * - 4.5 hours driving → 45 min break
 * - 9 hours max daily driving → 11 hours daily rest
 */
export function calculateBreaks(durationHours: number): {
  breakCount: number;
  totalBreakMinutes: number;
  description: string;
} {
  if (!Number.isFinite(durationHours) || durationHours < 0) throw new Error('Driving duration must be a non-negative number.');
  let remainingDrive = durationHours;
  let totalBreakMinutes = 0;
  let breakCount = 0;
  let dailyRestCount = 0;

  let currentDailyDrive = 0;

  // Constants
  const MAX_CONTINUOUS_DRIVE = 4.5;
  const MAX_DAILY_DRIVE = 9.0;

  // Durations in minutes
  const BREAK_MINUTES = 45;
  const DAILY_REST_MINUTES = 11 * 60; // 11 hours

  while (remainingDrive > 0.000001) {
    const driveTime = Math.min(MAX_CONTINUOUS_DRIVE, MAX_DAILY_DRIVE - currentDailyDrive, remainingDrive);
    remainingDrive -= driveTime;
    currentDailyDrive += driveTime;
    // Arrival ends the journey; never append an overnight rest after arrival.
    if (remainingDrive <= 0.000001) break;
    if (currentDailyDrive >= MAX_DAILY_DRIVE - 0.000001) {
      totalBreakMinutes += DAILY_REST_MINUTES;
      dailyRestCount++;
      currentDailyDrive = 0;
    } else {
      totalBreakMinutes += BREAK_MINUTES;
      breakCount++;
    }
  }

  // Formatting description
  const parts = [];
  if (breakCount > 0) parts.push(`${breakCount} x 45dk mola`);
  if (dailyRestCount > 0) parts.push(`${dailyRestCount} x 11sa dinlenme`);

  const desc = parts.length > 0
    ? `${parts.join(" + ")} (Takograf)`
    : "Mola gerekmez";

  return {
    breakCount: breakCount + dailyRestCount,
    totalBreakMinutes,
    description: desc,
  };
}
