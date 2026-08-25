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

## Database (Supabase)

- Standard email/password auth.
- `activities`: `id`, `title`, `description`, `tags` (text array). **Planned:** a 7-axis `vector`
  column — storage format undecided (`int[]` vs `jsonb`); decide with Owen before adding it.
- `saved_activities`: `user_id`, `activity_id`.
- ⚠️ RLS status unverified. Before other DB work, confirm/enable Row Level Security:
  `saved_activities` restricted to `auth.uid() = user_id` (select/insert/delete);
  `activities` publicly readable.

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

- **Social filter bug** in `findPrecisionMatchesWithRotation` (`app/page.tsx:247`) — **verified,
  still open.** `.find()` returns only the first matching social tag. "With someone else or a
  group" emits `["social", "couple"]`, so couple-only activities get wrongly excluded for exactly
  the users who want them. Fix: collect all of the user's social tags and keep an activity if any
  of them match. `userLocationRequirement` on the next line has the same shape — check whether any
  answer emits two location tags before assuming it's fine.
- **`animate-in fade-in zoom-in` classes do nothing** — **verified, still open.** The results card
  uses them but nothing provides them: `tailwindcss-animate` is not in `package.json` and not
  installed. This is Tailwind v4, so the v3 plugin-array approach doesn't apply — it'd need
  `tw-animate-css` (or equivalent) loaded via `@plugin` in `app/globals.css`. The classes fail
  silently, so the card simply appears with no animation.
- The hobby-path budget question adds `low-budget` + `free` to every answer, so it differentiates
  almost nothing (may be intentional — free activities shouldn't be hidden from big spenders).
  Not yet verified.
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

## Roadmap (agreed order)

1. Supabase groundwork: RLS policies, the `vector` column, and seeding activities (the five
   listed above, plus more) with both tags and 7-axis vectors.
2. Vector matching function: rank tag-filtered activities by similarity to the user's vector.
3. Wire the quiz results button to real recommendations.
4. Merge both engines into one clean flow.

Not blocking the above, pick up when convenient: the social filter bug, the missing animation
plugin, and the quiz vector rebalance.
