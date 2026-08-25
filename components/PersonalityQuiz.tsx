"use client";

import { useState } from "react";
import { personalityQuestions } from "../data/personalityQuiz";

export default function PersonalityQuiz() {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedVectors, setSelectedVectors] = useState<number[][]>([]);
  const [isFinished, setIsFinished] = useState(false);
  const [finalVector, setFinalVector] = useState<number[] | null>(null);
  
  const [profileType, setProfileType] = useState<{title: string, description: string} | null>(null);

  // Expecting exactly 7 numbers now
  const handleSelectOption = (vector: [number, number, number, number, number, number, number]) => {
    const newVectors = [...selectedVectors, vector];
    
    if (currentStep < personalityQuestions.length - 1) {
      setSelectedVectors(newVectors);
      setCurrentStep(currentStep + 1);
    } else {
      calculateFinalProfile(newVectors);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      setSelectedVectors(selectedVectors.slice(0, -1));
    }
  };

  // Takes the raw per-axis sums, not the rounded averages -- see calculateFinalProfile.
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

  const calculateFinalProfile = (allVectors: number[][]) => {
    const numQuestions = allVectors.length;
    // We now have 7 zeroes
    const totals = [0, 0, 0, 0, 0, 0, 0]; 

    allVectors.forEach((vec) => {
      // Loop counts up to 7
      for (let i = 0; i < 7; i++) {
        totals[i] += vec[i];
      }
    });

    // Rounding is for display only. Picking the dominant axis from the rounded
    // averages collapsed distinct scores onto the same integer and left ~58% of
    // answer paths tied at the top, and determinePersonalityType breaks ties with
    // indexOf -- so those all went to whichever axis sat earliest in the traits
    // array. Judging on the raw sums keeps the full precision of the answers.
    const averageVector = totals.map((total) => Math.round(total / numQuestions));
    setFinalVector(averageVector);

    const type = determinePersonalityType(totals);
    setProfileType(type);
    
    setIsFinished(true);
  };

  if (isFinished && finalVector && profileType) {
    return (
      <div className="max-w-2xl mx-auto p-8 bg-white rounded-2xl shadow-xl border border-gray-100 text-center animate-in fade-in zoom-in duration-500">
        <div className="inline-block px-4 py-1.5 rounded-full bg-indigo-100 text-indigo-800 text-sm font-bold tracking-wider uppercase mb-6">
          Your Profile
        </div>
        <h2 className="text-4xl font-extrabold text-gray-900 mb-4">{profileType.title}</h2>
        <p className="text-lg text-gray-600 mb-8 leading-relaxed">
          {profileType.description}
        </p>
        
        <div className="bg-gray-50 border border-gray-100 p-5 rounded-xl mb-8">
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Your Unique Vector</p>
          <div className="flex justify-center gap-2 flex-wrap">
            {["Social", "Energy", "Creative", "Analytical", "Outdoors", "Novelty", "Stimulation"].map((trait, idx) => (
              <div key={trait} className="flex flex-col items-center bg-white px-3 py-2 rounded-lg shadow-sm border border-gray-200 min-w-[80px]">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">{trait}</span>
                <span className="text-xl font-black text-indigo-600">{finalVector[idx]}</span>
              </div>
            ))}
          </div>
        </div>

        <button className="w-full sm:w-auto px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors shadow-lg shadow-indigo-200">
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
          {currentStep > 0 && (
            <button
              onClick={handleBack}
              className="text-sm font-semibold text-gray-400 hover:text-gray-900 transition-colors"
            >
              ← Back
            </button>
          )}
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