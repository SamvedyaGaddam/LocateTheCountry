import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const COUNTRIES_DIR = path.join(DATA_DIR, 'countries');
const SOURCE_URL = 'https://raw.githubusercontent.com/datasets/geo-countries/main/data/countries.geojson';

async function main() {
  console.log('Reading the existing country index...');
  const index = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'countries.json'), 'utf8'));
  const expectedCodes = new Set(
    index.map((entry) => entry.name).filter((name) => /^[A-Z]{2}$/.test(name)),
  );

  console.log('Downloading country boundaries from the datasets/geo-countries project...');
  const response = await fetch(SOURCE_URL);
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
  const world = await response.json();
  if (world.type !== 'FeatureCollection' || !Array.isArray(world.features)) {
    throw new Error('The downloaded file is not a valid GeoJSON FeatureCollection.');
  }

  const grouped = new Map();
  for (const feature of world.features) {
    const props = feature.properties || {};
    let code = props['ISO3166-1-Alpha-2'];
    // The source dataset provides these fallback fields for France and Norway.
    if (!code || code === '-99') code = props.ISO_A2_EH;
    if (!code || code === '-99' || !expectedCodes.has(code)) continue;
    if (!feature.geometry) continue;
    if (!grouped.has(code)) grouped.set(code, []);
    grouped.get(code).push({
      type: 'Feature',
      properties: { ...props },
      geometry: feature.geometry,
    });
  }

  await fs.mkdir(COUNTRIES_DIR, { recursive: true });
  let written = 0;
  for (const [code, features] of grouped) {
    const output = {
      type: 'FeatureCollection',
      name: code,
      features,
    };
    await fs.writeFile(
      path.join(COUNTRIES_DIR, `${code}.geojson`),
      JSON.stringify(output),
      'utf8',
    );
    written++;
  }

  const missing = [...expectedCodes].filter((code) => !grouped.has(code)).sort();
  console.log(`Created ${written} country GeoJSON files in data/countries/.`);
  if (missing.length) {
    console.warn(`No geometry was found for ${missing.length} indexed codes: ${missing.join(', ')}`);
  }
  console.log('Source: Natural Earth via datasets/geo-countries (public-domain boundary data).');
  console.log('Note: boundaries reflect the source dataset conventions and are not legal boundary determinations.');
}

main().catch((error) => {
  console.error('Could not download country geometry:', error.message);
  process.exitCode = 1;
});
