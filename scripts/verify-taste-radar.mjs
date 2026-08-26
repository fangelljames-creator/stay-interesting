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
 *   A. Geometry   — the display normalisation behaves as a normalisation:
 *      and           scale-invariant, ratio-preserving, largest axis always at
 *      normalisation the target fraction, flat vectors drawing an even
 *                   heptagon, nothing able to escape the outer ring. Plus the
 *                   chart's orientation, which everything else hangs off.
 *   B. Running    — the vector drawn WHILE ANSWERING is production scoring
 *      average      exactly: totalsFrom -> userVectorFromQuizTotals, the same
 *                   two functions the session write uses, unrounded. Includes
 *                   the rewind case the Back button depends on, and B4 asks
 *                   the question normalisation raises: does every answer still
 *                   visibly move the NORMALISED shape?
 *   C. Numbers    — none. No export rounds, and normalisation must not flatten
 *                   distinct vectors onto one shape.
 *
 * ⚠️ SUPERSEDED, deliberately: an earlier version asserted "all-1s collapses
 * to the centre". Under display normalisation an all-1s vector is FLAT, so it
 * draws a full even heptagon like any other flat vector — magnitude is not
 * what the chart carries any more. The replacement assertions are A2/A5/A6/A7.
 */
import {
  AXES,
  AXIS_COUNT,
  VALUE_MIN,
  VALUE_MAX,
  NEUTRAL_VALUE,
  DISPLAY_MAX_FRACTION,
  axisAngle,
  normalizeForDisplay,
  polygonPoints,
  radarVertices,
  ringPoints,
  axisSpokeEnd,
  axisLabelPoint,
  neutralVector,
} from "../lib/radarGeometry.ts";
import * as radarGeometry from "../lib/radarGeometry.ts";
import { totalsFrom, userVectorFromQuizTotals } from "../lib/matchActivities.ts";
import { personalityQuestions } from "../data/personalityQuiz.ts";

const failures = [];
const warnings = [];

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

/** A spread of shapes to assert the normalisation's properties over. */
const SAMPLE_VECTORS = [
  [9, 9, 1, 1, 5, 3, 6],
  [1, 1, 9, 2, 1, 4, 3],
  [4.13, 5.87, 2.5, 7.49, 3.01, 6.62, 1.38],
  [2, 2, 9, 4, 2, 6, 3],
  [7, 8, 2, 3, 6, 7, 10],
  [10, 1, 1, 1, 1, 1, 1],
  [3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.6],
];

console.log(
  `Chart under test: radius ${RADIUS}, centre ${CENTER}, ${AXIS_COUNT} axes ` +
    `(${AXES.join(", ")}).`
);
console.log(
  `Value scale ${VALUE_MIN}-${VALUE_MAX}, neutral ${NEUTRAL_VALUE}, ` +
    `largest axis plotted at ${DISPLAY_MAX_FRACTION} of the radius.\n`
);

// ---------------------------------------------------------------------------
// CHECK A — Geometry and the display normalisation
//
// The chart draws SHAPE, never magnitude: every polygon is scaled so its
// largest axis reaches DISPLAY_MAX_FRACTION, with the ratios between axes
// untouched. These checks are the definition of that sentence, made executable.
// ---------------------------------------------------------------------------
console.log("CHECK A — Geometry and normalisation\n");

// A1. The largest axis always lands at the target fraction. Whatever the user
//     scores, their map fills the chart — which is the entire point: a running
//     mean of honest option vectors drifts toward the pool mean, so a raw plot
//     SHRANK as the quiz went on.
{
  const wrong = [];
  for (const vector of SAMPLE_VECTORS) {
    const largest = Math.max(...normalizeForDisplay(vector));
    if (!near(largest, DISPLAY_MAX_FRACTION)) wrong.push(JSON.stringify(vector));
  }
  if (wrong.length) failures.push(`${wrong.length} vector(s) whose largest axis missed the target fraction`);
  else console.log(`  A1  largest axis lands at ${DISPLAY_MAX_FRACTION} on all ${SAMPLE_VECTORS.length} samples. OK`);
}

// A2. SCALE INVARIANCE. normalize(v) and normalize(k*v) are the same shape,
//     because they ARE the same shape. This is what makes it a normalisation
//     rather than a rescale, and it is why nothing clamps the top: a ceiling
//     that 2v hits and v does not would break this outright.
{
  const broken = [];
  for (const vector of SAMPLE_VECTORS) {
    const base = normalizeForDisplay(vector);
    for (const k of [0.25, 0.5, 2, 3.7, 100]) {
      const scaled = normalizeForDisplay(vector.map((n) => n * k));
      if (scaled.some((n, i) => !near(n, base[i]))) broken.push(`${JSON.stringify(vector)} x${k}`);
    }
  }
  if (broken.length) failures.push(`normalisation is not scale-invariant on ${broken.length} case(s): ${broken[0]}`);
  else console.log(`  A2  scale-invariant across 5 scale factors on all ${SAMPLE_VECTORS.length} samples. OK`);
}

