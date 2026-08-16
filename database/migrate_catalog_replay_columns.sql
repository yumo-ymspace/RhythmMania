/*
 * RhythmMania catalog/replay compatibility migration.
 *
 * Apply this once to an existing database created before the canonical chart
 * and hold-rule columns were added. The statements are safe to run repeatedly.
 */

BEGIN;

ALTER TABLE beatmap_chart_revisions
    ADD COLUMN IF NOT EXISTS canonical_chart JSONB;

ALTER TABLE replays
    ADD COLUMN IF NOT EXISTS hold_rules_version SMALLINT NOT NULL DEFAULT 1;

ALTER TABLE replays
    ADD COLUMN IF NOT EXISTS hold_tick_interval_ms SMALLINT;

CREATE INDEX IF NOT EXISTS idx_replays_verified_revision_score
    ON replays(chart_revision_id, score DESC)
    WHERE is_failed = FALSE AND upload_status = 'uploaded';

COMMIT;
