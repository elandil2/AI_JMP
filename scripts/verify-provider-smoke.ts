/** Paid provider-only smoke test. No Supabase client is imported or written to. */
import nextEnv from '@next/env';
import { GoogleGenAI } from '@google/genai';
import { findLocation } from '../lib/location';
import { parseJsonResponse } from '../lib/analysisValidation';
import { analyzeRoute, setGeminiClientFactoryForTests, type GeminiClient } from '../services/geminiService';
import type { GenerationEvent } from '../types';
import { resolveGeminiModel } from '../lib/aiModels';

if (process.env.AI_JMP_ALLOW_PAID_PROVIDER_TEST !== 'yes') {
  throw new Error('Set AI_JMP_ALLOW_PAID_PROVIDER_TEST=yes to run paid Maps and Gemini requests.');
}

nextEnv.loadEnvConfig(process.cwd());

const origin = findLocation('İzmir', 'Menemen');
const destination = findLocation('Malatya', 'Arguvan');
if (![origin.lat, origin.lng, destination.lat, destination.lng].every(Number.isFinite)) {
  throw new Error('Test route coordinates are unavailable in cities.json.');
}

const events: Array<Pick<GenerationEvent, 'provider' | 'stage' | 'outcome' | 'durationMs' | 'sourceCount' | 'errorCode'>> = [];
const responseShapes: unknown[] = [];
const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? '', httpOptions: { timeout: 80000 } });
setGeminiClientFactoryForTests(() => ({
  models: {
    generateContent: async (params: Parameters<GoogleGenAI['models']['generateContent']>[0]) => {
      const response = await gemini.models.generateContent(params);
      try {
        const parsed = parseJsonResponse(response.text) as Record<string, unknown>;
        const points = Array.isArray(parsed.criticalPoints) ? parsed.criticalPoints : [];
        const first = points[0] && typeof points[0] === 'object' ? points[0] as Record<string, unknown> : {};
        responseShapes.push({
          keys: Object.keys(parsed),
          criticalCount: points.length,
          firstPointKeys: Object.keys(first),
          researchCandidates: points.slice(0, 8).map(item => {
            const point = item && typeof item === 'object' ? item as Record<string, unknown> : {};
            const incident = point.incident && typeof point.incident === 'object' ? point.incident as Record<string, unknown> : {};
            let sourceHost = '';
            try { sourceHost = new URL(String(incident.source ?? '')).hostname; } catch { /* no source URL */ }
            return { location: point.location, coordinate: point.coordinate, type: incident.type, description: incident.description, sourceHost };
          }),
          weatherItems: Array.isArray(parsed) ? parsed.map(item => {
            const point = item && typeof item === 'object' ? item as Record<string, unknown> : {};
            let sourceHost = '';
            try { sourceHost = new URL(String(point.sourceUrl ?? '')).hostname; } catch { /* no source URL */ }
            return { location: point.location, temp: point.temp, condition: point.condition, icon: point.icon, forecastTime: point.forecastTime, sourceHost };
          }) : undefined,
          coordinateType: typeof first.coordinate,
          timeOffsetType: typeof first.timeOffsetHours,
          weatherType: typeof first.weather,
          trafficType: typeof first.traffic,
          incidentType: typeof first.incident,
        });
      } catch {
        responseShapes.push({ parseableJson: false });
      }
      return response;
    },
  },
} as unknown as GeminiClient));

try {
  const analysis = await analyzeRoute(
    'İzmir, Menemen',
    'Malatya, Arguvan',
    `${origin.lat},${origin.lng}`,
    `${destination.lat},${destination.lng}`,
    {
      useTolls: true,
      model: resolveGeminiModel(process.env.AI_JMP_SMOKE_MODEL),
      departureTime: new Date().toISOString(),
      onUsage: (event) => {
        events.push({
          provider: event.provider,
          stage: event.stage,
          outcome: event.outcome,
          durationMs: event.durationMs,
          sourceCount: event.sourceCount,
          errorCode: event.errorCode,
        });
      },
    },
  );

  console.log(JSON.stringify({
    result: 'ok',
    distance: analysis.summary.totalDistance,
    estimatedDuration: analysis.summary.estimatedDuration,
    sourceCoverage: analysis.summary.sourceCoverage,
    criticalPoints: analysis.criticalPoints?.length ?? 0,
    corridorCandidates: analysis.criticalPoints?.filter(point => point.routeVerification?.status === 'corridor_candidate').length ?? 0,
    unverifiedPoints: analysis.criticalPoints?.filter(point => point.routeVerification?.status === 'unverified').length ?? 0,
    sourcedIncidents: analysis.criticalPoints?.filter(point => Boolean(point.incident.source)).length ?? 0,
    routeSchematicNodes: analysis.routeSchematic?.nodes.length ?? 0,
    schematic: analysis.routeSchematic?.nodes.map(node => ({ name: node.name, type: node.type, km: node.distanceFromStart, at: node.timeFromStart })),
    weather: [analysis.weather.origin, ...(analysis.weather.waypoints ?? []), analysis.weather.destination].map(point => ({ location: point.location, temp: point.temp, condition: point.condition, source: point.source })),
    incidentProviderCoverage: analysis.summary.incidentProviderCoverage,
    groundingLinks: analysis.groundingMetadata?.length ?? 0,
    events,
    responseShapes,
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ result: 'error', message: error instanceof Error ? error.message : String(error), events, responseShapes }, null, 2));
  process.exitCode = 1;
}
