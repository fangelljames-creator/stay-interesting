/**
 * The feasibility questions, and the rules for relaxing them.
 *
 * Deliberately a plain module with no JSX, so scripts can import it directly
 * and check coverage against the real definitions. Keeping these inside the
 * page component would force any checker to mirror them by hand, which is
 * exactly how scripts/analyze-quiz-balance.mjs became something that has to be
 * updated in lockstep or quietly go stale.
 */
import {
  costCeiling,
  TIME_LADDER,
  type FilterAction,
  type PathwayTag,
} from "./activityTags.ts";

// --- FEASIBILITY QUESTIONS ---
//
// Every option states EXACTLY what it does to the candidate pool, as a
// FilterAction. Options used to emit a bag of tags and leave the engine to
// infer meaning from which group each tag fell into, which is how tags ended
// up doing nothing without anyone noticing. A "don't mind" answer is a visible
// { kind: "none" } rather than an absence.
//
// `constraint` names which knob the question turns, so graceful relaxation
// knows what it is allowed to bend and what it must never touch.
export type ConstraintKind = "time" | "energy" | "place" | "setting" | "company" | "cost";

export interface FeasibilityOption {
  text: string;
  action: FilterAction;
}

export interface FeasibilityQuestion {
  question: string;
  constraint: ConstraintKind;
  options: FeasibilityOption[];
}

export const QUICK_QUESTIONS: FeasibilityQuestion[] = [
  {
    question: "How long have you actually got?",
    constraint: "time",
    options: [
      { text: "10-15 minutes", action: { kind: "allow", tags: ["10-mins"] } },
      { text: "About an hour", action: { kind: "allow", tags: ["1-hour"] } },
      { text: "Half a day or more", action: { kind: "allow", tags: ["half-day"] } },
      { text: "No fixed limit", action: { kind: "none" } },
    ],
  },
  {
    question: "What's your body in the mood for?",
    constraint: "energy",
    options: [
      { text: "Something low-key", action: { kind: "exclude", tag: "exertion" } },
      { text: "Get me moving", action: { kind: "require", tag: "exertion" } },
      { text: "Could go either way", action: { kind: "none" } },
    ],
  },
  {
    question: "In or out?",
    constraint: "place",
    options: [
      { text: "Staying in", action: { kind: "require", tag: "inside" } },
      { text: "Heading out", action: { kind: "require", tag: "outside" } },
      { text: "Don't mind", action: { kind: "none" } },
    ],
  },
  {
    question: "Who's around?",
    constraint: "company",
    options: [
      { text: "Just me", action: { kind: "require", tag: "solo" } },
      { text: "One other person", action: { kind: "require", tag: "couple" } },
      { text: "A few of us", action: { kind: "require", tag: "social" } },
    ],
  },
  {
    question: "Spending money?",
    constraint: "cost",
    options: [
      { text: "Keep it free", action: costCeiling("free") },
      { text: "A few quid is fine", action: costCeiling("low-budget") },
      { text: "Not a concern", action: costCeiling("investment-required") },
    ],
  },
];

export const HOBBY_QUESTIONS: FeasibilityQuestion[] = [
  {
    question: "How much of your week can this honestly have?",
    constraint: "time",
    options: [
      { text: "An hour or two, fitted around things", action: { kind: "allow", tags: ["1-2-hours-week"] } },
      { text: "A few solid hours", action: { kind: "allow", tags: ["5-hours-week"] } },
      { text: "Weekend blocks", action: { kind: "allow", tags: ["weekend-blocks"] } },
      { text: "It'll take what it takes", action: { kind: "none" } },
    ],
  },
  {
    question: "Where would it actually happen?",
    constraint: "setting",
    options: [
      { text: "At home", action: { kind: "require", tag: "at-home" } },
      { text: "A place I go - club, gym, studio", action: { kind: "require", tag: "facility" } },
      { text: "Out in nature", action: { kind: "require", tag: "in-nature" } },
      { text: "Anywhere", action: { kind: "none" } },
    ],
  },
  {
    question: "What are you willing to spend to get started?",
    constraint: "cost",
    options: [
      { text: "Free to start", action: costCeiling("free") },
      { text: "Some kit is fine", action: costCeiling("low-budget") },
      { text: "Happy to invest properly", action: costCeiling("investment-required") },
    ],
  },
  {
    question: "Yours alone, or shared?",
    constraint: "company",
    options: [
      { text: "A solo pursuit", action: { kind: "require", tag: "solo" } },
      { text: "Me and a mate", action: { kind: "require", tag: "couple" } },
      { text: "A club or community", action: { kind: "require", tag: "social" } },
      { text: "Open to anything", action: { kind: "none" } },
    ],
  },
];

/**
 * Graceful relaxation, in order. When fewer than MIN_RESULTS activities
 * survive, one step is bent at a time until enough do.
 *
 * COST AND COMPANY ARE ABSENT ON PURPOSE and must stay absent. Someone who
 * said "keep it free" cannot be shown something that costs money, and someone
 * alone cannot be shown something needing three people -- those are not
 * preferences to be nudged, they are facts about their situation. Bending
 * either would produce a suggestion they simply cannot act on.
 */
export const RELAXATION_STEPS: { kinds: ConstraintKind[]; label: string }[] = [
  { kinds: ["place", "setting"], label: "where you wanted to be" },
  { kinds: ["energy"], label: "how active you wanted it" },
  { kinds: ["time"], label: "how much time you have" },
];

export const MIN_RESULTS = 3;

/**
 * Widen a time answer by one slot along its pathway's ladder, preferring the
 * next slot up and falling back to the one below at the top of the ladder.
 */
export function widenTime(action: FilterAction, pathwayTag: PathwayTag): FilterAction | null {
  if (action.kind !== "allow") return null;
  const ladder = TIME_LADDER[pathwayTag];
  const current = ladder.findIndex((tag) => action.tags.includes(tag));
  if (current === -1) return null;

  const next = ladder[current + 1] ?? ladder[current - 1];
  if (!next || action.tags.includes(next)) return null;

  return { kind: "allow", tags: [...action.tags, next] };
}
