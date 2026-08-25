-- ============================================================================
-- Stay Interesting / Boredom Buster — Roadmap Step 1
-- Supabase groundwork: schema guards, RLS policies, the 7-axis vector column,
-- and seed activities.
--
-- HOW TO RUN
--   Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
--
-- This script is idempotent: running it twice is safe and will not duplicate
-- rows or error out. Nothing here deletes data.
--
-- THE VECTOR
--   Every activity carries a 7-number vector, always in this fixed order:
--     [Social, Energy, Creative, Analytical, Outdoors, Novelty, Stimulation]
--   Each number is 1 (very low) to 10 (very high). This is the SAME axis order
--   used in data/personalityQuiz.ts — it is an invariant across the whole
--   project. Never reorder it in one place without the other.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- STEP 1 — Tables
--
-- "create table if not exists" means these are no-ops if your tables already
-- exist (they do). They're here so this file fully describes the schema and
-- works on a fresh project too.
-- ----------------------------------------------------------------------------

create table if not exists public.activities (
  id          bigint generated always as identity primary key,
  title       text   not null,
  description text   not null,
  tags        text[] not null default '{}'
);

create table if not exists public.saved_activities (
  id          bigint      generated always as identity primary key,
  user_id     uuid        not null references auth.users (id) on delete cascade,
  activity_id bigint      not null references public.activities (id) on delete cascade,
  created_at  timestamptz not null default now()
);


-- ----------------------------------------------------------------------------
-- STEP 2 — Stop the same activity being saved twice
--
-- toggleSaveActivity() in app/page.tsx inserts without checking the server
-- first, so a double-click (or two open tabs) can write the same row twice and
-- the heart icon gets out of sync. This constraint makes the database refuse.
--
-- If your saved_activities table ALREADY has duplicate rows, this step skips
-- itself and prints a notice instead of failing. Step 7 shows you how to check.
-- ----------------------------------------------------------------------------

do $$
begin
  alter table public.saved_activities
    add constraint saved_activities_user_activity_unique unique (user_id, activity_id);
  raise notice 'Added unique constraint on (user_id, activity_id).';
exception
  when duplicate_table or duplicate_object then
    raise notice 'Unique constraint already present — nothing to do.';
  when unique_violation then
    raise notice 'SKIPPED: saved_activities already contains duplicate (user_id, activity_id) rows. See step 7.';
end
$$;


-- ----------------------------------------------------------------------------
-- STEP 3 — The 7-axis vector column
--
-- Added as NULLABLE on purpose: if the table already holds rows without
-- vectors, a NOT NULL column would fail to apply. The CHECK constraint below
-- allows NULL but validates the shape of anything that is present, so a typo
-- like a 6-number vector or a score of 47 is rejected at write time.
--
-- Once every row has a vector you can tighten it — see step 7.
-- ----------------------------------------------------------------------------

alter table public.activities
  add column if not exists vector integer[];

comment on column public.activities.vector is
  '7-axis personality vector, fixed order: [Social, Energy, Creative, Analytical, Outdoors, Novelty, Stimulation]. Each value 1-10. Matches data/personalityQuiz.ts.';

do $$
begin
  alter table public.activities
    add constraint activities_vector_shape check (
      vector is null
      or (
        array_ndims(vector) = 1
        and array_length(vector, 1) = 7
        and 1  <= all (vector)
        and 10 >= all (vector)
      )
    );
  raise notice 'Added vector shape constraint.';
exception
  when duplicate_table or duplicate_object then
    raise notice 'Vector shape constraint already present — nothing to do.';
  when check_violation then
    raise notice 'SKIPPED: existing rows have vectors that are not 7 numbers between 1 and 10. Fix those rows, then re-run.';
end
$$;


-- ----------------------------------------------------------------------------
-- STEP 4 — Row Level Security on `activities`
--
-- RLS is a per-row permission check that Postgres applies to every request
-- coming through the Supabase API. Without it enabled, your anon key — which
-- ships to every visitor's browser inside the JavaScript bundle — can read AND
-- WRITE the whole table. Anyone could delete your activities.
--
-- Rule here: everyone can READ activities; nobody can write them through the
-- API. There is deliberately no insert/update/delete policy, and "no policy"
-- means "denied". You still edit activities freely from this SQL Editor, which
-- runs as a privileged role that bypasses RLS entirely.
-- ----------------------------------------------------------------------------

alter table public.activities enable row level security;

