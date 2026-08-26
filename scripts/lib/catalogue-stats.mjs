/**
 * Axis statistics over a set of activities: which axis each one leans into, and
 * how much room each axis actually occupies across the catalogue.
 *
 * A SHARED MODULE, not code inside validate-activity-seed.mjs, because two
 * callers need the identical numbers over DIFFERENT sets:
 *   - the validator, over whatever is currently in the seed SQL;
 *   - build-wave.mjs, over rows that are not in the SQL yet and are still
 *     waiting on a veto pass.
 * Computing the same statistic twice is precisely the drift this repo keeps
 * legislating against. AXES and dominantAxis already exist in parse-seed.mjs
 * and are reused here rather than restated.
 *
 * WHAT THE NUMBERS ARE FOR. The catalogue sits on one end of a Euclidean
 * distance whose other end is a quiz vector (see lib/matchActivities.ts). A
 * dominant-axis histogram says which kinds of user the catalogue can actually
 * answer; an axis whose count is 0 is one no purist will ever be matched to,
 * however well the matcher works. The per-axis mean and spread say whether an
 * axis is being used as a real dimension or is stuck near one value for every
 * row, in which case it contributes almost nothing to any ranking.
 */
import { AXES, dominantAxis } from "./parse-seed.mjs";

export { AXES };

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Standard deviation. 0 means every row scores the same on that axis. */
function stdDev(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/**
 * How many activities lean into each axis. Ties go to the earliest axis, the
 * same rule determinePersonalityType uses on the quiz side, so "dominant" means
 * the same thing at both ends of the match.
 */
export function dominantAxisHistogram(activities) {
  const counts = AXES.map(() => 0);
  for (const activity of activities) {
    if (Array.isArray(activity.vector) && activity.vector.length === AXES.length) {
      counts[dominantAxis(activity.vector)]++;
    }
  }
  return AXES.map((axis, i) => ({ axis, count: counts[i] }));
}

/** min / mean / max / spread / stdDev per axis across the whole set. */
export function perAxisStats(activities) {
  const vectors = activities
    .map((a) => a.vector)
    .filter((v) => Array.isArray(v) && v.length === AXES.length);

  return AXES.map((axis, i) => {
    const values = vectors.map((v) => v[i]);
    if (!values.length) {
      return { axis, min: 0, mean: 0, max: 0, spread: 0, stdDev: 0 };
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    return { axis, min, mean: mean(values), max, spread: max - min, stdDev: stdDev(values) };
  });
}

/**
 * Both reports as printable lines. Returned rather than logged so the caller
 * decides where they go — stdout for the validator, a markdown file for the
 * wave review.
 */
export function formatCatalogueStats(activities, { indent = "  " } = {}) {
  const lines = [];
  const histogram = dominantAxisHistogram(activities);
  const total = histogram.reduce((n, h) => n + h.count, 0);
  const widest = Math.max(...histogram.map((h) => h.count), 1);

  lines.push(`${indent}DOMINANT AXIS — which axis each activity leans into (${total} rows)`);
  lines.push("");
  for (const { axis, count } of histogram) {
    const share = total ? (count / total) * 100 : 0;
    const bar = "#".repeat(Math.round((count / widest) * 28));
    lines.push(
      `${indent}  ${axis.padEnd(12)} ${String(count).padStart(4)} ` +
        `${(share.toFixed(1) + "%").padStart(7)}  ${bar}`
    );
  }

  const empty = histogram.filter((h) => h.count === 0).map((h) => h.axis);
  if (empty.length) {
    lines.push("");
    lines.push(
      `${indent}  ⚠️  NOTHING leans ${empty.join(", ")} — a purist on ` +
        `${empty.length === 1 ? "that axis" : "those axes"} can never be shown a match that agrees with their profile.`
    );
  }

  lines.push("");
  lines.push(`${indent}PER-AXIS RANGE — is the axis a real dimension, or stuck near one value?`);
  lines.push("");
  lines.push(
    `${indent}  ${"Axis".padEnd(12)} ${"min".padStart(4)} ${"mean".padStart(6)} ` +
      `${"max".padStart(4)} ${"spread".padStart(7)} ${"stdev".padStart(6)}`
  );
  for (const s of perAxisStats(activities)) {
    lines.push(
      `${indent}  ${s.axis.padEnd(12)} ${String(s.min).padStart(4)} ${s.mean.toFixed(2).padStart(6)} ` +
        `${String(s.max).padStart(4)} ${String(s.spread).padStart(7)} ${s.stdDev.toFixed(2).padStart(6)}`
    );
  }

  return lines;
}
