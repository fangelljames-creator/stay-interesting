#!/usr/bin/env node
/**
 * Measures how close activities sit to EACH OTHER, to choose the diversity
 * threshold D before any behaviour depends on it.
 *
 *   node scripts/measure-activity-diversity.mjs
 *   node scripts/measure-activity-diversity.mjs --seed <path-to-a-seed.sql>
 *
 * ⚠️ REPORT ONLY. This script changes nothing and never fails a run — it
 * always exits 0. It exists so D is picked from the catalogue's actual
 * distance distribution rather than from a number that felt about right.
 *
 * WHY PAIRS ARE COMPUTED WITHIN EACH PATHWAY. An activity is only ever ranked
 * against its own pathway pool, so a quick-fix row sitting close to a
 * long-term row is not a collision anybody can ever see. Rows carrying BOTH
 * pathway tags appear in both pools, which is correct for the same reason.
 *
 * WHAT D IS FOR. rankActivities orders by distance from the USER. It has no
 * idea two activities can be near-identical to EACH OTHER, so a cluster that
 * fits someone well ranks adjacently and fills all three slots with one idea.
 * D is the minimum distance between things shown together.
 *
 * READING THE OUTPUT. A good D prunes the TAIL (true twins) and leaves the
 * BODY alone. That means it should sit low in the distribution — roughly the
 * 5th to 10th percentile of within-pathway distances. A D that swallows more
 * than 10-15% of pairs is not de-duplicating, it is thinning the catalogue.
 *
 * ⚠️ THE WATCHLIST BELOW IS A REPORT ORACLE, NOT A RUNTIME INPUT. It is a
 * hand-written list of pairs a human already knows the answer for, used only
 * to sanity-check what a given D does to them. Nothing at runtime reads it,
 * and it is NOT the "manual grouping" the diversity feature deliberately
 * avoids — the selection rule sees nothing but the vectors.
 */
import { euclideanDistance, MAX_DISTANCE, AXIS_COUNT } from "../lib/matchActivities.ts";
import { parseSeedActivities, seedSqlPath } from "./lib/parse-seed.mjs";

/** The values to report on explicitly, per the brief. */
const CANDIDATE_DS = [2.5, 3.0, 3.5];

/** Above this share of pairs, D is thinning the catalogue rather than de-duplicating. */
const SWALLOW_WARN = 10;
const SWALLOW_ALARM = 15;

/**
 * Pairs a human already has an opinion about.
 *   expect "merge" — a true twin; D SHOULD collapse these.
 *   expect "apart" — genuinely different ideas that happen to be neighbours;
 *                    D MUST NOT collapse these.
 * Titles that are not in the catalogue being measured are reported as absent
 * rather than skipped silently, so running against a smaller seed says so.
 */
const WATCH_PAIRS = [
  { expect: "merge", a: "Restore a cast iron skillet", b: "Restore a vintage typewriter" },
  { expect: "apart", a: "Indoor bouldering", b: "Trail running and hillwalking" },
  { expect: "apart", a: "Indoor bouldering", b: "Hiking and hillwalking" },
  { expect: "apart", a: "Playing pool", b: "Darts or table tennis, first to 21" },
  { expect: "apart", a: "Chess puzzle rush", b: "EV market analysis" },
];

/** Groups where EVERY internal pair is a twin candidate. */
const WATCH_FAMILIES = [
  {
    label: "walking family",
    titles: [
      "A walk with no destination",
      "Walk a street you have never walked down",
      "Walk somewhere with a view and take a flask",
      "Photo walk down your own street",
      "Map a historic walking tour",
      "Hiking and hillwalking",
      "Trail running and hillwalking",
    ],
  },
];

const PATHWAYS = ["quick-fix", "long-term"];

// ---------------------------------------------------------------------------

const seedArgIndex = process.argv.indexOf("--seed");
const seedPath = seedArgIndex === -1 ? seedSqlPath : process.argv[seedArgIndex + 1];
const activities = parseSeedActivities(seedPath);

const d2 = (n) => n.toFixed(2);
const pc = (n) => `${n.toFixed(1)}%`;
/** The most two activities this far apart can differ in match %, for ANY user. */
const matchCeiling = (d) => (d / MAX_DISTANCE) * 100;

console.log(`Seed: ${seedPath}`);
console.log(`${activities.length} activities, ${AXIS_COUNT} axes.`);
console.log(
  `Max possible distance ${d2(MAX_DISTANCE)} (9 * sqrt(${AXIS_COUNT})), ` +
    `so 1.0 of distance is ${d2(100 / MAX_DISTANCE)} match points.\n`
);

/** All within-pathway pairs, nearest first. */
function pairsFor(pathwayTag) {
  const pool = activities.filter((a) => a.tags.includes(pathwayTag));
  const pairs = [];
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      pairs.push({
        a: pool[i].title,
        b: pool[j].title,
        distance: euclideanDistance(pool[i].vector, pool[j].vector),
      });
    }
  }
  pairs.sort((x, y) => x.distance - y.distance);
  return { pool, pairs };
}

