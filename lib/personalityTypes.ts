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
  title: string;
  description: string;
}

/**
 * The dominant axis of `vector` decides the profile. `vector` is the RAW
 * per-axis sums across the answered questions — not averages.
 */
export function determinePersonalityType(vector: number[]): PersonalityType {
  const traits = AXES;
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
        description: "You chase intensity and excitement. Whether it's high-stakes gaming or intense activities, you want something that keeps you on the edge of your seat."
      };
    default:
      return {
        title: "The Balanced Generalist",
        description: "You are highly adaptable, finding joy across a wide spectrum of physical, mental, and social activities."
      };
  }
}
