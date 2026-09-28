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
| `baseline-matrix.bands.tsv` | One row per act band: the new player against its band target |
| `baseline-matrix.runs.tsv` | One row per run: the evidence behind a cell |

## Running it

From the repository root. The run takes 12 to 17 minutes on 8 workers
at the default 16 seeds, depending on the machine's load (see "Seeds"):

```
SIM_MATRIX_OUT=docs/design/calibration/baseline-matrix.tsv \
  node_modules/.bin/vitest run --config vitest.sim.config.ts \
  --maxWorkers=8 src/app/service/calibration-matrix
```

`SIM_MATRIX_SEEDS` sets the number of seeds; the default is 16. Without
`SIM_MATRIX_OUT` the matrix is skipped.

`SIM_MATRIX_CELLS` plays only some cells: a comma-separated list of
cell ids or prefixes of them. An entry that selects no cell stops the
run. A filtered run keeps each cell's place in the full list, so it
plays exactly the missions, forces and dice the full matrix plays for
those cells:

```
SIM_MATRIX_CELLS=hive-assault,story:great-hive/act-3 \
SIM_MATRIX_OUT=/tmp/hives.tsv \
  node_modules/.bin/vitest run --config vitest.sim.config.ts \
  --maxWorkers=8 src/app/service/calibration-matrix
```

| Entry | Selects |
| --- | --- |
| `hive-assault` | `hive-assault/act-2`, `hive-assault/act-3` |
| `story:great-hive/act-3` | that cell only |
| `story:` | every story cell |
| `evacuation/act-2,story:uplink` | those two cells |

The runs are shared among eight shard files that claim them from a
single queue, heaviest cells first. The shard that finishes the last run
writes the three files:

```
shard 1..8 ──► claim run i ──► play ──► SIM_MATRIX_OUT.parts/<token>/results/i.json
                     last result in ──► baseline-matrix.tsv + .runs.tsv + .bands.tsv
```

The code:

- The cells are in `src/app/service/calibration-cells.test-helper.ts`.
- The forces per band are in `calibration-forces.test-helper.ts`.
- The players are in `src/tactical/service/players/`.

## The forces

Each act band deploys what the campaign sweep's Average player holds
halfway through that act, the force most of the act is fought with
(campaign arc §12), filled to the deployment cap of eight from its bank
(see "Filling to eight"). The probe plays that player through 24 seeds
of `endlessStory` and records every day after its research. Each seed is
read at a point of its own campaign:

```
act A began at mission a, the next act at mission b
  act-1, act-2, act-3   the first day in A with at least (a + b) / 2 missions played
  finale                the first day in the finale (its arrival)
```

To run it:

```
SIM_FORCES_OUT=/tmp/forces.txt \
  node_modules/.bin/vitest run --config vitest.sim.config.ts \
  src/app/service/calibration-force-probe.sim.test.ts
```

It writes each band's derived force and its fill beside the committed
force, and every seed's snapshot, with its act's bounds, to
`/tmp/forces.txt.snapshots.tsv`. It takes seconds.

- **Seeds.** A seed that never finishes an act has no midpoint for it
  and does not count for that band.
- **Ranks** are the median seed's squad xp and mech xp. The median is
  the lower middle value, so it is a value some seed had.
- **Research** is every node that at least half the band's seeds held.
- **The mech** is the starter loadout refitted by `refitLoadout`: each
  researched part that raises the bay's combat rating. A starter part it
  swapped out may come back in a later pass, so more research never
  rates lower.
- **The bank** is the median seed's unspent credits, and it buys the
  reinforcements.

The probe reports and changes nothing. Copy what changed into
`calibration-forces.test-helper.ts` and rerun the matrix. Unit tests
check that each committed loadout is the refit of its band's research,
and that each band's reinforcements are what the fill buys from its
bank.

The seeds each band used, of 24:

| Band | Point | Seeds | Act began (median mission) | Read at (median mission) |
| --- | --- | --- | --- | --- |
| act-1 | midpoint | 24 | 0 | 7 |
| act-2 | midpoint | 24 | 13 | 25 |
| act-3 | midpoint | 23 (one never reached the finale) | 37 | 45 |
| finale | arrival | 23 | 51 | 51 |

### Filling to eight

