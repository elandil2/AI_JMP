import { readFileSync } from 'node:fs';
import { validateCriticalAnalysis, validateWeatherResults } from '../lib/analysisValidation';

// A read-only exported corpus, kept in an ignored .local file; never send it to an AI API.
const rows = JSON.parse(readFileSync(process.argv[2], 'utf8'));
let passed = 0;
const failed: { id: string; error: string }[] = [];
for (const row of rows) {
  try {
    const analysis = structuredClone(row.analysis);
    validateCriticalAnalysis(analysis);
    validateWeatherResults([analysis.weather.origin, analysis.weather.destination, ...(analysis.weather.waypoints ?? [])]);
    passed++;
  } catch (error) { failed.push({ id: row.id, error: (error as Error).message }); }
}
console.log(JSON.stringify({total: rows.length, passed, failed}, null, 2));
if (failed.length) process.exitCode = 1;
