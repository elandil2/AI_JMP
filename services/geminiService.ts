
import { GoogleGenAI } from "@google/genai";
import {
  RouteAnalysis,
  RouteOptions,
  WeatherInfo,
  RiskSegment,
  TimelineEvent,
  CriticalPoint,
  RouteSchematic,
  RouteSegmentNode
} from "../types";
import { getDirections, calculateTruckDuration, calculateBreaks, DirectionsResult } from "../lib/googleMaps";

// Helper to safely parse JSON
const parseJSONResponse = (text: string | undefined): any => {
  if (!text) return {};
  try {
    const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch && jsonBlockMatch[1]) return JSON.parse(jsonBlockMatch[1]);
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      return JSON.parse(text.substring(firstBrace, lastBrace + 1));
    }
    return JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse JSON response:", text);
    return {};
  }
};

const generateWithRetry = async (ai: GoogleGenAI, params: any, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await ai.models.generateContent(params);
    } catch (error: any) {
      if (i === retries - 1) throw error;
      const status = error.status || error.response?.status || 0;
      if (status === 500 || status === 503 || error.code === 500) {
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
        continue;
      }
      throw error;
    }
  }
  throw new Error("API failed");
};

// --- HELPER: Identify Waypoints from Google Maps Data ---
const identifyWaypoints = (mapsData: DirectionsResult, origin: string, destination: string) => {
  const waypoints: { name: string; coords: string; timeOffsetHours: number; type: 'stop' | 'break' }[] = [];

  // Logic: Find a point roughly every 4 hours for breaks
  const totalDurationSeconds = mapsData.duration.value;
  const totalSteps = mapsData.steps.length;

  // Need a break around 4.5 hours = 16200 seconds
  const BREAK_INTERVAL = 16200;
  let currentDuration = 0;
  let nextBreakTarget = BREAK_INTERVAL;

  mapsData.steps.forEach((step) => {
    // Basic duration parsing (text to seconds approximation if needed, but Maps provides values usually)
    // Here we rely on the fact that we might need to accumulate manually or just pick representative cities.
    // For simplicity, we'll pick 1-2 key locations from the summary steps if available, 
    // or just rely on the start/end of major segments.

    // NOTE: mapsData.steps from our lib is simplified. 
    // Real implementation: We'd need accurate cumulative time. 
    // Let's assume we pick the middle styling for now or just standard intervals.
  });

  // FALLBACK: Just pick 2 calculated points if route is long enough (> 500km)
  // For the demo/prototype, we will trust Gemini to identify "reasonable" stopping cities based on the path description
  // OR we pass the specific polyline/latlng if we had it.

  return waypoints;
};

// --- AGENT 1: ROUTE SPECIALIST (Modified) ---
const routeAgent = async (
  ai: GoogleGenAI,
  origin: string,
  destination: string,
  originCoords?: string,
  destCoords?: string,
  options?: RouteOptions
) => {
  let mapsData: DirectionsResult | null = null;
  if (originCoords && destCoords) {
    mapsData = await getDirections(originCoords, destCoords, {
      useTolls: options?.useTolls,
      stopCoords: options?.stopCoords,
      departureTime: options?.departureTime ? new Date(options.departureTime) : undefined
    });
  }

  if (mapsData) {
    const distanceKm = mapsData.distance.value / 1000;
    const truckDuration = calculateTruckDuration(mapsData.distance.value);
    const breaks = calculateBreaks(truckDuration.hours);
    const totalHours = truckDuration.hours + (breaks.totalBreakMinutes / 60);
    const totalHoursInt = Math.floor(totalHours);
    const totalMinutes = Math.round((totalHours - totalHoursInt) * 60);

    return {
      totalDistance: `${distanceKm.toFixed(0)} km`,
      estimatedDuration: `${totalHoursInt} sa ${totalMinutes} dk`,
      routeDescription: `${origin} → ${destination}. Güzergah: ${mapsData.summary}`,
      estimatedArrivalHours: totalHours,
      mapsData
    };
  }

  // Fallback to Gemini
  const prompt = `
    GÖREV: Tır Rota Hesabı.
    NEREDEN: ${origin}
    NEREYE: ${destination}
    TERCİHLER: ${options?.useTolls ? 'Ücretli yollar OK' : 'Ücretsiz yol'}
    ÇIKTI: JSON { "totalDistance": "km", "estimatedDuration": "sa dk", "routeDescription": "özet", "estimatedArrivalHours": number }
  `;

  const response = await generateWithRetry(ai, { model: "gemini-2.5-flash", contents: prompt });
  return parseJSONResponse(response.text);
};

