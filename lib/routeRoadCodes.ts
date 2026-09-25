import type { RouteSchematic } from '../types';

/** Road names come from Maps instructions; these are search hints, not KGM control-section IDs. */
export function extractRouteRoadCodes(schematic?: RouteSchematic): string[] {
  const codes: string[] = [];
  const seen = new Set<string>();
  for (const node of schematic?.nodes ?? []) {
    for (const match of node.name.matchAll(/\b([DOE])[-\s]?(\d{1,3})\b/gi)) {
      const prefix = match[1].toUpperCase();
      const digits = match[2];
      if (prefix === 'D' && digits.length < 2) continue;
      if (prefix === 'E' && digits.length < 2) continue;
      const code = prefix === 'O' ? `O-${digits}` : `${prefix}${digits}`;
      if (!seen.has(code)) {
        seen.add(code);
        codes.push(code);
      }
      if (codes.length >= 12) return codes;
    }
  }
  return codes;
}
