@AGENTS.md

# CLAUDE.md — Stay Interesting

Context for Claude Code sessions. Merged from Owen's project context file (2026-08-25).
Items marked **verified** were checked against the code at that point; the rest are as-reviewed
in chat and should be confirmed before you act on them.

⚠️ **The product is called "Stay Interesting". "Boredom Buster" is the old name**, superseded
2026-08-26 by the `landing-flow` branch. It survives in this file's history below and in the comment
headers of `supabase/*.sql`, which are records rather than UI and are left alone deliberately. It
must not appear on any user-facing surface — if you find one, that is a bug, not a leftover.

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
- `components/` — UI components (`PersonalityQuiz.tsx`, `TasteRadar.tsx`)
- `data/` — static data and logic (`personalityQuiz.ts`)
- `docs/` — `manual-test.md`, the standing click-through checklist. See **Manual testing** below.
- `lib/` — Supabase client, imported as `@/lib/supabaseClient` (the `@/*` → `./*` alias is in
  `tsconfig.json`) (verified). Also the pure logic modules: `matchActivities.ts` (ranking),
  `activityTags.ts` (the vocabulary), `feasibilityQuestions.ts`, `quizSession.ts`,
  `resultsSelection.ts` (the wildcard draw and `diverseSelect`), `selectionPipeline.ts` (the
  pathway filter, the hard filters, the relaxation ladder and the rotation penalty),
  `rerollMachine.ts` (the results reducer: the deterministic reroll queue, the shared counter,
  and the wildcard refresh), `radarGeometry.ts` (vector → SVG coordinates) and
  `personalityTypes.ts` (the 15-type classifier and its type table). Sibling imports in
  `lib/` use the explicit `./name.ts` extension so the dev scripts can import them under Node.
- `scripts/` — dev-only analysis tools, not part of the build. Seven of them:
  `validate-activity-seed.mjs`, `verify-activity-matching.mjs`, `verify-results-selection.mjs`,
  `verify-taste-radar.mjs`, `analyze-quiz-balance.mjs`, `measure-activity-diversity.mjs`,
  `audit-activity-reachability.mjs`
- `supabase/` — SQL to paste into the Supabase SQL editor. Not run by any CLI or migration
  tool; these are hand-run scripts, written to be idempotent so re-running is safe.

Note that `@AGENTS.md` above warns this Next.js version diverges from what you may have learned:
check `node_modules/next/dist/docs/` before relying on remembered App Router conventions.

## Working with Owen

1. Explain things in clear, beginner-friendly steps; define jargon the first time it comes up.
2. Say which files you're creating or editing, and why, before you do it.
3. Anything Owen must paste elsewhere (SQL for the Supabase SQL editor, env values) must be
   complete and self-contained — nothing left for him to guess.
4. Check your own work: run the dev server and `npx tsc --noEmit` after changes, plus the five
   `scripts/*.mjs` checks. When something breaks, diagnose step by step and explain the cause, not
   just the fix. Anything a script cannot see belongs in `docs/manual-test.md` — **extend it in the
   final stage of every feature branch**, see **Manual testing** below.
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
    **Run 2026-08-25: 37 activities seeded, every one with tags and a vector. Wave 1 took it to
    134 on 2026-08-26** (65 quick-fix, 76 long-term, 7 carrying both).
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
distance in SQL is available whenever ranking should move server-side. At 134 rows it still wins nothing
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

## One funnel (merged 2026-08-25, roadmap steps 3 + 4; hero added 2026-08-26)

Every visit walks the same path, in `app/page.tsx`:

```
hero -> personality quiz -> Bored/Hobby chooser -> feasibility questions -> ranked results
```

`FunnelStage` drives it:
`"loading" | "hero" | "quiz" | "chooser" | "questions" | "results"`.

**`"hero"` is a STAGE, not a route.** Its CTA sets `stage` to `"quiz"` and the quiz animates in
underneath on the same page — a `router.push` there would cost a navigation and lose the entrance.
Only a visitor with **no** session vector sees it; someone returning in the same tab opens on the
chooser, where the banner (below) stands in for it. See **Visual identity** for what the hero holds.

⚠️ **Two guards the hero depends on.** The persistent `<h1>Stay Interesting</h1>` is suppressed on
`"hero"`, because the hero sets the name itself and two of them read as a bug. And `restart()` —
which that `<h1>` invokes — falls back to `"hero"` when `quizSession` is null, so a visitor who has
not taken the quiz cannot be dropped onto a chooser with nothing to rank against.

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
time, in order: **place/setting → energy → time (widened one slot up the ladder)**.