// --- AGENT 2: WEATHER SPECIALIST (Enhanced) ---
const weatherAgent = async (
  ai: GoogleGenAI,
  locations: { name: string; role: 'origin' | 'destination' | 'waypoint'; timeOffset: number }[]
) => {
  // Current Time
  const now = new Date();

  const weatherRequests = locations.map(loc => {
    const targetTime = new Date(now.getTime() + loc.timeOffset * 60 * 60 * 1000);
    const timeStr = targetTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    return `${loc.name} (${loc.role === 'origin' ? 'ŞİMDİ' : 'Saat ' + timeStr})`;
  }).join(', ');

  const prompt = `
    GÖREV: Aşağıdaki konumlar ve saatler için hava durumu tahmini yap.
    KONUMLAR: ${weatherRequests}
    
    ARAÇ: Google Search kullanarak anlık/tahmini hava durumunu bul.
    
    JSON FORMATI (Array):
    [
      { "location": "Şehir Adı", "temp": "15°C", "condition": "Yağmurlu", "icon": "rainy" }
    ]
    * icon seçenekleri: sunny, cloudy, rainy, storm, snow, fog.
  `;

  const response = await generateWithRetry(ai, {
    model: "gemini-2.5-flash",
    contents: prompt,
    config: { tools: [{ googleSearch: {} }] }
  });

  return parseJSONResponse(response.text);
};

// --- AGENT 3: CRITICAL ANALYST (New) ---
const criticalAnalysisAgent = async (
  ai: GoogleGenAI,
  routeDesc: string,
  origin: string,
  destination: string,
  durationHours: number
) => {
  const prompt = `
    GÖREV: Tır rotası için Kapsamlı Risk ve Kritik Nokta Analizi.
    ROTA: ${origin} -> ${destination}
    GÜZERGAH DETAYI: ${routeDesc}
    SÜRE: ${durationHours.toFixed(1)} saat
    
    EK KAYNAKLAR: https://yol.kgm.gov.tr/KazaKaraNoktaWeb/ (Kaza Kara Noktaları) verisine benzer verileri ara.

    ARAÇLAR: Google Search ile trafik, yol çalışmaları, kaza kara noktaları ve hava durumu uyarılarını ara.

    İSTENEN ÇIKTILAR (JSON):
    1. riskIntensity: Güzergah üzerindeki illerin/bölgelerin risk puanı (0-100).
    2. timeline: Yolculuk adımları (Başlangıç, Kritik Nokta, Mola, Varış).
    3. criticalPoints: Tablo formatı için detaylı noktalar. **HER NOKTA İÇİN TAHMİNİ VARIŞ SÜRESİNİ (timeOffsetHours) HESAPLA.**
    4. routeSchematic: Şematik gösterim için düğümler.

    JSON FORMATI:
    {
      "riskIntensity": [ { "name": "Bölge", "value": 50, "color": "#hex" } ],
      "timeline": [ { "title": "Başlık", "description": "Detay", "type": "info/warning/danger/break", "icon": "traffic/wind" } ],
      "criticalPoints": [
        {
          "id": "1",
          "coordinate": "32.85,39.92", 
          "timeOffsetHours": 3.5,
          "weather": { "location": "Bölge", "temp": "-", "condition": "-", "icon": "cloudy" },
          "traffic": { "status": "heavy", "description": "Yoğun trafik", "tollInfo": "Ücretli" },
          "incident": { "type": "accident", "description": "Kaza Kara Noktası", "source": "KGM" }
        }
      ],
      "routeSchematic": {
        "nodes": [
          { "name": "İstanbul", "type": "origin", "distanceFromStart": "0 km", "timeFromStart": "0s 0dk" },
          { "name": "Bolu Dağı", "type": "stop", "distanceFromStart": "250 km", "timeFromStart": "3s 30dk" },
          { "name": "Ankara", "type": "destination", "distanceFromStart": "450 km", "timeFromStart": "5s 30dk" }
        ],
        "totalDistance": "450 km",
        "totalDuration": "5s 30dk"
      },
      "mandatoryBreak": "Gerekir/Gerekmez",
      "breakNote": "4.5 saat kuralı..."
    }
  `;

  const response = await generateWithRetry(ai, {
    model: "gemini-2.5-flash",
    contents: prompt,
    config: { tools: [{ googleSearch: {} }] }
  });

  return {
    data: parseJSONResponse(response.text),
    sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks
  };
};

