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
- **Infantry squads**: one roster entry = one squad token of ~5 soldiers. Types include rifle, rocket, sniper, engineer, medic (expand under Track: Arsenal). Squads take casualties; a squad below strength can be reinforced for credits; a wiped squad is gone.
- **Mechs**: one roster entry = one mech. Built from a **chassis** plus **legs**, **arms**, one **arm weapon**, one **back weapon**, and **utility slots**. Parts have stats (armor, mobility, heat, power, accuracy, etc.) and may be upgraded. Mechs that are destroyed in a mission are **gone**, parts included.
- Both persist across missions with damage, kills, and experience where applicable.

### 5.8 Mech customization
- A dedicated screen. Choose chassis → fit parts → validate (weight, power, slot constraints) → save loadout. Loadouts are named. Cost is visible at every step, as is the mech's resulting stat sheet.
- Design intent: a max-investment mech should feel like a capital ship. Losing it should be devastating and memorable.

## 6. Tactical missions

### 6.1 Presentation
- Fixed isometric camera; rotation in 90° steps; zoom in a small range. Orthographic projection.
- Tile grid with elevation levels. Multi-floor buildings are enterable by infantry. Mechs are too tall for interiors and act as heavy fire support outside.
- Unit tokens: an infantry squad is rendered as ~5 figures that move as one unit and occupy one tile; a mech occupies one tile and is visibly taller.

### 6.2 Turn structure
- Player phase → bug phase. Each unit has action points (move + act, XCOM-style two-action budget by default; mechs may have distinct budgets).
- Actions: move, attack (arm weapon / back weapon / squad weapon), overwatch, reload/vent, abilities per unit type, interact with objective.
- Cover, line of sight, elevation bonuses, flanking. Hit chance and damage are visible before committing.

### 6.3 Spawning
- **Egg spawners** are static objectives placed by map generation. They periodically hatch bugs. Destroying them is the baseline objective.
- **Edge spawns** trickle bugs in from map edges on a timer that escalates with mission difficulty and overworld threat.
- Missions end on objective completion, full extraction, or squad wipe.

### 6.4 Bugs (see Track: Bestiary)
- Baseline three for M2: a **swarmer** (fast, weak, numerous, rushes), a **lurker** (stealthy flanker that tries to get behind the line), and a **brute** (slow, armored, punishes clumping).
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
| M3 Mission Variety | Hives, spore crash sites, special events, new objectives, difficulty curve. |
| M4 Final Mission | Space spore platform set-piece, new bug variant, victory. |
| Track: Arsenal | Ongoing TDF unit and mech part variety. |
| Track: Bestiary | Ongoing bug species variety and time-based unlocks. |

## 9. Out of scope

- Multiplayer, servers, accounts.
- Free camera or first/third person views.
- Real-world politics or named nations as factions. Cities are geographic flavor only.
