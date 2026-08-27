# Manual test checklist

**This is the repo's one standing click-through checklist.** It is not tied to any branch
or feature — it describes everything a human has to look at to believe the app works, and
it accumulates. **Every feature branch extends it in its final stage.**

It exists because the dev scripts in `scripts/` deliberately stop at the maths. They
import the real modules and check what can be checked without a browser: rankings,
filters, the reroll reducer, the radar geometry. What they cannot check is whether the
thing on screen matches the thing in state — whether a button appears, whether a shape
moves, whether copy says what the rule actually is. That is this document's job.

## How to run it

```bash
npm run dev          # http://localhost:3000
```

Use a **fresh tab** for each run unless an item says otherwise. The quiz result lives in
`sessionStorage` (`si_quiz_v1`) and dies with the tab, so a new tab is the only reliable
way to get the first-visit path back. To reset without a new tab, run
`sessionStorage.clear()` in the console and reload.

Before starting, confirm the automated suite is green — a failure there will waste your
click-through:

```bash
npx tsc --noEmit
npm run lint                              # 7 known errors in app/page.tsx, no more
node scripts/verify-taste-radar.mjs
node scripts/verify-activity-matching.mjs
node scripts/analyze-quiz-balance.mjs
node scripts/verify-results-selection.mjs
node scripts/validate-activity-seed.mjs
```

---

# Part 1 — Standing checks

## A. Personality quiz

- [ ] **Full-answer run.** Answer all 8 questions by clicking. Every question shows
      "Question N of 8", the progress bar advances, and the profile card appears at the
      end with a title and description.
      *Verifies: every path yields a full-length vector.*
- [ ] **All-skip run.** Press Skip on all 8. You still reach a profile card — skipping is
      a real answer that picks an option at random, not a missing one.
      *Verifies: `handleSkip` routes through `handleSelectOption`; no path produces a
      short vector.*
- [ ] **Mixed run.** Click some, skip others. The results page later reports the skip
      count, and the count matches what you actually skipped.
- [ ] **Back over a skipped question.** Skip question 3, then press Back and answer it by
      clicking. The skip notice on the results must NOT count that question.
      *Verifies: skips are tracked as a parallel array, not a counter — going back has to
      un-count one.*
- [ ] **Back on question 1.** The Back link is absent on the first question, present from
      the second onward.
- [ ] **Profile title is stable.** Take the same answers twice; the same title comes back
      both times.
      *Verifies: the dominant axis is judged on raw sums, deterministically.*

## B. Session and funnel navigation

- [ ] **Refresh mid-funnel.** Complete the personality quiz, reach the chooser, then hit
      F5. You come back to the chooser, not to question 1 — the vector survived.
- [ ] **Refresh on the results.** F5 on a results page returns you to the chooser with the
      vector intact. Results themselves are not stored; that is expected.
- [ ] **New tab starts fresh.** Open a second tab on `localhost:3000` while the first tab
      holds a completed quiz. The new tab shows the hero, not the chooser.
      *Verifies: `sessionStorage`, not `localStorage` — a stale vector should never
      outlive the visit.*
- [ ] **"Try a different path" keeps the vector.** From a results page, it returns you to
      the chooser and the returning banner still shows your profile.
- [ ] **"Retake the quiz" clears it.** From the chooser banner or the results, it puts you
      back at question 1 and the old profile is gone.
- [ ] **Back from feasibility question 1** returns to the chooser, NOT into the
      personality quiz. The vector is already earned and must not be thrown away.
- [ ] **Clicking the "Stay Interesting" heading** returns you to the chooser from anywhere
      in the funnel, keeping the vector.

## C. Feasibility questions and filters

- [ ] **Quick path is 5 questions, hobby path is 4.** The quick path asks about energy and
      "in or out"; the hobby path asks about setting instead and has no energy question.
- [ ] **Strictly-free run.** Choose "keep it free" on the budget question. **None of the
      three ranked cards** may be something that costs money.
      *Verifies: cost is a hard ceiling and is NOT in `RELAXATION_STEPS`. The wildcard is
      exempt — see section E.*
- [ ] **Solo run.** Answer that you are on your own. No ranked card may require a group.
      *Verifies: company is not in `RELAXATION_STEPS` either.*
- [ ] **Relaxation disclosure.** Find a narrow combination (e.g. quick path, 10 minutes,
      outside, on your own, free). When fewer than 3 things fit, a blue banner appears
      naming exactly what was bent, in order, and states that budget and company were left
      as you set them.
      *Verifies: relaxation is never silent.*
- [ ] **The relaxation banner names the wildcard as the exception** when a wildcard is on
      screen.
- [ ] **Empty state.** If a combination still yields nothing, the card reads "Nothing
      fits, even after bending what we could" and says we will not **rank** something that
      costs more than you said. The wording is "rank", not "suggest" — the wildcard can
      still suggest one.
