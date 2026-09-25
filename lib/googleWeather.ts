import type { WeatherInfo } from '../types';

const FORECAST_HOURS_URL = 'https://weather.googleapis.com/v1/forecast/hours:lookup';
const MAX_FORECAST_HOURS = 240;
const PAGE_SIZE = 24;
const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 15_000;

export type GoogleWeatherUnavailableReason =
  | 'missing_api_key'
  | 'invalid_input'
  | 'forecast_out_of_range'
  | 'forbidden'
  | 'unauthenticated'
  | 'http_error'
  | 'timeout'
  | 'network_error'
  | 'malformed_response'
  | 'no_forecast_for_arrival';

export interface GoogleWeatherMetrics {
  temperatureC?: number;
  precipitationProbabilityPercent?: number;
  precipitationType?: string;
  precipitationMm?: number;
  snowMm?: number;
  windKmh?: number;
  windGustKmh?: number;
  visibilityKm?: number;
  thunderstormProbabilityPercent?: number;
  cloudCoverPercent?: number;
  relativeHumidityPercent?: number;
}

export interface GoogleWeatherProvenance {
  provider: 'google_maps_weather';
  status: 'available' | 'unavailable' | 'forbidden';
  sourceName: 'Google Maps Platform Weather API';
  requestedArrivalTime: string | null;
  forecastTime: string | null;
  timeZone?: string;
  latitude: number | null;
  longitude: number | null;
  reason?: GoogleWeatherUnavailableReason;
  httpStatus?: number;
}

export interface GoogleWeatherLookupResult {
  /** `forbidden` lets the caller suppress further calls for this disabled/restricted key. */
  status: 'available' | 'unavailable' | 'forbidden';
  source: 'google_weather' | 'unavailable';
  weather: WeatherInfo;
  forecast?: GoogleWeatherMetrics;
  provenance: GoogleWeatherProvenance;
}

export interface GoogleWeatherLookupInput {
  latitude: number;
  longitude: number;
  /** A user-facing route/stop label, such as "Afyonkarahisar". */
  location: string;
  /** Expected local arrival time as ISO text, Date, or epoch milliseconds. */
  arrivalTime: string | Date | number;
  /** Defaults to the server-side GOOGLE_MAPS_API_KEY environment variable. */
  apiKey?: string;
  /** Injectable clock/fetcher for deterministic tests. */
  now?: Date | number;
  fetchImpl?: typeof fetch;
  /** One deadline for the complete paginated lookup, capped at 15 seconds. */
  timeoutMs?: number;
}

type JsonRecord = Record<string, unknown>;

interface ForecastHour {
  interval?: { startTime?: unknown; endTime?: unknown };
  weatherCondition?: { type?: unknown; description?: { text?: unknown; languageCode?: unknown } };
  temperature?: { degrees?: unknown; unit?: unknown };
  precipitation?: {
    probability?: { percent?: unknown; type?: unknown };
    qpf?: { quantity?: unknown; unit?: unknown };
    snowQpf?: { quantity?: unknown; unit?: unknown };
  };
  wind?: {
    speed?: { value?: unknown; unit?: unknown };
    gust?: { value?: unknown; unit?: unknown };
  };
  visibility?: { distance?: unknown; unit?: unknown };
  thunderstormProbability?: unknown;
  cloudCover?: unknown;
  relativeHumidity?: unknown;
}

interface ForecastPage {
  forecastHours?: unknown;
  nextPageToken?: unknown;
  timeZone?: { id?: unknown };
}

