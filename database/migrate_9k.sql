BEGIN;

DO $$
DECLARE
  invalid_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO invalid_count
  FROM beatmap_chart_revisions
  WHERE key_count < 2 OR key_count > 9;

  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Cannot apply 9K migration: % chart revisions are outside key counts 2..9', invalid_count;
  END IF;
END $$;

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint AS con
    JOIN pg_class AS rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'beatmap_chart_revisions'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%key_count%'
  LOOP
    EXECUTE format('ALTER TABLE beatmap_chart_revisions DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE beatmap_chart_revisions
  ADD CONSTRAINT beatmap_chart_revisions_key_count_check CHECK (key_count BETWEEN 2 AND 9);

COMMIT;
