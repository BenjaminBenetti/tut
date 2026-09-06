# #813 — terrain ramp catalogue

**QA audit, requested by the Director after the Executive Director played v0.2.8.**
The standard is his: *ramps read smooth, especially around corners.* This is the
catalogue of the configurations that do not meet it. It does not design the fix.

Captured on `main` at **`f4557b4`**. Every frame in `shots/` is a `?models=1` Map Lab
render of the shipped art — no fog, no HUD — normalised to the same tile pitch so
crops are comparable. Console errors across every capture: **0**. Labelled frames
carry a red ring on each named tile, so a crop can be read against the coordinates.

---

## 1. What was enumerated

A slope tile's shape is chosen from one thing: which of its eight neighbours stand
exactly one layer above it. Writing `H` for such a neighbour and `.` for anything
else, clockwise from north (`N NE E SE S SW W NW`), gives a **mask** — and two tiles
with the same mask are the same problem to the classifier. `enumeration.md` lists
**all 54 masks that occur**, canonicalised over the four rotations, with how often
each occurs and which piece it gets. `method.md` has the exact procedure.

Coverage: **108 maps** — 4 biomes x 3 settlement scales x 3 sizes x 3 seeds — plus the
`hills-1` snowy rural control from the original report, and 64 further maps for the
diagonal-run figure. `slopeShare` is 1 throughout, so nothing below is the Map Lab
knob leaving a run bare.

Of **37,693** tiles facing a one-layer step, **32,079 (85.1 %) carry a wedge.** The
other 15 % is where this audit lives:

| | tiles | share | entry |
|---|---:|---:|---|
| carries a wedge | 32,079 | 85.1 % | mostly smooth — S1, S2 |
| within 3 tiles of a building footprint | 2,411 | 6.4 % | **J2** |
| touches water | 1,089 | 2.9 % | shoreline, excluded by design |
| inland, one or two high sides, no wall | 646 | 1.7 % | **J2** (cause not pinned) |
| on the map border | 533 | 1.4 % | **J2**, same read |
| has a retaining wall | 514 | 1.4 % | by design |
| three or more high sides | 292 | 0.8 % | **J3** |
| carries a connector | 129 | 0.3 % | by design |

---

## 2. What reads right — the bar

**S1 — a straight run along one axis.**
`shots/S1-straight-run-rock.png` · `hills-1`, snowy/rural/medium, `(8..12, 4, 27)`
`shots/S1-straight-run-grass.png` · `qa813-temperate-rural-large-0`, temperate/rural/large, `(48..53, 1, 34)`

The surface is continuous from the low plane to the high one; the joins between
tiles are creases, not steps. Nothing is missing.

**S2 — a straight run ending in one outer corner.**
`shots/S2-single-turn-labelled.png` · `qa813-temperate-rural-large-0`, `(48..52, 2, 32)`
— tiles 48–51 `straight`, tile 52 `outer`.

**This one matters, because it rules out the obvious hypothesis.** A single convex
turn at the end of a run reads smooth: the ramp tapers into the corner piece and
meets the lower ground without a notch. Corners are *not* broken in general, so the
failures below are specific and worth separating rather than fixing wholesale.

---

## 3. The catalogue of failures

### J1 — a boundary that turns on every tile becomes a stepped corner · geometry

`shots/J1-diagonal-corner-labelled.png` (labelled) · `shots/J1-diagonal-context.png` · `shots/J1-diagonal-detail.png`
`qa813-snowy-rural-large-1`, snowy/rural/large — outer corners at `(10,3,10)`, `(11,4,11)`, `(12,5,12)`

Where the boundary runs on the map diagonal, every tile on it classifies as
**outer**, whose surface is high at one corner only. Consecutive outer corners
cannot join into one plane: each rises to a point and falls away on both sides, so
the run draws as separate peaks with the exposed vertical side face between them.
In the labelled frame the three chained corners project onto a single **hard
right-angled grey corner climbing a layer per tile** — a staircase, not a hillside.
The detail crop shows the same shape in the open: blade-like wedges laid end to end,
each with a crease cutting back between it and the next.

Note the chain in this map **climbs one layer per tile** (y 3 → 4 → 5). Every
diagonal chain found does; a flat diagonal terrace edge does not occur in the sample.

**Now short.** Across 172 maps the longest chain of diagonally adjacent outer
corners is **3** — 4 chains of 3, 15 of 2, 657 isolated. The half-height layers
shrank the teeth; they did not remove them.

### J2 — the ramp stops dead where a hillside meets a plot or the map edge · rule

`shots/J2-lot-margin.png` · `shots/J2-lot-margin-detail.png` · `shots/J2-lot-margin-second.png`
`qa813-temperate-rural-small-0`, temperate/rural/small, centre `(4, 2, 2)` and `(14, 3, 7)`

A terrace ramps normally and then, within a few tiles of a lot, becomes a
**square-cornered block of earth** — two sheer faces meeting at a right angle, no
wedge, no retaining wall, no cap. The detail crop has the sloped wedge and the bare
block in the same frame, a couple of tiles apart.

