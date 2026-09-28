# C2b-1-field: Infestation Clearance, Crash Site (with First Skyfall) and Evacuation

Package C2b-1-field of #1179 tunes three mission types to the rates in
campaign arc §12. The new player should hit 90 / 75 / 65 by act band,
within the tolerance in the [README](README.md). The expert should win
at least 90% in every cell.

Phase 2, on the filled forces, is the record of the change. Phase 1,
on the older forces, is kept at the end as the diagnosis it grew from.

## Base and cells

- **Base:** `327c6554`. That is C2c's calibration ruler (`1bf3b242`)
  with the filled forces (eight units in every band) merged in.
- **Head:** `6303da91` is the tuned code. The final run, at
  `358ec3b3` (a test and this doc on top), plays every run the same
  way: outcome, turns and losses match run for run, and only the
  timing columns differ.
- **Filter:** `SIM_MATRIX_CELLS=infestation-clearance,crash-site,story:first-skyfall,evacuation`,
  16 seeds.
- **Command:**

  ```
  SIM_MATRIX_CELLS=infestation-clearance,crash-site,story:first-skyfall,evacuation \
  SIM_MATRIX_OUT=/tmp/c2b-1-field.tsv \
    node_modules/.bin/vitest run --config vitest.sim.config.ts \
    --maxWorkers=8 src/app/service/calibration-matrix
  ```

- **48-seed checks.** A scratch probe plays the matrix's runs at seeds
  0–47, with the same missions, forces and dice. Its seeds 0–15 give
  the same counts as the matrix run. The 48-seed rates below come from
  it. At 16 seeds one run is 6 points, so two readings of one cell can
  differ by 12 points on luck alone.

## The change

| What | From | To | Where |
| --- | --- | --- | --- |
| Civilian group hit points | 10 | 20 | `CIVILIAN_TUNING.maxHp` |
| Civilian group move (tiles per action) | 4 | 6 | `CIVILIAN_TUNING.move` |
| Evacuation: large board from | d8 | d10 | `MISSION_TUNING.difficulty.evacuation.largeFromDifficulty` |
| Crash Site: pod deadline from d5 | end of turn 8 | end of turn 5 | new `CRASH_SITE_SETUP_TUNING` |
| The expert's rescue | the shared strategy | every trapped group at once | `EXPERT_OBJECTIVE_STRATEGIES` |

- **Crash Site's pod deadline.** The new tuning
  (`tactical/model/crash-site-setup-tuning.ts`) reaches the setup
  through the optional `MissionSetupDeps.crashSite`. The composition
  root passes it. The shared pod fields in `SPAWN_TUNING` stay as they
  are, since the Intact Pod reads them too. The briefing's "Matures at
  the end of turn N" reads the same deadline
  (`crashPodMaturityTurn`). Difficulties 1–4 keep turn 8, so First
  Skyfall (d1) does not move.
- **Scope of the civilian levers,** checked with a grep:
  - `CIVILIAN_TUNING` reaches play only through `placeCivilians`
    (the evacuation setup) and the debug placement menu.
  - The prey weight (`PREY_TUNING.civilianWeight`, 1.5) is read only by
    `attackOptions`, and was not changed.
  - At 20 hp a full group is worth the same bite as a full squad
    (20 hp), and the 1.5 weight still sends the bugs to the group
    first. At 10 hp a group was worth three times a squad.
  - Three test fixtures had taken the shipped 10 hp and move 4 as
    their own numbers. They now set the hit points they compare
    (utility, swarmer) or walk the new twelve tiles (move handler).

## Before and after (16 seeds)

Before is `327c6554`, after is `6303da91`. Wins out of 16.

