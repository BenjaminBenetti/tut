# C3a: Hive Assault and the Great Hive

Package C3a of #1179. The job was to make Hive Assault and the Great
Hive winnable at the arc's rates. At the matrix's round-2 baseline
(`3ef36fc5`, before this package) both players won none of
`hive-assault/act-2` and none of the Great Hive (see `README.md`, "Why
the hive cells sat at 0%").

**Round 3** built two of the shape options Ben chose from: a forward
extraction point past halfway down the Great Hive, and a shorter Great
Hive cavern (72 × 152). It then paid the new player's extra wins back
with bigger, rarer nest hatches. All of it applies only to the Great
Hive. See "Round 3: a forward extraction point and a shorter Great
Hive".

**Round 3** on the Great Hive, before (int/w1 `b9e67201`, as round 2)
and after (`9b5c2bc6`):

| Seeds | New player, before | New player, after | Expert, before | Expert, after |
| --- | --- | --- | --- | --- |
| the matrix's 16 | 8 (3 clean, 5 at the cap); 13 runs at the cap | 5 (2 clean, 1 at the cap, 2 stall); 12 runs at the cap | 16, median 42 | 15 (11 clean, 4 stall), median 33.5 |
| 128, in the probe | 55 (31 clean, 24 at the cap); 97 runs at the cap | 62 (39 clean, 18 at the cap, 5 stall); 77 runs at the cap | 127, median 44 | 126, median 29 |

The first unit now boards a median of 7 turns after the core falls,
against 18. With this cell the new player's Act III band on
`b9e67201` is 112/160 (70.0%), against 115 (71.9%) today and a ceiling
of 116. The matrix's 16 seeds read the cell 3 wins lower than today;
over 128 seeds it wins 0.85 more a cell.

**This package's round 2** re-measured the cells at 16 seeds on C2c's
filled forces (eight units, three of them mechs) and quickened the hive
nests from difficulty 6. The Great Hive was left alone (see "Round 2:
the filled forces"):

| Cell | Target, new / expert | Round 2 before, new / expert | Round 2 after, new / expert | Wins by the abandon rule, after |
| --- | --- | --- | --- | --- |
| `hive-assault/act-2` | 75% / ≥ 90% | 16/16 / 16/16 | 12/16 (75%) / 16/16 | none |
| `hive-assault/act-3` | 65% / ≥ 90% | 15/16 / 16/16 | 11/16 (69%) / 16/16 | new 1 stall, expert 2 stall |
| `story:great-hive/act-3` | 65% / ≥ 90% | 8/16 / 16/16 | 8/16 (50%) / 16/16 | new 5 cap |

**Round 1** (C2a's forces, 12 seeds after):

| Cell | Target, new / expert | Before, new / expert (8 seeds) | After, new / expert (12 seeds) | Expert turns to win |
| --- | --- | --- | --- | --- |
| `hive-assault/act-2` | 75% / ≥ 90% | 0/8 / 0/8 | 8/12 (67%) / 10/12 (83%) | 30–38 |
| `hive-assault/act-3` | 65% / ≥ 90% | 0/8 / 5/8 | 12/12 / 12/12 | 20–31 |
| `story:great-hive/act-3` | 65% / ≥ 90% | 0/8 / 0/8 | 9/12 (75%) / 12/12 | 34–44, median 39 |

In round 1 Act II was one seed short for each player, and Act III's
new player was well above its target (see "Unmet targets (round 1)").
Round 2 closes both.

## How the numbers were taken

A scratch probe, not committed, played each cell through the matrix's
own code: `startRun`, `playerFor` and `playMission` from
`calibration-run.test-helper.ts`, with the 60-turn cap and each player
on its own dice. It also recorded per run:

- the broods woken, with the cause and the turn;
- where each unit died;
- the bugs from nests and from the edge;
- the turn the core was seen and the turn it fell;
- how close the force got to the core.

Unless marked, runs are 8 seeds. The difficulty is the act's low end
plus the seed mod 5: act-2 d3–7, act-3 d5–9, Great Hive d8.
`baseline-matrix.tsv` was not re-run or edited.

## Reproduction

At `8bf21fba`, 8 seeds, the probe matched the committed baseline. New
player first, then expert:

| Cell | New | Expert | Bugs at start | Bugs from the edge | Bugs from nests | Core seen |
| --- | --- | --- | --- | --- | --- | --- |
| act-2 | 0/8 | 0/8 (4 extracted) | 48–81 | 22–87 | 12–42 | never |
| act-3 | 0/8 | 5/8 | 52–86 | 60–140 | 25–110 | expert, 6 of 8 seeds |
| Great Hive | 0/8 | 0/8 | 68–78 | 97–138 | 89–120 | expert, 2 of 8 seeds |

## Diagnosis: partly confirmed, partly overturned

**Confirmed for Act II: the broods did it, with the nests and waves.**
The README blamed the brood. Taking out both the broods and the waves
(run `s1-e3`) lifted act-2 only to 3/8 for the expert and 1/8 for the
new player. The chamber nests still hatched 22–77 bugs. Cutting the
nests too (`e4b`, nest hatch −2) gave 8/8 and 8/8. So the brood, the
edge waves and the nests each cost Act II.

**Overturned for the Great Hive: the walk was not the cap.** With no
broods and no waves the expert won 6/8, in 30–39 turns, so the walk fits
under the cap. What killed it:

1. **The nests.** They hatched 89–120 bugs a mission.
2. **A search bug.** `backOfMap` took the first 16 far tiles in the
   map's tile order. On two seeds of eight those were a side tunnel's
   dead end, and both players searched it until the cap. The fix, run
   H1 → H1b, took the expert from 6/8 to 8/8.
3. **The driver's stall rule.** It abandoned a force still walking a
   200-step cavern home: 10 turns with nobody out counted as a stall.

## What changed

**Mission (shipped code).**

- **Brood size.** `BROOD_TUNING` is now base −5, +2 per difficulty,
  minimum 3, with the core role at 1 (was 1.5). Brood sizes by
  difficulty:

  | Difficulty | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
  | --- | --- | --- | --- | --- | --- | --- | --- |
  | Route and core | 3 | 3 | 5 | 7 | 9 | 11 | 13 |
  | Side | 3 | 3 | 4 | 5 | 7 | 8 | 10 |

- **Wake zone.** New `wake.zoneShare` 0.35 and `minZoneRadius` 3. A
  brood sleeps, and wakes, within 35% of its chamber's radius (3–5
  tiles) rather than the whole chamber. This leaves a rim a force can
  walk past (`wakeRadius`, `broodPositions`).
- **Hive nests.** They hatch one bug every 11–12 turns: hatch −1, and a
  new optional `Spawner.hatchInterval` of the usual interval + 8.
  `edgeWaves: 0` takes the burrow waves out, and `quietBurrows` keeps
  the burrow spawners silent.
- **Great Hive.** Core HP 200 → 150 (+20 a level). Brood growth is 0.5
  per difficulty, giving route 8, side 6 and core 8 at d8.

**Players (test helpers).** The new player's policy is unchanged.

- **Expert, in `brood-berth`:**
  - It remembers sleepers it has lost sight of.
  - It reads each brood's round off its sleepers (`readBroods`,
    `BROOD_LINK` 6, `BROOD_MARGIN` 2) and keeps a berth of 3 round each
    sleeper.
  - In a cavern where broods sleep, it walks no further than ground it
    has seen (`crossesUnseen`).
- **Hive-core strategy, shared by both players:**
  - `backOfMap` now takes the farthest tiles first.
  - Once the back has been seen with no core in it, the force searches
    the frontier nearest the back.
  - A new `longWalkHome` flag tells the driver that a unit getting
    nearer home is progress, not a stall.
  - Only the hive-core strategy reads any of these.

## Levers: design questions and measurements

The predictions were made before each run in the working session but
were not written to disk. The "expected" column is reconstructed from
the design question each run asked, so read it as a direction, not a
recorded number. Results are wins, expert / new.

| Run | Lever | Expected | act-2 | act-3 | Great Hive |
| --- | --- | --- | --- | --- | --- |
| s1-e3 | no broods, no waves | act-2 opens up | 3/1 | 8/8 | 6/1 |
| e4b | … and nest hatch −2 | act-2 solved | 8/8 | – | – |
| w1 | wake zone 0.5 of the chamber | rim to walk round; expert up | 0/0 | 5/0 | 2/0 |
| c1–c3, d2–d4 | berth 3–8, margin, zone 0.35–0.5 (expert only) | fewer walk-in wakes | 0 | 5–7 | 1–3 |
| A / B | + 2 or 4 edge waves, nest −1 | waves the cheaper pressure | 0/0 | 8/6, 8/5 | 6/0 |
| C | zone 0.35, berth 3, nest −1, 2 waves, base 1 +1.25/d | act-3 and GH up | 0/0 | 8/7 | 6/0 |
| E1–E3 | act-2: nest −1/−2 × waves 0/2 | nests over waves | 2/3, 1/0, 4/6 | – | – |
| H1 | base −5 +2/d, nest −2, no waves | Act II small, Act III grows | 6/7 | 8/8 | 6/6 |
| H1b | + `backOfMap` farthest first | GH dead-end seeds won | 6/7 | 8/8 | 8/8 |
| H2–H4 | nest −1; old sizes with waves | the lever is the brood size | 3/1, 0/0, 2/1 | 8/7–8/8 | 5/0, 8/0, 8/0 |
| I1 / I2 | nest −1, first hatch +4 / +8 | slower nests, new player up | 4/4, 5/5 | 8/8 | 8/2, 8/4 |
| I3–I5 | expert focus, quiet guns, pulling a brood to a choke | expert up | no gain | – | – |
| J1 | core brood role 1.5 → 1 | Act II core brood smaller | 7/6 | 8/8 | 8/6 |
| J2, K1, K2 | steeper growth (−8 +2.5/d, −13 +3/d), core role 0.75 | Act II smaller, Act III kept | 6/6, 7/6, 7/6 | 8/8 | 8/6 (J2) |
| J3 | Hive core HP 45, GH base 2, GH core 150 | core time, GH walk | 7/6 | 8/8 | 8/8 |
| L1 / L2 | 1 wave; nest hatch 0 | waves and nests cost Act II | 3/3, 6/2 | 8/8 | 8/4, 8/1 |
| M1 (12 seeds) | the shipped values, GH core 150 | final | 10/8 | 12/12 | 12/9 |
| M2 / M3 (12) | core role 0.75; base −3 +1.5/d | act-2 +1 | same, 9/8 | – | – |
| N2 (12) | ordinary hive core guards 2 → 1 | act-2 +1 | 8/7 | – | – |

What these runs showed:

- The expert-only walk-round habits (w, c and d runs) did nothing for
  Act II. At the old sizes a woken route brood of 11–13 was more than
  the Act II force could fight, however it walked.
- The brood size (base −5, +2 per difficulty) was the lever that
  separates Act II from Act III.
- Nest pace was the second lever. With no nest delay the new player
  lost every Great Hive at the cap (H4: 0/8). A delay of +8 brought it
  to 4/8 (I2), and with the core at 150 it reached 9/12 (M1).

## Final cells (round 1 head, 12 seeds)

| Cell | Player | Won | Turns to win | Units lost, mean | Broods woken per run | Core seen, turn |
| --- | --- | --- | --- | --- | --- | --- |
| act-2 | expert | 10/12 (+1 extracted) | 30–38 | 3.25 | 1.7 | 12–23 |
| act-2 | new | 8/12 | 39–56 | 3.17 | 3.3 | 17–38 |
| act-3 | expert | 12/12 | 20–31 | 2.42 | 1.8 | 7–11 |
| act-3 | new | 12/12 | 31–57 | 3.33 | 3.8 | 12–40 |
| Great Hive | expert | 12/12 | 34–44 | 3.25 | 2.7 | 13–18 |
| Great Hive | new | 9/12 | 55–61 | 6.08 | 5.8 | 26–47 |

**Decisions, not dice.** The expert was also run on the new player's
dice:

| Cell | Expert on the new player's dice | New player |
| --- | --- | --- |
| act-2 | 9/12 | 8/12 |
| act-3 | 12/12 | 12/12 |
| Great Hive | 12/12, turns 36–52 | 9/12 |

On the same dice, the expert:

- wakes about half as many broods: 1.6 / 1.9 / 2.6 a run against the
  new player's 3.3 / 3.8 / 5.8;
- sees the core 10–18 turns sooner (median turn 14 / 9 / 13.5 against
  27 / 19 / 32);
- wins 13–20 turns sooner (median turn 35 / 27.5 / 41 against
  49.5 / 41 / 61).

In win rate, the gap is one seed on act-2 and none on act-3.

**The new player's Great Hive wins end at the cap.** Seven of its nine
wins end at the 60-turn cap. In those runs the core fell on turns
34–42 and the first units were out on turns 45–58. The driver then
leaves the mission, which counts as won because the core is down and
someone is aboard (`abandon-mission-handler.ts`). 5–7 of the 8 units
are left behind still walking out. Only seeds 5 and 8 finish inside
the cap (55 and 57 turns). With a cap of 50, only the 4 seeds with a
unit out by turn 50 would count as wins.

## Unmet targets (round 1)

- **act-2 is one seed short for each player:** 83% against 90% for the
  expert, 67% against 75% for the new player. That is inside the ±2 in
  12 seed noise.
  - The expert's losses are all at d5–7 and the new player's mostly at
    d6–7, the top of the band.
  - M3 (gentler growth) and N2 (one core guard instead of two) each
    lost act-2 a seed or two. That is noise; the remaining losses do
    not respond to either lever.
  - Brood sizes are shared with Act III, so a further cut makes
    act-3's new player easier still.
- **act-3's new player wins 12/12 against a 65% target.** act-3's
  difficulty band (5–9) overlaps act-2's (3–7), but act-3 brings a far
  stronger force. At the settings where act-3's new player was near
  65% (runs A and B: 6/8 and 5/8, at the old brood sizes), act-2 was
  0/8 for both players.
  - The fix is a lever scaled to the act: brood size, or nest pace, by
    act band.
  - Act-wide levers were frozen for this package, so this is Ben's
    call.

## Renders

Rendered with a node probe on the dev server (port 4252), at base and
at head, 1440 × 900. The force was staged in a route chamber (Hive
Assault) and south of the core (Great Hive). The head renders are
committed:

- `../c3a-hive-assault-brood.png` shows Act II, d4. At head the route
  brood is 3 sleepers at the chamber's middle (zone radius 3), and 3
  bugs are in sight. At base the same chamber held 11 at a radius of 8,
  with 69 sleepers in the cavern and 11 in sight.
- `../c3a-great-hive-core.png` shows the core at 150/150 with its guard
  ring, the core brood of 8 at radius 5, and 13 bugs in sight. At base
  the core was 200/200 with a core brood of 12 at radius 15 and 64
  sleepers.

## Frame time (Great Hive)

One node probe, headless chromium with SwiftShader, 1440 × 900: idle
frame rate and three End-turn cycles.

| | Load | Launch | Idle | End-turn cycles | Worst frame | Bugs |
| --- | --- | --- | --- | --- | --- | --- |
| base | ~57 | 8.9 s | 0.8 fps | 6.7 / 11.0 / 10.5 s | 3.3–4.5 s | 70–79 |
| head | ~21–25 | 5.4 s | 2.0 fps | 7.0 / 6.5 / 5.4 s | 2.3–2.6 s | 66 |

The machine load differed between the two runs, so this shows no
regression rather than a measured speed-up. The head numbers sit within the
range W4 recorded for an ordinary hive: 1.4–2.0 fps and 2.5–8.1 s
cycles.

## Pins

Each pin was sabotaged by reverting its value or deleting the behaviour
it guards; all 24 went red and were restored.

- `brood-placement-service.test.ts`:
  - brood sizes at d3–9 by role;
  - `wakeRadius` values;
  - the placement staying inside the wake zone.
- `great-hive-setup.test.ts`:
  - core HP 150 and 190;
  - broods at d8: 8/6/8 for the Great Hive, 11/8/11 for an ordinary
    hive.
- `hive-assault-setup.test.ts`:
  - the nest hatch bonus and pace;
  - one bug per hatch;
  - no edge waves;
  - the quiet burrows;
  - the tuning fields left undefined falling back to the old behaviour.
- `spawn-service.test.ts`: a spawner keeps its own pace.
- Player helpers:
  - sleeper memory, and `awakeView` forgetting it;
  - `readBroods` and its margin;
  - `crossesUnseen`, and the expert's filter for it;
  - `backOfMap` farthest first;
  - the unseen-back and frontier jobs;
  - `longWalkHome` and the driver's use of it;
  - strict "nearer" in `home-progress`.

`brood-phase.sim.test.ts` now times its sleeping hive at d10. At d5 the
new sizes give 19–33 bugs, under its floor of 50; at d10 the seeds give
56, 67 and 97.

## Deviations

Ben accepted the first three on 2026-09-28, and campaign arc §6.5 and
§7.5 now state them as the arc's decisions.

- **Wake rule.** Arc §7.5 said a brood wakes when a unit "enters the
  chamber". It now wakes on entering the heart of the chamber, 35% of
  the radius, or when shot or shelled nearby.
- **"50+ bugs" in a hive.** An Act II hive now sleeps 12–52 bugs, an
  Act III hive 19–88 and the Great Hive 44–60 (52–68 before round 3's
  shorter cavern). Arc §7.5's figure is
  reached only at about d8–9. Round 2 left the broods alone; its
  quicker nests add 13–86 bugs over a mission from d6 (see "Round 2").
- **No edge waves in a hive.** In round 1 hive nests hatched one bug
  every 11–12 turns; since round 2 that holds up to d5, and the nests
  quicken from d6.
- **The Great Hive core is 150 HP** (`great-hives.md` said 200), and its
  core brood is 8 (was 12).
- **Shared player code.** The hive-core strategy's search and walk-home
  changes affect the new player too. The mission sweep's non-hive rows
  are unchanged.
- **The nests are optional.** Arc §6.5 asked for the chamber spawners to
  be destroyed. The shipped objective is the core alone, and no
  objective counts the nests. Round 3 made §6.5 say so.
- **The Great Hive's forward extraction point and 72 × 152 cavern** are
  Ben's choice from the shape options (2026-09-28, round 3). Arc §6.5,
  §6.9 and §7.5 and `great-hives.md` state them.
- **The Great Hive's nests hatch three bugs every 6 turns at d8**
  (round 3b), where they kept the slow pace in round 2. Arc §6.5 and
  `great-hives.md` state it.

## Round 2: the filled forces

Round 1 measured against C2a's forces (Act II: one mech and four
squads). C2c then filled every band to eight units (`README.md`,
"Filling to eight"), and round 2 re-measured the three cells on them.

