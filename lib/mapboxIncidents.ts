import {
  checkCoordinateAgainstRoute,
  decodeEncodedPolyline,
  type RouteCoordinate,
} from './routeGeometry';

export const MAPBOX_DIRECTIONS_SOURCE_URL = 'https://docs.mapbox.com/api/navigation/directions/';
export const MAPBOX_INCIDENT_SCOPE =
  'Mapbox driving-traffic events are checked against the supplied Google route geometry and returned only as nearby corridor candidates. Mapbox reports its own automotive route; a corridor match does not prove the event is on the Google route, in its direction, or suitable for trucks. Unsupported traffic geographies may fall back to ordinary driving, so an empty response does not establish live coverage or that no events exist.' as const;

const MAPBOX_API_URL = 'https://api.mapbox.com/directions/v5/mapbox/driving-traffic';
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_TIMEOUT_MS = 30_000;

export type MapboxIncidentType =
  | 'accident'
  | 'congestion'
  | 'construction'
  | 'disabled_vehicle'
  | 'lane_restriction'
  | 'mass_transit'
  | 'miscellaneous'
  | 'other_news'
  | 'planned_event'
  | 'road_closure'
  | 'road_hazard'
  | 'weather'
  | 'unknown';

export type MapboxIncidentStatus = 'active' | 'planned' | 'closed' | 'ended' | 'unknown';

export interface MapboxTrafficIncident {
  provider: 'Mapbox';
  id: string;
  type: MapboxIncidentType;
  providerType?: string;
  description: string;
  timestamp: string | null;
  startTime: string | null;
  endTime: string | null;
  status: MapboxIncidentStatus;
  closed: boolean;
  affectedRoadNames: string[];
  coordinate: RouteCoordinate;
  geometry?: {
    type: 'LineString';
    /** The Mapbox route segment identified by its incident geometry indices. */
    coordinates: RouteCoordinate[];
  };
  routeProgress: number;
  distanceToGoogleRouteKm: number;
  sourceUrl: typeof MAPBOX_DIRECTIONS_SOURCE_URL;
  caveat: typeof MAPBOX_INCIDENT_SCOPE;
}

export type MapboxIncidentUnavailableReason =
  | 'server_only'
  | 'missing_token'
  | 'invalid_google_route'
  | 'request_timeout'
  | 'request_failed'
  | 'http_error'
  | 'api_error'
  | 'invalid_response';

export type MapboxIncidentUnknownReason = 'no_incidents_returned' | 'no_google_corridor_candidates';

export interface MapboxIncidentCoverage {
  provider: 'Mapbox';
  status: 'available' | 'unknown' | 'unavailable';
  fetchedAt: string;
  sourceUrl: typeof MAPBOX_DIRECTIONS_SOURCE_URL;
  sourceScope: typeof MAPBOX_INCIDENT_SCOPE;
  incidents: MapboxTrafficIncident[];
  /** Raw incident and closure item count before Google-route corridor filtering. */
  providerItemCount: number;
  /** Traffic-annotation coverage on Mapbox's own route, not on the Google route. */
  trafficCoverage?: MapboxTrafficCoverage;
  coverageReason?: MapboxIncidentUnavailableReason | MapboxIncidentUnknownReason;
}

export interface MapboxTrafficCoverage {
  annotatedDistanceKm: number;
  knownDistanceKm: number;
  knownPercent: number;
  moderateDistanceKm: number;
  heavyDistanceKm: number;
  sampleCount: number;
}

export interface MapboxIncidentRequestOptions {
  /** Google Directions overview polyline. Invalid or absent geometry prevents the API call. */
  googleEncodedPolyline: string;
  /** Optional server-side override; normally read from MAPBOX_TOKEN or NEXT_PUBLIC_MAPBOX_TOKEN. */
  token?: string | null;
  /** Injectable network adapter for tests and controlled callers. */
  fetchImpl?: typeof fetch;
  /** Request timeout; clamped to 1–30000 ms. */
  timeoutMs?: number;
  /** Injectable clock for deterministic status and observation timestamps. */
  now?: Date;
}

