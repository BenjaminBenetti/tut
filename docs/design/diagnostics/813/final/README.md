# #813 — final pass: the verdict

**This is a verdict, not a catalogue.** Measured on `main` at **`4244675`**, with #853,
#862 and #866 all landed. Counts use the same method as the rescale delta
(`../rescale/README.md`), bounds-checked, same 108 `qa813` seeds, `slopeShare` 1, so the
three columns below are directly comparable.

## The answer to the Executive Director's question

> **Do the ramps read smooth everywhere, corners included?**

**Nearly everywhere, and the two exceptions are both narrow and named.**

A hillside now ramps continuously where it used to stop dead at a plot; straight runs,
single corners and terrace edges all read smooth; **95.6 %** of every one-layer step in
the game carries a wedge, up from 88.7 %. The two places it still does not read smooth:

1. **About two dozen two-corner diagonal chains per 108 maps still draw the old piece** —
   the new diagonal model reaches every 4-chain and most 3-chains, but only 28 of the 76
   tiles in 2-chains. What is left there is a **visible crease**, not the full-depth
   battlement of the original report.
2. **Ramp connectors are still drawn with an untextured placeholder plank**, and #866
   scaling it to span a two-layer rise has made it far more prominent: where a carriageway
   drops a storey, three grey slabs now stand in the road. The *hole* is fixed; what fills
   it is a placeholder.

Neither is a corner-geometry failure of the kind the Executive Director photographed.
The first is a residue of it; the second is art that was never cut.

---

## Verdict by class