### Base, forces and command

- **Base** `f2a85ae4`: round 1 plus C2c's ruler, round 3 (`1bf3b242`).
  **Measured at** `e1d4d3b7`, whose tuning is `6cf7e6fa`.
- **Act II force:** four squads at 125 xp, a medic, and three Act II
  refit mechs (rating 142, force rating 614).
- **Act III force:** four squads at 225 xp, a medic, and three Act III
  refits (rating 236, 25 research nodes).
- **Seeds:** 16, the matrix default. Act II runs d3–7, Act III d5–9,
  the Great Hive d8.

```
SIM_MATRIX_CELLS=hive-assault,story:great-hive \
SIM_MATRIX_OUT=/tmp/hives.tsv \
  node_modules/.bin/vitest run --config vitest.sim.config.ts \
  --maxWorkers=8 src/app/service/calibration-matrix
```

### Before and after

| Cell | New before | New after | Band target | Expert before | Expert after | `expert_target` |
| --- | --- | --- | --- | --- | --- | --- |
| `hive-assault/act-2` | 16/16 (100%) | 12/16 (75%) | 75 | 16/16 | 16/16 | met |
| `hive-assault/act-3` | 15/16 (94%) | 11/16 (69%) | 65 | 16/16 | 16/16 | met |
| `story:great-hive/act-3` | 8/16 (50%) | 8/16 (50%) | 65 | 16/16 | 16/16 | met |

