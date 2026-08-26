#!/usr/bin/env node
/**
 * The acceptance gate for data/personalityQuiz.ts.
 *
 *   node scripts/analyze-quiz-balance.mjs
 *
 * Run this after ANY change to a quiz option vector, to a question, or to the
 * scoring itself. The purist test below is a hard pass/fail and is the standing
 * gate; everything else is measured and reported.
 *
 * WHAT COUNTS AS A FAILURE, AND WHAT DOES NOT
 *
 * ⚠️ THE WALK SHARES ARE A SMOKE ALARM, NEVER AN OPTIMISATION TARGET. The
 * exhaustive walk reports how often each axis wins across every possible answer
 * path. A wildly uneven split is EVIDENCE that something is mis-scored — it is
 * not itself the defect, and it must never be "fixed" by nudging scores toward
 * a flatter distribution. That would be scoring the report instead of scoring
 * the activity, which is how the vectors got into trouble in the first place.
 * Vectors are re-scored against the rubric in CLAUDE.md, honestly, and the
 * shares land where they land. They are printed as DIAGNOSTIC for that reason.
 *
 * The genuine failures are structural, and each names a real defect:
 *   PURIST      an axis that cannot win even when every answer maximises it is
 *               unreachable — some other axis is riding along on its options.
 *   FLOOR       a high floor means the axis scores points for free on every
 *               path, which is the side-effect-scoring trap from the rubric.
 *   CEILING     a low ceiling means the quiz never really asks about that axis.
 *   SPREAD      an axis needs several questions that genuinely discriminate on
 *               it, or its score is decided by one or two options.
 *
 * SOURCE OF TRUTH. The questions are IMPORTED from data/personalityQuiz.ts
 * (Node strips the types on the fly), not regex-parsed out of it as they were
 * before — the old parse could silently miss a question if the file's shape
 * changed. The one thing still mirrored by hand is the argmax, because it lives
 * inside a "use client" React component and cannot be imported: see
 * determinePersonalityType in components/PersonalityQuiz.tsx. It is two lines,
 * and it is quoted where it is used below.
 */
import { personalityQuestions } from "../data/personalityQuiz.ts";

const AXES = [
  "Social",
  "Energy",
  "Creative",
  "Analytical",
  "Outdoors",
  "Novelty",
  "Stimulation",
];
const AXIS_COUNT = 7;

// --- Gate thresholds -------------------------------------------------------
const FLOOR_MAX = 2.0;
const CEILING_MIN = 7.0;
const SPREAD_DISCRIMINATES = 3;
const MIN_DISCRIMINATING_QUESTIONS = 4;
const TIE_RATE_MAX = 10.0;

const pad = (s, w) => String(s).padEnd(w);
const num = (s, w) => String(s).padStart(w);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

const questions = personalityQuestions.map((q) => ({
  scenario: q.scenario,
  vectors: q.options.map((o) => o.vector),
  labels: q.options.map((o) => o.label),
}));

const malformed = questions.flatMap((q, qi) =>
  q.vectors.some((v) => v.length !== AXIS_COUNT || v.some((n) => !Number.isFinite(n)))
    ? [qi + 1]
    : []
);
if (malformed.length) {
  console.error(`Malformed vectors in question(s): ${malformed.join(", ")}`);
  process.exit(1);
}

/**
 * PRODUCTION SCORING, mirrored. determinePersonalityType takes the raw per-axis
 * sums and returns traits[vector.indexOf(Math.max(...vector))] — first index
 * wins a tie. Nothing rounds. Change that function and change this.
 */
const dominantAxisOf = (totals) => totals.indexOf(Math.max(...totals));

const sumVectors = (vectors) => {
  const totals = new Array(AXIS_COUNT).fill(0);
  for (const v of vectors) for (let i = 0; i < AXIS_COUNT; i++) totals[i] += v[i];
  return totals;
};

/** The option in a question scoring highest on `ax`. Ties go to the first. */
const bestFor = (question, ax) =>
  question.vectors.reduce((best, v) => (v[ax] > best[ax] ? v : best), question.vectors[0]);

const nQ = questions.length;
const allVectors = questions.flatMap((q) => q.vectors);
const failures = [];
const gates = [];
const SEPARATOR = "-".repeat(74);

