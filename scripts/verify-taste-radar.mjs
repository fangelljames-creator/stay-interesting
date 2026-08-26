#!/usr/bin/env node
/**
 * Verifies lib/radarGeometry.ts and the vector the building-mode radar draws.
 *
 *   node scripts/verify-taste-radar.mjs
 *
 * MATH ONLY. Whether the morph looks smooth, whether the labels collide, and
 * whether the demo shapes read as different people are questions a human
 * answers by clicking — see docs/manual-test.md. Nothing here opens a browser.
 *
 * Like verify-activity-matching.mjs and verify-results-selection.mjs, this
 * imports the REAL functions and the REAL quiz questions (Node strips the
 * TypeScript on the fly). That is the whole reason the geometry lives in
 * lib/radarGeometry.ts instead of inside components/TasteRadar.tsx: a
 * "use client" component cannot be imported here, and a script that mirrors
 * the code it checks drifts out of sync with it in lockstep.
 *
 * THREE CHECKS, all pass/fail
 *   A. Geometry   — known vectors land where they must: the maximum on the
 *                   outer ring, the minimum at the centre, a single-axis spike
 *                   pointing at that axis and nowhere else, out-of-range
 *                   values clamped rather than escaping the chart.
 *   B. Running    — the vector drawn WHILE ANSWERING is production scoring
 *      average      exactly: totalsFrom -> userVectorFromQuizTotals, the same
 *                   two functions the session write uses, unrounded. Includes
 *                   the rewind case the Back button depends on.
 *   C. Rounding   — confined to labelValue. Geometry consumes the raw value,
 *                   so a fractional vector must not draw the same shape as its
 *                   rounded counterpart.
 */
import {
  AXES,
  AXIS_COUNT,
  VALUE_MIN,
  VALUE_MAX,
  NEUTRAL_VALUE,
  axisAngle,
  radarPoint,
  polygonPoints,
  ringPoints,
  axisSpokeEnd,
  axisLabelPoint,
  labelValue,
  neutralVector,
} from "../lib/radarGeometry.ts";
import { totalsFrom, userVectorFromQuizTotals } from "../lib/matchActivities.ts";
import { personalityQuestions } from "../data/personalityQuiz.ts";

const failures = [];

/** Floats: coordinates come out of sin/cos, so compare with a tolerance. */
const EPSILON = 1e-9;
const near = (a, b, tol = EPSILON) => Math.abs(a - b) <= tol;

/** The test chart. Arbitrary but fixed, so the expected numbers are stable. */
const RADIUS = 100;
const CENTER = 120;

const parsePoints = (s) =>
  s
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [x, y] = pair.split(",").map(Number);
      return { x, y };
    });

const distanceFromCentre = (p) => Math.hypot(p.x - CENTER, p.y - CENTER);

const filled = (value) => new Array(AXIS_COUNT).fill(value);

console.log(
  `Chart under test: radius ${RADIUS}, centre ${CENTER}, ${AXIS_COUNT} axes ` +
    `(${AXES.join(", ")}).`
);
console.log(`Value scale ${VALUE_MIN}-${VALUE_MAX}, neutral ${NEUTRAL_VALUE}.\n`);

// ---------------------------------------------------------------------------
// CHECK A — Geometry
// ---------------------------------------------------------------------------
console.log("CHECK A — Geometry: known vectors land where they must\n");

// A1. The maximum sits exactly on the outer ring, on every axis.
{
  const points = parsePoints(polygonPoints(filled(VALUE_MAX), RADIUS, CENTER));
  const offRing = points.filter((p) => !near(distanceFromCentre(p), RADIUS));
  if (points.length !== AXIS_COUNT) {
    failures.push(
      `all-${VALUE_MAX} vector produced ${points.length} points, expected ${AXIS_COUNT}`
    );
  } else if (offRing.length) {
    failures.push(`all-${VALUE_MAX} vector: ${offRing.length} point(s) not on the outer ring`);
  } else {
    console.log(`  A1  all-${VALUE_MAX}s sits on the outer ring on all ${AXIS_COUNT} axes. OK`);
  }
}

