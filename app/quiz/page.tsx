import PersonalityQuiz from "../../components/PersonalityQuiz";
import { personalityQuestions } from "../../data/personalityQuiz";

export default function QuizPage() {
  return (
    <main className="min-h-screen bg-gray-50 py-16 px-4">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-extrabold text-gray-900">Find Your Flow</h1>
        <p className="text-gray-600 mt-3 max-w-lg mx-auto">
          Answer {personalityQuestions.length} quick scenarios to help us understand how you like to spend your time. No wrong answers.
        </p>
      </div>
      
      <PersonalityQuiz />
    </main>
  );
}