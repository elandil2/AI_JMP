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
