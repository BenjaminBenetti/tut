# #937: building cutaway radius comparison

Art Director: Codex, gpt-6-astra xhigh. Baseline `2878dfc` (v0.2.12).

The Executive Director requested a larger working reveal after #916 connected
the missing `uGhostStrength` shader uniform. This is the first tuning pass on
the functioning effect. The comparison uses the accepted #916 interior scene
and camera, with the production TacticalSceneBuilder, GhostController and
SceneService; Map Lab sample units do not run the controller.

## Recommendation

**Ship radius 3**, up from 2. It reveals the squad's room edges, nearby furniture
and corridor context while retaining substantial solid roof sections. The
radius grows by 50%; the circular window's area grows by 125% before clipping
against geometry. This is a visible enlargement even though it stops short of
the Executive Director's initial doubling suggestion.

Radius 2 exposes the squad and a few nearby objects. Radius 4 is useful for a
single squad, but two separated squads reveal most of the house's upper floor;
the roof becomes chiefly an outer strip and corners. Radius 5 loses more roof
and facade for little extra tactical information. Radius 3 gives the better
balance in both roof kinds and from the opposite camera. The overlapping
windows form one readable area without an extra-transparent intersection.
The Director judges these frames before Tech Lead merge.

This changes only the runtime radius, held in `GHOST_RADIUS` in
`TacticalSceneBuilder`. Lighting stays as accepted in #916; the Director's
request to assess interior brightness during play remains separate.

## Fixed conditions

All frames are 1200×950 at 80 pixels per world unit, camera yaw 0, all levels,
normal production lighting/shadows. One tile is one world unit. Radius is
measured across the camera view plane, not as a ground-space circle.

| Scene | Map | Primary squad | Second squad | Camera target |
| --- | --- | --- | --- | --- |
| Pitched house | `mc-opening-01`, temperate/rural/small, slope 100% | `(24,4,15)` | `(21,4,11)` | primary tile centre, `tileTop(4) + 0.7` |
| Flat apartment | `mc-opening-02`, temperate/town/small, slope 100% | `(25,6,14)` | `(23,6,11)` | primary tile centre, `tileTop(6) + 0.7` |

Coordinates use half-height map layers (0.75 u). Both squads are in the same
building on clear floor tiles. The camera remains centred on the primary
squad in the two-unit case. The house positions are five ground units apart;
the apartment positions are sqrt(13), about 3.6, apart. Their projected reveal
windows overlap. Both are real visible squad models using the usual source
for ghost centres; no extra lights or map edits.

Opacity floor **0.35**, edge softness **0.65 u inward**, fade time **0.15 s**,
fragment depth comparison, eight-centre limit and visibility source are fixed.
Overlaps take the minimum alpha, so they extend the revealed region without
multiplying transparency at the intersection.

## Frames

| Case | Current 2 | Alternative 3 | Doubled 4 | Larger 5 | Controller off |
| --- | --- | --- | --- | --- | --- |
| pitched, 1 squad(s) | [2](pitched-1-radius-2.png) | [3](pitched-1-radius-3.png) | [4](pitched-1-radius-4.png) | [5](pitched-1-radius-5.png) | [closed](pitched-1-radius-off.png) |
| pitched, 2 squad(s) | [2](pitched-2-radius-2.png) | [3](pitched-2-radius-3.png) | [4](pitched-2-radius-4.png) | [5](pitched-2-radius-5.png) | [closed](pitched-2-radius-off.png) |
| flat, 1 squad(s) | [2](flat-1-radius-2.png) | [3](flat-1-radius-3.png) | [4](flat-1-radius-4.png) | [5](flat-1-radius-5.png) | [closed](flat-1-radius-off.png) |
| flat, 2 squad(s) | [2](flat-2-radius-2.png) | [3](flat-2-radius-3.png) | [4](flat-2-radius-4.png) | [5](flat-2-radius-5.png) | [closed](flat-2-radius-off.png) |

Opposite camera (yaw 2), same two units and zoom:

| Roof | Current 2 | Chosen 3 | Doubled 4 |
| --- | --- | --- | --- |
| Pitched | [2](pitched-2-radius-2-yaw2.png) | [3](pitched-2-radius-3-yaw2.png) | [4](pitched-2-radius-4-yaw2.png) |
| Flat | [2](flat-2-radius-2-yaw2.png) | [3](flat-2-radius-3-yaw2.png) | [4](flat-2-radius-4-yaw2.png) |

[Chosen radius after the squad leaves](pitched-1-radius-3-unit-left.png).
[Empty pitched control](pitched-empty-closed.png), [empty flat control](flat-empty-closed.png).

[Doubled-radius roof after the squad leaves](pitched-1-radius-4-unit-left.png).
The capture asserts that it returns to the byte-identical controller-off frame.

## Reproduce

```sh
pnpm exec vite --config tools/art/preview/capture-vite.config.mjs --host 127.0.0.1 --port 4199 --strictPort
node tools/art/preview/capture-cutaway-radius.mjs
node tools/art/preview/capture-cutaway-radius.mjs --rotated
node tools/art/preview/verify-cutaway-radius.mjs 3
```

`CAPTURE_BASE_URL` may point at another local Vite port. The capture-only page
accepts `roof=pitched|flat`, `units=0|1|2`, `radius=N`, `yaw=0|2`, and `ghost=0|1`; without a
radius override it uses the runtime default. No product controls are added.
[captures.json](captures.json) records the exact URLs, positions, live radius
and active ghost count. The script fails if an active controller changes no
pixels, a squad stands on a prop, or the doubled reveal fails to close.

## Verification

The four single-unit baseline controls (radius 2 and controller off, for both
roofs) are byte-identical to the accepted #916 frames: zero changed pixels.
[Exact hashes and pixel differences](comparisons.json) measure image impact,
not the percentage of roof geometry revealed.

The runtime verification loads the page without a radius override. It requires
all four one/two-squad frames to match the chosen candidate byte for byte,
then removes the units and requires the closed frame to match an empty building
with the controller disabled. Equal occupancy matters: the second flat-roof
squad contributes one pixel at `(653,293)` even with ghosting disabled. Comparing
its removal to a frame that still contains it incorrectly failed closure by
that one pixel. No pixel tolerance is used.

Typecheck, lint, build, 2,167 unit tests (one skipped), seven simulation tests,
and 59 browser tests (27 opt-in skips, zero flaky) pass. The runtime verification passes all four candidate/closure pairs with exact
byte equality; [runtime.json](runtime.json) records each result. Both final
runtime and rotated capture commands exit cleanly.

Both seed-4242 fog frames are regenerated and opened. They are byte-identical
to fresh captures from current main `e014ab1`, which contains generation changes
landed after the previously tracked fog frames. The refreshed tracked PNGs
therefore change, but radius 2 versus 3 on the same current map changes zero
pixels in these open-street controls. [Tracked and fresh-baseline comparisons](fog-comparisons.json).

Long diagnostic captures use a dedicated Vite server with file watching/HMR
disabled: shared pnpm-store updates otherwise reload the page during a shot.
Two early terminal captures ended with SIGTERM; the opposite-camera retry
completed cleanly. Use a terminal with a PTY for long captures. This was not a
provider capacity failure.
