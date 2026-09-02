# Terra Under Threat — Architecture Brief

> Owner: Tech Lead (with Director sign-off on anything in §2 and §3). Engineers must read this before their first PR.

## 1. Stack

| Concern | Choice |
|---|---|
| Language | TypeScript, strict mode |
| Bundler / dev server | Vite |
| 3D | three.js (GLTF assets, orthographic isometric camera) |
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
| `mapgen` | Procedural map generator, biomes, buildings, placement hooks, preview harness |
| `graphics` | Renderer, isometric camera rig, scene builders for overworld and tactical, asset loader, VFX |
| `ui` | DOM screens (menu, overworld, mech bay, deployment, mission HUD, results), shared components |
| `content` | Cross-domain vocabulary: closed id unions (biome, settlement scale, model ids) and definitions more than one domain consumes (mission types). A definition only one domain reads lives in that domain's `data/`, keyed by the shared union (ADR 0002) |

Add domains via ADR when needed. Don't create `utils` dumping grounds.

## 5. Key contracts

- **Root game state**: one serializable object `GameState { meta, overworld, roster, economy, activeMission? }`.
- **Command pattern**: presentation issues commands (`AdvanceDay`, `PurchasePart`, `MoveUnit`, `FireWeapon`). Simulation services validate and apply commands, returning a new state and a list of domain events for presentation to animate.
- **Mission resolver interface**: `MissionResolver.resolve(mission, deployment, state) → MissionResult`. M1 ships an `AutoResolveMissionResolver`; M2 ships the tactical one. The overworld doesn't care which.
- **Map contract**: `TacticalMap { width, depth, levels, tiles[], buildings[], hooks{deployZones, objectives, edgeSpawns, extraction} }`. Map generation produces it; tactical consumes it; graphics renders it. Full contract and invariants: [ADR 0004](../adr/0004-tactical-map-contract.md).
- **Isometric camera**: orthographic, fixed elevation angle, yaw snapped to 4 orientations, zoom clamped. One module owns it.

## 6. Testing strategy

- Simulation domains: Vitest unit tests required for every PR that touches them. Deterministic seeds make golden tests cheap.
- Map generation: property-style tests (connectivity, deploy zones reachable, objectives placed) across many seeds.
- Presentation: Playwright smoke tests that boot the game headless, navigate screens, and assert no console errors. QA extends these.
- CI runs `typecheck`, `lint`, `test`, `build`, and `e2e` on every PR. Red CI blocks merge.

## 7. Assets

- Low-poly GLTF/GLB models under `public/assets/models/<category>/`. Textures under `public/assets/textures/`. UI images under `public/assets/ui/`.
- A manifest per category (typed TS data) so code never references asset paths by string literal outside the manifest.
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