console.log(`Parsed ${nQ} questions, ${allVectors.length} options total.`);
console.log(`Option counts per question: ${questions.map((q) => q.vectors.length).join(", ")}\n`);

// ===========================================================================
// (a) PURIST TEST — HARD PASS/FAIL
//
// The most extreme user the quiz can produce for an axis: answer every single
// question with whichever option scores highest on it. If that user does not
// come out as that axis, the axis is effectively unreachable and some other
// axis is riding along on its own best options.
// ===========================================================================
console.log("(a) PURIST TEST — pick the max-X option in every question; X must win");
console.log("    HARD PASS/FAIL. This is the standing acceptance gate.\n");

let puristPasses = 0;
for (const [ax, axis] of AXES.entries()) {
  const totals = sumVectors(questions.map((q) => bestFor(q, ax)));
  const winner = dominantAxisOf(totals);
  const top = Math.max(...totals);
  const tied = totals.filter((t) => t === top).length > 1;
  const ok = winner === ax;

  if (ok) puristPasses++;
  else {
    failures.push(
      `PURIST: a maximal ${axis} user comes out as ${AXES[winner]} ` +
        `(${axis} ${totals[ax]} vs ${AXES[winner]} ${totals[winner]})`
    );
  }

  console.log(
    `    ${ok ? "PASS" : "FAIL"}  ${pad(axis, 12)} -> ${pad(AXES[winner], 12)} ` +
      `[${totals.join(", ")}]${tied ? "  TIED, resolved by array order" : ""}`
  );
}
console.log(`\n    ${puristPasses}/${AXIS_COUNT} purist tests pass.`);
gates.push({
  name: `All ${AXIS_COUNT} purist tests pass`,
  ok: puristPasses === AXIS_COUNT,
  detail: `${puristPasses}/${AXIS_COUNT}`,
});

// ===========================================================================
// (b) NEAR-PURIST — 7-of-8 pass rate, REPORT ONLY
//
// The purist test is the easiest case an axis can be given. This is the next
// one out: answer as the purist everywhere EXCEPT one question, where any
// other option is taken. A low rate means the axis only wins on a knife edge.
// ===========================================================================
console.log(`\n\n(b) NEAR-PURIST — purist in all but one question (report only)\n`);

