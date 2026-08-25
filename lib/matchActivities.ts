/**
 * Ranks activities by how well they suit a user's 7-axis personality vector.
 *
 * Pure and composable on purpose: no fetching, no filtering, no React, no
 * Supabase. Tag hard-filtering stays upstream of this, so the same function
 * serves the quiz results flow now and the merged engine later — the caller
 * decides what is feasible, this decides what fits.
 *
 * THE AXES, in the fixed project-wide order:
 *   [Social, Energy, Creative, Analytical, Outdoors, Novelty, Stimulation]
 * Each scored 1-10. Identical to data/personalityQuiz.ts and to the
 * `vector integer[]` column on `activities`. Never reorder one without the
 * others.
 *
 * WHY EUCLIDEAN DISTANCE
 *   Straight-line distance in 7 dimensions, so an activity is a good match
 *   when it sits near the user on every axis at once. Two alternatives were
 *   considered and rejected, both because they discard intensity:
 *
 *   - Dot product rewards magnitude. An activity vectored [10,10,10,10,10,10,10]
 *     scores higher against every user than any other activity, so one
 *     maximal row would win every quiz regardless of who took it.
 *   - Cosine similarity compares direction only. It calls a [2,2,2,2,2,2,2]
 *     user a perfect match for a [9,9,9,9,9,9,9] activity, because the vectors
 *     are parallel. Here that is exactly wrong: someone scoring low across the
 *     board wants something gentle, not the most intense thing available.
 *     Intensity is information in this model, not noise to normalise away.
 */

/** Axis names, in the fixed order every vector in this project uses. */
export const AXES = [
  "Social",
  "Energy",
  "Creative",
  "Analytical",
  "Outdoors",
  "Novelty",
  "Stimulation",
] as const;

export const AXIS_COUNT = 7;

/**
 * The largest distance two valid vectors can be apart: every axis maximally
 * opposed (1 vs 10, a gap of 9) across all 7 axes, so sqrt(7 * 9^2).
 * Roughly 23.81. Used to turn a raw distance into a 0-100 match percentage.
 */
export const MAX_DISTANCE = 9 * Math.sqrt(AXIS_COUNT);

/** The minimum an activity must look like for this module to rank it. */
export interface HasVector {
  vector?: number[] | null;
}

/** An activity decorated with its match, mirroring how app/page.tsx adds `score`. */
export type Ranked<T> = T & {
  /** Euclidean distance from the user's vector. Lower is better; 0 is exact. */
  distance: number;
  /** Distance rescaled to 0-100, where 100 is an exact match. */
  matchPercent: number;
};

/** True when `value` is usable as a vector: 7 finite numbers. */
export function isValidVector(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === AXIS_COUNT &&
    value.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

/** Straight-line distance between two 7-axis vectors. */
export function euclideanDistance(a: number[], b: number[]): number {
  let sumOfSquares = 0;
  for (let i = 0; i < AXIS_COUNT; i++) {
    const gap = a[i] - b[i];
    sumOfSquares += gap * gap;
  }
  return Math.sqrt(sumOfSquares);
}

/**
 * Converts a distance to a friendly 0-100 figure.
 *
 * Clamped because a vector sitting slightly outside 1-10 would otherwise
 * produce a percentage above 100 or below 0. The database CHECK constraint
 * keeps stored vectors in range, but a user vector is computed at runtime and
 * this is a display number — nonsense values should not reach the UI.
 */
export function matchPercentFor(distance: number): number {
  const percent = (1 - distance / MAX_DISTANCE) * 100;
  return Math.min(100, Math.max(0, percent));
}

/**
 * Builds the user's vector from the quiz's raw per-axis sums.
 *
 * Divides by the question count to land on the same 1-10 scale the activities
 * use, and DELIBERATELY DOES NOT ROUND. This is the same rule that governs
 * determinePersonalityType in components/PersonalityQuiz.tsx: rounding is for
 * display only, and any precision lost before a comparison silently collapses
 * distinct answers onto identical values. There it inflated the tie rate to
 * 58%; here it would flatten genuinely different users onto the same match
 * ordering. See the scoring section of CLAUDE.md.
 */
export function userVectorFromQuizTotals(
  totals: number[],
  questionCount: number
): number[] {
  if (!isValidVector(totals)) {
    throw new TypeError(
      `userVectorFromQuizTotals: totals must be ${AXIS_COUNT} finite numbers, got ${JSON.stringify(totals)}`
    );
  }
  if (!Number.isFinite(questionCount) || questionCount <= 0) {
    throw new RangeError(
      `userVectorFromQuizTotals: questionCount must be a positive number, got ${questionCount}`
    );
  }
  return totals.map((total) => total / questionCount);
}

/**
 * Ranks `activities` by closeness to `userVector`, nearest first.
 *
 * `userVector` must be on the activities' own 1-10 scale — use
 * userVectorFromQuizTotals to get there from raw quiz sums.
 *
 * Activities whose vector is null or malformed are SKIPPED, not fatal: seed
 * data is edited by hand and rows arrive from Supabase untyped, so one bad row
 * must not take down the whole results page. Callers wanting to surface that
 * can compare the returned length against what they passed in.
 *
 * Throws only if `userVector` itself is invalid, which is a caller bug rather
 * than bad data — returning an empty list there would hide it.
 *
 * Sorting is stable (guaranteed by the language since ES2019), so activities
 * at an identical distance keep the order they were given in.
 */
export function rankActivities<T extends HasVector>(
  userVector: number[],
  activities: readonly T[]
): Ranked<T>[] {
  if (!isValidVector(userVector)) {
    throw new TypeError(
      `rankActivities: userVector must be ${AXIS_COUNT} finite numbers on the 1-10 scale, got ${JSON.stringify(userVector)}`
    );
  }
  if (!Array.isArray(activities)) return [];

  const ranked: Ranked<T>[] = [];

  for (const activity of activities) {
    const vector = activity?.vector;
    if (!isValidVector(vector)) continue;

    const distance = euclideanDistance(userVector, vector);
    ranked.push({
      ...activity,
      distance,
      matchPercent: matchPercentFor(distance),
    });
  }

  return ranked.sort((a, b) => a.distance - b.distance);
}
