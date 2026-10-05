# First Skyfall: the great pod

Issue #1238 replaces First Skyfall's spore pod with a **great pod**, the
spore pod's concept scaled up into a structure. Before, the pod was a
small spawner in the open and the mission played like a clearance with
one egg. Now the hull is a ring of destructible plates with no way in.
The force breaches it with demolition, fights through the chambers, mechs
included, and destroys a central **core** before it ripens. Then it
extracts.

This page records the design numbers and why they were chosen, how the
modelled players were taught to breach, and the matrix cell before and
after. The [README](README.md)'s baseline is not rebaselined here.

| Cell | New before | New after | Band target | Expert before | Expert after | `expert_target` |
| --- | --- | --- | --- | --- | --- | --- |
| `story:first-skyfall/act-1` (16 seeds) | 16/16 (100%) | 16/16 (100%) | 90 | 16/16 | 16/16 | met |
| `story:first-skyfall/act-1` (32 seeds) | not run | 31/32 (97%) | 90 | not run | 32/32 | met |

| Player | Losses before (mean units) | Losses after, 16 seeds | Losses after, 32 seeds | Turns before (median) | Turns after, 16 / 32 seeds |
| --- | --- | --- | --- | --- | --- |
| new | 0.00 | 0.25 | 0.25 | 5.5 | 10.5 / 11.5 |
| expert | 0.00 | 0.00 | 0.03 | 4.5 | 8 / 8 |

The mission keeps its win rate and becomes a real fight. It runs about
twice as long, and it costs the new player a unit in one run in four.
The brief's floors are met: the new player is at least 14/16 (16/16,
and 31/32 over 32 seeds), and the expert at least 15/16 (16/16, and
32/32). At 16 seeds the cell's wins are unchanged, so the act-1 band's
pooled rate in the `.bands.tsv` does not move.

## Base and command

- **Before:** `a2ff6b9e`, main, the README's baseline cell.
- **After:** this branch, `feat/1238-skyfall-great-pod`.
- **Command:**

  ```
  SIM_MATRIX_OUT=<scratch>/skyfall.tsv SIM_MATRIX_CELLS=story:first-skyfall \
    nice -n 10 node_modules/.bin/vitest run --config vitest.sim.config.ts \
    --maxWorkers=8 src/app/service/calibration-matrix
  ```

  The 32-seed confirmation adds `SIM_MATRIX_SEEDS=32`.
- **Probe.** A scratch probe (not committed) played the matrix's own
  `startRun`, `playerFor` and `playMission` on the cell. Per run it
  recorded the turn of the first breach, how many breach shots each
  player fired and what they opened, how many broods woke, and the turn
  the core fell. On seeds 0–31 its wins and losses match the matrix's.

## The pod

```
            H s s s H              H hull plate (demolition 2)
        H H H · · · H H H          s hull seam  (demolition 1), on the mouth axis
      H H r · · · · · r r H        r rib, M membrane (carapace, demolition 2)
      H r r · M · · · M r r H      · floor, m an open mouth
    H   r M M c c c M M r   H      c core chamber, C the core (3×3)
    H     M c C C C c M     H
    H  w  M c C C C c M  e  H      n/e/s/w the outer chambers;
    H     M c C C C c M     H      here (ns) north and south are route
    H     M M c c c M M     H      chambers, east and west side chambers
      H   r M · m m m · r H
        H H H · · · H H H
            H s s s H
```

### Size and layout

- **Hull radius 8, so 17 tiles (34 m) across.** That is a third of Act
  I's 48² board at ADR 0009's 2 m a tile. It is big enough to fight in,
  and it leaves the landing zone and the edges their ground.
- **Landing.** The pod lands two columns past the drop ship's clearance,
  so the hull is one move from the ramp and the core two.
- **Membrane radius 4, round a 3×3 core.** This leaves a core chamber one
  to two tiles deep all round. All eight units can stand by the core.
- **Four outer chambers.** Four ribs, two tiles thick, cut the ring between membrane
  and hull into four chambers, each two to three tiles wide. That is
  wide enough for a mech.
- **The axis.** The membrane opens with two three-tile mouths on a
  random axis, north–south or east–west. Only the two **route chambers**
  on that axis open onto the core. The two **side chambers** are sealed
  from it by the membrane, so a breach into one needs a second breach to
  go on.
- **Seams.** The hull's three-tile **seams** sit on the same axis, in
  line with the mouths. They glow in the art. A force that reads the pod
  breaches a seam and walks straight through a mouth to the core.
- **Apron.** Three apron rings surround the hull. The first is kept
  clear so a breach party can stand at the wall. The other two are
  strewn with thrown wreckage for cover.

### Breaching

The d1 force at First Skyfall is the starter roster: two rifle squads, a
radio squad, a rocket squad, and one mech (autocannon and missile pod).

| Wall | Demolition | Opened by |
| --- | --- | --- |
| Hull plate and corner | 2 | the rocket squad's rocket (force 2) or its breaching charge (force 3) |
| Hull seam | 1 | any squad's grenade (force 1, two each), the mech's autocannon or missile pod (force 1), and anything that opens a plate |
| Membrane and ribs (carapace) | 2 | as a plate |

- **Any d1 force can open it.** The starter roster carries six grenades,
  a rocket, a charge and two mech guns, against two breaches at most.
- **One breach is enough.** A plate breached into a route chamber, or a
  seam, leads to the core. A plate breached into a side chamber needs a
  second breach, through the membrane.
