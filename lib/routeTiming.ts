import { calculateBreaks, calculateTruckDuration, type DirectionsResult } from './googleMaps';
import type { RouteSchematic, RouteSegmentNode, SummaryStats } from '../types';

export const formatHours = (hours: number): string => {
  const minutes = Math.round(hours * 60);
  return `${Math.floor(minutes / 60)} sa ${minutes % 60} dk`;
};

export function mapsTiming(maps: DirectionsResult): { summary: SummaryStats; totalHours: number; drivingHours: number } {
  const mapsHours = (maps.durationInTraffic?.value ?? maps.duration.value) / 3600;
  // A planning assumption, not a vehicle-restriction-aware Google truck route.
  const drivingHours = Math.max(calculateTruckDuration(maps.distance.value).hours, mapsHours);
  const breaks = calculateBreaks(drivingHours);
  const totalHours = drivingHours + breaks.totalBreakMinutes / 60;
  return {
    totalHours, drivingHours,
    summary: {
      totalDistance: `${Math.round(maps.distance.value / 1000)} km`, estimatedDuration: formatHours(totalHours),
      mapsDuration: formatHours(mapsHours), drivingDuration: formatHours(drivingHours), breakDuration: formatHours(breaks.totalBreakMinutes / 60),
      durationLabel: 'Tır planlama tahmini (mola dahil)',
      mandatoryBreak: breaks.totalBreakMinutes > 0 ? 'Planlı mola var' : 'Bu hesapta mola yok',
      breakNote: `${formatHours(drivingHours)} tahmini sürüş + ${formatHours(breaks.totalBreakMinutes / 60)} mola/dinlenme = ${formatHours(totalHours)}. Planlama varsayımı: 4,5 saatte 45 dk mola; 9 saat sürüşten sonra yolculuk devam ediyorsa 11 saat dinlenme. Önceki sürüş ve takograf durumu hesaba katılmamıştır.`,
      routeNotice: 'Mesafe ve güzergâh Google Maps otomobil rotasıdır; Türkiye için tır kısıtları doğrulanmaz. Tır sürüşü 60 km/sa ortalama ile tahmin edilir; Maps süresi daha uzunsa o süre kullanılır.',
      generatedAt: new Date().toISOString()
    }
  };
}

/** Accept the duration formats already present in saved Gemini reports. */
export function parseHours(text: string): number | undefined {
  const normalized = text.toLocaleLowerCase('tr-TR').replace(/,/g, '.');
  const h = normalized.match(/(\d+(?:\.\d+)?)\s*(?:saat|sa|hour|hr|h|s)(?![a-z])/);
  const m = normalized.match(/(\d+(?:\.\d+)?)\s*(?:dakika|dk|min|m)(?![a-z])/);
  if (!h && !m) return undefined;
  return Number(h?.[1] ?? 0) + Number(m?.[1] ?? 0) / 60;
}

export function reconcileSchematic(schematic: RouteSchematic | undefined, origin: string, destination: string, summary: SummaryStats, totalHours: number): RouteSchematic {
  const interior = (schematic?.nodes ?? []).flatMap(node => {
    const hours = parseHours(node.timeFromStart);
    if (node.type === 'origin' || node.type === 'destination' || hours === undefined || hours <= 0 || hours >= totalHours) return [];
    return [{ node, hours }];
  }).sort((a, b) => a.hours - b.hours).map(({ node }) => node);
  const nodes: RouteSegmentNode[] = [
    { name: origin, type: 'origin', distanceFromStart: '0 km', timeFromStart: '0 sa 0 dk' },
    ...interior,
    { name: destination, type: 'destination', distanceFromStart: summary.totalDistance, timeFromStart: summary.estimatedDuration }
  ];
  return { nodes, totalDistance: summary.totalDistance, totalDuration: summary.estimatedDuration };
}
