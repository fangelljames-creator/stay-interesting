#!/usr/bin/env node
/**
 * Validates the seed activities in supabase/step1-schema-rls-seed.sql against
 * the hard filters in app/page.tsx. Run it after editing the seed:
 *
 *   node scripts/validate-activity-seed.mjs
 *
 * Why this exists: the recommendation pipeline hard-filters on pathway, social,
 * and location tags. An activity missing any of those can never be recommended
 * to anyone, and nothing surfaces that — it just quietly never appears. This
 * catches it, along with malformed vectors and filter combinations that leave
 * too few activities for the top-3 list to have any variety.
 *
 * Like scripts/analyze-quiz-balance.mjs, this mirrors the app's logic by hand,
 * so it goes stale if findPrecisionMatchesWithRotation changes and must be
 * updated alongside it.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sqlPath = join(repoRoot, "supabase", "step1-schema-rls-seed.sql");

// Hard-filter tag groups, mirroring the constants at the top of app/page.tsx.
const PATHWAY_TAGS = ["quick-fix", "long-term"];
const SOCIAL_TAGS = ["solo", "couple", "social"];
const LOCATION_TAGS = ["inside", "outside"];

// The tag sets a user can actually produce on each hard-filter axis, taken from
// BORED_QUIZ and HOBBY_QUIZ. Note the hobby quiz's "structured facility" answer
// emits no location tag at all, which means no location filter is applied.
const FILTER_COMBINATIONS = [
  { pathway: "quick-fix", socials: [["solo"], ["social", "couple"]], locations: [["inside"], ["outside"]] },
  { pathway: "long-term", socials: [["solo"], ["couple"], ["social"]], locations: [["inside"], ["outside"], []] },
];

// Top 3 plus a wildcard means 4 is the bare minimum; below 5 there is nothing
// for the rotation penalty to swap in and results never change between runs.
const MIN_SURVIVORS = 5;

const AXES = ["Social", "Energy", "Creative", "Analytical", "Outdoors", "Novelty", "Stimulation"];

function parseSeedRows(sql) {
  const start = sql.indexOf("with seed (title");
  const end = sql.indexOf("insert into public.activities");
  if (start === -1 || end === -1) {
    throw new Error(`Could not find the seed block in ${sqlPath}`);
  }

  const rowPattern =
    /\(\s*'((?:[^']|'')*)',\s*\n\s*'(?:[^']|'')*',\s*\n\s*array\[([^\]]*)\],\s*\n\s*array\[([^\]]*)\]\)/g;

  const rows = [];
  let match;
  while ((match = rowPattern.exec(sql.slice(start, end))) !== null) {
    rows.push({
      title: match[1].replace(/''/g, "'"),
      tags: match[2].split(",").map((tag) => tag.trim().replace(/^'|'$/g, "")),
      vector: match[3].split(",").map((n) => Number(n.trim())),
    });
  }
  return rows;
}

const rows = parseSeedRows(readFileSync(sqlPath, "utf8"));
const problems = [];

console.log(`Parsed ${rows.length} seed activities from supabase/step1-schema-rls-seed.sql\n`);
if (rows.length === 0) problems.push("No seed rows parsed — the SQL format may have changed.");

for (const row of rows) {
  const pathways = PATHWAY_TAGS.filter((tag) => row.tags.includes(tag));
  if (pathways.length !== 1) {
    problems.push(`"${row.title}": has ${pathways.length} pathway tags, needs exactly 1`);
  }
  if (!SOCIAL_TAGS.some((tag) => row.tags.includes(tag))) {
    problems.push(`"${row.title}": no social tag — can never be recommended`);
  }
  if (!LOCATION_TAGS.some((tag) => row.tags.includes(tag))) {
    problems.push(`"${row.title}": no location tag — can never be recommended`);
  }
  if (row.vector.length !== AXES.length) {
    problems.push(`"${row.title}": vector has ${row.vector.length} values, needs ${AXES.length}`);
  }
  if (row.vector.some((n) => !Number.isInteger(n) || n < 1 || n > 10)) {
    problems.push(`"${row.title}": vector values must be integers 1-10, got [${row.vector}]`);
  }
  if (new Set(row.tags).size !== row.tags.length) {
    problems.push(`"${row.title}": duplicate tag`);
  }
}

const titles = rows.map((row) => row.title);
if (new Set(titles).size !== titles.length) {
  problems.push("Duplicate titles in the seed — the insert de-duplicates by title.");
}

console.log(`Survivors per hard-filter combination (need >= ${MIN_SURVIVORS}):\n`);
for (const { pathway, socials, locations } of FILTER_COMBINATIONS) {
  for (const social of socials) {
    for (const location of locations) {
      const survivors = rows.filter(
        (row) =>
          row.tags.includes(pathway) &&
          social.some((tag) => row.tags.includes(tag)) &&
          (location.length === 0 || location.some((tag) => row.tags.includes(tag)))
      );
      const label = `${pathway} | social=${social.join("+")} | location=${location.join("+") || "(unfiltered)"}`;
      console.log(`  ${String(survivors.length).padStart(2)}  ${label}`);
      if (survivors.length < MIN_SURVIVORS) {
        problems.push(`Only ${survivors.length} activities survive: ${label}`);
      }
    }
  }
}

console.log("\nVector spread across the activity pool:");
AXES.forEach((axis, index) => {
  const values = rows.map((row) => row.vector[index]);
  const mean = values.reduce((sum, n) => sum + n, 0) / values.length;
  console.log(
    `  ${axis.padEnd(12)} mean ${mean.toFixed(2)}  range ${Math.min(...values)}-${Math.max(...values)}`
  );
});

if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n - ${problems.join("\n - ")}`);
  process.exit(1);
}
console.log("\nAll checks passed.");
