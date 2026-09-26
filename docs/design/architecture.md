# Terra Under Threat — Architecture Brief

> Owner: Tech Lead (with Director sign-off on anything in §2 and §3). Engineers must read this before their first PR.

## 1. Stack

| Concern | Choice |
|---|---|
| Language | TypeScript, strict mode |
| Bundler / dev server | Vite |
| 3D | three.js (GLTF assets, orthographic camera: isometric for missions, top-down for the strategic map) |
| UI (menus, HUD, screens) | HTML/CSS DOM overlay, framework-free unless the Tech Lead proposes otherwise in an ADR |
| Unit tests | Vitest |
| End-to-end / headless | Playwright + Chromium (installed in the devcontainer) |
| Lint / format | ESLint + Prettier |
| Package manager | pnpm |
| Persistence | localStorage JSON saves, plus export/import to file |

Single player; gameplay runs in the browser. Optional Jev control uses a separately hosted stateless relay container for external inference (ADR 0012); ordinary gameplay needs no server.

## 2. Non-negotiable principles

1. **Simulation is pure TypeScript.** Overworld sim, tactical rules, map generation, economy, and AI never import three.js or touch the DOM. They take state in and return state out. This makes them unit-testable and headless-runnable.
2. **Deterministic by seed.** All randomness flows through an injected seeded RNG. Same seed + same inputs = same outcome. No `Math.random()` outside the RNG implementation.
3. **Presentation observes state.** three.js and DOM layers render from simulation state and translate input into commands. They hold no game truth.
4. **Data-driven content.** Units, parts, bug species, deployables, mission types, biomes are defined as data (typed TS objects under a `data` folder in their domain), not hard-coded in logic.
5. **Serializable state.** Every piece of game state is plain data that can be JSON-serialized. Save = serialize the root state.
6. **SOLID and the repo file conventions** (see `CLAUDE.md`). Depend on interfaces; inject dependencies; one reason to change per module.

## 3. Layering

```
 ┌───────────────────────────────────────────────────────────────┐
 │  app/          bootstrap, screen router, dependency wiring      │
 ├───────────────────────────────────────────────────────────────┤
 │  ui/           DOM screens & HUD          graphics/  three.js   │
 │  (presentation — reads state, emits commands)                   │
 ├───────────────────────────────────────────────────────────────┤
 │  save/         root GameState, serialize / deserialize / migrate│
 ├───────────────────────────────────────────────────────────────┤
 │  overworld/ tactical/ mapgen/ roster/ bugs/ economy/ tech/ content│
 │  (simulation — pure TS, deterministic, no DOM, no three.js)     │
 ├───────────────────────────────────────────────────────────────┤
 │  core/         rng, ids, events, math, grid, result types       │
 └───────────────────────────────────────────────────────────────┘
```

Imports only point downward. `ui` and `graphics` may import `save` and simulation domains; `save` composes the root state from simulation slices and imports nothing above it; simulation domains never import `save`, `ui`, `graphics`, or `app`. These rules are enforced by ESLint; see [ADR 0002](../adr/0002-layering-enforced-by-lint.md).

## 4. Domain map (initial)

Follow `/<domain>/<type>/<file>` under `src/`. Types are things like `model`, `service`, `repository`, `data`, `controller`, `view`, `generator`, `ai`, `screen`.

