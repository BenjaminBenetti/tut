# Calibration matrix

The baseline for tuning the campaign's difficulty (#1179, campaign arc
§12). Two modelled players play every mission in every act band the arc
offers it in. They see only what the fog shows, and every run is
deterministic.

- **New** walks at the objective, shoots the nearest target, takes cover
  only when it happens to be on the path, and reloads. It uses no other
  ability.
- **Expert** takes cover and focus-fires on the lowest effective HP it
  can kill. It overwatches, throws grenades, uses mech abilities, guards
  objectives, pulls hurt units out, and extracts when the job is done or
  the force is collapsing. It sees round a held doorway, escorts the
  units carrying an objective home, and in a hive cavern walks round the
  sleeping broods and fires on the core first (see "The expert's habits").

| File | What it holds |
| --- | --- |
| `baseline-matrix.tsv` | One row per cell × player, plus the decision-gap row |
| `baseline-matrix.runs.tsv` | One row per run: the evidence behind a cell |

## Running it

From the repository root. The run takes about 30 minutes on 8 workers:

```
SIM_MATRIX_OUT=docs/design/calibration/baseline-matrix.tsv \
  node_modules/.bin/vitest run --config vitest.sim.config.ts \
  --maxWorkers=8 src/app/service/calibration-matrix
```

`SIM_MATRIX_SEEDS` sets the number of seeds; the default is 8. Without
`SIM_MATRIX_OUT` the matrix is skipped.

The runs are shared among eight shard files that claim them from a
single queue, heaviest cells first. The shard that finishes the last run
writes both files:

```
shard 1..8 ──► claim run i ──► play ──► SIM_MATRIX_OUT.parts/<token>/results/i.json
                     last result in ──► baseline-matrix.tsv + .runs.tsv
```

The code:

- The cells are in `src/app/service/calibration-cells.test-helper.ts`.
- The forces per band are in `calibration-forces.test-helper.ts`.
- The players are in `src/tactical/service/players/`.

## Reading it

**Rows.** Each cell is a mission type, or a story mission, in one act
band (`act-1`, `act-2`, `act-3`, `finale`). The seeds of a cell sample
the difficulty band and the bug mix across that act.

- `player` is who played the mission.
- `luck` is whose dice were used. When they differ, the row is the
  decision-gap row: the expert playing on the new player's dice. If the
  expert still beats the new player on the same dice, the gap is made by
  decisions, not by luck.

**Outcomes.**

- `won`, `extracted` and `lost` are the mission outcomes.
- `win_pct` counts `won` only.
- `capped` counts runs abandoned at the 60-turn cap.
- `stalled` counts runs abandoned after 10 turns with the job done and
  nobody getting out.

**Pin.** `pin` is set on the expert's own row only: `clear`,
`allowance` or `fail` (see "Pins").

**Targets.** `target_pct` is the expert's target for the band: 90, 75,
65 and 55. Tuning is aimed at the expert rows. The new player should sit
well below the expert.

**Losses and hits.**

- `units_lost_mean` and `mechs_lost_mean` count units killed, not units
  left behind.
- `hit_pct` is hits over shots fired. It should be about the same for
  both players. If it isn't, a gap is coming from where the players
  shoot, not from how they decide.

**Timing columns.** `bug_phase_ms_median` and `wall_s` depend on the
machine and its load. Compare them only against runs from the same
machine.

## Pins

The matrix holds only structural pins. Every run ends in an outcome,
and the expert plays at least as well as the new player. At 8 seeds a
per-cell "expert ≥ new" pin goes red on noise, so that rule is pinned
twice (`src/app/service/calibration-pins.test-helper.ts`):

```
per band   expert wins / runs  ≥  new wins / runs            no allowance
per cell   expert wins         ≥  new wins − PIN_SEED_ALLOWANCE (1)
```

One seed is binomial noise: a cell both players win half the time has
a standard deviation of √(8 × ½ × ½) ≈ 1.4 wins. A cell that needs the
allowance is marked `allowance` in the `pin` column, so a real weakness
hiding inside it stays in sight. The finale band has one cell, Launch
Window, so its band pin is a strict pin on that cell.

The band targets are asserted in an `it.skip`. It becomes a real test
when tuning lands.

## The expert's habits

Round 2 of #1179 fixed the weaknesses the first baseline showed:

- **A bug behind a door.** A unit that cannot walk any closer to its
  goal goes to a tile it can see the goal from (`vantagePoints`): round
  a held doorway, into a room a mech cannot enter. After a move it keeps
  a firing line on the bug it came for.
