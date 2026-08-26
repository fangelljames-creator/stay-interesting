/**
 * The personality profile: raw per-axis sums in, a title and description out.
 *
 * Moved here verbatim from components/PersonalityQuiz.tsx. It had to become
 * importable because the returning-visitor banner on app/page.tsx needs the
 * profile title from a stored session, and app/page.tsx has no access to the
 * quiz component's internals. Nothing about the judgement changed in the move.
 *
 * ⚠️ JUDGED ON THE RAW SUMS, NEVER ON AVERAGES OR ANYTHING ROUNDED. Rounding
 * upstream of this argmax collapses distinct scores onto the same integer: it
 * previously left ~58% of all answer paths tied at the top, and because ties
 * break with indexOf, every one of those went to whichever axis sat earliest
 * in the list. Judging on raw sums drops the tie rate to 10%. See the scoring
 * section of CLAUDE.md.
 *
 * ⚠️ THE AXIS ORDER IS STILL A REAL TIEBREAKER for the remaining 10%. It comes
 * from AXES in lib/matchActivities.ts rather than a second hand-written copy,
 * so there is one list to reorder rather than two to keep in agreement — but
 * reordering it changes profile results without touching a single vector.
 *
 * NOTE: scripts/analyze-quiz-balance.mjs still mirrors this argmax by hand.
 * That was unavoidable while the function lived inside a "use client"
 * component; now that it does not, the script could import this module
 * instead. Left alone on this branch because the script is out of its scope.
 */
import { AXES } from "./matchActivities.ts";

export interface PersonalityType {
  /** Stable slug — an axis name, two axis names, or ALL_ROUNDER_ID. */
  id: string;
  title: string;
  description: string;
  kind: PersonalityKind;
  /**
   * Contributing axis INDICES: [] for the All-Rounder, [i] pure, [i, j] hybrid.
   * The results radar highlights exactly these.
   */
  axes: number[];
  /**
   * The most type-defining vector the quiz can actually produce for this type,
   * as RAW SUMS — the answer path that wins it by the largest margin. This is
   * what the hero cycles.
   *
   * ⚠️ RAW SUMS, NOT AVERAGES, and that is load-bearing twice over. The radar
   * normalises before drawing, so the scale is irrelevant to the picture; but
   * the balance script feeds these straight back through classifyTotals to
   * check each one still lands on its own type, and H and F live on the raw-sum
   * scale. Averaged, that check would silently compare against the wrong
   * thresholds.
   *
   * ⚠️ MEASURED, NOT DRAWN. Every one of these came out of the exhaustive walk
   * in scripts/analyze-quiz-balance.mjs, section (g4b), restricted to paths the
   * real classifier assigns to that type. Hand-editing one to make the hero
   * look better would put a shape on the landing page that the quiz behind it
   * cannot produce. If a quiz vector changes, re-run the script and paste the
   * new values — it prints them ready to paste.
   */
  archetypeTotals: number[];
}

/**
 * ---------------------------------------------------------------------------
 * THE CLASSIFIER CORE
 * ---------------------------------------------------------------------------
 *
 * The rule that turns raw per-axis sums into a profile identity, PARAMETERISED
 * over its thresholds rather than hard-coding them.
 *
 * WHY PARAMETERISED. Choosing the thresholds is a measurement problem: the only
 * way to know what H and F should be is to run the exhaustive walk and look at
 * what each candidate value does to the share of every type. If the sweep
 * script carried its own copy of this rule, the numbers it reported would be
 * the numbers of a DIFFERENT classifier from the one that ships — which is the
 * hand-mirroring trap that analyze-quiz-balance.mjs was rebuilt to escape (see
 * CLAUDE.md). So the rule lives here once, takes its config as an argument, and
 * both production and the sweep call the same function.
 *
 * ⚠️ JUDGED ON RAW SUMS, and the thresholds are ON THAT SCALE. `totals` is the
 * per-axis sum across the answered questions, never an average and never
 * anything rounded — see the note on determinePersonalityType below. A
 * consequence worth stating out loud: because the sums grow with the number of
 * questions, ADDING A QUESTION SILENTLY CHANGES WHAT H AND F MEAN. Eight
 * questions today. If that changes, both constants have to be re-measured, not
 * carried over.
 */