| Cell | New before | New after | Band target | Expert before | Expert after | `expert_target` |
| --- | --- | --- | --- | --- | --- | --- |
| `infestation-clearance/act-1` | 16 | 16 | 90 ± 6.1 | 16 | 16 | met |
| `crash-site/act-1` | 16 | 16 | 90 ± 6.1 | 16 | 16 | met |
| `story:first-skyfall/act-1` | 16 | 16 | 90 ± 6.1 | 16 | 16 | met |
| `evacuation/act-1` | 14 | 14 | 90 ± 6.1 | 6 | 16 | met |
| `infestation-clearance/act-2` | 12 | 12 | 75 ± 7.7 | 16 | 16 | met |
| `crash-site/act-2` | 16 | 14 | 75 ± 7.7 | 16 | 15 | met |
| `evacuation/act-2` | 8 | 11 | 75 ± 7.7 | 7 | 16 | met |
| `infestation-clearance/act-3` | 11 | 11 | 65 ± 7.9 | 14 | 14 | allowance |
| `crash-site/act-3` | 16 | 11 | 65 ± 7.9 | 16 | 14 | allowance |
| `evacuation/act-3` | 7 | 11 | 65 ± 7.9 | 7 | 15 | met |

- The tolerances are the full bands' at 16 seeds. This filter covers
  only some of each band's cells, so no band row is given. Pooled over
  these cells alone (`.bands.tsv`), the new player reads:

  | Band | Before | After |
  | --- | --- | --- |
  | act-1 | 96.9 | 96.9 |
  | act-2 | 75.0 | 77.1 |
  | act-3 | 70.8 | 68.8 |

  All six read `on` at the filter's own tolerance.
- **Structural pins.** Every cell reads `clear` and every band `holds`.
  Before, act-1's expert-over-new pin **failed**: evacuation act-1's
  expert won 6 and the new player 14.
- **Clearance rows.** These are identical before and after, run for
  run. The Clearance tuning did not change.

**48 seeds (probe, seeds 0–47), after:**

| Cell | New | Expert |
| --- | --- | --- |
| `crash-site/act-1` | 47 (98%) | 48 (100%) |
| `crash-site/act-2` | 39 (81%) | 44 (92%) |
| `crash-site/act-3` | 32 (67%) | 44 (92%) |
| `story:first-skyfall/act-1` | 48 | 48 |
| `evacuation/act-1` | 45 (94%) | 47 (98%) |
| `evacuation/act-2` | 38 (79%) | 47 (98%) |
| `evacuation/act-3` | 32 (67%) | 45 (94%) |
| `infestation-clearance/act-3` | 33 (69%) | **40 (83%)** |

**Targeted cells.** These meet both targets on the 16-seed run and are
added to `TARGETED_CELLS`:
- `infestation-clearance/act-2`;
- `crash-site/act-3`;
- `evacuation/act-1`, `evacuation/act-2` and `evacuation/act-3`.

The others stay out:
- `infestation-clearance/act-1`, `crash-site/act-1` and First Skyfall:
  the new player wins 16/16, above act-1's 96.1 ceiling.
- `crash-site/act-2`: the new player wins 14/16 (88%), above act-2's
  82.7 ceiling on this seed set. At 48 seeds it is 81%, inside.
- `infestation-clearance/act-3`: the expert reads `allowance` at 16
  seeds but wins 83% at 48 (below).

## The stall and cap rule: right as it is

The harness applies `abandonMission()` in two cases:
- at the 60-turn cap;
- after 10 settled turns in which nobody new extracted.

`abandonMission()` is the Leave button's command. A run it ends is won
only if the objectives are complete and a combat unit is aboard. That
is the Executive Director's rule of 2026-09-13. Units still on the map
are lost.

The Leave button works in any player phase. So a stall or cap win is
exactly the win a real player gets by pressing Leave. That player could
also press it sooner. Waiting 10 turns can turn a slow walk home into a
loss, but it can never turn a loss into a win. The only bias is against
the player, and it is small. **The rule stays as it is.**

**Evidence (Evacuation, the new player, base).**
- **Stall wins:** 5 of 14 wins in act I, 5 of 8 in act II and 6 of 7
  in act III.
- **What those runs held:** every one had the rescue complete and a
  combat unit aboard. The Leave dialog would have granted the same win,
  with the same stranded units lost.