**The campaign sweep's modelled player never hires.** It spends credits
only on its battery of installations and on rebuilding a wrecked mech,
so it fights every mission with the starting five (four squads and a
mech) while its bank grows. A player does not play that way. Units cost
no upkeep, a squad hires for 500 to 900 credits, and a new game starts
with 5,000 (`economy-tuning.ts`), so a real player fields the cap of
eight long before Act III. The sweep's bank is money a player would
have spent on units. So every band spends its median bank on rookies
(0 xp), at the band's point, and only on unit types its research lets
it hire, at their real prices. The campaign sweep itself is unchanged.

One rule for every band (`calibration-fill.test-helper.ts`). The open
slots are the cap less the starting roster: 8 − 5 = 3.

1. **Refit mechs** go into every open slot but one. Each is bought while
   the bank covers it and still covers the cheapest hire (a rifle squad,
   500) for every slot after it. A mech costs the bay's full price for
   the band's refit, with no salvaged parts in stock.
2. **A medic** goes into the last slot, on the same terms.
3. **Any slot left** takes the best-rated squad the bank covers on the
   same terms; catalogue order breaks a tie. A slot nothing covers stays
   empty.

Why this order:

- **Mechs first.** A refit mech rates 113 to 236 in the bay, and a squad
  24 to 60, so a mech is the most force a slot can hold.
- **One slot for a medic.** The roster already fields four squads and
  nothing in it heals them; the medic's medkit does. The missions ask
  for squads' kit (capture nets, medkits, scanners, breaching charges),
  and the GDD has squads matter on their own (§5.7), so a force of
  mechs alone is not the game. A medic and two refit mechs is the
  composition Act III has had since the first matrix.
- **Without the kept slot**, "mechs while the bank covers them" buys a
  third mech instead of the medic in every band, because every band's
  bank covers three. The kept slot is the only difference.

Every band's bank covers three refit mechs, so the rule gives every band
the same fill: two refit mechs and a medic.

| Band | Read at (median mission) | Bank before | Fill | Spent | Bank after |
| --- | --- | --- | --- | --- | --- |
| act-1 | 7 | 11,434 | 2 starter mechs at 2,850 + a medic at 600 | 6,300 | 5,134 |
| act-2 | 25 | 34,988 | 2 Act II refits at 4,400 + a medic | 9,400 | 25,588 |
| act-3 | 45 | 66,585 | 2 Act III refits at 11,750 + a medic | 24,100 | 42,485 |
| finale | 51 | 79,453 | 2 Act III refits at 11,750 + a medic | 24,100 | 55,353 |

### The committed forces: mid-act to filled

"Mid-act" is round 2 of this refresh, in which only Act III and the
finale filled the deployment. "Filled" is round 3, committed: every
band filled by the rule above. The four starting squads are two rifle
squads, a radio squad and a rocket squad. Force rating is the catalogue
ratings summed, before ranks and upgrades: rifle 40, radio 28, rocket
56, medic 24, and each mech its bay rating.

| Band | Forces | Units | Squads (xp) | Mechs (xp) | Research | Mech rating | Force rating |
| --- | --- | --- | --- | --- | --- | --- | --- |
| act-1 | mid-act | 5 | the four (30) | starter (30) | 0 | 113 | 277 |
| act-1 | **filled** | **8** | the four (35), **medic (0)** | starter (30), **2 starter (0)** | **2** | 113 | **527** |
| act-2 | mid-act | 5 | the four (125) | Act II refit (25) | 12 | 142 | 306 |
| act-2 | **filled** | **8** | the four (125), **medic (0)** | Act II refit (25), **2 Act II refits (0)** | 12 | 142 | **614** |
| act-3 | mid-act, **filled** | 8 | the four (225), medic (0) | Act III refit (60), 2 Act III refits (0) | 25 | 236 | 896 |
| finale | mid-act, **filled** | 8 | the four (255), medic (0) | Act III refit (40), 2 Act III refits (0) | 30 | 236 | 896 |

- **Act I** now holds Jump Jets and All-Terrain, which half its seeds
  held by mission 7. Neither raises the starter's rating, so its mechs
  stay on the starter loadout. Its squads are 35 xp, as the probe
  reads, up from 30.
- **Act III and the finale** are unchanged: the rule gives the fill they
  already had.
- **The fill's rookies** are 0 xp. A player who hired early would have
  ranked them up since, so this is the least they could be.

