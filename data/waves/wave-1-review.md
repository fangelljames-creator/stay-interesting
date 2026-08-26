# Wave 1 — review

Production only — no new ideas. Every row here is one of the 99 approved rows from the curated keep list, with its description rewritten in house voice, its tags assigned from scratch under the closed 20-tag vocabulary, and its vector scored against The 7-axis rubric in CLAUDE.md. The CSV's `tier` and `note` columns were veto metadata and do not survive into the seed. Titles are normalised to sentence case to match the existing catalogue.

**99 activities for your veto pass**, plus **24 proposed vector corrections** to existing rows.

Nothing here has been written to the seed SQL or the database. Strike anything by adding its
exact title to the `vetoed` array in the wave JSON, or just tell me and I will.

Axis order everywhere: `[Social, Energy, Creative, Analytical, Outdoors, Novelty, Stimulation]`.

## Read this first

### One exact duplicate, and two near-duplicates, of rows already in the seed

**`Indoor bouldering` is a byte-for-byte title match** with a row already seeded. The SQL matches on title, so re-running would silently skip it and you would keep the existing vector rather than the audited one — a confusing outcome rather than a broken one. My recommendation is to veto the wave row and take the audit correction to the existing one instead, but it is your call and I have not dropped it.

`Fifteen-minute mobility flow` against the seeded `Ten minutes of mobility work` is the same activity twice at two lengths. `Sourdough from a wild starter` against `Sourdough and bread baking` is arguably a deeper long-term version of the same thing. `Hiking and hillwalking` against `Trail running and hillwalking` I would keep — walking a ridge and running a trail are genuinely different activities that happen to share a word.

### Four template families are over the anti-clone cap

`build X` has 6, `learn/study X` has 5, `make X` and `plan/design X` have 3 each, against a cap of 2 per wave.

Two things worth saying plainly. First, wave 1 is **production of a list you already approved**, not generation, so these are your rows rather than clones I invented — the cap was written for waves 2+. Second, the detector reads the first word of the titles, **and I chose the titles**. `Build a blanket fort` could just as easily have been `Blanket fort`, which would drop the count without changing anything real. I have not renamed anything to get under the cap, because that would be gaming the check rather than passing it.

### I made the side-effect error myself, on Analytical, and corrected it

My first pass had **Analytical dominant on 40% of the wave**. Reviewing it against the rubric, I had been scoring "this is an intellectual activity" rather than "strategy, systems or numbers are at the core" — the exact error the rubric exists to prevent, committed in the same week I wrote it down.

79 rows were re-scored on that axis. Observation, memorisation and recall came down (`Learn the NATO alphabet` 5→3, `Geography quiz blitz` 8→5, `Study old maps` 8→5); genuine problem-solving stayed (`Play through a famous chess game` 10, `Three bullets on today's markets` 9, `Build an Arduino weather station` 10, `Small engine repair` 9). Analytical is now dominant on 28%, still the largest share and worth your eye.

### The curated list is overwhelmingly solo and calm — a real gap for waves 2+

Across all 99 rows, **Social is dominant on 4 and Stimulation on 2**. That is not a scoring artefact: the keep list is a list of hobbies and micro-tasks a person does by themselves, and it was assembled that way.

Combined with the audit — which removes the catalogue's only fictional Stimulation row — the whole 136-row catalogue would end up with **3 Stimulation-dominant activities out of 136** — `Skateboarding at a public park`, `Geography quiz blitz` and `Two minutes of cold shower`. CLAUDE.md already flags that a Stimulation purist cannot be shown anything the catalogue agrees is Stimulation-dominant. Wave 1 does not fix that, and waves 2+ should be weighted hard toward **social** and **high-stakes** content from the idea bank.

### A vocabulary gap: there is no setting tag for "out in the town"

`Sketch buildings from a bench` genuinely happens on a pavement in a town centre. The setting vocabulary is `at-home` / `facility` / `in-nature`, and none of them is true. I tagged it `at-home` + `in-nature` because both are real venues for it, which is a fudge rather than a fact.

Not proposing a new tag — the doctrine is that a tag no filter reads must not exist, and adding one means adding the filter in the same change. Recording it because if waves 2+ bring more urban-outdoor activities, this becomes a real hole in the hobby path's setting question.

### Two tag observations outside this audit's remit

The audit you asked for covers **vectors**. Two seeded rows also look wrong on **tags**, which I have not touched:

- `Ten minutes of mobility work` carries `exertion`, but the tag doctrine defines that as demanding real effort. Gentle mobility work does not, and the tag currently hides it from anyone who answers "something low-key".
- `A walk with no destination` carries `exertion` for the same reason.

Both would need a separate change with its own review, since re-tagging alters which users can see a row at all.

## Quick-fix — 46

| # | Title | Pathway | Cost | Vector | Leans |
|---|---|---|---|---|---|
| 1 | A round of disc golf | quick-fix+long-term | low-budget | `6,5,1,3,8,5,4` | Outdoors |
| 2 | Map a historic walking tour | quick-fix | free | `2,4,5,6,6,6,2` | Analytical |
| 3 | Revive scuffed leather boots | quick-fix | low-budget | `1,2,3,2,1,3,1` | Creative |
| 4 | Identify garden birds | quick-fix | free | `2,1,1,5,8,4,1` | Outdoors |
| 5 | Ten-minute room reset | quick-fix | free | `1,4,1,2,1,1,3` | Energy |
| 6 | List something for resale | quick-fix | free | `2,2,3,4,1,3,2` | Analytical |
| 7 | Geography quiz blitz | quick-fix | free | `2,1,1,5,1,4,6` | Stimulation |
| 8 | Dig into local history | quick-fix | free | `2,1,1,5,1,6,2` | Novelty |
| 9 | Ring someone for no reason | quick-fix | free | `9,1,1,1,3,2,3` | Social |
| 10 | Mend what needs mending | quick-fix | low-budget | `1,2,4,3,1,3,1` | Creative |
| 11 | Make a lemon posset | quick-fix | low-budget | `3,2,4,2,1,4,2` | Creative |
| 12 | Learn three knots that matter | quick-fix | free | `1,2,2,4,1,5,2` | Novelty |
| 13 | Find five constellations | quick-fix | free | `2,2,1,5,9,5,2` | Outdoors |
| 14 | Fold an origami crane | quick-fix | free | `1,1,6,4,1,4,1` | Creative |
| 15 | Fifteen-minute mobility flow | quick-fix | free | `1,4,1,1,1,2,1` | Energy |
| 16 | Learn to moonwalk | quick-fix | free | `1,5,4,2,1,6,4` | Novelty |
| 17 | Plan a trip you may never take | quick-fix | free | `2,1,3,6,2,6,2` | Analytical |
| 18 | Build a blanket fort | quick-fix | free | `5,4,6,2,1,5,2` | Creative |
| 19 | Two minutes of cold shower | quick-fix | free | `1,4,1,1,1,5,8` | Stimulation |
| 20 | Write a review someone will actually read | quick-fix | free | `4,1,4,2,1,2,2` | Social |
| 21 | Microwave mug cake | quick-fix | low-budget | `2,1,3,2,1,3,2` | Creative |
| 22 | Ten minutes of guided breathing | quick-fix | free | `1,1,1,1,1,3,1` | Novelty |
| 23 | A glassblowing taster class | quick-fix+long-term | investment-required | `5,6,8,4,1,9,6` | Novelty |
| 24 | A blacksmithing taster day | quick-fix+long-term | investment-required | `5,9,7,4,3,9,7` | Energy |
| 25 | Block out your week on one page | quick-fix | free | `1,1,2,6,1,3,2` | Analytical |
| 26 | Bake rosemary sea salt crackers | quick-fix | low-budget | `2,3,5,3,1,4,2` | Creative |
| 27 | Study old maps | quick-fix | free | `1,1,2,5,1,7,2` | Novelty |
| 28 | Identify trees by their bark | quick-fix | free | `2,3,1,5,9,6,1` | Outdoors |
| 29 | Watch a film like a cinematographer | quick-fix | free | `2,1,4,6,1,5,2` | Analytical |
| 30 | Learn Morse code | quick-fix | free | `1,1,1,5,1,7,3` | Novelty |
| 31 | Repair a broken book spine | quick-fix | low-budget | `1,2,4,4,1,5,1` | Novelty |
| 32 | Sequence a playlist properly | quick-fix | free | `2,1,7,4,1,4,2` | Creative |
| 33 | Plot a running route worth running | quick-fix | free | `1,1,2,5,3,4,2` | Analytical |
| 34 | Write with your other hand | quick-fix | free | `1,2,3,3,1,7,2` | Novelty |
| 35 | Play through a famous chess game | quick-fix | free | `1,1,1,10,1,5,3` | Analytical |
| 36 | Turn bottles into vases | quick-fix | free | `1,2,6,2,1,4,1` | Creative |
| 37 | Clear out the camera roll | quick-fix | free | `1,1,1,2,1,1,1` | Analytical |
| 38 | Put the radio on | quick-fix | free | `1,1,1,2,1,4,2` | Novelty |
| 39 | Write a quiz for the house | quick-fix | free | `8,1,6,6,1,5,5` | Social |
| 40 | Translate a news article line by line | quick-fix | free | `1,1,2,7,1,6,2` | Analytical |
| 41 | Three bullets on today's markets | quick-fix | free | `1,1,2,9,1,4,3` | Analytical |
| 42 | Check the car's fluids | quick-fix | free | `1,3,1,4,4,3,1` | Analytical |
| 43 | Sort the spice drawer | quick-fix | free | `1,2,1,2,1,1,1` | Energy |
| 44 | Learn the NATO alphabet | quick-fix | free | `2,1,1,3,1,4,2` | Novelty |
| 45 | Foam roll everything that hurts | quick-fix | low-budget | `1,4,1,2,1,2,3` | Energy |
| 46 | Tie a half-Windsor | quick-fix | free | `1,2,2,3,1,4,2` | Novelty |

