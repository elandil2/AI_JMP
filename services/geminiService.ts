import { GoogleGenAI } from '@google/genai';
import type { CriticalPoint, GenerationEvent, GenerationTokens, GroundingChunk, RouteAnalysis, RouteOptions } from '../types';
import { getDirections, type DirectionsResult } from '../lib/googleMaps';
import { mapsTiming, reconcileSchematic } from '../lib/routeTiming';
import type { SummaryStats } from '../types';
import { resolveGeminiModel, type GeminiModel } from '../lib/aiModels';
import { parseJsonResponse, validateCriticalAnalysis, validateRouteFallback, validateWeatherResults } from '../lib/analysisValidation';
import { estimateGeminiUsageCost } from '../lib/usageCost';

type Stage = Extract<GenerationEvent['stage'], 'route' | 'critical' | 'weather'>;
type UnknownRecord = Record<string, unknown>;
export type GeminiClient = Pick<GoogleGenAI, 'models'>;

const defaultGeminiClientFactory = (apiKey: string): GeminiClient => new GoogleGenAI({ apiKey, httpOptions: { timeout: 80000 } });
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

const generateWithTelemetry = async <T>(
  ai: GeminiClient,
  params: Parameters<GoogleGenAI['models']['generateContent']>[0],
  stage: Stage,
  model: GeminiModel,
  validate: (value: unknown) => T,
  options?: RouteOptions
) => {
  const startedAt = Date.now();
  let response;
  try {
    response = await ai.models.generateContent(params);
  } catch (error) {
    const status = asNumber(asRecord(error)?.status);
    const message = `Gemini request failed${status ? ` (HTTP ${status})` : ''}. No automatic retry was made.`;
    await emitUsage(options?.onUsage, geminiEvent(stage, model, 'error', Date.now() - startedAt, undefined, message));
    throw new Error(message);
  }
  // Deliberately outside the API try/catch: a durable telemetry failure must not retry a paid call.
  const usage = usageFromResponse(response);
  let data: T;
  try {
    data = validate(parseJsonResponse(response.text));
  } catch (error) {
    const event = geminiEvent(stage, model, 'error', Date.now() - startedAt, usage, error instanceof Error ? error.message : 'Invalid generated output.');
    event.errorCode = 'invalid_generated_output';
    await emitUsage(options?.onUsage, event);
    throw error;
  }
  await emitUsage(options?.onUsage, geminiEvent(stage, model, 'success', Date.now() - startedAt, usage));
  return { data, sources: usage.sources };
};

const routeAgent = async (ai: GeminiClient, model: GeminiModel, origin: string, destination: string, originCoords?: string, destCoords?: string, options?: RouteOptions) => {
  let mapsData: DirectionsResult | null = null;
  if (originCoords && destCoords) {
    mapsData = await getDirections(originCoords, destCoords, {
      useTolls: options?.useTolls, stopCoords: options?.stopCoords,
      departureTime: options?.departureTime ? new Date(options.departureTime) : new Date(), onUsage: options?.onUsage
    });
  }
  if (mapsData) {
    const timing = mapsTiming(mapsData);
    return { totalDistance: timing.summary.totalDistance, estimatedDuration: timing.summary.estimatedDuration, routeDescription: `${origin} → ${destination}. Güzergah: ${mapsData.summary}`, estimatedArrivalHours: timing.totalHours, summary: timing.summary };
  }
  const prompt = `
    GÖREV: Tır Rota Hesabı.
    NEREDEN: ${origin}
    NEREYE: ${destination}
    TERCİHLER: ${options?.useTolls ? 'Ücretli yollar OK' : 'Ücretsiz yol'}
    ÇIKTI: JSON { "totalDistance": "km", "estimatedDuration": "sa dk", "routeDescription": "özet", "estimatedArrivalHours": number }
  `;
  const result = await generateWithTelemetry(ai, { model, contents: prompt }, 'route', model, validateRouteFallback, options);
  const summary: SummaryStats = { totalDistance: result.data.totalDistance, estimatedDuration: result.data.estimatedDuration,
    mandatoryBreak: 'Doğrulanamadı', breakNote: 'Maps rota hesabı alınamadı. Süre ve mola planı doğrulanamadı.',
    durationLabel: 'AI süre tahmini — doğrulanmadı', routeNotice: 'Google Maps rota verisi alınamadı. Mesafe, süre ve güzergâh AI tahminidir; tır rotası olarak doğrulanmamıştır.', generatedAt: new Date().toISOString() };
  return { ...result.data, summary };
};

