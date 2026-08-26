/**
 * The geometry behind the taste radar — vector in, SVG coordinates out.
 *
 * Pure and composable on the same terms as lib/matchActivities.ts: no React,
 * no Supabase, no DOM. It lives in its own module rather than inside
 * components/TasteRadar.tsx for one specific reason — a component marked
 * "use client" cannot be imported by a dev script, and the project has already
 * been bitten once by a script that hand-mirrored the code it was checking
 * (see the note on analyze-quiz-balance.mjs in CLAUDE.md). Keeping the maths
 * here lets scripts/verify-taste-radar.mjs import the REAL functions.
 *
 * THE AXES are not redeclared here. AXES and AXIS_COUNT come from
 * lib/matchActivities.ts, which is the project's single statement of the fixed
 * order [Social, Energy, Creative, Analytical, Outdoors, Novelty, Stimulation].
 * A second copy of that list is exactly how two ends of a comparison drift.
 *
 * ⚠️ THE RADAR DRAWS SHAPE, NEVER MAGNITUDE. Every polygon is normalised for
 * display before it is plotted — see normalizeForDisplay. This is a DISPLAY
 * transform and nothing else in the project sees it: scoring, session storage
 * and rankActivities all keep working on the raw vector. Nothing here rounds
 * either, and no number computed here is ever printed — the chart carries axis
 * names only.
 */
// Relative with the explicit .ts extension: a sibling in lib/, and the dev
// scripts import this file directly under Node.
import { AXES, AXIS_COUNT, isValidVector } from "./matchActivities.ts";

export { AXES, AXIS_COUNT };

/** The bounds every vector in this project lives inside, on both sides. */
export const VALUE_MIN = 1;
export const VALUE_MAX = 10;

/**
 * How far out the LARGEST axis of any shape is plotted, as a fraction of the
 * radius. Just short of the outer ring, so a full-strength axis has somewhere
 * to sit without touching the edge.
 */
export const DISPLAY_MAX_FRACTION = 0.92;

/**
 * The value used for the "nothing answered yet" ghost. Any flat value would
 * draw the same normalised shape — a regular heptagon — so this is a
 * placeholder rather than a meaningful score.
 */
export const NEUTRAL_VALUE = (VALUE_MIN + VALUE_MAX) / 2;

/** A point in the SVG's own coordinate space. */
export interface Point {
  x: number;
  y: number;
}

/**
 * Where axis `index` points, in radians.
 *
 * -PI/2 puts the first axis (Social) at twelve o'clock, and the rest follow
 * clockwise at even 2PI/7 intervals. Clockwise because SVG's y axis grows
 * downward, so a positive angle step reads as clockwise on screen.
 */
export function axisAngle(index: number): number {
  return -Math.PI / 2 + (index * 2 * Math.PI) / AXIS_COUNT;
}

/**
 * ⚠️ THE DISPLAY NORMALISATION. Turns a vector into the fractions of the
 * radius its axes are plotted at, scaled so the LARGEST axis lands at
 * DISPLAY_MAX_FRACTION and every ratio between axes is preserved exactly.
 *
 * WHY THIS EXISTS. The user's vector is a running MEAN of their answers, and
 * a mean of honestly-scored options pulls every axis toward the middle of the
 * option pool. Plotted raw, the shape therefore SHRANK as the quiz went on —
 * the more the user told us, the smaller their map got — and a finished
 * profile sat as a small blob near the centre. The information a reader wants
 * from a radar is which axes dominate, and that is a matter of the ratios
 * between axes, not of how large the numbers happen to be.
 *
 * So: one scale factor, applied to all seven axes together. That makes the
 * transform scale-invariant by construction — normalizeForDisplay(v) and
 * normalizeForDisplay(2v) are the same shape, because they ARE the same shape.
 * A flat vector normalises to a regular heptagon at the target fraction,
 * whatever flat value it held.
 *
 * ⚠️ WHAT THIS COSTS, stated plainly: absolute intensity is no longer
 * readable off the chart. Two users, one gentle and one intense, whose axes
 * sit in the same proportions, draw the same polygon. That is a deliberate
 * trade — intensity is still information the MATCHER uses (it is precisely why
 * Euclidean distance was chosen over cosine similarity; see
 * lib/matchActivities.ts), it just is not information this chart carries. If
 * that ever needs showing, it needs a second visual channel, not the removal
 * of this normalisation.
 *
 * ⚠️ DISPLAY ONLY. Nothing but the drawing calls this. Do not let a normalised
 * vector reach the session, the profile argmax, or rankActivities — every one
 * of those depends on the raw magnitudes this deliberately discards.
 */
