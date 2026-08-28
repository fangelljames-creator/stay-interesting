/**
 * The starvation map: how many activities survive EACH answer combination the
 * funnel can produce, before any relaxation.
 *
 * A SHARED MODULE, for the same reason scripts/lib/catalogue-stats.mjs is one.
 * Three callers need identical numbers over DIFFERENT activity sets:
 *   - validate-activity-seed.mjs, over whatever is in the seed SQL now;
 *   - report-starvation.mjs, over the seed and optionally seed + a pending wave;
 *   - build-wave.mjs, over both at once, to render a before/after table.
 * Computing the same statistic three times is exactly the drift this repo keeps
 * legislating against.
 *
 * ⚠️ WHAT THIS MEASURES AND WHAT IT DOES NOT. These counts are PRE-RELAXATION.
 * At runtime lib/selectionPipeline.ts bends place/setting, then energy, then
 * time, until MIN_RESULTS survive, so a cell at 0 here is never empty on
 * screen. That is the point: a cell at 0 is one where the user's answers can
 * never be honoured honestly and something is ALWAYS bent. Relaxation absorbing
 * it is the symptom being measured, not a reason to stop measuring.
 *
 * ⚠️ COST AND COMPANY NEVER BEND (see RELAXATION_STEPS), so a cell starved on
 * either of those is starved for good. Those are the ones content has to fix.
 *
 * The questions and the filter semantics are IMPORTED, never restated —
 * mirroring them by hand is how analyze-quiz-balance.mjs became something that
 * goes stale in lockstep with the code it checks.
 */
import {
  QUICK_QUESTIONS,
  HOBBY_QUESTIONS,
  MIN_RESULTS,
} from "../../lib/feasibilityQuestions.ts";
import { satisfiesFilter, COST_TAGS } from "../../lib/activityTags.ts";

export { MIN_RESULTS };

/** The two funnels, each with the pathway tag that selects its pool. */
export const PATHWAY_SPECS = [
  { label: "quick", pathwayTag: "quick-fix", questions: QUICK_QUESTIONS },
  { label: "hobby", pathwayTag: "long-term", questions: HOBBY_QUESTIONS },
];

export function specFor(label) {
  const spec = PATHWAY_SPECS.find((s) => s.label === label || s.pathwayTag === label);
  if (!spec) throw new Error(`Unknown pathway "${label}"`);
  return spec;
}

/**
 * Every answer combination one funnel can produce, in a fixed order.
 *
 * The digit order — question 0 as the least significant — is the order the
 * validator's coverage loop has always used, and the blame histogram's tie
 * ordering depends on it. Kept identical deliberately.
 */
export function enumerateCells(spec) {
  const { questions } = spec;
  const sizes = questions.map((q) => q.options.length);
  const total = sizes.reduce((a, b) => a * b, 1);
  const cells = [];

  for (let n = 0; n < total; n++) {
    let rem = n;
    const picks = sizes.map((size) => {
      const pick = rem % size;
      rem = Math.floor(rem / size);
      return pick;
    });
    cells.push({ index: n, ...describeCell(spec, picks) });
  }
  return cells;
}

/**
 * One cell, with its filter actions unpacked into something a rule can read.
 *
 * Rules key on the ACTIONS rather than on the option text, so rewording a
 * question does not silently reclassify a cell. `constraint` names which knob a
 * question turns and is already part of the question definition.
 */
function describeCell(spec, picks) {
  const options = spec.questions.map((q, i) => q.options[picks[i]]);
  const actions = options.map((o) => o.action);

  const required = new Set();
  const excluded = new Set();
  const allowed = {};
  spec.questions.forEach((q, i) => {
    const action = actions[i];
    if (action.kind === "require") required.add(action.tag);
    if (action.kind === "exclude") excluded.add(action.tag);
    allowed[q.constraint] = action.kind === "allow" ? [...action.tags] : null;
  });

  // The cost ceiling as a tier name. "any" is the { kind: "none" } answer,
  // which filters nothing rather than requiring the expensive tag.
  const costTags = allowed.cost;
  const costTier = costTags === null ? "any" : costTags.includes("low-budget") ? "low-budget" : "free";

  // The single time tag a cell allows, or null for "no fixed limit".
  const timeTag = allowed.time === null ? null : allowed.time[0];

  return {
    pathway: spec.pathwayTag,
    label: spec.label,
    picks,
    answers: options.map((o) => o.text),
    actions,
    required,
    excluded,
    allowed,
    costTier,
    timeTag,
    requires: (tag) => required.has(tag),
    excludes: (tag) => excluded.has(tag),
  };
}