### Earlier forces

The forces before the fill, for the #1179 retune (base 8bf21fba). "C2a"
is the first matrix's forces. "Mission 15/35" is round 1 of this
refresh, read at fixed mission counts. "Mid-act" is round 2:

| Band | Forces | Squads | Mech | Research | Mech rating | Units |
| --- | --- | --- | --- | --- | --- | --- |
| act-1 | all three | Corporal (30) | Corporal (30) | 0 | 113 | 5 |
| act-2 | C2a | Sergeant (75) | Sergeant (75) | 9 | 142 | 5 |
| act-2 | mission 15 | Sergeant (75) | Sergeant (75) | 6 | 115 | 5 |
| act-2 | mid-act | Staff Sergeant (125) | Private First Class (25) | 12 | 142 | 5 |
| act-3 | C2a | Sergeant First Class (175) | Sergeant First Class (175) | 25 | 222 | 8 |
| act-3 | mission 35 | Sergeant First Class (175) | Corporal (55) | 19 | 236 | 8 |
| act-3 | mid-act | Master Sergeant (225) | Sergeant (60) | 25 | 236 | 8 |
| finale | C2a, mission 35 | as Act III | as Act III | as Act III | as Act III | as Act III |
| finale | arrival | Master Sergeant (255) | Corporal (40) | 30 | 236 | 8 |

- **Missions 15 and 35 were the starts of Acts II and III.** Acts I, II
  and III run about 13, 24 and 14 missions for the Average player.
  Missions 15 and 35 fall early in Acts II and III, so the round-1
  forces were the weakest each act sees.
- **Act II** holds C2a's nine nodes (the thermal lance, railgun, heavy
  autocannon and reactor among them) plus the Spitter, Hive Guard and
  Burrower autopsies. Its refit is C2a's: thermal lance and composite
  plating, rated 142.
- **Act III** holds 25 nodes, as C2a's did, with two swapped. It lacks
  the sprint frame and field medic training, and holds the Broodmother
  and Armoured autopsies instead. Its refit is round 1's, rated 236.
- **The finale** has its own force: 30 nodes and higher ranks. Its
  research adds nothing that raises the rating, so it refits to the
  Act III mech.
- **The mech** ranks well below the squads in every band. The sweep
  rebuilds a mech lost on a lost mission at 0 xp, and the seeds' mechs
  range from 0 to 145 xp halfway through Act II and from 0 to 215
  halfway through Act III.

## Seeds

A full run at 8 seeds, 392 runs, took 356 s on 8 workers at 8bf21fba
(2026-09-26, the 32-core machine at load 35 to 55). The runs added up
to 2,794 s, so the 8 workers were busy for all but 7 s of it. The
longest single run was a Launch Window at 85 s. Runs cost:

| Cells | Mean run |
| --- | --- |
| Launch Window, Great Hive | 29–31 s |
| Act III Hive Assault and Defend Installation | 17 s |
| the other Act III cells | 1–12 s |
| Act I and Act II cells | 0.5–5 s |

16 seeds doubles the runs to 784. Three full runs at 16 seeds:

| Forces | Wall | Runs added up | Longest run | Load |
| --- | --- | --- | --- | --- |
| mission 15/35 | 657 s | 5,220 s | Launch Window, 96 s | about 40 |
| mid-act | 996 s | 7,941 s | Launch Window, 124 s | 16 rising to 50 |
| filled (committed) | 738 s | 5,808 s | Launch Window, 184 s | 20 to 40 |

The load moves the time as much as the forces do. The filled run's
Act III and finale runs have the same outcomes as the mid-act run's,
run for run, yet added up to 4,763 s against 5,905 s, and the median
bug phase in them took 54 ms against 106 ms. All three are inside the
half hour allowed, so the default is 16, the larger of the two counts
considered. The round-2 baseline recorded 37 minutes for 8 seeds at
`3412e7c2`; the same 392 runs at 8bf21fba gave the same outcomes in
356 s. The Act III and finale cells dominate
the time, so a filtered run of the other bands takes a few minutes.
The shards take the longest cells first (`HEAVY_FIRST`), so the last
runs to finish are short ones.

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

**Targets.** Each player has its own target (campaign arc D5 and §12),
and every row names both:

