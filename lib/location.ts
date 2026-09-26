import fs from "fs";
import path from "path";

export type CountyRecord = {
  name: string;
  latitude?: string;
  longitude?: string;
};

export type CityRecord = {
  name: string;
  plate?: string;
  latitude?: string;
  longitude?: string;
  counties?: CountyRecord[];
};

export type LocationMatch = {
  city: string;
  county?: string;
  lat?: number;
  lng?: number;
  matched: boolean;
};

let cachedCities: CityRecord[] | null = null;

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]/g, "");

const loadCities = (): CityRecord[] => {
  if (cachedCities) return cachedCities;
  const dataPath = path.join(process.cwd(), "cities.json");
  const raw = fs.readFileSync(dataPath, "utf-8");
  cachedCities = JSON.parse(raw) as CityRecord[];
  return cachedCities;
};

export const findLocation = (cityInput: string, countyInput?: string): LocationMatch => {
  const cities = loadCities();
  const cityKey = normalize(cityInput);
  const countyKey = countyInput ? normalize(countyInput) : null;

  for (const city of cities) {
    if (!city.name) continue;
    if (normalize(city.name) !== cityKey) continue;

    if (countyKey && city.counties?.length) {
      const county = city.counties.find((c) => normalize(c.name) === countyKey);
      if (county) {
        return {
          city: city.name,
          county: county.name,
          lat: county.latitude ? Number(county.latitude) : city.latitude ? Number(city.latitude) : undefined,
          lng: county.longitude ? Number(county.longitude) : city.longitude ? Number(city.longitude) : undefined,
          matched: true
        };
      }
    }

    return {
      city: city.name,
      county: countyInput,
      lat: city.latitude ? Number(city.latitude) : undefined,
      lng: city.longitude ? Number(city.longitude) : undefined,
      matched: true
    };
  }

  return { city: cityInput, county: countyInput, matched: false };
};

export const formatLocationName = (county?: string | null, city?: string | null): string => {
  const cap = (s?: string | null) =>
    s ? s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1).toLocaleLowerCase('tr-TR') : '';
  const cCity = cap(city);
  const cCounty = cap(county);
  if (cCounty && cCity && cCounty.toLocaleLowerCase('tr-TR') !== cCity.toLocaleLowerCase('tr-TR')) {
    return `${cCounty}, ${cCity}`;
  }
  return cCity || cCounty || '';
};

export const findNearestLocation = (
  lat: number,
  lng: number
): { city: string; county: string; distanceKm: number } | null => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const cities = loadCities();
  let closest: { city: string; county: string; distanceKm: number } | null = null;
  let minDist = Number.POSITIVE_INFINITY;

  for (const city of cities) {
    if (!city.counties?.length) continue;
    for (const county of city.counties) {
      if (!county.latitude || !county.longitude) continue;
      const cLat = Number(county.latitude);
      const cLng = Number(county.longitude);
      if (!Number.isFinite(cLat) || !Number.isFinite(cLng)) continue;
      const x = (lng - cLng) * Math.cos((lat * Math.PI) / 180);
      const y = lat - cLat;
      const d = Math.hypot(x, y);
      if (d < minDist) {
        minDist = d;
        closest = {
          city: city.name,
          county: county.name,
          distanceKm: Math.round(d * 111)
        };
      }
    }
  }
  return closest;
};

