# C3b-story: Live Specimen, Intact Pod, Alpha Hunt and the Spore Platform

Package C3b of #1179 tunes the story and boss missions to the arc's
rates (§12, D5): the new player at 90 / 75 / 65 / 55 by band, within the
[README](README.md)'s tolerance, and the expert at 90% or better in every
cell. Phase 1 (`0bd1a397`) modelled the players for Alpha Hunt and the
Spore Platform and added their cells. Phase 2 tuned Intact Pod, Alpha
Hunt and the Spore Platform. Phase 3 tuned Live Specimen with two
approved player decisions, and tried an expert-only chase for Alpha
Hunt that is not shipped.

| Cell | New before | New after | Band target | Expert before | Expert after | `expert_target` |
| --- | --- | --- | --- | --- | --- | --- |
| `story:live-specimen/act-1` | 6/16 (38%) | 13/16 (81%) | 90 | 15/16 | 16/16 | met |
| `story:intact-pod/act-2` | 16/16 (100%) | 11/16 (69%) | 75 | 16/16 | 16/16 | met |
| `alpha-hunt/act-2` | 9/16 (56%) | 12/16 (75%) | 75 | 14/16 | 15/16 | allowance → met |
| `alpha-hunt/act-3` | 12/16 (75%) | 13/16 (81%) | 65 | 15/16 | 15/16 | met |
| `story:spore-platform/finale` | 2/16 (13%) | 10/16 (63%) | 55 | 16/16 | 16/16 | met |

The Live Specimen row's "before" is the phase 2 head. Its decision-gap
row (the expert on the new player's dice) read 14/16 before and reads
16/16 after.

All five cells are in `TARGETED_CELLS`. Live Specimen joined in phase
3 (see "Live Specimen"). **One cell is still short: the Alpha Hunt Act II
expert, at 25/32 (78%) over 32 seeds.** It reads `met` on the matrix's
16 seeds (see "Alpha Hunt").

## Base and cells

- **Base:** `a35a2a07`, the calibration ruler (`1bf3b242`, C2c's filled
  forces: eight units, three of them mechs) merged with int/w1 and this
  package's phase 1.
- **Filter:**
  `SIM_MATRIX_CELLS=story:live-specimen,story:intact-pod,alpha-hunt,story:spore-platform`,
  16 seeds.
- **Probe.** The levers were measured with a scratch probe (not
  committed) that plays the matrix's own `startRun`, `playerFor` and
  `playMission` for these cells, each player on its own dice, and
  records per run what each mission turns on: the pod's hit points and
  lift turn; the Broodmother's flight, escape and death; the carrier and
  the net turn; the hull and core stages. On seeds 0–15 its wins match
  the filtered matrix run exactly, on the base and on the head. Runs
  marked "(32)" add seeds 16–31 to cut the noise.
- **Frozen, and not touched:** act-wide levers, tech rewards, shared
  combat, unit, weapon and species tuning (with one exception, below),
  the Jev protocol and relay, and the players' decisions.
- **Phase 3 base:** `eeff3eeb`, the phase 2 head merged with int/w1's
  hive calibration. For phase 3 the owner approved changing two player
  decisions, both in the capture objective's strategy, and trying an
  expert-only Alpha Hunt chase. The net's range and carry penalty (the
  Jev net text) and Live Specimen's difficulty (its tech reward) stayed
  frozen.

## Intact Pod

**Cause: the pod was never threatened.** At the base, the new player
won 16/16. In every base run, for both players, the pod stood at 65 of
65 hit points when the drop lifted it on turn 8. The mission was the
crash site's two edge waves (turns 3 and 5), one extra wave on turn 7,
and a walk home.

**Levers.** The pod's hit points could not matter while nothing reached
the pod, so the levers were the recovery turn, the waves and their
size. A bigger wave reuses Swarm Tide's surge (`EdgeWaveSurge`: each
wave `ceil(size × scale)`, allowed to stand `spillRadius` steps off its
zone). The recovery turn and extra waves lengthen the hold, and the
surge thickens it.

