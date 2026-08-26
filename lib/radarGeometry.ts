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
 * ⚠️ NOTHING HERE ROUNDS except labelValue, which exists solely to produce the
 * number printed beside an axis. Every coordinate is computed from the raw,
 * unrounded value. That is the same rule that governs the scoring path: see
 * userVectorFromQuizTotals and the scoring section of CLAUDE.md.
 */
// Relative with the explicit .ts extension: a sibling in lib/, and the dev
// scripts import this file directly under Node.
import { AXES, AXIS_COUNT, isValidVector } from "./matchActivities.ts";

export { AXES, AXIS_COUNT };

/** The bounds every vector in this project lives inside, on both sides. */
export const VALUE_MIN = 1;
export const VALUE_MAX = 10;

/**
 * The midpoint of the scale, used as the "nothing answered yet" shape in the
 * quiz's building-mode radar. A regular heptagon halfway out: visibly a shape,
 * visibly not a result, and the first real answer is a visible reshape rather
 * than a polygon appearing out of nothing.
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

/** `value` held inside the 1-10 scale. Non-finite input floors to VALUE_MIN. */
export function clampValue(value: number): number {
  if (!Number.isFinite(value)) return VALUE_MIN;
  return Math.min(VALUE_MAX, Math.max(VALUE_MIN, value));
}

/**
 * How far out along its axis a value sits, as 0-1.
 *
 * 1 maps to 0 and 10 maps to 1, so the whole chart is used by the range that
 * can actually occur. An all-1s vector therefore collapses to a single point
 * at the centre, which is honest: that user scored the floor on every axis.
 */
export function valueFraction(value: number): number {
  return (clampValue(value) - VALUE_MIN) / (VALUE_MAX - VALUE_MIN);
}

/** The SVG coordinate for `value` on axis `index`. */
export function radarPoint(
  value: number,
  index: number,
  radius: number,
  center: number
): Point {
  const angle = axisAngle(index);
  const distance = valueFraction(value) * radius;
  return {
    x: center + distance * Math.cos(angle),
    y: center + distance * Math.sin(angle),
  };
}

/** Formats points for an SVG `points` attribute. */
function serialise(points: Point[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

/**
 * The filled taste shape, as a `points` string.
 *
 * Throws on a malformed vector rather than drawing something misleading. That
 * mirrors rankActivities: bad ACTIVITY data is skipped because rows arrive
 * from Supabase untyped, but a bad USER vector is a caller bug, and a silently
 * empty chart would hide it.
 */
export function polygonPoints(
  vector: number[],
  radius: number,
  center: number
): string {
  if (!isValidVector(vector)) {
    throw new TypeError(
      `polygonPoints: vector must be ${AXIS_COUNT} finite numbers, got ${JSON.stringify(vector)}`
    );
  }
  return serialise(vector.map((value, index) => radarPoint(value, index, radius, center)));
}

/**
 * A gridline ring at `fraction` of full radius (0-1), as a `points` string.
 * Heptagonal rather than circular so the grid shares the shape's own geometry.
 */
export function ringPoints(fraction: number, radius: number, center: number): string {
  const scaled = Math.min(1, Math.max(0, fraction)) * radius;
  const points: Point[] = [];
  for (let index = 0; index < AXIS_COUNT; index++) {
    const angle = axisAngle(index);
    points.push({
      x: center + scaled * Math.cos(angle),
      y: center + scaled * Math.sin(angle),
    });
  }
  return serialise(points);
}

/** The outer end of axis `index`'s spoke — the same point a 10 would occupy. */
export function axisSpokeEnd(index: number, radius: number, center: number): Point {
  return radarPoint(VALUE_MAX, index, radius, center);
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
 * ⚠️ THE ONLY ROUNDING IN THE RADAR, and it is display-only.
 *
 * Used for the number printed beside an axis label and in its tooltip. The
 * value handed to radarPoint/polygonPoints is never passed through here — a
 * rounded coordinate would make the drawn shape disagree with the vector that
 * actually ranks the user's activities.
 */
export function labelValue(value: number): number {
  return Math.round(clampValue(value));
}

/** The "nothing answered yet" shape: the midpoint on every axis. */
export function neutralVector(): number[] {
  return new Array(AXIS_COUNT).fill(NEUTRAL_VALUE);
}
