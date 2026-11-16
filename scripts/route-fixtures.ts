/**
 * Total İzmir (Menemen) FTL benchmark routes used by the break-plan audit.
 *
 * Coordinates come from Total's own dealer list. Google route responses are
 * captured locally into `fixtures/routes/` (git-ignored: the repo is public and
 * Google Maps content may not be redistributed).
 */
export interface RouteFixtureSpec {
  id: string;
  label: string;
  origin: string;
  destination: string;
  /** Optional corridor waypoint ("… üzerinden"); no loading or unloading happens there. */
  via?: { name: string; coords: string };
}

export const TOTAL_MENEMEN = '38.6266439,27.0558707';

export const ROUTE_FIXTURES: RouteFixtureSpec[] = [
  { id: 'menemen-eskisehir', label: 'Menemen → Eskişehir (Ford Otomotiv Tepebaşı)', origin: TOTAL_MENEMEN, destination: '39.873146,30.5739579' },
  { id: 'menemen-ankara', label: 'Menemen → Ankara (ABC Grup Yenimahalle)', origin: TOTAL_MENEMEN, destination: '39.9484369,32.7122122' },
  { id: 'menemen-istanbul-avrupa', label: 'Menemen → İstanbul Avrupa (Asal Motorlu Araçlar Bahçelievler)', origin: TOTAL_MENEMEN, destination: '41.019548,28.8194545' },
  { id: 'menemen-malatya', label: 'Menemen → Malatya (Ahmet Yıldırım Oto)', origin: TOTAL_MENEMEN, destination: '38.3572624,38.2967876' },
  { id: 'menemen-malatya-via-aksaray', label: 'Menemen → Malatya, Aksaray üzerinden', origin: TOTAL_MENEMEN, destination: '38.3572624,38.2967876', via: { name: 'Aksaray', coords: '38.3687,34.0370' } },
  { id: 'menemen-van', label: 'Menemen → Van (Bekiroğlu Pazarlama Edremit)', origin: TOTAL_MENEMEN, destination: '38.4895808,43.3984555' },
];

export const FIXTURE_DIR = 'fixtures/routes';