The filter covers one of Act II's eight cells and two of Act III's
nine, so the run's band rows are these cells alone, with the wider
tolerance of 16 and 32 runs: act-2 75.0% against 75 ± 21.7 (`on`),
act-3 59.4% against 65 ± 16.9 (`on`). The pins held (`clear` in every
cell). The Hive Assault cells are now in `TARGETED_CELLS`; the Great
Hive is not.

### Clean wins, cap wins and stall wins

The driver abandons a mission at the 60-turn cap (`cap`), or once the
core is down and ten turns pass with nobody getting out or nearer home
(`stall`, `STALL_TURNS`). An abandoned run counts as won if the core is
down and someone is aboard (`abandon-mission-handler.ts`). C2b-1 is
reviewing that rule; round 2 did not change it.

| Cell | Player | Before: wins (clean + cap + stall) | Before: losses | After: wins (clean + cap + stall) | After: losses | Clean win turns, after |
| --- | --- | --- | --- | --- | --- | --- |
| act-2 | new | 16 (16 + 0 + 0) | none | 12 (12 + 0 + 0) | 3 cap, 1 stall | 32–46, median 40 |
| act-2 | expert | 16 (16 + 0 + 0) | none | 16 (16 + 0 + 0) | none | 24–42, median 32.5 |
| act-3 | new | 15 (14 + 0 + 1) | 1 cap | 11 (10 + 0 + 1) | 5 cap | 27–57, median 42.5 |
| act-3 | expert | 16 (15 + 0 + 1) | none | 16 (14 + 0 + 2) | none | 24–39, median 30 |
| Great Hive | new | 8 (3 + 5 + 0) | 8 cap | 8 (3 + 5 + 0) | 8 cap | 55–58 |
| Great Hive | expert | 16 (16 + 0 + 0) | none | 16 (16 + 0 + 0) | none | 37–54, median 42 |

- **Wins that rest on the rule, after:** 6 of the new player's 31 (1
  stall in act-3, 5 cap in the Great Hive) and 2 of the expert's 48
  (both stalls in act-3). Counted as losses, act-3 would read 10/16 for
  the new player (62.5%, still inside its band) and 14/16 for the
  expert (`allowance`), and the Great Hive 3/16 for the new player.
- **Every new-player loss is an abandon, never a wipe.** In act-3 all
  five end at the cap with the three mechs alive, 41–119 steps from
  the drop ship. In act-2 two or three units are alive at the end; a
  mech died in three of the four, and on one seed (14, d7) the core
  never fell.
- **So the Hive Assault targets are met through the cap.** Before the
  curve, hive bugs rarely killed a refit mech (0–0.3 a run), so the new
  player lost a hive by being slow, not by being beaten. The curve
  keeps it so in Act III; in Act II it adds mech losses on top. A
  different cap, or a different rule at the cap, would move these
  cells.

### The lever: the nests quicken from difficulty 6

Bigger broods did not move either player (P1–P3 below): the new player
loses its five infantry and the three mechs finish the job. The trail
of each loss showed the mechs stopping for 8–10 turns at a time to
fight the nest stream on the walk home. So the lever is the nests'
pace, keyed on the offer's difficulty, in the Hive Assault's own tuning
(`HiveAssaultSetupTuning.nestPaceByDifficulty`, `nestPaceAt`):

| Difficulty | ≤ 5 | 6 | ≥ 7 |
| --- | --- | --- | --- |
| Hatch bonus / delay | −1 / +8 | −1 / +0 | 0 / +1 |
| A nest hatches | 1 bug every 12 bug phases | 1 bug every 4 | 2 bugs every 4 |
| Nest bugs a mission, new player (before → after) | 4–9 → 4–9 | 4–9 → 19–45 | 5–15 → 40–86 |
| Nest bugs a mission, expert (before → after) | 2–6 → 2–6 | 4–9 → 13–27 | 2–9 → 22–61 |

For comparison, the nests hatched two bugs every 3–4 bug phases at
every difficulty before C3a. The Great Hive opts out
(`nestPaceByDifficulty: []`) and keeps one bug every 11 at d8.

**New player's wins by difficulty, after (before: all won but one
act-3 d9):**

| Difficulty | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| act-2 | 4/4 | 3/3 | 3/3 | 2/3 | 0/3 | – | – |
| act-3 | – | – | 4/4 | 3/3 | 2/3 | 2/3 (1 stall) | 0/3 |

### Levers measured

