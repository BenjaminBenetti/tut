# C2b-2: the defences, the tunnels and the wreck

Tuning package C2b-2 of #1179. It tunes Defend Installation, the two
story defences built on it (Uplink and Launch Window), Tunnel Sabotage
and Wreck Recovery to the arc's rates (campaign arc D5). How a package
records its results is set out in [the README](README.md#how-tuning-packages-record-results).

## 1. Base and cells

- **Base:** `1bf3b242`, the calibration ruler on the filled forces
  (C2c round 3), measured in a worktree of its own.
- **Head:** branch `feat/1179-defence-calibration`.
- **Filter:** nine cells.

  ```
  SIM_MATRIX_CELLS=defend-installation,story:uplink,story:launch-window,tunnel-sabotage,wreck-recovery
  ```

## 2. The change

| Value | From | To | Why |
| --- | --- | --- | --- |
| `DEFENCE_TUNING.holdTurns` | (none) | 8 | A defence read held only once every bug on the map was dead. One boxed-in straggler kept it open to the turn cap: Launch Window's losses at the base are all capped runs. It now reads held 8 turns after the last wave lands. The tracker counts the hold down. |
| A held defence's flag | could flip to lost | stays held | Bugs outlive the hold. When they wrecked the generators as the force went home, the step set `failed` on a held defence, and the run ended `extracted`. |
| Shared defend strategy | searched for stragglers once the last wave was in | stays on the generators while the hold counts down | The search took the force off the generators and lost them (expert, act 3, d9). Once the hold is over, the search runs as before. This applies to both players. |
| `WAVE_PRESSURE_TUNING.defence` | (none) | surge 1.75, spill 2 | The force of eight killed each capped wave (at most 8 bugs) before the next one landed. More waves added turns, not pressure. |
| `GENERATOR_TUNING.maxHp` | 40 | 60 | Under the surge, the expert lost act-3 defences and Uplink with its force nearly whole: a surged wave wrecked a 40 hp generator in one bug phase. |
| `UPLINK_WAVES` | 5 | 6 | At 5 the new player won 14/16. At 7 the expert lost its generators in 7 runs out of 16. |
| `LAUNCH_WINDOW_WAVES` | 7 | 8 | At 7 the new player won 12/16 against a target of about 9. |
| `WAVE_PRESSURE_TUNING.tunnel` | (none) | surge 3, spill 3 | The charges go in by turn 2 and cannot be pulled, so the fight is on the way home. |
| `WAVE_PRESSURE_TUNING.wreck` | (none) | surge 3, spill 3, first wave a turn sooner | Half the new player's wins were home by turn 7, before the first wave (turn 3) had reached the wreck. |
| Swarm Tide on a pressed type | overwrote the surge | keeps the larger scale and spill | Without this, Swarm Tide would make a defence easier. |

The pressure is one decorator in the setup table. `withWavePressure`
runs the type's own setup, then `pressEdgeWaves`. Swarm Tide's
`raiseTide` goes through the same function.

```
MISSION_SETUP_RULES["tunnel-sabotage"] = withWavePressure(TUNNEL_SABOTAGE_SETUP, WAVE_PRESSURE_TUNING.tunnel)
  setup ──► the type's setup ──► pressEdgeWaves: surge = max(current, pressure) each; nextTurn − turnsSooner
  then the story setup, then the sitreps (Swarm Tide: pressEdgeWaves again, never less)
```

No expert-only decision was added.

## 3. Before and after

Both runs use 16 seeds per cell. The new player's range is ±2
binomial standard deviations for a single cell at 16 seeds:

| Target | Range |
| --- | --- |
| 90% | 12–16 |
| 75% | 9–15 |
| 65% | 7–14 |
| 55% | 5–12 |

The expert needs 15, and 14 passes as the allowance.

| Cell | New before | New after | Band target | Expert before | Expert after | `expert_target` |
| --- | --- | --- | --- | --- | --- | --- |
| defend-installation/act-1 | 16/16 | 16/16 | 90 | 16/16 | 16/16 | met |
| defend-installation/act-2 | 15/16 | 12/16 | 75 | 16/16 | 16/16 | met |
| defend-installation/act-3 | 14/16 | 10/16 | 65 | 16/16 | 15/16 | met |
| story:uplink/act-3 | 16/16 | 10/16 | 65 | 16/16 | 15/16 | met |
| story:launch-window/finale | 9/16 | 10/16 | 55 | 10/16 | 16/16 | met (was short) |
| tunnel-sabotage/act-2 | 16/16 | 11/16 | 75 | 16/16 | 16/16 | met |
| tunnel-sabotage/act-3 | 16/16 | **16/16** | 65 | 16/16 | 16/16 | met |
| wreck-recovery/act-2 | 14/16 | 11/16 | 75 | 16/16 | 15/16 | met |
| wreck-recovery/act-3 | 16/16 | 14/16 | 65 | 15/16 | 14/16 | allowance |

**How the missions were lost.**

- **Before.**
  - The new player's defence losses were all turn-cap runs: 1, 2 and 7 of them.
  - Launch Window's expert was capped 6 times.
- **After.**
  - Every new-player defence loss is a stall with nobody aboard. The
    player holds the generators, then cannot get home through what is
    left of the surged waves.
  - The expert's defence losses are generators wrecked (`extracted`):
    act 3 seed 4 at d9, and Uplink seed 6.
  - The expert's wreck losses:
    - act 2 seed 13 and act 3 seed 7 are the hardest maps in their cells;
    - act-3 seed 7 is lost at every setting measured, the base included;
    - act 3 seed 11 is `extracted`.

**Cells still off target.**

- **`tunnel-sabotage/act-3`.** The new player wins 16/16 against a
  range of 7–14. No lever moved it:

  | Run | Lever | New player |
  | --- | --- | --- |
  | E1 | surfacing every 2 turns | 16 |
  | E2 | large maps from d3 and surfacing from turn 1 | 16 |
  | E5 | surge 2 | 16 |
  | E7 | surge 2.5 | 16 |
  | E6, final | surge 3 | 16 |

  The act-3 force always gets someone aboard. 12 of 16 runs end on
  the stall rule with a unit home, with 3.4 units lost on average.
  The charges cannot be pulled, so the objective is done by turn 4–5
  whatever the bugs do.

  Only a mechanic would move it, not a tuning value. One option is
  bugs pulling a burning charge, which would make the arc's "survive
  the fuse" a fight. The cell is left out of `TARGETED_CELLS`.
- **`defend-installation/act-1`.** The cell is inside its range, but at
  16/16 it sits above the 14.4 the 90% target asks for. Act-1 waves
  are small (d1–4), and no defence lever separates act 1 from the
  others.
- **`wreck-recovery/act-3`.** The cell is inside on both counts, but
  at the edge: the new player's 14 is the top of the range, and the
  expert's 14 is the allowance. At surge 2.5 the new player won 15.
- **The act-3 band within this filter** pools at 78.1%, which reads
  `high` because of the tunnel cell. Without it, the band is 34/48
  (70.8%), which reads `on`. The filter covers no whole band, so no
  band verdict is asserted.

**The tuning path.** Every run used all 16 seeds, and each prediction
was written down before its run. The notes are kept outside the
repository.

| Run | Levers | Defend a1 / a2 / a3 | Uplink | Launch Window | Tunnel a2 / a3 | Wreck a2 / a3 |
| --- | --- | --- | --- | --- | --- | --- |
| hold only | holdTurns 8 | 16/16 · 16/16 · 16/15 | 16/16 | 16/16 | 16/16 · 16/16 | 14/16 · 16/15 |
| E1 | waves 0.1/pt up to 10, Uplink 8, Launch Window 10, surfacing every 2, strip 3, nests 0.3/d | 16/16 · 15/16 · 16/15 | 16/16 | 16/16 | 16/16 · 16/16 | 15/16 · 16/16 |
| E2 | surge 2, large tunnel and wreck maps, surfacing from turn 1 | 16/16 · 9/12 · 7/9 | 11/12 | 9/13 | 15/16 · 16/16 | 16/16 · 15/16 |
| E3 | E2, a held defence stays held, no search during the hold, Uplink 7 | 16/16 · 13/16 · 7/14 | 7/9 | 10/16 | – | – |
| E4 | surge 1.75, Uplink 6 | 16/16 · 12/16 · 11/14 | 12/14 | 10/16 | – | – |
| E5 | E4, generators 60, tunnel and wreck surge 2 | 16/16 · 12/16 · 10/15 | 10/15 | 12/16 | 14/16 · 16/16 | 13/16 · 16/15 |
| E6 | Launch Window 8, tunnel surge 3, wreck surge 3 and first wave a turn sooner | – | – | 10/16 | 11/16 · 16/16 | 11/15 · 14/14 |
| E7 | tunnel and wreck 2.5 (with the decorator) | same as E5 | same as E5 | 10/16 | 13/15 · 16/16 | 11/16 · 15/14 |
| final | the shipped values | 16/16 · 12/16 · 10/15 | 10/15 | 10/16 | 11/16 · 16/16 | 11/15 · 14/14 |

E1 moved nothing: the waves were small enough to be killed one at a
time, however many there were. E7 matched E5 and E6 exactly on the
cells it did not retune, so the decorator changes nothing it should
not.

## 4. The command

```
SIM_MATRIX_CELLS=defend-installation,story:uplink,story:launch-window,tunnel-sabotage,wreck-recovery \
SIM_MATRIX_OUT=/tmp/c2b-2.tsv \
  node_modules/.bin/vitest run --config vitest.sim.config.ts \
  --maxWorkers=8 src/app/service/calibration-matrix
```

The "before" column is the same command run in a worktree at
`1bf3b242`. Its rows match the committed baseline cell for cell.

## 5. Structural pins

- Every expert row reads `pin` `clear`, before and after.
- `expert_target` is `met` in every cell except `wreck-recovery/act-3`,
  which reads `allowance`.
- Launch Window's expert was `short` at the base (10/16, 6 runs capped)
  and is now `met`.
- The final run asserts the expert's target on the eight cells now in
  `TARGETED_CELLS`, and it exits 0.
- The other sweeps give the same results as at `1bf3b242`:
  - The mission sweep plays infestation clearances only, and its
    `mission.json` is byte-identical to the base's.
  - The pod sweep's output is byte-identical to the base's.
  - The defence sweep passes 5/5.
  - The campaign sweep passes 13/13.
