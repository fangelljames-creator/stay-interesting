// The 7 axes: [Social, Energy, Creative, Analytical, Outdoors, Novelty, Stimulation]
// Scores range from 1 (very low) to 10 (very high)

export interface QuizOption {
  label: string;
  description: string;
  vector: [number, number, number, number, number, number, number];
}

export interface QuizQuestion {
  id: number;
  scenario: string;
  options: QuizOption[];
}

export const personalityQuestions: QuizQuestion[] = [
  {
    id: 1,
    scenario: "It's a completely free Saturday morning. No plans, no obligations. What is your immediate instinct?",
    options: [
      {
        label: "Rally the group",
        description: "Get a crowd together for something loud and physical.",
        vector: [9, 9, 1, 1, 5, 3, 6],
      },
      {
        label: "Disappear into a project",
        description: "Shut the door and lose yourself in a solo creative project.",
        vector: [1, 1, 9, 2, 1, 4, 3],
      },
      {
        label: "Coffee and a puzzle",
        description: "Chess, sudoku, a spreadsheet that needs taming, researching a purchase to death — anything with a right answer at the end.",
        vector: [1, 1, 1, 10, 1, 3, 2],
      },
      {
        label: "Out the door, headphones in",
        description: "A long walk or an easy ride, a podcast on, no destination in mind.",
        vector: [1, 5, 1, 1, 8, 2, 1],
      },
    ],
  },
  {
    id: 2,
    scenario: "Your evening plans just fell through, and the whole night is suddenly yours. What do you actually end up doing?",
    options: [
      {
        label: "Sink into a story",
        description: "Perfect excuse to get lost in something gripping and tense.",
        vector: [1, 1, 1, 2, 1, 5, 3],
      },
      {
        label: "Find something to win",
        description: "A lobby with your mates, ranked games, cards, a pub quiz — anything with a scoreboard.",
        vector: [7, 2, 1, 7, 1, 3, 8],
      },
      {
        label: "Make something with your hands",
        description: "Cook something ambitious, mod or fix a gadget, pick the half-finished project back up.",
        vector: [2, 4, 8, 5, 1, 4, 3],
      },
      {
        label: "Make new plans on the spot",
        description: "Text around, see who's free, end up somewhere you didn't expect.",
        vector: [10, 3, 1, 1, 3, 7, 5],
      },
    ],
  },
  {
    id: 3,
    scenario: "You're given £100 that you must spend on something new today. Where's it going?",
    options: [
      {
        label: "Total comfort, off-grid",
        description: "Gear that makes being away from everything genuinely comfortable.",
        vector: [1, 3, 1, 2, 10, 3, 1],
      },
      {
        label: "Something that scares you a little",
        description: "An experience booked specifically because it's outside your comfort zone.",
        vector: [5, 4, 1, 1, 3, 9, 10],
      },
      {
        label: "A class full of strangers",
        description: "A structured session learning something new, alongside people you've never met.",
        vector: [7, 3, 5, 5, 2, 7, 3],
      },
      {
        label: "More of what you love",
        description: "An upgrade to something you already do regularly at home.",
        vector: [2, 2, 3, 3, 1, 1, 1],
      },
    ],
  },
  {
    id: 4,
    scenario: "You're faced with a genuinely complex puzzle or a broken system. What's your first move?",
    options: [
      {
        label: "Test it piece by piece",
        description: "Isolate one variable at a time until something clicks.",
        vector: [1, 1, 1, 10, 1, 2, 2],
      },
      {
        label: "Step away from it",
        description: "Let it sit for a while — the answer usually comes on its own.",
        vector: [1, 1, 2, 2, 2, 3, 1],
      },
      {
        label: "Push straight through it",
        description: "Grind at it with sheer persistence until it gives.",
        vector: [1, 3, 1, 4, 1, 2, 4],
      },
      {
        label: "Bring someone else in",
        description: "Find whoever has dealt with exactly this before.",
        vector: [8, 1, 1, 5, 1, 2, 2],
      },
      {
        label: "Sketch your way in",
        description: "Diagram it, mock it up, build a rough version — thinking with your hands until the shape of the answer appears.",
        vector: [1, 3, 8, 6, 1, 3, 3],
      },
    ],
  },
  {
    id: 5,
    scenario: "What does your ideal 'flow state' actually feel like?",
    options: [
      {
        label: "In sync with a team",
        description: "Perfectly coordinated with others, mid-action, no one thinking, everyone moving.",
        vector: [9, 8, 2, 2, 5, 3, 8],
      },
      {
        label: "A live, open debate",
        description: "A conversation with real stakes that could go absolutely anywhere.",
        vector: [8, 1, 2, 7, 1, 5, 7],
      },
      {
        label: "Hands moving, alone",
        description: "Shaping or building something from nothing, with no one else around.",
        vector: [1, 2, 10, 2, 1, 3, 2],
      },
      {
        label: "Deep in a problem, alone",
        description: "So absorbed in something logical that the rest of the world goes quiet.",
        vector: [1, 1, 1, 10, 1, 2, 1],
      },
    ],
  },
  {
    id: 6,
    scenario: "You have a full year to dedicate to mastering just one thing. What do you choose?",
    options: [
      {
        label: "A demanding physical sport",
        description: "Training relentlessly, with a team or coach, toward a real peak.",
        vector: [7, 10, 1, 3, 5, 3, 9],
      },
      {
        label: "A language and its culture",
        description: "Total fluency, and everything that comes with actually living it.",
        vector: [7, 1, 3, 7, 2, 9, 3],
      },
      {
        label: "Off-grid survival skills",
        description: "Everything needed to be genuinely self-sufficient, far from anything built.",
        vector: [1, 8, 4, 6, 10, 8, 5],
      },
      {
        label: "A performance art",
        description: "Music, dance, or theatre — built to eventually be shared, not just practiced alone.",
        vector: [6, 5, 9, 4, 1, 5, 5],
      },
    ],
  },
  {
    id: 7,
    scenario: "You've had an incredibly draining, high-stress week. How do you actually recharge?",
    options: [
      {
        label: "Total isolation in nature",
        description: "As far from concrete as possible, with no signal and no agenda.",
        vector: [1, 2, 1, 1, 10, 5, 1],
      },
      {
        label: "Drown it out with people",
        description: "Surround yourself with friends, noise, and laughter until the stress is gone.",
        vector: [10, 3, 1, 1, 2, 2, 4],
      },
      {
        label: "A repetitive, quiet craft",
        description: "Something with your hands that asks for very little thought.",
        vector: [1, 2, 5, 1, 1, 1, 1],
      },
      {
        label: "Physical exhaustion",
        description: "A workout heavy and repetitive enough that thinking just stops.",
        vector: [1, 10, 1, 1, 3, 1, 5],
      },
    ],
  },
  {
    id: 8,
    scenario: "A friend invites you to something you've genuinely never done before, starting in an hour. Your reaction?",
    options: [
      {
        label: "Immediately in",
        description: "The less you know going in, the better.",
        vector: [6, 3, 1, 1, 3, 10, 7],
      },
      {
        label: "Cautiously curious",
        description: "Interested, but you'd want the details before committing.",
        vector: [4, 2, 1, 6, 2, 5, 2],
      },
      {
        label: "Politely decline",
        description: "You already know what you enjoy, and you'd rather do that.",
        vector: [2, 2, 2, 2, 2, 1, 1],
      },
      {
        label: "Only if it's outdoors",
        description: "In, but specifically if it involves being physical and outside.",
        vector: [5, 7, 1, 1, 10, 7, 5],
      },
    ],
  },
];