Each prediction was written to a scratch file before its run; the
table copies it. Wins of 16; the notation is difficulty:bonus:delay
from that difficulty up.

| Run | Lever | Predicted, new act-2 / act-3 | Measured, new act-2 / act-3 | Expert act-2 / act-3 |
| --- | --- | --- | --- | --- |
| P1 | brood climb +2/d above d5, route and side | 13 / 11 | 16 / 15 | 16 / 16 |
| P2 | brood climb +3/d | 11–12 / 9–10 | 16 / 15 | 16 / 16 |
| P3 | brood climb +5/d, cap 30 | 15 / 12–13 | 15 / 14 | 16 / 16 |
| P4 | 7:0:0, the pre-C3a pace | 14–15 / 11–12 | 13 / 8 | 16 / 16 (2 stall) |
| Q1 | 7:−1:4, 8:−1:0 | 14 / 12 | 16 / 14 | 16 / 16 |
| Q2 | 7:−1:0, 8:0:0 | 13 / 9–10 | 16 / 10 | 15 / 16 |
| Q3 | 6:−1:4, 7:−1:0 | 12–13 / 10–11 | 16 / 14 | 15 / 16 |
| R1 | 7:0:2 | 14 / 10 | 14 / 12 (1 cap) | 16 / 16 (1 stall) |
| R2 | 7:0:4 | 15 / 12 | 16 / 15 (1 cap) | 16 / 16 |
| R3 | 7:0:4, 8:0:2 | 15 / 11 | 16 / 13 (1 cap) | 16 / 16 |
| S1 | 7:0:1 | 13–14 / 10–11 | 13 / 11 (2 stall) | 16 / 16 (2 stall) |
| S2 | 6:−1:0, 7:0:2 | 13 / 11 | 13 / 12 (1 cap) | 16 / 16 (1 stall) |
| **S3** | **6:−1:0, 7:0:1 (shipped)** | 12 / 10–11 | 12 / 11 (1 stall) | 16 / 16 (2 stall) |

What these runs showed:

- **Brood size is not a lever on these forces** (P1–P3). The P1 and P2
  predictions were overturned.
- **Bugs per hatch matter far more than the delay.** One bug every 3–4
  bug phases (Q2, Q3) leaves Act II untouched; two every 3–4 (P4) bogs
  both acts down.
- **Act II's d7 and Act III's d7–9 respond alike**, so a difficulty
  curve can only trade one act against the other. S3 is the curve
  whose trade lands both on target. The probe reproduced it run for
  run with the shipped code (96 of 96 runs identical to S3 and the
  base Great Hive).

### What the curve costs

- **The Act II expert still wins, but bleeds at d6–7.** At d7 it loses
  6.0 of its 8 units and 2.3 of its 3 mechs a run (before: 4.0 and 0);
  at d6, 5.0 and 1.0 (before: 3.7 and 0.3). In a campaign, winning an
  Act II hive at d7 costs about two mechs. The Act III expert loses
  0–0.3 mechs a run at every difficulty.
- **More bugs are awake at once from d6.** At d7–9 the new player
  faces 17–30 awake bugs at the peak and 12–16 in a mean turn (before:
  11–18 and 4–7). The expert, which outpaces the stream and leaves it
  following, faces 24–60 at the peak and 23–29 in a mean turn (before:
  11–31 and 9–16). Arc §7.5 asks for about 10–15 acting each turn.
- **The bug phase is longer, well inside C4's budget.** The matrix's
  median bug phase rose from 15–55 ms to 23–119 ms in node. The Great
  Hive, whose code did not change, also moved (32 → 38 ms and
  76 → 110 ms), so part of that is machine load. The frame time in
  SwiftShader was not re-measured.

### Keyed on the act