- `new_band_target_pct` is the **new player's** target for the band:
  90, 75, 65 and 55. It is met by the whole band, on the new player's
  wins pooled over every run of every cell in it, not cell by cell.
  `baseline-matrix.bands.tsv` holds each band's pooled rate against it.
- `expert_cell_target_pct` is the **expert's** target: at least 90% in
  every cell.
- `expert_target` is set on the expert's own row only: `met`,
  `allowance` or `short`.

Tuning aims the new player at its band targets while the expert keeps
90% or better in every cell. The gap between the two must come from
decisions, not dice. See "Targets" below.

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
and the expert plays at least as well as the new player. At 8 or 16
seeds a per-cell "expert ≥ new" pin goes red on noise, so that rule is
pinned twice (`src/app/service/calibration-pins.test-helper.ts`):

```
per band   expert wins / runs  ≥  new wins / runs            no allowance
per cell   expert wins         ≥  new wins − PIN_SEED_ALLOWANCE (1)
```

One seed is binomial noise: a cell both players win half the time has
a standard deviation of √(8 × ½ × ½) ≈ 1.4 wins at 8 seeds and 2 at 16. A cell that needs the
allowance is marked `allowance` in the `pin` column, so a real weakness
hiding inside it stays in sight. The finale band has one cell, Launch
Window, so its band pin is a strict pin on that cell.

## Targets

The arc sets the targets; `calibration-targets.test-helper.ts` holds
them and how they are judged:

```
new player   band's pooled wins / runs  within  target ± 2σ        NEW_PLAYER_BAND_TARGETS 90 / 75 / 65 / 55
expert       each cell's wins           ≥  ⌈90% × runs⌉ − 1        EXPERT_CELL_TARGET 90, EXPERT_TARGET_ALLOWANCE 1
```

**The new player: a band, two-sided.** A band well above its target is
too easy, which the arc's rising curve rules out as firmly as one that
is too hard, so the band must sit inside its tolerance on both sides
(`on`, else `low` or `high`). The tolerance is two binomial standard
deviations of the pooled rate at the target:

```
tolerance = 2 × 100 × √(p (1 − p) / runs)      p = target / 100
```

A band exactly on target lands inside on about 95% of seed sets. The
runs of a band are not one coin: its cells differ, and coins of mixed
bias vary less than one coin at their mean, so this is an upper bound
on the noise and the band lands inside more often still. The
tolerance shrinks as cells are added to a band:

| Band | Cells | Runs at 8 seeds | Tolerance | Runs at 16 seeds | Tolerance |
| --- | --- | --- | --- | --- | --- |
| act-1 (90%) | 6 | 48 | ± 8.7 | 96 | ± 6.1 |
| act-2 (75%) | 8 | 64 | ± 10.8 | 128 | ± 7.7 |
| act-3 (65%) | 9 | 72 | ± 11.2 | 144 | ± 7.9 |
| finale (55%) | 1 | 8 | ± 35.2 | 16 | ± 24.9 |

The finale band holds only Launch Window until the Spore Platform
joins it, so its tolerance is wide: one cell is one cell's noise.

**The expert: every cell, a floor.** 90% of a cell's runs, rounded up,
is 8 of 8 at 8 seeds and 15 of 16 at 16. A cell one seed short passes
as `allowance`, marked in `expert_target` so it stays in sight; two
short is `short`. Without the allowance the bar is a coin toss for a
cell that truly sits at 90%:

| True expert rate | ≥ 8 of 8 | ≥ 7 of 8 | ≥ 15 of 16 | ≥ 14 of 16 |
| --- | --- | --- | --- | --- |
| 85% | 27% | 66% | 28% | 56% |
| 90% | 43% | 81% | 51% | 79% |
| 95% | 66% | 94% | 81% | 96% |
| 99% | 92% | 100% | 99% | 100% |

Aim for `met`. A cell at 90% exactly will read `allowance` about one
time in four at 16 seeds; a cell that reads `allowance` on two seed
sets is probably below 90%.

**When they are asserted.** The targets are measured and written on
every run, and asserted for the cells in `TARGETED_CELLS`, which is
empty at the baseline, so both assertions are skipped. A tuning
package adds its own cells' filters (the `SIM_MATRIX_CELLS` syntax)
when its tuning lands. That unskips the expert's assertion on those
cells. A band's new-player assertion runs once every cell of the band
is listed and played in the run.