| Run | Recovery turn | Extra waves | Surge (scale, spill) | New | Expert |
| --- | --- | --- | --- | --- | --- |
| base | 8 | 1 | none | 16/16 | 16/16 |
| ipA | 12 | 3 | none | 16/16 | 16/16 |
| ipG5 | 12 | 3 | ×1, 2 | 16/16 | 16/16 |
| ipS15 | 8 | 1 | ×1.5, 2 | 15/16 | 16/16 |
| ipS17 | 8 | 1 | ×1.75, 2 | 15/16 | 16/16 |
| ipG4 | 8 | 1 | ×2, 2 | 13/16 | 16/16 |
| ipS2 | 8 | 1 | ×2, 3 | 9/16 | 16/16 |
| **ipG1 (shipped)** | **10** | **2** | **×1.5, 2** | **11/16 (25/32)** | **16/16 (32/32)** |
| ipG3 | 10 | 2 | ×1.75, 2 | 11/16 | 16/16 |
| ipG2 | 12 | 3 | ×1.5, 2 | 10/16 | 16/16 |

More waves of the ordinary size did nothing (ipA, ipG5): a new player
holds seven or eight bugs a wave all day. The surge alone, on the old
clock, overshoots at ×2 with a spill of 3 (9/16) and barely registers at
×1.5. The shipped mix makes four waves,
of 11, 12, 12 and 12 bugs, on turns 3, 5, 7 and 9, with the drop as
turn 10 ends. That gives 25/32 (78%) for the new player, against a
75% target, and 32/32 for the expert.

**The pod now takes fire.** At head, the waves reached it in 10 of the
new player's 16 runs (down to 37 of 65 hit points at worst), and in 3
of the expert's. It never fell. The new player loses to attrition
around it: 2.6 units lost a run against the expert's 1.0, and a stall
in 9 of 16 runs.

**Shipped:**
- `INTACT_POD_TUNING`: `recoveryTurn` 8 → 10, `extraWaves` 1 → 2, and a
  new `waveSurge { sizeScale: 1.5, spillRadius: 2 }`.
- The setup hands it to the edge spawn. Swarm Tide's sitrep runs after
  the story setup and replaces it.
- The briefing, the overworld rule's doc and the presentation say
  turn 10.

## Alpha Hunt

**Cause.** At 60 hit points (d1; 64–72 in Act II), the Broodmother
outlasted the new player's fire. It wounded her into flight and she
reached the edge. At the base the new player won 16/32 in Act II. The
expert won 24/32, 8 of its 32 hunts ending in her escape.

