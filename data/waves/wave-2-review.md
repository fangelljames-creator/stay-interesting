# Wave 2 — review

Starvation repair, not topic coverage. Every row is drawn from the idea bank and chosen because its HONEST tags already sit in a confirmed-starved cell. Zero rows were generated - the ~15-row targeted-generation allowance was not needed. Every new row is `free`, because every P1 and P2 cell in Owen's ranking is a free-ceiling cell.

**56 activities for your veto pass**, 8 already vetoed, plus **2 proposed vector corrections** to existing rows.

Nothing here has been written to the seed SQL or the database. Strike anything by adding its
exact title to the `vetoed` array in the wave JSON, or just tell me and I will.

Axis order everywhere: `[Social, Energy, Creative, Analytical, Outdoors, Novelty, Stimulation]`.

## Read this first

### Nothing in the map was degenerate, so the wave is ranked rather than filtered

You asked me to re-audit the classifier if the finding came back mostly degenerate. It came back the other way: **166 plausible, 6 low-frequency, 0 degenerate.**

I applied your test - degenerate means *no honest activity could exist there*, not *none currently does* - and nothing passes it. Every question in both funnels asks an independent fact about somebody's circumstances: how long they have, who is around, what they will spend. None of them can contradict another, so no combination is self-contradictory and every starved cell is a real person. The two low-frequency rules I did write are named and reasoned in `scripts/lib/starvation.mjs`, and they are a priority signal rather than permission to leave a cell empty.

So your ranking did the capping instead. **P1 60 cells, P2 21, P3 91** - and every single P1 and P2 cell is a **free-ceiling** cell, which is why every row in this wave is tagged `free`. That was not a decision I made; it fell out of the map.

### The cost-ceiling accounting is right, and here is the check

Your point 3. A `free` row must count as a survivor in the low-budget and no-limit cells too. Verified by holding every other answer fixed and widening the ceiling: **monotonic over all 344 adjacent pairs, no violations**, and the zero-cells concentrate at the free tier exactly as they should (31 of 57 quick, 21 of 31 hobby).

Non-free starved cells are not evidence against this. They are cells where the other constraints are empty at *any* budget - money cannot buy an activity the catalogue does not contain. The check is now a permanent section of `report-starvation.mjs` rather than something I did once.

### The tag audit is TWO rows, not four, and the repo supplied the evidence

I proposed four. Then I checked the `exertion` tag against the Energy axis across all 134 seeded rows, and they agree everywhere except **exactly two**, both at Energy 4 - when every other row carrying the tag is Energy 5 or above, and no row at Energy 7 or above lacks it.

So `Walk a street you have never walked down` (Energy 5) and `Walk somewhere with a view and take a flask` (Energy 6) sit inside the established convention and I have **withdrawn** them. Cutting them would have been me scoring the report rather than scoring the behaviour. That cross-check is now a permanent non-fatal section of this review file.

**One sequencing trap worth knowing.** Un-tagging `Ten minutes of mobility work` on its own makes things *worse* - 57 zero-cells up to 65 - because it is the only ten-minute indoor exertion row in the catalogue and removing the tag empties that intersection outright. It is only safe shipped alongside the indoor-movement content, which is what this wave is. It must not be split out into its own change later.

### Eight rows are vetoed by the D rule, and the ninth was overruled

The D-aware gate flagged 16 rows sitting within 3.0 of a neighbour and adding no starved cell that neighbour did not already serve. Under the campaign rule those come out, so they are in the wave's `vetoed` array with their reasoning rather than quietly deleted. Named, so the losses are visible:

- **Cloud-watching, flat on your back** - 1.41 from `Watch a sunset start to finish`, which serves all 13 of its cells. Two people lying outside looking up.
- **Learn a basic shuffle-dance step** - 1.73 from `Three salsa steps, solo`, and a third kitchen-dance row behind the seeded `Learn to moonwalk`.
- **Hunt for ghost signs** - 2.83 from `Postbox spotting by royal cipher`, which covers all 24 of its cells. Both are urban historical spotting on a walk.
- **Bag a local peak list** - 2.24 from `Section-hike a coastal path`, which serves all 9 of its cells, and it also crowded the seeded `Hiking and hillwalking`.
- **A deep squat while the kettle boils** - 1.41 from `Follow a fifteen-minute beginner yoga flow`; identical cell set, and the yoga row is the more substantial ten minutes.
- **Walk a timed power mile** - 1.73 from `First-touch drills against a wall`; identical cell set, and dropping it thins an already walk-heavy catalogue.
- **One full cuppa outside** - filled **zero** starved cells. Ten calm free outdoor minutes is the one corner of the quick path that was never short.
- **Speed-walk the supermarket run** - filled **zero** starved cells. `1-hour` outdoor exertion already had survivors.

**Overruled by Owen, 2026-08-28: `Age a hedge by counting its species` stays.** The gate is right on the arithmetic - it fills 6 cells and all 6 sit inside the north-finding row's 16 - and it is still reported as a veto candidate below, which is correct and should stay that way. The override is on two grounds the gate cannot see: spark-tier charm outranks D-economy, and the rotation penalty gives same-cell twins repeat-visit value that a single-run distance measurement does not capture. **Do not re-apply the gate to this row in a later wave.**

### I re-scored thirteen vectors on a second read, and the first pass was the problem

The same-cell report flagged eight pairs of new rows sitting under D while sharing starved cells. In every case the two activities were genuinely different and I had scored them lazily alike on a fast first pass.

The corrections are rubric applications rather than number-chasing: postbox spotting happens on town pavements rather than moorland, so its Outdoors came down; a trig point is a walk to a summit with a payoff, so its Energy and Stimulation went up; genealogy is about people and about assembling a narrative, so its Social and Creative rose while a Linux rebuild went the other way towards pure systems. Two were the side-effect error the rubric exists to catch - `Animal walks across the living room` at Stimulation 6 because it is a hard workout, and `Relearn the cartwheel` at 7 because it feels daring.

After them, **no two new rows on a shared pathway sit within 3.0 of each other.**

### Stimulation did not move, and this wave could not have moved it