## Long-term — 56

| # | Title | Pathway | Cost | Vector | Leans |
|---|---|---|---|---|---|
| 1 | Train for a half-marathon | long-term | free | `3,10,1,4,8,4,5` | Energy |
| 2 | Traditional bookbinding | long-term | low-budget | `1,2,8,4,1,7,2` | Creative |
| 3 | Classical oil painting | long-term | investment-required | `1,2,10,3,1,6,2` | Creative |
| 4 | Sourdough from a wild starter | long-term | free | `2,3,6,6,1,6,2` | Creative |
| 5 | Carve a wooden spoon | long-term | low-budget | `1,3,8,3,3,7,2` | Creative |
| 6 | A round of disc golf | quick-fix+long-term | low-budget | `6,5,1,3,8,5,4` | Outdoors |
| 7 | Build a miniature diorama | long-term | low-budget | `1,2,9,4,1,6,2` | Creative |
| 8 | Basic bicycle maintenance | long-term | low-budget | `1,3,2,7,3,5,2` | Analytical |
| 9 | Pressed flower art | long-term | free | `1,2,7,1,5,4,1` | Creative |
| 10 | Shadowboxing rounds | long-term | free | `1,9,2,3,1,4,5` | Energy |
| 11 | Chess study and correspondence games | long-term | free | `3,1,1,10,1,4,5` | Analytical |
| 12 | Close-up card and coin magic | long-term | low-budget | `4,2,7,4,1,7,4` | Creative |
| 13 | Indoor bouldering | long-term | low-budget | `5,9,1,5,1,6,6` | Energy |
| 14 | Hiking and hillwalking | long-term | low-budget | `4,8,1,3,10,5,3` | Outdoors |
| 15 | Foraging for wild plants | long-term | low-budget | `2,4,2,7,10,8,3` | Outdoors |
| 16 | Web design and front-end coding | long-term | free | `1,1,7,9,1,6,3` | Analytical |
| 17 | The big books project | long-term | free | `1,1,1,3,1,5,2` | Novelty |
| 18 | Fermenting and kombucha brewing | long-term | low-budget | `2,2,5,6,1,7,2` | Novelty |
| 19 | Bonsai cultivation | long-term | low-budget | `1,2,7,5,4,7,1` | Creative |
| 20 | Moroccan tagine cooking | long-term | low-budget | `5,3,6,4,1,7,2` | Novelty |
| 21 | Amateur astronomy | long-term | investment-required | `2,2,3,8,9,8,3` | Outdoors |
| 22 | Tabletop roleplaying | long-term | low-budget | `10,1,8,5,1,7,5` | Social |
| 23 | Make a zine | long-term | low-budget | `3,2,9,2,1,7,3` | Creative |
| 24 | 3D printing and CAD | long-term | investment-required | `1,2,7,9,1,7,3` | Analytical |
| 25 | Build and paint a scale model | long-term | low-budget | `1,2,7,4,1,5,2` | Creative |
| 26 | Olympic lifting, properly coached | long-term | investment-required | `6,10,1,6,1,7,7` | Energy |
| 27 | Build a mechanical keyboard | long-term | investment-required | `1,2,6,7,1,7,3` | Analytical |
| 28 | Restore a cast iron skillet | long-term | low-budget | `1,4,4,5,1,6,2` | Novelty |
| 29 | Build an Arduino weather station | long-term | low-budget | `1,2,5,10,2,7,3` | Analytical |
| 30 | Rowing at a river club | long-term | investment-required | `9,10,1,5,8,7,6` | Energy |
| 31 | Hill sprint intervals | long-term | free | `1,10,1,3,7,3,7` | Energy |
| 32 | Design an icon set | long-term | free | `1,1,8,6,1,5,2` | Creative |
| 33 | Wall-supported handstands | long-term | free | `1,8,1,3,1,5,5` | Energy |
| 34 | Orienteering in the park | long-term | low-budget | `5,7,1,9,9,7,5` | Analytical |
| 35 | Speed cup stacking | long-term | low-budget | `2,4,1,4,1,8,6` | Novelty |
| 36 | Cold brew coffee | long-term | low-budget | `2,1,3,5,1,4,1` | Analytical |
| 37 | Read military history properly | long-term | free | `1,1,1,8,1,5,2` | Analytical |
| 38 | Sketch buildings from a bench | long-term | low-budget | `1,3,9,3,6,5,2` | Creative |
| 39 | Hand-stitch a felt wallet | long-term | low-budget | `1,2,7,3,1,6,1` | Creative |
| 40 | Build a cardboard automaton | long-term | low-budget | `2,2,9,8,1,8,3` | Creative |
| 41 | Small engine repair | long-term | low-budget | `1,5,2,9,4,7,3` | Analytical |
| 42 | Classic car market research | long-term | free | `2,1,1,10,1,6,4` | Analytical |
| 43 | Antiquarian book collecting | long-term | investment-required | `3,2,2,7,1,7,3` | Analytical |
| 44 | Sport lockpicking | long-term | low-budget | `1,2,2,9,1,9,4` | Analytical |
| 45 | Amateur radio | long-term | investment-required | `6,2,3,9,3,9,4` | Analytical |
| 46 | Kite surfing lessons | long-term | investment-required | `5,9,2,5,10,9,10` | Outdoors |
| 47 | A glassblowing taster class | quick-fix+long-term | investment-required | `5,6,8,4,1,9,6` | Novelty |
| 48 | Orchid cultivation | long-term | low-budget | `1,2,3,6,2,6,1` | Analytical |
| 49 | Historical European martial arts | long-term | investment-required | `8,8,2,7,1,10,8` | Novelty |
| 50 | Watchmaking and horology | long-term | investment-required | `1,1,4,10,1,9,3` | Analytical |
| 51 | A blacksmithing taster day | quick-fix+long-term | investment-required | `5,9,7,4,3,9,7` | Energy |
| 52 | Stand-up paddleboarding | long-term | investment-required | `4,7,1,3,10,7,5` | Outdoors |
| 53 | Parkour, at a class | long-term | low-budget | `7,10,3,5,2,9,9` | Energy |
| 54 | Restore a vintage typewriter | long-term | low-budget | `1,3,4,7,1,7,2` | Analytical |
| 55 | Urban beekeeping | long-term | investment-required | `4,5,2,7,8,9,5` | Novelty |
| 56 | Scuba certification | long-term | investment-required | `8,7,1,7,9,10,8` | Novelty |

