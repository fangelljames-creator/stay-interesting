#!/usr/bin/env node
/**
 * Verifies lib/resultsSelection.ts — the wildcard draw and the reroll pool —
 * against the real seed data.
 *
 *   node scripts/verify-results-selection.mjs
 *
 * Like verify-activity-matching.mjs and unlike analyze-quiz-balance.mjs, this
 * imports the REAL functions and the REAL questions (Node strips the
 * TypeScript on the fly), so it cannot drift out of sync with the code it is
 * checking.
 *
 * THE RULE UNDER TEST (2026-08-26, "full chaos"): the wildcard is drawn at
 * random from the user's PATHWAY and obeys NOTHING else — not the taste
 * ranking, not the practical filters, NOT BUDGET. The only rows it will not
 * return are the cards already on screen and anything rerolled away.
 *
 * NOTE ON CHECK A. An earlier version of this script asserted the opposite:
 * that a strictly-free user's wildcard is always free. That guarantee was
 * dropped along with the budget exception, so the check was INVERTED rather
 * than deleted — a rule this permissive still has to be shown to be in effect,
 * or a filter creeping back in would pass silently.
 *
 * WHAT IS DELIBERATELY NOT SIMULATED: graceful relaxation. Filters are applied
 * with the real satisfiesFilter and the real questions, but the relaxation
 * ladder is not re-implemented here, because re-implementing it would be
 * exactly the hand-mirroring this project keeps warning about. Nothing checked
 * below depends on it: the wildcard ignores the filters altogether, and the
 * reroll pool is arithmetic on the ranked list however that list was produced.
 *
 * CHECKS
 *   A. No filter    — pass/fail. The candidate set IS the pathway pool, and a
 *                     strictly-free user really can be handed a paid wildcard.
 *   B. In force     — pass/fail. The wildcard really can break the practical
 *                     filters too, so the rule is not silently an older one.
 *   C. Exclusion    — pass/fail. A draw is never a shown card and never a
 *                     discarded one; one is produced whenever any remains.
 *   D. Counter      — pass/fail. The counter equals the servable rerolls, over
 *                     every answer combination, including the small pools.
 *   E. Sequence     — pass/fail. Deterministic ranks 4,5,6,7,8 exactly once
 *                     each; rapid dispatches keep strict order; no duplicate on
 *                     screen at any point; the counter lands on 0.
 *   F. Diversity    — pass/fail. A planted twin cluster takes at most one slot
 *                     across the shown cards AND the reroll queue while
 *                     alternatives remain; a pool of nothing but twins still
 *                     fills every slot; the pass is deterministic and stable;
 *                     and on the real seed every within-D pick is a genuine
 *                     relaxation rather than a distinct candidate passed over.
 *
 * CHECKS D AND E DRIVE THE REAL REDUCER from lib/rerollMachine.ts. Dispatching
 * against one state object without an intervening render is exactly the
 * rapid-click case that broke the previous implementation, where every handler
 * read its inputs from a closure and the second click silently undid the first.
 */
import {
  availableWildcards,
  drawRandom,
  diverseSelect,
  DIVERSITY_MIN_DISTANCE,
} from "../lib/resultsSelection.ts";
import {
  rerollReducer,
  initRerollState,
  rerollsRemaining,
  resultCardsOf,
  MAX_REROLLS,
  SHOWN_COUNT,
} from "../lib/rerollMachine.ts";
import {
  QUICK_QUESTIONS,
  HOBBY_QUESTIONS,
  MIN_RESULTS,
} from "../lib/feasibilityQuestions.ts";
import { satisfiesFilter, COST_TAGS } from "../lib/activityTags.ts";
import {
  rankActivities,
  userVectorFromQuizTotals,
  matchPercentFor,
  euclideanDistance,
} from "../lib/matchActivities.ts";
import { personalityQuestions } from "../data/personalityQuiz.ts";
import { parseSeedActivities } from "./lib/parse-seed.mjs";

const failures = [];
const SEPARATOR = "-".repeat(72);

// Seed rows have no uuid — the id only ever arrives from Supabase. Everything
// in resultsSelection.ts keys on `id`, so give each row a stable stand-in.
const activities = parseSeedActivities().map((row) => ({ ...row, id: row.title }));

