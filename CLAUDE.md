@AGENTS.md

# Personality quiz scoring

The dominant axis in `components/PersonalityQuiz.tsx` is determined from the **raw
per-axis sums**, never the rounded averages. Rounding is display-only, for the vector
tiles in the results card.

Judging on the rounded averages collapsed distinct scores onto the same integer and left
**58% of all answer paths tied** at the top. `determinePersonalityType` breaks ties with
`indexOf`, so every one of those went to whichever axis sat earliest in the `traits`
array — `Social` at index 0 was winning most of its results on array position, and
`Stimulation` at index 6 could never win a tie at all. Judging on the raw sums drops the
tie rate to 10%.

Two consequences to keep in mind:

- Don't reintroduce rounding, bucketing, or any other precision loss upstream of the
  argmax. It silently re-creates the tie problem.
- The `traits` array order is still a real tiebreaker for the remaining 10%. Reordering
  it changes results without touching a vector.

`scripts/analyze-quiz-balance.mjs` measures this — it walks every possible answer
combination and reports the tie rate and profile distribution. Run it after any change to
the vectors in `data/personalityQuiz.ts` or to the scoring itself. It mirrors the scoring
logic by hand, so it goes stale if the component changes and must be updated alongside it.