## Descriptions and tags

**Train for a half-marathon**  
Twelve weeks of mostly easy miles with one hard session a week, building towards 13.1. The training is unglamorous and the shoes are the only real cost — but the finish line does exactly what it promises.  
`long-term · 5-hours-week · exertion · outside · in-nature · solo · social · free`  
`[3, 10, 1, 4, 8, 4, 5]` leans **Energy**

**Traditional bookbinding**  
Fold the paper into signatures, sew them onto linen cords, and case the whole thing in cloth. A starter kit is a few pounds of thread and needles, and your first book will be crooked in a way you end up fond of.  
`long-term · 1-2-hours-week · inside · at-home · solo · low-budget`  
`[1, 2, 8, 4, 1, 7, 2]` leans **Creative**

**Classical oil painting**  
Copy the old masters to learn what they knew about layering, glazing, and how colour behaves while it is still wet. Oils and canvas are not cheap, and every layer needs days to dry before the next one goes on.  
`long-term · 5-hours-week · inside · at-home · solo · investment-required`  
`[1, 2, 10, 3, 1, 6, 2]` leans **Creative**

**Sourdough from a wild starter**  
Catch the yeast already living in your kitchen, feed it daily until it is reliable, then learn what hydration actually does to a crumb. Flour and time are the only costs, and the first month of loaves are for you rather than for guests.  
`long-term · 1-2-hours-week · inside · at-home · solo · free`  
`[2, 3, 6, 6, 1, 6, 2]` leans **Creative** — Dedupe candidate against the seeded 'Sourdough and bread baking'.

**Carve a wooden spoon**  
A straight knife, a hook knife, and a green branch turn into something you can actually eat with. Expect a whole evening on the first one, and keep the plasters within reach.  
`long-term · 1-2-hours-week · inside · outside · at-home · solo · low-budget`  
`[1, 3, 8, 3, 3, 7, 2]` leans **Creative**

**A round of disc golf**  
Two or three discs and a public course, which in most towns costs nothing to walk. It plays like golf with none of the membership, the dress code, or the waiting.  
`quick-fix · half-day · long-term · 1-2-hours-week · exertion · outside · in-nature · solo · couple · social · low-budget`  
`[6, 5, 1, 3, 8, 5, 4]` leans **Outdoors**

**Build a miniature diorama**  
Foam board, acrylics and twigs from the garden become a scene at 1:35 — a ruined building, a station platform, whatever you can picture. Cheap to start, and genuinely absorbing once you begin thinking about the lighting.  
`long-term · 1-2-hours-week · inside · at-home · solo · low-budget`  
`[1, 2, 9, 4, 1, 6, 2]` leans **Creative**

**Basic bicycle maintenance**  
Degrease the chain, index the gears, and patch a tube on the kitchen floor until none of it feels intimidating. A basic tool roll pays for itself the first time you skip the shop.  
`long-term · 1-2-hours-week · inside · outside · at-home · solo · low-budget`  
`[1, 3, 2, 7, 3, 5, 2]` leans **Analytical**

**Pressed flower art**  
Pick up what has already fallen on a walk, press it flat inside the heaviest books you own, and frame the results weeks later. It costs nothing but patience, and the waiting is most of it.  
`long-term · 1-2-hours-week · inside · outside · at-home · in-nature · solo · free`  
`[1, 2, 7, 1, 5, 4, 1]` leans **Creative**

**Shadowboxing rounds**  
Fifteen rounds in front of a mirror thinking about nothing but footwork, guard and hand speed. No kit and no gym, and you will be properly out of breath by the fourth.  
`long-term · 1-2-hours-week · exertion · inside · at-home · solo · free`  
`[1, 9, 2, 3, 1, 4, 5]` leans **Energy**

**Chess study and correspondence games**  
Learn one opening properly rather than five badly, and play correspondence games where you get days to think about each move. Free everywhere, and the losses teach much faster than the wins.  
`long-term · 1-2-hours-week · inside · at-home · solo · couple · free`  
`[3, 1, 1, 10, 1, 4, 5]` leans **Analytical**

**Close-up card and coin magic**  
Card controls, a coin vanish, and the discipline of practising one move until it stops looking like a move. A deck of cards is the entire budget and the mirror does the rest.  
`long-term · 1-2-hours-week · inside · at-home · solo · social · low-budget`  
`[4, 2, 7, 4, 1, 7, 4]` leans **Creative**

**Indoor bouldering**  
Short problems, thick mats, no ropes — just you working out where to put your feet. A session with shoe hire is about a tenner, and your forearms will tell you when to stop.  
`long-term · 1-2-hours-week · exertion · inside · facility · solo · social · low-budget`  
`[5, 9, 1, 5, 1, 6, 6]` leans **Energy** — EXACT title collision with the seeded 'Indoor bouldering'. See the dedupe section.

**Hiking and hillwalking**  
Plan a ridge line or a stretch of a national trail and give a whole Saturday to it. Boots and a waterproof are the real cost; the walking is free and the weather is part of the deal.  
`long-term · weekend-blocks · exertion · outside · in-nature · solo · couple · social · low-budget`  
`[4, 8, 1, 3, 10, 5, 3]` leans **Outdoors**

**Foraging for wild plants**  
Learn a handful of species properly — where they grow, when they are ready, and when to leave them alone. Start with a good regional guide, and never eat anything you are not completely certain of.  
`long-term · 1-2-hours-week · outside · in-nature · solo · couple · low-budget`  
`[2, 4, 2, 7, 10, 8, 3]` leans **Outdoors**

**Web design and front-end coding**  
Build something small and real — a page for a friend's band, a tool you actually want — and learn the layout engine by fighting it. Free to start, and the browser is the only thing you need to install.  
`long-term · 5-hours-week · inside · at-home · solo · free`  
`[1, 1, 7, 9, 1, 6, 3]` leans **Analytical**

**The big books project**  
Pick one of the doorstops you have been avoiding — Moby-Dick, Middlemarch, War and Peace — and read fifty pages a week until it is done. The library makes it free, and the length is the point rather than the obstacle.  
`long-term · 1-2-hours-week · inside · at-home · solo · free`  
`[1, 1, 1, 3, 1, 5, 2]` leans **Novelty**