/**
 * Seeded PRNG (mulberry32). Injected in place of Math.random so a failure here
 * is reproducible rather than something that shows up one run in twenty.
 */
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A real user vector: answer every personality question with its first option. */
const totals = new Array(7).fill(0);
for (const question of personalityQuestions) {
  question.options[0].vector.forEach((n, i) => (totals[i] += n));
}
const userVector = userVectorFromQuizTotals(totals, personalityQuestions.length);

const PATHWAYS = [
  { tag: "quick-fix", questions: QUICK_QUESTIONS, label: "quick" },
  { tag: "long-term", questions: HOBBY_QUESTIONS, label: "hobby" },
];

/** Every answer combination for a question set, as arrays of FilterActions. */
function* everyCombination(questions) {
  const sizes = questions.map((q) => q.options.length);
  const total = sizes.reduce((a, b) => a * b, 1);
  for (let n = 0; n < total; n++) {
    let rem = n;
    const choice = sizes.map((size) => {
      const pick = rem % size;
      rem = Math.floor(rem / size);
      return pick;
    });
    yield { actions: questions.map((q, i) => q.options[choice[i]].action) };
  }
}

const poolFor = (tag) => activities.filter((a) => a.tags.includes(tag));
const survivorsFor = (pool, actions) =>
  pool.filter((a) => actions.every((action) => satisfiesFilter(a.tags, action)));

console.log(`Loaded ${activities.length} seed activities.`);
console.log(
  `Rerolls are deterministic: ranks ${SHOWN_COUNT + 1}+ in order, ` +
    `at most ${MAX_REROLLS}, shared by ${SHOWN_COUNT} cards.\n`
);

// ---------------------------------------------------------------------------
// CHECK A — No filter at all, budget included
//
// The candidate set must be the pathway pool itself, minus only what is on
// screen. Checked over the WHOLE pool rather than by sampling draws: a sampled
// check passes by luck, and this has to hold for every possible draw.
//
// The second half is the one that would catch a regression. "No filter" is
// invisible when the pool happens to be all free anyway, so this asserts that
// a strictly-free user CAN be handed a paid wildcard. If a cost ceiling ever
// creeps back in, this fails.
// ---------------------------------------------------------------------------
console.log("CHECK A \u2014 No filter: the wildcard obeys nothing, budget included\n");

const costTierOf = (activity) =>
  COST_TAGS.find((tier) => activity.tags.includes(tier)) ?? "none";

for (const { tag, label } of PATHWAYS) {
  const pool = poolFor(tag);

  // Nothing on screen -> every row on the pathway is a candidate.
  const candidates = availableWildcards(pool, []);
  if (candidates.length !== pool.length) {
    failures.push(
      `${label}: the wildcard pool dropped ${pool.length - candidates.length} row(s) with nothing ` +
        `excluded \u2014 something is filtering the wildcard again`
    );
  }

  // A user who said "keep it free" must still be reachable by a paid draw.
  const paid = candidates.filter((a) => !a.tags.includes("free"));
  if (paid.length === 0) {
    failures.push(
      `${label}: no paid row is reachable as a wildcard, so "ignores your budget" cannot be observed`
    );
  }

  // And the draws themselves, seeded so a result repeats. A strictly-free user
  // is simulated by doing nothing at all, which is the entire point.
  const rng = makeRng(20260826);
  const drawnTiers = new Set();
  for (let i = 0; i < 500; i++) {
    const pick = drawRandom(availableWildcards(pool, []), rng);
    if (!pick) break;
    drawnTiers.add(costTierOf(pick));
  }
  for (const tier of new Set(pool.map(costTierOf))) {
    if (!drawnTiers.has(tier)) {
      failures.push(`${label}: 500 draws never produced a ${tier} activity, which the pool contains`);
    }
  }

  console.log(
    `  ${label.padEnd(6)} candidates ${candidates.length}/${pool.length} (no filter)` +
      `   ${paid.length} paid row(s) reachable` +
      `   500 draws hit every cost tier: ${[...drawnTiers].sort().join(", ")}`
  );
}

