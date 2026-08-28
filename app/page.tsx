"use client";

import { useState, useEffect, useReducer, useRef, SubmitEvent } from "react";
import { supabase } from "@/lib/supabaseClient";
import PersonalityQuiz from "@/components/PersonalityQuiz";
import TasteRadar from "@/components/TasteRadar";
import { determinePersonalityType } from "@/lib/personalityTypes";
import { readQuizSession, clearQuizSession, sessionUserVector, type QuizSession } from "@/lib/quizSession";
import { rankActivities } from "@/lib/matchActivities";
import { type FilterAction, type PathwayTag } from "@/lib/activityTags";
import {
  availableWildcards,
  drawRandom,
  diverseSelect,
  DIVERSITY_MIN_DISTANCE,
} from "@/lib/resultsSelection";
import {
  applyRotation,
  constraintsFrom,
  poolFor,
  selectSurvivors,
} from "@/lib/selectionPipeline";
import {
  rerollReducer,
  rerollsRemaining,
  resultCardsOf,
  EMPTY_REROLL_STATE,
  type RerollActivity,
} from "@/lib/rerollMachine";

/**
 * The funnel, in order. Every visit walks hero -> personality quiz ->
 * Bored/Hobby chooser -> feasibility questions -> results.
 *
 * "loading" exists because this page is statically prerendered: sessionStorage
 * does not exist during that render, so which stage to show cannot be known
 * until after mount. Resolving it in useEffect and painting a placeholder in
 * the meantime avoids a hydration mismatch.
 *
 * "hero" is where a NEW visitor lands. The funnel used to open on question 1
 * of the personality quiz, which asked eight abstract questions of someone who
 * had not yet been told what the site does. Someone returning in the same tab
 * skips it — they have a vector, so they get the banner and the chooser.
 *
 * The hero is a STAGE, not a route: its CTA sets stage to "quiz" and the quiz
 * animates in on the same page. Nothing navigates.
 */
type FunnelStage = "loading" | "hero" | "quiz" | "chooser" | "questions" | "results";

/**
 * The wildcard is drawn from the raw pathway pool, so unlike a ranked card it
 * arrives with no distance/matchPercent. Send that single row through the same
 * rankActivities the ranked cards went through, so the percentage on a
 * wildcard means exactly what it means on every other card.
 *
 * It is a TRUE number on a RANDOMLY DRAWN row: it says how well the draw
 * happens to fit, not that fit had anything to do with the draw. The badge
 * beside it says so out loud.
 *
 * No user vector (storage blocked) or a malformed row -> no badge, as before.
 */
function decorateWildcard(activity: any, userVector: number[] | null) {
  if (!activity) return null;
  if (!userVector) return activity;
  return rankActivities(userVector, [activity])[0] ?? activity;
}

