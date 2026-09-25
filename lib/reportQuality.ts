import type { RouteAnalysis } from '../types';

/** A long route with no Maps-derived interior geometry is not a publishable report. */
export function assertPublishableRoute(analysis: RouteAnalysis): void {
  if (!analysis.summary.mapsDuration) {
    throw new Error('Google Maps rota verisi alınamadı; AI mesafe tahminiyle rapor yayımlanmadı.');
  }
  const distanceKm = Number.parseFloat(analysis.summary.totalDistance.replace(',', '.'));
  const interior = analysis.routeSchematic?.nodes.filter(node => node.type === 'stop').length ?? 0;
  if (Number.isFinite(distanceKm) && distanceKm >= 150 && interior < 2) {
    throw new Error('Google Maps rota adımları eksik; ara noktası olmayan uzun rapor yayımlanmadı.');
  }
}