for (const [ax, axis] of AXES.entries()) {
  const puristChoices = questions.map((q) => bestFor(q, ax));
  let variants = 0;
  let held = 0;
  const lostTo = new Map();

  for (const [qi, q] of questions.entries()) {
    for (const alternative of q.vectors) {
      if (alternative === puristChoices[qi]) continue;
      variants++;
      const totals = sumVectors(puristChoices.map((v, i) => (i === qi ? alternative : v)));
      const winner = dominantAxisOf(totals);
      if (winner === ax) held++;
      else lostTo.set(AXES[winner], (lostTo.get(AXES[winner]) ?? 0) + 1);
    }
  }

  const rate = (held / variants) * 100;
  const lost = [...lostTo.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`);
  console.log(
    `    ${pad(axis, 12)} ${num(held + "/" + variants, 7)} ${num(rate.toFixed(0) + "%", 5)}` +
      (lost.length ? `   loses to: ${lost.join(", ")}` : "   holds everywhere")
  );
}

// ===========================================================================
// (c) PER-AXIS FLOOR / AVG / CEILING
//
// On the average scale (raw sums / question count), which is the scale
// userVectorFromQuizTotals puts the user on. The floor is what an axis scores
// when every answer MINIMISES it — points it collects for free. The ceiling is
// what the quiz can reach when every answer maximises it.
// ===========================================================================
console.log("\n\n(c) PER-AXIS REACHABLE SCORE (average scale, as the user vector sees it)\n");
console.log(
  `    ${pad("Axis", 12)} ${num("floor", 6)} ${num("avg", 6)} ${num("ceiling", 8)}  ${num("range", 6)}   gates`
);

const axisStats = AXES.map((axis, ax) => {
  const perQuestion = questions.map((q) => q.vectors.map((v) => v[ax]));
  return {
    axis,
    ax,
    floor: mean(perQuestion.map((vals) => Math.min(...vals))),
    avg: mean(perQuestion.map(mean)),
    ceiling: mean(perQuestion.map((vals) => Math.max(...vals))),
  };
});

for (const s of axisStats) {
  const floorOk = s.floor <= FLOOR_MAX;
  const ceilOk = s.ceiling >= CEILING_MIN;
  const notes = [];
  if (!floorOk) notes.push(`FLOOR > ${FLOOR_MAX.toFixed(1)}`);
  if (!ceilOk) notes.push(`CEILING < ${CEILING_MIN.toFixed(1)}`);
  console.log(
    `    ${pad(s.axis, 12)} ${num(s.floor.toFixed(2), 6)} ${num(s.avg.toFixed(2), 6)} ` +
      `${num(s.ceiling.toFixed(2), 8)}  ${num((s.ceiling - s.floor).toFixed(2), 6)}   ` +
      (notes.length ? notes.join(" + ") : "ok")
  );
}

const floorFails = axisStats.filter((s) => s.floor > FLOOR_MAX);
const ceilFails = axisStats.filter((s) => s.ceiling < CEILING_MIN);
gates.push({
  name: `No axis floor > ${FLOOR_MAX.toFixed(1)}`,
  ok: floorFails.length === 0,
  detail: floorFails.length
    ? floorFails.map((s) => `${s.axis} ${s.floor.toFixed(2)}`).join(", ")
    : `highest is ${Math.max(...axisStats.map((s) => s.floor)).toFixed(2)}`,
});
gates.push({
  name: `Every axis ceiling >= ${CEILING_MIN.toFixed(1)}`,
  ok: ceilFails.length === 0,
  detail: ceilFails.length
    ? ceilFails.map((s) => `${s.axis} ${s.ceiling.toFixed(2)}`).join(", ")
    : `lowest is ${Math.min(...axisStats.map((s) => s.ceiling)).toFixed(2)}`,
});

// ===========================================================================
// (d) PER-QUESTION SPREAD MATRIX
//
// Spread = max - min across that question's options, per axis. An axis with a
// small spread inside a question is barely being asked about there.
// ===========================================================================
console.log(
  `\n\n(d) PER-QUESTION SPREAD (max - min per axis; >= ${SPREAD_DISCRIMINATES} counts as discriminating)\n`
);
console.log(`    ${pad("Q", 4)} ${AXES.map((t) => num(t.slice(0, 4), 5)).join(" ")}   options`);

for (const [qi, q] of questions.entries()) {
  const spreads = AXES.map((_, ax) => {
    const vals = q.vectors.map((v) => v[ax]);
    return Math.max(...vals) - Math.min(...vals);
  });
  console.log(
    `    ${pad(qi + 1, 4)} ${spreads
      .map((s) => num(s < SPREAD_DISCRIMINATES ? `${s}.` : s, 5))
      .join(" ")}   ${q.vectors.length}`
  );
}
console.log(`\n    (a trailing "." marks a spread below ${SPREAD_DISCRIMINATES})\n`);

const discrimination = AXES.map((axis, ax) => ({
  axis,
  n: questions.filter((q) => {
    const vals = q.vectors.map((v) => v[ax]);
    return Math.max(...vals) - Math.min(...vals) >= SPREAD_DISCRIMINATES;
  }).length,
}));

for (const d of discrimination) {
  const ok = d.n >= MIN_DISCRIMINATING_QUESTIONS;
  console.log(
    `    ${ok ? "ok  " : "FAIL"}  ${pad(d.axis, 12)} discriminated in ${d.n}/${nQ} questions`
  );
}

const discFails = discrimination.filter((d) => d.n < MIN_DISCRIMINATING_QUESTIONS);
gates.push({
  name: `Every axis discriminated in >= ${MIN_DISCRIMINATING_QUESTIONS} questions`,
  ok: discFails.length === 0,
  detail: discFails.length
    ? discFails.map((d) => `${d.axis} ${d.n}`).join(", ")
    : `lowest is ${Math.min(...discrimination.map((d) => d.n))}`,
});

// ===========================================================================
// (e) TIE RATE and (f) WALK SHARES — one exhaustive pass
// ===========================================================================
const totalPaths = questions.reduce((acc, q) => acc * q.vectors.length, 1);
console.log(`\n\n(e/f) EXHAUSTIVE WALK — ${totalPaths.toLocaleString()} possible answer paths\n`);

const wins = new Array(AXIS_COUNT).fill(0);
const tiedWins = new Array(AXIS_COUNT).fill(0);
let tiedPaths = 0;
let roundedTiedPaths = 0;
const choice = new Array(nQ).fill(0);

for (let path = 0; path < totalPaths; path++) {
  let rem = path;
  for (let qi = 0; qi < nQ; qi++) {
    const n = questions[qi].vectors.length;
    choice[qi] = rem % n;
    rem = Math.floor(rem / n);
  }

  const totals = sumVectors(questions.map((q, qi) => q.vectors[choice[qi]]));
  const top = Math.max(...totals);
  const winner = dominantAxisOf(totals);
  wins[winner]++;
  if (totals.filter((t) => t === top).length > 1) {
    tiedPaths++;
    tiedWins[winner]++;
  }

  // The superseded round-then-judge scheme, kept only because CLAUDE.md cites
  // its tie rate as the evidence for having abandoned it.
  const avg = totals.map((t) => Math.round(t / nQ));
  const roundedTop = Math.max(...avg);
  if (avg.filter((x) => x === roundedTop).length > 1) roundedTiedPaths++;
}

const tieRate = (tiedPaths / totalPaths) * 100;
console.log(`    (e) TIE RATE — 2+ axes share the top raw sum, resolved by array order\n`);
// Two decimal places deliberately: at one, a rate of 10.05% prints as "10.0%"
// next to a gate of "<= 10.0%" and a FAIL, which reads as a broken report
// rather than a marginal miss. The gate compares the real number either way.
console.log(
  `        ${tiedPaths.toLocaleString()} of ${totalPaths.toLocaleString()} paths (${tieRate.toFixed(2)}%)` +
    `   gate: <= ${TIE_RATE_MAX.toFixed(2)}%   ${tieRate <= TIE_RATE_MAX ? "ok" : "FAIL"}`
);
console.log(
  `        superseded round-then-judge scheme, for comparison: ` +
    `${((roundedTiedPaths / totalPaths) * 100).toFixed(2)}%`
);
gates.push({
  name: `Tie rate <= ${TIE_RATE_MAX.toFixed(1)}%`,
  ok: tieRate <= TIE_RATE_MAX,
  detail: `${tieRate.toFixed(2)}%`,
});

console.log(`\n    (f) WALK SHARES — ⚠️  DIAGNOSTIC ONLY. NOT A GATE. NEVER A TARGET.\n`);
console.log(`        ${pad("Axis", 12)} ${num("paths", 9)} ${num("share", 7)}   won on a tie`);

const ranked = AXES.map((axis, i) => ({ axis, i, n: wins[i] })).sort((a, b) => b.n - a.n);
for (const r of ranked) {
  const share = (r.n / totalPaths) * 100;
  console.log(
    `        ${pad(r.axis, 12)} ${num(r.n.toLocaleString(), 9)} ${num(share.toFixed(1) + "%", 7)}   ` +
      `${num(tiedWins[r.i].toLocaleString(), 7)}  ${"#".repeat(Math.round(share / 2))}`
  );
}
console.log(`\n        Even split would be ${(100 / AXIS_COUNT).toFixed(1)}% each.`);

const unreachable = ranked.filter((r) => r.n === 0);
if (unreachable.length) {
  failures.push(
    `UNREACHABLE: no answer path produces ${unreachable.map((r) => r.axis).join(", ")}`
  );
}

// ===========================================================================
// GATE SUMMARY
// ===========================================================================
console.log("\n" + SEPARATOR);
console.log("\nGATES\n");
for (const g of gates) {
  console.log(`  ${g.ok ? "PASS" : "FAIL"}  ${pad(g.name, 46)} ${g.detail}`);
}

const failedGates = gates.filter((g) => !g.ok);
console.log(`\n  ${gates.length - failedGates.length}/${gates.length} gates pass.`);

// Only the purist test (and outright unreachability) exits non-zero: it is the
// standing acceptance gate. The rest are reported so a regression is visible
// without blocking a run mid-rebalance, when some are expected to be red.
console.log("\n" + SEPARATOR);
if (failures.length) {
  console.log(`\n${failures.length} HARD FAILURE(S):`);
  failures.forEach((f) => console.log(`  - ${f}`));
  process.exit(1);
}
if (failedGates.length) {
  console.log(
    `\nPurist test passes. ${failedGates.length} reported gate(s) still failing:\n` +
      failedGates.map((g) => `  - ${g.name} (${g.detail})`).join("\n")
  );
} else {
  console.log("\nAll gates pass.");
}
