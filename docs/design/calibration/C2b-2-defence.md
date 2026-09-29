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
| `WAVE_PRESSURE_TUNING.tunnel` | (none) | surge 3, spill 3; removed in round 2 (§6) | The charges went in by turn 2 and could not be pulled, so the fight was on the way home. Once a bite pulls a burning charge, the fight is at the mouths and the surge took act 2 first. |
| `WAVE_PRESSURE_TUNING.wreck` | (none) | surge 3, spill 3, first wave a turn sooner | Half the new player's wins were home by turn 7, before the first wave (turn 3) had reached the wreck. |
| Swarm Tide on a pressed type | overwrote the surge | keeps the larger scale and spill | Without this, Swarm Tide would make a defence easier. |

The pressure is one decorator in the setup table. `withWavePressure`
runs the type's own setup, then `pressEdgeWaves`. Swarm Tide's
`raiseTide` goes through the same function.

```
MISSION_SETUP_RULES["wreck-recovery"] = withWavePressure(WRECK_RECOVERY_SETUP, WAVE_PRESSURE_TUNING.wreck)
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
  The charges could not be pulled, so the objective was done by turn
  4–5 whatever the bugs did.

  Only a mechanic would move it, not a tuning value. One option is
  bugs pulling a burning charge, which would make the arc's "survive
  the fuse" a fight. The cell was left out of `TARGETED_CELLS`. Ben
  chose that mechanic on 2026-09-28; round 2 (§6) is its calibration.
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

## 6. Round 2: the player defends the charge

Ben's decision (2026-09-28): "Ya let's have the player need to defend
the charge. Bugs can disarm it with a melee attack." Base `e847af40`
(int/w1), 32 seeds a cell, `SIM_MATRIX_CELLS=tunnel-sabotage`.

**The rule.** While a charge burns, one melee attack by a bug pulls it
(`TUNNEL_TUNING.meleeHitsToDisarm: 1`, Ben's number, not tuned). The
mouth is open and uncharged again, and Interact sets a new charge on a
full fuse. The objective is unchanged.

- **What a bug attacks: the charge, as an attack target.** Combat
  already resolves an attack on an `AttackTarget` (a unit or a
  spawner); a burning charge is a third kind on the mouth's charge
  tile, the TDF's, with the hits it has left as its hit points. Only a
  melee weapon may attack it, and every such attack lands: no dice.
  The generator was the precedent for "an objective the bugs attack",
  but a generator is a unit with vision and a turn; a charge is not.
- **Burrowers do not surface and pull in one phase.** A bug that
  surfaced this bug phase is refused (`charge-just-surfaced`); it
  pulls from its next. The burrowers come up each open mouth every
  third turn, so at a three-turn fuse every charge had a fresh
  burrower under it, and with surface-and-pull allowed no guard could
  stop it: the expert won 4/16 in each act. The rule is combat's, so
  the bug AI and Jev are held to it alike.
- **The event.** `TunnelChargeDisarmed { unitId, mouthId, objectiveId,
  chargeId, pulled }`, one per seal-tunnels objective naming the
  mouth, logged in the danger tone as "Swarmer 3 pulled the charge on
  tunnel 2 · the mouth is open again".
- **The bug AI.** A bug that can bite a burning charge this turn, where
  it stands or after a walk, does, nearest first, before anything its
  species would do (the generator draws a bug that sees it whatever
  else is nearer; a pull undoes the player's whole turn at a mouth, so
  it outranks a soldier in reach). A wider draw, walking toward a
  charge up to two or three turns away when the species would not
  attack, moved no cell by more than a seed (runs d2, d3) and is not
  shipped. Jev is offered the same bite.
- **The players.** The new player sets a charge and moves on, and a
  pulled mouth is a job again, so it comes back. The expert crews
  every mouth at once: two guard each burning charge from the ring just
  outside its blast, two set each open mouth, and the rest of the force
  takes the open mouth furthest from it. Every tunnel job shoots first
  at the bugs in sight that could bite its charge in the coming bug
  phase, and a unit with one in its sights shoots it before setting.

**Cells, 32 seeds.** Before is `e847af40` (charges unpullable, tunnel
surge 3). The ranges are the ±2σ band for one cell at 32 seeds.

| Cell | Player | Before | Mean lost | After | Mean lost | Range | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| tunnel-sabotage/act-2 | new | 23/32 | 4.63 | 27/32 | 3.78 | 20–28 (75%) | in band |
| tunnel-sabotage/act-2 | expert | 31/32 | 1.75 | 31/32 | 0.63 | ≥ 29 | met |
| tunnel-sabotage/act-3 | new | 31/32 | 3.72 | **31/32** | 2.31 | 16–26 (65%) | **above** |
| tunnel-sabotage/act-3 | expert | 32/32 | 1.03 | 32/32 | 0.25 | ≥ 29 | met |

Both cells are now in `TARGETED_CELLS`. The act-3 band's new-player
verdict is not asserted: `infestation-clearance/act-3` is not
targeted, so the band is incomplete.

**Levers.** Fuse 3 (the arc's number, kept) and the tunnel row of
the wave pressure (removed). Every run, new player / expert wins:

| Run | Settings | Act II | Act III |
| --- | --- | --- | --- |
| c3 (16 seeds) | fuse 3, surface-and-pull allowed, surge 3 | 0/16 · 4/16 | 1/16 · 4/16 |
| c3b (16) | fuse 3, surge 3, before the expert took the furthest mouth | 8/16 · 12/16 | 13/16 · 14/16 |
| c2b (16) | fuse 2, surge 3 | 10/16 · 14/16 | 16/16 · 16/16 |
| s1 (16) | fuse 3, no surge, spill 3 | 12/16 · 13/16 | 14/16 · 16/16 |
| f3 (16) | s1, expert's rest to the furthest mouth | 12/16 · 16/16 | 14/16 · 16/16 |
| **final** | fuse 3, shared waves | **27/32 · 31/32** | **31/32 · 32/32** |
| q4 | fuse 4 | 16/32 · 30/32 | 28/32 · 32/32 |
| q4s | fuse 4, no surge, spill 3 | 11/32 · 24/32 | 26/32 · 29/32 |
| q3s | fuse 3, no surge, spill 3 | 20/32 · 30/32 | 29/32 · 30/32 |
| w2 | first wave 2 turns sooner | 22/32 · 25/32 | 27/32 · 32/32 |
| w2d | w2 and the wider draw | 20/32 · 24/32 | 25/32 · 29/32 |
| fs1 | burrowers from turn 1 | 28/32 · 30/32 | 31/32 · 32/32 |

**Act III is off target, and no lever of this type fixes it.** Every
fuse and wave lever moved act 2 three to five times as far as act 3.
Act 3's force (mechs at 119 hp against act 2's 50, squads that cross
18 tiles in a turn) reaches all three mouths by turn 1–2, and the
charges blow by turn 3–4: in 6 of 8 traced seeds, nothing bit a
charge at all. The only press that reached that window, the first
wave two turns sooner, brought act 3 to 25–27/32 and left the act-2
expert at 24–25/32, under its pin. A lever for Act III alone (its
tunnel waves sooner) would need the wave pressure keyed by act as well
as type, which it is not; that is a decision for Ben.


**Renders** (`tools/ui/capture-tunnel-sabotage.mjs`): the briefing
with its Guard row (`../tunnel-sabotage-briefing.png`), a charge
burning with its fuse on the tracker (`../tunnel-sabotage-mission.png`),
and the next turn after a swarmer bit it, the log's pull line and the
tracker's "charge pulled" (`../tunnel-sabotage-pulled.png`).