/** How a profile identity was arrived at. */
export type PersonalityKind = "pure" | "hybrid" | "all-rounder";

/** The stable slug for the All-Rounder, which belongs to no axis. */
export const ALL_ROUNDER_ID = "all-rounder";

/**
 * The stable slug for a single axis: its name, lowercased. Used as the id of
 * the pure types and as half of a hybrid's id.
 */
export function axisId(index: number): string {
  return AXES[index].toLowerCase();
}

/**
 * The stable slug for an UNORDERED pair of axes: both names, lowercased, always
 * in AXES order regardless of which one scored higher. "Analytical + Novelty"
 * and "Novelty + Analytical" are the same type and must produce the same key,
 * or a named hybrid would be found for one ordering and missed for the other.
 */
export function pairId(a: number, b: number): string {
  const [first, second] = a <= b ? [a, b] : [b, a];
  return `${axisId(first)}-${axisId(second)}`;
}

/** The thresholds and the named-hybrid set the classifier runs against. */
export interface ClassificationConfig {
  /** H — the largest top1 - top2 gap that still counts as a close second. */
  hybridMaxGap: number;
  /** F — the largest top1 - min spread that still counts as a flat profile. */
  allRounderMaxSpread: number;
  /** The pair ids (see pairId) that have a named hybrid. Others fall back. */
  namedPairs: ReadonlySet<string>;
}

/** What the classifier decided, before any copy is attached to it. */
export interface Classification {
  id: string;
  kind: PersonalityKind;
  /** Contributing axis INDICES: [] for All-Rounder, [i] pure, [i, j] hybrid. */
  axes: number[];
}

/**
 * The axis indices of `totals`, strongest first.
 *
 * ⚠️ TIES RESOLVE BY AXIS ORDER, exactly as the old indexOf argmax did. That is
 * still a real tiebreaker — reordering AXES changes results without touching a
 * single vector — but it now bites in fewer places: an exact tie between two
 * axes whose pair IS named resolves into that hybrid rather than being handed
 * to whichever axis sits earlier in the list. It still decides among UNNAMED
 * tied pairs, and it still decides which of two equal second-place axes is
 * taken as the partner.
 */
function rankedAxes(totals: number[]): number[] {
  return totals
    .map((_, index) => index)
    .sort((a, b) => totals[b] - totals[a] || a - b);
}

/**
 * The rule itself, in the order the three cases are tested. The order matters:
 * a flat profile is flat whether or not its top two happen to be adjacent, so
 * All-Rounder is decided first and a genuinely even vector never gets sold to
 * the user as a two-axis type it does not really have.
 *
 *   1. top1 - min <= F                       -> All-Rounder
 *   2. top1 - top2 <= H, and the pair named  -> that hybrid
 *   3. otherwise                             -> the pure dominant axis
 *
 * ⚠️ ONLY THE TOP-TWO PAIR IS CONSULTED at step 2. If {top1, top2} has no name
 * but {top1, top3} does and is also within H, the answer is the pure type, not
 * a hybrid. That keeps "your close second" meaning the actual second.
 */
export function classifyTotals(
  totals: number[],
  config: ClassificationConfig
): Classification {
  const order = rankedAxes(totals);
  const top = order[0];
  const second = order[1];
  const spread = totals[top] - totals[order[order.length - 1]];

  if (spread <= config.allRounderMaxSpread) {
    return { id: ALL_ROUNDER_ID, kind: "all-rounder", axes: [] };
  }

  if (totals[top] - totals[second] <= config.hybridMaxGap) {
    const id = pairId(top, second);
    if (config.namedPairs.has(id)) {
      // Reported in AXES order so the two contributing axes read the same way
      // everywhere — in the id, in the copy, and in the radar highlight.
      return { id, kind: "hybrid", axes: top <= second ? [top, second] : [second, top] };
    }
  }

  return { id: axisId(top), kind: "pure", axes: [top] };
}