**Fermenting and kombucha brewing**  
A jar, a starter culture, and a fortnight of doing very little while the microbes work. Hot sauce and kombucha both forgive beginners, and the smell tells you how it is going long before the taste does.  
`long-term · 1-2-hours-week · inside · at-home · solo · low-budget`  
`[2, 2, 5, 6, 1, 7, 2]` leans **Novelty**

**Bonsai cultivation**  
Wire, prune and wait — a tree you shape across years rather than an afternoon. A starter tree and decent snips are modest, but the real commitment is watering it every day for a decade.  
`long-term · 1-2-hours-week · inside · outside · at-home · solo · low-budget`  
`[1, 2, 7, 5, 4, 7, 1]` leans **Creative**

**Moroccan tagine cooking**  
Ras el hanout, preserved lemon, and three hours at the lowest heat your hob will hold. A proper tagine pot is the one real purchase and it earns its shelf space by the third dinner.  
`long-term · 1-2-hours-week · inside · at-home · solo · couple · social · low-budget`  
`[5, 3, 6, 4, 1, 7, 2]` leans **Novelty**

**Amateur astronomy**  
A starter scope, a reasonably dark field, and a list of what is up tonight. The moon and Jupiter come easily; anything fainter is a lesson in patience and cold hands.  
`long-term · 1-2-hours-week · outside · in-nature · solo · couple · investment-required`  
`[2, 2, 3, 8, 9, 8, 3]` leans **Outdoors**

**Tabletop roleplaying**  
Four friends, a set of dice, and a story none of you can predict in advance. The starter rules are free to download and the only real cost is finding a night everyone can keep.  
`long-term · 1-2-hours-week · inside · at-home · facility · social · low-budget`  
`[10, 1, 8, 5, 1, 7, 5]` leans **Social**

**Make a zine**  
Fold one sheet of A4 into eight pages and fill it with something nobody asked for — a guide to local benches, a comic, a rant. A photocopier turns it into a stack you can hand out.  
`long-term · 1-2-hours-week · inside · at-home · solo · low-budget`  
`[3, 2, 9, 2, 1, 7, 3]` leans **Creative**

**3D printing and CAD**  
Model a bracket that does not exist yet, print it overnight, and find out exactly where your measurements were wrong. The printer is the expensive part; the software is free and the failures are cheap.  
`long-term · 5-hours-week · inside · at-home · solo · investment-required`  
`[1, 2, 7, 9, 1, 7, 3]` leans **Analytical**

**Map a historic walking tour**  
Find five buildings within a mile that have a story and string them into a loop you could walk a visitor round. It costs a phone and an hour, and you will never see the high street quite the same way.  
`quick-fix · 1-hour · outside · solo · couple · free`  
`[2, 4, 5, 6, 6, 6, 2]` leans **Analytical**

**Revive scuffed leather boots**  
Clean the salt off, work conditioner in with your fingers, and let them dry well away from the radiator. A tin costs a few pounds and will outlast several pairs of boots.  
`quick-fix · 1-hour · inside · at-home · solo · low-budget`  
`[1, 2, 3, 2, 1, 3, 1]` leans **Creative**

**Identify garden birds**  
Sit by a window or on a park bench for half an hour and write down everything that lands. Binoculars help but are not required, and a robin at four feet beats a rarity at four hundred.  
`quick-fix · 10-mins · 1-hour · inside · outside · in-nature · solo · couple · free`  
`[2, 1, 1, 5, 8, 4, 1]` leans **Outdoors**

**Ten-minute room reset**  
One loud playlist, one bin bag, and ten minutes of not deciding anything — just clearing. It is not deep cleaning and it is not trying to be.  
`quick-fix · 10-mins · inside · at-home · solo · free`  
`[1, 4, 1, 2, 1, 1, 3]` leans **Energy**

**List something for resale**  
Photograph the jacket you have not worn in two years against a plain wall, and write the listing honestly. Twenty minutes for something that might pay for dinner.  
`quick-fix · 1-hour · inside · at-home · solo · free`  
`[2, 2, 3, 4, 1, 3, 2]` leans **Analytical**

**Geography quiz blitz**  
Name every country in Africa against a running clock, get thoroughly humbled, and immediately go again. Free, mildly addictive, and you genuinely end up knowing where things are.  
`quick-fix · 10-mins · inside · at-home · solo · couple · free`  
`[2, 1, 1, 5, 1, 4, 6]` leans **Stimulation**

**Dig into local history**  
Search the archives for what your street looked like a century ago and find out what stood where the supermarket is. Free through most library services, and it escalates quickly.  
`quick-fix · 1-hour · inside · at-home · solo · free`  
`[2, 1, 1, 5, 1, 6, 2]` leans **Novelty**

**Ring someone for no reason**  
Pick the person you keep meaning to call and simply call them, with no agenda and no occasion. Ten minutes, free, and disproportionately good for both of you.  
`quick-fix · 10-mins · inside · outside · at-home · couple · free`  
`[9, 1, 1, 1, 3, 2, 3]` leans **Social**

**Mend what needs mending**  
Sew the button back on, close the hem, and stop stepping around the pile on the chair. A basic needle-and-thread kit costs a couple of pounds and lasts years.  
`quick-fix · 10-mins · 1-hour · inside · at-home · solo · low-budget`  
`[1, 2, 4, 3, 1, 3, 1]` leans **Creative**

**Make a lemon posset**  
Cream, sugar, lemon. Boil, stir, pour, chill — three ingredients and no technique, and it comes out looking like you tried far harder than you did.  
`quick-fix · 10-mins · inside · at-home · solo · couple · low-budget`  
`[3, 2, 4, 2, 1, 4, 2]` leans **Creative**

**Learn three knots that matter**  
The bowline, the clove hitch and the figure-eight, tied with a bootlace on the sofa. Ten minutes each, and once they land they stay learned for good.  
`quick-fix · 10-mins · inside · at-home · solo · free`  
`[1, 2, 2, 4, 1, 5, 2]` leans **Novelty**

**Find five constellations**  
Step outside, hold up a star app, and learn five shapes well enough to find them again without it. Free, best on a cold clear night, and Orion is the one to start with.  
`quick-fix · 10-mins · outside · in-nature · solo · couple · free`  
`[2, 2, 1, 5, 9, 5, 2]` leans **Outdoors**

**Fold an origami crane**  
One square of paper and about twenty folds, most of which you will get wrong the first time. The second one takes five minutes and the tenth takes two.  
`quick-fix · 10-mins · inside · at-home · solo · free`  
`[1, 1, 6, 4, 1, 4, 1]` leans **Creative**

**Fifteen-minute mobility flow**  
Follow a full-body stretch routine on the living room floor and discover which side is tighter. Free, and the difference shows up within a week rather than a month.  
`quick-fix · 10-mins · inside · at-home · solo · free`  
`[1, 4, 1, 1, 1, 2, 1]` leans **Energy**

**Learn to moonwalk**  
Smooth socks, a hard floor, and a tutorial you will re-watch about eight times. Completely useless and entirely worth the twenty minutes.  
`quick-fix · 10-mins · inside · at-home · solo · free`  
`[1, 5, 4, 2, 1, 6, 4]` leans **Novelty**

**Plan a trip you may never take**  
Pick a country and build the actual route — the trains, the towns, where you would sleep on each night. Free, and roughly half of these do eventually happen.  
`quick-fix · 1-hour · inside · at-home · solo · couple · free`  
`[2, 1, 3, 6, 2, 6, 2]` leans **Analytical**

