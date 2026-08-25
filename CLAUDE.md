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
- `activities` — **8 columns, verified against the live table 2026-08-25:**

  | column | type | notes |
  |---|---|---|
  | `id` | `uuid` **not** integer | default `gen_random_uuid()` |
  | `title` | `text` | not null |
  | `description` | `text` | nullable |
  | `budget_level` | `text` | **unused** — nothing reads it; overlaps `tags` |
  | `time_required` | `text` | **unused** — nothing reads it; overlaps `tags` |
  | `created_at` | `timestamptz` | default `timezone('utc', now())` |
  | `tags` | `text[]` | not null, default `'{}'` |
  | `vector` | `integer[]` | 7 axes, CHECK-constrained to 7 values of 1–10 |

- `saved_activities`: `id`, `user_id` (uuid), `activity_id` (uuid), `created_at`, unique on
  (`user_id`, `activity_id`).
- Two SQL files, both run by hand in the Supabase SQL editor and both idempotent. They are the
  source of truth for the schema — edit them alongside any DB change rather than making one-off
  changes in the dashboard.
  - `supabase/step1-schema-rls-seed.sql` — schema, RLS, and the seed data.
    **Run 2026-08-25: 33 activities seeded, every one with tags and a vector.**
  - `supabase/cleanup-legacy-schema.sql` — one-off tidy-up of the original hand-written schema.
    **Run 2026-08-25: dropped `personality_scores`, removed 4 duplicate policies.**

⚠️ **`create table if not exists` is not a schema guard.** It does nothing when the table exists,
even if the columns differ, which is how the seed came to fail against a table with no `tags`
column. Use `alter table ... add column if not exists` (STEP 1b in that file) for anything that
must actually reconcile. Query 7g in the same file reports the table's real shape.

