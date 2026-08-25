#!/usr/bin/env node
/**
 * Checks data/personalityQuiz.ts for structural bias between the 7 axes.
 *
 * Run: node scripts/analyze-quiz-balance.mjs
 *
 * Scoring here mirrors calculateFinalProfile / determinePersonalityType in
 * components/PersonalityQuiz.tsx exactly -- sum each axis across the answered
 * questions, divide by the question count, Math.round, then take the first
 * index holding the max. Change the scoring there and this goes stale.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const TRAITS = [
  "Social",
  "Energy",
  "Creative",
  "Analytical",
  "Outdoors",
  "Novelty",
  "Stimulation",
];

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "data", "personalityQuiz.ts"), "utf8");

// Text-based parse rather than importing the module, so this stays runnable
// with plain node and no TypeScript loader. Everything from the first `id:`
// after the export up to the next `id:` is one question.
const body = src.slice(src.indexOf("personalityQuestions:"));
const starts = [...body.matchAll(/\bid:\s*\d+/g)].map((m) => m.index);

const questions = starts.map((start, i) => {
  const block = body.slice(start, starts[i + 1] ?? body.length);
  const scenario = block.match(/scenario:\s*"((?:[^"\\]|\\.)*)"/)?.[1] ?? "(?)";
  const vectors = [...block.matchAll(/vector:\s*\[([^\]]+)\]/g)].map((m) =>
    m[1].split(",").map((n) => Number(n.trim()))
  );
  return { scenario, vectors };
});

if (!questions.length) {
  console.error("No questions parsed -- has the file's shape changed?");
  process.exit(1);
}

const bad = questions.flatMap((q, qi) =>
  q.vectors
    .filter((v) => v.length !== 7 || v.some(Number.isNaN))
    .map(() => qi + 1)
);
if (bad.length) {
  console.error(`Malformed vectors in question(s): ${[...new Set(bad)].join(", ")}`);
  process.exit(1);
}

const nQ = questions.length;
const allVectors = questions.flatMap((q) => q.vectors);
const pad = (s, w) => String(s).padEnd(w);
const num = (s, w) => String(s).padStart(w);

console.log(`Parsed ${nQ} questions, ${allVectors.length} options total.\n`);

// ---- Per-axis reachable range -------------------------------------------
// The final score is an average, so the ceiling for an axis is what you get
// by picking that axis's best option in every single question.
console.log("PER-AXIS REACHABLE FINAL SCORE (average across all questions)");
console.log(
  `  ${pad("Axis", 12)} ${num("min", 5)} ${num("avg", 6)} ${num("max", 5)}   ${pad("range", 7)} option pool avg`
);

const axisStats = TRAITS.map((trait, ax) => {
  const perQuestion = questions.map((q) => q.vectors.map((v) => v[ax]));
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

  const min = mean(perQuestion.map((vals) => Math.min(...vals)));
  const max = mean(perQuestion.map((vals) => Math.max(...vals)));
  const avg = mean(perQuestion.map(mean));
  return { trait, ax, min, avg, max, range: max - min };
});

for (const s of axisStats) {
  console.log(
    `  ${pad(s.trait, 12)} ${num(s.min.toFixed(1), 5)} ${num(s.avg.toFixed(2), 6)} ` +
      `${num(s.max.toFixed(1), 5)}   ${pad(s.range.toFixed(1), 7)} ${s.avg.toFixed(2)}`
  );
}

const maxCeiling = Math.max(...axisStats.map((s) => s.max));
const minCeiling = Math.min(...axisStats.map((s) => s.max));
console.log(
  `\n  Ceiling spread: ${minCeiling.toFixed(1)} - ${maxCeiling.toFixed(1)} ` +
    `(${(maxCeiling - minCeiling).toFixed(1)} points between the most and least reachable axis)`
);

// ---- Which axes each question can actually move --------------------------
// An axis with a narrow spread inside a question is barely being asked about.
console.log("\nPER-QUESTION SPREAD (max - min across that question's options)");
console.log(`  ${pad("Q", 3)} ${TRAITS.map((t) => num(t.slice(0, 4), 5)).join(" ")}`);
for (const [qi, q] of questions.entries()) {
  const spreads = TRAITS.map((_, ax) => {
    const vals = q.vectors.map((v) => v[ax]);
    return Math.max(...vals) - Math.min(...vals);
  });
  console.log(`  ${pad(qi + 1, 3)} ${spreads.map((s) => num(s, 5)).join(" ")}`);
}

// ---- Exhaustive walk of every possible answer path -----------------------
// This is the real test: play every combination of answers and see which
// profile comes out. A balanced quiz spreads results across all 7.
const totalPaths = questions.reduce((acc, q) => acc * q.vectors.length, 1);
console.log(`\nEXHAUSTIVE PATH WALK (${totalPaths.toLocaleString()} possible answer combinations)`);

if (totalPaths > 5_000_000) {
  console.log("  Too many combinations to enumerate; skipping.");
} else {
  const wins = new Array(7).fill(0);
  const tiedWins = new Array(7).fill(0);
  let tiedPaths = 0;
  const choice = new Array(nQ).fill(0);

  for (let path = 0; path < totalPaths; path++) {
    let rem = path;
    for (let qi = 0; qi < nQ; qi++) {
      const n = questions[qi].vectors.length;
      choice[qi] = rem % n;
      rem = Math.floor(rem / n);
    }

    const totals = new Array(7).fill(0);
    for (let qi = 0; qi < nQ; qi++) {
      const v = questions[qi].vectors[choice[qi]];
      for (let i = 0; i < 7; i++) totals[i] += v[i];
    }
    const avg = totals.map((t) => Math.round(t / nQ));

    const top = Math.max(...avg);
    const winner = avg.indexOf(top); // first index wins ties, same as the app
    wins[winner]++;

    if (avg.filter((x) => x === top).length > 1) {
      tiedPaths++;
      tiedWins[winner]++;
    }
  }

  console.log(`  ${pad("Axis", 12)} ${num("paths", 8)} ${num("share", 8)}   won on a tie`);
  const ranked = TRAITS.map((trait, i) => ({ trait, i, n: wins[i] })).sort((a, b) => b.n - a.n);
  for (const r of ranked) {
    const share = (r.n / totalPaths) * 100;
    const bar = "#".repeat(Math.round(share / 2));
    console.log(
      `  ${pad(r.trait, 12)} ${num(r.n.toLocaleString(), 8)} ${num(share.toFixed(1) + "%", 8)}   ` +
        `${num(tiedWins[r.i].toLocaleString(), 7)}  ${bar}`
    );
  }

  const unreachable = ranked.filter((r) => r.n === 0);
  console.log(`\n  Even split would be ${(100 / 7).toFixed(1)}% each.`);
  console.log(
    `  Ties (2+ axes share the top score): ${tiedPaths.toLocaleString()} paths ` +
      `(${((tiedPaths / totalPaths) * 100).toFixed(1)}%) -- these are resolved by ` +
      `indexOf, so they always go to whichever tied axis sits earliest in the traits array.`
  );
  if (unreachable.length) {
    console.log(
      `  UNREACHABLE: ${unreachable.map((r) => r.trait).join(", ")} ` +
        `-- no combination of answers produces this profile.`
    );
  }
}
