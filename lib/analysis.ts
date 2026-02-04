import type { RouteAnalysis } from "@/types";

const stripKgm = (val?: string | null) => {
  if (!val) return val;
  return val.replace(/\s*\|\s*KGM:.*$/i, "").trim();
};

export const sanitizeAnalysis = (analysis: RouteAnalysis): RouteAnalysis => {
  const cleanedWeather = {
    ...analysis.weather,
    origin: {
      ...analysis.weather.origin,
      location: stripKgm(analysis.weather.origin?.location) || analysis.weather.origin?.location
    },
    destination: {
      ...analysis.weather.destination,
      location: stripKgm(analysis.weather.destination?.location) || analysis.weather.destination?.location
    },
    waypoints: (analysis.weather.waypoints || []).map(wp => ({
      ...wp,
      location: stripKgm(wp.location) || wp.location
    }))
  };

  const cleanedTimeline = (analysis.timeline || []).map((t) => ({
    ...t,
    title: stripKgm(t.title) || t.title,
    description: stripKgm(t.description) || t.description
  }));

  const cleanedRiskIntensity = (analysis.riskIntensity || []).map((r) => ({
    ...r,
    name: stripKgm(r.name) || r.name
  }));

  const cleanedCriticalPoints = (analysis.criticalPoints || []).map(cp => ({
    ...cp,
    weather: {
      ...cp.weather,
      location: stripKgm(cp.weather.location) || cp.weather.location
    },
    traffic: {
      ...cp.traffic,
      description: stripKgm(cp.traffic.description) || cp.traffic.description
    },
    incident: {
      ...cp.incident,
      description: stripKgm(cp.incident.description) || cp.incident.description
    }
  }));

  return {
    ...analysis,
    weather: cleanedWeather,
    timeline: cleanedTimeline,
    riskIntensity: cleanedRiskIntensity,
    criticalPoints: cleanedCriticalPoints
  };
};
