/** A proximity check is only a route-corridor candidate, never proof of a road or incident. */
export const ROUTE_CORRIDOR_TOLERANCE_KM = 20;

export interface RouteCoordinate {
  lat: number;
  lng: number;
}

export type RoutePointCheck = {
  status: 'corridor_candidate' | 'off_corridor' | 'unverified';
  distanceKm?: number;
  progress?: number;
};

const parseCoordinate = (coordinate: string): RouteCoordinate | undefined => {
  const parts = coordinate.split(',');
  if (parts.length !== 2) return undefined;
  const lat = Number(parts[0].trim());
  const lng = Number(parts[1].trim());
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined;
  return { lat, lng };
};

/** Decodes a Google encoded polyline. Invalid or incomplete input returns an empty path. */
export function decodeEncodedPolyline(encoded: string): RouteCoordinate[] {
  if (!encoded || encoded.length > 200_000) return [];
  const path: RouteCoordinate[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  const readDelta = (): number | undefined => {
    let result = 0;
    let shift = 0;
    while (index < encoded.length && shift <= 30) {
      const value = encoded.charCodeAt(index++) - 63;
      if (value < 0 || value > 63) return undefined;
      result |= (value & 0x1f) << shift;
      shift += 5;
      if (value < 0x20) return (result & 1) ? ~(result >> 1) : result >> 1;
    }
    return undefined;
  };

  while (index < encoded.length) {
    const latDelta = readDelta();
    const lngDelta = latDelta === undefined ? undefined : readDelta();
    if (latDelta === undefined || lngDelta === undefined) return [];
    lat += latDelta;
    lng += lngDelta;
    const point = { lat: lat / 1e5, lng: lng / 1e5 };
    if (Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) return [];
    path.push(point);
  }
  return path.length >= 2 ? path : [];
}

const haversineKm = (a: RouteCoordinate, b: RouteCoordinate): number => {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const lat1 = radians(a.lat);
  const lat2 = radians(b.lat);
  const dLat = lat2 - lat1;
  const dLng = radians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
};

/** Checks whether a coordinate is near the decoded Maps overview line. */
export function checkCoordinateAgainstRoute(
  encodedPolyline: string | undefined | null,
  coordinate: string,
  toleranceKm = ROUTE_CORRIDOR_TOLERANCE_KM
): RoutePointCheck {
  const point = parseCoordinate(coordinate);
  const path = typeof encodedPolyline === 'string' ? decodeEncodedPolyline(encodedPolyline) : [];
  if (!point || path.length < 2 || !Number.isFinite(toleranceKm) || toleranceKm < 0) return { status: 'unverified' };

  const segmentLengths: number[] = [];
  let totalLengthKm = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const length = haversineKm(path[i], path[i + 1]);
    segmentLengths.push(length);
    totalLengthKm += length;
  }
  if (!Number.isFinite(totalLengthKm) || totalLengthKm <= 0) return { status: 'unverified' };

  let traversedKm = 0;
  let closestKm = Number.POSITIVE_INFINITY;
  let closestProgress = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const meanLat = (a.lat + b.lat + point.lat) / 3 * Math.PI / 180;
    const xScale = 111.32 * Math.cos(meanLat);
    const yScale = 110.574;
    const ax = (a.lng - point.lng) * xScale;
    const ay = (a.lat - point.lat) * yScale;
    const bx = (b.lng - point.lng) * xScale;
    const by = (b.lat - point.lat) * yScale;
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
    const distanceKm = Math.hypot(ax + t * dx, ay + t * dy);
    if (distanceKm < closestKm) {
      closestKm = distanceKm;
      closestProgress = (traversedKm + t * segmentLengths[i]) / totalLengthKm;
    }
    traversedKm += segmentLengths[i];
  }

  return {
    status: closestKm <= toleranceKm ? 'corridor_candidate' : 'off_corridor',
    distanceKm: Math.round(closestKm * 10) / 10,
    progress: Math.max(0, Math.min(1, closestProgress))
  };
}
