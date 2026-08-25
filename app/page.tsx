"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

// --- QUIZ DEFINITIONS ---
const BORED_QUIZ = [
  {
    question: "How much time do you have right now?",
    answers: [
      { text: "10-15 minutes", tags: ["10-mins"] },
      { text: "Around an hour", tags: ["1-hour"] },
      { text: "Half a day", tags: ["half-day"] },
    ],
  },
  {
    question: "What's your current physical energy?",
    answers: [
      { text: "Low Energy (Resting / Sedentary)", tags: ["low-energy", "sedentary"] },
      { text: "High Energy (Moving around / Active)", tags: ["high-energy", "active-movement"] },
    ],
  },
  {
    question: "Where do you want to be?",
    answers: [
      { text: "Indoors / At home", tags: ["inside"] },
      { text: "Outdoors / Leaving the house", tags: ["outside"] },
    ],
  },
  {
    question: "Social preference right now?",
    answers: [
      { text: "Solo (Just me)", tags: ["solo"] },
      { text: "With someone else or a group", tags: ["social", "couple"] },
    ],
  },
  {
    question: "Budget filter?",
    answers: [
      { text: "Strictly Free", tags: ["free"] },
      { text: "Open budget (Free or low cost)", tags: ["low-budget", "free"] },
    ],
  },
];

const HOBBY_QUIZ = [
  {
    question: "What primary psychological itch are you trying to scratch?",
    answers: [
      { text: "Analytical & Systems (Finance, coding, puzzles, strategy)", tags: ["analytical", "tech", "mental-challenge"] },
      { text: "Tactile Creation & Making (Cooking, woodwork, crafting, gear)", tags: ["creative", "hands-on", "messy"] },
      { text: "Culture, History & Mind (Literature, languages, history, design)", tags: ["culture", "learning", "vintage"] },
      { text: "Physical Exertion & Outdoor Exploration (Fitness, hiking, sports)", tags: ["active", "physical-challenge", "nature"] },
    ],
  },
  {
    question: "What environment matches your ideal workflow?",
    answers: [
      { text: "A clean digital desk or screen space", tags: ["desk-bound", "inside", "digital"] },
      { text: "A dedicated workshop, garage, or kitchen space", tags: ["workshop", "inside", "hands-on"] },
      { text: "Out in the wild, trail, or open water", tags: ["wild-nature", "outside", "nature"] },
      { text: "A structured facility (Gym, court, pool, studio)", tags: ["facility", "active"] },
    ],
  },
  {
    question: "How do you want to engage with the learning curve?",
    answers: [
      { text: "Deep Process-Oriented Mastery (Long-term skill building)", tags: ["process-oriented", "goal-oriented", "5-hours-week"] },
      { text: "Tangible Output Focused (I want to build or finish a physical item)", tags: ["tangible-output", "hands-on", "1-2-hours-week"] },
    ],
  },
  {
    question: "What is your time and financial commitment?",
    answers: [
      { text: "Light commitment (1-2 hrs/wk, low cost)", tags: ["1-2-hours-week", "low-budget", "free"] },
      { text: "Deep immersion (5+ hrs/wk, willing to invest in gear)", tags: ["5-hours-week", "investment-required", "low-budget", "free"] },
      { text: "Weekend expeditions only", tags: ["weekend-short", "investment-required", "low-budget", "free"] },
    ],
  },
  {
    question: "Social dynamic preference?",
    answers: [
      { text: "Independent solo pursuit", tags: ["solo"] },
      { text: "With a partner or close friend", tags: ["couple"] },
      { text: "Community, club, or team setting", tags: ["social"] },
    ],
  },
];

