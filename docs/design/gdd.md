# Terra Under Threat — Game Design Document

> Owner: Director. Change requests go through a `design-decision` issue.
> This document is the source of truth for *what* the game is. `architecture.md` is the source of truth for *how* it is built.

## 1. One-liner

An XCOM-style turn-based tactical game in the browser. The **Terran Defense Force (TDF)** fights a bug infestation of Earth. Customizable **mechs** are the star units. Lose them and it hurts.

## 2. Pillars

1. **Hold the line.** The bugs are a rising tide. The player starts losing, claws back, and eventually repels them. The overworld is a war, not a menu.
2. **Your mech is your investment.** Mechs are deeply customizable and can become extremely powerful and extremely expensive. Permadeath makes every deployment a bet.
3. **Isometric, tile-based, turn-based.** 3D assets, fixed isometric camera, no free camera. Elevation and multi-floor buildings matter tactically.
4. **Variety through generation.** Tactical maps are procedurally generated per biome and settlement scale. Mission types, bug species, and TDF gear expand over time.

## 3. Setting and tone

- Near-future Earth. No named alien species; humans simply call them **the bugs**. Slang in dialogue and UI flavor: *crawlers*, *chitters*, *hatchers*, *the swarm*.
- Story flavor (not mechanical): eggs first appeared underground and bugs emerged beneath cities; later, eggs began falling from the sky and hatching in the open. Earth is being *incubated*, not merely invaded.
- Visual language for bugs: sharp, bladed, chitinous. Blades for hands. Tyranid/Zerg silhouette family, original designs.
- Visual language for TDF: practical military hardware, chunky mechs, low-poly readability.
- Tone: grim but not hopeless. Military-procedural voice in UI text.

## 4. Game structure

```
 ┌────────────────────────────────────────────────────────────────┐
 │  MAIN MENU  →  NEW GAME / CONTINUE                              │
 └────────────────────────────────────────────────────────────────┘
                              │
                              ▼
 ┌────────────────────────────────────────────────────────────────┐
 │  OVERWORLD (strategic layer)                                    │
 │   • Earth map, cities, regions, infestation, threat level       │
 │   • Time advances per return                                    │
 │   • Missions / events appear                                    │
 │   • Economy: buy squads, mechs, parts, deployables               │
 │   • Mech customization                                          │
 │   • Choose a mission → choose deployment → launch               │
 └───────────────┬─────────────────────────────▲──────────────────┘
                 │ launch                       │ result (losses, rewards, infestation delta)
                 ▼                              │
 ┌────────────────────────────────────────────────────────────────┐
 │  TACTICAL MISSION (turn-based, isometric, tile grid)            │
 │   • Deploy units; move / shoot / abilities                       │
 │   • Egg spawners, edge spawns, objectives                        │
 │   • Win / lose / extract                                         │
 └────────────────────────────────────────────────────────────────┘
```

Until M2, tactical missions are **auto-resolved** by a placeholder resolver so the overworld loop is fully playable on its own.

## 5. Overworld

### 5.1 Map
- A map of Earth divided into **regions**, each containing one or more **major cities**. Cities are the infestation nodes.
- Each city has an **infestation level** (0–100). Regions aggregate their cities.
- A **global threat level** (0–100) derives from total infestation plus escalation over time.

### 5.2 Time
- Time is measured in **days**. Returning from a mission or pressing "advance" moves time forward.
- Each tick: infestation spreads (within city, then to neighbours), new infestations may seed, missions/events are generated, bug species may unlock, deployables act, economy pays out.

### 5.3 Infestation dynamics
- Infestation grows in a city each tick by a base rate scaled by threat, minus suppression from deployables and minus reductions from won missions.
- When a city passes a threshold it spreads to a neighbouring city.
- When a region's infestation is high enough for long enough, a **bug hive** forms (M3). Hives are persistent, boost regional growth, and require a special assault mission.
- Lose condition: global threat reaches 100 (Earth overrun).
- Win condition: all cities at 0 infestation and no hives → triggers the **final mission** (M4). Until M4 exists, this is a victory screen stub.

### 5.4 Missions and events
- Missions are generated from the map state and attach to a city. Each has: type, difficulty, biome/settlement parameters for map generation, rewards, expiry, and consequences for ignoring it.
- Baseline type: **Infestation clearance** (destroy egg spawners in a city). M3 adds hive assaults, spore crash sites, rescue/defend/escort style objectives, and special events.
- Events are non-combat happenings with choices (funding changes, research finds, city pleas, spore showers).

