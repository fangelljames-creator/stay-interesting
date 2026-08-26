#!/usr/bin/env node
/**
 * Renders a content wave: review file first, SQL only after Owen's veto pass.
 *
 *   node scripts/build-wave.mjs 1              -> data/waves/wave-1-review.md
 *   node scripts/build-wave.mjs 1 --sql        -> the SQL block, on stdout
 *
 * ONE SOURCE OF TRUTH. The wave is authored once, into data/waves/wave-N.json,
 * and both the review file and the SQL are rendered from it. There is no step
 * where 99 rows get retyped, so what Owen approves is byte-for-byte what
 * reaches the database. A `vetoed` array in that file is the veto: titles
 * listed there are dropped from both outputs and reported as dropped.
 *
 * The structural rules are enforced HERE, before the review file is ever
 * written, using the real vocabulary from lib/activityTags.ts. A wave that
 * cannot pass them is not worth reviewing, and hand-checking 99 rows for
 * "exactly one cost tier" is exactly the job a machine should have.
 *
 * WHAT THIS DOES NOT DO: judge the content. Whether a description sounds right,
 * whether a vector is honest against the rubric, and whether an activity is a
 * near-clone of another are all human calls. The dedupe report SURFACES
 * candidates and never drops anything on its own.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  isActivityTag,
  PATHWAY_TAGS,
  COMPANY_TAGS,
  PLACE_TAGS,
  SETTING_TAGS,
  COST_TAGS,
  TIME_LADDER,
} from "../lib/activityTags.ts";
import { parseSeedActivities, repoRoot, AXES, dominantAxis } from "./lib/parse-seed.mjs";
import { formatCatalogueStats } from "./lib/catalogue-stats.mjs";

const waveNumber = process.argv[2];
const wantSql = process.argv.includes("--sql");

if (!waveNumber || !/^\d+$/.test(waveNumber)) {
  console.error("usage: node scripts/build-wave.mjs <wave-number> [--sql]");
  process.exit(1);
}

const wavePath = join(repoRoot, "data", "waves", `wave-${waveNumber}.json`);
const reviewPath = join(repoRoot, "data", "waves", `wave-${waveNumber}-review.md`);
const wave = JSON.parse(readFileSync(wavePath, "utf8"));

const vetoed = new Set(wave.vetoed ?? []);
const all = wave.activities ?? [];
const survivors = all.filter((a) => !vetoed.has(a.title));
const audit = wave.audit ?? [];

const seeded = parseSeedActivities();
const seededByTitle = new Map(seeded.map((r) => [r.title, r]));

// ---------------------------------------------------------------------------
// STRUCTURAL CHECKS — hard failures. Nothing renders until these pass.
// ---------------------------------------------------------------------------
const failures = [];

for (const a of survivors) {
  const where = `"${a.title}"`;
  const tags = a.tags ?? [];
  const has = (t) => tags.includes(t);

  const unknown = tags.filter((t) => !isActivityTag(t));
  if (unknown.length) failures.push(`${where}: tag(s) outside the vocabulary — ${unknown.join(", ")}`);
  if (new Set(tags).size !== tags.length) failures.push(`${where}: duplicate tag`);

  const costs = tags.filter((t) => COST_TAGS.includes(t));
  if (costs.length !== 1) {
    failures.push(`${where}: ${costs.length} cost tiers (${costs.join(", ") || "none"}), needs exactly 1`);
  }

  if (!COMPANY_TAGS.some(has)) failures.push(`${where}: no company tag`);
  if (!PLACE_TAGS.some(has)) failures.push(`${where}: no place tag`);

  const pathways = PATHWAY_TAGS.filter(has);
  if (!pathways.length) failures.push(`${where}: no pathway tag`);
  for (const pathway of pathways) {
    if (!TIME_LADDER[pathway].some(has)) {
      failures.push(`${where}: carries ${pathway} but no ${pathway} time tag`);
    }
  }
  // Not enforced by the seed validator, but a long-term row with no setting is
  // invisible to three of the four answers to "where would it happen?".
  if (has("long-term") && !SETTING_TAGS.some(has)) {
    failures.push(`${where}: long-term with no setting tag — only reachable via "Anywhere"`);
  }

  const v = a.vector;
  if (!Array.isArray(v) || v.length !== 7 || v.some((n) => !Number.isInteger(n) || n < 1 || n > 10)) {
    failures.push(`${where}: vector must be 7 integers in 1-10, got ${JSON.stringify(v)}`);
  }

  if (!a.description || a.description.length < 40) {
    failures.push(`${where}: description missing or too short to be honest about effort`);
  }
  if (/\s{2,}|\n/.test(a.description ?? "")) failures.push(`${where}: description has stray whitespace`);
}

const titles = survivors.map((a) => a.title);
const dupes = titles.filter((t, i) => titles.indexOf(t) !== i);
if (dupes.length) failures.push(`duplicate titles within the wave: ${[...new Set(dupes)].join(", ")}`);

for (const c of audit) {
  if (!seededByTitle.has(c.title)) failures.push(`audit target not in the seed: "${c.title}"`);
  const v = c.proposed;
  if (!Array.isArray(v) || v.length !== 7 || v.some((n) => !Number.isInteger(n) || n < 1 || n > 10)) {
    failures.push(`audit "${c.title}": proposed vector must be 7 integers in 1-10`);
  }
  if (!c.reason) failures.push(`audit "${c.title}": no reason given`);
}

if (failures.length) {
  console.error(`\n${failures.length} STRUCTURAL FAILURE(S) — nothing rendered:\n`);
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// FUZZY DEDUPE — surfaced, never applied
// ---------------------------------------------------------------------------
const STOP = new Set(
  "a an the to to for from with your of on in and or at by out up it its this that make do get take learn how one your you".split(" ")
);
const keyOf = (t) => new Set(t.toLowerCase().match(/[a-z]+/g)?.filter((w) => !STOP.has(w)) ?? []);

const grams = (s) => {
  const t = s.toLowerCase().replace(/[^a-z]/g, "");
  return new Set(Array.from({ length: Math.max(0, t.length - 1) }, (_, i) => t.slice(i, i + 2)));
};

/**
 * Two signals, deliberately combined rather than maxed.
 *
 * Token overlap alone misses "Bonsai tree" against "Bonsai trees". Character
 * bigrams alone are far too generous on short English titles — they scored
 * "Kite surfing lessons" against "Reset one single surface" at 0.53, on nothing
 * but the bigrams every English phrase shares. So a bigram score only counts
 * when the two titles ALSO share at least one meaningful word. Strong token
 * overlap still stands on its own.
 */
