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
 *
 * THE `audit` ARRAY carries corrections to rows that are ALREADY SEEDED, and it
 * takes two kinds. `proposed` is a replacement vector, which changes how a row
 * RANKS. `proposedTags` is a replacement tag set, which changes WHICH USERS CAN
 * SEE THE ROW AT ALL — a much larger change, given its own reviewed table and
 * its own before/after starvation figures. A proposed tag set clears exactly the
 * structural bar a new row does.
 *
 * FOUR REPORTS were added with the campaign to ~500, all rendered from the same
 * wave JSON and all computed against the real modules rather than restated here:
 *   - starvation before/after, through scripts/lib/starvation.mjs;
 *   - the D-aware authoring report, through euclideanDistance and
 *     DIVERSITY_MIN_DISTANCE — a row inside D of an existing one is a row
 *     diverseSelect will never show, so authoring it is wasted work;
 *   - the same-cell distance report, for new rows filling one hole twice;
 *   - the bank-consumption cross-check, because five waves across five fresh
 *     sessions all re-read the same 395-row CSV and nothing else would notice a
 *     second draw.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
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
import { euclideanDistance } from "../lib/matchActivities.ts";
import { DIVERSITY_MIN_DISTANCE } from "../lib/resultsSelection.ts";
import { parseSeedActivities, repoRoot, AXES, dominantAxis } from "./lib/parse-seed.mjs";
import { formatCatalogueStats } from "./lib/catalogue-stats.mjs";
import {
  PATHWAY_SPECS,
  starvationOf,
  survivorsOf,
  classifyCell,
  MIN_RESULTS,
} from "./lib/starvation.mjs";

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

/**
 * Every structural rule a tag set must satisfy, as a list of complaints.
 *
 * Pulled out of the per-activity loop because the audit can now propose a
 * REPLACEMENT tag set for an existing row, and a corrected row has to clear
 * exactly the same bar as a new one. Two copies of these rules is how one of
 * them quietly gets a fix the other does not.
 */
function tagFailures(where, tags) {
  const out = [];
  const has = (t) => tags.includes(t);

  const unknown = tags.filter((t) => !isActivityTag(t));
  if (unknown.length) out.push(`${where}: tag(s) outside the vocabulary — ${unknown.join(", ")}`);
  if (new Set(tags).size !== tags.length) out.push(`${where}: duplicate tag`);

  const costs = tags.filter((t) => COST_TAGS.includes(t));
  if (costs.length !== 1) {
    out.push(`${where}: ${costs.length} cost tiers (${costs.join(", ") || "none"}), needs exactly 1`);
  }

  if (!COMPANY_TAGS.some(has)) out.push(`${where}: no company tag`);
  if (!PLACE_TAGS.some(has)) out.push(`${where}: no place tag`);

  const pathways = PATHWAY_TAGS.filter(has);
  if (!pathways.length) out.push(`${where}: no pathway tag`);
  for (const pathway of pathways) {
    if (!TIME_LADDER[pathway].some(has)) {
      out.push(`${where}: carries ${pathway} but no ${pathway} time tag`);
    }
  }
  // Not enforced by the seed validator, but a long-term row with no setting is
  // invisible to three of the four answers to "where would it happen?".
  if (has("long-term") && !SETTING_TAGS.some(has)) {
    out.push(`${where}: long-term with no setting tag — only reachable via "Anywhere"`);
  }
  return out;
}

