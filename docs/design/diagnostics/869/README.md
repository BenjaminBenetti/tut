# Connectivity repair kerb proof — #869

Measured 2026-09-09. Baseline `5b2d942d75df2212e3e94ab14341ea67d2645d2c` integrates main `cd37ce973bdfd5d41af4529fd98efdc3dee30ece`, including #1052's urban fence boundaries. Repair runtime: `a1347d789479990b0cb533601f970593a3389f44`. Subsequent evidence commits contain only this directory; the PR head identifies the complete record.

[MapGen's approval](https://github.com/BenjaminBenetti/tut/issues/869#issuecomment-5594641108) requires preserving the current pass sequence. Connectivity now clears only crossed half walls after accepting a ramp, checking both endpoint heights. Flanking kerbs and solid/window/door walls remain. The fence pass still receives the same kerb input.

## Actual failure and controls

`settlement-pipeline.test.ts` constructs a 20×20 paved cliff, then runs the real kerb/connectivity passes in production order. The objective is at `(15,2,10)`; connectivity adds `ramp-1 (9,0,1) → (10,2,1)`. Before the repair, I1–I8 validate but the upper half wall still crosses that ramp. Three cases cover upper/lower wall storage and flanking solid/window/door walls: **three red before, three green after**. An already-connected map keeps its original ramp, objective and every other kerb; the existing K1/K2 paved-edge controls also pass.

| Check | Baseline | Repair |
| --- | --- | --- |
| Pipeline + kerb tests | 3 failed / 5 passed | 8 passed |
| Existing connectivity tests | — | 6 passed |
| CI generation sweep | 3 passed, 52.37 s | 3 passed, 50.84 s |
| `pnpm test:sim` | 7 passed / 1 existing opt-in skip, 218.41 s | 7 passed / same skip, 262.90 s |
| Full unit suite | — | 2,293 passed / 1 existing skip |
| Typecheck, lint, build | — | passed |

## Current generation population

The 108 recipes are the CI small/medium/large × temperate/snowy/desert/coastal × rural/town/city × three-seed matrix. Both runs validate every map and produce the identical [sweep.jsonl](sweep.jsonl): SHA-256 `560257ccf07695e23c713604b806ab146359a678cf2653db688ebd5e9e378c47`.

All **108 frozen maps**, **1,695 ramp connectors** and **3,762 fence props** are unchanged. Fence totals are rural 1,240 / town 1,333 / city 1,189, with exact per-map hashes retained. Both runs have **0 connectivity ramp repairs, 0 walled ramps, 0 bare paved edges**. The forced regression demonstrates the latent defect; the historical raised-platform counts are not a current broken-ramp population. No removed elevation family was restored.

## Rendered controls

The frames are dated acceptance records, not executable screenshot baselines or pictures of the forced repair fixture. They check the unchanged paved waterfront and rural plot fence through the production MapLab renderer. Exact URLs, cameras, native crop, revision and hashes are in `frames.jsonl`. Capture uses models and units, observes model/preview readiness, and rejects page errors, console errors and asset-fallback warnings. No masking, pixel tolerance, image editing or renderer freeze is used.

All four retained PNGs were inspected. Each repeats byte-for-byte in a fresh browser capture; both before/after pairs are also byte-identical. Successful capture runs report no page/console errors or asset fallbacks.

| Control | Before | After | SHA-256 (both phases and repeats) |
| --- | --- | --- | --- |
| Paved waterfront | [frame](before/04-waterfront-boundary-control.png) | [frame](after/04-waterfront-boundary-control.png) | `d2faa1793279e006e7a2aa18364c0c223c16306a6cdd43ef66efc98324082164` |
| Rural plot fence | [frame](before/05-garden-boundary.png) | [frame](after/05-garden-boundary.png) | `7cf9f48537c734956bbf945888f32b06fe1fa3aeb2122c69e9ee48085c1f0764` |

## Reproduction

Run the survey tool from this PR in each runtime checkout (copying the tool to the baseline is sufficient), then compare the JSONL files byte-for-byte:

```sh
node tools/mapgen/survey-connectivity-kerbs.mjs /path/to/sweep.jsonl
pnpm exec vitest run src/mapgen/service/settlement-pipeline.test.ts src/mapgen/generator/kerb-pass.test.ts src/mapgen/generator/connectivity-pass.test.ts --maxWorkers=2
CI=1 pnpm exec vitest run src/mapgen/service/generation-sweep.test.ts --maxWorkers=1
pnpm test:sim
pnpm typecheck && pnpm lint && pnpm exec vitest run --maxWorkers=4 && pnpm build
```

Serve the baseline on `127.0.0.1:4271` and repair on `127.0.0.1:4272` with distinct Vite cache directories, `server.watch: null` and `server.hmr: false`. Use the capture tool from the repair checkout against each server; repeat each command into a separate output directory and compare the PNG bytes:

```sh
CAPTURE_BASE_URL=http://127.0.0.1:4271 CAPTURE_ONLY=04-waterfront-boundary-control,05-garden-boundary CAPTURE_OUTPUT=docs/design/diagnostics/869/before node tools/mapgen/capture-fence-controls.mjs before
CAPTURE_BASE_URL=http://127.0.0.1:4272 CAPTURE_ONLY=04-waterfront-boundary-control,05-garden-boundary CAPTURE_OUTPUT=docs/design/diagnostics/869/after node tools/mapgen/capture-fence-controls.mjs after
```

Chromium headless/SwiftShader, Playwright 1.62.1, Node 24.19.0. One initial after-capture attempt encountered a stopped server (`ERR_CONNECTION_REFUSED`); it produced no frame. A later repeat terminal exited 143 during its second view. The complete runs use separate terminals and unchanged code; interrupted runs are excluded from the record.