// A2. The minimum collapses to the centre. Honest: that user scored the floor
//     on every axis, and there is no smaller shape to draw.
{
  const points = parsePoints(polygonPoints(filled(VALUE_MIN), RADIUS, CENTER));
  const offCentre = points.filter((p) => !near(distanceFromCentre(p), 0));
  if (offCentre.length) {
    failures.push(`all-${VALUE_MIN} vector: ${offCentre.length} point(s) away from the centre`);
  } else {
    console.log(`  A2  all-${VALUE_MIN}s collapses to the centre. OK`);
  }
}

// A3. Axis 0 points straight up. The whole chart's rotation hangs off this.
{
  const top = radarPoint(VALUE_MAX, 0, RADIUS, CENTER);
  if (!near(top.x, CENTER) || !near(top.y, CENTER - RADIUS)) {
    failures.push(
      `axis 0 (${AXES[0]}) should be at twelve o-clock, got (${top.x.toFixed(3)}, ${top.y.toFixed(3)})`
    );
  } else {
    console.log(`  A3  axis 0 (${AXES[0]}) points straight up. OK`);
  }
}

// A4. Axes are evenly spaced and go clockwise on screen.
{
  const step = (2 * Math.PI) / AXIS_COUNT;
  let evenly = true;
  for (let i = 1; i < AXIS_COUNT; i++) {
    if (!near(axisAngle(i) - axisAngle(i - 1), step)) evenly = false;
  }
  // Clockwise on screen: SVG's y grows downward, so the second axis must sit
  // to the RIGHT of the first.
  const second = radarPoint(VALUE_MAX, 1, RADIUS, CENTER);
  if (!evenly) failures.push(`axes are not evenly spaced at 2PI/${AXIS_COUNT}`);
  else if (!(second.x > CENTER)) failures.push("axis 1 is not clockwise of axis 0 on screen");
  else console.log(`  A4  axes evenly spaced at 2PI/${AXIS_COUNT}, running clockwise. OK`);
}

// A5. A single-axis spike points at that axis and NOWHERE else. This is the
//     property the purist shapes on the hero rely on to read as different
//     people rather than as one blob.
{
  let allGood = true;
  for (let axis = 0; axis < AXIS_COUNT; axis++) {
    const spike = filled(VALUE_MIN);
    spike[axis] = VALUE_MAX;
    const points = parsePoints(polygonPoints(spike, RADIUS, CENTER));
    const expected = axisSpokeEnd(axis, RADIUS, CENTER);

    if (!near(points[axis].x, expected.x) || !near(points[axis].y, expected.y)) {
      failures.push(`spike on ${AXES[axis]} did not land on its own spoke end`);
      allGood = false;
      continue;
    }
    const strays = points.filter((p, i) => i !== axis && !near(distanceFromCentre(p), 0));
    if (strays.length) {
      failures.push(
        `spike on ${AXES[axis]} pushed ${strays.length} other axis/axes off the centre`
      );
      allGood = false;
    }
  }
  if (allGood) {
    console.log(`  A5  a spike on each of the ${AXIS_COUNT} axes points only at itself. OK`);
  }
}

// A6. Out-of-range values clamp rather than escaping the chart. Activity
//     vectors are CHECK-constrained in the database, but a user vector is
//     computed at runtime and this is a drawing function.
{
  const wild = [0, -5, 99, 10.4, 1, 10, 0.9];
  const clamped = [VALUE_MIN, VALUE_MIN, VALUE_MAX, VALUE_MAX, VALUE_MIN, VALUE_MAX, VALUE_MIN];
  const a = polygonPoints(wild, RADIUS, CENTER);
  const b = polygonPoints(clamped, RADIUS, CENTER);
  const escaped = parsePoints(a).filter((p) => distanceFromCentre(p) > RADIUS + EPSILON);

  if (a !== b) failures.push("out-of-range values did not clamp to the same points as their bounds");
  else if (escaped.length) failures.push(`${escaped.length} clamped point(s) still escaped the outer ring`);
  else console.log("  A6  out-of-range values clamp to the scale bounds. OK");
}

