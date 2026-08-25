"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { personalityQuestions, type QuizOption } from "../data/personalityQuiz";
import { writeQuizSession } from "../lib/quizSession";

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

  const [profileType, setProfileType] = useState<{title: string, description: string} | null>(null);

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
      setCurrentStep(currentStep - 1);
      setSelectedVectors(selectedVectors.slice(0, -1));
      setSkipFlags(skipFlags.slice(0, -1));
    }
  };

  // Takes the raw per-axis sums, not averages -- see calculateFinalProfile.
  const determinePersonalityType = (vector: number[]) => {
    const traits = ["Social", "Energy", "Creative", "Analytical", "Outdoors", "Novelty", "Stimulation"];
    const maxScore = Math.max(...vector);
    const dominantIndex = vector.indexOf(maxScore);
    const dominantTrait = traits[dominantIndex];

    switch (dominantTrait) {
      case "Social":
        return {
          title: "The Social Catalyst",
          description: "You thrive on connection. The best activities for you are those that bring people together, spark conversation, and create shared memories."
        };
      case "Energy":
        return {
          title: "The Dynamic Action-Taker",
          description: "You have physical energy to burn. You prefer getting your heart rate up and challenging your body over sitting still."
        };
      case "Creative":
        return {
          title: "The Meticulous Creator",
          description: "You find peace in expression and craftsmanship. You love the flow state that comes from bringing an idea into reality with precision."
        };
      case "Analytical":
        return {
          title: "The Strategic Architect",
          description: "You see the world as a series of puzzles. You find deep satisfaction in untangling complex systems, optimizing outcomes, and mapping logical strategies."
        };
      case "Outdoors":
        return {
          title: "The Open-Air Explorer",
          description: "You belong outside the four walls of a room. Your ideal state involves fresh air, changing landscapes, and interacting with nature."
        };
      case "Novelty":
        return {
          title: "The Spontaneous Pioneer",
          description: "Routine bores you. You are heavily driven by the desire to try things you've never done before and break out of your comfort zone."
        };
      case "Stimulation":
        return {
          title: "The Thrill Seeker",
          description: "You crave high arousal and excitement. Whether it's high-stakes gaming or intense activities, you want something that keeps you on the edge of your seat."
        };
      default:
        return {
          title: "The Balanced Generalist",
          description: "You are highly adaptable, finding joy across a wide spectrum of physical, mental, and social activities."
        };
    }
  };

  const calculateFinalProfile = (allVectors: number[][], allSkips: boolean[]) => {
    // We now have 7 zeroes
    const totals = [0, 0, 0, 0, 0, 0, 0];

    allVectors.forEach((vec) => {
      // Loop counts up to 7
      for (let i = 0; i < 7; i++) {
        totals[i] += vec[i];
      }
    });

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

  if (isFinished && profileType) {
    return (
      <div className="max-w-2xl mx-auto p-8 bg-white rounded-2xl shadow-xl border border-gray-100 text-center animate-in fade-in zoom-in duration-500">
        <div className="inline-block px-4 py-1.5 rounded-full bg-indigo-100 text-indigo-800 text-sm font-bold tracking-wider uppercase mb-6">
          Your Profile
        </div>
        <h2 className="text-4xl font-extrabold text-gray-900 mb-4">{profileType.title}</h2>
        <p className="text-lg text-gray-600 mb-8 leading-relaxed">
          {profileType.description}
        </p>

        <button
          onClick={handleContinue}
          className="w-full sm:w-auto px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors shadow-lg shadow-indigo-200"
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
        <h2 className="text-2xl font-bold text-gray-900 mt-2 leading-snug">
          {question.scenario}
        </h2>
      </div>

      <div className="space-y-4">
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
