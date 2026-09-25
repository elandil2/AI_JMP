import {
  checkCoordinateAgainstRoute,
  decodeEncodedPolyline,
  ROUTE_CORRIDOR_TOLERANCE_KM,
  type RouteCoordinate,
} from './routeGeometry';

export const TOMTOM_INCIDENTS_SOURCE_URL =
  'https://docs.tomtom.com/traffic-api/documentation/tomtom-maps/v1/traffic-incidents/incident-details';
export const TOMTOM_INCIDENT_SCOPE =
  'TomTom lists Türkiye as a detailed Traffic Incidents market. This request covers accidents, lane closures, road closures, and road works that are present or planned. Returned geometry is checked against the supplied Google route and is only a nearby corridor candidate; proximity does not prove the same road, direction, or truck suitability. Empty or partial results do not establish that a route is clear.' as const;

const TOMTOM_INCIDENT_API_URL = 'https://api.tomtom.com/traffic/services/5/incidentDetails';
const DEFAULT_TIMEOUT_MS = 25_000;
const MAX_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BBOX_REQUESTS = 48;
const MAX_BBOX_REQUESTS = 48;
const MAX_CONCURRENT_REQUESTS = 8;
// With a 20 km margin on each side, even a 50 km chunk's largest possible
// projected rectangle is about 90 x 90 km, under TomTom's 10,000 km² limit.
const ROUTE_CHUNK_LENGTH_KM = 50;
const MAX_ROUTE_VERTICES = 12_000;
const MAX_ROUTE_CHECK_VERTICES = 1_000;
const MAX_PROVIDER_ITEMS_TO_CHECK = 400;
const MAX_INCIDENT_GEOMETRY_COORDINATES = 2_000;
const MAX_INCIDENT_GEOMETRY_SAMPLES = 64;

export type TomTomIncidentCategory = 'accident' | 'lane_closed' | 'road_closed' | 'road_works';
export type TomTomIncidentTimeValidity = 'present' | 'future';
export type TomTomIncidentGeometry =
  | { type: 'Point'; coordinate: RouteCoordinate }
  | { type: 'LineString'; coordinates: RouteCoordinate[] };

export interface TomTomTrafficIncident {
  provider: 'TomTom';
  id: string;
  category: TomTomIncidentCategory;
  categoryId: 1 | 7 | 8 | 9;
  description: string;
  eventDescriptions: string[];
  timeValidity: TomTomIncidentTimeValidity;
  startTime: string | null;
  endTime: string | null;
  from: string | null;
  to: string | null;
  roadNumbers: string[];
  delaySeconds: number | null;
  magnitudeOfDelay: number | null;
  geometry: TomTomIncidentGeometry;
  /** Nearest sampled provider geometry coordinate within the Google route corridor. */
  coordinate: RouteCoordinate;
  /** Progress is relative to the supplied Google overview line, not the provider road. */
  routeProgress: number;
  distanceToGoogleRouteKm: number;
  sourceUrl: typeof TOMTOM_INCIDENTS_SOURCE_URL;
  caveat: typeof TOMTOM_INCIDENT_SCOPE;
}

export type TomTomIncidentUnavailableReason =
  | 'server_only'
  | 'missing_api_key'
  | 'invalid_google_route'
  | 'request_timeout'
  | 'request_failed'
  | 'http_error'
  | 'api_error'
  | 'invalid_response';

export type TomTomIncidentCoverageReason =
  | TomTomIncidentUnavailableReason
  | 'no_incidents_returned'
  | 'no_google_corridor_candidates'
  | 'max_bounding_boxes_reached'
  | 'max_provider_items_reached'
  | 'partial_request_failure';

export interface TomTomIncidentCoverage {
  provider: 'TomTom';
  status: 'available' | 'partial' | 'unknown' | 'unavailable';
  fetchedAt: string;
  sourceUrl: typeof TOMTOM_INCIDENTS_SOURCE_URL;
  sourceScope: typeof TOMTOM_INCIDENT_SCOPE;
  incidents: TomTomTrafficIncident[];
  /** Raw incident count across successful boxes; overlapping boxes can repeat IDs. */
  providerItemCount: number;
  requestedBboxCount: number;
  successfulBboxCount: number;
  coverageComplete: boolean;
  coverageReason?: TomTomIncidentCoverageReason;
}

