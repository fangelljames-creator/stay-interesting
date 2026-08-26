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
 * THE WILDCARD RULE (supersedes "the wildcard may stretch taste, never
 * feasibility"). The wildcard is drawn at random from the user's PATHWAY and
 * deliberately ignores both the taste ranking and the practical filters — that
 * is the whole point of it. BUDGET IS THE ONE EXCEPTION and is never violated:
 * someone who said "keep it free" cannot act on a paid suggestion, so offering
 * one is not a surprise, it is a dead card. This is the same argument that
 * keeps `cost` out of RELAXATION_STEPS in lib/feasibilityQuestions.ts.
 */
import { satisfiesFilter, type FilterAction } from "./activityTags.ts";

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

/** Anything carrying tags. Nullable because a DB row's array can be null. */
export interface HasTags {
  tags?: readonly string[] | null;
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
 * The wildcard's candidate set: everything on the pathway that the user's
 * budget answer permits, and NOTHING else filtered out.
 *
 * This single filter IS the budget exception. Dropping it — returning the pool
 * untouched — is the whole of "full chaos", should that ever be wanted.
 */
export function wildcardEligible<T extends HasTags>(
  pathwayPool: readonly T[],
  costAction: FilterAction
): T[] {
  return pathwayPool.filter((activity) => satisfiesFilter(activity.tags ?? [], costAction));
}

/**
 * Eligible wildcards minus everything the user has already seen: the cards on
 * screen now, and everything rerolled away. A rerolled card never comes back,
 * as a ranked card or as a wildcard.
 */
export function availableWildcards<T extends HasId>(
  eligible: readonly T[],
  excludedIds: readonly string[]
): T[] {
  const excluded = new Set(excludedIds);
  return eligible.filter((activity) => !excluded.has(activity.id));
}

/**
 * Ranks 4-8 of the ranked survivors. Named ...From so it cannot be confused
 * with the caller's own `rerollPool` state, which is this list as it depletes.
 */
export function rerollPoolFrom<T>(ordered: readonly T[]): T[] {
  return ordered.slice(REROLL_POOL_START, REROLL_POOL_END);
}