⚠️ **RELAXATION IS SILENT, AND THAT IS DELIBERATE. Superseded 2026-08-28 (Owen's decision).**
This line used to read "the results page states exactly what was bent — relaxation is never silent",
and a blue banner on the results said so whenever the ladder had eased anything. **The banner is
gone, on all viewports.** It fired on roughly a third of all answer combinations - the measured
starvation rate - so for a third of users the first thing above their matches was an apology for
them.

⚠️ **THE MECHANISM DID NOT CHANGE AND MUST NOT BE "TIDIED" TO MATCH.** `selectSurvivors` still
eases place/setting, then energy, then time, in that order; cost and company still never bend;
`lib/selectionPipeline.ts` was not touched, still returns `bent`, and
`scripts/audit-activity-reachability.mjs` still reads it. What went is the disclosure UI only. A
future session finding no banner should not conclude the ladder is undocumented and add one back.

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
went: the relaxation banner named the wildcard as the exception to "your budget was left exactly as
you set them", and the empty state says "we will not **rank** something at you that costs more than
you said" rather than "we will not suggest".

⚠️ **Only the empty state carries that distinction now** - the relaxation banner was removed
2026-08-28, so the empty state is the single place the wildcard's budget exemption is spelled out.
It is therefore the one that must not lose it.

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

**Coverage today (re-measured 2026-08-26, after wave 1):** the quick path starts below 3 survivors
on **33%** of its 324 answer combinations (57 at zero), the hobby path on **34%** of 192 (31 at
zero). Before wave 1 those were 44% and 43% over a 20-activity pool; the catalogue tripling to 134
took roughly ten points off each, which is exactly the "it solves itself as the catalogue grows"
prediction being borne out. Still not a tagging fault — five simultaneous hard filters cannot do
much better — and relaxation absorbs it (no combination ends up empty at runtime).
`scripts/validate-activity-seed.mjs` reports it.
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
- **The profile classifier lives in `lib/personalityTypes.ts`**, moved out of the component
  2026-08-26 because the returning-visitor banner on `app/page.tsx` needs the title from a stored
  session. It was a seven-way argmax then; it is the 15-type mechanism now — see **The 15
  personality types**. The balance script **imports it**, and no longer mirrors anything.
- **A `building`-mode `TasteRadar` sits beside the question**, redrawing after every answer. Its
  vector is derived from the existing `selectedVectors` state — `totalsFrom` then
  `userVectorFromQuizTotals`, the same two functions the session write uses — so a **skip** reshapes
  it and **Back** rewinds it with no extra state and no special cases. `calculateFinalProfile` uses
  the same `totalsFrom`, so the shape drawn while answering cannot disagree with the finished vector.

## Visual identity — the radar is the product motif

Added 2026-08-26 (branch `landing-flow`).

**`components/TasteRadar.tsx` is the one visual idea this product has.** A 7-axis polygon, drawn
straight into SVG with no chart library, appearing four times in the funnel — and it is the same
component every time. It is what makes the 7-axis vector a *thing the user can see* rather than an
implementation detail they never learn about.

| Mode | Where | Treatment |
|---|---|---|
| `demo` | the hero | max 320px, labelled, autoplaying **all 15 personality archetypes** on a 2s loop |
| `building` | beside each quiz question; the returning banner | max 132px (72 in the banner), unlabelled, quiet |
| `final` | the profile card; the results type card | max 300px, labelled, vertex dots, optional axis highlight |

⚠️ **The hero's shapes are MEASURED, not illustrative** (changed 2026-08-27). They used to be four
hand-written vectors captioned with four of the seven real type names — shapes nobody could ever be
given, standing in for a taxonomy both larger than the demo implied and unrelated to it. Every one
is now a type's `archetypeTotals`: the most type-defining answer path the quiz can actually produce.
A visitor watching the hero is watching real outputs of the thing they are about to do.

⚠️ **No vector on the hero may be hand-tuned.** If two shapes read as near-twins, that is the
taxonomy reporting a real resemblance and the remedy is the play order or the taxonomy — never an
edited vector, which would put a polygon on the landing page the quiz behind it cannot produce.
Section (g5) of `analyze-quiz-balance.mjs` measures every resemblance.

⚠️ **The full cycle is 30 seconds**, so a typical visitor sees four or five of the 15. That is
arithmetic rather than a defect: the hero's job is to show that the chart measures something about
you, which one morph already does. Shortening the interval to fit all 15 into a glance makes each
shape too brief to read.

⚠️ **`mode` controls PRESENTATION, not where the data comes from.** The returning banner passes a
settled vector to `building` because it wants the small treatment, not because anything is still
being built. Do not add a data path to a mode.

### ⚠️ The radar is display-normalized: it draws SHAPE, never magnitude

Added 2026-08-26 after design review. `normalizeForDisplay` in `lib/radarGeometry.ts` scales every
vector by **one factor** so its largest axis lands at `DISPLAY_MAX_FRACTION` (0.92) of the radius,
with every ratio between axes preserved exactly. `polygonPoints` and `radarVertices` both apply it
internally, so no caller can forget and plot a raw magnitude next to six normalized ones.

**Why.** The user's vector is a running MEAN of their answers, and a mean of honestly-scored options
pulls every axis toward the middle of the option pool. Plotted raw, the shape therefore **shrank as
the quiz went on** — the more the user told us, the smaller their map got — and a finished profile
sat as a small blob near the centre. What a reader wants off a radar is which axes dominate, and
that is a matter of ratios, not of how large the numbers happen to be.

⚠️ **What it costs, stated plainly:** absolute intensity is no longer readable off the chart. A
gentle user and an intense one whose axes sit in the same proportions draw the same polygon.
Intensity is still information the MATCHER uses — it is exactly why Euclidean distance was chosen
over cosine similarity, see **Vector matching** — it just is not information this chart carries. If
it ever needs showing, that needs a second visual channel, not the removal of this normalization.

⚠️ **Nothing but the drawing may call it.** A normalized vector must never reach the session, the
profile argmax, or `rankActivities` — all three depend on the magnitudes it deliberately discards.

⚠️ **No clamping to 1-10 in that path, and this is load-bearing.** `normalizeForDisplay(2v)` has to
equal `normalizeForDisplay(v)`, and it cannot if doubling pushes an axis into a ceiling the original
never touched. No ceiling is needed anyway: dividing by the largest axis means nothing can escape
the chart by construction. The floor at zero stays, because a negative axis would plot through the
centre and turn the polygon inside out.

⚠️ **Consequences for what the chart can say.** A flat vector — all-1s, all-10s, anything even —
draws a **full even heptagon**, because it has no shape to show. That is also what the
"nothing answered yet" ghost is; it reads as an empty frame because it is FADED, not because it is
small. The old assertion "all-1s collapses to the centre" is superseded and was replaced in
`verify-taste-radar.mjs` rather than deleted.

### ⚠️ No numbers appear on the radar, in any mode

Axis names only: no value beside a label, no tooltip, nothing against the rings. A number on a
display-normalized polygon would be a number that does not mean what it looks like it means. The
accessible description names the two strongest axes rather than reading out figures, and the
gridline rings are **structure, not a scale** — there is no value a ring could stand for.

This is also why there is **no rounding anywhere in the radar at all**. `labelValue` was the one
rounding this module had, and it was deleted with the value labels. CHECK C of the verify script
fails the run if anything that formats a value for printing is exported again.

⚠️ **Axis labels need real room, and getting it wrong fails silently.** The chart is drawn in fixed
viewBox units and scaled by CSS, with `LABEL_SPACE` (84 units against a radius of 100) reserved
outside the ring. A label is anchored just past the ring and drawn OUTWARD, so too small a reserve
does not throw or warn — the text simply runs outside the viewBox and is clipped mid-word. It read
"imulation", "velty" and "Crea" at every size until it was measured in a browser. The widest label
is "Stimulation" at 11 characters; the two most horizontal axes sit at cos ≈ 0.975 of the ring.

⚠️ **All the maths is in `lib/radarGeometry.ts` and none of it is in the component.** `TasteRadar` is
`"use client"`, which means no dev script can import it — the geometry lives outside so
`scripts/verify-taste-radar.mjs` checks the real functions rather than a hand-copied mirror. Nothing
in the component may compute a coordinate.

**Morphs are interpolated with `requestAnimationFrame`, not with CSS.** This is not a stylistic
choice and should not be "simplified" back: **CSS cannot transition an SVG `<polygon>`'s `points`
attribute at all**, and transitioning a `<path>`'s `d` works only in Chrome and Firefox, so Safari
would hard-jump on every answer. `useAnimatedVector` eases the seven numbers directly.

⚠️ **It eases from wherever the last morph reached, not from the last settled shape.** Someone
clicking through the quiz faster than 600ms retargets mid-flight and the polygon changes course.
Restarting from the previous target would snap backwards on every fast answer. The effect also
depends on the target **serialised to a string**, because `target` is a fresh array every render and
the hook re-renders every frame — an array dependency would restart the animation forever.

**Reduced motion is honoured**, via `useSyncExternalStore` on `matchMedia`. That hook rather than
`useState` + `useEffect` for two reasons: it is what an external, React-doesn't-own-it source is for,
and its third argument supplies a server snapshot, so a statically prerendered page has an answer
without a hydration mismatch. Under reduced motion the shape snaps and the hero demo holds one shape.

**Palette: the radar is indigo** (`#6366f1` fill, `#4f46e5` stroke), the accent the personality quiz
already owned. Blue and green stay the Bored/Hobby pathway colours and **purple stays the
wildcard's** — the wildcard's "this card is deliberately different" signal is load-bearing, and the
badge copy depends on it reading as an exception.

## Viewport fit - the funnel holds one screen

Added 2026-08-28 (branch `viewport-fit`). **Every interactive stage - hero, personality quiz,
chooser, feasibility questions - fits one viewport, and the page itself never scrolls.** Results is
the one deliberate exception.

### Two shell regimes

`app/page.tsx` renders one of two shells, chosen by stage:

- **Fitted** (`loading`, `hero`, `quiz`, `chooser`, `questions`) - `h-[100dvh] overflow-hidden`, a
  flex column of pinned header / `flex-1 min-h-0` stage / pinned footer.
- **Scrolling** (`results`) - `min-h-[100dvh]`, ordinary document flow.

`dvh` and not `vh`, so a collapsing mobile URL bar cannot leave a stage short of the screen it was
sized against.

⚠️ **`overflow-hidden` is a BACKSTOP, not the fitting mechanism.** Clipping is a silent
failure - nothing throws, nothing warns, the content is simply not there, which is the same trap the
radar's axis labels fell into when `LABEL_SPACE` was too small and they read "imulation". What
actually absorbs a stage that does not fit is its options list being `flex-1 min-h-0
overflow-y-auto`: when everything fits it does nothing and no scrollbar appears, and when it does
not, the **list** scrolls and the page still does not. The small/landscape floor is therefore not a
separate code path - it is that one property showing up.

⚠️ **`min-h-0` is load-bearing on every flex child in the chain** (content wrapper -> stage
wrapper -> card -> options region). Without it a flex item refuses to shrink below its content, the
column grows past the shell, and the page scrolls again.

### ⚠️ Vertical density is keyed to HEIGHT, and getting that wrong is the mistake to avoid

Two variants in `app/globals.css`, since Tailwind's stock breakpoints are all horizontal:

```css
@custom-variant tall   (@media (min-height: 800px));
@custom-variant taller (@media (min-height: 1080px));
```

The first pass keyed padding, gaps and type to `sm`/`md`. That is the wrong axis for a fitting
problem and it failed in both directions: **a 1440x900 laptop is `md`-wide, so it took the roomiest
tier and Q4 overflowed by 151px**, and a landscape phone at 640x360 is `sm`-wide and would have done
the same with 360px of height to spend.

⚠️ **Never set the same property from both a width tier and a height tier.** The winner would
depend on which rule the compiler happens to emit later. Type SIZE stays on width tiers because it
decides line wrapping, which is a horizontal question - the one exception is the page's own `<h1>`,
two short words that never wrap, whose size is purely a question of vertical room.

⚠️ **A TIER IS ONLY CORRECT IF ITS FLOOR FITS.** `tall` was first set at 720 because 760
nearly fitted - which quietly signs a 720px window up for a density that overflows it by ~47px. 800
is where the middle tier's own shortest member clears Q4 with room, which is why a 1440x760 window (a
900px laptop screen once browser chrome is paid for) correctly takes the compact base tier.

### The binding case, and what it cost

**Q4 of the personality quiz - five options, one with a 111-character description - at 360x640.**
Everything else has slack; this does not. What paid for it, in order of size:

| lever | recovered |
|---|---|
| the big `<h1>` hidden below `sm`, wordmark takes the restart click | ~72px |
| the radar moved beside the question instead of above it | ~85px |
| the three hero chips fitting one row (`px-2`, `gap-1.5`) | 34px |
| option padding `p-3` -> `p-2.5`, gaps and band margin | 32px |

⚠️ **The chips are measured, not styled.** At `px-3` they came to 340px against the 321px a
360px phone leaves, so they wrapped to a second row. Widening the padding or lengthening a chip's
text puts that row back.

⚠️ **Nothing was truncated to achieve any of this.** No line-clamp, no ellipsis; every option
description is whole at every size. Compression is padding, gaps and type scale only.

### ⚠️ The hero radar cannot be shrunk to buy height

`demo` mode draws axis labels, so its viewBox is `(RADIUS + LABEL_SPACE) * 2 = 368` units around a
200-unit ring and the 11-unit label text scales with the box: ~9.6px rendered at 320px wide, ~7.2px
at 240, ~4.8px at 160. **Below roughly 280px the axis names stop being readable**, and the names are
the entire reason the hero shows a chart. It holds at 288px on a phone and the hero's height comes
out of the copy's type scale instead. The `building` and `final` instances have no labels and shrink
freely - that asymmetry is about labels, not about importance.

⚠️ **`TasteRadar` itself was not touched by any of this.** Its svg is `width="100%"` with the
per-mode `maxWidth` as a cap, so a `w-*` class on the existing `className` prop shrinks it and the
cap stops binding. Morph behaviour, the retarget-mid-flight rule and the reduced-motion path are all
unchanged.

### Scroll discipline

`window.scrollTo` on `[stage, isLoading]`. `isLoading` is in the deps because results arrive
asynchronously - resetting only on `stage` would run against the spinner and let the real list appear
wherever the user happened to be. The options lists carry their own scroll positions that the window
cannot reach, so each is reset by ref on `currentStep`.

### Results - a single vertical column, and the goal that was withdrawn

⚠️ **RESULTS ARE A VERTICAL LIST ON EVERY VIEWPORT, IN ONE CENTRED `max-w-2xl` COLUMN.**
Ranked cards stacked in rank order, 1st at the top, wildcard last. Owen's decision, 2026-08-28.

⚠️ **"DESKTOP RESULTS FIT ONE SCREEN" IS WITHDRAWN AS A GOAL.** Desktop results may scroll,
and that is fine. This is the part most likely to be "helpfully" undone, so the history is worth
having in full:

- `viewport-fit` built a `lg:grid-cols-3` row of the three ranked cards with the wildcard
  full-width beneath, widened the results wrapper to `lg:max-w-6xl` to hold it, and added a third
  badge-cap tier (`lg:max-w-32`) because a card in that grid is only ~330px wide - excluding the
  wildcard, whose 57-character badge stacked into a four-row cluster and grew that card to 300px
  when capped. It got the view from 238px over one screen to 87px over.
- The results amendment then took the last 87px by cutting content (the profile card became one
  line, the relaxation banner went), and it did briefly measure one screen at 1440x900.
- **All of that layout machinery is now gone**: no grid, no `lg:max-w-6xl`, no `lg:max-w-32`.
  Full-width cards on a wide monitor were never the point.

⚠️ **THE ONE-VIEWPORT RULE STILL HOLDS FOR THE INTERACTIVE STAGES** - hero, quiz, chooser,
questions. Only the results claim was withdrawn. Everything else in this section stands.

The render is now one plain `resultCards.map(...)`, which is also the safest form: `resultCardsOf`
returns `[...shown, wildcard]`, so the array index IS the rank that `rerollCard(index)` dispatches
on and that the medal helpers read. Do not sort or rebuild that list.

### The collapsed mobile header