export interface TomTomIncidentRequestOptions {
  /** Google Directions overview polyline. Invalid geometry prevents any API call. */
  googleEncodedPolyline: string;
  /** Server-side override; normally read from TOMTOM_API_KEY. */
  apiKey?: string | null;
  /** Injectable network adapter for tests and controlled callers. */
  fetchImpl?: typeof fetch;
  /** Total operation timeout; clamped to 1–30000 ms. */
  timeoutMs?: number;
  /** Bounded box calls; clamped to 1–48. Defaults to 48. */
  maxBboxRequests?: number;
  /** Injectable clock for deterministic observation timestamps. */
  now?: Date;
}

interface RawTomTomIncident {
  geometry?: unknown;
  properties?: unknown;
}

interface RawTomTomProperties {
  id?: unknown;
  iconCategory?: unknown;
  events?: unknown;
  timeValidity?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  from?: unknown;
  to?: unknown;
  roadNumbers?: unknown;
  delay?: unknown;
  magnitudeOfDelay?: unknown;
}

interface BboxChunk {
  bbox: string;
}

type RequestFailureReason = 'request_failed' | 'http_error' | 'api_error' | 'invalid_response';

const CATEGORY_BY_ID: Record<number, TomTomIncidentCategory | undefined> = {
  1: 'accident',
  7: 'lane_closed',
  8: 'road_closed',
  9: 'road_works',
};

function readServerApiKey(): string | undefined {
  if (typeof process === 'undefined') return undefined;
  // Dynamic lookup avoids exposing TOMTOM_API_KEY as a client-bundle constant.
  const keyName = ['TOMTOM', 'API', 'KEY'].join('_');
  return (process.env as Record<string, string | undefined>)[keyName]?.trim() || undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeIsoTimestamp(value: unknown): string | null {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

function nonEmptyString(value: unknown, maxLength = 160): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && !!item.trim())
    .slice(0, 12)
    .map((item) => item.trim().slice(0, 80));
}

function unavailable(
  fetchedAt: string,
  reason: TomTomIncidentUnavailableReason,
  requestedBboxCount = 0,
  successfulBboxCount = 0,
  providerItemCount = 0,
): TomTomIncidentCoverage {
  return {
    provider: 'TomTom',
    status: 'unavailable',
    fetchedAt,
    sourceUrl: TOMTOM_INCIDENTS_SOURCE_URL,
    sourceScope: TOMTOM_INCIDENT_SCOPE,
    incidents: [],
    providerItemCount,
    requestedBboxCount,
    successfulBboxCount,
    coverageComplete: false,
    coverageReason: reason,
  };
}

function unknownCoverage(
  fetchedAt: string,
  reason: 'no_incidents_returned' | 'no_google_corridor_candidates',
  requestedBboxCount: number,
  successfulBboxCount: number,
  providerItemCount: number,
): TomTomIncidentCoverage {
  return {
    provider: 'TomTom',
    status: 'unknown',
    fetchedAt,
    sourceUrl: TOMTOM_INCIDENTS_SOURCE_URL,
    sourceScope: TOMTOM_INCIDENT_SCOPE,
    incidents: [],
    providerItemCount,
    requestedBboxCount,
    successfulBboxCount,
    coverageComplete: true,
    coverageReason: reason,
  };
}

function partialCoverage(
  fetchedAt: string,
  reason: 'request_timeout' | 'max_bounding_boxes_reached' | 'max_provider_items_reached' | 'partial_request_failure',
  incidents: TomTomTrafficIncident[],
  requestedBboxCount: number,
  successfulBboxCount: number,
  providerItemCount: number,
): TomTomIncidentCoverage {
  return {
    provider: 'TomTom',
    status: 'partial',
    fetchedAt,
    sourceUrl: TOMTOM_INCIDENTS_SOURCE_URL,
    sourceScope: TOMTOM_INCIDENT_SCOPE,
    incidents,
    providerItemCount,
    requestedBboxCount,
    successfulBboxCount,
    coverageComplete: false,
    coverageReason: reason,
  };
}

function haversineKm(a: RouteCoordinate, b: RouteCoordinate): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const lat1 = radians(a.lat);
  const lat2 = radians(b.lat);
  const dLat = lat2 - lat1;
  const dLng = radians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function interpolate(a: RouteCoordinate, b: RouteCoordinate, fraction: number): RouteCoordinate {
  return {
    lat: a.lat + (b.lat - a.lat) * fraction,
    lng: a.lng + (b.lng - a.lng) * fraction,
  };
}