A curve keyed on the act band would let Act III's d7–9 run hot without
Act II's d7 falling to 0 of 3. The tactical setup sees the offer's
`difficulty` and `hive`, not its act, so this needs the act (or the
hive's act band) carried on the mission into the setup. It was not
built; it is shape option 5.

### The Great Hive: measured, left alone

The Great Hive is unchanged: new player 8/16 (3 clean, 5 by the cap),
expert 16/16 in 37–54 turns, median 42. Its new player sees the core
on turns 23–48 (the expert on 12–22), fells it on 35–53 (the expert on
20–31), and needs 16–21 more turns to get a unit home. Four Great
Hive-only levers were measured:

| Run | Lever | Predicted | New player (clean + cap) | Expert, median turns |
| --- | --- | --- | --- | --- |
| base | – | – | 8 (3 + 5) | 16/16, 42 |
| G1 | core 150 → 100 | 10 (6 clean), median 39–40 | 9 (4 + 5) | 16/16 (2 stall), 44.5 |
| G2 | brood base 4 → 1 (route 5, side 4, core 5 at d8) | 11 (7 clean), median 39 | 12 (6 + 6) | 16/16, 42.5 |
| G3 | G2 and nest delay 8 → 16 | 12–13 (8 clean), median about 41 | 14 (8 + 6) | 16/16, 46 |
| G4 | G3 and core 100 | 13 (9–10 clean), median about 39 | 13 (7 + 6) | 16/16, 44.5 |

None was shipped. In G2–G4 clean wins rise only from 3 to 6–8, while
cap wins stay at 6. If cap wins count, the cell overshoots 65%
(75–88%); if they do not, it stays under it (38–50%). G2–G4 also take
the Great Hive under 50 sleeping bugs (33–43). The expert's median did
not fall below 42. The Great Hive's time is the walk, and the walk is
shape options 1–4.

### Pins (round 2)

- `hive-assault-setup.test.ts`:
  - `nestPaceAt` returns the shipped curve at d3–10;
  - the last step at or below the difficulty wins, below the first
    step the tuning's own pace holds, and an absent pace reads as a
    clearance's nest;
  - on the fixture floor, the nests at d5, 6, 7 and 9 carry the bonus,
    timer and interval of the curve (12, 4 and 4 bug phases);
  - a tuning with no pace and no curve leaves a d9 nest at a
    clearance's pace;
  - the broods-seam test now compares at the mission's own difficulty.
- `great-hive-setup.test.ts`: a d8 Great Hive keeps the slow nests
  while an ordinary d8 hive's have quickened, and its curve is empty.
- `calibration-targets.test.ts`: `TARGETED_CELLS` is `["hive-assault"]`.

Each was sabotaged by moving a step, deleting the curve or the Great
Hive's opt-out, shifting the step boundary, feeding the nests
difficulty 0, dropping the fallback, or emptying `TARGETED_CELLS`. All
8 went red and were restored.

## Round 3: a forward extraction point and a shorter Great Hive

Round 2 left the Great Hive at 8/16 for the new player, 3 of them
clean. The time went on the walk: the core fell on turns 35–53, and
getting a unit home took 16–21 more turns. On 2026-09-28 Ben picked from
the shape options: "make the walk home shorter. Or perhaps a forward
extraction point!" Option 2, the forward point, was built first. It
left four wins at the cap, so option 4, a shorter cavern, was added.
Both changes apply to the Great Hive only; an ordinary Hive Assault is
unchanged.

Round 3b followed: the full matrix on `b9e67201` left Act III one
run under its ceiling, and the shorter walk had made the Great Hive
easy. Its nests now hatch three bugs every 6 turns at d8, and the
forward point sits at three-eighths of the walk from the core. See
"Round 3b: paying the wins back".

### Base and runs

- **Base:** int/w1 `ba451704`, which is round 2 plus the field, story
  and economy packages.
- **Forces and seeds:** as in round 2, with 16 seeds; round 3b also
  compared shapes on 64 and 128.
- **Probe:** each run was measured with a probe that played the matrix's
  two players on the Great Hive cell. It records, for every unit that
  boarded, the turn it boarded and which zone it used.
- **Predictions:** each prediction was written to disk before its run.
- **Final numbers:** "The final matrix" below; the probe runs are how
  the shape was chosen.

B0, the base, had the Great Hive exactly as in round 2:

- new player: 8/16, of which 3 clean and 5 at the cap;
- expert: 16/16 clean, median 42 turns.

### When the point is usable, and why

**The point is usable from the start of the mission.** Units board
there exactly as they do at the landing zone. Why:

- **The player can read the rule.** It is a fixed set of tiles on the
  map. There is no switch that flips when the core falls, so nothing
  hidden changes and the screen never has to explain a state change.
- **The core fight is untouched.** The point sits on the route the
  force must walk in any case, past halfway in. Boarding there early
  only takes a unit home. The mission is won only when the core is
  down and a combat unit is aboard.
- **It needs no new state.** The mission's extraction tiles are the
  landing zone's followed by the forward point's
  (`extractionZoneTiles`). Nothing was added to `TacticalState`, and
  `GAME_STATE_SCHEMA_VERSION` is unchanged.
- **Everything that boards or plans a way home already reads that one
  list:** the Board action, the objective check, both modelled players
  (their walk home targets the nearest extraction tile), and Jev's
  requests. The last keep the extraction zone, as Ben asked, and now
  carry both zones.

### Placement

`ForwardExtractionPass` runs after the brood chambers and before
connectivity, and only when the tuning has `forwardExtraction`. Only
the Great Hive's tuning has it.

- **What it marks:** one `forward-extraction` hook, a 4 × 4 level
  square in a route chamber.
- **Distances:** a mech's walk on the draft, frozen once.
- **Score:** |steps to the core − `coreShare` × the landing zone's
  steps to the core| + any detour off the way between them + 20 if the
  square reaches into the chamber's heart. `coreShare` is 0.375; it
  was 0.5 until round 3b. The heart here is 45% of the
  chamber's radius, at least 4 tiles.
- **Allowed squares:** prop-free open ground, off every other hook's
  tiles, and more than 4 columns from a nest.
- **No random draws.** The rest of the cavern is byte-for-byte the same
  with or without the point, and a test checks this.

The first version walked only the level ground at the spine's height,
and treated the heart as a hard limit. It put no point on seeds 1
and 12, whose route chambers all have radius 7–8 and no room outside
the heart. On the others it landed 38–148 steps from the core.

The mech's walk and the soft heart fixed both:

- every seed gets a point;
- on the 72 × 184 cavern the point is 80–137 steps from the core, a
  share of 0.39–0.64 of the whole walk (median 0.49);
- as shipped (72 × 152, share 0.375, 64 seeds) it is 31–85 steps from
  the core, 0.19–0.53 of the walk (median 0.37).

An early draft also let the square cover props and removed them. That
never happened: `isOpenGround` already refuses a column a prop stands
on. That code was removed, and no placement changed.

### Runs

| Run | Change | Predicted | New player (clean + cap) | New player, clean turns | Expert, median turns | Expert units lost |
| --- | --- | --- | --- | --- | --- | --- |
| B0 | base (72 × 184) | – | 8 (3 + 5) | 55–58 | 16/16, 42 | 4.31 |
| F1 | forward point at half the walk | 14 (13 + 1); expert 32 | 15 (11 + 4), 1 lost at the cap | 44–59, median 54 | 16/16, 36 (31–43) | 4.25 |
| F2 | F1 and a 72 × 152 cavern | 15 (14 + 1), clean about 45; expert 31 | **16 (15 + 1)** | 41–60, median 50 | **16/16 (15 + 1 stall), 30 (24–40)** | 3.50 |

**F1.**

- **New player:**
  - wins: 2 fewer clean than predicted and 3 more at the cap;
  - walk home: about 8 steps a turn, not the predicted 10–11;
  - cap wins: each had one unit still 3–48 steps out on turn 61;
  - seed 1: its core fell on turn 52, and nobody reached a drop ship.
- **Expert:** 4 turns slower than predicted.

**The shorter cavern (option 4).**

The forward point alone left four wins at the cap. Cutting depth alone
did not fit: at 152 deep, the planner ran a route of 9–11 chambers off
the board ("Column (35, 155) is outside 72×152"). At 160 deep it cut the
walk by only 12%.

The chamber count had to come down with the depth. Four cavern variants
were measured on the map over 24 seeds:

| Variant | Depth | Chambers (route) | Landing zone to core (mech steps) | Forward point to core | Sleeping at d8 |
| --- | --- | --- | --- | --- | --- |
| round 2 (16 seeds) | 184 | 9–11 (≥ 6) | 189–232 | 80–137 | 52–68 |
| V3 | 160 | 8–10 (≥ 6) | 157–228 | 67–116 | 50–66 |
| **V4 (shipped)** | **152** | **8–9 (≥ 5)** | **130–202** | **65–109** | **44–60** |
| V5 | 144 | 8–9 (≥ 5) | 120–183 | 41–100 | 44–60 |

V4 shipped:

- **Size:** 72 × 152, 10,944 columns, still 19% more than an ordinary
  cavern. It is larger on both axes and has more chambers (8–9 against
  5–8).
- **Core:** at least 90 from the landing zone (was 110).
- **Fit:** a route of 7 chambers at the minimum radii needs 110 of the
  124 tiles, so it always fits.
- **Why not V5:** it would make the Great Hive as deep as an ordinary
  cavern.

**F2.**

- **New player:** one more win than predicted. Its clean wins were 5
  turns slower, because the core fell on turn 36.5, not 33.
- **Expert:** as predicted.

F2 made the Great Hive easy. The new player won 16/16, 15 clean; the
expert won 16/16 in a median of 31 turns (15 clean and 1 stall win:
seed 4, whose fourth unit got no nearer home for ten turns after three
had boarded).

### Round 3b: paying the wins back

The full matrix on int/w1 `b9e67201` put the new player's Act III band
at 115/160 (71.9%), one run under the ceiling of 116 (65% + 7.5 points
at 160 runs). F2's Great Hive, 8 wins more than today's 8/16, would put
the band at 123. Ben asked for a shorter walk home, not an easier
mission, so round 3b set out to:

- keep the new player's Great Hive wins near today's (at most one more
  a cell);
- turn cap wins into clean wins;
- cut the turn counts: the expert's median, and the new player's runs
  at the cap.

The levers were the Great Hive's own: nest pace, core brood, core HP,
guards, and where the forward point sits.

**A defect in the modelled players, found and fixed** (`4b1e6787`).
With the point at 0.3 of the walk, the expert got 7–10 turns *slower*,
and N4's three expert losses first saw the core on turns 53–58. The hive strategy
searches `backOfMap`, "the walkable ground farthest from the drop
ship", for an unseen core. It measured from every extraction tile, the
forward point included. With the point near the core, the ground
farthest from both zones is a side tunnel. It now measures from the
landing zone alone. At share 0.5 no run on seeds 0–15 changed; every
number below is with the fix.

**Every new-player loss is a run at the cap.** The force is never wiped
out: a loss is the core still standing on turn 61, or nobody aboard.
So a cell at 8/16 has at least 8 runs at the cap, whatever the lever.

#### Levers on the matrix's 16 seeds

"Pace" is one nest's hatch at d8: bugs per hatch / turns between
hatches. The share is the forward point's walk to the core as a share
of the landing zone's. New player: wins (clean + cap + stall).

| Run | Change from F2 | New player | Runs at the cap | Expert, won median |
| --- | --- | --- | --- | --- |
| F2 | pace 1 / 11, share 0.5 | 16 (15 + 1 + 0) | 1 | 16/16, 31 |
| H1 | core brood × 1.5 | 16 (16 + 0 + 0) | 0 | 16/16, 31.5 |
| H2 | core HP 250 | 16 (14 + 2 + 0) | 2 | 16/16, 33 |
| B1–B3 | route broods 9, 10, 12 | 15, 16, 14 | 1–3 | 16/16, 30.5–32 |
| H3 | pace 2 / 4 (the ordinary d7+) | 7 (1 + 6 + 0) | 15 | 16/16, 41.5 |
| N1 | pace 1 / 6 | 15 (15 + 0 + 0) | 1 | 15/16 |
| N2 = G1 | pace 1 / 4 | 13 (9 + 4 + 0) | 7 | 16/16, 32 |
| G2 | pace 1 / 3, share 0.3 | 14 (10 + 2 + 2) | 4 | 16/16, 32 |
| G3 | pace 1 / 3 | 10 (7 + 2 + 1) | 8 | 16/16, 38 |
| G5, G9 | G3, core HP 200, 250 | 10 (6 + 4), 9 (3 + 6) | 10, 13 | 16/16 |
| G7 | G3, 4 more guards | 7 (2 + 3 + 2) | 12 | 16/16 |
| G8 | pace 2 / 5 | 7 (5 + 1 + 1) | 10 | 16/16, 37.5 |
| G10 | pace 2 / 6 | 8 (7 + 0 + 1) | 8 | 16/16, 35.5 |

The brood and the core HP are not levers here: bigger broods kill more
units but the new player still reaches the core, and core HP and guards
cut wins only by pushing the rest to the cap. The nest pace and the
share are the levers.

G10 looked like the answer: wins as today, 7 of them clean, no cap
win. On seeds 16–31 it won 14/16. Today's Great Hive (B0, rebuilt in
this tree) won 5/16 there, against 8/16 on the matrix's seeds. Sixteen
seeds swing this cell by ±3 wins, so from here the shapes were compared
on 64 seeds, and the last ones on 128.