Below `sm` the auth form is a single "Log in" button opening an absolutely-positioned panel, so it
costs the stage no height. ⚠️ **This fixed a pre-existing horizontal overflow**: two inputs, a
submit and a toggle in a non-wrapping row came to ~342px against the 328px a 360px phone leaves, and
inputs will not shrink below their intrinsic size.

Keyboard behaviour is left at Next's default `interactiveWidget: resizes-visual`, which does not
change `dvh` when the keyboard opens. `viewport-fit: cover` is deliberately NOT set: without it iOS
lays the content out inside the safe area, so `100dvh` already excludes the home indicator and no
`env()` padding is needed.

## Manual testing — `docs/manual-test.md`

⚠️ **`docs/manual-test.md` is the repo's ONE standing click-through checklist, and every feature
branch extends it in its final stage.** It is not per-branch and it is not a landing-flow document:
it is organised by feature area and accumulates.

It exists because the `scripts/` suite deliberately stops at the maths. Those scripts import the real
modules and check what can be checked without a browser — rankings, filters, the reroll reducer, the
radar geometry. What they cannot check is whether the thing on screen matches the thing in state:
whether a button appears, whether a shape moves, whether the copy states the rule that is actually in
force. Splitting it that way is why `verify-taste-radar.mjs` checks vector→polygon mapping and the
running average but says nothing about whether the morph looks smooth.

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

Target: **~500 activities, 300 quick-fix and 200 long-term**, grown in reviewed waves. Wave 1 landed
2026-08-26 and took the canonical seed from 37 to 134.

### The campaign — 134 → ~500, recorded 2026-08-28

Owen's stated plan for getting there, written down before wave 2 was authored so it survives the
fresh session each wave gets. **The target and the per-wave gates are the contract; the wave
numbers below are a route, not a promise.**

**Target: ~500 activities, ~300 quick-fix and ~200 long-term.** A row carrying **both** pathway
tags counts toward **both** — so the two figures do not sum to the total, and never will.

**Baseline, measured 2026-08-28 against the canonical seed:** **134 rows — 65 quick-fix, 76
long-term, 7 carrying both.** Remaining from there: **+235 quick-fix and +124 long-term.**

**After wave 2, 2026-08-28: 190 rows — 99 quick-fix, 99 long-term, 8 carrying both.**
Remaining: **+201 quick-fix and +101 long-term.** ⚠️ The two pathways are now level at 99 each
against a 300/200 target, so waves 3+ must lean quick-fix harder than the nominal 2:1 to close it.

⚠️ **The catalogue is currently long-term-heavy and the target is quick-heavy.** 65/76 today
against 300/200 wanted. That is why waves are weighted **~2:1 quick-fix to long-term after their
gap fills** — the ratio is corrective, not decorative, and a wave that ignores it makes the gap
worse rather than merely not better.

**Cadence.**

- **Wave 2 = starvation repair (~65)**, not even topic coverage. Aimed at the tag intersections
  measured at or near zero rather than spread across the topic map.
- **Waves 3+ = bank-drain (~85 each)** from `data/activity-idea-bank.csv` until the target.
- ⚠️ **ONE WAVE PER SESSION, IN A FRESH SESSION, AND OWEN REVIEWS BETWEEN EVERY WAVE.** Never two
  waves without a review in between — the existing wave protocol says this and the campaign does
  not relax it. Authoring 85 rows consumes a session's attention; two waves in one is how the
  second gets the thinner pass.
- **Stop at ~500**: the last wave trims to land near target and reports the final composition.

**Per-wave gates — every wave, no exceptions.** The first five are machine-checked by
`scripts/build-wave.mjs` and `scripts/validate-activity-seed.mjs`; the rest are reported for a
human call, deliberately, because a machine cannot tell a genuine duplicate from a shared word.

1. Closed vocabulary, **exactly one cost tier** — hard failure.
2. Completeness: a company tag, a place tag, a pathway, a time tag per pathway carried, and a
   setting tag on anything long-term — hard failure.
3. Rubric-scored vectors, 7 integers in 1–10 — the shape is a hard failure, the honesty is not
   checkable and is the reviewer's job.
4. Fuzzy title dedupe against the **whole** existing catalogue and all prior waves — reported.
5. Anti-clone caps: max 2 per template family per wave, 5–8 delightfully-specific rows.
6. Same-cell additions **≥ D apart** from each other.
7. House-voice descriptions.

⚠️ **D-AWARE AUTHORING — a gate wave 1 did not have, and the reason it is new.** Every new row
within `DIVERSITY_MIN_DISTANCE` (**3.0**) of any existing catalogue row **in the same pathway** is
reported by `build-wave.mjs`. **It stays only if it fills a starved cell its neighbour does not.**

The reasoning is `diverseSelect`, which landed after wave 1 was authored: the greedy re-rank skips
a candidate that only restates one already picked, so a same-cell twin is a row **the results page
will never show anybody**. Authoring one is not redundancy, it is wasted work that also makes the
distance distribution worse — see **Why D = 3.0**, where the whole argument for the threshold is
that it prunes a thin tail. A wave that fattens that tail is quietly moving D out from under
itself.

⚠️ **Never bend an activity's tags to fit a starved cell.** A candidate belongs in a cell because
its honest tags already put it there. A cell that cannot be filled honestly is **reported as
unfillable**, not papered over — the same doctrine that says a tag no filter reads must not exist.

**After each wave's SQL is confirmed run against the live database**, re-run the starvation report,
the axis histogram and `scripts/audit-activity-reachability.mjs`, and append the deltas to that
wave's entry under **Recently completed**. Starvation and reachability are both functions of pool
size and pool shape, so every wave moves them, and a row that goes dark does so silently.

### ⚠️ Which starved cells a wave may spend itself on — Owen's ranking, 2026-08-28

A wave holds ~65 rows against 166 plausible starved cells, so **the map is confirmed ranked and
capped, never wholesale**. Confirming it wholesale would be confirming something no wave can
deliver. The rule is encoded as `PRIORITY_RULES` in `scripts/lib/starvation.mjs` and printed by
`scripts/report-starvation.mjs`, so it is re-runnable rather than a decision recorded once in prose.

| | Cells |
|---|---|
| **P1** | quick-fix: `free` + `solo` + `inside` at any time or energy; `free` + `couple`/`social` at any place. Long-term: `free` or `low-budget` + `1-2-hours-week` + `at-home`; `free` + `facility` or `social` |
| **P2** | every remaining `free`-ceiling cell, in severity order — 0 survivors before 1 before 2 |
| **P3** | everything else — **deferred, not dismissed**: the standing queue for waves 3+ |

⚠️ **A "don't mind" place answer counts as core traffic.** The rule names inside and outside; a
starved "don't mind" cell is one where BOTH are starved at once, since its pool is their union.
Reading the rule literally would rank the worst cells lowest.

⚠️ **DEGENERATE MEANS "NO HONEST ACTIVITY COULD EXIST THERE", NOT "NONE CURRENTLY DOES."** Applied
that way on 2026-08-28 the list came back **empty**, and that is a finding rather than an omission:
every question in both funnels asks an independent fact about someone's circumstances, so no
combination is self-contradictory and every starved cell is a real person. `LOW-FREQUENCY` is the
band that has members — coherent, answerable, and worth filling last. If a future session finds
`CELL_RULES` carrying no degenerate rule, that is the measurement, not a gap.

⚠️ **Verify the cost-ceiling accounting before trusting any starvation map.** A `free` row must
count as a survivor in the low-budget and no-limit cells too. `report-starvation.mjs` checks it by
holding every other answer fixed and widening the ceiling: the count must never fall. Non-free
starved cells are **not** evidence of a broken ceiling — they are cells empty at any budget, and
money cannot buy an activity the catalogue does not contain.

**Targeted generation is capped at ~15 rows per wave.** A bigger shortfall is not a licence for
volume generation: stop, and report the gap per cell so Owen can commission a directed top-up bank.

### The wave protocol — every wave, in this order

1. **Tooling first, if anything is missing.** A wave that cannot be measured should not be authored.
2. **Author into `data/waves/wave-N.json`** — one row per activity: title, tags, vector, description.
   This is the single source of truth for the wave.
3. **`node scripts/build-wave.mjs N`** renders `data/waves/wave-N-review.md`. **Then STOP for Owen's
   veto pass.** Nothing touches the seed SQL or the database before that.
4. **On approval**, put the struck titles in the wave file's `vetoed` array, re-render, then append
   the survivors to `supabase/step1-schema-rls-seed.sql` and hand Owen **one idempotent SQL block**
   (`node scripts/build-wave.mjs N --sql`). Commit.
5. **Never run two waves without a review in between.**
6. **Run `node scripts/audit-activity-reachability.mjs` after the wave lands.** See
   **Activity reachability** below. Starvation and darkness are both functions of pool size and
   pool shape, so every wave moves them — and a row that goes dark does so silently: nothing
   errors, nothing warns, the activity simply stops being recommended.

⚠️ **The review file and the SQL are rendered from the same JSON, deliberately.** There is no step
where rows are retyped, so what Owen approves is byte-for-byte what reaches the database. Do not
hand-edit the wave rows in the seed SQL — edit the wave file and regenerate, or the two drift apart
and the review stops meaning anything.

