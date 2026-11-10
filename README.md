# GeoQuest setup guide

GeoQuest is a full-stack geography game built with HTML, CSS, JavaScript, Leaflet, Turf.js, Node.js, Express and PostgreSQL.

## Requirements
- Node.js 20 or newer (LTS recommended)
- PostgreSQL 16 or newer
- pgAdmin 4 (installed separately or with PostgreSQL)
- Internet access for the one-time geometry and country-metadata downloads

## 1. Open pgAdmin and create the database

1. Open **pgAdmin 4** from the Windows Start menu.
2. If prompted, create a pgAdmin master password. This protects saved connection passwords; it is not necessarily your PostgreSQL server password.
3. In the left Browser panel, expand **Servers** and select your PostgreSQL server. Enter the PostgreSQL password you chose during installation if prompted.
4. Expand the server, right-click **Databases** → **Create** → **Database...**.
5. Set **Database** to `geoquest` and **Owner** to `postgres` (or your PostgreSQL admin user), then click **Save**.

If no server is listed: right-click **Servers** → **Register** → **Server...**. Under General, name it `Local PostgreSQL`. Under Connection, use Host `localhost`, Port `5432`, Maintenance database `postgres`, Username `postgres`, and the password you chose during PostgreSQL installation. Save.

## 2. Open the project in VS Code

1. Extract the ZIP.
2. In VS Code, choose **File → Open Folder...** and select the extracted `geoquest` folder (the folder containing `package.json`).
3. Open **Terminal → New Terminal**.
4. Confirm Node.js and npm work:

```bash
node -v
npm -v
```

If either command is not recognized, finish installing Node.js and reopen VS Code/its terminal before continuing.

## 3. Install project dependencies

In the VS Code terminal, run:

```bash
npm install
```

## 4. Download the country GeoJSON files

The ZIP includes the downloader, but not the large boundary dataset itself. Run this once while connected to the internet:

```bash
npm run download:geometry
```

It creates individual files such as `data/countries/IN.geojson`, `data/countries/US.geojson`, and `data/countries/FR.geojson` from the Natural Earth-based `datasets/geo-countries` dataset. The source contains country polygons and uses ISO alpha-2/alpha-3 codes. Some territories or disputed areas do not have ISO codes and are not included in the alpha-2 game index.

## 5. Configure the database connection

In the project root, make a copy of `.env.example` and name the copy `.env`. Open `.env` and set the password to the PostgreSQL password you chose during installation:

```env
PORT=3000
DATABASE_URL=postgresql://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/geoquest
NODE_ENV=development
```

Replace `YOUR_POSTGRES_PASSWORD`; do not include the angle brackets. If your PostgreSQL username is not `postgres`, replace that too.

## 6. Download country metadata

```bash
npm run sync:metadata
```

This creates `data/country_metadata.json`. Internet access is required for this one-time step.

## 7. Create the database tables

```bash
npm run db:setup
```

## 8. Start GeoQuest

```bash
npm run dev
```

Open `http://localhost:3000` in your browser. To check the API/database connection, open `http://localhost:3000/api/health`.

## 9. Run the tests

In a second terminal, run:

```bash
npm test
```

## Setup order (quick reference)

```text
pgAdmin: create geoquest database
VS Code terminal: npm install
VS Code terminal: npm run download:geometry
Create .env with your PostgreSQL password
VS Code terminal: npm run sync:metadata
VS Code terminal: npm run db:setup
VS Code terminal: npm run dev
```

## Notes
- The backend selects target countries and calculates scores; the browser cannot submit its own score.
- Country geometry is loaded by the backend and cached in memory after first use.
- This starter does not implement user accounts or authentication. Player names are labels, not verified identities.
- The leaderboard is suitable for a local portfolio demo, not a public competitive service without authentication and anti-cheat controls.
- Boundary data comes from Natural Earth via `datasets/geo-countries`. Natural Earth boundaries reflect the source's cartographic conventions and are not legal boundary determinations. See https://github.com/datasets/geo-countries for source details and licensing.
