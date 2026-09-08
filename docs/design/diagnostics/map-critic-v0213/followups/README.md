# Continued Map Lab findings — v0.2.13 follow-up

Captured on main `5cead6e9d5ec656ddba95b41c63ec29d77818ade` with the shipped
models, slope 100%, preview units on, initial level label **all**.
These are native PNG captures, with no scene retouching. Every published
frame was opened. Sidecars preserve the URL, camera anchor, actual scale,
viewport and crop; the UI controls are recorded separately where shown.

## Open water shows regular tile seams

Preserve the clear blue water/land distinction and the purposeful paved,
railed waterfront already accepted under #915. Open water should read as a
continuous surface between those banks.

Fine, evenly spaced lines instead divide the water into a grid. The second
camera makes them much stronger: dark dashed lines cross the same blue water,
well away from a shoreline or a change of material. They are visible at the
ordinary 55-pixel tile spacing used for the fence checks, without enlarging
the screenshot. The first angle is included because the effect is subtler
there. This is a surface-continuity finding, below the live ground-material,
trail and building-use findings in priority. I cannot assign its cause by eye.

Recipe: **`mc-opening-01`, coastal, rural, small (48 × 48)**. Open
`/mapgen-preview.html?seed=mc-opening-01&biome=coastal&settlement=rural&size=small&models=1&units=1&slope=100`.
Focus on tile **(40, 0, 4)** at 55 pixels per tile. S1 uses the initial camera
direction; S2 rotates clockwise once with `E`. Move the pointer out of the
scene and retain the **all** level label. Both use a 2400 × 1500 viewport
and a native 1200 × 1000 crop; exact pixel offsets are in their sidecars.

| View | Render | Reproduction | Whole UI |
|---|---|---|---|
| S1, initial side | [PNG](S1-water-surface.png) | [JSON](S1-water-surface.json) | [PNG](S1-water-surface-ui.png), [controls](S1-water-surface-ui.json) |
| S2, one rotation | [PNG](S2-water-surface.png) | [JSON](S2-water-surface.json) | [PNG](S2-water-surface-ui.png), [controls](S2-water-surface-ui.json) |

The same impression is visible in the already committed
[G2 shore-side context](../fences/G2-garden.png) and, more faintly on another
seed, [W1 city waterfront](../fences/W1-waterfront-control.png).
This does not duplicate #945: that issue concerns contacts between different
natural ground materials; the lines here occur inside one expanse of water.
No generator implementation was inspected and no prevalence count is claimed.