It stays at **3 rows of 187** - relatively worse than before, because the denominator grew. Social went 12 to 22 and Outdoors 16 to 27, so the wave did help two of the three thin axes.

The reason is structural rather than an oversight. Every P1 and P2 cell is free-ceiling, and genuinely Stimulation-dominant activities - competition, stakes, adrenaline - are overwhelmingly **paid facility** activities: squash, padel, BJJ, fencing, karting, climbing competitions, a quiz league with a fixture list. All of those are P3. Starvation repair and the Stimulation gap pulled in opposite directions this wave, and starvation won, per your ranking.

The wave carries the free ones that do exist - `Chase a parkrun personal best` at Stimulation 8, `Storytelling and spoken-word nights` at 7 - but both are honestly dominated by Energy and Creative respectively, and pushing them over the line would be exactly the inflation the rubric bans. **This is the brief for wave 3**, which can now afford to spend on the low-budget facility band because P1 and P2 are largely cleared.

### What is left, and what goes on the standing queue

**P1 60 to 9 cells (45 to 4 at zero). P2 21 to 4 (7 to 0 at zero). P3 91 to 12.**

All ten residual zero-cells are accounted for. Six are the low-frequency band - half a day of free indoor exertion, and a club that meets at your house in weekend blocks. The other four are `half a day / get me moving / staying in` at the paid tiers, which in practice means a leisure-centre session: badminton, a swim, a climbing wall. That is P3, it is real, and it goes on the queue for wave 3 rather than being quietly filled here.

**One row was generated**, against the ~15 you allowed: `An obstacle course built from the furniture`. The bank has no honest free, indoor, hour-long, group physical activity, and that cell was P1 sitting at zero. The other 54 rows all came out of the bank, and every drawn title is recorded in a `bank` field that `build-wave.mjs` cross-checks against every prior wave.

## Quick-fix — 34

| # | Title | Pathway | Cost | Vector | Leans |
|---|---|---|---|---|---|
| 1 | Dance flat-out to three songs | quick-fix | free | `5,8,4,1,1,2,6` | Energy |
| 2 | A deck-of-cards workout | quick-fix | free | `3,9,1,3,1,4,6` | Energy |
| 3 | Animal walks across the living room | quick-fix | free | `6,8,2,1,1,7,5` | Energy |
| 4 | Keep a balloon off the floor for five minutes | quick-fix | free | `7,7,1,2,1,4,6` | Social |
| 5 | Follow a fifteen-minute beginner yoga flow | quick-fix | free | `1,6,1,2,1,3,1` | Energy |
| 6 | A commercial-break workout | quick-fix | free | `3,7,1,2,1,5,3` | Energy |
| 7 | Three salsa steps, solo | quick-fix | free | `2,6,4,3,1,6,4` | Energy |
| 8 | A hundred backpack swings | quick-fix | free | `1,9,1,2,3,5,6` | Energy |
| 9 | Stand up from the floor without using your hands | quick-fix | free | `1,6,1,4,1,6,3` | Energy |
| 10 | Behind-the-back throw and catch | quick-fix | free | `3,5,2,4,3,6,4` | Novelty |
| 11 | An obstacle course built from the furniture | quick-fix | free | `7,8,6,3,1,7,6` | Energy |
| 12 | Full-commitment hopscotch | quick-fix | free | `6,7,3,4,7,4,5` | Energy |
| 13 | Relearn the cartwheel on grass | quick-fix | free | `5,8,1,2,8,6,6` | Energy |
| 14 | First-touch drills against a wall | quick-fix | free | `3,7,1,4,7,3,5` | Energy |
| 15 | How far can you walk in exactly fifteen minutes? | quick-fix | free | `4,5,1,5,7,6,3` | Outdoors |
| 16 | Watch a sunset start to finish | quick-fix | free | `4,2,2,2,9,3,1` | Outdoors |
| 17 | Catch tonight's ISS pass | quick-fix | free | `5,2,1,5,9,8,3` | Outdoors |
| 18 | Take a smell walk | quick-fix | free | `3,3,4,3,7,8,2` | Novelty |
| 19 | Find north four ways without a compass | quick-fix | free | `4,2,1,9,8,7,1` | Analytical |
| 20 | Age a hedge by counting its species | quick-fix | free | `4,3,1,8,9,9,1` | Outdoors |
| 21 | A phone-stays-home walk | quick-fix | free | `4,4,1,1,8,5,1` | Outdoors |
| 22 | Storyboard last year's photo album | quick-fix | free | `3,1,6,5,1,3,2` | Creative |
| 23 | Programme a themed trilogy night | quick-fix | free | `7,1,5,4,1,5,3` | Social |
| 24 | The wardrobe truth audit | quick-fix | free | `2,3,2,6,1,3,2` | Analytical |
| 25 | Plan next year's garden on paper | quick-fix | free | `2,2,7,8,2,5,2` | Analytical |
| 26 | Take one inbox to zero | quick-fix | free | `1,1,1,6,1,1,2` | Analytical |
| 27 | Rank your top ten films, definitively | quick-fix | free | `6,1,4,8,1,3,3` | Analytical |
| 28 | Design a no-spend weekend worth having | quick-fix | free | `6,2,6,6,4,6,2` | Social |
| 29 | Find your nearest trig point | quick-fix | free | `4,5,1,6,9,8,4` | Outdoors |
| 30 | Postbox spotting by royal cipher | quick-fix | free | `5,4,1,7,6,9,1` | Novelty |
| 31 | Beachcombing and sea glass | quick-fix+long-term | free | `3,4,3,5,10,6,2` | Outdoors |
| 32 | Three card games you can teach anyone | quick-fix | free | `8,1,2,6,1,4,4` | Social |
| 33 | Count to ten in three new languages | quick-fix | free | `4,1,1,6,1,8,2` | Novelty |
| 34 | Finally understand the offside rule | quick-fix | free | `5,1,1,8,1,6,2` | Analytical |

## Long-term — 23

