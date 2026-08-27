#!/usr/bin/env node
/**
 * Can a real user actually EARN each activity?
 *
 *   node scripts/audit-activity-reachability.mjs
 *   node scripts/audit-activity-reachability.mjs --seed path/to/seed.sql
 *   node scripts/audit-activity-reachability.mjs --out data/activity-reachability.md
 *
 * REPORT ONLY. Always exits 0, changes no data, and proposes nothing. It writes
 * data/activity-reachability.md and prints a summary.
 *
 * WHAT IT ANSWERS. Every other script in scripts/ checks that the machinery is
 * correct — the filters filter, the reducer reduces, the geometry maps. None of
 * them asks the question the catalogue actually cares about: is there any user
 * at all for whom this row comes out well enough to be shown? An activity can
 * be perfectly tagged, perfectly scored, and still sit permanently behind
 * better-fitting neighbours for every possible person. Nothing would ever
 * notice, because nothing errors.
 *
 * ⚠️ "EARNED" MEANS THE RANKED SLOTS, NOT VISIBLE AT ALL. Everything in the
 * catalogue stays wildcard-reachable BY CONSTRUCTION — the wildcard is drawn at
 * random from the raw pathway pool and obeys no filter and no ranking (see
 * availableWildcards in lib/resultsSelection.ts). A MERIT-DARK row is one that
 * never earns a slot on fit. It is not invisible, and it is not a bug on its
 * own; what to do about one is a content decision, which this script
 * deliberately does not make.
 *
 * ⚠️ WHICH REGIME THIS MEASURES: FIT-ONLY. Hard filters, then graceful
 * relaxation, then rankActivities, then the top 3 plus reroll ranks 4-8.
 * THERE IS NO diverseSelect IN THIS MEASUREMENT.
 *
 * ⚠️ THAT IS NO LONGER THE REGIME ON MAIN. `result-diversity` merged on
 * 2026-08-27, so the greedy diversity re-rank IS live. These numbers therefore
 * describe the pipeline as it stood immediately BEFORE that merge, and they are
 * a lower bound on what is reachable rather than a description of today: a pass
 * that skips near-duplicates pulls DIFFERENT rows into the earned-8, and some
 * of what is dark here may not be dark any more.
 *
 * ⚠️ TEACHING THIS SCRIPT ABOUT diverseSelect IS NOT A ONE-LINE CHANGE, which is
 * why it has not been done in passing. "Earns a slot" stops being "fewer than 8
 * survivors are closer" — a plain count — and becomes "survives the greedy pass
 * into the first 8", which has to be run per (cell, user) rather than reasoned
 * about arithmetically. The witness search's early exits all depend on that
 * count, so they need rebuilding too. Worth doing properly; not worth faking.
 *
 * NOTHING HERE MIRRORS PRODUCTION. The pathway filter, the hard filters, the
 * relaxation ladder and the ranking are all imported from lib/. That is the
 * whole reason lib/selectionPipeline.ts exists — the ladder used to live inside
 * app/page.tsx, where no script could reach it, and hand-copying it here would
 * have produced an audit of a pipeline that is not the one that runs.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import { personalityQuestions } from "../data/personalityQuiz.ts";
import {
  AXES,
  euclideanDistance,
  rankActivities,
  totalsFrom,
  userVectorFromQuizTotals,
} from "../lib/matchActivities.ts";
import { QUICK_QUESTIONS, HOBBY_QUESTIONS } from "../lib/feasibilityQuestions.ts";
import {
  constraintsFrom,
  poolFor,
  selectSurvivors,
} from "../lib/selectionPipeline.ts";
import { parseSeedActivities, seedSqlPath } from "./lib/parse-seed.mjs";

// --- what counts as what ---------------------------------------------------

/** The three ranked cards plus the five rerolls behind them. */
const EARNED_SLOTS = 8;

/**
 * Below this share of achievable users, an activity is EARNED-RARELY.
 *
 * A round number rather than a derived one, and it does not need to be clever:
 * the interesting boundary is zero. This line only separates "turns up for a
 * recognisable slice of people" from "turns up for a sliver", and the report
 * prints each row's real share beside it so the cut can be re-read at any other
 * threshold without re-running anything.
 */
const OFTEN_SHARE = 1.0;

/** Nearest competitors listed for each dark row. */
const COMPETITORS_SHOWN = 5;

