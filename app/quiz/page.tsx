import PersonalityQuiz from "../../components/PersonalityQuiz";
import { personalityQuestions } from "../../data/personalityQuiz";

export default function QuizPage() {
  return (
    /*
      The same fitted shell the funnel uses on app/page.tsx: a fixed-height
      flex column, so the quiz card fills what is left and scrolls its own
      options rather than the page. `100dvh` and not `vh` — a mobile URL bar
      collapsing must not leave the stage short.

      This route is the standalone way into the quiz, so it has to hold the
      viewport rule as firmly as the funnel does; a card that fits inside the
      funnel and overflows here would be the same bug with a different door.

      ⚠️ IT IS TIGHTER THAN THE FUNNEL BECAUSE IT PAYS FOR MORE. The funnel
      gives the quiz a 26px wordmark band; this page gives it a title and a
      subtitle, which measured 146px at 360x640 and put Q4's five options 56px
      over. Hence the heading block compressing hard, and the subtitle below.
    */
    <main className="h-[100dvh] overflow-hidden bg-gray-50 flex flex-col py-3 tall:py-6 taller:py-16 px-3 sm:px-4">
      <div className="shrink-0 text-center mb-3 tall:mb-5 taller:mb-10">
        <h1 className="text-lg tall:text-2xl taller:text-4xl font-extrabold text-gray-900">Find Your Flow</h1>
        {/*
          ⚠️ HIDDEN BELOW THE `tall` TIER, and this is the one place in the
          branch where something readable is dropped rather than compressed.
          It is this page's own preamble rather than any part of the quiz — the
          8 questions, their options and every option description are all still
          whole — and on a 640px phone the choice is between this sentence and
          the fifth option of Q4 being on screen. The option wins. It comes
          back at 800px of height.
        */}
        <p className="hidden tall:block text-sm taller:text-base text-gray-600 mt-2 taller:mt-3 max-w-lg mx-auto">
          Answer {personalityQuestions.length} quick scenarios to help us understand how you like to spend your time. No wrong answers.
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <PersonalityQuiz />
      </div>
    </main>
  );
}