function encodeSignedPolylineValue(value: number): string {
  let encoded = value < 0 ? ~(value << 1) : value << 1;
  let output = '';
  while (encoded >= 0x20) {
    output += String.fromCharCode((0x20 | (encoded & 0x1f)) + 63);
    encoded >>= 5;
  }
  return output + String.fromCharCode(encoded + 63);
}

function encodePolyline(coordinates: RouteCoordinate[]): string {
  let previousLat = 0;
  let previousLng = 0;
  let encoded = '';
  for (const point of coordinates) {
    const lat = Math.round(point.lat * 1e5);
    const lng = Math.round(point.lng * 1e5);
    encoded += encodeSignedPolylineValue(lat - previousLat);
    encoded += encodeSignedPolylineValue(lng - previousLng);
    previousLat = lat;
    previousLng = lng;
  }
  return encoded;
}

function checkPolylineForRoute(route: RouteCoordinate[]): string {
  if (route.length <= MAX_ROUTE_CHECK_VERTICES) return encodePolyline(route);

  const sampled: RouteCoordinate[] = [];
  for (let index = 0; index < MAX_ROUTE_CHECK_VERTICES; index++) {
    const sourceIndex = Math.round(index * (route.length - 1) / (MAX_ROUTE_CHECK_VERTICES - 1));
    const point = route[sourceIndex];
    if (!sampled.length || point.lat !== sampled[sampled.length - 1].lat || point.lng !== sampled[sampled.length - 1].lng) {
      sampled.push(point);
    }
  }
  return encodePolyline(sampled);
}

function bboxForCoordinates(coordinates: RouteCoordinate[]): string {
  const minLat = Math.min(...coordinates.map((point) => point.lat));
  const maxLat = Math.max(...coordinates.map((point) => point.lat));
  const minLng = Math.min(...coordinates.map((point) => point.lng));
  const maxLng = Math.max(...coordinates.map((point) => point.lng));
  const midLat = (minLat + maxLat) / 2;
  const padLat = ROUTE_CORRIDOR_TOLERANCE_KM / 110.574;
  const cosLat = Math.max(0.15, Math.abs(Math.cos(midLat * Math.PI / 180)));
  const padLng = ROUTE_CORRIDOR_TOLERANCE_KM / (111.32 * cosLat);
  const south = Math.max(-90, minLat - padLat);
  const west = Math.max(-180, minLng - padLng);
  const north = Math.min(90, maxLat + padLat);
  const east = Math.min(180, maxLng + padLng);
  return [west, south, east, north].map((value) => value.toFixed(6)).join(',');
}

function createRouteChunks(route: RouteCoordinate[], maximumChunkLengthKm: number): RouteCoordinate[][] {
  const chunks: RouteCoordinate[][] = [];
  let current: RouteCoordinate[] = [route[0]];
  let currentLengthKm = 0;

  for (let index = 0; index < route.length - 1; index++) {
    const start = route[index];
    const end = route[index + 1];
    const segmentLength = haversineKm(start, end);
    if (!Number.isFinite(segmentLength) || segmentLength < 0.0001) continue;

    let usedLengthKm = 0;
    while (usedLengthKm < segmentLength - 0.000001) {
      const capacity = Math.max(0.001, maximumChunkLengthKm - currentLengthKm);
      const stepKm = Math.min(capacity, segmentLength - usedLengthKm);
      usedLengthKm += stepKm;
      const point = interpolate(start, end, Math.min(1, usedLengthKm / segmentLength));
      const previous = current[current.length - 1];
      if (haversineKm(previous, point) > 0.00001) current.push(point);
      currentLengthKm += stepKm;

      if (currentLengthKm >= maximumChunkLengthKm - 0.000001) {
        if (current.length >= 2) chunks.push(current);
        current = [point];
        currentLengthKm = 0;
      }
    }
  }

  if (current.length >= 2) chunks.push(current);
  return chunks;
}

function parseBbox(value: string): string | undefined {
  const values = value.split(',').map(Number);
  if (values.length !== 4 || !values.every(Number.isFinite)) return undefined;
  const [west, south, east, north] = values;
  if (west < -180 || east > 180 || south < -90 || north > 90 || west > east || south > north) return undefined;
  return value;
}