drop policy if exists "Activities are publicly readable" on public.activities;
create policy "Activities are publicly readable"
  on public.activities
  for select
  to anon, authenticated
  using (true);


-- ----------------------------------------------------------------------------
-- STEP 5 — Row Level Security on `saved_activities`
--
-- This one holds per-user data, so each policy checks that the row belongs to
-- whoever is asking. auth.uid() is the logged-in user's id; it returns NULL for
-- a logged-out visitor, and NULL never equals a real user_id, so logged-out
-- requests match nothing.
--
-- `using`      = which existing rows you may see / delete.
-- `with check` = which new rows you may write. Needed on INSERT so a user
--                cannot insert a row stamped with someone else's user_id.
--
-- auth.uid() is wrapped in (select ...) so Postgres evaluates it once per query
-- instead of once per row — the pattern Supabase recommends for speed.
-- ----------------------------------------------------------------------------

alter table public.saved_activities enable row level security;

drop policy if exists "Users can read their own saved activities" on public.saved_activities;
create policy "Users can read their own saved activities"
  on public.saved_activities
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can save activities for themselves" on public.saved_activities;
create policy "Users can save activities for themselves"
  on public.saved_activities
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can remove their own saved activities" on public.saved_activities;
create policy "Users can remove their own saved activities"
  on public.saved_activities
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);