/**
 * ---------------------------------------------------------------------------
 * THE CHOSEN CONFIGURATION
 * ---------------------------------------------------------------------------
 *
 * H and F were MEASURED, not picked because they felt about right. Section (g)
 * of scripts/analyze-quiz-balance.mjs sweeps every candidate across the full
 * 81,920-path walk and prints what each one does to the share of all 15 types;
 * these two values came off those tables. Re-run that sweep before changing
 * either, and read the note about the raw-sum scale above first.
 */

/**
 * H = 3. A second axis within 3 raw-sum points of the leader counts as a close
 * second. At 8 questions that is under half a point per question — genuinely
 * neck and neck.
 *
 * WHY 3 AND NOT MORE. H is the dial between "mostly pure types" and "mostly
 * hybrids": it runs 23.1% hybrid at H=2 up to 42.6% at H=5. Three keeps every
 * one of the 15 types between 1.4% and 18% of paths, and it is the largest
 * value at which pure Stimulation — already the thinnest axis in the catalogue,
 * at 3 rows of 134 — still holds 3.79% rather than being swallowed by its own
 * hybrids. At H=5 it falls to 2.20%.
 */
export const HYBRID_MAX_GAP = 3;

/**
 * F = 8. A profile whose strongest and weakest axes sit within 8 raw-sum points
 * has no lead worth naming, and is told so rather than being sold a dominant
 * axis it does not really have.
 *
 * F does one thing only: it sets the All-Rounder's share, taking from every
 * other type proportionally. 8 puts it at 1.40% of paths — 1,144 of 81,920.
 * Rare enough to land as a real finding, common enough that the copy is not
 * written for an audience of nobody. The whole curve is in the sweep: F=6 gives
 * 0.32%, F=10 gives 3.77%.
 */
export const ALL_ROUNDER_MAX_SPREAD = 8;

/**
 * The seven hybrid pairs that get a name, in frequency order over the walk.
 *
 * ⚠️ CHOSEN BY FREQUENCY, NOT BY WHICH ONES SOUND GOOD. These are simply the
 * seven most common top-two pairings the quiz actually produces, which is what
 * stops the taxonomy from containing a type nobody can reach. The other 14
 * pairs are real but rarer, and a user who lands on one gets their pure
 * dominant axis instead.
 *
 * The seventh slot was a genuine tie on the numbers — Outdoors + Novelty and
 * Social + Energy sit 27 paths apart out of 81,920 — and was decided on the
 * grounds that Outdoors + Novelty is the only candidate carrying Outdoors, so
 * all seven axes appear somewhere in the hybrid set.
 */
export const NAMED_PAIR_IDS = [
  "social-novelty",
  "analytical-novelty",
  "social-stimulation",
  "novelty-stimulation",
  "social-analytical",
  "energy-stimulation",
  "outdoors-novelty",
] as const;

/** The configuration production classifies against. */
export const DEFAULT_CONFIG: ClassificationConfig = {
  hybridMaxGap: HYBRID_MAX_GAP,
  allRounderMaxSpread: ALL_ROUNDER_MAX_SPREAD,
  namedPairs: new Set<string>(NAMED_PAIR_IDS),
};

/**
 * ---------------------------------------------------------------------------
 * THE 15 TYPES
 * ---------------------------------------------------------------------------
 *
 * Seven pure axes, seven named hybrids, and the All-Rounder. Every one of them
 * is REACHABLE — scripts/analyze-quiz-balance.mjs fails the run if any type has
 * no answer path that produces it, which is the guard against a taxonomy that
 * quietly contains a card nobody can be dealt.
 *
 * ⚠️ THE COPY IS GOVERNED BY THE VOICE STANDARD in CLAUDE.md, and it is a
 * standard rather than a suggestion: 2-3 sentences, exactly one concrete
 * picturable scene, exactly one gentle cost or shadow clause, British-casual,
 * and no claim the type's own axes do not support. The balance script reports
 * the banned words as a non-fatal check. That last clause is the one that
 * actually bites: an Outdoors + Novelty user scores 18 on Energy, so their copy
 * cannot promise anything strenuous, however well it would read.
 */
