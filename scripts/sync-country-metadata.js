
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

const entries = JSON.parse(
  await fs.readFile(
    path.join(root, 'data/countries.json'),
    'utf8'
  )
);

const codes = new Set(
  entries
    .map((entry) => entry.name)
    .filter((name) => /^[A-Z]{2}$/.test(name))
);

console.log(`Fetching metadata for ${codes.size} ISO alpha-2 codes...`);

const url =
  'https://raw.githubusercontent.com/mledoze/countries/master/countries.json';

const response = await fetch(url);

if (!response.ok) {
  throw new Error(`Country data request failed: HTTP ${response.status}`);
}

const records = await response.json();

if (!Array.isArray(records)) {
  throw new Error('Country data response is not an array.');
}

const output = records
  .filter((item) => codes.has(item.cca2))
  .map((item) => {
    let continents = [];

    if (item.cca2 === 'AQ') {
      continents = ['Antarctica'];
    } else if (item.region === 'Americas') {
      continents = [
        item.subregion === 'South America'
          ? 'South America'
          : 'North America'
      ];
    } else if (item.region) {
      continents = [item.region];
    }

    return {
      cca2: item.cca2,
      cca3: item.cca3 || null,
      name: item.name?.common || item.cca2,
      region: item.region || 'Other',
      subregion: item.subregion || 'Not specified',
      capital: item.capital?.[0] || 'Not specified',
      currency: item.currencies
        ? Object.keys(item.currencies).join(', ')
        : 'Not specified',
      landlocked: Boolean(item.landlocked),
      borders: item.borders || [],
      continents
    };
  });

if (output.length === 0) {
  throw new Error('No country records matched the country index.');
}

await fs.writeFile(
  path.join(root, 'data/country_metadata.json'),
  JSON.stringify(output, null, 2),
  'utf8'
);

console.log(
  `Saved ${output.length} country records to data/country_metadata.json`
);
