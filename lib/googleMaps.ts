/**
 * Google Maps Directions API Service
 * Direct API calls for accurate route data
 */

import type { GenerationEvent } from '../types';
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
  summary: string;     // Main road names, e.g. "D100/E-80"
  steps: DirectionStep[];
  polyline: string;    // Encoded polyline for map display
  warnings: string[];
}

export interface DirectionStep {
  instruction: string;
  distance: string;
  duration: string;
  maneuver?: string;
}

export interface DirectionsOptions {
  useTolls?: boolean;
  stopCoords?: string;    // "lat,lng" for waypoint
  departureTime?: Date;
  mode?: 'driving' | 'walking' | 'bicycling' | 'transit';
  onUsage?: (event: GenerationEvent) => Promise<void> | void;
}

const emitUsage = async (callback: DirectionsOptions['onUsage'], event: GenerationEvent) => {
  if (callback) await callback(event);
};

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
      const steps: DirectionStep[] = legs.flatMap((leg: any) => (leg.steps ?? []).map((step: any) => ({
        instruction: step.html_instructions?.replace(/<[^>]*>/g, "") || "", distance: step.distance?.text || "", duration: step.duration?.text || "", maneuver: step.maneuver
      })));
      result = {
        distance: { text: `${Math.round(distance / 1000)} km`, value: distance }, duration: { text: durationText(duration), value: duration },
        durationInTraffic: trafficDuration === undefined ? undefined : { text: durationText(trafficDuration), value: trafficDuration },
        startAddress: legs[0].start_address, endAddress: legs.at(-1).end_address, summary: route.summary || "", steps, polyline: route.overview_polyline?.points || "", warnings: route.warnings || []
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
 * Calculate truck-adjusted duration
 * Trucks are slower than cars - apply 1 min/km rule for heavy vehicles
 */
export function calculateTruckDuration(distanceMeters: number): {
  hours: number;
  text: string;
} {
  const distanceKm = distanceMeters / 1000;
  // Truck speed: ~1 min/km = 60 km/h average
  const totalMinutes = distanceKm;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);

  return {
    hours: totalMinutes / 60,
    text: `${hours} sa ${minutes} dk`,
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
