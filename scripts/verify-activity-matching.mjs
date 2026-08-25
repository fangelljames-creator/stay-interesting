#!/usr/bin/env node
/**
 * Verifies lib/matchActivities.ts against the real seed data.
 *
 *   node scripts/verify-activity-matching.mjs
 *
 * Unlike analyze-quiz-balance.mjs, this does NOT mirror the app's logic by
 * hand — it imports the actual rankActivities and the actual quiz questions
 * (Node strips the TypeScript types on the fly), so it cannot drift out of
 * sync with the code it is checking.
 *
 * THREE CHECKS
 *   A. Self-match      — pass/fail. Feed each activity's own vector in as the
 *                        user; it must come back ranked #1.
 *   B. Purist paths    — DIAGNOSTIC ONLY, never fails the run. Answer all 8
 *                        questions as an extremist on one axis and see what
 *                        the matcher offers. A purist who is shown nothing
 *                        dominated by their own axis is evidence about the
 *                        VECTOR BALANCE of the quiz or the seed, not a bug in
 *                        the matcher — which is why it only warns.
 *   C. Bad-data        — pass/fail. Malformed activity vectors must be skipped
 *                        rather than throwing, and a malformed user vector
 *                        must throw rather than silently returning nothing.
 */
import {
  rankActivities,
  userVectorFromQuizTotals,
  AXIS_COUNT,
  MAX_DISTANCE,
} from "../lib/matchActivities.ts";
import { personalityQuestions } from "../data/personalityQuiz.ts";
import { AXES, parseSeedActivities, dominantAxis } from "./lib/parse-seed.mjs";

const activities = parseSeedActivities();
const failures = [];
const warnings = [];

const pct = (n) => `${n.toFixed(1)}%`;
const dist = (n) => n.toFixed(2);

console.log(
  `Loaded ${activities.length} seed activities and ${personalityQuestions.length} quiz questions.`
);
console.log(`Max possible distance across ${AXIS_COUNT} axes: ${dist(MAX_DISTANCE)}\n`);

// ---------------------------------------------------------------------------
// CHECK A — Self-match
//
// The most basic property the metric must have: nothing is closer to an
// activity than that activity. A tie is only legitimate when another activity
// has the identical vector, i.e. is also at distance 0.
// ---------------------------------------------------------------------------
console.log("CHECK A — Self-match: each activity's own vector must rank it #1\n");

let selfMatchPassed = 0;
const exactTwins = [];

for (const activity of activities) {
  const ranked = rankActivities(activity.vector, activities);
  const best = ranked[0].distance;
  const leaders = ranked.filter((r) => r.distance === best);
  const isLeader = leaders.some((r) => r.title === activity.title);

  if (!isLeader || best !== 0) {
    failures.push(
      `Self-match failed for "${activity.title}": ranked #1 was "${ranked[0].title}" at distance ${dist(best)}`
    );
    continue;
  }
  if (leaders.length > 1) {
    exactTwins.push(`${leaders.map((r) => `"${r.title}"`).join(" = ")}`);
  }
  selfMatchPassed++;
}

console.log(`  ${selfMatchPassed}/${activities.length} activities ranked themselves #1.`);
if (exactTwins.length) {
  const unique = [...new Set(exactTwins)];
  console.log(
    `  ${unique.length} exact vector tie(s) — legitimate, but these activities are\n` +
      `  indistinguishable to the matcher and will always surface together:`
  );
  unique.forEach((t) => console.log(`    ${t}`));
}
console.log(`  Sanity: an exact match scores ${pct(rankActivities(activities[0].vector, activities)[0].matchPercent)}.`);

// ---------------------------------------------------------------------------
// CHECK B — Purist paths (diagnostic)
//
// For each axis, answer every question with whichever option scores highest on
// that axis, then rank. This is the most extreme user the quiz can produce for
// that axis, so if anyone should be shown same-axis activities, it is them.
// ---------------------------------------------------------------------------
console.log("\n\nCHECK B — Purist paths: the most extreme user the quiz can produce per axis");
console.log("           (diagnostic — flags rebalance evidence, never fails the run)\n");