⚠️ **The SQL block needs TWO statements to be idempotent.** The seed's `insert ... where not exists
(a.title = w.title)` only ever inserts, so vector corrections to existing rows need a match-by-title
`update` beside it. Both are re-runnable.

### Waves 2+ — draw from the idea bank, do not invent

**`data/activity-idea-bank.csv`** (395 rows, 250 quick-fix / 145 long-term, 20 topics) is the source
of ideas. Expand a chosen row's `concept` into a house-voice description; **generate new ideas only
if the bank runs dry of a needed pathway**. Every other wave rule is unchanged: fuzzy dedupe,
closed-vocabulary tags with exactly one cost tier, rubric-scored vectors, review file, Owen's
approval, one SQL block.

Wave sizes and the remaining gap are set by **The campaign** above — ~65 for wave 2, ~85 for waves
3+, against a remainder re-measured at **+235 quick-fix and +124 long-term** on 2026-08-28. The
bank holds 250 quick-fix and 145 long-term, which is close enough to that remainder that **it will
not stretch to cover careless drawing**: a wave that takes long-term rows it did not need spends
supply the campaign has no slack in.

⚠️ **Each row records the bank title it came from**, in a `bank` field on the wave JSON
(`"generated"` when it is not from the bank). `build-wave.mjs` cross-checks every prior wave and
fails if a title is drawn twice — five waves across five fresh sessions, each re-reading the same
395-row CSV, is exactly the situation where that happens unnoticed.

**The topic map**, drawn from evenly — ⚠️ **except where a wave is repairing starvation**, in
which case the starved cells choose the topics and the map is a tiebreaker, not the brief:

| Quick-fix | Long-term |
|---|---|
| kitchen quick-wins · move-your-body · tidy-and-sort · learn-or-drill · observe-and-identify · social micro-acts · repair-and-restore · make-something-small · plan-and-dream · calm-and-recover | crafts & making · food drink & fermenting · growing things · sport & training arcs · strategy & mind games · collecting & culture · tech & maker · music & performance · outdoor pursuits · clubs community & volunteering |

### Anti-clone rules — hard

- **Max 2 entries per template family per wave** ("polish X", "memorise X", "organise X"…).
  `build-wave.mjs` counts these and flags any family over the cap. ⚠️ The detector reads the first
  word of the title, **and the titles are ours** — renaming `Build a blanket fort` to `Blanket fort`
  to get under the cap is gaming the check, not passing it.
- **Fuzzy-dedupe every candidate** against the whole existing catalogue and all prior waves.
  Reported, never auto-dropped: a high score can be a real duplicate or just a shared word.
- **5–8 entries per wave must be delightfully specific** — the biro-sketching tier: quirky, but
  startable this week by an ordinary person in the UK.
- **Nothing needing rare gear, animals, or licences.** Anything with real physical risk gets
  find-a-class framing or gets cut. (Wave 1 examples: Olympic lifting, parkour and kite surfing are
  all framed as coached; scuba is a certification arc.)

### What wave 1 learned, worth not relearning

- **The catalogue carried the same side-effect inflation the quiz did.** 24 of the 37 seeded vectors
  needed correcting. The clearest was `Blind taste test whatever is in the cupboard` at Stimulation
  9 — a party game, not adrenaline — which was one of only two Stimulation-dominant rows.
- ⚠️ **Stimulation is the real content gap: 3 rows out of 134.** Social is thin too at 9%. The
  curated keep list was overwhelmingly solo and calm, and correcting the fictional Stimulation
  scores made the gap visible rather than causing it. **Waves 2+ should weight hard toward social
  and high-stakes content.**
- **Analytical is not "this is an intellectual activity".** Wave 1's first pass had Analytical
  dominant on 40% of the wave because observation, memorisation and recall were being scored as
  problem-solving. The rubric asks whether strategy, systems or numbers are *at the core*. 79 rows
  were re-scored; it landed at 28%.
- **Vocabulary gap, unresolved:** there is no setting tag for "out in the town". `Sketch buildings
  from a bench` is tagged `at-home` + `in-nature`, which is a fudge. Not adding a tag — the doctrine
  is that a tag no filter reads must not exist — but if waves 2+ bring more urban-outdoor
  activities, this becomes a real hole in the hobby path's setting question.

### The live database — wave 1 confirmed present, 2026-08-26; ⚠️ wave 2 NOT yet run

⚠️ **The seed SQL holds 190 rows as of wave 2 (2026-08-28) and the live database holds 134.** They
are out of step until `supabase/wave-2-activities.sql` is pasted into the Supabase SQL editor. That
file is idempotent and carries both the 56 new rows and the two tag corrections in **one** block —
see the mobility-work warning in the wave-2 entry for why those must not be separated. The
verification queries are at the bottom of the file: expect **190 rows, 0 missing_vector**.

The **canonical seed SQL is the source of truth**, and `content-wave-1` was
merged into `main` on 2026-08-26 so the repo matched what was deployed at that point. This section
previously said the live database still held 33; that is out of date.

**Verified**: the results page, which reads `activities` straight from Supabase, served
`A round of disc golf` and `A blacksmithing taster day` — rows that exist only in wave 1. So wave 1
has been run.

⚠️ **Not verified: the exact row count, or whether the 24 vector corrections landed.** Only that
wave-1 inserts are present. If it matters, this settles it in the Supabase SQL editor:

```sql
select count(*) as rows,
       count(*) filter (where vector is null) as missing_vector
