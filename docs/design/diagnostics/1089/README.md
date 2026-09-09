# #1089 — scout progress and delayed spawner drawing

[Cause before repair](https://github.com/BenjaminBenetti/tut/issues/1089#issuecomment-5596215829).
Baseline main is `69c44eb`; the failing runner evidence is the retry trace from
[job 102341600047](https://github.com/BenjaminBenetti/tut/actions/runs/34312408328/job/102341600047),
docs-only PR #1080 merged into main `01c0f65` (merge ref `a640a80`). `runner-scout.json` preserves the trace's
saved-state transitions and rendered-count reads, with the artifact checksum.

The scout reached (10,2,6) on turn 3 / command 7. Its saved TDF explored set
already included spawner-1 at (9,2,6), while the rendered count remained zero.
The test kept walking to (17,2,6), spent turns 4–8, and failed with the scout
alive: the last saved sample is 77 HP; the later final DOM is turn 9 / 73 HP. The save was current. `playAroundRedraw` places perceived models
after preceding animations, and the test used that delayed count to decide
whether it should keep issuing scouting commands.

The repaired fixture waits for initial model readiness, routes with the game's
movement queries, and proves each accepted command reached its exact saved
destination, consumed AP and advanced the command counter. End Turn must advance
the saved turn and return to the player phase. Each moved model must reach its
saved destination before the next command, bounding the animation backlog. Once actual player knowledge
contains a spawner, scouting stops and the fixture waits for that specific scene
object. It then uses the existing layer/zoom controls and real mouse click to
test the picker. A stalled move reports the unit, origin, destination, turn,
AP and command counter; the scout's progress is attached to Playwright reports.

Seed 4242, the full starter force, the 14-attempt bound and repository timeout
budgets remain unchanged. There is no player-runtime, map, art or image-baseline
change. The derived-entrance fixture remains unchanged as well.

The first candidate (`fb91df4`) passed three ordinary CI-mode repetitions but
failed all three controlled slowdown runs at the unchanged 15-second mesh wait.
It stopped correctly after discovery, but still allowed preceding movement
animations to accumulate. An instrumented repeat found no browser error; it
failed at the same wait. These failed attempts remain in `validation.json`.

The paced candidate waits for each model's feet to reach the projected saved
destination (within 0.1 pixel, both projected by the same rig) before issuing
another move. It passes **all three identical controlled slowdown runs**:
44.761 / 36.370 / 34.694 seconds, 126.42 seconds process time, exit 0. Each stops
after five accepted moves at (10,2,6), turn 3 / command 7, then waits for the
specific spawner and passes the real click. `slow-redraw.json` records those
actual state transitions. Typecheck and scoped lint/format pass. Final ordinary
repetitions also pass: **29.856 / 39.634 / 28.495 seconds**, 109.42 seconds
process time, zero retries, exit 0. All three take the same five moves and
finish discovery on turn 3 with 80 HP. `normal-repeats.json` preserves the
progress. Omitting `invokeTile` fails at the first attempted move: command stays
0 rather than 1, z stays 29 rather than 23, and AP is unspent. That negative
control exits 1 in 22.05 seconds, at the intended existing 15-second predicate.
Both temporary diagnostic copies are removed; current-head CI and Tech Lead
review remain. Runtime/fixture source for the final measurements is `acf026b`.

```sh
CI=1 pnpm exec playwright test e2e/tactical-spawners.spec.ts \
  --workers=1 --repeat-each=3 --retries=0 --fail-on-flaky-tests
```

The local checkout uses the same config with direct Node Vite startup and a
private port/root because it lives under `.git/`; assertions and budgets are
unchanged. The controlled diagnostic repeats the spec with browser CPU rate 2
and an injected six-second delay after `stage.setVision` when player knowledge
contains a spawner. That injection is confined to a temporary browser response;
it does not modify production code or become a CI setting.
