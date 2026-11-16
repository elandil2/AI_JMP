import type { DirectionsResult } from './googleMaps';
import { decodeEncodedPolyline, haversineKm, type RouteCoordinate } from './routeGeometry';

/**
 * Maps a distance along the Google route (metres from the start) to a coordinate.
 *
 * The overview polyline is preferred; its geometric length is scaled to the route's
 * reported distance. Without a polyline, step start/end points are interpolated when
 * the steps cover the route. A Google step can be hundreds of kilometres long, so a
 * position must never be "snapped" to a step end.
 */
export interface RouteAxis {
  source: 'polyline' | 'steps' | 'none';
  totalMeters: number;
  coordinateAt(meters: number): RouteCoordinate | undefined;
}

interface AxisPoint { meters: number; coordinate: RouteCoordinate }

const MIN_STEP_COVERAGE = 0.85;

const isCoordinate = (value: RouteCoordinate | undefined): value is RouteCoordinate =>
  Boolean(value && Number.isFinite(value.lat) && Number.isFinite(value.lng) && Math.abs(value.lat) <= 90 && Math.abs(value.lng) <= 180);

function interpolate(points: AxisPoint[], meters: number): RouteCoordinate | undefined {
  if (points.length < 2 || !Number.isFinite(meters)) return undefined;
  const target = Math.max(points[0].meters, Math.min(points[points.length - 1].meters, meters));
  let low = 0;
  let high = points.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (points[mid].meters <= target) low = mid; else high = mid;
  }
  const a = points[low];
  const b = points[high];
  const span = b.meters - a.meters;
  const t = span > 0 ? (target - a.meters) / span : 0;
  return { lat: a.coordinate.lat + (b.coordinate.lat - a.coordinate.lat) * t, lng: a.coordinate.lng + (b.coordinate.lng - a.coordinate.lng) * t };
}

function polylinePoints(maps: DirectionsResult): AxisPoint[] {
  const path = decodeEncodedPolyline(maps.polyline);
  if (path.length < 2) return [];
  const cumulativeKm = [0];
  for (let i = 1; i < path.length; i++) cumulativeKm.push(cumulativeKm[i - 1] + haversineKm(path[i - 1], path[i]));
  const geometricKm = cumulativeKm[cumulativeKm.length - 1];
  if (!(geometricKm > 0)) return [];
  const scale = maps.distance.value / (geometricKm * 1000);
  return path.map((coordinate, index) => ({ meters: cumulativeKm[index] * 1000 * scale, coordinate }));
}

function stepPoints(maps: DirectionsResult): AxisPoint[] {
  const steps = (maps.steps ?? []).filter(step => Number.isFinite(step.distanceMeters) && (step.distanceMeters ?? 0) > 0);
  const stepMeters = steps.reduce((sum, step) => sum + step.distanceMeters!, 0);
  if (!(stepMeters > 0) || stepMeters / maps.distance.value < MIN_STEP_COVERAGE) return [];
  const scale = maps.distance.value / stepMeters;
  const points: AxisPoint[] = [];
  let cumulative = 0;
  for (const step of steps) {
    if (isCoordinate(step.startLocation) && (!points.length || points[points.length - 1].meters < cumulative)) {
      points.push({ meters: cumulative, coordinate: step.startLocation });
    }
    cumulative += step.distanceMeters! * scale;
    if (isCoordinate(step.endLocation)) points.push({ meters: cumulative, coordinate: step.endLocation });
  }
  return points.length >= 2 ? points : [];
}

export function buildRouteAxis(maps: DirectionsResult): RouteAxis {
  const totalMeters = maps.distance.value;
  const fromPolyline = polylinePoints(maps);
  if (fromPolyline.length) return { source: 'polyline', totalMeters, coordinateAt: meters => interpolate(fromPolyline, meters) };
  const fromSteps = stepPoints(maps);
  if (fromSteps.length) return { source: 'steps', totalMeters, coordinateAt: meters => interpolate(fromSteps, meters) };
  return { source: 'none', totalMeters, coordinateAt: () => undefined };
}