#### 64 seeds

| Run | Pace, share | Predicted wins | New player of 64 | Runs at the cap | Expert, won median |
| --- | --- | --- | --- | --- | --- |
| B0r | today (72 × 184, no point, 1 / 11) | 26 | 28 (15 + 13 + 0) | 49 | 63/64, 44 |
| G3 | 1 / 3, 0.5 | 44 | 46 (31 + 12 + 3) | 30 | 64/64, 35.5 |
| G10 | 2 / 6, 0.5 | 44 | 50 (39 + 6 + 5) | 20 | 64/64, 32 |
| G8 | 2 / 5, 0.5 | 32 | 41 (29 + 10 + 2) | 33 | 64/64, 34 |
| G12 | 2 / 5, 0.45 | 36 | 44 (30 + 10 + 4) | 30 | 64/64, 32 |
| G11 | 2 / 5, 0.4 | 40 | 50 (38 + 9 + 3) | 23 | 64/64, 30 |
| H3 | 2 / 4, 0.5 | 28 | 27 (12 + 14 + 1) | 51 | 63/64, 36 |
| K1 | 2 / 4, 0.4 | 31 | 32 (12 + 18 + 2) | 50 | 63/64, 33 |
| K2 | 2 / 4, 0.35 | 33 | 34 (17 + 14 + 3) | 44 | 63/64, 33 |
| G4 | 2 / 4, 0.3 | 34 | 36 (20 + 11 + 5) | 39 | 63/64, 30 |
| L4 | 2 / 4, 0.25 | 39 | 39 (19 + 14 + 6) | 39 | 63/64, 30 |
| K3–K5 | 2 / 3, 0.3–0.4 | 22–28 | 9, 6, 5 | 62 | 62–63/64 |
| L1, L2 | 3 / 5, 0.3, 0.4 | 22, 18 | 22 (9 + 11 + 2), 16 | 53, 57 | 64/64, 29–33.5 |
| L3 | 3 / 6, 0.3 | 34 | 37 (31 + 5 + 1) | 30 | 64/64, 27 |
| M5 | 3 / 6, 0.35 | 35 | 33 (25 + 6 + 2) | 35 | 63/64, 28 |
| M1 | 3 / 6, 0.4 | 32 | 29 (17 + 10 + 2) | 43 | 64/64, 30 |
| M2 | 3 / 6, 0.5 | 28 | 24 (10 + 11 + 3) | 50 | 64/64, 33.5 |
| M4 | 4 / 8, 0.4 | 32 | 32 (18 + 9 + 5) | 39 | 64/64, 31 |
| M3 | 4 / 8, 0.3 | 37 | 43 (33 + 7 + 3) | 27 | 64/64, 29 |

What the grid shows:

- **Today's rate at a steady pace brings back today's cap.** H3 wins as
  many as today, and as many of them at the cap.
- **A nearer point makes wins clean, and adds wins.** At 2 / 4, going
  from 0.5 to 0.3 adds 9 wins and 8 clean ones.
- **Two bugs every 3 turns is a cliff:** 5–9 wins of 64 against 27–39
  at 2 / 4. The prediction was 22–28.
- **Bigger, rarer clutches keep the wins clean.** L3 hatches as many
  bugs a turn as G4 (0.5), three every 6 against two every 4. It wins
  as often (37 against 36), 31 of them clean against 20, with 30 runs
  at the cap against 39. G10 against G3 showed the same. The lulls
  between hatches let the force move; a steady trickle pins it.

#### 128 seeds, and the choice

| Run | Pace, share | Predicted | New player of 128 | Runs at the cap | Won median | Expert of 128, won median |
| --- | --- | --- | --- | --- | --- | --- |
| B0r | today | – | 55 (31 + 24 + 0) | 97 | 60 | 127, 44 |
| M1 | 3 / 6, 0.4 | – | 55 (33 + 18 + 4) | 82 | 57 | 128, 30 |
| **M6** | **3 / 6, 0.375** | **60 (39 clean)** | **62 (39 + 18 + 5)** | **77** | **56.5** | **126, 29** |
| M5 | 3 / 6, 0.35 | – | 66 (45 + 16 + 5) | 71 | 56 | 126, 28 |
| L3 | 3 / 6, 0.3 | – | 72 (58 + 11 + 3) | 60 | 53 | 127, 27 |

Per 16 seeds that is 6.9 for today, 6.9 for M1, 7.75 for M6, 8.25 for
M5 and 9.0 for L3.

**M6 shipped** (`70e5726a`, `9b5c2bc6`): each Great Hive nest hatches
three bugs every 6 turns at d8 (one bug more than a clearance nest and
three bug phases longer between hatches, at every difficulty), and the
forward point sits three-eighths of the walk from the core. It is the
shape nearest the aim:

- **Wins:** 0.85 a cell above today, inside the limit of one. M5 is
  1.4 above; M1 is level but adds only 2 clean wins.
- **Clean wins:** 39 against 31.
- **Wins at the cap:** 18 against 24.
- **Runs at the cap:** 77 against 97.
- **The walk home:** the first unit boards a median of 7 turns after
  the core falls, against 18 today. That is Ben's shorter walk. The
  fight is now where the new player spends its time: its core falls on
  turn 45 against 42.5.
- **Expert:** a median of 29 turns against 44.

The new player's remaining losses are the nest pressure's. On seed 11
the core fell on turn 45, and the force then spent nine turns 13–16
steps from the point, fighting what the nests hatched, and was still
1–8 steps out on turn 61.

### Clean wins, cap wins and the expert

On the matrix's own 16 seeds (the gate, `9b5c2bc6`), which read the
same as the probe:

| Player | Wins | Clean | At the cap | Stall | Runs at the cap | Won median (all runs) |
| --- | --- | --- | --- | --- | --- | --- |
| New, today (`b9e67201`) | 8 | 3 | 5 | 0 | 13 | 61 (61) |
| New, round 3 | 5 | 2 | 1 | 2 | 12 | 58 (61) |
| Expert, today | 16 | 16 | 0 | 0 | 0 | 42 (42) |
| Expert, round 3 | 15 | 11 | 0 | 4 | 1 | 33 (33.5) |

**On these seeds the cell reads 3 wins lower, not higher.** Over 128
seeds M6 wins 0.85 more a cell than today. The matrix's seeds 0–15 are
today's kind half (8/16, against 5/16 on seeds 16–31 and 55/128 in
all), and M6's unkind one (5/16 against 62/128). A shape tuned to read
8 here would be tuned to these seeds: G4 and G10 read 8 and win 36 and
50 of 64.

**The expert's loss, seed 6:** it first saw the core on turn 46 and
brought it down on 57, with nobody home by 61. Seeds 6, 27 and 28 are
found late in several shapes on the 72 × 152 cavern (seed 28 in G0,
before any nest change), and never on round 2's 72 × 184 (64 seeds).
The likely cause, not checked on the map: on those seeds the ground
farthest from the landing zone is not the core chamber, so the search
goes there first. The
expert's stall wins (4 here, 24 of 128) are runs where some units
boarded and the rest made no way home for ten turns; they count as won
by round 2's rule. They grow with the nest pace: 1 of 16 on the slow
nests, 6 at one bug every 3.

### Both players take the nearer point

The probe recorded where every unit boarded:

| Run | New player, forward / landing | Expert, forward / landing |
| --- | --- | --- |
| F1 | 48 / 0 | 59 / 1 |
| F2 | 52 / 0 | 70 / 2 |
| M6 (128 seeds) | 162 / 0 | 461 / 16 |