function similarity(a, b) {
  const A = keyOf(a);
  const B = keyOf(b);
  const shared = [...A].filter((w) => B.has(w));
  const jaccard = A.size + B.size ? shared.length / new Set([...A, ...B]).size : 0;

  const GA = grams(a);
  const GB = grams(b);
  const dice = GA.size + GB.size ? (2 * [...GA].filter((g) => GB.has(g)).length) / (GA.size + GB.size) : 0;

  if (jaccard >= 0.2) return Math.max(jaccard, dice);
  if (shared.length > 0 && dice >= 0.5) return dice;
  return 0;
}

const DEDUPE_THRESHOLD = 0.5;
const collisions = [];
for (const a of survivors) {
  for (const other of seeded) {
    const score = similarity(a.title, other.title);
    if (score >= DEDUPE_THRESHOLD) collisions.push({ score, wave: a.title, existing: other.title });
  }
}
collisions.sort((x, y) => y.score - x.score);

// ---------------------------------------------------------------------------
// TEMPLATE FAMILIES — the anti-clone rule, counted rather than asserted
// ---------------------------------------------------------------------------
const FAMILY = [
  [/^(restore|restoring)\b/i, "restore X"],
  [/^(learn|study)\b/i, "learn/study X"],
  [/^(build|assemble)\b/i, "build X"],
  [/^(practi[cs]e)\b/i, "practise X"],
  [/^(memori[sz]e)\b/i, "memorise X"],
  [/^(organi[sz]e|sort|declutter)\b/i, "organise X"],
  [/^(identify)\b/i, "identify X"],
  [/^(map|draft|plan|design|curate)\b/i, "plan/design X"],
  [/^(bake|make|brew|cook)\b/i, "make X"],
];
const families = new Map();
for (const a of survivors) {
  const hit = FAMILY.find(([re]) => re.test(a.title));
  if (hit) families.set(hit[1], [...(families.get(hit[1]) ?? []), a.title]);
}