export const analyzeRoute = async (
  originName: string,
  destinationName: string,
  originCoords?: string,
  destCoords?: string,
  options?: RouteOptions
): Promise<RouteAnalysis> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    // 1. Calculate basics (Distance, Duration, Route Line)
    const routeData = await routeAgent(ai, originName, destinationName, originCoords, destCoords, options);

    // 2. Risk Analysis (Sequential: Need this first to know WHERE to check weather)
    const analysisResult = await criticalAnalysisAgent(
      ai,
      routeData.routeDescription,
      originName,
      destinationName,
      routeData.estimatedArrivalHours
    );
    const analysis = analysisResult.data;

    // 3. Determine Weather Locations (Standard + Critical Points)
    const weatherLocations: any[] = [
      { name: originName, role: 'origin', timeOffset: 0 }
    ];

    // Add Critical Points to Weather Check
    if (analysis.criticalPoints && analysis.criticalPoints.length > 0) {
      analysis.criticalPoints.forEach((cp: CriticalPoint) => {
        // Use the AI's estimated time offset, default to halfway if missing
        const offset = cp.timeOffsetHours || (routeData.estimatedArrivalHours / 2);
        // Use location name from weather object or description if available
        const locName = cp.weather?.location || "Bilinmeyen Konum";
        weatherLocations.push({
          name: locName,
          role: 'waypoint',
          timeOffset: offset,
          pointId: cp.id // Track ID to merge back
        });
      });
    } else {
      // Fallback if no critical points found
      weatherLocations.push({ name: destinationName, role: 'destination', timeOffset: routeData.estimatedArrivalHours });
    }

    // Ensure Destination is always last
    if (!weatherLocations.find(l => l.role === 'destination')) {
      weatherLocations.push({ name: destinationName, role: 'destination', timeOffset: routeData.estimatedArrivalHours });
    }

    // 4. Fetch Accurate Weather
    const weatherResults = await weatherAgent(ai, weatherLocations);

    // 5. Merge Weather back into Critical Points
    if (analysis.criticalPoints) {
      analysis.criticalPoints = analysis.criticalPoints.map((cp: CriticalPoint) => {
        // Find matching weather result. 
        // We match by approximate location name or order if we tracked it more strictly.
        // Simplified matching: Try to find a waypoint with similar name
        const match = weatherResults.find((w: any) =>
          w.location === cp.weather?.location // Assuming names match reasonably well
        );

        if (match) {
          return {
            ...cp,
            weather: {
              location: match.location,
              temp: match.temp,
              condition: match.condition,
              icon: match.icon
            }
          };
        }
        return cp;
      });
    }

    const weatherOrigin = weatherResults.find((w: any) => w.location.includes(originName)) || weatherResults[0] || { temp: "-", condition: "-", icon: "cloudy" };
    const weatherDest = weatherResults.find((w: any) => w.location.includes(destinationName)) || weatherResults[weatherResults.length - 1] || { temp: "-", condition: "-", icon: "cloudy" };

    // Filter out origin/dest for waypoints list
    const waypointsOnly = weatherResults.filter((w: any) =>
      !w.location.includes(originName) && !w.location.includes(destinationName)
    ).map((w: any) => ({
      location: w.location, temp: w.temp, condition: w.condition, icon: w.icon
    }));

    return {
      summary: {
        totalDistance: routeData.totalDistance || "0 km",
        estimatedDuration: routeData.estimatedDuration || "0 sa",
        mandatoryBreak: analysis.mandatoryBreak || "-",
        breakNote: analysis.breakNote || "-"
      },
      weather: {
        origin: { location: originName, temp: weatherOrigin.temp || "-", condition: weatherOrigin.condition || "-", icon: (weatherOrigin.icon as any) || "cloudy" },
        destination: { location: destinationName, temp: weatherDest.temp || "-", condition: weatherDest.condition || "-", icon: (weatherDest.icon as any) || "cloudy" },
        waypoints: waypointsOnly
      },
      riskIntensity: analysis.riskIntensity || [],
      riskTypes: analysis.riskTypes || [],
      timeline: analysis.timeline || [],
      criticalPoints: analysis.criticalPoints || [],
      routeSchematic: analysis.routeSchematic || { nodes: [], totalDistance: "-", totalDuration: "-" },
      groundingMetadata: analysisResult.sources as any
    };

  } catch (error) {
    console.error("Multi-Agent Error:", error);
    throw error;
  }
};