**Levers:** her hit points, the clutch interval, and the flight
threshold, speed, lair distance and escort.
- Flight threshold: locked by the arc and the Jev text ("half health
  and she runs").
- Speed: shared species tuning, frozen.
- Lair distance and escort: not moved. The escapes are decided by the
  first wound, not by the walk to the lair (see below).

Wins, seeds 0–15 (32 seeds in brackets):

| Run | `hpBase` | Clutch | Act II new | Act II expert | Act III new | Act III expert |
| --- | --- | --- | --- | --- | --- | --- |
| base | 60 | 3 | 9 (16/32) | 14 (24/32) | 12 (22/32) | 15 (30/32) |
| bmB | 60 | 4 | 10 | 12 | 12 | 15 |
| bmA | 50 | 3 | 12 (21/32) | 14 (25/32) | 13 (23/32) | 14 (27/32) |
| bmD | 46 | 3 | 11 | 15 | 13 | 14 |
| **bmC (shipped)** | **42** | **3** | **12 (23/32)** | **15 (25/32)** | **13 (23/32)** | **15 (28/32)** |

A slower clutch did not help (bmB). The hit points did. At 42 (46–54
across Act II's d3–7) the new player's Act II rate goes from 50% to
72% over 32 seeds, against a 75% target. Act III stays at 72%, against
65%.

**Flight, escape and death** (runs in which she fled, escaped or died):

| Cell, player | Base, seeds 0–15 | Head, seeds 0–15 | Base (32) | Head (32) |
| --- | --- | --- | --- | --- |
| Act II new | 14 / 6 / 10 | 8 / 3 / 13 | 27 / 13 / 18 | 18 / 7 / 24 |
| Act II expert | 12 / 2 / 14 | 7 / 1 / 15 | 25 / 8 / 24 | 17 / 7 / 25 |
| Act III new | 10 / 2 / 14 | 9 / 1 / 15 | 17 / 4 / 24 | 15 / 5 / 25 |
| Act III expert | 10 / 1 / 15 | 10 / 1 / 15 | 18 / 1 / 30 | 16 / 3 / 28 |

Fewer hit points mean fewer runs in which she lives long enough to
flee: the new player's Act II flights drop from 27 to 18 out of 32.

**Still short: the Act II expert, 25/32 (78%) over 32 seeds.** It reads
`met` (15/16) on the matrix's seeds 0–15, but its 32-seed rate is
below 90%. It escaped in 7 of 32 hunts (seeds 4, 17, 18, 19, 26, 29
and 31), in two ways:

- **Wounded early and far from the edge (seeds 4, 19, 26, and 18 on
  turn 6).** She fled on turn 2, 26–30 tiles from the edge, and was
  gone by turns 5–9. The expert fired only 2–7 shots at her in
  the whole hunt. Its cut-off squad posts halfway to her nearest edge, not on the
  line she runs along.
- **Wounded at the edge (seeds 17, 29 and 31).** Her flight began 0–2
  tiles from the edge, so she was out the same turn.

Her own levers do not close this. At 50 hit points the expert won
25/32, and at 42 also 25/32. What is missing is an expert decision: a
chase that follows her flight line. Phase 3 tried that chase, and it
did not close the gap either (below).

**Shipped:**
- `BROODMOTHER_TUNING.hpBase` 60 → 42.
- The BROODMOTHER row in `bugs/data/species.ts` also goes 60 → 42,
  because a test pins `BROODMOTHER.hp === broodmotherHp(1, 0)`. Only
  Alpha Hunt and the Broodmother Sighting field her.
- Her flight is untouched, so Jev's `edgeExits` and the Sovereign's
  leash and hold radii are unaffected.

### Phase 3: an expert-only chase, not shipped

**Approved:** an expert-only chase. Once she flees, or turns for an
edge, the expert commits units on her flight line, or at the exit she
is heading for, and focuses fire on her. It was scoped to the
kill-broodmother strategy's expert-only jobs, so no other cell could
move. **The aim was ≥ 29/32 for the Act II expert.**

Two variants were measured, each on the same 32 seeds, with the
predictions written down first:
- **p3ah1:** once her tracker reads fleeing, a crew of three is sent to
  her line. The line is her cheapest route to the edge, found the way
  her own flight finds it (`searchMoves` and `edgeExits`). The crew
  posts beyond one turn's run of her, urgent, with her as its focus.
- **p3ah2:** p3ah1, plus the pre-flight cut-off post moved onto that
  same line, clamped to the old 2–8 tiles out.

| Run | Act II expert | Act III expert | Act II new | Act III new | Predicted (Act II / III expert) |
| --- | --- | --- | --- | --- | --- |
| phase 2 head | 25/32 (15/16) | 28/32 (15/16) | 23/32 | 23/32 | — |
| p3ah1 | 25/32 (15/16) | 26/32 (13/16) | 23/32 | 23/32 | 28 / 29 |
| p3ah2 | 26/32 (15/16) | 26/32 (13/16) | 23/32 | 23/32 | 27 / 27 |

For the Act II expert, fled / escaped / killed over 32 seeds: 17/7/25
at the phase 2 head, 17/7/25 for p3ah1 and 20/6/26 for p3ah2. The new
player's runs were identical in every variant.

Both variants missed their predictions and the aim. p3ah1 also cost
Act III two wins: seeds 3 and 14 were lost, and on 14 she escaped at
1 hit point. The trace showed why no chase that starts after the flight
can reach 29/32:
- **Near-edge flights (seeds 17, 29 and 31).** She is marked fleeing
  and gone in the same flight step, so nothing ordered after that turn
  can reach her.
- **Far flights (seeds 4, 18, 19 and 26).** The first two guns that
  see her wound her to half, on turn 2 in three of the four. She then
  runs 7–12 tiles a turn for 3–4 turns, away from a force 15 or more
  tiles behind. A crew that starts behind her line never gets ahead of
  her, and the pre-flight post is not reached by turn 2 either. She
  leaves with 10–19 hit points.

**Nothing is shipped.** The kill-broodmother strategy is as phase 2
left it.

**Recommendation.** The lever that would work comes before the flight:
the expert holds fire on her until the guns that bear can take her from
full health to dead, or at least near it, in one turn. Then the first
wound is not the one that sends her running from 30 tiles out. That is
a different expert decision from the one approved, so it is left to the
owner.

## Spore Platform

**Cause: the core chamber's nests.** At the base, all four wall pods
were egg spawners and all four guard posts were manned. The new player
never shoots a nest, and it shoots whatever is nearest. It fought
hatchlings at the turn cap in 14 of 16 assaults and won 2. The hull
stage was never the problem: both players carried 7 or 8 of their 8
units to the core, at full or nearly full health.

**Levers:** the core's nests and guards (the stage size), the
Sovereign, and carry-over. Carry-over was not moved, because the hull
already hands over the whole force.

| Run | Guards | Wall nests | Sovereign `hpBase` | New | Expert |
| --- | --- | --- | --- | --- | --- |
| base | 4 | 4 | 120 | 2/16 | 16/16 |
| sovA | 4 | 4 | 90 | 3/16 | 16/16 |
| plG2 | 2 | 4 | 120 | 3/16 | 16/16 |
| plN0 | 4 | 0 | 120 | 16/16 | 16/16 |
| plN1 | 4 | 1 | 120 | 14/16 | 16/16 |
| plN2 | 4 | 2 | 120 | 7/16 (14/32) | 16/16 (32/32) |
| **plN2G3 (shipped)** | **3** | **2** | **120** | **10/16 (20/32)** | **16/16 (32/32)** |

The Sovereign and the guards were not the new player's wall: cutting
her by a quarter, or taking two guards off, gave one seed each. The
nests were. The number of wall nests sets the rate: 0 → 16/16,
1 → 14/16, 2 → 7/16, 4 → 2/16. Two nests with one post empty gives 20/32
(62.5%) against 55%, and the expert keeps all 32.

**Shipped:**
- `PlatformAssaultTuning` gains `wallNests` (2) and `guards` (3).
- The setup wakes the first `wallNests` egg-spawner hooks, while the
  core itself stays a spawner. It mans the first `guards` posts; the
  other pods stay dressing.
- The Sovereign's tuning is unchanged.

## Live Specimen

### Phase 2: own levers, stopped

**Cause: two, both in how the new player plays.** At the base the new
player won 10/32 (lsBase32), and the expert won 31/32. The new
player's 22 other runs:

- **9 never netted a lurker.** The new player shoots the nearest bug.
  Its mechs killed every lurker they met, 6 to 24 a run. Most died to
  one mech's fire at their full 12 hit points, so they never stood
  inside the net's half-health window.
- **11 netted one and lost the carrier.** The modelled new player walks
  only when it has no shot, so the carrier stops to trade shots and
  dies on the way home.
- **2** netted one and lost with the carrier alive.

The levers that widen the window or put more lurkers out fix the first
cause. With range 2, a net at any health and four lurkers (lsH2x), the
new player netted one in all 32 runs. The carrier is then the cap:
9 of lsH2x's 10 runs that were not won lost a carrier.

**Own levers** (the lurker, the net, the map), 32 seeds unless marked:

| Run | Difficulty | Net at HP ≤ | Lurkers placed | Net range | Carry penalty | New | Expert |
| --- | --- | --- | --- | --- | --- | --- | --- |
| lsBase32 | 3 | 50% | 2 | 1 | 1 | 10/32 | 31/32 |
| lsA (16) | 3 | 100% | 2 | 1 | 1 | 7/16 | 16/16 |
| lsL0 (16) | 3 | 50% | 0 | 1 | 1 | 10/16 | 16/16 |
| lsK2bx, lurker HP ×2 | 3 | 50% | 4 | 1 | 1 | 15/32 | 32/32 |
| lsV4x | 3 | 100% | 4 | 1 | 1 | 16/32 | 31/32 |
| lsH5 | 3 | 100% | 6 | 2 | 0 | 21/32 | 32/32 |
| lsH2x | 3 | 100% | 4 | 2 | 0 | 22/32 | 31/32 |
| lsF2x | 2 | 100% | 2 | 1 | 1 | 21/32 | 31/32 |
| lsF1x | 1 | 100% | 2 | 1 | 1 | 25/32 | 31/32 |

The best of these that stays inside the mission's own story is a net at
any health with four lurkers placed (lsV4x), at 16/32 (50%). Act I's
target is 90%; at 16 runs a single cell's tolerance would be 15 points
either side.

- **Range 2 with no carry penalty** (lsH2x, 22/32) contradicts the Jev
  protocol's text for the net: the squad nets an adjacent lurker, and
  the carrier moves at reduced speed.
- **Difficulty 1** (lsF1x, 25/32 = 78%) is the closest, and it still
  misses. `LIVE_SPECIMEN_DIFFICULTY` also sets the mission's tech
  reward, which is frozen.

No own lever reaches 90%. What would is two player decisions: a new
player that holds fire on a lurker it could net, and a carrier that
walks home instead of trading shots. Phase 2 stopped there and left both
to the players' owner. Phase 3 made both, with the owner's approval.

### Phase 3: spare the lurker, walk the carrier home

**Approved:** two changes to the capture objective's strategy, which
both modelled players share, combined with the story's own levers as
the measurements say.

1. **Spare the wanted species.** While a lurker is still wanted, the
   force holds lethal fire on every lurker in sight. "Still wanted"
   means the objective is open and no squad carries one. The exception
   is a lurker attacking a unit in its reach. This is the strategy's
   own targeting rule, and it reads only what the HUD shows.
2. **Walk the carrier home, like a courier job.** The new player keeps
   its shoot-first habit everywhere else.

**How it reaches the units:**

```
strategy.spared ─────────┐
strategy.couriers ───────┼─► planForce ─► ForcePlan { jobs, couriers, walkers, spared, settled }
strategy.couriersWalk ───┘                  │
                                            ▼
          policy.assign ─► order ─► underPlan(order, plan) ─► order + spare
                                                                  │
                                                                  ▼
                          policy.next ─► holds any shot, grenade or reaction
                                         that could kill a spared bug;
                                         a courier steps home before it shoots
```

- **`CAPTURE_SPECIMEN_STRATEGY.spared`** lists the lurkers in sight while
  one is wanted, except one with a unit of ours within its weapon's
  reach. Once a squad carries a lurker, it lists none. `couriersWalk:
  true` puts `courier` on the carrier's home order.
- **`killsSpared(order, shot)`** holds a shot whose top damage reaches
  the target's hit points. A shot that can only wound is fair, and that
  is how a lurker is worn into the net's half-health window.
- **The new player** skips those shots in `nearestShot`. As a courier,
  it steps toward the drop ship before it looks for a shot.
- **The expert** already held lethal fire on the species under its
  capture order, and already walked home first. Now the spare list
  rides every order it acts under, and it covers its shots, grenades
  (`wantedInBlast`) and overwatch (`reactionMayKillWanted`).

**Measured** with the probe over 32 seeds (seeds 0–15 in brackets).
The predictions were written before each run; the revised ones were
written after p3ls2, the first run measured, and before the other
three.

| Run | Player rules | Net at HP ≤ | Lurkers | New | Expert | New runs netting one / losing the carrier | Predicted (new) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| lsBase32 | no | 50% | 2 | 10/32 (6) | 31/32 (15) | 23 / 12 | — |
| p3ls1 | yes | 50% | 2 | 23/32 (10) | 31/32 (15) | 31 / 7 | 8/16, revised 22/32 |
| p3ls3 | yes | 100% | 2 | 30/32 (15) | 32/32 (16) | 32 / 3 | 28/32 |
| **p3ls4 (shipped)** | **yes** | **50%** | **4** | **27/32 (13)** | **32/32 (16)** | **30 / 4** | **26/32** |
| p3ls2 | yes | 100% | 4 | 31/32 (15) | 31/32 (15) | 32 / 1 | 24/32 (12/16) |

**P-LS2 missed by seven runs.** The prediction had walking home saving
about half the carrier deaths. It saved nearly all of them: 12 of 32
runs lost the carrier at the base, and 1 did with both story levers.
Once the carrier stops being the cap, either story lever alone is
enough.

**For the new player, base → shipped (32 seeds):**
- wins: 10 → 27;
- runs in which it netted a lurker: 23 → 30, with the median net turn
  going from 9 to 6.5;
- runs in which a carrier died: 12 → 4;
- units lost: 3.34 → 2.00 a run;
- units home: 2.81 → 4.53 of 8.

It still stalls in 21 of 32 runs, units left in contact after the
carrier is out, and those runs are wins. Of its 5 runs not won, 2 lost
the carrier (seeds 2 and 9) and 1 was lost after the net with the
carrier alive (14). The other 2 never netted one (21 and 22).

**Shipped: p3ls4, four lurkers placed.** The net is unchanged.
- **It meets both aims.** New player 13/16 (27/32, 84%); expert 16/16
  (32/32).
- **It lands Act I in band.** The other five Act I cells hold 78/80.
  Live Specimen at 13/16 makes 91/96 = 94.8%, inside 90 ± 6.1. At 15/16
  (p3ls3 or p3ls2) it would make 93/96 = 96.9%, over the band's top of
  96.1.
- **It is the smallest change.** One number in the story's setup
  (`LIVE_SPECIMEN_PLACED_LURKERS` 2 → 4, round the nests as before).
  The net's rule, the equipment and the Jev text stay as they are.
  `architecture.md` and ADR 0013 now say four lurkers.
- **The alternative.** If the owner wants the cell itself at 90% over
  32 seeds (27/32 is 84%), the net at any health with two lurkers
  (p3ls3) gives 30/32 = 94%. That puts Act I at the top of its band.

## Band effect (projection)

This filter covers no band whole, so its `.bands.tsv` rows are these
cells only. Against the committed baseline, and before the other
packages land:

- **Act II:** Intact Pod 16 → 11, plus the new Alpha Hunt cell's 12/16,
  makes 104/144 = 72.2%, against 75 ± 7.2: on.
- **Act III:** plus Alpha Hunt's 13/16, makes 109/160 = 68.1%, against
  65 ± 7.5: on.
- **Finale:** Launch Window's 9/16 plus the Spore Platform's 10/16 makes
  19/32 = 59.4%, against 55 ± 17.6: on.
- **Act I:** Live Specimen 6 → 13 makes 91/96 = 94.8%, against
  90 ± 6.1: on (87.5% before phase 3).

The coordinator's full run decides.

## The command

```
SIM_MATRIX_CELLS=story:live-specimen,story:intact-pod,alpha-hunt,story:spore-platform \
SIM_MATRIX_OUT=/tmp/c3b-story.tsv \
  node_modules/.bin/vitest run --config vitest.sim.config.ts \
  --maxWorkers=8 src/app/service/calibration-matrix
```

## Structural pins

Both phase 2 runs held:
- On the base, 8 of 8 tests passed; the target tests were skipped.
- On the head, 24 of 24 passed, with the four targeted cells' expert
  assertions live.
- Every expert row reads `clear`.
- `alpha-hunt/act-2`'s `expert_target` went from `allowance` to `met`.

In phase 3, the 16-seed run passed 24 of 24, with the five targeted
cells' expert assertions live. Every expert row reads `clear` and
`met`.
- **The other cells did not move.** Their 128 runs are identical to
  phase 2's, run for run: outcome, turns, losses, shots, hits and
  commands.
- **The two 32-seed checks** (`SIM_MATRIX_SEEDS=32`):
  - Live Specimen: new player 27/32, expert 32/32 (`met`), decision gap
    31/32.
  - Alpha Hunt, unchanged from phase 2: Act II new 23/32 and expert
    25/32 (`short`); Act III new 23/32 and expert 28/32 (`allowance`).
    The Act II expert's target assertion fails at 32 seeds, as it did
    at the phase 2 head.

Every tuned number is pinned by a unit test beside its setup, and each
pin was sabotage-checked (made red by changing the number):
- `intact-pod-setup.test.ts` and `intact-pod-composition.test.ts`: the
  recovery turn, the waves and the surge;
- `broodmother-service.test.ts`: her hit points;
- `spore-platform-setup.test.ts` and `spore-platform-start.test.ts`:
  the nests and guards.

Phase 3's player rules and its lurker count are pinned the same way.
Each of these sabotages turned its test red:
- **The new player:** ignores the spare list; its courier shoots first.
- **The expert:** drops the spare list from its shot choice, from its
  overwatch, and from its grenade check.
- **The strategy:**
  - drops the attacking exception;
  - reads the bite's reach as 5;
  - keeps sparing after a carrier exists;
  - sets `couriersWalk: false`.
- **The plan:** the standing orders drop the carrier's walk.
- **The driver:** acts on the order without `underPlan`.
- **The setup:** places two lurkers.
- **The targets:** drop `story:live-specimen/act-1` from
  `TARGETED_CELLS`.

The tests are in `player-policy.test.ts`, `new-player-policy.test.ts`,
`expert-player-policy.test.ts`, `tactical-player.test.ts`,
`live-specimen-setup.test.ts` and `calibration-targets.test.ts`.
