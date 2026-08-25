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
  `tailwind.config.js` and no plugin array. (verified)
  **`@plugin` vs `@import` — get this right.** `@plugin` is only for *JavaScript* plugins
  (`@plugin "@tailwindcss/typography"`). A package that ships plain CSS is loaded with `@import`
  like any stylesheet. `tw-animate-css` is plain CSS, so it is `@import "tw-animate-css"`. An
  earlier version of this file asserted `@plugin` for it and was wrong; check the package's own
  docs before wiring one up.
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
  | `budget_level` | `text` | **being dropped** — see cleanup file STEP 4 |
  | `time_required` | `text` | **being dropped** — see cleanup file STEP 4 |
  | `created_at` | `timestamptz` | default `timezone('utc', now())` |
  | `tags` | `text[]` | not null, default `'{}'` |
  | `vector` | `integer[]` | 7 axes, CHECK-constrained to 7 values of 1–10 |

- `saved_activities`: `id`, `user_id` (uuid), `activity_id` (uuid), `created_at`, unique on
  (`user_id`, `activity_id`).
- Two SQL files, both run by hand in the Supabase SQL editor and both idempotent. They are the
  source of truth for the schema — edit them alongside any DB change rather than making one-off
  changes in the dashboard.
  - `supabase/step1-schema-rls-seed.sql` — schema, RLS, and the seed data.
    **Run 2026-08-25: 37 activities seeded, every one with tags and a vector.**
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