export const PERSONALITY_TYPES: PersonalityType[] = [
  // --- the seven pure axes -------------------------------------------------
  {
    id: "social",
    title: "The Social Catalyst",
    kind: "pure",
    axes: [0],
    archetypeTotals: [63, 34, 21, 25, 21, 34, 35],
    description:
      "Nothing you do is really finished until someone else is there for it. Give you a spare evening and there are four people in a kitchen within the hour, mostly because you asked. The downside is that a night on your own can feel less like rest and more like something has gone wrong.",
  },
  {
    id: "energy",
    title: "The Can't-Sit-Still",
    kind: "pure",
    axes: [1],
    archetypeTotals: [30, 51, 28, 25, 36, 30, 36],
    description:
      "Sitting still is something that happens to you rather than something you choose. A free hour goes on a run, a swim, or moving the sofa for reasons nobody else can see. It does mean the quiet hobbies keep getting started and not finished.",
  },
  {
    id: "creative",
    title: "The Meticulous Creator",
    kind: "pure",
    axes: [2],
    archetypeTotals: [16, 21, 54, 25, 9, 22, 19],
    description:
      "There is usually something half-made on the table, and getting it right matters more than getting it done. A whole Sunday can go on the last two centimetres of something nobody else will ever notice. The trouble is that finishing feels a bit like losing the thing you were enjoying.",
  },
  {
    id: "analytical",
    title: "The Strategic Architect",
    kind: "pure",
    axes: [3],
    archetypeTotals: [24, 12, 16, 54, 10, 26, 20],
    description:
      "Anything with a right answer at the end will hold you for hours. Give you a spreadsheet, a timetable or a badly organised cupboard and back it comes with a system nobody asked for and everybody ends up using. Not everything wants to be optimised, which is a lesson that keeps arriving.",
  },
  {
    id: "outdoors",
    title: "The Open-Air Explorer",
    kind: "pure",
    axes: [4],
    archetypeTotals: [20, 35, 12, 25, 55, 35, 26],
    description:
      "Four walls start to feel like a countdown. A good weekend involves a bit of weather, a map folded wrong, and getting back later than you said you would. Indoor plans tend to get quietly rescheduled.",
  },
  {
    id: "novelty",
    title: "The Spontaneous Pioneer",
    kind: "pure",
    axes: [5],
    archetypeTotals: [23, 15, 28, 18, 23, 48, 30],
    description:
      "The appeal of a thing is mostly that you have not done it before. The pottery taster, the sea swim, the obscure Tuesday club — all three get booked, and all three are genuinely enjoyed. Whether any of them survives to a fourth week is a separate question.",
  },
  {
    id: "stimulation",
    title: "The Thrill Seeker",
    kind: "pure",
    axes: [6],
    archetypeTotals: [36, 34, 17, 26, 18, 37, 53],
    description:
      "The point of doing something is that it might go wrong. A bit of adrenaline, a scoreline, a drop in your stomach — that is the bit worth turning up for. Gentle afternoons are something you keep meaning to get good at.",
  },

  // --- the seven named hybrids, in frequency order -------------------------
  {
    id: "social-novelty",
    title: "The Group Chat Instigator",
    kind: "hybrid",
    axes: [0, 5],
    archetypeTotals: [48, 15, 23, 29, 23, 49, 31],
    description:
      "The group chat gets the link at half eight on a Tuesday: axe throwing, a supper club, a bat walk along the canal. Half the appeal is that nobody has done it before, and the other half is that everybody is coming. The old favourites get quietly dropped, which the group notices before you do.",
  },
  {
    id: "analytical-novelty",
    title: "The Rabbit-Holer",
    kind: "hybrid",
    axes: [3, 5],
    archetypeTotals: [25, 13, 14, 46, 21, 43, 22],
    description:
      "You don't have hobbies so much as current investigations. One documentary and suddenly it's 1 a.m., you're fourteen tabs deep, and you could give a short talk on Victorian canal law. The catch: last month's obsession is already gathering dust behind you.",
  },
  {
    id: "social-stimulation",
    title: "The Games Night Menace",
    kind: "hybrid",
    axes: [0, 6],
    archetypeTotals: [53, 33, 9, 31, 21, 37, 53],
    description:
      "You'd never miss a games night — mostly because you intend to win it. You like your evenings loud, your scores kept properly, and your friends slightly competitive-afraid. Losing gracefully is a skill you're still, technically, developing.",
  },
  {
    id: "novelty-stimulation",
    title: "The Say-Yes-First",
    kind: "hybrid",
    axes: [5, 6],
    archetypeTotals: [30, 24, 20, 29, 30, 46, 45],
    description:
      "The answer arrives well before the details do — the wild swim, the taster session on a climbing wall, the thing a mate mentioned once. A plan is more appealing for having a bit of risk in it and considerably less appealing for being sensible. Somewhere behind you is a drawer of gear from things that lasted a fortnight.",
  },
  {
    id: "social-analytical",
    title: "The League Secretary",
    kind: "hybrid",
    axes: [0, 3],
    archetypeTotals: [47, 13, 13, 46, 11, 30, 29],
    description:
      "Somebody has to keep the spreadsheet, and it was never going to be anyone else. Pub quizzes, fantasy leagues, board games with a rulebook thicker than the box — the structure is as much of the fun as the company. The table does occasionally want to just play, rather than hear the rule clarified.",
  },
  {
    id: "energy-stimulation",
    title: "The Hard Session",
    kind: "hybrid",
    axes: [1, 6],
    archetypeTotals: [28, 42, 25, 20, 21, 27, 43],
    description:
      "A session that did not hurt a bit has not really counted. Five-a-side with the score kept, a hill taken too fast, the last round on the bag when your arms have gone — that is the good stuff. Rest days get treated as a rumour, right up until something twinges.",
  },
  {
    id: "outdoors-novelty",
    title: "The Detour-Taker",
    kind: "hybrid",
    axes: [4, 5],
    archetypeTotals: [19, 18, 20, 18, 37, 40, 19],
    description:
      "The route home has never once been the route home. A new footpath, a bit of coast you have not seen, twenty minutes spent working out what that building is — none of it strenuous, all of it somewhere new. Familiar walks have started to feel like a waste of an afternoon.",
  },

  // --- and the flat profile ------------------------------------------------
  {
    id: ALL_ROUNDER_ID,
    title: "The All-Rounder",
    kind: "all-rounder",
    axes: [],
    archetypeTotals: [29, 30, 28, 30, 30, 30, 28],
    description:
      "No single thing wins outright, and that turns out to be the useful part. A week can hold a five-a-side, a half-finished drawing and a long argument about a board game rule, and none of them feel like a stretch. The catch is that nothing pulls quite hard enough to become the thing you are known for.",
  },
];

