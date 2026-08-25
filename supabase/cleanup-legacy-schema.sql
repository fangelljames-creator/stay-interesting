-- ============================================================================
-- Stay Interesting / Boredom Buster — legacy schema cleanup
--
-- A one-off tidy-up of leftovers from the original hand-written schema, run
-- AFTER step1-schema-rls-seed.sql. Two jobs:
--
--   1. Drop the unused `personality_scores` column.
--   2. Drop the duplicate RLS policies left behind under their old names.
--
-- HOW TO RUN
--   Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
--
-- Safe to run more than once. Both steps are guarded and become no-ops once
-- they have been applied.
--
-- ⚠️ WHAT THIS DELIBERATELY DOES NOT DO
--   The original schema script began with:
--       drop table if exists saved_activities cascade;
--       drop table if exists activities cascade;
--   Those are NOT reproduced here and must not be run. They would destroy all
--   33 seeded activities and every user's saved list. This file alters one
--   column and some policies; it drops no tables and no rows.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- STEP 1 — Drop the unused `personality_scores` column
--
-- Background: it was declared `vector(7)` — a pgvector column — as the original
-- home for the 7 axes. The project instead stores them in `vector integer[]`,
-- which is populated on all 33 rows, so this one is dead weight.
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

-- 3a. Columns on activities. personality_scores should be absent, leaving 8:
--     id, title, description, budget_level, time_required, created_at, tags, vector
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

-- 3d. The seed data is untouched: 33 rows, none missing a vector.
select count(*) as total_activities,
       count(*) filter (where vector is null) as missing_vector
from public.activities;

-- 3e. pgvector is still installed and available for later.
select extname, extversion from pg_extension where extname = 'vector';


-- ----------------------------------------------------------------------------
-- STILL OPEN — not touched here, decide before acting
--
-- `budget_level` and `time_required` are also unused text columns, overlapping
-- what `tags` already encodes ('low-budget'/'free', '10-mins'/'1-hour'). They
-- are left in place deliberately: unlike personality_scores they were not
-- raised for removal, and they may yet be the intended design with `tags` as
-- the newer overlay. To drop them once decided:
--
--   alter table public.activities drop column if exists budget_level;
--   alter table public.activities drop column if exists time_required;
-- ----------------------------------------------------------------------------
