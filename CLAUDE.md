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
  `tsconfig.json`) (verified). Also the pure logic modules: `matchActivities.ts` (ranking),
  `activityTags.ts` (the vocabulary), `feasibilityQuestions.ts`, `quizSession.ts`, and
  `resultsSelection.ts` (the wildcard draw) and `rerollMachine.ts` (the results reducer: the
  deterministic reroll queue, the shared counter, and the wildcard refresh). Sibling imports in `lib/`
  use the explicit `./name.ts` extension so the dev scripts can import them under Node.
- `scripts/` — dev-only analysis tools, not part of the build. Four of them:
  `validate-activity-seed.mjs`, `verify-activity-matching.mjs`, `verify-results-selection.mjs`,
  `analyze-quiz-balance.mjs`
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
  | `vector` | `integer[]` | 7 axes, CHECK-constrained to 7 values of 1–10. Scored against **The 7-axis rubric** — the CHECK enforces the range, only the rubric enforces the meaning |

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
pathway filter -> per-question filter actions -> rank by vector -> top 3 (rerollable) + wildcard
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

**The wildcard obeys nothing — "full chaos".** *Changed 2026-08-26 (Owen's decision). This
supersedes the 2026-08-25 rule, "the wildcard may stretch taste, never feasibility", which drew it
from the filtered survivors.* It is drawn **at random from the user's pathway** and respects
**none** of the answers: not the taste ranking, not time, energy, place, company — **and not
budget**. The only rows it will not return are **the cards already on screen and anything rerolled
away**, because a duplicate is not a surprise, it is a bug.

The badge reads **"✨ Wildcard — completely random, ignores everything you said"**. Unlabelled it
would read as a filtering bug, and on the budget answer it would read as a broken promise.

⚠️ **There was a budget exception for about an hour, and it is gone.** The argument for it was that
a suggestion you cannot afford is a dead card rather than a surprise. Owen's call was that the
wildcard is the one place the answers do not apply, and half a rule is harder to explain than none.
Do not reinstate it on the reasoning above — it was considered and rejected.

⚠️ **This licenses nothing outside the wildcard.** `cost` and `company` stay out of
`RELAXATION_STEPS`, so the three ranked cards still honour a budget answer absolutely. One
deliberately labelled random card is a different object from a ranked recommendation the user cannot
act on. Two pieces of results copy depend on that distinction and were reworded when the exception
went: the relaxation banner now names the wildcard as the exception to "your budget was left exactly
as you set them", and the empty state says "we will not **rank** something at you that costs more
than you said" rather than "we will not suggest".

The wildcard renders whenever any activity is left beyond the shown cards, and shows its real
`matchPercent`: a true number on a randomly drawn row, saying how well the draw happens to fit — not
that fit had anything to do with the draw. Same rule as the rotation penalty below; the number never
lies, the label explains it.

**Reroll — respecified 2026-08-26 (supersedes the original same-day design).** The first version
used a shared *random* pool with no counter and closure-reading handlers. All three of those were
wrong; what replaced them is in **`lib/rerollMachine.ts`**, a pure reducer.

**The rules now:**

- Each of the three ranked cards carries `↻ Reroll`. **The wildcard is not part of this system** — it
  keeps its own separate `↻ Another` refresh, which costs no reroll.
- **One shared counter**, rendered above the cards as "N rerolls remaining". At 0 the buttons are
  **removed, not disabled**, and all three go together.
- **Rerolls are deterministic.** The queue is ranks 4, 5, 6, 7, 8 in order; the first reroll — on
  whichever card — serves rank 4, the next serves rank 5. No randomness anywhere in this path.
- A rerolled card is **gone for the run** and never returns, as a card or as a wildcard.
- Replacements come from the ranked list so they carry their own true `matchPercent`, and the queue
  is built from the **relaxed** survivors, the same list the top three came from.

⚠️ **EVERY READ IN THE REDUCER COMES FROM ITS `state` ARGUMENT.** Do not reintroduce a handler that
closes over results state. The original did, and two rerolls landing in one React batch both built
their next state from the same pre-update snapshot, so the second silently reverted the first:

```
baseline           shown=[r1,r2,r3]  pool=5
separate renders   shown=[r4,r5,r3]  pool=3   correct
same batch         shown=[r1,r4,r3]  pool=4   card 0's reroll UNDONE
```

The user clicked twice, saw one card move, and lost a reroll. `app/page.tsx` now holds the entire
results view in one `useReducer` and both handlers are a bare `dispatch`.

⚠️ **The counter is the queue length, NOT `min(5, survivors − 3)`.** The queue skips the wildcard and
anything already on screen, so when the wildcard happens to sit inside ranks 4–8 — about one run in
fifteen — the arithmetic formula promises a reroll that cannot be served. The queue length is the
honest number, and over-promising is precisely what this respec exists to stop. It also means the
old collision guard is gone: the wildcard is excluded when the queue is *built*, so there is no
collision left to repair afterwards.

⚠️ **THE COUNTER USUALLY STARTS BELOW 5, AND THIS IS THE MAIN REASON IT EXISTS.** Relaxation stops
the moment it reaches `MIN_RESULTS` (3) and never tries for the 8 survivors a full queue needs.
Measured over every answer combination against the 134-row catalogue: **94% of quick-path and 89% of
hobby-path combinations start below 5, and more than half start at 0.** Before the counter, those
users saw three Reroll buttons where only one or two would ever work, and the rest vanished
mid-interaction. Do not "fix" the pool by raising `MIN_RESULTS` — that would bend more constraints
than the user asked, for the sake of a reroll they may not use. It is a **content** problem, and it
shrinks as the catalogue grows.

`scripts/verify-results-selection.mjs` CHECK D and E drive the real reducer, including a rapid
double-dispatch with no render in between, a small-pool run, and a pool of 3 where nothing renders.

**Rotation** pushes recently-shown activities down by multiplying their distance
(`ROTATION_DISTANCE_PENALTY`, 1.35). It touches a **sort key only** — the `matchPercent` on the
card stays the true distance. Never let the penalty reach the displayed number.

Its `recent_shown_*` key records the *originally* shown three, and rerolls do not touch it. Rerolls
happen inside one results view; that key is about what to push down on the user's **next** run.

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
  **What those numbers mean is defined in **The 7-axis rubric** above** — the order is an invariant,
  the rubric is the standard, and no option vector may be authored or edited without applying it.
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

## The 7-axis rubric — every vector is a rubric application

**This is the canonical scoring standard for all 7 axes, and it governs BOTH consumers: the quiz
option vectors in `data/personalityQuiz.ts` and the activity vectors in the seed SQL.** One standard,
two places it is applied. A vector that was not scored against this rubric is not a vector, it is a
guess — and guesses on either side of the comparison corrupt the match, because `rankActivities`
measures the straight-line distance between them and has no way to tell an honest 8 from a generous
one.

| Axis | 1 | 5 | 10 |
|---|---|---|---|
| **Social** | solitary by nature | works alone or with company | only exists as a group experience |
| **Energy** | completely still | light movement involved | physically demanding, sweat guaranteed |
| **Creative** | nothing is made or expressed | making within rules | open-ended making, the output is yours alone |
| **Analytical** | no problem-solving | systems or rules to learn | strategy, systems, or numbers at the core |
| **Outdoors** | strictly indoors | works either side of the door | defined by being out in nature and weather |
| **Novelty** | comfort and repetition | familiar shape, fresh content | a skill or world most people never touch |
| **Stimulation** | calming, meditative | pleasantly engaging | intensity, stakes, adrenaline |

⚠️ **The scoring principle: score the described behaviour, not its side effects.**

This is the rule that does the real work, and nearly every bad score in the original vectors broke
it. An option is not Stimulation-8 because doing it *feels exciting*; it is Stimulation-8 if the
behaviour described **is** intensity, stakes or adrenaline. "Get lost in a gripping story" is a
person sitting still — the excitement is a side effect of the fiction, not a property of the
activity, and scoring it high on Stimulation taxes every other axis it should have been measured on.
Same trap in the other direction: a pub quiz is Social because it is played in a group, not because
socialising happens to be stimulating.

Side-effect scoring is self-concealing. It never looks wrong on any single option — it only shows up
as one axis quietly winning a third of all answer paths, which is exactly how the imbalance recorded
below went unnoticed.

## Content pipeline — catalogue growth

Full pipeline doctrine (topic map, anti-clone rules, wave protocol) lands with wave 1. Recorded here
now because it is a **rubric** obligation rather than a pipeline one:

⚠️ **Wave 1 must audit the existing activity vectors against the rubric above and propose corrections
in its review file** — as proposals for review, not as silent edits. Those vectors predate the rubric
and were authored by Claude, so they are seed data to correct rather than user decisions to preserve.
The catalogue side of the comparison is worth exactly as much as the quiz side, and the quiz side is
being rebuilt on this rubric; leaving 37 activity vectors scored by an older, unwritten standard
would put a corrected quiz and an uncorrected catalogue on opposite ends of the same distance
calculation.

Note the count: the **canonical seed has 37 rows** (20 quick-fix, 21 long-term, 4 carrying both).
The live database still holds 33 until `supabase/step1-schema-rls-seed.sql` is re-run — see the
budget-filter entry under **Recently completed**. Audit all 37; the SQL is the source of truth.

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

⚠️ **THE PURIST TEST IS THE STANDING ACCEPTANCE GATE.** `scripts/analyze-quiz-balance.mjs` must be
run and must pass after **any** change to a quiz option vector, to a question, or to the scoring
itself. For each axis it answers every question with that axis's strongest option; if the resulting
user does not come out as that axis, the axis is effectively unreachable and something else is
riding along on its own best options. That check exits non-zero. The other four gates (floor,
ceiling, discrimination, tie rate) are reported rather than fatal, so a run mid-rebalance stays
useful while some are legitimately red.

The script imports `personalityQuestions` directly rather than regex-parsing the file, so the
questions cannot drift out of sync with it. **The argmax is still mirrored by hand** — it lives
inside a `"use client"` component and cannot be imported — so a change to
`determinePersonalityType` must be copied into the script. It is two lines and is quoted where it
is used.

⚠️ **The walk shares are a smoke alarm, never an optimisation target.** An uneven split is evidence
that something is mis-scored; it is not itself the defect, and flattening it by nudging scores is
scoring the report instead of scoring the behaviour. Vectors are re-scored against the rubric,
honestly, and the shares land where they land.

## Vector matching — `lib/matchActivities.ts`

`rankActivities(userVector, activities)` sorts activities by closeness to the user's 7-axis vector,
nearest first, decorating each with `distance` and `matchPercent` (the same way `app/page.tsx`
decorates with `score`).

⚠️ **Both sides of this comparison must be scored against **The 7-axis rubric** above.** The metric
is a straight-line distance between a quiz-derived vector and an activity vector, so it is only
meaningful if a 7 means the same thing on both. Nothing in the code can detect a drift in that
standard — a mis-scored vector produces a confident, wrong match percentage and no error anywhere.

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

⚠️ The wildcard no longer follows from this. As of 2026-08-26 it is drawn at random from the
pathway and obeys no filter at all — see **The wildcard obeys nothing** above. Anything in this file
dated 2026-08-25 that says the wildcard respects the hard filters is describing the old rule.

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

- ~~**Quiz vector balance is skewed.**~~ **Resolved 2026-08-26** by the rebalance — see **Recently
  completed**. Stimulation's 36.7% share is down to 8.4%, its floor from 2.88 to 1.50. Two ceiling
  gates remain red for a reason that is recorded and deliberate, below.
- ⚠️ **THE CATALOGUE IS NOW SCORED ON A DIFFERENT STANDARD FROM THE QUIZ.** This is the most
  important open issue in the file, and it was created by fixing the quiz.

  The rebalance re-scored all 33 quiz options against **The 7-axis rubric**. The 37 activity vectors
  were **not** touched, and they carry exactly the same side-effect inflation the quiz just had.
  `rankActivities` measures the distance between the two, so the two ends of every match now
  disagree about what a score means.

  It is already measurable. `verify-activity-matching.mjs` CHECK B has the Stimulation purist
  finding skateboarding at **rank 6, d=6.68** — before the rebalance it was d=4.90, a hair behind
  darts. The gap widened from nothing to 2.58, and the cause is visible in the row itself:
  `Skateboarding at a public park` is `[5, 8, 5, 3, 7, 6, 10]`, and that **Creative 5** is for an
  activity that makes nothing. Under the rubric it is a 1 or a 2. The corrected quiz now says
  Creative 1.13 for a Stimulation purist, so the uncorrected activity is pushed away by an axis
  that should never have separated them.

  Note what did *not* move: 6 of 7 purists find their own axis in the top 3, exactly as before. The
  headline count is flat while the underlying agreement got worse, which is the whole reason to
  read `d=` and not just the pass count. The matcher is fine and the orderings are sensible.
  **The fix is the wave 1 audit** — see **Content pipeline** — not another pass over the quiz.
- **Two ceiling gates are red, deliberately.** `Energy 6.88` and `Novelty 6.50` against a 7.0 gate.
  Not a scoring fault: a ceiling is the mean of the best option available per question, and Q3
  (spending £100) and Q4 (approaching a puzzle) contain no physical option, while Q1 (Saturday
  instinct) and Q4 contain no novelty-seeking option. Both **passed before only because of
  side-effect scores the rebalance removed**, so the gate is now reporting a hole the old numbers
  hid. Energy is one point short and Novelty four. ⚠️ **Do not close these by editing scores** —
  one arguable point exists (`Only if it's outdoors`, Energy 7→8) and taking it would clear Energy
  at exactly the size required, which is the behaviour the rebalance existed to remove. The fix is
  content: a physical option in Q3, a novelty-seeking option in Q1 or Q4 — the same move that took
  Creative from 6.25 to 7.00 when Q4 gained one.
- **Social is the new share outlier**, at 27.2% of paths. Recorded because the walk is a smoke
  alarm and it is worth reading, **not because it is a target**. Social's own average barely moved
  (4.09 → 3.96); it did not rise, everything else fell as side-effect points came off. Social was
  scored on described behaviour all along and has the widest honest range here (floor 1.12, ceiling
  8.25). Whether that is a defect or simply what these eight scenarios ask about is a question for
  a future pass, and it is **not** to be fixed by lowering Social scores that are individually
  correct.

## Recently completed

**Reroll fix and respec, 2026-08-26** (branch `reroll-fix`, **merge held for Owen's click-through**):

Diagnosed before anything changed. Four faults, and the severity order was the opposite of what it
looked like:

1. **Pool underflow was the dominant bug and fires constantly** — 94% of quick-path and 89% of
   hobby-path answer combinations start with fewer than 5 rerolls available, more than half with
   none, because relaxation stops at `MIN_RESULTS` (3) and never reaches the 8 a full pool needs.
   Three buttons, no counter, most of them dead.
2. **Stale-closure race**, reproduced by modelling the handler exactly: two rerolls in one React
   batch and the second silently reverts the first.
3. **Wildcard/reroll overlap** — guarded, but the guard compared against a closure value, and the
   wildcard sits inside ranks 4–8 about 6% of the time.
4. **Counter drift** — a symptom of (2), not a separate cause.

Fixed by `lib/rerollMachine.ts`, a pure reducer, plus a visible shared counter and a deterministic
rank 4→8 queue. `lib/resultsSelection.ts` lost `rerollPoolFrom` and its two constants — dead once the
queue moved — on the same reasoning that deleted `wildcardEligible`. `verify-results-selection.mjs`
CHECK D and E now drive the real reducer, including the rapid double-dispatch that used to lose a
rank. eslint errors in `app/page.tsx` fell 11 → 7 as four `any` state declarations disappeared.

**Vector rebalance, 2026-08-26** (branch `vector-rebalance`, **merge held until Owen has read the
report and taken the quiz**):

- **The 7-axis rubric** recorded as the canonical standard for both quiz options and activities,
  with the scoring principle that does the real work: *score the described behaviour, not its side
  effects.*
- `scripts/analyze-quiz-balance.mjs` rebuilt as an acceptance gate **before** any vector moved:
  hard-fail purist test, near-purist rate, floor/avg/ceiling, spread matrix, tie rate, and the walk
  shares labelled DIAGNOSTIC. It imports the questions now instead of regex-parsing them.
- Fifth Q4 option added, `Sketch your way in` — text and vector supplied, untouched. Q4's Creative
  spread was 1, the worst cell in the matrix; the question was missing a creative answer.
- **All 33 option vectors re-scored.** 231 scores reviewed, 38 moved by ≥ 2, no wording changed
  anywhere. Per-score reasoning in `data/vector-rescore-justifications.md`; before/after in
  `data/vector-rebalance-before.md` and `data/vector-rebalance-after.md`.
- **Gates: 4 of 5, up from 2 of 5.** Purist 7/7 throughout — it was a regression guard, and it never
  went red. Floors, tie rate and the Creative/Analytical ceilings all fixed. The two remaining red
  ceilings and the catalogue-drift they exposed are under **Known issues**, deliberately not forced.

The finding worth keeping: Stimulation had been acting as a general "this is exciting" tax on
options whose described behaviour is social, creative or entirely passive — worst case `Sink into a
story` at Stimulation 8, a person sitting still, where the tension belongs to the fiction and not to
the activity. Its share fell 36.7% → 8.4% without a single score being aimed at that number. Genuine
thrill was untouched (`Something that scares you a little` keeps 10) and one score was *raised*
(`Physical exhaustion`, 3 → 5), which is the check that this was a re-score and not a haircut.

**Quick wins, 2026-08-26** (branch `quick-wins`, **held back from `main` until Owen has clicked
through — `main` auto-deploys**):

- Thrill Seeker profile copy: "high arousal" → "You chase intensity and excitement". The clinical
  term was the only thing changed; the rest of the sentence stands.
- `lib/resultsSelection.ts` — new, pure, no React or Supabase, like `lib/matchActivities.ts`. Holds
  the wildcard draw (`wildcardEligible`, `availableWildcards`), the reroll pool (`rerollPoolFrom`)
  and `drawRandom`, whose `rng` is injectable so the dev script is reproducible and so the
  `Math.random()` call sits at module scope rather than in a component body (`react-hooks/purity`,
  same reason as `pickRandomOption`).
- The wildcard rule changed and reroll added — both documented under **Feasibility engine** above.
  `app/page.tsx` stopped holding results as one `recommendations` array ("the three, then the
  wildcard") and now names each part: `shownActivities`, `wildcard`, `rerollPool`, `wildcardPool`,
  `discardedIds`. Reroll would otherwise have had to mutate that array by position.
  ⚠️ **The reroll half of this was superseded the same day** — see the `reroll-fix` entry above. The
  five separate `useState`s described here are exactly what broke; they are now one reducer.
- **The budget exception was built, then dropped the same day** at Owen's instruction, along with
  the free-user guarantee in the test script. `wildcardEligible` was deleted rather than left as a
  pass-through: a filter function that filters nothing is exactly the dead code this project's tag
  doctrine exists to prevent.
- `scripts/verify-results-selection.mjs` — new. Imports the real functions and real questions.
  **CHECK A was inverted, not deleted, when the guarantee went**: it now asserts the candidate set
  IS the whole pathway pool and that a strictly-free user really *can* be handed a paid wildcard.
  "No filter" is invisible on a pool that happens to be all free, so without that second half a cost
  ceiling could creep back in and the run would still pass. Plus: the rule is in force (100% of
  quick and 99% of hobby combinations can draw a wildcard their own filters ruled out), exclusion
  over 9,459 draws, pool sizing, and 516 reroll runs. It deliberately does **not** re-implement
  relaxation; its pool-size histogram is therefore pre-relaxation and pessimistic.

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