`SlopePass.isNatural` disqualifies any tile within one column of a lot, on the
premise that man-made ground "keeps its retaining wall". **It mostly does not:** of
the 3,590 bare tiles this rule and its siblings produce, only **514 carry a wall**.
The lot margin alone is **2,411 tiles — 6.4 % of every one-layer step in the game**,
in runs of up to 41 contiguous tiles. The map border adds **533 (1.4 %)** with the
same read, and a further **646 (1.7 %)** are inland and unwalled with one or two high
sides, outside every rule I could reproduce from the frozen map — `isNatural` reads
`draft.lots`, which are larger than the footprints the finished map carries, so those
are probably the same cause through a coarser proxy. I could not confirm that and am
not claiming it.

**By area this is the largest defect in the audit**, and the geometry to fix it
already exists and is already drawn a few tiles away.

### J3 — a tile low on three sides is a crack · geometry, possibly by design

`shots/J3-gully.png` · `hills-1`, snowy/rural/medium, centre `(10, 3, 29)`

No kit piece is low on three sides, so these get nothing and draw as a **narrow dark
slot** in the rock. **292 tiles (0.8 %).** Whether a crevice is wrong is the Art
Director's call; it is catalogued because it is a configuration with no piece, not
because I am sure it reads badly.

---

## 4. Reads jagged, but is not a missing piece

**N1 — a channel one or two tiles wide.**
`shots/N1-narrow-channel-labelled.png` · `shots/N1-narrow-channel-detail.png`
`qa813-temperate-rural-large-0`, temperate/rural/large, centre `(54, 1, 33)`

This frame reads like battlements — merlon, gap, merlon, gap — and it was the first
thing I catalogued as a missing corner piece. **It is not.** The labelled frame shows
the marked tiles lining a channel two tiles wide cut into a level-2 plateau:

```
        50 51 52 53 54 55 56 57 58          50 51 52 53 54 55 56 57 58
 z=32    2  2  2  2  2  1  1  2  2   z=32   s2 s2 o1  -  - i1 s3  -  -
 z=33    2  2  2  2  1  1  1  2  2   z=33    -  -  -  - i1 s0 i3  -  -
 z=34    1  1  1  1  1  2  2  2  2   z=34   s2 s2 s2 s2 i3  -  -  -  -
```

Every piece is correct for its tile and the surface follows the terrain faithfully.
The teeth are the plateau spurs *between* channels. No new geometry removes them,
because the heightfield is that shape; the lever, if this is judged too busy, is
mapgen widening narrow channels — not the kit. **Recorded so nobody cuts a piece
that cannot help.**

For the record, two hypotheses died here: single-tile spikes and pits are
essentially absent (**12 and 11 across 108 maps**), so this is not terrain noise
either — it is genuine narrow valleys.

---

## 5. The cause, plainly

**Both, and they are independent.**

- **A placement rule** produces **J2**, the largest of the failures — 8.1 % of all
  one-layer steps once the border ring is included. `isNatural` excludes these tiles
  and the retaining wall its premise assumes is present on 14 % of them. Nothing is
  missing from the kit here.
- **Missing geometry** produces **J1**: the kit is high along one edge, two edges, or
  at one corner, and nothing is high along a **diagonal band**, so consecutive outer
  corners cannot form a continuous surface. One shape, small in count (chains of at
  most 3), but it lands on the skyline of a hillside where it is seen.
- **J3** is a shape the kit does not have and may not want.
- **N1** is neither: it is the terrain's own width.

The Executive Director's two words map cleanly onto the two causes: the **"missing
corner piece"** is J1, and the **"jagged edges"** are mostly J2.

---

## 6. Re-running this after #826 changes map scale

Nothing here is pinned to today's dimensions.

1. **The enumeration** is a function of the mask only. Regenerate over the same
   biome/settlement/size/seed grid and rebuild `enumeration.md`; the mask vocabulary
   and the eight-bucket table in §1 are scale-free, so the shares compare directly.
2. **The frames** are captured at a fixed **tile pitch of 140 px** in a 600 px crop,
   centred on a named tile — not at a fixed zoom — so a larger map yields the same
   crop of the same number of tiles.
3. **The coordinates in §3 will move**, because the seeds generate different terrain.
   Re-find each class by its mask or its bucket in §1, never by coordinate; every
   entry names the rule or mask that selects it.
4. Compare on three numbers: the **share of one-layer steps carrying a wedge**
   (85.1 %), the **lot-margin share** (6.4 %), and the **longest diagonal
   outer-corner chain** (3).

## 7. Limits

- Only the `settlement` archetype; hive and crash-site maps are not sampled.
- Only the top ground layer of each column, so a slope under an overhang is missed.
- No clean crop of the map-border case (J2's border ring) was captured — the frame I
  took is dominated by edge-spawn markers. The count stands; the exhibit does not.
- Verdicts are mine, from looking at the frames. The Director judges the crops.

---

## Appendix — adjacent, measured, not part of #813

**Steps of two or more layers.** `shots/X1-multilayer-step.png` ·
`qa813-temperate-rural-small-0`, temperate/rural/small, centre `(9, 0, 2)`.

The slope pass only ever shapes a **one-layer** step. Across the same 108 maps there
are **7,321 steps of two or more layers — 68 per map — and 6,576 of them (90 %) have
no wall on the low tile.** They draw as plain vertical faces. That is outside the
Executive Director's ramp complaint and outside this issue, and a cut bank may be
exactly right; it is recorded because it is the same premise as J2 — man-made ground
keeps a retaining wall — failing at nine times the scale, and whoever fixes J2 will
be standing next to it.
