/**
 * Request-time route checkpoint labels from Mapbox Geocoding v6.
 *
 * Stored report labels require `permanent=true` under Mapbox's Geocoding API
 * terms. If a permanent lookup cannot be completed, callers get the supplied
 * Google Maps road label (when present), with its source and fallback status.
 */

export interface RouteCheckpointCoordinate {
  lat: number;
  lng: number;
}

export interface RouteCheckpointForGeocoding {
  /** A latitude/longitude pair, or the common "lat,lng" string form. */
  coordinate: RouteCheckpointCoordinate | string;
  /** Road or place label already returned by Google Maps for this point. */
  mapsRoadLabel?: string | null;
}

export type RouteCheckpointLabelSource = 'mapbox_geocoding_v6' | 'google_maps' | 'none';
export type RouteCheckpointLabelStatus = 'resolved' | 'fallback' | 'unavailable';
export type RouteCheckpointLabelError =
  | 'invalid_coordinate'
  | 'checkpoint_limit'
  | 'mapbox_token_missing'
  | 'mapbox_request_failed'
  | 'mapbox_no_result'
  | 'mapbox_no_administrative_label';

export interface RouteCheckpointLabel {
  index: number;
  coordinate: RouteCheckpointCoordinate | null;
  /** A Mapbox-derived district/city label or the exact supplied Maps fallback. */
  label: string | null;
  district: string | null;
  city: string | null;
  source: RouteCheckpointLabelSource;
  status: RouteCheckpointLabelStatus;
  errorCode?: RouteCheckpointLabelError;
}

