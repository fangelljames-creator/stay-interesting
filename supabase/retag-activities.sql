-- ============================================================================
-- Stay Interesting — retag every activity under the closed vocabulary
--
-- HOW TO RUN
--   Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
--
-- Safe to run more than once. Matches rows by title and touches only ;
-- titles, descriptions and vectors are never modified, and no row is created
-- or deleted.
--
-- WHY: tags now encode FEASIBILITY ONLY - the 7-axis vector does the ranking.
-- The old vocabulary had 40 tags, most feeding a scoring pass that vector
-- ranking made irrelevant. Taste tags ('creative', 'analytical', 'vintage')
-- duplicated what the vector already measures. This collapses them to 20 tags
-- that hard filters actually read.
--
-- Cost is now EXACTLY ONE tier per activity, applied as a ceiling at query
-- time, so a 'free' activity still shows to someone who said money is no
-- object. Rows previously carrying both 'free' and 'low-budget' keep the
-- cheapest honest entry point.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- STEP 1 — Catch-up: drops and NOT NULL, in case they were never run
--
-- These were issued previously in cleanup-legacy-schema.sql. Both are guarded,
-- so this is a no-op if they already applied.
-- ----------------------------------------------------------------------------

do $$
declare populated integer; col text;
begin
  foreach col in array array['budget_level', 'time_required'] loop
    if not exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name='activities' and column_name=col) then
      raise notice '% already dropped - nothing to do.', col; continue;
    end if;
    execute format('select count(*) from public.activities where %I is not null', col) into populated;
    if populated > 0 then
      raise exception 'ABORTED: % row(s) have data in %. Nothing dropped.', populated, col;
    end if;
    execute format('alter table public.activities drop column %I', col);
    raise notice 'Dropped %.', col;
  end loop;
end
$$;

do $$
declare missing integer;
begin
  select count(*) into missing from public.activities where vector is null;
  if missing > 0 then
    raise exception 'ABORTED: % row(s) have no vector. Seed them first.', missing;
  end if;
  alter table public.activities alter column vector set not null;
  raise notice 'vector is NOT NULL.';
end
$$;


-- ----------------------------------------------------------------------------
-- STEP 2 — Rewrite tags
--
-- Every title below must exist. If any is missing the block aborts and NOTHING
-- is changed, rather than half-migrating the table and leaving the app with a
-- mix of two vocabularies - which would fail silently, since an activity with
-- unreadable tags simply never appears.
-- ----------------------------------------------------------------------------

do $$
declare
  updated integer := 0;
  touched integer;
  r record;