// ---------------------------------------------------------------------------
// SQL — two statements, because idempotent needs both
// ---------------------------------------------------------------------------
const sqlLiteral = (s) => `'${s.replace(/'/g, "''")}'`;
const sqlRow = (a) =>
  `  (${sqlLiteral(a.title)},\n   ${sqlLiteral(a.description)},\n` +
  `   array[${a.tags.map((t) => `'${t}'`).join(",")}],\n   array[${a.vector.join(",")}])`;

function buildSql() {
  const lines = [];
  lines.push(`-- Wave ${waveNumber} — ${survivors.length} new activities` +
    (audit.length ? ` and ${audit.length} vector correction(s)` : ""));
  lines.push("-- Idempotent: re-running inserts nothing twice and re-applies the same values.");
  lines.push("-- Generated by scripts/build-wave.mjs; do not hand-edit.");
  lines.push("");
  lines.push("begin;");
  lines.push("");
  lines.push(`-- 1. New activities. Matches on title, so a re-run is a no-op.`);
  lines.push("with wave (title, description, tags, vector) as (");
  lines.push("  values");
  lines.push(survivors.map(sqlRow).join(",\n"));
  lines.push(")");
  lines.push("insert into public.activities (title, description, tags, vector)");
  lines.push("select w.title, w.description, w.tags::text[], w.vector::integer[]");
  lines.push("from wave w");
  lines.push("where not exists (");
  lines.push("  select 1 from public.activities a where a.title = w.title");
  lines.push(");");
  lines.push("");

  if (audit.length) {
    lines.push("-- 2. Vector corrections to existing rows, audited against The 7-axis rubric.");
    lines.push("--    The insert above only ever inserts, so corrections need their own");
    lines.push("--    statement. Assigning the same values again is harmless.");
    lines.push("update public.activities a");
    lines.push("set vector = c.vector::integer[]");
    lines.push("from (values");
    lines.push(
      audit.map((c) => `  (${sqlLiteral(c.title)}, array[${c.proposed.join(",")}])`).join(",\n")
    );
    lines.push(") as c(title, vector)");
    lines.push("where a.title = c.title;");
    lines.push("");
  }

  lines.push("commit;");
  lines.push("");
  lines.push("-- Check: expected counts after running.");
  lines.push(`select count(*) as total_activities from public.activities;`);
  lines.push("");
  return lines.join("\n");
}

if (wantSql) {
  process.stdout.write(buildSql());
  process.exit(0);
}

// ---------------------------------------------------------------------------
// REVIEW FILE
// ---------------------------------------------------------------------------
const out = [];
const costOf = (a) => a.tags.find((t) => COST_TAGS.includes(t));
const pathwayOf = (a) => PATHWAY_TAGS.filter((p) => a.tags.includes(p)).join("+");

out.push(`# Wave ${waveNumber} — review`);
out.push("");
out.push(wave.note ?? "");
out.push("");
out.push(`**${survivors.length} activities for your veto pass**` +
  (vetoed.size ? `, ${vetoed.size} already vetoed` : "") +
  (audit.length ? `, plus **${audit.length} proposed vector corrections** to existing rows` : "") + ".");
out.push("");
out.push("Nothing here has been written to the seed SQL or the database. Strike anything by adding its");
out.push("exact title to the `vetoed` array in the wave JSON, or just tell me and I will.");
out.push("");
out.push("Axis order everywhere: `[Social, Energy, Creative, Analytical, Outdoors, Novelty, Stimulation]`.");
out.push("");

if (wave.findings?.length) {
  out.push("## Read this first");
  out.push("");
  for (const f of wave.findings) {
    out.push(`### ${f.title}`);
    out.push("");
    out.push(f.body);
    out.push("");
  }
}

// --- the activities, grouped by pathway
for (const [pathway, heading] of [
  ["quick-fix", "Quick-fix"],
  ["long-term", "Long-term"],
]) {
  const group = survivors.filter((a) => a.tags.includes(pathway));
  out.push(`## ${heading} — ${group.length}`);
  out.push("");
  out.push("| # | Title | Pathway | Cost | Vector | Leans |");
  out.push("|---|---|---|---|---|---|");
  group.forEach((a, i) => {
    out.push(
      `| ${i + 1} | ${a.title} | ${pathwayOf(a)} | ${costOf(a)} | \`${a.vector.join(",")}\` | ` +
        `${AXES[dominantAxis(a.vector)]} |`
    );
  });
  out.push("");
}

