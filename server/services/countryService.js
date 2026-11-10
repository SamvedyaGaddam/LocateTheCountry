import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');
const DATA_DIR = path.join(ROOT, 'data');
const COUNTRIES_DIR = path.join(DATA_DIR, 'countries');
let countryIndexPromise;
const geometryCache = new Map();

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

function isSafeGeometryPath(relativePath) {
  if (typeof relativePath !== 'string' || !relativePath.length) return false;
  const fullPath = path.resolve(DATA_DIR, relativePath);
  const relative = path.relative(COUNTRIES_DIR, fullPath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export async function getCountryIndex() {
  if (!countryIndexPromise) {
    countryIndexPromise = (async () => {
      const [entries, names, metadata] = await Promise.all([
        readJson(path.join(DATA_DIR, 'countries.json')),
        readJson(path.join(DATA_DIR, 'country_names.json')),
        readJson(path.join(DATA_DIR, 'country_metadata.json')),
      ]);
      if (!Array.isArray(entries) || !names || Array.isArray(names) || !Array.isArray(metadata)) {
        throw new Error('Country data files have an unexpected format.');
      }
      const metadataByCode = new Map(metadata.map((item) => [item.cca2, item]));
      const countries = entries
        .filter((entry) => entry && /^[A-Z]{2}$/.test(entry.name) && metadataByCode.has(entry.name) && isSafeGeometryPath(entry.path))
        .map((entry) => {
          const meta = metadataByCode.get(entry.name);
          return {
            code: entry.name,
            iso3: meta.cca3 || null,
            name: names[entry.name] || meta.name || entry.name,
            path: entry.path,
            region: meta.region || 'Other',
            subregion: meta.subregion || 'Not specified',
            capital: meta.capital || 'Not specified',
            currency: meta.currency || 'Not specified',
            landlocked: Boolean(meta.landlocked),
            borders: Array.isArray(meta.borders) ? meta.borders : [],
            continents: Array.isArray(meta.continents) ? meta.continents : [],
          };
        });

      // Exclude indexed countries whose geometry file is absent, rather than
      // randomly assigning an unplayable country to a game round.
      const playable = [];
      for (const country of countries) {
        try {
          await fs.access(path.resolve(DATA_DIR, country.path));
          playable.push(country);
        } catch {
          // Missing geometry is deliberately skipped.
        }
      }
      if (playable.length < 10) {
        throw new Error(`Only ${playable.length} countries have geometry; at least 10 are required.`);
      }
      return playable;
    })().catch((error) => {
      countryIndexPromise = undefined;
      throw error;
    });
  }
  return countryIndexPromise;
}

export async function getCountryByCode(code) {
  const index = await getCountryIndex();
  return index.find((country) => country.code === code) || null;
}

export async function getGeometry(country) {
  if (!isSafeGeometryPath(country.path)) {
    throw new Error(`Unsafe geometry path for ${country.code}`);
  }
  if (geometryCache.has(country.code)) return geometryCache.get(country.code);
  const fullPath = path.resolve(DATA_DIR, country.path);
  const raw = await readJson(fullPath);
  const geojson = raw.type === 'FeatureCollection' ? raw : raw.type === 'Feature' ? raw : null;
  if (!geojson) throw new Error(`Invalid GeoJSON for ${country.code}`);
  geometryCache.set(country.code, geojson);
  return geojson;
}

export function clearCountryCachesForTests() {
  countryIndexPromise = undefined;
  geometryCache.clear();
}
