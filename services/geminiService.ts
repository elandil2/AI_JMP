import { GoogleGenAI } from '@google/genai';
import type { CriticalPoint, GenerationEvent, GenerationTokens, GroundingChunk, RouteAnalysis, RouteOptions, WeatherInfo } from '../types';
import { getDirections, type DirectionsResult } from '../lib/googleMaps';
import { mapsTiming, reconcileSchematic } from '../lib/routeTiming';
import { checkCoordinateAgainstRoute } from '../lib/routeGeometry';
import type { SummaryStats } from '../types';
import { resolveGeminiModel, type GeminiModel } from '../lib/aiModels';
import { parseJsonResponse, validateCriticalAnalysis, validateRouteFallback, validateWeatherResults } from '../lib/analysisValidation';
import { estimateGeminiUsageCost } from '../lib/usageCost';
import { buildMapsRoutePlan } from '../lib/mapsRoutePlan';
import { reverseGeocodeRouteCheckpoints } from '../lib/mapboxGeocoding';
import { retrieveMapboxDrivingIncidents } from '../lib/mapboxIncidents';
import { aggregateRouteWarnings } from '../lib/riskAggregation';
import { retrieveTomTomIncidents } from '../lib/tomtomIncidents';
import { buildRouteTimeline } from '../lib/routeTimelineBuilder';

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
    const routePlan = buildMapsRoutePlan(mapsData, { originName: origin, destinationName: destination });
    const stride = Math.max(1, Math.ceil(mapsData.steps.length / 40));
    const routeSteps = mapsData.steps.filter((_, index) => index % stride === 0)
      .map(step => step.instruction).filter(Boolean).join(' · ').slice(0, 3500);
    return { totalDistance: timing.summary.totalDistance, distanceMeters: mapsData.distance.value, estimatedDuration: timing.summary.estimatedDuration, routeDescription: `${origin} → ${destination}. Google Maps otomobil yolu: ${mapsData.summary}. Yol adımları: ${routeSteps}`, estimatedArrivalHours: timing.totalHours, drivingHours: timing.drivingHours, summary: timing.summary, mapsPolyline: mapsData.polyline, routePlan };
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
  return { ...result.data, distanceMeters: undefined, drivingHours: result.data.estimatedArrivalHours, summary, mapsPolyline: undefined, routePlan: undefined };
};

type WeatherRequestLocation = { name: string; role: 'origin' | 'destination' | 'waypoint'; timeOffset: number; coordinate?: string };
const weatherAgent = async (ai: GeminiClient, model: GeminiModel, locations: WeatherRequestLocation[], options?: RouteOptions) => {
  const now = options?.departureTime ? new Date(options.departureTime) : new Date();
  const weatherRequests = locations.map(location => {
    const time = new Date(now.getTime() + location.timeOffset * 60 * 60 * 1000).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'short', timeStyle: 'short' });
    return `${location.name} (${location.role}, koordinat ${location.coordinate ?? 'belirtilmedi'}, Türkiye saati ${time})`;
  }).join(', ');
  const prompt = `
    GÖREV: Aşağıdaki konumlar ve saatler için hava durumu tahmini yap.
    KONUMLAR: ${weatherRequests}
    ARAÇ: Google Search ile özellikle MGM'nin ilgili il/ilçe tahminini araştır. Bir yerin tahminini başka yere taşıma; geçiş saatine en yakın tahmini kullan.
    JSON FORMATI (Array): [ { "location": "verilen adın aynısı", "temp": "15°C", "condition": "Yağmurlu", "icon": "rainy", "sourceUrl": "doğrudan tahmin sayfası URL'si", "forecastTime": "ISO zaman" } ]
    * icon seçenekleri: sunny, cloudy, rainy, storm, snow, fog, unknown.
    Her konumu verilen adıyla aynen döndür. Bir tahmini kaynak ve zamanıyla ilişkilendiremiyorsan temp: "-", condition: "Hava durumu doğrulanamadı", icon: "unknown" kullan; değer uydurma. Yalnızca JSON dizisi döndür.
  `;
  return generateWithTelemetry(ai, { model, contents: prompt, config: { tools: [{ googleSearch: {} }] } }, 'weather', model, validateWeatherResults, options);
};