// ---------------------------------------------------------------------------
// CHECK B — The rule is actually in force
//
// If every eligible wildcard happened to pass the practical filters anyway,
// the new rule would be indistinguishable from the old one and no check above
// would notice. At least one eligible wildcard must BREAK a non-cost filter.
// ---------------------------------------------------------------------------
console.log("\n\nCHECK B — In force: the wildcard really does break the practical filters\n");

for (const { tag, questions, label } of PATHWAYS) {
  const pool = poolFor(tag);
  let canBreakOut = 0;
  let combinations = 0;

  for (const { actions } of everyCombination(questions)) {
    combinations++;
    const survivorIds = new Set(survivorsFor(pool, actions).map((a) => a.id));

    // Candidate wildcards that the user's own answers would have ruled out.
    if (pool.some((a) => !survivorIds.has(a.id))) canBreakOut++;
  }

  const pct = ((canBreakOut / combinations) * 100).toFixed(0);
  console.log(
    `  ${label.padEnd(6)} ${canBreakOut}/${combinations} answer combinations ` +
      `(${pct}%) can draw a wildcard their own filters ruled out`
  );

  if (canBreakOut === 0) {
    failures.push(
      `${label}: no answer combination can produce a filter-breaking wildcard — the new rule is ` +
        `indistinguishable from the old "wildcard obeys all filters" behaviour`
    );
  }
}

// ---------------------------------------------------------------------------
// CHECK C — Exclusion, and always rendering when something is left
// ---------------------------------------------------------------------------
console.log("\n\nCHECK C — Exclusion: never a shown card, never a discarded one\n");

{
  const rng = makeRng(7);
  let checked = 0;

  for (const { tag, questions, label } of PATHWAYS) {
    const pool = poolFor(tag);

    for (const { actions } of everyCombination(questions)) {
      const ordered = rankActivities(userVector, survivorsFor(pool, actions));
      const shownIds = ordered.slice(0, MIN_RESULTS).map((a) => a.id);

      const discarded = [];
      // Reroll the wildcard until the pool runs dry, which is the condition
      // that hides the card.
      for (let roll = 0; roll < pool.length + 2; roll++) {
        const available = availableWildcards(pool, [...shownIds, ...discarded]);
        const pick = drawRandom(available, rng);

        if (available.length === 0) {
          if (pick !== null) failures.push(`${label}: drew a wildcard from an empty pool`);
          break;
        }
        if (!pick) {
          failures.push(`${label}: ${available.length} wildcard(s) available but none was drawn`);
          break;
        }
        if (shownIds.includes(pick.id)) {
          failures.push(`${label}: wildcard "${pick.title}" is also one of the shown cards`);
          break;
        }
        if (discarded.includes(pick.id)) {
          failures.push(`${label}: wildcard "${pick.title}" came back after being rerolled away`);
          break;
        }
        discarded.push(pick.id);
        checked++;
      }
    }
  }
  console.log(`  ${checked} wildcard draws across every answer combination, all clean.`);
}

// ---------------------------------------------------------------------------
// CHECK D — The counter tells the truth
//
// The counter IS the queue length. What it must never do is promise a reroll
// that cannot be served, which is what the old `ordered.length - 3` formula did
// whenever the wildcard sat inside ranks 4-8.
//
// Note how small these pools are. Relaxation stops at MIN_RESULTS (3) and never
// tries to reach the 8 survivors a full pool would need, so most answer sets
// start with one or two rerolls and many with none. That is why the counter
// exists: three buttons with no number was a promise the state could not keep.
// ---------------------------------------------------------------------------
console.log("\n\nCHECK D — Counter: equals the rerolls that can actually be served\n");