**Resolved 2026-08-25 (Owen's decision: drop).** `budget_level` and `time_required` were unused
text columns duplicating what `tags` encodes, and since budget became a hard filter both
dimensions are driven entirely by tags. STEP 4 of `cleanup-legacy-schema.sql` drops them and
STEP 5 makes `vector` NOT NULL. Both are guarded — they check for data and abort rather than
destroy anything. ⚠️ **Written but not yet run against the live database**; until Owen pastes that
file, `activities` still has 8 columns and a nullable `vector`.

**Vector storage — decided 2026-08-25:** `integer[]`, in a column literally named `vector`. Chosen
because Supabase hands a Postgres array to JavaScript as a real array with no parsing, which keeps
the step-2 similarity ranking as ordinary JS next to the existing tag scoring. A `CHECK` constraint
enforces 7 elements, each 1–10.

Note the decision was made believing pgvector was not installed. **It is** — the dropped
`personality_scores` column was `vector(7)`, and the extension is deliberately left installed even
though nothing uses it. So switching to pgvector is a column add, not a reinstall, and `<=>` cosine
distance in SQL is available whenever ranking should move server-side. At 37 rows it wins nothing
measurable, and pgvector returns to JS as a string needing parsing, so `integer[]` stands — but
revisit at the point the table grows or step 2 wants to filter and rank in one query.

**RLS is enabled and applied** (2026-08-25, via the same file): `activities` is readable by `anon`
and `authenticated` with no write policy at all, so the anon key that ships in the browser bundle
cannot modify it; `saved_activities` is restricted to `(select auth.uid()) = user_id` for
select/insert/delete. Queries 7a and 7b in that file re-check this at any time.

## Tag doctrine — read before touching tags

**Tags encode feasibility. The vector ranks. A tag that no hard filter reads must not exist.**

This is a rule with teeth, not a preference. The previous vocabulary grew to 40 tags, most feeding
a scoring pass that vector ranking later made irrelevant — four of ten questions ended up fully
decorative, with users answering them and nothing changing. Tags describing *taste* ("creative",
"analytical", "vintage") duplicate what the vector already measures and drift out of agreement
with it. Adding a tag means adding, in the same change, the filter that reads it.

**The closed vocabulary — 20 tags, defined in `lib/activityTags.ts`:**

| Group | Tags |
|---|---|
| Pathway | `quick-fix`, `long-term` — an activity may honestly carry **both** |
| Time (quick) | `10-mins`, `1-hour`, `half-day` — ordered, smallest first |
| Time (long) | `1-2-hours-week`, `5-hours-week`, `weekend-blocks` — ordered |
| Energy | `exertion` |
| Place | `inside`, `outside` |
| Setting | `at-home`, `facility`, `in-nature` |
| Company | `solo`, `couple`, `social` |
| Cost | `free`, `low-budget`, `investment-required` — **exactly one per activity** |

`scripts/validate-activity-seed.mjs` hard-fails on any tag outside this list.

**Why `exertion` is one tag, not a low/high pair.** An activity either demands real effort or it
does not; the absence of the tag carries the "doesn't" case. A pair lets a row claim both or
neither, which is how `low-energy` and `high-energy` both ended up on the same activities.

**Why cost is exactly one tier.** Cost is applied as a **ceiling** at query time (`costCeiling`):
free → `{free}`; low → `{free, low-budget}`; money-no-object → no filter at all. That is what lets
each activity carry one honest tier. The old vocabulary let a row carry `free` *and* `low-budget`
to stay visible to everyone, which made the tag mean nothing. Something tagged `free` still shows
for a big spender — the ceiling handles it.

**Every quiz option maps to an explicit `FilterAction`** — `require`, `exclude`, `allow`, or
`none`. Options used to emit a bag of tags and leave the engine to infer meaning from which group
each fell into, which is exactly how tags came to do nothing without anyone noticing. Stating the
action makes a no-op visible as a no-op. "Don't mind" answers are `none`.

## One funnel (merged 2026-08-25, roadmap steps 3 + 4)

Every visit walks the same path, in `app/page.tsx`:

```
personality quiz -> Bored/Hobby chooser -> feasibility questions -> ranked results
```

`FunnelStage` drives it: `"loading" | "quiz" | "chooser" | "questions" | "results"`.

**`"loading"` is load-bearing, not decoration.** The page is statically prerendered, so
`sessionStorage` does not exist during that render and the opening stage cannot be known until
after mount. It resolves in a `useEffect`; painting a spinner until then is what prevents a
hydration mismatch. `eslint`'s `react-hooks/set-state-in-effect` objects — that is the correct
trade, and there is a comment at the effect saying so. Do not "fix" it by reading storage during
render.

**The session contract** (`lib/quizSession.ts`, key `si_quiz_v1`): `sessionStorage` only. No
table, no `localStorage`. The result survives navigation and refresh inside a tab and dies with
it, so a new tab always retakes the quiz. Stores **raw per-axis sums plus the question count**,
never a pre-divided vector, so `userVectorFromQuizTotals` stays the single place division — and
therefore the no-rounding rule — lives. `readQuizSession` returns `null` on every failure path
(server render, storage blocked, absent, malformed, wrong shape); the caller's answer to `null`
is "send them to the quiz", which is fine for all of them.

⚠️ **`writeQuizSession` fails silently when storage is blocked**, so the results stage really can
be reached with no vector. The tag-score ordering is kept as the fallback for exactly that case.
It is not dead code — don't delete it when retiring tag scoring.

Two distinct ways out of a finished run: **"Try a different path"** keeps the vector and returns
to the chooser; **"Retake the personality quiz"** clears the session and starts over. Retake links
sit on both the chooser and the results.

`/quiz` still works standalone. Its CTA stores the session and routes to `/`, so home picks the
funnel up at the chooser rather than asking again.

### 1. Feasibility engine — `app/page.tsx` + `lib/feasibilityQuestions.ts`

Rebuilt 2026-08-25. **There is no tag scoring.** No `+2`/`+6` weights, no multipliers, no
`score > 0` gate. Tags decide what is FEASIBLE; `rankActivities` decides what FITS.

```
pathway filter -> per-question filter actions -> rank by vector -> top 3 + wildcard
```

**Nine questions**, five on the quick path and four on the hobby path, in
`lib/feasibilityQuestions.ts`. They live there rather than in the page component so scripts can
import the real definitions — mirroring them by hand is how `analyze-quiz-balance.mjs` became
something that goes stale in lockstep with the code it checks.

Every option carries an explicit `FilterAction`:

| Question | Constraint | Actions |
|---|---|---|
| How long have you actually got? | `time` | `allow {10-mins}` / `{1-hour}` / `{half-day}` / `none` |
| What's your body in the mood for? | `energy` | `exclude exertion` / `require exertion` / `none` |
| In or out? | `place` | `require inside` / `require outside` / `none` |
| Who's around? | `company` | `require solo` / `couple` / `social` |
| Spending money? | `cost` | ceiling: `{free}` / `{free,low-budget}` / `none` |

The hobby path mirrors it with `setting` (`at-home` / `facility` / `in-nature`) in place of
`place`, **no energy question**, and a "don't mind" option on company.

**Graceful relaxation.** When fewer than `MIN_RESULTS` (3) survive, one constraint is bent at a
time, in order: **place/setting → energy → time (widened one slot up the ladder)**. The results
page states exactly what was bent — relaxation is never silent.

⚠️ **`RELAXATION_STEPS` must never contain `cost` or `company`.** Someone who said "keep it free"
cannot act on a paid suggestion, and someone on their own cannot act on one needing three people.
Those are facts about their situation, not preferences to nudge. Bending either produces a
recommendation the user physically cannot take.

**The wildcard may stretch taste, never feasibility** — drawn from the same filtered survivors
minus the picks already shown, so it can surprise on theme but never suggests something ruled out.

**Rotation** pushes recently-shown activities down by multiplying their distance
(`ROTATION_DISTANCE_PENALTY`, 1.35). It touches a **sort key only** — the `matchPercent` on the
card stays the true distance. Never let the penalty reach the displayed number.

⚠️ **No-vector fallback.** `writeQuizSession` fails silently when storage is blocked, so the
results really can be reached with no vector. Nothing can rank then, so the survivors are shown
unordered with no `matchPercent` and the page says why. Do not "tidy" this into an empty state.

**Coverage today:** the quick path starts below 3 survivors on 44% of its 324 answer combinations,
the hobby path on 43% of 192. That is a thin-catalogue measurement, not a tagging fault — five
simultaneous hard filters over a 20-activity pool cannot do much better, and relaxation absorbs
it (no combination ends up empty at runtime). `scripts/validate-activity-seed.mjs` reports it.
**Not being padded with hand-written activities**: the catalogue is heading for thousands, at
which point starvation largely evaporates on its own.
### 2. Vector quiz — `components/PersonalityQuiz.tsx`

- Axis order is a fixed invariant everywhere:
  `[Social, Energy, Creative, Analytical, Outdoors, Novelty, Stimulation]`, each scored 1–10.
- 8 scenario questions in `data/personalityQuiz.ts`. The dominant axis picks 1 of 7 profile types —
  see **Personality quiz scoring** below for how that axis is chosen, which is easy to break.
- Back button and progress bar as before. The results card shows the **personality type only** —
  the seven vector tiles were removed, and with them the last rounding in the codebase.
- **Skip is a real answer, not a missing one.** `handleSkip` picks a random option and goes
  through `handleSelectOption` exactly as a click would, so every path yields a full-length
  vector and `handleBack` needs no special case for a skipped question. Skips are tracked as a
  `boolean[]` parallel to `selectedVectors` — **not a counter**, because going back over a skip
  has to un-count it. The count is stored in the session and displayed on the *results*, next to
  the match percentages it qualifies.
- `pickRandomOption` sits at module scope because `Math.random()` in a component body trips
  `react-hooks/purity`.
- The CTA takes an optional `onContinue`; without one it routes to `/`. That keeps
  `app/quiz/page.tsx` a server component.

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

**There is now no rounding anywhere in this path — keep it that way.** The rule used to be
"rounding is display-only"; as of 2026-08-25 the display that needed it is gone. The vector tiles
on the profile card were the only consumer of the rounded averages, and removing them deleted
`finalVector` and its `Math.round` outright.

The raw sums now feed two things, neither of which rounds:

1. `determinePersonalityType(totals)` — the profile label, judged on raw sums (the tie-break fix).
2. `userVectorFromQuizTotals(totals, questionCount)` in `lib/matchActivities.ts` — divides by the
   question count to reach the activities' 1–10 scale and **deliberately does not round**.

Precision lost upstream would inflate the profile tie rate *and* flatten genuinely different users
onto the same match ordering. The rule is no longer "keep rounding out of the argmax" but the
simpler "there is no rounding here; don't reintroduce any".

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

## Integration plan — done

Tags answer *what's feasible right now* → hard filters. The 7-axis vector answers *what fits who
you are* → ranking. **Implemented 2026-08-25:** hard-filter on pathway/social/location/budget,
then `rankActivities` orders the survivors by distance from the session vector, and every card
shows its `matchPercent`.

Two consequences of that switch worth knowing:

- **The `score > 0` gate is gone.** It only ever dropped activities sharing no scoring tags with
  the answers. Every survivor is feasible by definition and the vector supplies the ordering, so
  activities that previously could not surface now can.
- **The rotation penalty is a distance multiplier now** (`ROTATION_DISTANCE_PENALTY`, 1.35), since
  lower distance is better. It is applied to a **sort key only** — the `matchPercent` on the card
  stays the true one. Never let the penalty reach the displayed number; it would make the card
  lie about the fit in order to make rotation work.

## Tag scoring — retired 2026-08-25

Done, as part of the feasibility redesign. The `+2`/`+6` weights and the ×1.6/×1.4 multipliers
are gone; nothing scores tags any more.

The analysis that justified it: with every user completing the personality quiz, `rankActivities`
did all the ordering, and tracing the tags showed **four of ten questions had become fully
decorative** — users answered them and nothing changed. Time was the dangerous one, carrying the
heaviest scoring weight while never being a hard filter, so someone with ten minutes could be
handed a half-day activity.

Rather than delete the scoring and leave half-dead questions behind, the whole feasibility layer
was rebuilt: time and energy are now real filters, and the taste questions ("psychological itch",
"learning curve") are gone entirely, since the vector already measures what they asked about.
## ⚠️ Scaling to a catalogue in the thousands

Owen's stated direction (2026-08-25). Several current decisions were made explicitly for a
37-row table and **should be revisited before the catalogue grows**, not after.

**The scaling ladder.** Three stages, in order. **The metric never changes at any stage** — it is
Euclidean distance throughout, in JavaScript and later in Postgres. Do not let a stage change
introduce a change of meaning.

**(A) Now — `select *` plus JavaScript filtering is correct.**
`findMatches` fetches the table and filters in JS. At 37 rows that is the right answer: one round
trip, no query complexity, and relaxation is a cheap in-memory re-filter. Do not optimise this
before it hurts.

**(B) First pressure — move the hard filters into the query.**
The symptom is a slow results view: the whole table crosses the wire on every run to be thrown
away. Push the tag filters into SQL, where the array operators map straight onto the filter
actions — `tags @> array['quick-fix','solo']` for require/allow, `not (tags && array['exertion'])`
for exclude — and `select` only the columns the results page needs rather than `*`. **Ranking
stays in JavaScript, on the same Euclidean distance.** A GIN index on `tags` when the row count
justifies one. Relaxation currently re-filters an in-memory array up to three times; against SQL
that becomes several round trips, so widen the WHERE clause in one query instead.

**(C) Real scale — rank in the database too.**
`vector integer[]` becomes a pgvector `vector(7)` column, and filtering and ordering happen in one
query: `... where <tag filters> order by vector <-> $userVector limit 4`. **`<->` is pgvector's
L2 operator — Euclidean, exactly what `euclideanDistance` computes today.** Cosine (`<=>`) is a
different operator that we simply would not use; the **Vector matching** section explains why
cosine is wrong for this model, and none of that changes here. Add an index only when row counts
justify it — an exact scan is fine for a long time, and an approximate index trades recall for
speed, which is a real decision of its own.

pgvector is already installed (the dropped `personality_scores` column was `vector(7)`), so stage
C is a column add plus a backfill, not a reinstall.

**Coverage starvation mostly solves itself.**
The 44% / 43% starvation rates are a function of a 20-activity pool, not of the tag design. They
should fall away as the catalogue grows — which is exactly why the seed was not padded with
hand-written filler. Keep running the coverage report; at scale it is the only way to see the
sparse corners at all.

**RLS and the anon key still hold.** Nothing above changes the security model: `activities`
stays publicly readable with no write policy.

## Known issues

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

**Feasibility redesign, 2026-08-25** (branch `funnel-integration`):

- `lib/activityTags.ts` — the closed 20-tag vocabulary and the `FilterAction` type.
- `lib/feasibilityQuestions.ts` — nine questions, each option an explicit filter action, plus the
  relaxation ladder. Kept out of the page component so scripts import the real definitions.
- All 37 activities retagged: 40 distinct tags down to 20, exactly one cost tier each, four
  carrying both pathways. `supabase/retag-activities.sql` migrates the live table by title.
- Tag scoring retired entirely; graceful relaxation added, with disclosure on the results page.
- Validator v2: unknown tags, cost-tier count and per-pathway completeness are hard failures, plus
  a non-fatal coverage report over all 516 answer combinations.

**Funnel integration, 2026-08-25** (roadmap steps 3 + 4, branch `funnel-integration`):

- `lib/quizSession.ts` — the per-tab quiz result. Raw sums + question count, versioned key,
  null on every failure path.
- Skip button on every personality question; the profile card trimmed to the type alone.
- `FunnelStage` replaces the old `path === null` gating; retake links on chooser and results.
- Results ranked by `rankActivities` with `matchPercent` on every card — the first time
  `lib/matchActivities.ts` has been called by anything since it was written.

**Cleanup sweep, 2026-08-25** (before the merged-engine build):

- Activity ids typed as `string` — they are uuids. Checked the whole file; the remaining `number`
  types are vectors and array indices, which really are numeric.
- `.gitattributes` with `* text=auto eol=lf`, ending both the per-commit CRLF warnings and the
  phantom ` M` on `data/personalityQuiz.ts`. `git add --renormalize .` staged nothing — the repo
  already held every text file as LF — so the fix was the policy file plus converting the six
  worktree copies that still physically held CRLF. **Watch out:** Python's `write_text` re-adds
  CRLF on Windows unless you pass `newline="
"`; it caught me once mid-sweep.
- `tw-animate-css` installed and `@import`ed, so `animate-in fade-in zoom-in-95` and
  `slide-in-from-bottom-4` finally emit real CSS. Verified against the built bundle, not by eye:
  `.animate-in` now binds `@keyframes enter`, `.fade-in` sets `--tw-enter-opacity: 0`,
  `.zoom-in-95` sets `--tw-enter-scale: .95`. None of those existed in the bundle before.
- Temporary `/quiz` link on the home page under the two pathway cards, marked with the condition
  for its removal (roadmap step 4, when the engines merge).
- `budget_level` and `time_required` drops activated, plus `vector` NOT NULL — both guarded, both
  still awaiting a run against the live database.

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
   `scripts/verify-activity-matching.mjs`.
3. ~~Wire the quiz results button to real recommendations.~~ **DONE 2026-08-25.**
4. ~~Merge both engines into one clean flow.~~ **DONE 2026-08-25** — see **One funnel** above.
5. ~~Retire the tag-scoring ranking.~~ **DONE 2026-08-25**, subsumed into a wholesale
   feasibility redesign — see **Tag doctrine** and **Feasibility engine** above.
6. **Scale to a catalogue in the thousands.** Owen's stated direction. See the warning below
   before building anything that assumes the current size.

Not blocking the above, pick up when convenient: the two budget-tag issues, the missing animation
plugin, and the quiz vector rebalance.