const criticalAnalysisAgent = async (ai: GeminiClient, model: GeminiModel, routeDescription: string, origin: string, destination: string, durationHours: number, summary: SummaryStats, options?: RouteOptions) => {
  const prompt = `
    GÖREV: Aşağıdaki Google Maps otomobil rotası yakınındaki güncel yol uyarısı adaylarını araştır.
    ROTA: ${origin} -> ${destination}
    GÜZERGAH DETAYI: ${routeDescription}
    SÜRE: ${durationHours.toFixed(1)} saat
    HESAPLANMIŞ PLAN: ${JSON.stringify(summary)}
    HAREKET: ${options?.departureTime ?? new Date().toISOString()}. Saat dilimi Europe/Istanbul.
    Google Search ile erişebildiğin kaynakları araştır. Bu arama zorunlu kaynakların tamamının kontrol edildiği anlamına gelmez.
    Öncelikle KGM'nin güzergâhla ilgili bölgesel yol çalışması sayfalarını, sonra varsa güncel olay kaynaklarını ara. Günlük özet tek başına yeterli değildir.
    Yalnızca {"criticalPoints": [...]} biçiminde geçerli JSON döndür. Her aday için sadece {"coordinate":"enlem,boylam","location":"yakın yer veya yol","incident":{"type":"roadwork|accident|closure|traffic|hazard","description":"kaynağın belirttiği somut olay ve yol kesimi","source":"doğrudan kaynak URL'si"}} alanlarını ver.
    Hava, trafik yoğunluğu, süre, mola, şema veya risk yüzdesi üretme; bunları kod/ayrı servis hesaplayacak. Bir olay için koordinat ve doğrudan kaynak URL'si bulamıyorsan o olayı ekleme.
    Yalnızca güncel ve rota ile ilişkili uyarı adaylarını ekle. Kaynağın olay zamanı veya rota ilişkisi belirsizse kesin olay iddiası yazma. Bulamazsan criticalPoints boş dizi olsun.
  `;
  return generateWithTelemetry(ai, { model, contents: prompt, config: { tools: [{ googleSearch: {} }] } }, 'critical', model, value => validateCriticalAnalysis(value, { dropInvalidPoints: true }), options);
};