// A3. RATIOS PRESERVED. An axis twice another before normalisation is twice it
//     after. This is the property that lets a reader trust the picture: the
//     shape is the only thing carried over, and it is carried exactly.
{
  const broken = [];
  for (const vector of SAMPLE_VECTORS) {
    const normalised = normalizeForDisplay(vector);
    for (let i = 0; i < AXIS_COUNT; i++) {
      for (let j = 0; j < AXIS_COUNT; j++) {
        if (!near(normalised[i] * vector[j], normalised[j] * vector[i], 1e-9)) {
          broken.push(`${AXES[i]}:${AXES[j]} in ${JSON.stringify(vector)}`);
        }
      }
    }
  }
  if (broken.length) failures.push(`axis ratios not preserved in ${broken.length} pair(s): ${broken[0]}`);
  else console.log("  A3  every axis ratio preserved exactly. OK");
}

// A4. A FLAT VECTOR DRAWS A FULL EVEN HEPTAGON, whatever flat value it holds.
//     This supersedes the old "all-1s collapses to the centre": under
//     normalisation an all-1s user is not small, they are undifferentiated,
//     and an even heptagon is the honest picture of that.
{
  const shapes = [1, 2, 5.5, 9, 10].map((value) =>
    parsePoints(polygonPoints(filled(value), RADIUS, CENTER))
  );
  const target = DISPLAY_MAX_FRACTION * RADIUS;
  const uneven = shapes.filter((points) =>
    points.some((p) => !near(distanceFromCentre(p), target))
  );
  const differing = shapes.filter((points) =>
    points.some((p, i) => !near(p.x, shapes[0][i].x) || !near(p.y, shapes[0][i].y))
  );

  if (uneven.length) failures.push(`${uneven.length} flat vector(s) did not draw an even heptagon at the target fraction`);
  else if (differing.length) failures.push("flat vectors of different values drew different shapes");
  else console.log("  A4  every flat vector draws the same full even heptagon. OK");
}

// A5. A single-axis spike keeps its 10:1 proportions. Not "everything else at
//     the centre" any more — the other axes sit at a tenth of the spike,
//     because that is what the vector says.
{
  let allGood = true;
  for (let axis = 0; axis < AXIS_COUNT; axis++) {
    const spike = filled(VALUE_MIN);
    spike[axis] = VALUE_MAX;
    const points = parsePoints(polygonPoints(spike, RADIUS, CENTER));

    const spikeDistance = distanceFromCentre(points[axis]);
    if (!near(spikeDistance, DISPLAY_MAX_FRACTION * RADIUS)) {
      failures.push(`spike on ${AXES[axis]} did not reach the target fraction`);
      allGood = false;
      continue;
    }
    const wrong = points.filter(
      (p, i) => i !== axis && !near(distanceFromCentre(p), spikeDistance / VALUE_MAX)
    );
    if (wrong.length) {
      failures.push(`spike on ${AXES[axis]}: ${wrong.length} other axis/axes at the wrong proportion`);
      allGood = false;
    }
  }
  if (allGood) {
    console.log(`  A5  a ${VALUE_MAX}:${VALUE_MIN} spike keeps its proportions on all ${AXIS_COUNT} axes. OK`);
  }
}

// A6. Axis 0 points straight up. The whole chart's rotation hangs off this.
{
  const top = axisSpokeEnd(0, RADIUS, CENTER);
  if (!near(top.x, CENTER) || !near(top.y, CENTER - RADIUS)) {
    failures.push(
      `axis 0 (${AXES[0]}) should be at twelve o-clock, got (${top.x.toFixed(3)}, ${top.y.toFixed(3)})`
    );
  } else {
    console.log(`  A6  axis 0 (${AXES[0]}) points straight up. OK`);
  }
}