### 5.5 Economy
- One currency: **credits**. Everything costs credits: squads, mech chassis, parts, upgrades, deployables, repairs.
- Income: mission rewards, a per-tick stipend scaled by how much of Earth is unfested, event outcomes.

### 5.6 Earth deployables
- Region-level installations bought with credits. Examples: **defensive battery** (reduces spawn/growth in a region), **repellent dispersal** (deters spread to neighbours), **sensor array** (reveals missions earlier / better intel). Each has a build cost, upkeep, and a limited count per region.

### 5.7 Roster
- **Infantry squads**: one roster entry = one squad token of ~5 soldiers. Types include rifle, rocket, sniper, engineer, medic, and radio (expand under Track: Arsenal). Each type fights with its own weapon, and the weapon is what tells the types apart on the field: rifle and medic squads carry carbines and fire twice a turn; radio squads carry SMGs, shorter and harder-hitting, one burst a turn; engineers carry shotguns, two blasts a turn at arm's length; snipers carry marksman rifles, one shot a turn out to the edge of sight; the rocket squad's one shot a turn is its rocket, with its blast and its force (§6.2.3) (Executive Director, 2026-09-13, #1130). Squads take casualties; a squad below strength can be reinforced for credits; a wiped squad is gone.
- **Mechs**: one roster entry = one mech. Built from a **chassis** plus **legs**, **arms**, one **arm weapon**, one **back weapon**, and **utility slots**. Parts have stats (armor, mobility, heat, power, accuracy, etc.) and may be upgraded. Mechs that are destroyed in a mission are **gone**, parts included.
- **Chassis trade off against each other, and each is the best at exactly one thing** (Executive Director, 2026-09-13, #1130). Four frames ship: the **Vanguard** is the *price* frame and the starter, with half the plate it had and little room to grow; the **Courser** is the *speed* frame that stays fast under a load; the **Bulwark** is the *armor* frame, slow and able to shrug off a brute; the **Atlas** is the *utility* frame, a capital-class reactor with the most slots at the highest price. A frame that won two axes would make another pointless, so the data test pins one axis per chassis.
- Both persist across missions with damage, kills, and experience where applicable.
- **Experience and ranks.** Every kill is worth experience by species (a swarmer 10, a lurker 25, a brute 60), credited to the squad or mech that landed the killing blow when the mission resolves, on top of a flat 5 for coming home, so the first rung is earned by a kill rather than by surviving once. Experience climbs an enlisted ladder — Private, Private First Class, Corporal, Sergeant, Staff Sergeant, Sergeant First Class, Master Sergeant, First Sergeant, Sergeant Major — whose rungs sit at 0, 10, 30, 60, 100, 150, 210, 280 and 360: the first kill promotes, and each rank after costs one more swarmer than the last. A rank pays out in the field, folded into the unit's tactical template at mission start: half a tile of move, two points of accuracy on every weapon, and a quarter of an action point per rank, each rounded down. So a Corporal (three swarmers) moves one tile further, a Staff Sergeant (ten) has a third action, and the top of the ladder is four tiles, sixteen points and two actions — meaningful without over-scaling. Mech pilots climb the same ladder. The roster, the unit card and the debrief name the rank; the debrief also lists what each unit's kills were worth and any promotion (Executive Director, 2026-09-13, #1130).

### 5.8 Mech customization
- A dedicated screen. Choose chassis → fit parts → validate (weight, power, slot constraints) → save loadout. Loadouts are named. Cost is visible at every step, as is the mech's resulting stat sheet.
- Design intent: a max-investment mech should feel like a capital ship. Losing it should be devastating and memorable.
- The starter mech is the cheap one, not the safe one: it fills its Vanguard to the tonne, so the first upgrade is a swap rather than an add, and the first real investment is a different frame (#1130).

## 6. Tactical missions

### 6.1 Presentation
- Fixed isometric camera; rotation in 90° steps; zoom in a small range. Orthographic projection.
- Tile grid with elevation levels. Multi-floor buildings are enterable by infantry. Mechs are too tall for interiors and act as heavy fire support outside.
- Unit tokens: an infantry squad is rendered as ~5 figures that move as one unit and occupy one tile; a mech occupies one tile and is visibly taller. A mech is drawn from the parts fitted to it, so the mech on the field is the one built in the bay and two loadouts are told apart at a glance (Executive Director, 2026-09-12, #1115). A **brute occupies a 2×2 block** of tiles: its position is the block's lowest-`x`, lowest-`z` tile and every tile of the block shares its level. It moves anchor by anchor at the same cost as anyone else, needs all four tiles standing, free and unbroken by walls, fits through no door, and is measured by the tile of it nearest the other party — it is shot on the face it presents, it swings from the tile nearest its mark, it sees from all four tiles, it is spotted when any of them is in view, and a blast or a fire hurts it once. It gets no cover and cannot be flanked (Executive Director, 2026-09-13, #1130).

### 6.2 Turn structure
- Player phase → bug phase. Each unit has action points (move + act, XCOM-style two-action budget by default; mechs may have distinct budgets).
- Actions: move, attack, overwatch, reload/vent, abilities per unit type, interact with objective.
- **One attack action per weapon.** A unit does not have a single generic "attack". A mech carrying an arm weapon and a back weapon offers two distinct attacks, each with its own range, damage, accuracy and cost. Squad weapons work the same way.
- **The weapon decides how many attacks a turn.** By kind, an attack costs an infantry squad one action, so a squad with two actions fires twice, while a mech's or a bug's attack ends its turn. Since #1130 a weapon can say otherwise for its own shots: a carbine or a shotgun keeps the squad's two, an SMG, a marksman rifle or a rocket launcher is one shot a turn whoever carries it. Squads remain the answer to numerous small bugs and mechs the answer to armoured and large targets; the asymmetry is deliberate and is what makes both worth fielding, and the per-weapon rule is what makes a radio squad feel different from a rifle squad rather than a rifle squad with a gadget (Executive Director, 2026-09-13, #1130).
- Cover, line of sight, elevation bonuses, flanking. Hit chance and damage are visible before committing.
- **Range is measured in three dimensions, and height buys reach.** The distance a shot is held against combines the map-plane distance with the vertical gap (a layer is 0.75 of a tile), rounded to whole tiles, so a target a storey up is further away than it looks on the plane. A shooter standing a whole storey above its target reaches further per storey, to a cap; shooting up or level earns nothing. A melee weapon gets neither term: a claw has to touch, and cannot reach a squad on the roof above it. (Executive Director, 2026-09-12, #1119.)
- **Cover and flanking are ranged concepts. A melee attacker (weapon range 1) gets neither.** No cover mitigation, no flank bonus — a bite or a claw resolves on base accuracy plus elevation and status. Cover still protects against melee, but structurally rather than as a percentage: a prop tile cannot be stood on, so cover denies approach angles. A defender with a boulder to the north simply cannot be attacked from the north.
  Without this rule the flank term inverted the lesson of the whole system: `flanked` is "the attacker found an angle your cover does not protect", which for an adjacent attacker was true precisely *because* the cover existed — so standing beside a boulder raised a swarmer's chance from 60 % to 75 %, and a player reading that correctly would learn to avoid cover (#446).

### 6.2.3 Weapons that mark the ground: blast, fire and demolition
A weapon is more than a range and a damage number. Since #1121 a weapon profile can carry three more things, and every shipped weapon is marked with the ones that fit it.

- **Blast (AOE).** A radius in tiles and a falloff. Everything within the radius of the impact — either side, and egg spawners — takes the weapon's damage less the falloff share per tile, then armor. The shooter never hurts itself. A blast is stopped by whatever stops sight: it does not pass a solid wall, go round a hill, or pass through a floor slab. The footprint is measured in three dimensions, with the same distance a shot is held against (a layer is 0.75 of a tile, rounded to whole tiles), so a half-height ledge beside the impact is in the blast, the roof edge a storey above the impact next door is two tiles from it, and a shell landing on a roof reaches the ground beside the building but never the room beneath the slab (Executive Director, 2026-09-13, #1130).
- **Blast effect.** What the blast leaves on the ground: **fire**, with a chance at the impact that fades with the same falloff. Fire is an entity with a turn: at the start of every phase it burns the units of the side whose phase begins that stand in it (and egg spawners, on the bug phase), then its clock counts down, and it burns out after two full rounds. A second blast rekindles a burning tile rather than stacking a second fire.
- **Demo force.** How hard the weapon hits structures. `0`, the default, breaks nothing. `1` clears street furniture, fences, crates and cars; `2` brings down dumpsters, trees, doors and windows; `3` opens solid walls. What falls is what stands in the blast footprint. Boulders and rock are the ground and never fall. Whole-building collapse is not modelled; force 3 breaches a building by opening its walls.

Rules that follow from these:

- A weapon with a blast, an effect or a force **may be fired at a tile** with no enemy on it. The action wheel offers it on a tile as its own entry per capable weapon, with the hit chance, the damage at the impact and how many of the player's own units stand in the blast. The footprint is painted on the ground before the shot.
- **A miss applies nothing.** A shot at a tile rolls the same hit formula as a shot at a unit, with the cover and flank terms at zero because there is no body behind cover; a miss at an empty tile costs the shot and does nothing else.
- Friendly fire is real. A mortar shell does not ask whose side a squad is on; the preview says who is in the blast so the player decides with the number in front of them.

Marked weapons, as shipped: the **Flamer** (blast 1, fire), the **Missile Pod** (blast 1, force 1), the **Mortar** (blast 2, force 2), the **Autocannon** and **Rotary Cannon** (force 1), the **Railgun** (force 2), the **Rocket Squad** (blast 1, force 2, and the armor penetration its description always promised), and the **Brute**, whose cleavers sweep the tiles beside its mark (blast 1, force 3) — which is what "punishes clumping" means on the tile grid, and which opens solid walls: a brute fits through no door, so when it knows of a squad it cannot reach it fires at the wall or prop between them and walks through the gap next turn (Executive Director, 2026-09-13, #1130). The Pulse Laser, small arms and the small bugs mark nothing.

### 6.2.1 Vision and fog of war
Vision is a core system, not a presentation detail.

- The player sees only what the deployed force can see. Bugs outside the squad's vision are not drawn and not listed.
- Map area the force has not observed is obscured; ground already seen stays revealed as terrain but does not keep showing units that have moved out of sight.
- **Obscured means darkened, never absent.** Unexplored terrain and buildings are drawn dimmed, so the map reads as one place with the lights off rather than islands in a void. Only units and objectives are withheld until spotted. (Director ruling on #748, 2026-09-05.)
- Spotting is an event: a bug entering vision is announced, and it is a moment the player should notice.
- The bug AI is bound by the same rule. Bugs act on what they could plausibly know, and must not path toward units they have not detected.
- Line of sight for *targeting* and vision for *knowing* share the same geometry but are separate concerns; a unit may see a bug it cannot legally shoot.
- **Radio squads deploy radar** for 1 AP on a free tile within **2 tiles** of the squad, measured straight-line on the ground plane so a diagonal neighbour counts (placement range 2 since #1130; range 1 refused every diagonal, because a diagonal measures 1.41), following terrain and wall traversal. The small scanner **runs on a battery**: it works for **three player turns** — deployed on turn T it reports through turns T, T+1 and T+2 and the bug phases between them — and burns out as turn T+3 opens, whether or not its squad is still on the map. Its dish turns slowly while it runs; a burnt-out scanner stops turning and smokes, stays where it stands and reports nothing (Executive Director, 2026-09-13, #1130). Within a horizontal **30-tile circular radius**, hidden enemy units and structures, including egg nests, appear as red location blips through fog, walls, and floors. Units use round markers; structures use square markers. Scanning does not explore terrain, spot units for targeting, or disclose species or health. Contacts update with movement and disappear when their targets die, leave coverage, or become visible. Deployed scanners allow movement through their tile and persist in mission saves, battery included. This gives the player a way to locate egg nests before scouting them on foot (Executive Director, 2026-09-12).

### 6.2.2 Presentation of combat
The player's attention belongs on the battlefield, not on a side panel.

- Move is the default action. Selecting a unit and **right clicking** a reachable tile moves it, with no mode to enter first.
- **Left click opens the action wheel.** With a unit selected, a left click on anything but a friendly unit (which switches the selection) opens a ring at the clicked thing listing the actions that apply *there*: Move on a tile; Attack on an enemy, which turns to a sub-wheel of the unit's weapons when it carries several; Interact on an objective in reach; Reload / Vent and Overwatch on every wheel; clicking the selected unit itself opens its own wheel. Actions the rules refuse stay on the ring, closed, with the reason on them. There is no action bar: only End turn keeps a button. (Executive Director, 2026-09-11, #1112.)
- **Extract is boarding the drop ship.** It is offered on the wheel when the drop ship or its boarding tiles are clicked, open only to a unit standing on the ramp — never as a button of its own.
- The reach of one action point and of two are distinguishable before committing to a move, and a selected unit shows its weapon range without needing a target.
- Attack confirmation appears at the target, not in a panel: hit chance, damage and the commit control presented on the enemy itself.
- Building geometry between the camera and a unit fades in a soft radius so the player can always see their own force and the fight.
- Every action produces visible feedback: animation, effect, and floating text for hits, misses and damage, rendered above the unit and never inside its model.
- **A blast is one explosion.** An area weapon's shot plays as one moment: the shell leaves the shooter, an explosion the size of the footprint goes off at the impact, and every number, death, spawner burst and falling structure in that footprint lands at the same instant — never the target first and the neighbours one by one. The log still records each event in order. (Executive Director, 2026-09-13, #1130.)
- **A bug that walks into view is seen walking in.** Its move plays in full from the tile it started on, fog or not, and it is announced as it appears; a bug spotted standing still simply appears. Popping in at the destination reads as a teleport. (Executive Director, 2026-09-12, #1116.)
- Turn transitions are unmistakable, and the end of the bug phase is obvious.
- **The way out of a mission is Leave, not a detour.** The top-right button abandons the mission where it stands (§6.3); the overworld is not reachable with a mission running. With units off the drop ship or objectives open, a dialog names who will be left behind and says how the mission will be recorded before it takes the confirmation (Executive Director, 2026-09-13, #1132).
- **The player's controls stay locked until the bug phase has finished playing on the map.** The board updates the moment the rules resolve the turn, but End turn is disabled and clicks on units, tiles and spawners and the action keys are dropped until the last bug has finished moving; the camera and the storey keys keep working. The "Your turn" banner was already timed to the map; the controls were early, and a player could select and act while the bugs were still walking. (Executive Director, 2026-09-13, #1130.)
- A collapsible event log records everything, reviewable at any time.

### 6.3 Spawning
- **Egg spawners** are static objectives placed by map generation. They periodically hatch bugs. Destroying them is the baseline objective.
- **Edge spawns** trickle bugs in from map edges on a timer that escalates with mission difficulty and overworld threat.
- Missions end when the force is off the map: **won** once every objective is complete and the survivors have boarded the drop ship, **extracted** if they board with an objective still open, **lost** on a squad wipe. Completing the objectives does not end the mission on its own; the force still has to get home (Executive Director, 2026-09-11).
- **Leaving.** The player can abandon a mission at any point in their phase (#1132). Every unit not aboard the drop ship is left behind and lost — squads wiped, mechs destroyed with their parts — and the mission is recorded **won** only if every objective was complete and at least one unit had boarded; otherwise it is **lost**, whoever got out. This is how a hopeless mission is bailed out of, and how a force that has mostly boarded leaves one trapped unit behind and accepts the loss (Executive Director, 2026-09-13).

### 6.4 Bugs (see Track: Bestiary)
- Baseline three for M2: a **swarmer** (fast, weak, numerous, rushes), a **lurker** (stealthy flanker that tries to get behind the line), and a **brute** (slow, armored, punishes clumping; stands on a 2×2 block and cuts through walls to reach a squad indoors, #1130).
- Later species unlock over overworld time, XCOM-style escalation. Hives and the space platform introduce their own variants.

### 6.5 Resolution
- Results flow back to the overworld: casualties, destroyed mechs, rewards, infestation change for that city, unlocked intel.

## 7. Map generation (M1.5)

- Deterministic from a seed plus parameters: **biome** (temperate, snowy, desert, coastal…), **settlement scale** (rural, small town, big city), **mission type hooks**.
- Output is a 3D tile grid: ground height, floor type, walls, cover objects, buildings with floors and stairs/ladders, roads, props.
- Placement hooks: deploy zones, objectives (eggs, hive cores, crash sites), edge spawn zones, extraction.
- Ships with a standalone preview harness so maps can be tuned without playing missions.

## 8. Milestones

| Milestone | Definition of done |
|---|---|
| M0 Foundation | CI, devcontainer tooling, conventions, engine skeleton, save/load, screen routing, isometric camera rig, asset pipeline. No gameplay. |
| M1 Overworld | Full overworld loop playable with auto-resolved missions. Economy, roster, mech customization, deployables, threat, lose condition, win stub. |
| M1.5 Map Generation | Seeded, parameterized tactical map generator with elevation and buildings, plus a preview harness. |
| M2 Basic Missions | Tactical combat playable end to end with three bug types; replaces auto-resolve for infestation missions. |
| M2.5 Tactical Feel | Combat is enjoyable, not merely functional: fog of war, move-as-default controls, in-world attack UI, combat feedback and event log, building ghosting, per-weapon attacks, squads attack twice. |
| M3 Mission Variety | Hives, spore crash sites, special events, new objectives, difficulty curve. |
| M4 Final Mission | Space spore platform set-piece, new bug variant, victory. |
| Track: Arsenal | Ongoing TDF unit and mech part variety. |
| Track: Bestiary | Ongoing bug species variety and time-based unlocks. |

## 9. Out of scope

- Multiplayer, servers, accounts.
- Free camera or first/third person views.
- Real-world politics or named nations as factions. Cities are geographic flavor only.
