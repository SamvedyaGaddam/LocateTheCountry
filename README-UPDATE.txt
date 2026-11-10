# GeoQuest corrected source

## Apply the update
1. Stop the running server with Ctrl+C.
2. Extract this ZIP into your existing `geoquest` project folder and allow files to be overwritten.
3. Do NOT delete or replace your `.env` file.
4. Do NOT run `npm run db:setup`; your existing PostgreSQL tables are preserved.
5. Run `npm run dev`.

The update changes the frontend, country geometry filtering, and leaderboard handling.
It does not change the database schema or package dependencies.

The app creates a browser-local anonymous player name (Explorer-XXXXXX). Statistics
are associated with that name in your existing games table. Clearing browser storage
or changing browsers will lose the association; no account/login is implemented.