// --- arguments -------------------------------------------------------------
const argv = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const at = argv.indexOf(flag);
  return at >= 0 && argv[at + 1] ? argv[at + 1] : fallback;
};
const seedPath = argValue("--seed", seedSqlPath);
const outPath = argValue("--out", "data/activity-reachability.md");

const pad = (s, w) => String(s).padEnd(w);
const num = (s, w) => String(s).padStart(w);

// --- the catalogue ---------------------------------------------------------
//
// parseSeedActivities returns no id — the seed's rows are identified by title,
// which is unique within it — so one is synthesised the same way
// verify-results-selection.mjs does. The reroll queue and the wildcard
// exclusions both key on id, so every row needs one.
const activities = parseSeedActivities(seedPath).map((row) => ({ ...row, id: row.title }));

console.log(`Seed: ${path.relative(process.cwd(), seedPath)}`);
console.log(`${activities.length} activities parsed.\n`);

// --- the achievable users --------------------------------------------------
//
// Every distinct path through the personality quiz, turned into the same 1-10
// user vector app/page.tsx would hold for that person. Not a sample: this IS
// the complete set of users the quiz can produce.
const questionVectors = personalityQuestions.map((q) => q.options.map((o) => o.vector));
const questionCount = questionVectors.length;
const userCount = questionVectors.reduce((acc, q) => acc * q.length, 1);

const userVectors = [];
{
  const choice = new Array(questionCount).fill(0);
  for (let u = 0; u < userCount; u++) {
    let rem = u;
    for (let qi = 0; qi < questionCount; qi++) {
      const n = questionVectors[qi].length;
      choice[qi] = rem % n;
      rem = Math.floor(rem / n);
    }
    const totals = totalsFrom(questionVectors.map((q, qi) => q[choice[qi]]));
    userVectors.push(userVectorFromQuizTotals(totals, questionCount));
  }
}
console.log(`${userCount.toLocaleString()} achievable user vectors (every quiz answer path).`);
console.log(
  `Deduping is pointless here — all ${userCount.toLocaleString()} totals are distinct.\n`
);

// --- the cell lattice ------------------------------------------------------
//
// A "cell" is one complete set of feasibility answers: a real thing a real user
// can be in. Enumerated as a mixed-radix odometer over the option counts.
function* everyCell(questions) {
  const counts = questions.map((q) => q.options.length);
  const total = counts.reduce((a, b) => a * b, 1);
  const pick = new Array(counts.length).fill(0);
  for (let i = 0; i < total; i++) {
    let rem = i;
    for (let qi = 0; qi < counts.length; qi++) {
      pick[qi] = rem % counts[qi];
      rem = Math.floor(rem / counts[qi]);
    }
    yield {
      actions: questions.map((q, qi) => q.options[pick[qi]].action),
      labels: questions.map((q, qi) => q.options[pick[qi]].text),
    };
  }
}

const PATHWAYS = [
  { tag: "quick-fix", label: "quick-fix", questions: QUICK_QUESTIONS },
  { tag: "long-term", label: "long-term", questions: HOBBY_QUESTIONS },
];

// ===========================================================================
// PASS 1 — the unconstrained merit baseline
//
// ⚠️ THE BASELINE POOL IS SYNTHETIC ON THE QUICK PATH, and that is deliberate.
// "Every answer set to don't-mind" is not reachable there: the quick company
// question offers only Just me / One other person / A few of us, with no
// don't-mind (lib/feasibilityQuestions.ts). So the baseline is the whole
// pathway pool with NO constraints at all — a pool no quick-path user is ever
// literally handed.
//
// That is the right baseline anyway, because MERIT-DARK is a question about FIT
// ALONE: given no feasibility pressure whatsoever, is this row ever among the
// best 8 for anybody? Feasibility is then handled properly by the witness
// search below, which uses only real cells. Mixing the two into one number
// would answer neither question.
//
// No rotation memory either — every user here is a fresh visitor. Rotation only
// pushes recently-shown rows DOWN, so including it could only ever make a row
// look darker than it is.
// ===========================================================================
const results = [];