const SOCIAL_TAGS = ["solo", "couple", "social"];
const LOCATION_TAGS = ["inside", "outside"];
const TIME_TAGS = ["10-mins", "30-mins", "1-hour", "half-day", "whole-day", "weekend-short", "1-2-hours-week", "5-hours-week"];

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [authMessage, setAuthMessage] = useState("");

  const [path, setPath] = useState<"bored" | "hobby" | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [tagHistory, setTagHistory] = useState<string[][]>([]); 
  const [isFinished, setIsFinished] = useState(false);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const [savedActivityIds, setSavedActivityIds] = useState<number[]>([]);
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

  const handleAuth = async (e: React.FormEvent) => {
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

  const toggleSaveActivity = async (activityId: number) => {
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

  const activeQuiz = path === "bored" ? BORED_QUIZ : HOBBY_QUIZ;
  const progress = path ? Math.round((currentStep / activeQuiz.length) * 100) : 0;

  const handleAnswer = async (selectedTags: string[]) => {
    const newHistory = [...tagHistory, selectedTags];
    setTagHistory(newHistory);

    if (currentStep < activeQuiz.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      setIsFinished(true);
      setIsLoading(true);
      const flattenedTags = newHistory.flat();
      const pathwayTag = path === "bored" ? "quick-fix" : "long-term";
      const finalTags = [...flattenedTags, pathwayTag];
      await findPrecisionMatchesWithRotation(finalTags, pathwayTag);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      setTagHistory(tagHistory.slice(0, -1));
    } else {
      setPath(null);
      setTagHistory([]);
    }
  };

  const findPrecisionMatchesWithRotation = async (collectedTags: string[], pathwayTag: string) => {
    const { data: activities, error } = await supabase.from("activities").select("*");

    if (error || !activities) {
      console.error(error);
      setIsLoading(false);
      return;
    }

    // Collect every matching tag, not just the first. "With someone else or a group"
    // emits ["social", "couple"], and matching on "social" alone excluded couple-only
    // activities from exactly the users asking for them. An activity qualifies if it
    // matches ANY of the user's tags on that axis.
    const userSocialRequirements = collectedTags.filter(tag => SOCIAL_TAGS.includes(tag));
    // No answer currently emits two location tags, so this behaves identically today --
    // it's shaped the same way so adding one can't reintroduce the bug above.
    const userLocationRequirements = collectedTags.filter(tag => LOCATION_TAGS.includes(tag));

    let validActivities = activities.filter(a => a.tags.includes(pathwayTag));

    if (userSocialRequirements.length > 0) {
      validActivities = validActivities.filter(a =>
        userSocialRequirements.some(tag => a.tags.includes(tag))
      );
    }

    if (userLocationRequirements.length > 0) {
      validActivities = validActivities.filter(a =>
        userLocationRequirements.some(tag => a.tags.includes(tag))
      );
    }

    // Retrieve recently shown activity IDs from browser session storage to rotate variety
    const recentKey = `recent_shown_${path}`;
    let recentShownIds: number[] = [];
    try {
      const stored = sessionStorage.getItem(recentKey);
      if (stored) recentShownIds = JSON.parse(stored);
    } catch (e) {
      // fallback
    }

    const scoredActivities = validActivities.map((activity) => {
      let score = 0;
      
      collectedTags.forEach((userTag) => {
        if (activity.tags.includes(userTag)) {
          if (TIME_TAGS.includes(userTag)) {
            score += 6;
          } else {
            score += 2;
          }
        }
      });

      if (collectedTags.includes("analytical") && activity.tags.includes("analytical")) score *= 1.6;
      if (collectedTags.includes("creative") && activity.tags.includes("creative")) score *= 1.6;
      if (collectedTags.includes("culture") && activity.tags.includes("culture")) score *= 1.6;
      if (collectedTags.includes("active") && activity.tags.includes("active")) score *= 1.6;
      if (collectedTags.includes("tangible-output") && activity.tags.includes("tangible-output")) score *= 1.4;

      // ROTATION PENALTY: If this exact activity was shown in the immediate previous run, 
      // gently reduce its score so alternate high-scoring matches bubble to the top!
      if (recentShownIds.includes(activity.id)) {
        score *= 0.65;
      }

      return { ...activity, score: Math.round(score * 10) / 10 };
    });

    const sortedMatches = scoredActivities
      .filter(a => a.score > 0)
      .sort((a, b) => b.score - a.score);

    const topMatches = sortedMatches.slice(0, 3);
    const topMatchIds = topMatches.map(m => m.id);

    // Save these new IDs to session storage so next repeat quiz run rotates them
    try {
      sessionStorage.setItem(recentKey, JSON.stringify(topMatchIds));
    } catch (e) {
      // fallback
    }

    const wildcardCandidates = activities.filter(
      a => a.tags.includes(pathwayTag) && !topMatchIds.includes(a.id)
    );

    let finalResults = [...topMatches];
    if (wildcardCandidates.length > 0) {
      const randomWildcard = wildcardCandidates[Math.floor(Math.random() * wildcardCandidates.length)];
      finalResults.push({ ...randomWildcard, isWildcard: true, score: 0 });
    }

    setRecommendations(finalResults);
    setIsLoading(false);
  };

  const restart = () => {
    setPath(null);
    setCurrentStep(0);
    setTagHistory([]);
    setIsFinished(false);
    setRecommendations([]);
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

        {path === null && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-2xl font-bold text-slate-800 mb-8">What brings you here today?</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button onClick={() => setPath("bored")} className="bg-white p-8 rounded-2xl shadow-sm border-2 border-slate-100 hover:border-blue-500 hover:shadow-md transition-all text-left group">
                <h3 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-blue-600">I'm Bored</h3>
                <p className="text-slate-500 text-sm leading-relaxed">Quick tasks, micro-productivity, and immediate activities to do right now.</p>
              </button>

              <button onClick={() => setPath("hobby")} className="bg-white p-8 rounded-2xl shadow-sm border-2 border-slate-100 hover:border-green-500 hover:shadow-md transition-all text-left group">
                <h3 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-green-600">Find a Hobby</h3>
                <p className="text-slate-500 text-sm leading-relaxed">Discover a new ongoing passion tailored to your schedule, domain, and budget.</p>
              </button>
            </div>
          </div>
        )}

        {path !== null && !isFinished && (
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
              {activeQuiz[currentStep].answers.map((answer, index) => (
                <button
                  key={index}
                  onClick={() => handleAnswer(answer.tags)}
                  className={`w-full text-left px-6 py-4 rounded-xl border-2 border-slate-100 transition-all font-medium text-slate-700
                    ${path === 'bored' ? 'hover:border-blue-500 hover:bg-blue-50' : 'hover:border-green-500 hover:bg-green-50'}
                  `}
                >
                  {answer.text}
                </button>
              ))}
            </div>
          </div>
        )}

        {isFinished && (
          <div className="space-y-6 text-left animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-3xl font-bold text-slate-900 text-center">Your Curated Results</h2>

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
                    <p className="text-slate-800 font-bold text-lg mb-2">No perfect match found.</p>
                    <p className="text-slate-500 text-sm">Your strict limits filtered out our current database. Try a wider filter!</p>
                  </div>
                )}

                <button onClick={restart} className="w-full bg-slate-900 text-white py-4 mt-8 rounded-xl font-bold hover:bg-slate-800 transition-colors shadow-lg hover:shadow-xl transform hover:-translate-y-0.5">
                  Take Another Quiz
                </button>
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