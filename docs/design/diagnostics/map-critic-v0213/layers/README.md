# Current-main layer controls — visual re-check in progress

Baseline **`d0837c613c524e718697ed0f6c32c831e1b9aac3`**, including #961's
storey controls and #978's per-building hillside cut. These five fresh
native screenshots have been opened. The first angle shows a discrepancy
at the upper limit; a second-angle check is in progress before the verdict.

Preserve the useful floor views: at 1 / 5, room boundaries, a corridor,
furniture and stairs are visible. One up reaches 2 / 5 and exposes the next
furnished floor; one down from the top reaches 4 / 5. Streets and ground
remain visible, giving the player context.

**The upper-limit control does not preserve the initial picture.** L1 starts
with an intact tower roof at 5 / 5. Pressing `]` once leaves the readout at
5 / 5 but removes the roof in L2. This is a visible roof/room change, not
merely an assertion about differing screenshot hashes. The pointer stays
outside the scene. No cause is inferred from generator or rendering code.

## Reproduction

Start a new campaign with seed **4242**, advance one day, enter the first
mission (**Johannesburg**, `mission-1`, mission seed **1127010053**).
This is the production tactical screen and its existing capture launch hook;
no save or map data was edited. The map is 48 × 48, 14 engine layers.

Frame the five-storey tower near tile **(3, 2, 26)**; its roof reference is
**(3, 12, 26)**. The viewport is 1800 × 1200. The camera was panned using
ordinary keyboard input, measured against the existing tile projection hook.
It stays fixed between L1–L5. The sidecars record the actual projection,
readout, input sequence, page errors and SHA-256. Move the pointer to
(0, 1199), outside the tactical scene, and wait 20 rendered frames after
input before capturing.

| Frame | Input since preceding frame | Readout | Visible result |
|---|---|---|---|
| [L1](L1-top.png) | Initial view | 5 / 5 | Roof intact. |
| [L2](L2-top-after-up.png) | `]` once | 5 / 5 | Roof removed despite unchanged upper-limit readout. |
| [L3](L3-one-down.png) | `[` once | 4 / 5 | One complete storey lower, rooms exposed. |
| [L4](L4-ground.png) | `PageDown` five times | 1 / 5 | Ground-floor rooms and stairs exposed. |
| [L5](L5-one-up.png) | `]` once | 2 / 5 | Next furnished floor exposed. |

Each PNG has an adjacent JSON with the same stem. Earlier failed-framing
pilots are excluded; they do not establish a game defect. This is a visual
re-check, not #996's repeated-run reproducibility certification, not an
above-cut-unit test (#981), and not a new version of the owned hillside issue.