- **Where the rescue was lost:** in the new player's rescue-complete
  losses, the force stands and shoots at a stream of edge waves that
  never stops, and nobody walks home.
  - A mech's attack ends its turn, and a squad spends both actions on a
    shot whenever a bug is in range.
  - Act-1 seed 3 (civilians at move 6) is an example: all eight alive,
    the rescue complete, nobody out, and the mechs 83 steps from home
    shooting every turn.
  - This is a new-player decision, not a harness defect. It is left to
    the owner of the players.

For Hive Assault (C3a), a cap win with the core down and someone aboard
is the same Leave-button win.

The phase-1 no-extract quirk (crash act-3 seed 4) no longer reproduces
on the filled forces: that run is won in 14 turns.

## Evacuation

**Cause.** Both players lost the walk home.
- **Freed groups die on the way home.** A group's chance of getting
  home fell with distance (base):

  | Steps home | <20 | 20–39 | 40–59 | 60–79 | 80+ |
  | --- | --- | --- | --- | --- | --- |
  | Survived | 100% | ~85% | ~65% | ~47% | ~15% |

  - Groups die 4–8 turns after they are freed, mid-walk.
  - Infestation costs 2 move points a tile, so on creep a group walked
    about 4 tiles a turn.
- **Large boards.** On the 96×96 boards (d8–9), groups sat 60–140
  steps out.
- **The new player:** also pinned by the open-ended edge waves (see
  above).

**The expert's rescue (a decision in its own objective kind, with
tests).** The expert used to work one group at a time with the whole
force and escort each freed group. That lost the race twice:
- the groups still trapped were eaten while they waited;
- an escort beside a group in its doorway kept the group in.

The expert now does this
(`expert-objective-strategies.test-helper.ts`):
1. It gives every trapped group a job, the cheapest round trip first
   (force → group → drop ship).
2. The whole force works the cheapest job. A team of two works each of
   the others.
3. Every job is urgent.
4. Freed groups walk home on their own, with no escort in the doorway.

Only Evacuation uses the `rescue-civilians` objective. The new player
keeps the shared table.

| Expert rescue variant | Wins, act I / II / III (16 seeds) |
| --- | --- |
| Shared strategy (base) | 6 / 7 / 7 |
| **Every group at once (kept)** | **15 / 12 / 13** |
| Four other variants of the split and the pace | 13–15 / 9–11 / 10–13 |

On the tuned mission, over 48 seeds:
- **Hold the drop ship once no group is left trapped:** 44 / 41 / 29.
  Groups left alone die.
- **Free only the needed groups plus one:** 46 / 43 / 40.
- **The kept strategy:** 46 / 43 / 43.

**Levers.** Each was predicted before it was run.
- Rows marked "0–15" are the matrix's seeds (wins of 16).
- Rows marked "48" are percentages over seeds 0–47.
- Every row is with the kept rescue.
- **Waves** is how many edge waves an evacuation sends. The shipped
  count is open-ended.

| Lever | Prediction, new / expert | Measured, new / expert |
| --- | --- | --- |
| Base, 48 | | 88/65/44 · 90/73/79 |
| Move 6 (0–15) | 15/10/9 · 15/14/14 | 14/10/11 · 16/15/12 |
| 20 hp (0–15) | 15/10/9 · 15/14/14 | 13/10/6 · 15/13/14 |
| Waves capped at 4 (0–15) | 15/12/11 · 16/15/15 | 14/10/10 · 15/12/12 |
| Waves capped at 6 (0–15) | 15/10/9 · 15/14/14 | 14/8/10 · 15/12/13 |
| 20 hp, 4 waves, 48 | | 96/83/71 · 96/90/90 |
| 30 hp, 48 | 90/70/55 · 95/94/88 | 94/69/50 · 94/85/83 |
| 25 hp, 4 waves, 48 | 97/86/75 · 97/93/92 | 98/88/79 · 92/94/85 |
| 20 hp, large from d10, act III, 48 | 58 · 92 | 50 · 90 |
| 20 hp, 6 waves, acts I–II, 48 | 93/75 · 94/89 | 98/75 · 96/88 |
| **Move 6, 20 hp, large from d10 (shipped), 48** | **96/75/58 · 98/94/92** | **94/79/67 · 98/98/94** |

