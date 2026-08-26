"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { personalityQuestions, type QuizOption } from "../data/personalityQuiz";
import { writeQuizSession } from "../lib/quizSession";
import { totalsFrom, userVectorFromQuizTotals } from "../lib/matchActivities";
import { determinePersonalityType, type PersonalityType } from "../lib/personalityTypes";
import TasteRadar from "./TasteRadar";

/**
 * Module scope on purpose. Math.random() inside the component body trips the
 * React Compiler's purity rule (react-hooks/purity), which cannot tell that
 * this only ever runs from a click handler. Hoisting it out states that
 * plainly instead of leaving a lint error to be ignored.
 */
function pickRandomOption(options: QuizOption[]): QuizOption {
  return options[Math.floor(Math.random() * options.length)];
}

interface PersonalityQuizProps {
  /**
   * What the results-card CTA does. The funnel on app/page.tsx passes a
   * function that advances its own stage; standalone /quiz passes nothing and
   * gets the default, which navigates home into the funnel.
   */
  onContinue?: () => void;
}

export default function PersonalityQuiz({ onContinue }: PersonalityQuizProps) {
  const router = useRouter();

  const [currentStep, setCurrentStep] = useState(0);
  const [selectedVectors, setSelectedVectors] = useState<number[][]>([]);
  // Parallel to selectedVectors: was each answer shuffled by Skip rather than
  // chosen? An array, not a counter, because handleBack has to be able to
  // un-count a skip when the user goes back over one.
  const [skipFlags, setSkipFlags] = useState<boolean[]>([]);
  const [isFinished, setIsFinished] = useState(false);
  // Which way the last move went, so a question slides in from the side the
  // user came from. Purely cosmetic; nothing branches on it but a class name.
  const [direction, setDirection] = useState<1 | -1>(1);

  const [profileType, setProfileType] = useState<PersonalityType | null>(null);

  // Expecting exactly 7 numbers now
  const handleSelectOption = (
    vector: [number, number, number, number, number, number, number],
    wasSkipped = false
  ) => {
    const newVectors = [...selectedVectors, vector];
    const newSkips = [...skipFlags, wasSkipped];

    // Both arrays are set on every path, including the last question. They
    // previously were not, which left state missing the final answer.
    setSelectedVectors(newVectors);
    setSkipFlags(newSkips);
    setDirection(1);

    if (currentStep < personalityQuestions.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      calculateFinalProfile(newVectors, newSkips);
    }
  };

  /**
   * Skipping is a real answer, not an absence of one: it picks a random option
   * and goes through handleSelectOption exactly as a click would. That keeps
   * every vector the same length as every other and means handleBack needs no
   * special case for a skipped question.
   */
  const handleSkip = () => {
    const shuffled = pickRandomOption(personalityQuestions[currentStep].options);
    handleSelectOption(shuffled.vector, true);
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setDirection(-1);
      setCurrentStep(currentStep - 1);
      // Dropping the last answer is all the radar needs to rewind: its vector
      // is derived from selectedVectors, so the shape returns to exactly what
      // it was before that answer. No separate history to keep in step.
      setSelectedVectors(selectedVectors.slice(0, -1));
      setSkipFlags(skipFlags.slice(0, -1));
    }
  };

  const calculateFinalProfile = (allVectors: number[][], allSkips: boolean[]) => {
    // The same summation the building-mode radar runs after every answer. It
    // is shared rather than duplicated so the shape drawn WHILE answering
    // cannot disagree with the vector the finished run actually produces.
    const totals = totalsFrom(allVectors);

    // The dominant axis is judged on the RAW sums. Judging on rounded averages
    // collapsed distinct scores onto the same integer and left ~58% of answer
    // paths tied at the top, and determinePersonalityType breaks ties with
    // indexOf -- so those all went to whichever axis sat earliest in the traits
    // array. Nothing here rounds any more: the vector tiles that once displayed
    // rounded averages are gone, so the sums reach both consumers intact.
    setProfileType(determinePersonalityType(totals));

    // Hand the raw sums to the tab so the funnel can rank activities against
    // them. Division by questionCount happens once, in sessionUserVector.
    writeQuizSession({
      totals,
      questionCount: allVectors.length,
      skipped: allSkips.filter(Boolean).length,
    });

    setIsFinished(true);
  };

  const handleContinue = () => {
    if (onContinue) {
      onContinue();
      return;
    }
    // Standalone /quiz: the result is already stored, so home picks up the
    // funnel at the Bored/Hobby chooser rather than asking the quiz again.
    router.push("/");
  };

  /**
   * The vector as it stands right now — the running average of every answer
   * given so far, and after the last question, the finished one.
   *
   * Derived from selectedVectors rather than tracked separately, which is what
   * makes the radar behave correctly for free: a SKIP goes through
   * handleSelectOption like a click so it lands here like any other answer,
   * and BACK slices the array so the shape rewinds exactly. Null until the
   * first answer, which the radar draws as its neutral shape.
   *
   * The same two functions the session write uses, in the same order, so the
   * shape on screen can never disagree with the vector that ranks activities.
   */
  const answeredCount = selectedVectors.length;
  const liveVector =
    answeredCount > 0
      ? userVectorFromQuizTotals(totalsFrom(selectedVectors), answeredCount)
      : null;

  if (isFinished && profileType) {
    return (
      <div className="max-w-2xl mx-auto p-8 bg-white rounded-2xl shadow-xl border border-gray-100 text-center animate-in fade-in zoom-in duration-500">
        <div className="inline-block px-4 py-1.5 rounded-full bg-indigo-100 text-indigo-800 text-sm font-bold tracking-wider uppercase mb-6">
          Your Profile
        </div>

        {/*
          THE PAYOFF. The shape the user has been watching build, now at full
          size and labelled. It replaces nothing — the numeric vector tiles
          that used to sit here were deleted in the rebalance because they were
          the last rounding in the scoring path, and the card has read as a
          bare paragraph ever since.

          The numbers beside the axes ARE rounded, by radarGeometry's
          labelValue, and that is the only rounding involved: the profile title
          above still comes from determinePersonalityType on the raw sums, and
          the polygon itself is drawn from the unrounded vector.
        */}
        <div className="flex flex-col md:flex-row md:items-center md:text-left gap-6 md:gap-8">
          <div className="shrink-0 self-center">
            <TasteRadar mode="final" vector={liveVector} />
          </div>
          <div className="flex-1">
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-4">{profileType.title}</h2>
            <p className="text-lg text-gray-600 leading-relaxed">
              {profileType.description}
            </p>
          </div>
        </div>

        <button
          onClick={handleContinue}
          className="w-full sm:w-auto mt-8 px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors shadow-lg shadow-indigo-200"
        >
          Find My Perfect Activities →
        </button>
      </div>
    );
  }

  const question = personalityQuestions[currentStep];
  const progress = Math.round((currentStep / personalityQuestions.length) * 100);

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-2xl shadow-xl border border-gray-100 transition-all relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1.5 bg-gray-100">
        <div
          className="h-full bg-indigo-600 transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mb-8 mt-2">
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs font-bold tracking-wider text-indigo-600 uppercase">
            Question {currentStep + 1} of {personalityQuestions.length}
          </span>
          <div className="flex items-center gap-4">
            {currentStep > 0 && (
              <button
                onClick={handleBack}
                className="text-sm font-semibold text-gray-400 hover:text-gray-900 transition-colors"
              >
                ← Back
              </button>
            )}
            <button
              onClick={handleSkip}
              title="Picks one at random and moves on"
              className="text-sm font-semibold text-gray-400 hover:text-indigo-600 transition-colors"
            >
              Skip →
            </button>
          </div>
        </div>
        {/*
          The radar sits OUTSIDE the keyed wrapper below on purpose. Keying it
          to currentStep would remount it on every question, throwing away the
          in-flight morph and making the shape jump instead of reshape.
        */}
        <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-6 mt-2">
          <div className="flex-1 order-2 md:order-1">
            <h2
              key={currentStep}
              className={`text-2xl font-bold text-gray-900 leading-snug animate-in fade-in duration-300 ${
                direction === 1 ? "slide-in-from-right-4" : "slide-in-from-left-4"
              }`}
            >
              {question.scenario}
            </h2>
            {currentStep === 0 && (
              <p className="text-sm text-indigo-500 font-semibold mt-3">
                Every answer reshapes your taste map.
              </p>
            )}
          </div>

          <div className="shrink-0 self-center order-1 md:order-2">
            <TasteRadar mode="building" vector={liveVector} />
          </div>
        </div>
      </div>

      <div
        key={currentStep}
        className={`space-y-4 animate-in fade-in duration-300 ${
          direction === 1 ? "slide-in-from-right-4" : "slide-in-from-left-4"
        }`}
      >
        {question.options.map((option, index) => (
          <button
            key={index}
            onClick={() => handleSelectOption(option.vector)}
            className="w-full text-left p-5 rounded-xl border-2 border-gray-100 hover:border-indigo-600 hover:bg-indigo-50/50 transition-all group flex flex-col"
          >
            <span className="font-semibold text-lg text-gray-800 group-hover:text-indigo-900">
              {option.label}
            </span>
            <span className="text-sm text-gray-500 mt-1">
              {option.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
