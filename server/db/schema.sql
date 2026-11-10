CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name VARCHAR(40) NOT NULL DEFAULT 'Explorer',
  mode VARCHAR(20) NOT NULL CHECK (mode IN ('explorer', 'regional', 'challenge', 'practice')),
  region VARCHAR(80),
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  total_rounds INTEGER NOT NULL DEFAULT 10 CHECK (total_rounds BETWEEN 1 AND 20),
  current_round INTEGER NOT NULL DEFAULT 1,
  total_score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS game_rounds (
  id BIGSERIAL PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  country_code CHAR(2) NOT NULL,
  hints_used SMALLINT NOT NULL DEFAULT 0 CHECK (hints_used BETWEEN 0 AND 2),
  guess_lat DOUBLE PRECISION,
  guess_lng DOUBLE PRECISION,
  distance_km DOUBLE PRECISION,
  score INTEGER,
  is_correct BOOLEAN,
  guessed_at TIMESTAMPTZ,
  UNIQUE (game_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_games_player_created ON games (player_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_status ON games (status);
CREATE INDEX IF NOT EXISTS idx_rounds_game ON game_rounds (game_id, round_number);
