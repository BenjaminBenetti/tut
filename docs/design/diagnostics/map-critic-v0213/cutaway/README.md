# Merged cutaway re-check: squad radius and pointer inspection

**The picture still improves on main `5cead6e9d5ec656ddba95b41c63ec29d77818ade`.**
All 24 fresh frames were opened: pitched and flat roofs, two camera sides,
with separate pointer, squad and closure controls. This baseline includes
#937's chosen squad radius 4 / opacity floor 0.175 and merged #947 pointer
inspection. No tuning overrides were passed.

## What the frames say

Preserve the complete building silhouette while nobody is inspecting it.
Hovering opens a useful local view into the floor plan; moving onto open
ground restores the roof. Two nearby squads reveal a broader, readable area
of corridor, room walls and furniture. The second camera confirms the view
is useful from the other side, rather than being a fortunate front angle.

Pointer/squad overlap can extend that opening to an adjacent room. This is
clearest in both yaw-2 views and the flat yaw-0 view. In pitched yaw 0 the
pointer falls mostly within the already broad squad opening, so that pair
adds little visible area; it is not used to claim an additional-room benefit.
Moving the pointer away and moving both diagnostic squads out restores the
intact roof on all four scenes.

The interior palette remains dim and stipple remains visible. Some outside
ground shows through at the faded near-wall edge; that is the accepted #947
edge/depth tradeoff, not new grounds here to reverse the chosen cutaway.
These frames establish visibility and closure in these controls, not general
interior-lighting approval or a full gameplay/LOS test.

## Exact reproduction

Use the production cutaway capture page:
`/tools/art/preview/roof-cutaway.html?roof=pitched&units=0&yaw=0&pointer=1`.
Change only `roof` to `flat`, `yaw` to `2`, or `units` to `2` for each listed
control. `pointer=1` enables the fixture's real mouse input. It uses the
shipped pointer parameters; it is not a radius/opacity override.

| Roof | Map recipe | Primary squad tile | Second squad tile |
|---|---|---|---|
| Pitched | `mc-opening-01`, temperate, rural, small 48² | (24, 4, 15) | (21, 4, 11) |
| Flat | `mc-opening-02`, temperate, town, small 48² | (25, 6, 14) | (23, 6, 11) |

Models are the production assets, slope is 100%, all levels are present.
The fixture uses 80 pixels per world unit and centres the primary tile at
its top plus 0.7 world units. Captures are native 1200 × 950 PNGs. Yaw 2
is two quarter-turns from yaw 0. Sidecars record the URL, actual fixture
readout, pointer location and SHA-256, with no page errors.

The six states in each row are sequential within the same camera recipe:

1. **open-ground:** no diagnostic squads; mouse at (15, 475).
2. **hover:** no diagnostic squads; mouse at (600, 475).
3. **pointer-left:** mouse returns to (15, 475).
4. **squad-two:** reload with two squads; mouse at (15, 475).
5. **overlap:** those squads remain; mouse at (760, 405).
6. **all-left:** mouse returns to (15, 475); press `L` to move the diagnostic
   squads away. The fixture's `left` readout confirms the command. Its original
   squad-count/coordinate dataset remains static; the sidecar's `units: 0`
   describes this final input state, not a rewritten fixture dataset.

Wait 20 rendered frames after each input before the screenshot. The mouse
is the only pointer source; no synthetic shader state is substituted.

| Scene | Open ground | Hover only | Pointer leaves | Two squads | Combined | All leave |
|---|---|---|---|---|---|---|
| pitched-yaw0 | [open-ground](pitched-yaw0-open-ground.png) | [hover](pitched-yaw0-hover.png) | [pointer-left](pitched-yaw0-pointer-left.png) | [squad-two](pitched-yaw0-squad-two.png) | [overlap](pitched-yaw0-overlap.png) | [all-left](pitched-yaw0-all-left.png) |
| pitched-yaw2 | [open-ground](pitched-yaw2-open-ground.png) | [hover](pitched-yaw2-hover.png) | [pointer-left](pitched-yaw2-pointer-left.png) | [squad-two](pitched-yaw2-squad-two.png) | [overlap](pitched-yaw2-overlap.png) | [all-left](pitched-yaw2-all-left.png) |
| flat-yaw0 | [open-ground](flat-yaw0-open-ground.png) | [hover](flat-yaw0-hover.png) | [pointer-left](flat-yaw0-pointer-left.png) | [squad-two](flat-yaw0-squad-two.png) | [overlap](flat-yaw0-overlap.png) | [all-left](flat-yaw0-all-left.png) |
| flat-yaw2 | [open-ground](flat-yaw2-open-ground.png) | [hover](flat-yaw2-hover.png) | [pointer-left](flat-yaw2-pointer-left.png) | [squad-two](flat-yaw2-squad-two.png) | [overlap](flat-yaw2-overlap.png) | [all-left](flat-yaw2-all-left.png) |

Each PNG has an adjacent JSON with the same stem. The previous radius-2/
radius-4 comparison remains in [the post-#937 evidence](../../map-critic-post937/README.md).
This pass confirms the chosen merged setting alongside the newly shipped
pointer feature; it does not repeat or replace that earlier comparison.
