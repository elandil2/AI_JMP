import type { CriticalPoint, RouteSegmentNode, WeatherInfo } from '../types';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const isNonEmptyString = (value: unknown): value is string => isString(value) && value.trim().length > 0;
const isCategory = (value: unknown): value is string => isNonEmptyString(value) && value.length <= 64;
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const hasItems = (value: unknown): value is unknown[] => Array.isArray(value) && value.length > 0;
const isCoordinate = (value: unknown) => {
  if (!isNonEmptyString(value)) return false;
  const rawParts = value.split(',').map(part => part.trim());
  if (rawParts.length !== 2 || rawParts.some(part => part.length === 0)) return false;
  const parts = rawParts.map(Number);
  return parts.every(Number.isFinite) && Math.abs(parts[0]) <= 90 && Math.abs(parts[1]) <= 180;
};
const categoryKey = (value: string) => value.trim().toLocaleLowerCase('tr-TR').replace(/[\s-]+/g, '_');

function normalizeTraffic(value: unknown, field: string): CriticalPoint['traffic']['status'] {
  if (!isCategory(value)) throw new Error(`${field} is invalid.`);
  const key = categoryKey(value);
  if (/^(not|non|invalid|fake|unknown)_/.test(key)) throw new Error(`${field} is invalid.`);
  if (/stopp|block|clos|kapal|durdu|gridlock/.test(key)) return 'stopped';
  if (/heavy|congest|jam|yoğun|sıkış|disrupt/.test(key)) return 'heavy';
  if (/moderate|medium|slow|control|warning|orta|yavaş|kontrol/.test(key)) return 'moderate';
  if (/fluid|normal|light|clear|free|akıcı|açık|hafif/.test(key)) return 'fluid';
  throw new Error(`${field} is invalid.`);
}

function normalizeIncident(value: unknown, field: string): CriticalPoint['incident']['type'] {
  if (!isCategory(value)) throw new Error(`${field} is invalid.`);
  const key = categoryKey(value);
  if (/^(not|non|invalid|fake|unknown)_/.test(key)) throw new Error(`${field} is invalid.`);
  if (/^none$|^no_event$|^yok$/.test(key)) return 'none';
  if (/accident|black_?spot|kaza/.test(key)) return 'accident';
  if (/clos|diversion|detour|kapan|kapal/.test(key)) return 'closure';
  if (/road_?work|road_?condition|yol_?çalış|yol_?calis/.test(key)) return 'roadwork';
  if (/(^|_)(weather|rain|snow|flood|meteor|hava|yağmur|kar_?yağ)($|_)/.test(key)) return 'weather';
  if (/break|mola/.test(key)) return 'break';
  if (/speed|radar|hız|hiz/.test(key)) return 'speed';
  if (/tunnel|tünel/.test(key)) return 'tunnel';
  if (/terrain|landslide|environment|hazard|heyelan|tehlike/.test(key)) return 'hazard';
  if (/traffic|congest|trafik/.test(key)) return 'traffic';
  if (/warning|alert|uyarı/.test(key)) return 'warning';
  if (/info|destination|bilgi|varış/.test(key)) return 'info';
  throw new Error(`${field} is invalid.`);
}

function normalizeNode(value: unknown, field: string): RouteSegmentNode['type'] {
  if (!isCategory(value)) throw new Error(`${field} is invalid.`);
  const key = categoryKey(value);
  if (/^(not|non|invalid|fake|unknown)_/.test(key)) throw new Error(`${field} is invalid.`);
  if (/break|mola/.test(key)) return 'break';
  if (/origin|^start$|başlangıç/.test(key)) return 'origin';
  if (/destination|^end$|varış/.test(key)) return 'destination';
  if (/critical|danger|warning|hazard|checkpoint|risk|tehlike|uyarı/.test(key)) return 'critical';
  if (/stop|intermediate|midpoint|junction|toll|landmark|info|durak|kavşak/.test(key)) return 'stop';
  throw new Error(`${field} is invalid.`);
}

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
  const rawIcon = value.icon.toLocaleLowerCase('tr-TR').trim();
  // Gemini often returns a meaningful composite weather label instead of one
  // of the UI's six icon names. Normalize recognized weather terms, reject all
  // unrelated values, and keep the persisted report shape deterministic.
  let icon: WeatherInfo['icon'];
  if (/snow|kar|heavy_snow/.test(rawIcon)) icon = 'snow';
  else if (/storm|thunder|fırtın|gök.?gür|şimşek/.test(rawIcon)) icon = 'storm';
  else if (/rain|drizzle|yağmur|sağanak|yağış/.test(rawIcon)) icon = 'rainy';
  else if (/fog|mist|sis|pus/.test(rawIcon)) icon = 'fog';
  else if (/cloud|overcast|bulut/.test(rawIcon)) icon = 'cloudy';
  else if (/sun|clear|açık|güneş/.test(rawIcon)) icon = 'sunny';
  else throw new Error(`${field}.icon is invalid.`);
  return { ...value, icon } as WeatherInfo;
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
    item.weather = expectWeather(item.weather, `criticalPoints[${index}].weather`);
    if (!isRecord(item.traffic) || !isNonEmptyString(item.traffic.description) || !isRecord(item.incident) || !isNonEmptyString(item.incident.description)) throw new Error(`criticalPoints[${index}] has invalid traffic or incident data.`);
    item.traffic.status = normalizeTraffic(item.traffic.status, `criticalPoints[${index}].traffic.status`);
    const incidentRawType = item.incident.type;
    item.incident.type = normalizeIncident(incidentRawType, `criticalPoints[${index}].incident.type`);
    if (incidentRawType !== item.incident.type) item.incident.rawType = incidentRawType;
  });
  if (!hasItems(value.routeSchematic.nodes) || !isNonEmptyString(value.routeSchematic.totalDistance) || !isNonEmptyString(value.routeSchematic.totalDuration)) throw new Error('routeSchematic is invalid.');
  value.routeSchematic.nodes.forEach((node, index) => {
    if (!isRecord(node) || !isNonEmptyString(node.name) || !isNonEmptyString(node.distanceFromStart) || !isNonEmptyString(node.timeFromStart)) throw new Error(`routeSchematic.nodes[${index}] is invalid.`);
    const nodeRawType = node.type;
    node.type = normalizeNode(nodeRawType, `routeSchematic.nodes[${index}].type`);
    if (nodeRawType !== node.type) node.rawType = nodeRawType;
  });
  if (value.riskTypes !== undefined) {
    if (!Array.isArray(value.riskTypes)) throw new Error('riskTypes is invalid.');
    value.riskTypes.forEach((item, index) => {
      if (!isRecord(item) || !isString(item.category) || !isNumber(item.value) || !isString(item.description)) throw new Error(`riskTypes[${index}] is invalid.`);
    });
  }
  return value;
}
