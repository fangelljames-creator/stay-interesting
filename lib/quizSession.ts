/**
 * The personality quiz result for the current browser tab.
 *
 * Deliberately sessionStorage and nothing else. No database table, no
 * localStorage: the result survives navigation and refresh within a tab and
 * dies with it, so every fresh visit retakes the quiz. Retaking is a feature,
 * not a cost — moods change, and a stale vector would quietly mismatch someone
 * for as long as it lived.
 *
 * WHAT IS STORED
 *   The raw per-axis sums plus the number of questions answered, NOT a
 *   pre-divided vector. userVectorFromQuizTotals in lib/matchActivities.ts is
 *   the single place that division happens, and it is the thing that enforces
 *   the no-rounding rule. Storing totals keeps it that way; storing a divided
 *   vector would invite a second, subtly different conversion to appear.
 */
// Relative rather than the "@/" alias: this is a sibling in the same directory,
// and the alias is for imports that cross out of a directory (app/ reaching into
// lib/, as in "@/lib/supabaseClient").
import { isValidVector, userVectorFromQuizTotals } from "./matchActivities";

/**
 * Versioned so a future shape change cannot poison a tab that still holds the
 * old one. Bump the suffix and old values are ignored rather than misread.
 */
export const QUIZ_SESSION_KEY = "si_quiz_v1";

export interface QuizSession {
  /** Raw per-axis sums across the answered questions. 7 entries, axis order fixed. */
  totals: number[];
  /** How many questions fed those sums — the divisor for the user vector. */
  questionCount: number;
  /** How many answers were shuffled by the Skip button. */
  skipped: number;
  /** ISO timestamp. Diagnostics only; nothing branches on it. */
  savedAt: string;
}

/** True when `value` has the exact shape a QuizSession must have to be usable. */
function isQuizSession(value: unknown): value is QuizSession {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<QuizSession>;
  return (
    isValidVector(candidate.totals) &&
    typeof candidate.questionCount === "number" &&
    Number.isFinite(candidate.questionCount) &&
    candidate.questionCount > 0 &&
    typeof candidate.skipped === "number" &&
    Number.isFinite(candidate.skipped) &&
    candidate.skipped >= 0
  );
}

/**
 * Reads the current tab's quiz result, or null if there isn't a usable one.
 *
 * Returns null rather than throwing on every failure path — server render,
 * storage disabled, absent key, malformed JSON, wrong shape. The caller's
 * fallback for null is "send them to the quiz", which is a fine outcome for
 * all of them and a much better one than a crashed page.
 */
export function readQuizSession(): QuizSession | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(QUIZ_SESSION_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    return isQuizSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Stores a quiz result for this tab. Silently does nothing if storage is
 * unavailable — a private window with storage blocked should still be able to
 * take the quiz, it just won't remember the answer past the current render.
 */
export function writeQuizSession(session: Omit<QuizSession, "savedAt">): void {
  if (typeof window === "undefined") return;

  try {
    const payload: QuizSession = { ...session, savedAt: new Date().toISOString() };
    window.sessionStorage.setItem(QUIZ_SESSION_KEY, JSON.stringify(payload));
  } catch {
    // Storage full or blocked. Not worth interrupting the user over.
  }
}

/** Forgets this tab's quiz result. Used by the "Retake the quiz" links. */
export function clearQuizSession(): void {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.removeItem(QUIZ_SESSION_KEY);
  } catch {
    // Nothing useful to do if storage is unavailable.
  }
}

/**
 * The stored result as a vector on the activities' own 1-10 scale, ready for
 * rankActivities. Unrounded, by way of userVectorFromQuizTotals.
 */
export function sessionUserVector(session: QuizSession): number[] {
  return userVectorFromQuizTotals(session.totals, session.questionCount);
}
