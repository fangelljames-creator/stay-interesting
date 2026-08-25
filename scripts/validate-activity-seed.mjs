#!/usr/bin/env node
/**
 * Validates the seed activities in supabase/step1-schema-rls-seed.sql against
 * the closed tag vocabulary.
 *
 *   node scripts/validate-activity-seed.mjs
 *
 * Imports lib/activityTags.ts directly (Node strips the types), so the
 * vocabulary cannot drift between the app and this check — there is one
 * definition and both read it.
 *
 * THE DOCTRINE: tags encode feasibility, the vector ranks, and a tag no hard
 * filter reads must not exist. These are hard failures rather than warnings
 * because every one of them makes an activity silently unreachable, and
 * nothing in the running app would ever tell you.
 */
import {
  ACTIVITY_TAGS,
  isActivityTag,
  PATHWAY_TAGS,
  COMPANY_TAGS,
  PLACE_TAGS,
  SETTING_TAGS,
  COST_TAGS,
  TIME_LADDER,
} from "../lib/activityTags.ts";
import { parseSeedActivities } from "./lib/parse-seed.mjs";
import { QUICK_QUESTIONS, HOBBY_QUESTIONS, MIN_RESULTS } from "../lib/feasibilityQuestions.ts";
import { satisfiesFilter } from "../lib/activityTags.ts";

const rows = parseSeedActivities();
const failures = [];
const SEPARATOR = "-".repeat(72);

console.log(`Parsed ${rows.length} seed activities from supabase/step1-schema-rls-seed.sql`);
console.log(`Vocabulary: ${ACTIVITY_TAGS.length} legal tags\n`);

for (const row of rows) {
  const has = (tag) => row.tags.includes(tag);

  // 1. Closed vocabulary. Anything else is a tag no filter reads.
  const unknown = row.tags.filter((tag) => !isActivityTag(tag));
  if (unknown.length) {
    failures.push(`"${row.title}": tag(s) not in the vocabulary — ${unknown.join(", ")}`);
  }

  // 2. Exactly one cost tier. Cost is applied as a ceiling, so one is enough
  //    and more than one makes the tag meaningless.
  const costs = row.tags.filter((tag) => COST_TAGS.includes(tag));
  if (costs.length !== 1) {
    failures.push(`"${row.title}": ${costs.length} cost tiers (${costs.join(", ") || "none"}), needs exactly 1`);
  }

  // 3. Completeness — each of these makes the row invisible to everyone.
  if (!COMPANY_TAGS.some(has)) failures.push(`"${row.title}": no company tag`);
  if (!PLACE_TAGS.some(has)) failures.push(`"${row.title}": no place tag`);

  // 4. A pathway, and a time tag for EACH pathway carried. An activity on the
  //    quick path with only weekly time tags can never answer "how long have
  //    you got?", so it would never appear.
  const pathways = PATHWAY_TAGS.filter(has);
  if (!pathways.length) {
    failures.push(`"${row.title}": no pathway tag`);
  }
  for (const pathway of pathways) {
    if (!TIME_LADDER[pathway].some(has)) {
      failures.push(`"${row.title}": carries ${pathway} but no ${pathway} time tag`);
    }
  }

  if (new Set(row.tags).size !== row.tags.length) {
    failures.push(`"${row.title}": duplicate tag`);
  }
}

// --- Inventory (informational) ---------------------------------------------
const used = new Set(rows.flatMap((row) => row.tags));
const unused = ACTIVITY_TAGS.filter((tag) => !used.has(tag));

const group = (name, tags) => {
  const counts = tags.map((tag) => `${tag} ${rows.filter((r) => r.tags.includes(tag)).length}`);
  console.log(`  ${name.padEnd(9)} ${counts.join("   ")}`);
};
console.log("Tag usage:");
group("pathway", PATHWAY_TAGS);
group("quick", TIME_LADDER["quick-fix"]);
group("long", TIME_LADDER["long-term"]);
group("place", PLACE_TAGS);
group("setting", SETTING_TAGS);
group("company", COMPANY_TAGS);
group("cost", COST_TAGS);
console.log(`  exertion  ${rows.filter((r) => r.tags.includes("exertion")).length}`);

const dual = rows.filter((r) => PATHWAY_TAGS.every((p) => r.tags.includes(p)));
console.log(`\nCarrying both pathways (${dual.length}): ${dual.map((r) => r.title).join(", ") || "none"}`);

if (unused.length) {
  console.log(`\nLegal but unused tags: ${unused.join(", ")}`);
  console.log("  (not a failure, but a tag nothing carries filters everything out)");
}

// --- Coverage report (DIAGNOSTIC, never fatal) -----------------------------
//
// Walks every combination of answers a user can give and counts how many
// activities survive the hard filters BEFORE any relaxation. Imports the real
// questions from lib/feasibilityQuestions.ts rather than restating them, so it
// cannot drift from what the app actually asks.
//
// A high starvation rate is not automatically a fault: it means the filters are
// strict relative to the catalogue, and relaxation exists to absorb exactly
// that. It IS a fault when a combination sits at zero, because then that set of
// answers can never be satisfied honestly and always bends.
console.log(SEPARATOR);
console.log("COVERAGE (diagnostic - relaxation absorbs these at runtime)");
console.log("");

for (const [questions, pathway, label] of [
  [QUICK_QUESTIONS, "quick-fix", "quick"],
  [HOBBY_QUESTIONS, "long-term", "hobby"],
]) {
  const pool = rows.filter((row) => row.tags.includes(pathway));
  const sizes = questions.map((q) => q.options.length);
  const total = sizes.reduce((a, b) => a * b, 1);

  const blame = new Map();
  let starved = 0;
  let zero = 0;

  for (let n = 0; n < total; n++) {
    let rem = n;
    const choice = sizes.map((size) => {
      const pick = rem % size;
      rem = Math.floor(rem / size);
      return pick;
    });
    const actions = questions.map((q, i) => q.options[choice[i]].action);
    const survivors = pool.filter((a) => actions.every((act) => satisfiesFilter(a.tags, act)));

    if (survivors.length >= MIN_RESULTS) continue;
    starved++;
    if (survivors.length === 0) zero++;
    choice.forEach((pick, i) => {
      const text = questions[i].options[pick].text;
      blame.set(text, (blame.get(text) ?? 0) + 1);
    });
  }

  const pct = ((starved / total) * 100).toFixed(0);
  console.log(
    "  " + label.padEnd(7) + starved + " of " + total + " combinations start below " +
    MIN_RESULTS + " (" + pct + "%), " + zero + " at zero"
  );
  for (const [text, count] of [...blame.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)) {
    console.log("      " + String(count).padStart(3) + "x  " + text);
  }
  console.log("");
}
console.log("  Answers above appear most often in starved combinations - they are");
console.log("  where new activities would do the most good.");
console.log("");

if (failures.length) {
  console.log(`\n${failures.length} FAILURE(S):\n - ${failures.join("\n - ")}`);
  process.exit(1);
}
console.log("\nAll structural checks passed.");
