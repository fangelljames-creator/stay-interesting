#!/usr/bin/env node
/**
 * The starvation map, cell by cell.
 *
 *   node scripts/report-starvation.mjs
 *   node scripts/report-starvation.mjs --seed <path-to-a-seed.sql>
 *   node scripts/report-starvation.mjs --wave 2      (project the seed + a pending wave)
 *   node scripts/report-starvation.mjs --cells       (print every starved cell, not just zeros)
 *
 * ⚠️ REPORT ONLY. Changes nothing, proposes nothing, and always exits 0. It
 * exists because the number validate-activity-seed.mjs prints — "106 of 324
 * combinations start below 3" — says a problem exists without saying where.
 *
 * ⚠️ THE PER-CELL LIST IS NOT THE WORK LIST, AND MISREADING THAT WASTES A WAVE.
 * 172 starved cells is not 172 problems. Cells NEST: a cost ceiling makes "not a
 * concern" a superset of "keep it free", "don't mind" a superset of both place
 * answers, and "no fixed limit" a superset of all three times. So one empty tag
 * intersection prints as dozens of starved cells — `facility` + `free` sitting
 * at zero generates fifteen zero-cells by itself. The INTERSECTION GRID is the
 * section to author from; the cell list is there to prove the grid's reading and
 * to be classified.
 *
 * ⚠️ PRE-RELAXATION COUNTS. Nothing here is what a user sees: the ladder in
 * lib/selectionPipeline.ts bends place/setting, then energy, then time, so no
 * cell is empty on screen. A cell at 0 is one that ALWAYS bends. Cost and
 * company never bend, so a cell starved on either is starved permanently — those
 * are the ones only content can fix.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSeedActivities, seedSqlPath, repoRoot } from "./lib/parse-seed.mjs";
import {
  PATHWAY_SPECS,
  starvationOf,
  intersectionGrid,
  classifyCell,
  CELL_RULES,
  MIN_RESULTS,
} from "./lib/starvation.mjs";

const argv = process.argv.slice(2);
const argAfter = (flag) => {
  const i = argv.indexOf(flag);
  return i === -1 ? null : argv[i + 1];
};
const seedPath = argAfter("--seed") ?? seedSqlPath;
const waveNumber = argAfter("--wave");
const showAllCells = argv.includes("--cells");

const seeded = parseSeedActivities(seedPath);

let activities = seeded;
let projectionNote = null;
if (waveNumber) {
  const wavePath = join(repoRoot, "data", "waves", `wave-${waveNumber}.json`);
  const wave = JSON.parse(readFileSync(wavePath, "utf8"));
  const vetoed = new Set(wave.vetoed ?? []);
  const survivors = (wave.activities ?? []).filter((a) => !vetoed.has(a.title));

  // Tag corrections in the wave's audit change which cells an EXISTING row can
  // answer, so a projection that ignored them would understate the wave.
  const retag = new Map(
    (wave.audit ?? []).filter((c) => c.proposedTags).map((c) => [c.title, c.proposedTags])
  );
  activities = [
    ...seeded.map((r) => (retag.has(r.title) ? { ...r, tags: retag.get(r.title) } : r)),
    ...survivors,
  ];
  projectionNote =
    `PROJECTED: seed + wave ${waveNumber} (${survivors.length} new rows, ` +
    `${retag.size} re-tagged existing row${retag.size === 1 ? "" : "s"})`;
}

const SEPARATOR = "=".repeat(78);
const rule = "-".repeat(78);

console.log(SEPARATOR);
console.log("STARVATION MAP");
console.log(SEPARATOR);
console.log(`Seed: ${seedPath}`);
if (projectionNote) console.log(projectionNote);
const quickCount = activities.filter((a) => a.tags.includes("quick-fix")).length;
const longCount = activities.filter((a) => a.tags.includes("long-term")).length;
const dual = activities.filter(
  (a) => a.tags.includes("quick-fix") && a.tags.includes("long-term")
).length;
console.log(
  `${activities.length} activities — ${quickCount} quick-fix, ${longCount} long-term, ` +
    `${dual} carrying both.`
);
console.log(`Starved means fewer than MIN_RESULTS (${MIN_RESULTS}) survive, before relaxation.\n`);

// ---------------------------------------------------------------------------
// PER-PATHWAY: the classified cell list
// ---------------------------------------------------------------------------
const bandTotals = { plausible: 0, "low-frequency": 0, degenerate: 0 };
const zeroBandTotals = { plausible: 0, "low-frequency": 0, degenerate: 0 };

for (const spec of PATHWAY_SPECS) {
  const map = starvationOf(activities, spec);
  const pct = ((map.starvedCount / map.total) * 100).toFixed(0);

  console.log(rule);
  console.log(
    `${spec.label.toUpperCase()} path — pool ${map.poolSize}, ` +
      `${map.starvedCount} of ${map.total} cells starved (${pct}%), ${map.zeroCount} at zero`
  );
  console.log(rule);

  // A legend, because the table truncates. Truncation is deterministic and the
  // legend prints the full text beside it, so a reworded option cannot make the
  // table quietly lie about which answer it means.
  const WIDTH = 15;
  const trim = (s) => (s.length <= WIDTH ? s : s.slice(0, WIDTH - 1) + "…");
  console.log("");
  console.log("  Legend — column, then every option in the order the funnel offers them:");
  for (const q of spec.questions) {
    console.log(`    ${q.constraint.padEnd(8)} ${q.options.map((o) => o.text).join("  /  ")}`);
  }
  console.log("");

  const header =
    "    n  " +
    spec.questions.map((q) => q.constraint.slice(0, WIDTH).padEnd(WIDTH)).join(" ") +
    " band";
  console.log(header);
  console.log("    " + "-".repeat(header.length - 4));

  const shown = showAllCells ? map.starved : map.starved.filter((c) => c.count === 0);
  for (const cell of map.starved) {
    const band = classifyCell(cell);
    bandTotals[band.band]++;
    if (cell.count === 0) zeroBandTotals[band.band]++;
  }
  for (const cell of shown) {
    const band = classifyCell(cell);
    console.log(
      `    ${cell.count}  ` +
        cell.answers.map((a) => trim(a).padEnd(WIDTH)).join(" ") +
        ` ${band.band === "plausible" ? "PLAUSIBLE" : band.band.toUpperCase()}`
    );
  }
  if (!showAllCells && map.starvedCount > map.zeroCount) {
    console.log(
      `    … and ${map.starvedCount - map.zeroCount} more cells at 1 or 2 survivors. ` +
        `Re-run with --cells to list them.`
    );
  }
  console.log("");
}

// ---------------------------------------------------------------------------
// CLASSIFICATION SUMMARY
// ---------------------------------------------------------------------------
console.log(rule);
console.log("CLASSIFICATION");
console.log(rule);
console.log("");
console.log(`  PLAUSIBLE      ${String(bandTotals.plausible).padStart(4)} starved cells, ` +
  `${zeroBandTotals.plausible} at zero`);
console.log(`  LOW-FREQUENCY  ${String(bandTotals["low-frequency"]).padStart(4)} starved cells, ` +
  `${zeroBandTotals["low-frequency"]} at zero`);
console.log(`  DEGENERATE     ${String(bandTotals.degenerate).padStart(4)} starved cells, ` +
  `${zeroBandTotals.degenerate} at zero`);
console.log("");
console.log("  The rules, from scripts/lib/starvation.mjs — a hand-written oracle, not a");
console.log("  measurement. Nothing at runtime reads them.");
console.log("");
for (const r of CELL_RULES) {
  console.log(`  [${r.band}] ${r.name}`);
  console.log(`      ${r.reason.replace(/\s+/g, " ")}`);
}
if (!CELL_RULES.some((r) => r.band === "degenerate")) {
  console.log("");
  console.log("  ⚠️  NO DEGENERATE RULES, AND THAT IS THE FINDING. Every question asks an");
  console.log("      INDEPENDENT fact about a person's circumstances — how long they have, who");
  console.log("      is around, what they will spend. None can contradict another, so no");
  console.log("      combination is self-contradictory and every starved cell is a real user.");
}
console.log("");

// ---------------------------------------------------------------------------
// THE INTERSECTION GRID — the section to author from
// ---------------------------------------------------------------------------
console.log(rule);
console.log("INTERSECTION GRID — survivors per tag intersection. AUTHOR FROM THIS.");
console.log(rule);
console.log("");
console.log("  Each cell is free/low/any: how many survive at each cost CEILING, so the three");
console.log("  numbers are nested and can only rise left to right. A zero in the 'any' column is");
console.log("  a hole no budget answer can escape.");
console.log("");

for (const spec of PATHWAY_SPECS) {
  const grid = intersectionGrid(activities, spec);
  console.log(`  ${spec.label.toUpperCase()} — pool ${grid.poolSize}, ` +
    `dimensions: ${grid.dimensionNames.join(" x ")} x company x cost-ceiling`);
  console.log("");

  const keyWidth = Math.max(...grid.rows.map((r) => r.key.join(" ").length)) + 2;
  const companyLabels = grid.company.map(([label]) => label);
  console.log(
    "    " + "".padEnd(keyWidth) + companyLabels.map((l) => `${l} [f/l/a]`.padEnd(16)).join("")
  );

  for (const row of grid.rows) {
    const byCompany = companyLabels.map((label) => {
      const counts = row.cells.filter((c) => c.company === label).map((c) => c.count);
      const flag = counts[2] === 0 ? " !!" : counts[0] === 0 ? " !" : "";
      return (counts.join("/") + flag).padEnd(16);
    });
    console.log("    " + row.key.join(" ").padEnd(keyWidth) + byCompany.join(""));
  }
  console.log("");
  console.log("      !  nothing free here          !! nothing here at ANY budget");
  console.log("");
}

console.log(rule);
console.log("Report only. Nothing was changed and nothing is proposed.");
