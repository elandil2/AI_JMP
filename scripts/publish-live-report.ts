import fs from 'node:fs';
import path from 'node:path';
import { getSupabaseAdmin } from '../lib/supabaseAdmin';
import { generateSlug } from '../lib/slug';
import { analyzeRoute } from '../services/geminiService';
import { sanitizeAnalysis } from '../lib/analysis';
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

async function publishReport() {
  const originCity = 'izmir';
  const originCounty = 'menemen';
  const destCity = 'malatya';
  const destCounty = 'arguvan';

  const origin = findLocation(originCity, originCounty);
  const dest = findLocation(destCity, destCounty);

  const originName = `${originCity}, ${originCounty}`;
  const destName = `${destCity}, ${destCounty}`;
  const originCoords = `${origin.lat},${origin.lng}`;
  const destCoords = `${dest.lat},${dest.lng}`;

  console.log('Generating analysis...');
  const departureIso = new Date().toISOString();
  const rawAnalysis = await analyzeRoute(originName, destName, originCoords, destCoords, {
    useTolls: true,
    departureTime: departureIso,
    model: 'gemini-3.8-flash'
  });

  const analysis = sanitizeAnalysis(rawAnalysis);
  const publicSlug = generateSlug(10);
  const supabase = getSupabaseAdmin();

  // Find any operator profile or create a default system operator
  const { data: profiles } = await supabase.from('profiles').select('id').limit(1);
  const operatorId = profiles?.[0]?.id ?? null;

  console.log('Inserting into Supabase...');
  const { data: inserted, error: insertError } = await supabase
    .from('reports')
    .insert({
      public_slug: publicSlug,
      operator_id: operatorId,
      origin_city: originCity,
      origin_county: originCounty,
      origin_lat: origin.lat,
      origin_lng: origin.lng,
      destination_city: destCity,
      destination_county: destCounty,
      destination_lat: dest.lat,
      destination_lng: dest.lng,
      departure_time: departureIso,
      status: 'ready',
      analysis,
      error_message: null
    })
    .select('id, public_slug')
    .single();

  if (insertError) {
    console.error('Insert error:', insertError);
    return;
  }

  console.log('SUCCESS!');
  console.log(`Report ID: ${inserted.id}`);
  console.log(`Public Slug: ${inserted.public_slug}`);
  console.log(`Public URL: http://localhost:3000/r/${inserted.public_slug}`);
}

publishReport().catch(console.error);