/** Lookup by id, built once. */
const TYPES_BY_ID = new Map(PERSONALITY_TYPES.map((type) => [type.id, type]));

/** The type with this id, or undefined. Used by the dev scripts. */
export function personalityTypeById(id: string): PersonalityType | undefined {
  return TYPES_BY_ID.get(id);
}

/**
 * The profile for a set of raw per-axis sums.
 *
 * ⚠️ `totals` IS THE RAW SUMS across the answered questions — not averages, not
 * anything rounded. Rounding upstream of this collapses distinct scores onto
 * the same integer: it previously left ~58% of all answer paths tied at the
 * top, and every one of those was decided by axis order rather than by the
 * user's answers. See the scoring section of CLAUDE.md.
 *
 * Throws on a malformed vector rather than guessing. A caller handing this the
 * wrong shape is a bug, and returning some default type would hide it behind a
 * confident-looking profile card.
 */
export function determinePersonalityType(totals: number[]): PersonalityType {
  if (!Array.isArray(totals) || totals.length !== AXES.length) {
    throw new TypeError(
      `determinePersonalityType: expected ${AXES.length} raw axis sums, got ${JSON.stringify(totals)}`
    );
  }

  const { id } = classifyTotals(totals, DEFAULT_CONFIG);
  const type = TYPES_BY_ID.get(id);
  if (!type) {
    // Only reachable if NAMED_PAIR_IDS and PERSONALITY_TYPES disagree, which
    // the balance script's reachability gate exists to catch first.
    throw new Error(`determinePersonalityType: no type defined for id "${id}"`);
  }
  return type;
}