⚠️ **`drop policy if exists` matches on the exact name only.** The original schema created its
policies under different names from the ones in `step1-schema-rls-seed.sql`, so that file's drop
guards never matched them and both sets survived — 8 policies where 4 were intended. Not a
security hole (multiple PERMISSIVE policies are OR'd, and both expressed the same rule) but
redundant and slower. Cleaned up 2026-08-25. When renaming a policy, drop the OLD name explicitly;
re-running a script with a new name will not replace the old one.

Still open: `budget_level` and `time_required` are unused text columns overlapping what `tags`
encodes. Decide whether they are the intended design with `tags` as a newer overlay, or dead
columns to drop — the drop statements are at the bottom of `cleanup-legacy-schema.sql`.

**Vector storage — decided 2026-08-25:** `integer[]`, in a column literally named `vector`. Chosen
because Supabase hands a Postgres array to JavaScript as a real array with no parsing, which keeps
the step-2 similarity ranking as ordinary JS next to the existing tag scoring. A `CHECK` constraint
enforces 7 elements, each 1–10.

Note the decision was made believing pgvector was not installed. **It is** — the dropped
`personality_scores` column was `vector(7)`, and the extension is deliberately left installed even
though nothing uses it. So switching to pgvector is a column add, not a reinstall, and `<=>` cosine
distance in SQL is available whenever ranking should move server-side. At 33 rows it wins nothing
measurable, and pgvector returns to JS as a string needing parsing, so `integer[]` stands — but
revisit at the point the table grows or step 2 wants to filter and rank in one query.

**RLS is enabled and applied** (2026-08-25, via the same file): `activities` is readable by `anon`
and `authenticated` with no write policy at all, so the anon key that ships in the browser bundle
cannot modify it; `saved_activities` is restricted to `(select auth.uid()) = user_id` for
select/insert/delete. Queries 7a and 7b in that file re-check this at any time.

## Two recommendation engines currently coexist

### 1. Tag engine — `app/page.tsx` (home, client component)

Also owns auth (`getSession` + `onAuthStateChange`) and the saved-activities list (fetch/toggle).

- Two flows: "Bored" → pathway tag `quick-fix`; "Hobby" → pathway tag `long-term`.
- Pipeline: fetch all activities → hard-filter (pathway tag, then social, location, and budget) →
  score tag matches (+6 for time tags, +2 for others) → multipliers (×1.6 analytical/creative/
  culture/active, ×1.4 tangible-output) → ×0.65 penalty for IDs stored in
  `sessionStorage["recent_shown_${path}"]` → top 3 + 1 random wildcard.

**Three hard filters, all shaped identically** (`SOCIAL_TAGS`, `LOCATION_TAGS`, `BUDGET_TAGS`):
collect every one of the user's tags on that axis, keep an activity if it matches ANY of them. An
activity carrying no tag at all on one of these axes is invisible to everyone —
`scripts/validate-activity-seed.mjs` fails the build on that.

**Budget became a hard filter 2026-08-25 (Owen's decision).** It had been scoring-only, so
"Strictly Free" still surfaced paid activities. Filtering it makes the multi-tag budget answers
semantically correct rather than redundant, which is why the hobby quiz's blanket `low-budget` +
`free` tags are **deliberately kept**:

| Answer | Emits | Now means |
|---|---|---|
| Bored → Strictly Free | `free` | free only |
| Bored → Open budget | `low-budget`, `free` | free or cheap |
| Hobby → Light commitment | `low-budget`, `free` | excludes gear-only hobbies |
| Hobby → Deep immersion | + `investment-required` | matches everything |
| Hobby → Weekend expeditions | + `investment-required` | matches everything |

Listing all three tags is how an answer says "no budget limit". Under the old scoring-only
behaviour those tags differentiated nothing; under filtering they are the mechanism. Don't "tidy"
them away.

**Wildcard rule, confirmed 2026-08-25: it may stretch taste, never feasibility.** It is drawn from
the hard-filtered survivors minus the picks already shown, so it can surprise on theme but can
never suggest something the user ruled out on social, location, or budget. It reads from
`validActivities` rather than `sortedMatches`, so a zero-scoring but perfectly feasible activity is
still eligible.

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

**The rounding rule now has a second consumer.** As of step 2 the raw sums also feed
`rankActivities`, via `userVectorFromQuizTotals(totals, questionCount)` in `lib/matchActivities.ts`
— it divides the sums by the question count to reach the activities' own 1–10 scale and
**deliberately does not round**. So "rounding is display-only" is no longer just about the profile
label; precision lost upstream would now also flatten genuinely different users onto the same match
ordering. Both consumers take the raw sums; only the results-card vector tiles take the rounded
averages.

`scripts/analyze-quiz-balance.mjs` measures this — it walks every possible answer combination and
reports the tie rate and profile distribution. Run it after any change to the vectors in
`data/personalityQuiz.ts` or to the scoring itself. It mirrors the scoring logic by hand, so it goes
stale if the component changes and must be updated alongside it.

## Vector matching — `lib/matchActivities.ts`

`rankActivities(userVector, activities)` sorts activities by closeness to the user's 7-axis vector,
nearest first, decorating each with `distance` and `matchPercent` (the same way `app/page.tsx`
decorates with `score`).

**Metric: Euclidean distance.** Straight-line distance across the 7 axes, so an activity matches
when it sits near the user on every axis at once. `matchPercent = (1 - d / (9 * sqrt(7))) * 100`,
clamped to 0–100 — `9 * sqrt(7)` ≈ 23.81 is the largest gap two valid vectors can have (every axis
maximally opposed, 1 vs 10). Exact match = 100%.

Two alternatives were considered and rejected, both because they throw away intensity:

- **Dot product** rewards magnitude. An activity vectored all-10s would out-score every other
  activity for *every* user, so one maximal row would win every quiz regardless of who took it.
- **Cosine similarity** compares direction only. It calls a `[2,2,2,2,2,2,2]` user a perfect match
  for a `[9,9,9,9,9,9,9]` activity because the vectors are parallel. That is exactly backwards
  here: someone scoring low across the board wants something gentle, not the most intense thing in
  the catalogue. Intensity is information in this model, not noise to normalise away.

**Pure and composable, deliberately.** No fetching, no filtering, no React. Tag hard-filtering stays
upstream, so the caller decides what is *feasible* and this decides what *fits* — which is what lets
the same function serve the quiz flow now and the merged engine in roadmap step 4. Activities with a
null or malformed vector are skipped rather than throwing, because rows arrive from Supabase untyped
and one bad row must not take down the results page. An invalid `userVector` *does* throw: that is a
caller bug, and returning an empty list would hide it.

Verified by `scripts/verify-activity-matching.mjs`, which imports the real function and the real
quiz data rather than mirroring them (Node strips the TypeScript on the fly), so it cannot drift out
of sync the way `analyze-quiz-balance.mjs` can.

## Agreed integration plan

Tags answer *what's feasible right now* (time, budget, location, social) → hard filters.
The 7-axis vector answers *what fits who you are* → ranking. Merged pipeline: tag-filter first,
then rank the survivors by similarity between the user's vector and each activity's vector.
Every activity therefore needs both `tags` and a `vector`.

## Known issues

- **Activity ids are typed as `number` but are `uuid` strings** — `app/page.tsx:108`
  (`useState<number[]>` for `savedActivityIds`), `:177` (`toggleSaveActivity(activityId: number)`),
  and `:272` (`recentShownIds: number[]`, the sessionStorage rotation store). Nothing crashes:
  JavaScript compares strings happily, so `.includes()` and `.filter()` behave, and `tsc` stays
  green because Supabase rows come back as `any[]` so nothing ever checks. But the types are
  false, and the first arithmetic or `parseInt` on an id yields `NaN`. Change them to `string`.
- **`animate-in fade-in zoom-in` classes do nothing** — **verified, still open.** The results card
  uses them but nothing provides them: `tailwindcss-animate` is not in `package.json` and not
  installed. This is Tailwind v4, so the v3 plugin-array approach doesn't apply — it'd need
  `tw-animate-css` (or equivalent) loaded via `@plugin` in `app/globals.css`. The classes fail
  silently, so the card simply appears with no animation.
- **Quiz vector balance is skewed.** With the tie-break fixed, the underlying vector imbalance is
  now visible and unmasked: Stimulation wins 36.7% of all 65,536 answer paths while Creative wins
  3.6%, against an even split of 14.3%. Stimulation has both the highest option-pool average (5.03)
  and the highest floor (2.9), so it starts every path ahead. Rebalancing means editing vectors in
  `data/personalityQuiz.ts` and re-running `scripts/analyze-quiz-balance.mjs`.
- **The seed pool still leans the opposite way to the quiz, on the same two axes.** Dominant axis
  across the 37 seeded activities: Creative 8, Social 7, Energy 6, Outdoors 6, Analytical 5,
  **Novelty 3, Stimulation 2**. The two axes that win most quiz paths (Stimulation 36.7%,
  Novelty 17.6% — together 54% of users) are still the two the catalogue has least of.
  Improved 2026-08-25 from Novelty 1 / Stimulation 0 by the four activities added for the budget
  filter, but `verify-activity-matching.mjs` **still flags the Stimulation purist**: skateboarding
  lands at d=4.90, a hair behind darts, so it misses the top 3 by a rounding error rather than by
  a mile. Not a matcher bug — the matches returned are sensible — but the profile label still
  cannot point at something the catalogue agrees is Stimulation-dominant. Fix from either end:
  rebalance the quiz vectors down, or seed more genuinely Stimulation-dominant activities. These
  vectors were authored by Claude, so this is seed data to correct, not a user decision to preserve.

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
- **Roadmap step 1, run against the live database 2026-08-25** —
  `supabase/step1-schema-rls-seed.sql`: RLS policies, the `vector integer[]` column with a shape
  CHECK, a unique constraint on `saved_activities (user_id, activity_id)`, and 33 seeded
  activities (17 quick-fix, 16 long-term) each carrying both tags and a vector. The first run
  failed on a table whose real columns didn't match the assumed ones; STEP 1b now reconciles that.
- `scripts/validate-activity-seed.mjs` added — checks the seed against the hard filters. It caught
  four filter combinations that only had 3 surviving activities, which would have pinned those
  users to the same three results forever with no room for the rotation penalty to work.
- **Budget promoted to the third hard filter, 2026-08-25 (Owen's decision).** Resolved both budget
  Known-issues entries and confirmed the wildcard rule. Seed grew 33 → 37 to keep every
  pathway × social × location × budget combination at ≥5 survivors: the four failing combinations
  were fixed by adding activities, not by re-tagging, because pool hire, film developing, and a
  road bike are all genuinely not free and re-tagging them would have gutted the semantics.
  **The live database needs `step1-schema-rls-seed.sql` re-run to pick up the 4 new rows.**
- **Roadmap step 2** — `lib/matchActivities.ts`: pure Euclidean-distance ranking, plus
  `userVectorFromQuizTotals`, `euclideanDistance`, `matchPercentFor`, and `isValidVector`.
  `scripts/verify-activity-matching.mjs` checks it (self-match, purist-path diagnostic, bad-data
  handling) by importing the real module and real quiz data. `scripts/lib/parse-seed.mjs` now holds
  the shared seed parser both dev scripts use.
- **Legacy schema cleanup, run 2026-08-25** (`supabase/cleanup-legacy-schema.sql`): dropped the
  unused `personality_scores` `vector(7)` column, and removed the 4 duplicate RLS policies left
  under their original names. The drop is guarded — it counts non-null values first and aborts
  rather than destroying data. The pgvector extension was left installed on purpose.

## Roadmap (agreed order)

1. ~~Supabase groundwork: RLS policies, the `vector` column, and seeding activities with both tags
   and 7-axis vectors.~~ **DONE 2026-08-25** — script run, RLS applied, 33 activities seeded, all
   with vectors. Verified: `vector` really is `integer[]`, `missing_vector` is 0.
2. ~~Vector matching function: rank tag-filtered activities by similarity to the user's vector.~~
   **DONE 2026-08-25** — `lib/matchActivities.ts`, verified by
   `scripts/verify-activity-matching.mjs`. Not yet wired to any UI; that is step 3.
3. Wire the quiz results button to real recommendations.
4. Merge both engines into one clean flow.

Not blocking the above, pick up when convenient: the two budget-tag issues, the missing animation
plugin, and the quiz vector rebalance.