-- ----------------------------------------------------------------------------
-- STEP 6 — Seed activities
--
-- 33 activities: 17 on the "quick-fix" (I'm Bored) pathway and 16 on the
-- "long-term" (Find a Hobby) pathway. Includes the five required test entries:
-- playing pool, rugby drills, biro sketching, Spanish language practice, and
-- EV market analysis.
--
-- Every row carries BOTH tags and a vector, per the agreed integration plan:
-- tags hard-filter what is feasible right now, the vector ranks what suits you.
--
-- TAG RULES THIS DATA FOLLOWS (they come from app/page.tsx):
--   * Exactly one pathway tag: 'quick-fix' or 'long-term'. This is a hard
--     filter — an activity with neither can never be recommended.
--   * At least one social tag ('solo' / 'couple' / 'social'). Also a hard
--     filter, so an activity with none is invisible to everyone.
--   * At least one location tag ('inside' / 'outside'). Same reason. An
--     activity that genuinely works either way carries both.
--   * Time tags are worth +6 in scoring vs +2 for everything else, so they
--     are only applied where the activity really does fit that slot.
--   * Every combination of those hard filters leaves at least 5 candidates, so
--     the top-3 list has something to choose between and the rotation penalty
--     in findPrecisionMatchesWithRotation has room to vary the results.
--
-- Rows are matched by title, so re-running this adds only what is missing and
-- never overwrites anything you have edited by hand.
-- ----------------------------------------------------------------------------

with seed (title, description, tags, vector) as (
  values

  -- === QUICK-FIX PATHWAY (I'm Bored) ======================================

  ('Playing pool',
   'Find a table, rack them up, and play until someone wins three. The geometry does more work than the muscles — it is a thinking game disguised as a standing-up one.',
   array['quick-fix','1-hour','half-day','low-energy','active-movement','inside','couple','social','low-budget','mental-challenge'],
   array[8,4,2,7,1,3,6]),

  ('Biro sketching',
   'One cheap ballpoint, any paper within reach, and whatever is in front of you. No undo button is the whole point: you commit to every line and learn to build tone out of scribble.',
   array['quick-fix','10-mins','1-hour','low-energy','sedentary','inside','outside','solo','free','creative','hands-on','tangible-output'],
   array[1,2,9,3,2,4,3]),

  ('Learn one card flourish',
   'Pick a single move — a charlier cut, a thumb fan, a one-handed shuffle — and drill it until your hands stop thinking about it. Ten minutes gets you embarrassingly close.',
   array['quick-fix','10-mins','low-energy','sedentary','inside','solo','free','hands-on','creative'],
   array[3,3,6,4,1,6,4]),

  ('Cook from whatever is already in the fridge',
   'No shopping, no recipe, no substitutions allowed. Constraint is the ingredient that makes this interesting, and you end up eating the result either way.',
   array['quick-fix','1-hour','low-energy','active-movement','inside','solo','couple','free','creative','hands-on','messy','tangible-output'],
   array[3,4,7,5,1,6,5]),

  ('A walk with no destination',
   'Headphones in, something long-form playing, and no decision to make beyond which way to turn at the end of the road. Turn back whenever you feel like it.',
   array['quick-fix','1-hour','half-day','high-energy','active-movement','outside','solo','free','nature'],
   array[1,6,2,3,8,3,2]),

  ('Reset one single surface',
   'Not the room. One desk, one drawer, one shelf. Ten minutes, a bin bag, and a hard stop — the small finished thing does more for your head than the big unfinished one.',
   array['quick-fix','10-mins','low-energy','active-movement','inside','solo','free','tangible-output'],
   array[1,4,2,4,1,1,2]),

  ('Ten minutes of mobility work',
   'Hips, shoulders, spine, ankles. No equipment, no floor space beyond a body length. The kind of thing that feels pointless right up until the week you stop doing it.',
   array['quick-fix','10-mins','high-energy','active-movement','inside','solo','free','active','physical-challenge'],
   array[1,7,1,3,1,2,3]),

  ('Photo walk down your own street',
   'Your phone, your usual route, and a rule that you must come back with ten frames of things you have walked past a hundred times without looking at.',
   array['quick-fix','1-hour','low-energy','active-movement','outside','solo','couple','free','creative','tangible-output'],
   array[2,4,8,3,7,5,3]),

  ('Chess puzzle rush',
   'Mate in two, mate in three, as many as you can clear before the timer runs out. Pure pattern recognition with a scoreboard attached and no opponent to wait for.',
   array['quick-fix','10-mins','low-energy','sedentary','inside','solo','free','analytical','mental-challenge','digital'],
   array[1,1,2,10,1,3,6]),

  ('Dial in one proper cup of coffee',
   'Same beans, same water, change exactly one variable — grind, dose, or time — and taste the difference. This is a controlled experiment you get to drink.',
   array['quick-fix','10-mins','1-hour','low-energy','sedentary','inside','solo','low-budget','hands-on','analytical','tangible-output'],
   array[2,2,5,7,1,4,3]),

  ('Run a quiz round on whoever is nearby',
   'Ten questions, no phones, loser makes the tea. Works in a pub, a kitchen, or a group chat, and takes about as long as you let it.',
   array['quick-fix','1-hour','low-energy','sedentary','inside','couple','social','free','low-budget','mental-challenge','learning'],
   array[9,2,3,7,1,4,7]),

  ('Kickabout at the nearest bit of grass',
   'A ball, some jumpers for posts, and whoever can be bothered to come. No fixtures, no positions, no one keeping score properly.',
   array['quick-fix','1-hour','half-day','high-energy','active-movement','outside','couple','social','free','active','physical-challenge'],
   array[8,8,2,2,8,3,7]),

  ('Walk a street you have never walked down',
   'Pick a direction you never go and keep going until it stops being familiar. Cities are full of five-minute-away places you have somehow never stood in.',
   array['quick-fix','1-hour','half-day','high-energy','active-movement','outside','solo','couple','social','free'],
   array[5,5,4,3,9,9,4]),

  ('A board game short enough to actually finish',
   'Not the four-hour epic. Something that teaches its own rules in five minutes and is done inside an hour, so nobody drifts off to their phone halfway through.',
   array['quick-fix','1-hour','low-energy','sedentary','inside','couple','social','free','low-budget','mental-challenge'],
   array[8,2,3,6,1,4,6]),

  ('Darts or table tennis, first to 21',
   'Any surface, any opponent, no setup worth mentioning. Short enough that the loser always wants another and long enough that you get visibly better in an evening.',
   array['quick-fix','10-mins','1-hour','high-energy','active-movement','inside','couple','social','free','low-budget','active'],
   array[7,5,2,5,1,3,7]),

  ('Walk somewhere with a view and take a flask',
   'Pick the highest thing within reach — a hill, a car park roof, a bridge — fill a flask, and sit there until you have stopped thinking about the walk up.',
   array['quick-fix','1-hour','half-day','high-energy','active-movement','outside','solo','couple','social','free','nature'],
   array[6,6,2,2,9,4,3]),

  ('Knockabout on a public court',
   'Basketball, tennis, whatever the local court is marked for. No membership, no booking, no fixed number of players — just turn up and start.',
   array['quick-fix','1-hour','half-day','high-energy','active-movement','outside','facility','couple','social','free','active','physical-challenge'],
   array[7,8,1,3,7,3,7]),

  -- === LONG-TERM PATHWAY (Find a Hobby) ===================================

  ('Rugby drills',
   'Handling, contact technique, and repeat sprints — the unglamorous parts that decide matches. Joining a club side gets you coaching and a reason to turn up in February.',
   array['long-term','5-hours-week','high-energy','active-movement','outside','facility','solo','couple','social','active','physical-challenge','process-oriented','goal-oriented','low-budget','free'],
   array[8,10,2,4,8,3,9]),

  ('Spanish language practice',
   'Half an hour of drilling most days beats a three-hour cram at the weekend. The real unlock is the first conversation where you stop translating in your head.',
   array['long-term','1-2-hours-week','5-hours-week','low-energy','sedentary','inside','desk-bound','digital','solo','couple','social','culture','learning','mental-challenge','process-oriented','low-budget','free'],
   array[6,2,3,7,2,8,5]),

  ('EV market analysis',
   'Track deliveries, margins, battery chemistry, and charging build-out across the manufacturers, and build your own model of who is actually solvent. A spreadsheet habit with real stakes.',
   array['long-term','5-hours-week','low-energy','sedentary','inside','desk-bound','digital','solo','analytical','tech','mental-challenge','process-oriented','goal-oriented','low-budget','free'],
   array[1,1,2,10,1,5,4]),

  ('Small-build woodworking',
   'Start at box, shelf, and stool rather than at furniture. Sharp tools, square corners, and a finished object at the end of every weekend instead of a half-built one.',
   array['long-term','1-2-hours-week','weekend-short','low-energy','active-movement','inside','workshop','solo','couple','creative','hands-on','messy','tangible-output','goal-oriented','investment-required'],
   array[2,5,8,5,2,5,4]),

  ('Indoor bouldering',
   'Ropeless climbing on short walls, where each route is a physical puzzle with a single correct sequence. The gym does the safety, you do the problem solving.',
   array['long-term','1-2-hours-week','5-hours-week','high-energy','active-movement','inside','facility','solo','couple','social','active','physical-challenge','mental-challenge','process-oriented','low-budget'],
   array[6,9,3,6,2,6,8]),

  ('35mm film photography',
   'Thirty-six frames, no screen on the back, and a fortnight before you find out what you got. The scarcity teaches you more about composition than any amount of digital shooting.',
   array['long-term','weekend-short','1-2-hours-week','low-energy','active-movement','outside','inside','solo','couple','creative','culture','vintage','hands-on','tangible-output','investment-required'],
   array[3,4,9,5,7,7,4]),

  ('Sourdough and bread baking',
   'A starter you keep alive, a schedule you work around, and a loaf that is measurably better every few weeks. Cheap ingredients, long timelines, immediate feedback.',
   array['long-term','1-2-hours-week','low-energy','active-movement','inside','workshop','solo','couple','creative','hands-on','messy','tangible-output','process-oriented','low-budget','free'],
   array[3,3,7,6,1,4,3]),

  ('Learning guitar',
   'Chords, then changes, then songs. The first three weeks hurt your fingers and sound bad; everything after that is the good part, and it travels to every room you are ever in.',
   array['long-term','5-hours-week','low-energy','sedentary','inside','solo','social','creative','culture','learning','hands-on','process-oriented','investment-required','low-budget'],
   array[4,3,9,4,1,5,6]),

  ('Trail running and hillwalking',
   'Off tarmac and onto paths, where the terrain sets the pace instead of your watch. Costs a pair of shoes and gets you places roads simply do not go.',
   array['long-term','weekend-short','5-hours-week','high-energy','active-movement','outside','wild-nature','nature','solo','couple','social','active','physical-challenge','process-oriented','low-budget','free'],
   array[3,9,2,3,10,6,7]),

  ('Build a small tool you actually use',
   'Learn to code by shipping one thing you need — a tracker, a scraper, a script that kills a chore. Having a real user, even if it is only you, is what stops tutorials going nowhere.',
   array['long-term','5-hours-week','low-energy','sedentary','inside','desk-bound','digital','solo','analytical','tech','mental-challenge','tangible-output','process-oriented','goal-oriented','low-budget','free'],
   array[1,2,6,9,1,6,5]),

  ('Restoring a vintage bicycle',
   'Strip a neglected steel frame back to parts, service every bearing, and rebuild it into something you commute on. Mechanical, methodical, and it ends with a working machine.',
   array['long-term','weekend-short','1-2-hours-week','low-energy','active-movement','inside','workshop','solo','couple','creative','hands-on','messy','vintage','tangible-output','goal-oriented','investment-required'],
   array[2,5,6,7,4,5,4]),

  ('Open-water swimming',
   'Lakes, lidos, and the sea, in whatever temperature the year hands you. Go with a group and treat the cold as a skill you build rather than a thing you endure.',
   array['long-term','weekend-short','1-2-hours-week','high-energy','active-movement','outside','wild-nature','nature','solo','couple','social','active','physical-challenge','low-budget','free'],
   array[5,8,1,3,10,8,9]),

  ('Singing in a local choir',
   'No audition at most of them and no need to read music at any of them. One evening a week, and you get the specific pleasure of being one part of a sound you cannot make alone.',
   array['long-term','1-2-hours-week','low-energy','sedentary','inside','facility','couple','social','creative','culture','learning','process-oriented','low-budget','free'],
   array[8,4,7,2,1,6,6]),

  ('Social dance classes',
   'Salsa, swing, or lindy — partner dances taught in drop-in classes where changing partners every few minutes is the norm, so turning up alone is completely normal.',
   array['long-term','1-2-hours-week','5-hours-week','high-energy','active-movement','inside','facility','couple','social','creative','active','learning','process-oriented','low-budget'],
   array[9,7,6,3,1,7,8]),

  ('An allotment or community garden plot',
   'A patch of ground, a season-long plan, and neighbours who have grown here for twenty years and will tell you exactly what you are doing wrong. Slow, outdoor, and edible at the end.',
   array['long-term','weekend-short','1-2-hours-week','low-energy','active-movement','outside','nature','solo','couple','social','hands-on','messy','tangible-output','process-oriented','low-budget','free'],
   array[5,5,5,5,9,4,3]),

  ('Club road cycling',
   'Club runs give you a route, a pace group, and people who will not let you sit up on the last hill. Sixty miles is a different sport from commuting, and far more achievable in company.',
   array['long-term','weekend-short','5-hours-week','high-energy','active-movement','outside','nature','solo','couple','social','active','physical-challenge','process-oriented','goal-oriented','investment-required'],
   array[7,9,1,4,9,4,8])

)
insert into public.activities (title, description, tags, vector)
select s.title, s.description, s.tags::text[], s.vector::integer[]
from seed s
where not exists (
  select 1 from public.activities a where a.title = s.title
);


-- ----------------------------------------------------------------------------
-- STEP 7 — Verification
--
-- Everything below is read-only. Run the file, then check these results.
-- ----------------------------------------------------------------------------

-- 7a. RLS must read "true" for both tables.
select relname as table_name, relrowsecurity as rls_enabled
from pg_class
where oid in ('public.activities'::regclass, 'public.saved_activities'::regclass);

-- 7b. The four policies you should now have.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('activities', 'saved_activities')
order by tablename, cmd;

-- 7c. Activity counts by pathway. Expect quick-fix 17, long-term 16
--     (higher if you already had rows of your own).
select
  case
    when 'quick-fix' = any (tags) then 'quick-fix'
    when 'long-term' = any (tags) then 'long-term'
    else 'NO PATHWAY TAG - will never be recommended'
  end as pathway,
  count(*)
from public.activities
group by 1
order by 1;

-- 7d. Any activity that can never surface, because it is missing a tag that
--     the hard filters require. This should return zero rows.
select id, title, tags
from public.activities
where not ('quick-fix' = any (tags) or 'long-term' = any (tags))
   or not (tags && array['solo','couple','social'])
   or not (tags && array['inside','outside']);

-- 7e. Rows still missing a vector. Should return zero rows after seeding. If
--     it does not, those are pre-existing activities of yours that need one.
select id, title from public.activities where vector is null;

-- 7f. Duplicate saves, if step 2 reported that it skipped itself.
select user_id, activity_id, count(*)
from public.saved_activities
group by user_id, activity_id
having count(*) > 1;


-- ----------------------------------------------------------------------------
-- OPTIONAL — run these later, only once the checks above are clean
-- ----------------------------------------------------------------------------

-- Once 7e returns no rows, make the vector mandatory so a future activity
-- cannot be added without one:
--
--   alter table public.activities alter column vector set not null;

-- If 7f found duplicates, this keeps the earliest of each and deletes the
-- rest. Read the 7f output first so you know what is going. Then re-run
-- step 2 to add the constraint:
--
--   delete from public.saved_activities s
--   where s.id > (
--     select min(k.id) from public.saved_activities k
--     where k.user_id = s.user_id and k.activity_id = s.activity_id
--   );
