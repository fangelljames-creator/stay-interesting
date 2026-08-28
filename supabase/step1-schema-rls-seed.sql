-- ============================================================================
-- Stay Interesting / Boredom Buster — Roadmap Step 1
-- Supabase groundwork: schema guards, RLS policies, the 7-axis vector column,
-- and seed activities.
--
-- HOW TO RUN
--   Supabase dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
--
-- This script is idempotent: running it twice is safe and will not duplicate
-- rows or error out. Nothing here deletes data. That also means it is safe to
-- re-run after a partial failure — the steps that already succeeded become
-- no-ops and it picks up where it stopped.
--
-- If a step fails with "column ... does not exist", run query 7g at the bottom
-- on its own first. It reports the table's real shape, which is what step 1b
-- exists to reconcile.
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
-- STEP 1b — Bring an already-existing `activities` table up to shape
--
-- IMPORTANT: "create table if not exists" above does nothing at all when the
-- table already exists — it does NOT check that the columns match. The live
-- table turned out to have no `tags` column, so that guard passed silently and
-- the seed insert further down failed with:
--
--   ERROR: 42703: column "tags" of relation "activities" does not exist
--
-- These statements add each column only when it is missing, and are no-ops
-- otherwise. `tags` is given a default so this is safe even if the table
-- already holds rows. `title` and `description` are added nullable for the
-- same reason — you cannot add a NOT NULL column to a table with existing
-- rows unless you also give it a default. Step 8 tightens them afterwards.
-- ----------------------------------------------------------------------------

