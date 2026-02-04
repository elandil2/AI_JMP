/**
 * Google Maps Directions API Service
 * Direct API calls for accurate route data
 */

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

  try {
    const response = await fetch(`${baseUrl}?${params.toString()}`);
    const data = await response.json();

    if (data.status !== "OK") {
      console.error("Google Maps API error:", data.status, data.error_message);
      return null;
    }

    const route = data.routes[0];
    const leg = route.legs[0];

    // Parse steps for detailed directions
    const steps: DirectionStep[] = leg.steps.map((step: any) => ({
      instruction: step.html_instructions?.replace(/<[^>]*>/g, "") || "",
      distance: step.distance?.text || "",
      duration: step.duration?.text || "",
      maneuver: step.maneuver,
    }));

    const result: DirectionsResult = {
      distance: {
        text: leg.distance.text,
        value: leg.distance.value,
      },
      duration: {
        text: leg.duration.text,
        value: leg.duration.value,
      },
      durationInTraffic: leg.duration_in_traffic ? {
        text: leg.duration_in_traffic.text,
        value: leg.duration_in_traffic.value,
      } : undefined,
      startAddress: leg.start_address,
      endAddress: leg.end_address,
      summary: route.summary || "",
      steps,
      polyline: route.overview_polyline?.points || "",
      warnings: route.warnings || [],
    };

    console.log(`Google Maps API: Distance = ${result.distance.text}, Duration = ${result.duration.text}`);

    return result;

  } catch (error) {
    console.error("Failed to call Google Maps Directions API:", error);
    return null;
  }
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
  let remainingDrive = durationHours;
  let totalBreakMinutes = 0;
  let breakCount = 0;
  let dailyRestCount = 0;

  // Track consecutive driving within a "day"
  let currentDailyDrive = 0;

  // Simulation step: 0.1 hour
  const step = 0.1;

  // Constants
  const MAX_CONTINUOUS_DRIVE = 4.5;
  const MAX_DAILY_DRIVE = 9.0;

  // Durations in minutes
  const BREAK_MINUTES = 45;
  const DAILY_REST_MINUTES = 11 * 60; // 11 hours

  let continuousDrive = 0;

  while (remainingDrive > 0) {
    // Drive for a step
    let driveTime = Math.min(step, remainingDrive);
    remainingDrive -= driveTime;
    currentDailyDrive += driveTime;
    continuousDrive += driveTime;

    // Check for Continuous Break (4.5h)
    if (continuousDrive >= MAX_CONTINUOUS_DRIVE - 0.01) { // epsilon for float
      // If we also hit daily limit, the daily rest supersedes the 45m break
      if (currentDailyDrive >= MAX_DAILY_DRIVE - 0.01) {
        // This will be handled by the daily limit check below
      } else {
        // Take 45m break
        totalBreakMinutes += BREAK_MINUTES;
        breakCount++;
        continuousDrive = 0; // Reset continuous drive counter
      }
    }

    // Check for Daily Rest (9h)
    if (currentDailyDrive >= MAX_DAILY_DRIVE - 0.01) {
      // Take 11h rest
      totalBreakMinutes += DAILY_REST_MINUTES;
      dailyRestCount++;
      currentDailyDrive = 0; // Reset daily counter
      continuousDrive = 0;   // Reset continuous too
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
