import { calculateTruckDuration, DEFAULT_TRUCK_PLANNING_SPEED_KMH, type DirectionsResult } from './googleMaps';
import { planDrivingSchedule, type DrivingSchedule } from './drivingSchedule';
import type { RouteSchematic, RouteSegmentNode, SummaryStats } from '../types';

export const formatHours = (hours: number): string => {
  const minutes = Math.round(hours * 60);
  return `${Math.floor(minutes / 60)} sa ${minutes % 60} dk`;
};

export interface MapsTimingOptions {
  /** Planning assumption only. Must be between 60 and 65 km/h; default 60. */
  planningSpeedKmh?: number;
  /** 10 h driving days the plan may use (0–2). Default 2, the weekly maximum. */
  maxExtendedDays?: number;
  /** When given, the summary carries departure and planned arrival times. */
  departureTime?: Date | string;
}

export function mapsTiming(
  maps: DirectionsResult,
  options: MapsTimingOptions = {}
): { summary: SummaryStats; totalHours: number; drivingHours: number; schedule: DrivingSchedule } {
  const planningSpeedKmh = options.planningSpeedKmh ?? DEFAULT_TRUCK_PLANNING_SPEED_KMH;
  const mapsHours = (maps.durationInTraffic?.value ?? maps.duration.value) / 3600;
  // The configured distance/speed estimate can never undercut Maps' route duration.
  const drivingHours = Math.max(calculateTruckDuration(maps.distance.value, planningSpeedKmh).hours, mapsHours);
  const schedule = planDrivingSchedule(drivingHours, { maxExtendedDays: options.maxExtendedDays });
  const totalHours = schedule.totalElapsedHours;
  const restHours = schedule.totalRestMinutes / 60;
  const planningSpeedText = planningSpeedKmh.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
  const extensionText = schedule.withoutExtension
    ? ` Bu plan ${schedule.extendedDays} gün için 10 saatlik uzatılmış sürüş kullanıyor (haftada en fazla 2 kez). Sürücünün bu hafta hakkı yoksa varıştan önce 11 sa dinlenme gerekir ve varış ${formatHours(schedule.withoutExtension.totalElapsedHours - totalHours)} gecikir.`
    : '';
  const departure = options.departureTime === undefined ? undefined : new Date(options.departureTime);
  const departureMs = departure && Number.isFinite(departure.getTime()) ? departure.getTime() : undefined;
  const shortBreakCount = schedule.rests.filter(rest => rest.kind === 'break').length;
  const dailyRestCount = schedule.rests.filter(rest => rest.kind === 'daily_rest').length;
  return {
    totalHours, drivingHours, schedule,
    summary: {
      totalDistance: `${Math.round(maps.distance.value / 1000)} km`, estimatedDuration: formatHours(totalHours),
      mapsDuration: formatHours(mapsHours), drivingDuration: formatHours(drivingHours), breakDuration: formatHours(restHours),
      durationLabel: dailyRestCount > 0 ? 'Toplam yolculuk (mola ve gece dinlenmesi dahil)' : 'Toplam yolculuk (mola dahil)',
      mandatoryBreak: schedule.rests.length > 0 ? 'Planlı mola var' : 'Bu hesapta mola yok',
      breakNote: `${formatHours(drivingHours)} tahmini sürüş + ${formatHours(restHours)} mola/dinlenme = ${formatHours(totalHours)}. Bu yalnızca planlama simülasyonudur: en geç 4,5 saatlik sürüşte 45 dk ara, günlük 9 saat sürüşten sonra yolculuk sürüyorsa 11 saat dinlenme eklenir.${extensionText} Gerçek sürüş/takograf hesabı değildir; sürücünün önceki sürüşü ve takograf durumu bilinmiyor, sürücünün tam dinlenmiş başladığı varsayılır.`,
      routeNotice: `Google Maps otomobil rotasıdır; tır kısıtları doğrulanmadı. ${planningSpeedText} km/sa ortalama planlama hızı, gerçek sürüş hakkı değildir.`,
      ...(schedule.extendedDays > 0 ? { extendedDrivingDays: schedule.extendedDays } : {}),
      shortBreakCount, dailyRestCount,
      ...(departureMs === undefined ? {} : {
        departureTime: new Date(departureMs).toISOString(),
        arrivalTime: new Date(departureMs + totalHours * 3_600_000).toISOString()
      }),
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