for (const { tag, questions, label } of PATHWAYS) {
  const pool = poolFor(tag);
  const histogram = new Map();
  const rng = makeRng(99);

  for (const { actions } of everyCombination(questions)) {
    const ordered = rankActivities(userVector, survivorsFor(pool, actions));
    const shownIds = ordered.slice(0, SHOWN_COUNT).map((a) => a.id);
    const wildcard = drawRandom(availableWildcards(pool, shownIds), rng);

    const state = initRerollState(ordered, wildcard, pool);
    const counter = rerollsRemaining(state);

    // Drive the whole queue and count what actually gets served.
    let served = 0;
    let s = state;
    for (let i = 0; i < counter + 3; i++) {
      const next = rerollReducer(s, { type: "reroll", index: i % SHOWN_COUNT });
      if (next === s) break;
      served++;
      s = next;
    }

    if (served !== counter) {
      failures.push(`${label}: counter said ${counter} but ${served} reroll(s) could be served`);
    }
    if (rerollsRemaining(s) !== 0) {
      failures.push(`${label}: queue not empty after exhausting it`);
    }
    // Never negative, and dispatching past the end changes nothing.
    const past = rerollReducer(s, { type: "reroll", index: 0 });
    if (past !== s) failures.push(`${label}: dispatching past 0 was not a no-op`);

    // The wildcard must never be reachable through the queue.
    if (wildcard && state.queue.some((a) => a.id === wildcard.id)) {
      failures.push(`${label}: the wildcard "${wildcard.title}" is in the reroll queue`);
    }

    histogram.set(counter, (histogram.get(counter) ?? 0) + 1);
  }

  const spread = [...histogram.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([n, count]) => `${n}:${count}`)
    .join("  ");
  const starved = [...histogram.entries()].reduce((n, [k, v]) => (k < MAX_REROLLS ? n + v : n), 0);
  const total = [...histogram.values()].reduce((a, b) => a + b, 0);
  console.log(`  ${label.padEnd(6)} counter:count  ${spread}`);
  console.log(
    `         ${starved}/${total} combinations (${((starved / total) * 100).toFixed(0)}%) start below ${MAX_REROLLS}\n`
  );
}

// ---------------------------------------------------------------------------
// CHECK E — The sequence, including rapid dispatch
//
// This is the check the previous implementation could not have passed. Every
// dispatch below is applied to the state returned by the last one WITHOUT an
// intervening render, which is exactly what React does when several clicks land
// in one batch. The old handlers read shown/pool/discarded out of a closure, so
// in that situation the second click rebuilt from the pre-update snapshot and
// silently reverted the first.
// ---------------------------------------------------------------------------
console.log("\nCHECK E — Sequence: deterministic order, rapid dispatch, no duplicates\n");

/** A synthetic ranked list, so the expected ranks are unambiguous. */
const synthetic = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `rank-${i + 1}`,
    title: `rank-${i + 1}`,
    vector: [1, 1, 1, 1, 1, 1, 1],
    distance: i,
    matchPercent: 100 - i,
  }));

/** Every id on screen right now, wildcard included. */
const onScreen = (state) => resultCardsOf(state).map((a) => a.id);

function assertNoDuplicates(state, where) {
  const ids = onScreen(state);
  if (new Set(ids).size !== ids.length) {
    failures.push(`${where}: duplicate on screen — ${ids.join(", ")}`);
    return false;
  }
  return true;
}

// E1 — five rapid rerolls across mixed cards must serve ranks 4..8 once each.
{
  let state = initRerollState(synthetic(8), null, []);
  const counterAtStart = rerollsRemaining(state);
  if (counterAtStart !== MAX_REROLLS) {
    failures.push(`E1: counter started at ${counterAtStart}, expected ${MAX_REROLLS}`);
  }

  const served = [];
  // Deliberately mixed and out of order: card 2, 0, 1, 0, 2.
  for (const index of [2, 0, 1, 0, 2]) {
    const before = onScreen(state);
    state = rerollReducer(state, { type: "reroll", index });
    assertNoDuplicates(state, "E1");
    const after = onScreen(state);
    const added = after.find((id) => !before.includes(id));
    if (added) served.push(added);
  }

  const expected = ["rank-4", "rank-5", "rank-6", "rank-7", "rank-8"];
  if (served.join(",") !== expected.join(",")) {
    failures.push(`E1: served ${served.join(",")}, expected ${expected.join(",")}`);
  }
  if (rerollsRemaining(state) !== 0) {
    failures.push(`E1: counter is ${rerollsRemaining(state)} after 5 rerolls, expected 0`);
  }
  console.log(`  E1  5 rapid rerolls across mixed cards -> ${served.join(", ")}, counter 0`);
}