for (const a of survivors) {
  const where = `"${a.title}"`;
  const tags = a.tags ?? [];

  failures.push(...tagFailures(where, tags));

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

// ---------------------------------------------------------------------------
// THE AUDIT — corrections to rows that are already seeded.
//
// It carries TWO kinds of correction now, and they are not the same kind of
// change. A vector correction alters how well a row RANKS for a given user; a
// tag correction alters WHICH USERS CAN SEE IT AT ALL. The second is the more
// consequential of the two and gets its own reviewed table, its own starvation
// delta, and the same structural bar a new row has to clear.
// ---------------------------------------------------------------------------
for (const c of audit) {
  if (!seededByTitle.has(c.title)) failures.push(`audit target not in the seed: "${c.title}"`);

  const hasVector = c.proposed !== undefined;
  const hasTags = c.proposedTags !== undefined;
  if (!hasVector && !hasTags) {
    failures.push(`audit "${c.title}": neither a proposed vector nor proposedTags — nothing to apply`);
  }

  if (hasVector) {
    const v = c.proposed;
    if (!Array.isArray(v) || v.length !== 7 || v.some((n) => !Number.isInteger(n) || n < 1 || n > 10)) {
      failures.push(`audit "${c.title}": proposed vector must be 7 integers in 1-10`);
    }
  }
  if (hasTags) {
    if (!Array.isArray(c.proposedTags) || !c.proposedTags.length) {
      failures.push(`audit "${c.title}": proposedTags must be a non-empty array`);
    } else {
      failures.push(...tagFailures(`audit "${c.title}"`, c.proposedTags));
    }
  }
  if (!c.reason) failures.push(`audit "${c.title}": no reason given`);
}

// ---------------------------------------------------------------------------
// BANK CONSUMPTION — the campaign runs five waves across five fresh sessions,
// each re-reading the same 395-row CSV. Nothing but this stops the same idea
// being drawn twice, and a duplicate would not fail any other check: it would
// arrive with a different title and a different vector and read as a new row.
// ---------------------------------------------------------------------------
const bankPath = join(repoRoot, "data", "activity-idea-bank.csv");

/** Minimal CSV field split — the bank quotes any field containing a comma. */
function csvFields(line) {
  const out = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(field); field = ""; }
    else field += ch;
  }
  out.push(field);
  return out;
}

const bankTitles = new Set(
  readFileSync(bankPath, "utf8")
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((line) => csvFields(line)[0])
);

// What every EARLIER wave already consumed. Wave 1 predates the `bank` field —
// it was produced from data/curated-activities.csv, not the bank — so its rows
// contribute nothing here and their absence is not a fault.
const claimedEarlier = new Map();
for (const file of readdirSync(join(repoRoot, "data", "waves"))) {
  const match = /^wave-(\d+)\.json$/.exec(file);
  if (!match || Number(match[1]) >= Number(waveNumber)) continue;
  const prior = JSON.parse(readFileSync(join(repoRoot, "data", "waves", file), "utf8"));
  const priorVetoed = new Set(prior.vetoed ?? []);
  for (const a of prior.activities ?? []) {
    if (a.bank && a.bank !== "generated" && !priorVetoed.has(a.title)) {
      claimedEarlier.set(a.bank, `wave ${match[1]}`);
    }
  }
}

