import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

type CountyRecord = { name: string };
type CityRecord = { name: string; counties?: CountyRecord[] };

let cachedCities: CityRecord[] | null = null;

const loadCities = (): CityRecord[] => {
  if (cachedCities) return cachedCities;
  const filePath = path.join(process.cwd(), "cities.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  cachedCities = JSON.parse(raw) as CityRecord[];
  return cachedCities;
};

export async function GET() {
  try {
    const cities = loadCities().map((city) => ({
      name: city.name,
      counties: (city.counties || []).map((c) => c.name)
    }));
    return NextResponse.json({ cities });
  } catch (err: any) {
    console.error("Failed to load cities.json", err);
    return NextResponse.json({ error: "Locations could not be loaded" }, { status: 500 });
  }
}
