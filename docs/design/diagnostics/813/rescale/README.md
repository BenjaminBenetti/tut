# #813 — ramp audit re-run at the ADR 0009 scale

**The delta against `../README.md`, not a repeat of it.** Read that first for method and
for the failure classes; this records only what changed when v0.2.9 took map presets to
48/72/96, roads to 2–4 lane carriageways, and lots to double size.

Audited against **`main` at `7d76997`** — that is, **without** PR #853, so the numbers
below are the ground the MapGen fix is landing on.

---

## 0. A correction to the first catalogue, which comes before anything else

**My harness had a wrap-around bug and the first catalogue's totals are wrong because of
it.** Neighbour lookups were `top.get(z * width + x)` with no bounds check, so at `x = 0`
a west lookup (`dx = -1`) resolved to `z * width - 1` — a real tile at the **east edge of
the previous row**. Every tile on the west and east border therefore got a fabricated
neighbour, and some were counted as facing a step that they do not face.

Re-measuring the *same commit* (`f4557b4`) with a bounds-checked lookup:

| first catalogue said | actually |
|---|---|
| 37,693 one-layer step tiles | **36,830** |
| 85.1 % carry a wedge | **87.1 %** |
| **E, map border: 533 tiles (1.4 %)** | **95 tiles (0.3 %)** |
| B, shoreline: 1,089 | 670 |
| J2 population 3,590 (9.5 %) | **3,057 (8.3 %)** |

**MapGen caught this independently in #853** — *"At all four of QA's border coordinates
every in-bounds neighbour is level or lower; the sheer face is the map's own edge"* — and
they are right. My J2 entry claimed 533 border tiles with the same read as the lot margin;
that class is 95 tiles at the old scale and 60 at the new, and it is mostly not a defect.
The regression #853 writes against it is correct.

**No ruling changes.** J2 is still the largest defect by area, J1 and J3 are untouched by
the bug, and the corrected wedge share moves *in the game's favour*. With the fix in place
my bucket table now reproduces #853's independently-derived one to the tile: 74,627 steps,
66,174 sloped, E = 60.

---

## 1. The delta

Both columns measured with the corrected method, same 108 seeds, `slopeShare` 1.

| bucket | old 32/48/64 | | new 48/72/96 | |
|---|---:|---:|---:|---:|
| one-layer step tiles | 36,830 | — | 74,627 | — |
| **carries a wedge** | 32,077 | 87.1 % | 66,174 | 88.7 % |
| A has a retaining wall — by design | 514 | 1.4 % | 513 | 0.7 % |
| B touches water — by design | 670 | 1.8 % | 755 | 1.0 % |
| C three or more high sides — #849 | 289 | 0.8 % | 522 | 0.7 % |
| D carries a connector — by design | 128 | 0.3 % | 229 | 0.3 % |
| E on the map border | 95 | 0.3 % | 60 | 0.1 % |
| F lot margin (≤3 of a footprint) | 1,809 | 4.9 % | 2,771 | 3.7 % |
| G inland, unwalled, unpaved | 441 | 1.2 % | 2,266 | 3.0 % |
| **H the bare tile is paved** | 545 | 1.5 % | 1,003 | 1.3 % |
| I unpaved, beside paved | 262 | 0.7 % | 334 | 0.4 % |
| **J2 population (F+G+H+I)** | 3,057 | 8.3 % | 6,374 | 8.5 % |

**Read `F + G + H + I` as one population**: they are all "a one-layer step whose low tile
is bare", split by why. The split moves between them as the map changes — G grew from
1.2 % to 3.0 % because lots doubled while my bucket test is still "within 3 tiles of a
building footprint", so work leaked out of F. #853 confirms this from the draft: of the
6,434 bare tiles it counts, 3,869 are the lot ring, which reaches up to six tiles from a
footprint now.

---

## 2. The three questions

### Do J1 and J2 hold the same shape and proportions? **Yes, both.**