export interface MapboxRouteGeocodingOptions {
  /** Defaults to MAPBOX_TOKEN. This makes deterministic tests possible. */
  token?: string;
  /** Injectable transport for tests and controlled server-side callers. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export const MAPBOX_ROUTE_GEOCODING_MAX_CHECKPOINTS = 8;
export const MAPBOX_ROUTE_GEOCODING_MAX_CONCURRENCY = 3;
const MAPBOX_REVERSE_ENDPOINT = 'https://api.mapbox.com/search/geocode/v6/reverse';
const DEFAULT_TIMEOUT_MS = 8_000;

type JsonObject = Record<string, unknown>;
type GeocodingFeatureProperties = {
  feature_type?: unknown;
  name?: unknown;
  context?: unknown;
};

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const nonEmptyName = (value: unknown): string | null => {
  if (!isObject(value)) return null;
  const name = value.name;
  return typeof name === 'string' && name.trim() ? name.trim() : null;
};

const parseCoordinate = (coordinate: RouteCheckpointCoordinate | string): RouteCheckpointCoordinate | null => {
  let lat: number;
  let lng: number;

  if (typeof coordinate === 'string') {
    const parts = coordinate.split(',');
    if (parts.length !== 2) return null;
    if (!parts[0].trim() || !parts[1].trim()) return null;
    lat = Number(parts[0].trim());
    lng = Number(parts[1].trim());
  } else if (isObject(coordinate)) {
    if (typeof coordinate.lat !== 'number' || typeof coordinate.lng !== 'number') return null;
    lat = Number(coordinate.lat);
    lng = Number(coordinate.lng);
  } else {
    return null;
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
};

const namesFromFeature = (properties: GeocodingFeatureProperties) => {
  const context = isObject(properties.context) ? properties.context : {};
  const featureType = typeof properties.feature_type === 'string' ? properties.feature_type : '';
  const featureName = typeof properties.name === 'string' && properties.name.trim() ? properties.name.trim() : null;

  const city = nonEmptyName(context.place) ?? nonEmptyName(context.region)
    ?? (featureType === 'place' || featureType === 'region' ? featureName : null);
  const district = nonEmptyName(context.locality) ?? nonEmptyName(context.district)
    ?? (featureType === 'locality' || featureType === 'district' ? featureName : null);

  return { city, district };
};

const normalizeForComparison = (value: string): string =>
  value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]/gu, '');

const administrativeLabel = (body: unknown): { label: string; city: string | null; district: string | null } | null => {
  if (!isObject(body) || !Array.isArray(body.features)) return null;

  let city: string | null = null;
  let district: string | null = null;
  for (const feature of body.features) {
    if (!isObject(feature) || !isObject(feature.properties)) continue;
    const names = namesFromFeature(feature.properties as GeocodingFeatureProperties);
    city ??= names.city;
    district ??= names.district;
  }

  if (city && district && normalizeForComparison(city) === normalizeForComparison(district)) district = null;
  if (!city && !district) return null;

  const label = city && district ? `${district}, ${city}` : city ?? district!;
  return { label, city, district };
};

const fallbackResult = (
  index: number,
  coordinate: RouteCheckpointCoordinate | null,
  mapsRoadLabel: string | null | undefined,
  errorCode: RouteCheckpointLabelError
): RouteCheckpointLabel => {
  const label = typeof mapsRoadLabel === 'string' && mapsRoadLabel.trim() ? mapsRoadLabel.trim() : null;
  return {
    index,
    coordinate,
    label,
    district: null,
    city: null,
    source: label ? 'google_maps' : 'none',
    status: label ? 'fallback' : 'unavailable',
    errorCode
  };
};

const geocodeOne = async (
  index: number,
  input: RouteCheckpointForGeocoding,
  coordinate: RouteCheckpointCoordinate,
  token: string,
  fetchImpl: typeof fetch,
  timeoutMs: number
): Promise<RouteCheckpointLabel> => {
  const params = new URLSearchParams({
    longitude: String(coordinate.lng),
    latitude: String(coordinate.lat),
    language: 'tr',
    worldview: 'tr',
    types: 'district,locality,place,region',
    permanent: 'true',
    access_token: token
  });

  try {
    const response = await fetchImpl(`${MAPBOX_REVERSE_ENDPOINT}?${params.toString()}`, {
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) return fallbackResult(index, coordinate, input.mapsRoadLabel, 'mapbox_request_failed');

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return fallbackResult(index, coordinate, input.mapsRoadLabel, 'mapbox_request_failed');
    }

    if (!isObject(body) || !Array.isArray(body.features)) {
      return fallbackResult(index, coordinate, input.mapsRoadLabel, 'mapbox_request_failed');
    }
    if (body.features.length === 0) return fallbackResult(index, coordinate, input.mapsRoadLabel, 'mapbox_no_result');

    const result = administrativeLabel(body);
    if (!result) return fallbackResult(index, coordinate, input.mapsRoadLabel, 'mapbox_no_administrative_label');

    return {
      index,
      coordinate,
      label: result.label,
      district: result.district,
      city: result.city,
      source: 'mapbox_geocoding_v6',
      status: 'resolved'
    };
  } catch {
    return fallbackResult(index, coordinate, input.mapsRoadLabel, 'mapbox_request_failed');
  }
};

/**
 * Resolve no more than eight route checkpoints, with at most three requests in
 * flight. Input order and checkpoint indices are preserved. Extra points,
 * malformed coordinates, missing credentials, and provider failures use the
 * exact Maps road label supplied by the caller or return an explicit empty
 * result; they never receive a guessed city name.
 */
export async function reverseGeocodeRouteCheckpoints(
  checkpoints: readonly RouteCheckpointForGeocoding[],
  options: MapboxRouteGeocodingOptions = {}
): Promise<RouteCheckpointLabel[]> {
  const token = options.token ?? process.env.MAPBOX_TOKEN;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = Number.isFinite(options.timeoutMs) && (options.timeoutMs ?? 0) > 0
    ? options.timeoutMs!
    : DEFAULT_TIMEOUT_MS;

  const coordinates = checkpoints.map(checkpoint => parseCoordinate(checkpoint.coordinate));
  const results = new Array<RouteCheckpointLabel>(checkpoints.length);

  for (let index = 0; index < checkpoints.length; index++) {
    if (!coordinates[index]) {
      results[index] = fallbackResult(index, null, checkpoints[index].mapsRoadLabel, 'invalid_coordinate');
    } else if (index >= MAPBOX_ROUTE_GEOCODING_MAX_CHECKPOINTS) {
      results[index] = fallbackResult(index, coordinates[index], checkpoints[index].mapsRoadLabel, 'checkpoint_limit');
    } else if (!token) {
      results[index] = fallbackResult(index, coordinates[index], checkpoints[index].mapsRoadLabel, 'mapbox_token_missing');
    }
  }

  const eligibleIndexes = checkpoints
    .map((_, index) => index)
    .filter(index => coordinates[index] && index < MAPBOX_ROUTE_GEOCODING_MAX_CHECKPOINTS && Boolean(token));
  let cursor = 0;
  const workerCount = Math.min(MAPBOX_ROUTE_GEOCODING_MAX_CONCURRENCY, eligibleIndexes.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < eligibleIndexes.length) {
      const index = eligibleIndexes[cursor++];
      results[index] = await geocodeOne(index, checkpoints[index], coordinates[index]!, token!, fetchImpl, timeoutMs);
    }
  });
  await Promise.all(workers);

  return results;
}
