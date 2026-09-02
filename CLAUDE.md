# Terra Under Threat — Agent Instructions

You are working on **Terra Under Threat (TUT)**, a browser-based XCOM-style tactics game. Read these before doing anything:

1. `docs/process/studio.md` — how work flows, rules for every agent
2. `docs/process/roles/<your-role>.md` — your job
3. `docs/handoff/<your-role>.md` — where your predecessor left off (if it exists)
4. `docs/design/gdd.md` — what the game is
5. `docs/design/architecture.md` — how it is built

## Hard rules

- Only this repository: `BenjaminBenetti/tut`. Never touch any other repo or directory outside this workspace.
- Never push to `main`. All changes go through a PR. Only the Tech Lead merges.
- Never force-push a branch you don't own. Never rewrite `main` history.
- Simulation code never imports three.js or touches the DOM.
- No `Math.random()` outside `core/`'s RNG implementation.
- Every GitHub comment you post starts with `**<Role>** · TUT agent` on its own line.

## Commands

```
pnpm install          # after checkout
pnpm dev              # vite dev server on :5173
pnpm typecheck
pnpm lint
pnpm test             # vitest
pnpm test:e2e         # playwright (headless chromium)
pnpm build
```

## SOLID Principles

All code must follow SOLID principles:

- **Single Responsibility**: Every module, class, and function should have one reason to change.
- **Open/Closed**: Code should be open for extension but closed for modification. Favor composition and interfaces over editing existing implementations.
- **Liskov Substitution**: Subtypes must be substitutable for their base types without altering correctness.
- **Interface Segregation**: Prefer small, focused interfaces over large ones. No client should be forced to depend on methods it does not use.
- **Dependency Inversion**: Depend on abstractions, not concretions. High-level modules should not import from low-level modules; both should depend on interfaces.

When writing or modifying code, actively apply these principles. If a change would violate SOLID, refactor to preserve it.

## File Structure

Organize code under `src/` using the pattern `/<domain>/<type>/<file>`:

- **domain**: the feature area (`overworld`, `tactical`, `mapgen`, `roster`, `bugs`, `economy`, `graphics`, `ui`, `core`, `save`, `app`, `content`)
- **type**: the kind of component (`model`, `service`, `repository`, `controller`, `view`, `screen`, `data`, `generator`, `ai`, `resolver`)
- **file**: a descriptive kebab-case name

Examples:
- `src/overworld/service/infestation-service.ts`
- `src/roster/model/mech-loadout.ts`
- `src/mapgen/generator/building-generator.ts`
- `src/graphics/service/isometric-camera-rig.ts`

Tests sit beside the file they test: `infestation-service.test.ts`.

When creating new files, always place them according to this structure. When refactoring, migrate misplaced files to match.

## Comments

All methods must have JSDoc comments (`/** ... */`). When writing or modifying methods, always include or update the doc comment.

### Section Comments

Use section comments to visually separate logical regions of a class or module (public methods, private methods, fields, constants):

```
// ===========================================
// Section Name
// ===========================================
```

### Diagrams

Provide ASCII diagrams in docs and doc comments when they clarify structure or flow.

## Conventions decided in ADRs

Read `docs/adr/` once; the short version:

- Ids are plain `string` aliases, never branded types (ADR 0003 §2.4).
- Exported constants are `UPPER_SNAKE_CASE`; tuning is one object typed by an interface in `model/` (ADR 0003 §2.5).
- Content lives in `<domain>/data/` typed against `<domain>/model/`; closed id sets use `Readonly<Record<Id, Definition>>`; services depend on catalogue interfaces, not data modules.
- Simulation services return `Applied { state, events }` and `Result` errors; they never mutate input or read `Date` / `Math.random()` (ADR 0003 §2.2, §2.3).
- Shared id unions go in `content/model`; domain-only definitions stay in the owning domain (ADR 0002 §2.1).
- A test that reads the disk starts with `/// <reference types="node" />`; browser code reading `import.meta.env` relies on `src/vite-env.d.ts` (ADR 0001).

## Git

- Branch: `<type>/<issue>-<slug>` (`feat/12-earth-map-model`)
- Commit messages: conventional commits, `feat(overworld): add infestation tick (#12)`
- PR title: same format. Body: use the template. `Closes #<issue>`.
- Commit early and often on your branch. Push at least once an hour so work survives an instance refresh.