function buildBboxChunks(route: RouteCoordinate[], maximumRequests: number): { chunks: BboxChunk[]; truncated: boolean } {
  const routeChunks = createRouteChunks(route, ROUTE_CHUNK_LENGTH_KM);
  const selected = routeChunks.slice(0, maximumRequests);
  const chunks = selected
    .map((coordinates) => parseBbox(bboxForCoordinates(coordinates)))
    .filter((bbox): bbox is string => !!bbox)
    .map((bbox) => ({ bbox }));
  return { chunks, truncated: routeChunks.length > maximumRequests };
}

function validGeoJsonCoordinate(value: unknown): RouteCoordinate | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const [lng, lat] = value;
  if (typeof lng !== 'number' || !Number.isFinite(lng) || Math.abs(lng) > 180
    || typeof lat !== 'number' || !Number.isFinite(lat) || Math.abs(lat) > 90) return undefined;
  return { lat, lng };
}

function sampleLineByIndex(coordinates: RouteCoordinate[]): RouteCoordinate[] {
  if (coordinates.length <= MAX_INCIDENT_GEOMETRY_SAMPLES) return coordinates;
  return Array.from({ length: MAX_INCIDENT_GEOMETRY_SAMPLES }, (_, index) => {
    const sourceIndex = Math.round(index * (coordinates.length - 1) / (MAX_INCIDENT_GEOMETRY_SAMPLES - 1));
    return coordinates[sourceIndex];
  });
}

function parseIncidentGeometry(value: unknown): {
  geometry: TomTomIncidentGeometry;
  proximityCoordinates: RouteCoordinate[];
} | undefined {
  if (!isRecord(value)) return undefined;
  if (value.type === 'Point') {
    const coordinate = validGeoJsonCoordinate(value.coordinates);
    if (!coordinate) return undefined;
    return { geometry: { type: 'Point', coordinate }, proximityCoordinates: [coordinate] };
  }
  if (value.type !== 'LineString' || !Array.isArray(value.coordinates)
    || value.coordinates.length < 2 || value.coordinates.length > MAX_INCIDENT_GEOMETRY_COORDINATES) return undefined;

  const coordinates = value.coordinates.map(validGeoJsonCoordinate);
  if (coordinates.some((coordinate) => !coordinate)) return undefined;
  const validCoordinates = coordinates as RouteCoordinate[];
  return {
    geometry: {
      type: 'LineString',
      coordinates: sampleLineByIndex(validCoordinates),
    },
    proximityCoordinates: sampleLineByIndex(validCoordinates),
  };
}

function candidateFromIncident(
  item: RawTomTomIncident,
  googleCheckPolyline: string,
): TomTomTrafficIncident | undefined {
  if (!isRecord(item.properties)) return undefined;
  const properties = item.properties as RawTomTomProperties;
  const id = nonEmptyString(properties.id, 160);
  const categoryId = properties.iconCategory;
  if (!id || typeof categoryId !== 'number' || !Number.isInteger(categoryId)) return undefined;
  const category = CATEGORY_BY_ID[categoryId];
  if (!category) return undefined;
  if (properties.timeValidity !== 'present' && properties.timeValidity !== 'future') return undefined;

  const parsedGeometry = parseIncidentGeometry(item.geometry);
  if (!parsedGeometry) return undefined;
  let nearest: { coordinate: RouteCoordinate; distanceKm: number; progress: number } | undefined;
  for (const coordinate of parsedGeometry.proximityCoordinates) {
    const check = checkCoordinateAgainstRoute(
      googleCheckPolyline,
      `${coordinate.lat},${coordinate.lng}`,
      ROUTE_CORRIDOR_TOLERANCE_KM,
    );
    if (check.status !== 'corridor_candidate') continue;
    if (!nearest || (check.distanceKm ?? Number.POSITIVE_INFINITY) < nearest.distanceKm) {
      nearest = {
        coordinate,
        distanceKm: check.distanceKm ?? Number.POSITIVE_INFINITY,
        progress: check.progress ?? 0,
      };
    }
  }
  if (!nearest) return undefined;

  const eventDescriptions = Array.isArray(properties.events)
    ? properties.events
      .filter(isRecord)
      .map((event) => nonEmptyString(event.description, 250))
      .filter((description): description is string => !!description)
      .slice(0, 8)
    : [];
  const categoryLabel: Record<TomTomIncidentCategory, string> = {
    accident: 'Accident',
    lane_closed: 'Lane closed',
    road_closed: 'Road closed',
    road_works: 'Road works',
  };
  const description = eventDescriptions.join(' · ') || categoryLabel[category];
  const delay = properties.delay;
  const magnitude = properties.magnitudeOfDelay;

  return {
    provider: 'TomTom',
    id,
    category,
    categoryId: categoryId as TomTomTrafficIncident['categoryId'],
    description,
    eventDescriptions,
    timeValidity: properties.timeValidity,
    startTime: safeIsoTimestamp(properties.startTime),
    endTime: safeIsoTimestamp(properties.endTime),
    from: nonEmptyString(properties.from),
    to: nonEmptyString(properties.to),
    roadNumbers: stringList(properties.roadNumbers),
    delaySeconds: typeof delay === 'number' && Number.isFinite(delay) ? delay : null,
    magnitudeOfDelay: typeof magnitude === 'number' && Number.isInteger(magnitude) ? magnitude : null,
    geometry: parsedGeometry.geometry,
    coordinate: nearest.coordinate,
    routeProgress: nearest.progress,
    distanceToGoogleRouteKm: nearest.distanceKm,
    sourceUrl: TOMTOM_INCIDENTS_SOURCE_URL,
    caveat: TOMTOM_INCIDENT_SCOPE,
  };
}

