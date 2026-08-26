# Quiz vector balance — AFTER the rebalance

Generated on the `vector-rebalance` branch after stage 3 (the fifth Q4 option) and stage 4 (every
vector re-scored against the rubric). The BEFORE half is `data/vector-rebalance-before.md`; the
per-score reasoning is `data/vector-rescore-justifications.md`.

## Gate verdict — 4 of 5 pass, up from 2 of 5

| Gate | Before | After |
|---|---|---|
| All 7 purist tests pass | **PASS** 7/7 | **PASS** 7/7 |
| No axis floor > 2.0 | **FAIL** — Novelty 2.25, Stimulation 2.88 | **PASS** — highest 1.88 |
| Every axis ceiling >= 7.0 | **FAIL** — Creative 6.25, Analytical 6.63 | **FAIL** — Energy 6.88, Novelty 6.50 |
| Every axis discriminated in >= 4 questions | **PASS** — lowest 6 | **PASS** — lowest 6 |
| Tie rate <= 10% | **FAIL** — 10.05% | **PASS** — 8.57% |

## Per-axis, before -> after

| Axis | floor (gate <= 2.0) | pool avg | ceiling (gate >= 7.0) |
|---|---|---|---|
| **Social** | 1.38 -> 1.12 PASS | 4.09 -> 3.96 | 8.12 -> 8.25 PASS |
| **Energy** | 1.62 -> 1.38 PASS | 4.22 -> 3.51 | 7.88 -> 6.88 **FAIL** |
| **Creative** | 1.62 -> 1.00 PASS | 3.19 -> 2.76 | 6.25 -> 7.00 PASS |
| **Analytical** | 2.00 -> 1.50 PASS | 4.03 -> 3.64 | 6.62 -> 7.00 PASS |
| **Outdoors** | 1.38 -> 1.12 PASS | 3.72 -> 3.15 | 7.25 -> 7.25 PASS |
| **Novelty** | 2.25 -> 1.88 PASS | 4.59 -> 4.08 | 7.00 -> 6.50 **FAIL** |
| **Stimulation** | 2.88 -> 1.50 PASS | 5.03 -> 3.80 | 7.75 -> 7.12 PASS |

Every floor fell. Stimulation's fell furthest — 2.88 → 1.50 — because for the first time options
that are explicitly calm are scored at the 1 the rubric gives them. Nothing anywhere had been scored
1 on Stimulation before.

## ⚠️ The remaining failure is not a scoring problem

**Energy 6.88 and Novelty 6.50.** Neither can be fixed by re-scoring, and both were *concealed* by
the old numbers rather than caused by the new ones.

A ceiling is the mean of the best option available for that axis in each question. It is capped by
the questions that contain no strong option at all:

```
Energy    Q1  9  Rally the group                    Novelty   Q1  4  Disappear into a project  <-- caps
          Q2  4  Make something with your hands <--           Q2  7  Make new plans on the spot
          Q3  4  Something that scares you      <--           Q3  9  Something that scares you
          Q4  3  Push straight through it       <--           Q4  3  Step away from it         <-- caps
          Q5  8  In sync with a team                          Q5  5  A live, open debate
          Q6 10  A demanding physical sport                   Q6  9  A language and its culture
          Q7 10  Physical exhaustion                          Q7  5  Total isolation in nature
          Q8  7  Only if it's outdoors                        Q8 10  Immediately in
          = 55/8 = 6.88   (needs 56)                          = 52/8 = 6.50   (needs 56)
```

**Q3 (spending £100) and Q4 (approaching a puzzle) contain no physical option. Q1 (Saturday
instinct) and Q4 contain no novelty-seeking option.** That is a gap in the question set, not in the
scoring.

**Both ceilings passed before only because of side-effect scores that stage 4 removed:**

- Novelty's old ceiling was exactly 7.00, propped up by `Step away from it` at Novelty 6 (now 3 —
  waiting is the least novel move available) and `Total isolation in nature` at 6 (now 5).
- Energy's old 7.88 was propped up by `Push straight through it` at Energy 7 (now 3 — "grind" reads
  physical, but the described behaviour is a person sitting at a problem) and `Something that scares
  you a little` at 7 (now 4 — nothing in it says physical).

So the gate is doing its job: it now reports a real hole that the inflated scores hid. Energy is
**one point** short of the threshold; Novelty is **four**.

**Not forced, deliberately.** One honest-looking point exists — `Only if it's outdoors` could be
argued from Energy 7 to 8 — and taking it would clear the Energy gate exactly. Making that change
*because* a gate failed, at exactly the size required, is the behaviour this whole branch exists to
remove. It is left at 7. Novelty cannot be closed at all without re-inflating what stage 4 deflated.

**The fix, when wanted, is content**: a physical option in Q3, and a novelty-seeking option in Q1 or
Q4 — the same move that fixed Creative, whose ceiling went 6.25 → 7.00 once Q4 gained an option that
genuinely asked about it.

## ⚠️ What the smoke alarm now says

The walk shares are DIAGNOSTIC and were not targeted. They are reported because they are evidence.

| Axis | before | after |
|---|---|---|
| Stimulation | 36.7% | 8.4% |
| Social | 10.3% | **27.2%** |
| Novelty | 17.6% | 20.0% |
| Analytical | 13.7% | 19.2% |
| Energy | 12.0% | 10.4% |
| Outdoors | 6.1% | 8.2% |
| Creative | 3.6% | 6.6% |