const byPathway = new Map(PATHWAYS.map((tag) => [tag, pairsFor(tag)]));
const both = activities.filter((a) => PATHWAYS.every((tag) => a.tags.includes(tag)));
console.log(`${both.length} activities carry BOTH pathways and so appear in both pools.\n`);

const percentileOf = (pairs, q) => pairs[Math.min(pairs.length - 1, Math.floor((q / 100) * pairs.length))].distance;
const shareBelow = (pairs, d) => (pairs.filter((p) => p.distance < d).length / pairs.length) * 100;

// ---------------------------------------------------------------------------
// (a) The distribution
// ---------------------------------------------------------------------------
console.log("=".repeat(78));
console.log("(a) WITHIN-PATHWAY DISTANCE DISTRIBUTION\n");

for (const tag of PATHWAYS) {
  const { pool, pairs } = byPathway.get(tag);
  console.log(`--- ${tag}: ${pool.length} activities, ${pairs.length} pairs ---\n`);

  const widest = pairs[pairs.length - 1].distance;
  const bucket = 0.5;
  const buckets = new Map();
  for (const pair of pairs) {
    const key = Math.floor(pair.distance / bucket) * bucket;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const tallest = Math.max(...buckets.values());

  for (let edge = 0; edge <= widest; edge += bucket) {
    const count = buckets.get(edge) ?? 0;
    const bar = "#".repeat(Math.round((count / tallest) * 46));
    const marks = [];
    for (const q of [1, 5, 10, 25, 50, 75]) {
      const value = percentileOf(pairs, q);
      if (value >= edge && value < edge + bucket) marks.push(`p${q}`);
    }
    for (const d of CANDIDATE_DS) {
      if (d >= edge && d < edge + bucket) marks.push(`D=${d.toFixed(1)}`);
    }
    console.log(
      `  ${edge.toFixed(1).padStart(5)} ${String(count).padStart(5)}  ${bar.padEnd(47)}` +
        (marks.length ? `<- ${marks.join(" ")}` : "")
    );
  }

  console.log("");
  const marks = [1, 5, 10, 25, 50, 75].map((q) => `p${q}=${d2(percentileOf(pairs, q))}`);
  console.log(`  percentiles  ${marks.join("  ")}`);
  console.log(`  closest pair ${d2(pairs[0].distance)}   widest pair ${d2(widest)}\n`);

  for (const d of CANDIDATE_DS) {
    const share = shareBelow(pairs, d);
    const verdict =
      share > SWALLOW_ALARM
        ? "!! ALARM  thinning the catalogue, not de-duplicating"
        : share > SWALLOW_WARN
          ? "!  WARN   above the 10% comfort line"
          : "   ok     prunes the tail, leaves the body";
    console.log(
      `  D=${d.toFixed(1)}  swallows ${pc(share).padStart(6)} of pairs  ` +
        `(~p${Math.round(share)})  ${verdict}`
    );
  }
  console.log("");
}

// ---------------------------------------------------------------------------
// (b) The closest pairs
// ---------------------------------------------------------------------------
console.log("=".repeat(78));
console.log("(b) THE 15 CLOSEST PAIRS IN EACH PATHWAY\n");

for (const tag of PATHWAYS) {
  const { pairs } = byPathway.get(tag);
  console.log(`--- ${tag} ---`);
  pairs.slice(0, 15).forEach((pair, index) => {
    console.log(
      `  ${String(index + 1).padStart(2)}. ${d2(pair.distance).padStart(5)}  ` +
        `${pair.a}  <->  ${pair.b}`
    );
  });
  console.log("");
}

// ---------------------------------------------------------------------------
// (c) What each candidate D actually does, by name
// ---------------------------------------------------------------------------
console.log("=".repeat(78));
console.log("(c) NAMED-PAIR REPORT AT EACH CANDIDATE D\n");

for (const d of CANDIDATE_DS) {
  console.log(
    `--- D = ${d.toFixed(1)}  (match-% ceiling between a merged pair: ` +
      `${matchCeiling(d).toFixed(1)} points) ---\n`
  );
  for (const tag of PATHWAYS) {
    const { pairs } = byPathway.get(tag);
    const merged = pairs.filter((p) => p.distance < d);
    console.log(`  ${tag}: ${merged.length} pair(s) merge (${pc(shareBelow(pairs, d))})`);
    merged.slice(0, 20).forEach((pair) => {
      console.log(`     ${d2(pair.distance)}  ${pair.a}  <->  ${pair.b}`);
    });
    if (merged.length > 20) console.log(`     ... and ${merged.length - 20} more`);
    console.log("");
  }
}

// ---------------------------------------------------------------------------
// The watchlist — pairs a human already has an opinion about
// ---------------------------------------------------------------------------
console.log("-".repeat(78));
console.log("WATCHLIST (report oracle only; nothing at runtime reads this)\n");

const byTitle = new Map(activities.map((a) => [a.title, a]));

/** Renders one pair against every candidate D, with a pass/fail on `expect`. */
function reportPair(a, b, expect, indent = "  ") {
  const rowA = byTitle.get(a);
  const rowB = byTitle.get(b);
  if (!rowA || !rowB) {
    const missing = [!rowA && a, !rowB && b].filter(Boolean).join(" | ");
    console.log(`${indent}ABSENT from this catalogue: ${missing}`);
    return;
  }
  const distance = euclideanDistance(rowA.vector, rowB.vector);
  const cells = CANDIDATE_DS.map((d) => {
    const merges = distance < d;
    const wanted = expect === "merge" ? merges : !merges;
    return `D=${d.toFixed(1)} ${(merges ? "MERGE" : "apart").padEnd(5)} ${wanted ? "ok" : "XX"}`;
  });
  console.log(`${indent}${d2(distance).padStart(5)}  ${a}  <->  ${b}`);
  console.log(`${indent}       want ${expect.padEnd(5)} | ${cells.join(" | ")}`);
}

console.log(" Named pairs:\n");
for (const pair of WATCH_PAIRS) {
  reportPair(pair.a, pair.b, pair.expect, "  ");
  console.log("");
}

for (const family of WATCH_FAMILIES) {
  const present = family.titles.filter((title) => byTitle.has(title));
  const absent = family.titles.filter((title) => !byTitle.has(title));
  console.log(` ${family.label}: ${present.length} of ${family.titles.length} present`);
  if (absent.length) console.log(`   absent here: ${absent.join(" | ")}`);
  console.log("");

  const inner = [];
  for (let i = 0; i < present.length; i++) {
    for (let j = i + 1; j < present.length; j++) {
      inner.push({
        a: present[i],
        b: present[j],
        distance: euclideanDistance(byTitle.get(present[i]).vector, byTitle.get(present[j]).vector),
      });
    }
  }
  inner.sort((x, y) => x.distance - y.distance);
  for (const pair of inner) {
    const cells = CANDIDATE_DS.map(
      (d) => `D=${d.toFixed(1)} ${pair.distance < d ? "MERGE" : "apart"}`
    );
    console.log(`   ${d2(pair.distance).padStart(5)}  ${pair.a}  <->  ${pair.b}`);
    console.log(`          ${cells.join(" | ")}`);
  }
  const collapsed = inner.filter((p) => p.distance < 3.0).length;
  console.log(
    `\n   At D=3.0, ${collapsed} of ${inner.length} internal pairs collapse. ` +
      `⚠️ D measures TASTE PROFILE, not surface category — genuinely different\n` +
      `   walks can and should survive it.\n`
  );
}

// ---------------------------------------------------------------------------
// (d) Per-pathway D?
// ---------------------------------------------------------------------------
console.log("=".repeat(78));
console.log("(d) DO THE PATHWAYS NEED DIFFERENT D VALUES?\n");

const summary = PATHWAYS.map((tag) => {
  const { pool, pairs } = byPathway.get(tag);
  return {
    tag,
    rows: pool.length,
    pairs: pairs.length,
    p1: percentileOf(pairs, 1),
    p5: percentileOf(pairs, 5),
    p10: percentileOf(pairs, 10),
    median: percentileOf(pairs, 50),
  };
});

console.log("  pathway     rows  pairs     p1     p5    p10  median");
for (const row of summary) {
  console.log(
    `  ${row.tag.padEnd(11)} ${String(row.rows).padStart(4)} ${String(row.pairs).padStart(6)} ` +
      `${d2(row.p1).padStart(6)} ${d2(row.p5).padStart(6)} ${d2(row.p10).padStart(6)} ${d2(row.median).padStart(7)}`
  );
}
console.log("");

for (const d of CANDIDATE_DS) {
  const bands = summary.map((row) => {
    const share = shareBelow(byPathway.get(row.tag).pairs, d);
    const inBand = d >= row.p1 && d <= row.p10;
    return `${row.tag} ${pc(share).padStart(6)} ${inBand ? "(in p1-p10)" : "(OUTSIDE p1-p10)"}`;
  });
  console.log(`  D=${d.toFixed(1)}  ${bands.join("   ")}`);
}

console.log("");
const singleWorks = CANDIDATE_DS.filter((d) =>
  summary.every((row) => d >= row.p1 && d <= row.p10)
);
if (singleWorks.length) {
  console.log(
    `  RECOMMENDATION: one D for both pathways. ` +
      `${singleWorks.map((d) => d.toFixed(1)).join(", ")} land inside the p1-p10 band on\n` +
      `  BOTH pathways, so the distributions differ in spread without disagreeing about\n` +
      `  where the tail ends. A second constant would be a second thing to keep true.`
  );
} else {
  console.log(
    `  RECOMMENDATION: the data DOES insist — no single candidate D lands inside the\n` +
      `  p1-p10 band on both pathways. Per-pathway values are justified here.`
  );
}

console.log("\n" + "=".repeat(78));
console.log("Report only. Nothing was changed and nothing failed.");