function incidentsFromPayload(payload: unknown): RawTomTomIncident[] | RequestFailureReason {
  if (!isRecord(payload)) return 'invalid_response';
  if (isRecord(payload.detailedError)) return 'api_error';
  if (!Array.isArray(payload.incidents)) return 'invalid_response';
  return payload.incidents.filter(isRecord) as RawTomTomIncident[];
}

function requestUrl(bbox: string, apiKey: string): string {
  const url = new URL(TOMTOM_INCIDENT_API_URL);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('bbox', bbox);
  url.searchParams.set(
    'fields',
    '{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description},startTime,endTime,from,to,delay,roadNumbers,timeValidity}}}',
  );
  url.searchParams.set('language', 'tr-TR');
  url.searchParams.set('categoryFilter', '1,7,8,9');
  url.searchParams.set('timeValidityFilter', 'present,future');
  return url.toString();
}

async function fetchBbox(
  bbox: string,
  apiKey: string,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<{ incidents: RawTomTomIncident[] } | { error: RequestFailureReason }> {
  try {
    const response = await fetchImpl(requestUrl(bbox, apiKey), { signal });
    if (!response.ok) return { error: 'http_error' };
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { error: 'invalid_response' };
    }
    const incidents = incidentsFromPayload(payload);
    return typeof incidents === 'string' ? { error: incidents } : { incidents };
  } catch {
    return { error: 'request_failed' };
  }
}

/**
 * Retrieves TomTom v5 incidents from bounded boxes along a Google route.
 * Candidates are returned only when provider geometry falls within the
 * existing Google-route corridor tolerance. Empty coverage stays unknown.
 */