out.push("## Descriptions and tags");
out.push("");
for (const a of survivors) {
  out.push(`**${a.title}**  `);
  out.push(`${a.description}  `);
  out.push(`\`${a.tags.join(" · ")}\`  `);
  out.push(`\`[${a.vector.join(", ")}]\` leans **${AXES[dominantAxis(a.vector)]}**` +
    (a.note ? ` — ${a.note}` : ""));
  out.push("");
}

// --- the audit
if (audit.length) {
  out.push("## Proposed vector corrections to existing rows");
  out.push("");
  out.push("⚠️ **Proposals only. Nothing is edited until you approve.** These are the existing seed rows");
  out.push("re-read against The 7-axis rubric. Rows not listed were read and left alone.");
  out.push("");
  out.push("| Title | Current | Proposed | Leans (was → now) | Why |");
  out.push("|---|---|---|---|---|");
  for (const c of audit) {
    const cur = seededByTitle.get(c.title).vector;
    const wasLean = AXES[dominantAxis(cur)];
    const nowLean = AXES[dominantAxis(c.proposed)];
    out.push(
      `| ${c.title} | \`${cur.join(",")}\` | \`${c.proposed.join(",")}\` | ` +
        `${wasLean === nowLean ? wasLean : `${wasLean} → **${nowLean}**`} | ${c.reason} |`
    );
  }
  out.push("");
}

// --- dedupe
out.push("## Fuzzy dedupe against the existing catalogue");
out.push("");
if (!collisions.length) {
  out.push(`No title scored at or above ${DEDUPE_THRESHOLD} against any of the ${seeded.length} seeded rows.`);
} else {
  out.push(`${collisions.length} candidate(s) at or above ${DEDUPE_THRESHOLD}. **Reported, not dropped** —`);
  out.push("a high score can mean a genuine duplicate or just a shared word.");
  out.push("");
  out.push("| Score | Wave title | Existing seeded title |");
  out.push("|---|---|---|");
  for (const c of collisions) {
    out.push(`| ${c.score.toFixed(2)} | ${c.wave} | ${c.existing} |`);
  }
}
out.push("");

// --- template families
out.push("## Template families");
out.push("");
out.push("The anti-clone rule caps a wave at 2 entries per template family. Counted, not asserted:");
out.push("");
const overFamilies = [...families.entries()].filter(([, list]) => list.length > 2);
for (const [name, list] of [...families.entries()].sort((a, b) => b[1].length - a[1].length)) {
  out.push(`- \`${name}\` — ${list.length}${list.length > 2 ? " ⚠️ over the cap" : ""}: ${list.join("; ")}`);
}
if (!overFamilies.length) {
  out.push("");
  out.push("No family is over the cap.");
}
out.push("");

// --- axis balance, wave alone and combined
out.push("## Axis balance");
out.push("");
out.push("### The existing catalogue, before this wave");
out.push("");
out.push("```");
out.push(...formatCatalogueStats(seeded));
out.push("```");
out.push("");
out.push("### This wave alone");
out.push("");
out.push("```");
out.push(...formatCatalogueStats(survivors));
out.push("```");
out.push("");
out.push("### Combined, if every survivor lands" + (audit.length ? " (audit corrections applied)" : ""));
out.push("");
const corrected = new Map(audit.map((c) => [c.title, c.proposed]));
const combined = [
  ...seeded.map((r) => (corrected.has(r.title) ? { ...r, vector: corrected.get(r.title) } : r)),
  ...survivors,
];
out.push("```");
out.push(...formatCatalogueStats(combined));
out.push("```");
out.push("");

writeFileSync(reviewPath, out.join("\n").replace(/\n{3,}/g, "\n\n") + "\n", "utf8");
console.log(`Wrote ${reviewPath}`);
console.log(`  ${survivors.length} activities, ${audit.length} audit proposals, ${collisions.length} dedupe candidate(s)`);
if (overFamilies.length) {
  console.log(`  ⚠️  ${overFamilies.length} template family(ies) over the cap of 2`);
}
