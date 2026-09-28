# The Great Hives (#1179)

Act III's middle stretch (campaign arc §3, §6.9): once Uplink is won,
Uplink's tracking data finds the Spore Platform's three beacons, the
**Great Hives**. Each one is an oversized, pinned Hive Assault. When the
third falls, the `great-hives-destroyed` flag is set, and together with
`platform-approach` it pins Launch Window.

```
  uplink-won ──► next day tick: great-hive-reveal
                   3 Great Hives, one per continent  ──► GreatHivesRevealed (story beat)
                   pinned hive-assault { great: true } per standing Great Hive, d8
  assault won  ──► destroyedDay, continent liberated, 69 TP
                   third one ──► setCampaignFlag(great-hives-destroyed)
                                 + platform-approach ──► Launch Window pins
  assault lost ──► level +1 (max 2), retryDay = day + STORY_RETRY_DAYS
```

## Model: a sibling list, not a flagged `Hive`

The Great Hives live in their own list, `OverworldState.greatHives?:
GreatHive[]`, and not in `hives` with a `great: true` marker. The
ordinary hive rules all key on `hives`:

- the spread multiplier on a hive's region;
- hive formation's one-per-region rule;
- the weekly level-up;
- the pinned Hive Assault trigger and its daily re-pricing;
- `liberateRegion`.

A Great Hive must not trigger any of them. Keeping it out of `hives`
cost no edit to any of them. A marker would have needed a filter in
each one, and each filter would be a place to forget it. A Great Hive
also covers a whole continent rather than one region, and its level
moves only when an assault is lost.

The field is optional, so the save needs no version bump. `undefined`
means "not revealed yet", which is how the tracker knows to stay hidden.

## The reveal rule

The reveal is `revealGreatHives` in `overworld/service/great-hive-service.ts`,
run by the `great-hive-reveal` tick step. It fires on the first day tick
with `uplink-won` held and `greatHives` unset, which means exactly once
per campaign.

1. Continents come from `overworld/data/continents.ts`: the map's
   seventeen regions grouped into six continents.
2. Continents with no ordinary hive in any region are shuffled with the
   campaign RNG. The rest are shuffled after them. The first three are
   taken, so the beacons open new fronts where they can and fall back
   to any continent where they cannot.
3. Each Great Hive is seated in its continent's most infested region, with
   ties broken by map order. The seat is where its assault is offered,
   through `pickStoryCity`.
4. One `GreatHivesRevealed` event carries the three. The overworld
   screen opens the story beat from it.

## The mission: `hive-assault` with `great: true`

A Great Hive assault is a `hive-assault` whose `HiveAssaultSpec` carries
`great: true` and `storyId: "great-hive"`. A new mission type would
have needed a switch in the type table, the objective rules, the map
rules, the setup rules and the presentation. The variant needs one
decorator per table instead, and each decorator lives in its own file:

| Table | Decorator | What it swaps for a Great Hive |
|---|---|---|
| `mission-map-rules.ts` | `withGreatHiveMap` | the `great-hive-cavern` archetype at 72 × 152, with a forward extraction point |
| `mission-setup-rules.ts` | `withGreatHiveSetup` | `GREAT_HIVE_SETUP_TUNING`: core HP, guards and brood sizes |
| `mission-presentation.ts` | `withGreatHiveOffer` | offer note "Great Hive: Europe"; the type's rows give way to the story's |
| `mission-offer-rules.ts` | `withGreatHiveRefresh` | the daily refresh keeps the offer while its Great Hive stands, never re-prices it |
| director's pin triggers (`default-tick-steps.ts`) | `GREAT_HIVE_PIN_TRIGGER` | one pinned offer per due Great Hive |

The pinned offer:

- never expires: a pinned mission is exempt from expiry (ADR 0013
  §2.2), and the refresh keeps it until its Great Hive falls;
- ignores the offer cap;
- is placed with `pickStoryCity` in the seat region;
- has one offer per standing Great Hive, never duplicated;
- is not pinned again until `retryDay` after a loss.

### Difficulty: d8, fixed

Story missions carry a fixed difficulty (arc §3). Act III's band is
d5–9, and Launch Window, the mission the three unlock, is d8. A fixed
d8 keeps all three assaults equal, so the player can take them in any
order, and gives the 65% target one number to calibrate against. The
hive's level is the only thing that climbs, and only on a lost assault.

### Oversized

| | Ordinary Hive Assault, d8 | Great Hive, level 0 | per level |
|---|---|---|---|
| Cavern | 64 × 144 | **72 × 152** (72 × 184 before C3a round 3) | |
| Brood chambers | 5–7 | **6–8**, of 8–9 chambers (8–11 before round 3) | |
| Core distance (tiles) | 115–118 | **114–119** (149–156 before round 3) | |
| Mech's walk, landing zone to core | 120–165 | **130–202** (189–232 before round 3) | |
| Extraction | the landing zone | the landing zone and a **forward point** past halfway in | |
| Nests | 2–3 | 3–5 | +0.5 |
| A nest's hatch at d8 | 2 bugs every 4 turns | **3 bugs every 6** (1 every 11 before round 3) | |
| Core HP | 60 | **150** (200 before C3a) | +20 |
| Guards | 2 | **6** (packed ring) | +1, max 8 |
| Brood size (route/side/core) | 11 / 8 / 11 (13 / 10 / 18 before C3a) | 8 / 6 / 8 (8 / 6 / 12 before C3a) | |
| Mix | the act's | Act III, armoured variants included | |
| Reward | 46 TP | **69 TP** (×1.5; ×2.5 before the campaign retune) | |

