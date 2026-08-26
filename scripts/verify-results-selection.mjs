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
 *   D. Pool size    — pass/fail. min(5, survivors - 3), every combination.
 *   E. Reroll       — pass/fail. Exhausts exactly, never returns a discard,
 *                     and every replacement carries its true matchPercent.
 */
import {
  availableWildcards,
  drawRandom,
  rerollPoolFrom,
  REROLL_POOL_START,
  REROLL_POOL_END,
} from "../lib/resultsSelection.ts";
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
  `Reroll pool is ranks ${REROLL_POOL_START + 1}-${REROLL_POOL_END} ` +
    `(max ${REROLL_POOL_END - REROLL_POOL_START} rerolls, shared by ${MIN_RESULTS} cards).\n`
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
// CHECK D — Reroll pool size
//
// The pool is ranks 4-8 of the ranked survivors and is SHARED by the three
// slots, so its size is exactly how many rerolls the user gets in total.
// ---------------------------------------------------------------------------
console.log("\n\nCHECK D — Reroll pool: min(5, survivors - 3), every combination\n");

for (const { tag, questions, label } of PATHWAYS) {
  const pool = poolFor(tag);
  const histogram = new Map();

  for (const { actions } of everyCombination(questions)) {
    const ordered = rankActivities(userVector, survivorsFor(pool, actions));
    const size = rerollPoolFrom(ordered).length;
    const expected = Math.min(
      REROLL_POOL_END - REROLL_POOL_START,
      Math.max(0, ordered.length - REROLL_POOL_START)
    );

    if (size !== expected) {
      failures.push(
        `${label}: ${ordered.length} survivors gave a pool of ${size}, expected ${expected}`
      );
    }
    histogram.set(size, (histogram.get(size) ?? 0) + 1);
  }

  const spread = [...histogram.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([size, count]) => `${size}:${count}`)
    .join("  ");
  console.log(`  ${label.padEnd(6)} pool size:count  ${spread}`);
}

// ---------------------------------------------------------------------------
// CHECK E — Rerolling: exhausts exactly, never returns, keeps its numbers true
// ---------------------------------------------------------------------------
console.log("\n\nCHECK E — Reroll runs: exhaustion, permanence, and honest percentages\n");

{
  const rng = makeRng(1312);
  let runs = 0;
  let totalRerolls = 0;
  let collisions = 0;

  for (const { tag, questions, label } of PATHWAYS) {
    const pool = poolFor(tag);

    for (const { actions } of everyCombination(questions)) {
      const ordered = rankActivities(userVector, survivorsFor(pool, actions));
      let shown = ordered.slice(0, MIN_RESULTS);
      let poolLeft = rerollPoolFrom(ordered);
      const expectedRerolls = poolLeft.length;
      const discarded = [];

      const wildcard = drawRandom(
        availableWildcards(pool, shown.map((a) => a.id)),
        rng
      );

      let rerolls = 0;
      // Cycle the three slots, exactly as a user clicking around would.
      while (poolLeft.length > 0 && rerolls < expectedRerolls + 2) {
        const slot = rerolls % Math.max(1, shown.length);
        const outgoing = shown[slot];
        if (!outgoing) break;

        const replacement = drawRandom(poolLeft, rng);
        if (!replacement) {
          failures.push(`${label}: pool had ${poolLeft.length} left but drew nothing`);
          break;
        }

        // The number on a replacement card must be its own true distance.
        const expectedPercent = matchPercentFor(replacement.distance);
        if (replacement.matchPercent !== expectedPercent) {
          failures.push(
            `${label}: replacement "${replacement.title}" shows ${replacement.matchPercent} ` +
              `but its distance says ${expectedPercent}`
          );
        }

        if (discarded.includes(replacement.id)) {
          failures.push(`${label}: "${replacement.title}" was rerolled away and came back`);
        }
        if (wildcard && replacement.id === wildcard.id) collisions++;

        discarded.push(outgoing.id);
        shown = shown.map((a, i) => (i === slot ? replacement : a));
        poolLeft = poolLeft.filter((a) => a.id !== replacement.id);
        rerolls++;
      }

      if (rerolls !== expectedRerolls) {
        failures.push(
          `${label}: pool of ${expectedRerolls} allowed ${rerolls} reroll(s), expected ${expectedRerolls}`
        );
      }
      // The control hides on an empty pool; the pool must actually reach empty.
      if (poolLeft.length !== 0) {
        failures.push(`${label}: ${poolLeft.length} left in the pool after exhausting it`);
      }
      // Permanence, checked at the end over the whole run.
      const returned = shown.filter((a) => discarded.includes(a.id));
      if (returned.length) {
        failures.push(
          `${label}: discarded card(s) back on screen — ${returned.map((a) => a.title).join(", ")}`
        );
      }

      runs++;
      totalRerolls += rerolls;
    }
  }

  console.log(
    `  ${runs} runs, ${totalRerolls} rerolls, every pool exhausted exactly and nothing returned.`
  );
  console.log(
    `  ${collisions} replacement(s) landed on the row then showing as the wildcard — which is\n` +
      `  why rerollCard in app/page.tsx redraws the wildcard on a collision.`
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