What the lever runs showed:
- **Hit points** lift the expert more than the new player.
- **A wave cap** lifts the new player more than the expert, and makes
  act I too easy for the new player.
- **Neither moved the expert's act II far enough.** The failures left
  were groups dying on 58–80-step walks.
- **Move 6** shortens that walk for both players.
- **The shipped combination.** Move 6, 20 hp and large boards from d10
  put all six numbers where the arc wants them. The waves stay
  open-ended, and they are what separates the two players.

## Crash Site and First Skyfall

**Cause.** Both players won every crash site: 48/48 in every cell.
- Both walk to the pod at full pace (the shared strategy is urgent),
  and the walk decides the kill turn.
- Kill turns over 48 seeds:

  | Difficulties | Kill turns |
  | --- | --- |
  | d1–d5 | turn 2–8, the two players within a turn of each other |
  | d6–d9 | the expert about one turn sooner |

- The turn-8 deadline was never close.
- After the kill the new player is slow home: its runs last 15–19
  turns on average, the expert's 8–9. But the first unit to board locks
  in the win, since a stall with someone aboard is a win.

**Levers, 48 seeds unless marked, new / expert per act:**

| Lever | Prediction | Measured |
| --- | --- | --- |
| +1 edge wave per difficulty above 1 (32 seeds) | new 31/26/22, expert 32/31/30 | new 30/32/31, expert 32/32/32 |
| Pod +15 hp per difficulty above 1 (32 seeds) | new −/26/22, expert −/31/30 | new 31/32/27, expert 32/32/32 |
| Pod +30 hp per difficulty above 1 (32 seeds) | new −/20/15, expert −/29/26 | new 30/30/25, expert **29**/31/31 |
| Open-ended edge waves from d2 | new 44/36/30, expert 47/46/44 | new 46/48/47, expert 48/48/48 |
| The expert fires on the pod first (`focus`) | kill turn −0.5 to −1 at d5–9 | identical kill turns: rejected |
| **Deadline turn 5 from d5 (shipped)** | new 47/~41/~29, expert 48/~46/~42 | **new 47/39/32, expert 48/44/44** |

Why the other levers failed:
- The edge waves and the open-ended waves do not bite. The crash force
  boards 6 of 8 units on average before any stall.
- Pod hit points cost the expert as much as the new player. At +30 per
  difficulty, the expert fell below the new player in act I.

What the shipped deadline does:
- The deadline is the lever because the walk there is the whole race.
- From d5, a pod that is not down by the end of turn 5 matures:
  - the objective fails;
  - the pod bursts;
  - the force can only extract.
- The expert's extra turn at d7–9, and a steadier approach, keep it at
  92% while the new player drops to 81% / 67%.
- Act I and First Skyfall do not move: First Skyfall stays 16/16 for
  both players.

## Infestation Clearance (not tuned)

- **Act II and act III: on target for the new player** (12 and 11 of
  16; 69% at 48 seeds for act III).
- **Act III: the expert is below 90%.** It wins 40/48 (83%), though it
  reads `allowance` at 16 seeds.
  - Its losses are 60-turn caps with 108–143 edge bugs.
  - By difficulty, over seeds 16–47:

    | Difficulty and board | Expert | New |
    | --- | --- | --- |
    | d8–9 on 96×96, four nests at d9 | 8 of 12 | 4 of 12 |
    | d5–7 | 18 of 20 | 18 of 20 |

  - A traced d9 loss: two of four nests down by turn 14, five of eight
    units lost by turn 23, then three units hold against 45–55 bugs
    until the cap.
- **Act I: the new player wins 16/16.**

