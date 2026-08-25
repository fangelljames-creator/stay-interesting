@AGENTS.md

# CLAUDE.md — Boredom Buster

Context for Claude Code sessions. Merged from Owen's project context file (2026-08-25).
Items marked **verified** were checked against the code at that point; the rest are as-reviewed
in chat and should be confirmed before you act on them.

## What this project is

A discovery website that helps users beat boredom: quick ~10-minute micro-tasks ("Bored" path) or
long-term hobbies ("Hobby" path), matched to their available time, budget, and mood. Users can sign
up, log in, take a 7-axis personality quiz, and save activities to custom lists.

## Stack & layout

- Next.js App Router + TypeScript. **No `src/` directory.** (verified)
- Tailwind CSS v4, pulled in with a bare `@import "tailwindcss"` in `app/globals.css` — there is no
  `tailwind.config.js` and no plugin array. v4 plugins load via `@plugin` in CSS. (verified)
- Supabase (Postgres + auth). Hosted on Vercel.
- `app/` — routes (`page.tsx` home, `quiz/page.tsx`, `login/page.tsx`)
- `components/` — UI components (`PersonalityQuiz.tsx`)
- `data/` — static data and logic (`personalityQuiz.ts`)
- `lib/` — Supabase client, imported as `@/lib/supabaseClient` (the `@/*` → `./*` alias is in
  `tsconfig.json`) (verified)
- `scripts/` — dev-only analysis tools, not part of the build
- `supabase/` — SQL to paste into the Supabase SQL editor. Not run by any CLI or migration
  tool; these are hand-run scripts, written to be idempotent so re-running is safe.

Note that `@AGENTS.md` above warns this Next.js version diverges from what you may have learned:
check `node_modules/next/dist/docs/` before relying on remembered App Router conventions.

## Working with Owen

1. Explain things in clear, beginner-friendly steps; define jargon the first time it comes up.
2. Say which files you're creating or editing, and why, before you do it.
3. Anything Owen must paste elsewhere (SQL for the Supabase SQL editor, env values) must be
   complete and self-contained — nothing left for him to guess.
4. Check your own work: run the dev server and `npx tsc --noEmit` after changes. When something
   breaks, diagnose step by step and explain the cause, not just the fix.
   (Heads-up: `next dev` rewrites the agent-rules block into `AGENTS.md`, so running it can leave
   an uncommitted change in the tree. See `@AGENTS.md` — glance at the diff first, only the
   managed `nextjs-agent-rules` block should ever change, then commit it alongside your work.)
5. Flag every step that needs the Supabase dashboard (API keys, SQL editor, env vars). Secrets
   live in `.env.local` and are never committed.
6. Test/seed activity data must include: playing pool, rugby drills, biro sketching, Spanish
   language practice, and EV market analysis.
7. Owen hand-edits files in VS Code. If the working tree differs from `HEAD`, treat the
   difference as his intent — ask before reverting anything, and never assume an editor buffer
   is stale. Corollary: if he says he edited a file and the diff is empty, the edits are most
   likely unsaved in his editor rather than absent. Say so and ask him to save; do not conclude
   he was mistaken, and do not proceed as though the on-disk text were final.

## Database (Supabase)

- Standard email/password auth.
- `activities`: `id`, `title`, `description`, `tags` (text array), `vector` (`integer[]`).
- `saved_activities`: `user_id`, `activity_id`, unique on the pair.
- All of the above is defined in `supabase/step1-schema-rls-seed.sql`, which Owen runs by hand in
  the Supabase SQL editor. Treat that file as the source of truth for the schema and edit it
  alongside any DB change, rather than making one-off changes in the dashboard.

**Vector storage — decided 2026-08-25:** `integer[]`, not `jsonb` and not pgvector. Chosen because
Supabase hands a Postgres array to JavaScript as a real array with no parsing, which keeps the
step-2 similarity ranking as ordinary JS next to the existing tag scoring. A `CHECK` constraint
enforces 7 elements, each 1–10. Revisit only if the activity table grows into the thousands, where
pgvector's indexed search would start to matter.

**RLS is enabled** (in the same file): `activities` is readable by `anon` and `authenticated` with
no write policy at all, so the anon key that ships in the browser bundle cannot modify it;
`saved_activities` is restricted to `(select auth.uid()) = user_id` for select/insert/delete.
Confirm it is actually applied on the live project with the verification queries at the end of
that file — the SQL existing in the repo is not proof it was run.

## Two recommendation engines currently coexist

### 1. Tag engine — `app/page.tsx` (home, client component)

Also owns auth (`getSession` + `onAuthStateChange`) and the saved-activities list (fetch/toggle).

- Two flows: "Bored" → pathway tag `quick-fix`; "Hobby" → pathway tag `long-term`.
- Pipeline: fetch all activities → hard-filter (pathway tag, social tag, location tag) → score
  tag matches (+6 for time tags, +2 for others) → multipliers (×1.6 analytical/creative/culture/
  active, ×1.4 tangible-output) → ×0.65 penalty for IDs stored in
  `sessionStorage["recent_shown_${path}"]` → top 3 + 1 random wildcard (the wildcard only
  requires the pathway tag).

### 2. Vector quiz — `app/quiz/page.tsx` → `components/PersonalityQuiz.tsx`

- Axis order is a fixed invariant everywhere:
  `[Social, Energy, Creative, Analytical, Outdoors, Novelty, Stimulation]`, each scored 1–10.