export function normalizeForDisplay(vector: number[]): number[] {
  if (!isValidVector(vector)) {
    throw new TypeError(
      `normalizeForDisplay: vector must be ${AXIS_COUNT} finite numbers, got ${JSON.stringify(vector)}`
    );
  }

  // Floored at zero, NOT clamped to 1-10. Two reasons, and the first is the
  // load-bearing one:
  //
  //   - Clamping the top would break scale invariance. normalizeForDisplay(2v)
  //     has to equal normalizeForDisplay(v), and it cannot if doubling pushes
  //     an axis into a 10 ceiling that the original never touched.
  //   - No ceiling is needed anyway. Dividing by the largest axis means the
  //     largest axis always lands at DISPLAY_MAX_FRACTION, so an out-of-range
  //     value cannot escape the chart by construction — it simply becomes the
  //     reference the others are measured against.
  //
  // The floor stays because a negative axis would plot on the OPPOSITE side of
  // the centre, turning the polygon inside out. Vectors are 1-10 by contract
  // on both sides, so this is a guard against garbage, not a scale.
  const floored = vector.map((value) => Math.max(0, value));

  const largest = Math.max(...floored);
  // Only reachable if every axis is zero or negative, which no valid vector
  // is. Draw the even heptagon rather than dividing by zero into an invisible
  // chart full of NaN coordinates.
  if (!(largest > 0)) return new Array<number>(AXIS_COUNT).fill(DISPLAY_MAX_FRACTION);

  const scale = DISPLAY_MAX_FRACTION / largest;
  return floored.map((value) => value * scale);
}

/** The SVG coordinate at `fraction` of the radius along axis `index`. */
export function fractionPoint(
  fraction: number,
  index: number,
  radius: number,
  center: number
): Point {
  const angle = axisAngle(index);
  const distance = fraction * radius;
  return {
    x: center + distance * Math.cos(angle),
    y: center + distance * Math.sin(angle),
  };
}

/**
 * The seven vertices of the drawn shape, normalised.
 *
 * This and polygonPoints are the ONLY ways a vector should reach the chart —
 * both normalise internally, so no caller can forget to and quietly plot a raw
 * magnitude next to six normalised ones.
 */
export function radarVertices(vector: number[], radius: number, center: number): Point[] {
  return normalizeForDisplay(vector).map((fraction, index) =>
    fractionPoint(fraction, index, radius, center)
  );
}

/** Formats points for an SVG `points` attribute. */
function serialise(points: Point[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

/**
 * The filled taste shape, as a `points` string. Normalised — see
 * normalizeForDisplay.
 *
 * Throws on a malformed vector rather than drawing something misleading. That
 * mirrors rankActivities: bad ACTIVITY data is skipped because rows arrive
 * from Supabase untyped, but a bad USER vector is a caller bug, and a silently
 * empty chart would hide it.
 */
export function polygonPoints(vector: number[], radius: number, center: number): string {
  return serialise(radarVertices(vector, radius, center));
}

/**
 * A gridline ring at `fraction` of full radius (0-1), as a `points` string.
 * Heptagonal rather than circular so the grid shares the shape's own geometry.
 *
 * ⚠️ The rings are STRUCTURE, not a scale. Since every shape is normalised,
 * there is no value a ring could stand for — they exist to give the chart a
 * readable frame, which is also why no number is printed against them.
 */
export function ringPoints(fraction: number, radius: number, center: number): string {
  const scaled = Math.min(1, Math.max(0, fraction));
  const points: Point[] = [];
  for (let index = 0; index < AXIS_COUNT; index++) {
    points.push(fractionPoint(scaled, index, radius, center));
  }
  return serialise(points);
}

/** The outer end of axis `index`'s spoke, at the full radius. */
export function axisSpokeEnd(index: number, radius: number, center: number): Point {
  return fractionPoint(1, index, radius, center);
}

/**
 * Where axis `index`'s text label sits: just outside the outer ring, so the
 * label clears the shape at full extension.
 */
export function axisLabelPoint(
  index: number,
  radius: number,
  center: number,
  offset = 16
): Point {
  const angle = axisAngle(index);
  const distance = radius + offset;
  return {
    x: center + distance * Math.cos(angle),
    y: center + distance * Math.sin(angle),
  };
}

/**
 * The "nothing answered yet" shape: flat, so it normalises to a regular
 * heptagon. Drawn faded by the component — it is a frame waiting to be filled,
 * not somebody's taste.
 */
export function neutralVector(): number[] {
  return new Array<number>(AXIS_COUNT).fill(NEUTRAL_VALUE);
}