- [ ] **Rotation.** Run the same pathway and the same answers twice in one tab. The second
      run should tend to lead with different cards.
      *Verifies: `recent_shown_*` pushes recently-shown activities down the sort key —
      note it moves the ORDER only.*
- [ ] **The match percentage never lies.** A card pushed down by rotation still displays
      its true `% match`, not a penalised one.

## D. Reroll

- [ ] **The counter matches the buttons.** "N rerolls remaining" appears above the cards,
      and exactly N rerolls are actually servable.
      *Verifies: the counter is the queue length, not `min(5, survivors − 3)`.*
- [ ] **The counter usually starts below 5.** Most answer combinations start at 1 or 2,
      and more than half start at 0. This is expected, not a bug — relaxation stops at 3
      survivors and never reaches the 8 a full queue needs.
- [ ] **A start of 0 removes all three buttons together.** Not greyed out — gone. Find a
      narrow combination to see this.
- [ ] **Deterministic order.** With a healthy queue, note the ranked list, then reroll.
      The first reroll on ANY card serves rank 4; the next serves rank 5, regardless of
      which card you click.
- [ ] **Rapid double-click.** Click Reroll on card 1 and card 2 as fast as you can. **Both
      cards must change** and the counter must drop by exactly 2.
      *Verifies: the reducer reads only from its `state` argument. The bug this replaced
      let two rerolls in one React batch silently undo each other — one card moved, one
      reroll lost.*
- [ ] **A rerolled card never returns**, as a card or as a wildcard, for the rest of the
      run.
- [ ] **Replacements carry their own true match percentage**, drawn from the ranked list.
- [ ] **The wildcard has no Reroll button** — it has its own `↻ Another`, and using it does
      not decrease the shared counter.

## D3. Result diversity

The three ranked slots and the reroll queue come from one greedy pass: fit still ranks,
but a candidate within **D = 3.0** of something already picked is skipped as a restatement
of it.

- [ ] **The three shown cards are three different ideas**, not three phrasings of one.
- [ ] **Small `matchPercent` gaps between the three are correct, not a bug.** Two activities
      within D of each other can differ by at most ~13 match points for anyone, so the card
      diversity passed over was never much better than the one you got.
- [ ] **Rerolls serve new ideas too.** Reroll all the way to 0 and check you are not handed
      the near-duplicates that were skipped for the initial three.
- [ ] **A high-Outdoors run.** Answer the personality quiz leaning hard outdoors, take the
      quick path, and answer the feasibility questions permissively. Then reroll to
      exhaustion and look at the whole set.
      ⚠️ **You should still expect to see several walks.** On the current catalogue the four
      core walking activities sit 5.4–8.9 apart in taste space — they are genuinely different
      profiles, and D correctly leaves them alone. What you should NOT see is a set that feels
      interchangeable: `Find five constellations`, `Identify trees by their bark` and
      `Identify garden birds` are 1.7–2.0 apart, and only one of the three may appear.
      *This is the known limit: D catches taste-profile twins, not surface-category
      monotony. See the diversity section of CLAUDE.md.*
- [ ] **Skipped activities are not deleted.** The same run's wildcard can still hand you one
      of them, and changing an answer brings them back into the ranked slots.
- [ ] **A tight run still fills three slots.** Pick a narrow set of answers so relaxation
      kicks in — all three cards must still appear, even if two of them are similar. Fit
      wins at the margin; a slot is never left empty to protect the rule.

## D2. Results card layout

- [ ] **The badge cluster is top-right on every card**, in the same place regardless of how
      long the title is. Compare two cards with very different title lengths in one list —
      the cluster must not move.
      *Verifies: the header is a non-wrapping flex row with a `shrink-0` cluster, so the
      cluster's corner is fixed and the title takes what is left.*
- [ ] **Longest title, narrowest width.** At 375px, a card titled "Learn a two-player card
      game neither of you knows" (49 characters, the longest in the catalogue) keeps the
      cluster top-right, wraps the title in its own column, and never lets the two touch.
- [ ] **The wildcard card gets the same treatment.** Its badge is a whole sentence, so its
      cluster is much taller — the description must still sit BELOW it, never underneath.
- [ ] **Nothing overflows the card** at 375px. No badge is clipped by the rounded corner.

## E. Wildcard

- [ ] **The badge states the rule**: "✨ Wildcard — completely random, ignores everything
      you said". If the rule ever changes, this text changes with it.
- [ ] **A strictly-free run can be handed a paid wildcard.** This is correct and
      deliberate: the wildcard is the one place the answers do not apply.
- [ ] **It shows a real match percentage.** A true number on a randomly drawn row — it
      says how well the draw happens to fit, not that fit had anything to do with the
      draw.