export async function retrieveTomTomIncidents(
  options: TomTomIncidentRequestOptions,
): Promise<TomTomIncidentCoverage> {
  const requestedAt = options.now && Number.isFinite(options.now.getTime()) ? options.now : new Date();
  const fetchedAt = requestedAt.toISOString();
  if (typeof window !== 'undefined') return unavailable(fetchedAt, 'server_only');

  const route = decodeEncodedPolyline(options.googleEncodedPolyline);
  if (route.length < 2 || route.length > MAX_ROUTE_VERTICES
    || route.reduce((length, point, index) => index === 0 ? length : length + haversineKm(route[index - 1], point), 0) <= 0) {
    return unavailable(fetchedAt, 'invalid_google_route');
  }

  const apiKey = options.apiKey === null ? undefined : options.apiKey?.trim() || readServerApiKey();
  if (!apiKey) return unavailable(fetchedAt, 'missing_api_key');

  const requestedLimit = Number.isFinite(options.maxBboxRequests)
    ? Math.floor(options.maxBboxRequests!)
    : DEFAULT_MAX_BBOX_REQUESTS;
  const maximumRequests = Math.min(MAX_BBOX_REQUESTS, Math.max(1, requestedLimit));
  const { chunks, truncated } = buildBboxChunks(route, maximumRequests);
  if (chunks.length === 0) return unavailable(fetchedAt, 'invalid_google_route');

  const fetchImpl = options.fetchImpl ?? fetch;
  const requestedTimeout = Number.isFinite(options.timeoutMs) ? options.timeoutMs! : DEFAULT_TIMEOUT_MS;
  const timeoutMs = Math.min(MAX_TIMEOUT_MS, Math.max(1, requestedTimeout));
  const controller = new AbortController();
  const googleCheckPolyline = checkPolylineForRoute(route);
  const successfulResponses: RawTomTomIncident[][] = [];
  const failures: RequestFailureReason[] = [];
  let nextChunk = 0;
  let timedOut = false;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  let operationTimeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const workers = Array.from({ length: Math.min(MAX_CONCURRENT_REQUESTS, chunks.length) }, async () => {
    while (!controller.signal.aborted) {
      const chunkIndex = nextChunk++;
      if (chunkIndex >= chunks.length) return;
      const result = await fetchBbox(chunks[chunkIndex].bbox, apiKey, fetchImpl, controller.signal);
      if ('error' in result) failures.push(result.error);
      else successfulResponses.push(result.incidents);
    }
  });

  let workersSettled = false;
  try {
    await Promise.race([
      Promise.all(workers).then(() => { workersSettled = true; }),
      new Promise<void>((resolve) => {
        operationTimeoutHandle = setTimeout(resolve, timeoutMs + 1);
      }),
    ]);
  } finally {
    clearTimeout(timeoutHandle);
    if (operationTimeoutHandle) clearTimeout(operationTimeoutHandle);
    if (!workersSettled) controller.abort();
  }

  const providerItemCount = successfulResponses.reduce((count, items) => count + items.length, 0);
  const allRawIncidents = successfulResponses.flat();
  const bestById = new Map<string, TomTomTrafficIncident>();
  let checkedProviderItems = 0;
  for (const item of allRawIncidents) {
    if (checkedProviderItems >= MAX_PROVIDER_ITEMS_TO_CHECK) break;
    checkedProviderItems++;
    const incident = candidateFromIncident(item, googleCheckPolyline);
    if (!incident) continue;
    const existing = bestById.get(incident.id);
    if (!existing || incident.distanceToGoogleRouteKm < existing.distanceToGoogleRouteKm) {
      bestById.set(incident.id, incident);
    }
  }
  const incidents = [...bestById.values()].sort((a, b) => a.routeProgress - b.routeProgress);
  const successfulBboxCount = successfulResponses.length;
  const providerItemLimitReached = providerItemCount > MAX_PROVIDER_ITEMS_TO_CHECK;
  const coverageComplete = !timedOut && !truncated && failures.length === 0
    && successfulBboxCount === chunks.length && !providerItemLimitReached;

  if (successfulBboxCount === 0 && timedOut) {
    return unavailable(fetchedAt, 'request_timeout', chunks.length, 0, providerItemCount);
  }
  if (successfulBboxCount === 0 && failures.length > 0) {
    return unavailable(fetchedAt, failures[0], chunks.length, 0, providerItemCount);
  }
  if (!coverageComplete) {
    const reason = timedOut ? 'request_timeout'
      : truncated ? 'max_bounding_boxes_reached'
        : failures.length > 0 ? 'partial_request_failure'
          : 'max_provider_items_reached';
    return partialCoverage(fetchedAt, reason, incidents, chunks.length, successfulBboxCount, providerItemCount);
  }
  if (providerItemCount === 0) {
    return unknownCoverage(fetchedAt, 'no_incidents_returned', chunks.length, successfulBboxCount, providerItemCount);
  }
  if (incidents.length === 0) {
    return unknownCoverage(fetchedAt, 'no_google_corridor_candidates', chunks.length, successfulBboxCount, providerItemCount);
  }

  return {
    provider: 'TomTom',
    status: 'available',
    fetchedAt,
    sourceUrl: TOMTOM_INCIDENTS_SOURCE_URL,
    sourceScope: TOMTOM_INCIDENT_SCOPE,
    incidents,
    providerItemCount,
    requestedBboxCount: chunks.length,
    successfulBboxCount,
    coverageComplete: true,
  };
}