type MapboxRawIncident = {
  id?: unknown;
  type?: unknown;
  description?: unknown;
  long_description?: unknown;
  creation_time?: unknown;
  start_time?: unknown;
  end_time?: unknown;
  closed?: unknown;
  geometry_index_start?: unknown;
  geometry_index_end?: unknown;
  south?: unknown;
  west?: unknown;
  north?: unknown;
  east?: unknown;
  affected_road_names?: unknown;
};

type MapboxRawClosure = {
  geometry_index_start?: unknown;
  geometry_index_end?: unknown;
};

type MapboxDirectionsResponse = {
  code?: unknown;
  routes?: Array<{
    geometry?: {
      type?: unknown;
      coordinates?: unknown;
    };
    legs?: Array<{
      incidents?: unknown;
      closures?: unknown;
      annotation?: {
        distance?: unknown;
        congestion?: unknown;
        congestion_numeric?: unknown;
      };
    }>;
  }>;
};

const KNOWN_TYPES = new Set<MapboxIncidentType>([
  'accident',
  'congestion',
  'construction',
  'disabled_vehicle',
  'lane_restriction',
  'mass_transit',
  'miscellaneous',
  'other_news',
  'planned_event',
  'road_closure',
  'road_hazard',
  'weather',
]);

function readServerToken(): string | undefined {
  if (typeof process === 'undefined') return undefined;
  // Dynamic indexing avoids baking NEXT_PUBLIC_MAPBOX_TOKEN into a client bundle.
  const env = process.env as Record<string, string | undefined>;
  const publicTokenName = ['NEXT', 'PUBLIC', 'MAPBOX', 'TOKEN'].join('_');
  return env.MAPBOX_TOKEN?.trim() || env[publicTokenName]?.trim() || undefined;
}

function unavailable(
  fetchedAt: string,
  reason: MapboxIncidentUnavailableReason,
  providerItemCount = 0,
): MapboxIncidentCoverage {
  return {
    provider: 'Mapbox',
    status: 'unavailable',
    fetchedAt,
    sourceUrl: MAPBOX_DIRECTIONS_SOURCE_URL,
    sourceScope: MAPBOX_INCIDENT_SCOPE,
    incidents: [],
    providerItemCount,
    coverageReason: reason,
  };
}

function unknownCoverage(
  fetchedAt: string,
  reason: MapboxIncidentUnknownReason,
  providerItemCount = 0,
  trafficCoverage?: MapboxTrafficCoverage,
): MapboxIncidentCoverage {
  return {
    provider: 'Mapbox',
    status: 'unknown',
    fetchedAt,
    sourceUrl: MAPBOX_DIRECTIONS_SOURCE_URL,
    sourceScope: MAPBOX_INCIDENT_SCOPE,
    incidents: [],
    providerItemCount,
    trafficCoverage,
    coverageReason: reason,
  };
}

