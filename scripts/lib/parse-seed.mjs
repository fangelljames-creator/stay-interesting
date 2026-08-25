/**
 * Shared parser for the seed activities in supabase/step1-schema-rls-seed.sql.
 *
 * The seed lives in SQL because that is what gets run against Supabase, but two
 * dev scripts need to reason about it in JavaScript:
 *   - validate-activity-seed.mjs  (are the tags coherent?)
 *   - verify-activity-matching.mjs (does the matcher rank it sensibly?)
 *
 * Both read the same rows through here, so a change to the SQL layout is fixed
 * in one place rather than two.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/** Axis order, mirroring lib/matchActivities.ts and data/personalityQuiz.ts. */
export const AXES = [
  "Social",
  "Energy",
  "Creative",
  "Analytical",
  "Outdoors",
  "Novelty",
  "Stimulation",
];

/** Hard-filter tag groups, mirroring the constants at the top of app/page.tsx. */
export const PATHWAY_TAGS = ["quick-fix", "long-term"];
export const SOCIAL_TAGS = ["solo", "couple", "social"];
export const LOCATION_TAGS = ["inside", "outside"];

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const seedSqlPath = join(repoRoot, "supabase", "step1-schema-rls-seed.sql");

/**
 * Pulls (title, description, tags, vector) out of the seed's VALUES block.
 * Returns [{ title, tags: string[], vector: number[] }].
 */
export function parseSeedActivities(sqlPath = seedSqlPath) {
  const sql = readFileSync(sqlPath, "utf8");

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

  if (rows.length === 0) {
    throw new Error(`No seed rows parsed from ${sqlPath} — has the SQL layout changed?`);
  }
  return rows;
}

/** Index of the axis an activity leans hardest into. Ties go to the earliest axis. */
export function dominantAxis(vector) {
  return vector.indexOf(Math.max(...vector));
}
