# Half-height layer conversion — #807 proof

ADR 0008 engine child. Prerequisites: #810 (save migration), #812 (explicit units).

## Four reference frames

Baseline: main `306a562` (includes #811 slope art). Both runs used Chromium/SwiftShader in the same workspace, the fixed screenshot seeds, and no source edits or parallel checks during capture. All four resulting frames were inspected.

```sh
CAPTURE=1 pnpm exec playwright test e2e/fog-screenshot.spec.ts e2e/slope-screenshot.spec.ts --workers=1 --timeout=180000
```

The capture-only timeout accommodates the 2400×1500 PNG shutter. Runtime assertions are unchanged. The tactical frames are 1280×720; Map Lab scenes occupy x ≥ 380. Exact decoded RGB comparison found zero changed scene pixels in all four frames.

| Frame | Changed pixels | Result |
|---|---:|---|
| [Seed 4242, turn 1](tactical-fog-of-war.png) | 0 | Entire PNG byte-identical |
| [Seed 4242, turn 7](tactical-fog-of-war-turn7.png) | 0 | Entire PNG byte-identical |
| [City, 730982385](shots/799-preview-control-seed730982385.png) | 596 | Sidebar only; scene identical |
| [Snowy rural, hills-1](shots/799-preview-terrain-heavy-snowy-rural-hills-1.png) | 1530 | Sidebar only; scene identical |

Every changed pixel is accounted for below. The ramp readout includes the retired natural slope connectors; traversal and wedge shape remain unchanged. ASCII now derives slope glyphs from `Tile.slope`, including two previously unmarked outer corners.

| Sidebar change | City pixels | Rural pixels |
|---|---:|---:|
| Map bound: 7→14 / 5→10 layers | 69 | 88 |
| Terrain note: 2→4 / 3→6 layers | 86 | 84 |
| Road grade note: layer 1→2 | 29 | 0 |
| Ramp count: 2→448, including text displacement | 0 | 764 |
| Two outer-corner ASCII glyphs | 0 | 78 |
| Generation and pass timing digits | 412 | 516 |
| **Total** | **596** | **1530** |

SHA-256 of the complete PNGs, before → after:

- `799-preview-control-seed730982385.png`: `1b353c949e282c5ddd0435c9858d539a3b511cc163e41622ded01e2ae4832d3b` → `2a450ed1c7c1495b19eb6e53e1588d1b4d4a8c8e861ca4671cd00c4019c10529`
- `799-preview-terrain-heavy-snowy-rural-hills-1.png`: `8c1cc327ae0b7d47e72a523620a95ae808971f36474eaa326a5a51d4732e2f24` → `a5a8583f2751f3ee73c57b2bfd91aa60731b545300951af597be259281f34df1`
- `tactical-fog-of-war-turn7.png`: `5ce3317cf7cd953b9333b4856678d3c6ff4359f084570392866cc9126aad21c4` → `5ce3317cf7cd953b9333b4856678d3c6ff4359f084570392866cc9126aad21c4`
- `tactical-fog-of-war.png`: `6c7ced231fe7112624f0f842dae1c0f644745a7b08bff961df64b04e7fcf696a` → `6c7ced231fe7112624f0f842dae1c0f644745a7b08bff961df64b04e7fcf696a`

## Simulation and goldens

`SIM_REPORT=<path> pnpm test:sim` records the 60 seeded outcomes, turns, surviving units and invariant violations, excluding nondeterministic timings. The before report was captured with the original storey units before activation. All 60 final reports match it exactly, including outcomes, turns, survivors and violations. Both files have SHA-256 `2551241aa1586294a49050cce8b1343a3c6fadb50a59316d3073c53cd9037005`.

| Difficulty | Before = after: won / lost / at 15-turn cap |
|---|---|
| 1 | 6 / 0 / 0 |
| 2 | 6 / 0 / 0 |
| 3 | 6 / 0 / 0 |
| 4 | 6 / 0 / 0 |
| 5 | 4 / 0 / 2 |
| 6 | 6 / 0 / 0 |
| 7 | 3 / 0 / 3 |
| 8 | 4 / 0 / 2 |
| 9 | 2 / 0 / 4 |
| 10 | 0 / 0 / 6 |

Goldens now hash the ASCII render of every layer, including empty odd layers; a composite alone would not detect a vertical-coordinate regression. Expected checksums:

| Seed | Old composite | New all-layer render |
|---|---:|---:|
| golden-temperate | 721498291 | 2288975501 |
| golden-snowy | 4265621186 | 2369789076 |
| golden-desert | 2701505561 | 2319165908 |
| golden-coastal | 1017312214 | 2376744036 |
| golden-rural | 3476428387 | 3107225177 |
| golden-city | 3653172638 | 3562889357 |

Validation: typecheck, lint, build, 1,962 unit tests, the 1,200-map wide sweep (zero failures/relocations), seven simulation tests, and `CI=1 pnpm test:e2e` (59 passed, nine capture-only skips) passed. The changed Map Lab smoke also passed twice with CI retries and flake rejection.