alter table public.activities add column if not exists title       text;
alter table public.activities add column if not exists description text;
alter table public.activities add column if not exists tags        text[] not null default '{}';


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
-- 37 activities: 19 on the "quick-fix" (I'm Bored) pathway and 18 on the
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
   array['quick-fix','long-term','1-hour','half-day','1-2-hours-week','inside','facility','couple','social','low-budget'],
   array[8,4,2,7,1,3,6]),

  ('Biro sketching',
   'One cheap ballpoint, any paper within reach, and whatever is in front of you. No undo button is the whole point: you commit to every line and learn to build tone out of scribble.',
   array['quick-fix','long-term','10-mins','1-hour','1-2-hours-week','inside','outside','at-home','solo','free'],
   array[1,2,9,3,2,4,3]),

  ('Learn one card flourish',
   'Pick a single move — a charlier cut, a thumb fan, a one-handed shuffle — and drill it until your hands stop thinking about it. Ten minutes gets you embarrassingly close.',
   array['quick-fix','10-mins','inside','at-home','solo','free'],
   array[1,3,3,4,1,6,3]),

  ('Cook from whatever is already in the fridge',
   'No shopping, no recipe, no substitutions allowed. Constraint is the ingredient that makes this interesting, and you end up eating the result either way.',
   array['quick-fix','1-hour','inside','at-home','solo','couple','free'],
   array[3,4,7,5,1,5,3]),

  ('A walk with no destination',
   'Headphones in, something long-form playing, and no decision to make beyond which way to turn at the end of the road. Turn back whenever you feel like it.',
   array['quick-fix','1-hour','half-day','outside','in-nature','solo','couple','social','free'],
   array[1,4,1,1,8,3,1]),

  ('Reset one single surface',
   'Not the room. One desk, one drawer, one shelf. Ten minutes, a bin bag, and a hard stop — the small finished thing does more for your head than the big unfinished one.',
   array['quick-fix','10-mins','inside','at-home','solo','free'],
   array[1,3,1,2,1,1,1]),

  ('Ten minutes of mobility work',
   'Hips, shoulders, spine, ankles. No equipment, no floor space beyond a body length. The kind of thing that feels pointless right up until the week you stop doing it.',
   array['quick-fix','10-mins','inside','at-home','solo','free'],
   array[1,4,1,2,1,2,1]),

  ('Photo walk down your own street',
   'Your phone, your usual route, and a rule that you must come back with ten frames of things you have walked past a hundred times without looking at.',
   array['quick-fix','1-hour','outside','solo','couple','free'],
   array[2,4,8,3,7,5,3]),

  ('Chess puzzle rush',
   'Mate in two, mate in three, as many as you can clear before the timer runs out. Pure pattern recognition with a scoreboard attached and no opponent to wait for.',
   array['quick-fix','10-mins','inside','at-home','solo','free'],
   array[1,1,2,10,1,3,6]),

  ('Dial in one proper cup of coffee',
   'Same beans, same water, change exactly one variable — grind, dose, or time — and taste the difference. This is a controlled experiment you get to drink.',
   array['quick-fix','10-mins','1-hour','inside','at-home','solo','low-budget'],
   array[2,2,5,7,1,4,3]),

  ('Run a quiz round on whoever is nearby',
   'Ten questions, no phones, loser makes the tea. Works in a pub, a kitchen, or a group chat, and takes about as long as you let it.',
   array['quick-fix','1-hour','inside','at-home','couple','social','free'],
   array[9,2,3,7,1,4,5]),

  ('Kickabout at the nearest bit of grass',
   'A ball, some jumpers for posts, and whoever can be bothered to come. No fixtures, no positions, no one keeping score properly.',
   array['quick-fix','1-hour','half-day','exertion','outside','couple','social','free'],
   array[8,8,1,2,8,3,5]),

  ('Walk a street you have never walked down',
   'Pick a direction you never go and keep going until it stops being familiar. Cities are full of five-minute-away places you have somehow never stood in.',
   array['quick-fix','1-hour','half-day','exertion','outside','solo','couple','social','free'],
   array[5,5,1,3,9,9,3]),

  ('A board game short enough to actually finish',
   'Not the four-hour epic. Something that teaches its own rules in five minutes and is done inside an hour, so nobody drifts off to their phone halfway through.',
   array['quick-fix','1-hour','inside','at-home','couple','social','free'],
   array[8,2,1,6,1,4,5]),

  ('Darts or table tennis, first to 21',
   'Any surface, any opponent, no setup worth mentioning. Short enough that the loser always wants another and long enough that you get visibly better in an evening.',
   array['quick-fix','long-term','10-mins','1-hour','1-2-hours-week','exertion','inside','at-home','facility','couple','social','low-budget'],
   array[7,5,2,5,1,3,7]),

  ('Walk somewhere with a view and take a flask',
   'Pick the highest thing within reach — a hill, a car park roof, a bridge — fill a flask, and sit there until you have stopped thinking about the walk up.',
   array['quick-fix','1-hour','half-day','exertion','outside','in-nature','solo','couple','social','free'],
   array[6,6,2,2,9,4,3]),

  ('Knockabout on a public court',
   'Basketball, tennis, whatever the local court is marked for. No membership, no booking, no fixed number of players — just turn up and start.',
   array['quick-fix','1-hour','half-day','exertion','outside','facility','couple','social','free'],
   array[7,8,1,3,7,3,5]),

  ('Learn a two-player card game neither of you knows',
   'One deck, one set of rules nobody has read before, and the specific fun of both being terrible at something at the same time. Cribbage, piquet, durak — pick one and stumble through.',
   array['quick-fix','10-mins','1-hour','inside','at-home','couple','social','free'],
   array[8,2,1,6,1,9,5]),

  ('Blind taste test whatever is in the cupboard',
   'Three of anything — teas, crisps, jams, supermarket colas — decanted by one person and guessed by the other with their eyes shut. You learn something genuinely surprising about what you actually taste.',
   array['quick-fix','10-mins','inside','at-home','couple','social','free'],
   array[8,2,1,6,1,8,5]),

  -- === LONG-TERM PATHWAY (Find a Hobby) ===================================

  ('Rugby drills',
   'Handling, contact technique, and repeat sprints — the unglamorous parts that decide matches. Joining a club side gets you coaching and a reason to turn up in February.',
   array['long-term','5-hours-week','exertion','outside','facility','solo','couple','social','low-budget'],
   array[8,10,2,4,8,3,9]),

  ('Spanish language practice',
   'Half an hour of drilling most days beats a three-hour cram at the weekend. The real unlock is the first conversation where you stop translating in your head.',
   array['long-term','1-2-hours-week','5-hours-week','inside','at-home','solo','couple','social','free'],
   array[4,2,2,7,2,8,3]),

  ('EV market analysis',
   'Track deliveries, margins, battery chemistry, and charging build-out across the manufacturers, and build your own model of who is actually solvent. A spreadsheet habit with real stakes.',
   array['long-term','5-hours-week','inside','at-home','solo','free'],
   array[1,1,2,10,1,5,4]),

  ('Small-build woodworking',
   'Start at box, shelf, and stool rather than at furniture. Sharp tools, square corners, and a finished object at the end of every weekend instead of a half-built one.',
   array['long-term','1-2-hours-week','weekend-blocks','inside','at-home','solo','couple','investment-required'],
   array[2,5,8,5,2,5,2]),

  ('Indoor bouldering',
   'Ropeless climbing on short walls, where each route is a physical puzzle with a single correct sequence. The gym does the safety, you do the problem solving.',
   array['long-term','1-2-hours-week','5-hours-week','exertion','inside','facility','solo','couple','social','low-budget'],
   array[6,9,1,6,2,6,7]),

  ('35mm film photography',
   'Thirty-six frames, no screen on the back, and a fortnight before you find out what you got. The scarcity teaches you more about composition than any amount of digital shooting.',
   array['long-term','1-2-hours-week','weekend-blocks','inside','outside','solo','couple','investment-required'],
   array[3,4,9,5,7,7,4]),

  ('Sourdough and bread baking',
   'A starter you keep alive, a schedule you work around, and a loaf that is measurably better every few weeks. Cheap ingredients, long timelines, immediate feedback.',
   array['quick-fix','long-term','half-day','1-2-hours-week','inside','at-home','solo','couple','low-budget'],
   array[3,3,7,6,1,4,3]),

  ('Learning guitar',
   'Chords, then changes, then songs. The first three weeks hurt your fingers and sound bad; everything after that is the good part, and it travels to every room you are ever in.',
   array['long-term','5-hours-week','inside','at-home','solo','social','investment-required'],
   array[4,3,9,5,1,5,4]),

  ('Trail running and hillwalking',
   'Off tarmac and onto paths, where the terrain sets the pace instead of your watch. Costs a pair of shoes and gets you places roads simply do not go.',
   array['long-term','5-hours-week','weekend-blocks','exertion','outside','in-nature','solo','couple','social','low-budget'],
   array[3,9,1,3,10,6,5]),

  ('Build a small tool you actually use',
   'Learn to code by shipping one thing you need — a tracker, a scraper, a script that kills a chore. Having a real user, even if it is only you, is what stops tutorials going nowhere.',
   array['long-term','5-hours-week','inside','at-home','solo','free'],
   array[1,2,6,9,1,6,3]),

  ('Restoring a vintage bicycle',
   'Strip a neglected steel frame back to parts, service every bearing, and rebuild it into something you commute on. Mechanical, methodical, and it ends with a working machine.',
   array['long-term','1-2-hours-week','weekend-blocks','inside','at-home','solo','couple','investment-required'],
   array[2,5,4,7,4,5,2]),

  ('Open-water swimming',
   'Lakes, lidos, and the sea, in whatever temperature the year hands you. Go with a group and treat the cold as a skill you build rather than a thing you endure.',
   array['long-term','1-2-hours-week','weekend-blocks','exertion','outside','in-nature','solo','couple','social','free'],
   array[5,8,1,3,10,8,9]),

  ('Singing in a local choir',
   'No audition at most of them and no need to read music at any of them. One evening a week, and you get the specific pleasure of being one part of a sound you cannot make alone.',
   array['long-term','1-2-hours-week','inside','facility','couple','social','low-budget'],
   array[8,4,5,4,1,6,4]),

  ('Social dance classes',
   'Salsa, swing, or lindy — partner dances taught in drop-in classes where changing partners every few minutes is the norm, so turning up alone is completely normal.',
   array['long-term','1-2-hours-week','5-hours-week','exertion','inside','facility','couple','social','low-budget'],
   array[9,7,4,4,1,7,5]),

  ('An allotment or community garden plot',
   'A patch of ground, a season-long plan, and neighbours who have grown here for twenty years and will tell you exactly what you are doing wrong. Slow, outdoor, and edible at the end.',
   array['long-term','1-2-hours-week','weekend-blocks','exertion','outside','in-nature','solo','couple','social','low-budget'],
   array[5,5,5,5,9,4,3]),

  ('Club road cycling',
   'Club runs give you a route, a pace group, and people who will not let you sit up on the last hill. Sixty miles is a different sport from commuting, and far more achievable in company.',
   array['long-term','5-hours-week','weekend-blocks','exertion','outside','in-nature','solo','couple','social','investment-required'],
   array[7,9,1,4,9,4,6]),

  ('Geocaching',
   'Millions of small containers hidden in plain sight worldwide, findable with the phone already in your pocket. It turns any walk into a search, and takes you to corners of your own area you would never otherwise stand in.',
   array['long-term','1-2-hours-week','weekend-blocks','exertion','outside','in-nature','solo','couple','social','free'],
   array[5,6,1,7,8,7,4]),

  ('Skateboarding at a public park',
   'A board, a free concrete park, and one trick you cannot do yet. Progress is measured in weeks and comes with bruises, but almost nothing else gives that much of a hit for landing something small.',
   array['long-term','1-2-hours-week','5-hours-week','exertion','outside','facility','solo','couple','social','low-budget'],
   array[5,8,1,3,7,6,10]),

  -- === WAVE 1 (2026-08-26) ================================================
  -- Produced from data/waves/wave-1.json by scripts/build-wave.mjs. Do not
  -- hand-edit these rows; edit the wave file and regenerate, or they will
  -- drift from the review Owen actually approved.

  ('Train for a half-marathon',
   'Twelve weeks of mostly easy miles with one hard session a week, building towards 13.1. The training is unglamorous and the shoes are the only real cost — but the finish line does exactly what it promises.',
   array['long-term','5-hours-week','exertion','outside','in-nature','solo','social','free'],
   array[3,10,1,4,8,4,5]),

  ('Traditional bookbinding',
   'Fold the paper into signatures, sew them onto linen cords, and case the whole thing in cloth. A starter kit is a few pounds of thread and needles, and your first book will be crooked in a way you end up fond of.',
   array['long-term','1-2-hours-week','inside','at-home','solo','low-budget'],
   array[1,2,8,4,1,7,2]),

  ('Classical oil painting',
   'Copy the old masters to learn what they knew about layering, glazing, and how colour behaves while it is still wet. Oils and canvas are not cheap, and every layer needs days to dry before the next one goes on.',
   array['long-term','5-hours-week','inside','at-home','solo','investment-required'],
   array[1,2,10,3,1,6,2]),

  ('Sourdough from a wild starter',
   'Catch the yeast already living in your kitchen, feed it daily until it is reliable, then learn what hydration actually does to a crumb. Flour and time are the only costs, and the first month of loaves are for you rather than for guests.',
   array['long-term','1-2-hours-week','inside','at-home','solo','free'],
   array[2,3,6,6,1,6,2]),

  ('Carve a wooden spoon',
   'A straight knife, a hook knife, and a green branch turn into something you can actually eat with. Expect a whole evening on the first one, and keep the plasters within reach.',
   array['long-term','1-2-hours-week','inside','outside','at-home','solo','low-budget'],
   array[1,3,8,3,3,7,2]),

  ('A round of disc golf',
   'Two or three discs and a public course, which in most towns costs nothing to walk. It plays like golf with none of the membership, the dress code, or the waiting.',
   array['quick-fix','half-day','long-term','1-2-hours-week','exertion','outside','in-nature','solo','couple','social','low-budget'],
   array[6,5,1,3,8,5,4]),

  ('Build a miniature diorama',
   'Foam board, acrylics and twigs from the garden become a scene at 1:35 — a ruined building, a station platform, whatever you can picture. Cheap to start, and genuinely absorbing once you begin thinking about the lighting.',
   array['long-term','1-2-hours-week','inside','at-home','solo','low-budget'],
   array[1,2,9,4,1,6,2]),

  ('Basic bicycle maintenance',
   'Degrease the chain, index the gears, and patch a tube on the kitchen floor until none of it feels intimidating. A basic tool roll pays for itself the first time you skip the shop.',
   array['long-term','1-2-hours-week','inside','outside','at-home','solo','low-budget'],
   array[1,3,2,7,3,5,2]),

  ('Pressed flower art',
   'Pick up what has already fallen on a walk, press it flat inside the heaviest books you own, and frame the results weeks later. It costs nothing but patience, and the waiting is most of it.',
   array['long-term','1-2-hours-week','inside','outside','at-home','in-nature','solo','free'],
   array[1,2,7,1,5,4,1]),

  ('Shadowboxing rounds',
   'Fifteen rounds in front of a mirror thinking about nothing but footwork, guard and hand speed. No kit and no gym, and you will be properly out of breath by the fourth.',
   array['long-term','1-2-hours-week','exertion','inside','at-home','solo','free'],
   array[1,9,2,3,1,4,5]),

  ('Chess study and correspondence games',
   'Learn one opening properly rather than five badly, and play correspondence games where you get days to think about each move. Free everywhere, and the losses teach much faster than the wins.',
   array['long-term','1-2-hours-week','inside','at-home','solo','couple','free'],
   array[3,1,1,10,1,4,5]),

  ('Close-up card and coin magic',
   'Card controls, a coin vanish, and the discipline of practising one move until it stops looking like a move. A deck of cards is the entire budget and the mirror does the rest.',
   array['long-term','1-2-hours-week','inside','at-home','solo','social','low-budget'],
   array[4,2,7,4,1,7,4]),

  ('Hiking and hillwalking',
   'Plan a ridge line or a stretch of a national trail and give a whole Saturday to it. Boots and a waterproof are the real cost; the walking is free and the weather is part of the deal.',
   array['long-term','weekend-blocks','exertion','outside','in-nature','solo','couple','social','low-budget'],
   array[4,8,1,3,10,5,3]),

  ('Foraging for wild plants',
   'Learn a handful of species properly — where they grow, when they are ready, and when to leave them alone. Start with a good regional guide, and never eat anything you are not completely certain of.',
   array['long-term','1-2-hours-week','outside','in-nature','solo','couple','low-budget'],
   array[2,4,2,7,10,8,3]),

  ('Web design and front-end coding',
   'Build something small and real — a page for a friend''s band, a tool you actually want — and learn the layout engine by fighting it. Free to start, and the browser is the only thing you need to install.',
   array['long-term','5-hours-week','inside','at-home','solo','free'],
   array[1,1,7,9,1,6,3]),

  ('The big books project',
   'Pick one of the doorstops you have been avoiding — Moby-Dick, Middlemarch, War and Peace — and read fifty pages a week until it is done. The library makes it free, and the length is the point rather than the obstacle.',
   array['long-term','1-2-hours-week','inside','at-home','solo','free'],
   array[1,1,1,3,1,5,2]),

  ('Fermenting and kombucha brewing',
   'A jar, a starter culture, and a fortnight of doing very little while the microbes work. Hot sauce and kombucha both forgive beginners, and the smell tells you how it is going long before the taste does.',
   array['long-term','1-2-hours-week','inside','at-home','solo','low-budget'],
   array[2,2,5,6,1,7,2]),

  ('Bonsai cultivation',
   'Wire, prune and wait — a tree you shape across years rather than an afternoon. A starter tree and decent snips are modest, but the real commitment is watering it every day for a decade.',
   array['long-term','1-2-hours-week','inside','outside','at-home','solo','low-budget'],
   array[1,2,7,5,4,7,1]),

  ('Moroccan tagine cooking',
   'Ras el hanout, preserved lemon, and three hours at the lowest heat your hob will hold. A proper tagine pot is the one real purchase and it earns its shelf space by the third dinner.',
   array['long-term','1-2-hours-week','inside','at-home','solo','couple','social','low-budget'],
   array[5,3,6,4,1,7,2]),

  ('Amateur astronomy',
   'A starter scope, a reasonably dark field, and a list of what is up tonight. The moon and Jupiter come easily; anything fainter is a lesson in patience and cold hands.',
   array['long-term','1-2-hours-week','outside','in-nature','solo','couple','investment-required'],
   array[2,2,3,8,9,8,3]),

  ('Tabletop roleplaying',
   'Four friends, a set of dice, and a story none of you can predict in advance. The starter rules are free to download and the only real cost is finding a night everyone can keep.',
   array['long-term','1-2-hours-week','inside','at-home','facility','social','low-budget'],
   array[10,1,8,5,1,7,5]),

  ('Make a zine',
   'Fold one sheet of A4 into eight pages and fill it with something nobody asked for — a guide to local benches, a comic, a rant. A photocopier turns it into a stack you can hand out.',
   array['long-term','1-2-hours-week','inside','at-home','solo','low-budget'],
   array[3,2,9,2,1,7,3]),

  ('3D printing and CAD',
   'Model a bracket that does not exist yet, print it overnight, and find out exactly where your measurements were wrong. The printer is the expensive part; the software is free and the failures are cheap.',
   array['long-term','5-hours-week','inside','at-home','solo','investment-required'],
   array[1,2,7,9,1,7,3]),

  ('Map a historic walking tour',
   'Find five buildings within a mile that have a story and string them into a loop you could walk a visitor round. It costs a phone and an hour, and you will never see the high street quite the same way.',
   array['quick-fix','1-hour','outside','solo','couple','free'],
   array[2,4,5,6,6,6,2]),

  ('Revive scuffed leather boots',
   'Clean the salt off, work conditioner in with your fingers, and let them dry well away from the radiator. A tin costs a few pounds and will outlast several pairs of boots.',
   array['quick-fix','1-hour','inside','at-home','solo','low-budget'],
   array[1,2,3,2,1,3,1]),

  ('Identify garden birds',
   'Sit by a window or on a park bench for half an hour and write down everything that lands. Binoculars help but are not required, and a robin at four feet beats a rarity at four hundred.',
   array['quick-fix','10-mins','1-hour','inside','outside','in-nature','solo','couple','free'],
   array[2,1,1,5,8,4,1]),

  ('Ten-minute room reset',
   'One loud playlist, one bin bag, and ten minutes of not deciding anything — just clearing. It is not deep cleaning and it is not trying to be.',
   array['quick-fix','10-mins','inside','at-home','solo','free'],
   array[1,4,1,2,1,1,3]),

  ('List something for resale',
   'Photograph the jacket you have not worn in two years against a plain wall, and write the listing honestly. Twenty minutes for something that might pay for dinner.',
   array['quick-fix','1-hour','inside','at-home','solo','free'],
   array[2,2,3,4,1,3,2]),

  ('Geography quiz blitz',
   'Name every country in Africa against a running clock, get thoroughly humbled, and immediately go again. Free, mildly addictive, and you genuinely end up knowing where things are.',
   array['quick-fix','10-mins','inside','at-home','solo','couple','free'],
   array[2,1,1,5,1,4,6]),

  ('Dig into local history',
   'Search the archives for what your street looked like a century ago and find out what stood where the supermarket is. Free through most library services, and it escalates quickly.',
   array['quick-fix','1-hour','inside','at-home','solo','free'],
   array[2,1,1,5,1,6,2]),

  ('Ring someone for no reason',
   'Pick the person you keep meaning to call and simply call them, with no agenda and no occasion. Ten minutes, free, and disproportionately good for both of you.',
   array['quick-fix','10-mins','inside','outside','at-home','couple','free'],
   array[9,1,1,1,3,2,3]),

  ('Mend what needs mending',
   'Sew the button back on, close the hem, and stop stepping around the pile on the chair. A basic needle-and-thread kit costs a couple of pounds and lasts years.',
   array['quick-fix','10-mins','1-hour','inside','at-home','solo','low-budget'],
   array[1,2,4,3,1,3,1]),

  ('Make a lemon posset',
   'Cream, sugar, lemon. Boil, stir, pour, chill — three ingredients and no technique, and it comes out looking like you tried far harder than you did.',
   array['quick-fix','10-mins','inside','at-home','solo','couple','low-budget'],
   array[3,2,4,2,1,4,2]),

  ('Learn three knots that matter',
   'The bowline, the clove hitch and the figure-eight, tied with a bootlace on the sofa. Ten minutes each, and once they land they stay learned for good.',
   array['quick-fix','10-mins','inside','at-home','solo','free'],
   array[1,2,2,4,1,5,2]),

  ('Find five constellations',
   'Step outside, hold up a star app, and learn five shapes well enough to find them again without it. Free, best on a cold clear night, and Orion is the one to start with.',
   array['quick-fix','10-mins','outside','in-nature','solo','couple','free'],
   array[2,2,1,5,9,5,2]),

  ('Fold an origami crane',
   'One square of paper and about twenty folds, most of which you will get wrong the first time. The second one takes five minutes and the tenth takes two.',
   array['quick-fix','10-mins','inside','at-home','solo','free'],
   array[1,1,6,4,1,4,1]),

  ('Learn to moonwalk',
   'Smooth socks, a hard floor, and a tutorial you will re-watch about eight times. Completely useless and entirely worth the twenty minutes.',
   array['quick-fix','10-mins','inside','at-home','solo','free'],
   array[1,5,4,2,1,6,4]),

  ('Plan a trip you may never take',
   'Pick a country and build the actual route — the trains, the towns, where you would sleep on each night. Free, and roughly half of these do eventually happen.',
   array['quick-fix','1-hour','inside','at-home','solo','couple','free'],
   array[2,1,3,6,2,6,2]),

  ('Build a blanket fort',
   'Every cushion in the house, two chairs, and the big blanket nobody ever uses. Free, faintly ridiculous, and a genuinely good place to read for an hour.',
   array['quick-fix','1-hour','inside','at-home','solo','couple','social','free'],
   array[5,4,6,2,1,5,2]),

  ('Two minutes of cold shower',
   'Turn the dial all the way over at the end of a normal shower and stay there for two minutes. Free, deeply unpleasant, and you will feel switched on for an hour afterwards.',
   array['quick-fix','10-mins','inside','at-home','solo','free'],
   array[1,4,1,1,1,5,8]),

  ('Write a review someone will actually read',
   'Think of the small place that quietly gets it right, and write them the specific, glowing review you never got round to. Five minutes of yours, a real difference to theirs.',
   array['quick-fix','10-mins','inside','at-home','solo','free'],
   array[4,1,4,2,1,2,2]),

  ('Microwave mug cake',
   'Flour, sugar, cocoa and milk, stirred in the mug you are going to eat it out of. Ninety seconds, and exactly as good as it needs to be at eleven at night.',
   array['quick-fix','10-mins','inside','at-home','solo','low-budget'],
   array[2,1,3,2,1,3,2]),

  ('Ten minutes of guided breathing',
   'Open a meditation app, take the beginner track, and do the full ten minutes without checking how long is left. The free tiers cover everything you need to find out whether it suits you.',
   array['quick-fix','10-mins','inside','at-home','solo','free'],
   array[1,1,1,1,1,3,1]),

  ('Build and paint a scale model',
   'A plastic kit of something with a history, assembled in the right order and painted slowly. Kits and paints are modest, and the patience is the actual skill being trained.',
   array['long-term','1-2-hours-week','inside','at-home','solo','low-budget'],
   array[1,2,7,4,1,5,2]),

  ('Olympic lifting, properly coached',
   'The snatch and the clean-and-jerk are technique long before they are strength, which is why this belongs in a club with a coach rather than on YouTube. Expect a membership fee and several weeks on an empty barbell.',
   array['long-term','5-hours-week','exertion','inside','facility','social','investment-required'],
   array[6,10,1,6,1,7,7]),

  ('Build a mechanical keyboard',
   'Choose the switches, solder the board, and lubricate the stabilisers until it sounds the way you want it to. Parts add up quickly and the soldering iron is a genuine purchase.',
   array['long-term','1-2-hours-week','inside','at-home','solo','investment-required'],
   array[1,2,6,7,1,7,3]),

  ('Restore a cast iron skillet',
   'Strip a rusted junk-shop pan back to bare metal, then build the seasoning up again in thin layers in a hot oven. The pan costs a few pounds and will outlive you if you get it right.',
   array['long-term','1-2-hours-week','inside','at-home','solo','low-budget'],
   array[1,4,4,5,1,6,2]),

  ('Build an Arduino weather station',
   'Solder up temperature, humidity and pressure sensors and log your own garden''s readings to a chart. A starter kit is affordable; the frustration is free and arrives in bulk.',
   array['long-term','5-hours-week','inside','at-home','solo','low-budget'],
   array[1,2,5,10,2,7,3]),

  ('Rowing at a river club',
   'Learn the catch, the drive and the recovery from people who will tell you precisely what your blade is doing wrong. Club fees are real and the early starts are worse, but the water at six in the morning is why people stay.',
   array['long-term','5-hours-week','exertion','outside','facility','in-nature','social','investment-required'],
   array[9,10,1,5,8,7,6]),

  ('Hill sprint intervals',
   'Find the steepest street or path near you and run up it hard, eight or ten times, walking back down between. Free, brutally simple, and over inside twenty-five minutes.',
   array['long-term','1-2-hours-week','exertion','outside','in-nature','solo','free'],
   array[1,10,1,3,7,3,7]),

  ('Design an icon set',
   'Draw ten icons that have to look like a family — same weight, same corners, same logic — and then vectorise them. Free tools cover all of it, and the constraint is what makes it interesting.',
   array['long-term','1-2-hours-week','inside','at-home','solo','free'],
   array[1,1,8,6,1,5,2]),

  ('Wall-supported handstands',
   'Kick up against a wall and hold a hollow line, adding ten seconds a week. Free, and your wrists will complain long before your shoulders do.',
   array['long-term','1-2-hours-week','exertion','inside','at-home','solo','free'],
   array[1,8,1,3,1,5,5]),

  ('Orienteering in the park',
   'A compass, a topographic map, and a set of control points to find in the right order. Local clubs run cheap events most weekends, and getting lost is part of the curriculum.',
   array['long-term','weekend-blocks','exertion','outside','in-nature','solo','social','low-budget'],
   array[5,7,1,9,9,7,5]),

  ('Speed cup stacking',
   'Learn the 3-3-3 and 3-6-3 sequences until your hands stop consulting your brain about them. A set of cups is under twenty pounds and the whole thing is gloriously pointless.',
   array['long-term','1-2-hours-week','inside','at-home','solo','low-budget'],
   array[2,4,1,4,1,8,6]),

  ('Cold brew coffee',
   'Coarse grounds, cold water, eighteen hours in the fridge, then strain it. No equipment beyond a jar and a sieve, and the result is stronger and far less bitter than you expect.',
   array['long-term','1-2-hours-week','inside','at-home','solo','low-budget'],
   array[2,1,3,5,1,4,1]),

  ('Read military history properly',
   'Work through campaign histories that explain the logistics rather than just the battles, and follow the decisions instead of the outcomes. Library territory mostly, and it rewards taking notes.',
   array['long-term','1-2-hours-week','inside','at-home','solo','free'],
   array[1,1,1,8,1,5,2]),

  ('Sketch buildings from a bench',
   'Sit somewhere with a good roofline and draw what is actually there — the brick courses, the drainpipe, the window that is not quite straight. A pencil and a pad, and the weather decides how long you get.',
   array['long-term','1-2-hours-week','inside','outside','at-home','in-nature','solo','low-budget'],
   array[1,3,9,3,6,5,2]),

  ('Hand-stitch a felt wallet',
   'Cut thick wool felt, mark your holes, and saddle-stitch with waxed thread until it holds together. Materials come to a few pounds and the result is a cardholder you will actually carry.',
   array['long-term','1-2-hours-week','inside','at-home','solo','low-budget'],
   array[1,2,7,3,1,6,1]),

  ('Build a cardboard automaton',
   'Cardboard, skewers and glue, arranged so that turning a crank makes something nod or flap. Almost free, genuinely clever, and the first mechanism that works properly is a small triumph.',
   array['long-term','1-2-hours-week','inside','at-home','solo','low-budget'],
   array[2,2,9,8,1,8,3]),

  ('Small engine repair',
   'Buy a mower that will not start, work out whether it is fuel, spark or air, and fix it. Non-runners are cheap or free, and the diagnosis is more satisfying than the repair.',
   array['long-term','5-hours-week','outside','at-home','solo','low-budget'],
   array[1,5,2,9,4,7,3]),

  ('Classic car market research',
   'Follow the auction results, learn which chassis numbers matter, and build a real view on what is undervalued. Free to research and extremely expensive to act on.',
   array['long-term','1-2-hours-week','inside','at-home','solo','free'],
   array[2,1,1,10,1,6,4]),

  ('Antiquarian book collecting',
   'Learn to read a title page, spot a genuine first edition, and tell honest wear from damage. Fairs and junk shops keep the hunt cheap; the books you actually want will not be.',
   array['long-term','1-2-hours-week','inside','at-home','facility','solo','investment-required'],
   array[3,2,2,7,1,7,3]),

  ('Sport lockpicking',
   'A clear practice padlock and a pick set, and the slow understanding of how pin tumblers actually fail. Legal on locks you own — and only on locks you own.',
   array['long-term','1-2-hours-week','inside','at-home','solo','low-budget'],
   array[1,2,2,9,1,9,4]),

  ('Amateur radio',
   'Study for the foundation licence, then build an antenna and talk to a stranger three countries away. The exam is cheap; the radio is where the money goes.',
   array['long-term','5-hours-week','inside','outside','at-home','solo','social','investment-required'],
   array[6,2,3,9,3,9,4]),

  ('Kite surfing lessons',
   'Start with a trainer kite on a field, then take proper lessons before you go anywhere near deep water. This is an expensive sport with a real learning curve, and teaching yourself is how people get hurt.',
   array['long-term','weekend-blocks','exertion','outside','in-nature','facility','social','investment-required'],
   array[5,9,2,5,10,9,10]),

  ('A glassblowing taster class',
   'One studio session where you gather molten glass on the end of a pipe and make something pleasingly wobbly. Not cheap for a few hours, but there is no other way to find out whether the heat and the timing suit you.',
   array['quick-fix','half-day','long-term','weekend-blocks','exertion','inside','facility','solo','social','investment-required'],
   array[5,6,8,4,1,9,6]),

  ('Orchid cultivation',
   'Work out the light, humidity and watering rhythm that makes a moth orchid re-bloom instead of sulking. A supermarket plant costs a few pounds and the whole skill is in doing less than you think.',
   array['long-term','1-2-hours-week','inside','at-home','solo','low-budget'],
   array[1,2,3,6,2,6,1]),

  ('Historical European martial arts',
   'Learn longsword or rapier from the surviving manuscripts, at a club that will lend you a blunt to start with. Kit adds up if you stay, and the clubs are far friendlier than the swords make them sound.',
   array['long-term','5-hours-week','exertion','inside','facility','social','investment-required'],
   array[8,8,2,7,1,10,8]),

  ('Watchmaking and horology',
   'Take a cheap mechanical movement apart, oil it, and get it running again without losing a screw into the carpet. Tools and a loupe are a real investment and the tolerances are unforgiving.',
   array['long-term','5-hours-week','inside','at-home','solo','investment-required'],
   array[1,1,4,10,1,9,3]),

  ('A blacksmithing taster day',
   'A day at a forge, heating steel until it moves and hammering it into a hook or a knife. Introductory courses are widely available and priced like a good day out, which is exactly what it is.',
   array['quick-fix','half-day','long-term','weekend-blocks','exertion','inside','outside','facility','solo','social','investment-required'],
   array[5,9,7,4,3,9,7]),

  ('Stand-up paddleboarding',
   'An inflatable board, a calm lake, and about ten minutes of falling in before it clicks. The board is the whole cost and it packs down into a rucksack.',
   array['long-term','1-2-hours-week','exertion','outside','in-nature','solo','couple','social','investment-required'],
   array[4,7,1,3,10,7,5]),

  ('Parkour, at a class',
   'Vaults, rolls and landings, learned on gym mats long before anything involving a wall. Find a coached session — this is the one where teaching yourself off videos goes badly.',
   array['long-term','5-hours-week','exertion','inside','facility','social','low-budget'],
   array[7,10,3,5,2,9,9]),

  ('Restore a vintage typewriter',
   'Free a seized carriage, clean fifty years of grime off the typebars, and get it clicking again. Junk-shop machines are cheap and ribbon is easier to find than you would think.',
   array['long-term','1-2-hours-week','inside','at-home','solo','low-budget'],
   array[1,3,4,7,1,7,2]),

  ('Urban beekeeping',
   'A hive on a roof or at the end of a garden, and a full year of learning before there is any honey. Real money up front, a proper time commitment, and you will need to check both the local rules and your neighbours.',
   array['long-term','5-hours-week','exertion','outside','at-home','in-nature','solo','social','investment-required'],
   array[4,5,2,7,8,9,5]),

  ('Scuba certification',
   'Pool sessions, then the theory, then open water with an instructor and a buddy. The course is a serious cost and the rule that matters most is that you never dive alone.',
   array['long-term','weekend-blocks','exertion','outside','facility','in-nature','social','investment-required'],
   array[8,7,1,7,9,10,8]),

  ('Block out your week on one page',
   'Draw the week as a grid and put deep work, admin and actual rest into it as blocks. Twenty minutes, and the useful part is seeing how little is left once sleep is on there.',
   array['quick-fix','1-hour','inside','at-home','solo','free'],
   array[1,1,2,6,1,3,2]),

  ('Bake rosemary sea salt crackers',
   'Roll the dough thinner than feels sensible, scatter salt and rosemary, and watch them closely for the last two minutes. Store-cupboard ingredients and about forty minutes start to finish.',
   array['quick-fix','1-hour','inside','at-home','solo','low-budget'],
   array[2,3,5,3,1,4,2]),

  ('Study old maps',
   'Open high-resolution scans of seventeenth-century world maps and work out what they got wrong and why. Free through the national library collections, and the sea monsters are load-bearing.',
   array['quick-fix','1-hour','inside','at-home','solo','free'],
   array[1,1,2,5,1,7,2]),

  ('Identify trees by their bark',
   'Walk a familiar bit of woodland and learn to tell oak, beech and birch apart without looking anything up. Free, and it permanently changes what a walk looks like.',
   array['quick-fix','1-hour','outside','in-nature','solo','couple','free'],
   array[2,3,1,5,9,6,1]),

  ('Watch a film like a cinematographer',
   'Pick one scene you already know well and work out why it feels the way it does — the lens, the light, where the camera is standing. Free, and it ruins nothing and improves everything.',
   array['quick-fix','1-hour','inside','at-home','solo','couple','free'],
   array[2,1,4,6,1,5,2]),

  ('Learn Morse code',
   'Start with your own initials, then work up to short messages decoded by ear with a pen and paper. Free apps generate the audio, and it turns out to be more rhythmic than technical.',
   array['quick-fix','10-mins','inside','at-home','solo','free'],
   array[1,1,1,5,1,7,3]),

  ('Repair a broken book spine',
   'Neutral-pH glue, archival tape, and a careful hour reattaching a spine that has given up. The materials cost a few pounds and will fix a whole shelf''s worth of books.',
   array['quick-fix','1-hour','inside','at-home','solo','low-budget'],
   array[1,2,4,4,1,5,1]),

  ('Sequence a playlist properly',
   'Order forty minutes of music the way an album is ordered — by key, by tempo, by what the previous track has earned. Free, and the gap between this and a shuffle is enormous.',
   array['quick-fix','1-hour','inside','at-home','solo','free'],
   array[2,1,7,4,1,4,2]),

  ('Plot a running route worth running',
   'Use mapping software to build a five or ten kilometre loop that avoids the main roads and finishes near a bakery. Free, and the planning is genuinely half the pleasure.',
   array['quick-fix','1-hour','inside','at-home','solo','free'],
   array[1,1,2,5,3,4,2]),

  ('Write with your other hand',
   'Do the shopping list, or a diary entry, with the hand you never use for anything. Free, briefly infuriating, and oddly good for the part of your brain that has gone quiet.',
   array['quick-fix','10-mins','inside','at-home','solo','free'],
   array[1,2,3,3,1,7,2]),

  ('Play through a famous chess game',
   'Pull up the Immortal Game, or Fischer at thirteen, and step through it move by move guessing before you look. Free everywhere, and far more instructive than another game of blitz.',
   array['quick-fix','1-hour','inside','at-home','solo','free'],
   array[1,1,1,10,1,5,3]),

  ('Turn bottles into vases',
   'Soak the labels off in warm water and oil, scrub the glue away, and put something from the garden in them. Free, and it takes an evening of roughly half your attention.',
   array['quick-fix','1-hour','inside','at-home','solo','free'],
   array[1,2,6,2,1,4,1]),

  ('Clear out the camera roll',
   'Delete the eleven near-identical photos of the same thing, and empty the downloads folder while you are in there. Free, tedious, and the phone will thank you.',
   array['quick-fix','1-hour','inside','at-home','solo','free'],
   array[1,1,1,2,1,1,1]),

  ('Put the radio on',
   'Live discussion on Radio 4, or the first episode of the narrative podcast someone keeps recommending. Free, and it counts — not everything has to be a project.',
   array['quick-fix','10-mins','1-hour','inside','at-home','solo','free'],
   array[1,1,1,2,1,4,2]),

  ('Write a quiz for the house',
   'Fifteen questions across history, sport and whatever everyone argues about, pitched so that nobody scores zero. Free, an hour to write, and the arguments afterwards are the whole point.',
   array['quick-fix','1-hour','inside','at-home','couple','social','free'],
   array[8,1,6,6,1,5,5]),

  ('Translate a news article line by line',
   'Take a short piece in the language you are learning and work through it properly with the dictionary open. Free, and it teaches you more idiom in an hour than an app manages in a week.',
   array['quick-fix','1-hour','inside','at-home','solo','free'],
   array[1,1,2,7,1,6,2]),

  ('Three bullets on today''s markets',
   'Read the front half of the FT and write three lines on what actually moved and why. Free with a library login, and doing it daily is the thing that makes it work.',
   array['quick-fix','10-mins','inside','at-home','solo','free'],
   array[1,1,2,9,1,4,3]),

  ('Check the car''s fluids',
   'Oil, coolant and screenwash, with the engine cold and the bonnet propped properly. Ten minutes, needs a car, and it is the cheapest breakdown you will ever avoid.',
   array['quick-fix','10-mins','outside','at-home','solo','free'],
   array[1,3,1,4,4,3,1]),

  ('Sort the spice drawer',
   'Everything out, the drawer wiped, anything older than you can remember thrown away, and the rest in an order you will actually maintain. Free and disproportionately satisfying.',
   array['quick-fix','1-hour','inside','at-home','solo','free'],
   array[1,2,1,2,1,1,1]),

  ('Learn the NATO alphabet',
   'Alpha through Zulu, learned well enough to spell your surname down a bad phone line without hesitating. Free, twenty minutes, and permanently useful.',
   array['quick-fix','10-mins','inside','at-home','solo','free'],
   array[2,1,1,3,1,4,2]),

  ('Foam roll everything that hurts',
   'Half an hour on a roller and a lacrosse ball, working through calves, quads and upper back. The kit is about fifteen pounds and the first pass is not enjoyable.',
   array['quick-fix','1-hour','inside','at-home','solo','low-budget'],
   array[1,4,1,2,1,2,3]),

  ('Tie a half-Windsor',
   'Stand at the mirror and tie it until the knot comes out symmetrical and the tip lands at your belt. Two minutes once it clicks, and it stays learned.',
   array['quick-fix','10-mins','inside','at-home','solo','free'],
   array[1,2,2,3,1,4,2]),