| # | Title | Pathway | Cost | Vector | Leans |
|---|---|---|---|---|---|
| 1 | Beachcombing and sea glass | quick-fix+long-term | free | `3,4,3,5,10,6,2` | Outdoors |
| 2 | Volunteer at parkrun before you race it | long-term | free | `9,3,1,3,8,5,4` | Social |
| 3 | Chase a parkrun personal best | long-term | free | `7,9,1,5,8,4,8` | Energy |
| 4 | Join the repair cafe | long-term | free | `8,3,4,8,1,7,3` | Social |
| 5 | Litter-picking with a local group | long-term | free | `8,6,1,3,9,4,2` | Outdoors |
| 6 | Dog-walking at an animal shelter | long-term | free | `5,7,1,2,8,5,4` | Outdoors |
| 7 | A book club that actually finishes books | long-term | free | `9,1,3,6,1,4,3` | Social |
| 8 | Become a heritage volunteer guide | long-term | free | `8,3,2,7,4,8,3` | Social |
| 9 | Befriend an isolated neighbour through a charity | long-term | free | `8,1,2,2,1,6,2` | Social |
| 10 | Conservation workdays with a local trust | long-term | free | `8,8,1,5,10,7,3` | Outdoors |
| 11 | Churchyard and monument recording | long-term | free | `5,3,1,8,7,9,1` | Novelty |
| 12 | Adopt a local museum, room by room | long-term | free | `4,2,1,6,1,6,2` | Analytical |
| 13 | Storytelling and spoken-word nights | long-term | free | `8,2,9,4,1,8,7` | Creative |
| 14 | Become a school governor | long-term | free | `8,1,2,9,1,7,3` | Analytical |
| 15 | Propagate and trade houseplant cuttings | long-term | free | `6,2,4,5,2,6,2` | Social |
| 16 | Escape-room puzzles, built for your friends | long-term | free | `8,1,9,9,1,8,6` | Creative |
| 17 | Trace the family tree past 1900 | long-term | free | `5,1,4,8,1,7,3` | Analytical |
| 18 | Resurrect an old laptop with Linux | long-term | free | `1,1,2,10,1,8,2` | Analytical |
| 19 | One tiny game, finished, in Godot | long-term | free | `2,1,9,8,1,8,4` | Creative |
| 20 | Video editing, properly, on free software | long-term | free | `3,1,9,6,1,6,3` | Creative |
| 21 | Section-hike a coastal path | long-term | free | `5,8,1,5,10,7,5` | Outdoors |
| 22 | Natural navigation | long-term | free | `3,4,1,9,10,10,3` | Outdoors |
| 23 | Fossil hunting on the coast | long-term | free | `4,6,1,7,10,8,4` | Outdoors |

## Descriptions and tags

**Dance flat-out to three songs**  
Curtains shut, volume up, three songs end to end with no stopping between them. It is a genuine cardio session disguised as a private disco, and nobody ever has to see it.  
`quick-fix · 10-mins · exertion · inside · at-home · solo · couple · social · free`  
`[5, 8, 4, 1, 1, 2, 6]` leans **Energy**

**A deck-of-cards workout**  
Each suit is an exercise and the number on the card is the reps. Shuffle, turn them over one at a time, and let a pack of cards decide how hard the next twenty minutes are going to be.  
`quick-fix · 10-mins · 1-hour · exertion · inside · at-home · solo · couple · social · free`  
`[3, 9, 1, 3, 1, 4, 6]` leans **Energy**

**Animal walks across the living room**  
Bear crawl to the far wall, crab walk back, then go again without laughing. It is a proper full-body workout that any child in the house will join in with immediately and every adult regrets starting.  
`quick-fix · 10-mins · exertion · inside · at-home · solo · couple · social · free`  
`[6, 8, 2, 1, 1, 7, 5]` leans **Energy**

**Keep a balloon off the floor for five minutes**  
One balloon, five minutes, and the carpet is lava. It is sillier and considerably sweatier than it sounds, and it turns any room with two people in it into a sport.  
`quick-fix · 10-mins · exertion · inside · at-home · solo · couple · social · free`  
`[7, 7, 1, 2, 1, 4, 6]` leans **Social**

**Follow a fifteen-minute beginner yoga flow**  
A mat is optional and a folded towel does the job. Fifteen minutes of following along is enough to find out which side of your body has quietly been doing all of the work.  
`quick-fix · 10-mins · exertion · inside · at-home · solo · free`  
`[1, 6, 1, 2, 1, 3, 1]` leans **Energy**

**A commercial-break workout**  
Pick one show and move every time the adverts come on: press-ups, squats, whatever you can stand. An hour later you have done a surprising amount of exercise and still seen the programme.  
`quick-fix · 1-hour · exertion · inside · at-home · solo · couple · social · free`  
`[3, 7, 1, 2, 1, 5, 3]` leans **Energy**

**Three salsa steps, solo**  
Basic, side, back, counted out loud like nobody is listening. Ten minutes in your own kitchen is the whole difference between dancing at the next wedding and shuffling apologetically near the bar.  
`quick-fix · 10-mins · exertion · inside · at-home · solo · free`  
`[2, 6, 4, 3, 1, 6, 4]` leans **Energy**

**A hundred backpack swings**  
Load a rucksack with books, hinge at the hips, and swing it between your legs and up to chest height. A hundred of those in sets of twenty explains exactly why kettlebells cost money.  
`quick-fix · 10-mins · exertion · inside · outside · at-home · solo · free`  
`[1, 9, 1, 2, 3, 5, 6]` leans **Energy**

**Stand up from the floor without using your hands**  
The sit-to-stand test is a real predictor of how well you are ageing and almost nobody passes it first go. Ten minutes of trying is a workout for muscles you had entirely forgotten about.  
`quick-fix · 10-mins · exertion · inside · at-home · solo · free`  
`[1, 6, 1, 4, 1, 6, 3]` leans **Energy**

**Behind-the-back throw and catch**  
Throw a tennis ball behind your back and catch it in front, ten clean reps in a row. It looks like showing off, feels like neither showing off nor sport, and then suddenly works.  
`quick-fix · 10-mins · exertion · inside · outside · at-home · solo · couple · free`  
`[3, 5, 2, 4, 3, 6, 4]` leans **Novelty**