const TURKISH_CONDITIONS: Record<string, string> = {
  CLEAR: 'Açık',
  MOSTLY_CLEAR: 'Çoğunlukla açık',
  PARTLY_CLOUDY: 'Parçalı bulutlu',
  MOSTLY_CLOUDY: 'Çok bulutlu',
  CLOUDY: 'Bulutlu',
  WINDY: 'Rüzgârlı',
  WIND_AND_RAIN: 'Rüzgârlı ve yağmurlu',
  LIGHT_RAIN_SHOWERS: 'Hafif sağanak yağış',
  CHANCE_OF_SHOWERS: 'Sağanak yağış ihtimali',
  SCATTERED_SHOWERS: 'Aralıklı sağanak yağış',
  RAIN_SHOWERS: 'Sağanak yağış',
  HEAVY_RAIN_SHOWERS: 'Kuvvetli sağanak yağış',
  LIGHT_TO_MODERATE_RAIN: 'Hafif-orta şiddette yağmur',
  MODERATE_TO_HEAVY_RAIN: 'Orta-kuvvetli yağmur',
  RAIN: 'Yağmurlu',
  LIGHT_RAIN: 'Hafif yağmurlu',
  HEAVY_RAIN: 'Kuvvetli yağmurlu',
  RAIN_PERIODICALLY_HEAVY: 'Zaman zaman kuvvetli yağmur',
  LIGHT_SNOW_SHOWERS: 'Hafif kar sağanağı',
  CHANCE_OF_SNOW_SHOWERS: 'Kar sağanağı ihtimali',
  SCATTERED_SNOW_SHOWERS: 'Aralıklı kar sağanağı',
  SNOW_SHOWERS: 'Kar sağanağı',
  HEAVY_SNOW_SHOWERS: 'Kuvvetli kar sağanağı',
  LIGHT_TO_MODERATE_SNOW: 'Hafif-orta şiddette kar',
  MODERATE_TO_HEAVY_SNOW: 'Orta-kuvvetli kar',
  SNOW: 'Kar yağışlı',
  LIGHT_SNOW: 'Hafif kar yağışlı',
  HEAVY_SNOW: 'Kuvvetli kar yağışlı',
  SNOWSTORM: 'Kar fırtınası',
  SNOW_PERIODICALLY_HEAVY: 'Zaman zaman kuvvetli kar',
  HEAVY_SNOW_STORM: 'Kuvvetli kar fırtınası',
  BLOWING_SNOW: 'Savrulan kar',
  RAIN_AND_SNOW: 'Yağmur ve kar',
  HAIL: 'Dolu',
  HAIL_SHOWERS: 'Dolu sağanağı',
  THUNDERSTORM: 'Gök gürültülü fırtına',
  THUNDERSHOWER: 'Gök gürültülü sağanak',
  LIGHT_THUNDERSTORM_RAIN: 'Hafif gök gürültülü yağış',
  SCATTERED_THUNDERSTORMS: 'Yer yer gök gürültülü sağanak',
  HEAVY_THUNDERSTORM: 'Kuvvetli gök gürültülü fırtına',
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function record(value: unknown): JsonRecord | undefined {
  return isRecord(value) ? value : undefined;
}

function readNumber(value: unknown, key: string): number | undefined {
  return finiteNumber(record(value)?.[key]);
}

function parseArrivalTime(value: string | Date | number): { epochMs: number; iso: string } | undefined {
  const epochMs = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(epochMs)) return undefined;
  return { epochMs, iso: new Date(epochMs).toISOString() };
}

function weatherLabel(location: string, temp = '-', condition = 'Hava durumu alınamadı'): WeatherInfo {
  return { location, temp, condition, icon: 'unknown' };
}

function unavailable(
  input: Partial<GoogleWeatherLookupInput>,
  reason: GoogleWeatherUnavailableReason,
  details: { httpStatus?: number; arrivalIso?: string } = {}
): GoogleWeatherLookupResult {
  const location = typeof input.location === 'string' && input.location.trim()
    ? input.location.trim().slice(0, 120)
    : 'Belirtilen konum';
  const latitude = finiteNumber(input.latitude) ?? null;
  const longitude = finiteNumber(input.longitude) ?? null;
  const status = reason === 'forbidden' ? 'forbidden' : 'unavailable';
  return {
    status,
    source: 'unavailable',
    weather: weatherLabel(location),
    provenance: {
      provider: 'google_maps_weather',
      status,
      sourceName: 'Google Maps Platform Weather API',
      requestedArrivalTime: details.arrivalIso ?? (input.arrivalTime === undefined ? null : parseArrivalTime(input.arrivalTime)?.iso ?? null),
      forecastTime: null,
      latitude,
      longitude,
      reason,
      ...(details.httpStatus === undefined ? {} : { httpStatus: details.httpStatus }),
    },
  };
}