-- --- WAVE 2 (2026-08-28) --- starvation repair, 56 rows, all free.
-- Rendered from data/waves/wave-2.json by scripts/build-wave.mjs. Do not hand-edit:
-- edit the wave file and regenerate, or the review file stops describing the seed.

  ('Dance flat-out to three songs',
   'Curtains shut, volume up, three songs end to end with no stopping between them. It is a genuine cardio session disguised as a private disco, and nobody ever has to see it.',
   array['quick-fix','10-mins','exertion','inside','at-home','solo','couple','social','free'],
   array[5,8,4,1,1,2,6]),

  ('A deck-of-cards workout',
   'Each suit is an exercise and the number on the card is the reps. Shuffle, turn them over one at a time, and let a pack of cards decide how hard the next twenty minutes are going to be.',
   array['quick-fix','10-mins','1-hour','exertion','inside','at-home','solo','couple','social','free'],
   array[3,9,1,3,1,4,6]),

  ('Animal walks across the living room',
   'Bear crawl to the far wall, crab walk back, then go again without laughing. It is a proper full-body workout that any child in the house will join in with immediately and every adult regrets starting.',
   array['quick-fix','10-mins','exertion','inside','at-home','solo','couple','social','free'],
   array[6,8,2,1,1,7,5]),

  ('Keep a balloon off the floor for five minutes',
   'One balloon, five minutes, and the carpet is lava. It is sillier and considerably sweatier than it sounds, and it turns any room with two people in it into a sport.',
   array['quick-fix','10-mins','exertion','inside','at-home','solo','couple','social','free'],
   array[7,7,1,2,1,4,6]),

  ('Follow a fifteen-minute beginner yoga flow',
   'A mat is optional and a folded towel does the job. Fifteen minutes of following along is enough to find out which side of your body has quietly been doing all of the work.',
   array['quick-fix','10-mins','exertion','inside','at-home','solo','free'],
   array[1,6,1,2,1,3,1]),

  ('A commercial-break workout',
   'Pick one show and move every time the adverts come on: press-ups, squats, whatever you can stand. An hour later you have done a surprising amount of exercise and still seen the programme.',
   array['quick-fix','1-hour','exertion','inside','at-home','solo','couple','social','free'],
   array[3,7,1,2,1,5,3]),

  ('Three salsa steps, solo',
   'Basic, side, back, counted out loud like nobody is listening. Ten minutes in your own kitchen is the whole difference between dancing at the next wedding and shuffling apologetically near the bar.',
   array['quick-fix','10-mins','exertion','inside','at-home','solo','free'],
   array[2,6,4,3,1,6,4]),

  ('A hundred backpack swings',
   'Load a rucksack with books, hinge at the hips, and swing it between your legs and up to chest height. A hundred of those in sets of twenty explains exactly why kettlebells cost money.',
   array['quick-fix','10-mins','exertion','inside','outside','at-home','solo','free'],
   array[1,9,1,2,3,5,6]),

  ('Stand up from the floor without using your hands',
   'The sit-to-stand test is a real predictor of how well you are ageing and almost nobody passes it first go. Ten minutes of trying is a workout for muscles you had entirely forgotten about.',
   array['quick-fix','10-mins','exertion','inside','at-home','solo','free'],
   array[1,6,1,4,1,6,3]),

  ('Behind-the-back throw and catch',
   'Throw a tennis ball behind your back and catch it in front, ten clean reps in a row. It looks like showing off, feels like neither showing off nor sport, and then suddenly works.',
   array['quick-fix','10-mins','exertion','inside','outside','at-home','solo','couple','free'],
   array[3,5,2,4,3,6,4]),

  ('An obstacle course built from the furniture',
   'Cushions, chairs, a broom across two stools, and a rule that the floor is lava. Building it takes as long as running it, and the timed second lap is where the competitive streak arrives.',
   array['quick-fix','1-hour','exertion','inside','at-home','solo','couple','social','free'],
   array[7,8,6,3,1,7,6]),

  ('Full-commitment hopscotch',
   'Chalk the grid on the pavement properly, all ten squares, and commit to the single-leg landings. Any adult who plays for ten minutes discovers their balance is not what it was in 1994.',
   array['quick-fix','10-mins','exertion','outside','solo','couple','social','free'],
   array[6,7,3,4,7,4,5]),

  ('Relearn the cartwheel on grass',
   'Soft ground, low expectations, and somebody on hand to tell you your legs were nowhere near straight. Most people can still just about manage one, and finding out which group you are in takes a minute.',
   array['quick-fix','10-mins','exertion','outside','in-nature','solo','couple','social','free'],
   array[5,8,1,2,8,6,6]),

  ('First-touch drills against a wall',
   'Any ball, any wall, both feet, and no goalkeeper to blame. Twenty minutes of this does more for your first touch than a whole game does, which is precisely why nobody bothers.',
   array['quick-fix','10-mins','1-hour','exertion','outside','solo','couple','free'],
   array[3,7,1,4,7,3,5]),

  ('How far can you walk in exactly fifteen minutes?',
   'Set a timer, walk in one direction until it goes off, then find where you got to on a map. It quietly redraws how big you thought your own neighbourhood was.',
   array['quick-fix','10-mins','exertion','outside','solo','couple','social','free'],
   array[4,5,1,5,7,6,3]),

  ('Watch a sunset start to finish',
   'Phone in your pocket, from the first change of colour to the last. Nobody ever watches the whole thing, and the order the colours arrive in is not the order anyone would guess.',
   array['quick-fix','10-mins','1-hour','outside','in-nature','solo','couple','social','free'],
   array[4,2,2,2,9,3,1]),

  ('Catch tonight''s ISS pass',
   'Look up when the space station crosses your postcode, stand outside at the right minute, and wave. It takes about four minutes to go over and there are people on board.',
   array['quick-fix','10-mins','outside','in-nature','solo','couple','social','free'],
   array[5,2,1,5,9,8,3]),

  ('Take a smell walk',
   'One lap of the block, cataloguing five distinct smells and noting where each one starts and stops. It is the sense nobody uses on purpose, and your street turns out to have a map of them.',
   array['quick-fix','10-mins','1-hour','outside','solo','couple','free'],
   array[3,3,4,3,7,8,2]),

  ('Find north four ways without a compass',
   'The sun, the moss, the satellite dishes, and after dark the stars. Four independent methods that ought to agree with each other, and a genuinely useful thing to know when a phone dies.',
   array['quick-fix','10-mins','1-hour','outside','in-nature','solo','couple','social','free'],
   array[4,2,1,9,8,7,1]),

  ('Age a hedge by counting its species',
   'Hooper''s rule reckons one woody species per thirty-yard stretch is roughly a century of hedge. Count along a lane and you can date a boundary that predates every building near it.',
   array['quick-fix','1-hour','outside','in-nature','solo','couple','social','free'],
   array[4,3,1,8,9,9,1]),

  ('A phone-stays-home walk',
   'One block is plenty. The distance is not the point; the point is that for once nothing in your pocket can interrupt, and you notice how often you reach for it anyway.',
   array['quick-fix','10-mins','1-hour','outside','solo','couple','social','free'],
   array[4,4,1,1,8,5,1]),

  ('Storyboard last year''s photo album',
   'Go through a year of camera roll and pick the forty pictures that actually tell the story. It takes a whole afternoon, and the ones you choose are almost never the ones you posted.',
   array['quick-fix','half-day','inside','at-home','solo','couple','free'],
   array[3,1,6,5,1,3,2]),

  ('Programme a themed trilogy night',
   'Three films with one real thread between them, and a snack matched to each. The programming is half the fun and the whole evening costs nothing you do not already have in the house.',
   array['quick-fix','half-day','inside','at-home','solo','couple','social','free'],
   array[7,1,5,4,1,5,3]),

  ('The wardrobe truth audit',
   'Turn every hanger backwards today; in six months anything still facing the wrong way has not been worn. Setting it up takes an afternoon and settles an argument with yourself permanently.',
   array['quick-fix','half-day','inside','at-home','solo','couple','free'],
   array[2,3,2,6,1,3,2]),

  ('Plan next year''s garden on paper',
   'Graph paper, a seed catalogue, and the garden you actually have rather than the one you want. Even with no garden yet, an afternoon of this is how people end up on an allotment waiting list.',
   array['quick-fix','half-day','inside','at-home','solo','couple','free'],
   array[2,2,7,8,2,5,2]),

  ('Take one inbox to zero',
   'One account, top to bottom, unsubscribing as you go rather than archiving and hoping. It is a genuinely unpleasant afternoon and the quiet afterwards lasts about three months.',
   array['quick-fix','half-day','inside','at-home','solo','free'],
   array[1,1,1,6,1,1,2]),

  ('Rank your top ten films, definitively',
   'Not a list of good films but a ranked ten, with the arguments settled and the painful cuts made. Do it with somebody else and you will learn things about them you would rather not know.',
   array['quick-fix','1-hour','half-day','inside','at-home','solo','couple','social','free'],
   array[6,1,4,8,1,3,3]),

  ('Design a no-spend weekend worth having',
   'Zero pounds, a full schedule, and every item something you would genuinely look forward to. The constraint is the exercise: it turns out most of the good weekends were never the expensive ones.',
   array['quick-fix','half-day','inside','at-home','solo','couple','social','free'],
   array[6,2,6,6,4,6,2]),

  ('Find your nearest trig point',
   'Ordnance Survey left concrete pillars and small brass marks all over the country and there is one nearer to you than you think. Finding it is a treasure hunt that comes with an official answer sheet.',
   array['quick-fix','half-day','outside','in-nature','solo','couple','social','free'],
   array[4,5,1,6,9,8,4]),

  ('Postbox spotting by royal cipher',
   'Every British postbox carries the cipher of whoever was on the throne when it was cast, and a few Victorian ones are still in daily use. An afternoon''s walk turns your area into a timeline.',
   array['quick-fix','1-hour','half-day','outside','solo','couple','social','free'],
   array[5,4,1,7,6,9,1]),

  ('Beachcombing and sea glass',
   'Work a tideline slowly and keep whatever the sea has finished with: frosted glass, worn pottery, the odd fossil. Weeks of it fills a jar, and the good things only turn up after a storm.',
   array['quick-fix','half-day','long-term','1-2-hours-week','outside','in-nature','solo','couple','social','free'],
   array[3,4,3,5,10,6,2]),

  ('Three card games you can teach anyone',
   'Rummy, cheat, and whichever one your family plays badly. Ten minutes each to teach, and it means you are never again the person in the room who cannot join in.',
   array['quick-fix','10-mins','1-hour','inside','at-home','couple','social','free'],
   array[8,1,2,6,1,4,4]),

  ('Count to ten in three new languages',
   'Ten minutes gets you counting in three languages you do not speak, which is a party trick and, oddly, the thing that makes a foreign menu stop being frightening.',
   array['quick-fix','10-mins','inside','at-home','solo','couple','social','free'],
   array[4,1,1,6,1,8,2]),

  ('Finally understand the offside rule',
   'Either code, diagrams allowed, ten minutes with somebody who already knows. It is not actually complicated, and afterwards you can stop nodding vaguely during matches.',
   array['quick-fix','10-mins','inside','at-home','solo','couple','social','free'],
   array[5,1,1,8,1,6,2]),

  ('Volunteer at parkrun before you race it',
   'Marshalling a corner, scanning barcodes or handing out finish tokens, every Saturday morning. It is free, it is genuinely needed, and it is the least intimidating way into a running club there is.',
   array['long-term','1-2-hours-week','outside','facility','in-nature','solo','couple','social','free'],
   array[9,3,1,3,8,5,4]),

  ('Chase a parkrun personal best',
   'The same five kilometres, the same course, every Saturday, and a time that is yours to beat. It is free, weirdly emotional, and the gap between your first run and your tenth is bigger than you expect.',
   array['long-term','1-2-hours-week','exertion','outside','facility','in-nature','solo','social','free'],
   array[7,9,1,5,8,4,8]),

  ('Join the repair cafe',
   'A monthly session where people bring broken things and other people fix them, for nothing. Turn up as the fixer or the apprentice; either way you leave knowing something you did not that morning.',
   array['long-term','1-2-hours-week','inside','facility','social','free'],
   array[8,3,4,8,1,7,3]),

  ('Litter-picking with a local group',
   'Gloves, grabbers, and a river bank or verge that looks completely different two hours later. Councils lend the kit free, and the before-and-after photographs are more satisfying than they should be.',
   array['long-term','1-2-hours-week','exertion','outside','facility','in-nature','social','free'],
   array[8,6,1,3,9,4,2]),

  ('Dog-walking at an animal shelter',
   'Shelters are permanently short of people who will walk dogs and the induction takes an afternoon. You get the exercise, the dog gets the exercise, and neither of you has to talk about work.',
   array['long-term','1-2-hours-week','5-hours-week','exertion','outside','facility','in-nature','solo','social','free'],
   array[5,7,1,2,8,5,4]),

  ('A book club that actually finishes books',
   'Either find one or start one with that single rule written down. Libraries and pubs host them for nothing, and the difference between a book club and a wine night is entirely whether anyone read it.',
   array['long-term','1-2-hours-week','inside','at-home','facility','social','free'],
   array[9,1,3,6,1,4,3]),

  ('Become a heritage volunteer guide',
   'Pick one building, a chapel or a mill or a lighthouse, and learn it well enough to walk strangers round it. The training is free and given gladly, because these places are always short of guides.',
   array['long-term','1-2-hours-week','weekend-blocks','inside','outside','facility','solo','social','free'],
   array[8,3,2,7,4,8,3]),

  ('Befriend an isolated neighbour through a charity',
   'A weekly call or a visit, arranged and supported by a befriending charity so that neither of you goes in cold. It costs an hour, and it is one of the few things here that somebody is waiting for.',
   array['long-term','1-2-hours-week','inside','at-home','facility','couple','free'],
   array[8,1,2,2,1,6,2]),

  ('Conservation workdays with a local trust',
   'River cleans, coppicing, hedge-laying and scrub clearance, with every tool provided and somebody to show you how. A Sunday of it leaves you filthy, aching and unreasonably pleased with yourself.',
   array['long-term','weekend-blocks','5-hours-week','exertion','outside','facility','in-nature','solo','couple','social','free'],
   array[8,8,1,5,10,7,3]),

  ('Churchyard and monument recording',
   'Local history societies need stones read, photographed and transcribed before the lettering weathers away. It is slow, free and outdoors, and the record outlasts the thing you recorded.',
   array['long-term','1-2-hours-week','weekend-blocks','outside','facility','in-nature','solo','couple','social','free'],
   array[5,3,1,8,7,9,1]),

  ('Adopt a local museum, room by room',
   'One museum, every room, properly, across a whole season rather than in a single exhausted afternoon. Most local museums are free and almost nobody has ever read all the labels in one.',
   array['long-term','1-2-hours-week','weekend-blocks','inside','facility','solo','couple','free'],
   array[4,2,1,6,1,6,2]),

  ('Storytelling and spoken-word nights',
   'Write it, time it to five minutes, and tell it to a room. Open-mic nights are free to enter and free to watch, and the first one is terrifying in a way that turns out to be useful.',
   array['long-term','1-2-hours-week','inside','facility','solo','social','free'],
   array[8,2,9,4,1,8,7]),

  ('Become a school governor',
   'Termly meetings, a real vote, and shared responsibility for a budget and a headteacher. Schools are chronically short of governors, the training is free, and nobody expects you to know education.',
   array['long-term','1-2-hours-week','inside','facility','social','free'],
   array[8,1,2,9,1,7,3]),

  ('Propagate and trade houseplant cuttings',
   'Take cuttings, root them in water on the windowsill, and swap the survivors with other people doing the same. It costs nothing, it works, and plant people give things away with alarming generosity.',
   array['long-term','1-2-hours-week','inside','at-home','solo','couple','social','free'],
   array[6,2,4,5,2,6,2]),

  ('Escape-room puzzles, built for your friends',
   'Ciphers, locks, a story and a one-hour limit, run in your own front room. Being the villain is most of the appeal, and paper-and-string puzzles beat anything you can buy in a box.',
   array['long-term','1-2-hours-week','5-hours-week','inside','at-home','solo','social','free'],
   array[8,1,9,9,1,8,6]),

  ('Trace the family tree past 1900',
   'Free census indexes, birth records and parish registers get most people back to the 1830s without paying anybody. Expect at least one surprise and at least one ancestor who lied on a form.',
   array['long-term','1-2-hours-week','weekend-blocks','inside','at-home','solo','couple','free'],
   array[5,1,4,8,1,7,3]),

  ('Resurrect an old laptop with Linux',
   'A machine too slow for Windows is usually perfectly quick under Linux, and the install is a free download and one afternoon. You end up with a working laptop and a skill that keeps.',
   array['long-term','weekend-blocks','1-2-hours-week','inside','at-home','solo','free'],
   array[1,1,2,10,1,8,2]),

  ('One tiny game, finished, in Godot',
   'The engine is free and the tutorials are endless; the hard part is stopping. Aim at something playable in a weekend, one mechanic and one screen, because finished beats ambitious every single time.',
   array['long-term','5-hours-week','weekend-blocks','inside','at-home','solo','free'],
   array[2,1,9,8,1,8,4]),

  ('Video editing, properly, on free software',
   'DaVinci Resolve costs nothing and does what the film industry does. Cut something real, a holiday or a friend''s band, because tutorials teach the buttons and only projects teach the timing.',
   array['long-term','5-hours-week','weekend-blocks','inside','at-home','solo','couple','free'],
   array[3,1,9,6,1,6,3]),

  ('Section-hike a coastal path',
   'One stretch at a time, ticked off on a map over a year or three, ending wherever the bus goes from. The walking is free; the only real cost is getting yourself back to where you stopped.',
   array['long-term','weekend-blocks','5-hours-week','exertion','outside','in-nature','solo','couple','social','free'],
   array[5,8,1,5,10,7,5]),

  ('Natural navigation',
   'Finding your way by the sun, the stars, wind-shaped trees and which side of the trunk the moss is on. It is free, it is very old, and it turns an ordinary walk into an exam you set yourself.',
   array['long-term','1-2-hours-week','5-hours-week','outside','in-nature','solo','couple','free'],
   array[3,4,1,9,10,10,3]),

  ('Fossil hunting on the coast',
   'Jurassic beaches give up ammonites to anybody who turns up after a storm and looks at the right layer of the cliff fall. Free, legal on most beaches, and you are the first person ever to see it.',
   array['long-term','weekend-blocks','5-hours-week','exertion','outside','in-nature','solo','couple','social','free'],
   array[4,6,1,7,10,8,4])

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