// Wave 1 was produced from the curated list, before the bank was the source.
const bankRequired = Number(waveNumber) >= 2;
const claimedHere = new Map();
for (const a of survivors) {
  const where = `"${a.title}"`;
  if (!a.bank) {
    if (bankRequired) failures.push(`${where}: no \`bank\` field — name the idea-bank title, or "generated"`);
    continue;
  }
  if (a.bank === "generated") continue;
  if (!bankTitles.has(a.bank)) {
    failures.push(`${where}: bank title not found in the idea bank — "${a.bank}"`);
  }
  if (claimedEarlier.has(a.bank)) {
    failures.push(`${where}: bank title already drawn by ${claimedEarlier.get(a.bank)} — "${a.bank}"`);
  }
  if (claimedHere.has(a.bank)) {
    failures.push(`${where}: bank title drawn twice in this wave — "${a.bank}"`);
  }
  claimedHere.set(a.bank, a.title);
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
    const vectorCount = audit.filter((c) => c.proposed).length;
    const tagCount = audit.filter((c) => c.proposedTags).length;
    lines.push(`-- 2. Corrections to existing rows — ${vectorCount} vector, ${tagCount} tag.`);
    lines.push("--    The insert above only ever inserts, so corrections need their own");
    lines.push("--    statement. Assigning the same values again is harmless.");
    lines.push("--");
    lines.push("--    NULL means 'leave this column alone', which is what coalesce is doing.");
    lines.push("--    Every value is cast explicitly because a values list with a NULL in the");
    lines.push("--    first row has no type for Postgres to infer.");
    lines.push("update public.activities a");
    lines.push("set vector = coalesce(c.vector, a.vector),");
    lines.push("    tags   = coalesce(c.tags, a.tags)");
    lines.push("from (values");
    lines.push(
      audit
        .map((c) => {
          const vector = c.proposed ? `array[${c.proposed.join(",")}]::integer[]` : "null::integer[]";
          const tags = c.proposedTags
            ? `array[${c.proposedTags.map((t) => `'${t}'`).join(",")}]::text[]`
            : "null::text[]";
          return `  (${sqlLiteral(c.title)}::text, ${vector}, ${tags})`;
        })
        .join(",\n")
    );
    lines.push(") as c(title, vector, tags)");
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
// ANALYSIS — starvation, distance, and what the wave actually reaches
//
// All of it is computed against the REAL modules: the questions and filter
// semantics through scripts/lib/starvation.mjs, the metric through
// lib/matchActivities.ts, and D through lib/resultsSelection.ts. Nothing here
// restates a rule the app owns.
// ---------------------------------------------------------------------------
const retagged = new Map(audit.filter((c) => c.proposedTags).map((c) => [c.title, c.proposedTags]));
const seedAfterTags = seeded.map((r) =>
  retagged.has(r.title) ? { ...r, tags: retagged.get(r.title) } : r
);
const projected = [...seedAfterTags, ...survivors];

/** Starved cells split by band, so "plausible cells below 3" is a real figure. */
function bandCounts(map) {
  const starved = { plausible: 0, "low-frequency": 0, degenerate: 0 };
  const zero = { plausible: 0, "low-frequency": 0, degenerate: 0 };
  for (const cell of map.starved) {
    const band = classifyCell(cell).band;
    starved[band]++;
    if (cell.count === 0) zero[band]++;
  }
  return { total: map.total, starved, zero, all: map.starvedCount, allZero: map.zeroCount };
}

const starvation = PATHWAY_SPECS.map((spec) => ({
  spec,
  before: bandCounts(starvationOf(seeded, spec)),
  afterTagsOnly: bandCounts(starvationOf(seedAfterTags, spec)),
  after: bandCounts(starvationOf(projected, spec)),
  // The pre-wave starved cells are the target list, so they are what "fills a
  // starved cell" is measured against — not the post-wave ones, which the wave
  // has already changed.
  targets: starvationOf(seeded, spec).starved,
}));

/** Which pre-wave starved cells one activity can answer, on one pathway. */
function cellsFilledBy(activity, targets) {
  return targets.filter((cell) => survivorsOf([activity], cell).length === 1);
}

const pathwaysOf = (a) => PATHWAY_TAGS.filter((p) => a.tags.includes(p));

// --- D-aware authoring: nearest neighbour, per pathway the row carries -------
const dReports = [];
for (const a of survivors) {
  for (const pathway of pathwaysOf(a)) {
    const spec = PATHWAY_SPECS.find((s) => s.pathwayTag === pathway);
    const targets = starvation.find((s) => s.spec === spec).targets;
    const neighbours = [
      ...seedAfterTags.filter((r) => r.tags.includes(pathway)).map((r) => ({ ...r, side: "seed" })),
      ...survivors
        .filter((r) => r !== a && r.tags.includes(pathway))
        .map((r) => ({ ...r, side: "wave" })),
    ];
    if (!neighbours.length) continue;

    let nearest = null;
    for (const n of neighbours) {
      const distance = euclideanDistance(a.vector, n.vector);
      if (!nearest || distance < nearest.distance) nearest = { ...n, distance };
    }

    const mine = cellsFilledBy(a, targets);
    const theirs = new Set(cellsFilledBy(nearest, targets).map((c) => c.index));
    const unique = mine.filter((c) => !theirs.has(c.index));

    dReports.push({
      title: a.title,
      pathway,
      neighbour: nearest.title,
      side: nearest.side,
      distance: nearest.distance,
      under: nearest.distance < DIVERSITY_MIN_DISTANCE,
      fills: mine.length,
      unique: unique.length,
      sample: unique[0] ? unique[0].answers.join(" / ") : null,
    });
  }
}
const dFlagged = dReports.filter((r) => r.under).sort((a, b) => a.distance - b.distance);

// --- Same-cell distances: wave rows that land in the same starved cell -------
const sameCellPairs = [];
for (const spec of PATHWAY_SPECS) {
  const targets = starvation.find((s) => s.spec === spec).targets;
  const pool = survivors.filter((a) => a.tags.includes(spec.pathwayTag));
  const filled = new Map(pool.map((a) => [a, new Set(cellsFilledBy(a, targets).map((c) => c.index))]));

  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const distance = euclideanDistance(pool[i].vector, pool[j].vector);
      if (distance >= DIVERSITY_MIN_DISTANCE) continue;
      const shared = [...filled.get(pool[i])].filter((n) => filled.get(pool[j]).has(n)).length;
      sameCellPairs.push({
        pathway: spec.pathwayTag,
        a: pool[i].title,
        b: pool[j].title,
        distance,
        shared,
      });
    }
  }
}
sameCellPairs.sort((x, y) => y.shared - x.shared || x.distance - y.distance);

