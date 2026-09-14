import { GoogleGenAI } from '@google/genai';
import type { CriticalPoint, GenerationEvent, GenerationTokens, GroundingChunk, RouteAnalysis, RouteOptions } from '../types';
import { calculateBreaks, calculateTruckDuration, getDirections, type DirectionsResult } from '../lib/googleMaps';
import { resolveGeminiModel, type GeminiModel } from '../lib/aiModels';
import { parseJsonResponse, validateCriticalAnalysis, validateRouteFallback, validateWeatherResults } from '../lib/analysisValidation';
import { estimateGeminiUsageCost } from '../lib/usageCost';

type Stage = Extract<GenerationEvent['stage'], 'route' | 'critical' | 'weather'>;
type UnknownRecord = Record<string, unknown>;
export type GeminiClient = Pick<GoogleGenAI, 'models'>;

const defaultGeminiClientFactory = (apiKey: string): GeminiClient => new GoogleGenAI({ apiKey });
let geminiClientFactory: (apiKey: string) => GeminiClient = defaultGeminiClientFactory;

/** Test-only seam. Pass no argument in cleanup to restore the production client factory. */
export const setGeminiClientFactoryForTests = (factory?: (apiKey: string) => GeminiClient) => {
  geminiClientFactory = factory ?? defaultGeminiClientFactory;
};

const asRecord = (value: unknown): UnknownRecord | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as UnknownRecord : undefined;

const asNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const sanitizeGroundingChunks = (value: unknown): GroundingChunk[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    const chunk = asRecord(item);
    const web = asRecord(chunk?.web);
    const maps = asRecord(chunk?.maps);
    const safe: GroundingChunk = {};
    if (web && (typeof web.uri === 'string' || typeof web.title === 'string')) {
      safe.web = { uri: typeof web.uri === 'string' ? web.uri : undefined, title: typeof web.title === 'string' ? web.title : undefined };
    }
    if (maps && (typeof maps.uri === 'string' || typeof maps.title === 'string' || typeof maps.placeId === 'string')) {
      safe.maps = { uri: typeof maps.uri === 'string' ? maps.uri : undefined, title: typeof maps.title === 'string' ? maps.title : undefined, placeId: typeof maps.placeId === 'string' ? maps.placeId : undefined };
    }
    return safe.web || safe.maps ? [safe] : [];
  });
};

