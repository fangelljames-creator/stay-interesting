/**
 * The feasibility half of the results pipeline — pathway filter, the per-answer
 * hard filters, graceful relaxation, and the rotation penalty.
 *
 * ⚠️ THIS IS A MOVE, NOT A REWRITE. Every function here came verbatim out of
 * `findMatches` in app/page.tsx. Nothing about the behaviour changed, and the
 * three details below are exactly the ones a well-meaning rewrite gets wrong.
 *
 * WHY IT MOVED. app/page.tsx is `"use client"`, uses `@/` path aliases and
 * contains JSX, so no Node dev script can import a single line of it — and the
 * relaxation ladder lived in the middle of it. That meant the one piece of
 * logic that decides what a user is actually allowed to see had never been
 * checked by anything, and `scripts/verify-results-selection.mjs` says so in as
 * many words: it deliberately does not re-implement relaxation, so its pool
 * sizes are pre-relaxation and pessimistic.
 *
 * The activity reachability audit cannot be written at all without the ladder.
 * The choice was to hand-mirror it in the script or to move it somewhere both
 * callers can reach, and this project has already been bitten once by a script
 * that mirrored the code it was checking (see the note on analyze-quiz-balance
 * in CLAUDE.md). So: one implementation, imported by the page and by the audit.
 *
 * Pure on the same terms as lib/matchActivities.ts and lib/resultsSelection.ts:
 * no React, no Supabase, no `sessionStorage`. The page keeps the fetch and the
 * storage reads and hands the results in.
 */
// Relative with the explicit .ts extension: siblings in lib/, and the dev
// scripts import these files directly under Node.
import {
  satisfiesFilter,
  type FilterAction,
  type PathwayTag,
} from "./activityTags.ts";
import {
  MIN_RESULTS,
  RELAXATION_STEPS,
  widenTime,
  type ConstraintKind,
  type FeasibilityQuestion,
} from "./feasibilityQuestions.ts";

/**
 * The minimum an activity has to look like for this module. Rows arrive from
 * Supabase untyped, so `tags` really can be absent on a malformed one.
 */
export interface Taggable {
  tags?: string[] | null;
}

/** An answer, paired with the constraint its question governs. */
export interface Constraint {
  kind: ConstraintKind;
  action: FilterAction;
}

/** Rows carrying the pathway tag. Everything downstream works on this. */
export function poolFor<T extends Taggable>(
  activities: readonly T[],
  pathwayTag: PathwayTag
): T[] {
  return activities.filter((a) => a.tags?.includes(pathwayTag));
}

/**
 * Pair every answer with the constraint its question governs, so relaxation
 * knows what each one is. A missing answer is `none` rather than an error —
 * the page can reach here with a short array if a question is ever added.
 */
export function constraintsFrom(
  questions: readonly FeasibilityQuestion[],
  answers: readonly FilterAction[]
): Constraint[] {
  return questions.map((question, index) => ({
    kind: question.constraint,
    action: answers[index] ?? ({ kind: "none" } as FilterAction),
  }));
}

/** Every candidate that satisfies every constraint at once. */
export function applyFilters<T extends Taggable>(
  candidates: readonly T[],
  constraints: readonly Constraint[]
): T[] {
  return candidates.filter((a) =>
    constraints.every((c) => satisfiesFilter(a.tags ?? [], c.action))
  );
}

/** What survived, and which constraints had to be bent to get there. */
export interface SelectionResult<T> {
  survivors: T[];
  /** Human-readable labels of the bent steps, in the order they were bent. */
  bent: string[];
}

/**
 * GRACEFUL RELAXATION. Bend one thing at a time, in a fixed order, and only far
 * enough to reach MIN_RESULTS.
 *
 * ⚠️ COST AND COMPANY ARE NEVER IN RELAXATION_STEPS, so they cannot be bent
 * here however empty the pool gets. Someone who said "keep it free" cannot act
 * on a paid suggestion and someone on their own cannot act on one needing three
 * people; those are facts about their situation, not preferences to nudge.
 *
 * Three details that are easy to lose in a rewrite, and all three change the
 * results if you do:
 *
 *   1. EACH PASS RE-FILTERS `pool`, NEVER THE SHRINKING `survivors`. Relaxing a
 *      constraint has to be able to bring rows BACK, and filtering the survivors
 *      again can only ever remove more.
 *   2. `constraints` MUTATE CUMULATIVELY across steps. Bending place and then
 *      energy leaves both bent, not just energy.
 *   3. A `widenTime` RETURNING null DOES NOT COUNT AS A CHANGE, so the step
 *      pushes no label. Relaxation is disclosed to the user by name, and
 *      claiming to have bent something that was already at the top of the
 *      ladder is a lie in the copy.
 */
export function selectSurvivors<T extends Taggable>(
  pool: readonly T[],
  initialConstraints: readonly Constraint[],
  pathwayTag: PathwayTag
): SelectionResult<T> {
  let constraints = [...initialConstraints];
  let survivors = applyFilters(pool, constraints);

  const bent: string[] = [];
  for (const step of RELAXATION_STEPS) {
    if (survivors.length >= MIN_RESULTS) break;

    let changedSomething = false;
    constraints = constraints.map((c) => {
      // An answer that already filters nothing cannot be relaxed further,
      // and must not be reported as though it had been.
      if (!step.kinds.includes(c.kind) || c.action.kind === "none") return c;

      if (c.kind === "time") {
        const widened = widenTime(c.action, pathwayTag);
        if (!widened) return c;
        changedSomething = true;
        return { ...c, action: widened };
      }

      changedSomething = true;
      return { ...c, action: { kind: "none" } as FilterAction };
    });

    if (changedSomething) {
      bent.push(step.label);
      survivors = applyFilters(pool, constraints);
    }
  }

  return { survivors, bent };
}

/**
 * How much further away a recently-shown activity is treated as being.
 *
 * ⚠️ IT MOVES THE SORT KEY ONLY. The `matchPercent` on the card stays the true
 * distance — letting the penalty reach the displayed number would make the card
 * lie about the fit in order to make rotation work.
 */
export const ROTATION_DISTANCE_PENALTY = 1.35;

/** Rows that carry a rankActivities distance and an id. */
interface RotatableRow {
  id: string;
  distance: number;
}

/**
 * Ranked rows re-sorted so recently-shown ones sink. Stable and non-mutating;
 * an empty `recentShownIds` returns the same order it was given.
 */
export function applyRotation<T extends RotatableRow>(
  ranked: readonly T[],
  recentShownIds: readonly string[]
): T[] {
  if (recentShownIds.length === 0) return [...ranked];
  const recent = new Set(recentShownIds);
  const sortKey = (a: T) => (recent.has(a.id) ? a.distance * ROTATION_DISTANCE_PENALTY : a.distance);
  return [...ranked].sort((a, b) => sortKey(a) - sortKey(b));
}