// E2 — a small pool: the counter starts below 5 and exhausts cleanly.
{
  let state = initRerollState(synthetic(5), null, []);
  const start = rerollsRemaining(state);
  if (start !== 2) failures.push(`E2: 5 survivors should give 2 rerolls, got ${start}`);

  const served = [];
  for (let i = 0; i < 4; i++) {
    const before = onScreen(state);
    const next = rerollReducer(state, { type: "reroll", index: i % SHOWN_COUNT });
    if (next === state) break;
    state = next;
    assertNoDuplicates(state, "E2");
    served.push(onScreen(state).find((id) => !before.includes(id)));
  }
  if (served.join(",") !== "rank-4,rank-5") {
    failures.push(`E2: small pool served ${served.join(",")}, expected rank-4,rank-5`);
  }
  if (rerollsRemaining(state) !== 0) failures.push("E2: small pool did not exhaust to 0");
  console.log(`  E2  small pool (5 survivors) -> counter 2, served ${served.join(", ")}, then 0`);
}

// E3 — a pool of exactly 3: no rerolls at all, so no buttons render.
{
  const state = initRerollState(synthetic(3), null, []);
  if (rerollsRemaining(state) !== 0) {
    failures.push(`E3: 3 survivors should give 0 rerolls, got ${rerollsRemaining(state)}`);
  }
  const after = rerollReducer(state, { type: "reroll", index: 0 });
  if (after !== state) failures.push("E3: rerolling with an empty queue was not a no-op");
  console.log("  E3  pool of 3 -> counter 0, reroll is a no-op, buttons never render");
}

// E4 — rapid DOUBLE dispatch on the SAME card, no render between.
//      This is the exact case that used to lose a rank.
{
  let state = initRerollState(synthetic(8), null, []);
  state = rerollReducer(state, { type: "reroll", index: 0 });
  state = rerollReducer(state, { type: "reroll", index: 0 });

  const shownIds = state.shown.map((a) => a.id);
  if (shownIds[0] !== "rank-5") {
    failures.push(`E4: double-click on card 0 left ${shownIds[0]}, expected rank-5`);
  }
  if (rerollsRemaining(state) !== 3) {
    failures.push(`E4: counter is ${rerollsRemaining(state)} after 2 rerolls, expected 3`);
  }
  if (!state.discarded.includes("rank-1") || !state.discarded.includes("rank-4")) {
    failures.push(`E4: both rank-1 and rank-4 must be discarded, got ${state.discarded.join(",")}`);
  }
  assertNoDuplicates(state, "E4");
  console.log(
    `  E4  double-dispatch on one card -> ${shownIds[0]}, counter 3, discarded ${state.discarded.join(" + ")}`
  );
}

// E5 — a discarded card never returns, and the wildcard is never served.
{
  const wildcard = { id: "rank-6", title: "rank-6", vector: [1, 1, 1, 1, 1, 1, 1] };
  let state = initRerollState(synthetic(9), wildcard, [wildcard]);

  if (state.queue.some((a) => a.id === "rank-6")) {
    failures.push("E5: the wildcard is in the reroll queue");
  }
  // 9 survivors minus 3 shown = 6 candidates, minus the wildcard = 5.
  if (rerollsRemaining(state) !== 5) {
    failures.push(`E5: expected 5 rerolls, got ${rerollsRemaining(state)}`);
  }

  const seen = new Set(onScreen(state));
  while (rerollsRemaining(state) > 0) {
    state = rerollReducer(state, { type: "reroll", index: 0 });
    assertNoDuplicates(state, "E5");
    for (const id of onScreen(state)) {
      if (state.discarded.includes(id)) {
        failures.push(`E5: discarded "${id}" is back on screen`);
      }
      seen.add(id);
    }
  }
  const servedOrder = ["rank-4", "rank-5", "rank-7", "rank-8", "rank-9"];
  const missing = servedOrder.filter((id) => !seen.has(id));
  if (missing.length) failures.push(`E5: never served ${missing.join(", ")}`);
  console.log(
    `  E5  wildcard rank-6 skipped; served ${servedOrder.join(", ")}; no discard ever returned`
  );
}