The expert's landing-zone boardings were hurt units it sent home early
in the mission, before they had passed the forward point. From where
they stood, the landing zone was nearer. Both players go to the nearest
extraction tile, so no change to the players was needed.

### The Act III band

The new player's Act III band on `b9e67201`, with this Great Hive cell
in place of today's:

- the other nine cells, from the coordinator's full matrix: infestation
  clearance 11, crash site 11, evacuation 11, hive assault 11, Alpha
  Hunt 13, Uplink 10, defend 10, tunnel 16, wreck 14: 107;
- the Great Hive: 5 (today 8);
- **band: 112/160 = 70.0%**, against 65 ± 7.5 (ceiling 116). Today's is
  115/160 = 71.9%.

Over 128 seeds the Great Hive's share would be about 7.75 a cell, which
puts the band near 115, where it is today.

### The final matrix

Gate on `9b5c2bc6` (base `ba451704`, 16 seeds, 11 cells). The other
cells are this branch's, not `b9e67201`'s.

| Cell | New player | Expert |
| --- | --- | --- |
| `infestation-clearance/act-3` | 11 | 14 |
| `crash-site/act-3` | 11 | 14 |
| `evacuation/act-3` | 11 | 15 |
| `defend-installation/act-3` | 14 | 16 |
| `tunnel-sabotage/act-3` | 16 | 16 |
| `wreck-recovery/act-3` | 16 | 15 |
| `hive-assault/act-3` | 11 | 16 |
| `story:uplink/act-3` | 16 | 16 |
| **`story:great-hive/act-3`** | **5** (2 clean, 1 cap, 2 stall; 12 at the cap) | **15** (11 clean, 4 stall), median 33.5 |
| `alpha-hunt/act-3` | 13 | 15 |
| `hive-assault/act-2` | 12 | 16 |

Every cell but the Great Hive reads as in round 3's first gate
(`58cd0efb`). Band on this branch: Act III 124/160 (77.5%), Act II
12/16.

### What the player sees

Renders from the dev server on port 4252 at `9b5c2bc6`, with a Great
Hive offer from the campaign fixture (d8, 72 × 152, forward point in
chamber 2, 16 tiles; landing zone 32 tiles):

- `docs/design/great-hive-forward-briefing.png`: the briefing's
  description names the second drop ship, and the **Extraction** row
  reads "The forward point, past halfway in, or the landing zone".
- `docs/design/great-hive-forward-point.png`: the force on the forward
  point with the core fallen. The tracker reads "1 / 1 — board at the
  forward point or the landing zone".
- `docs/design/great-hive-forward-board.png`: the wheel on a squad
  standing on the point. Board reads "forward point".
- `docs/design/great-hive-both-zones.png`: the whole cavern. The
  landing zone and its drop ship are at the top right, the forward
  point in the middle.

**What is drawn:**

- **Colour:** the point is the landing zone's sky blue, drawn flat like
  the landing zone, even in missions that withhold objective markers.
- **Error text:** errors now say "an extraction zone".
- **Second drop ship:** in round 3 no model stood on the forward
  point, and the blue tiles, the briefing row and the tracker carried
  it. Round 3c draws the ship ("The forward drop ship (round 3c)"
  below), and the two renders above were re-rendered with it.

### The forward drop ship (round 3c)

The briefing says "a second drop ship holds at a forward point", and
the tracker says "board at the forward point", but the board showed
only blue tiles. Round 3c draws that ship. It is drawn only: it blocks
no tile, and it changes nothing in `mission.extraction`, the sim or
`src/tactical`. The mission and pod sweeps are byte-identical to
`df0ab1d9`.

- **Placement** (`resolveForwardDropships`): the landing zone's model
  and layout. `dropshipClearanceFor` is the inverse of
  `dropshipBoardingTiles`. The ramp's foot is on the point, or no more
  than 3 columns from it.
- **Where it may sit:** never in rock, on the point, or on a nest or
  the heart. The ramp's foot is never higher than the skids, and never
  on a prop or another hook's tile.
- **Height:** it lands where the floor under the hull is bare.
  Otherwise it holds just above the highest thing under it: a
  one-layer step, a slope, or a prop at its `sightHeight`. That is at
  most a storey (2 layers).
- **Choice:** the lowest berth wins, then the nearest ramp, then the
  most open floor in its clearance.
- **Fiction:** the cavern has no roof, so a ship standing in a chamber
  needs no shaft.

**Seeds** (alpine, gh-1 to gh-40; temperate lays out the same):

- 36 of 40 caverns get a ship: 13 landed, 17 a layer up, 6 a storey
  up.
- Four get none:
  - on gh-8, gh-32 and gh-37 every berth low and near enough covers
    the heart;
  - on gh-40 it covers a nest.

  Their blue tiles still mark the point.
- Two looser rules were measured and not taken:
  - a ramp up to 6 columns off berths gh-8, gh-37 and gh-40;
  - gh-32 needs the ship two storeys up, or over the heart.

**Renders**, from the dev server on port 4252. The ship was checked
from all four yaws on four seeds; none clips rock:

| Seed | Point | Ship |
| --- | --- | --- |
| campaign fixture | chamber 2 | landed, ramp on the point |
| gh-38 | a passage 5 columns wide | held a layer up on the bank |
| gh-4 | a passage 6 columns wide | held a layer up |
| gh-12 | the smallest chamber (radius 7) | held a storey up over two props |

`great-hive-forward-point.png` and `great-hive-both-zones.png` were
re-rendered and show both ships.

**Framing** is left alone: `tactical-framing` frames only the landing
site.

**Nothing hides under the hull.** The hull blocks nothing, so a squad
or a bug can stand under it. It now takes the wall cutaway, the same
one walls and rooftop props take: `tdf.dropship` is in
`GHOSTED_MODEL_PREFIXES`. The hull screen-doors down to 17.5 % on the
rays from each drawn unit under it or behind it. What is below the
unit's feet + 0.3 stays solid. The tiles and the sim are untouched.

```
  camera ──► ╭──────────╮ hull   ◄── screen-doors on the rays to the
             │   ◉      │ unit       unit under it or behind it
  ───────────┴──────────┴──── floor ◄── solid
```

- **Who it opens for:** the subjects are the unit objects the scene
  draws, as for walls, so TDF units and the bugs the player can see
  open it, and a bug hidden by fog does not (ADR 0006).
- **Slots:** the cutaway has 8 slots (`MAX_GHOSTS`). A Great Hive
  often shows more units than that: gh-38 below has 13. While the
  units fit, the order is unchanged, so no slot changes hands. When
  there are more units than slots, `ghostTargets` puts the units whose
  footprint overlaps a drawn hull first (`isUnderDrawnDropship`). A
  unit behind the hull, not under it, still competes for the rest in
  draw order, as it does behind a wall. More than 8 units under hulls
  at once would leave some out.
- **The landing ship:** its hull tiles are blocked by mapgen, so
  nothing stands under it. `draft-freezer.ts` `materialise` gives a
  dropship hull tile pass NONE. Validator I2 (`map-validator`) holds
  `blocksLos` to the hull, and I6 (`dropship-site-validator`) holds
  pass NONE and `blocksLos` on the hull, with the boarding tiles open.
  A unit could still stand behind it. Both ships are one model and
  one batch, so the landing ship now takes the cutaway too.

**Board on the hull.** A click on the forward hull offers Board, as
one on the landing ship does. `isDropshipTile` now also reads the
drawn hulls (`isUnderDrawnDropship`). That is the scene's own list,
worked out once per map in `resolveDrawnDropships`, so the hull the
player clicks is the hull they see.

- **Lifted hulls:** a hull held above a bank hangs on its ship's level
  group, where some of its columns have no tile. A hit there now picks
  the column's top tile (`TacticalMapView.hullColumnTop`).
- **Boarding is unchanged:** the unit still has to stand on an
  extraction tile. From anywhere else, Board is on the wheel, closed,
  reading "not on the ramp", as it is for the landing ship.
- **Standing under the hull:** a unit standing under the hull is on
  the ship, so its own wheel offers Board, closed.

**Renders**, gh-38, from port 4252. Before is a `git archive` of
`5ad9af04`; after is this branch. Alpha and Bravo (TDF) and a spitter
and an armoured swarmer are under the hull. Delta and two armoured
swarmers are beside it. Charlie is on the point. 13 units are drawn.