**Build a blanket fort**  
Every cushion in the house, two chairs, and the big blanket nobody ever uses. Free, faintly ridiculous, and a genuinely good place to read for an hour.  
`quick-fix · 1-hour · inside · at-home · solo · couple · social · free`  
`[5, 4, 6, 2, 1, 5, 2]` leans **Creative**

**Two minutes of cold shower**  
Turn the dial all the way over at the end of a normal shower and stay there for two minutes. Free, deeply unpleasant, and you will feel switched on for an hour afterwards.  
`quick-fix · 10-mins · inside · at-home · solo · free`  
`[1, 4, 1, 1, 1, 5, 8]` leans **Stimulation**

**Write a review someone will actually read**  
Think of the small place that quietly gets it right, and write them the specific, glowing review you never got round to. Five minutes of yours, a real difference to theirs.  
`quick-fix · 10-mins · inside · at-home · solo · free`  
`[4, 1, 4, 2, 1, 2, 2]` leans **Social**

**Microwave mug cake**  
Flour, sugar, cocoa and milk, stirred in the mug you are going to eat it out of. Ninety seconds, and exactly as good as it needs to be at eleven at night.  
`quick-fix · 10-mins · inside · at-home · solo · low-budget`  
`[2, 1, 3, 2, 1, 3, 2]` leans **Creative**

**Ten minutes of guided breathing**  
Open a meditation app, take the beginner track, and do the full ten minutes without checking how long is left. The free tiers cover everything you need to find out whether it suits you.  
`quick-fix · 10-mins · inside · at-home · solo · free`  
`[1, 1, 1, 1, 1, 3, 1]` leans **Novelty**

**Build and paint a scale model**  
A plastic kit of something with a history, assembled in the right order and painted slowly. Kits and paints are modest, and the patience is the actual skill being trained.  
`long-term · 1-2-hours-week · inside · at-home · solo · low-budget`  
`[1, 2, 7, 4, 1, 5, 2]` leans **Creative**

**Olympic lifting, properly coached**  
The snatch and the clean-and-jerk are technique long before they are strength, which is why this belongs in a club with a coach rather than on YouTube. Expect a membership fee and several weeks on an empty barbell.  
`long-term · 5-hours-week · exertion · inside · facility · social · investment-required`  
`[6, 10, 1, 6, 1, 7, 7]` leans **Energy**

**Build a mechanical keyboard**  
Choose the switches, solder the board, and lubricate the stabilisers until it sounds the way you want it to. Parts add up quickly and the soldering iron is a genuine purchase.  
`long-term · 1-2-hours-week · inside · at-home · solo · investment-required`  
`[1, 2, 6, 7, 1, 7, 3]` leans **Analytical**

**Restore a cast iron skillet**  
Strip a rusted junk-shop pan back to bare metal, then build the seasoning up again in thin layers in a hot oven. The pan costs a few pounds and will outlive you if you get it right.  
`long-term · 1-2-hours-week · inside · at-home · solo · low-budget`  
`[1, 4, 4, 5, 1, 6, 2]` leans **Novelty**

**Build an Arduino weather station**  
Solder up temperature, humidity and pressure sensors and log your own garden's readings to a chart. A starter kit is affordable; the frustration is free and arrives in bulk.  
`long-term · 5-hours-week · inside · at-home · solo · low-budget`  
`[1, 2, 5, 10, 2, 7, 3]` leans **Analytical**

**Rowing at a river club**  
Learn the catch, the drive and the recovery from people who will tell you precisely what your blade is doing wrong. Club fees are real and the early starts are worse, but the water at six in the morning is why people stay.  
`long-term · 5-hours-week · exertion · outside · facility · in-nature · social · investment-required`  
`[9, 10, 1, 5, 8, 7, 6]` leans **Energy**

**Hill sprint intervals**  
Find the steepest street or path near you and run up it hard, eight or ten times, walking back down between. Free, brutally simple, and over inside twenty-five minutes.  
`long-term · 1-2-hours-week · exertion · outside · in-nature · solo · free`  
`[1, 10, 1, 3, 7, 3, 7]` leans **Energy**

**Design an icon set**  
Draw ten icons that have to look like a family — same weight, same corners, same logic — and then vectorise them. Free tools cover all of it, and the constraint is what makes it interesting.  
`long-term · 1-2-hours-week · inside · at-home · solo · free`  
`[1, 1, 8, 6, 1, 5, 2]` leans **Creative**

**Wall-supported handstands**  
Kick up against a wall and hold a hollow line, adding ten seconds a week. Free, and your wrists will complain long before your shoulders do.  
`long-term · 1-2-hours-week · exertion · inside · at-home · solo · free`  
`[1, 8, 1, 3, 1, 5, 5]` leans **Energy**

**Orienteering in the park**  
A compass, a topographic map, and a set of control points to find in the right order. Local clubs run cheap events most weekends, and getting lost is part of the curriculum.  
`long-term · weekend-blocks · exertion · outside · in-nature · solo · social · low-budget`  
`[5, 7, 1, 9, 9, 7, 5]` leans **Analytical**

**Speed cup stacking**  
Learn the 3-3-3 and 3-6-3 sequences until your hands stop consulting your brain about them. A set of cups is under twenty pounds and the whole thing is gloriously pointless.  
`long-term · 1-2-hours-week · inside · at-home · solo · low-budget`  
`[2, 4, 1, 4, 1, 8, 6]` leans **Novelty**

**Cold brew coffee**  
Coarse grounds, cold water, eighteen hours in the fridge, then strain it. No equipment beyond a jar and a sieve, and the result is stronger and far less bitter than you expect.  
`long-term · 1-2-hours-week · inside · at-home · solo · low-budget`  
`[2, 1, 3, 5, 1, 4, 1]` leans **Analytical**

**Read military history properly**  
Work through campaign histories that explain the logistics rather than just the battles, and follow the decisions instead of the outcomes. Library territory mostly, and it rewards taking notes.  
`long-term · 1-2-hours-week · inside · at-home · solo · free`  
`[1, 1, 1, 8, 1, 5, 2]` leans **Analytical**

**Sketch buildings from a bench**  
Sit somewhere with a good roofline and draw what is actually there — the brick courses, the drainpipe, the window that is not quite straight. A pencil and a pad, and the weather decides how long you get.  
`long-term · 1-2-hours-week · inside · outside · at-home · in-nature · solo · low-budget`  
`[1, 3, 9, 3, 6, 5, 2]` leans **Creative** — Vocabulary gap: the true setting is 'out in the town', which at-home/facility/in-nature cannot express. Tagged at-home + in-nature because both are real venues for it. Flagged in the review.

**Hand-stitch a felt wallet**  
Cut thick wool felt, mark your holes, and saddle-stitch with waxed thread until it holds together. Materials come to a few pounds and the result is a cardholder you will actually carry.  
`long-term · 1-2-hours-week · inside · at-home · solo · low-budget`  
`[1, 2, 7, 3, 1, 6, 1]` leans **Creative**

**Build a cardboard automaton**  
Cardboard, skewers and glue, arranged so that turning a crank makes something nod or flap. Almost free, genuinely clever, and the first mechanism that works properly is a small triumph.  
`long-term · 1-2-hours-week · inside · at-home · solo · low-budget`  
`[2, 2, 9, 8, 1, 8, 3]` leans **Creative**

**Small engine repair**  
Buy a mower that will not start, work out whether it is fuel, spark or air, and fix it. Non-runners are cheap or free, and the diagnosis is more satisfying than the repair.  
`long-term · 5-hours-week · outside · at-home · solo · low-budget`  
`[1, 5, 2, 9, 4, 7, 3]` leans **Analytical**

