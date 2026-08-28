"use client";

import { useEffect, useRef, useState } from "react";
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

  /**
   * The options list is its own scroll region (see the render), so it carries
   * its own scroll position — and without this, a question answered after
   * scrolling down would hand the NEXT question that same offset, opening it
   * halfway down its own options. The page-level reset in app/page.tsx cannot
   * reach this: the window never scrolls here, this element does.
   *
   * The ref is on the scroll container rather than on the keyed inner wrapper
   * precisely so it survives the question change; a node that remounts every
   * step would be a fresh element with scrollTop 0 that this never had to fix,
   * but it would also throw away the entrance animation's stability.
   */
  const optionsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    optionsRef.current?.scrollTo({ top: 0 });
  }, [currentStep]);

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
      <div className="max-w-2xl w-full mx-auto flex min-h-0 flex-1 flex-col p-4 tall:p-6 taller:p-8 bg-white rounded-2xl shadow-xl border border-gray-100 text-center animate-in fade-in zoom-in duration-500">
        {/*
          The card is a flex column so the CTA can sit OUTSIDE the scroll
          region below and stay on screen. The type descriptions vary a lot in
          length, and the longest of them on a short viewport is the one case
          where this card cannot fit — scrolling the copy while "Find My
          Perfect Activities" stays put is much better than pushing the button
          off the bottom of the screen.
        */}
        <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="inline-block px-3 sm:px-4 py-1 tall:py-1.5 rounded-full bg-indigo-100 text-indigo-800 text-xs sm:text-sm font-bold tracking-wider uppercase mb-3 tall:mb-4 taller:mb-6">
          Your Profile
        </div>

        {/*
          THE PAYOFF. The shape the user has been watching build, now at full
          size and labelled. It replaces nothing — the numeric vector tiles
          that used to sit here were deleted in the rebalance because they were
          the last rounding in the scoring path, and the card has read as a
          bare paragraph ever since.

          NO NUMBER APPEARS ANYWHERE ON THIS CARD, and none is rounded on the
          way to it. The title comes from determinePersonalityType on the raw
          sums; the polygon is drawn from the unrounded vector and normalised
          for display. (An earlier version of this comment described numbers
          beside the axes, rounded by a radarGeometry helper called labelValue.
          Both the numbers and the helper were removed in the same review that
          normalised the chart — a value printed against a normalised polygon
          does not mean what it looks like it means.)

          highlightAxes picks out the axes the profile is actually built from:
          two for a hybrid, one for a pure type, none for the All-Rounder. It is
          emphasis only, so the card and the copy agree about which axes are
          being talked about.
        */}
        <div className="flex flex-col md:flex-row md:items-center md:text-left gap-y-3 tall:gap-y-5 gap-x-0 md:gap-x-8">
          {/*
            The width classes are the whole sizing mechanism, here and
            everywhere else the radar appears. TasteRadar's svg is width:100%
            with its per-mode maxWidth as a CAP, so constraining this wrapper
            shrinks the chart and the cap simply stops binding. Nothing inside
            the component needed changing to make it responsive.
          */}
          <div className="shrink-0 self-center w-40 sm:w-56 md:w-[300px]">
            <TasteRadar mode="final" vector={liveVector} highlightAxes={profileType.axes} />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-gray-900 mb-2 tall:mb-3 taller:mb-4">{profileType.title}</h2>
            <p className="text-sm sm:text-base md:text-lg text-gray-600 leading-relaxed">
              {profileType.description}
            </p>
          </div>
        </div>
        </div>

        <button
          onClick={handleContinue}
          className="shrink-0 w-full sm:w-auto sm:self-center mt-4 tall:mt-6 taller:mt-8 px-8 py-3 tall:py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors shadow-lg shadow-indigo-200"
        >
          Find My Perfect Activities →
        </button>
      </div>
    );
  }

  const question = personalityQuestions[currentStep];
  const progress = Math.round((currentStep / personalityQuestions.length) * 100);

  return (
    /*
      THE CARD IS A FLEX COLUMN THAT FILLS ITS SHELL. A fixed header band and
      a scrollable options region, so the question and the progress bar are
      pinned and only the options can ever move. On a viewport tall enough for
      the whole question — which is the target, including Q4's five options at
      360x640 — the options region simply does not scroll and there is no
      visible difference.

      `min-h-0` is load-bearing on every flex child in this chain. Without it a
      flex item refuses to shrink below its content, the column grows past the
      shell, and the page scrolls again — which is the entire thing this
      layout exists to prevent.
    */
    <div className="max-w-2xl w-full mx-auto flex min-h-0 flex-1 flex-col p-3 tall:p-4 taller:p-6 bg-white rounded-2xl shadow-xl border border-gray-100 transition-all relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1.5 bg-gray-100">
        <div
          className="h-full bg-indigo-600 transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="shrink-0 mb-2 tall:mb-4 taller:mb-6 mt-2">
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
        {/*
          THE RADAR SITS BESIDE THE QUESTION AT EVERY WIDTH NOW. It used to be
          `flex-col` with `order-1` below `md`, which put a 132px chart plus its
          gap ABOVE the question — about 148px of the most valuable space on the
          screen, before the user had read a word. Beside the question instead,
          it costs only the difference between a 2-3 line question block and a
          64px chart, which is close to nothing.

          It is smaller on a phone but not by much less than it can afford:
          `building` mode draws no labels, so a 64px chart is still legible AS A
          SHAPE, which is all this instance has to be. (The hero's `demo` radar
          is the one that cannot shrink — its labels scale with the viewBox. See
          app/page.tsx.)
        */}
        <div className="flex flex-row items-start gap-3 md:gap-6 mt-2">
          <div className="flex-1 min-w-0">
            <h2
              key={currentStep}
              className={`text-base sm:text-xl md:text-2xl font-bold text-gray-900 leading-snug animate-in fade-in duration-300 ${
                direction === 1 ? "slide-in-from-right-4" : "slide-in-from-left-4"
              }`}
            >
              {question.scenario}
            </h2>
            {currentStep === 0 && (
              <p className="text-xs sm:text-sm text-indigo-500 font-semibold mt-2 sm:mt-3">
                Every answer reshapes your taste map.
              </p>
            )}
          </div>

          <div className="shrink-0 self-center w-16 sm:w-24 md:w-28">
            <TasteRadar mode="building" vector={liveVector} />
          </div>
        </div>
      </div>

      {/*
        The scroll region. `overflow-y-auto`, not `scroll`, so no scrollbar and
        no scroll exists at all when the options fit — which is the intended
        state on every viewport at or above 360x640, Q4's five options
        included. Below that it degrades to scrolling the list rather than the
        page, which is the documented floor behaviour.

        The keyed wrapper is INSIDE this element rather than being this element:
        the ref above resets scrollTop on every question change, and it needs a
        node that survives the change to do it.

        `-mx-1 px-1` gives the option cards' focus rings and hover borders room
        to breathe without being clipped by the scroll container's edge.
      */}
      <div ref={optionsRef} className="min-h-0 flex-1 overflow-y-auto -mx-1 px-1">
        <div
          key={currentStep}
          className={`space-y-1.5 tall:space-y-2 taller:space-y-4 animate-in fade-in duration-300 ${
            direction === 1 ? "slide-in-from-right-4" : "slide-in-from-left-4"
          }`}
        >
          {question.options.map((option, index) => (
            <button
              key={index}
              onClick={() => handleSelectOption(option.vector)}
              /*
                p-2.5 at the base tier is MEASURED, not a taste call. At 360x640
                the header band leaves the options region 411px and Q4's five
                options came to 431 at p-3 — 20px over, which is one small
                internal scroll on the question that most needs to be seen
                whole. The 2px per side recovers exactly that, and the gap and
                the band's margin give it slack rather than landing on the
                number.

                The tiers are HEIGHT, not width. At `sm`/`md` a 1440x900 laptop
                took p-5 and overflowed by 151px; a 900px-tall viewport has less
                room than a 844px-tall phone once the desktop's larger heading,
                footer and page padding are paid for.
              */
              className="w-full text-left p-2.5 tall:p-3 taller:p-5 rounded-xl border-2 border-gray-100 hover:border-indigo-600 hover:bg-indigo-50/50 transition-all group flex flex-col"
            >
              <span className="font-semibold text-sm tall:text-base taller:text-lg text-gray-800 group-hover:text-indigo-900">
                {option.label}
              </span>
              {/*
                COMPRESSED, NEVER CLAMPED. The descriptions carry the actual
                meaning of each option — the labels alone are too terse to
                choose between — so they shrink with the type scale and wrap to
                as many lines as they need. No line-clamp, no truncation. The
                longest of them (Q4's "Sketch your way in", 111 characters) is
                what the whole height budget was measured against.
              */}
              <span className="text-xs tall:text-sm text-gray-500 mt-0.5 tall:mt-1 leading-snug">
                {option.description}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
