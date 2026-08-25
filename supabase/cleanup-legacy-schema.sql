-- ============================================================================
-- Stay Interesting / Boredom Buster — legacy schema cleanup
--
-- A one-off tidy-up of leftovers from the original hand-written schema, run
-- AFTER step1-schema-rls-seed.sql. Four jobs:
--
--   1. Drop the unused `personality_scores` column.
--   2. Drop the duplicate RLS policies left behind under their old names.
--   3. Drop the unused `budget_level` and `time_required` columns.
--   4. Make `vector` NOT NULL, now that every row has one.
--
-- HOW TO RUN
--   Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
--
-- Safe to run more than once. Every step is guarded and becomes a no-op once
-- it has been applied.
--
-- ⚠️ WHAT THIS DELIBERATELY DOES NOT DO
--   The original schema script began with:
--       drop table if exists saved_activities cascade;
--       drop table if exists activities cascade;
--   Those are NOT reproduced here and must not be run. They would destroy all
--   37 seeded activities and every user's saved list. This file drops columns
--   and policies only; it drops no tables and deletes no rows.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- STEP 1 — Drop the unused `personality_scores` column
--
-- Background: it was declared `vector(7)` — a pgvector column — as the original
-- home for the 7 axes. The project instead stores them in `vector integer[]`,
-- which is populated on every row, so this one is dead weight.
--
-- Dropping a column is irreversible, so this refuses to act if any row has
-- data in it. If the raise below fires, nothing is dropped and you should tell
-- Claude before re-running — it would mean real data lives there.
--
-- The pgvector EXTENSION is intentionally left installed. It costs nothing
-- unused, and keeping it means switching to pgvector later is a column add
-- rather than a reinstall.
-- ----------------------------------------------------------------------------

do $$
declare
  populated integer;
  total     integer;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'activities'
      and column_name  = 'personality_scores'
  ) then
    raise notice 'personality_scores is already gone — nothing to do.';
    return;
  end if;

  -- EXECUTE keeps the column name from being resolved at parse time, so this
  -- block still runs cleanly once the column no longer exists.
  execute 'select count(*) from public.activities where personality_scores is not null'
    into populated;
  select count(*) into total from public.activities;

  if populated > 0 then
    raise exception
      'ABORTED: % of % rows have personality_scores data. Nothing was dropped.',
      populated, total;
  end if;

  execute 'alter table public.activities drop column personality_scores';
  raise notice 'Dropped personality_scores (was null on all % rows).', total;
end
$$;


-- ----------------------------------------------------------------------------
-- STEP 2 — Remove the duplicate RLS policies
--
-- step1-schema-rls-seed.sql created its policies under new names, and its
-- `drop policy if exists` guards only ever matched those new names. The
-- originals were therefore left in place, giving two policies per operation.
--
-- That is not a security hole — multiple PERMISSIVE policies are OR'd, and
-- both versions express the same rule — but it is redundant, each one costs
-- evaluation on every query, and the old ones call auth.uid() unwrapped, which
-- Postgres re-evaluates per row instead of once per query.
--
-- These drops are name-specific and safe whether or not the policies exist.
-- ----------------------------------------------------------------------------

drop policy if exists "Activities are viewable by everyone"        on public.activities;
drop policy if exists "Users can view their own saved activities"   on public.saved_activities;
drop policy if exists "Users can insert their own saved activities" on public.saved_activities;
drop policy if exists "Users can delete their own saved activities" on public.saved_activities;


-- ----------------------------------------------------------------------------
-- STEP 3 — Verification (read-only)
-- ----------------------------------------------------------------------------

-- 3a. Columns at this point in the file: personality_scores absent, leaving 8.
--     Steps 4 and 5 below then remove two more - see 6a for the final shape.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'activities'
order by ordinal_position;

-- 3b. Policies. Expect exactly 4 — one on activities, three on
--     saved_activities — all under the newer names:
--       Activities are publicly readable        (activities, SELECT)
--       Users can read their own saved activities    (saved_activities, SELECT)
--       Users can save activities for themselves     (saved_activities, INSERT)
--       Users can remove their own saved activities  (saved_activities, DELETE)
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('activities', 'saved_activities')
order by tablename, cmd;

-- 3c. RLS still enabled on both tables — must be true for each.
select relname as table_name, relrowsecurity as rls_enabled
from pg_class
where oid in ('public.activities'::regclass, 'public.saved_activities'::regclass);

-- 3d. The seed data is untouched: 37 rows, none missing a vector.
select count(*) as total_activities,
       count(*) filter (where vector is null) as missing_vector
from public.activities;

-- 3e. pgvector is still installed and available for later.
select extname, extversion from pg_extension where extname = 'vector';


-- ----------------------------------------------------------------------------
-- STEP 4 — Drop `budget_level` and `time_required`  (Owen's decision, 2026-08-25)
--
-- Two unused text columns from the original schema, overlapping what `tags`
-- already encodes ('low-budget'/'free', '10-mins'/'1-hour'). Nothing reads
-- them, and budget and time are both now driven entirely by tags — budget
-- became a hard filter alongside social and location.
--
-- Guarded the same way as personality_scores above: each column is checked for
-- data first and the whole block aborts rather than destroying anything.
-- ----------------------------------------------------------------------------

do $$
declare
  populated integer;
  col       text;
begin
  foreach col in array array['budget_level', 'time_required'] loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name   = 'activities'
        and column_name  = col
    ) then
      raise notice '% is already gone — nothing to do.', col;
      continue;
    end if;

    execute format('select count(*) from public.activities where %I is not null', col)
      into populated;

    if populated > 0 then
      raise exception 'ABORTED: % row(s) have data in %. Nothing dropped.', populated, col;
    end if;

    execute format('alter table public.activities drop column %I', col);
    raise notice 'Dropped %.', col;
  end loop;
end
$$;


-- ----------------------------------------------------------------------------
-- STEP 5 — Make `vector` mandatory
--
-- This was STEP 8 in step1-schema-rls-seed.sql, left commented until every row
-- had a vector. All 37 seeded rows do, so it is applied here: a future activity
-- can no longer be added without one, which would otherwise make it silently
-- unrankable by lib/matchActivities.ts.
--
-- Aborts rather than failing halfway if any row is still missing a vector.
-- Re-running once the column is already NOT NULL is a harmless no-op.
-- ----------------------------------------------------------------------------

do $$
declare
  missing integer;
begin
  select count(*) into missing from public.activities where vector is null;

  if missing > 0 then
    raise exception
      'ABORTED: % activity row(s) still have no vector. Seed them first.', missing;
  end if;

  alter table public.activities alter column vector set not null;
  raise notice 'vector is now NOT NULL.';
end
$$;


-- ----------------------------------------------------------------------------
-- STEP 6 — Verification for steps 4 and 5 (read-only)
-- ----------------------------------------------------------------------------

-- 6a. Columns on activities. budget_level and time_required should be absent,
--     leaving 6: id, title, description, created_at, tags, vector.
--     vector should now read is_nullable = NO.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'activities'
order by ordinal_position;

-- 6b. Seed data untouched: expect 37 rows, 0 missing a vector.
select count(*) as total_activities,
       count(*) filter (where vector is null) as missing_vector
from public.activities;