**Classic car market research**  
Follow the auction results, learn which chassis numbers matter, and build a real view on what is undervalued. Free to research and extremely expensive to act on.  
`long-term · 1-2-hours-week · inside · at-home · solo · free`  
`[2, 1, 1, 10, 1, 6, 4]` leans **Analytical**

**Antiquarian book collecting**  
Learn to read a title page, spot a genuine first edition, and tell honest wear from damage. Fairs and junk shops keep the hunt cheap; the books you actually want will not be.  
`long-term · 1-2-hours-week · inside · at-home · facility · solo · investment-required`  
`[3, 2, 2, 7, 1, 7, 3]` leans **Analytical**

**Sport lockpicking**  
A clear practice padlock and a pick set, and the slow understanding of how pin tumblers actually fail. Legal on locks you own — and only on locks you own.  
`long-term · 1-2-hours-week · inside · at-home · solo · low-budget`  
`[1, 2, 2, 9, 1, 9, 4]` leans **Analytical**

**Amateur radio**  
Study for the foundation licence, then build an antenna and talk to a stranger three countries away. The exam is cheap; the radio is where the money goes.  
`long-term · 5-hours-week · inside · outside · at-home · solo · social · investment-required`  
`[6, 2, 3, 9, 3, 9, 4]` leans **Analytical**

**Kite surfing lessons**  
Start with a trainer kite on a field, then take proper lessons before you go anywhere near deep water. This is an expensive sport with a real learning curve, and teaching yourself is how people get hurt.  
`long-term · weekend-blocks · exertion · outside · in-nature · facility · social · investment-required`  
`[5, 9, 2, 5, 10, 9, 10]` leans **Outdoors**

**A glassblowing taster class**  
One studio session where you gather molten glass on the end of a pipe and make something pleasingly wobbly. Not cheap for a few hours, but there is no other way to find out whether the heat and the timing suit you.  
`quick-fix · half-day · long-term · weekend-blocks · exertion · inside · facility · solo · social · investment-required`  
`[5, 6, 8, 4, 1, 9, 6]` leans **Novelty**

**Orchid cultivation**  
Work out the light, humidity and watering rhythm that makes a moth orchid re-bloom instead of sulking. A supermarket plant costs a few pounds and the whole skill is in doing less than you think.  
`long-term · 1-2-hours-week · inside · at-home · solo · low-budget`  
`[1, 2, 3, 6, 2, 6, 1]` leans **Analytical**

**Historical European martial arts**  
Learn longsword or rapier from the surviving manuscripts, at a club that will lend you a blunt to start with. Kit adds up if you stay, and the clubs are far friendlier than the swords make them sound.  
`long-term · 5-hours-week · exertion · inside · facility · social · investment-required`  
`[8, 8, 2, 7, 1, 10, 8]` leans **Novelty**

**Watchmaking and horology**  
Take a cheap mechanical movement apart, oil it, and get it running again without losing a screw into the carpet. Tools and a loupe are a real investment and the tolerances are unforgiving.  
`long-term · 5-hours-week · inside · at-home · solo · investment-required`  
`[1, 1, 4, 10, 1, 9, 3]` leans **Analytical**

**A blacksmithing taster day**  
A day at a forge, heating steel until it moves and hammering it into a hook or a knife. Introductory courses are widely available and priced like a good day out, which is exactly what it is.  
`quick-fix · half-day · long-term · weekend-blocks · exertion · inside · outside · facility · solo · social · investment-required`  
`[5, 9, 7, 4, 3, 9, 7]` leans **Energy**

**Stand-up paddleboarding**  
An inflatable board, a calm lake, and about ten minutes of falling in before it clicks. The board is the whole cost and it packs down into a rucksack.  
`long-term · 1-2-hours-week · exertion · outside · in-nature · solo · couple · social · investment-required`  
`[4, 7, 1, 3, 10, 7, 5]` leans **Outdoors**

**Parkour, at a class**  
Vaults, rolls and landings, learned on gym mats long before anything involving a wall. Find a coached session — this is the one where teaching yourself off videos goes badly.  
`long-term · 5-hours-week · exertion · inside · facility · social · low-budget`  
`[7, 10, 3, 5, 2, 9, 9]` leans **Energy**

**Restore a vintage typewriter**  
Free a seized carriage, clean fifty years of grime off the typebars, and get it clicking again. Junk-shop machines are cheap and ribbon is easier to find than you would think.  
`long-term · 1-2-hours-week · inside · at-home · solo · low-budget`  
`[1, 3, 4, 7, 1, 7, 2]` leans **Analytical**

**Urban beekeeping**  
A hive on a roof or at the end of a garden, and a full year of learning before there is any honey. Real money up front, a proper time commitment, and you will need to check both the local rules and your neighbours.  
`long-term · 5-hours-week · exertion · outside · at-home · in-nature · solo · social · investment-required`  
`[4, 5, 2, 7, 8, 9, 5]` leans **Novelty**

**Scuba certification**  
Pool sessions, then the theory, then open water with an instructor and a buddy. The course is a serious cost and the rule that matters most is that you never dive alone.  
`long-term · weekend-blocks · exertion · outside · facility · in-nature · social · investment-required`  
`[8, 7, 1, 7, 9, 10, 8]` leans **Novelty**

**Block out your week on one page**  
Draw the week as a grid and put deep work, admin and actual rest into it as blocks. Twenty minutes, and the useful part is seeing how little is left once sleep is on there.  
`quick-fix · 1-hour · inside · at-home · solo · free`  
`[1, 1, 2, 6, 1, 3, 2]` leans **Analytical**

**Bake rosemary sea salt crackers**  
Roll the dough thinner than feels sensible, scatter salt and rosemary, and watch them closely for the last two minutes. Store-cupboard ingredients and about forty minutes start to finish.  
`quick-fix · 1-hour · inside · at-home · solo · low-budget`  
`[2, 3, 5, 3, 1, 4, 2]` leans **Creative**

**Study old maps**  
Open high-resolution scans of seventeenth-century world maps and work out what they got wrong and why. Free through the national library collections, and the sea monsters are load-bearing.  
`quick-fix · 1-hour · inside · at-home · solo · free`  
`[1, 1, 2, 5, 1, 7, 2]` leans **Novelty**

**Identify trees by their bark**  
Walk a familiar bit of woodland and learn to tell oak, beech and birch apart without looking anything up. Free, and it permanently changes what a walk looks like.  
`quick-fix · 1-hour · outside · in-nature · solo · couple · free`  
`[2, 3, 1, 5, 9, 6, 1]` leans **Outdoors**

**Watch a film like a cinematographer**  
Pick one scene you already know well and work out why it feels the way it does — the lens, the light, where the camera is standing. Free, and it ruins nothing and improves everything.  
`quick-fix · 1-hour · inside · at-home · solo · couple · free`  
`[2, 1, 4, 6, 1, 5, 2]` leans **Analytical**

**Learn Morse code**  
Start with your own initials, then work up to short messages decoded by ear with a pen and paper. Free apps generate the audio, and it turns out to be more rhythmic than technical.  
`quick-fix · 10-mins · inside · at-home · solo · free`  
`[1, 1, 1, 5, 1, 7, 3]` leans **Novelty**

**Repair a broken book spine**  
Neutral-pH glue, archival tape, and a careful hour reattaching a spine that has given up. The materials cost a few pounds and will fix a whole shelf's worth of books.  
`quick-fix · 1-hour · inside · at-home · solo · low-budget`  
`[1, 2, 4, 4, 1, 5, 1]` leans **Novelty**