The cavern's size was measured over eight seeds for each of four
candidates. The TSV is in the package report. Generation time on the
loaded machine:

- ordinary 64 × 144: 309–498 ms;
- 72 × 184: 468–734 ms;
- 80 × 176: 481–635 ms;
- 64 × 192: 424–627 ms.

72 × 184 gave the most chambers with the core farthest away while
staying well within the generation budget.

**C3a round 3 made the cavern shorter.** The new player's walk out of
72 × 184 ran into the 60-turn cap. Ben chose "make the walk home
shorter. Or perhaps a forward extraction point!", and both shipped.
The cavern is now 72 × 152 with 8–9 chambers, at least 5 of them on the
route, and the core at least 90 tiles from the landing zone. Depth
alone did not fit: at 152 deep, 9–11 chambers ran the route off the
board. The 24-seed map measurements and the runs are in
`docs/design/calibration/C3a-hives.md`, "Round 3".

The shorter walk made the Great Hive much easier: on the old slow
nests the new player won 31 of 32. Its nests now hatch three bugs
every 6 turns at d8, and the forward point sits at three-eighths of
the walk from the core rather than half. Over 128 seeds the new player
wins 62 (55 before round 3), 39 of them clean (31 before), and the
expert's median falls from 44 turns to 29.

### Forward extraction point

`ForwardExtractionPass` (`mapgen/generator/cavern/`) runs after the
brood chambers and before connectivity, and only on a tuning with
`forwardExtraction`, which only the Great Hive has. It marks one
`forward-extraction` hook in the objectives group: a 4 × 4 level
square, the landing zone's size, in a route chamber. The pass draws no
random numbers, so the rest of the cavern is the same with or without
it.

```
  landing zone ══ route ══[FWD]══ route ══ core
                 ◄── toDeploy ──►◄── toCore ──►
  score = |toCore − 0.375 × whole| + detour + (20 if in the heart)
```

