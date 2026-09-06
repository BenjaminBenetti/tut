# #813 — closing pass

Confirmation, not a catalogue. Measured on `main` at **`055c1d5`**, gated green (typecheck, lint, build; unit 2097; sim 7; e2e 59), with #853, #862,
#866, #874 and #879 all landed. Same method as the two runs before it, same 108 `qa813`
seeds, `slopeShare` 1.

## 1. No placeholder connector renders anywhere

The specific thing that blocked the tag. Resolving models for every connector on all 108
maps:

| | count | drawn as |
|---|---:|---|
| ramps | **3,779** | **all 3,779 take `RAMP_CONNECTOR_MODEL`** — materialled, none left to a plank |
| stairs | 1,651 | the stairs tile's own model since #766 |
| ladders | **166** | **still an untextured rung** |

**Zero ramps and zero stairs fall back to a placeholder.** The one class that still does
is the **ladder**, 166 of them, which `tactical-map-view.ts` says outright ("Ladders
stay") and which no issue in this thread ever covered.

## 2. The re-shoots

`shots/W1-V5-after-labelled.png` — the exhibit V5 coordinates,
`qa813-temperate-town-small-0`, road tiles `(32,2,11)` `(32,2,12)` `(32,2,13)`. The three
grey slabs are gone: one continuous asphalt ramp spans the full carriageway, in the road
material, with the surface texture and lane markings carrying across it.

`shots/W2-ground-ramp-labelled.png` — a ground ramp,
`qa813-temperate-rural-small-0`, `(8,2,8)` and `(9,2,8)` rising two layers to `(8,4,7)`.
Continuous dirt in the terrain's own material, no plank.

## 3. The six classes, final

| | first catalogue | rescale | **closing** | verdict |
|---|---:|---:|---:|---|
| one-layer steps carrying a wedge | 87.1 % | 88.7 % | **95.6 %** | |
| **J1** consecutive outer corners | chains 4×3, 15×2 | 1×4, 3×3, 24×2 | diagonal piece on 4/4, 9/12, 28/76 | **fixed**, remainder accepted (#876) |
| **J2** lot margin and siblings | 2,512 | 5,371 | **141** | **fixed** |
| **J3** three or more high sides | 289 | 522 | 522 tiles, **173 take `tile.slope.three-sided`** | **partly covered** |
| **K1** one-layer paved kerb | 545 | 1,003 | 1,168, untouched | **correct as-is** |
| **K2** paved edge of 2+ layers | — | 7,360 bare | **`barePavedEdges` = 0** | **fixed** |
| **N1** narrow channels | not a defect | not a defect | not a defect | **accepted** |

#876 is closed as not-a-bug: the 48 uncovered chain tiles are same-level opposite-corner
saddles, not climbing chains, and the forced fit rendered worse. **Counted as accepted,
not as an open defect.**

`barePavedEdges` is 0 across all 108 seeds, none of which are the `sweep-*` seeds the
invariant is pinned on.

## 4. Do the ramps read smooth everywhere, corners included?

**Yes.**

Every ramp on every one of these maps is drawn in the material of the ground it belongs
to. Hillsides ramp continuously into plots. Corners form one plane where they climb, and
where they do not the crease is a ruled, deliberate saddle. 95.6 % of one-layer steps
carry a wedge and no paved edge of two layers ships bare.

Two things are true and neither is a ramp reading rough:

- **166 ladders still draw an untextured rung.** A ladder is not a ramp and was never in
  scope here; naming it so the "no placeholder connectors" claim is exact.
- **J3 is a third covered** — 173 of 522 three-sided tiles take the new gully piece; the
  rest still draw a flat slab. My bucket may be wider than the piece's target, so treat
  it as a pointer for #849's owner rather than a verdict on their work.
