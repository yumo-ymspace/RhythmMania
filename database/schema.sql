-- RhythmMania PostgreSQL Database Schema for Standard PostgreSQL
-- Execute this script on your target PostgreSQL instance to set up all tables and indexes.
--
-- Public profile id is users.id (VARCHAR(16) alphanumeric). There is no separate userid column.
-- Editable public identity (display name, handle, bio, social links) lives in
-- user_profiles (1:1 with users); uploaded avatar blobs live in user_avatars.

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
    id VARCHAR(128) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    artist VARCHAR(255) NOT NULL,
    creator VARCHAR(255) NOT NULL,
    mode INT NOT NULL DEFAULT 3,
    source VARCHAR(16) NOT NULL DEFAULT 'osuapi',
    source_set_id BIGINT NOT NULL,
    catalog_state VARCHAR(16) NOT NULL DEFAULT 'active',
    rank_status VARCHAR(32),
    cover_url VARCHAR(512),
    last_source_check_at TIMESTAMPTZ,
    source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    ,CONSTRAINT beatmap_sets_source_chk CHECK (source = 'osuapi')
    ,CONSTRAINT beatmap_sets_state_chk CHECK (catalog_state IN ('pending', 'active'))
    ,CONSTRAINT beatmap_sets_source_id_chk CHECK (source_set_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_beatmap_sets_osu_source ON beatmap_sets(source_set_id) WHERE source = 'osuapi';

CREATE TABLE IF NOT EXISTS beatmap_difficulties (
    id VARCHAR(128) PRIMARY KEY, -- legacy difficulty identity when applicable
    beatmap_set_id VARCHAR(128) NOT NULL REFERENCES beatmap_sets(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    key_count INT NOT NULL DEFAULT 4,
    difficulty_rating REAL DEFAULT 0.0,
    beatmap_hash VARCHAR(64),
    mode INT NOT NULL DEFAULT 3,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS beatmap_chart_revisions (
    id VARCHAR(256) PRIMARY KEY,
    beatmap_set_id VARCHAR(128) NOT NULL REFERENCES beatmap_sets(id) ON DELETE CASCADE,
    source_chart_id BIGINT,
    original_osu_filename VARCHAR(512) NOT NULL,
    difficulty_name VARCHAR(255) NOT NULL,
    key_count INT NOT NULL CHECK (key_count BETWEEN 2 AND 8),
    mode INT NOT NULL DEFAULT 3 CHECK (mode = 3),
    checksum VARCHAR(128) NOT NULL,
    checksum_algorithm VARCHAR(8) NOT NULL CHECK (checksum_algorithm IN ('md5', 'sha256')),
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    retired_at TIMESTAMPTZ,
    UNIQUE (source_chart_id, checksum),
    UNIQUE (beatmap_set_id, original_osu_filename, checksum)
);

CREATE TABLE IF NOT EXISTS replays (
    id VARCHAR(64) PRIMARY KEY, -- Unique record UUID/identifier
    user_id VARCHAR(16) REFERENCES users(id) ON DELETE SET NULL,
    beatmap_set_id VARCHAR(128) REFERENCES beatmap_sets(id) ON DELETE CASCADE,
    beatmap_difficulty_id VARCHAR(128) REFERENCES beatmap_difficulties(id) ON DELETE CASCADE,
    beatmap_hash VARCHAR(64) NOT NULL,
    chart_revision_id VARCHAR(256) REFERENCES beatmap_chart_revisions(id) ON DELETE CASCADE,
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

-- Editable public profile identity (1:1 with users).
-- A row is created on first profile edit (upsert); users without a row fall back to users.username.
-- handle is a public URL slug: 3-20 chars, lowercase a-z0-9_, must start with a letter, unique.
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id        VARCHAR(16) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name   VARCHAR(32) NOT NULL,
    handle         VARCHAR(20) UNIQUE NOT NULL,
    bio            TEXT NOT NULL DEFAULT '',
    social_links   JSONB NOT NULL DEFAULT '{}'::jsonb,
    activity_status VARCHAR(16) NOT NULL DEFAULT 'offline',
    activity_message VARCHAR(80) NOT NULL DEFAULT '',
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT user_profiles_handle_format_chk CHECK (handle ~ '^[a-z][a-z0-9_]{2,19}$'),
    CONSTRAINT user_profiles_activity_status_chk CHECK (activity_status IN ('playing', 'practicing', 'mapping', 'away', 'offline', 'custom'))
);

-- Uploaded avatar image blobs. Preset avatars use a URL in users.avatar_url instead.
CREATE TABLE IF NOT EXISTS user_avatars (
    user_id    VARCHAR(16) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    mime       VARCHAR(32) NOT NULL,
    data       BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_beatmap_diffs_set ON beatmap_difficulties(beatmap_set_id);
CREATE INDEX IF NOT EXISTS idx_replays_diff_score ON replays(beatmap_difficulty_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_replays_revision_score ON replays(chart_revision_id, score DESC) WHERE is_failed = FALSE;
CREATE INDEX IF NOT EXISTS idx_replays_user ON replays(user_id);
CREATE INDEX IF NOT EXISTS idx_replays_hash ON replays(beatmap_hash);
CREATE INDEX IF NOT EXISTS idx_replays_user_created ON replays(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_replays_user_grade ON replays(user_id, grade)
    WHERE is_failed = FALSE;

CREATE TABLE IF NOT EXISTS catalog_search_rate_limits (
    user_id VARCHAR(16) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    window_started TIMESTAMPTZ NOT NULL,
    request_count INT NOT NULL DEFAULT 0
);

COMMIT;