| | before (new scale) | after | verdict |
|---|---:|---:|---|
| **J1** consecutive outer corners | chains: 24×2, 3×3, 1×4 | same chains, diagonal piece on 41 of 92 chain tiles | **partly fixed** |
| **J2** lot margin and its siblings | 5,371 | **141** | **fixed** — 2.6 % remaining |
| **J3** three or more high sides | 522 | **522** | **unchanged**, as ruled (#849) |
| **K1** one-layer paved kerb | 1,003 | 1,168 | **untouched**, correct |
| **K2** paved edge of 2+ layers | 7,360 bare | **`barePavedEdges` = 0** | **fixed**, with a caveat |
| **N1** narrow channels | not a defect | not a defect, and improved | **not a defect** |
| one-layer steps carrying a wedge | 88.7 % | **95.6 %** | |

### J1 — partly fixed

#862 works at the graphics layer: `tile.slope.diagonal` is selected for *aligned* corner
chains. Coverage, resolving models over all 108 maps:

| chain length | tiles | take the diagonal piece |
|---:|---:|---:|
| 1 (isolated — must stay `outer`) | 1,694 | 0 ✔ |
| 2 | 76 | **28** |
| 3 | 12 | **9** |
| 4 | 4 | **4** ✔ |

Isolated corners correctly keep the old piece — the S2 control from the first catalogue
still holds. The 4-chain, the worst case in the game, is fully covered. **What is left is
48 tiles across roughly two dozen 2-chains whose corners are not aligned**, which keep
`tile.slope.outer` and therefore keep the notch.

`shots/V1-chain-covered-labelled.png` — a 2-chain that **does** take the diagonal piece
(`qa813-temperate-rural-medium-1`, `(60,1,28)` and `(59,2,29)`): the dirt runs as **one
continuous plane** across both tiles, no seam.

`shots/V2-chain-uncovered-labelled.png` — a 2-chain that **does not**
(`qa813-temperate-rural-medium-1`, `(7,2,31)` and `(6,2,32)`): the two wedges meet along a
**visible diagonal crease**.

**Severity, stated fairly:** the uncovered residue is a crease, not the full-depth
battlement of the original report. The surface is continuous; it just folds where it
should be flat. That is a long way from what the Executive Director photographed, and it
is why the verdict above is "nearly everywhere" rather than "no".

### J2 — fixed

`shots/V3-J2-after-labelled.png`, on the exact coordinates filed on #847
(`qa813-temperate-rural-small-0`, `(17,1,16)` `(19,0,18)` `(20,0,20)`). Where the first
catalogue showed square-cornered blocks of earth, the grass now ramps continuously: shallow
creases between wedges, no vertical faces, no notches. Compare `../shots/J2-lot-margin-detail.png`.

Lot margin **2,771 → 31**; inland unwalled **2,266 → 74**; unpaved-beside-paved **334 → 36**.

### J3 — unchanged, as ruled

522 tiles before and after. #849 is deferred behind #862 by the Director's ruling; the
Art Director should now check whether the diagonal piece covers it.

### K1 — untouched and correct

`shots/V4-K1-kerb-after-labelled.png`, same coordinate as the rescale exhibit
(`qa813-temperate-town-small-0` `(33,2,10)`). The sidewalk still steps down one layer with
a clean vertical face and still reads as a kerb. **#866 was right to leave these alone.**

The count rose 1,003 → 1,168 because the other two fixes changed which tiles carry wedges,
not because anything regressed in kind.

### K2 — fixed, and the caveat matters

**`barePavedEdges` is 0 across all 108 `qa813` maps** — none of which are the `sweep-*`
seeds the invariant is pinned on, so the invariant holds outside its own pin.

At the exact coordinate from the rescale exhibit — `qa813-temperate-town-small-0`,
road tiles `(32,2,11)` `(32,2,12)` `(32,2,13)` — the void is gone. The generator now puts
**three ramps there, one per lane**:

```
  ramp 32,2,11 -> 31,4,11
  ramp 32,2,12 -> 31,4,12
  ramp 32,2,13 -> 31,4,13
```

**But look at `shots/V5-K2-after-labelled.png`.** Those three ramps draw as **large
untextured grey slabs standing out into the carriageway**, because a ramp connector has
no art and is still drawn with the placeholder plank from `tactical-map-view.ts` — the
one I reported on #748 in September and which was never routed. #866 scaling the plank to
span the rise did exactly what it says; at two layers the placeholder is simply much
bigger than it used to be.

So: **the defect I filed is fixed, and a placeholder is now conspicuous in its place.**

### N1 — still not a defect, and better than it was

`shots/V6-N1-after-labelled.png`, same coordinate as the first catalogue
(`qa813-temperate-rural-large-0` `(54,1,33)`). The battlement read is largely gone: the
channel walls that used to be sheer now carry wedges, because #853 gave them to the bare
tiles either side. I said no new geometry would help here and that stands — what helped
was the placement fix, not a new piece.

---

## #869 item 2 — is the parapet drawn across the ramp, or does the ramp pass through a gap?

**Across it. There is no gap. It is a visual defect.**

`shots/V8-ramp-through-parapet-labelled.png` · `shots/V8-ramp-through-parapet-detail.png`

```
/mapgen-preview.html?seed=qa813-temperate-city-small-0&biome=temperate&settlement=city&size=small&slope=100&models=1&units=1
```

`qa813-temperate-city-small-0`, temperate/city/small — ramp **`(32,2,4)` → `(32,4,5)`**,
climbing two layers from the grass onto the city plat.

Three independent lines agree, which is why I am stating it flatly:

1. **The data.** The head tile `(32,5)` carries a `half` wall on its **north** edge — and
   north is precisely the edge the ramp crosses. The patch, capitals marking half walls:
   ```
            28   29   30   31   32   33   34   35   36
    z=  5   2g   2g   2g   2d 4SNW  4SN  4SN  4SN 4SNE
    z=  6   2g   2g   2d   2d  4SW   4S   4S   4S  4SE
   ```
2. **The code.** `resolveWalls` in `map-model-resolver.ts` iterates `tile.walls` and never
   consults `map.connectors`, so every wall in the data is drawn. The elevation pass says
   so in as many words: *"a connector joins its two tiles directly and does not consult the
   wall between them, so the ramp pass punches through the rail"* — that is about movement,
   and nothing removes the rail from the drawing.
3. **The frame.** The parapet along the plat edge is a continuous post-and-rail run with
   evenly spaced posts and unbroken rails. **No break appears anywhere along it**, at the
   ramp mouth or elsewhere.

So the route works and the picture does not: a unit walks up the ramp and straight through
a railing. On my 108 maps this is **2,046 ramps** (the Tech Lead counted 2,112 on theirs),
all on city maps, all at plat parapets.

**Honest limit on the frame:** the ramp approaches from below and behind the plat, so it is
hidden from this camera angle — the frame proves the parapet is unbroken, not that the
plank passes through it. The data and the code supply that half.

---

## Adjacent, measured, and outside every issue

**The ramp connector still has no art.** Every "after" frame in this pass has a grey
untextured plank in it somewhere. It is the oldest open thing in this whole thread — I
raised it on #748 on 5 September, it was never filed, and #866 has now scaled it up to
span two layers. It is the single biggest remaining eyesore on a fixed hillside, and it
is not J1, J2, J3, K1, K2 or N1.

**Unpaved edges of two or more layers: 9,976, of which 4,432 have no wall and no
connector.** #866 walls the *paved* ones only. Whether a natural bank should have a
retaining wall is a design call and I am not making it — terrain is allowed to have
cliffs in a way a carriageway is not. Recorded because it is the other half of the
population #866 addressed.

## Limits

- `settlement` archetype only; top ground layer of each column only.
- Verdicts are mine, from the frames. The Director judges the crops.
- Counts are from the frozen map, not the draft. Where a draft-derived count disagrees,
  the draft wins — see the rescale delta §0 for why that rule exists.
