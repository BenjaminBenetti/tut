# #849: J3 three-sided concavity

## First decision: the diagonal does not cover it

Re-rendered from current main `4244675` (after #862 and #866), before changing
any model or scene mapping. Seed `hills-1`, snowy/rural/medium, `slope=100`,
models and units enabled; target `(10,3,29)`. The current crop is 600 × 600 at
140 screen pixels per tile, matching the catalogue's capture scale.

| Original catalogue (`f4557b4`) | Current main (`4244675`) |
| --- | --- |
| ![Original J3](../813/shots/J3-gully.png) | ![Current J3](before/three-high-j3.png) |

The narrow dark slot remains. The diagonal piece covers **none** of this
configuration: the target has no `Tile.slope`, resolves to `tile.ground.rock`,
and receives no diagonal or transition appearance. Its opening tile also
receives none; there are zero diagonal appearances on this whole map.
[Current target, opening and eight neighbours](before/neighbourhood.json).

The three high orthogonal neighbours are north, west and south; the opening
is east. A monotone diagonal plane cannot meet three high sides while keeping
a low opening. This needs a concave surface. The Director's latest instruction
authorises cutting it after this comparison is posted; the earlier
accepted-for-now ruling is superseded for this task.

Map scale and prop placement have changed since the original catalogue; the
same terrain slot is still visible at the recorded coordinate. The new image
is a fresh Map Lab render, not the unchanged control from #848.
