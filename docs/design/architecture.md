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

Single player, browser only, no server.

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
 │  overworld/  tactical/  mapgen/  roster/  bugs/  economy/ content│
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
| `economy` | Credits, prices, income, transactions |
| `roster` | Squads, mechs, parts, loadouts, validation, permadeath bookkeeping |
| `tactical` | Tile grid runtime, units on map, turn engine, actions, cover/LOS, spawners, resolution |
| `bugs` | Bug species data and AI behaviours |
| `mapgen` | Procedural map generator, biomes, buildings, placement hooks, preview harness; pass order in `mapgen-pipeline.md` |
| `graphics` | Renderer, orthographic camera rig, scene builders for overworld and tactical, asset loader, VFX |
| `ui` | DOM screens (menu, overworld, mech bay, deployment, mission HUD, results), shared components |
| `content` | Cross-domain vocabulary: closed id unions (biome, settlement scale, model ids) and definitions more than one domain consumes (mission types). A definition only one domain reads lives in that domain's `data/`, keyed by the shared union (ADR 0002) |

Add domains via ADR when needed. Don't create `utils` dumping grounds.

## 5. Key contracts

- **Root game state**: one serializable object `GameState { meta, overworld, roster, economy, activeMission? }`.
- **Command pattern**: presentation issues commands (`AdvanceDay`, `PurchasePart`, `MoveUnit`, `FireWeapon`). Simulation services validate and apply commands, returning a new state and a list of domain events for presentation to animate.
- **Mission resolver interface**: `MissionResolver.resolve(mission, deployment, state) → MissionResult`. M1 ships an `AutoResolveMissionResolver`; M2 ships the tactical one. The overworld doesn't care which.
- **Map contract**: `TacticalMap { width, depth, levels, tiles[], buildings[], hooks{deployZones, objectives, edgeSpawns, extraction} }`. Map generation produces it; tactical consumes it; graphics renders it. Full contract and invariants: [ADR 0004](../adr/0004-tactical-map-contract.md).
- **Cameras**: one orthographic rig module owns the single camera, driven by a plain `CameraState`. A `CameraProjection` (elevation, yaw offset) picks how it looks at the ground: tactical maps use the isometric projection they are authored for (fixed elevation `atan(1/√2)`, yaw snapped to the 4 diagonals), and the strategic map uses the top-down projection (straight down, north up, no rotation) so Earth reads as a map rather than a rhombus. Zoom is clamped for both. See [ADR 0005](../adr/0005-overworld-camera-is-top-down.md).

- **Development tools** (#1136): `import.meta.env.DEV` is read in exactly one place, `app/service/app-bootstrap.ts`, and enters the composition as a plain `devTools: boolean`. `composeGame` → `composeTactical` turn it into the `PlaceUnit` handler's `enabled` switch and, when on, a `DevTools { placeable }` catalogue the tactical screen hands the HUD; when off the screen receives nothing and builds no dev-only DOM. The handler is registered in every build and refuses with `TacticalError { kind: "debug-disabled" }` outside a dev one, so the same command in a production save replays to a typed refusal rather than to a unit. Nothing below `app/` reads the environment.

- **Overworld selection is region-first** (#1154): `OverworldSelectionState` holds `{ regionId, cityId, missionId }`. Picking a city sets its region through an injected resolver; `selectRegion(undefined)` clears all three. The Situation column shows the *region* (`RegionPanelView`: biome, worst and mean infestation, one row per city) and the mission list narrows to it with a "Show all" way back. A city itself opens the `RadialMenuView` as a city wheel (`ui/service/city-wheel.ts` builds it: infestation at the hub over `name · population`, the city's missions and a Region entry on the ring). The map reports pointer picks over a `CityPickSource` separate from the selection, so a mission row never pops a wheel; the screen re-anchors the open wheel every animation frame from `cityScreenPosition`, the way the tactical HUD follows its unit (ADR 0007).

- **Installations are picked and explained the same way** (#1155): `OverworldPick` is `city | installation | region`, and `overworldPickerAdapter` asks the scene in that order (`CityPicker`, `InstallationPicker`, `RegionPicker`), so a click on a battery's model never falls through to the land under it. An installation pick selects its region alone and travels over an `InstallationPickSource` (`InstallationPickChannel`, a `PickChannel` like the city one) to the overworld screen, which opens the one `RadialMenuView` as the installation wheel (`ui/service/installation-wheel.ts`: `L{n}` at the hub over `type · online|offline` with the effect as the hub's note, Upgrade with the next level's price, Decommission and Region on the ring). In the Situation panel, resting on a Build option or an installed row opens the shared `PopoverView` (`ui/view/popover-view.ts`, one per document, `role="tooltip"`), whose lines come from the pure `ui/service/deployable-popover.ts` over the effect describer, so the panel, the wheel and the popover can never disagree about what a level does. See [`overworld-deployable-popover.png`](overworld-deployable-popover.png) and [`overworld-installation-wheel.png`](overworld-installation-wheel.png).

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