**J2 — 8.3 % → 8.5 % of all one-layer steps.** The map roughly doubled in tiles and the
defect doubled with it. Same shape in the frames: a hillside ramps, then becomes a
square-cornered bare block. Nothing about the rescale changed the character.

**J1 — same shape, slightly longer tail.** Diagonal chains of outer corners:

| chain length | old | new |
|---:|---:|---:|
| 1 (isolated, not a defect) | 646 | 1,287 |
| 2 | 15 | 24 |
| 3 | 4 | 3 |
| 4 | 0 | **1** |

Isolated corners doubled with the map, as expected. The **4-chain is new** and is the
worst case in the game; it is now the right subject for #848's acceptance composite.

**J3 — 0.8 % → 0.7 %.** Unchanged in share.

### Does the larger map or the wider roads create a configuration the first pass did not see? **No new neighbourhood shape. One class became much more prominent.**

Distinct canonical masks went **54 → 55**, five appearing and four going, and every one of
them occurs **1–5 times in 108 maps**. That is the tail wobbling between two terrain
draws, not a new shape. The classifier faces the same problem it faced before.

What *did* change is **H — the bare tile is itself paved**: a carriageway or sidewalk
facing a one-layer step with no wedge and no wall. **545 → 1,003 tiles.** It existed
before and my first pass did not separate it from the lot margin; with 2–4 lane
carriageways and kerbs, paved plats now have far more edge, and this is the class that
matters most going forward — see §3.

### Does the lot-margin count change now that lots are bigger? **Up by half in absolute terms, down slightly in share, and it leaks into the next bucket.**

F alone: **1,809 → 2,771**, a 53 % rise, but 4.9 % → 3.7 % of steps. F + G together:
**2,250 (6.1 %) → 5,037 (6.8 %)**. So the true lot-related population grew *as a share*
even though my proxy bucket shrank — the proxy radius did not double when the lots did.
**Use #853's draft-derived 3,869, not my F.**

---

## 3. What #853 and the diagonal piece will already cover

| class | new count | covered by |
|---|---:|---|
| F lot margin | 2,771 | **#853** — its after-table takes F to 309 |
| G inland unwalled unpaved | 2,266 | **#853** — after-table 1,019, and most of that is paved |
| I unpaved beside paved | 334 | **#853** (the tile is unpaved) |
| **H the bare tile is paved** | **1,003** | **nobody — #853 excludes paved by design** |
| J1 chains of 2+ | 28 chains | **#848**, the diagonal piece |
| C three or more high sides | 522 | **#849**, deferred behind #848 |
| A / B / D | 1,497 | by design |

**#853 covers the whole of J2 as I filed it, except the paved tiles.** Its rule is
"unpaved, unwalled and free of a connector", so a carriageway or sidewalk whose edge
drops a layer keeps a bare face on purpose. That is a deliberate choice and may well be
right — a kerb is a real thing — but it is now **the largest bare class that will remain
after both fixes land, at about a thousand tiles**, and it doubled with the road rework.


---

## 4. The thing the road rework actually did — and it is not the one-layer case

Splitting **H** by how deep the step is, over the same 108 maps. Every paved tile with no
wedge, by the largest rise to an orthogonal neighbour:

| rise | paved tiles with no wedge | of which walled |
|---:|---:|---:|
| 1 layer (0.75 u) | 948 | **0** |
| **2 layers (1.5 u)** | **7,360** | **90** |
| 3 layers | 90 | 0 |
| 4 layers | 76 | 0 |
| 5 layers | 4 | 0 |
| 6 layers (4.5 u) | 2 | 0 |

**The one-layer paved step is not the problem; the two-layer one is.** A single-layer
paved step reads as a kerb — see `shots/D1-paved-edge-labelled.png` and
`shots/D2-paved-edge-b.png`, where a sidewalk changes level and it looks like a built
kerb, which is what #853 is right to leave alone. But **7,360 paved tiles face a drop of
1.5 world units — taller than a soldier — and 99 % of them have no wall**, and a handful
face drops of up to 4.5 units.