export const analyzeRoute = async (originName: string, destinationName: string, originCoords?: string, destCoords?: string, options?: RouteOptions): Promise<RouteAnalysis> => {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) throw new Error('Gemini API key is not configured (GEMINI_API_KEY).');
  const model = resolveGeminiModel(options?.model);
  const ai = geminiClientFactory(apiKey);
  const routeData = await routeAgent(ai, model, originName, destinationName, originCoords, destCoords, options);
  const checkpoints = routeData.routePlan?.weatherCheckpoints ?? [];
  const kgmResearchLicensed = process.env.KGM_COMMERCIAL_DATA_PERMISSION === 'yes';
  const [criticalOutcome, placeLabels, mapboxCoverage, tomtomCoverage] = await Promise.all([
    kgmResearchLicensed
      ? criticalAnalysisAgent(ai, model, routeData.routeDescription, originName, destinationName, routeData.estimatedArrivalHours, routeData.summary, options)
        .then(result => ({ result, failed: false as const }))
        .catch(() => ({ result: { data: { criticalPoints: [] as CriticalPoint[], invalidCriticalPointCount: 0 }, sources: [] as GroundingChunk[] }, failed: true as const }))
      : Promise.resolve({ result: { data: { criticalPoints: [] as CriticalPoint[], invalidCriticalPointCount: 0 }, sources: [] as GroundingChunk[] }, failed: false as const }),
    reverseGeocodeRouteCheckpoints(checkpoints.map(point => ({ coordinate: point.coordinate, mapsRoadLabel: point.roadLabel }))),
    routeData.mapsPolyline
      ? retrieveMapboxDrivingIncidents({ googleEncodedPolyline: routeData.mapsPolyline })
      : Promise.resolve(null),
    routeData.mapsPolyline
      ? retrieveTomTomIncidents({ googleEncodedPolyline: routeData.mapsPolyline })
      : Promise.resolve(null)
  ]);
  const criticalResult = criticalOutcome.result;
  const analysis = criticalResult.data;
  const omittedMalformedPoints = typeof analysis.invalidCriticalPointCount === 'number' ? analysis.invalidCriticalPointCount : 0;
  const criticalPoints = analysis.criticalPoints as CriticalPoint[];
  // Model output is only an event candidate. Position/time come from the Maps route.
  const assessedPoints = criticalPoints.map(point => {
    const routeVerification = checkCoordinateAgainstRoute(routeData.mapsPolyline, point.coordinate);
    const progress = routeVerification.progress;
    const drivenHours = progress === undefined ? undefined : progress * routeData.drivingHours;
    const completedRestHours = drivenHours === undefined ? 0 : (routeData.routePlan?.breakTargets ?? [])
      .filter(rest => rest.driveThresholdHours < drivenHours)
      .reduce((sum, rest) => sum + rest.breakMinutes / 60, 0);
    return { ...point, routeVerification, timeOffsetHours: drivenHours === undefined ? undefined : drivenHours + completedRestHours,
      provenance: { provider: 'gemini_search' as const, status: 'source_candidate' as const } };
  });
  const hasDirectSource = (source: string | undefined) => {
    if (!source) return false;
    try {
      const url = new URL(source);
      return url.protocol === 'https:' && (url.hostname === 'kgm.gov.tr' || url.hostname.endsWith('.kgm.gov.tr'));
    } catch {
      return false;
    }
  };
  const corridorPoints = assessedPoints.filter(point => point.routeVerification.status === 'corridor_candidate');
  const sourcedCorridorPoints = corridorPoints.filter(point => hasDirectSource(point.incident.source));
  const routeCheckedPoints = criticalResult.sources.length > 0 ? sourcedCorridorPoints : [];
  const omittedUnsourcedPoints = corridorPoints.length - sourcedCorridorPoints.length;
  const omittedUngroundedPoints = criticalResult.sources.length > 0 ? 0 : sourcedCorridorPoints.length;
  const namedCheckpoints = checkpoints.map((point, index) => ({
    ...point,
    name: `${placeLabels[index]?.label ?? point.name} · ${Math.round(point.distanceFromStartMeters / 1000)} km`
  }));
  const locations: WeatherRequestLocation[] = [{ name: originName, role: 'origin', timeOffset: 0, coordinate: originCoords }];
  namedCheckpoints.forEach(point => locations.push({ name: point.name, role: 'waypoint', timeOffset: point.timeOffsetHours, coordinate: `${point.coordinate.lat},${point.coordinate.lng}` }));
  locations.push({ name: destinationName, role: 'destination', timeOffset: routeData.estimatedArrivalHours, coordinate: destCoords });
  const weatherResult = await weatherAgent(ai, model, locations, options)
    .catch(() => ({ data: [] as WeatherInfo[], sources: [] as GroundingChunk[] }));
  const weatherResults = weatherResult.data;
  const locationKey = (name: string) => name.toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}]/gu, '');
  const findWeather = (name: string) => weatherResults.find(weather =>
    locationKey(weather.location) === locationKey(name) || weather.location.startsWith(`${name} (`));
  const unknownWeather = (location: string): WeatherInfo => ({ location, temp: '-', condition: 'Hava durumu doğrulanamadı', icon: 'unknown', source: 'unavailable' });
  const resolvedWeather = (location: string): WeatherInfo => {
    const request = locations.find(item => item.name === location);
    const departure = options?.departureTime ? new Date(options.departureTime) : new Date();
    const passageTime = request && Number.isFinite(departure.getTime())
      ? new Date(departure.getTime() + request.timeOffset * 3_600_000).toISOString() : undefined;
    const found = findWeather(location);
    if (!found || found.temp === '-' || found.icon === 'unknown') return { ...unknownWeather(location), passageTime };
    let sourceUrl: string | undefined;
    try {
      const candidate = new URL(found.sourceUrl ?? '');
      if (weatherResult.sources.length > 0 && candidate.protocol === 'https:' && (candidate.hostname === 'mgm.gov.tr' || candidate.hostname.endsWith('.mgm.gov.tr'))) sourceUrl = candidate.href;
    } catch { /* The source is unlinked when Gemini did not return a safe official URL. */ }
    const forecastTime = weatherResult.sources.length > 0 && found.forecastTime && Number.isFinite(Date.parse(found.forecastTime)) ? found.forecastTime : undefined;
    return { ...found, location, source: weatherResult.sources.length > 0 ? 'gemini_search' : 'ai_unverified', sourceUrl, forecastTime, passageTime };
  };
  const weatherOrigin = resolvedWeather(originName);
  const weatherDestination = resolvedWeather(destinationName);
  const routeSchematic = routeData.routePlan
    ? { ...routeData.routePlan.routeSchematic, nodes: (() => {
      let checkpointIndex = 0;
      return routeData.routePlan.routeSchematic.nodes.map(node => node.type === 'stop'
        ? { ...node, name: `${placeLabels[checkpointIndex]?.label ?? checkpoints[checkpointIndex]?.name ?? node.name} · ${checkpoints[checkpointIndex++]?.roadLabel ?? 'Google Maps yolu'}` }
        : node);
    })() }
    : reconcileSchematic(undefined, originName, destinationName, routeData.summary, routeData.estimatedArrivalHours);
  const mapboxPoints: CriticalPoint[] = (mapboxCoverage?.incidents ?? [])
    .filter(event => event.status === 'active' || event.status === 'planned')
    .map(event => ({
      id: `mapbox-${event.id}`, coordinate: `${event.coordinate.lat},${event.coordinate.lng}`,
      routeVerification: { status: 'corridor_candidate', distanceKm: event.distanceToGoogleRouteKm, progress: event.routeProgress },
      timeOffsetHours: event.routeProgress * routeData.estimatedArrivalHours,
      provenance: { provider: 'mapbox', status: 'provider_event', fetchedAt: mapboxCoverage?.fetchedAt, recordId: event.id },
      weather: unknownWeather(event.affectedRoadNames[0] ?? 'Rota üzeri'),
      traffic: { status: event.type === 'congestion' ? 'heavy' : 'unknown', description: 'Mapbox trafik olayı; gerçek seyahat yönü ayrıca doğrulanmalı' },
      incident: {
        type: event.type === 'construction' ? 'roadwork' : event.type === 'accident' ? 'accident' : event.type === 'road_closure' ? 'closure' : event.type === 'congestion' ? 'traffic' : 'hazard',
        description: event.description, source: event.sourceUrl
      }
    }));
  const tomtomPoints: CriticalPoint[] = (tomtomCoverage?.incidents ?? []).map(event => ({
    id: `tomtom-${event.id}`, coordinate: `${event.coordinate.lat},${event.coordinate.lng}`,
    routeVerification: { status: 'corridor_candidate', distanceKm: event.distanceToGoogleRouteKm, progress: event.routeProgress },
    timeOffsetHours: event.routeProgress * routeData.estimatedArrivalHours,
    provenance: { provider: 'tomtom', status: 'provider_event', fetchedAt: tomtomCoverage?.fetchedAt, recordId: event.id },
    weather: unknownWeather(event.roadNumbers[0] ?? event.from ?? 'Rota üzeri'),
    traffic: { status: event.category === 'road_closed' ? 'stopped' : event.category === 'lane_closed' ? 'moderate' : 'unknown', description: 'TomTom olay adayı; Google rotasının aynı yol ve yönü ayrıca doğrulanmalı' },
    incident: { type: event.category === 'road_works' ? 'roadwork' : event.category === 'accident' ? 'accident' : event.category === 'road_closed' ? 'closure' : 'traffic',
      description: event.description, source: event.sourceUrl }
  }));
  const allPoints = [...tomtomPoints, ...mapboxPoints, ...routeCheckedPoints]
    .sort((a, b) => (a.routeVerification?.progress ?? 1) - (b.routeVerification?.progress ?? 1));
  const risk = aggregateRouteWarnings(allPoints, routeData.distanceMeters,
    namedCheckpoints.map(point => ({ name: point.name, distanceFromStartMeters: point.distanceFromStartMeters })), destinationName);
  return {
    summary: {
      ...routeData.summary,
      sourceCoverage: 'unverified',
      incidentProviderCoverage: tomtomCoverage?.status === 'available' || mapboxCoverage?.status === 'available'
        ? 'available' : tomtomCoverage?.status === 'partial' ? 'partial'
        : tomtomCoverage?.status === 'unknown' || mapboxCoverage?.status === 'unknown' ? 'unknown' : 'unavailable',
      mapboxTrafficCoverage: mapboxCoverage?.trafficCoverage ? {
        routeDistanceKm: mapboxCoverage.trafficCoverage.annotatedDistanceKm,
        knownDistanceKm: mapboxCoverage.trafficCoverage.knownDistanceKm,
        knownPercent: mapboxCoverage.trafficCoverage.knownPercent,
        moderateDistanceKm: mapboxCoverage.trafficCoverage.moderateDistanceKm,
        heavyDistanceKm: mapboxCoverage.trafficCoverage.heavyDistanceKm
      } : undefined,
      omittedUnsourcedPoints,
      omittedUngroundedPoints,
      omittedMalformedPoints,
      routeNotice: `${routeData.summary.routeNotice ?? ''}${criticalOutcome.failed ? ' Yol uyarısı araştırması tamamlanamadı.' : ''}${!kgmResearchLicensed ? ' KGM otomatik içerik kullanımı için ticari veri izni tanımlı değil.' : ''}`.trim()
    },
    weather: {
      origin: { ...weatherOrigin, location: originName }, destination: { ...weatherDestination, location: destinationName },
      waypoints: namedCheckpoints.map(point => resolvedWeather(point.name))
    },
    riskIntensity: risk.riskIntensity, riskTypes: risk.riskTypes,
    timeline: buildRouteTimeline(routeSchematic, allPoints, options?.departureTime),
    criticalPoints: allPoints,
    routeSchematic,
    groundingMetadata: dedupeGroundingChunks([...criticalResult.sources, ...weatherResult.sources])
  };
};