-- 7c. Activity counts by pathway. Expect quick-fix 19, long-term 18
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

-- 7g. The actual shape of the activities table. Run this FIRST if anything
--     below fails with a "column ... does not exist" error — it tells you what
--     is really there, rather than what this file assumes is there.
--     Expect at least: id, title, description, tags (ARRAY), vector (ARRAY).
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'activities'
order by ordinal_position;

-- 7h. Any column on activities that is NOT NULL, has no default, and is not
--     one of the four the seed inserts. Each one of these will block the seed
--     insert, and step 1b cannot guess a value for it. Should be zero rows.
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'activities'
  and is_nullable = 'NO'
  and column_default is null
  and is_identity = 'NO'
  and column_name not in ('title', 'description', 'tags', 'vector');


-- ----------------------------------------------------------------------------
-- STEP 8 (OPTIONAL) — run these later, only once the checks above are clean
-- ----------------------------------------------------------------------------

-- APPLIED 2026-08-25 as STEP 5 of cleanup-legacy-schema.sql, once 7e came back
-- empty. Kept here for the record: the statement that makes vector mandatory,
-- so a future activity cannot be added without one, is
--
--   alter table public.activities alter column vector set not null;
--
-- Do not run it from here as well - it is guarded in the cleanup file.

-- If step 1b had to ADD title or description (7g shows them as nullable), they
-- should be mandatory too. Check for empty ones first — this must return zero
-- rows before the alters below will succeed:
--
--   select id, title, description from public.activities
--   where title is null or description is null;
--
--   alter table public.activities alter column title       set not null;
--   alter table public.activities alter column description set not null;

-- If 7f found duplicates, this keeps the earliest of each and deletes the
-- rest. Read the 7f output first so you know what is going. Then re-run
-- step 2 to add the constraint:
--
--   delete from public.saved_activities s
--   where s.id > (
--     select min(k.id) from public.saved_activities k
--     where k.user_id = s.user_id and k.activity_id = s.activity_id
--   );