/** Measures how much of the Mapbox route actually has traffic annotation values. */
function readTrafficCoverage(legs: NonNullable<NonNullable<MapboxDirectionsResponse['routes']>[number]['legs']>): MapboxTrafficCoverage | undefined {
  let annotatedMeters = 0;
  let knownMeters = 0;
  let moderateMeters = 0;
  let heavyMeters = 0;
  let sampleCount = 0;
  for (const leg of legs) {
    const distances = Array.isArray(leg.annotation?.distance) ? leg.annotation.distance : [];
    const levels = Array.isArray(leg.annotation?.congestion) ? leg.annotation.congestion : [];
    const numeric = Array.isArray(leg.annotation?.congestion_numeric) ? leg.annotation.congestion_numeric : [];
    for (let index = 0; index < distances.length; index++) {
      const meters = distances[index];
      if (typeof meters !== 'number' || !Number.isFinite(meters) || meters < 0) continue;
      annotatedMeters += meters;
      sampleCount++;
      const score = numeric[index];
      const level = levels[index];
      if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100 ||
          !['low', 'moderate', 'heavy', 'severe'].includes(level)) continue;
      knownMeters += meters;
      if (level === 'moderate') moderateMeters += meters;
      if (level === 'heavy' || level === 'severe') heavyMeters += meters;
    }
  }
  if (annotatedMeters <= 0) return undefined;
  const roundKm = (meters: number) => Math.round(meters / 100) / 10;
  return {
    annotatedDistanceKm: roundKm(annotatedMeters), knownDistanceKm: roundKm(knownMeters),
    knownPercent: Math.round(knownMeters / annotatedMeters * 1000) / 10,
    moderateDistanceKm: roundKm(moderateMeters), heavyDistanceKm: roundKm(heavyMeters), sampleCount
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidCoordinate(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length >= 2 &&
    typeof value[0] === 'number' && Number.isFinite(value[0]) && Math.abs(value[0]) <= 180 &&
    typeof value[1] === 'number' && Number.isFinite(value[1]) && Math.abs(value[1]) <= 90;
}

function mapboxCoordinates(value: unknown): RouteCoordinate[] {
  if (!Array.isArray(value)) return [];
  const coordinates: RouteCoordinate[] = [];
  for (const candidate of value) {
    if (!isValidCoordinate(candidate)) return [];
    coordinates.push({ lat: candidate[1], lng: candidate[0] });
  }
  return coordinates.length >= 2 ? coordinates : [];
}

function getIncidentPath(
  item: MapboxRawIncident | MapboxRawClosure,
  routeGeometry: RouteCoordinate[],
): RouteCoordinate[] {
  const start = item.geometry_index_start;
  const end = item.geometry_index_end;
  if (
    typeof start === 'number' && Number.isInteger(start) && start >= 0 && start < routeGeometry.length
  ) {
    const boundedEnd = typeof end === 'number' && Number.isInteger(end) && end >= start && end < routeGeometry.length
      ? end
      : start;
    return routeGeometry.slice(start, boundedEnd + 1);
  }
  return [];
}

function getBoundingBoxCenter(item: MapboxRawIncident): RouteCoordinate | undefined {
  const { south, west, north, east } = item;
  if (![south, west, north, east].every((value) => typeof value === 'number' && Number.isFinite(value))) {
    return undefined;
  }
  const values = [south, west, north, east] as number[];
  const [boxSouth, boxWest, boxNorth, boxEast] = values;
  if (boxSouth < -90 || boxNorth > 90 || boxSouth > boxNorth || boxWest < -180 || boxEast > 180 || boxWest > boxEast) {
    return undefined;
  }
  return { lat: (boxSouth + boxNorth) / 2, lng: (boxWest + boxEast) / 2 };
}

function safeIsoTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  return value;
}

function incidentStatus(startTime: string | null, endTime: string | null, closed: boolean, now: Date): MapboxIncidentStatus {
  if (closed) return 'closed';
  const start = startTime ? Date.parse(startTime) : Number.NaN;
  const end = endTime ? Date.parse(endTime) : Number.NaN;
  if (Number.isFinite(start) && start > now.getTime()) return 'planned';
  if (Number.isFinite(end) && end < now.getTime()) return 'ended';
  if (Number.isFinite(start) || Number.isFinite(end)) return 'active';
  return 'unknown';
}

function parseIncidentType(type: unknown): { type: MapboxIncidentType; providerType?: string } {
  if (typeof type !== 'string' || !type.trim()) return { type: 'unknown' };
  const normalized = type.trim().toLowerCase();
  return KNOWN_TYPES.has(normalized as MapboxIncidentType)
    ? { type: normalized as MapboxIncidentType }
    : { type: 'unknown', providerType: type.trim() };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && !!item.trim()) : [];
}