function normalizeTemperatureC(hour: ForecastHour): number | undefined {
  const temperature = record(hour.temperature);
  const degrees = finiteNumber(temperature?.degrees);
  if (degrees === undefined) return undefined;
  const unit = typeof temperature?.unit === 'string' ? temperature.unit.toUpperCase() : 'CELSIUS';
  if (unit === 'FAHRENHEIT') return (degrees - 32) * 5 / 9;
  if (unit === 'CELSIUS' || unit === 'DEGREES_CELSIUS') return degrees;
  return undefined;
}

function normalizeSpeedKmh(value: unknown): number | undefined {
  const speed = record(value);
  const amount = finiteNumber(speed?.value);
  if (amount === undefined) return undefined;
  const unit = typeof speed?.unit === 'string' ? speed.unit.toUpperCase() : '';
  if (unit === 'KILOMETERS_PER_HOUR') return amount;
  if (unit === 'MILES_PER_HOUR') return amount * 1.609344;
  return undefined;
}

function normalizeDistanceKm(value: unknown): number | undefined {
  const distance = record(value);
  const amount = finiteNumber(distance?.distance);
  if (amount === undefined) return undefined;
  const unit = typeof distance?.unit === 'string' ? distance.unit.toUpperCase() : '';
  if (unit === 'KILOMETERS') return amount;
  if (unit === 'MILES') return amount * 1.609344;
  return undefined;
}

function normalizeQpfMm(value: unknown): number | undefined {
  const qpf = record(value);
  const amount = readNumber(qpf, 'quantity');
  if (amount === undefined) return undefined;
  const unit = typeof qpf?.unit === 'string' ? qpf.unit.toUpperCase() : '';
  if (unit === 'MILLIMETERS') return amount;
  if (unit === 'INCHES') return amount * 25.4;
  return undefined;
}

function percentage(value: unknown): number | undefined {
  const parsed = finiteNumber(value);
  return parsed !== undefined && parsed >= 0 && parsed <= 100 ? parsed : undefined;
}

function conditionType(hour: ForecastHour): string {
  const condition = record(hour.weatherCondition);
  return typeof condition?.type === 'string' ? condition.type.toUpperCase() : '';
}

function iconFor(type: string): WeatherInfo['icon'] {
  if (!type) return 'unknown';
  if (/(THUNDER|STORM|HAIL)/.test(type)) return 'storm';
  if (/(SNOW|SLEET|ICE|FREEZING)/.test(type)) return 'snow';
  if (/(RAIN|SHOWERS|DRIZZLE)/.test(type)) return 'rainy';
  if (/(FOG|MIST|HAZE)/.test(type)) return 'fog';
  if (/(CLEAR)/.test(type)) return 'sunny';
  if (/(CLOUD|WIND)/.test(type)) return 'cloudy';
  return 'unknown';
}

function localizedCondition(hour: ForecastHour, type: string): string {
  const description = record(record(hour.weatherCondition)?.description);
  const text = typeof description?.text === 'string' ? description.text.trim() : '';
  const languageCode = typeof description?.languageCode === 'string' ? description.languageCode.toLowerCase() : '';
  if (text && (!languageCode || languageCode === 'tr' || languageCode.startsWith('tr-'))) return text;
  return TURKISH_CONDITIONS[type] ?? 'Hava koşulu açıklaması yok';
}

function formatTemp(tempC: number | undefined): string {
  if (tempC === undefined) return '-';
  return `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(tempC)}°C`;
}