const weatherAgent = async (ai: GeminiClient, model: GeminiModel, locations: { name: string; role: 'origin' | 'destination' | 'waypoint'; timeOffset: number }[], options?: RouteOptions) => {
  const now = options?.departureTime ? new Date(options.departureTime) : new Date();
  const weatherRequests = locations.map(location => {
    const time = new Date(now.getTime() + location.timeOffset * 60 * 60 * 1000).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short' });
    return `${location.name} (${location.role}, Türkiye saati ${time})`;
  }).join(', ');
  const prompt = `
    GÖREV: Aşağıdaki konumlar ve saatler için hava durumu tahmini yap.
    KONUMLAR: ${weatherRequests}
    ARAÇ: Google Search kullanarak anlık/tahmini hava durumunu bul.
    JSON FORMATI (Array): [ { "location": "Şehir Adı", "temp": "15°C", "condition": "Yağmurlu", "icon": "rainy" } ]
    * icon seçenekleri: sunny, cloudy, rainy, storm, snow, fog.
    Her konumu verilen adıyla aynen döndür. Temp Celsius metni olmalı. Tahmin bulunamıyorsa temp: "-", condition: "Hava durumu doğrulanamadı", icon: "unknown" kullan; değer uydurma. Yalnızca JSON dizisi döndür.
  `;
  return generateWithTelemetry(ai, { model, contents: prompt, config: { tools: [{ googleSearch: {} }] } }, 'weather', model, validateWeatherResults, options);
};

const criticalAnalysisAgent = async (ai: GeminiClient, model: GeminiModel, routeDescription: string, origin: string, destination: string, durationHours: number, summary: SummaryStats, options?: RouteOptions) => {
  const prompt = `
    GÖREV: Tır rotası için Kapsamlı Risk ve Kritik Nokta Analizi.
    ROTA: ${origin} -> ${destination}
    GÜZERGAH DETAYI: ${routeDescription}
    SÜRE: ${durationHours.toFixed(1)} saat
    HESAPLANMIŞ PLAN: ${JSON.stringify(summary)}
    HAREKET: ${options?.departureTime ?? new Date().toISOString()}. Saat dilimi Europe/Istanbul.
    EK KAYNAKLAR: https://yol.kgm.gov.tr/KazaKaraNoktaWeb/ (Kaza Kara Noktaları) verisine benzer verileri ara.
    ARAÇLAR: Google Search ile trafik, yol çalışmaları, kaza kara noktaları ve hava durumu uyarılarını ara.
    Yalnızca geçerli bir JSON nesnesi döndür; aşağıdaki alan adlarını değiştirme.
    riskIntensity: en az bir bölge; name, 0-100 arası sayısal value, #RRGGBB color.
    timeline: başlangıç, yol üzerindeki önemli noktalar, planlı mola ve varış. Her elemanda id, title, description, type zorunlu. type yalnızca start/info/warning/danger/break/end/stop. Icon yalnızca görseldir.
    criticalPoints: en az bir anlamlı rota noktası. Her elemanda id, coordinate (enlem,boylam), sayısal timeOffsetHours, weather, traffic, incident.
    weather: location, temp (Celsius metni veya "-"), condition, icon (sunny/cloudy/rainy/storm/snow/fog/unknown).
    traffic: status (fluid/moderate/heavy/stopped/unknown), description, varsa tollInfo.
    incident: type (accident/roadwork/none/weather/break/traffic/hazard/closure/speed/tunnel/info/warning), description, varsa doğrulanmış source URL'si.
    routeSchematic: nodes dizisi; her düğüm name, type (origin/destination/stop/break/critical), distanceFromStart (km), timeFromStart ("3 sa 15 dk"). Düğümler zaman sırasıyla, varış en sonda olsun.
    Tüm varış/ara nokta saatleri HESAPLANMIŞ PLAN ile uyumlu olmalı; toplam süreyi yeniden hesaplama. timeOffsetHours mola dahil kalkıştan itibaren geçen süredir, ${durationHours.toFixed(2)} saati aşamaz.
    Güncel yol çalışması veya kaza doğrulanamıyorsa açıkça "Güncel bilgi doğrulanamadı" yaz; olasılığı kesin olay gibi sunma. Harita tır kısıtlarını doğrulamıyor; tır için güvenli/yasal güzergâh garantisi verme.
    ÖRNEK YAPI (içeriği gerçek rota için doldur):
    { "riskIntensity": [{"name":"Bölge","value":50,"color":"#f59e0b"}], "timeline": [{"id":"1","title":"Başlangıç","description":"Kalkış","type":"start"}], "criticalPoints": [{"id":"1","coordinate":"39.9334,32.8597","timeOffsetHours":1,"weather":{"location":"Bölge","temp":"-","condition":"Hava durumu doğrulanamadı","icon":"unknown"},"traffic":{"status":"unknown","description":"Güncel bilgi doğrulanamadı"},"incident":{"type":"info","description":"Güncel bilgi doğrulanamadı"}}], "routeSchematic":{"nodes":[{"name":"Başlangıç","type":"origin","distanceFromStart":"0 km","timeFromStart":"0 sa 0 dk"}],"totalDistance":"${summary.totalDistance}","totalDuration":"${summary.estimatedDuration}"} }
  `;
  return generateWithTelemetry(ai, { model, contents: prompt, config: { tools: [{ googleSearch: {} }] } }, 'critical', model, validateCriticalAnalysis, options);
};