// A7. A malformed vector throws. Drawing SOMETHING would hide a caller bug,
//     the same reasoning that makes rankActivities throw on a bad userVector.
{
  const bad = [[1, 2, 3], null, "seven", [1, 2, 3, 4, 5, 6, NaN]];
  const survived = bad.filter((value) => {
    try {
      polygonPoints(value, RADIUS, CENTER);
      return true;
    } catch {
      return false;
    }
  });
  if (survived.length) failures.push(`polygonPoints accepted ${survived.length} malformed vector(s)`);
  else console.log(`  A7  threw on all ${bad.length} malformed vectors. OK`);
}

// A8. The gridlines share the shape's geometry: the full ring is exactly the
//     all-10s polygon, and a zero ring is the centre.
{
  const fullRing = ringPoints(1, RADIUS, CENTER);
  const maxShape = polygonPoints(filled(VALUE_MAX), RADIUS, CENTER);
  const zeroRing = parsePoints(ringPoints(0, RADIUS, CENTER));

  if (fullRing !== maxShape) failures.push("the full gridline ring does not match the all-10s polygon");
  else if (zeroRing.some((p) => !near(distanceFromCentre(p), 0)))
    failures.push("the zero gridline ring is not at the centre");
  else console.log("  A8  gridline rings share the shape's own geometry. OK");
}

// A9. Labels sit outside the outer ring, so a full-extension shape cannot
//     cover them.
{
  const inside = [];
  for (let i = 0; i < AXIS_COUNT; i++) {
    if (distanceFromCentre(axisLabelPoint(i, RADIUS, CENTER)) <= RADIUS) inside.push(AXES[i]);
  }
  if (inside.length) failures.push(`label anchor(s) inside the outer ring: ${inside.join(", ")}`);
  else console.log("  A9  every axis label anchor sits outside the outer ring. OK");
}

// A10. The neutral "nothing answered yet" shape is a regular heptagon halfway
//      out — visibly a shape, visibly not a result.
{
  const points = parsePoints(polygonPoints(neutralVector(), RADIUS, CENTER));
  const half = RADIUS / 2;
  const wrong = points.filter((p) => !near(distanceFromCentre(p), half));
  if (wrong.length) failures.push("the neutral shape is not a regular heptagon at half radius");
  else console.log("  A10 the neutral shape is a regular heptagon at half radius. OK");
}

// ---------------------------------------------------------------------------
// CHECK B — Running average
//
// The building-mode radar must draw the vector the answers ACTUALLY produce.
// It derives that from the same two functions the end of the quiz uses to
// write the session, so this check is really asking: does walking the quiz one
// answer at a time agree with scoring the whole run at the end?
// ---------------------------------------------------------------------------
console.log("\nCHECK B — Running average: the shape drawn while answering is production scoring\n");

/** One deterministic walk: option (question id + offset) % optionCount. */
function walk(offset) {
  return personalityQuestions.map((q) => q.options[(q.id + offset) % q.options.length].vector);
}

{
  let stepwiseOk = true;
  let rewindOk = true;
  let sawFraction = false;

  for (let offset = 0; offset < 5; offset++) {
    const answers = walk(offset);
    const runningVectors = [];

    for (let answered = 1; answered <= answers.length; answered++) {
      const prefix = answers.slice(0, answered);
      const running = userVectorFromQuizTotals(totalsFrom(prefix), prefix.length);
      runningVectors.push(running);

      // Independent per-axis mean over the same prefix.
      for (let axis = 0; axis < AXIS_COUNT; axis++) {
        let sum = 0;
        for (const v of prefix) sum += v[axis];
        if (!near(running[axis], sum / answered, 1e-12)) stepwiseOk = false;
      }
      if (running.some((n) => !Number.isInteger(n))) sawFraction = true;
    }

    // The final running vector must be exactly what the session write produces.
    const stored = userVectorFromQuizTotals(totalsFrom(answers), answers.length);
    const last = runningVectors[runningVectors.length - 1];
    if (stored.some((n, i) => n !== last[i])) stepwiseOk = false;

    // REWIND. Back slices the last answer off selectedVectors, so step n-1 has
    // to come back bit-for-bit — not merely close. Anything else and the radar
    // would drift every time the user changed their mind.
    for (let answered = answers.length; answered > 1; answered--) {
      const rewound = userVectorFromQuizTotals(
        totalsFrom(answers.slice(0, answered - 1)),
        answered - 1
      );
      if (rewound.some((n, i) => n !== runningVectors[answered - 2][i])) rewindOk = false;
    }
  }

  if (!stepwiseOk) {
    failures.push("the running average diverges from the per-axis mean of the answers so far");
  } else {
    console.log(
      `  B1  running average matches the mean of the answers so far, ` +
        `${personalityQuestions.length} questions x 5 walks. OK`
    );
  }

  if (!rewindOk) failures.push("going back does not return the exact previous vector");
  else console.log("  B2  going back returns the previous vector bit-for-bit. OK");

  if (!sawFraction) {
    failures.push("no walk produced a fractional component — the vector is being rounded somewhere");
  } else {
    console.log("  B3  running vectors carry fractional components — nothing rounds them. OK");
  }
}

