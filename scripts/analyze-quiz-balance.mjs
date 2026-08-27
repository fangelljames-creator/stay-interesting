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
 * SOURCE OF TRUTH. NOTHING IN THIS FILE MIRRORS PRODUCTION ANY MORE. The
 * questions are imported from data/personalityQuiz.ts and the classifier is
 * imported from lib/personalityTypes.ts (Node strips the types on the fly).
 *
 * Both of those used to be copies. The questions were regex-parsed, which could
 * silently miss one if the file's shape changed; the argmax was hand-quoted,
 * because it lived inside a "use client" React component and could not be
 * imported. The argmax moved out to lib/personalityTypes.ts in the landing-flow
 * branch, and the 15-type mechanism made the copy untenable: a hand-mirrored
 * rule with hybrid thresholds and a named-pair table would go stale in a way
 * that produces confident, wrong share tables rather than an obvious error.
 *
 * ⚠️ Section (g) sweeps candidate thresholds that are NOT the shipping ones, and
 * it does that by passing a different config to the same imported classifier —
 * never by reimplementing it.
 */
import { personalityQuestions } from "../data/personalityQuiz.ts";
import {
  ALL_ROUNDER_ID,
  axisId,
  classifyTotals,
  DEFAULT_CONFIG,
  HYBRID_MAX_GAP,
  ALL_ROUNDER_MAX_SPREAD,
  NAMED_PAIR_IDS,
  pairId,
  PERSONALITY_TYPES,
  determinePersonalityType,
} from "../lib/personalityTypes.ts";
import { normalizeForDisplay } from "../lib/radarGeometry.ts";

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

// --- Section (g): 15-type design sweep -------------------------------------
/** Candidate H — the largest top1 - top2 gap that still reads as a close second. */
const CANDIDATE_H = [2, 3, 4, 5];
/** Candidate F — the largest top1 - min spread that still reads as flat. */
const CANDIDATE_F = [6, 8, 10];
/** How many hybrid pairs get names. 7 pure + 7 hybrid + All-Rounder = 15. */
const HYBRID_SLOTS = 7;
/** Which F the full per-type tables are printed at; the others get a summary line. */
const TABLE_F = 8;
/**
 * The near-twin flag, on normalised-polygon distance.
 *
 * MEASURED, NOT INVENTED. The four shapes the hero shipped with were written to
 * be, in their own comment, four people "whose polygons could not be mistaken
 * for one another". Their closest pair sits at 0.753. Anything under 0.60 is
 * therefore comfortably tighter than a gap that has already been eyeballed and
 * accepted, and is worth looking at before it goes on the hero.
 */
const NEAR_TWIN_FLAG = 0.6;
const KNOWN_DISTINCT_FLOOR = 0.753;

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

/**
 * Every path's raw sums, kept for section (g) so the 15-type sweep does not
 * walk the tree a second time. Int16 because the largest reachable sum is
 * questionCount * 10, and the whole table is about a megabyte.
 */
const allTotals = new Int16Array(totalPaths * AXIS_COUNT);