// A7. Axes are evenly spaced and go clockwise on screen.
{
  const step = (2 * Math.PI) / AXIS_COUNT;
  let evenly = true;
  for (let i = 1; i < AXIS_COUNT; i++) {
    if (!near(axisAngle(i) - axisAngle(i - 1), step)) evenly = false;
  }
  // Clockwise on screen: SVG's y grows downward, so the second axis must sit
  // to the RIGHT of the first.
  const second = axisSpokeEnd(1, RADIUS, CENTER);
  if (!evenly) failures.push(`axes are not evenly spaced at 2PI/${AXIS_COUNT}`);
  else if (!(second.x > CENTER)) failures.push("axis 1 is not clockwise of axis 0 on screen");
  else console.log(`  A7  axes evenly spaced at 2PI/${AXIS_COUNT}, running clockwise. OK`);
}

// A8. NOTHING CAN ESCAPE THE OUTER RING, and no axis crosses the centre.
//     Guaranteed by construction rather than by clamping: dividing by the
//     largest axis puts that axis at the target fraction whatever it held, and
//     the floor at zero stops a negative turning the polygon inside out.
{
  const wild = [0, -5, 99, 10.4, 1, 10, 0.9];
  const points = parsePoints(polygonPoints(wild, RADIUS, CENTER));
  const escaped = points.filter((p) => distanceFromCentre(p) > RADIUS + EPSILON);
  const negativeAxis = normalizeForDisplay(wild).filter((n) => n < 0);

  if (escaped.length) failures.push(`${escaped.length} point(s) escaped the outer ring on an out-of-range vector`);
  else if (negativeAxis.length) failures.push("a negative axis survived normalisation and would plot through the centre");
  else console.log("  A8  out-of-range and negative values stay inside the chart. OK");
}

// A9. A malformed vector throws. Drawing SOMETHING would hide a caller bug,
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
  else console.log(`  A9  threw on all ${bad.length} malformed vectors. OK`);
}

// A10. The gridlines are structure, not a scale: the full ring is at the
//      radius, the zero ring at the centre, and both are regular.
{
  const fullRing = parsePoints(ringPoints(1, RADIUS, CENTER));
  const zeroRing = parsePoints(ringPoints(0, RADIUS, CENTER));

  if (fullRing.some((p) => !near(distanceFromCentre(p), RADIUS)))
    failures.push("the full gridline ring is not at the radius");
  else if (zeroRing.some((p) => !near(distanceFromCentre(p), 0)))
    failures.push("the zero gridline ring is not at the centre");
  else console.log("  A10 gridline rings are regular and span centre to radius. OK");
}

// A11. Labels sit outside the outer ring, so no shape can cover them.
{
  const inside = [];
  for (let i = 0; i < AXIS_COUNT; i++) {
    if (distanceFromCentre(axisLabelPoint(i, RADIUS, CENTER)) <= RADIUS) inside.push(AXES[i]);
  }
  if (inside.length) failures.push(`label anchor(s) inside the outer ring: ${inside.join(", ")}`);
  else console.log("  A11 every axis label anchor sits outside the outer ring. OK");
}

// A12. The vertex dots on the profile card sit ON the drawn polygon. They are
//      the one thing that could be plotted from raw values by accident, which
//      would leave seven dots floating off a normalised shape.
{
  const wrong = [];
  for (const vector of SAMPLE_VECTORS) {
    const dots = radarVertices(vector, RADIUS, CENTER);
    const corners = parsePoints(polygonPoints(vector, RADIUS, CENTER));
    if (dots.some((d, i) => !near(d.x, corners[i].x) || !near(d.y, corners[i].y))) {
      wrong.push(JSON.stringify(vector));
    }
  }
  if (wrong.length) failures.push(`vertex dots left the polygon on ${wrong.length} vector(s)`);
  else console.log("  A12 vertex dots sit exactly on the polygon corners. OK");
}