## How tuning packages record results

A tuning package changes missions, never the players or the matrix's
record. It writes its evidence to its own file, and the coordinator
reruns the baseline once the packages have merged:

```
package ──► tunes its cells ──► filtered matrix run ──► docs/design/calibration/<package>.md
                            └─► its cells in TARGETED_CELLS (once they meet the targets)
coordinator ──► merges the packages ──► full matrix run ──► baseline-matrix.tsv, .runs.tsv, .bands.tsv
                                                       └─► "The committed baseline" below
```

**What a package does not touch.**

- It does not edit `baseline-matrix.tsv`, `.runs.tsv` or `.bands.tsv`,
  or the baseline tables in this README. Two packages that each rewrote
  the baseline would conflict, and neither file would be a full run of
  the merged code.
- It does not change either player's decisions. If a player looks
  wrong, it records the evidence (the cell, the seeds, the turns, what
  the player did) in its file and leaves the change to the owner of the
  players.

**What a package writes:** `docs/design/calibration/<package>.md`,
named for the package (for example `C4-evacuation.md` for a package
that tunes Evacuation), holding:

1. **Base and cells.** The commit it measured from and the
   `SIM_MATRIX_CELLS` filter for its cells.
2. **The change.** Each tuning value it moved, from what to what, and
   why.
3. **Before and after.** A filtered run of its cells on its base, and
   another on its head, at the default 16 seeds. A filtered run keeps
   each cell's place in the full list, so its rows use the same
   missions and dice as the full matrix and compare with the baseline
   directly. One row per cell:

   | Cell | New before | New after | Band target | Expert before | Expert after | `expert_target` |
   | --- | --- | --- | --- | --- | --- | --- |

   If the filter covers every cell of a band, add that band's row from
   the run's `.bands.tsv`: the pooled new-player rate, its tolerance
   and its verdict (`on`, `low` or `high`).
4. **The command.** The exact command, so the run can be repeated.
   Write the run's output outside the repository:

   ```
   SIM_MATRIX_CELLS=evacuation \
   SIM_MATRIX_OUT=/tmp/evacuation.tsv \
     node_modules/.bin/vitest run --config vitest.sim.config.ts \
     --maxWorkers=8 src/app/service/calibration-matrix
   ```

5. **Structural pins.** Whether they held, and any cell whose `pin`
   now reads `allowance`.

**Turning on the targets.** Once its cells meet their targets, the
package adds its filters to `TARGETED_CELLS` in
`calibration-targets.test-helper.ts`. That makes the expert's target
an assertion for those cells, and the band's new-player target too, if
the package's cells complete the band. A cell that has not met its
target stays out of the list. Its file says how far it fell short.

**The coordinator** merges the packages, runs the full matrix into
`baseline-matrix.tsv` and updates "The committed baseline". Each
package's file stays as the record of its change.

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
  expert remembers where it saw sleepers, reads each brood's round off
  them, walks round it where the cavern allows, and keeps loud guns
  quiet near one. In a cavern where broods sleep it walks no further
  than ground it has seen. It walks the cavern at full pace, even in
  contact, and fires on the core before any bug it cannot kill
  (`brood-berth.test-helper.ts`, C3a in `C3a-hives.md`).

## Known limits

- Alpha Hunt and Spore Platform are played by a stub that kills
  everything and then extracts.
- The hunting players know how many bugs are still alive, as the HUD
  tracker does, and remember where they last saw them.
- A defence straggler that settles on an upper floor of a far building
  can outlast the search. On Launch Window both players share that
  search, so the cell barely tells them apart.

## Why the hive cells sat at 0%

C3a calibrated the hives after this baseline: see `C3a-hives.md` for
the diagnosis, the levers and the cells now. The section below is the
round-2 record.

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

**Hive Assault act-2: the brood, not the cap.** The act-2 force these
probes played was five units: one 50 HP mech and four 20 HP squads. The walk takes 13–15 turns each way,
which leaves time under the 60-turn cap. But the first route brood
(11–13 bugs) wakes on entry at turn 2–4. On all 8 seeds:

- three or four of the four squads died, the first on turns 4–7 and
  the last by turns 8–13, 17–56 steps from the drop ship;
- the force came no nearer the core than 50–96 steps and never saw it;
- it killed 11–39 bugs, and 40–74 were awake at the end;
- 4 runs were lost and 4 extracted.