function forecastMetrics(hour: ForecastHour): GoogleWeatherMetrics {
  const precipitation = record(hour.precipitation);
  const probability = record(precipitation?.probability);
  const wind = record(hour.wind);
  const result: GoogleWeatherMetrics = {};
  const temperatureC = normalizeTemperatureC(hour);
  const precipitationProbabilityPercent = percentage(probability?.percent);
  const precipitationType = typeof probability?.type === 'string' && probability.type !== 'PRECIPITATION_TYPE_UNSPECIFIED'
    ? probability.type
    : undefined;
  const precipitationMm = normalizeQpfMm(precipitation?.qpf);
  const snowMm = normalizeQpfMm(precipitation?.snowQpf);
  const windKmh = normalizeSpeedKmh(wind?.speed);
  const windGustKmh = normalizeSpeedKmh(wind?.gust);
  const visibilityKm = normalizeDistanceKm(hour.visibility);
  const thunderstormProbabilityPercent = percentage(hour.thunderstormProbability);
  const cloudCoverPercent = percentage(hour.cloudCover);
  const relativeHumidityPercent = percentage(hour.relativeHumidity);
  if (temperatureC !== undefined) result.temperatureC = temperatureC;
  if (precipitationProbabilityPercent !== undefined) result.precipitationProbabilityPercent = precipitationProbabilityPercent;
  if (precipitationType) result.precipitationType = precipitationType;
  if (precipitationMm !== undefined) result.precipitationMm = precipitationMm;
  if (snowMm !== undefined) result.snowMm = snowMm;
  if (windKmh !== undefined) result.windKmh = windKmh;
  if (windGustKmh !== undefined) result.windGustKmh = windGustKmh;
  if (visibilityKm !== undefined) result.visibilityKm = visibilityKm;
  if (thunderstormProbabilityPercent !== undefined) result.thunderstormProbabilityPercent = thunderstormProbabilityPercent;
  if (cloudCoverPercent !== undefined) result.cloudCoverPercent = cloudCoverPercent;
  if (relativeHumidityPercent !== undefined) result.relativeHumidityPercent = relativeHumidityPercent;
  return result;
}

function parseForecastHours(value: unknown): ForecastHour[] | undefined {
  const hours = record(value)?.forecastHours;
  if (!Array.isArray(hours)) return undefined;
  return hours.filter((item): item is ForecastHour => isRecord(item));
}

function selectArrivalHour(hours: ForecastHour[], arrivalEpochMs: number): { hour: ForecastHour; startTime: string } | undefined {
  for (const hour of hours) {
    const interval = record(hour.interval);
    const startTime = typeof interval?.startTime === 'string' ? interval.startTime : '';
    const startMs = Date.parse(startTime);
    if (!Number.isFinite(startMs)) continue;
    const explicitEnd = typeof interval?.endTime === 'string' ? Date.parse(interval.endTime) : Number.NaN;
    const endMs = Number.isFinite(explicitEnd) && explicitEnd > startMs ? explicitEnd : startMs + HOUR_MS;
    if (arrivalEpochMs >= startMs && arrivalEpochMs < endMs) return { hour, startTime: new Date(startMs).toISOString() };
  }
  return undefined;
}

function googleHttpReason(status: number): GoogleWeatherUnavailableReason {
  if (status === 401) return 'unauthenticated';
  if (status === 403) return 'forbidden';
  return 'http_error';
}

/**
 * Looks up the Google Weather hourly forecast for the hour containing the
 * expected arrival. Failures are explicit and never turn into fabricated
 * weather values; callers can then apply a clearly labelled fallback.
 */
