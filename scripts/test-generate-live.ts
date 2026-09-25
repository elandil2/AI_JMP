import fs from 'node:fs';
import path from 'node:path';
import { analyzeRoute } from '../services/geminiService';
import { findLocation } from '../lib/location';

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx !== -1) {
    const k = trimmed.slice(0, eqIdx).trim();
    const v = trimmed.slice(eqIdx + 1).trim();
    process.env[k] = v;
  }
}

async function testRoute(originCity: string, originCounty: string, destCity: string, destCounty: string) {
  const origin = findLocation(originCity, originCounty);
  const dest = findLocation(destCity, destCounty);

  const originName = `${originCity}, ${originCounty}`;
  const destName = `${destCity}, ${destCounty}`;
  const originCoords = `${origin.lat},${origin.lng}`;
  const destCoords = `${dest.lat},${dest.lng}`;

  console.log(`\n======================================================`);
  console.log(`Testing Route Generation: ${originName} -> ${destName}`);
  console.log(`======================================================`);

  const started = Date.now();
  try {
    const analysis = await analyzeRoute(originName, destName, originCoords, destCoords, {
      useTolls: true,
      departureTime: new Date().toISOString()
    });

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`Completed in ${elapsed}s!`);
    console.log(`Summary:`, JSON.stringify(analysis.summary, null, 2));
    console.log(`\nCritical Points Count: ${analysis.criticalPoints?.length}`);
    if (analysis.criticalPoints?.length) {
      console.log(`Critical Points Sample:`);
      analysis.criticalPoints.forEach((cp, idx) => {
        console.log(`  ${idx + 1}. [${cp.incident?.type?.toUpperCase()}] ${cp.weather?.location || 'Konum'}: ${cp.incident?.description} (Trafik: ${cp.traffic?.status}, Hava: ${cp.weather?.temp} ${cp.weather?.condition})`);
      });
    }

    console.log(`\nTimeline Count: ${analysis.timeline?.length}`);
    if (analysis.timeline?.length) {
      console.log(`Timeline:`);
      analysis.timeline.forEach((tl, idx) => {
        console.log(`  ${idx + 1}. [${tl.type}] ${tl.title} - ${tl.description}`);
      });
    }

    console.log(`\nRisk Intensity Segments: ${analysis.riskIntensity?.length}`);
    if (analysis.riskIntensity?.length) {
      console.log(`Risk Intensity:`);
      analysis.riskIntensity.forEach((ri, idx) => {
        console.log(`  ${idx + 1}. ${ri.name}: Risk Puanı ${ri.value} (Renk: ${ri.color})`);
      });
    }

    console.log(`\nRisk Types: ${analysis.riskTypes?.length}`);
    if (analysis.riskTypes?.length) {
      analysis.riskTypes.forEach((rt, idx) => {
        console.log(`  ${idx + 1}. ${rt.category}: ${rt.value}`);
      });
    }

    console.log(`\nWeather Checkpoints:`);
    console.log(`  Origin: ${analysis.weather.origin.location} (${analysis.weather.origin.temp}, ${analysis.weather.origin.condition})`);
    console.log(`  Destination: ${analysis.weather.destination.location} (${analysis.weather.destination.temp}, ${analysis.weather.destination.condition})`);
    console.log(`  Waypoints (${analysis.weather.waypoints?.length}):`);
    analysis.weather.waypoints?.slice(0, 5).forEach((wp, idx) => {
      console.log(`    ${idx + 1}. ${wp.location}: ${wp.temp}, ${wp.condition}`);
    });

    console.log(`\nRoute Schematic Nodes: ${analysis.routeSchematic?.nodes?.length}`);
  } catch (err: any) {
    console.error("Test Route Failed:", err);
  }
}

async function main() {
  await testRoute('izmir', 'menemen', 'malatya', 'arguvan');
}

main().catch(console.error);
