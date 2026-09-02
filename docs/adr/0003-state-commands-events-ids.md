# ADR 0003: Root state, commands, events, and ids

- **Status:** Accepted
- **Date:** 2026-09-02
- **Author:** Tech Lead
- **Scope:** Architecture §5 (key contracts); `core/model`, `save/model`

## 1. Context

Architecture §5 sketches the root `GameState`, the command pattern, and the mission resolver interface. Three domains landed models in the same afternoon and two of them chose different id conventions. This ADR pins the shapes every domain builds on.

## 2. Decisions

### 2.1 Root state

`GameState` (`save/model/game-state.ts`) is plain, JSON-serializable data. `meta` carries the seed, the serialized master RNG, the serialized id counters, and the campaign creation timestamp. Each domain adds its own slice (`overworld`, `roster`, `economy`, later `activeMission`) as a readonly field typed by that domain's `*State` interface.

Adding or reshaping a slice means: change the type, bump `GAME_STATE_SCHEMA_VERSION`, append a `Migration` to `save/data/migrations.ts`. Migrations are untyped (`unknown → unknown`), pure, and never edited once shipped. `MigrationRunner` validates the chain at startup and refuses saves newer than the build.

### 2.2 Commands, events, and services

```
   (state, command, deps) ──► service.apply ──► Applied { state', events[] }
                                                              │
   presentation ◄── animates events ◄─────────────────────────┘
```

- `Command<TType, TPayload>` and `DomainEvent<TType, TPayload>` (`core/model`) are plain data with a string `type` discriminator. Each domain declares its own unions.
- Simulation services are pure functions or stateless classes: they take state and a command, return `Applied<TState, TEvent>` (new state plus events), and never mutate their input. Invalid commands return `Result` errors (`core/model/result.ts`), not exceptions; exceptions are for programmer errors.
- Presentation reads state and animates events. It never diffs state to discover what happened.
- Dependencies (RNG, id generator, catalogues, tuning, clocks) are injected through constructor parameters or an explicit `deps` argument, typed as interfaces from the domain's `model/` folder.

### 2.3 Randomness and time

Every random draw goes through an injected `Rng` (`core/model/rng.ts`). `fork(label)` derives a stream that is a pure function of the parent seed and the label, so inserting or reordering consumers does not perturb each other; pipelines assert unique labels. The master RNG's state is saved in `GameState.meta` and restored on load. Simulation never reads `Date` or `performance`; the app passes ISO timestamps and clock functions in.

### 2.4 Ids

Ids are **plain `string` aliases**, never branded types. Runtime entities get `"<prefix>-<n>"` from `SequentialIdGenerator` (prefixes contain no `-`); content and seed data use stable kebab-case slugs (`"new-york"`, `"chassis-vanguard"`, `"bug.swarmer"`). Domains export a named alias (`CityId`, `SquadId`, `PartId`) for readability only. Rationale: brands add casts at every JSON boundary and every generator call, and the codebase already had two conventions after one afternoon. Type safety across id kinds comes from the surrounding record types, not from the id.

### 2.5 Data files and catalogues

- Content lives in `<domain>/data/*.ts` as typed objects; the interface it satisfies lives in `<domain>/model/`.
- Exported constants are `UPPER_SNAKE_CASE` (`GAME_STATE_SCHEMA_VERSION`, `ECONOMY_TUNING`, `STARTER_PARTS`). Tuning is exported as one object typed by an interface so services can be handed a substitute.
- When the id set is closed, data is `Readonly<Record<Id, Definition>>` so a missing entry fails typecheck. When it is open-ended, data is a list and a registry rejects duplicates at construction.
- Services depend on a catalogue **interface** (`PartCatalogue`, `SquadTypeCatalogue`, `Registry<T>`), never on the data module. The generic registry is being consolidated into `core/` (#108).

### 2.6 Serialization boundaries

Everything under `GameState` survives `JSON.parse(JSON.stringify(x))` unchanged: no classes, `Map`, `Set`, `Date`, `undefined`-bearing optionals that matter, or typed arrays. Working models that need mutation or typed arrays (mapgen's `MapDraft`) stay outside `GameState` and are frozen into plain data before they leave their domain.

## 3. Consequences

- Every domain PR is checked against §2.2 (pure services returning `Applied`), §2.4 (plain string ids), and §2.6 (JSON round-trip test).
- `#115` was reworked from branded to plain ids under this rule; `#103` and `#104` already complied.
- Replays and deterministic tests are cheap: a seed plus a command list reproduces any state.