The objective is out of the act-2 force's reach, so this is a mission
cause, not a driver one. The filled Act II force of eight does little
better: the expert wins 2 of 16 and the new player none. One human tactic is untested: pulling a brood
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
phase about 4.5 s a turn without the perf package); the round-2 matrix
ran all 8.

## The committed baseline

Measured on 2026-09-27 at 16 seeds, from commit `09d4e63a`, with the
filled forces above. The run took 738 s on 8 workers. The band pins
all hold. **Two cell pins fail**, `evacuation/act-1` and
`evacuation/act-2` (see "The pins that fail"), so the run exits 1. The
targets are measured but not asserted, because `TARGETED_CELLS` is
empty.

| Cell | New target (band) | New | Expert target | Expert | `expert_target` | Pin |
| --- | --- | --- | --- | --- | --- | --- |
| `infestation-clearance/act-1` | 90% | 16/16 (100%) | 90% | 16/16 (100%) | met | clear |
| `infestation-clearance/act-2` | 75% | 12/16 (75%) | 90% | 16/16 (100%) | met | clear |
| `infestation-clearance/act-3` | 65% | 11/16 (69%) | 90% | 14/16 (88%) | allowance | clear |
| `crash-site/act-1` | 90% | 16/16 (100%) | 90% | 16/16 (100%) | met | clear |
| `crash-site/act-2` | 75% | 16/16 (100%) | 90% | 16/16 (100%) | met | clear |
| `crash-site/act-3` | 65% | 16/16 (100%) | 90% | 16/16 (100%) | met | clear |
| `evacuation/act-1` | 90% | 14/16 (88%) | 90% | 10/16 (63%) | short | **fail** |
| `evacuation/act-2` | 75% | 8/16 (50%) | 90% | 6/16 (38%) | short | **fail** |
| `evacuation/act-3` | 65% | 7/16 (44%) | 90% | 7/16 (44%) | short | clear |
| `defend-installation/act-1` | 90% | 16/16 (100%) | 90% | 16/16 (100%) | met | clear |
| `defend-installation/act-2` | 75% | 15/16 (94%) | 90% | 16/16 (100%) | met | clear |
| `defend-installation/act-3` | 65% | 14/16 (88%) | 90% | 16/16 (100%) | met | clear |
| `tunnel-sabotage/act-2` | 75% | 16/16 (100%) | 90% | 16/16 (100%) | met | clear |
| `tunnel-sabotage/act-3` | 65% | 16/16 (100%) | 90% | 16/16 (100%) | met | clear |
| `wreck-recovery/act-2` | 75% | 14/16 (88%) | 90% | 16/16 (100%) | met | clear |
| `wreck-recovery/act-3` | 65% | 16/16 (100%) | 90% | 15/16 (94%) | met | allowance |
| `hive-assault/act-2` | 75% | 0/16 (0%) | 90% | 2/16 (13%) | short | clear |
| `hive-assault/act-3` | 65% | 0/16 (0%) | 90% | 5/16 (31%) | short | clear |
| `story:first-skyfall/act-1` | 90% | 16/16 (100%) | 90% | 16/16 (100%) | met | clear |
| `story:live-specimen/act-1` | 90% | 6/16 (38%) | 90% | 13/16 (81%) | short | clear |
| `story:intact-pod/act-2` | 75% | 16/16 (100%) | 90% | 16/16 (100%) | met | clear |
| `story:uplink/act-3` | 65% | 16/16 (100%) | 90% | 16/16 (100%) | met | clear |
| `story:great-hive/act-3` | 65% | 0/16 (0%) | 90% | 0/16 (0%) | short | clear |
| `story:launch-window/finale` | 55% | 9/16 (56%) | 90% | 10/16 (63%) | short | clear |

The decision-gap row: on the new player's dice, the expert wins
`story:live-specimen/act-1` 15/16, against 13/16 on its own dice and
the new player's 6/16. The gap there is decisions, not luck.

Per band, wins over runs (`baseline-matrix.bands.tsv`):