/** Survivors of one cell out of a pool already filtered to the pathway. */
export function survivorsOf(pool, cell) {
  return pool.filter((a) => cell.actions.every((action) => satisfiesFilter(a.tags, action)));
}

/**
 * The whole map for one funnel: every cell, with its survivor count, plus the
 * starved subset sorted by severity (emptiest first, then in enumeration
 * order so two runs of the same catalogue print identically).
 */
export function starvationOf(activities, spec, { min = MIN_RESULTS } = {}) {
  const pool = activities.filter((a) => a.tags.includes(spec.pathwayTag));
  const cells = enumerateCells(spec).map((cell) => {
    const survivors = survivorsOf(pool, cell);
    return { ...cell, survivors, count: survivors.length };
  });

  const starved = cells.filter((c) => c.count < min);
  return {
    spec,
    poolSize: pool.length,
    total: cells.length,
    cells,
    starved: [...starved].sort((a, b) => a.count - b.count),
    starvedCount: starved.length,
    zeroCount: starved.filter((c) => c.count === 0).length,
  };
}

/**
 * Which single answers appear most often among starved cells.
 *
 * ⚠️ READ THIS WITH CARE — it is a weak signal, and it was the ONLY signal
 * before the per-cell report existed. The cells nest (a cost CEILING makes
 * "not a concern" a superset of "keep it free"; "don't mind" a superset of both
 * place answers), so a common answer can be common merely because it appears in
 * more cells rather than because it is the thing starving them. The
 * intersection grid in report-starvation.mjs is what actually says what to
 * author.
 */
export function blameHistogram(starvedCells, spec) {
  const blame = new Map();
  // Rebuilt in ENUMERATION order, not severity order. Ties in the sort below
  // fall back to insertion order, so feeding severity-sorted cells would quietly
  // reorder equally-blamed answers between runs.
  const inOrder = [...starvedCells].sort((a, b) => a.index - b.index);
  for (const cell of inOrder) {
    cell.picks.forEach((pick, i) => {
      const text = spec.questions[i].options[pick].text;
      blame.set(text, (blame.get(text) ?? 0) + 1);
    });
  }
  return [...blame.entries()].sort((a, b) => b[1] - a[1]);
}

// ---------------------------------------------------------------------------
// CLASSIFICATION
// ---------------------------------------------------------------------------
/**
 * ⚠️ A HAND-WRITTEN ORACLE, NOT A MEASUREMENT — and nothing at runtime reads
 * it. Whether a person would ever really give a set of answers is a judgement,
 * so it is written down, named and reasoned here rather than decided fresh each
 * wave in a chat message that nobody can re-run.
 *
 * ⚠️ THE DEGENERATE LIST IS EMPTY, AND THAT IS THE FINDING. Every one of the
 * five quick questions and four hobby questions asks an INDEPENDENT fact about
 * a person's circumstances — how long they have, who is around, what they will
 * spend. None of them can contradict another, so no combination is
 * self-contradictory and there is nothing a user could not honestly answer.
 * The band exists so a future wave has somewhere to put one, and so "we looked
 * and found none" is recorded rather than merely omitted.
 *
 * LOW-FREQUENCY is the band that actually has members: coherent, answerable,
 * and rare enough to fill last rather than first. It is a priority signal, NOT
 * permission to leave a cell empty.
 */