// B4. SKIP RESHAPES THE RADAR, whichever option it lands on.
//
// A skip is a real answer: handleSkip picks a random option and sends it
// through handleSelectOption exactly as a click would, so the maths has no
// notion of "skipped" at all — there is no flag in totalsFrom to consult. What
// that buys is only worth having if EVERY option a skip could land on actually
// moves the vector, so the user sees the shape react rather than sit still and
// conclude the button did nothing. Checked over every option of every question
// rather than one sampled skip, because the option a skip picks is random.
{
  const answers = walk(0);
  const inert = [];

  for (let step = 0; step < personalityQuestions.length; step++) {
    const prefix = answers.slice(0, step);
    const before =
      step === 0 ? null : userVectorFromQuizTotals(totalsFrom(prefix), step);

    for (const option of personalityQuestions[step].options) {
      const after = userVectorFromQuizTotals(totalsFrom([...prefix, option.vector]), step + 1);
      // On the first question there is no previous vector: the radar starts on
      // the neutral shape, so that is what the answer has to move away from.
      const baseline = before ?? neutralVector();
      if (after.every((n, i) => near(n, baseline[i], 1e-12))) {
        inert.push(`Q${personalityQuestions[step].id} "${option.label}"`);
      }
    }
  }

  if (inert.length) {
    failures.push(
      `${inert.length} option(s) leave the radar shape unchanged, so a skip landing ` +
        `on one would look like a dead button: ${inert.join(", ")}`
    );
  } else {
    console.log(
      "  B4  every option of every question moves the shape, so any skip reshapes it. OK"
    );
  }
}

// ---------------------------------------------------------------------------
// CHECK C — Rounding is confined to labels
// ---------------------------------------------------------------------------
console.log("\nCHECK C — Rounding: display only, never in the geometry\n");

{
  const cases = [
    [6.4, 6],
    [6.5, 7],
    [1.13, 1],
    [0, VALUE_MIN],
    [99, VALUE_MAX],
    [-3, VALUE_MIN],
  ];
  const wrong = cases.filter(([input, expected]) => labelValue(input) !== expected);
  if (wrong.length) failures.push(`labelValue is wrong on ${wrong.length} case(s)`);
  else console.log(`  C1  labelValue rounds and clamps correctly on ${cases.length} cases. OK`);
}

{
  // The real thing this check exists for: if a rounded value ever reached the
  // geometry, these two would draw the same polygon.
  const raw = [4.13, 5.87, 2.5, 7.49, 3.01, 6.62, 1.38];
  const rounded = raw.map(labelValue);
  if (polygonPoints(raw, RADIUS, CENTER) === polygonPoints(rounded, RADIUS, CENTER)) {
    failures.push("a fractional vector draws the same shape as its rounded form — geometry is rounding");
  } else {
    console.log("  C2  a fractional vector draws a different shape from its rounded form. OK");
  }
}

// ---------------------------------------------------------------------------
console.log("\n" + "-".repeat(72));

if (failures.length) {
  console.log(`\n${failures.length} FAILURE(S):`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
console.log("\nAll checks passed.");
