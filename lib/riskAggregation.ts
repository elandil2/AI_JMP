import type { CriticalPoint, RiskSegment, RiskType } from '../types';

export interface RouteBoundary {
  name: string;
  distanceFromStartMeters: number;
}

const TYPE_LABELS: Record<string, string> = {
  accident: 'Kaza', roadwork: 'Yol çalışması', closure: 'Yol kapanması',
  traffic: 'Trafik', weather: 'Hava', hazard: 'Diğer tehlike'
};

/** Counts sourced corridor candidates per 100 km; this is not a crash probability. */
export function aggregateRouteWarnings(
  points: CriticalPoint[], totalDistanceMeters: number | undefined, interior: RouteBoundary[], destinationName: string
): { riskIntensity: RiskSegment[]; riskTypes: RiskType[] } {
  if (!points.length || !totalDistanceMeters || totalDistanceMeters <= 0) return { riskIntensity: [], riskTypes: [] };
  const boundaries = [
    { name: 'Başlangıç', distanceFromStartMeters: 0 },
    ...interior.filter(point => point.distanceFromStartMeters > 0 && point.distanceFromStartMeters < totalDistanceMeters)
      .sort((a, b) => a.distanceFromStartMeters - b.distanceFromStartMeters),
    { name: destinationName, distanceFromStartMeters: totalDistanceMeters }
  ];
  const riskIntensity: RiskSegment[] = [];
  for (let index = 1; index < boundaries.length; index++) {
    const start = boundaries[index - 1].distanceFromStartMeters;
    const end = boundaries[index].distanceFromStartMeters;
    const lengthKm = (end - start) / 1000;
    if (lengthKm <= 0) continue;
    const eventCount = points.filter(point => {
      const progress = point.routeVerification?.progress;
      if (progress === undefined) return false;
      const distance = progress * totalDistanceMeters;
      return distance >= start && (distance < end || (index === boundaries.length - 1 && distance <= end));
    }).length;
    riskIntensity.push({
      name: `${boundaries[index - 1].name} → ${boundaries[index].name}`,
      value: Math.round(eventCount / lengthKm * 1000) / 10,
      eventCount,
      distanceKm: Math.round(lengthKm),
      color: '#b45309'
    });
  }
  const counts = new Map<string, number>();
  for (const point of points) {
    const label = TYPE_LABELS[point.incident.type] ?? 'Diğer uyarı';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const riskTypes: RiskType[] = [...counts].map(([category, value]) => ({
    category, value, description: 'Kaynaklı rota koridoru adayı sayısı; olayın aynı yol ve yönde olduğu kesinleşmedi.'
  }));
  return { riskIntensity, riskTypes };
}