// --- Reach: which starved cells the wave actually clears ---------------------
const reach = starvation.map(({ spec, targets }) => {
  const after = starvationOf(projected, spec);
  const stillStarved = new Set(after.starved.map((c) => c.index));
  const cleared = targets.filter((c) => !stillStarved.has(c.index));
  const untouched = targets.filter(
    (c) => stillStarved.has(c.index) && after.cells[c.index].count === c.count
  );
  return { spec, targets, cleared, untouched };
});

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
const vectorAudit = audit.filter((c) => c.proposed);
const tagAudit = audit.filter((c) => c.proposedTags);

if (vectorAudit.length) {
  out.push("## Proposed vector corrections to existing rows");
  out.push("");
  out.push("⚠️ **Proposals only. Nothing is edited until you approve.** These are the existing seed rows");
  out.push("re-read against The 7-axis rubric. Rows not listed were read and left alone.");
  out.push("");
  out.push("A vector correction changes how well a row RANKS for a given user. It cannot change who");
  out.push("is allowed to see it — that is what the tag corrections below do.");
  out.push("");
  out.push("| Title | Current | Proposed | Leans (was → now) | Why |");
  out.push("|---|---|---|---|---|");
  for (const c of vectorAudit) {
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

if (tagAudit.length) {
  out.push("## Proposed TAG corrections to existing rows");
  out.push("");
  out.push("⚠️ **This is the more consequential kind of correction, and it is the one to read");
  out.push("hardest.** A tag correction changes **which users can see a row at all** — not how it");
  out.push("ranks. Approving one hides an activity from people who see it today, or reveals it to");
  out.push("people who cannot. Every proposed tag set has been through exactly the same structural");
  out.push("checks a new row gets.");
  out.push("");
  out.push("| Title | Removed | Added | Why |");
  out.push("|---|---|---|---|");
  for (const c of tagAudit) {
    const cur = seededByTitle.get(c.title).tags;
    const removed = cur.filter((t) => !c.proposedTags.includes(t));
    const added = c.proposedTags.filter((t) => !cur.includes(t));
    out.push(
      `| ${c.title} | ${removed.map((t) => `\`${t}\``).join(" ") || "—"} | ` +
        `${added.map((t) => `\`${t}\``).join(" ") || "—"} | ${c.reason} |`
    );
  }
  out.push("");
  out.push("**What the tag corrections do on their own**, with no new activities added at all:");
  out.push("");
  out.push("| Path | Starved cells before | after re-tagging | Zero-cells before | after |");
  out.push("|---|---|---|---|---|");
  for (const s of starvation) {
    out.push(
      `| ${s.spec.label} | ${s.before.all} of ${s.before.total} | ${s.afterTagsOnly.all} | ` +
        `${s.before.allZero} | ${s.afterTagsOnly.allZero} |`
    );
  }
  out.push("");
}

// --- starvation, before and after
out.push("## Starvation — before and after this wave");
out.push("");
out.push("Counts are **pre-relaxation**: how many activities survive an answer combination before");
out.push("`lib/selectionPipeline.ts` bends anything. A cell at zero is never empty on screen — it is a");
out.push("cell where something is ALWAYS bent. ⚠️ Cost and company never bend, so a cell starved on");
out.push("either of those is starved permanently and only content can fix it.");
out.push("");
out.push(`"Plausible" excludes the low-frequency band — see \`CELL_RULES\` in`);
out.push("`scripts/lib/starvation.mjs` for the named rules and why the degenerate band is empty.");
out.push("");
out.push("⚠️ **READ THE ZERO-CELL COLUMN FIRST, NOT THE STARVED COLUMN.** The two can move in");
out.push("opposite directions and regularly do — a tag correction that takes a row out of one");
out.push("intersection and puts it into another can tip several 3s down to 2s while emptying");
out.push("far more cells of nothing at all. A cell at 1 or 2 gets a relaxed, honest answer; a cell");
out.push("at 0 has nothing to relax from and always bends. **Zero-cells falling is the win.**");
out.push("");
out.push("| Path | Plausible cells < 3 | Zero-cells | All starved | Pool |");
out.push("|---|---|---|---|---|");
for (const s of starvation) {
  const poolBefore = seeded.filter((r) => r.tags.includes(s.spec.pathwayTag)).length;
  const poolAfter = projected.filter((r) => r.tags.includes(s.spec.pathwayTag)).length;
  out.push(
    `| ${s.spec.label} | ${s.before.starved.plausible} → **${s.after.starved.plausible}** | ` +
      `${s.before.allZero} → **${s.after.allZero}** | ` +
      `${s.before.all} of ${s.before.total} → **${s.after.all}** | ${poolBefore} → ${poolAfter} |`
  );
}
out.push("");
for (const r of reach) {
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  out.push(
    `**${r.spec.label}** — of ${r.targets.length} cells starved before this wave, ` +
      `**${plural(r.cleared.length, "is", "are")} cleared** (now at ${MIN_RESULTS} or more) and ` +
      `**${plural(r.untouched.length, "gained", "gained")} nothing at all**.`
  );
  if (r.untouched.length) {
    out.push("");
    out.push("<details><summary>Cells this wave does not touch</summary>");
    out.push("");
    out.push("| n | " + r.spec.questions.map((q) => q.constraint).join(" | ") + " |");
    out.push("|---|" + r.spec.questions.map(() => "---").join("|") + "|");
    for (const c of r.untouched.slice(0, 40)) {
      out.push(`| ${c.count} | ${c.answers.join(" | ")} |`);
    }
    if (r.untouched.length > 40) out.push(`| … | ${r.untouched.length - 40} more not listed |`);
    out.push("");
    out.push("</details>");
  }
  out.push("");
}

// --- D-aware authoring
out.push("## D-aware authoring report");
out.push("");
out.push(
  `Every new row's nearest neighbour **within each pathway it carries**, by the real ` +
    `\`euclideanDistance\`. D is \`DIVERSITY_MIN_DISTANCE\` = **${DIVERSITY_MIN_DISTANCE}**, imported ` +
    `from \`lib/resultsSelection.ts\`.`
);
out.push("");
out.push("⚠️ **Why this gate exists.** `diverseSelect` skips a candidate that only restates one");
out.push("already picked, so a row inside D of an existing one is a row **the results page will");
out.push("never show anybody**. The rule: a flagged row stays only if it fills a starved cell its");
out.push("neighbour does not. **Reported, never auto-dropped** — the same treatment the fuzzy");
out.push("dedupe gets, for the same reason.");
out.push("");
out.push("A pair of NEW rows appears **twice, once from each side**. That is the useful form: the");
out.push("side showing 0 unique cells is the one to cut, and its partner keeps everything the pair");
out.push("was reaching between them.");
out.push("");
if (!dFlagged.length) {
  out.push(`No new row sits within ${DIVERSITY_MIN_DISTANCE} of any catalogue or wave row on a shared pathway.`);
  const closest = [...dReports].sort((a, b) => a.distance - b.distance)[0];
  if (closest) {
    out.push("");
    out.push(
      `Closest approach: **${closest.title}** ↔ ${closest.neighbour} (${closest.side}) at ` +
        `${closest.distance.toFixed(2)} on the ${closest.pathway} path.`
    );
  }
} else {
  out.push(`${dFlagged.length} row/pathway pairing(s) under D.`);
  out.push("");
  out.push("| d | New row | Pathway | Nearest | Side | Starved cells it fills | …that the neighbour cannot | Verdict |");
  out.push("|---|---|---|---|---|---|---|---|");
  for (const r of dFlagged) {
    const verdict = r.unique > 0 ? "**KEEP**" : "⚠️ **VETO CANDIDATE**";
    out.push(
      `| ${r.distance.toFixed(2)} | ${r.title} | ${r.pathway} | ${r.neighbour} | ${r.side} | ` +
        `${r.fills} | ${r.unique} | ${verdict} |`
    );
  }
  const vetoes = dFlagged.filter((r) => r.unique === 0);
  if (vetoes.length) {
    out.push("");
    out.push(
      `⚠️ **${vetoes.length} row(s) add no starved cell their neighbour does not already serve.** ` +
        "Under the campaign's D-aware rule those should come out of the wave."
    );
  }
  const kept = dFlagged.filter((r) => r.unique > 0);
  if (kept.length) {
    out.push("");
    out.push("Kept rows, and the cell each one reaches that its neighbour cannot:");
    out.push("");
    for (const r of kept) out.push(`- **${r.title}** — ${r.sample}`);
  }
}
out.push("");

// --- same-cell distances
out.push("## Same-cell distance report");
out.push("");
out.push("Pairs of NEW rows closer than D to each other. The `shared` column counts how many of the");
out.push("pre-wave starved cells **both** rows answer — that is what makes a pair a same-cell pair.");
out.push("");
out.push("A close pair sharing no cell is two ideas that happen to score alike and land in different");
out.push("parts of the funnel; a close pair sharing cells is the wave filling one hole twice with");
out.push("the same idea, and `diverseSelect` will only ever show one of them.");
out.push("");
if (!sameCellPairs.length) {
  out.push(`No two new rows on a shared pathway sit within ${DIVERSITY_MIN_DISTANCE} of each other.`);
} else {
  out.push("| d | shared cells | Pathway | A | B |");
  out.push("|---|---|---|---|---|");
  for (const p of sameCellPairs) {
    out.push(
      `| ${p.distance.toFixed(2)} | ${p.shared > 0 ? `⚠️ **${p.shared}**` : "0"} | ${p.pathway} | ${p.a} | ${p.b} |`
    );
  }
}
out.push("");

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
console.log(
  `  ${survivors.length} activities, ${audit.length} audit proposal(s) ` +
    `(${vectorAudit.length} vector, ${tagAudit.length} tag), ${collisions.length} dedupe candidate(s)`
);
for (const s of starvation) {
  console.log(
    `  ${s.spec.label.padEnd(6)} zero-cells ${s.before.allZero} -> ${s.after.allZero}, ` +
      `starved ${s.before.all} -> ${s.after.all} of ${s.before.total}`
  );
}
if (overFamilies.length) {
  console.log(`  ⚠️  ${overFamilies.length} template family(ies) over the cap of 2`);
}
const dVetoes = dFlagged.filter((r) => r.unique === 0);
if (dVetoes.length) {
  console.log(`  ⚠️  ${dVetoes.length} row(s) under D=${DIVERSITY_MIN_DISTANCE} adding no starved cell their neighbour lacks`);
}
