/**
 * Offline parser contract for a future licensed KGM bulletin feed.
 *
 * This module deliberately performs no network requests and writes no data.
 * It must not be wired into a commercial collector until KGM's terms or a
 * suitable data licence permit that use.
 */

export const KGM_BULLETIN_SOURCE_URL =
  'https://www.kgm.gov.tr/Sayfalar/KGM/SiteTr/YolDanisma/GunlukYolDurumuBulteni.aspx';

export const KGM_BULLETIN_SCOPE =
  'Daily road-status bulletin only; it is not a complete live accident feed and does not include KGM historical blackspot records.' as const;

export type KgmBulletinCategory = 'road_work' | 'closure' | 'restriction' | 'other';

export type KgmBulletinEntry = {
  number: number | null;
  text: string;
  categories: KgmBulletinCategory[];
};

/** Stable, read-only shape for later use after a licensed feed is available. */
export type KgmBulletinSnapshot = {
  fetch_date: string;
  bulletin_date: string | null;
  fetched_at: string;
  source_url: typeof KGM_BULLETIN_SOURCE_URL;
  source_scope: typeof KGM_BULLETIN_SCOPE;
  status: 'success' | 'success_empty' | 'failure';
  item_count: number;
  entries: KgmBulletinEntry[];
  error_code?: 'invalid_fetched_at' | 'invalid_bulletin_markup';
};

export type KgmBulletinFreshness =
  | { usable: true; ageMs: number }
  | {
      usable: false;
      reason: 'fetch_failed' | 'stale_fetch' | 'bulletin_date_mismatch' | 'invalid_timestamp';
    };

const ISTANBUL_TIME_ZONE = 'Europe/Istanbul';
const DEFAULT_MAX_AGE_MS = 36 * 60 * 60 * 1000;

function getIstanbulDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ISTANBUL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
    '#39': "'",
  };

  return value.replace(/&(#x[\da-f]+|#\d+|[a-z][a-z\d]+);/gi, (entity, key: string) => {
    if (key.startsWith('#x') || key.startsWith('#X')) {
      const codePoint = Number.parseInt(key.slice(2), 16);
      return Number.isFinite(codePoint) && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    }
    if (key.startsWith('#')) {
      const codePoint = Number.parseInt(key.slice(1), 10);
      return Number.isFinite(codePoint) && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    }
    return named[key.toLowerCase()] ?? entity;
  });
}

function htmlToText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
      .replace(/<\s*br\b[^>]*>/gi, ' ')
      .replace(/<\/(?:p|div|li|td|th)\s*>/gi, ' ')
      .replace(/<[^>]*>/g, ' '),
  ).replace(/\s+/g, ' ').trim();
}

function normalizeTurkish(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/[ıİ]/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function classifyEntry(text: string): KgmBulletinCategory[] {
  const normalized = normalizeTurkish(text);
  const categories: KgmBulletinCategory[] = [];

  if (/calism|yapim|onarim|yenileme|bakim/.test(normalized)) {
    categories.push('road_work');
  }
  if (/trafige kapat|ulasima kapat|gecise kapat|yol kapali/.test(normalized)) {
    categories.push('closure');
  }
  if (/tek serit|kontrollu|iki yonlu|tek yon|ulasim .* saglan/.test(normalized)) {
    categories.push('restriction');
  }

  return categories.length > 0 ? categories : ['other'];
}

function parseBulletinDate(value: string): string | null {
  const match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;

  const [, day, month, year] = match;
  const candidate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    candidate.getUTCFullYear() !== Number(year) ||
    candidate.getUTCMonth() !== Number(month) - 1 ||
    candidate.getUTCDate() !== Number(day)
  ) {
    return null;
  }

  return `${year}-${month}-${day}`;
}

function failureSnapshot(fetchedAt: Date, errorCode: KgmBulletinSnapshot['error_code']): KgmBulletinSnapshot {
  const safeFetchedAt = Number.isNaN(fetchedAt.getTime()) ? new Date() : fetchedAt;
  return {
    fetch_date: getIstanbulDate(safeFetchedAt),
    bulletin_date: null,
    fetched_at: safeFetchedAt.toISOString(),
    source_url: KGM_BULLETIN_SOURCE_URL,
    source_scope: KGM_BULLETIN_SCOPE,
    status: 'failure',
    item_count: 0,
    entries: [],
    error_code: errorCode,
  };
}