// E6 — over every real answer combination, drive the queue to empty and check
//      the invariants against the actual catalogue rather than a synthetic list.
{
  const rng = makeRng(4242);
  let runs = 0;
  let rerolls = 0;

  for (const { tag, questions, label } of PATHWAYS) {
    const pool = poolFor(tag);
    for (const { actions } of everyCombination(questions)) {
      const ordered = rankActivities(userVector, survivorsFor(pool, actions));
      const shownIds = ordered.slice(0, SHOWN_COUNT).map((a) => a.id);
      const wildcard = drawRandom(availableWildcards(pool, shownIds), rng);

      let state = initRerollState(ordered, wildcard, pool);
      assertNoDuplicates(state, `${label} initial`);

      let i = 0;
      while (rerollsRemaining(state) > 0) {
        const next = rerollReducer(state, { type: "reroll", index: i % SHOWN_COUNT });
        if (next === state) break;
        state = next;
        i++;
        rerolls++;
        if (!assertNoDuplicates(state, `${label} after reroll ${i}`)) break;
        // Every replacement carries its own true matchPercent.
        for (const card of state.shown) {
          if (typeof card.distance === "number" && card.matchPercent !== matchPercentFor(card.distance)) {
            failures.push(`${label}: "${card.title}" shows a matchPercent its distance disagrees with`);
          }
        }
      }
      runs++;
    }
  }
  console.log(`  E6  ${runs} real answer combinations, ${rerolls} rerolls, all invariants held`);
}

// ---------------------------------------------------------------------------
// CHECK F — Diversity: one idea per slot
//
// rankActivities sorts by distance from the USER and cannot see that two
// activities are near-identical to EACH OTHER, so a cluster that suits someone
// takes every slot and the reroll queue behind them. diverseSelect walks the
// same fit order and skips a candidate that only restates one already picked.
//
// These drive the REAL diverseSelect and hand its output to the REAL reducer,
// which is the whole point of the wiring: the three shown cards and ranks 4-8
// of the reroll queue come from one greedy pass, so rerolls serve the next
// distinct idea rather than the rest of the cluster.
// ---------------------------------------------------------------------------
console.log("\n\nCHECK F — Diversity: one idea per slot, and fit wins at the margin\n");

/** Five rows within ~2 of each other: the same idea, said five ways. */
const TWINS = [
  [5, 5, 5, 5, 5, 5, 5],
  [6, 5, 5, 5, 5, 5, 5],
  [4, 5, 5, 5, 5, 5, 5],
  [5, 6, 5, 5, 5, 5, 5],
  [5, 5, 6, 5, 5, 5, 5],
].map((vector, i) => ({ id: `twin-${i}`, title: `twin-${i}`, vector }));

/** Nine rows far from the twins and from each other. */
const ALTERNATIVES = [
  [10, 1, 1, 1, 1, 1, 1],
  [1, 10, 1, 1, 1, 1, 1],
  [1, 1, 10, 1, 1, 1, 1],
  [1, 1, 1, 10, 1, 1, 1],
  [1, 1, 1, 1, 10, 1, 1],
  [1, 1, 1, 1, 1, 10, 1],
  [1, 1, 1, 1, 1, 1, 10],
  [10, 10, 1, 1, 1, 1, 1],
  [1, 1, 10, 10, 1, 1, 1],
].map((vector, i) => ({ id: `alt-${i}`, title: `alt-${i}`, vector }));

const isTwin = (activity) => activity.id.startsWith("twin-");

// F1 — a planted twin cluster must not take more than one slot while
//      alternatives remain. The user sits ON the cluster, so fit alone would
//      hand them all five.
{
  const user = [5, 5, 5, 5, 5, 5, 5];
  const ranked = rankActivities(user, [...TWINS, ...ALTERNATIVES]);

  const fitOnly = ranked.slice(0, SHOWN_COUNT + MAX_REROLLS).filter(isTwin).length;

  const selected = diverseSelect(ranked, DIVERSITY_MIN_DISTANCE, ranked.length);
  const state = initRerollState(selected, null, []);
  const served = [...state.shown, ...state.queue];
  const twinsServed = served.filter(isTwin).length;

  if (served.length !== SHOWN_COUNT + MAX_REROLLS) {
    failures.push(`F1: expected ${SHOWN_COUNT + MAX_REROLLS} served cards, got ${served.length}`);
  } else if (twinsServed > 1) {
    failures.push(
      `F1: ${twinsServed} twins across the shown cards and the reroll queue, with ` +
        `${ALTERNATIVES.length} alternatives available — expected at most 1`
    );
  } else if (!isTwin(state.shown[0])) {
    failures.push("F1: the best-fitting candidate was not taken — fit must still rank");
  } else {
    console.log(
      `  F1  twin cluster: fit alone serves ${fitOnly} of the 5 twins across ` +
        `${SHOWN_COUNT} slots + ${MAX_REROLLS} rerolls; diversity serves ${twinsServed}. OK`
    );
  }

  // The skipped twins are NOT gone. They stay in the selection's tail, so they
  // are still in the pathway pool the wildcard draws from and still surface
  // when the answers or constraints differ.
  const survivors = selected.filter(isTwin).length;
  if (survivors !== TWINS.length) {
    failures.push(`F1: ${TWINS.length - survivors} twin(s) dropped from the list entirely`);
  } else {
    console.log(`  F1b all ${TWINS.length} twins remain in the list — skipped, not deleted. OK`);
  }
}

