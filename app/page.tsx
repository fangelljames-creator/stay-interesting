"use client";

import { useState, useEffect, SubmitEvent } from "react";
import { supabase } from "@/lib/supabaseClient";
import PersonalityQuiz from "@/components/PersonalityQuiz";
import { readQuizSession, clearQuizSession, sessionUserVector, type QuizSession } from "@/lib/quizSession";
import { rankActivities } from "@/lib/matchActivities";
import {
  satisfiesFilter,
  type FilterAction,
  type PathwayTag,
} from "@/lib/activityTags";

/**
 * Rotation penalty, expressed as a distance multiplier. Ranking is now by
 * Euclidean distance where LOWER is better, so pushing a recently-shown
 * activity down means multiplying its distance rather than shrinking a score.
 * Applied to a sort key only -- the matchPercent on the card stays the true
 * one, so the number shown never lies about the fit.
 */
const ROTATION_DISTANCE_PENALTY = 1.35;

/**
 * The funnel, in order. Every visit walks personality quiz -> Bored/Hobby
 * chooser -> feasibility questions -> results.
 *
 * "loading" exists because this page is statically prerendered: sessionStorage
 * does not exist during that render, so which stage to show cannot be known
 * until after mount. Resolving it in useEffect and painting a placeholder in
 * the meantime avoids a hydration mismatch.
 */
type FunnelStage = "loading" | "quiz" | "chooser" | "questions" | "results";