- `great-hive-forward-hull-before.png`: the hull is solid, and the four
  units under it are hidden. Only Alpha's selection ring shows through.
  A second run with every status chip up (Shift) checked which figure
  is which, before and after.
- `great-hive-forward-hull-after.png`: the hull screen-doors, and all
  four show through it.
- `great-hive-forward-hull-board.png`: Charlie selected on the point.
  A real left click on the hull's body (screen point fitted from four
  tiles' screen positions) opens the wheel with Board, open, reading
  "forward point". The same click at `5ad9af04` picks the same tile,
  (32, 2, 77), and the wheel has no Board.

Alpha stands on the floor with a one-layer bank in front of it, so from
this yaw the bank hides its legs. Terrain never takes the cutaway.

**Pins:**

| Test | What it pins |
| --- | --- |
| `forward-dropship-resolver.test.ts` | Covers eight cases: no point, no ship; open floor, landed with the ramp on the point and the hull off it; the vision tile is the point's first, and the owned tiles are the point's plus the hull's; rock on one side turns the ship to the open side; a passage the point's width with banks a layer up, a layer up; walled in rock, none; a nest where it would land moves it; props it cannot avoid, a storey up with the ramp on bare floor; a ramp that would land on a prop, none. On gh-2, gh-38 and gh-12 the lifts are 0, 1 and 2, and no hull column is above the skids or on a hook. |
| `drawn-dropship-resolver.test.ts` | The landing ship on its generated site, first; a missing boarding zone skipped; then each forward point's. |
| `dropship-model-resolver.test.ts` | The forward model sits at `tileTop(level + lift)` and carries the point's and the hull's tiles. |
| `dropship-site-layout.test.ts` | `dropshipClearanceFor` inverts `dropshipBoardingTiles` for every facing. |
| `ghost-cutaway-eligibility.test.ts` | `tdf.dropship` takes the cutaway. |
| `drawn-dropship-resolver.test.ts` | A map's ships are worked out once, and a copy of the map is worked out afresh. `isUnderDrawnDropship` covers every column under either ship and none past its edges, and none on a map that draws no ship. |
| `tactical-scene-builder.test.ts` | With more drawn units than `MAX_GHOSTS`, the units under the hull go first. That includes a 2×2 whose anchor is beside the hull but whose footprint reaches under it. The rest stay in draw order. With 8 or fewer, the order is exactly the draw order. |
| `tactical-map-view.test.ts` | A hit on a hull drawn on level 0, over ground on level 1, picks that ground tile. Off the hull, picking is unchanged. |
| `action-availability.test.ts` | `isDropshipTile` is every column under a forward point's drawn ship, the point's tiles as before, and nothing past the hull. |
| `tactical-hud-view.test.ts` | Board is on the wheel at a forward hull tile: closed with "not on the ramp" for a unit off the point, and it sends nothing. Open for a unit on the point, and a click sends `EXTRACT`. |

**Sabotage:** each of these was broken in turn, each turned a test
red, and each was then restored:

- the rock cap;
- the hook check;
- the lift;
- the hull's owned tiles;
- the model's lift;
- the model's owned tiles;
- the ship order;
- the missing-zone skip;
- `tdf.dropship` in the cutaway prefixes;
- the memo;
- the under-hull order (both always-on and never-on);
- the unit footprint in that order;
- the hull-column pick;
- the drawn hulls in `isDropshipTile`, which turned both the service
  test and the HUD test red.

The ramp-on-prop rule first stayed green: berths near props lose on
open floor anyway. The corridor case was added for it, and it went
red.

### Pins (round 3)

| Test | What it pins |
| --- | --- |
| `forward-extraction-pass.test.ts` | On gh-1, gh-2 and gh-17: one level 4 × 4 zone in a route chamber, outside the heart, with no prop or other hook on it, clear of the nests, within 0.2 of `coreShare` of the mech's walk from the core. gh-17's best square otherwise lies on a nest's hatching ground. The point moves with `coreShare` (0.7 lies farther from the core than 0.2). The pass draws nothing: the tiles, props and other hooks are the same without it. |
| `extraction-zones.test.ts` | Landing tiles first, then each forward point's; `onForwardExtraction`. |
| `great-hive-map.test.ts` / `hive-assault-map.test.ts` | One forward point, the landing zone's size, on a Great Hive; none on an ordinary hive. |
| `mission-start-service.test.ts` | `mission.extraction` is the union, and Jev's extraction request equals it. |
| `garrison-service.test.ts` | The garrison keeps off the point. |
| `tactical-map-view.test.ts` | The point is drawn where objective markers are withheld, flat, below an objective slab. |
| `action-wheel.test.ts` | Board reads "forward point" on it. |
| `boarding-track.test.ts`, `objective-tracker-view.test.ts`, `tactical-screen.test.ts` | The tracker ends on the two places to board on a map with a point, and on "board the drop ship" without one. |
| `great-hive-presentation.test.ts`, `launch-window-presentation.test.ts` | The Extraction row and its slot. |
| `great-hive-setup.test.ts` | A d8 Great Hive's nests hatch three bugs every 6 bug phases; an ordinary hive's two every 4. |
| `objective-strategies.test.ts` | The back of the cavern is measured from the landing zone: a forward point near the far end leaves it where it was. |
| `calibration-targets.test.ts` | `TARGETED_CELLS` includes `story:great-hive`. |

Each was sabotaged, and each test went red and was then restored:

- the point marked as an objective, so it was hidden;
- the pass removed from the pipeline;
- the landing zone alone in mission start;
- the garrison filter removed;
- Board always reading "drop ship";
- the screen or `boardingTrackOf` dropping the closing step;
- the Great Hive removed from `TARGETED_CELLS`;
- the Extraction row removed;
- the nest clearance, the heart penalty or the prop check ignored;
- the target fixed at half the walk, or at the core;
- the zone order reversed;
- a forward point added to the ordinary hive's tuning;
- the Great Hive's nests back on the slow pace, or at two bugs every 6;
- `backOfMap` measured from every extraction tile.

Three sabotages first stayed green:

- **The nest check, twice:** gh-1 and gh-2 never put a square near a
  nest, so gh-9 was added. At the new share gh-9's square no longer
  sits near one either; a scan of gh-1 to gh-40 found five that do,
  and gh-17 replaced it (gh-8's point lands at 0.63 of the walk, too
  far out for the share check).
- **The prop removal:** this showed the removal was dead code, and it
  was deleted.

## Shape options

Round 2 listed these; round 3 built options 2 and 4 for the Great Hive.

1. **Extract at the core.** A second extraction point in the core
   chamber would remove the walk home: 7–24 turns for the expert
   (13–24 on the Great Hive), and the whole of the new player's
   cap-bound tail on the Great Hive.
   Expect the new player's Great Hive to go from 9/12, 7 of them at the
   cap, to 12/12 inside the cap, and every hive to get easier. The
   brood sizes would then need raising again.
2. **A second drop point** partway down the cavern (built in round 3,
   on the Great Hive, three-eighths of the walk from the core). This
   keeps the walk home but shortens it; a middle ground between today
   and option 1.
3. **Split the Great Hive into two missions:** the approach, then the
   core. Each half fits the cap. The walk is 189–232 steps against an
   ordinary hive's 120–165.
4. **A shorter Great Hive cavern** (built in round 3: 72 × 152). 72 × 184 is sized for chamber count
   (`great-hives.md`). A cavern about 150 steps long would bring the
   new player inside the cap without touching the broods.
5. **Act-scaled hive pressure.** Brood size or nest pace by act band,
   so Act III can be hard without Act II being impossible. In round 1
   this was the only lever found that meets both the act-2 and the
   act-3 targets. On the filled forces a difficulty curve meets both
   (round 2), but it takes Act II's d7 to 0 of 3 for the new player;
   an act-keyed curve would need the act on the mission (round 2,
   "Keyed on the act").
6. **Whether Hive Assault belongs in Act II at all** for a force of one
   mech and four squads. At d6–7 the core's brood (7–9) plus the guards
   is the whole fight, and that is where every remaining loss sits.
   C2c's Act II force now brings three mechs, and wins every Act II
   hive on the slow nests (round 2).
