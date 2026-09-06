# Mist allocation and first-mount measurements (#793)

Measured 2026-09-06 on the same Codex container, Chromium/SwiftShader from the
locked Playwright install. Main baseline: `a735baa`; pre-#776 control: `35bfa4c`.
The fix shares prototype resources and preserves both accepted frames exactly.
**It does not meet the issue's performance target. #793 must remain open.**

## Resource ownership

- One mist material per source material per scene, memoised by object identity.
- One cutaway material per building prototype per scene, so the mist cache
  also works across building levels. Plain and ghosted variants stay separate.
- Shared geometry is cloned once per prototype. Lightweight batch wrappers
  share those private vertex/index buffers and retain independent coverage
  attributes. Loader buffers remain untouched and are never disposed here.
- Connector geometry already belongs exclusively to the view: coverage is
  attached directly. Connector materials remain independent because vision
  writes their individual tints.
- Batch construction order is explicit in the terrain's `(0, 1)` render-order
  range, below tactical overlays. Previously unique material IDs implicitly
  established that order. Sharing materials without preserving it changed
  145 pixels at turn 1 and 135 at turn 7, along coincident wall seams.

Tests cover cross-batch sharing, independent exploration, different prototypes,
material arrays, different missions/cutaway uniforms, and single disposal of
shared materials. Shader text, uniforms, fog strength and palette are unchanged.

## Byte-identical captures

Ran `CAPTURE=1 pnpm exec playwright test e2e/fog-screenshot.spec.ts` on main
before editing and again after the fix. Opened and inspected both final PNGs.
Both regenerated files are byte-identical to main, so Git correctly records
no PNG diff. The existing committed frames remain the review artefacts:

| Frame | SHA-256, main and regenerated |
| --- | --- |
| [Seed 4242, turn 1](tactical-fog-of-war.png) | `6c7ced231fe7112624f0f842dae1c0f644745a7b08bff961df64b04e7fcf696a` |
| [Seed 4242, turn 7](tactical-fog-of-war-turn7.png) | `5ce3317cf7cd953b9333b4856678d3c6ff4359f084570392866cc9126aad21c4` |

## First mount

The opt-in benchmark measures browser `performance.now()` from invoking the
mission launch hook until unit models are ready, two animation-frame boundaries
have passed, and WebGL `finish()` completes the submitted draw. It includes
model loading and GPU work, excludes overworld navigation, and uses seed 4242.
Timings are reported as annotations, never used as a flaky-test threshold.

```bash
BENCHMARK=1 CI=1 pnpm exec playwright test e2e/tactical-mount-benchmark.spec.ts \
  --workers=1 --repeat-each=3 --reporter=json
```

| CPU affinity | Tree | Samples (ms) | Median (ms) |
| --- | --- | --- | --- |
| Default, 32 available CPUs | Main | 396, 428, 390 | 396 |
| Default, 32 available CPUs | Fix | 407, 387, 244 | 387 |
| CPUs 0 and 1 | Pre-#776 | 1880, 1621, 1686, 1456, 1690 | 1686 |
| CPUs 0 and 1 | Main | 2148, 2180, 2256, 1959, 3700 | 2180 |
| CPUs 0 and 1 | Fix | 2416, 1279, 2420, 2449, 2175 | 2416 |

For the five-sample, two-core runs, prefix the command with
`BENCHMARK=1 CI=1 taskset -c 0,1` and use `--repeat-each=5`. Run each tree
sequentially, with the same benchmark file copied into the two control trees.
CPU affinity approximates a constrained runner; it is not a GitHub CI result.

The unrestricted first-mount median improves 2.3%; the two-core median is
10.8% slower than main and 43.3% slower than the pre-mist control. These samples
do not establish a performance improvement. An intermediate run without the
draw-order preservation looked faster, but it failed the byte-identical image
requirement and is not the submitted result.

## The two specs from the issue

```bash
CI=1 pnpm exec playwright test e2e/tactical-screen.spec.ts \
  e2e/tactical-mission-flow.spec.ts --workers=1 --repeat-each=3 --reporter=json
```

These are full-spec durations, including navigation and reload, on default CPU
affinity. Every run passed all 12 tests without retry.

| Metric | Pre-#776 | Main | Fix |
| --- | --- | --- | --- |
| Tactical-screen samples (ms) | 4392, 3896, 4055 | 5265, 3473, 4512 | 4821, 5327, 4001 |
| Tactical-screen median (ms) | 4055 | 4512 | 4821 |
| Launch/extraction samples (ms) | 3087, 3214, 3175 | 3790, 4279, 3534 | 3613, 3982, 3591 |
| Launch/extraction median (ms) | 3175 | 3790 | 3613 |
| All 12 tests, elapsed (s) | 36.920 | 44.129 | 44.369 |

Both named medians remain more than 10% above the pre-#776 control.

## What the measurements establish

In a separate diagnostic run, `PROFILE=1 BENCHMARK=1` instruments WebGL
`linkProgram`. Main and the fix each link **21 programs**, including the
overworld. Three already shares compiled programs by their cache keys:
`WebGLRenderer.getProgram` does per-material hook/uniform setup, then
`WebGLPrograms.acquireProgram` reuses an existing matching program.

The allocation defect is real, but it does not create a distinct linked GPU
program for every batch. This fix removes duplicate material setup and buffer
copies; it does not remove the mist shader's compile/render cost. The broader
timing regression and the reported CI stalls need further profiling. No test
timeouts or retry policy were relaxed, and these local passes do not establish
that the loaded two-vCPU CI stalls are gone.

Validation: typecheck, lint, build, and 1,943 unit tests passed (one skipped).
The full browser suite passed 59 tests without retries, with six opt-in
captures/benchmarks skipped. The separate fog capture passed. Build retains
the existing chunk-size warning.
