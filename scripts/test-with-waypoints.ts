import fs from 'node:fs';
import path from 'node:path';
import { analyzeRoute } from '../services/geminiService';
import { findLocation } from '../lib/location';

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

async function testWithWaypoint() {
  const origin = findLocation('izmir', 'menemen');
  const dest = findLocation('malatya', 'arguvan');
  const stop = findLocation('aksaray', 'merkez'); // Ara durak: Aksaray

  const originName = 'İzmir, Menemen';
  const destName = 'Malatya, Arguvan';
  const originCoords = `${origin.lat},${origin.lng}`;
  const destCoords = `${dest.lat},${dest.lng}`;
  const stopCoords = `${stop.lat},${stop.lng}`;

  console.log(`Testing with Ara Durak (Aksaray):`);
  console.log(`Origin: ${originName} (${originCoords})`);
  console.log(`Ara Durak: Aksaray (${stopCoords})`);
  console.log(`Dest: ${destName} (${destCoords})`);

  const started = Date.now();
  const rawAnalysis = await analyzeRoute(originName, destName, originCoords, destCoords, {
    useTolls: true,
    stopName: 'Aksaray',
    stopCoords: stopCoords,
    departureTime: new Date().toISOString(),
    model: 'gemini-3.8-flash'
  });

  console.log(`Finished in ${((Date.now() - started)/1000).toFixed(1)}s!`);
  
  const { getSupabaseAdmin } = await import('../lib/supabaseAdmin');
  const { generateSlug } = await import('../lib/slug');
  const { sanitizeAnalysis } = await import('../lib/analysis');

  const analysis = sanitizeAnalysis(rawAnalysis);
  const publicSlug = generateSlug(10);
  const supabase = getSupabaseAdmin();
  const { data: profiles } = await supabase.from('profiles').select('id').limit(1);
  const operatorId = profiles?.[0]?.id ?? null;

  const { data: inserted, error: insertError } = await supabase
    .from('reports')
    .insert({
      public_slug: publicSlug,
      operator_id: operatorId,
      origin_city: 'izmir',
      origin_county: 'menemen',
      origin_lat: origin.lat,
      origin_lng: origin.lng,
      destination_city: 'malatya',
      destination_county: 'arguvan',
      destination_lat: dest.lat,
      destination_lng: dest.lng,
      departure_time: new Date().toISOString(),
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

  console.log('\nSUCCESSFULLY SAVED REPORT WITH ARA DURAK:');
  console.log(`Public URL: http://localhost:3000/r/${inserted.public_slug}`);
}

testWithWaypoint().catch(console.error);
