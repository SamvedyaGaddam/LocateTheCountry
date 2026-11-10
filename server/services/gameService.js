import crypto from 'node:crypto';
import * as turf from '@turf/turf';
import { pool } from '../db/pool.js';
import { calculateScore } from '../utils/scoring.js';
import { getCountryIndex, getCountryByCode, getGeometry } from './countryService.js';

const TOTAL_ROUNDS = 10;
const validModes = new Set(['explorer', 'regional', 'challenge', 'practice']);

function pickRandom(items, count) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

function publicRound(round, country) {
  return {
    roundNumber: round.round_number,
    totalRounds: TOTAL_ROUNDS,
    hintsUsed: round.hints_used,
    hintsRemaining: 2 - round.hints_used,
    hasGuessed: round.guessed_at !== null,
    // Reveal only the country name. Keep its code and geometry private until the guess.
    targetCountryName: country.name,
    prompt: `Find ${country.name} on the map.`,
  };
}

export async function createGame({ playerName = 'Explorer', mode = 'explorer', region = null }) {
  if (!validModes.has(mode)) throw Object.assign(new Error('Invalid game mode'), { status: 400 });
  const countries = await getCountryIndex();
  let eligible = countries;
  if (mode === 'regional') {
    if (!region) throw Object.assign(new Error('Choose a region for Regional mode'), { status: 400 });
    eligible = countries.filter((country) => country.region.toLowerCase() === region.toLowerCase());
  }
  if (mode === 'challenge') {
    eligible = countries.filter((country) => country.landlocked || country.continents.length > 1 || country.borders.length === 0);
  }
  if (eligible.length < TOTAL_ROUNDS) {
    throw Object.assign(new Error('Not enough countries available for this mode. Check your country data.'), { status: 400 });
  }

  const selected = pickRandom(eligible, TOTAL_ROUNDS);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const gameResult = await client.query(
      `INSERT INTO games (player_name, mode, region, total_rounds)
       VALUES ($1, $2, $3, $4) RETURNING id, player_name, mode, total_rounds, current_round, total_score, status`,
      [playerName.trim().slice(0, 40) || 'Explorer', mode, region, TOTAL_ROUNDS],
    );
    const game = gameResult.rows[0];
    for (let i = 0; i < selected.length; i++) {
      await client.query(
        'INSERT INTO game_rounds (game_id, round_number, country_code) VALUES ($1, $2, $3)',
        [game.id, i + 1, selected[i].code],
      );
    }
    await client.query('COMMIT');
    return { ...game, round: publicRound({ round_number: 1, hints_used: 0, guessed_at: null }, selected[0]) };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getGame(gameId) {
  const result = await pool.query('SELECT * FROM games WHERE id = $1', [gameId]);
  return result.rows[0] || null;
}

export async function getCurrentRound(gameId) {
  const game = await getGame(gameId);
  if (!game) return null;
  if (game.status === 'completed') return { game, completed: true };
  const roundResult = await pool.query(
    'SELECT * FROM game_rounds WHERE game_id = $1 AND round_number = $2',
    [gameId, game.current_round],
  );
  const round = roundResult.rows[0];
  if (!round) throw new Error('Current round is missing');
  const country = await getCountryByCode(round.country_code);
  if (!country) throw new Error('Country metadata is missing');
  return { game, round, publicRound: publicRound(round, country) };
}

export async function revealHint(gameId) {
  const state = await getCurrentRound(gameId);
  if (!state) throw Object.assign(new Error('Game not found'), { status: 404 });
  if (state.completed) throw Object.assign(new Error('This game is already complete'), { status: 409 });
  const { round } = state;
  if (round.guessed_at) throw Object.assign(new Error('Hints are unavailable after submitting a guess'), { status: 409 });
  if (round.hints_used >= 2) throw Object.assign(new Error('You have used both hints'), { status: 409 });
  const country = await getCountryByCode(round.country_code);
  if (!country) throw new Error('Country metadata is missing');

  const updated = await pool.query(
    'UPDATE game_rounds SET hints_used = hints_used + 1 WHERE id = $1 AND hints_used < 2 AND guessed_at IS NULL RETURNING hints_used',
    [round.id],
  );
  if (updated.rowCount !== 1) throw Object.assign(new Error('No hints remaining or the round has already been answered'), { status: 409 });
  const hintNumber = updated.rows[0].hints_used;
  let hint;
  if (hintNumber === 1) {
    hint = { type: 'region', label: 'Region', value: country.subregion !== 'Not specified' ? `${country.subregion}, ${country.region}` : country.region };
  } else {
    const geography = country.landlocked
      ? 'This country is landlocked; it has no coastline.'
      : country.borders.length === 0
        ? 'This country has no land borders with other countries.'
        : `This country has a coastline and shares land borders with ${country.borders.length} ${country.borders.length === 1 ? 'country' : 'countries'}.`;
    hint = { type: 'geography', label: 'Geographic clue', value: geography };
  }
  return { hint, hintsUsed: hintNumber, hintsRemaining: 2 - hintNumber };
}

export async function submitGuess(gameId, lat, lng) {
  const state = await getCurrentRound(gameId);
  if (!state) throw Object.assign(new Error('Game not found'), { status: 404 });
  if (state.completed) throw Object.assign(new Error('This game is already complete'), { status: 409 });
  const { game, round } = state;
  if (round.guessed_at) throw Object.assign(new Error('A guess has already been submitted for this round'), { status: 409 });

  const country = await getCountryByCode(round.country_code);
  if (!country) throw new Error('Country metadata is missing');
  const geometry = await getGeometry(country);
  const point = turf.point([lng, lat]);
  const features = geometry.type === 'FeatureCollection' ? geometry.features : [geometry];
  const polygonFeatures = features.filter((feature) => ['Polygon', 'MultiPolygon'].includes(feature?.geometry?.type));
  if (!polygonFeatures.length) throw new Error(`No polygon geometry found for ${country.code}`);
  const correct = polygonFeatures.some((feature) => turf.booleanPointInPolygon(point, feature));
  const distanceKm = correct ? 0 : Math.min(...polygonFeatures.map((feature) => Math.max(0, turf.pointToPolygonDistance(point, feature, { units: 'kilometers' }))));
  const score = calculateScore(distanceKm, round.hints_used, correct);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updateRound = await client.query(
      `UPDATE game_rounds SET guess_lat=$1, guess_lng=$2, distance_km=$3,
       score=$4, is_correct=$5, guessed_at=NOW()
       WHERE id=$6 AND guessed_at IS NULL RETURNING id`,
      [lat, lng, distanceKm, score, correct, round.id],
    );
    if (updateRound.rowCount !== 1) throw Object.assign(new Error('Guess already submitted'), { status: 409 });
    await client.query('UPDATE games SET total_score = total_score + $1 WHERE id = $2', [score, gameId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return {
    correct,
    distanceKm: Number(distanceKm.toFixed(2)),
    score,
    hintsUsed: round.hints_used,
    country: {
      code: country.code,
      name: country.name,
      iso3: (await getCountryMetadataIso3(country.code)) || null,
      region: country.region,
      subregion: country.subregion,
      capital: country.capital,
      currency: country.currency,
      landlocked: country.landlocked,
      borders: country.borders,
    },
    geometry,
  };
}

async function getCountryMetadataIso3(code) {
  const countries = await getCountryIndex();
  const country = countries.find((item) => item.code === code);
  return country?.iso3 || null;
}

export async function advanceRound(gameId) {
  const state = await getCurrentRound(gameId);
  if (!state) throw Object.assign(new Error('Game not found'), { status: 404 });
  if (state.completed) throw Object.assign(new Error('This game is already complete'), { status: 409 });
  if (!state.round.guessed_at) throw Object.assign(new Error('Submit a guess before moving to the next round'), { status: 409 });

  if (state.game.current_round >= state.game.total_rounds) {
    await pool.query("UPDATE games SET status='completed', completed_at=NOW() WHERE id=$1", [gameId]);
    return { completed: true, results: await getGameResults(gameId) };
  }
  const updated = await pool.query(
    'UPDATE games SET current_round = current_round + 1 WHERE id=$1 RETURNING current_round, total_rounds, total_score',
    [gameId],
  );
  const nextState = await getCurrentRound(gameId);
  const nextCountry = await getCountryByCode(nextState.round.country_code);
  return { completed: false, ...updated.rows[0], round: publicRound(nextState.round, nextCountry) };
}

export async function getGameResults(gameId) {
  const game = await getGame(gameId);
  if (!game) return null;
  const rounds = await pool.query(
    `SELECT round_number, country_code, hints_used, distance_km, score, is_correct
     FROM game_rounds WHERE game_id=$1 ORDER BY round_number`,
    [gameId],
  );
  const index = await getCountryIndex();
  const enriched = rounds.rows.map((row) => ({ ...row, country_name: index.find((c) => c.code === row.country_code)?.name || row.country_code }));
  const attempted = enriched.filter((r) => r.is_correct !== null);
  const correctCount = attempted.filter((r) => r.is_correct).length;
  const averageDistance = attempted.length ? attempted.reduce((sum, r) => sum + Number(r.distance_km || 0), 0) / attempted.length : 0;
  return {
    game: { id: game.id, playerName: game.player_name, mode: game.mode, status: game.status, totalScore: game.total_score, totalRounds: game.total_rounds },
    stats: { attempted: attempted.length, correct: correctCount, accuracy: attempted.length ? Math.round(correctCount / attempted.length * 100) : 0, averageDistanceKm: Number(averageDistance.toFixed(2)), hintsUsed: enriched.reduce((sum, r) => sum + r.hints_used, 0) },
    rounds: enriched,
  };
}

export async function getAnalytics(playerName = 'Explorer') {
  const history = await pool.query(
    `SELECT id, mode, total_score, total_rounds, status, created_at, completed_at
     FROM games WHERE LOWER(player_name)=LOWER($1) AND status='completed'
     ORDER BY completed_at DESC LIMIT 20`, [playerName],
  );
  const aggregate = await pool.query(
    `SELECT COUNT(*)::int AS games_played, COALESCE(MAX(total_score),0)::int AS best_score,
            COALESCE(ROUND(AVG(total_score)),0)::int AS average_score
     FROM games WHERE LOWER(player_name)=LOWER($1) AND status='completed'`, [playerName],
  );
  return { playerName, ...aggregate.rows[0], history: history.rows };
}

export async function getLeaderboard() {
  const result = await pool.query(
    `SELECT player_name, MAX(total_score)::int AS best_score, COUNT(*)::int AS games_played
     FROM games WHERE status='completed' AND mode <> 'practice'
     GROUP BY player_name ORDER BY best_score DESC LIMIT 10`,
  );
  return result.rows;
}
