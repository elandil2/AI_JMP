import {
  calculateBreaks,
  calculateTruckDuration,
  DEFAULT_TRUCK_PLANNING_SPEED_KMH,
  MAX_TRUCK_PLANNING_SPEED_KMH,
  MIN_TRUCK_PLANNING_SPEED_KMH,
  type DirectionsResult,
} from './googleMaps';
import type { RouteSchematic, RouteSegmentNode, SummaryStats } from '../types';

export const formatHours = (hours: number): string => {
  const minutes = Math.round(hours * 60);
  return `${Math.floor(minutes / 60)} sa ${minutes % 60} dk`;
};

export interface MapsTimingOptions {
  /** Planning assumption only. Must be between 60 and 65 km/h; defaults to 60. */
  planningSpeedKmh?: number;
}

export function mapsTiming(
  maps: DirectionsResult,
  options: MapsTimingOptions = {}
): { summary: SummaryStats; totalHours: number; drivingHours: number } {
  const planningSpeedKmh = options.planningSpeedKmh ?? DEFAULT_TRUCK_PLANNING_SPEED_KMH;
  const mapsHours = (maps.durationInTraffic?.value ?? maps.duration.value) / 3600;
  // The configured distance/speed estimate can never undercut Maps' route duration.
  const drivingHours = Math.max(calculateTruckDuration(maps.distance.value, planningSpeedKmh).hours, mapsHours);
  const breaks = calculateBreaks(drivingHours);
  const totalHours = drivingHours + breaks.totalBreakMinutes / 60;
  const planningSpeedText = planningSpeedKmh.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
  return {
    totalHours, drivingHours,
    summary: {
      totalDistance: `${Math.round(maps.distance.value / 1000)} km`, estimatedDuration: formatHours(totalHours),
      mapsDuration: formatHours(mapsHours), drivingDuration: formatHours(drivingHours), breakDuration: formatHours(breaks.totalBreakMinutes / 60),
      durationLabel: 'Tır planlama tahmini (mola dahil)',
      mandatoryBreak: breaks.totalBreakMinutes > 0 ? 'Planlı mola var' : 'Bu hesapta mola yok',
      breakNote: `${formatHours(drivingHours)} tahmini sürüş + ${formatHours(breaks.totalBreakMinutes / 60)} mola/dinlenme = ${formatHours(totalHours)}. Bu yalnızca planlama simülasyonudur: 4,5 saatlik modellenen sürüşte 45 dk ara, 9 saatlik modellenen günlük sürüşten sonra yolculuk sürüyorsa 11 saat dinlenme eklenir. Gerçek sürüş/takograf hesabı değildir; önceki sürüş ve sürücünün mevcut takograf durumu bilinmiyor.`,
      routeNotice: `Mesafe ve güzergâh Google Maps otomobil rotasıdır; tır güzergâhı ve yasal kısıtlar doğrulanmaz. Mesafeden ${planningSpeedText} km/sa ortalama tır planlama hızıyla tahmin yapılır (yapılandırılabilir aralık ${MIN_TRUCK_PLANNING_SPEED_KMH}–${MAX_TRUCK_PLANNING_SPEED_KMH} km/sa); Google Maps veya trafik süresi daha uzunsa o süre alt sınır olarak kullanılır. Bu değer gerçek araç hızı ya da sürücünün yasal sürüş hakkı değildir.`,
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