// F2 — graceful degradation. Fit wins at the margin: a slot is never left
//      empty to protect the rule.
{
  for (const size of [SHOWN_COUNT + 1, SHOWN_COUNT, 2]) {
    const pool = TWINS.slice(0, size);
    const ranked = rankActivities([5, 5, 5, 5, 5, 5, 5], pool);
    const selected = diverseSelect(ranked, DIVERSITY_MIN_DISTANCE, ranked.length);

    if (selected.length !== size) {
      failures.push(`F2: a pool of ${size} all-twins returned ${selected.length} — nothing may be dropped`);
      continue;
    }
    const state = initRerollState(selected, null, []);
    const expectedShown = Math.min(SHOWN_COUNT, size);
    if (state.shown.length !== expectedShown) {
      failures.push(
        `F2: a pool of ${size} all-twins filled ${state.shown.length} slots, expected ${expectedShown}`
      );
    }
  }
  if (!failures.some((f) => f.startsWith("F2"))) {
    console.log(
      `  F2  all-twin pools of ${SHOWN_COUNT + 1}, ${SHOWN_COUNT} and 2 still fill every slot they can. OK`
    );
  }
}

// F3 — deterministic, and stable for equal distances.
//
// Stability is checked as a general property rather than on a hand-picked
// tie: the output must be a SUBSEQUENCE of the input, since every choice is
// "first eligible in the given order". Anything that reordered equal-distance
// candidates would break that.
{
  const ranked = rankActivities([5, 5, 5, 5, 5, 5, 5], [...TWINS, ...ALTERNATIVES]);

  const runs = Array.from({ length: 3 }, () =>
    diverseSelect(ranked, DIVERSITY_MIN_DISTANCE, ranked.length).map((a) => a.id).join(",")
  );
  if (new Set(runs).size !== 1) {
    failures.push("F3: diverseSelect returned different orders for identical input");
  }

  const selected = diverseSelect(ranked, DIVERSITY_MIN_DISTANCE, ranked.length);

  // ⚠️ The output is TWO monotone runs, not one. The diverse pass walks the
  // input in order, then the relaxation tail walks what is left — also in
  // order, but from indices the first pass already went past. Stability is
  // therefore "indices increase within each phase", and asserting one global
  // subsequence would be asserting that relaxation does not exist.
  const indexOf = (activity) => ranked.findIndex((r) => r.id === activity.id);
  const kept = [];
  let phase = "diverse";
  let cursor = -1;
  let stable = true;

  for (const activity of selected) {
    const relaxed = kept.some(
      (earlier) => euclideanDistance(activity.vector, earlier.vector) < DIVERSITY_MIN_DISTANCE
    );
    if (relaxed && phase === "diverse") {
      phase = "relaxed";
      cursor = -1;
    } else if (!relaxed && phase === "relaxed") {
      // Impossible by the monotonicity argument in lib/resultsSelection.ts:
      // picks only accumulate, so nothing can become eligible again.
      failures.push("F3: a distinct pick appeared AFTER relaxation began");
    }
    const at = indexOf(activity);
    if (at <= cursor) stable = false;
    cursor = at;
    kept.push(activity);
  }

  if (!stable) {
    failures.push("F3: indices do not increase within a phase — ties were reordered");
  }

  const returned = new Set(selected.map((a) => a.id));
  if (returned.size !== selected.length || selected.length !== ranked.length) {
    failures.push(
      `F3: asked for all ${ranked.length}, got ${selected.length} with ${returned.size} distinct`
    );
  }

  if (!failures.some((f) => f.startsWith("F3"))) {
    console.log(
      "  F3  identical across repeated runs; monotone within each phase; nothing dropped or repeated. OK"
    );
  }
}

