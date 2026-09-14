import type { WeatherInfo } from '../types';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const isNonEmptyString = (value: unknown): value is string => isString(value) && value.trim().length > 0;
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const hasItems = (value: unknown): value is unknown[] => Array.isArray(value) && value.length > 0;
const isCoordinate = (value: unknown) => {
  if (!isNonEmptyString(value)) return false;
  const rawParts = value.split(',').map(part => part.trim());
  if (rawParts.length !== 2 || rawParts.some(part => part.length === 0)) return false;
  const parts = rawParts.map(Number);
  return parts.every(Number.isFinite) && Math.abs(parts[0]) <= 90 && Math.abs(parts[1]) <= 180;
};

export function parseJsonResponse(text: string | undefined): unknown {
  if (!text) throw new Error('Gemini returned an empty response.');
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i)?.[1];
  const objectStart = text.indexOf('{');
  const arrayStart = text.indexOf('[');
  const start = objectStart === -1 ? arrayStart : arrayStart === -1 ? objectStart : Math.min(objectStart, arrayStart);
  const candidate = fenced ?? text.slice(start, Math.max(text.lastIndexOf('}'), text.lastIndexOf(']')) + 1);
  if (!candidate) throw new Error('Gemini response did not contain JSON.');
  try {
    return JSON.parse(candidate);
  } catch {
    throw new Error('Gemini returned invalid JSON.');
  }
}

function expectWeather(value: unknown, field: string): WeatherInfo {
  if (!isRecord(value) || !isNonEmptyString(value.location) || !isNonEmptyString(value.temp) || !isNonEmptyString(value.condition) || !isNonEmptyString(value.icon)) {
    throw new Error(`${field} must be a weather object.`);
  }
  if (!['sunny', 'cloudy', 'rainy', 'storm', 'snow', 'fog'].includes(value.icon)) throw new Error(`${field}.icon is invalid.`);
  return value as unknown as WeatherInfo;
}

export function validateRouteFallback(value: unknown): { totalDistance: string; estimatedDuration: string; routeDescription: string; estimatedArrivalHours: number } {
  if (!isRecord(value) || !isNonEmptyString(value.totalDistance) || !isNonEmptyString(value.estimatedDuration) || !isNonEmptyString(value.routeDescription) || !isNumber(value.estimatedArrivalHours) || value.estimatedArrivalHours <= 0) {
    throw new Error('Gemini route response has an invalid shape.');
  }
  return value as { totalDistance: string; estimatedDuration: string; routeDescription: string; estimatedArrivalHours: number };
}

export function validateWeatherResults(value: unknown): WeatherInfo[] {
  if (!hasItems(value)) throw new Error('Gemini weather response must be a non-empty array.');
  return value.map((item, index) => expectWeather(item, `weather[${index}]`));
}

export function validateCriticalAnalysis(value: unknown): UnknownRecord {
  if (!isRecord(value) || !hasItems(value.riskIntensity) || !hasItems(value.timeline) || !hasItems(value.criticalPoints) || !isRecord(value.routeSchematic) || !isNonEmptyString(value.mandatoryBreak) || !isNonEmptyString(value.breakNote)) {
    throw new Error('Gemini critical analysis response has an invalid shape.');
  }
  value.riskIntensity.forEach((item, index) => {
    if (!isRecord(item) || !isNonEmptyString(item.name) || !isNumber(item.value) || item.value < 0 || item.value > 100 || !isNonEmptyString(item.color)) throw new Error(`riskIntensity[${index}] is invalid.`);
  });
  value.timeline.forEach((item, index) => {
    if (!isRecord(item) || !isNonEmptyString(item.title) || !isNonEmptyString(item.description) || !['start', 'info', 'warning', 'danger', 'break', 'end', 'stop'].includes(String(item.type))) throw new Error(`timeline[${index}] is invalid.`);
  });
  value.criticalPoints.forEach((item, index) => {
    if (!isRecord(item) || !isNonEmptyString(item.id) || !isCoordinate(item.coordinate) || (item.timeOffsetHours !== undefined && (!isNumber(item.timeOffsetHours) || item.timeOffsetHours < 0)) || !isRecord(item.traffic) || !isRecord(item.incident)) throw new Error(`criticalPoints[${index}] is invalid.`);
    expectWeather(item.weather, `criticalPoints[${index}].weather`);
    if (!['normal', 'fluid', 'moderate', 'heavy', 'stopped'].includes(String(item.traffic.status)) || !isNonEmptyString(item.traffic.description) || !['accident', 'roadwork', 'none', 'break', 'roadwork_proximity', 'terrain_hazard', 'weather_related'].includes(String(item.incident.type)) || !isNonEmptyString(item.incident.description)) throw new Error(`criticalPoints[${index}] has invalid traffic or incident data.`);
  });
  if (!hasItems(value.routeSchematic.nodes) || !isNonEmptyString(value.routeSchematic.totalDistance) || !isNonEmptyString(value.routeSchematic.totalDuration)) throw new Error('routeSchematic is invalid.');
  value.routeSchematic.nodes.forEach((node, index) => {
    if (!isRecord(node) || !isNonEmptyString(node.name) || !['origin', 'destination', 'stop', 'break', 'critical', 'intermediate'].includes(String(node.type)) || !isNonEmptyString(node.distanceFromStart) || !isNonEmptyString(node.timeFromStart)) throw new Error(`routeSchematic.nodes[${index}] is invalid.`);
  });
  if (value.riskTypes !== undefined) {
    if (!Array.isArray(value.riskTypes)) throw new Error('riskTypes is invalid.');
    value.riskTypes.forEach((item, index) => {
      if (!isRecord(item) || !isString(item.category) || !isNumber(item.value) || !isString(item.description)) throw new Error(`riskTypes[${index}] is invalid.`);
    });
  }
  return value;
}
