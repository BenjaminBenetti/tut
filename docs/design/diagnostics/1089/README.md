# #1089 — scout progress and delayed spawner drawing

[Cause before repair](https://github.com/BenjaminBenetti/tut/issues/1089#issuecomment-5596215829).
Baseline main is `69c44eb`; the failing runner evidence is the retry trace from
[job 102341600047](https://github.com/BenjaminBenetti/tut/actions/runs/34312408328/job/102341600047),
docs-only PR #1080 on main `799948f`. `runner-scout.json` preserves the trace's
saved-state transitions and rendered-count reads, with the artifact checksum.

The scout reached (10,2,6) on turn 3 / command 7. Its saved TDF explored set
already included spawner-1 at (9,2,6), while the rendered count remained zero.
The test kept walking to (17,2,6), spent turns 4–8, and failed with the scout
alive at 77 HP. The save was current. `playAroundRedraw` places perceived models
after preceding animations, and the test used that delayed count to decide
whether it should keep issuing scouting commands.

The repaired fixture waits for initial model readiness, routes with the game's
movement queries, and proves each accepted command reached its exact saved
destination, consumed AP and advanced the command counter. End Turn must advance
the saved turn and return to the player phase. Once actual player knowledge
contains a spawner, scouting stops and the fixture waits for that specific scene
object. It then uses the existing layer/zoom controls and real mouse click to
test the picker. A stalled move reports the unit, origin, destination, turn,
AP and command counter; the scout's progress is attached to Playwright reports.

Seed 4242, the full starter force, the 14-attempt bound and repository timeout
budgets remain unchanged. There is no player-runtime, map, art or image-baseline
change. The derived-entrance fixture remains unchanged as well.

Verification so far: actual `tsc -b` and scoped ESLint/Prettier pass; three
CI-mode repetitions pass with zero retries (38.1 / 39.9 / 29.7 seconds,
125.16 seconds total process time, exit 0). The controlled slow-redraw and
negative-control checks are in progress; this is a draft checkpoint.

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