for (const [axis, axisName] of AXES.entries()) {
  const totals = new Array(AXIS_COUNT).fill(0);

  for (const question of personalityQuestions) {
    // Highest-scoring option on this axis; ties go to the first, as elsewhere.
    let choice = question.options[0];
    for (const option of question.options) {
      if (option.vector[axis] > choice.vector[axis]) choice = option;
    }
    choice.vector.forEach((n, i) => (totals[i] += n));
  }

  // Raw sums / question count, deliberately unrounded — see CLAUDE.md.
  const userVector = userVectorFromQuizTotals(totals, personalityQuestions.length);
  const top3 = rankActivities(userVector, activities).slice(0, 3);

  const profile = userVector.map((n) => n.toFixed(1)).join(", ");
  console.log(`  ${axisName} purist  [${profile}]`);

  for (const [i, match] of top3.entries()) {
    const lean = AXES[dominantAxis(match.vector)];
    const flag = lean === axisName ? "*" : " ";
    console.log(
      `    ${i + 1}. ${flag} ${match.title.padEnd(42)} d=${dist(match.distance).padStart(5)}  ${pct(match.matchPercent).padStart(6)}  leans ${lean}`
    );
  }

  if (!top3.some((m) => AXES[dominantAxis(m.vector)] === axisName)) {
    warnings.push(
      `${axisName} purist sees no ${axisName}-dominant activity in its top 3 ` +
        `(gets ${[...new Set(top3.map((m) => AXES[dominantAxis(m.vector)]))].join(", ")} instead)`
    );
    console.log(`       ^ no ${axisName}-dominant activity in the top 3`);
  }
  console.log("");
}

// ---------------------------------------------------------------------------
// CHECK C — Bad data must degrade, not explode
// ---------------------------------------------------------------------------
console.log("\nCHECK C — Bad data handling\n");

const goodVector = activities[0].vector;
const polluted = [
  ...activities,
  { title: "null vector", vector: null },
  { title: "missing vector" },
  { title: "too short", vector: [1, 2, 3] },
  { title: "not numbers", vector: ["8", "4", "2", "7", "1", "3", "6"] },
  { title: "has a NaN", vector: [1, 2, 3, 4, 5, 6, Number.NaN] },
];

try {
  const ranked = rankActivities(goodVector, polluted);
  if (ranked.length !== activities.length) {
    failures.push(
      `Expected the 5 malformed rows to be skipped, leaving ${activities.length}; got ${ranked.length}`
    );
  } else {
    console.log(`  Skipped all 5 malformed activities, kept ${ranked.length}. OK`);
  }
} catch (error) {
  failures.push(`Malformed activity vectors should be skipped, but rankActivities threw: ${error.message}`);
}

for (const [label, bad] of [
  ["null", null],
  ["too short", [1, 2, 3]],
  ["strings", ["1", "2", "3", "4", "5", "6", "7"]],
]) {
  let threw = false;
  try {
    rankActivities(bad, activities);
  } catch {
    threw = true;
  }
  if (!threw) failures.push(`rankActivities should throw on a ${label} userVector, but did not`);
}
if (!failures.some((f) => f.includes("userVector"))) {
  console.log("  Threw on all 3 malformed user vectors. OK");
}

// ---------------------------------------------------------------------------
console.log("\n" + "-".repeat(72));

if (warnings.length) {
  console.log(`\n${warnings.length} balance warning(s) — not matcher bugs:`);
  warnings.forEach((w) => console.log(`  - ${w}`));
  console.log(
    "\n  These reflect the vectors in data/personalityQuiz.ts and the seed pool.\n" +
      "  See the quiz vector balance entry under Known issues in CLAUDE.md."
  );
}

if (failures.length) {
  console.log(`\n${failures.length} FAILURE(S):`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
console.log("\nAll pass/fail checks passed.");
