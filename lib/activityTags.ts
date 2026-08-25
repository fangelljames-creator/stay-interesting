/**
 * The closed tag vocabulary.
 *
 * THE DOCTRINE: tags encode FEASIBILITY only; the 7-axis vector does the
 * ranking. A tag that no hard filter reads has no reason to exist, and must
 * not exist.
 *
 * This is not a style preference. The previous vocabulary grew to 40 tags, most
 * of which fed a scoring pass that the vector ranking later made irrelevant.
 * Four of ten questions ended up fully decorative — the user answered them and
 * nothing whatsoever changed. Tags that describe *taste* ("creative",
 * "analytical", "vintage") duplicate what the vector already measures, and
 * always drift out of agreement with it.
 *
 * So: 20 tags, listed here, and nothing else. Adding one means adding a filter
 * that reads it in the same change. scripts/validate-activity-seed.mjs fails on
 * any tag not in this file.
 */

/** Which funnel an activity belongs to. An activity may honestly carry BOTH. */
export const PATHWAY_TAGS = ["quick-fix", "long-term"] as const;

/** How long one sitting takes, on the quick-fix path. Ordered smallest first. */
export const QUICK_TIME_TAGS = ["10-mins", "1-hour", "half-day"] as const;

/** What an ongoing commitment costs per week, on the long-term path. Ordered. */
export const LONG_TIME_TAGS = ["1-2-hours-week", "5-hours-week", "weekend-blocks"] as const;

/**
 * Physical effort. Deliberately ONE tag rather than a low/high pair: an
 * activity either demands real exertion or it does not, and the absence of the
 * tag carries the "doesn't" case. A pair would let a row claim both or neither.
 */
export const ENERGY_TAGS = ["exertion"] as const;

/** Indoors or out. An activity that genuinely works either way carries both. */
export const PLACE_TAGS = ["inside", "outside"] as const;

/** What kind of space it needs. */
export const SETTING_TAGS = ["at-home", "facility", "in-nature"] as const;

/** Who you need. An activity fine alone or with others carries several. */
export const COMPANY_TAGS = ["solo", "couple", "social"] as const;

/**
 * What it costs. EXACTLY ONE per activity — this is a tier, not a set.
 *
 * The old vocabulary let a row carry `free` AND `low-budget` to stay visible to
 * everyone, which made the tag meaningless. Cost is applied as a CEILING at
 * query time instead (see costCeiling), so a single honest tier is enough:
 * something tagged `free` still shows for a user who said "money's no object".
 */
export const COST_TAGS = ["free", "low-budget", "investment-required"] as const;

/** Every legal tag. Anything outside this list is a validation failure. */
export const ACTIVITY_TAGS = [
  ...PATHWAY_TAGS,
  ...QUICK_TIME_TAGS,
  ...LONG_TIME_TAGS,
  ...ENERGY_TAGS,
  ...PLACE_TAGS,
  ...SETTING_TAGS,
  ...COMPANY_TAGS,
  ...COST_TAGS,
] as const;

export type ActivityTag = (typeof ACTIVITY_TAGS)[number];
export type PathwayTag = (typeof PATHWAY_TAGS)[number];
export type CostTag = (typeof COST_TAGS)[number];

/** Time ladder per pathway, smallest first. Used to widen time when relaxing. */
export const TIME_LADDER: Record<PathwayTag, readonly ActivityTag[]> = {
  "quick-fix": QUICK_TIME_TAGS,
  "long-term": LONG_TIME_TAGS,
};

const ACTIVITY_TAG_SET: ReadonlySet<string> = new Set(ACTIVITY_TAGS);

/** Guard for the validator and anything reading tags off an untyped DB row. */
export function isActivityTag(value: unknown): value is ActivityTag {
  return typeof value === "string" && ACTIVITY_TAG_SET.has(value);
}

/**
 * What one quiz answer does to the candidate pool.
 *
 * Every option maps to exactly one of these, explicitly. The old design had
 * options emit a bag of tags and left the engine to infer meaning from which
 * group each tag fell into, which is how tags ended up doing nothing without
 * anyone noticing. Stating the action makes a no-op visible as a no-op.
 *
 *   require  activity must carry `tag`
 *   exclude  activity must NOT carry `tag`
 *   allow    activity must carry at least one of `tags`
 *   none     no filter at all — the "don't mind" answers
 */
export type FilterAction =
  | { kind: "require"; tag: ActivityTag }
  | { kind: "exclude"; tag: ActivityTag }
  | { kind: "allow"; tags: readonly ActivityTag[] }
  | { kind: "none" };

/**
 * Cost as a ceiling: the tiers a user is willing to see, given the top tier
 * they accept. "Money's no object" filters nothing rather than requiring the
 * expensive tag, so free activities are never hidden from big spenders.
 */
export function costCeiling(topTier: CostTag): FilterAction {
  switch (topTier) {
    case "free":
      return { kind: "allow", tags: ["free"] };
    case "low-budget":
      return { kind: "allow", tags: ["free", "low-budget"] };
    case "investment-required":
      return { kind: "none" };
  }
}

/** Does one activity's tags satisfy a single filter action? */
export function satisfiesFilter(tags: readonly string[], action: FilterAction): boolean {
  switch (action.kind) {
    case "require":
      return tags.includes(action.tag);
    case "exclude":
      return !tags.includes(action.tag);
    case "allow":
      return action.tags.some((tag) => tags.includes(tag));
    case "none":
      return true;
  }
}
