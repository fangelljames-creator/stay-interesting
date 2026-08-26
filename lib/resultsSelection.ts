/**
 * How the results page assembles what it shows: the diversity re-rank, and the
 * wildcard draw.
 *
 * The reroll pool used to live here too. It moved to lib/rerollMachine.ts when
 * rerolls became a deterministic queue owned by a reducer -- the pool is not a
 * standalone list any more, it is state that only makes sense next to what is
 * on screen and what has been discarded.
 *
 * Pure and composable for the same reason lib/matchActivities.ts is — no
 * fetching, no React, no Supabase. Both rules here have real edge cases
 * (pool exhaustion, collisions, permanent exclusion) and the standing rule in
 * this project is that dev scripts import the REAL definitions rather than
 * mirroring them by hand. Mirroring is exactly how analyze-quiz-balance.mjs
 * became something that goes stale in lockstep with the code it checks.
 *
 * THE WILDCARD RULE (2026-08-26, "full chaos" — Owen's decision). The wildcard
 * is drawn at random from the user's PATHWAY and obeys NOTHING ELSE. Not the
 * taste ranking, not the practical filters, and NOT BUDGET. The only things it
 * will not hand back are the cards already on screen and anything rerolled
 * away, because showing a duplicate is not a surprise, it is a bug.
 *
 * There was briefly a budget exception, on the argument that a suggestion you
 * cannot afford is a dead card rather than a surprise. Owen dropped it: the
 * wildcard is meant to be the one place the answers do not apply, and half a
 * rule is harder to explain than none. The card is labelled to say so.
 *
 * ⚠️ This is the WILDCARD ONLY. It is not licence to relax cost anywhere else:
 * `cost` and `company` stay out of RELAXATION_STEPS in
 * lib/feasibilityQuestions.ts, so the three ranked cards still respect a
 * budget answer absolutely. One deliberately labelled random card is a
 * different thing from a ranked recommendation the user cannot act on.
 */

// Sibling in lib/, with the explicit .ts extension so the dev scripts can load
// this file under Node.
import { euclideanDistance, isValidVector, type HasVector } from "./matchActivities.ts";

/** Rows arrive from Supabase untyped; all this module needs is the uuid. */
export interface HasId {
  id: string;
}

/**
 * ⚠️ THE DIVERSITY THRESHOLD, D. Two activities closer than this to EACH OTHER
 * are the same idea as far as the results are concerned, and only one of them
 * is worth a slot.
 *
 * CHOSEN FROM MEASUREMENT, 2026-08-26 — run
 * `node scripts/measure-activity-diversity.mjs` to reproduce the report, and
 * see the diversity section of CLAUDE.md for the full rationale. In short: on
 * the 134-row catalogue, 3.0 sits on the quick-fix 5th percentile of
 * within-pathway distances and the long-term 2nd, so it prunes the tail of
 * true twins and leaves the body of the distribution alone. Both pathways
 * agree closely enough that a second constant would be a second thing to keep
 * true.
 *
 * The geometric half: by the reverse triangle inequality, two activities this
 * close can never differ by more than (3.0 / 23.81) * 100 = 12.6 match points
 * for ANY user. Showing both spends a slot restating something already on
 * screen.
 */
export const DIVERSITY_MIN_DISTANCE = 3.0;

/**
 * Greedy diverse re-rank: fit decides the order, D decides whether the next
 * candidate is a NEW IDEA or a restatement of one already picked.
 *
 * WHY THIS EXISTS. rankActivities sorts by distance from the USER, and has no
 * idea two activities can be near-identical to EACH OTHER. So a cluster that
 * suits someone well ranks adjacently and takes every slot -- three ways of
 * saying "go and look at nature" for an Outdoors user, with the reroll queue
 * serving more of the same behind them.
 *
 * THE RULE
 *   - The best-fitting candidate is ALWAYS taken. Fit is still what ranks.
 *   - After that, take the first candidate at least `minDistance` from EVERY
 *     pick so far.
 *   - If nothing qualifies, RELAX and take the best remaining by fit. Fit wins
 *     at the margin: a slot is never left empty to protect a rule, and this
 *     never returns fewer than `n` while candidates exist.
 *
 * ⚠️ WHY A SINGLE FORWARD PASS IS THE WHOLE ALGORITHM. Eligibility only ever
 * shrinks: a candidate rejected for sitting too close to some pick stays too
 * close to it forever, because picks are only ever added. So a candidate
 * passed over can never qualify later, and there is nothing to re-scan for.
 * That is also why the relaxation tail is a plain "take what is left in fit
 * order" -- once one relaxed pick is made, every subsequent slot relaxes too.
 *
 * Deterministic, and stable for equal distances: every choice is "first in the
 * given order", so ties keep the order rankActivities handed over.
 *
 * A candidate whose vector is unusable is never REJECTED for similarity --
 * nothing can be measured, so it is treated as distinct rather than quietly
 * demoted. rankActivities already drops malformed rows upstream, so this is a
 * guard rather than a path.
 */
export function diverseSelect<T extends HasVector>(
  ranked: readonly T[],
  minDistance: number,
  n: number
): T[] {
  const picked: T[] = [];
  const pickedVectors: number[][] = [];
  const taken = new Array<boolean>(ranked.length).fill(false);

  const take = (index: number) => {
    taken[index] = true;
    picked.push(ranked[index]);
    const vector = ranked[index]?.vector;
    if (isValidVector(vector)) pickedVectors.push(vector);
  };

  for (let i = 0; i < ranked.length && picked.length < n; i++) {
    const vector = ranked[i]?.vector;
    const distinct =
      !isValidVector(vector) ||
      pickedVectors.every((other) => euclideanDistance(vector, other) >= minDistance);
    if (distinct) take(i);
  }

  // Relaxation. Only reached when the diverse pass ran out of NEW ideas before
  // it ran out of slots -- a thin pool, or a user whose whole feasible set is
  // one cluster. Best remaining fit, in order.
  for (let i = 0; i < ranked.length && picked.length < n; i++) {
    if (!taken[i]) take(i);
  }

  return picked;
}

/**
 * Injectable randomness. Defaults to Math.random; the dev script passes a
 * seeded generator so its runs are reproducible. Keeping the Math.random call
 * in this module rather than a component body is also what keeps eslint's
 * react-hooks/purity quiet — the same reason pickRandomOption sits at module
 * scope in components/PersonalityQuiz.tsx.
 */
export type Rng = () => number;

/** One element of `candidates` at random, or null when there are none. */
export function drawRandom<T>(candidates: readonly T[], rng: Rng = Math.random): T | null {
  if (candidates.length === 0) return null;
  // Clamped: Math.random() never returns 1, but an injected rng might, and an
  // off-the-end index would hand back undefined instead of an activity.
  const index = Math.min(Math.floor(rng() * candidates.length), candidates.length - 1);
  return candidates[index];
}

/**
 * The wildcard's candidate set: the pathway pool minus everything the user has
 * already seen — the cards on screen now, and everything rerolled away. A
 * rerolled card never comes back, as a ranked card or as a wildcard.
 *
 * THIS IS THE WHOLE OF THE WILDCARD RULE. There is deliberately no filtering
 * step above it: no cost ceiling, no time, no company, nothing. If a filter is
 * ever added here again, the label on the card has to change in the same
 * commit, because the card currently promises the user that none applies.
 */
export function availableWildcards<T extends HasId>(
  pathwayPool: readonly T[],
  excludedIds: readonly string[]
): T[] {
  const excluded = new Set(excludedIds);
  return pathwayPool.filter((activity) => !excluded.has(activity.id));
}