The 36.7% Stimulation distortion is gone. **Social is now the outlier at 27.2%**, and it is worth
being precise about why: Social's own average barely moved (4.09 → 3.96). It did not rise — every
other axis fell as its side-effect points were removed. Social had been scored on described behaviour
all along, and it has the widest honest range in this question set (floor 1.12, ceiling 8.25).

Whether that is a further defect or simply what these eight scenarios ask about is a question for the
next pass. **It is not something to fix by lowering Social scores that are individually correct** —
that is scoring the report instead of scoring the behaviour.

Note also that the path count changed from 65,536 to 81,920 when Q4 gained a fifth option, so every
share above has a shifted denominator before any re-scoring is considered.

## Full report

```
Parsed 8 questions, 33 options total.
Option counts per question: 4, 4, 4, 5, 4, 4, 4, 4

(a) PURIST TEST — pick the max-X option in every question; X must win
    HARD PASS/FAIL. This is the standing acceptance gate.

    PASS  Social       -> Social       [66, 40, 13, 19, 26, 37, 44]
    PASS  Energy       -> Energy       [39, 55, 16, 18, 33, 32, 50]
    PASS  Creative     -> Creative     [21, 22, 56, 27, 10, 28, 21]
    PASS  Analytical   -> Analytical   [29, 13, 14, 56, 20, 36, 22]
    PASS  Outdoors     -> Outdoors     [29, 37, 13, 16, 58, 38, 27]
    PASS  Novelty      -> Novelty      [39, 16, 20, 22, 25, 52, 37]
    PASS  Stimulation  -> Stimulation  [45, 49, 9, 20, 26, 34, 57]

    7/7 purist tests pass.


(b) NEAR-PURIST — purist in all but one question (report only)

    Social         25/25  100%   holds everywhere
    Energy         21/25   84%   loses to: Stimulation 4
    Creative       25/25  100%   holds everywhere
    Analytical     25/25  100%   holds everywhere
    Outdoors       25/25  100%   holds everywhere
    Novelty        25/25  100%   holds everywhere
    Stimulation    24/25   96%   loses to: Energy 1


(c) PER-AXIS REACHABLE SCORE (average scale, as the user vector sees it)

    Axis          floor    avg  ceiling   range   gates
    Social         1.13   3.96     8.25    7.13   ok
    Energy         1.38   3.51     6.88    5.50   CEILING < 7.0
    Creative       1.00   2.76     7.00    6.00   ok
    Analytical     1.50   3.64     7.00    5.50   ok
    Outdoors       1.13   3.15     7.25    6.13   ok
    Novelty        1.88   4.08     6.50    4.63   CEILING < 7.0
    Stimulation    1.50   3.80     7.13    5.63   ok


(d) PER-QUESTION SPREAD (max - min per axis; >= 3 counts as discriminating)

    Q     Soci  Ener  Crea  Anal  Outd  Nove  Stim   options
    1        8     8     8     9     7    2.     5   4
    2        9     3     7     6    2.     4     5   4
    3        6    2.     4     4     9     8     9   4
    4        7    2.     7     8    1.    1.     3   5
    5        8     7     9     8     4     3     7   4
    6        6     9     8     4     9     6     6   4
    7        9     8     4    0.     9     4     4   4
    8        4     5    1.     5     8     9     6   4

    (a trailing "." marks a spread below 3)

    ok    Social       discriminated in 8/8 questions
    ok    Energy       discriminated in 6/8 questions
    ok    Creative     discriminated in 7/8 questions
    ok    Analytical   discriminated in 7/8 questions
    ok    Outdoors     discriminated in 6/8 questions
    ok    Novelty      discriminated in 6/8 questions
    ok    Stimulation  discriminated in 8/8 questions


(e/f) EXHAUSTIVE WALK — 81,920 possible answer paths

    (e) TIE RATE — 2+ axes share the top raw sum, resolved by array order

        7,019 of 81,920 paths (8.57%)   gate: <= 10.00%   ok
        superseded round-then-judge scheme, for comparison: 49.96%

    (f) WALK SHARES — ⚠️  DIAGNOSTIC ONLY. NOT A GATE. NEVER A TARGET.

        Axis             paths   share   won on a tie
        Social          22,320   27.2%     2,807  ##############
        Novelty         16,371   20.0%       579  ##########
        Analytical      15,730   19.2%     1,209  ##########
        Energy           8,521   10.4%     1,356  #####
        Stimulation      6,848    8.4%         0  ####
        Outdoors         6,729    8.2%       466  ####
        Creative         5,401    6.6%       602  ###

        Even split would be 14.3% each.

--------------------------------------------------------------------------

GATES

  PASS  All 7 purist tests pass                        7/7
  PASS  No axis floor > 2.0                            highest is 1.88
  FAIL  Every axis ceiling >= 7.0                      Energy 6.88, Novelty 6.50
  PASS  Every axis discriminated in >= 4 questions     lowest is 6
  PASS  Tie rate <= 10.0%                              8.57%

  4/5 gates pass.

--------------------------------------------------------------------------

Purist test passes. 1 reported gate(s) still failing:
  - Every axis ceiling >= 7.0 (Energy 6.88, Novelty 6.50)
```