// --- QUIZ DEFINITIONS ---
import {
  QUICK_QUESTIONS,
  HOBBY_QUESTIONS,
  RELAXATION_STEPS,
  MIN_RESULTS,
  widenTime,
  type FeasibilityQuestion,
} from "@/lib/feasibilityQuestions";

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [authMessage, setAuthMessage] = useState("");

  const [stage, setStage] = useState<FunnelStage>("loading");
  const [quizSession, setQuizSession] = useState<QuizSession | null>(null);

  const [path, setPath] = useState<"bored" | "hobby" | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [answerHistory, setAnswerHistory] = useState<FilterAction[]>([]);
  // Which constraints, if any, had to be bent to find anything. Surfaced on
  // the results so relaxation is never silent.
  const [relaxedConstraints, setRelaxedConstraints] = useState<string[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
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
  // A returning visitor lands on the chooser; a new one takes the quiz first.
  //
  // eslint's react-hooks/set-state-in-effect fires here, and unavoidably so:
  // this page is prerendered, sessionStorage does not exist at that point, and
  // reading it during render would be a hydration mismatch. Deferring to an
  // effect is the correct trade. Both setState calls batch into one render.
  useEffect(() => {
    const stored = readQuizSession();
    setQuizSession(stored);
    setStage(stored ? "chooser" : "quiz");
  }, []);

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

    const pool = activities.filter((a) => a.tags?.includes(pathwayTag));

    // Pair every answer with the constraint its question governs, so
    // relaxation knows what each one is.
    let constraints = questions.map((question, index) => ({
      kind: question.constraint,
      action: answers[index] ?? ({ kind: "none" } as FilterAction),
    }));

    const applyAll = (candidates: any[]) =>
      candidates.filter((a) =>
        constraints.every((c) => satisfiesFilter(a.tags ?? [], c.action))
      );

    let survivors = applyAll(pool);

    // GRACEFUL RELAXATION. Bend one thing at a time, in a fixed order, and
    // only far enough to reach MIN_RESULTS. Cost and company are never in
    // RELAXATION_STEPS, so they cannot be bent here however empty the pool is.
    const bent: string[] = [];
    for (const step of RELAXATION_STEPS) {
      if (survivors.length >= MIN_RESULTS) break;

      let changedSomething = false;
      constraints = constraints.map((c) => {
        // An answer that already filters nothing cannot be relaxed further,
        // and must not be reported as though it had been.
        if (!step.kinds.includes(c.kind) || c.action.kind === "none") return c;

        if (c.kind === "time") {
          const widened = widenTime(c.action, pathwayTag);
          if (!widened) return c;
          changedSomething = true;
          return { ...c, action: widened };
        }

        changedSomething = true;
        return { ...c, action: { kind: "none" } as FilterAction };
      });

      if (changedSomething) {
        bent.push(step.label);
        survivors = applyAll(pool);
      }
    }
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
      const ranked = rankActivities(userVector, survivors);
      // The penalty moves the SORT KEY only. matchPercent on the card stays
      // the true distance, so the number never lies to make rotation work.
      const sortKey = (a: (typeof ranked)[number]) =>
        recentShownIds.includes(a.id) ? a.distance * ROTATION_DISTANCE_PENALTY : a.distance;
      ordered = [...ranked].sort((a, b) => sortKey(a) - sortKey(b));
    } else {
      // No vector: sessionStorage is blocked, so writeQuizSession failed
      // silently. Nothing can rank, so show the feasible set unranked and let
      // the results page say so rather than implying an order that isn't real.
      ordered = survivors;
    }

    const topMatches = ordered.slice(0, MIN_RESULTS);
    const topMatchIds = topMatches.map((m) => m.id);

    try {
      sessionStorage.setItem(recentKey, JSON.stringify(topMatchIds));
    } catch {
      // Nothing to do; rotation just won't apply next run.
    }

    // The wildcard may stretch TASTE, never FEASIBILITY: drawn from the same
    // filtered survivors, so it can surprise on theme but can never suggest
    // something ruled out on cost, company, or anything else asked.
    const wildcardCandidates = ordered.filter((a) => !topMatchIds.includes(a.id));

    const finalResults = [...topMatches];
    if (wildcardCandidates.length > 0) {
      const randomWildcard =
        wildcardCandidates[Math.floor(Math.random() * wildcardCandidates.length)];
      finalResults.push({ ...randomWildcard, isWildcard: true });
    }

    setRecommendations(finalResults);
    setIsLoading(false);
  };

  /** Enter the feasibility questions for a pathway, from a clean slate. */
  const choosePath = (chosen: "bored" | "hobby") => {
    setPath(chosen);
    setCurrentStep(0);
    setAnswerHistory([]);
    setRecommendations([]);
    setRelaxedConstraints([]);
    setStage("questions");
  };

  /** Back to the chooser, keeping the personality vector. */
  const restart = () => {
    setPath(null);
    setCurrentStep(0);
    setAnswerHistory([]);
    setRecommendations([]);
    setRelaxedConstraints([]);
    setStage("chooser");
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
    setRecommendations([]);
    setRelaxedConstraints([]);
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
    if (isWildcard) return "✨ Wildcard";
    switch(index) {
      case 0: return "🥇 1st";
      case 1: return "🥈 2nd";
      case 2: return "🥉 3rd";
      default: return "";
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-between p-4 md:p-8 relative">
      
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
      <div className="w-full max-w-2xl flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Stay Interesting</h2>
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
            <form onSubmit={handleAuth} className="flex gap-2 items-center">
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
          )}
        </div>
      </div>
      {authMessage && <p className="text-xs text-center text-amber-600 font-medium mb-2">{authMessage}</p>}

      <div className="max-w-2xl w-full text-center space-y-8 my-auto">
        <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight mb-8 cursor-pointer hover:text-blue-600 transition-colors" onClick={restart}>
          Stay Interesting
        </h1>

        {stage === "loading" && (
          <div className="flex flex-col items-center justify-center py-16 space-y-4">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
          </div>
        )}

        {stage === "quiz" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <PersonalityQuiz onContinue={handleQuizComplete} />
          </div>
        )}

        {stage === "chooser" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-2xl font-bold text-slate-800 mb-8">What brings you here today?</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button onClick={() => choosePath("bored")} className="bg-white p-8 rounded-2xl shadow-sm border-2 border-slate-100 hover:border-blue-500 hover:shadow-md transition-all text-left group">
                <h3 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-blue-600">I'm Bored</h3>
                <p className="text-slate-500 text-sm leading-relaxed">Quick tasks, micro-productivity, and immediate activities to do right now.</p>
              </button>

              <button onClick={() => choosePath("hobby")} className="bg-white p-8 rounded-2xl shadow-sm border-2 border-slate-100 hover:border-green-500 hover:shadow-md transition-all text-left group">
                <h3 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-green-600">Find a Hobby</h3>
                <p className="text-slate-500 text-sm leading-relaxed">Discover a new ongoing passion tailored to your schedule, domain, and budget.</p>
              </button>
            </div>

            <button
              onClick={retakePersonalityQuiz}
              className="text-sm font-semibold text-slate-400 hover:text-indigo-600 underline underline-offset-4 transition-colors"
            >
              Retake the personality quiz
            </button>
          </div>
        )}

        {stage === "questions" && path !== null && (
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 relative animate-in fade-in zoom-in-95 duration-300">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-slate-100 rounded-t-3xl overflow-hidden">
              <div className={`h-full transition-all duration-500 ease-out ${path === 'bored' ? 'bg-blue-500' : 'bg-green-500'}`} style={{ width: `${progress}%` }} />
            </div>

            <button onClick={handleBack} className="absolute top-6 left-6 text-slate-400 hover:text-slate-900 font-semibold text-sm flex items-center transition-colors">
              ← Back
            </button>

            <p className={`text-sm font-bold uppercase tracking-wider mb-3 mt-8 ${path === 'bored' ? 'text-blue-500' : 'text-green-500'}`}>
              Question {currentStep + 1} of {activeQuiz.length}
            </p>
            
            <h2 className="text-2xl md:text-3xl font-bold text-slate-800 mb-8 leading-tight">
              {activeQuiz[currentStep].question}
            </h2>

            <div className="flex flex-col space-y-3">
              {activeQuiz[currentStep].options.map((option, index) => (
                <button
                  key={index}
                  onClick={() => handleAnswer(option.action)}
                  className={`w-full text-left px-6 py-4 rounded-xl border-2 border-slate-100 transition-all font-medium text-slate-700
                    ${path === 'bored' ? 'hover:border-blue-500 hover:bg-blue-50' : 'hover:border-green-500 hover:bg-green-50'}
                  `}
                >
                  {option.text}
                </button>
              ))}
            </div>
          </div>
        )}

        {stage === "results" && (
          <div className="space-y-6 text-left animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-3xl font-bold text-slate-900 text-center">Your Curated Results</h2>

            {relaxedConstraints.length > 0 && recommendations.length > 0 && (
              <p className="text-center text-sm text-sky-800 bg-sky-50 border border-sky-200 rounded-xl px-4 py-3">
                Nothing matched everything you asked for, so we bent{" "}
                <strong>{relaxedConstraints.join(", then ")}</strong> to find these. Your budget
                and who you are with were left exactly as you set them.
              </p>
            )}

            {!quizSession && recommendations.length > 0 && (
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
              <div className="space-y-5">
                {recommendations.length > 0 ? (
                  recommendations.map((activity, index) => {
                    const isSaved = savedActivityIds.includes(activity.id);
                    return (
                      <div
                        key={`${activity.id}-${index}`} 
                        className={`p-6 rounded-2xl shadow-sm border transition-all transform hover:-translate-y-1 relative overflow-hidden
                          ${activity.isWildcard ? 'bg-white border-purple-200' : 'bg-white border-slate-200 hover:shadow-md'}
                        `}
                      >
                        <div className="flex justify-between items-center mb-4">
                          <h3 className={`text-xl font-bold ${activity.isWildcard ? 'text-purple-900' : 'text-slate-900'}`}>
                            {activity.title}
                          </h3>
                          
                          <div className="flex items-center gap-2">
                            {typeof activity.matchPercent === "number" && (
                              <span
                                title="How closely this matches your personality vector"
                                className="border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap"
                              >
                                {Math.round(activity.matchPercent)}% match
                              </span>
                            )}
                            <span className={`border text-xs font-bold px-4 py-1.5 rounded-full whitespace-nowrap ${getMedalStyles(index, activity.isWildcard)}`}>
                              {getMedalText(index, activity.isWildcard)}
                            </span>
                            
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
                        
                        <p className="text-slate-600 leading-relaxed text-sm md:text-base">
                          {activity.description}
                        </p>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-slate-800 font-bold text-lg mb-2">Nothing fits, even after bending what we could.</p>
                    <p className="text-slate-500 text-sm mb-4">
                      We relaxed where you wanted to be, how active it should be, and how much time
                      you have — and still found nothing. We will not suggest something that costs
                      more than you said, or needs people you do not have.
                    </p>
                    <button
                      onClick={restart}
                      className="text-sm font-semibold text-blue-600 hover:text-blue-800 underline underline-offset-4"
                    >
                      Try different answers
                    </button>
                  </div>
                )}

                <button onClick={restart} className="w-full bg-slate-900 text-white py-4 mt-8 rounded-xl font-bold hover:bg-slate-800 transition-colors shadow-lg hover:shadow-xl transform hover:-translate-y-0.5">
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
      
      <div className="text-xs text-slate-400 mt-8">
        Stay Interesting • Powered by Supabase & Next.js
      </div>
    </main>
  );
}