**An obstacle course built from the furniture**  
Cushions, chairs, a broom across two stools, and a rule that the floor is lava. Building it takes as long as running it, and the timed second lap is where the competitive streak arrives.  
`quick-fix · 1-hour · exertion · inside · at-home · solo · couple · social · free`  
`[7, 8, 6, 3, 1, 7, 6]` leans **Energy** — The wave's only generated row. The bank has no honest free, indoor, hour-long, group physical activity, and that cell is P1 at zero.

**Full-commitment hopscotch**  
Chalk the grid on the pavement properly, all ten squares, and commit to the single-leg landings. Any adult who plays for ten minutes discovers their balance is not what it was in 1994.  
`quick-fix · 10-mins · exertion · outside · solo · couple · social · free`  
`[6, 7, 3, 4, 7, 4, 5]` leans **Energy**

**Relearn the cartwheel on grass**  
Soft ground, low expectations, and somebody on hand to tell you your legs were nowhere near straight. Most people can still just about manage one, and finding out which group you are in takes a minute.  
`quick-fix · 10-mins · exertion · outside · in-nature · solo · couple · social · free`  
`[5, 8, 1, 2, 8, 6, 6]` leans **Energy**

**First-touch drills against a wall**  
Any ball, any wall, both feet, and no goalkeeper to blame. Twenty minutes of this does more for your first touch than a whole game does, which is precisely why nobody bothers.  
`quick-fix · 10-mins · 1-hour · exertion · outside · solo · couple · free`  
`[3, 7, 1, 4, 7, 3, 5]` leans **Energy**

**How far can you walk in exactly fifteen minutes?**  
Set a timer, walk in one direction until it goes off, then find where you got to on a map. It quietly redraws how big you thought your own neighbourhood was.  
`quick-fix · 10-mins · exertion · outside · solo · couple · social · free`  
`[4, 5, 1, 5, 7, 6, 3]` leans **Outdoors**

**Watch a sunset start to finish**  
Phone in your pocket, from the first change of colour to the last. Nobody ever watches the whole thing, and the order the colours arrive in is not the order anyone would guess.  
`quick-fix · 10-mins · 1-hour · outside · in-nature · solo · couple · social · free`  
`[4, 2, 2, 2, 9, 3, 1]` leans **Outdoors**

**Catch tonight's ISS pass**  
Look up when the space station crosses your postcode, stand outside at the right minute, and wave. It takes about four minutes to go over and there are people on board.  
`quick-fix · 10-mins · outside · in-nature · solo · couple · social · free`  
`[5, 2, 1, 5, 9, 8, 3]` leans **Outdoors**

**Take a smell walk**  
One lap of the block, cataloguing five distinct smells and noting where each one starts and stops. It is the sense nobody uses on purpose, and your street turns out to have a map of them.  
`quick-fix · 10-mins · 1-hour · outside · solo · couple · free`  
`[3, 3, 4, 3, 7, 8, 2]` leans **Novelty**

**Find north four ways without a compass**  
The sun, the moss, the satellite dishes, and after dark the stars. Four independent methods that ought to agree with each other, and a genuinely useful thing to know when a phone dies.  
`quick-fix · 10-mins · 1-hour · outside · in-nature · solo · couple · social · free`  
`[4, 2, 1, 9, 8, 7, 1]` leans **Analytical**

**Age a hedge by counting its species**  
Hooper's rule reckons one woody species per thirty-yard stretch is roughly a century of hedge. Count along a lane and you can date a boundary that predates every building near it.  
`quick-fix · 1-hour · outside · in-nature · solo · couple · social · free`  
`[4, 3, 1, 8, 9, 9, 1]` leans **Outdoors**

**A phone-stays-home walk**  
One block is plenty. The distance is not the point; the point is that for once nothing in your pocket can interrupt, and you notice how often you reach for it anyway.  
`quick-fix · 10-mins · 1-hour · outside · solo · couple · social · free`  
`[4, 4, 1, 1, 8, 5, 1]` leans **Outdoors**

**Storyboard last year's photo album**  
Go through a year of camera roll and pick the forty pictures that actually tell the story. It takes a whole afternoon, and the ones you choose are almost never the ones you posted.  
`quick-fix · half-day · inside · at-home · solo · couple · free`  
`[3, 1, 6, 5, 1, 3, 2]` leans **Creative**

**Programme a themed trilogy night**  
Three films with one real thread between them, and a snack matched to each. The programming is half the fun and the whole evening costs nothing you do not already have in the house.  
`quick-fix · half-day · inside · at-home · solo · couple · social · free`  
`[7, 1, 5, 4, 1, 5, 3]` leans **Social**

**The wardrobe truth audit**  
Turn every hanger backwards today; in six months anything still facing the wrong way has not been worn. Setting it up takes an afternoon and settles an argument with yourself permanently.  
`quick-fix · half-day · inside · at-home · solo · couple · free`  
`[2, 3, 2, 6, 1, 3, 2]` leans **Analytical**

**Plan next year's garden on paper**  
Graph paper, a seed catalogue, and the garden you actually have rather than the one you want. Even with no garden yet, an afternoon of this is how people end up on an allotment waiting list.  
`quick-fix · half-day · inside · at-home · solo · couple · free`  
`[2, 2, 7, 8, 2, 5, 2]` leans **Analytical**

**Take one inbox to zero**  
One account, top to bottom, unsubscribing as you go rather than archiving and hoping. It is a genuinely unpleasant afternoon and the quiet afterwards lasts about three months.  
`quick-fix · half-day · inside · at-home · solo · free`  
`[1, 1, 1, 6, 1, 1, 2]` leans **Analytical**

**Rank your top ten films, definitively**  
Not a list of good films but a ranked ten, with the arguments settled and the painful cuts made. Do it with somebody else and you will learn things about them you would rather not know.  
`quick-fix · 1-hour · half-day · inside · at-home · solo · couple · social · free`  
`[6, 1, 4, 8, 1, 3, 3]` leans **Analytical**

**Design a no-spend weekend worth having**  
Zero pounds, a full schedule, and every item something you would genuinely look forward to. The constraint is the exercise: it turns out most of the good weekends were never the expensive ones.  
`quick-fix · half-day · inside · at-home · solo · couple · social · free`  
`[6, 2, 6, 6, 4, 6, 2]` leans **Social**

