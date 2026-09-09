# Merged #1032: steady roofs with squad reveal preserved

Fresh main `166876d670ddfdfa81bb03c65abd952a9aae3f5f`, captured 9 September
2026 UTC after restarting the isolated server. This is the deliberate #1023
pointer-removal check, separate from the earlier v0.2.15 survey and historical
pointer-feature acceptance.

## What the picture says

**The merged result follows the ruling and preserves the useful squad view.**
All 20 fresh frames were individually opened. The roof stays intact while
only the pointer moves. With two squads inside, the broad opening exposes
room walls, furniture and space between units from both camera sides.
Moving the pointer across that view no longer shifts or extends the opening.
When both squads leave, the complete roof and building silhouette return.
The flat roof's permanent stair opening remains present in its closed state.

For each of the four scenes, closed/hover/restored PNGs are byte-identical;
the squad and mouse-over-squad PNGs also match. Those checks support what
was inspected in the frames. They are bounded fixture controls, not general
movement, fog, layer or interior-lighting certification. The accepted radius
4 / opacity floor 0.175 remains the actual fixture readout in every capture.

The interior palette remains dim and the faded edges visibly stippled.
That limitation was present in the earlier accepted setting and is preserved
in this verdict; it does not reopen the Executive Director's radius or
pointer-removal decision. [Earlier dated pointer/squad record](../map-critic-v0213/cutaway/README.md).

## Reproduce

Open `/tools/art/preview/roof-cutaway.html?roof=pitched&units=0&yaw=0`.
Change only the listed roof, yaw or unit count for each control. No radius,
opacity or scene overrides are passed. Models are the production assets;
slope 100%, all levels, 80 pixels per world unit, native 1200 × 950 PNGs.
The fixture centres the primary tile at its top plus 0.7 world units.

| Roof | Seed | Biome / settlement / size | Primary squad tile | Second squad tile |
|---|---|---|---|---|
| Pitched | `mc-opening-01` | temperate / rural / small 48² | (24,4,15) | (21,4,11) |
| Flat | `mc-opening-02` | temperate / town / small 48² | (25,6,14) | (23,6,11) |

Yaw 2 is two quarter-turns from yaw 0. In each scene:

1. **open-ground:** no squads, pointer (15,475).
2. **hover:** no squads, pointer moves to (600,475).
3. **squad-two:** reload with two squads, pointer (15,475).
4. **overlap:** squads remain, pointer moves to (760,405).
5. **all-left:** pointer (15,475), press `L` to move diagnostic squads away;
   wait for the fixture's `left` readout. Original coordinate/count dataset
   remains static; sidecar `units: 0` records the actual final input state.

Wait 20 rendered frames after each input. Sidecars contain capture timestamps,
actual fixture readout, runtime trees, input positions, hashes and errors.
The pointer is real mouse input; no replacement shader state is used.

## Frames

| Scene | Closed | Hover only | Two squads | Mouse over squad scene | Squads leave |
|---|---|---|---|---|---|
| pitched-yaw0 | [open-ground](pitched-yaw0-open-ground.png) | [hover](pitched-yaw0-hover.png) | [squad-two](pitched-yaw0-squad-two.png) | [overlap](pitched-yaw0-overlap.png) | [all-left](pitched-yaw0-all-left.png) |
| pitched-yaw2 | [open-ground](pitched-yaw2-open-ground.png) | [hover](pitched-yaw2-hover.png) | [squad-two](pitched-yaw2-squad-two.png) | [overlap](pitched-yaw2-overlap.png) | [all-left](pitched-yaw2-all-left.png) |
| flat-yaw0 | [open-ground](flat-yaw0-open-ground.png) | [hover](flat-yaw0-hover.png) | [squad-two](flat-yaw0-squad-two.png) | [overlap](flat-yaw0-overlap.png) | [all-left](flat-yaw0-all-left.png) |
| flat-yaw2 | [open-ground](flat-yaw2-open-ground.png) | [hover](flat-yaw2-hover.png) | [squad-two](flat-yaw2-squad-two.png) | [overlap](flat-yaw2-overlap.png) | [all-left](flat-yaw2-all-left.png) |