- **The defence's last stragglers.** Once the last wave is in, the
  search starts where the missing bugs were last seen. With no contact
  at all it starts at the generators. It used to run back to the
  generators as soon as a last-seen tile came into sight; that tile then
  fell out of sight, became a lead again, and on Launch Window the
  force walked between the two until the cap.
- **Escorting a courier.** Once only getting home is left, the healthy
  units keep to the ground just behind each courier (the squad carrying
  a wreck's parts, or a specimen). A courier that pulls more than three
  steps ahead waits. An escort that is ahead of the courier and cannot
  get round it, such as in a corridor, leads the way home instead of
  blocking it.
- **Hive caverns.** Dormant bugs are neither contact nor targets. The
  expert walks round a sleeping brood where the cavern allows, and keeps
  loud guns quiet near one. It walks the cavern at full pace, even in
  contact, and fires on the core before any bug it cannot kill
  (`brood-berth.test-helper.ts`).

## Known limits

- Alpha Hunt and Spore Platform are played by a stub that kills
  everything and then extracts.
- The hunting players know how many bugs are still alive, as the HUD
  tracker does, and remember where they last saw them.
- A defence straggler that settles on an upper floor of a far building
  can outlast the search. On Launch Window both players share that
  search, so the cell barely tells them apart.

## Why the hive cells sit at 0%

Hive Assault act-2 and the Great Hive are on the campaign spine, and
both players win neither. The expert was given the hive habits above,
then instrumented on every seed of Hive Assault and on four seeds of the
Great Hive: turns walking, broods woken and why, where each unit died,
and how near the core it got. The mission was not tuned.

Every cavern chamber but the mouth holds a dormant brood. Its wake zone
is the whole chamber, so a route chamber cannot be walked round. A
shortest-path check on 8 seeds per cell counts the broods between the
drop ship and the core that no route avoids:

| Cell | Start to core | Route broods (bugs) | Core brood | Core HP |
| --- | --- | --- | --- | --- |
| Hive Assault act-2 | 131–151 steps | 2–3 (22–39) | 16–18 | 60–90 |
| Hive Assault act-3 | 125–167 steps | 2–4 (24–56) | 17–18 | 60–90 |
| Great Hive | 194–234 steps | 3–6 (24–48) | 12 | 200 |

**Hive Assault act-2: the brood, not the cap.** The act-2 force is one
50 HP mech and four 20 HP squads. The walk takes 13–15 turns each way,
which leaves time under the 60-turn cap. But the first route brood
(11–13 bugs) wakes on entry at turn 2–4. On all 8 seeds:

- three or four of the four squads died, the first on turns 4–7 and
  the last by turns 8–13, 17–56 steps from the drop ship;
- the force came no nearer the core than 50–96 steps and never saw it;
- it killed 11–39 bugs, and 40–74 were awake at the end;
- 4 runs were lost and 4 extracted.

The objective is out of the act-2 force's reach, so this is a mission
cause, not a driver one. One human tactic is untested: pulling a brood
back to a tunnel chokepoint.

**Hive Assault act-3: winnable.**

| Expert | Won | Core seen | Core down |
| --- | --- | --- | --- |
| Round 1 | 3/8 | not recorded | not recorded |
| Round 2 | 5/8 | turns 14–22 on 5 seeds | turns 20–31 on those 5 |

On those five seeds the force took 5–15 core HP a turn. On seed 3 the
last mech stuck 26 steps from home after the rest were out; the run
still counts as won, by stall. The three losses:

- seed 4 has the longest walk, 167 steps; the force saw the core on
  turn 52;
- seeds 5 and 7 never found the core, which was 18–21 steps away at
  the closest.

**Great Hive: the cap.** The walk alone takes 20–24 turns each way:
39–47 of the 60 turns. Fighting through the route broods, the force
reached the core on one seed of four:

- On seed 2 it saw the core on turn 40 and brought it down on turn 59,
  200 HP at about 10.5 a turn, with the walk home still ahead.
- On the other seeds the closest approach was 18–42 steps.
- The cavern starts with 68–78 bugs and its nests add 3.3–4.0 a turn,
  275–315 in all. The force killed 145–156 of them, and 106–135 were
  awake at the cap.

The budget is 20–24 turns in, 13–20 turns at the core (200 HP at 10–15
a turn) and 20–24 turns out: 53–68 turns before any fighting on the
route, against a 60-turn cap. So the cap is the blocker. The core's HP
and the distance to it are the levers.

These numbers come from scratch probes of the round-2 expert, before
the escort and search fixes. Neither fix acts in a hive, because a hive
has no courier and no defence. The Great Hive probe ran 4 seeds (bug
phase about 4.5 s a turn without the perf package); the matrix below
ran all 8.

## The committed baseline

Measured on 2026-09-26 at 8 seeds, from commit `3412e7c2` of #1179. The
run took 37 minutes on 8 workers, and every pin held. Round 1 is the
first baseline, from `9f65acef`. "Was" marks a new-player cell that
moved, because the two players share the objective strategies.

| Cell | Target | New | Expert, round 1 | Expert, round 2 | Pin |
| --- | --- | --- | --- | --- | --- |
| `infestation-clearance/act-1` | 90% | 6/8 | 8/8 | 8/8 | clear |
| `infestation-clearance/act-2` | 75% | 4/8 | 5/8 | 5/8 | clear |
| `infestation-clearance/act-3` | 65% | 7/8 | 7/8 | 7/8 | clear |
| `crash-site/act-1` | 90% | 7/8 | 8/8 | 8/8 | clear |
| `crash-site/act-2` | 75% | 6/8 | 7/8 | 7/8 | clear |
| `crash-site/act-3` | 65% | 8/8 | 8/8 | 8/8 | clear |
| `evacuation/act-1` | 90% | 4/8 | 6/8 | 5/8 | clear |
| `evacuation/act-2` | 75% | 4/8 | 3/8 | 3/8 | allowance |
| `evacuation/act-3` | 65% | 2/8 | 3/8 | 3/8 | clear |
| `defend-installation/act-1` | 90% | 8/8 (was 7) | 7/8 | 8/8 | clear |
| `defend-installation/act-2` | 75% | 4/8 | 4/8 | 5/8 | clear |
| `defend-installation/act-3` | 65% | 7/8 (was 8) | 7/8 | 7/8 | clear |
| `tunnel-sabotage/act-2` | 75% | 4/8 | 6/8 | 6/8 | clear |
| `tunnel-sabotage/act-3` | 65% | 8/8 | 8/8 | 8/8 | clear |
| `wreck-recovery/act-2` | 75% | 7/8 | 6/8 | 7/8 | clear |
| `wreck-recovery/act-3` | 65% | 8/8 | 8/8 | 8/8 | clear |
| `hive-assault/act-2` | 75% | 0/8 | 0/8 | 0/8 | clear |
| `hive-assault/act-3` | 65% | 0/8 | 3/8 | 5/8 | clear |
| `story:first-skyfall/act-1` | 90% | 8/8 | 8/8 | 8/8 | clear |
| `story:live-specimen/act-1` | 90% | 4/8 | 5/8 | 5/8 | clear |
| `story:intact-pod/act-2` | 75% | 7/8 | 8/8 | 8/8 | clear |
| `story:uplink/act-3` | 65% | 7/8 (was 8) | 8/8 | 8/8 | clear |
| `story:great-hive/act-3` | 65% | 0/8 | 0/8 | 0/8 | clear |
| `story:launch-window/finale` | 55% | 5/8 | 7/8 | 5/8 | clear |

Per band, wins over runs:

| Band | New | Expert, round 1 | Expert, round 2 |
| --- | --- | --- | --- |
| act-1 | 37/48 (77%) | 42/48 (88%) | 42/48 (88%) |
| act-2 | 36/64 (56%) | 39/64 (61%) | 41/64 (64%) |
| act-3 | 47/72 (65%) | 52/72 (72%) | 54/72 (75%) |
| finale | 5/8 (62%) | 7/8 (88%) | 5/8 (62%) |

**The allowance.** Only `evacuation/act-2` uses it, as it did in
round 1. The players differ on one seed only: on seed 6 the expert
lost all five units on turn 29, while the new player got the civilians
out, lost three units, and stalled to a win on the same turn.

**Launch Window.** A matrix run at `a681faf4`, before the search fix,
failed the finale band pin: the expert won 4/8 to the new player's 5/8.
All four losses capped with stragglers still unfound. With the search
fix the expert wins 5/8, level with the new player. Four search
anchors were tried on the defence cells; none takes the expert above
5/8 here:

| Anchor | Expert | New |
| --- | --- | --- |
| last contact | 5/8 | 5/8 |
| the force | 5/8 | 5/8 |
| the generators | 4/8 | 5/8 |
| both | 4/8 | 5/8 |

Round 1's 7/8 included a win on turn 60 and one at the cap. The cell is
decided by the straggler hunt, and both players share it (see "Known
limits").

`baseline-matrix.runs.tsv` holds the runs behind each cell.