| Domain | Responsibility |
|---|---|
| `app` | Entry point, screen router, dependency wiring |
| `core` | Seeded RNG, id generation, event bus, vector/grid math, shared types |
| `save` | Save slots, serialization, versioned migrations |
| `overworld` | Earth map model, cities/regions, time tick, infestation sim, threat, missions & events generation, deployables |
| `economy` | Credits, prices, income, transactions; tech points and their treasury (#1171) |
| `roster` | Squads, mechs, parts, loadouts, validation, permadeath bookkeeping |
| `tech` | The tech tree: nodes, families, unlocking, which parts the tree has made purchasable (ADR 0011) |
| `tactical` | Tile grid runtime, units on map, turn engine, actions, cover/LOS, spawners, resolution |
| `bugs` | Bug species data and AI behaviours |
| `mapgen` | Procedural map generator, biomes, buildings, placement hooks, preview harness; pass order in `mapgen-pipeline.md` |
| `graphics` | Renderer, orthographic camera rig, scene builders for overworld and tactical, asset loader, VFX |
| `ui` | DOM screens (menu, overworld, mech bay, deployment, mission HUD, results), shared components |
| `content` | Cross-domain vocabulary: closed id unions (biome, settlement scale, model ids) and definitions more than one domain consumes (mission types). A definition only one domain reads lives in that domain's `data/`, keyed by the shared union (ADR 0002) |

Add domains via ADR when needed. Don't create `utils` dumping grounds.

## 5. Key contracts

- **Root game state**: one serializable object `GameState { meta, overworld, roster, economy, tech, activeMission? }`.
- **Command pattern**: presentation issues commands (`AdvanceDay`, `PurchasePart`, `MoveUnit`, `FireWeapon`). Simulation services validate and apply commands, returning a new state and a list of domain events for presentation to animate.
- **Mission resolver interface**: `MissionResolver.resolve(mission, deployment, state) → MissionResult`. M1 ships an `AutoResolveMissionResolver`; M2 ships the tactical one. The overworld doesn't care which.
- **Map contract**: `TacticalMap { width, depth, levels, tiles[], buildings[], hooks{deployZones, objectives, edgeSpawns, extraction} }`. Map generation produces it; tactical consumes it; graphics renders it. Full contract and invariants: [ADR 0004](../adr/0004-tactical-map-contract.md).
- **Cameras**: one orthographic rig module owns the single camera, driven by a plain `CameraState`. A `CameraProjection` (elevation, yaw offset) picks how it looks at the ground: tactical maps use the isometric projection they are authored for (fixed elevation `atan(1/√2)`, yaw snapped to the 4 diagonals), and the strategic map uses the top-down projection (straight down, north up, no rotation) so Earth reads as a map rather than a rhombus. Zoom is clamped for both. See [ADR 0005](../adr/0005-overworld-camera-is-top-down.md).

- **Development tools** (#1136): `import.meta.env.DEV` is read in exactly one place, `app/service/app-bootstrap.ts`, and enters the composition as a plain `devTools: boolean`. `composeGame` → `composeTactical` turn it into the `PlaceUnit` handler's `enabled` switch and, when on, a `DevTools { placeable }` catalogue the tactical screen hands the HUD; when off the screen receives nothing and builds no dev-only DOM. The handler is registered in every build and refuses with `TacticalError { kind: "debug-disabled" }` outside a dev one, so the same command in a production save replays to a typed refusal rather than to a unit. Nothing below `app/` reads the environment.

- **Overworld selection is region-first** (#1154): `OverworldSelectionState` holds `{ regionId, cityId, missionId }`. Picking a city sets its region through an injected resolver; `selectRegion(undefined)` clears all three. The Situation column shows the *region* (`RegionPanelView`: biome, worst and mean infestation, one row per city) and the mission list narrows to it with a "Show all" way back. A city itself opens the `RadialMenuView` as a city wheel (`ui/service/city-wheel.ts` builds it: infestation at the hub over `name · population`, the city's missions and a Region entry on the ring). The map reports pointer picks over a `CityPickSource` separate from the selection, so a mission row never pops a wheel; the screen re-anchors the open wheel every animation frame from `cityScreenPosition`, the way the tactical HUD follows its unit (ADR 0007).

- **Installations are picked and explained the same way** (#1155): `OverworldPick` is `city | installation | region`, and `overworldPickerAdapter` asks the scene in that order (`CityPicker`, `InstallationPicker`, `RegionPicker`), so a click on a battery's model never falls through to the land under it. An installation pick selects its region alone and travels over an `InstallationPickSource` (`InstallationPickChannel`, a `PickChannel` like the city one) to the overworld screen, which opens the one `RadialMenuView` as the installation wheel (`ui/service/installation-wheel.ts`: `L{n}` at the hub over `type · online|offline` with the effect as the hub's note, Upgrade with the next level's price, Decommission and Region on the ring). In the Situation panel, resting on a Build option or an installed row opens the shared `PopoverView` (`ui/view/popover-view.ts`, one per document, `role="tooltip"`), whose lines come from the pure `ui/service/deployable-popover.ts` over the effect describer, so the panel, the wheel and the popover can never disagree about what a level does. See [`overworld-deployable-popover.png`](overworld-deployable-popover.png) and [`overworld-installation-wheel.png`](overworld-installation-wheel.png).

- **Objectives and mission types are rule tables** ([ADR 0013](../adr/0013-campaign-progression.md) §2.3): outside the kind and type modules themselves, tactical services never switch on an objective kind or a mission type. `tactical/model/objective-rules.ts` defines `ObjectiveRules<K>` (`complete`, `failed`, and optional `interaction`, `phaseStep`, `reachable`, `marker`, `destination`, `onDeadline`, `tally`, `resultFields`); `OBJECTIVE_RULES` in `tactical/service/objectives/` maps each kind to its own module, and a missing or misfiled kind is a compile error. `MISSION_SETUP_RULES` in `tactical/service/missions/` does the same for what each `MissionTypeId` puts on a fresh map, and reaches `startTacticalMission` through `MissionStartDeps.setupRules`. Every objective may carry `deadlineTurn`; the generic deadline phase step fails it once that turn has ended, announces `ObjectiveUpdated` and runs the kind's `onDeadline`. The tactical resolver writes one generic `ObjectiveResult` row per objective to `MissionResult.objectives`. A new kind or type is a new module and one table entry.

  ```
  startTacticalMission ──► MISSION_SETUP_RULES[mission.typeId].setup ──► objectives, spawners, generators
                                                                             │
  objective ──► OBJECTIVE_RULES[objective.kind] ◄────────────────────────────┘
                  ├── complete / failed ──► objectiveComplete / objectiveFailed (end, abandon)
                  ├── interaction?      ──► Interact handler       reachable? ──► HUD offer
                  ├── marker?           ──► fog blip               destination? ──► Jev
                  ├── phaseStep?        ──► EndTurn steps          onDeadline? ──► deadline step
                  └── tally? resultFields? ──► TacticalMissionResolver ──► MissionResult.objectives
  ```

- **The overworld offers missions through a director over two more tables** ([ADR 0013](../adr/0013-campaign-progression.md) §2.3–2.5, campaign arc §5). Each `MissionTypeId` has one entry in `MISSION_OFFER_RULES` (`overworld/service/missions/`). An entry is either an offer rule (`debut`, `eligible → MissionSite[]`, `create`) that the director draws, or a trigger rule (`trigger → Mission[]`) that fires on its own condition; Defend Installation is a trigger rule. The type's entry in `MISSION_CONSEQUENCE_RULES` says what playing the offer (`onResolved`, called by the launch handler) or letting it lapse (`onExpired`, called by `expireMissions`) does to the map. The `mission-generation` tick step is the director:
  1. It runs the pin triggers first, each on its own RNG fork. The story pin trigger pins each built story mission whose act and flags are due.
  2. It runs the trigger rules, each on its own RNG fork.
  3. It fills the board to `ACTS[act].boardCap`, counting only offers that are unpinned and not triggered. Each draw picks a weighted type, renormalised over the types that have debuted and have an eligible site, then picks a site.
  4. Every new offer passes through the injected `MissionOfferDecorator`s, each on its own fork.

  The act's `difficultyBand` clamps each offer's difficulty before its rewards and map size are derived; a story offer keeps its fixed difficulty. A city holds at most one offer. `Mission.pinned` means the offer never lapses, and the UI then shows no countdown (`ui/service/mission-countdown.ts`).

- **The story spine decides victory** ([ADR 0013](../adr/0013-campaign-progression.md) §2.5). Story missions are modules in `STORY_MISSION_RULES` (`overworld/service/story/`), one file each, keyed by `StoryMissionId`. The table is `Partial`: a story mission lands with its package. After the type's `onResolved`, the launch handler calls `onStoryMissionResolved`: a win applies the rule's `onWon` (flags, `advance-act`, victory), a loss its `onLost` (a five-day retry, or D7 for the platform). `STORY_SPINE` names the mission that ends each act; `advance-act` into an act whose ending is not built sets `campaign-won` instead. Tech unlocks record flags through `onTechUnlocked`, and the director pins from flags, so there is one path to the board. The outcome step reads the story's verdict (`campaign-lost`, `campaign-won`) before threat ≥ 100.

  ```
  mission-generation ──► pin triggers (story: STORY_MISSION_RULES, pinWhen flags) ──► pinned offers, off the cap
                     ├─► MISSION_OFFER_RULES[type] (trigger) ──► offers, off the cap
                     ├─► fill to ACTS[act].boardCap: pickWeighted(type) ──► pickWeighted(site) ──► create
                     └─► each offer ──► decorators[0..n] ──► MissionOffered ──► consequences[type].onOffered? (Crash Site: the landing)
  launch / expiry ──► MISSION_CONSEQUENCE_RULES[type].onResolved / onExpired ──► city infestation
  launch (storyId) ──► onStoryMissionResolved ──► onWon / onLost ──► flags, act, campaign-won / -lost
  unlockTech ──► onTechUnlocked ──► flags ──► (next tick) story pins
  ```

- **A crash site lands when it is offered** (#1179; campaign arc §6.3, §6.9). The offer rule (`overworld/service/missions/crash-site-offer.ts`, debut at Act I mission 3) draws a free city in any region with a detected city. A city below 20 infestation weighs ×4, and from Act II a region with an online sensor array weighs ×2. The type's consequence rule lands the pod in `onOffered`: `landCrashSite` adds `landingInfestation` (+10) and `witnessCity` marks the city detected. Both go through events, and the landing is recorded on the offer as `Mission.crashSite { landingCityId, preLandingInfestation }`. When the mission is played, the pod decides. A wrecked pod erases the landing: the city goes back to `min(pre, now)`. A standing pod takes root with the offer's `ignorePenalty` (+15). A won crash site sets `spore-sample` the first time, which reveals Intel I. A lapsed offer takes root too. The resolver's `infestationDelta` is not applied. The crater map rule, `CRASH_SITE_SETUP` (`placeSporePod`, then `edgeSpawn.totalWaves = podEdgeWaves`, 2) and `MISSION_PRESENTATION["crash-site"]` complete the type. The offer pays tech points ×1.5.

  First Skyfall (`overworld/service/story/first-skyfall.ts`) is the scripted first crash site. It is pinned at d1 once mission 1 has been played, it never expires, and it lands like any other. Its map plan's `hookPlacement` brings the pod within 6–14 of deploy. A loss re-pins it five days later. A story offer shows its title from `ui/data/story-mission-titles.ts` as a badge under its offer row and in the briefing heading ("Briefing · First Skyfall"). See [`first-skyfall-offer.png`](first-skyfall-offer.png) and [`crash-site-briefing.png`](crash-site-briefing.png), captured by `tools/ui/capture-crash-site.mjs`.

  ```
  director ──► offer ──► MissionOffered ──► onOffered: landCrashSite ──► CityInfestationChanged +10 (+ CityDetected)
  launch   ──► onResolved: pod wrecked  ──► landing city = min(pre, now)  (+ CampaignFlagSet spore-sample, first win)
                           pod standing ──► landing city + 15
  expiry   ──► onExpired ──► landing city + 15
  ```

- **The spore pod is a spawner variant** (#1179): Crash Site's pod is a `Spawner` with `variant: "spore-pod"`, not an entity of its own, because spawners already take damage from shots, blasts, charges and fire through `damageSpawner`, are picked and drawn as scene entities, and are what the wreck objectives count. `SPAWNER_VARIANT_TRAITS` (`tactical/model/spawner-variant.ts`) holds what differs per variant; a pod never hatches. A spawner without `variant` is an egg spawner, so no save needs a bump. `placeSporePod` (`tactical/service/missions/spore-pod-setup.ts`) stands the pod up on the map's `spore-pod` hook with `podHp(difficulty)` and a `destroy-pod` objective whose `deadlineTurn` is `podMaturityTurn` (8); a mission type's setup calls it. The objective's `onDeadline` (`maturePod`) leaves the pod destroyed at zero hit points, `matured` with its burst pending, so no later wreck can credit a missed objective. `createPodBurstStep`, registered right after the deadline step, then releases `podBurstSize` bugs round it (`BugsSpawned { source: "pod" }`) at the start of turn 9.

  The countdown is generic, so any kind with a `deadlineTurn` gets one by naming a `deadlinePhrase` in `OBJECTIVE_PRESENTATION`. `ui/service/objectives/deadline-countdown.ts` turns it into `ObjectiveCountdown`; the HUD computes it once, for the tracker row and the turn banner's badge, which turn danger-coloured and pulse in the last `DEADLINE_URGENT_TURNS` (2). Graphics reads the same fact through `urgentDeadlineTargets`: `drawPerceived` hands it to `updateSpawners(spawners, ripe)`, and `SPAWNER_MODELS` (`graphics/data/spawner-models.ts`) swaps a ripe pod to `bug.spore-pod-mature`. The builder keeps the old mesh until the new one has loaded and drops a load that is no longer wanted. See [`spore-pod-crater.png`](spore-pod-crater.png), [`spore-pod-countdown.png`](spore-pod-countdown.png) and [`spore-pod-burst.png`](spore-pod-burst.png).

  ```
  turn 1..6    "Pod matures in N turns"               warning colour    bug.spore-pod
  turn 7       "Pod matures in 2 turns"               danger, pulsing   bug.spore-pod-mature
  turn 8       "Pod matures at the end of this turn"  danger, pulsing   bug.spore-pod-mature
  turn 9 start deadline step ──► ObjectiveUpdated{failed} ──► maturePod ──► SporePodMatured
               pod burst step ──► BugsSpawned{source: "pod"}            pod gone from the scene
  ```

- **Sitreps are rolled onto the offer and applied from a third table** (campaign arc §11, #1179). The last offer decorator, from `overworld/service/missions/sitrep-offer.ts`, fills `Mission.sitreps` from campaign mission 10 on (`missionsPlayed + 1`). It uses `ACTS[act].sitrepSlots` slots at `sitrepChance` each, and draws only sitreps that have debuted and that the offer does not already carry. Story offers carry none. The list is then frozen on the offer. Tactical copies it to `TacticalState.sitreps`. `SITREP_RULES` in `tactical/service/sitreps/` maps each `SitrepId` to a `SitrepRule` with three optional parts:
  - `setup` runs once at mission start, on the fork `sitrep:<id>`, in `SITREP_IDS` order.
  - `sight` adjusts sight range, read by `sightRangeOf` and so shared by fog, overwatch and bug AI.
  - `phaseStep` is appended to the END_TURN steps after the objective steps, runs only when the mission carries the sitrep, and gets its own fork.

  Setup runs after the garrison, so a sitrep sees every unit and objective it must keep clear of. The first look runs last and adds to what a sitrep already revealed. The UI reads names and effect lines from `ui/data/sitrep-presentation.ts`: one tag row per sitrep on the briefing, and compact tags on the mission list row. See [`sitreps-briefing.png`](sitreps-briefing.png).

  ```
  startTacticalMission ──► recipe ──► map ──► deployment ──► base state (bugMix, sitreps copied)
                       ──► MISSION_SETUP_RULES[typeId].setup ──► garrison (fork garrison-turrets)
                       ──► applySitrepSetups: SITREP_RULES[id].setup? (fork sitrep:<id>) per sitrep
                       ──► initialVision(state, known) ──► first look, unioned with explored
  sightRangeOf(unit) ──► SITREP_RULES[id].sight? per sitrep ──► computeVision, unitCanSee
  END_TURN ──► DEFAULT steps … objectivePhaseSteps() ──► sitrepPhaseSteps(): SITREP_RULES[id].phaseStep?
  ```

## 6. Testing strategy

- Simulation domains: Vitest unit tests required for every PR that touches them. Deterministic seeds make golden tests cheap.
- Map generation: property-style tests (connectivity, deploy zones reachable, objectives placed) across many seeds.
- Presentation: Playwright smoke tests that boot the game headless, navigate screens, and assert no console errors. QA extends these.
- CI runs `typecheck`, `lint`, `test`, `build`, and `e2e` on every PR. Red CI blocks merge.

## 7. Assets

- Low-poly GLTF/GLB models under `public/assets/models/<category>/`. Textures under `public/assets/textures/`. UI images under `public/assets/ui/`.
- A manifest per category (typed TS data) so code never references asset paths by string literal outside the manifest.
- The strategic map's Earth is data, not art (#1144): `graphics/data/earth-coastlines.ts` holds Natural Earth's land polygons as closed `[lon, lat]` rings, rebuilt by `tools/art/build-coastlines.mjs`; `graphics/view/earth-wireframe.ts` draws them as glowing vector coastlines over a graticule, through the same equirectangular projection the city layout uses, so continents and markers agree by construction. Regions are territories derived from that same data (#1149): `graphics/service/region-territory-service.ts` partitions the map plane into a Voronoi cell per city, `graphics/view/region-territories.ts` draws the borders between cells of different regions and fills a region on the infestation ramp, and the land fill stamps a stencil the territories are clipped by, so nothing is drawn over ocean or Antarctica.
- The strategic map draws its settlements and installations as GLB models (#1155): `graphics/data/overworld-model-table.ts` maps (settlement style, scale), egg overlays and deployable types to manifest ids, `graphics/data/settlement-styles.ts` maps each region to one of ten architectural styles (`graphics/model/settlement-style.ts`, resolved through `graphics/service/settlement-style-resolver.ts` so Tokyo and New York read differently), `graphics/view/city-marker.ts` stands the `overworld.settlement.<style>.<scale>` model on each city directly on the map (no disc or halo; hover grows it and shows faint orange corner brackets, selection shows them solid) with a deterministic per-city mirror, yaw and height from `graphics/service/settlement-variation.ts` and an invisible pick cylinder (so picking is unchanged), and swaps the `overworld.settlement-eggs.<style>.<scale>` overlay in while an infestation-clearance mission is on offer, and `graphics/view/region-installations.ts` places every built deployable on a ring around its region anchor (`graphics/service/installation-layout.ts`, deterministic, clear of the cities) with a per-type idle animation on the model's `animated` node ticked by the scene's `update(dt)`. Missing assets fall back to the placeholder factory, and without a loader the marker draws a stand-in box.
- Placeholder primitives are acceptable until art lands; gameplay must never block on art.
- Generated images (Codex) are committed with a short `.md` sidecar noting the prompt used.

## 8. Architecture Decision Records

Any change to §2, §3, or a new library goes in `docs/adr/NNNN-title.md` with context, decision, consequences. The Tech Lead writes or approves ADRs; the Director signs off when it touches §2.

| ADR | Title |
|---|---|
| [0001](../adr/0001-toolchain.md) | Toolchain: TypeScript 6, Vite, Vitest, Playwright, ESLint, CI |
| [0002](../adr/0002-layering-enforced-by-lint.md) | Layering enforced by lint; `save/` and `content/` placement |
| [0003](../adr/0003-state-commands-events-ids.md) | Root state, commands, events, plain string ids, data conventions |
| [0004](../adr/0004-tactical-map-contract.md) | Tactical map contract and generation pipeline |
| [0005](../adr/0005-overworld-camera-is-top-down.md) | Strategic map camera is top-down; tactical stays isometric |
| [0006](../adr/0006-fog-of-war-is-per-side-knowledge.md) | Fog of war is per-side knowledge in the mission state |
| [0007](../adr/0007-in-world-ui-is-dom-anchored-to-world-points.md) | In-world UI is DOM anchored to projected world points |
| [0008](../adr/0008-half-height-elevation-layers.md) | Elevation is measured in half-height layers; a one-layer step is a free walk |
| [0009](../adr/0009-map-scale-for-tactical-room.md) | Map scale opens up for tactical room: knobs not a multiplier, interiors as structures, map-aware zoom |
| [0010](../adr/0010-mech-rooftop-mobility.md) | Jump jets and mech roof occupancy |
| [0011](../adr/0011-tech-points-and-the-tech-tree.md) | Tech points are a second resource; the tech tree gates parts above tier 1 |
| [0013](../adr/0013-campaign-progression.md) | Campaign progression: acts, story spine, mission-type modules, bestiary by act ([campaign arc](campaign-arc.md)) |

Optional [Jev entity control and its inspector](jev-control.md) use an app-layer asynchronous controller around pure tactical commands. See [ADR 0012](../adr/0012-jev-entity-control.md).