These sit **outside** every issue currently open. They are not one-layer steps, so
`SlopePass` never considers them, #853's rule never reaches them, and #848's diagonal
piece is irrelevant to them. They are the appendix item from the first catalogue —
"steps of two or more layers, 90 % unwalled" — now localised: the carriageway plats the
road rework introduced are two layers proud of the ground beside them and their edges are
bare.

**This is the answer to "did the wider roads create something new".** Not a new
neighbourhood shape — a much longer paved edge, most of it two layers high and unwalled.

### K1 — a one-layer paved step reads as a kerb, and should be left alone

`shots/K1-paved-one-layer-labelled.png` · `shots/K1-paved-one-layer-second.png`
`qa813-temperate-town-small-0`, temperate/town/small (48x48), `(33, 2, 10)` and `(12, 2, 32)`

A sidewalk changes level by one layer and it looks like a built kerb — crisp edge, reads
as intended. **#853 is right to exclude paved tiles**, on this evidence. (The tall bare
*grass* faces in the same frames are the J2 defect and #853 does cover those.)

### K2 — a carriageway drives off a two-layer drop, mid-road

`shots/K2-carriageway-two-layer-drop-labelled.png` · `shots/K2-carriageway-two-layer-drop-detail.png`

```
/mapgen-preview.html?seed=qa813-temperate-town-small-0&biome=temperate&settlement=town&size=small&slope=100&models=1&units=1
```

`qa813-temperate-town-small-0`, temperate/town/small (48x48), road tiles
**`(32, 2, 11)` `(32, 2, 12)` `(32, 2, 13)`**. The level and surface patch, `R` road,
`S` sidewalk, `g` grass, `W` a wall, `s` a wedge:

```
        27  28  29  30  31  32  33  34  35  36  37
 z=10   4R  4R  4R  4S  4S  2S  2S  2Ss 2Ss 2S  2S
 z=11   4R  4R  4R  4R  4R  2R  2R  2R  2R  2R  2R
 z=12   4R  4R  4R  4R  4R  2R  2R  2R  2R  2R  2R
 z=13   4R  4R  4R  4R  4R  2R  2R  2R  2R  2R  2R
 z=14   4SW 4SW 4SW 4S  4S  2S  2Ss 2Ss 2R  2R  2R
```

**One carriageway, one row, dropping from level 4 to level 2 across a single tile
boundary — 1.5 world units, taller than a soldier — with no wall and no wedge.** The
column stacks confirm there is nothing between: `x=31` holds one ground tile at y=4,
`x=32` holds one at y=2, and the two layers between are void. In the frame the upper
tiles stand proud as detached pale blocks over a dark face with the road running away
below them.

Note the row above and below *does* get wedges (`2Ss`), because those are one-layer
steps — so the same edge is ramped where it drops one layer and a sheer 1.5 u cliff where
it drops two, a few tiles apart.

**Nothing open covers this.** `SlopePass` only ever considers one-layer steps, so #853's
rule never reaches it and #848's diagonal piece is irrelevant to it. It is the first
catalogue's appendix item — "steps of two or more layers, 90 % unwalled" — grown and now
sitting on the roads the Executive Director drives his squad down.


---

## 4. Limits

- Same as the first catalogue: `settlement` archetype only, top ground layer only.
- Audited on `7d76997`, before #853. **#853 merged as `e671c01` while this run was in
  progress**, so everything above is the ground it landed on, not the current head. The
  "after" figures in §3 are MapGen's own from the PR, not mine; I have not run their branch.
- No usable frame of the 4-chain (#848) or of a fresh lot-margin block: both sit near a
  map edge at 96x96 and my capture harness cannot centre a tile that close to the border.
  The counts stand, those two exhibits do not. The first catalogue's frames still show
  both shapes, which the rescale did not change.
- The bucket split F/G/H/I is mine and is a proxy for rules that live in the draft. Where
  it disagrees with a draft-derived count, the draft wins — that is what §0 is about.