| Band | New target | New | New verdict | Expert target | Expert | Expert cells met | Expert over new |
| --- | --- | --- | --- | --- | --- | --- | --- |
| act-1 | 90% ± 6.1 | 84/96 (87.5%) | on | 90% a cell | 87/96 (90.6%) | 4 of 6 | holds |
| act-2 | 75% ± 7.7 | 97/128 (75.8%) | on | 90% a cell | 104/128 (81.3%) | 6 of 8 | holds |
| act-3 | 65% ± 7.9 | 96/144 (66.7%) | on | 90% a cell | 105/144 (72.9%) | 5 of 9 | holds |
| finale | 55% ± 24.9 | 9/16 (56.3%) | on | 90% a cell | 10/16 (62.5%) | 0 of 1 | holds |

The expert meets its target in 15 of the 24 cells, is one seed short in
1, and is `short` in 8. Every band reads `on` for the new player, but
only on average. Act I pools five cells at 88–100% with Live Specimen at
38%. Act II pools Hive Assault at 0% with three cells at 100%. Act III
has two cells at 0% (the hives) and four at 100%.

**What the fill changed.** Act III and the finale kept their forces,
and their 320 runs have the same outcomes as the mid-act baseline's,
run for run. Acts I and II went from five units to eight. Their cells,
mid-act to filled:

| Cell | New, mid-act | New, filled | Expert, mid-act | Expert, filled |
| --- | --- | --- | --- | --- |
| `infestation-clearance/act-1` | 12/16 | 16/16 | 16/16 | 16/16 |
| `crash-site/act-1` | 15/16 | 16/16 | 16/16 | 16/16 |
| `evacuation/act-1` | 8/16 | 14/16 | 10/16 | 10/16 |
| `defend-installation/act-1` | 16/16 | 16/16 | 14/16 | 16/16 |
| `story:first-skyfall/act-1` | 16/16 | 16/16 | 16/16 | 16/16 |
| `story:live-specimen/act-1` | 6/16 | 6/16 | 12/16 | 13/16 |
| `infestation-clearance/act-2` | 10/16 | 12/16 | 10/16 | 16/16 |
| `crash-site/act-2` | 16/16 | 16/16 | 16/16 | 16/16 |
| `evacuation/act-2` | 4/16 | 8/16 | 7/16 | 6/16 |
| `defend-installation/act-2` | 10/16 | 15/16 | 12/16 | 16/16 |
| `tunnel-sabotage/act-2` | 12/16 | 16/16 | 14/16 | 16/16 |
| `wreck-recovery/act-2` | 14/16 | 14/16 | 16/16 | 16/16 |
| `hive-assault/act-2` | 0/16 | 0/16 | 0/16 | 2/16 |
| `story:intact-pod/act-2` | 16/16 | 16/16 | 16/16 | 16/16 |

The new player's Act I rate rose from 76.0% to 87.5% and its Act II
rate from 64.1% to 75.8%; both bands were `low` and are now `on`.

### Furthest from target

**The new player**, a cell's rate against its band's target. The target
is judged on the pooled band, but these cells move the band most:

| Direction | Cell | New | Target | Off by |
| --- | --- | --- | --- | --- |
| below | `hive-assault/act-2` | 0% | 75% | −75 |
| below | `hive-assault/act-3`, `story:great-hive/act-3` | 0% | 65% | −65 |
| below | `story:live-specimen/act-1` | 38% | 90% | −52 |
| below | `evacuation/act-2` | 50% | 75% | −25 |
| below | `evacuation/act-3` | 44% | 65% | −21 |
| above | `crash-site/act-3`, `tunnel-sabotage/act-3`, `wreck-recovery/act-3`, `story:uplink/act-3` | 100% | 65% | +35 |
| above | `crash-site/act-2`, `tunnel-sabotage/act-2`, `story:intact-pod/act-2` | 100% | 75% | +25 |
| above | `defend-installation/act-3` | 88% | 65% | +23 |
| above | `defend-installation/act-2` | 94% | 75% | +19 |

**The expert**, against its floor of 90% in every cell:

| Direction | Cell | Expert | Off by |
| --- | --- | --- | --- |
| below | `story:great-hive/act-3` | 0% | −90 |
| below | `hive-assault/act-2` | 13% | −77 |
| below | `hive-assault/act-3` | 31% | −59 |
| below | `evacuation/act-2` | 38% | −52 |
| below | `evacuation/act-3` | 44% | −46 |
| below | `evacuation/act-1`, `story:launch-window/finale` | 63% | −27 |
| below | `story:live-specimen/act-1` | 81% | −9 |
| above | fourteen cells at 16/16 | 100% | +10 |