// F4 — the real catalogue.
//
// ⚠️ THE ASSERTION HERE IS THE RELAXATION INVARIANT, NOT "no two cards are ever
// within D". Cards CAN sit within D of each other, when the feasible pool has
// nothing else left to offer — that is fit winning at the margin, and it is
// the intended behaviour. What must hold is that it only ever happens for that
// reason: if a pick is within D of an earlier one, then EVERY candidate still
// unpicked at that moment was too.
{
  const walkingFamily = [
    "A walk with no destination",
    "Photo walk down your own street",
    "Walk a street you have never walked down",
    "Walk somewhere with a view and take a flask",
    "Trail running and hillwalking",
    "Hiking and hillwalking",
  ];

  let checked = 0;
  let relaxations = 0;
  const walkCounts = [];

  for (let axis = 0; axis < 7; axis++) {
    const picks = personalityQuestions.map((q) =>
      q.options.reduce((best, o) => (o.vector[axis] > best.vector[axis] ? o : best))
    );
    const purist = userVectorFromQuizTotals(
      picks.reduce((totals, p) => totals.map((t, i) => t + p.vector[i]), new Array(7).fill(0)),
      picks.length
    );

    for (const { tag } of PATHWAYS) {
      const ranked = rankActivities(purist, poolFor(tag));
      if (ranked.length === 0) continue;
      const selected = diverseSelect(ranked, DIVERSITY_MIN_DISTANCE, ranked.length);
      checked++;

      const kept = [];
      for (let k = 0; k < selected.length; k++) {
        const current = selected[k];
        const tooClose = kept.some(
          (earlier) => euclideanDistance(current.vector, earlier.vector) < DIVERSITY_MIN_DISTANCE
        );
        if (tooClose) {
          relaxations++;
          // Everything not yet picked at this point must ALSO have been too
          // close, or a distinct candidate was passed over.
          const pickedIds = new Set(selected.slice(0, k).map((a) => a.id));
          const missed = ranked.filter(
            (candidate) =>
              !pickedIds.has(candidate.id) &&
              kept.every(
                (earlier) =>
                  euclideanDistance(candidate.vector, earlier.vector) >= DIVERSITY_MIN_DISTANCE
              )
          );
          if (missed.length) {
            failures.push(
              `F4: axis ${axis} / ${tag}: took "${current.title}" within D of an earlier pick ` +
                `while "${missed[0].title}" was distinct and available`
            );
          }
        }
        kept.push(current);
      }

      const served = selected.slice(0, SHOWN_COUNT + MAX_REROLLS);
      walkCounts.push(served.filter((a) => walkingFamily.includes(a.title)).length);
    }
  }

  if (!failures.some((f) => f.startsWith("F4"))) {
    console.log(
      `  F4  ${checked} purist x pathway runs on the real seed: every within-D pick was a ` +
        `genuine relaxation (${relaxations} of them). OK`
    );
  }

  // DIAGNOSTIC, never a failure. D measures TASTE PROFILE, not surface
  // category, so several genuinely different walks can and do survive it. This
  // number is here so that limit stays visible instead of being assumed away.
  const worst = Math.max(...walkCounts);
  console.log(
    `  F4* diagnostic: the most walking-family cards served in one run is ${worst} ` +
      `of ${SHOWN_COUNT + MAX_REROLLS}.\n` +
      `      NOT a failure. The four core walks sit 5.39-8.89 apart on the canonical seed, ` +
      `so they are\n      not taste twins and D correctly leaves them alone. See the ` +
      `known limit in CLAUDE.md.`
  );
}

// ---------------------------------------------------------------------------
console.log("\n" + SEPARATOR);

if (failures.length) {
  console.log(`\n${failures.length} FAILURE(S):`);
  [...new Set(failures)].forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
console.log("\nAll pass/fail checks passed.");