// A13. The "nothing answered yet" ghost is flat, so it draws the even
//      heptagon. It reads as an empty frame because it is FADED, not because
//      it is small — under normalisation there is no small.
{
  const points = parsePoints(polygonPoints(neutralVector(), RADIUS, CENTER));
  const target = DISPLAY_MAX_FRACTION * RADIUS;
  if (points.some((p) => !near(distanceFromCentre(p), target)))
    failures.push("the neutral ghost is not an even heptagon at the target fraction");
  else console.log("  A13 the neutral ghost is an even heptagon at the target fraction. OK");
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

// B4. EVERY ANSWER VISIBLY RESHAPES THE NORMALISED POLYGON.
//
// A skip is a real answer: handleSkip picks a random option and sends it
// through handleSelectOption exactly as a click would, so the maths has no
// notion of "skipped" at all — there is no flag in totalsFrom to consult. What
// that buys is only worth having if EVERY option a skip could land on actually
// moves the shape, so the user sees the radar react rather than sit still and
// conclude the button did nothing. Checked over every option of every question
// rather than one sampled skip, because the option a skip picks is random.
//
// ⚠️ MEASURED ON THE NORMALISED SHAPE, WHICH IS THE HARDER TEST. Normalisation
// throws magnitude away, so an answer that moves every axis in proportion —
// one that scales the running mean rather than tilting it — changes the vector
// while leaving the drawn polygon identical. That option would be visually
// inert however much it moved the maths. A raw-vector check cannot see this
// class of failure at all, which is exactly why it is re-run here.
{
  const answers = walk(0);
  // A vertex moving less than this is under half a pixel on a 132px building
  // radar. Below that the shape has changed in principle and not in practice.
  const VISIBLE_FRACTION = 0.005;

  const inert = [];
  const faint = [];

  for (let step = 0; step < personalityQuestions.length; step++) {
    const prefix = answers.slice(0, step);
    // On the first question there is no previous vector: the radar starts on
    // the neutral ghost, so that is what the answer has to move away from.
    const baseline =
      step === 0 ? neutralVector() : userVectorFromQuizTotals(totalsFrom(prefix), step);
    const before = normalizeForDisplay(baseline);

    for (const option of personalityQuestions[step].options) {
      const after = normalizeForDisplay(
        userVectorFromQuizTotals(totalsFrom([...prefix, option.vector]), step + 1)
      );
      const shift = Math.max(...after.map((n, i) => Math.abs(n - before[i])));
      const label = `Q${personalityQuestions[step].id} "${option.label}" (${shift.toFixed(4)})`;

      if (shift <= EPSILON) inert.push(label);
      else if (shift < VISIBLE_FRACTION) faint.push(label);
    }
  }

  if (inert.length) {
    failures.push(
      `${inert.length} option(s) leave the NORMALISED shape identical, so a skip ` +
        `landing on one would look like a dead button: ${inert.join(", ")}`
    );
  } else if (faint.length) {
    // Reported, not hidden, and not fatal: this is a content observation about
    // particular option vectors, not a defect in the drawing.
    warnings.push(
      `${faint.length} option(s) move the normalised shape by less than ` +
        `${VISIBLE_FRACTION} of the radius, which may not read as a reshape: ${faint.join(", ")}`
    );
    console.log(
      `  B4  no option is inert, but ${faint.length} move the shape only faintly — see warnings.`
    );
  } else {
    console.log(
      "  B4  every option of every question visibly reshapes the normalised polygon. OK"
    );
  }
}

// ---------------------------------------------------------------------------
// CHECK C — No numbers, and no rounding
//
// The chart carries axis names and nothing else. A number on a
// display-normalised polygon would be a number that does not mean what it
// looks like it means, so there is no value beside a label, no tooltip, and
// nothing against the rings — which in turn leaves no reason for this module
// to round at all.
// ---------------------------------------------------------------------------
console.log("\nCHECK C — Numbers: none on the chart, and nothing rounds\n");

{
  // A guard against the value labels creeping back. labelValue was this
  // module's only rounding and was deleted with them, so its return is the
  // thing to watch for: a function turning a value into a printable number.
  // Deliberately NOT a blanket /label/ match — axisLabelPoint is a coordinate
  // for placing an axis NAME, which is the one thing the chart still prints.
  const formatters = Object.keys(radarGeometry).filter((name) =>
    /^(labelValue|.*(Round|Format|Rounded|Formatted).*)$/i.test(name)
  );
  if (formatters.length) {
    failures.push(
      `lib/radarGeometry.ts exports ${formatters.join(", ")} — the chart is meant to carry no numbers`
    );
  } else {
    console.log("  C1  radarGeometry exports nothing that formats a value for printing. OK");
  }
}

{
  // Normalisation must not flatten distinct vectors onto one shape. If it ever
  // rounded, or bucketed, these two would draw the same polygon.
  const raw = [4.13, 5.87, 2.5, 7.49, 3.01, 6.62, 1.38];
  const rounded = raw.map((n) => Math.round(n));
  if (polygonPoints(raw, RADIUS, CENTER) === polygonPoints(rounded, RADIUS, CENTER)) {
    failures.push("a fractional vector draws the same shape as its rounded form — normalisation is losing precision");
  } else {
    console.log("  C2  a fractional vector draws a different shape from its rounded form. OK");
  }
}

// ---------------------------------------------------------------------------
console.log("\n" + "-".repeat(72));

if (warnings.length) {
  console.log(`\n${warnings.length} warning(s) — content observations, not drawing bugs:`);
  warnings.forEach((w) => console.log(`  - ${w}`));
}

if (failures.length) {
  console.log(`\n${failures.length} FAILURE(S):`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
console.log("\nAll checks passed.");
