# #1024 — interior movement picking

Runtime before: `9d9ea012e97292ae3f96e2500f1609a1cfdbf412` (v0.2.15).
Runtime after and test recipe: `e872b1714994065e5ee97b7aa9e401ac7eee5aab`.

The same real right click on the highlighted doorway sent unit-2 to pavement on the baseline. After the fix, the squad crosses the doorway, continues inside, and a second squad crosses the doorway with the building uncut. Persisted unit coordinates and rendered feet are asserted after every successful click. The videos and PNGs are unmodified browser output.

## Recipe

`CI=1 CAPTURE=1 pnpm test:e2e e2e/interior-movement.spec.ts --repeat-each=2`

Chromium/SwiftShader, 1280×720, new campaign seed 4242, Johannesburg. The test resumes the generated map with unit-1 at `(12,2,25)`, unit-2 at `(10,2,29)` and unit-3 at `(10,2,28)`, recomputing normal initial vision. The building-3 east entrance `(9,2,29)` must still be unexplored. The mech is outside the doorway ray because unit picks retain priority. No movement is invoked through test hooks: hooks select the unit, set the floor view and project the tile; Playwright delivers right clicks.

The before run executes this same spec against the clean baseline server at port 4201, with its own Vite cache and watcher disabled, no Playwright webServer, one worker and zero retries. CI assertion allowances are unchanged. Its expected failure is the actual wrong position, not a timeout during fixture setup. Asset warnings and browser errors are checked after both model loads and recorded for the click sequence.

## Mechanism and controls

Retired invisible placeholder wall meshes remained in the recursive CPU raycast. Excluding them alone was insufficient: visible walls and shader-cut roofs can still intercept a logical floor destination. The picker now intersects the full surfaces of exactly the tiles that supply the displayed movement range, nearest eligible floor first; hidden floors remain excluded. Ordinary picks use visible geometry.

[Director's ruling](https://github.com/BenjaminBenetti/tut/issues/1024#issuecomment-5593167325) permits a highlighted, legally reachable unexplored tile. The unit regression proves the same fogged pointer is refused without its movement highlight, plus a different unhighlighted fog tile is refused with the movement range present. It also checks physical-roof fallback, nearest eligible floor and hidden-floor exclusion. Existing unit/spawner input-priority tests remain green.

The fixed test's third move uses the fully uncut view and does not depend on pointer-follow reveal. The initial frame is the visual control; the click traces and failure-capable assertions are the behavioral proof.

## Recorded result

| Click | Intended tile | Before actual | After actual |
| --- | --- | --- | --- |
| unit-2, ground view, doorway | `(9,2,29)` | `(10,2,30)` | `(9,2,29)` |
| unit-2, ground view, deeper interior | `(8,2,29)` | Not reached after failing doorway assertion | `(8,2,29)` |
| unit-3, uncut view, doorway | `(9,2,29)` | Not reached after failing doorway assertion | `(9,2,29)` |

Two before repeats fail on the wrong persisted position; two after repeats pass with zero retries/flakes. Each sequence has empty browser/asset diagnostics. [All four run records](run-records.jsonl) retain the actual coordinates and frame hashes. [Proof manifest](proof.json) pins runtime, test commit and artifact hashes. Repeat frames are byte-identical within each revision, so one copy of each frame and one video per revision are retained.

- Raw videos: [before](before/video.webm), [after](after/video.webm).
- Same initial scene: [before control](before/before.png), [after control](after/before.png). These PNGs are byte-identical, SHA-256 `d3f9cd4521d10e09adf3886b35848371f6d43430813d96c57bb7a5775286bf58`.
- Doorway result: [wrong pavement move before](before/failed-move-1.png), [correct doorway move after](after/move-1.png).
- Further successful moves: [inside](after/move-2.png), [second squad, uncut building](after/move-3.png).

All six retained frames were visually inspected. No image masks, tolerances, edits or renderer freezes are used. This is a dated evidence record, not a golden-image assertion against historical files; the executable test asserts movement and rendered arrival.

Validation: typecheck, lint and build pass; 2,266 unit tests pass with one existing skip (`pnpm test --maxWorkers=4`). `pnpm test:sim` passes 7/7 before (196.55 s) and after (206.20 s). Targeted map/builder tests pass 51/51; input-priority controls pass 19/19. The highlighted-floor unit case was red against physical roof picking, and its unexplored-target assertion was separately red before implementing the Director's fog ruling.

Earlier diagnostic runs are excluded from the recorded repeat result: one baseline attempt timed out loading models with local assertion allowances, and an earlier after repeat suffered an unexpected Vite reload while a second server shared its dependency cache. The recorded comparison uses isolated baseline cache/watch settings; no assertion budget was changed to hide a failed move.
