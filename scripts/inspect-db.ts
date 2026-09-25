import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env: Record<string, string> = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx !== -1) {
    const k = trimmed.slice(0, eqIdx).trim();
    const v = trimmed.slice(eqIdx + 1).trim();
    env[k] = v;
  }
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: reports, error } = await supabase
    .from('reports')
    .select('id, public_slug, origin_city, destination_city, status, created_at, analysis, error_message')
    .gte('created_at', '2026-09-01T00:00:00Z')
    .lte('created_at', '2026-09-24T23:59:59Z')
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Supabase error:", error);
    return;
  }

  console.log(`Reports between Sept 1 and Sept 24: ${reports?.length}`);
  for (const r of reports || []) {
    const a = r.analysis || {};
    console.log(`-----------------------------------------------`);
    console.log(`${r.id} | Slug: ${r.public_slug} | Date: ${r.created_at} | Status: ${r.status}`);
    console.log(`Route: ${r.origin_city} -> ${r.destination_city}`);
    console.log(`CriticalPoints: ${a.criticalPoints?.length || 0} | Timeline: ${a.timeline?.length || 0} | RiskIntensity: ${a.riskIntensity?.length || 0}`);
    if (r.error_message) console.log(`Error: ${r.error_message}`);
    if (a.summary) console.log(`Notice: ${a.summary.routeNotice || a.summary.breakNote || ''}`);
  }
}

main().catch(console.error);
