# C3a: Hive Assault and the Great Hive

Package C3a of #1179. The job was to make Hive Assault and the Great
Hive winnable at the arc's rates. At the matrix's round-2 baseline
(`3ef36fc5`, before this package) both players won none of
`hive-assault/act-2` and none of the Great Hive (see `README.md`, "Why
the hive cells sat at 0%").

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
  Act III hive 19–88 and the Great Hive 52–68. Arc §7.5's figure is
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

## Shape options (not built)

1. **Extract at the core.** A second extraction point in the core
   chamber would remove the walk home: 7–24 turns for the expert
   (13–24 on the Great Hive), and the whole of the new player's
   cap-bound tail on the Great Hive.
   Expect the new player's Great Hive to go from 9/12, 7 of them at the
   cap, to 12/12 inside the cap, and every hive to get easier. The
   brood sizes would then need raising again.
2. **A second drop point** partway down the cavern. This keeps the walk
   home but halves it; a middle ground between today and option 1.
3. **Split the Great Hive into two missions:** the approach, then the
   core. Each half fits the cap. The walk is 189–232 steps against an
   ordinary hive's 120–165.
4. **A shorter Great Hive cavern.** 72 × 184 is sized for chamber count
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