from public.activities;
-- expect 134 rows, 0 missing_vector
```

Both `supabase/step1-schema-rls-seed.sql` and `supabase/wave-1-activities.sql` are idempotent, so
re-running either is safe if the count comes back short.

## The 15 personality types — `lib/personalityTypes.ts`

Added 2026-08-27 (branch `personality-types`). Replaces the seven-way switch on the dominant axis.

**Seven pure axes, seven named hybrids, one All-Rounder.** The old profile discarded the second
axis entirely: someone at Analytical 52 / Novelty 50 got the same card as someone at Analytical 52 /
Novelty 13, and the thing that actually distinguished them was thrown away.

### The rule, in the order the cases are tested

```
1. top1 - min  <= F  ->  The All-Rounder
2. top1 - top2 <= H  and the unordered {top1, top2} pair is NAMED  ->  that hybrid
3. otherwise         ->  the pure dominant axis
```

**`H = 3`, `F = 8`, on the RAW SUM scale.** Both were measured, not chosen because they felt right —
section (g) of `scripts/analyze-quiz-balance.mjs` sweeps every candidate across the full
81,920-path walk and prints what each does to all 15 shares.

⚠️ **THE THRESHOLDS LIVE ON THE RAW-SUM SCALE, WHICH IS A FUNCTION OF THE QUESTION COUNT.** Eight
questions today. Adding a ninth silently changes what H and F mean — both have to be re-measured,
not carried over.

**Why H = 3.** H is the dial between mostly-pure and mostly-hybrid: 23.1% hybrid at H=2 up to 42.6%
at H=5. Three keeps every type between 1.4% and 18% of paths, and it is the largest value at which
pure Stimulation — already the thinnest axis in the catalogue at 3 rows of 134 — holds 3.79% rather
than being swallowed by its own hybrids. At H=5 it falls to 2.20%.

**Why F = 8.** F does one thing: it sets the All-Rounder's share, taking from everything else
proportionally. 8 puts it at 1.40% (1,144 of 81,920) — rare enough to land as a real finding,
common enough that the copy is not written for nobody. F=6 gives 0.32%, F=10 gives 3.77%.

**The seven named pairs, in frequency order**, and ⚠️ **chosen by frequency, not by which sounded
good** — they are simply the most common top-two pairings the quiz produces, which is what stops
the taxonomy containing a type nobody can reach:

| pair | title | share |
|---|---|---|
| Social + Novelty | The Group Chat Instigator | 6.62% |
| Analytical + Novelty | The Rabbit-Holer | 5.35% |
| Social + Stimulation | The Games Night Menace | 4.62% |
| Novelty + Stimulation | The Say-Yes-First | 3.97% |
| Social + Analytical | The League Secretary | 3.81% |
| Energy + Stimulation | The Hard Session | 3.15% |
| Outdoors + Novelty | The Detour-Taker | 3.06% |

The seventh slot was a genuine tie — Outdoors + Novelty and Social + Energy sit 27 paths apart out
of 81,920 — and went to Outdoors + Novelty on the grounds that it is the only candidate carrying
Outdoors, so all seven axes appear somewhere in the hybrid set.

⚠️ **ONLY THE TOP-TWO PAIR IS CONSULTED.** If `{top1, top2}` has no name but `{top1, top3}` does and
is also within H, the answer is the pure type. That keeps "your close second" meaning the actual
second. If a named hybrid ever becomes unreachable, widening to "the highest-scoring named partner
within H" is the lever — but the gate will say so first.

⚠️ **`classifyTotals` TAKES ITS CONFIG AS AN ARGUMENT, and that is load-bearing.** Choosing H and F
is a measurement problem, so the sweep has to run the shipping rule against non-shipping
thresholds. Parameterising it is what lets the script import the real classifier instead of
mirroring it — see **Personality quiz scoring** for why a mirror was untenable here.

### The archetypes — what the hero draws

Every type carries `archetypeTotals`: the single most type-defining vector the quiz can produce for
it, as **raw sums**. Section (g4b) of the balance script computes them and prints them paste-ready.

⚠️ **THE SEARCH IS CONSTRAINED TO PATHS THAT ACTUALLY CLASSIFY AS THAT TYPE**, and leaving that
constraint out is a live trap that was hit during the build. The unconstrained "largest margin"
search knows nothing about H, so it can return a path whose top two are further apart than H
allows — the Novelty + Stimulation winner was exactly that, top two 4 apart against H = 3, which
the real classifier calls pure Novelty. On the hero that is a shape advertised under a name the
quiz never produces it for.

⚠️ **Raw sums, not averages, and that matters twice.** The radar normalises before drawing, so the
scale is irrelevant to the picture — but the gate feeds these straight back through
`determinePersonalityType`, and H and F live on the raw-sum scale. Averaged, that check would
silently compare against the wrong thresholds.

### ⚠️ The voice standard — the standing rule for all user-facing personality text

- **2–3 sentences.**
- **Exactly one** concrete, picturable scene.
- **Exactly one** gentle cost or shadow clause.
- **British-casual** register.
- **Banned:** "thrive", "whether it's", "deep satisfaction", "unleash", "dive into", "passion for",
  consecutive sentences opening with "You", and **any claim the type's own axes do not support**.

That last clause does the real work, and it is the one no script can check. The Detour-Taker sits at
Energy 18, so its copy cannot promise anything strenuous however well it would read; The League
Secretary sits at Outdoors 11, so nothing outdoors. Section (h) of the balance script reports the
mechanical checks — banned phrases, sentence count, consecutive "You" — as **non-fatal notes**,
because the copy is Owen's and his edits are final. A gate that failed the build over his prose
would be the wrong instrument.

The two exemplars that set the bar, both of which became real types:

> **The Rabbit-Holer** (Analytical + Novelty): "You don't have hobbies so much as current
> investigations. One documentary and suddenly it's 1 a.m., you're fourteen tabs deep, and you could
> give a short talk on Victorian canal law. The catch: last month's obsession is already gathering
> dust behind you."

> **The Games Night Menace** (Social + Stimulation): "You'd never miss a games night — mostly
> because you intend to win it. You like your evenings loud, your scores kept properly, and your
> friends slightly competitive-afraid. Losing gracefully is a skill you're still, technically,
> developing."

⚠️ Note the second exemplar opens two consecutive sentences with "You", which its own standard bans.
It is Owen's copy, left exactly as written, and the script reports the clash rather than failing on
it. Recorded here so nobody "fixes" it silently.

### Where the type appears

Three places, all reading the same table:

- **The profile card** at the end of the quiz — `components/PersonalityQuiz.tsx`, large radar
  beside title and copy.
- **The results page** — ONE QUIET LINE, "Matched to <title>". Title only: no description, no
  radar, no eyebrow, on every viewport. **Changed 2026-08-28 (Owen's decision)**; it was a full
  bordered card with the eyebrow "Ranked against", the description and a `final` radar. Deliberate
  repetition: the user met their type, then answered nine more feasibility questions, and by the
  time the matches appear the profile that produced every match percentage has scrolled out of
  sight. ⚠️ What the full card got wrong was where it spent the space — on a phone it pushed
  the first match most of a screen down, and attribution only needs to NAME the profile. The full
  payoff stays on the quiz profile card, where it was earned. Rendered **only when there is a session** — with storage blocked there is no vector,
  nothing is ranked, and claiming a personality type would be inventing one.
- **The returning-visitor banner** on the chooser — title only.

`TasteRadar` gained `highlightAxes`, honoured in `final` mode only: the contributing axes get a
heavier label in the accent colour and a slightly larger vertex dot. Two for a hybrid, one for a
pure type, none for the All-Rounder. ⚠️ **Emphasis, never information** — no number appears, and the
polygon is exactly the polygon it would be without it.

## The selection pipeline — `lib/selectionPipeline.ts`

Added 2026-08-27. The pathway filter, the hard filters, the **graceful relaxation ladder** and the
rotation penalty, moved verbatim out of `findMatches` in `app/page.tsx`.

⚠️ **A MOVE, NOT A REWRITE.** Nothing about the behaviour changed. `app/page.tsx` keeps the Supabase
fetch and the `sessionStorage` reads and calls into this.

**Why it moved.** `app/page.tsx` is `"use client"`, uses `@/` aliases and contains JSX, so no dev
script can import a line of it — and the relaxation ladder lived in the middle of it. The one piece
of logic deciding what a user is allowed to see had never been checked by anything, and
`verify-results-selection.mjs` says so outright: it deliberately does not re-implement relaxation,
so its pool sizes are pre-relaxation and pessimistic. The reachability audit cannot be written
without the ladder at all, and hand-copying it would have produced an audit of a pipeline that is
not the one that runs.

⚠️ **Three details a well-meaning rewrite gets wrong**, all of which change the results:

1. **Each pass re-filters `pool`, never the shrinking `survivors`.** Relaxing has to be able to
   bring rows back; re-filtering survivors can only remove more.
2. **Constraints mutate cumulatively** across ladder steps. Bending place and then energy leaves
   both bent.
3. **A `widenTime` returning `null` does not count as a change**, so the step pushes no label.
   (Since 2026-08-28 nothing renders `bent` to the user, but the reachability audit reads it and
   reports it, so an honest label still matters.) Claiming to have bent something already at the
   top of the ladder is a lie in the copy.

Side effect worth knowing: the pre-existing eslint error count in `app/page.tsx` fell **7 → 6**,
because `applyAll(candidates: any[])` went with the move.

## Activity reachability — `scripts/audit-activity-reachability.mjs`

Added 2026-08-27. **Report only, always exits 0, proposes nothing.** Writes
`data/activity-reachability.md`. **Run it after every content wave** — see the wave protocol.

**The question nothing else asks.** Every other dev script checks that the machinery is correct.
None asks whether there is any user at all for whom a given row comes out well enough to be shown.
An activity can be perfectly tagged, perfectly scored, and sit permanently behind better-fitting
neighbours for every possible person — and nothing notices, because nothing errors.

- **Users:** all 81,920 achievable quiz answer paths. Every totals vector is distinct, so nothing
  is sampled and there is nothing to dedupe.
- **Earned:** inside the top 8 — the 3 ranked cards plus the 5 rerolls behind them.
- **Baseline:** the whole pathway pool with no constraints. ⚠️ On the quick path that pool is
  **synthetic** — its company question has no don't-mind option, so a fully unconstrained quick
  cell is not reachable. That is the right baseline anyway, because MERIT-DARK is a question about
  **fit alone**; feasibility is handled separately by the witness search over the 516 real cells.
- **Bands:** EARNED-OFTEN (≥1% of users) / EARNED-RARELY / MERIT-DARK (no user at all).

⚠️ **MERIT-DARK IS NOT INVISIBLE.** Everything stays wildcard-reachable **by construction** — the
wildcard draws at random from the raw pathway pool and obeys no filter, no ranking and no budget
answer. A dark row is one that never wins a slot *on fit*. That is a content observation, not a
fault, and what to do about one is not the script's call.

⚠️ **WHICH REGIME IT MEASURED — AND WHY THAT NUMBER IS ALREADY A LOWER BOUND.** The run is
**fit-only, with no `diverseSelect`**. `result-diversity` merged the same day, so the greedy
diversity re-rank **is** live and these numbers describe the pipeline as it stood immediately
before that merge. A pass that skips near-duplicates pulls different rows into the earned-8, so
some of what is listed as dark may not be. The generated report states its own regime in its
header, so a stale copy cannot be mistaken for a current one.

⚠️ **Teaching the script about `diverseSelect` is not a one-line change**, which is why it was not
done in passing. "Earns a slot" stops being *fewer than 8 survivors are closer* — a plain count —
and becomes *survives the greedy pass into the first 8*, which has to be run per (cell, user)
rather than reasoned about arithmetically. Every early exit in the witness search depends on that
count, so they need rebuilding too. **Outstanding work, and the dark list should not be acted on
before it is done.**

**The witness search** is cheap for two reasons worth keeping: the relaxed survivor set depends on
the **cell, not the user**, so it is computed once per cell; and **any cell with ≤ 8 survivors is
an immediate witness** for everything in it, because there are not enough rows to fill the slots.
Median relaxed pool is 6 (quick) and 7 (hobby), so most searches end on their first cell. Ties count
in the row's favour, which can only ever find *more* witnesses — so anything still called fully dark
really is.

**First run, against the 134-row seed, fit-only:** 24 MERIT-DARK rows (6 quick-fix, 18 long-term),
of which **3 are fully dark** — no real cell and no achievable user places them in the earned 8:

| activity | best placing ever | nearest competitor |
|---|---|---|
| Build a mechanical keyboard | rank 9, one short | 2.00 — Fermenting and kombucha brewing |
| Sport lockpicking | rank 13 | — |
| Build a cardboard automaton | rank 21 | — |

All three are long-term, and the keyboard is one slot short. **Nothing has been done about them —
that is Owen's decision.**

## Personality quiz scoring

The profile in `lib/personalityTypes.ts` is determined from the **raw per-axis sums**, never the
rounded averages, and nothing in the path rounds at all — see the note below on the vector tiles
that were the last consumer of rounding, and were deleted.

Judging on the rounded averages collapsed distinct scores onto the same integer and left **58% of
all answer paths tied** at the top. `determinePersonalityType` breaks ties with `indexOf`, so every
one of those went to whichever axis sat earliest in the `traits` array — `Social` at index 0 was
winning most of its results on array position, and `Stimulation` at index 6 could never win a tie at
all. Judging on the raw sums drops the tie rate to 10%.

Two consequences to keep in mind:

- Don't reintroduce rounding, bucketing, or any other precision loss upstream of the argmax. It
  silently re-creates the tie problem.
- Axis order is still a real tiebreaker, but it bites in fewer places since the 15-type
  mechanism landed. **An exact tie between two axes whose pair is NAMED now resolves into that
  hybrid** rather than being handed to whichever axis sits earlier in the list — a tie is a gap
  of 0, which is inside H. Order still decides among **unnamed** tied pairs, and it still decides
  which of two equal second-place axes becomes the partner. Reordering `AXES` in
  `lib/matchActivities.ts` therefore still changes results without touching a vector.

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
questions cannot drift out of sync with it. **It now imports the classifier too** — that used to be
mirrored by hand, because the argmax lived inside a `"use client"` component; it moved to
`lib/personalityTypes.ts` in the landing-flow branch, and the 15-type mechanism made the copy
untenable. A hand-mirrored rule carrying hybrid thresholds and a named-pair table would not fail
loudly when it drifted, it would print confident, wrong share tables. **Nothing in that script
mirrors production any more.**

⚠️ Section (g) sweeps candidate thresholds that are *not* the shipping ones. It does that by
passing a different `ClassificationConfig` to the same imported `classifyTotals` — never by
reimplementing it. That is the whole reason the classifier takes its config as an argument.

⚠️ **TYPE REACHABILITY IS THE SECOND STANDING GATE**, added with the 15 types. Section (h) of the
same script fails the run if any of the 15 has no answer path that produces it, and again if any
stored `archetypeTotals` classifies as a type other than its own. Both are hard: a taxonomy quietly
containing a card nobody can be dealt gets copy written, reviewed and shipped with nothing behind
it, and a mis-classified archetype puts a shape on the hero that the quiz cannot produce. Neither
shows up on screen as an error.

⚠️ **The purist test must keep judging the dominant AXIS, not the type.** It is tempting to point it
at `determinePersonalityType` now that the type is the real output — don't. At H = 3 a purist path
can legitimately be a hybrid (the Energy purist comes out Energy 55, Stimulation 50), so a
type-based purist test would be testing the hybrid thresholds rather than guarding the vectors.

⚠️ **The walk shares are a smoke alarm, never an optimisation target.** An uneven split is evidence
that something is mis-scored; it is not itself the defect, and flattening it by nudging scores is
scoring the report instead of scoring the behaviour. Vectors are re-scored against the rubric,
honestly, and the shares land where they land. **The 15-type shares are the same kind of number** —
diagnostic, never a target.

## Result diversity — the greedy re-rank

Added 2026-08-26 (branch `result-diversity`). `diverseSelect` in `lib/resultsSelection.ts`.

**Fit ranks. D de-duplicates ideas. The wildcard stays chaotic.** Those three sentences are
the whole design.

`rankActivities` sorts by distance from the **user** and has no way to see that two
activities are near-identical to **each other**. So a cluster that suits someone ranks
adjacently, takes all three slots, and the reroll queue behind it serves more of the same.
`diverseSelect` walks the same fit order and skips a candidate that only restates one
already picked.

```
pathway filter -> per-question filter actions -> rank by vector -> diverseSelect -> top 3 + queue
```

- The best-fitting candidate is **always** taken — fit is still what ranks.
- After that, the first candidate at least **D** from **every** pick so far.
- If nothing qualifies, **relax** and take the best remaining by fit. A slot is never left
  empty to protect the rule, and it never returns fewer than asked while candidates exist.

⚠️ **One pass produces both the three slots and the reroll queue.** `app/page.tsx` hands the
re-ranked list to `initRerollState`, which already takes `slice(0, 3)` as the cards and ranks
4–8 as the queue — so "every reroll is the next best distinct idea" needed **no change to
`lib/rerollMachine.ts` at all**. The deterministic order, the shared counter and the pinned
badge cluster are untouched.

⚠️ **A single forward pass IS the algorithm**, and the reason is worth keeping: eligibility
only ever shrinks. A candidate rejected for sitting too close to some pick stays too close to
it forever, because picks are only added. So nothing can become eligible again, there is
nothing to re-scan for, and the relaxation tail is a plain "take what is left in fit order" —
once one relaxed pick is made, every later slot relaxes too. That is also why the output is
**two monotone runs, not one**; `verify-results-selection.mjs` CHECK F3 asserts stability
within each phase, and asserting a single global subsequence would be asserting that
relaxation does not exist.

⚠️ **Not applied on the no-vector path.** With storage blocked there is no fit order to
re-rank, and the page tells the user in as many words that these are "not in any particular
order". A greedy pass would impose one and make that sentence false.

⚠️ **Skipped is not deleted.** Passed-over activities stay in `pool`, so they remain
wildcard-eligible and return to the ranked slots the moment the answers or constraints
differ. **The wildcard is untouched** — it is drawn from the raw pathway pool by
`availableWildcards`, which this never enters. Chaos is its diversity.

### Why D = 3.0 — both halves

**(i) The measurement.** `scripts/measure-activity-diversity.mjs` — report only, always exits
0, takes `--seed <path>`. Pairs are computed **within each pathway**, since an activity is
only ever ranked against its own pool. Run 2026-08-26 against the 134-row wave-1 catalogue
(the one that contains the named twins) and the 37-row canonical seed:

| catalogue | pathway | pairs | p1 | p5 | p10 | median | share below 3.0 |
|---|---|---|---|---|---|---|---|
| 134-row, **now canonical** | quick-fix | 2080 | 1.73 | 3.00 | 3.74 | 8.00 | **5.0%** |
| 134-row, **now canonical** | long-term | 2850 | 2.45 | 3.87 | 4.80 | 9.43 | **2.1%** |
| 37-row, the seed before wave 1 | quick-fix | 190 | 2.00 | 3.61 | 5.10 | 9.33 | 3.7% |
| 37-row, the seed before wave 1 | long-term | 210 | 3.16 | 4.36 | 5.66 | 9.17 | 1.0% |

At the time D was chosen the 134 rows lived on the unmerged `content-wave-1` branch and were read
out of it with `--seed`. `content-wave-1` was merged the same day, so the canonical seed **is** that
catalogue now and the dev scripts measure the same rows the report did.

D = 3.0 sits **exactly on the quick-fix 5th percentile** and the long-term 2nd. It prunes the
tail of true twins and leaves the body of the distribution alone — nowhere near the 10–15%
line at which a threshold stops de-duplicating and starts thinning the catalogue.

Named pairs it merges: `Restore a cast iron skillet` ↔ `Restore a vintage typewriter` (2.45),
`Playing pool` ↔ `Darts or table tennis` (2.65), `Hiking and hillwalking` ↔ `Trail running
and hillwalking` (2.65), `Chess puzzle rush` ↔ `EV market analysis` (2.83), `Kickabout at the
nearest bit of grass` ↔ `Knockabout on a public court` (2.00). Named pairs it keeps apart:
`Indoor bouldering` ↔ `hillwalking` (9.27 and 9.75), and every walking pair except the two
hillwalks.

**One D, not two.** Long-term is genuinely more spread out than quick-fix (median 9.43 vs
8.00), but all three candidate values land inside the p1–p10 band on **both** pathways: the
distributions differ in spread without disagreeing about where the tail ends. A second
constant would be a second thing to keep true.

**(ii) The geometry.** By the reverse triangle inequality, for any user U and any two
activities A, B: `| d(U,A) − d(U,B) | <= d(A,B)`. So two activities within D of each other
can never differ by more than `(D / MAX_DISTANCE) * 100` match points **for any user
whatsoever** — at D = 3.0 against `MAX_DISTANCE = 9 * sqrt(7) ≈ 23.81`, a ceiling of **12.6
points**. Showing both spends a slot on information the user already has, and the one
diversity passed over was never much better than the one they got. That is also why small
`matchPercent` gaps between the three shown cards are correct rather than a ranking bug.

### ⚠️ The known limit: taste twins, not category monotony

**D measures the taste profile, not the surface category, and the motivating example is
mostly the latter.** On the canonical seed the four core walking activities sit **5.39 to 8.89**
apart — genuinely different profiles that happen to suit the same person — so an Outdoors
purist still sees several walks, and that is D working correctly, not failing. Exactly one pair in
the whole seven-strong walking family falls below D: `Hiking and hillwalking` ↔ `Trail running and
hillwalking`, at 2.65.

**What it does remove is real, though.** Measured before and after for the Outdoors purist on the
134-row catalogue, three of the fit-only top 8 are near-duplicates and all three go:

```
fit only                                        diverse
1. A round of disc golf                         1. A round of disc golf
2. Walk somewhere with a view   (2.45 from 1)   --- dropped
3. A walk with no destination                   2. A walk with no destination
4. Find five constellations                     3. Find five constellations
5. Walk a street you have never walked          4. Walk a street you have never walked
6. Identify trees by their bark (1.73 from 4)   --- dropped
7. Knockabout on a public court                 5. Knockabout on a public court
8. Identify garden birds        (2.00 from 4)   --- dropped
                                                6-8. three genuinely new ideas