Distances are a mech's walk on the draft, frozen once. The square is
prop-free open ground in one route chamber, on one level, off every
other hook's tiles and more than 4 columns from any nest. A square
inside the chamber's heart (45% of its radius, at least 4) pays 20
steps. On 64 seeds every cavern gets a point, 31–85 steps from the
core: 0.19–0.53 of the landing zone's walk, median 0.37. The route has
few chambers to choose from, and a nest can push the point further
out (gh-8's lands at 0.63).

It is usable **from the start**: the mission's extraction tiles are
the landing zone's, then the forward point's
(`extractionZoneTiles`), with no new state. The players, Jev's
requests and the Board action read that one list. A fixed tile list
is a rule the player can read on the map. The point sits on the route
the force must walk in any case, so boarding early there only takes a
unit home.

The garrison keeps off it, as it keeps off the nests.

**Brood density is lower than an ordinary cavern's.** The cavern has
more chambers, so the Great Hive broods are smaller (base 4, maximum
12). That keeps the living count after a mass wake at 62–78, and the
bug phase under the 10 s line (see Performance).

**The guard ring is packed.** `packGuards` tops the ring up to the wanted
count. Without it, gh-2's crowded core placed only 4 of 6 guards.

## Consequences

- **Won:**
  - `destroyedDay` is set, and every region of the continent is
    liberated with `liberateRegionCities`, the same cut and growth pause
    as an ordinary hive's region;
  - the reward is 69 TP plus any carcass bounty;
  - `GreatHiveDestroyed` is emitted;
  - on the third, `setCampaignFlag("great-hives-destroyed")`.
- **Lost or extracted without the core:**
  - `level + 1`, up to `maxLevel` 2;
  - `retryDay = day + STORY_RETRY_DAYS` (5);
  - the offer re-pins on that day.
- Both outcomes stamp `lastAssaultId`. A mission result carries no hive
  id, so this is how the debrief tells a Great Hive's result from an
  ordinary one.

## UI

- **Reveal beat** (`ui/view/great-hive-reveal-view.ts`): a modal titled
  "Three Great Hives: the platform's beacons". It names the continents,
  each with its region count. It is opened by the event rather than the
  state, so it shows once, on the day it happens.
- **Beacons** (`graphics/view/great-hive-beacons.ts`): the strategic map
  draws a tall acid-green beam over a ring and a hive mass at each seat.
  The shape differs from every other marker. A fallen Great Hive keeps a
  grey ring with no beam.
- **Tracker** (`ui/view/great-hive-tracker-view.ts`): "Great Hives 1 / 3"
  after the threat in the top bar. It is hidden before the reveal and
  once the campaign has an outcome. At 800 px the label drops like every
  other stat's. With the tracker showing, the bar measured 800 px wide
  (`scrollWidth` 800) and 41 px tall.
- **Offer and briefing:**
  - offer row: "Story · Great Hive" and "Great Hive: Europe";
  - briefing rows:
    - Target: "Great Hive: Europe"
    - Objective: "Destroy the core; the beacon falls with it"
    - Extraction: "The forward point, past halfway in, or the landing zone"
    - Liberates
    - Beacons: "Great Hives destroyed: N / 3"
    - Win: "All three: the launch window opens"
- **Debrief taglines:**
  - win: the beacon is dark, the continent is liberated, and N / 3;
  - third win: "the launch window opens";
  - loss: it still stands, its new level, and when it is pinned again.

Renders from port 4238:

- `great-hives-reveal.png`
- `great-hives-overworld.png`: one fallen Great Hive, grey, and two
  standing
- `great-hive-briefing.png`

Renders from port 4252 (C3a round 3, re-rendered at `9b5c2bc6` for round 3b):

- `great-hive-forward-briefing.png`: the briefing with its Extraction
  row
- `great-hive-forward-point.png`: the force on the forward point, the
  core fallen, and the tracker naming both places to board
- `great-hive-forward-board.png`: the wheel's Board reads "forward
  point"
- `great-hive-both-zones.png`: the whole cavern, with the landing zone
  by the drop ship at the top right and the forward point in the
  middle

**Art:** the core is `bug.hive-core`, reused. A beacon variant of the
core model was not cheap enough to build here. The beacon reads on the
strategic map instead.

## Performance

The end-turn timings are medians, measured through the store on a Great
Hive at three cavern seeds (campaign seed 7). They were taken at the
opening, when only the guards act, and again after every brood was woken
(`wakeAll`). The same three missions were timed in three runs at
different machine loads; load is the one-minute load average during the
run.

| Mission | Living | Opening ms | All woken ms, load 41–48 | load 22–23 | load 17–18 |
|---|---|---|---|---|---|
| s7-1 | 78 | 22–36 | 6,631 | 4,673 | 4,509 |
| s7-2 | 68 | 20–30 | 5,985 | 3,819 | 3,924 |
| s7-3 | 62 | 19–32 | 4,937 | 3,369 | 3,557 |

The worst case, with every bug awake, stayed under 10 s even under
heavy load. No cap on woken bugs was needed; the smaller broods are the
reduction.

## Win rate

`src/app/service/great-hive.sim.test.ts` plays every Great Hive
assault from four campaign seeds (7 to 10), 12 missions in all, through
the shipped composition. Its default force is the "basic Act III
force": the starting roster plus `ACT_THREE_REINFORCEMENTS` (a heavy
weapons squad and two more Vanguards), eight units, the deploy cap, with
no research. The driver:

- shoots the nearest awake bug within 6 tiles that it can hit without
  moving;
- otherwise closes on the core (mechs fire at it, infantry plant
  charges);
- once the core has fallen, heads for the ramp.

It writes each mission's outcome, the turn the core fell, the core's HP
left and the closest any unit came to the core. Knobs:
`SIM_GREAT_HIVE_FORCE=starter`, `SIM_GREAT_HIVE_CONTROL=1` (the same
mission without `great`, an ordinary d8 Hive Assault),
`SIM_GREAT_HIVE_START=core` (the force starts within 3 tiles of the
core) and `SIM_GREAT_HIVE_THREAT` (the shooting range; 0 makes the
force run for the core without firing).

| Force, start | Missions | Won | Core fell | Closest to the core | Turns until wiped |
|---|---|---|---|---|---|
| Starting roster (5), ramp | 12 | 0 | 0 | not recorded | 11–29 |
| Act III (8), ramp | 12 | 0 | 0 | 74–122 tiles | 28–57 |
| Act III (8), ramp, rush | 3 | 0 | 0 | 80–116 tiles | 25–34 |
| Act III (8), ramp, ordinary d8 Hive Assault | 3 | 0 | 0 | 54–88 tiles | 30–33 |
| Act III (8), beside the core | 12 | 0 | 4 (turns 5–6) | 1 tile | 16–27 |

**The 65% target cannot be validated with this driver.**

- The Great Hive is not the outlier. The same driver and force lose the
  ordinary d8 Hive Assault too, and never get within 54 tiles of its
  core. From the ramp, the woken broods wipe the force long before the
  core is in range.
- The core fight is within reach of eight units. Started beside the
  core, they broke its 200 HP on turn 5 or 6 in 4 of 12 missions and
  left it at 16–90 HP in the rest. All twelve forces were wiped
  afterwards, the four that broke it on the way back to the ramp.
- The runs are deterministic: the Act III ramp run repeated an earlier
  probe of seed 7 exactly.

Validating the target needs a driver that plays like a player
(overwatch, cover, moving as a group and pulling back to heal) or the
threat retune. The measurement is there to re-run when either lands.