begin
  for r in
    select * from (values
    ('Playing pool', array['quick-fix','long-term','1-hour','half-day','1-2-hours-week','inside','facility','couple','social','low-budget']),
    ('Biro sketching', array['quick-fix','long-term','10-mins','1-hour','1-2-hours-week','inside','outside','at-home','solo','free']),
    ('Learn one card flourish', array['quick-fix','10-mins','inside','at-home','solo','free']),
    ('Cook from whatever is already in the fridge', array['quick-fix','1-hour','inside','at-home','solo','couple','free']),
    ('A walk with no destination', array['quick-fix','1-hour','half-day','exertion','outside','in-nature','solo','free']),
    ('Reset one single surface', array['quick-fix','10-mins','inside','at-home','solo','free']),
    ('Ten minutes of mobility work', array['quick-fix','10-mins','exertion','inside','at-home','solo','free']),
    ('Photo walk down your own street', array['quick-fix','1-hour','outside','solo','couple','free']),
    ('Chess puzzle rush', array['quick-fix','10-mins','inside','at-home','solo','free']),
    ('Dial in one proper cup of coffee', array['quick-fix','10-mins','1-hour','inside','at-home','solo','low-budget']),
    ('Run a quiz round on whoever is nearby', array['quick-fix','1-hour','inside','at-home','couple','social','free']),
    ('Kickabout at the nearest bit of grass', array['quick-fix','1-hour','half-day','exertion','outside','couple','social','free']),
    ('Walk a street you have never walked down', array['quick-fix','1-hour','half-day','exertion','outside','solo','couple','social','free']),
    ('A board game short enough to actually finish', array['quick-fix','1-hour','inside','at-home','couple','social','free']),
    ('Darts or table tennis, first to 21', array['quick-fix','long-term','10-mins','1-hour','1-2-hours-week','exertion','inside','at-home','facility','couple','social','low-budget']),
    ('Walk somewhere with a view and take a flask', array['quick-fix','1-hour','half-day','exertion','outside','in-nature','solo','couple','social','free']),
    ('Knockabout on a public court', array['quick-fix','1-hour','half-day','exertion','outside','facility','couple','social','free']),
    ('Learn a two-player card game neither of you knows', array['quick-fix','10-mins','1-hour','inside','at-home','couple','social','free']),
    ('Blind taste test whatever is in the cupboard', array['quick-fix','10-mins','inside','at-home','couple','social','free']),
    ('Rugby drills', array['long-term','5-hours-week','exertion','outside','facility','solo','couple','social','low-budget']),
    ('Spanish language practice', array['long-term','1-2-hours-week','5-hours-week','inside','at-home','solo','couple','social','free']),
    ('EV market analysis', array['long-term','5-hours-week','inside','at-home','solo','free']),
    ('Small-build woodworking', array['long-term','1-2-hours-week','weekend-blocks','inside','at-home','solo','couple','investment-required']),
    ('Indoor bouldering', array['long-term','1-2-hours-week','5-hours-week','exertion','inside','facility','solo','couple','social','low-budget']),
    ('35mm film photography', array['long-term','1-2-hours-week','weekend-blocks','inside','outside','solo','couple','investment-required']),
    ('Sourdough and bread baking', array['quick-fix','long-term','half-day','1-2-hours-week','inside','at-home','solo','couple','low-budget']),
    ('Learning guitar', array['long-term','5-hours-week','inside','at-home','solo','social','investment-required']),
    ('Trail running and hillwalking', array['long-term','5-hours-week','weekend-blocks','exertion','outside','in-nature','solo','couple','social','low-budget']),
    ('Build a small tool you actually use', array['long-term','5-hours-week','inside','at-home','solo','free']),
    ('Restoring a vintage bicycle', array['long-term','1-2-hours-week','weekend-blocks','inside','at-home','solo','couple','investment-required']),
    ('Open-water swimming', array['long-term','1-2-hours-week','weekend-blocks','exertion','outside','in-nature','solo','couple','social','free']),
    ('Singing in a local choir', array['long-term','1-2-hours-week','inside','facility','couple','social','low-budget']),
    ('Social dance classes', array['long-term','1-2-hours-week','5-hours-week','exertion','inside','facility','couple','social','low-budget']),
    ('An allotment or community garden plot', array['long-term','1-2-hours-week','weekend-blocks','exertion','outside','in-nature','solo','couple','social','low-budget']),
    ('Club road cycling', array['long-term','5-hours-week','weekend-blocks','exertion','outside','in-nature','solo','couple','social','investment-required']),
    ('Geocaching', array['long-term','1-2-hours-week','weekend-blocks','exertion','outside','in-nature','solo','couple','social','free']),
    ('Skateboarding at a public park', array['long-term','1-2-hours-week','5-hours-week','exertion','outside','facility','solo','couple','social','low-budget'])
    ) as t(title, tags)
  loop
    update public.activities a set tags = r.tags where a.title = r.title;
    get diagnostics touched = row_count;
    if touched = 0 then
      raise exception 'ABORTED: no activity titled %. Nothing was changed.', r.title;
    end if;
    updated := updated + touched;
  end loop;
  raise notice 'Retagged % rows.', updated;
end
$$;


-- ----------------------------------------------------------------------------
-- STEP 3 — Verification (read-only)
-- ----------------------------------------------------------------------------

-- 3a. Every distinct tag now in the table. Expect exactly these 20 and nothing
--     else: quick-fix, long-term, 10-mins, 1-hour, half-day, 1-2-hours-week,
--     5-hours-week, weekend-blocks, exertion, inside, outside, at-home,
--     facility, in-nature, solo, couple, social, free, low-budget,
--     investment-required.
select tag, count(*) as activities
from public.activities, unnest(tags) as tag
group by tag
order by tag;

-- 3b. Cost tiers. Every activity must have exactly one -> zero rows here.
select title, tags
from public.activities
where (select count(*) from unnest(tags) t
       where t in ('free','low-budget','investment-required')) <> 1;

-- 3c. Completeness. Zero rows expected.
select title, tags from public.activities
where not (tags && array['solo','couple','social'])
   or not (tags && array['inside','outside'])
   or not (tags && array['quick-fix','long-term'])
   or ('quick-fix' = any(tags) and not (tags && array['10-mins','1-hour','half-day']))
   or ('long-term' = any(tags) and not (tags && array['1-2-hours-week','5-hours-week','weekend-blocks']));

-- 3d. Shape unchanged: 37 rows, 6 columns, vector still NOT NULL.
select count(*) as total_activities from public.activities;
select column_name, data_type, is_nullable from information_schema.columns
where table_schema='public' and table_name='activities' order by ordinal_position;