**Sequence a playlist properly**  
Order forty minutes of music the way an album is ordered — by key, by tempo, by what the previous track has earned. Free, and the gap between this and a shuffle is enormous.  
`quick-fix · 1-hour · inside · at-home · solo · free`  
`[2, 1, 7, 4, 1, 4, 2]` leans **Creative**

**Plot a running route worth running**  
Use mapping software to build a five or ten kilometre loop that avoids the main roads and finishes near a bakery. Free, and the planning is genuinely half the pleasure.  
`quick-fix · 1-hour · inside · at-home · solo · free`  
`[1, 1, 2, 5, 3, 4, 2]` leans **Analytical**

**Write with your other hand**  
Do the shopping list, or a diary entry, with the hand you never use for anything. Free, briefly infuriating, and oddly good for the part of your brain that has gone quiet.  
`quick-fix · 10-mins · inside · at-home · solo · free`  
`[1, 2, 3, 3, 1, 7, 2]` leans **Novelty**

**Play through a famous chess game**  
Pull up the Immortal Game, or Fischer at thirteen, and step through it move by move guessing before you look. Free everywhere, and far more instructive than another game of blitz.  
`quick-fix · 1-hour · inside · at-home · solo · free`  
`[1, 1, 1, 10, 1, 5, 3]` leans **Analytical**

**Turn bottles into vases**  
Soak the labels off in warm water and oil, scrub the glue away, and put something from the garden in them. Free, and it takes an evening of roughly half your attention.  
`quick-fix · 1-hour · inside · at-home · solo · free`  
`[1, 2, 6, 2, 1, 4, 1]` leans **Creative**

**Clear out the camera roll**  
Delete the eleven near-identical photos of the same thing, and empty the downloads folder while you are in there. Free, tedious, and the phone will thank you.  
`quick-fix · 1-hour · inside · at-home · solo · free`  
`[1, 1, 1, 2, 1, 1, 1]` leans **Analytical**

**Put the radio on**  
Live discussion on Radio 4, or the first episode of the narrative podcast someone keeps recommending. Free, and it counts — not everything has to be a project.  
`quick-fix · 10-mins · 1-hour · inside · at-home · solo · free`  
`[1, 1, 1, 2, 1, 4, 2]` leans **Novelty**

**Write a quiz for the house**  
Fifteen questions across history, sport and whatever everyone argues about, pitched so that nobody scores zero. Free, an hour to write, and the arguments afterwards are the whole point.  
`quick-fix · 1-hour · inside · at-home · couple · social · free`  
`[8, 1, 6, 6, 1, 5, 5]` leans **Social**

**Translate a news article line by line**  
Take a short piece in the language you are learning and work through it properly with the dictionary open. Free, and it teaches you more idiom in an hour than an app manages in a week.  
`quick-fix · 1-hour · inside · at-home · solo · free`  
`[1, 1, 2, 7, 1, 6, 2]` leans **Analytical**

**Three bullets on today's markets**  
Read the front half of the FT and write three lines on what actually moved and why. Free with a library login, and doing it daily is the thing that makes it work.  
`quick-fix · 10-mins · inside · at-home · solo · free`  
`[1, 1, 2, 9, 1, 4, 3]` leans **Analytical**

**Check the car's fluids**  
Oil, coolant and screenwash, with the engine cold and the bonnet propped properly. Ten minutes, needs a car, and it is the cheapest breakdown you will ever avoid.  
`quick-fix · 10-mins · outside · at-home · solo · free`  
`[1, 3, 1, 4, 4, 3, 1]` leans **Analytical**

**Sort the spice drawer**  
Everything out, the drawer wiped, anything older than you can remember thrown away, and the rest in an order you will actually maintain. Free and disproportionately satisfying.  
`quick-fix · 1-hour · inside · at-home · solo · free`  
`[1, 2, 1, 2, 1, 1, 1]` leans **Energy**

**Learn the NATO alphabet**  
Alpha through Zulu, learned well enough to spell your surname down a bad phone line without hesitating. Free, twenty minutes, and permanently useful.  
`quick-fix · 10-mins · inside · at-home · solo · free`  
`[2, 1, 1, 3, 1, 4, 2]` leans **Novelty**

**Foam roll everything that hurts**  
Half an hour on a roller and a lacrosse ball, working through calves, quads and upper back. The kit is about fifteen pounds and the first pass is not enjoyable.  
`quick-fix · 1-hour · inside · at-home · solo · low-budget`  
`[1, 4, 1, 2, 1, 2, 3]` leans **Energy**

**Tie a half-Windsor**  
Stand at the mirror and tie it until the knot comes out symmetrical and the tip lands at your belt. Two minutes once it clicks, and it stays learned.  
`quick-fix · 10-mins · inside · at-home · solo · free`  
`[1, 2, 2, 3, 1, 4, 2]` leans **Novelty**

## Proposed vector corrections to existing rows

⚠️ **Proposals only. Nothing is edited until you approve.** These are the existing seed rows
re-read against The 7-axis rubric. Rows not listed were read and left alone.

