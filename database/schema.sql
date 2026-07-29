-- RhythmMania PostgreSQL Database Schema for aaPanel / Standard PostgreSQL
-- Execute this script on your target PostgreSQL instance to set up all tables and indexes.
--
-- Fresh installs only: CREATE TABLE IF NOT EXISTS will NOT alter an existing database.
-- If users.id is still SERIAL/INT (profile URLs like /profile/1), run:
--   database/migrate_user_ids_to_alnum.sql
--
-- Public profile id is users.id (VARCHAR(16) alphanumeric). There is no separate userid column.

BEGIN;

-- Random 16-char alphanumeric public user id (A-Za-z0-9)
CREATE OR REPLACE FUNCTION rm_generate_user_id(len INT DEFAULT 16)
RETURNS VARCHAR AS $$
DECLARE
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  result TEXT := '';
  i INT;
BEGIN
  IF len IS NULL OR len < 1 THEN
    len := 16;
  END IF;
  FOR i IN 1..len LOOP
    result := result || substr(chars, 1 + floor(random() * 62)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(16) PRIMARY KEY DEFAULT rm_generate_user_id(16),
    google_id VARCHAR(128) UNIQUE NOT NULL,
    username VARCHAR(32) NOT NULL,
    email VARCHAR(255),
    role VARCHAR(16) NOT NULL DEFAULT 'user',
    avatar_url VARCHAR(512),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT users_id_alnum_chk CHECK (id ~ '^[A-Za-z0-9]{16}$')
);

CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(16) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS beatmap_sets (
    id VARCHAR(128) PRIMARY KEY, -- e.g., 'server_usseewa'
    title VARCHAR(255) NOT NULL,
    artist VARCHAR(255) NOT NULL,
    creator VARCHAR(255) NOT NULL,
    osz_url VARCHAR(512),
    mode INT NOT NULL DEFAULT 3,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS beatmap_difficulties (
    id VARCHAR(128) PRIMARY KEY, -- e.g., 'server_usseewa_diff_0'
    beatmap_set_id VARCHAR(128) NOT NULL REFERENCES beatmap_sets(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    key_count INT NOT NULL DEFAULT 4,
    difficulty_rating REAL DEFAULT 0.0,
    beatmap_hash VARCHAR(64),
    mode INT NOT NULL DEFAULT 3,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS replays (
    id VARCHAR(64) PRIMARY KEY, -- Unique record UUID/identifier
    user_id VARCHAR(16) REFERENCES users(id) ON DELETE SET NULL,
    beatmap_set_id VARCHAR(128) REFERENCES beatmap_sets(id) ON DELETE CASCADE,
    beatmap_difficulty_id VARCHAR(128) REFERENCES beatmap_difficulties(id) ON DELETE CASCADE,
    beatmap_hash VARCHAR(64) NOT NULL,
    score INT NOT NULL,
    accuracy REAL NOT NULL,
    max_combo INT NOT NULL,
    grade VARCHAR(8) NOT NULL,
    is_failed BOOLEAN NOT NULL DEFAULT FALSE,
    score_state JSONB NOT NULL,
    replay_frames JSONB,
    recorded_settings JSONB,
    mods JSONB,
    replay_source VARCHAR(32) NOT NULL DEFAULT 'guest-local',
    upload_status VARCHAR(32) NOT NULL DEFAULT 'uploaded',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_beatmap_diffs_set ON beatmap_difficulties(beatmap_set_id);
CREATE INDEX IF NOT EXISTS idx_replays_diff_score ON replays(beatmap_difficulty_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_replays_user ON replays(user_id);
CREATE INDEX IF NOT EXISTS idx_replays_hash ON replays(beatmap_hash);
CREATE INDEX IF NOT EXISTS idx_replays_user_created ON replays(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_replays_user_grade ON replays(user_id, grade)
    WHERE is_failed = FALSE;

COMMIT;