The hive cells are the Hive Assault and Great Hive package's (see
"Why the hive cells sit at 0%").

### The pins that fail

`calibration-pins.test-helper.ts` is unchanged, with an allowance of
one seed. Neither player was changed. The assertion stops at the first
failing cell, so the run's log names only `evacuation/act-1`; the
`pin` column names both.

**`evacuation/act-1`, expert 10/16 against 14/16.**

- The new player won 5 of its 14 by stall (seeds 1, 6, 7, 13 and 15):
  the job done and nobody getting out for 10 turns, so the run is
  abandoned, which the rules record as won because the job is done and
  someone is aboard. It lost 4 to 7 of its 8 units in those runs.
- The expert extracted on 4 seeds (3, 10, 14 and 15), which is not a
  win, lost seed 0 at the turn cap and seed 6 by stall.

**`evacuation/act-2`, expert 6/16 against 8/16.**

- The new player won 5 of its 8 by stall (seeds 0, 1, 3, 5 and 12).
- The expert extracted on 10 seeds (2, 4, 5, 6, 9, 10, 11, 13, 14 and
  15). It failed this pin on the mission-15/35 forces too (4/16 against
  7/16), and cleared it on the mid-act forces (7/16 against 4/16).

On both cells the expert pulls a hurt force out, and the new player
stays until the job is done at any cost. The Evacuation package owns
these cells.

`defend-installation/act-1`, the pin that failed on the mid-act forces
(expert 14/16 against 16/16), clears: both players win 16/16.

At 16 seeds the noise on the difference between two players who are
equally good at 50% is √(2 × 16 × ½ × ½) ≈ 2.8 wins, so a one-seed
allowance catches noise more often than it did at 8 seeds (2.0).

### Earlier baselines

**The mid-act forces** (16 seeds, `4e5487d6`) are in git at `47c3c06f`.
Acts I and II fielded five units. Per band, the new player's rate
against the expert's:

| Band | New | Expert |
| --- | --- | --- |
| act-1 | 73/96 (76.0%) | 84/96 (87.5%) |
| act-2 | 82/128 (64.1%) | 91/128 (71.1%) |
| act-3 | 96/144 (66.7%) | 105/144 (72.9%) |
| finale | 9/16 (56.3%) | 10/16 (62.5%) |

One cell pin failed: `defend-installation/act-1`, expert 14/16 against
16/16. The expert lost seed 11 at the turn cap, with 4 of 5 units dead,
and extracted on seed 15.

**The mission-15/35 forces** (16 seeds, `18d37d67`) are in git at
`7da692b9`. Per band, the new player's rate against the expert's:

| Band | New | Expert |
| --- | --- | --- |
| act-1 | 73/96 (76.0%) | 84/96 (87.5%) |
| act-2 | 68/128 (53.1%) | 78/128 (60.9%) |
| act-3 | 92/144 (63.9%) | 108/144 (75.0%) |
| finale | 10/16 (62.5%) | 10/16 (62.5%) |

Three cell pins failed on those forces. Two of them clear with the
mid-act forces:

- `evacuation/act-2`, 4/16 against 7/16. The expert extracted on 6 seeds.
- `defend-installation/act-2`, 7/16 against 9/16. The expert reached
  the turn cap on 8 runs.
- `defend-installation/act-1`, as above.

**Round 2** (8 seeds, the C2a forces, `3412e7c2`) is in git at `3ef36fc5`:
`git show 3ef36fc5:docs/design/calibration/baseline-matrix.tsv`. Every
pin held. Per band, wins over runs:

| Band | New | Expert, round 1 | Expert, round 2 |
| --- | --- | --- | --- |
| act-1 | 37/48 (77%) | 42/48 (88%) | 42/48 (88%) |
| act-2 | 36/64 (56%) | 39/64 (61%) | 41/64 (64%) |
| act-3 | 47/72 (65%) | 52/72 (72%) | 54/72 (75%) |
| finale | 5/8 (62%) | 7/8 (88%) | 5/8 (62%) |

**Launch Window, round 2.** A matrix run at `a681faf4`, before the
search fix, failed the finale band pin: the expert won 4/8 to the new
player's 5/8.
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