for (let path = 0; path < totalPaths; path++) {
  let rem = path;
  for (let qi = 0; qi < nQ; qi++) {
    const n = questions[qi].vectors.length;
    choice[qi] = rem % n;
    rem = Math.floor(rem / n);
  }

  const totals = sumVectors(questions.map((q, qi) => q.vectors[choice[qi]]));
  allTotals.set(totals, path * AXIS_COUNT);
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
// (g) 15-TYPE DESIGN SWEEP — REPORT ONLY, no gate here
//
// Everything below reads the raw sums captured during the walk above, so the
// tree is walked exactly once.
//
// ⚠️ THE RULE ITSELF IS NOT MIRRORED HERE. classifyTotals is imported from
// lib/personalityTypes.ts and takes its thresholds as an argument, so every
// share printed below is produced by the SAME function production runs. That is
// deliberate: the whole point of a sweep is to choose H and F, and a sweep of a
// hand-copied rule would be choosing them for a classifier that does not ship.
// ===========================================================================
const PAIR_COUNT = (AXIS_COUNT * (AXIS_COUNT - 1)) / 2;
console.log(`\n\n(g) 15-TYPE DESIGN SWEEP — ⚠️  REPORT ONLY, nothing here is a gate\n`);
console.log(
  `    Judged on RAW SUMS across ${nQ} questions, the same scale classifyTotals uses.\n` +
    `    H = the largest top1 - top2 gap that still counts as a close second.\n` +
    `    F = the largest top1 - min spread that still counts as flat.\n`
);

const scratch = new Array(AXIS_COUNT).fill(0);
const totalsAt = (path) => {
  const base = path * AXIS_COUNT;
  for (let i = 0; i < AXIS_COUNT; i++) scratch[i] = allTotals[base + i];
  return scratch;
};
const titleCase = (slug) =>
  // The All-Rounder is the one id that is not built out of axis names, so it is
  // not a pair and must not be printed with the " + " a pair id gets.
  slug === ALL_ROUNDER_ID
    ? "The All-Rounder"
    : slug
        .split("-")
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join(" + ");

// --- one pass: per-path order, and the archetype trackers ------------------
//
// An ARCHETYPE is the single most type-defining vector the quiz can actually
// produce for a type: the walk path that wins it by the largest margin. These
// are what the hero cycles, so they have to be real reachable answer paths and
// not hand-drawn shapes — a hero showing a polygon the quiz cannot produce is
// advertising a taxonomy the product does not have.
//
// Defined so it does NOT depend on H or F, which is what lets every candidate
// be measured before the thresholds are chosen:
//   pure A      margin = sum(A) - the best of the other six
//   pair (A,B)  margin = min(sum(A), sum(B)) - the best of the other five
//   All-Rounder flattest: smallest top1 - min, ties to the smallest sum of
//               squared deviations from the mean
const topOf = new Int8Array(totalPaths);
const secondOf = new Int8Array(totalPaths);
const gapOf = new Int16Array(totalPaths);
const spreadOf = new Int16Array(totalPaths);

const pureBest = AXES.map(() => ({ margin: -Infinity, totals: null }));
const pairBest = new Map(); // pairId -> { margin, totals, a, b }
for (let a = 0; a < AXIS_COUNT; a++) {
  for (let b = a + 1; b < AXIS_COUNT; b++) {
    pairBest.set(pairId(a, b), { margin: -Infinity, totals: null, a, b });
  }
}
const flatBest = { spread: Infinity, deviation: Infinity, totals: null };

/**
 * The SHIPPING archetypes: same "largest margin" idea, but restricted to paths
 * that classifyTotals actually assigns to that type under DEFAULT_CONFIG.
 *
 * ⚠️ THE CONSTRAINT IS THE WHOLE POINT, and leaving it out is a live trap. The
 * unconstrained search above maximises a margin that knows nothing about H, so
 * it can hand back a path whose top two are further apart than H allows — the
 * Novelty + Stimulation winner is exactly that, top two 4 apart against H = 3,
 * which the real classifier calls pure Novelty. Put that on the hero and the
 * product is advertising a shape its own quiz never produces.
 */
const shippingBest = new Map();

const order = [0, 1, 2, 3, 4, 5, 6];
for (let path = 0; path < totalPaths; path++) {
  const t = totalsAt(path);
  order.sort((x, y) => t[y] - t[x] || x - y);

  const top = order[0];
  const low = t[order[AXIS_COUNT - 1]];
  topOf[path] = top;
  secondOf[path] = order[1];
  gapOf[path] = t[top] - t[order[1]];
  spreadOf[path] = t[top] - low;

  for (let ax = 0; ax < AXIS_COUNT; ax++) {
    const rival = t[order[0] === ax ? order[1] : order[0]];
    const margin = t[ax] - rival;
    if (margin > pureBest[ax].margin) {
      pureBest[ax].margin = margin;
      pureBest[ax].totals = Array.from(t);
    }
  }

  for (const entry of pairBest.values()) {
    // `order` is sorted descending, so the best axis outside the pair is the
    // first entry that is neither of them — never further along than index 2.
    let rival = 0;
    for (let k = 0; k < 3; k++) {
      if (order[k] !== entry.a && order[k] !== entry.b) {
        rival = t[order[k]];
        break;
      }
    }
    const margin = Math.min(t[entry.a], t[entry.b]) - rival;
    if (margin > entry.margin) {
      entry.margin = margin;
      entry.totals = Array.from(t);
    }
  }

  const spread = t[top] - low;
  if (spread <= flatBest.spread) {
    const avg = t.reduce((a, b) => a + b, 0) / AXIS_COUNT;
    const deviation = t.reduce((acc, v) => acc + (v - avg) * (v - avg), 0);
    if (spread < flatBest.spread || deviation < flatBest.deviation) {
      flatBest.spread = spread;
      flatBest.deviation = deviation;
      flatBest.totals = Array.from(t);
    }
  }

  // The shipping archetype for whichever type this path really lands on.
  const verdict = classifyTotals(t, DEFAULT_CONFIG);
  let margin;
  if (verdict.kind === "all-rounder") {
    // Flatter is more archetypal, so the margin runs the other way.
    margin = -spread;
  } else if (verdict.kind === "pure") {
    margin = t[verdict.axes[0]] - t[order[1]];
  } else {
    const [a, b] = verdict.axes;
    let rival = 0;
    for (let k = 0; k < 3; k++) {
      if (order[k] !== a && order[k] !== b) {
        rival = t[order[k]];
        break;
      }
    }
    margin = Math.min(t[a], t[b]) - rival;
  }
  const held = shippingBest.get(verdict.id);
  if (!held || margin > held.margin) {
    shippingBest.set(verdict.id, {
      margin,
      totals: Array.from(t),
      kind: verdict.kind,
      axes: verdict.axes,
      paths: (held?.paths ?? 0) + 1,
    });
  } else {
    held.paths++;
  }
}

// --- (g1) top-two pair distribution, unconditional -------------------------
const topTwoCounts = new Map();
for (let path = 0; path < totalPaths; path++) {
  const key = pairId(topOf[path], secondOf[path]);
  topTwoCounts.set(key, (topTwoCounts.get(key) ?? 0) + 1);
}
const rankedPairs = [...topTwoCounts.entries()].sort(
  (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
);

console.log(`    (g1) TOP-TWO AXIS PAIR — every path, no threshold applied\n`);
console.log(`         ${pad("pair", 26)} ${num("paths", 9)} ${num("share", 7)}`);
for (const [key, n] of rankedPairs) {
  console.log(
    `         ${pad(titleCase(key), 26)} ${num(n.toLocaleString(), 9)} ` +
      `${num(((n / totalPaths) * 100).toFixed(2) + "%", 7)}  ` +
      `${"#".repeat(Math.round((n / totalPaths) * 200))}`
  );
}
console.log(
  `\n         ${rankedPairs.length} of ${PAIR_COUNT} possible pairs occur at all.` +
    (rankedPairs.length < PAIR_COUNT
      ? `  ⚠️  ${PAIR_COUNT - rankedPairs.length} never do — those cannot be named.`
      : "")
);

// --- (g2) close-second rate by H, with the pair table at each H ------------
console.log(`\n\n    (g2) CLOSE-SECOND RATE — paths where top1 - top2 <= H\n`);
const pairCountsByH = new Map();
for (const H of CANDIDATE_H) {
  const counts = new Map();
  let close = 0;
  for (let path = 0; path < totalPaths; path++) {
    if (gapOf[path] > H) continue;
    close++;
    const key = pairId(topOf[path], secondOf[path]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  pairCountsByH.set(H, counts);
  console.log(
    `         H = ${H}   ${num(close.toLocaleString(), 9)} paths  ` +
      `${num(((close / totalPaths) * 100).toFixed(1) + "%", 7)}   ` +
      `${counts.size} distinct pairs`
  );
}

console.log(
  `\n         Leading pairs at each H (the ${HYBRID_SLOTS} that would be named are marked *)\n`
);
const namedByH = new Map();
for (const H of CANDIDATE_H) {
  const ranked = [...pairCountsByH.get(H).entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  );
  namedByH.set(H, new Set(ranked.slice(0, HYBRID_SLOTS).map(([key]) => key)));
  console.log(`         H = ${H}`);
  for (const [i, [key, n]] of ranked.slice(0, HYBRID_SLOTS + 3).entries()) {
    console.log(
      `           ${i < HYBRID_SLOTS ? "*" : " "} ${pad(titleCase(key), 26)} ` +
        `${num(n.toLocaleString(), 8)} ${num(((n / totalPaths) * 100).toFixed(2) + "%", 7)}`
    );
  }
  console.log("");
}

// --- (g3) flat-profile rate by F, plus the whole spread curve --------------
console.log(`\n    (g3) FLAT-PROFILE RATE — paths where top1 - min <= F\n`);
const spreadHistogram = new Map();
for (let path = 0; path < totalPaths; path++) {
  spreadHistogram.set(spreadOf[path], (spreadHistogram.get(spreadOf[path]) ?? 0) + 1);
}
const minSpread = Math.min(...spreadHistogram.keys());
const maxSpread = Math.max(...spreadHistogram.keys());
for (const F of CANDIDATE_F) {
  let n = 0;
  for (const [spread, count] of spreadHistogram) if (spread <= F) n += count;
  console.log(
    `         F = ${num(F, 2)}   ${num(n.toLocaleString(), 9)} paths  ` +
      `${num(((n / totalPaths) * 100).toFixed(2) + "%", 8)}`
  );
}
console.log(`\n         The whole curve, so a value outside the three candidates is visible:\n`);
console.log(`         ${pad("F", 4)} ${num("cumulative paths", 17)} ${num("share", 8)}`);
let running = 0;
for (let f = minSpread; f <= Math.min(minSpread + 14, maxSpread); f++) {
  running += spreadHistogram.get(f) ?? 0;
  console.log(
    `         ${pad(f, 4)} ${num(running.toLocaleString(), 17)} ` +
      `${num(((running / totalPaths) * 100).toFixed(2) + "%", 8)}`
  );
}
console.log(`\n         Smallest spread any path can reach: ${minSpread}.`);

// --- (g4) archetypes -------------------------------------------------------
console.log(`\n\n    (g4) MOST ARCHETYPAL ACHIEVABLE VECTOR — the hero shape candidates\n`);
console.log(
  `         Raw sums. "margin" is how decisively that path wins the type;\n` +
    `         a negative pair margin means no path makes those two lead together.\n`
);
console.log(
  `         ${pad("type", 26)} ${num("margin", 7)}   ` +
    `${AXES.map((a) => num(a.slice(0, 4), 5)).join(" ")}`
);

const archetypes = new Map();
const showArchetype = (label, id, margin, totals) => {
  archetypes.set(id, { label, totals });
  console.log(
    `         ${pad(label, 26)} ${num(margin, 7)}   ${totals.map((v) => num(v, 5)).join(" ")}`
  );
};
for (const [ax, axis] of AXES.entries()) {
  showArchetype(axis, axisId(ax), pureBest[ax].margin, pureBest[ax].totals);
}
console.log("");
for (const [key, entry] of [...pairBest.entries()].sort((a, b) => b[1].margin - a[1].margin)) {
  showArchetype(titleCase(key), key, entry.margin, entry.totals);
}
console.log("");
showArchetype("All-Rounder (flattest)", ALL_ROUNDER_ID, flatBest.spread, flatBest.totals);

// --- (g4b) the shipping archetypes ----------------------------------------
console.log(
  `\n\n    (g4b) SHIPPING ARCHETYPES — the 15 chosen types at H = ${HYBRID_MAX_GAP}, ` +
    `F = ${ALL_ROUNDER_MAX_SPREAD}\n`
);
console.log(
  `         Restricted to paths the real classifier actually assigns to that type,\n` +
    `         so every shape below is one the quiz can genuinely produce. These are\n` +
    `         the vectors the hero cycles and the ones stored in lib/personalityTypes.\n`
);
console.log(
  `         ${pad("type", 26)} ${num("paths", 8)} ${num("margin", 7)}   ` +
    `${AXES.map((a) => num(a.slice(0, 4), 5)).join(" ")}`
);

const SHIPPING_IDS = [
  ...AXES.map((_, ax) => axisId(ax)),
  ...NAMED_PAIR_IDS,
  ALL_ROUNDER_ID,
];
const shipping = new Map();
for (const id of SHIPPING_IDS) {
  const entry = shippingBest.get(id);
  if (!entry) {
    console.log(`         ${pad(titleCase(id), 26)}   ⚠️  UNREACHABLE — no path lands here`);
    continue;
  }
  shipping.set(id, entry);
  console.log(
    `         ${pad(titleCase(id), 26)} ${num(entry.paths.toLocaleString(), 8)} ` +
      `${num(entry.margin, 7)}   ${entry.totals.map((v) => num(v, 5)).join(" ")}`
  );
}

console.log(`\n         Paste-ready, in SHIPPING_IDS order:\n`);
for (const id of SHIPPING_IDS) {
  const entry = shipping.get(id);
  if (entry) console.log(`           ${pad(id + ":", 22)} [${entry.totals.join(", ")}],`);
}

// --- (g5) near-twin scan on the normalised polygons ------------------------
//
// The hero draws these DISPLAY-NORMALISED, so two archetypes with different raw
// magnitudes but the same ratios between axes are literally the same polygon.
// This measures the distance the viewer actually sees, not the distance the
// matcher sees, by running the real normalizeForDisplay from lib/radarGeometry.
console.log(`\n\n    (g5) NEAR-TWIN SCAN — distance between archetypes AS DRAWN\n`);
console.log(
  `         Normalised polygons, so this is what the eye gets. Flagged below ` +
    `${NEAR_TWIN_FLAG.toFixed(2)};\n` +
    `         for calibration, the closest pair among the four shapes the hero shipped\n` +
    `         with — written to be unmistakable for one another — sits at ${KNOWN_DISTINCT_FLOOR}.\n`
);
const drawn = [...shipping.entries()].map(([id, entry]) => ({
  id,
  label: titleCase(id),
  shape: normalizeForDisplay(entry.totals),
}));
const twinPairs = [];
for (let i = 0; i < drawn.length; i++) {
  for (let j = i + 1; j < drawn.length; j++) {
    const d = Math.hypot(...drawn[i].shape.map((v, k) => v - drawn[j].shape[k]));
    twinPairs.push({ a: drawn[i], b: drawn[j], d });
  }
}
twinPairs.sort((x, y) => x.d - y.d);
console.log(`         ${pad("closest pairs", 30)} ${pad("", 26)} ${num("distance", 9)}`);
for (const pair of twinPairs.slice(0, 15)) {
  console.log(
    `         ${pad(pair.a.label, 30)} ${pad(pair.b.label, 26)} ${num(pair.d.toFixed(3), 9)}` +
      (pair.d < NEAR_TWIN_FLAG ? "  ⚠️  NEAR-TWIN" : "")
  );
}
const flagged = twinPairs.filter((pair) => pair.d < NEAR_TWIN_FLAG);
console.log(
  `\n         ${flagged.length} of ${twinPairs.length} archetype pairs sit below the flag.`
);

// Split the flagged pairs by whether the two types SHARE AN AXIS, because
// the two halves mean opposite things. A pure type sitting close to a hybrid
// that contains it — Stimulation beside Social + Stimulation — is the chart
// telling the truth: those two really are near neighbours, and a reader who
// cannot tell them apart at a glance has not been misled. Two types with NO
// axis in common drawing the same polygon is the actual defect, because nothing
// about the taxonomy says they should look alike.
const axesOf = (id) => (id === ALL_ROUNDER_ID ? new Set() : new Set(id.split("-")));
const sharesAnAxis = (pair) => {
  const left = axesOf(pair.a.id);
  return [...axesOf(pair.b.id)].some((axis) => left.has(axis));
};
const relatedTwins = flagged.filter(sharesAnAxis);
const unrelatedTwins = flagged.filter((pair) => !sharesAnAxis(pair));

console.log(
  `\n         ${relatedTwins.length} of those share an axis; ` +
    `${unrelatedTwins.length} do not.\n`
);
for (const pair of unrelatedTwins) {
  console.log(
    `           ⚠️  ${pad(pair.a.label, 25)} ${pad(pair.b.label, 26)} ` +
      `${num(pair.d.toFixed(3), 8)}   NO SHARED AXIS`
  );
}
if (!unrelatedTwins.length) {
  console.log(`           No flagged pair is unrelated — every one shares an axis.`);
}

// --- (g6) projected shares under each candidate config ---------------------
console.log(`\n\n    (g6) PROJECTED 15-TYPE SHARES — via the real classifyTotals\n`);
console.log(
  `         Named pairs at each H are that H's top ${HYBRID_SLOTS} by frequency, per the\n` +
    `         "most frequent wins, no inventing rare ones" rule.\n`
);
console.log(
  `         ${pad("config", 14)} ${num("all-rnd", 8)} ${num("hybrid", 8)} ${num("pure", 8)}   ` +
    `${pad("smallest type", 22)} unreachable`
);

const shareRuns = new Map();
for (const H of CANDIDATE_H) {
  for (const F of CANDIDATE_F) {
    const namedPairs = namedByH.get(H);
    const config = { hybridMaxGap: H, allRounderMaxSpread: F, namedPairs };
    const ids = [...AXES.map((_, ax) => axisId(ax)), ...namedPairs, ALL_ROUNDER_ID];
    const tally = new Map(ids.map((id) => [id, 0]));
    let allRounder = 0;
    let hybrid = 0;
    for (let path = 0; path < totalPaths; path++) {
      const { id, kind } = classifyTotals(totalsAt(path), config);
      tally.set(id, (tally.get(id) ?? 0) + 1);
      if (kind === "all-rounder") allRounder++;
      else if (kind === "hybrid") hybrid++;
    }
    shareRuns.set(`${H}/${F}`, { H, F, tally, ids });
    const smallest = [...tally.entries()].sort((a, b) => a[1] - b[1])[0];
    const unreachable = [...tally.entries()].filter(([, n]) => n === 0);
    console.log(
      `         H=${H} F=${num(F, 2)}      ` +
        `${num(((allRounder / totalPaths) * 100).toFixed(2) + "%", 8)} ` +
        `${num(((hybrid / totalPaths) * 100).toFixed(1) + "%", 8)} ` +
        `${num((((totalPaths - allRounder - hybrid) / totalPaths) * 100).toFixed(1) + "%", 8)}   ` +
        `${pad(`${titleCase(smallest[0])} ${((smallest[1] / totalPaths) * 100).toFixed(2)}%`, 22)} ` +
        (unreachable.length
          ? `⚠️  ${unreachable.length}: ${unreachable.map(([id]) => titleCase(id)).join(", ")}`
          : "none")
    );
  }
}

console.log(
  `\n         Full per-type tables at F = ${TABLE_F}. F moves only the All-Rounder row and\n` +
    `         shaves the rest proportionally, so the H tables are the ones to read.\n`
);
for (const H of CANDIDATE_H) {
  const run = shareRuns.get(`${H}/${TABLE_F}`);
  console.log(`         H = ${H}, F = ${TABLE_F}`);
  const rows = run.ids.map((id) => ({ id, n: run.tally.get(id) ?? 0 }));
  for (const row of rows.sort((a, b) => b.n - a.n)) {
    const share = (row.n / totalPaths) * 100;
    console.log(
      `           ${pad(titleCase(row.id), 26)} ${num(row.n.toLocaleString(), 9)} ` +
        `${num(share.toFixed(2) + "%", 7)}  ` +
        `${row.n === 0 ? "⚠️  UNREACHABLE" : "#".repeat(Math.round(share / 2))}`
    );
  }
  console.log("");
}

// ===========================================================================
// (h) TYPE REACHABILITY — HARD PASS/FAIL
//
// The standing gate for the 15-type mechanism, and the counterpart to the
// purist test: that one asks whether every AXIS can win, this one asks whether
// every TYPE can be reached. A taxonomy containing a card nobody can be dealt
// is worse than a smaller taxonomy, because the copy gets written, reviewed and
// shipped with nothing behind it.
//
// ⚠️ THIS RUNS THROUGH determinePersonalityType, the real production entry
// point, not through classifyTotals with a hand-assembled config. That closes
// the last gap between what the script measures and what a user gets.
//
// ⚠️ THE PURIST TEST ABOVE DELIBERATELY DOES NOT USE THIS. It still judges the
// dominant AXIS, and it must keep doing so. At H = 3 a purist path can be a
// legitimate hybrid — the Energy purist comes out Energy 55, Stimulation 50 —
// so re-pointing the purist test at the type would turn a working regression
// guard into a test of the hybrid thresholds instead.
// ===========================================================================
console.log(`\n\n(h) TYPE REACHABILITY — HARD PASS/FAIL, via determinePersonalityType\n`);
console.log(
  `    H = ${HYBRID_MAX_GAP}, F = ${ALL_ROUNDER_MAX_SPREAD}, ` +
    `${NAMED_PAIR_IDS.length} named hybrid pairs.\n`
);

const typeCounts = new Map(PERSONALITY_TYPES.map((type) => [type.id, 0]));
for (let path = 0; path < totalPaths; path++) {
  const { id } = determinePersonalityType(totalsAt(path));
  typeCounts.set(id, (typeCounts.get(id) ?? 0) + 1);
}

console.log(
  `    ${pad("type", 28)} ${pad("kind", 12)} ${num("paths", 9)} ${num("share", 7)}`
);
for (const type of [...PERSONALITY_TYPES].sort(
  (a, b) => typeCounts.get(b.id) - typeCounts.get(a.id)
)) {
  const n = typeCounts.get(type.id);
  const share = (n / totalPaths) * 100;
  console.log(
    `    ${pad(type.title, 28)} ${pad(type.kind, 12)} ${num(n.toLocaleString(), 9)} ` +
      `${num(share.toFixed(2) + "%", 7)}  ` +
      `${n === 0 ? "⚠️  UNREACHABLE" : "#".repeat(Math.round(share / 2))}`
  );
}

const unreachableTypes = PERSONALITY_TYPES.filter((type) => typeCounts.get(type.id) === 0);
if (unreachableTypes.length) {
  failures.push(
    `UNREACHABLE TYPE: no answer path produces ` +
      unreachableTypes.map((type) => `${type.title} (${type.id})`).join(", ")
  );
}
gates.push({
  name: `All ${PERSONALITY_TYPES.length} personality types reachable`,
  ok: unreachableTypes.length === 0,
  detail: unreachableTypes.length
    ? unreachableTypes.map((type) => type.id).join(", ")
    : `smallest is ${Math.min(...typeCounts.values()).toLocaleString()} paths`,
});

// --- each stored archetype must land on its own type -----------------------
//
// This is what keeps the hero honest. archetypeTotals is drawn on the landing
// page under its type's name, so if the stored vector classifies as something
// else the product is showing a shape its own quiz never produces under that
// label. A HARD failure, because it is invisible on screen — a wrong polygon
// still looks like a polygon.
console.log(`\n    Stored archetypes — each must classify as its own type\n`);
let archetypeFailures = 0;
let archetypeDrift = 0;
for (const type of PERSONALITY_TYPES) {
  const landed = determinePersonalityType(type.archetypeTotals);
  const ok = landed.id === type.id;
  if (!ok) {
    archetypeFailures++;
    failures.push(
      `ARCHETYPE: ${type.title}'s stored vector classifies as ${landed.title} ` +
        `(${landed.id}), so the hero would draw it under the wrong name`
    );
  }
  // Separately: is it still the MOST archetypal path available? A quiz vector
  // change moves this without breaking anything, so it is reported with the
  // replacement rather than failing the run.
  const best = shippingBest.get(type.id);
  const drifted = best && best.totals.join(",") !== type.archetypeTotals.join(",");
  if (drifted) archetypeDrift++;
  console.log(
    `    ${ok ? "ok  " : "FAIL"}  ${pad(type.title, 28)} -> ${pad(landed.title, 28)}` +
      (drifted ? `   ⚠️  no longer the strongest path` : "")
  );
  if (drifted) {
    console.log(`            stored:  [${type.archetypeTotals.join(", ")}]`);
    console.log(`            strongest now: [${best.totals.join(", ")}]   <- paste this in`);
  }
}
gates.push({
  name: `Every archetype classifies as its own type`,
  ok: archetypeFailures === 0,
  detail: archetypeFailures ? `${archetypeFailures} mismatched` : "all 15 land correctly",
});
if (archetypeDrift) {
  console.log(
    `\n    ⚠️  ${archetypeDrift} archetype(s) are no longer the strongest available path.\n` +
      `        Not a failure — a quiz vector moved. Paste the replacements above into\n` +
      `        PERSONALITY_TYPES so the hero keeps showing the most defining shapes.`
  );
}

// --- the voice standard, reported not enforced -----------------------------
//
// ⚠️ NON-FATAL ON PURPOSE. The copy is Owen's, reviewed and edited by hand, and
// his edits are final — a gate that failed the build over his prose would be
// the wrong instrument pointed at the wrong thing. This is a reminder of the
// standard in CLAUDE.md, not a judge of whether the writing is any good.
const BANNED_PHRASES = [
  "thrive",
  "whether it's",
  "whether its",
  "deep satisfaction",
  "unleash",
  "dive into",
  "passion for",
];
console.log(`\n    Voice standard — ⚠️  REPORTED, NEVER FATAL. See CLAUDE.md.\n`);
const copyNotes = [];
for (const type of PERSONALITY_TYPES) {
  const lower = type.description.toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (lower.includes(phrase)) copyNotes.push(`${type.title}: banned phrase "${phrase}"`);
  }
  // Sentence splitting is deliberately crude — it only has to be good enough to
  // raise a hand, and every false positive is read by a human anyway.
  const sentences = type.description
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  if (sentences.length < 2 || sentences.length > 3) {
    copyNotes.push(`${type.title}: ${sentences.length} sentences, standard asks for 2-3`);
  }
  for (let i = 1; i < sentences.length; i++) {
    if (/^You\b/.test(sentences[i]) && /^You\b/.test(sentences[i - 1])) {
      copyNotes.push(`${type.title}: consecutive sentences both open with "You"`);
    }
  }
}
if (copyNotes.length) {
  for (const note of copyNotes) console.log(`      - ${note}`);
  console.log(`\n      ${copyNotes.length} note(s). None of these fail the run.`);
} else {
  console.log(`      All 15 descriptions clear the mechanical checks.`);
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