| Title | Current | Proposed | Leans (was → now) | Why |
|---|---|---|---|---|
| Learn one card flourish | `3,3,6,4,1,6,4` | `1,3,3,4,1,6,3` | Creative → **Novelty** | Creative 6→3 and Social 3→1: a flourish is a learned move, not an open-ended output, and it is practised alone in front of a mirror. |
| Cook from whatever is already in the fridge | `3,4,7,5,1,6,5` | `3,4,7,5,1,5,3` | Creative | Stimulation 5→3: improvising dinner is absorbed, not stakes. Creative 7 stands — this genuinely is open-ended making. |
| A walk with no destination | `1,6,2,3,8,3,2` | `1,4,1,1,8,3,1` | Outdoors | Energy 6→4 and Analytical 3→1: an aimless walk is light movement with nothing to solve. The rubric's 1 on Stimulation is exactly this. |
| Reset one single surface | `1,4,2,4,1,1,2` | `1,3,1,2,1,1,1` | Energy | Analytical 4→2: clearing one surface involves no problem-solving. |
| Ten minutes of mobility work | `1,7,1,3,1,2,3` | `1,4,1,2,1,2,1` | Energy | Energy 7→4 and Stimulation 3→1: mobility work is deliberately gentle and calming — nowhere near sweat-guaranteed. |
| Run a quiz round on whoever is nearby | `9,2,3,7,1,4,7` | `9,2,3,7,1,4,5` | Social | Stimulation 7→5: a kitchen-table quiz is pleasantly engaging. The liveliness is already carried by Social 9. |
| Kickabout at the nearest bit of grass | `8,8,2,2,8,3,7` | `8,8,1,2,8,3,5` | Social | Stimulation 7→5: a kickabout has no score and no stakes — that is what distinguishes it from a match. |
| Walk a street you have never walked down | `5,5,4,3,9,9,4` | `5,5,1,3,9,9,3` | Outdoors | Creative 4→1: nothing is made or expressed. The interest here is Novelty, which is already 9. |
| A board game short enough to actually finish | `8,2,3,6,1,4,6` | `8,2,1,6,1,4,5` | Social | Creative 3→1: playing to someone else's rules makes nothing. |
| Knockabout on a public court | `7,8,1,3,7,3,7` | `7,8,1,3,7,3,5` | Energy | Stimulation 7→5: 'knockabout' is explicitly the non-competitive version. |
| Learn a two-player card game neither of you knows | `8,2,3,6,1,9,5` | `8,2,1,6,1,9,5` | Novelty | Creative 3→1: learning rules makes nothing. Novelty 9 already carries what is interesting about it. |
| Blind taste test whatever is in the cupboard | `8,2,4,6,1,8,9` | `8,2,1,6,1,8,5` | Stimulation → **Social** | Stimulation 9→5 and Creative 4→1. A cupboard taste test is a party game, not adrenaline — this was the clearest side-effect score in the catalogue, and it was one of only two Stimulation-dominant rows. |
| Spanish language practice | `6,2,3,7,2,8,5` | `4,2,2,7,2,8,3` | Novelty | Social 6→4 and Stimulation 5→3: most practice is solo with an app, and study is engaging rather than intense. |
| Small-build woodworking | `2,5,8,5,2,5,4` | `2,5,8,5,2,5,2` | Creative | Stimulation 4→2: quiet absorbed making. Creative 8 stands. |
| Indoor bouldering | `6,9,3,6,2,6,8` | `6,9,1,6,2,6,7` | Energy | Creative 3→1: nothing is made — reading a route is Analytical, which is already 6. Stimulation stays high; the height and the fall are real. |
| Learning guitar | `4,3,9,4,1,5,6` | `4,3,9,5,1,5,4` | Creative | Stimulation 6→4: practising alone has no stakes. Analytical 4→5 for the theory and chord shapes that genuinely are a system. |
| Trail running and hillwalking | `3,9,2,3,10,6,7` | `3,9,1,3,10,6,5` | Outdoors | Stimulation 7→5: endurance rather than adrenaline. The effort is already Energy 9. |
| Build a small tool you actually use | `1,2,6,9,1,6,5` | `1,2,6,9,1,6,3` | Analytical | Stimulation 5→3: solving a problem at a desk is absorbing, not intense. |
| Restoring a vintage bicycle | `2,5,6,7,4,5,4` | `2,5,4,7,4,5,2` | Analytical | Creative 6→4 and Stimulation 4→2: restoration is making within rules — returning something to spec rather than open-ended creation. |
| Singing in a local choir | `8,4,7,2,1,6,6` | `8,4,5,4,1,6,4` | Social | Creative 7→5 and Stimulation 6→4: you are performing someone else's arrangement. Analytical 2→4 because reading parts and holding harmony genuinely is a system. |
| Social dance classes | `9,7,6,3,1,7,8` | `9,7,4,4,1,7,5` | Social | Creative 6→4 and Stimulation 8→5: a class teaches set steps, and the enjoyment is social rather than adrenal — Social is already 9. |
| Club road cycling | `7,9,1,4,9,4,8` | `7,9,1,4,9,4,6` | Energy | Stimulation 8→6: riding in a group at speed has genuine stakes, but less than the score implied relative to open-water swimming. |
| Geocaching | `5,6,3,7,8,10,6` | `5,6,1,7,8,7,4` | Novelty → **Outdoors** | Creative 3→1, Novelty 10→7, Stimulation 6→4: nothing is made, and a hobby with millions of participants is not a world most people never touch. |
| Skateboarding at a public park | `5,8,5,3,7,6,10` | `5,8,1,3,7,6,10` | Stimulation | Creative 5→1. This is the row CLAUDE.md names: skating expresses style but makes nothing, and that phantom Creative 5 is what pushed it away from a corrected Stimulation purist. Stimulation 10 stands — the falls are real. |

## Fuzzy dedupe against the existing catalogue

4 candidate(s) at or above 0.5. **Reported, not dropped** —
a high score can mean a genuine duplicate or just a shared word.

| Score | Wave title | Existing seeded title |
|---|---|---|
| 1.00 | Indoor bouldering | Indoor bouldering |
| 0.76 | Hiking and hillwalking | Trail running and hillwalking |
| 0.62 | Fifteen-minute mobility flow | Ten minutes of mobility work |
| 0.58 | Restore a vintage typewriter | Restoring a vintage bicycle |

## Template families

The anti-clone rule caps a wave at 2 entries per template family. Counted, not asserted:

- `build X` — 6 ⚠️ over the cap: Build a miniature diorama; Build a blanket fort; Build and paint a scale model; Build a mechanical keyboard; Build an Arduino weather station; Build a cardboard automaton
- `learn/study X` — 5 ⚠️ over the cap: Learn three knots that matter; Learn to moonwalk; Study old maps; Learn Morse code; Learn the NATO alphabet
- `make X` — 3 ⚠️ over the cap: Make a zine; Make a lemon posset; Bake rosemary sea salt crackers
- `plan/design X` — 3 ⚠️ over the cap: Map a historic walking tour; Plan a trip you may never take; Design an icon set
- `identify X` — 2: Identify garden birds; Identify trees by their bark
- `restore X` — 2: Restore a cast iron skillet; Restore a vintage typewriter
- `organise X` — 1: Sort the spice drawer

## Axis balance

### The existing catalogue, before this wave

```
  DOMINANT AXIS — which axis each activity leans into (37 rows)

    Social          7   18.9%  #########################
    Energy          6   16.2%  #####################
    Creative        8   21.6%  ############################
    Analytical      5   13.5%  ##################
    Outdoors        6   16.2%  #####################
    Novelty         3    8.1%  ###########
    Stimulation     2    5.4%  #######

  PER-AXIS RANGE — is the axis a real dimension, or stuck near one value?

    Axis          min   mean  max  spread  stdev
    Social          1   4.65    9       8   2.72
    Energy          1   4.78   10       9   2.55
    Creative        1   4.14    9       8   2.52
    Analytical      2   4.92   10       8   2.12
    Outdoors        1   3.95   10       9   3.49
    Novelty         1   5.11   10       9   2.08
    Stimulation     2   5.43   10       8   2.15
```

### This wave alone

```
  DOMINANT AXIS — which axis each activity leans into (99 rows)

    Social          4    4.0%  ####
    Energy         13   13.1%  #############
    Creative       23   23.2%  #######################
    Analytical     28   28.3%  ############################
    Outdoors        9    9.1%  #########
    Novelty        20   20.2%  ####################
    Stimulation     2    2.0%  ##

  PER-AXIS RANGE — is the axis a real dimension, or stuck near one value?

    Axis          min   mean  max  spread  stdev
    Social          1   2.42   10       9   2.17
    Energy          1   3.14   10       9   2.66
    Creative        1   3.46   10       9   2.62
    Analytical      1   4.84   10       9   2.43
    Outdoors        1   2.58   10       9   2.84
    Novelty         1   5.55   10       9   2.05
    Stimulation     1   3.09   10       9   2.01
```

### Combined, if every survivor lands (audit corrections applied)

```
  DOMINANT AXIS — which axis each activity leans into (136 rows)

    Social         12    8.8%  ##########
    Energy         19   14.0%  ################
    Creative       30   22.1%  #########################
    Analytical     33   24.3%  ############################
    Outdoors       16   11.8%  ##############
    Novelty        23   16.9%  ####################
    Stimulation     3    2.2%  ###

  PER-AXIS RANGE — is the axis a real dimension, or stuck near one value?

    Axis          min   mean  max  spread  stdev
    Social          1   3.00   10       9   2.53
    Energy          1   3.54   10       9   2.70
    Creative        1   3.41   10       9   2.66
    Analytical      1   4.85   10       9   2.37
    Outdoors        1   2.95   10       9   3.09
    Novelty         1   5.40   10       9   2.03
    Stimulation     1   3.43   10       9   2.11
```