function candidateFromItem(
  item: MapboxRawIncident | MapboxRawClosure,
  routeGeometry: RouteCoordinate[],
  googleEncodedPolyline: string,
  now: Date,
  fetchedAt: string,
  closureAnnotation = false,
): MapboxTrafficIncident | undefined {
  const path = getIncidentPath(item, routeGeometry);
  if (path.length === 0 && !closureAnnotation && isRecord(item)) {
    const center = getBoundingBoxCenter(item as MapboxRawIncident);
    if (center) path.push(center);
  }
  if (path.length === 0) return undefined;

  const checks = path.map((coordinate) => ({
    coordinate,
    check: checkCoordinateAgainstRoute(googleEncodedPolyline, `${coordinate.lat},${coordinate.lng}`),
  }));
  const nearestCandidate = checks
    .filter(({ check }) => check.status === 'corridor_candidate')
    .sort((a, b) => (a.check.distanceKm ?? Number.POSITIVE_INFINITY) - (b.check.distanceKm ?? Number.POSITIVE_INFINITY))[0];
  if (!nearestCandidate) return undefined;

  const raw = item as MapboxRawIncident;
  const typed = closureAnnotation ? { type: 'road_closure' as const } : parseIncidentType(raw.type);
  const closed = closureAnnotation || raw.closed === true || typed.type === 'road_closure';
  const startTime = closureAnnotation ? null : safeIsoTimestamp(raw.start_time);
  const endTime = closureAnnotation ? null : safeIsoTimestamp(raw.end_time);
  const creationTime = closureAnnotation ? null : safeIsoTimestamp(raw.creation_time);
  const indexes = `${String(item.geometry_index_start ?? 'x')}-${String(item.geometry_index_end ?? item.geometry_index_start ?? 'x')}`;
  const providerId = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : undefined;
  const id = closureAnnotation ? `mapbox-closure-${indexes}` : providerId ?? `mapbox-${typed.type}-${indexes}`;
  const description = closureAnnotation
    ? 'Mapbox reported a live traffic closure on its route.'
    : (typeof raw.description === 'string' && raw.description.trim()) ||
      (typeof raw.long_description === 'string' && raw.long_description.trim()) ||
      'Mapbox driving-traffic incident';
  const geometry = path.length >= 2 ? { type: 'LineString' as const, coordinates: path } : undefined;

  return {
    provider: 'Mapbox',
    id,
    ...typed,
    description,
    timestamp: creationTime ?? startTime,
    startTime,
    endTime,
    status: incidentStatus(startTime, endTime, closed, now),
    closed,
    affectedRoadNames: closureAnnotation ? [] : stringList(raw.affected_road_names),
    coordinate: nearestCandidate.coordinate,
    ...(geometry ? { geometry } : {}),
    routeProgress: nearestCandidate.check.progress ?? 0,
    distanceToGoogleRouteKm: nearestCandidate.check.distanceKm ?? 0,
    sourceUrl: MAPBOX_DIRECTIONS_SOURCE_URL,
    caveat: MAPBOX_INCIDENT_SCOPE,
  };
}

function normalizeRawItems(value: unknown): MapboxRawIncident[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord) as MapboxRawIncident[];
}

function normalizeRawClosures(value: unknown): MapboxRawClosure[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord) as MapboxRawClosure[];
}

/**
 * Retrieves current Mapbox driving-traffic incidents and closure annotations.
 * Results are only route-corridor candidates relative to Google's encoded route.
 * A successful empty provider response is coverage-unavailable, never a claim
 * that the corridor has no incidents.
 */