**Find your nearest trig point**  
Ordnance Survey left concrete pillars and small brass marks all over the country and there is one nearer to you than you think. Finding it is a treasure hunt that comes with an official answer sheet.  
`quick-fix · half-day · outside · in-nature · solo · couple · social · free`  
`[4, 5, 1, 6, 9, 8, 4]` leans **Outdoors**

**Postbox spotting by royal cipher**  
Every British postbox carries the cipher of whoever was on the throne when it was cast, and a few Victorian ones are still in daily use. An afternoon's walk turns your area into a timeline.  
`quick-fix · 1-hour · half-day · outside · solo · couple · social · free`  
`[5, 4, 1, 7, 6, 9, 1]` leans **Novelty**

**Beachcombing and sea glass**  
Work a tideline slowly and keep whatever the sea has finished with: frosted glass, worn pottery, the odd fossil. Weeks of it fills a jar, and the good things only turn up after a storm.  
`quick-fix · half-day · long-term · 1-2-hours-week · outside · in-nature · solo · couple · social · free`  
`[3, 4, 3, 5, 10, 6, 2]` leans **Outdoors** — Carries BOTH pathways honestly - an afternoon on a beach, or a habit built over a year.

**Three card games you can teach anyone**  
Rummy, cheat, and whichever one your family plays badly. Ten minutes each to teach, and it means you are never again the person in the room who cannot join in.  
`quick-fix · 10-mins · 1-hour · inside · at-home · couple · social · free`  
`[8, 1, 2, 6, 1, 4, 4]` leans **Social**

**Count to ten in three new languages**  
Ten minutes gets you counting in three languages you do not speak, which is a party trick and, oddly, the thing that makes a foreign menu stop being frightening.  
`quick-fix · 10-mins · inside · at-home · solo · couple · social · free`  
`[4, 1, 1, 6, 1, 8, 2]` leans **Novelty**

**Finally understand the offside rule**  
Either code, diagrams allowed, ten minutes with somebody who already knows. It is not actually complicated, and afterwards you can stop nodding vaguely during matches.  
`quick-fix · 10-mins · inside · at-home · solo · couple · social · free`  
`[5, 1, 1, 8, 1, 6, 2]` leans **Analytical**

**Volunteer at parkrun before you race it**  
Marshalling a corner, scanning barcodes or handing out finish tokens, every Saturday morning. It is free, it is genuinely needed, and it is the least intimidating way into a running club there is.  
`long-term · 1-2-hours-week · outside · facility · in-nature · solo · couple · social · free`  
`[9, 3, 1, 3, 8, 5, 4]` leans **Social**

**Chase a parkrun personal best**  
The same five kilometres, the same course, every Saturday, and a time that is yours to beat. It is free, weirdly emotional, and the gap between your first run and your tenth is bigger than you expect.  
`long-term · 1-2-hours-week · exertion · outside · facility · in-nature · solo · social · free`  
`[7, 9, 1, 5, 8, 4, 8]` leans **Energy**

**Join the repair cafe**  
A monthly session where people bring broken things and other people fix them, for nothing. Turn up as the fixer or the apprentice; either way you leave knowing something you did not that morning.  
`long-term · 1-2-hours-week · inside · facility · social · free`  
`[8, 3, 4, 8, 1, 7, 3]` leans **Social**

**Litter-picking with a local group**  
Gloves, grabbers, and a river bank or verge that looks completely different two hours later. Councils lend the kit free, and the before-and-after photographs are more satisfying than they should be.  
`long-term · 1-2-hours-week · exertion · outside · facility · in-nature · social · free`  
`[8, 6, 1, 3, 9, 4, 2]` leans **Outdoors**

**Dog-walking at an animal shelter**  
Shelters are permanently short of people who will walk dogs and the induction takes an afternoon. You get the exercise, the dog gets the exercise, and neither of you has to talk about work.  
`long-term · 1-2-hours-week · 5-hours-week · exertion · outside · facility · in-nature · solo · social · free`  
`[5, 7, 1, 2, 8, 5, 4]` leans **Outdoors**

**A book club that actually finishes books**  
Either find one or start one with that single rule written down. Libraries and pubs host them for nothing, and the difference between a book club and a wine night is entirely whether anyone read it.  
`long-term · 1-2-hours-week · inside · at-home · facility · social · free`  
`[9, 1, 3, 6, 1, 4, 3]` leans **Social**

**Become a heritage volunteer guide**  
Pick one building, a chapel or a mill or a lighthouse, and learn it well enough to walk strangers round it. The training is free and given gladly, because these places are always short of guides.  
`long-term · 1-2-hours-week · weekend-blocks · inside · outside · facility · solo · social · free`  
`[8, 3, 2, 7, 4, 8, 3]` leans **Social**

**Befriend an isolated neighbour through a charity**  
A weekly call or a visit, arranged and supported by a befriending charity so that neither of you goes in cold. It costs an hour, and it is one of the few things here that somebody is waiting for.  
`long-term · 1-2-hours-week · inside · at-home · facility · couple · free`  
`[8, 1, 2, 2, 1, 6, 2]` leans **Social**

**Conservation workdays with a local trust**  
River cleans, coppicing, hedge-laying and scrub clearance, with every tool provided and somebody to show you how. A Sunday of it leaves you filthy, aching and unreasonably pleased with yourself.  
`long-term · weekend-blocks · 5-hours-week · exertion · outside · facility · in-nature · solo · couple · social · free`  
`[8, 8, 1, 5, 10, 7, 3]` leans **Outdoors**

**Churchyard and monument recording**  
Local history societies need stones read, photographed and transcribed before the lettering weathers away. It is slow, free and outdoors, and the record outlasts the thing you recorded.  
`long-term · 1-2-hours-week · weekend-blocks · outside · facility · in-nature · solo · couple · social · free`  
`[5, 3, 1, 8, 7, 9, 1]` leans **Novelty**

