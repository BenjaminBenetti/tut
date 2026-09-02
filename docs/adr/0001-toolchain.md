# ADR 0001: Toolchain

- **Status:** Accepted
- **Date:** 2026-09-02
- **Author:** Tech Lead
- **Scope:** Language, build, lint, test, CI, and the devcontainer

## 1. Context

Architecture §1 fixes the stack at TypeScript, Vite, three.js, Vitest, Playwright, ESLint, Prettier, and pnpm. This ADR records the versions and the non-obvious choices inside that stack, so nobody re-litigates them by accident when a package update looks tempting.

## 2. Decisions

1. **TypeScript 6.x, not 7.** `typescript@7` is the native (Go) compiler and ships no JavaScript compiler API; typescript-eslint requires `typescript <6.1`. Typed linting is worth more to a five-agent codebase than native `tsc` speed on a project this size. Revisit when typescript-eslint's peer range includes 7.
2. **Solution-style tsconfig.** `tsconfig.json` only references `tsconfig.app.json` (browser code under `src/`, `types: []` so Node globals cannot leak into simulation code) and `tsconfig.node.json` (`e2e/` and `*.config.ts`, `types: ["node"]`). `pnpm typecheck` runs `tsc -b`. Tests that must read the disk (manifest path checks) opt in with `/// <reference types="node" />`; browser code that reads `import.meta.env` gets it from `src/vite-env.d.ts`.
3. **ESLint 10 flat config with typed rules.** `typescript-eslint` recommended-type-checked and stylistic-type-checked, `eslint-plugin-jsdoc` for the "every method has a doc comment" rule from `CLAUDE.md`, `eslint-config-prettier` last. Layering rules are in ADR 0002. Plain `.js` / `.mjs` / `.cjs` files (tooling under `tools/`) are linted with Node globals and no type information.
4. **Prettier with defaults**, Markdown excluded, so docs PRs from non-engineering roles never fail lint on table alignment. `pnpm lint` runs ESLint and `prettier --check` together so the documented command list stays short.
5. **Vitest 4** for unit tests, Node environment by default, tests beside the code (`*.test.ts` under `src/`). A presentation test opts into jsdom per file.
6. **Playwright + Chromium** for end-to-end, against the Vite dev server. Headless Chromium renders WebGL through SwiftShader and needs `--use-angle=swiftshader --use-gl=angle --enable-unsafe-swiftshader`. The app sets `body[data-app-state="ready"]` after its first rendered frame; tests wait on that, never on timeouts.
7. **pnpm 11** with its minimum-release-age gate left on; `pnpm add` of a fresh package appends to `pnpm-workspace.yaml`, which is committed. CI installs with `--frozen-lockfile`.
8. **CI is two jobs on every PR and on push to `main`:** `verify` (typecheck, lint, test, build) and `e2e` (Playwright with a cached Chromium keyed on the Playwright version). Red CI blocks merge.
9. **Devcontainer** `postCreateCommand` installs dependencies and Chromium with its OS packages, so a fresh container can run the full suite.

## 3. Consequences

- New tooling versions are upgraded deliberately, with this file updated, not by `pnpm update`.
- The `types: []` choice means a test touching `node:fs` needs the reference directive; that is intentional friction.
- Engineers can rely on `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:e2e` being exactly what CI runs.