- [ ] **`↻ Another` never returns a card already on screen or already discarded.**
- [ ] **The control disappears** when there is nothing fresh left to draw.

## F. Accounts and the saved list

- [ ] **Sign up / log in** from the header. The saved-list button appears once logged in.
- [ ] **Saving.** The ♡ on a card fills to ♥ and the saved count increases. It persists
      across a refresh.
- [ ] **Removing** from the saved modal drops the count and un-fills the heart.
- [ ] **Logged out**, clicking ♡ prompts you to log in rather than failing silently.

## G. `/quiz` standalone

- [ ] The route still works on its own and the subtitle names the real question count
      (8, derived — not hardcoded).
- [ ] Completing it and pressing the CTA lands you on `/` **at the chooser**, not back in
      the personality quiz.
      *Verifies: the CTA writes the session first, so home picks the funnel up mid-way.*

---

# Part 2 — Landing flow and the taste radar

Added by the `landing-flow` branch.

## H. Hero

- [ ] **A fresh tab lands on the hero**, not on question 1 of the quiz.
- [ ] The hero shows: the name **Stay Interesting**, a one-line promise naming *both*
      intents (beat boredom now / find a hobby that sticks), the mechanism sub-line
      ("First answer a few quick scenarios so we can learn what would best suit you as a
      person, and then we will give you the ability to outline some key conditions."),
      three expectation chips (`~2 minutes`, `no wrong answers`, `skip anything`), and
      exactly **one** CTA.
- [ ] **Only one "Stay Interesting" heading is on screen.** The persistent wordmark
      heading is suppressed on the hero; the small header wordmark at the very top stays.
- [ ] **The demo radar cycles all 15 personality types**, about 2 seconds each, and the
      label beneath it names the type currently drawn. A full cycle takes ~30 seconds, so
      sit with it — you should see the name and the shape change together every time.
- [ ] **Every label is a real type name**, one of the 15 in `lib/personalityTypes.ts`.
      These are no longer hand-drawn example shapes: each polygon is that type's measured
      archetype, an answer path the quiz can genuinely produce.
- [ ] **The cycle is the same every load** — same order, starting from The Social Catalyst.
      There is no randomness in it.
- [ ] **Consecutive shapes are visibly different.** Some pairs genuinely resemble each
      other — a pure type and a hybrid built from it are near neighbours, and the chart is
      being honest when it says so — but the animation should never look like it stalled.
      ⚠️ If two adjacent shapes read as the same picture, say so. **Do not fix it by
      editing a vector**: the archetypes are measured outputs of the quiz walk, and editing
      one puts a shape on the landing page the quiz cannot produce. The remedy is the play
      order or the taxonomy.
- [ ] **The CTA does not navigate.** The URL stays `localhost:3000` — no `/quiz` — and the
      quiz animates in on the same page.
- [ ] **A returning tab never sees the hero.** Complete the quiz, then reload: you get the
      banner and chooser.

## I2. Radar normalization and labels

The radar draws **shape, never magnitude** — every polygon is scaled so its largest axis
reaches the outer area, with the ratios between axes untouched.

- [ ] **The shape does not shrink as the quiz goes on.** Answer all 8 questions and watch:
      the polygon changes shape but stays the same overall size. It used to shrink, because
      a running mean of honest option vectors drifts toward the middle of the pool.
- [ ] **The finished shape fills the chart** rather than sitting as a small blob near the
      centre.
- [ ] **There are no numbers anywhere on any radar** — no values beside the axis names, no
      tooltips on hover, nothing against the rings. Axis names only, in all three modes.
- [ ] **All seven axis labels are complete**, not clipped mid-word. "Stimulation" is the
      longest and the first to break; check it at 375px, at 768px and full width.
- [ ] **The radar scales with its container** and never overflows it at 375px.
- [ ] **Two users with the same proportions draw the same shape.** This is by design — the
      chart is about which axes lead, not how strong the numbers are. Absolute intensity is
      still what the matcher ranks on; it just is not what this picture shows.

## I. Radar during the quiz

- [ ] **Before question 1 is answered**, the radar shows a faint even heptagon — the
      neutral ghost. It reads as an empty frame because it is FADED, not because it is
      small: under normalization a flat vector has no shape to show.
- [ ] **The caption "Every answer reshapes your taste map." appears on question 1 only**,
      and is gone from question 2 onward.
- [ ] **Clicking an answer reshapes the radar**, smoothly rather than jumping.
- [ ] **Pressing Skip ALSO reshapes it.** A skip is a real answer; the shape must react or
      the button reads as broken.
- [ ] **Pressing Back rewinds it** to exactly the shape it had before that answer.
- [ ] **Answering faster than the morph finishes** changes course smoothly — it must not
      snap back to the previous shape and start again.
- [ ] **Questions slide in from the direction you came from**: from the right going
      forward, from the left going back.
- [ ] **The radar does not restart or flicker between questions** — it is outside the
      keyed wrapper so the in-flight morph survives.
- [ ] **With reduced motion enabled** (Windows: Settings → Accessibility → Visual effects →
      Animation effects off; or DevTools → Rendering → Emulate `prefers-reduced-motion`),
      the shape snaps instantly instead of morphing, and the hero demo holds ONE shape
      instead of cycling — the first one, The Social Catalyst, with its name beneath it.
      Nothing disappears and nothing is left unlabelled.

## J. Radar on the profile card

- [ ] The finished profile card shows a **large labelled radar beside the title and
      description**, stacking above it on a narrow window.
- [ ] **The shape matches the answers you gave** — it is the same shape the building radar
      ended on, not a new one.
- [ ] **Axis labels are names only.** No values, no tooltips — see section I2.
- [ ] **The profile title still follows the raw sums**, which normalization never touches.
      Take a run dominated by one axis and confirm you get that axis's profile.
- [ ] There is **no numeric vector table** anywhere — the radar is the whole display.
- [ ] **The contributing axes are picked out on the radar**: their labels are indigo and
      bolder, and their vertex dots slightly larger. A hybrid highlights two, a pure type
      one, The All-Rounder none at all.
- [ ] **The highlight adds no information** — still no numbers, and the polygon is drawn
      exactly where it would be without it.
- [ ] **Vertex dots sit on the polygon's corners**, not floating off it.

## K. Returning-in-session banner

- [ ] With a vector in the tab, the chooser shows a **slim banner**: mini radar, "Your
      taste map", the profile title, and a "Retake the quiz" link.
- [ ] **The banner is slim, not the payoff** — small radar, no axis labels. The full
      labelled one belongs on the profile card.
- [ ] **The Bored / Find a Hobby cards stay prominent beneath it.**
- [ ] **There is exactly one retake link on the chooser** — the one in the banner. The
      standalone link beneath the cards is gone.
- [ ] **Storage-blocked fallback.** In a browser with site data blocked, or after
      `sessionStorage.clear()` mid-funnel, the banner does not render and the standalone
      retake link reappears beneath the cards so there is still a way out.

## L. `/quiz` standalone radar

- [ ] `/quiz` shows the same building radar while answering and the same labelled radar on
      its profile card.
- [ ] The hero does **not** appear at `/quiz` — that route is the quiz alone, as before.

## M. Naming

- [ ] **The browser tab reads "Stay Interesting"**, not "Create Next App".
- [ ] No user-facing surface says "Boredom Buster".
      *`CLAUDE.md` and the `supabase/*.sql` comment headers keep their historical
      references on purpose; those are records, not UI.*

## N. The 15 personality types

The mechanism: flat profile (top axis within **8** raw-sum points of the bottom one) →
The All-Rounder; else a second axis within **3** of the first *and* that pair named →
that hybrid; else the pure dominant axis. Judged on raw sums, never averages.

- [ ] **A purist run lands its pure type.** Answer all 8 personality questions with the
      most obviously Creative option each time — you should get **The Meticulous Creator**,
      not a hybrid. Same for Analytical → The Strategic Architect.
- [ ] **A deliberately split run lands a hybrid.** Alternate between the most Analytical
      and the most Novelty-seeking option through the 8 questions; the two axes should end
      up close enough to give you **The Rabbit-Holer**. If you get a pure type instead, the
      two axes were not within 3 of each other — try balancing the alternation more evenly.
- [ ] **A flat run can land The All-Rounder.** Pick middling, unremarkable options all the
      way through — nothing that maximises any one axis. This is genuinely rare (1.4% of
      all answer paths), so it may take a few attempts. It is not broken if you miss it;
      `node scripts/analyze-quiz-balance.mjs` proves it is reachable.
- [ ] **The type name and copy appear on the profile card** at the end of the quiz, beside
      the large radar.
- [ ] **The same type appears again on the results page**, in a card above the matches,
      under the eyebrow "Ranked against". This is deliberate repetition — by the time the
      matches appear, the profile that produced every match percentage has scrolled well
      out of sight.
- [ ] **The returning-visitor banner shows the same title** as the profile card did. Take
      the quiz, return to the chooser, and check the two agree.
- [ ] **With storage blocked** (`sessionStorage.clear()` before the results load), the
      results page shows **no** type card at all — and still shows the "not in any
      particular order" banner. It must not invent a personality type it has no vector for.
- [ ] **The copy matches the axes.** Read each type's description against the axes named in
      `data/personality-types-review.md`. The Detour-Taker sits at Energy 18, so nothing in
      its copy may promise anything strenuous; The League Secretary sits at Outdoors 11, so
      nothing outdoors. This is the check no script can do.