export const analyzeRoute = async (originName: string, destinationName: string, originCoords?: string, destCoords?: string, options?: RouteOptions): Promise<RouteAnalysis> => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) throw new Error('Gemini API key is not configured (GEMINI_API_KEY).');
  const model = resolveGeminiModel(options?.model);
  const ai = geminiClientFactory(apiKey);
  const routeData = await routeAgent(ai, model, originName, destinationName, originCoords, destCoords, options);
  const criticalResult = await criticalAnalysisAgent(ai, model, routeData.routeDescription, originName, destinationName, routeData.estimatedArrivalHours, routeData.summary, options);
  const analysis = criticalResult.data;
  const criticalPoints = analysis.criticalPoints as CriticalPoint[];
  const locations: { name: string; role: 'origin' | 'destination' | 'waypoint'; timeOffset: number }[] = [{ name: originName, role: 'origin', timeOffset: 0 }];
  criticalPoints.forEach(point => locations.push({ name: point.weather.location, role: 'waypoint', timeOffset: point.timeOffsetHours ?? routeData.estimatedArrivalHours / 2 }));
  locations.push({ name: destinationName, role: 'destination', timeOffset: routeData.estimatedArrivalHours });
  const weatherResult = await weatherAgent(ai, model, locations, options);
  const weatherResults = weatherResult.data;
  const locationKey = (name: string) => name.toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]/gu, '');
  const findWeather = (name: string) => weatherResults.find(weather => locationKey(weather.location) === locationKey(name));
  const unknownWeather = (location: string) => ({ location, temp: '-', condition: 'Hava durumu doğrulanamadı', icon: 'unknown' as const });
  const weatherOrigin = findWeather(originName) ?? unknownWeather(originName);
  const weatherDestination = findWeather(destinationName) ?? unknownWeather(destinationName);
  return {
    summary: routeData.summary,
    weather: { origin: { ...weatherOrigin, location: originName }, destination: { ...weatherDestination, location: destinationName }, waypoints: weatherResults.filter(weather => locationKey(weather.location) !== locationKey(originName) && locationKey(weather.location) !== locationKey(destinationName)) },
    riskIntensity: analysis.riskIntensity as RouteAnalysis['riskIntensity'], riskTypes: (analysis.riskTypes ?? []) as RouteAnalysis['riskTypes'], timeline: analysis.timeline as RouteAnalysis['timeline'],
    criticalPoints: criticalPoints.map(point => ({ ...point, weather: findWeather(point.weather.location) ?? point.weather })),
    routeSchematic: reconcileSchematic(analysis.routeSchematic as RouteAnalysis['routeSchematic'], originName, destinationName, routeData.summary, routeData.estimatedArrivalHours),
    groundingMetadata: dedupeGroundingChunks([...criticalResult.sources, ...weatherResult.sources])
  };
};