const dedupeGroundingChunks = (chunks: GroundingChunk[]) => {
  const seen = new Set<string>();
  return chunks.filter(chunk => {
    const key = JSON.stringify(chunk);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const usageFromResponse = (response: unknown) => {
  const root = asRecord(response);
  const usage = asRecord(root?.usageMetadata);
  const candidates = Array.isArray(root?.candidates) ? root.candidates : [];
  const groundingMetadata = asRecord(asRecord(candidates[0])?.groundingMetadata);
  const tokens: GenerationTokens = {
    prompt: asNumber(usage?.promptTokenCount),
    candidate: asNumber(usage?.candidatesTokenCount),
    thoughts: asNumber(usage?.thoughtsTokenCount),
    cached: asNumber(usage?.cachedContentTokenCount),
    toolUse: asNumber(usage?.toolUsePromptTokenCount),
    total: asNumber(usage?.totalTokenCount)
  };
  const hasTokens = Object.values(tokens).some(value => value !== undefined);
  return {
    tokens: hasTokens ? tokens : undefined,
    searchQueryCount: Array.isArray(groundingMetadata?.webSearchQueries) ? groundingMetadata.webSearchQueries.filter(query => typeof query === 'string').length : 0,
    sourceCount: Array.isArray(groundingMetadata?.groundingChunks) ? groundingMetadata.groundingChunks.length : 0,
    sources: sanitizeGroundingChunks(groundingMetadata?.groundingChunks)
  };
};

const emitUsage = async (callback: RouteOptions['onUsage'] | undefined, event: GenerationEvent) => {
  if (callback) await callback(event);
};

const geminiEvent = (
  stage: Stage,
  model: GeminiModel,
  outcome: GenerationEvent['outcome'],
  durationMs: number,
  usage?: ReturnType<typeof usageFromResponse>,
  error?: string
): GenerationEvent => {
  const estimatedCost = estimateGeminiUsageCost({
    model,
    tokens: usage?.tokens,
    groundedPromptCount: stage === 'route' ? 0 : 1,
    searchQueryCount: usage?.searchQueryCount ?? 0
  });
  return {
    provider: 'gemini', stage, model, outcome, durationMs, tokens: usage?.tokens,
    searchQueryCount: usage?.searchQueryCount ?? 0, sourceCount: usage?.sourceCount ?? 0, estimatedCost,
    routeSource: stage === 'route' ? 'gemini_fallback' : undefined, error,
    promptTokens: usage?.tokens?.prompt, candidateTokens: usage?.tokens?.candidate,
    thoughtsTokens: usage?.tokens?.thoughts, cachedTokens: usage?.tokens?.cached,
    toolPromptTokens: usage?.tokens?.toolUse, tokenCostUsd: estimatedCost.tokenUsd,
    searchCostUsd: estimatedCost.searchUsd, mapsCostUsd: null
  };
};

const generateWithTelemetry = async (
  ai: GeminiClient,
  params: Parameters<GoogleGenAI['models']['generateContent']>[0],
  stage: Stage,
  model: GeminiModel,
  options?: RouteOptions
) => {
  const startedAt = Date.now();
  let response;
  try {
    response = await ai.models.generateContent(params);
  } catch (error) {
    await emitUsage(options?.onUsage, geminiEvent(stage, model, 'error', Date.now() - startedAt, undefined, error instanceof Error ? error.message : 'Gemini request failed.'));
    throw error;
  }
  // Deliberately outside the API try/catch: a durable telemetry failure must not retry a paid call.
  const usage = usageFromResponse(response);
  await emitUsage(options?.onUsage, geminiEvent(stage, model, 'success', Date.now() - startedAt, usage));
  return response;
};

const routeAgent = async (ai: GeminiClient, model: GeminiModel, origin: string, destination: string, originCoords?: string, destCoords?: string, options?: RouteOptions) => {
  let mapsData: DirectionsResult | null = null;
  if (originCoords && destCoords) {
    mapsData = await getDirections(originCoords, destCoords, {
      useTolls: options?.useTolls, stopCoords: options?.stopCoords,
      departureTime: options?.departureTime ? new Date(options.departureTime) : undefined, onUsage: options?.onUsage
    });
  }
  if (mapsData) {
    const distanceKm = mapsData.distance.value / 1000;
    const truckDuration = calculateTruckDuration(mapsData.distance.value);
    const breaks = calculateBreaks(truckDuration.hours);
    const totalHours = truckDuration.hours + breaks.totalBreakMinutes / 60;
    const hours = Math.floor(totalHours);
    return { totalDistance: `${distanceKm.toFixed(0)} km`, estimatedDuration: `${hours} sa ${Math.round((totalHours - hours) * 60)} dk`, routeDescription: `${origin} → ${destination}. Güzergah: ${mapsData.summary}`, estimatedArrivalHours: totalHours };
  }
  const prompt = `
    GÖREV: Tır Rota Hesabı.
    NEREDEN: ${origin}
    NEREYE: ${destination}
    TERCİHLER: ${options?.useTolls ? 'Ücretli yollar OK' : 'Ücretsiz yol'}
    ÇIKTI: JSON { "totalDistance": "km", "estimatedDuration": "sa dk", "routeDescription": "özet", "estimatedArrivalHours": number }
  `;
  const response = await generateWithTelemetry(ai, { model, contents: prompt }, 'route', model, options);
  return validateRouteFallback(parseJsonResponse(response.text));
};

const weatherAgent = async (ai: GeminiClient, model: GeminiModel, locations: { name: string; role: 'origin' | 'destination' | 'waypoint'; timeOffset: number }[], options?: RouteOptions) => {
  const now = new Date();
  const weatherRequests = locations.map(location => {
    const time = new Date(now.getTime() + location.timeOffset * 60 * 60 * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    return `${location.name} (${location.role === 'origin' ? 'ŞİMDİ' : `Saat ${time}`})`;
  }).join(', ');
  const prompt = `
    GÖREV: Aşağıdaki konumlar ve saatler için hava durumu tahmini yap.
    KONUMLAR: ${weatherRequests}
    ARAÇ: Google Search kullanarak anlık/tahmini hava durumunu bul.
    JSON FORMATI (Array): [ { "location": "Şehir Adı", "temp": "15°C", "condition": "Yağmurlu", "icon": "rainy" } ]
    * icon seçenekleri: sunny, cloudy, rainy, storm, snow, fog.
  `;
  const response = await generateWithTelemetry(ai, { model, contents: prompt, config: { tools: [{ googleSearch: {} }] } }, 'weather', model, options);
  return { data: validateWeatherResults(parseJsonResponse(response.text)), sources: usageFromResponse(response).sources };
};

const criticalAnalysisAgent = async (ai: GeminiClient, model: GeminiModel, routeDescription: string, origin: string, destination: string, durationHours: number, options?: RouteOptions) => {
  const prompt = `
    GÖREV: Tır rotası için Kapsamlı Risk ve Kritik Nokta Analizi.
    ROTA: ${origin} -> ${destination}
    GÜZERGAH DETAYI: ${routeDescription}
    SÜRE: ${durationHours.toFixed(1)} saat
    EK KAYNAKLAR: https://yol.kgm.gov.tr/KazaKaraNoktaWeb/ (Kaza Kara Noktaları) verisine benzer verileri ara.
    ARAÇLAR: Google Search ile trafik, yol çalışmaları, kaza kara noktaları ve hava durumu uyarılarını ara.
    İSTENEN ÇIKTILAR (JSON): riskIntensity, timeline, criticalPoints, routeSchematic, mandatoryBreak, breakNote.
    JSON FORMATI: { "riskIntensity": [ { "name": "Bölge", "value": 50, "color": "#hex" } ], "timeline": [ { "title": "Başlık", "description": "Detay", "type": "info", "icon": "traffic" } ], "criticalPoints": [ { "id": "1", "coordinate": "32.85,39.92", "timeOffsetHours": 3.5, "weather": { "location": "Bölge", "temp": "-", "condition": "-", "icon": "cloudy" }, "traffic": { "status": "heavy", "description": "Yoğun trafik", "tollInfo": "Ücretli" }, "incident": { "type": "accident", "description": "Kaza Kara Noktası", "source": "KGM" } } ], "routeSchematic": { "nodes": [ { "name": "İstanbul", "type": "origin", "distanceFromStart": "0 km", "timeFromStart": "0s 0dk" } ], "totalDistance": "450 km", "totalDuration": "5s 30dk" }, "mandatoryBreak": "Gerekir/Gerekmez", "breakNote": "4.5 saat kuralı..." }
  `;
  const response = await generateWithTelemetry(ai, { model, contents: prompt, config: { tools: [{ googleSearch: {} }] } }, 'critical', model, options);
  return { data: validateCriticalAnalysis(parseJsonResponse(response.text)), sources: usageFromResponse(response).sources };
};

export const analyzeRoute = async (originName: string, destinationName: string, originCoords?: string, destCoords?: string, options?: RouteOptions): Promise<RouteAnalysis> => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) throw new Error('Gemini API key is not configured (GEMINI_API_KEY).');
  const model = resolveGeminiModel(options?.model);
  const ai = geminiClientFactory(apiKey);
  const routeData = await routeAgent(ai, model, originName, destinationName, originCoords, destCoords, options);
  const criticalResult = await criticalAnalysisAgent(ai, model, routeData.routeDescription, originName, destinationName, routeData.estimatedArrivalHours, options);
  const analysis = criticalResult.data;
  const criticalPoints = analysis.criticalPoints as CriticalPoint[];
  const locations: { name: string; role: 'origin' | 'destination' | 'waypoint'; timeOffset: number }[] = [{ name: originName, role: 'origin', timeOffset: 0 }];
  criticalPoints.forEach(point => locations.push({ name: point.weather.location, role: 'waypoint', timeOffset: point.timeOffsetHours ?? routeData.estimatedArrivalHours / 2 }));
  locations.push({ name: destinationName, role: 'destination', timeOffset: routeData.estimatedArrivalHours });
  const weatherResult = await weatherAgent(ai, model, locations, options);
  const weatherResults = weatherResult.data;
  const weatherOrigin = weatherResults.find(weather => weather.location.includes(originName)) ?? weatherResults[0];
  const weatherDestination = weatherResults.find(weather => weather.location.includes(destinationName)) ?? weatherResults.at(-1);
  if (!weatherOrigin || !weatherDestination) throw new Error('Validated weather response had no origin or destination result.');
  return {
    summary: { totalDistance: routeData.totalDistance, estimatedDuration: routeData.estimatedDuration, mandatoryBreak: analysis.mandatoryBreak as string, breakNote: analysis.breakNote as string },
    weather: { origin: { ...weatherOrigin, location: originName }, destination: { ...weatherDestination, location: destinationName }, waypoints: weatherResults.filter(weather => !weather.location.includes(originName) && !weather.location.includes(destinationName)) },
    riskIntensity: analysis.riskIntensity as RouteAnalysis['riskIntensity'], riskTypes: (analysis.riskTypes ?? []) as RouteAnalysis['riskTypes'], timeline: analysis.timeline as RouteAnalysis['timeline'],
    criticalPoints: criticalPoints.map(point => ({ ...point, weather: weatherResults.find(weather => weather.location === point.weather.location) ?? point.weather })),
    routeSchematic: analysis.routeSchematic as RouteAnalysis['routeSchematic'],
    groundingMetadata: dedupeGroundingChunks([...criticalResult.sources, ...weatherResult.sources])
  };
};