**Adopt a local museum, room by room**  
One museum, every room, properly, across a whole season rather than in a single exhausted afternoon. Most local museums are free and almost nobody has ever read all the labels in one.  
`long-term · 1-2-hours-week · weekend-blocks · inside · facility · solo · couple · free`  
`[4, 2, 1, 6, 1, 6, 2]` leans **Analytical**

**Storytelling and spoken-word nights**  
Write it, time it to five minutes, and tell it to a room. Open-mic nights are free to enter and free to watch, and the first one is terrifying in a way that turns out to be useful.  
`long-term · 1-2-hours-week · inside · facility · solo · social · free`  
`[8, 2, 9, 4, 1, 8, 7]` leans **Creative**

**Become a school governor**  
Termly meetings, a real vote, and shared responsibility for a budget and a headteacher. Schools are chronically short of governors, the training is free, and nobody expects you to know education.  
`long-term · 1-2-hours-week · inside · facility · social · free`  
`[8, 1, 2, 9, 1, 7, 3]` leans **Analytical**

**Propagate and trade houseplant cuttings**  
Take cuttings, root them in water on the windowsill, and swap the survivors with other people doing the same. It costs nothing, it works, and plant people give things away with alarming generosity.  
`long-term · 1-2-hours-week · inside · at-home · solo · couple · social · free`  
`[6, 2, 4, 5, 2, 6, 2]` leans **Social**

**Escape-room puzzles, built for your friends**  
Ciphers, locks, a story and a one-hour limit, run in your own front room. Being the villain is most of the appeal, and paper-and-string puzzles beat anything you can buy in a box.  
`long-term · 1-2-hours-week · 5-hours-week · inside · at-home · solo · social · free`  
`[8, 1, 9, 9, 1, 8, 6]` leans **Creative**

**Trace the family tree past 1900**  
Free census indexes, birth records and parish registers get most people back to the 1830s without paying anybody. Expect at least one surprise and at least one ancestor who lied on a form.  
`long-term · 1-2-hours-week · weekend-blocks · inside · at-home · solo · couple · free`  
`[5, 1, 4, 8, 1, 7, 3]` leans **Analytical**

**Resurrect an old laptop with Linux**  
A machine too slow for Windows is usually perfectly quick under Linux, and the install is a free download and one afternoon. You end up with a working laptop and a skill that keeps.  
`long-term · weekend-blocks · 1-2-hours-week · inside · at-home · solo · free`  
`[1, 1, 2, 10, 1, 8, 2]` leans **Analytical**

**One tiny game, finished, in Godot**  
The engine is free and the tutorials are endless; the hard part is stopping. Aim at something playable in a weekend, one mechanic and one screen, because finished beats ambitious every single time.  
`long-term · 5-hours-week · weekend-blocks · inside · at-home · solo · free`  
`[2, 1, 9, 8, 1, 8, 4]` leans **Creative**

**Video editing, properly, on free software**  
DaVinci Resolve costs nothing and does what the film industry does. Cut something real, a holiday or a friend's band, because tutorials teach the buttons and only projects teach the timing.  
`long-term · 5-hours-week · weekend-blocks · inside · at-home · solo · couple · free`  
`[3, 1, 9, 6, 1, 6, 3]` leans **Creative**

**Section-hike a coastal path**  
One stretch at a time, ticked off on a map over a year or three, ending wherever the bus goes from. The walking is free; the only real cost is getting yourself back to where you stopped.  
`long-term · weekend-blocks · 5-hours-week · exertion · outside · in-nature · solo · couple · social · free`  
`[5, 8, 1, 5, 10, 7, 5]` leans **Outdoors**

**Natural navigation**  
Finding your way by the sun, the stars, wind-shaped trees and which side of the trunk the moss is on. It is free, it is very old, and it turns an ordinary walk into an exam you set yourself.  
`long-term · 1-2-hours-week · 5-hours-week · outside · in-nature · solo · couple · free`  
`[3, 4, 1, 9, 10, 10, 3]` leans **Outdoors**

**Fossil hunting on the coast**  
Jurassic beaches give up ammonites to anybody who turns up after a storm and looks at the right layer of the cliff fall. Free, legal on most beaches, and you are the first person ever to see it.  
`long-term · weekend-blocks · 5-hours-week · exertion · outside · in-nature · solo · couple · social · free`  
`[4, 6, 1, 7, 10, 8, 4]` leans **Outdoors**

## Proposed TAG corrections to existing rows

⚠️ **This is the more consequential kind of correction, and it is the one to read
hardest.** A tag correction changes **which users can see a row at all** — not how it
ranks. Approving one hides an activity from people who see it today, or reveals it to
people who cannot. Every proposed tag set has been through exactly the same structural
checks a new row gets.

| Title | Removed | Added | Why |
|---|---|---|---|
| A walk with no destination | `exertion` | `couple` `social` | Drops `exertion` and adds the company tags its two sibling walks already carry. An aimless walk is not 'sweat guaranteed', and at Energy 4 it is one of only two rows in the catalogue where the tag and the axis disagree. |
| Ten minutes of mobility work | `exertion` | — | Drops `exertion`. Gentle mobility work does not demand real effort, and the tag currently hides it from anyone answering 'something low-key'. The other row at Energy 4 carrying the tag. |

**What the tag corrections do on their own**, with no new activities added at all:

| Path | Starved cells before | after re-tagging | Zero-cells before | after |
|---|---|---|---|---|
| quick | 106 of 324 | 115 | 57 | 47 |
| hobby | 66 of 192 | 66 | 31 | 31 |

## `exertion` against the Energy axis