**Clearance levers measured and rejected (act III over 48 seeds):**

| Lever | Prediction, new / expert | Measured, new / expert |
| --- | --- | --- |
| Large board from d10 | 36 / 44 | 33 / 41 (d9 still 1/9 and 6/9) |
| Nests `0.2` per difficulty (d5 two, d9 three) | 36 / 43 | 36 / 42; act II new 40/48 |
| The expert fires on the nest first (`focus`) | – / 44 | – / 39 |

- Each lever lifts the new player at least as much as the expert, or
  lifts neither.
- The expert already takes the nearest nest.
- The fourth nest at d9 on a large board is past what the eight-unit
  force can clear against open-ended waves. The fix is likely one of:
  - the expert's attrition decisions;
  - a harder d9 for both players, paired with an easier path for the
    expert.

  That is outside this package's levers.

## Off target, and why

| Cell | Reading | Why |
| --- | --- | --- |
| `infestation-clearance/act-3` | Expert 83% at 48 seeds | Four nests at d9 against open-ended waves (above); no lever in this package's reach lifts the expert more than the new player. |
| `infestation-clearance/act-1`, `crash-site/act-1`, First Skyfall | New player 100% | The eight-unit force wins every act-I clearance and crash site. First Skyfall must stay ≥ 90% for both players, and Crash Site's act-I difficulties (d1–4) share the d4 kill-turn spread, where a shorter deadline costs the expert as much as the new player (86% at turn 6). |
| `crash-site/act-2` | New player 14/16 (88%) | 81% at 48 seeds; the 16-seed set reads high. |

- **The act-I band.** It will read `high` once the other act-I cells
  reach their targets. These four cells pool at 62–63 of 64.
- **The other act-I cells:** Defend Installation reads 16/16 in the
  baseline, and Live Specimen 6/16 before C3b.
- **Where the fix lies:** a lever that lowers act I for the new player
  alone would be in the forces (C2c) or the new player's decisions, not
  in these types.

## Phase 1 (forces sampled at missions 15 and 35)

Phase 1 was measured on `7da692b9`, C2c's ruler round 1, with smaller
forces. It is kept as the diagnosis the tuning grew from.

Wins out of 16, new / expert:

| Cell | New | Expert | Where it was lost |
| --- | --- | --- | --- |
| `infestation-clearance/act-1` | 12 | 16 | new player only: slow grinds under open-ended edge waves |
| `infestation-clearance/act-2` | 7 | 7 | both, from d5, where the third nest arrives |
| `infestation-clearance/act-3` | 7 | 14 | new player: 60-turn caps under open-ended waves |
| `crash-site/act-1` | 15 | 16 | on target |
| `crash-site/act-2` | 14 | 15 | too easy for the new player |
| `crash-site/act-3` | 15 | 16 | too easy for the new player |
| `story:first-skyfall/act-1` | 16 | 16 | on target |
| `evacuation/act-1` | 8 | 10 | map-size cliff at d3, civilians dying |
| `evacuation/act-2` | 7 | 4 | both; the expert failed "expert ≥ new − 1 seed" |
| `evacuation/act-3` | 8 | 7 | civilians dying, far groups |

**Phase-1 findings.**
- **Groups sat far from deploy.** Measured on the move field:
  - up to 61 steps out on 48×48 boards;
  - up to 109 on 72×72;
  - up to 139 on 96×96.
- **Groups died, not the force.** Of 188 groups in the expert's 48
  runs:
  - 72 were aboard;
  - 47 died while still trapped;
  - 45 died walking home.
- **Edge waves never stop in an evacuation.**
- **The pod race did not separate the players.** Both players killed
  the pod within about a turn of each other.
- **The clearance cliff.** Act II's clearance fell off at d5: new 1/9
  and expert 0/9 at d5–d7.
- **Superseded by the filled forces.** The eight-unit forces have since
  lifted clearance act II to 12 / 16 and every crash site to 16 / 16,
  which is why phase 2 re-measured before it tuned.