export async function lookupGoogleWeatherAtArrival(
  input: GoogleWeatherLookupInput
): Promise<GoogleWeatherLookupResult> {
  const arrival = parseArrivalTime(input.arrivalTime);
  const validCoordinates = Number.isFinite(input.latitude) && input.latitude >= -90 && input.latitude <= 90
    && Number.isFinite(input.longitude) && input.longitude >= -180 && input.longitude <= 180;
  if (!arrival || !validCoordinates) return unavailable(input, 'invalid_input');

  const apiKey = input.apiKey?.trim() || (typeof process !== 'undefined' ? process.env.GOOGLE_MAPS_API_KEY?.trim() : undefined);
  if (!apiKey) return unavailable(input, 'missing_api_key', { arrivalIso: arrival.iso });

  const nowValue = input.now instanceof Date ? input.now.getTime() : input.now ?? Date.now();
  if (!Number.isFinite(nowValue)) return unavailable(input, 'invalid_input', { arrivalIso: arrival.iso });
  const currentHourStart = Math.floor(nowValue / HOUR_MS) * HOUR_MS;
  const arrivalHourStart = Math.floor(arrival.epochMs / HOUR_MS) * HOUR_MS;
  const hourIndex = Math.floor((arrivalHourStart - currentHourStart) / HOUR_MS);
  if (hourIndex < 0 || hourIndex >= MAX_FORECAST_HOURS) {
    return unavailable(input, 'forecast_out_of_range', { arrivalIso: arrival.iso });
  }
  const hoursToRequest = hourIndex + 1;
  const pageLimit = Math.ceil(hoursToRequest / PAGE_SIZE);
  const timeoutMs = Math.min(MAX_TIMEOUT_MS, Math.max(1, Math.floor(input.timeoutMs ?? DEFAULT_TIMEOUT_MS)));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const fetchImpl = input.fetchImpl ?? fetch;
  const allHours: ForecastHour[] = [];
  let pageToken: string | undefined;
  let responseTimeZone: string | undefined;

  try {
    for (let page = 0; page < pageLimit; page += 1) {
      const url = new URL(FORECAST_HOURS_URL);
      url.searchParams.set('key', apiKey);
      url.searchParams.set('location.latitude', String(input.latitude));
      url.searchParams.set('location.longitude', String(input.longitude));
      url.searchParams.set('unitsSystem', 'METRIC');
      url.searchParams.set('languageCode', 'tr');
      url.searchParams.set('hours', String(hoursToRequest));
      url.searchParams.set('pageSize', String(PAGE_SIZE));
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const response = await fetchImpl(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) {
        return unavailable(input, googleHttpReason(response.status), { arrivalIso: arrival.iso, httpStatus: response.status });
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        return unavailable(input, 'malformed_response', { arrivalIso: arrival.iso });
      }
      const forecastHours = parseForecastHours(payload);
      if (!forecastHours) return unavailable(input, 'malformed_response', { arrivalIso: arrival.iso });
      allHours.push(...forecastHours);

      const timeZone = record(record(payload)?.timeZone)?.id;
      if (typeof timeZone === 'string') responseTimeZone = timeZone;
      if (selectArrivalHour(allHours, arrival.epochMs)) break;

      const nextPageToken = record(payload)?.nextPageToken;
      if (typeof nextPageToken !== 'string' || !nextPageToken || page + 1 >= pageLimit) break;
      pageToken = nextPageToken;
    }
  } catch (error) {
    if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
      return unavailable(input, 'timeout', { arrivalIso: arrival.iso });
    }
    return unavailable(input, 'network_error', { arrivalIso: arrival.iso });
  } finally {
    clearTimeout(timeout);
  }

  const selected = selectArrivalHour(allHours, arrival.epochMs);
  if (!selected) return unavailable(input, 'no_forecast_for_arrival', { arrivalIso: arrival.iso });

  const type = conditionType(selected.hour);
  const metrics = forecastMetrics(selected.hour);
  const conditionText = localizedCondition(selected.hour, type);
  const location = typeof input.location === 'string' && input.location.trim()
    ? input.location.trim().slice(0, 120)
    : `${input.latitude.toFixed(4)}, ${input.longitude.toFixed(4)}`;
  return {
    status: 'available',
    source: 'google_weather',
    weather: {
      location,
      temp: formatTemp(metrics.temperatureC),
      condition: conditionText,
      icon: iconFor(type),
    },
    forecast: metrics,
    provenance: {
      provider: 'google_maps_weather',
      status: 'available',
      sourceName: 'Google Maps Platform Weather API',
      requestedArrivalTime: arrival.iso,
      forecastTime: selected.startTime,
      ...(responseTimeZone ? { timeZone: responseTimeZone } : {}),
      latitude: input.latitude,
      longitude: input.longitude,
    },
  };
}