export const CELL_RULES = [
  {
    band: "low-frequency",
    name: "club-at-home-for-whole-weekends",
    reason:
      "A club or community that meets at your house in weekend blocks. Real — games weekends, " +
      "quilting bees, a home brew day — but it is a small slice of what 'a club or community' means " +
      "to most people, who picture a venue they travel to.",
    test: (c) =>
      c.pathway === "long-term" &&
      c.timeTag === "weekend-blocks" &&
      c.requires("at-home") &&
      c.requires("social"),
  },
  {
    band: "low-frequency",
    name: "free-indoor-half-day-of-exertion",
    reason:
      "Half a day or more, staying in, moving hard, spending nothing. Free indoor venues barely " +
      "exist in the UK and half a day of home workout is not something people plan. Coherent, but " +
      "the thinnest real demand on the quick path.",
    test: (c) =>
      c.pathway === "quick-fix" &&
      c.timeTag === "half-day" &&
      c.requires("inside") &&
      c.requires("exertion") &&
      c.costTier === "free",
  },
];

/** plausible | low-frequency | degenerate, with the rule that decided it. */
export function classifyCell(cell) {
  const hit = CELL_RULES.find((rule) => rule.test(cell));
  return hit
    ? { band: hit.band, rule: hit.name, reason: hit.reason }
    : { band: "plausible", rule: null, reason: null };
}

// ---------------------------------------------------------------------------
// THE INTERSECTION GRID — what actually tells you what to author
// ---------------------------------------------------------------------------
/**
 * Survivor counts over the tag intersections the questions are built from,
 * rather than over the cells themselves.
 *
 * WHY THIS AND NOT THE CELL LIST. 172 starved cells is not 172 problems. They
 * nest and overlap, and the same handful of empty tag intersections generates
 * most of them — `facility` + `free` at zero produces fifteen zero-cells on its
 * own. Filling a cell is not a thing you can do; filling an INTERSECTION is.
 */
export function intersectionGrid(activities, spec) {
  const pool = activities.filter((a) => a.tags.includes(spec.pathwayTag));
  const has = (a, t) => a.tags.includes(t);
  const withinCeiling = (a, tier) =>
    tier === "any" ||
    (tier === "free" ? has(a, "free") : has(a, "free") || has(a, "low-budget"));

  // The dimensions each funnel actually asks about. Kept explicit rather than
  // derived, because the two funnels genuinely differ: the hobby path has no
  // energy question and asks setting where the quick path asks place.
  const dimensions =
    spec.pathwayTag === "quick-fix"
      ? [
          ["time", [["10-mins", "10-mins"], ["1-hour", "1-hour"], ["half-day", "half-day"], ["any", null]]],
          ["energy", [["calm", "-exertion"], ["exert", "exertion"], ["either", null]]],
          ["place", [["inside", "inside"], ["outside", "outside"], ["either", null]]],
        ]
      : [
          [
            "time",
            [
              ["1-2h/wk", "1-2-hours-week"],
              ["5h/wk", "5-hours-week"],
              ["weekend", "weekend-blocks"],
              ["any", null],
            ],
          ],
          [
            "setting",
            [["at-home", "at-home"], ["facility", "facility"], ["in-nature", "in-nature"], ["anywhere", null]],
          ],
        ];

  const company =
    spec.pathwayTag === "quick-fix"
      ? [["solo", "solo"], ["couple", "couple"], ["social", "social"]]
      : [["solo", "solo"], ["couple", "couple"], ["club", "social"], ["any", null]];

  const tiers = ["free", "low-budget", "any"];

  const matches = (a, tag) => {
    if (tag === null) return true;
    if (tag.startsWith("-")) return !has(a, tag.slice(1));
    return has(a, tag);
  };

  const rows = [];
  const walk = (i, chosen) => {
    if (i === dimensions.length) {
      const cells = [];
      for (const [companyLabel, companyTag] of company) {
        for (const tier of tiers) {
          cells.push({
            company: companyLabel,
            tier,
            count: pool.filter(
              (a) =>
                chosen.every(([, tag]) => matches(a, tag)) &&
                matches(a, companyTag) &&
                withinCeiling(a, tier)
            ).length,
          });
        }
      }
      rows.push({ key: chosen.map(([label]) => label), cells });
      return;
    }
    for (const [label, tag] of dimensions[i][1]) walk(i + 1, [...chosen, [label, tag]]);
  };
  walk(0, []);

  return { spec, poolSize: pool.length, dimensionNames: dimensions.map(([n]) => n), company, tiers, rows };
}

/** Cost tiers, re-exported so a caller need not reach past this module. */
export { COST_TAGS };