- 8 scenario questions in `data/personalityQuiz.ts`. The dominant axis picks 1 of 7 profile types —
  see **Personality quiz scoring** below for how that axis is chosen, which is easy to break.
- Navigation mirrors the home-page quiz: a Back button (`handleBack` drops the last vector from
  `selectedVectors`) and a progress bar across the top of the card.
- The "Find My Perfect Activities →" button is still a placeholder: no `onClick` yet.

## Personality quiz scoring

The dominant axis in `components/PersonalityQuiz.tsx` is determined from the **raw per-axis sums**,
never the rounded averages. Rounding is display-only, for the vector tiles in the results card.

Judging on the rounded averages collapsed distinct scores onto the same integer and left **58% of
all answer paths tied** at the top. `determinePersonalityType` breaks ties with `indexOf`, so every
one of those went to whichever axis sat earliest in the `traits` array — `Social` at index 0 was
winning most of its results on array position, and `Stimulation` at index 6 could never win a tie at
all. Judging on the raw sums drops the tie rate to 10%.

Two consequences to keep in mind:

- Don't reintroduce rounding, bucketing, or any other precision loss upstream of the argmax. It
  silently re-creates the tie problem.
- The `traits` array order is still a real tiebreaker for the remaining 10%. Reordering it changes
  results without touching a vector.

`scripts/analyze-quiz-balance.mjs` measures this — it walks every possible answer combination and
reports the tie rate and profile distribution. Run it after any change to the vectors in
`data/personalityQuiz.ts` or to the scoring itself. It mirrors the scoring logic by hand, so it goes
stale if the component changes and must be updated alongside it.

## Agreed integration plan

Tags answer *what's feasible right now* (time, budget, location, social) → hard filters.
The 7-axis vector answers *what fits who you are* → ranking. Merged pipeline: tag-filter first,
then rank the survivors by similarity between the user's vector and each activity's vector.
Every activity therefore needs both `tags` and a `vector`.

## Known issues

- **Budget is not a hard filter.** "Strictly Free" only adds `free` as a scoring tag, so a
  `low-budget` activity (playing pool, say) still surfaces for a user who said free only. Either
  hard-filter it the way social and location are filtered, or reword the answer. Note this
  interacts with the hobby-budget issue below.
- **`animate-in fade-in zoom-in` classes do nothing** — **verified, still open.** The results card
  uses them but nothing provides them: `tailwindcss-animate` is not in `package.json` and not
  installed. This is Tailwind v4, so the v3 plugin-array approach doesn't apply — it'd need
  `tw-animate-css` (or equivalent) loaded via `@plugin` in `app/globals.css`. The classes fail
  silently, so the card simply appears with no animation.
- The hobby-path budget question adds `low-budget` + `free` to every answer, so it differentiates
  almost nothing (may be intentional — free activities shouldn't be hidden from big spenders).
  **Verified against the seed data:** because every user receives both tags, an activity that
  honestly carries `investment-required` instead is uniformly 4 points behind one tagged
  `low-budget`/`free`, regardless of what the user answered. That systematically down-ranks the
  gear-heavy hobbies rather than differentiating anything.
- The wildcard bypasses social/location hard filters. Probably an intentional "stretch pick" —
  confirm with Owen before changing it.
- **Quiz vector balance is skewed.** With the tie-break fixed, the underlying vector imbalance is
  now visible and unmasked: Stimulation wins 36.7% of all 65,536 answer paths while Creative wins
  3.6%, against an even split of 14.3%. Stimulation has both the highest option-pool average (5.03)
  and the highest floor (2.9), so it starts every path ahead. Rebalancing means editing vectors in
  `data/personalityQuiz.ts` and re-running `scripts/analyze-quiz-balance.mjs`.

## Recently completed

- Back button on the personality quiz, mirroring the home-page `handleBack`.
- Progress bar on the personality quiz card.
- `app/quiz/page.tsx` subtitle now derives from `personalityQuestions.length` — it had been
  hardcoded to "3" against 8 actual questions, so it was visibly wrong in the UI.
- Tie-break fix: dominant axis now judged on raw sums, not rounded averages (58.3% → 10.0% ties).
- `scripts/analyze-quiz-balance.mjs` added.
- Social filter bug fixed — `findPrecisionMatchesWithRotation` now collects every matching social
  tag rather than the first (`app/page.tsx:251`). `userLocationRequirements` was reshaped the same
  way so the bug can't return if an answer ever emits two location tags.
- **Roadmap step 1** — `supabase/step1-schema-rls-seed.sql`: RLS policies, the `vector integer[]`
  column with a shape CHECK, a unique constraint on `saved_activities (user_id, activity_id)`, and
  33 seeded activities (17 quick-fix, 16 long-term) each carrying both tags and a vector.
- `scripts/validate-activity-seed.mjs` added — checks the seed against the hard filters. It caught
  four filter combinations that only had 3 surviving activities, which would have pinned those
  users to the same three results forever with no room for the rotation penalty to work.

## Roadmap (agreed order)

1. ~~Supabase groundwork: RLS policies, the `vector` column, and seeding activities with both tags
   and 7-axis vectors.~~ **SQL written** (`supabase/step1-schema-rls-seed.sql`) — still needs Owen
   to run it in the Supabase SQL editor and confirm the verification queries come back clean.
2. Vector matching function: rank tag-filtered activities by similarity to the user's vector.
3. Wire the quiz results button to real recommendations.
4. Merge both engines into one clean flow.

Not blocking the above, pick up when convenient: the two budget-tag issues, the missing animation
plugin, and the quiz vector rebalance.