The one cross-check between a tag and a vector. **Non-fatal** — `exertion` ("demands real
effort") and Energy (a 1-10 rubric score) are different questions, and the tag is not
derivable from the axis. What is reported is a row answering them incompatibly: Energy 7+
with no tag, or the tag at Energy 4 or below. Energy 5-6 is a judgement and is left alone.

Measured over the seed **plus** this wave and its tag corrections, so a correction that
fixes a clash shows up as the clash disappearing.

No row disagrees with itself. All 190 rows are consistent.

## Starvation — before and after this wave

Counts are **pre-relaxation**: how many activities survive an answer combination before
`lib/selectionPipeline.ts` bends anything. A cell at zero is never empty on screen — it is a
cell where something is ALWAYS bent. ⚠️ Cost and company never bend, so a cell starved on
either of those is starved permanently and only content can fix it.

"Plausible" excludes the low-frequency band — see `CELL_RULES` in
`scripts/lib/starvation.mjs` for the named rules and why the degenerate band is empty.

⚠️ **READ THE ZERO-CELL COLUMN FIRST, NOT THE STARVED COLUMN.** The two can move in
opposite directions and regularly do — a tag correction that takes a row out of one
intersection and puts it into another can tip several 3s down to 2s while emptying
far more cells of nothing at all. A cell at 1 or 2 gets a relaxed, honest answer; a cell
at 0 has nothing to relax from and always bends. **Zero-cells falling is the win.**

| Path | Plausible cells < 3 | Zero-cells | All starved | Pool |
|---|---|---|---|---|
| quick | 103 → **8** | 57 → **7** | 106 of 324 → **11** | 65 → 99 |
| hobby | 63 → **11** | 31 → **3** | 66 of 192 → **14** | 76 → 99 |

**quick** — of 106 cells starved before this wave, **97 are cleared** (now at 3 or more) and **9 gained nothing at all**.

<details><summary>Cells this wave does not touch</summary>

| n | time | energy | place | company | cost |
|---|---|---|---|---|---|
| 0 | Half a day or more | Get me moving | Staying in | Just me | Keep it free |
| 0 | Half a day or more | Get me moving | Staying in | One other person | Keep it free |
| 0 | Half a day or more | Get me moving | Staying in | A few of us | Keep it free |
| 0 | Half a day or more | Get me moving | Staying in | Just me | A few quid is fine |
| 0 | Half a day or more | Get me moving | Staying in | One other person | A few quid is fine |
| 0 | Half a day or more | Get me moving | Staying in | A few of us | A few quid is fine |
| 0 | Half a day or more | Get me moving | Staying in | One other person | Not a concern |
| 2 | Half a day or more | Get me moving | Staying in | Just me | Not a concern |
| 2 | Half a day or more | Get me moving | Staying in | A few of us | Not a concern |

</details>

**hobby** — of 66 cells starved before this wave, **52 are cleared** (now at 3 or more) and **3 gained nothing at all**.

<details><summary>Cells this wave does not touch</summary>

| n | time | setting | cost | company |
|---|---|---|---|---|
| 0 | Weekend blocks | At home | Free to start | A club or community |
| 0 | Weekend blocks | At home | Some kit is fine | A club or community |
| 0 | Weekend blocks | At home | Happy to invest properly | A club or community |

</details>

## D-aware authoring report

Every new row's nearest neighbour **within each pathway it carries**, by the real `euclideanDistance`. D is `DIVERSITY_MIN_DISTANCE` = **3**, imported from `lib/resultsSelection.ts`.

⚠️ **Why this gate exists.** `diverseSelect` skips a candidate that only restates one
already picked, so a row inside D of an existing one is a row **the results page will
never show anybody**. The rule: a flagged row stays only if it fills a starved cell its
neighbour does not. **Reported, never auto-dropped** — the same treatment the fuzzy
dedupe gets, for the same reason.

A pair of NEW rows appears **twice, once from each side**. That is the useful form: the
side showing 0 unique cells is the one to cut, and its partner keeps everything the pair
was reaching between them.

19 row/pathway pairing(s) under D.

| d | New row | Pathway | Nearest | Side | Starved cells it fills | …that the neighbour cannot | Verdict |
|---|---|---|---|---|---|---|---|
| 1.41 | One tiny game, finished, in Godot | long-term | Build a cardboard automaton | seed | 8 | 8 | **KEEP** |
| 1.73 | Three salsa steps, solo | quick-fix | Learn to moonwalk | seed | 8 | 8 | **KEEP** |
| 1.73 | Three card games you can teach anyone | quick-fix | A board game short enough to actually finish | seed | 8 | 8 | **KEEP** |
| 2.00 | Storyboard last year's photo album | quick-fix | Sequence a playlist properly | seed | 17 | 17 | **KEEP** |
| 2.24 | Follow a fifteen-minute beginner yoga flow | quick-fix | Ten minutes of mobility work | seed | 8 | 8 | **KEEP** |
| 2.24 | The wardrobe truth audit | quick-fix | Block out your week on one page | seed | 17 | 17 | **KEEP** |
| 2.24 | Take one inbox to zero | quick-fix | Block out your week on one page | seed | 8 | 8 | **KEEP** |
| 2.24 | Adopt a local museum, room by room | long-term | Antiquarian book collecting | seed | 18 | 18 | **KEEP** |
| 2.45 | Chase a parkrun personal best | long-term | Rugby drills | seed | 8 | 8 | **KEEP** |
| 2.45 | Dog-walking at an animal shelter | long-term | A round of disc golf | seed | 18 | 18 | **KEEP** |
| 2.45 | Resurrect an old laptop with Linux | long-term | Watchmaking and horology | seed | 8 | 8 | **KEEP** |
| 2.45 | Section-hike a coastal path | long-term | Stand-up paddleboarding | seed | 20 | 20 | **KEEP** |
| 2.45 | Fossil hunting on the coast | long-term | Geocaching | seed | 20 | 11 | **KEEP** |
| 2.65 | Find north four ways without a compass | quick-fix | Age a hedge by counting its species | wave | 16 | 10 | **KEEP** |
| 2.65 | Age a hedge by counting its species | quick-fix | Find north four ways without a compass | wave | 6 | 0 | ⚠️ **VETO CANDIDATE** |
| 2.65 | Video editing, properly, on free software | long-term | Design an icon set | seed | 17 | 17 | **KEEP** |
| 2.83 | Full-commitment hopscotch | quick-fix | Knockabout on a public court | seed | 22 | 22 | **KEEP** |
| 2.83 | Plan next year's garden on paper | quick-fix | Dial in one proper cup of coffee | seed | 17 | 17 | **KEEP** |
| 2.83 | Beachcombing and sea glass | quick-fix | Identify trees by their bark | seed | 21 | 21 | **KEEP** |

⚠️ **1 row(s) add no starved cell their neighbour does not already serve.** Under the campaign's D-aware rule those should come out of the wave.

Kept rows, and the cell each one reaches that its neighbour cannot:

- **One tiny game, finished, in Godot** — Weekend blocks / At home / Free to start / A solo pursuit
- **Three salsa steps, solo** — 10-15 minutes / Get me moving / Staying in / Just me / Keep it free
- **Three card games you can teach anyone** — 10-15 minutes / Something low-key / Staying in / A few of us / Keep it free
- **Storyboard last year's photo album** — Half a day or more / Something low-key / Staying in / Just me / Keep it free
- **Follow a fifteen-minute beginner yoga flow** — 10-15 minutes / Get me moving / Staying in / Just me / Keep it free
- **The wardrobe truth audit** — Half a day or more / Something low-key / Staying in / Just me / Keep it free
- **Take one inbox to zero** — Half a day or more / Something low-key / Staying in / Just me / Keep it free
- **Adopt a local museum, room by room** — An hour or two, fitted around things / A place I go - club, gym, studio / Free to start / A solo pursuit
- **Chase a parkrun personal best** — An hour or two, fitted around things / A place I go - club, gym, studio / Free to start / A solo pursuit
- **Dog-walking at an animal shelter** — An hour or two, fitted around things / A place I go - club, gym, studio / Free to start / A solo pursuit
- **Resurrect an old laptop with Linux** — Weekend blocks / At home / Free to start / A solo pursuit
- **Section-hike a coastal path** — A few solid hours / Out in nature / Free to start / Me and a mate
- **Fossil hunting on the coast** — A few solid hours / Out in nature / Free to start / Me and a mate
- **Find north four ways without a compass** — 10-15 minutes / Something low-key / Heading out / A few of us / Keep it free
- **Video editing, properly, on free software** — Weekend blocks / At home / Free to start / A solo pursuit
- **Full-commitment hopscotch** — 10-15 minutes / Get me moving / Heading out / Just me / Keep it free
- **Plan next year's garden on paper** — Half a day or more / Something low-key / Staying in / Just me / Keep it free
- **Beachcombing and sea glass** — Half a day or more / Something low-key / Heading out / Just me / Keep it free

## Same-cell distance report

Pairs of NEW rows closer than D to each other. The `shared` column counts how many of the
pre-wave starved cells **both** rows answer — that is what makes a pair a same-cell pair.

A close pair sharing no cell is two ideas that happen to score alike and land in different
parts of the funnel; a close pair sharing cells is the wave filling one hole twice with
the same idea, and `diverseSelect` will only ever show one of them.

| d | shared cells | Pathway | A | B |
|---|---|---|---|---|
| 2.65 | ⚠️ **6** | quick-fix | Find north four ways without a compass | Age a hedge by counting its species |

## Fuzzy dedupe against the existing catalogue

1 candidate(s) at or above 0.5. **Reported, not dropped** —
a high score can mean a genuine duplicate or just a shared word.

| Score | Wave title | Existing seeded title |
|---|---|---|
| 0.50 | A book club that actually finishes books | A board game short enough to actually finish |

## Template families

The anti-clone rule caps a wave at 2 entries per template family. Counted, not asserted:

- `plan/design X` — 2: Plan next year's garden on paper; Design a no-spend weekend worth having

No family is over the cap.

## Axis balance

### The existing catalogue, before this wave

```
  DOMINANT AXIS — which axis each activity leans into (134 rows)

    Social         12    9.0%  ##########
    Energy         17   12.7%  ##############
    Creative       30   22.4%  #########################
    Analytical     33   24.6%  ############################
    Outdoors       16   11.9%  ##############
    Novelty        23   17.2%  ####################
    Stimulation     3    2.2%  ###

  PER-AXIS RANGE — is the axis a real dimension, or stuck near one value?

    Axis          min   mean  max  spread  stdev
    Social          1   3.00   10       9   2.53
    Energy          1   3.50   10       9   2.68
    Creative        1   3.45   10       9   2.66
    Analytical      1   4.88   10       9   2.36
    Outdoors        1   2.98   10       9   3.11
    Novelty         1   5.42   10       9   2.03
    Stimulation     1   3.43   10       9   2.10
```

### This wave alone

```
  DOMINANT AXIS — which axis each activity leans into (56 rows)

    Social         10   17.9%  ######################
    Energy         13   23.2%  ############################
    Creative        5    8.9%  ###########
    Analytical     10   17.9%  ######################
    Outdoors       13   23.2%  ############################
    Novelty         5    8.9%  ###########
    Stimulation     0    0.0%  

    ⚠️  NOTHING leans Stimulation — a purist on that axis can never be shown a match that agrees with their profile.

  PER-AXIS RANGE — is the axis a real dimension, or stuck near one value?

    Axis          min   mean  max  spread  stdev
    Social          1   4.80    9       8   2.29
    Energy          1   3.98    9       8   2.72
    Creative        1   2.66    9       8   2.36
    Analytical      1   5.11   10       9   2.43
    Outdoors        1   4.11   10       9   3.56
    Novelty         1   5.88   10       9   1.98
    Stimulation     1   3.32    8       7   1.71
```

### Combined, if every survivor lands (audit corrections applied)

```
  DOMINANT AXIS — which axis each activity leans into (188 rows)

    Social         22   11.7%  ##############
    Energy         29   15.4%  ###################
    Creative       35   18.6%  #######################
    Analytical     43   22.9%  ############################
    Outdoors       28   14.9%  ##################
    Novelty        28   14.9%  ##################
    Stimulation     3    1.6%  ##

  PER-AXIS RANGE — is the axis a real dimension, or stuck near one value?

    Axis          min   mean  max  spread  stdev
    Social          1   3.56   10       9   2.60
    Energy          1   3.64   10       9   2.71
    Creative        1   3.24   10       9   2.60
    Analytical      1   4.98   10       9   2.37
    Outdoors        1   3.30   10       9   3.28
    Novelty         1   5.59   10       9   2.01
    Stimulation     1   3.42   10       9   1.99
```