/** Parses a provided HTML string only; this function does not fetch the source. */
export function parseKgmBulletinHtml(html: string, fetchedAt = new Date()): KgmBulletinSnapshot {
  if (Number.isNaN(fetchedAt.getTime())) {
    return failureSnapshot(new Date(), 'invalid_fetched_at');
  }

  const headingMatch = /<h2\b[^>]*>([\s\S]*?)<\/h2\s*>/i.exec(html);
  const heading = headingMatch ? htmlToText(headingMatch[1]) : '';
  if (!heading || !normalizeTurkish(heading).includes('yol durum bulteni')) {
    return failureSnapshot(fetchedAt, 'invalid_bulletin_markup');
  }

  const remainingMarkup = html.slice((headingMatch?.index ?? 0) + headingMatch![0].length);
  const dateMatch = /<h5\b[^>]*>([\s\S]*?)<\/h5\s*>/i.exec(remainingMarkup);
  const bulletinDate = dateMatch ? parseBulletinDate(htmlToText(dateMatch[1])) : null;
  if (!bulletinDate) {
    return failureSnapshot(fetchedAt, 'invalid_bulletin_markup');
  }

  const tableMatch = /<table\b(?=[^>]*\bclass\s*=\s*['"][^'"]*\btable\b)[^>]*>([\s\S]*?)<\/table\s*>/i.exec(remainingMarkup);
  if (!tableMatch) {
    return failureSnapshot(fetchedAt, 'invalid_bulletin_markup');
  }

  const entries: KgmBulletinEntry[] = [];
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi;
  for (const rowMatch of tableMatch[1].matchAll(rowPattern)) {
    const row = rowMatch[1];
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td\s*>/gi)];
    if (cells.length === 0) continue;

    const text = htmlToText(cells.map((cell) => cell[1]).join(' '));
    if (!text) continue;

    const numberMatch = /<th\b[^>]*>([\s\S]*?)<\/th\s*>/i.exec(row);
    const numberText = numberMatch ? htmlToText(numberMatch[1]) : '';
    const parsedNumber = /^\d+$/.test(numberText) ? Number(numberText) : null;

    entries.push({
      number: parsedNumber,
      text,
      categories: classifyEntry(text),
    });
  }

  return {
    fetch_date: getIstanbulDate(fetchedAt),
    bulletin_date: bulletinDate,
    fetched_at: fetchedAt.toISOString(),
    source_url: KGM_BULLETIN_SOURCE_URL,
    source_scope: KGM_BULLETIN_SCOPE,
    status: entries.length > 0 ? 'success' : 'success_empty',
    item_count: entries.length,
    entries,
  };
}

/**
 * Checks whether a stored snapshot is safe to pass to report generation.
 * Callers should query the newest fetch row first, including failures, so an
 * older success cannot hide a more recent failed collection attempt.
 */
export function assessKgmBulletinFreshness(
  snapshot: KgmBulletinSnapshot,
  now = new Date(),
  maxAgeMs = DEFAULT_MAX_AGE_MS,
): KgmBulletinFreshness {
  if (snapshot.status === 'failure') return { usable: false, reason: 'fetch_failed' };

  const fetchedAt = Date.parse(snapshot.fetched_at);
  const nowMs = now.getTime();
  if (!Number.isFinite(fetchedAt) || !Number.isFinite(nowMs) || fetchedAt > nowMs) {
    return { usable: false, reason: 'invalid_timestamp' };
  }

  const ageMs = nowMs - fetchedAt;
  if (ageMs > maxAgeMs) return { usable: false, reason: 'stale_fetch' };

  if (
    snapshot.fetch_date !== getIstanbulDate(now) ||
    snapshot.bulletin_date !== snapshot.fetch_date
  ) {
    return { usable: false, reason: 'bulletin_date_mismatch' };
  }

  return { usable: true, ageMs };
}
