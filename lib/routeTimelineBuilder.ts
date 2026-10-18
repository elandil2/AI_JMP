import type { CriticalPoint, RouteAnalysis, RouteSchematic, TimelineEvent } from '../types';
import { parseHours } from './routeTiming';

type OrderedEvent = { event: TimelineEvent; hours: number; km?: number; order: number };

/** "1.032 km" / "205 km" -> 1032 / 205. */
const parseKm = (value?: string): number | undefined => {
  const match = /([\d.,]+)\s*km/i.exec(value ?? '');
  if (!match) return undefined;
  const km = Number(match[1].replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
  return Number.isFinite(km) ? km : undefined;
};

const isNightPassage = (departureTime: string | undefined, elapsedHours: number): boolean => {
  const departure = Date.parse(departureTime ?? '');
  if (!Number.isFinite(departure) || !Number.isFinite(elapsedHours)) return false;
  const passing = new Date(departure + elapsedHours * 3_600_000);
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', hourCycle: 'h23' }).format(passing));
  return hour >= 22 || hour < 6;
};

/** Maps-derived travel chronology; reported road events remain explicitly separate candidates. */
export function buildRouteTimeline(
  schematic: RouteSchematic,
  points: CriticalPoint[],
  departureTime?: string
): TimelineEvent[] {
  const totalHours = parseHours(schematic.totalDuration) ?? 0;
  const stageNodes = schematic.nodes.filter(node => node.type !== 'critical');
  const totalKm = parseKm(stageNodes.at(-1)?.distanceFromStart);
  const ordered: OrderedEvent[] = stageNodes.map((node, index) => {
    const hours = parseHours(node.timeFromStart) ?? (schematic.nodes.length > 1 ? index / (schematic.nodes.length - 1) * totalHours : 0);
    const stage = node.type === 'origin' ? 'start' : node.type === 'destination' ? 'end' : node.type === 'break' ? 'break' : 'stop';
    const night = stage === 'stop' && isNightPassage(departureTime, hours);
    const description = stage === 'start'
      ? 'Planlanan çıkış.'
      : stage === 'end'
        ? `Planlanan varış · ${node.distanceFromStart} · başlangıçtan ${node.timeFromStart}.`
        : stage === 'break'
          ? `${node.distanceFromStart} civarında mola/dinlenme planı. Tesis veya park uygunluğu ayrıca seçilmelidir.`
          : `Google Maps güzergâh geçişi · ${node.distanceFromStart} · başlangıçtan ${node.timeFromStart}.${night ? ' Gece geçişi planlanıyor; görüş ve dinlenme durumunu kontrol edin.' : ''}`;
    const km = stage === 'start' ? 0 : parseKm(node.distanceFromStart);
    return { event: { id: `maps-stage-${index}`, title: node.name, description, type: stage }, hours, km, order: index * 2 };
  });
  points.forEach((point, index) => {
    const progressHours = typeof point.timeOffsetHours === 'number' && Number.isFinite(point.timeOffsetHours)
      ? point.timeOffsetHours : (point.routeVerification?.progress ?? 1) * totalHours;
    const hours = Math.max(0, Math.min(totalHours, progressHours));
    ordered.push({
      event: {
        id: `road-candidate-${point.id || index}`,
        title: `Yol uyarısı adayı · ${point.weather.location}`,
        description: `${point.incident.description} Aynı yol ve yön teyit edilmelidir.`,
        type: 'warning'
      },
      hours,
      km: totalKm !== undefined && typeof point.routeVerification?.progress === 'number' ? point.routeVerification.progress * totalKm : undefined,
      order: index * 2 + 1
    });
  });
  // Order by position on the route when every entry has one: model-estimated hours ignore rests,
  // which put late-route warnings before an earlier daily rest.
  const byKm = ordered.every(item => item.km !== undefined);
  return ordered.sort((a, b) => (byKm ? a.km! - b.km! : a.hours - b.hours) || a.order - b.order).map(item => item.event);
}

/** Upgrade endpoint-only saved reports for display, without rewriting their stored analysis. */
export function timelineForDisplay(
  analysis: Pick<RouteAnalysis, 'timeline' | 'routeSchematic' | 'criticalPoints'> & { summary?: Pick<RouteAnalysis['summary'], 'mapsDuration'> },
  departureTime?: string
): TimelineEvent[] {
  const saved = Array.isArray(analysis.timeline) ? analysis.timeline : [];
  const nodes = analysis.routeSchematic?.nodes;
  if (!analysis.summary?.mapsDuration || !Array.isArray(nodes) || nodes.length === 0) return saved;
  if (saved.some(event => event.id?.startsWith('maps-stage-'))) return saved;
  const mapsNodes = nodes.filter(node => node.type !== 'critical');
  if (mapsNodes.length <= 2 && saved.length > 0) return saved;
  return buildRouteTimeline({ ...analysis.routeSchematic!, nodes: mapsNodes }, analysis.criticalPoints ?? [], departureTime);
}