- **What the modelled players needed** (32 seeds):
  - The new player prices every wall the same. It breaks the wall on
    the shortest route from the drop ship with its rocket or a gun, and
    it never throws a grenade at a wall. Its first breach comes on turn
    1.7 on average. It needed one
    breach in 18 runs and two in 14 (0.44 membrane breaches a run).
  - The expert walks to a seam and opens it with a grenade, or with the
    mech's back gun when that opens a wider hole. Its first breach is on
    turn 2.0, and it needed exactly one breach in all 32 runs.

### Core and clock

- **Core: 80 hit points at d1, plus 10 for each difficulty above 1.**
  Its armour is 1, from the trait (the hive core's hide). That is eight
  planted charges (the interact action, 10 each), or several volleys
  once the force is inside. A crash site's spore pod falls to one volley
  from the open; the core takes the force's fire at close range, under
  the core chamber's brood.
- **Clock: it ripens as turn 12 ends at d1.** That is the crash site's 8
  plus `hullTurns` 4, which pay for the march, a breach and the
  chambers. From d5 it is the crash site's early 5 plus 4, so turn 9.
- **Measured margin** (32 seeds, wins only): the core falls on turn 6.6
  on average for the new player and on turn 5.3 for the expert. That is
  five or more turns to spare. The one loss (new player, seed 26) made
  its first breach on turn 4, and the core ripened.
- **Ripening.** `maturePod` marks the core destroyed and matured with
  `burstPending`. The burst wave spawns at the core, deep inside the
  hull, and the objective fails. The force still has to extract. The
  log says the pod's core has ripened, and the tracker shows the
  objective failed.
- **Winning.** The objective completes when the core is destroyed. Then
  the force boards the drop ship as on any mission.

### Bugs inside

- **A nest to clear, not a hive cavern.** Each chamber holds a sleeping
  brood: two bugs in each route and side chamber, three in the core
  chamber (`roleScale.core` 1.5), so eleven at d1. A hive cavern holds
  3 to 13 a chamber. `sizePerDifficulty` is 0, because difficulty
  already raises the core's hit points and shortens the clock.
- **Waking.** A brood wakes when the force steps into its zone (the
  whole of an outer chamber, `zoneShare` 1 with a minimum radius of 2),
  when its sleepers or the core are shot, or when a blast or a heavy gun
  goes off within the shipped noise radius of its zone. On average 4.6
  broods woke in the new player's runs and 3.9 in the expert's. The
  expert's caution (it never crosses unseen ground and keeps the heavy
  guns quiet near sleepers) leaves about one brood asleep.
- **Edge waves.** The crash site's two edge waves (`podEdgeWaves`) still
  come, so the force cannot camp at the hull.

### Fog and the cutaway

- **The hull blocks sight.** Hull props block line of sight at sight
  height 4, taller than a carapace wall, so a force outside the pod does
  not see in, and the chambers are found by breaching.
- **Units inside stay visible.** The hull's models are `building.` ids
  (`building.great-pod-hull-plate`, `-curve`, `-seam`), so the ghost
  cutaway fades a hull segment the way it fades a wall. A unit behind
  the hull or inside it stays in view and clickable.
  `ghost-cutaway-eligibility.test.ts` pins the three kinds.

## Teaching the modelled players

Before #1238 both players walked to the pod and shot it. Neither had a
reason to open a wall, because the pod stood in the open. The pod
strategy now marks a great pod's orders `breach: true`. When a unit has
no walkable path to its goal, a shared helper
(`player-breach.test-helper.ts`) plans a breach.

```
  no walk to the goal, order.breach ──► breach field (Dijkstra from the goals:
                                        a step costs 1, a wall the style's price)
                                    ──► the force's wall: traced from the drop
                                        ship down the field to the first wall
  a ready opener can break it, no friend in the blast ──► fire (best shotValue)
  an opener out of reach ──► walk to a firing spot (in range, in sight)
  nothing to open it     ──► hold three steps out of the blast
```

The two players differ only in their `BreachStyle`, that is, in what
they decide:

| | New player | Expert |
| --- | --- | --- |
| Wall price | 4 for every wall: any wall is as good as another | 2 for a seam, 12 for a plate: it reads the seams |
| Throws grenades at a wall | no | yes |
| Picks the shot by | hit chance | hit chance × walls the blast opens |

- **The route is the edge, not dice.** The expert's price sends it to the
  seam in line with a mouth, so it never breaches into a side chamber.
  The new player takes the shortest way in. Almost half the time that is
  a side chamber, which costs a second breach through the membrane and
  a second brood.
- **The wider hole is the edge.** The expert prefers the shot that opens
  more wall: the missile pod or a grenade, not the arm gun's single
  tile. A one-tile hole lets one squad block the mechs.
- **Decision gap.** Played on the new player's dice (`SKYFALL_LUCK=new`),
  the expert still wins 32/32, loses 0.00 units a run, kills the core on
  turn 5.4 and needs one breach in every run. Its edge over the new
  player survives the swap, so the edge is its decisions, not its luck.

| 32 seeds | Won | Mean losses | Core falls (turn) | First breach (turn) | Breach shots | Hull breaches | Membrane breaches |
| --- | --- | --- | --- | --- | --- | --- | --- |
| new | 31 | 0.25 | 6.55 | 1.66 | 2.38 | 1.00 | 0.44 |
| expert | 32 | 0.03 | 5.28 | 2.00 | 1.44 | 1.00 | 0.00 |
| expert on the new player's dice | 32 | 0.00 | 5.41 | 2.06 | 1.59 | 1.00 | 0.00 |

`CALIBRATION_RULES` and the player fixtures now carry the shipped
structure catalogue, which the breach plan needs to tell which wall
gives to which force.
