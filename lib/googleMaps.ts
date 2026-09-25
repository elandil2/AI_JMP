/**
 * Google Maps Directions API Service
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

function decodeInstructionText(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ').trim();
}

function parseRoadLabel(htmlInstruction: string): string | undefined {
  const boldLabels = [...htmlInstruction.matchAll(/<b\b[^>]*>(.*?)<\/b>/gi)]
    .map(match => decodeInstructionText(match[1].replace(/<[^>]*>/g, ' ')))
    .filter(label => label && !/^(north(?:east|west)?|south(?:east|west)?|east|west|kuzey|güney|doğu|batı|right|left|straight|sağ|sol|düz|yönünde|toward|towards)$/i.test(label));
  if (!boldLabels.length) return undefined;

  const routeCodes = boldLabels.filter(label => /\b(?:D|E|O|K|A)\s*[-/]?\s*\d{1,4}\b/i.test(label));
  const roadNames = boldLabels.filter(label => /(?:yolu|otoyolu|çevre yolu|cad\.?|caddesi|bulvarı|bulvar|sokağı|köprüsü|tüneli|highway|motorway|road|street)\b/i.test(label));
  const selected = routeCodes.length ? routeCodes : roadNames;
  if (!selected.length) return undefined;
  return [...new Set(selected)].join(' / ').slice(0, 120);
}

/**
 * Calls Google Maps Directions API with coordinates
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

  const baseUrl = "https://maps.googleapis.com/maps/api/directions/json";

  // Build query params
  const params = new URLSearchParams({
    origin: originCoords,
    destination: destCoords,
    key: apiKey,
    mode: options.mode || "driving",
    language: "tr",  // Turkish language for instructions
    units: "metric",
    // Truck-specific: avoid ferries typically
    avoid: options.useTolls === false ? "tolls|ferries" : "ferries",
  });

  // Add waypoint if specified
  if (options.stopCoords) {
    params.set("waypoints", options.stopCoords);
  }

  // Add departure time for traffic estimation
  // Add departure time for traffic estimation
  if (options.departureTime) {
    const now = Date.now();
    // Google Maps API requires departure_time to be in the future (or very close to now)
    // If user provided a time in the past (e.g. latency), clamp it to now.
    const depTime = options.departureTime.getTime() < now ? now : options.departureTime.getTime();
    params.set("departure_time", Math.floor(depTime / 1000).toString());
  }

  const startedAt = Date.now();
  let result: DirectionsResult | null = null;
  let failure: string | undefined;
  let failureCode: string | undefined;
  try {
    const response = await fetch(`${baseUrl}?${params.toString()}`, { signal: AbortSignal.timeout(20000) });
    const data: unknown = await response.json();

    if (!response.ok || typeof data !== 'object' || data === null || (data as { status?: unknown }).status !== "OK") {
      const status = typeof data === 'object' && data !== null && typeof (data as { status?: unknown }).status === 'string'
        ? (data as { status: string }).status
        : 'invalid response';
      console.error("Google Maps API error:", status);
      failure = `Directions request failed: ${status}`;
      failureCode = status;
    } else {
      const route = (data as { routes?: any[] }).routes?.[0];
      if (!route?.legs?.length) throw new Error('Directions response did not contain a route leg.');
      const legs = route.legs;
      if (legs.some((leg: any) => !Number.isFinite(leg.distance?.value) || leg.distance.value <= 0 || !Number.isFinite(leg.duration?.value) || leg.duration.value <= 0)) throw new Error('Directions response has invalid distance or duration.');
      const distance = legs.reduce((sum: number, leg: any) => sum + leg.distance.value, 0);
      const duration = legs.reduce((sum: number, leg: any) => sum + leg.duration.value, 0);
      const trafficDuration = legs.every((leg: any) => Number.isFinite(leg.duration_in_traffic?.value) && leg.duration_in_traffic.value > 0)
        ? legs.reduce((sum: number, leg: any) => sum + leg.duration_in_traffic.value, 0) : undefined;
      const durationText = (seconds: number) => { const minutes = Math.round(seconds / 60); return `${Math.floor(minutes / 60)} sa ${minutes % 60} dk`; };
      const steps: DirectionStep[] = legs.flatMap((leg: any) => (leg.steps ?? []).map((step: any) => {
        const htmlInstruction = typeof step.html_instructions === 'string' ? step.html_instructions : '';
        const distanceMeters = Number.isFinite(step.distance?.value) && step.distance.value >= 0 ? step.distance.value : undefined;
        const durationSeconds = Number.isFinite(step.duration?.value) && step.duration.value >= 0 ? step.duration.value : undefined;
        return {
          instruction: decodeInstructionText(htmlInstruction), distance: step.distance?.text || '', duration: step.duration?.text || '',
          ...(distanceMeters === undefined ? {} : { distanceMeters }),
          ...(durationSeconds === undefined ? {} : { durationSeconds }),
          ...(parseRouteCoordinate(step.start_location) ? { startLocation: parseRouteCoordinate(step.start_location) } : {}),
          ...(parseRouteCoordinate(step.end_location) ? { endLocation: parseRouteCoordinate(step.end_location) } : {}),
          ...(parseRoadLabel(htmlInstruction) ? { roadLabel: parseRoadLabel(htmlInstruction) } : {}),
          ...(typeof step.maneuver === 'string' ? { maneuver: step.maneuver } : {})
        };
      }));
      const startLocation = parseRouteCoordinate(legs[0].start_location);
      const endLocation = parseRouteCoordinate(legs.at(-1).end_location);
      result = {
        distance: { text: `${Math.round(distance / 1000)} km`, value: distance }, duration: { text: durationText(duration), value: duration },
        durationInTraffic: trafficDuration === undefined ? undefined : { text: durationText(trafficDuration), value: trafficDuration },
        startAddress: legs[0].start_address, endAddress: legs.at(-1).end_address,
        ...(startLocation ? { startLocation } : {}), ...(endLocation ? { endLocation } : {}),
        summary: route.summary || "", steps, polyline: route.overview_polyline?.points || "", warnings: route.warnings || []
      };
      console.log(`Google Maps API: Distance = ${result.distance.text}, Duration = ${result.duration.text}`);
    }

  } catch (error) {
    console.error("Failed to call Google Maps Directions API:", error);
    failure = error instanceof Error ? error.message : 'Directions request failed.';
    failureCode = 'maps_request_error';
  }
  // Deliberately outside the request try/catch: telemetry persistence failure is never hidden or retried.
  await emitUsage(options.onUsage, {
    provider: 'maps', stage: 'directions', model: 'directions', outcome: result ? 'success' : 'error', durationMs: Date.now() - startedAt,
    estimatedCost: estimatedDirectionsCost(Boolean(options.departureTime)), mapsCostUsd: options.departureTime ? 0.01 : 0.005, routeSource: result ? 'maps' : 'unavailable', errorCode: failureCode, error: failure
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