export async function retrieveMapboxDrivingIncidents(
  options: MapboxIncidentRequestOptions,
): Promise<MapboxIncidentCoverage> {
  const requestedAt = options.now && Number.isFinite(options.now.getTime()) ? options.now : new Date();
  const fetchedAt = requestedAt.toISOString();
  if (typeof window !== 'undefined') return unavailable(fetchedAt, 'server_only');

  const googlePath = decodeEncodedPolyline(options.googleEncodedPolyline);
  if (googlePath.length < 2) return unavailable(fetchedAt, 'invalid_google_route');

  const token = options.token === null ? undefined : options.token?.trim() || readServerToken();
  if (!token) return unavailable(fetchedAt, 'missing_token');

  const origin = googlePath[0];
  const destination = googlePath[googlePath.length - 1];
  const url = new URL(`${MAPBOX_API_URL}/${origin.lng},${origin.lat};${destination.lng},${destination.lat}`);
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('overview', 'full');
  url.searchParams.set('annotations', 'closure,congestion,congestion_numeric,distance');
  url.searchParams.set('depart_at', 'now');
  url.searchParams.set('access_token', token);

  const controller = new AbortController();
  const timeoutMs = Math.min(MAX_TIMEOUT_MS, Math.max(1, options.timeoutMs ?? DEFAULT_TIMEOUT_MS));
  const fetchImpl = options.fetchImpl ?? fetch;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;

  try {
    const timedOperation = new Promise<MapboxIncidentCoverage>((resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new Error('Mapbox request timed out'));
      }, timeoutMs);

      void (async () => {
        const response = await fetchImpl(url.toString(), { signal: controller.signal });
        if (!response.ok) {
          resolve(unavailable(fetchedAt, 'http_error'));
          return;
        }

        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          resolve(unavailable(fetchedAt, 'invalid_response'));
          return;
        }
        if (!isRecord(payload) || payload.code !== 'Ok' || !Array.isArray(payload.routes) || payload.routes.length === 0) {
          resolve(unavailable(fetchedAt, isRecord(payload) && payload.code && payload.code !== 'Ok' ? 'api_error' : 'invalid_response'));
          return;
        }

        const responseData = payload as MapboxDirectionsResponse;
        const route = responseData.routes?.[0];
        const routeGeometry = route?.geometry?.type === 'LineString'
          ? mapboxCoordinates(route.geometry.coordinates)
          : [];
        const legs = route?.legs;
        if (routeGeometry.length < 2 || !Array.isArray(legs) || legs.length === 0) {
          resolve(unavailable(fetchedAt, 'invalid_response'));
          return;
        }

        const providerIncidents = legs.flatMap((leg) => normalizeRawItems(leg.incidents));
        const providerClosures = legs.flatMap((leg) => normalizeRawClosures(leg.closures));
        const trafficCoverage = readTrafficCoverage(legs);
        const providerItemCount = providerIncidents.length + providerClosures.length;
        if (providerItemCount === 0) {
          resolve(unknownCoverage(fetchedAt, 'no_incidents_returned', 0, trafficCoverage));
          return;
        }

        const incidentCandidates = providerIncidents
          .map((item) => candidateFromItem(item, routeGeometry, options.googleEncodedPolyline, requestedAt, fetchedAt))
          .filter((incident): incident is MapboxTrafficIncident => !!incident);
        const closureCandidates = providerClosures
          .map((item) => candidateFromItem(item, routeGeometry, options.googleEncodedPolyline, requestedAt, fetchedAt, true))
          .filter((incident): incident is MapboxTrafficIncident => !!incident);
        const byId = new Map<string, MapboxTrafficIncident>();
        for (const incident of [...incidentCandidates, ...closureCandidates]) byId.set(incident.id, incident);
        const incidents = [...byId.values()].sort((a, b) => a.routeProgress - b.routeProgress);

        if (incidents.length === 0) {
          resolve(unknownCoverage(fetchedAt, 'no_google_corridor_candidates', providerItemCount, trafficCoverage));
          return;
        }

        resolve({
          provider: 'Mapbox',
          status: 'available',
          fetchedAt,
          sourceUrl: MAPBOX_DIRECTIONS_SOURCE_URL,
          sourceScope: MAPBOX_INCIDENT_SCOPE,
          incidents,
          providerItemCount,
          trafficCoverage,
        });
      })().catch(() => resolve(unavailable(fetchedAt, 'request_failed')));
    });

    return await timedOperation;
  } catch {
    return unavailable(fetchedAt, timedOut ? 'request_timeout' : 'request_failed');
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    controller.abort();
  }
}
