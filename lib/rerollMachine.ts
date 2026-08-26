/**
 * The results view as a single state machine.
 *
 * WHY A REDUCER AND NOT useState. The previous implementation held the results
 * in five separate useState values and every handler read all of them out of
 * its closure, then wrote back with plain setX(value). Two handlers running
 * before a re-render therefore both built their next state from the SAME
 * pre-update snapshot, and the second overwrote the first:
 *
 *   baseline           shown=[r1,r2,r3]  queue=5
 *   separate renders   shown=[r4,r5,r3]  queue=3   correct
 *   same batch         shown=[r1,r4,r3]  queue=4   card 0's reroll UNDONE
 *
 * The user clicked twice, saw one card change, and the counter dropped by one.
 * Every read here comes from the `state` argument instead, so dispatches queue
 * up and apply in order however fast they arrive. That is the whole point of
 * this file — do not reintroduce a handler that closes over results state.
 *
 * WHY THE REROLL SEQUENCE IS DETERMINISTIC. Rerolls walk the ranked list in
 * order: the first serves rank 4, the next rank 5, and so on. No randomness,
 * so "what will I get" has one answer and the tests can assert it exactly.
 */
import { availableWildcards, drawRandom, type Rng } from "./resultsSelection.ts";

/** How many ranked cards the results show. Mirrors MIN_RESULTS. */
export const SHOWN_COUNT = 3;

/** The most rerolls a full pool ever grants, shared across all three cards. */
export const MAX_REROLLS = 5;

/**
 * The minimum shape this module needs: an id to exclude on.
 *
 * The index signature is `any` rather than `unknown` deliberately — rows come
 * off Supabase untyped and app/page.tsx reads .title, .description and
 * .matchPercent straight off them. `unknown` would be more honest in isolation
 * but would force a cast at every render site, which is worse than matching the
 * convention the rest of the results code already uses.
 */
export interface RerollActivity {
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface RerollState {
  /** The ranked cards on screen, at most SHOWN_COUNT. */
  shown: RerollActivity[];
  /** Ranks 4+ still to be served, IN ORDER. Its length IS the counter. */
  queue: RerollActivity[];
  /** The wildcard row, or null when none is available. */
  wildcard: RerollActivity | null;
  /** Everything on the pathway, for the wildcard's own independent refresh. */
  wildcardPool: RerollActivity[];
  /** Ids gone for this run — never served again, as a card or a wildcard. */
  discarded: string[];
}

export type RerollAction =
  | { type: "reset" }
  | {
      type: "init";
      ordered: RerollActivity[];
      wildcard: RerollActivity | null;
      wildcardPool: RerollActivity[];
    }
  | { type: "reroll"; index: number }
  | { type: "refreshWildcard"; rng?: Rng; decorate?: (a: RerollActivity) => RerollActivity };

export const EMPTY_REROLL_STATE: RerollState = {
  shown: [],
  queue: [],
  wildcard: null,
  wildcardPool: [],
  discarded: [],
};

/**
 * How many rerolls are left. This is the number shown to the user, and it is
 * derived rather than stored so it cannot drift from the queue it describes.
 */
export function rerollsRemaining(state: RerollState): number {
  return state.queue.length;
}

/**
 * Builds the opening state from the ranked survivors.
 *
 * THE QUEUE IS BUILT ONCE, HERE, and it is where every exclusion lives:
 *   - it starts after the cards on screen (rank 4 onward);
 *   - it skips the wildcard, so a reroll can never duplicate what is already
 *     displayed — the old code allowed the collision and then repaired it
 *     afterwards, which only worked while the repair read fresh state;
 *   - it skips anything already shown, defensively, in case `ordered` ever
 *     contains a repeat;
 *   - it is capped at MAX_REROLLS.
 *
 * ⚠️ The counter is therefore `min(MAX_REROLLS, eligible)` rather than
 * `min(MAX_REROLLS, ordered.length - SHOWN_COUNT)`. Those differ only when the
 * wildcard sits inside ranks 4-8 — about one run in fifteen — and in that case
 * the second formula promises a reroll that cannot be served. A counter that
 * over-promises is the defect being fixed, so the honest one wins.
 */
export function initRerollState(
  ordered: RerollActivity[],
  wildcard: RerollActivity | null,
  wildcardPool: RerollActivity[]
): RerollState {
  const shown = ordered.slice(0, SHOWN_COUNT);
  const blocked = new Set(shown.map((a) => a.id));
  if (wildcard) blocked.add(wildcard.id);

  const queue: RerollActivity[] = [];
  for (const candidate of ordered.slice(SHOWN_COUNT)) {
    if (queue.length >= MAX_REROLLS) break;
    if (blocked.has(candidate.id)) continue;
    blocked.add(candidate.id);
    queue.push(candidate);
  }

  return { shown, queue, wildcard, wildcardPool, discarded: [] };
}

/**
 * Every read is from `state`. No closure, no randomness in the reroll path.
 */
export function rerollReducer(state: RerollState, action: RerollAction): RerollState {
  switch (action.type) {
    case "reset":
      return EMPTY_REROLL_STATE;

    case "init":
      return initRerollState(action.ordered, action.wildcard, action.wildcardPool);

    case "reroll": {
      const outgoing = state.shown[action.index];
      // Dispatching past the end of the queue is a no-op rather than an error:
      // the buttons are removed at 0, but a queued dispatch can still arrive.
      if (!outgoing || state.queue.length === 0) return state;

      const [replacement, ...rest] = state.queue;
      const shown = state.shown.map((a, i) => (i === action.index ? replacement : a));

      return {
        ...state,
        shown,
        queue: rest,
        discarded: [...state.discarded, outgoing.id],
      };
    }

    case "refreshWildcard": {
      // The wildcard's own refresh, unchanged in behaviour: independent of the
      // shared counter, drawn at random from the pathway, obeying nothing but
      // "not already on screen and not already discarded".
      if (!state.wildcard) return state;

      const discarded = [...state.discarded, state.wildcard.id];
      const excluded = [...state.shown.map((a) => a.id), ...discarded];
      const drawn = drawRandom(availableWildcards(state.wildcardPool, excluded), action.rng);

      return {
        ...state,
        discarded,
        wildcard: drawn ? (action.decorate ? action.decorate(drawn) : drawn) : null,
      };
    }
  }
}

/** The cards to render: the ranked ones, then the wildcard if one is left. */
export function resultCardsOf(state: RerollState): RerollActivity[] {
  return state.wildcard
    ? [...state.shown, { ...state.wildcard, isWildcard: true }]
    : state.shown;
}