```

The spotting cluster (constellations / trees / birds) collapses to one, and one of the four walks
goes with it. `verify-results-selection.mjs` CHECK F4* reports the surviving walking count as a
**diagnostic that never fails**, so this limit stays visible instead of being assumed away.

If category monotony shows up in practice, the remedy is a **family tag** — deliberately not
built now. ⚠️ Note it would have to satisfy the tag doctrine: a tag that no hard filter reads
must not exist, so it would need the filter shipped in the same change.

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
37-row table and **should be revisited before the catalogue grows**, not after. Wave 1 took it to
134 on 2026-08-26 — still comfortably inside stage (A), but the ladder is now a visible distance
rather than a hypothetical one, and the target is ~500.

**The scaling ladder.** Three stages, in order. **The metric never changes at any stage** — it is
Euclidean distance throughout, in JavaScript and later in Postgres. Do not let a stage change
introduce a change of meaning.

**(A) Now — `select *` plus JavaScript filtering is correct.**
`findMatches` fetches the table and filters in JS. At 134 rows that is still the right answer: one round
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

**Coverage starvation mostly solves itself — and wave 1 is the evidence.**
The starvation rates were a function of pool size, not of the tag design. Tripling the catalogue to
134 took them from 44% / 43% down to **33% / 34%** without a single re-tag, which is the prediction
confirmed rather than merely asserted. They should keep falling as the catalogue grows — which is
exactly why the seed was never padded with hand-written filler. Keep running the coverage report;
at scale it is the only way to see the sparse corners at all.

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

  **Corrected in the seed SQL by wave 1** (2026-08-26): 24 of the 37 rows were re-scored, including
  skateboarding's phantom `Creative 5` → 1. ⚠️ **Still live in the database** until
  `supabase/wave-1-activities.sql` is run — until then the deployed app is matching a corrected quiz
  against an uncorrected catalogue.

  Note what did *not* move: 6 of 7 purists find their own axis in the top 3, exactly as before, and
  the Stimulation purist still sees none. That is now a **content** gap rather than a scoring one —
  3 Stimulation-dominant rows out of 134 — and it belongs to waves 2+.
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

**Content wave 2 — starvation repair, 2026-08-28** (branch `wave-2`). **56 new activities and 2 tag
corrections, taking the canonical seed from 134 to 190 rows — 99 quick-fix, 99 long-term, 8 carrying
both.** Approved by Owen at both gates. Full campaign context under **The campaign** above.

⚠️ **NOT YET RUN AGAINST THE LIVE DATABASE.** `supabase/wave-2-activities.sql` is written and
idempotent but has to be pasted into the Supabase SQL editor by hand. Until it is, the deployed app
serves 134 rows and the two mis-tagged rows are still mis-tagged. The post-run ritual — starvation
report, axis histogram, `audit-activity-reachability.mjs` — is **outstanding** and its deltas belong
in this entry once Owen confirms the run.

- **Aimed at starvation, not at topic coverage**, and it is the first wave with the instrument to do
  that. `scripts/report-starvation.mjs` and `scripts/lib/starvation.mjs` were built first.
- **Quick starved cells 106 of 324 → 11 (33% → 3%), 57 zero-cells → 7. Hobby 66 of 192 → 14
  (34% → 7%), 31 zero-cells → 3.** On Owen's ranking: **P1 60 cells → 9, P2 21 → 4 with none left at
  zero, P3 91 → 12.**
- ⚠️ **EVERY P1 AND P2 CELL WAS A `free`-CEILING CELL, SO EVERY ROW IN THE WAVE IS `free`.** That
  was not a stylistic choice and it is not a precedent for waves 3+ — it fell out of the map. The
  paid bands are largely untouched and are where wave 3 has to spend.
- **55 of 56 rows came from `data/activity-idea-bank.csv`**, each recording its source title in a
  `bank` field that `build-wave.mjs` cross-checks against every prior wave. **One row was
  generated** — `An obstacle course built from the furniture` — because the bank has no honest free,
  indoor, hour-long, group physical activity and that cell was P1 at zero. The ~15-row generation
  allowance was otherwise unused.

⚠️ **THE MOBILITY-WORK TAG CORRECTION MUST NEVER BE APPLIED ON ITS OWN.** Both corrections drop
`exertion`: `Ten minutes of mobility work` and `A walk with no destination` (which also gains the
`couple` and `social` tags its two sibling walks already carried). Measured individually, un-tagging
the mobility row **makes starvation worse — 57 zero-cells to 65** — because it is the only
ten-minute indoor exertion row in the catalogue and removing the tag empties that intersection
outright. It is only safe alongside the indoor-movement content, which is why both statements ship
in **one** SQL block with the wave rows. If anyone ever re-derives this correction and applies it
as a tidy-up on its own, they will regress the quick path and nothing will report it.

- **The evidence for the audit is the repo's own convention, not taste.** Checked across all 134
  seeded rows, `exertion` and the Energy axis agreed everywhere except exactly two rows, both at
  Energy 4, when every other tagged row is Energy 5+ and no row at Energy 7+ lacks the tag. Two
  further walks were proposed and **withdrawn** at Energy 5 and 6 — inside the convention, and
  cutting them would have been scoring the report rather than the behaviour. That cross-check is now
  a permanent non-fatal section of the review file and reports clean over all 190 rows.
- **Eight rows were vetoed by the D-aware gate before Owen saw them**, each within 3.0 of a
  neighbour and adding no starved cell that neighbour already served; two of them (`One full cuppa
  outside`, `Speed-walk the supermarket run`) filled zero starved cells at all. They are named with
  reasons in the wave file's `vetoed` array rather than deleted.
- ⚠️ **`Age a hedge by counting its species` was un-vetoed by Owen and the gate still flags it.**
  The arithmetic is right — all 6 of its cells sit inside the north-finding row's 16 — and the
  override is on two grounds the gate cannot see: **spark-tier charm outranks D-economy, and the
  rotation penalty gives same-cell twins repeat-visit value a single-run distance cannot measure.**
  It will keep printing as a VETO CANDIDATE, which is correct. **Do not re-apply the gate to it.**
- **Thirteen vectors were re-scored on a second rubric read** after the same-cell report caught
  eight pairs of genuinely different activities scored lazily alike on a fast first pass. Two were
  the side-effect error the rubric exists to catch (`Animal walks across the living room` at
  Stimulation 6 because it is a hard workout; `Relearn the cartwheel` at 7 because it feels daring).
  Afterwards no two new rows on a shared pathway sit within 3.0 of each other.
- **D = 3.0 is healthier after the wave, not strained**: the share of quick-fix pairs it merges fell
  **5.0% → 2.4%**, nowhere near the 10% line at which a threshold stops de-duplicating and starts
  thinning. The closest surviving pairs are all pre-existing seed rows.
- **Axis balance: Social 12 → 22, Outdoors 16 → 29, Energy 17 → 30.** All seven dev scripts pass.

### ⚠️ The brief for wave 3

Three things, and the first is the one that will not fix itself.

1. **Stimulation is still 3 rows of 190 (1.6%), and wave 2 could not have moved it.** It is
   relatively *worse* than before because the denominator grew. This is structural rather than an
   oversight: genuinely Stimulation-dominant activities — competition, stakes, adrenaline — are
   overwhelmingly **paid facility** activities (squash, padel, BJJ, fencing, karting, climbing
   competitions, a quiz league with a fixture list), and every one of those was P3. Starvation
   repair and the Stimulation gap pulled in opposite directions and starvation won. The wave does
   carry the free ones that exist (`Chase a parkrun personal best` at Stimulation 8,
   `Storytelling and spoken-word nights` at 7) but both are honestly dominated by Energy and
   Creative. ⚠️ **Do not close this gap by raising Stimulation scores** — that is precisely the
   inflation the `vector-rebalance` branch existed to remove. Close it with content.
2. **The low-budget facility band is now the place to spend.** P1 and P2 are largely cleared, so
   wave 3 can afford it — and it is the same content that fixes Stimulation, which is the one place
   in this campaign where the axis gap and a cell gap point at the same rows.
3. **The residual cells, all of which are on the standing queue.** Four zero-cells at
   `half a day / get me moving / staying in` on the paid tiers — in practice a leisure-centre
   session: badminton, a swim, a climbing wall. The other six residual zero-cells are the
   `LOW-FREQUENCY` band (free indoor half-day exertion; a club meeting at your house in weekend
   blocks) and are correctly filled last, not never.

**Results layout correction, 2026-08-28** (branch `results-layout`, **merged into `main` and
deployed 2026-08-28 on Owen's instruction**). Supersedes the "three cards in a row on desktop" half
of the viewport work.

⚠️ **THIS LANDED AFTER OWEN'S CLICK-THROUGH, NOT BEFORE IT.** His sign-off earlier the same day
covered the funnel up to and including the results-page amendment; this change came afterwards and
has not been walked on a device. It is a layout reversal rather than new behaviour, and the four
measured sizes are recorded below, but the checklist's section R was rewritten for it and has not
been run.

- **Results are a single centred vertical column on every viewport**, `max-w-2xl`, ranked cards in
  rank order with the wildcard last. The `lg:grid-cols-3` grid, the `lg:max-w-6xl` results-only
  wrapper width and the `lg:max-w-32` badge-cap tier are all gone. Owen's decision.
- ⚠️ **"Desktop results fit one screen" is withdrawn as a goal.** Desktop results may scroll.
  **The one-viewport rule for hero, quiz, chooser and questions is unchanged** - re-verified at
  360x640, 390x844, 1440x760 and 1440x900, all still `pageY=0`, `pageX=0`, no internal scroll.
- **Everything the fitting work bought is kept**: the density pass, scroll-to-top on entering
  results, the pinned top-right badge cluster, full descriptions, the one-line type attribution,
  and the reroll counter above the cards.
- **Measured**: at 1440x900 and 360x640 the four cards stack in one column at 672px and 321px
  respectively, in the order 1st > 2nd > 3rd > Wildcard, badges pinned top-right on all four, page
  lands at `scrollY=0`, and card one is fully visible (bottom at 350px of 900, and 451px of 640).
- The render went back to one `resultCards.map(...)`; the `rankedCards`/`wildcardCard` split existed
  only to feed the grid and was deleted with it.
- `npx tsc --noEmit` clean, `next build` clean, all four routes still statically prerendered, all
  seven dev scripts pass, lint held at the 6 known errors in `app/page.tsx`.


**Results-page amendment, 2026-08-28** (branch `results-amendments`, **merged into `main` and
deployed 2026-08-28 on Owen's instruction — the click-through had NOT happened first**). Two
changes, both Owen's decisions, both reversals of things this file previously argued for - so the
reasoning that is now superseded is recorded beside them rather than deleted.

**CLICK-THROUGH BACKLOG CLEARED, 2026-08-28.** Four branches had shipped ahead of it —
`result-diversity`, `personality-types`, `viewport-fit` and this one — leaving
`docs/manual-test.md` extended four times and run zero. Owen has now walked the app and confirmed
he is happy with everything to this point, which retires that backlog in one go.

⚠️ **WHAT THAT APPROVAL DOES AND DOES NOT COVER.** It covers the funnel as it behaves and looks
on a real device: the viewport work, the one-line attribution, the absent relaxation banner. It is
an approval of the shipped result, NOT a line edit — in particular nobody went through
`data/personality-types-review.md` making changes, so the 15 type descriptions are **approved as
written rather than revised**. That is a materially different thing from "reviewed and edited", and
the distinction is worth keeping if the copy is ever reopened.

- **Type attribution is one line.** "Matched to <title>", centred, `text-sm`, slate-500, on every
  viewport. No description, no radar, no card. It was the full payoff repeated - eyebrow, title,
  copy and a `final` radar - which on a phone cost ~141px and pushed the first match most of a
  screen down. The quiz profile card is untouched.
- **The relaxation disclosure banner is gone**, all viewports. ⚠️ **The ladder is completely
  unchanged**: same constraints, same order, cost and company still never bend, and
  `lib/selectionPipeline.ts` was not edited at all. `relaxedConstraints` state was deleted from
  `app/page.tsx` because with nothing rendering it, it was write-only - the same reasoning that
  deleted `wildcardEligible` and `rerollPoolFrom`.
- **The true-empty state stays**, and is now the ONLY place the wildcard's budget exemption is
  spelled out. It is not disclosure - it is the only thing between the user and a blank page.
- ⚠️ **Both changes remove information the user previously got.** A user whose location
  answer was eased is no longer told so; they simply get three cards. That is the accepted trade -
  recorded here because it is exactly the kind of thing a future session would otherwise "fix".
- **Measured after, on the real page.** On a phone at 360x640 the results page went from **1216px
  of scroll to 784px**, and the first ranked card became **fully visible without scrolling** (196px
  to 451px inside a 640px screen), which is what the amendment was for - and that still holds.
  Desktop results also briefly measured one screen at 1440x900 with zero overflow; that goal was
  **withdrawn on 2026-08-28** along with the desktop grid, so the figure is history rather than a
  property to preserve.
- `npx tsc --noEmit` clean, `next build` clean, all four routes still statically prerendered, all
  seven dev scripts pass, lint held at the 6 known errors in `app/page.tsx`.


**Viewport fit, 2026-08-28** (branch `viewport-fit`, **merged into `main` and deployed 2026-08-28 on
Owen's instruction — the click-through on a real phone had NOT happened first**). Full design under
**Viewport fit** above.

⚠️ **THE NUMBERS BELOW PROVE GEOMETRY, NOT LEGIBILITY — AND THE LEGIBILITY HALF HAS NOW BEEN
CHECKED SEPARATELY.** Every measurement here came from driving Chrome and reading `scrollHeight`
against `innerHeight`. That says nothing about whether `p-2.5` option cards with `text-xs`
descriptions are comfortable at arm's length, whether a 64px radar still reads as a shape, or
whether 288px of hero radar has legible axis labels on a phone rather than in a 288px iframe on a
desktop monitor. Owen confirmed all of that by hand on 2026-08-28. **Keep the two kinds of evidence
distinct**: if the density is ever tightened again, the headless sweep will keep passing and will
not notice.

- **Every interactive stage now fits one viewport with no page scroll**, verified by driving Chrome
  against the dev server and asserting `scrollHeight <= innerHeight` and `scrollWidth <= innerWidth`
  at 360x640, 390x844, 320x568, 640x360, 1440x760/799/800/900/1080 and 1512x982, plus `/quiz` at
  five of those. Q4 - five options, the longest description in the quiz - is clean at every size at
  or above 360x640, with no internal scroll either.
- ⚠️ **The first pass keyed vertical density to `sm`/`md`, which is the wrong axis**, and
  measuring is what caught it: a 1440x900 laptop took the roomiest tier and overflowed by 151px.
  Rebuilt on `tall`/`taller` min-height variants. The threshold then had to move 720 -> 800, because
  a tier is only correct if its own shortest member fits.
- ⚠️ **The hero radar has a hard floor of ~280px** - its labels scale with the viewBox - so the
  hero buys its height from the copy's type scale instead. Recorded because it looks like an obvious
  thing to shrink.
- **A pre-existing horizontal overflow was fixed**: the inline auth form was ~342px against 328px at
  360px wide, on every stage. It collapses to a "Log in" button below `sm`.
- **Desktop results in one screen: 238px over -> 87px over.** Later reached zero via the results
  amendment, and then **withdrawn entirely as a goal on 2026-08-28** when the desktop grid was
  removed and results went back to a single vertical column. Kept here as history only.
- **Nothing was truncated anywhere.** No line-clamp, no ellipsis, no removed option description; the
  one piece of readable text that is hidden below 800px of height is `/quiz`'s own subtitle, which is
  that page's preamble rather than any part of the quiz.
- `npx tsc --noEmit` clean, `next build` clean, all four routes still statically prerendered, all
  seven dev scripts pass, lint held at the 6 known errors in `app/page.tsx`.
- `components/TasteRadar.tsx` and everything in `lib/` are **untouched** - this is layout only, which
  is why the whole dev-script suite is a pure regression check here.


**15 personality types, a 15-shape hero, and the reachability audit, 2026-08-27** (branch
`personality-types`, **merged into `main` and deployed 2026-08-27 on Owen's
instruction — the click-through and the copy edit pass had NOT happened first; see the note
at the end of this entry**). Full design under **The
15 personality types**, **The selection pipeline** and **Activity reachability** above.

- **Measured before anything was built.** Section (g) of `analyze-quiz-balance.mjs` sweeps H, F and
  all 21 candidate pairs across the 81,920-path walk, so H = 3 and F = 8 came off the tables rather
  than out of the air. The 7 named pairs are simply the 7 most frequent.
- **`classifyTotals` is parameterised over its config**, which is what lets the sweep run the
  shipping rule against non-shipping thresholds instead of mirroring it. That closed the last
  hand-mirror in the script — see **Personality quiz scoring**.
- **Two new hard gates** in section (h): all 15 types reachable, and every stored archetype
  classifies as its own type. Both pass. The purist test still judges the dominant AXIS, on purpose.
- ⚠️ **The archetype search had to be constrained to correctly-classified paths**, and finding that
  out was the one real trap in the build: the unconstrained Novelty + Stimulation winner has its
  top two 4 apart against H = 3, so the real classifier calls it pure Novelty. Unconstrained, the
  hero would have drawn it under the wrong name.
- ⚠️ **Two archetypes that share no axis draw nearly the same polygon** — Social ↔ Stimulation at
  0.540 and Energy ↔ Stimulation at 0.597, against a flag of 0.60 calibrated on the four shapes the
  hero previously shipped. Both involve Stimulation, whose most dominant achievable path
  `[36, 34, 17, 26, 18, 37, 53]` carries high Social, Energy and Novelty alongside it, so normalised
  it reads as a Social shape. **Reported, not fixed** — this is the known Stimulation thinness
  showing up in a new place, and no vector was touched. The other 20 flagged pairs all share an
  axis, which is the chart being honest.
- ⚠️ **A greedy re-ordering of the hero cycle was built and then removed.** Ordering the 15 shapes
  farthest-next cut adjacent flagged pairs 2 → 1 but made the *minimum* adjacent gap worse
  (0.552 → 0.448), because greedy saves the similar shapes for last. Fixing it properly is a max-min
  Hamiltonian cycle, which is unrequested machinery for a problem the brief asked to have reported.
  The cycle ships in table order; `shapeDistance` in `lib/radarGeometry.ts` survives as the
  measurement. ⚠️ It is **not** `euclideanDistance` — that measures taste on raw magnitudes, this
  measures appearance after normalisation has discarded them.
- **The reachability audit found 3 fully dark rows**, all long-term, and the mechanical keyboard is
  **one slot short** at rank 9. Confirmed by an independent brute force using the real
  `rankActivities`. Nothing proposed about them.
- `data/personality-types-review.md` is **rendered from `PERSONALITY_TYPES`**, so what Owen approves
  is byte-for-byte what the lib holds — the wave protocol's no-retyping discipline.
- eslint errors in `app/page.tsx` fell **7 → 6** with the pipeline extraction. `npx tsc --noEmit`
  clean, `next build` clean, all four routes still statically prerendered, all seven dev scripts pass.
- **Untouched by instruction:** `data/personalityQuiz.ts`. No option vector moved, and the two
  deliberately-red ceiling gates report exactly what they did before (Energy 6.88, Novelty 6.50).
- **The 15 type descriptions in `PERSONALITY_TYPES` shipped as first-pass copy and were approved
  as written, 2026-08-28.** `data/personality-types-review.md` was rendered for Owen's edit pass;
  that pass never happened as a line edit, and he signed the product off with the copy as it
  stands. ⚠️ **So it is approved, not revised** — no sentence in that table has been through the
  voice standard as an editing pass, and the exemplars under **The voice standard** are still the
  only copy in the product that demonstrably meets it. Reopening the table is a low-risk one-file
  commit whenever anyone wants to.


**Result diversity, 2026-08-26** (branch `result-diversity`, **merged into `main` and deployed
2026-08-27 on Owen's instruction, without the click-through**). Full design under **Result diversity** above.

- `scripts/measure-activity-diversity.mjs` — new, report only. Built and run FIRST, so D came
  out of the catalogue's actual distance distribution rather than a number that felt right.
- `diverseSelect` + `DIVERSITY_MIN_DISTANCE = 3.0` in `lib/resultsSelection.ts`, wired in
  `app/page.tsx` with a single `ordered -> selected` substitution. `lib/rerollMachine.ts`
  unchanged.
- `verify-results-selection.mjs` CHECK F: planted twin cluster, graceful degradation,
  determinism and phase-stability, and the relaxation invariant over 14 purist × pathway runs
  on the real seed.
- ⚠️ **The measurement contradicted the brief's motivating example, and that is recorded
  rather than smoothed over.** Walking variants are 5.39–7.87 apart, so they are not taste
  twins and D leaves them alone. What it actually removes for an Outdoors purist is the spotting
  cluster — constellations / trees / birds — plus one of the four walks: three of the fit-only top
  8. See **The known limit** above. CHECK F4* reports the surviving walking count as a permanent
  non-failing diagnostic.
- `landing-flow` was merged into `main` at the start of this branch (not pushed) — the brief
  assumed it already had been.

**Landing flow and visual identity, 2026-08-26** (branch `landing-flow`, **merged as `947a9b3`**;
the "merge held" note this entry used to carry was true when written and went stale on the merge):

- **The hero.** A new visitor used to land on question 1 of the personality quiz — eight abstract
  scenarios asked of someone who had not been told what the site does. `"hero"` is now the opening
  `FunnelStage`, holding the name, a promise naming both intents, the mechanism in one sentence,
  three expectation chips, and one CTA that changes stage rather than route.
- **`components/TasteRadar.tsx`** and **`lib/radarGeometry.ts`** — the motif and its maths, split so
  a dev script can import the half worth checking. See **Visual identity** above for the three modes
  and the rules that govern them.
- **The quiz narrates itself.** A building radar reshapes on every answer, on skip, and rewinds on
  Back — all of it derived from `selectedVectors`, so no new state and no special cases. Questions
  slide in from the direction of travel.
- **The profile card gained its payoff**: the large labelled radar beside the title, filling the hole
  the rebalance left when it deleted the numeric vector tiles.
- **The returning banner** replaces the hero for a visitor who already has a vector: mini radar,
  profile title, one retake link. The standalone retake beneath the chooser cards is now the
  storage-blocked fallback only — `writeQuizSession` fails silently, so the chooser really can be
  reached with `quizSession` null and no banner to hold the link.
- **`lib/personalityTypes.ts`** — `determinePersonalityType` extracted verbatim so `app/page.tsx`
  can read a profile title from a stored session.
- **`totalsFrom` added to `lib/matchActivities.ts`** and adopted by `calculateFinalProfile`, so the
  running average the radar draws and the totals the session stores are literally one code path.
- **`scripts/verify-taste-radar.mjs`** — 19 pass/fail checks over geometry and the display
  normalization (scale invariance, ratio preservation, flat vectors, nothing escaping the ring), the
  running average (including the rewind, and the every-option-visibly-moves-the-shape property a
  skip depends on — re-measured on the NORMALIZED polygon, which is the harder test), and the
  absence of any number-formatting export.
- **Design-review amendments, same day**: the hero mechanism sub-line reworded; the radar
  display-normalized with all numbers removed from it (see **Visual identity**); the results-card
  badge cluster pinned top-right on every card.

  ⚠️ **The badge cluster is pinned with flex, not `absolute`.** The review asked for absolute
  positioning; measuring at 375px in a browser showed why it cannot work here. An absolutely
  positioned cluster does not contribute to the card's height and cannot reserve a width for itself,
  and the WILDCARD card breaks it outright — its badge is a 57-character sentence, so its cluster is
  166px tall against a 56px header and would lie across the description. The header is instead a
  non-wrapping row: `shrink-0` plus `max-w-32` fixes the cluster's corner and lets it wrap
  internally, `min-w-0 flex-1` gives the title the rest. Verified at a 371px viewport: cluster inset
  25px from top and right on all four cards, 12px clear of the title, description clear of both.

  The `max-w-32` and the `text-lg` title below `sm` are **measured, not guessed**. The longest
  catalogue title ("Learn a two-player card game neither of you knows", 49 characters) runs to 8
  lines and a 224px header if the cluster takes 168px, against 4 lines and 118px at 128px.
- **`docs/manual-test.md`** — new, backfilled from this file's feature records and then extended
  with the landing flow. See **Manual testing** above.
- **Rename**: `app/layout.tsx` metadata went from "Create Next App" to "Stay Interesting" plus a real
  description. That was the last user-facing trace of the old naming.
- Lint held at the pre-existing 7 errors, all in `app/page.tsx`; `TasteRadar.tsx` adds none. The five
  dev scripts and `next build` all pass, and every route is still statically prerendered.
- Untouched by instruction: `data/personalityQuiz.ts` and `scripts/analyze-quiz-balance.mjs`. No
  option vector moved, and the balance gate reports exactly what it did before (4/5, purist 7/7,
  Energy 6.88 and Novelty 6.50 still red).

**Reroll fix and respec, 2026-08-26** (branch `reroll-fix`, **merged as `2f3ac23`**; the
"merge held" note this entry used to carry was true when written and went stale on the merge):

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

**Vector rebalance, 2026-08-26** (branch `vector-rebalance`, **merged as `bbd4d88`**; the
"merge held" note this entry used to carry was true when written and went stale on the merge):

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
  (That disclosure was removed 2026-08-28 - see **Graceful relaxation** above. The ladder stayed.)
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