for (const pathway of PATHWAYS) {
  const pool = poolFor(activities, pathway.tag);
  const earnedBy = new Map(pool.map((a) => [a.id, 0]));

  console.log(`${pathway.label}: ranking ${pool.length} activities for every user...`);
  const started = Date.now();
  for (const userVector of userVectors) {
    const ranked = rankActivities(userVector, pool);
    const top = Math.min(EARNED_SLOTS, ranked.length);
    for (let i = 0; i < top; i++) earnedBy.set(ranked[i].id, earnedBy.get(ranked[i].id) + 1);
  }
  console.log(`  done in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  // If the 8 slots were shared out evenly, this is the share each row would
  // hold. Printed for scale only — it is not a target and not a gate.
  const fairShare = (EARNED_SLOTS / pool.length) * 100;

  const rows = pool
    .map((a) => {
      const n = earnedBy.get(a.id);
      const share = (n / userCount) * 100;
      return {
        ...a,
        earned: n,
        share,
        band: n === 0 ? "MERIT-DARK" : share < OFTEN_SHARE ? "EARNED-RARELY" : "EARNED-OFTEN",
      };
    })
    .sort((a, b) => b.earned - a.earned);

  results.push({ pathway, pool, rows, fairShare });
}

// ===========================================================================
// PASS 2 — witness search for the dark rows
//
// A MERIT-DARK row lost the open contest. It can still win a constrained one:
// once the hard filters have removed its better-fitting neighbours, a row that
// never places in a field of 76 may place easily in a field of 6. So for every
// dark row, walk the real cells it survives in and look for any (cell, user)
// where it earns a slot.
//
// Two facts make this cheap rather than 516 x 81,920 x pool-size:
//
//   1. THE RELAXED SURVIVOR SET DEPENDS ON THE CELL, NOT THE USER — the filters
//      read tags, and relaxation counts survivors. So it is computed once per
//      cell and reused for every user.
//   2. ANY CELL WITH <= 8 SURVIVORS IS AN IMMEDIATE WITNESS for everything in
//      it, whoever the user is, because there are not enough rows to fill the
//      slots. CLAUDE.md's own coverage numbers say most cells are that small,
//      so most searches end on their first cell.
//
// Otherwise users are tried in ascending distance from the target — its best
// possible advocates first — and the search stops at the first witness found.
// ===========================================================================
const cellCache = new Map();
for (const entry of results) {
  const { pathway } = entry;
  const pool = entry.pool;
  const cells = [];
  for (const cell of everyCell(pathway.questions)) {
    const { survivors, bent } = selectSurvivors(
      pool,
      constraintsFrom(pathway.questions, cell.actions),
      pathway.tag
    );
    cells.push({ ...cell, survivors, bent, ids: new Set(survivors.map((a) => a.id)) });
  }
  cellCache.set(pathway.tag, cells);
  entry.cells = cells;
  console.log(
    `${pathway.label}: ${cells.length} answer cells, ` +
      `median relaxed pool ${median(cells.map((c) => c.survivors.length))}`
  );
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

for (const entry of results) {
  const dark = entry.rows.filter((r) => r.band === "MERIT-DARK");
  if (!dark.length) {
    console.log(`${entry.pathway.label}: no MERIT-DARK activities.`);
    continue;
  }
  console.log(`${entry.pathway.label}: witness-searching ${dark.length} dark activities...`);

  for (const row of dark) {
    const cells = entry.cells.filter((c) => c.ids.has(row.id));
    row.cellsSurvived = cells.length;
    row.witness = null;

    // Cheapest first: a cell too small to fill the slots is a witness outright.
    const tiny = cells.find((c) => c.survivors.length <= EARNED_SLOTS);
    if (tiny) {
      row.witness = {
        kind: "small-pool",
        labels: tiny.labels,
        bent: tiny.bent,
        poolSize: tiny.survivors.length,
      };
      continue;
    }

    // Otherwise: the users who like this row most, in order, until one of them
    // ranks it inside the slots.
    const byAffinity = userVectors
      .map((v, index) => ({ index, d: euclideanDistance(v, row.vector) }))
      .sort((a, b) => a.d - b.d);

    // The best placing this row ever manages, over every cell and every user.
    // For a row that finds a witness this stops at the witness; for one that
    // does not, it is the whole point — "dark" is much more useful as "its best
    // ever placing is rank 9, one slot short" than as a flag.
    let bestRank = Infinity;
    let bestAt = null;

    outer: for (const cell of cells) {
      for (const candidate of byAffinity) {
        const userVector = userVectors[candidate.index];
        let better = 0;
        const own = euclideanDistance(userVector, row.vector);
        for (const other of cell.survivors) {
          if (other.id === row.id) continue;
          // Strictly closer, so an exact tie does NOT count against the row.
          // That is optimistic by a hair, and optimistic is the safe direction
          // here: it can only ever find MORE witnesses, so a row this still
          // calls fully dark really is.
          if (euclideanDistance(userVector, other.vector) < own) better++;
        }
        if (better + 1 < bestRank) {
          bestRank = better + 1;
          bestAt = cell;
        }
        if (better < EARNED_SLOTS) {
          row.witness = {
            kind: "ranked",
            labels: cell.labels,
            bent: cell.bent,
            poolSize: cell.survivors.length,
            rank: better + 1,
          };
          break outer;
        }
      }
    }

    row.bestRank = bestRank;
    row.bestAt = bestAt;
  }
}

// --- nearest competitors, for the dark list --------------------------------
//
// Why a row lost is usually visible in one line: the neighbours sitting between
// it and every user. Measured on the same Euclidean distance rankActivities
// uses, within the row's own pathway pool.
function nearestCompetitors(row, pool) {
  return pool
    .filter((a) => a.id !== row.id)
    .map((a) => ({ title: a.title, d: euclideanDistance(a.vector, row.vector) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, COMPETITORS_SHOWN);
}

// ===========================================================================
// THE REPORT
// ===========================================================================
const out = [];
const push = (line = "") => out.push(line);

push("# Activity reachability audit");
push();
push(
  "Generated by `scripts/audit-activity-reachability.mjs`. Report only — it changes no data,"
);
push("proposes nothing, and always exits 0.");
push();
push("## What was measured, and in which regime");
push();
push(
  "**Regime: FIT-ONLY.** Hard filters → graceful relaxation → `rankActivities` → the top 3 plus"
);
push("reroll ranks 4–8. **There is no `diverseSelect` in these numbers.**");
push();
push(
  "⚠️ **That is no longer the regime on `main`.** `result-diversity` merged on 2026-08-27, so the"
);
push(
  "greedy diversity re-rank is live. The numbers below describe the pipeline as it stood"
);
push(
  "immediately *before* that merge. Treat them as a **lower bound** on what is reachable rather"
);
push(
  "than a description of today: a pass that skips near-duplicates pulls different rows into the"
);
push("earned-8, and some of what is dark here may not be dark any more.");
push();
push(`- **Catalogue:** ${activities.length} activities from \`${path.relative(process.cwd(), seedPath)}\`.`);
push(
  `- **Users:** all ${userCount.toLocaleString()} achievable quiz answer paths, each turned into the` +
    " user vector the app would hold. Every one is distinct, so nothing is sampled and nothing deduped."
);
push(
  `- **Earned:** inside the top ${EARNED_SLOTS} — the 3 ranked cards plus the 5 rerolls behind them.`
);
push(
  "- **Baseline pool:** the whole pathway pool with no constraints. On the quick path that is a" +
    " *synthetic* pool — its company question has no don't-mind option, so a fully unconstrained"
);
push(
  "  quick cell is not something a user can reach. MERIT-DARK is a question about fit alone, and" +
    " feasibility is handled separately by the witness search."
);
push("- **No rotation memory:** every user is treated as a fresh visitor.");
push(
  "- **Ties count in the row's favour** during the witness search, which can only ever find *more*" +
    " witnesses — so anything still called fully dark really is."
);
push();
push("### The bands");
push();
push("| band | meaning |");
push("|---|---|");
push(`| EARNED-OFTEN | earns a slot for at least ${OFTEN_SHARE}% of achievable users |`);
push("| EARNED-RARELY | earns a slot for at least one user, but under that line |");
push("| MERIT-DARK | earns a slot for **no** user, in the unconstrained pool |");
push();
push(
  "⚠️ **MERIT-DARK is not invisible.** Everything in the catalogue stays wildcard-reachable by"
);
push(
  "construction: the wildcard is drawn at random from the raw pathway pool and obeys no filter, no"
);
push(
  "ranking and no budget answer. A dark row is one that never wins a slot *on fit* — which is a"
);
push("content observation, not a fault, and what to do about it is not this script's call.");
push();

let totalDark = 0;
for (const entry of results) {
  const { pathway, rows, pool, fairShare } = entry;
  const bands = {
    "EARNED-OFTEN": rows.filter((r) => r.band === "EARNED-OFTEN"),
    "EARNED-RARELY": rows.filter((r) => r.band === "EARNED-RARELY"),
    "MERIT-DARK": rows.filter((r) => r.band === "MERIT-DARK"),
  };
  totalDark += bands["MERIT-DARK"].length;

  push(`## ${pathway.label} — ${pool.length} activities`);
  push();
  push(
    `An even split of the ${EARNED_SLOTS} slots would give every row ${fairShare.toFixed(1)}%.` +
      " Printed for scale; it is not a target."
  );
  push();
  push("| band | activities |");
  push("|---|---|");
  for (const [band, list] of Object.entries(bands)) {
    push(`| ${band} | ${list.length} (${((list.length / pool.length) * 100).toFixed(0)}%) |`);
  }
  push();
  push("| activity | users earning it | share | band |");
  push("|---|---|---|---|");
  for (const row of rows) {
    push(
      `| ${row.title} | ${row.earned.toLocaleString()} | ${row.share.toFixed(2)}% | ${row.band} |`
    );
  }
  push();

  const dark = bands["MERIT-DARK"];
  if (!dark.length) {
    push(`**No MERIT-DARK activities on the ${pathway.label} path.** Every row earns a slot for at`);
    push("least one achievable user in the unconstrained pool.");
    push();
    continue;
  }

  push(`### The ${dark.length} MERIT-DARK activities, and whether a real cell rescues them`);
  push();
  for (const row of dark) {
    push(`#### ${row.title}`);
    push();
    push(`- **vector** ${row.vector.map((v, i) => `${AXES[i]} ${v}`).join(" · ")}`);
    push(`- **tags** \`${row.tags.join("`, `")}\``);
    push(`- **survives in** ${row.cellsSurvived} of ${entry.cells.length} answer cells`);
    if (row.witness) {
      const w = row.witness;
      push(
        `- **WITNESS FOUND** — ${w.kind === "small-pool" ? "a cell leaves only " + w.poolSize + " survivors, too few to fill the slots" : `earns rank ${w.rank} of ${w.poolSize} survivors`}`
      );
      push(`  - answers: ${w.labels.map((l) => `*${l}*`).join(" · ")}`);
      if (w.bent.length) push(`  - after relaxing: ${w.bent.join(", then ")}`);
    } else {
      push(
        "- ⚠️ **FULLY DARK** — no combination of a real answer cell and an achievable user puts this"
      );
      push("  row inside the earned slots. It is reachable only as a wildcard.");
      if (Number.isFinite(row.bestRank)) {
        push(
          `  - best placing it ever manages: **rank ${row.bestRank}**, against ${EARNED_SLOTS} slots` +
            `${row.bestRank === EARNED_SLOTS + 1 ? " — one short" : ""}`
        );
        if (row.bestAt) {
          push(`  - at: ${row.bestAt.labels.map((l) => `*${l}*`).join(" · ")}`);
        }
      }
    }
    push(`- **nearest competitors** (same pathway, by vector distance):`);
    for (const c of nearestCompetitors(row, pool)) {
      push(`  - ${c.d.toFixed(2)} — ${c.title}`);
    }
    push();
  }
}

push("---");
push();
push("## Standing rule");
push();
push(
  "**Run this after every content wave.** Starvation and darkness are both functions of pool size"
);
push(
  "and pool shape, so every wave moves them — and a row that goes dark does so silently. Nothing"
);
push("errors, nothing warns, and the activity simply stops being recommended.");
push();

writeFileSync(outPath, out.join("\n"), "utf8");

// --- console summary -------------------------------------------------------
console.log("\n" + "-".repeat(74));
console.log("\nSUMMARY\n");
console.log(`    ${pad("pathway", 12)} ${num("often", 7)} ${num("rarely", 8)} ${num("dark", 6)}   fully dark`);
for (const entry of results) {
  const dark = entry.rows.filter((r) => r.band === "MERIT-DARK");
  const fully = dark.filter((r) => !r.witness);
  console.log(
    `    ${pad(entry.pathway.label, 12)} ` +
      `${num(entry.rows.filter((r) => r.band === "EARNED-OFTEN").length, 7)} ` +
      `${num(entry.rows.filter((r) => r.band === "EARNED-RARELY").length, 8)} ` +
      `${num(dark.length, 6)}   ` +
      (fully.length
        ? fully.map((r) => `${r.title} (best rank ${r.bestRank})`).join("; ")
        : "none")
  );
}
console.log(`\n    ${totalDark} MERIT-DARK row(s) in total.`);
console.log(`\n    Wrote ${outPath}`);
console.log(
  `\n    ⚠️  FIT-ONLY regime: measured WITHOUT diverseSelect, which HAS been live on main\n` +
    `        since 2026-08-27. These are a lower bound, not today's picture. Re-run after\n` +
    `        every content wave — and see the header before trusting the dark list.`
);