// --- QUIZ DEFINITIONS ---
import {
  QUICK_QUESTIONS,
  HOBBY_QUESTIONS,
  MIN_RESULTS,
  type FeasibilityQuestion,
} from "@/lib/feasibilityQuestions";

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  /**
   * Mobile only. The inline auth form is two inputs and two buttons in a
   * non-wrapping row — about 342px against the 328px a 360px phone actually
   * has — so below `sm` it collapses to a single "Log in" button and opens
   * from here. The panel is absolutely positioned, so opening it costs the
   * stage no height at all.
   */
  const [showAuthPanel, setShowAuthPanel] = useState(false);

  const [stage, setStage] = useState<FunnelStage>("loading");
  const [quizSession, setQuizSession] = useState<QuizSession | null>(null);

  const [path, setPath] = useState<"bored" | "hobby" | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [answerHistory, setAnswerHistory] = useState<FilterAction[]>([]);
  // Which constraints, if any, had to be bent to find anything. Surfaced on
  // the results so relaxation is never silent.
  const [relaxedConstraints, setRelaxedConstraints] = useState<string[]>([]);
  /**
   * The whole results view, as ONE reducer. It was five useStates whose
   * handlers read every value out of their closure, which meant two rerolls
   * landing before a re-render both built from the same stale snapshot and the
   * second silently undid the first. See lib/rerollMachine.ts.
   */
  const [results, dispatchResults] = useReducer(rerollReducer, EMPTY_REROLL_STATE);
  const { shown: shownActivities, wildcard } = results;
  const rerollsLeft = rerollsRemaining(results);
  const [isLoading, setIsLoading] = useState(false);

  /**
   * The feasibility options are their own scroll region, exactly as the
   * personality quiz's are, so they carry their own scroll position that
   * window.scrollTo cannot reach. Reset on every question so question 4 never
   * opens at question 3's offset.
   */
  const questionOptionsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    questionOptionsRef.current?.scrollTo({ top: 0 });
  }, [currentStep]);
  
  // Activity ids are uuid strings (activities.id defaults to gen_random_uuid()),
  // not integers. These were typed as number and happened to work only because
  // JavaScript compares strings fine and Supabase rows arrive as any[], so tsc
  // never checked. Any arithmetic or parseInt on one would have produced NaN.
  const [savedActivityIds, setSavedActivityIds] = useState<string[]>([]);
  const [savedActivitiesDetails, setSavedActivitiesDetails] = useState<any[]>([]);
  const [showSavedModal, setShowSavedModal] = useState(false);

  // Check active user session on load
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchSavedActivities(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchSavedActivities(session.user.id);
      else {
        setSavedActivityIds([]);
        setSavedActivitiesDetails([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Resolve the opening stage once the tab's storage is actually readable.
  // A returning visitor lands on the chooser; a new one gets the hero.
  //
  // eslint's react-hooks/set-state-in-effect fires here, and unavoidably so:
  // this page is prerendered, sessionStorage does not exist at that point, and
  // reading it during render would be a hydration mismatch. Deferring to an
  // effect is the correct trade. Both setState calls batch into one render.
  useEffect(() => {
    const stored = readQuizSession();
    setQuizSession(stored);
    setStage(stored ? "chooser" : "hero");
  }, []);

  /**
   * SCROLL DISCIPLINE. No stage ever inherits the previous stage's scroll
   * position.
   *
   * This is not belt-and-braces. "results" is the one stage that scrolls the
   * document, and every other stage is a fixed-height shell — so leaving
   * results scrolled halfway down and returning to the chooser would leave
   * the window offset with a 100dvh stage that has nothing below the fold to
   * show for it.
   *
   * `isLoading` is in the deps because results arrive asynchronously: the
   * stage flips to "results" while the fetch is still in flight, so resetting
   * only on `stage` would run against a spinner and leave the real list to
   * appear wherever the user happened to be. Landing on results has to put the
   * first card at the top.
   *
   * The options lists inside the quiz and the feasibility questions carry
   * their own scroll positions, which the window cannot reach; those are reset
   * by ref where they live.
   */
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [stage, isLoading]);

  const fetchSavedActivities = async (userId: string) => {
    const { data: savedData, error: savedError } = await supabase
      .from("saved_activities")
      .select("activity_id")
      .eq("user_id", userId);

    if (!savedError && savedData) {
      const ids = savedData.map(item => item.activity_id);
      setSavedActivityIds(ids);

      if (ids.length > 0) {
        const { data: activityData, error: activityError } = await supabase
          .from("activities")
          .select("*")
          .in("id", ids);

        if (!activityError && activityData) {
          setSavedActivitiesDetails(activityData);
        } else {
          setSavedActivitiesDetails([]);
        }
      } else {
        setSavedActivitiesDetails([]);
      }
    }
  };

  const handleAuth = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAuthMessage("");

    if (isSigningUp) {
      const { error } = await supabase.auth.signUp({ email: authEmail, password: authPassword });
      if (error) setAuthMessage(error.message);
      else setAuthMessage("Check your email for confirmation link or try logging in!");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
      if (error) setAuthMessage(error.message);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setShowSavedModal(false);
    setShowAuthPanel(false);
  };

  const toggleSaveActivity = async (activityId: string) => {
    if (!user) {
      alert("Please log in to save activities to your list!");
      return;
    }

    const isAlreadySaved = savedActivityIds.includes(activityId);

    if (isAlreadySaved) {
      const { error } = await supabase
        .from("saved_activities")
        .delete()
        .eq("user_id", user.id)
        .eq("activity_id", activityId);

      if (!error) {
        const updatedIds = savedActivityIds.filter(id => id !== activityId);
        setSavedActivityIds(updatedIds);
        setSavedActivitiesDetails(savedActivitiesDetails.filter(item => item.id !== activityId));
      }
    } else {
      const { error } = await supabase
        .from("saved_activities")
        .insert([{ user_id: user.id, activity_id: activityId }]);

      if (!error) {
        setSavedActivityIds([...savedActivityIds, activityId]);
        fetchSavedActivities(user.id);
      }
    }
  };

  const activeQuiz = path === "bored" ? QUICK_QUESTIONS : HOBBY_QUESTIONS;
  const progress = path ? Math.round((currentStep / activeQuiz.length) * 100) : 0;

  const resultCards = resultCardsOf(results);

  /**
   * The same cards, split by kind, because they are laid out differently on a
   * desktop: the three ranked ones go in a row and the wildcard runs full-width
   * beneath them.
   *
   * ⚠️ `filter` PRESERVES ORDER, and that is what keeps this safe.
   * resultCardsOf returns [...shown, wildcard], so dropping the wildcard leaves
   * the ranked cards at exactly the indices they had before — which is what
   * rerollCard(index) and the medal helpers read. Sorting or rebuilding this
   * list would silently reroll the wrong card.
   */
  const rankedCards = resultCards.filter((activity) => !activity.isWildcard);
  const wildcardCard = resultCards.find((activity) => activity.isWildcard);

  // The profile behind the ranking, for the card at the top of the results.
  // Null when storage is blocked and there is no session — the same condition
  // that leaves the results unranked, so the card and the ordering agree about
  // whether a vector exists at all.
  const profile = quizSession ? determinePersonalityType(quizSession.totals) : null;

  // Whether a FRESH wildcard could still be drawn -- the current one is
  // excluded because refreshing it discards it. False hides its control.
  const wildcardRefreshAvailable =
    wildcard != null &&
    availableWildcards(results.wildcardPool, [
      ...shownActivities.map((a) => a.id),
      ...results.discarded,
      wildcard.id,
    ]).length > 0;

  const handleAnswer = async (action: FilterAction) => {
    const newHistory = [...answerHistory, action];
    setAnswerHistory(newHistory);

    if (currentStep < activeQuiz.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      setStage("results");
      setIsLoading(true);
      const pathwayTag: PathwayTag = path === "bored" ? "quick-fix" : "long-term";
      await findMatches(newHistory, activeQuiz, pathwayTag);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      setAnswerHistory(answerHistory.slice(0, -1));
    } else {
      // Back from the first feasibility question returns to the chooser, not
      // to the quiz -- the vector is already earned and should not be lost.
      setPath(null);
      setAnswerHistory([]);
      setStage("chooser");
    }
  };

  /**
   * Pathway filter -> per-question filter actions -> rank by personality
   * vector. There is no tag scoring any more: tags decide what is FEASIBLE,
   * the vector decides what FITS.
   */
  const findMatches = async (
    answers: FilterAction[],
    questions: FeasibilityQuestion[],
    pathwayTag: PathwayTag
  ) => {
    const { data: activities, error } = await supabase.from("activities").select("*");

    if (error || !activities) {
      console.error(error);
      setIsLoading(false);
      return;
    }

    // The pathway filter, the hard filters and the relaxation ladder all live
    // in lib/selectionPipeline.ts now. They used to sit inline here, which meant
    // no dev script could reach them — the ladder in particular had never been
    // checked by anything. Behaviour is unchanged; this is the same code, moved.
    const pool = poolFor(activities, pathwayTag);
    const { survivors, bent } = selectSurvivors(
      pool,
      constraintsFrom(questions, answers),
      pathwayTag
    );
    setRelaxedConstraints(bent);

    // Rotation: remember what was shown last time so it can be pushed down.
    const recentKey = `recent_shown_${path}`;
    let recentShownIds: string[] = [];
    try {
      const stored = sessionStorage.getItem(recentKey);
      if (stored) recentShownIds = JSON.parse(stored);
    } catch {
      // Storage unavailable; no rotation this run.
    }

    const userVector = quizSession ? sessionUserVector(quizSession) : null;

    let ordered;
    if (userVector) {
      ordered = applyRotation(rankActivities(userVector, survivors), recentShownIds);
    } else {
      // No vector: sessionStorage is blocked, so writeQuizSession failed
      // silently. Nothing can rank, so show the feasible set unranked and let
      // the results page say so rather than implying an order that isn't real.
      ordered = survivors;
    }

    /**
     * DIVERSITY RE-RANK. `ordered` is sorted by fit; nothing in that sort
     * knows two activities can be near-identical to EACH OTHER, so a cluster
     * that suits this user takes every slot and the reroll queue behind them.
     * diverseSelect walks the same list and skips a candidate that only
     * restates one already chosen.
     *
     * ⚠️ ONE PASS OVER THE WHOLE LIST, not just the three shown. The reroll
     * queue is built by lib/rerollMachine.ts from ranks 4-8 of whatever it is
     * handed, so re-ordering the input here IS "every reroll is the next best
     * distinct idea" -- and the reducer, the shared counter and the wildcard
     * need no change at all.
     *
     * ⚠️ NOT applied on the no-vector path. Without a user vector there is no
     * fit order to re-rank, and the results page tells the user in as many
     * words that these are "not in any particular order". A greedy pass would
     * impose one and make that sentence false.
     *
     * Skipped-as-redundant activities are NOT gone: they stay in `pool`, so
     * they remain wildcard-eligible and surface normally whenever the answers
     * or the constraints differ.
     */
    const selected = userVector
      ? diverseSelect(ordered, DIVERSITY_MIN_DISTANCE, ordered.length)
      : ordered;

    const topMatches = selected.slice(0, MIN_RESULTS);
    const topMatchIds = topMatches.map((m) => m.id);

    try {
      sessionStorage.setItem(recentKey, JSON.stringify(topMatchIds));
    } catch {
      // Nothing to do; rotation just won't apply next run.
    }

    // THE WILDCARD OBEYS NOTHING. Drawn at random from the whole PATHWAY --
    // not the survivors, not by rank, and not within the budget answer either.
    // The only rows it will not return are the cards already on screen and
    // anything rerolled away. The card is labelled to say exactly this; if a
    // filter is ever put back, the label has to change with it.
    // ONE dispatch rather than five setters. The reroll queue, the exclusions
    // and the counter are all derived inside initRerollState, so there is no
    // window where some of the results state is new and some is old.
    dispatchResults({
      type: "init",
      ordered: selected,
      wildcard: decorateWildcard(drawRandom(availableWildcards(pool, topMatchIds)), userVector),
      wildcardPool: pool,
    });
    setIsLoading(false);
  };

  /** Everything the results view owns. Every way back out clears all of it. */
  const resetResults = () => {
    dispatchResults({ type: "reset" });
    setRelaxedConstraints([]);
  };

  /** The vector the results were built against, or null if storage was blocked. */
  const currentUserVector = () => (quizSession ? sessionUserVector(quizSession) : null);

  /**
   * Reroll one ranked card.
   *
   * DELIBERATELY JUST A DISPATCH. All the logic lives in the reducer, which
   * reads only from the state it is handed, so two of these landing in the
   * same batch consume ranks 4 then 5 in order rather than fighting over one
   * stale snapshot. Nothing here may read results state from the closure.
   */
  const rerollCard = (index: number) => dispatchResults({ type: "reroll", index });

  /**
   * The wildcard's own refresh, unchanged in behaviour: independent of the
   * shared reroll counter, random, and obeying nothing but "not already on
   * screen and not already discarded". Moved into the reducer only so it
   * cannot race the ranked cards.
   */
  const refreshWildcard = () =>
    dispatchResults({
      type: "refreshWildcard",
      decorate: (a) => decorateWildcard(a, currentUserVector()),
    });

  /** Enter the feasibility questions for a pathway, from a clean slate. */
  const choosePath = (chosen: "bored" | "hobby") => {
    setPath(chosen);
    setCurrentStep(0);
    setAnswerHistory([]);
    resetResults();
    setStage("questions");
  };

  /**
   * Back to the chooser, keeping the personality vector.
   *
   * Falls back to the hero when there is no vector to keep. The wordmark at the
   * top of the page calls this, and without the guard a visitor who has not
   * taken the quiz could click it and land on a chooser that has nothing to
   * rank their answers against.
   */
  const restart = () => {
    setPath(null);
    setCurrentStep(0);
    setAnswerHistory([]);
    resetResults();
    setStage(quizSession ? "chooser" : "hero");
  };

  /**
   * Forget the personality result and start the whole funnel again. Retaking
   * is a feature: moods change, and the session is the only thing that
   * remembers, so clearing it is all "start over" needs to mean.
   */
  const retakePersonalityQuiz = () => {
    clearQuizSession();
    setQuizSession(null);
    setPath(null);
    setCurrentStep(0);
    setAnswerHistory([]);
    resetResults();
    setStage("quiz");
  };

  /** The quiz has just written its result; pick it up and move on. */
  const handleQuizComplete = () => {
    setQuizSession(readQuizSession());
    setStage("chooser");
  };

  const getMedalStyles = (index: number, isWildcard: boolean) => {
    if (isWildcard) return "bg-purple-100 text-purple-800 border-purple-200 shadow-sm";
    switch(index) {
      case 0: return "bg-gradient-to-r from-amber-100 to-yellow-200 text-yellow-900 border-yellow-300 shadow-md"; 
      case 1: return "bg-gradient-to-r from-slate-100 to-gray-200 text-gray-800 border-gray-300 shadow-sm"; 
      case 2: return "bg-gradient-to-r from-orange-50 to-amber-100 text-amber-900 border-amber-200 shadow-sm"; 
      default: return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  const getMedalText = (index: number, isWildcard: boolean) => {
    // The label states the rule, because the card genuinely will not obey the
    // answers the user just gave -- INCLUDING their budget. Unlabelled, it
    // reads as a filtering bug, and on the budget answer it would read as a
    // broken promise. Any filter put back on the wildcard changes this text.
    if (isWildcard) return "✨ Wildcard — completely random, ignores everything you said";
    switch(index) {
      case 0: return "🥇 1st";
      case 1: return "🥈 2nd";
      case 2: return "🥉 3rd";
      default: return "";
    }
  };

  /**
   * One result card. Extracted from the results JSX purely so the three ranked
   * cards and the wildcard can be rendered in two different places — a grid on
   * `lg` and a full-width row beneath it — without the card's markup existing
   * twice. Nothing about a card changed in the move.
   *
   * ⚠️ `index` MEANS RANK, and both of its consumers depend on that:
   * rerollCard(index) dispatches against results.shown by position, and
   * getMedalStyles/getMedalText read it as 1st/2nd/3rd. The wildcard is passed
   * an index past the end, which both medal helpers ignore because they branch
   * on isWildcard first.
   */
  const renderResultCard = (activity: RerollActivity, index: number) => {
    const isSaved = savedActivityIds.includes(activity.id);
    return (
      <div
        key={`${activity.id}-${index}`}
        className={`p-4 tall:p-5 taller:p-6 rounded-2xl shadow-sm border transition-all transform hover:-translate-y-1 relative overflow-hidden
          ${activity.isWildcard ? 'bg-white border-purple-200' : 'bg-white border-slate-200 hover:shadow-md'}
        `}
      >
        {/*
          THE BADGE CLUSTER IS PINNED TOP-RIGHT ON EVERY CARD.
          It used to sit in a `flex-wrap justify-between` row, so
          a long title pushed it onto its own line and a short
          one left it beside the title -- the position moved
          with the content, which reads as a layout bug when two
          cards in the same list disagree.

          ⚠️ Pinned with flex, NOT with `absolute top-6 right-6`,
          and the difference matters at the sizes this app is
          actually used at. An absolutely positioned cluster does
          not participate in the card's height, and it cannot
          reserve space for itself: the title would need a fixed
          right padding matched to a cluster whose width varies
          by card. On the WILDCARD card that breaks outright --
          its badge is a 57-character sentence, so at 375px the
          cluster is taller than the header and would lie across
          the description.

          Here the two are siblings in a non-wrapping row, so
          they share the width instead of competing for it:
          `shrink-0` plus a max-width keeps the cluster's corner
          fixed and lets it wrap INTERNALLY when narrow, while
          `min-w-0 flex-1` gives the title whatever is left and
          lets it wrap. Overlap is impossible and the row grows
          to fit the taller of the two.
        */}
        <div className="flex flex-nowrap justify-between items-start gap-3 mb-3 sm:mb-4">
          <h3 className={`text-lg sm:text-xl font-bold min-w-0 flex-1 ${activity.isWildcard ? 'text-purple-900' : 'text-slate-900'}`}>
            {activity.title}
          </h3>

          {/*
            max-w-32 (128px) and text-lg below `sm` are MEASURED,
            not guessed. At a 371px viewport the card gives the
            header 276px, and the split decides how tall the card
            gets: the longest catalogue title ("Learn a
            two-player card game neither of you knows", 49 chars)
            runs to 8 lines and a 224px header if the cluster
            takes 168px, against 4 lines and 118px at 128px.
            Above `sm` the cluster fits on one row well inside
            20rem, so the cap stops constraining and the title
            takes the rest.

            ⚠️ AND THE CAP COMES BACK AT `lg` FOR THE RANKED CARDS ONLY,
            because that is where the three of them go into a row. A card in
            that grid is about 330px wide inside its padding — near enough the
            371px phone the 128px cap was measured against, and nowhere near
            the full-width card the 20rem cap assumes. Left at 20rem the
            cluster would take the whole header row and squeeze the title to
            nothing.

            ⚠️ THE WILDCARD IS EXCLUDED FROM THAT, and it is not a detail. It
            renders full-width BENEATH the grid, so it has the room the 20rem
            cap assumes — and it is the one card whose badge is a 57-character
            sentence. Capped at 128px that badge stacked into a four-row
            cluster and the card grew to 300px, on its own about two thirds of
            what the desktop results view was over budget by.
          */}
          <div className={`flex flex-wrap items-center justify-end gap-2 shrink-0 max-w-32 sm:max-w-[20rem] ${activity.isWildcard ? '' : 'lg:max-w-32'}`}>
            {typeof activity.matchPercent === "number" && (
              <span
                title="How closely this matches your personality vector"
                className="border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap"
              >
                {Math.round(activity.matchPercent)}% match
              </span>
            )}
            <span className={`border text-xs font-bold px-4 py-1.5 rounded-full ${activity.isWildcard ? '' : 'whitespace-nowrap'} ${getMedalStyles(index, activity.isWildcard)}`}>
              {getMedalText(index, activity.isWildcard)}
            </span>

            {/*
              REMOVED, not disabled, when the counter hits 0 --
              and all three go together, because they share one
              counter. The wildcard is not part of this system:
              it keeps its own independent refresh below, which
              costs no reroll.
            */}
            {!activity.isWildcard && rerollsLeft > 0 && (
              <button
                onClick={() => rerollCard(index)}
                title={`Swap this one out for good. ${rerollsLeft} reroll${rerollsLeft === 1 ? "" : "s"} left.`}
                className="border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-900 text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap transition-colors"
              >
                ↻ Reroll
              </button>
            )}

            {activity.isWildcard && wildcardRefreshAvailable && (
              <button
                onClick={refreshWildcard}
                title="Draw another one at random. This one will not come back."
                className="border border-purple-200 bg-purple-50 text-purple-600 hover:bg-purple-100 hover:text-purple-900 text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap transition-colors"
              >
                ↻ Another
              </button>
            )}

            <button
              onClick={() => toggleSaveActivity(activity.id)}
              title={isSaved ? "Saved!" : "Save to list"}
              className={`p-2 rounded-full border transition-all ${
                isSaved
                  ? 'bg-rose-50 border-rose-200 text-rose-600'
                  : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-rose-500'
              }`}
            >
              {isSaved ? "♥" : "♡"}
            </button>
          </div>
        </div>

        {/*
          FULL DESCRIPTION, at every size. The results list is the one place
          allowed to be taller than the screen on a phone, precisely so this
          does not have to be truncated to fit.
        */}
        <p className="text-slate-600 leading-relaxed text-sm md:text-base">
          {activity.description}
        </p>
      </div>
    );
  };

  /**
   * TWO SHELL REGIMES.
   *
   * Every stage but the results is FITTED: a fixed `100dvh` flex column that
   * cannot scroll, with the stage filling what is left between the header band
   * and the footer. `dvh` rather than `vh` because a mobile URL bar collapsing
   * must not leave the stage short of the screen it was sized against.
   *
   * The results stage is the one deliberate exception. Its cards keep their
   * full descriptions, so on a phone that list is honestly taller than the
   * screen and scrolling it is the accepted trade — see docs/manual-test.md.
   *
   * ⚠️ `overflow-hidden` below is a BACKSTOP, not the fitting mechanism.
   * Clipping is a silent failure: nothing throws, nothing warns, the content
   * is simply not there — the same trap the radar's axis labels fell into when
   * LABEL_SPACE was too small and they read "imulation". What actually absorbs
   * a stage that does not fit is the `overflow-y-auto` options region inside
   * it, which scrolls the list instead of losing it.
   */
  const isFitted = stage !== "results";

  return (
    <main
      className={`bg-slate-50 flex flex-col items-center px-3 sm:px-4 md:px-8 relative ${
        isFitted
          ? "h-[100dvh] overflow-hidden py-2 tall:py-4 taller:py-8"
          : "min-h-[100dvh] py-4 taller:py-8"
      }`}
    >
      
      {/* Saved Modal Overlay */}
      {showSavedModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-slate-900">Your Saved List ({savedActivitiesDetails.length})</h3>
              <button onClick={() => setShowSavedModal(false)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 w-8 h-8 rounded-full font-bold flex items-center justify-center transition-colors">
                ✕
              </button>
            </div>

            <div className="overflow-y-auto space-y-4 pr-1 flex-1">
              {savedActivitiesDetails.length > 0 ? (
                savedActivitiesDetails.map((activity) => (
                  <div key={activity.id} className="p-4 rounded-2xl border border-slate-200 bg-white shadow-sm relative text-left">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-bold text-slate-900 pr-8">{activity.title}</h4>
                      <button
                        onClick={() => toggleSaveActivity(activity.id)}
                        className="text-rose-600 font-bold text-sm bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg hover:bg-rose-100 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                    <p className="text-slate-600 text-sm leading-relaxed">{activity.description}</p>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-slate-400">
                  <p className="text-lg font-medium mb-1">No saved activities yet.</p>
                  <p className="text-sm">Click the heart icon on any recommendation to save it here!</p>
                </div>
              )}
            </div>

            <button onClick={() => setShowSavedModal(false)} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold mt-6 hover:bg-slate-800 transition-colors">
              Close
            </button>
          </div>
        </div>
      )}

      {/* Top Header with Auth & Saved List Button */}
      <div className="shrink-0 w-full max-w-2xl flex justify-between items-center gap-2 mb-2 sm:mb-4 relative">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/*
            THE WORDMARK IS THE RESTART AFFORDANCE ON MOBILE. The large <h1>
            below is hidden under `sm` on every stage but the hero — it cost
            about 72px, which is most of what Q4's five options needed to fit a
            360x640 screen — so the click target it carried has to live
            somewhere. It lives here, on the name that is on screen anyway.
            Above `sm` both exist and both restart; the duplication is harmless
            because they say the same thing.
          */}
          <h2
            onClick={restart}
            className="text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-blue-600 cursor-pointer transition-colors whitespace-nowrap"
          >
            Stay Interesting
          </h2>
          {user && (
            <button
              onClick={() => setShowSavedModal(true)}
              className="bg-rose-50 border border-rose-200 text-rose-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 hover:bg-rose-100 transition-colors shadow-sm"
            >
              <span>♥</span> Saved ({savedActivityIds.length})
            </button>
          )}
        </div>

        <div>
          {user ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-600 font-medium hidden sm:inline">{user.email}</span>
              <button onClick={handleSignOut} className="bg-slate-200 hover:bg-slate-300 text-slate-800 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                Sign Out
              </button>
            </div>
          ) : (
            <>
              {/*
                MOBILE: one button. The inline form below is four controls in a
                row that will not wrap — two inputs at w-28 and w-24, a submit
                and a toggle, about 342px of content against the 328px a 360px
                phone leaves after the page padding. Inputs will not shrink
                below their intrinsic size, so that was a real horizontal
                overflow on the narrowest phones, on every stage, before any of
                the vertical work here.
              */}
              <button
                type="button"
                onClick={() => setShowAuthPanel((open) => !open)}
                className="sm:hidden bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap"
              >
                {showAuthPanel ? "Close" : "Log in"}
              </button>

              <form onSubmit={handleAuth} className="hidden sm:flex gap-2 items-center">
                <input
                  type="email"
                  placeholder="Email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  required
                  className="px-2.5 py-1 text-xs border rounded-lg bg-white text-slate-800 w-28 sm:w-36 focus:outline-blue-500"
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  required
                  className="px-2.5 py-1 text-xs border rounded-lg bg-white text-slate-800 w-24 sm:w-28 focus:outline-blue-500"
                />
                <button type="submit" className="bg-slate-900 hover:bg-slate-800 text-white px-3 py-1 text-xs font-bold rounded-lg transition-colors">
                  {isSigningUp ? "Sign Up" : "Log In"}
                </button>
                <button type="button" onClick={() => setIsSigningUp(!isSigningUp)} className="text-[10px] text-blue-600 underline whitespace-nowrap">
                  {isSigningUp ? "Have account?" : "New user?"}
                </button>
              </form>
            </>
          )}
        </div>

        {/*
          The mobile panel. ABSOLUTELY POSITIONED on purpose: it has to cost the
          stage below it no height at all, or opening it would push a fitted
          stage past the bottom of the screen — the one thing this layout is
          for. z-40 keeps it above the stage and below the saved-list modal.
        */}
        {!user && showAuthPanel && (
          <form
            onSubmit={handleAuth}
            className="sm:hidden absolute top-full right-0 mt-2 z-40 w-64 bg-white border border-slate-200 rounded-xl shadow-xl p-3 flex flex-col gap-2 animate-in fade-in slide-in-from-top-2 duration-200"
          >
            <input
              type="email"
              placeholder="Email"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              required
              className="px-2.5 py-1.5 text-xs border rounded-lg bg-white text-slate-800 w-full focus:outline-blue-500"
            />
            <input
              type="password"
              placeholder="Password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              required
              className="px-2.5 py-1.5 text-xs border rounded-lg bg-white text-slate-800 w-full focus:outline-blue-500"
            />
            <div className="flex items-center justify-between gap-2">
              <button type="submit" className="bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 text-xs font-bold rounded-lg transition-colors">
                {isSigningUp ? "Sign Up" : "Log In"}
              </button>
              <button type="button" onClick={() => setIsSigningUp(!isSigningUp)} className="text-[10px] text-blue-600 underline whitespace-nowrap">
                {isSigningUp ? "Have account?" : "New user?"}
              </button>
            </div>
            {/*
              The message renders INSIDE the panel on mobile. It used to sit
              under the header band, where it pushed every stage down by its own
              height the moment a sign-up succeeded.
            */}
            {authMessage && <p className="text-[11px] text-amber-600 font-medium">{authMessage}</p>}
          </form>
        )}
      </div>
      {authMessage && <p className="hidden sm:block shrink-0 text-xs text-center text-amber-600 font-medium mb-2">{authMessage}</p>}

      <div
        className={`w-full text-center ${
          stage === "results" ? "max-w-2xl lg:max-w-6xl" : "max-w-2xl"
        } ${isFitted ? "flex min-h-0 flex-1 flex-col" : "my-auto"}`}
      >
        {/*
          Hidden on the hero, which sets the name itself and at hero scale.
          Two "Stay Interesting" headings stacked on one screen reads as a bug
          rather than as branding.

          AND HIDDEN BELOW `sm` EVERYWHERE. At 36px of type plus its margin it
          cost about 72px, which is most of the gap between Q4's five options
          and a 640px screen — and it is the purest chrome on the page, since
          the wordmark in the band above says the same word and now carries the
          same restart click. `space-y-8` went with it: it was stacking a 32px
          gap on top of this heading's own mb-8, for 64px between the name and
          the stage.
        */}
        {stage !== "hero" && (
          <h1 className={`${stage === "results" ? "hidden taller:block" : "hidden sm:block"} shrink-0 text-2xl tall:text-3xl taller:text-5xl font-extrabold text-slate-900 tracking-tight mb-3 tall:mb-4 taller:mb-8 cursor-pointer hover:text-blue-600 transition-colors`} onClick={restart}>
            Stay Interesting
          </h1>
        )}

        {stage === "loading" && (
          <div className="flex flex-1 flex-col items-center justify-center py-16 space-y-4">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
          </div>
        )}

        {stage === "hero" && (
          /*
            `overflow-y-auto` on the column with `my-auto` on the child is the
            centring pattern that survives overflow: auto margins collapse to
            zero when there is no free space, so at the floor tier the hero
            scrolls from its true top instead of having its head cut off, which
            is what `justify-center` would do.
          */
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="w-full my-auto animate-in fade-in duration-700 text-left">
            <div className="flex flex-col md:flex-row md:items-center gap-y-3 tall:gap-y-6 gap-x-0 md:gap-x-12">
              <div className="flex-1">
                <h1 className="text-3xl sm:text-4xl md:text-6xl font-extrabold text-slate-900 tracking-tight">
                  Stay Interesting
                </h1>

                <p className="text-base sm:text-lg md:text-xl text-slate-700 font-medium mt-2 tall:mt-3 taller:mt-4 leading-snug">
                  Beat the boredom you are in right now, or find a hobby that actually sticks.
                </p>

                <p className="text-xs sm:text-sm md:text-base text-slate-500 mt-2 taller:mt-3 leading-relaxed">
                  First answer a few quick scenarios so we can learn what would best suit you as
                  a person, and then we will give you the ability to outline some key conditions.
                </p>

                {/*
                  ⚠️ THE THREE CHIPS MUST STAY ON ONE ROW AT 360px, and the
                  padding here is what buys that. Measured: at px-3 they come to
                  340px against the 321px a 360px phone leaves, so they wrapped
                  to a second row — 34px of pure whitespace, which was over half
                  the hero's overrun at 360x640. At px-2 with gap-1.5 they total
                  ~312px and sit on one line. Widening either of these, or
                  lengthening a chip's text, puts the second row back.
                */}
                <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-3 tall:mt-4 taller:mt-6">
                  {["~2 minutes", "no wrong answers", "skip anything"].map((chip) => (
                    <span
                      key={chip}
                      className="text-xs font-bold text-slate-500 bg-white border border-slate-200 rounded-full px-2 sm:px-3 py-1 tall:py-1.5"
                    >
                      {chip}
                    </span>
                  ))}
                </div>

                {/*
                  The single CTA. It changes STAGE, not route -- the quiz
                  mounts into the same page underneath and animates in. A
                  router.push here would cost a navigation and lose the
                  entrance.
                */}
                <button
                  onClick={() => setStage("quiz")}
                  className="w-full sm:w-auto mt-3 tall:mt-6 taller:mt-8 px-8 py-3 tall:py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-200 hover:-translate-y-0.5"
                >
                  Find out what suits you →
                </button>
              </div>

              {/*
                The motif, selling itself. Fifteen example shapes on a loop: the
                point being made is that this measures something specific about
                a person, which a static chart cannot say.

                ⚠️ THIS IS THE ONE RADAR THAT CANNOT BE SHRUNK TO BUY HEIGHT,
                and the reason is in lib/radarGeometry.ts rather than in taste.
                `demo` mode draws axis labels, so its viewBox is
                (RADIUS + LABEL_SPACE) * 2 = 368 units around a 200-unit ring,
                and the 11-unit label text scales with the box: ~9.6px rendered
                at 320px wide, ~7.2px at 240, ~4.8px at 160. Below roughly 280px
                the axis names stop being readable, and the names are the entire
                reason the hero shows a chart at all — a shape with unreadable
                labels says nothing about what is being measured.

                So it holds at 288px on a phone and the hero's height comes out
                of the copy's type scale above instead.
              */}
              <div className="shrink-0 self-center w-72 sm:w-80 md:w-[320px]">
                <TasteRadar mode="demo" />
              </div>
            </div>
          </div>
          </div>
        )}

        {stage === "quiz" && (
          <div className="flex min-h-0 flex-1 flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
            <PersonalityQuiz onContinue={handleQuizComplete} />
          </div>
        )}

        {stage === "chooser" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="w-full my-auto space-y-4 tall:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/*
              THE RETURNING-VISITOR BANNER. Someone reaching the chooser has
              already earned a vector, so the hero's pitch is spent on them --
              what they need instead is proof the tab still remembers who they
              are, and a way out if it got them wrong.

              Deliberately slim: this is a receipt, not the payoff. The full
              labelled radar belongs on the profile card at the end of the
              quiz. The retake link lives HERE rather than beneath the chooser
              cards, where it used to sit -- one retake affordance, next to the
              thing it would undo.
            */}
            {quizSession && (
              <div className="flex items-center gap-3 sm:gap-4 text-left bg-white border border-slate-200 rounded-2xl p-3 tall:p-4 shadow-sm">
                <div className="shrink-0 w-14 sm:w-[72px]">
                  <TasteRadar mode="building" vector={sessionUserVector(quizSession)} size={72} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Your taste map
                  </p>
                  <p className="text-base sm:text-lg font-bold text-slate-900 leading-tight truncate">
                    {determinePersonalityType(quizSession.totals).title}
                  </p>
                  <button
                    onClick={retakePersonalityQuiz}
                    className="text-xs font-semibold text-slate-400 hover:text-indigo-600 underline underline-offset-4 transition-colors mt-1"
                  >
                    Retake the quiz
                  </button>
                </div>
              </div>
            )}

            <h2 className="text-xl sm:text-2xl font-bold text-slate-800 mb-4 tall:mb-6 taller:mb-8">What brings you here today?</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 tall:gap-4">
              <button onClick={() => choosePath("bored")} className="bg-white p-5 tall:p-6 taller:p-8 rounded-2xl shadow-sm border-2 border-slate-100 hover:border-blue-500 hover:shadow-md transition-all text-left group">
                <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-1 tall:mb-2 group-hover:text-blue-600">I'm Bored</h3>
                <p className="text-slate-500 text-xs sm:text-sm leading-relaxed">Quick tasks, micro-productivity, and immediate activities to do right now.</p>
              </button>

              <button onClick={() => choosePath("hobby")} className="bg-white p-5 tall:p-6 taller:p-8 rounded-2xl shadow-sm border-2 border-slate-100 hover:border-green-500 hover:shadow-md transition-all text-left group">
                <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-1 tall:mb-2 group-hover:text-green-600">Find a Hobby</h3>
                <p className="text-slate-500 text-xs sm:text-sm leading-relaxed">Discover a new ongoing passion tailored to your schedule, domain, and budget.</p>
              </button>
            </div>

            {/*
              The retake link normally lives in the banner above. This is the
              storage-blocked path: writeQuizSession fails silently, so the
              quiz can finish and still leave quizSession null, and the banner
              -- which has no vector to draw -- does not render. Without this
              there would be no way to retake from the chooser at all.
            */}
            {!quizSession && (
              <button
                onClick={retakePersonalityQuiz}
                className="text-sm font-semibold text-slate-400 hover:text-indigo-600 underline underline-offset-4 transition-colors"
              >
                Retake the personality quiz
              </button>
            )}
          </div>
          </div>
        )}

        {stage === "questions" && path !== null && (
          <div className="flex min-h-0 flex-1 flex-col bg-white p-4 tall:p-6 taller:p-8 rounded-3xl shadow-sm border border-slate-100 relative overflow-hidden animate-in fade-in zoom-in-95 duration-300">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-slate-100 rounded-t-3xl overflow-hidden">
              <div className={`h-full transition-all duration-500 ease-out ${path === 'bored' ? 'bg-blue-500' : 'bg-green-500'}`} style={{ width: `${progress}%` }} />
            </div>

            {/*
              The header band, pinned. Back used to be `absolute top-6 left-6`
              with the counter carrying `mt-8` to clear it — which meant the
              card reserved a whole row of height for a button that was not in
              the flow, and the clearance had to be re-guessed every time the
              padding changed. As a normal row it costs nothing extra and
              matches the personality quiz's band exactly.
            */}
            <div className="shrink-0">
              <div className="flex items-center justify-between gap-4 mt-2">
                <p className={`text-xs sm:text-sm font-bold uppercase tracking-wider ${path === 'bored' ? 'text-blue-500' : 'text-green-500'}`}>
                  Question {currentStep + 1} of {activeQuiz.length}
                </p>
                <button onClick={handleBack} className="text-sm font-semibold text-slate-400 hover:text-slate-900 transition-colors">
                  ← Back
                </button>
              </div>

              <h2 className="text-lg sm:text-2xl md:text-3xl font-bold text-slate-800 mt-2 mb-3 tall:mb-5 taller:mb-8 leading-tight text-left">
                {activeQuiz[currentStep].question}
              </h2>
            </div>

            {/*
              The same scroll region the personality quiz uses. These options
              are short — four at most, none over 36 characters — so this never
              scrolls on a phone in portrait. It is here for the landscape
              floor, where the question and the progress bar stay pinned and
              only the list moves.
            */}
            <div ref={questionOptionsRef} className="min-h-0 flex-1 overflow-y-auto -mx-1 px-1">
              <div className="flex flex-col space-y-2 tall:space-y-3">
                {activeQuiz[currentStep].options.map((option, index) => (
                  <button
                    key={index}
                    onClick={() => handleAnswer(option.action)}
                    className={`w-full text-left px-4 sm:px-6 py-3 tall:py-4 rounded-xl border-2 border-slate-100 transition-all font-medium text-sm sm:text-base text-slate-700
                      ${path === 'bored' ? 'hover:border-blue-500 hover:bg-blue-50' : 'hover:border-green-500 hover:bg-green-50'}
                    `}
                  >
                    {option.text}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {stage === "results" && (
          <div className="space-y-3 tall:space-y-4 text-left animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 text-center">Your Curated Results</h2>

            {/*
              WHY THE PROFILE IS REPEATED HERE. The user met their type once, on
              the card at the end of the personality quiz, and then answered
              nine more questions and changed pathway at least once before
              arriving. By the time the matches appear, the thing doing the
              ranking has scrolled a long way out of sight — and every card
              below carries a match percentage measured against exactly this
              shape. Showing it beside the results is what makes those numbers
              mean something.

              Rendered only when there is a session: with storage blocked there
              is no vector, nothing is ranked, and the banner below says so.
              Claiming a personality type in that state would be inventing one.
            */}
            {quizSession && profile && (
              /*
                SLIMMER ON `lg`, because that is where the three ranked cards
                sit in a row and the whole results view is meant to land on one
                screen. At its full size this card is ~230px of the ~900px a
                laptop has, which is most of the reason it did not fit.

                The copy is NOT cut — every word of the type description is
                still here, at a smaller size. The radar drops from 210px to
                110px, which `final` mode can afford far better than the hero's
                `demo` can: see the note on the hero radar above for why that
                one has a hard floor and this one does not.
              */
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-7 lg:gap-5 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 tall:p-5">
                <div className="shrink-0 self-center w-[180px] sm:w-[210px] lg:w-20">
                  <TasteRadar
                    mode="final"
                    vector={sessionUserVector(quizSession)}
                    highlightAxes={profile.axes}
                    size={210}
                  />
                </div>
                <div className="min-w-0 flex-1 text-center sm:text-left">
                  <p className="text-xs font-bold uppercase tracking-wider text-indigo-500 mb-1">
                    Ranked against
                  </p>
                  <h3 className="text-xl sm:text-2xl lg:text-xl font-extrabold text-slate-900 leading-tight mb-1 sm:mb-2">
                    {profile.title}
                  </h3>
                  <p className="text-sm sm:text-base lg:text-sm text-slate-600 leading-relaxed">{profile.description}</p>
                </div>
              </div>
            )}

            {relaxedConstraints.length > 0 && shownActivities.length > 0 && (
              <p className="text-center text-sm text-sky-800 bg-sky-50 border border-sky-200 rounded-xl px-4 py-3">
                Nothing matched everything you asked for, so we bent{" "}
                <strong>{relaxedConstraints.join(", then ")}</strong> to find these. Your budget
                and who you are with were left exactly as you set them.
                {wildcard && " The wildcard is the exception — it ignores all of it, on purpose."}
              </p>
            )}

            {!quizSession && shownActivities.length > 0 && (
              <p className="text-center text-sm text-slate-700 bg-slate-100 border border-slate-200 rounded-xl px-4 py-3">
                These fit what you asked for, but they are not in any particular order — your
                browser is blocking storage, so we could not keep your personality result to rank
                them against.
              </p>
            )}

            {quizSession && quizSession.skipped > 0 && (
              <p className="text-center text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                {quizSession.skipped} of your {quizSession.questionCount} personality answers
                {quizSession.skipped === 1 ? " was" : " were"} shuffled for you, so these matches
                are a rougher fit.{" "}
                <button
                  onClick={retakePersonalityQuiz}
                  className="font-semibold underline underline-offset-2 hover:text-amber-900"
                >
                  Answer them properly
                </button>
              </p>
            )}

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
                <p className="text-slate-500 font-medium">Curating rotating matches...</p>
              </div>
            ) : (
              <div className="space-y-3 tall:space-y-4">
                {/*
                  ONE SHARED COUNTER for all three ranked cards. It exists
                  because the reroll pool is usually smaller than five: the
                  relaxation ladder stops at MIN_RESULTS (3) and never tries to
                  reach the 8 survivors a full pool needs, so most answer sets
                  start with one or two rerolls and many with none. Three
                  buttons and no number was a promise the state could not keep.
                */}
                {rerollsLeft > 0 && (
                  <p className="text-center text-sm font-semibold text-slate-500">
                    {rerollsLeft} reroll{rerollsLeft === 1 ? "" : "s"} remaining
                    <span className="font-normal text-slate-400">
                      {" "}— shared across the three matches
                    </span>
                  </p>
                )}

                {shownActivities.length === 0 && (
                  <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-slate-800 font-bold text-lg mb-2">Nothing fits, even after bending what we could.</p>
                    <p className="text-slate-500 text-sm mb-4">
                      We relaxed where you wanted to be, how active it should be, and how much time
                      you have — and still found nothing. We will not rank something at you that
                      costs more than you said, or needs people you do not have.
                      {wildcard && " The wildcard below is not a recommendation — it is drawn at random and ignores everything you told us, budget included."}
                    </p>
                    <button
                      onClick={restart}
                      className="text-sm font-semibold text-blue-600 hover:text-blue-800 underline underline-offset-4"
                    >
                      Try different answers
                    </button>
                  </div>
                )}

                {/*
                  THREE RANKED CARDS IN A ROW ON `lg`, WILDCARD FULL-WIDTH
                  BENEATH — which is what makes the desktop results one screen.
                  Below `lg` it is the same vertical list it has always been.

                  ⚠️ The index passed to renderResultCard is the card's position
                  among the RANKED cards, and it has to stay that way:
                  rerollCard(index) dispatches against results.shown, and
                  getMedalStyles/getMedalText read it as the medal rank.
                  resultCardsOf returns [...shown, wildcard] and filter
                  preserves order, so ranked cards keep indices 0-2 exactly as
                  they had when the wildcard was the last element of one list.
                */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 tall:gap-4 items-start">
                  {rankedCards.map((activity, index) => renderResultCard(activity, index))}
                </div>

                {wildcardCard && renderResultCard(wildcardCard, rankedCards.length)}

                <button onClick={restart} className="w-full bg-slate-900 text-white py-3 tall:py-4 mt-3 tall:mt-4 rounded-xl font-bold hover:bg-slate-800 transition-colors shadow-lg hover:shadow-xl transform hover:-translate-y-0.5">
                  Try a different path
                </button>

                <div className="text-center">
                  <button
                    onClick={retakePersonalityQuiz}
                    className="text-sm font-semibold text-slate-400 hover:text-indigo-600 underline underline-offset-4 transition-colors"
                  >
                    Retake the personality quiz
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/*
        Pure chrome, so it only appears where there is height to spare — which
        is a taller viewport, not a wider one. A 1440x900 laptop does not have
        the room; a 1440x1200 monitor does.
      */}
      <div className="hidden taller:block shrink-0 text-xs text-slate-400 mt-4 taller:mt-8">
        Stay Interesting • Powered by Supabase & Next.js
      </div>
    </main>
  );
}