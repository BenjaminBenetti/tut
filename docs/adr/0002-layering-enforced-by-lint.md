# ADR 0002: Layering enforced by lint

- **Status:** Accepted
- **Date:** 2026-09-02
- **Author:** Tech Lead
- **Scope:** Architecture §2 (principles) and §3 (layering); `eslint.config.js`

## 1. Context

Architecture §2 says simulation is pure TypeScript with no three.js or DOM, randomness flows through an injected RNG, and imports only point downward. With several agents landing PRs per hour, a convention that lives only in a document will drift. The rules need to fail the build.

## 2. Decision

### 2.1 Layers

```
 ┌──────────────────────────────────────────────────────────────┐
 │  app/          bootstrap, screen router, dependency wiring     │
 ├──────────────────────────────────────────────────────────────┤
 │  ui/  (DOM)                     graphics/  (three.js)          │
 ├──────────────────────────────────────────────────────────────┤
 │  save/         root GameState, envelope, migrations, codec     │
 ├──────────────────────────────────────────────────────────────┤
 │  overworld/ tactical/ mapgen/ roster/ bugs/ economy/ content/  │
 │  (simulation: pure TS, deterministic, no DOM, no three.js)     │
 ├──────────────────────────────────────────────────────────────┤
 │  core/         rng, ids, events, result, grid math             │
 └──────────────────────────────────────────────────────────────┘
```

`save/` sits above the simulation domains because it composes the root `GameState` from their slices and owns cross-slice migrations. It is still not presentation: it never touches a DOM global. The `Storage` instance behind the localStorage repository is injected by `app/`.

`content/` holds cross-domain **vocabulary**: closed id unions (`BiomeId`, `SettlementScale`, `ModelAssetId`) and definitions that more than one domain consumes (mission types). A definition only one domain reads lives in that domain's `data/` folder, keyed by the shared union so a missing entry is a compile error. Examples: biome definitions in `mapgen/data`, the model manifest in `graphics/data`.

### 2.2 Rules that ESLint enforces

| Files | Rule |
|---|---|
| `core save content overworld economy roster tactical bugs mapgen` | no `three` import; no import from `ui/`, `graphics/`, `app/`; no DOM globals (`window`, `document`, `localStorage`, `fetch`, `requestAnimationFrame`, …) |
| everywhere | `Math.random()` is an error |
| `src/core/service/random-seed.ts` | the one sanctioned `Math.random()` site |
| `src/graphics/model/camera-state.ts`, `src/graphics/service/isometric-camera-math.ts` | no `three` import, so camera math stays testable in Node |
| `*.test.ts`, `e2e/**` | doc-comment rule relaxed |

The rule list is the contract. Adding a domain means adding it to the simulation list in `eslint.config.js` in the same PR that creates the folder.

### 2.3 What lint cannot check

- `graphics` and `ui` may import simulation domains but must not hold game truth. Reviewers check that views render from state and emit commands.
- `app/` is the only composition root. Screens and services receive dependencies through constructors; no module-level singletons.
- `performance.now()` and `Date` are not banned by lint but simulation must not read them; timestamps and clocks are injected.

## 3. Consequences

- A PR that leaks three.js or the DOM into simulation fails `pnpm lint` before a reviewer sees it. Verified with a deliberately violating file when the rules landed (#16).
- `save/` above simulation means simulation domains never import `save/`; a domain that needs to persist something exposes a plain-data slice and `save/` composes it.
- The `content/` rule was applied on #10 (model ids) and #19 (biome and settlement ids) and is the precedent for any future shared id.

## 4. Alternatives considered

- **Convention only, enforced in review.** Rejected: with five agents this drifts within a day.
- **Dependency-cruiser or a custom import graph checker.** More expressive, but another tool to keep green. `no-restricted-imports` plus `no-restricted-globals` covers every rule we have today; revisit if a rule needs graph reachability.
