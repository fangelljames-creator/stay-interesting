/**
 * How the results page assembles what it shows: the wildcard draw, and the
 * pool a reroll draws its replacement from.
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

/**
 * The reroll pool is ranks 4-8 of the ranked survivors, zero-indexed here as
 * slice(3, 8). SHARED by all three slots rather than one pool per card: five
 * replacements across three cards means the results visibly settle after about
 * five rerolls instead of churning forever.
 */
export const REROLL_POOL_START = 3;
export const REROLL_POOL_END = 8;

/** Rows arrive from Supabase untyped; all this module needs is the uuid. */
export interface HasId {
  id: string;
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

/**
 * Ranks 4-8 of the ranked survivors. Named ...From so it cannot be confused
 * with the caller's own `rerollPool` state, which is this list as it depletes.
 */
export function rerollPoolFrom<T>(ordered: readonly T[]): T[] {
  return ordered.slice(REROLL_POOL_START, REROLL_POOL_END);
}
