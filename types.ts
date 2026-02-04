
export interface SummaryStats {
  totalDistance: string;
  estimatedDuration: string;
  mandatoryBreak: string;
  breakNote: string;
}

export interface RiskSegment {
  name: string;
  value: number;
  color: string;
}

export interface RiskType {
  category: string;
  value: number;
  description: string;
}

export interface TimelineEvent {
  id: string;
  title: string;
  description: string;
  type: 'start' | 'info' | 'warning' | 'danger' | 'break' | 'end' | 'stop';
  icon?: string; // e.g., 'wind', 'traffic', 'descent'
}

export interface GroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  };
  maps?: {
    uri?: string;
    title?: string;
    placeId?: string;
  };
}

export interface WeatherInfo {
  location: string;
  temp: string;
  condition: string;
  icon: 'sunny' | 'cloudy' | 'rainy' | 'storm' | 'snow' | 'fog';
}

export interface RouteAnalysis {
  summary: SummaryStats;
  weather: {
    origin: WeatherInfo;
    destination: WeatherInfo;
    waypoints?: WeatherInfo[];
  };
  riskIntensity: RiskSegment[];
  riskTypes: RiskType[];
  timeline: TimelineEvent[];
  criticalPoints?: CriticalPoint[];
  routeSchematic?: RouteSchematic;
  groundingMetadata?: GroundingChunk[];
}

export interface CriticalPoint {
  id: string;
  coordinate: string; // lat,lng
  weather: WeatherInfo;
  traffic: {
    status: 'fluid' | 'moderate' | 'heavy' | 'stopped';
    description: string;
    tollInfo?: string;
    incident: {
      type: 'accident' | 'roadwork' | 'none';
      description: string;
      source?: string;
    };
    timeOffsetHours?: number; // Estimated hours from start to reach this point
  }

export interface RouteSegmentNode {
  name: string;
  type: 'origin' | 'destination' | 'stop' | 'break';
  distanceFromStart: string; // e.g. "270 km"
  timeFromStart: string; // e.g. "3s 15dk"
}

export interface RouteSchematic {
  nodes: RouteSegmentNode[];
  totalDistance: string;
  totalDuration: string;
}

export interface Warehouse {
  id: string;
  name: string;
  city: string;
  coordinates: string; // "lat,lng"
}

export interface RouteOptions {
  useTolls: boolean;
  stopName?: string;
  stopCoords?: string;
  departureTime?: string; // ISO string
}

export interface BatchItem {
  id: string;
  origin: string;
  destination: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  result?: RouteAnalysis;
  errorMsg?: string;
}

// Saved report that can be shared as a read-only link
export interface SavedReport {
  id: string;
  createdAt: string;
  origin: string;
  originCoords?: string; // "lat,lng"
  destination: string;
  destinationCoords?: string; // "lat,lng"
  stop?: string;
  stopCoords?: string; // "lat,lng"
  useTolls: boolean;
  analysis: RouteAnalysis;
}

export const INITIAL_ANALYSIS: RouteAnalysis = {
  summary: {
    totalDistance: "0 km",
    estimatedDuration: "0 Saat",
    mandatoryBreak: "-",
    breakNote: "-"
  },
  weather: {
    origin: { location: "-", temp: "-", condition: "-", icon: "cloudy" },
    destination: { location: "-", temp: "-", condition: "-", icon: "cloudy" },
    waypoints: []
  },
  riskIntensity: [],
  riskTypes: [],
  timeline: [],
  criticalPoints: [],
  routeSchematic: { nodes: [], totalDistance: "-", totalDuration: "-" }
};
