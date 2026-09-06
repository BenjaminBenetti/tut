# #813 — every neighbourhood a slope tile sits in

Generated from 108 maps: 4 biomes x 3 settlement scales x 3 sizes x 3 seeds, plus
the `hills-1` snowy rural control. `slopeShare` is 1 (the default), so nothing here
is the Map Lab knob leaving a run bare.

**The mask** reads the eight neighbours clockwise from north — `N NE E SE S SW W NW`
— writing `H` where the neighbour's top ground layer is exactly one layer above this
tile and is neither water nor a building footprint, and `.` for anything else. `H` is
exactly what `SlopePass` reads, so two tiles with the same mask are the same problem.
Masks are canonicalised over the four rotations, so one row covers all four turns.

Rows are every mask that occurs on a tile with at least one orthogonal `H`
— the tiles that face a one-layer step and could carry a wedge.

| # | mask `N NE E SE S SW W NW` | high neighbours | occurrences | piece assigned |
|---:|---|---|---:|---|
| 1 | `.....HHH` | SW+W+NW | 13475 | straight 12021, none 1454 |
| 2 | `.....HH.` | SW+W | 5330 | straight 4596, none 734 |
| 3 | `......HH` | W+NW | 5202 | straight 4441, none 761 |
| 4 | `....HHH.` | S+SW+W | 3739 | inner 3513, none 226 |
| 5 | `....HHHH` | S+SW+W+NW | 3071 | inner 2925, none 146 |
| 6 | `...HHHH.` | SE+S+SW+W | 3016 | inner 2872, none 144 |
| 7 | `......H.` | W | 1202 | straight 747, none 455 |
| 8 | `...HHHHH` | SE+S+SW+W+NW | 727 | inner 609, none 118 |
| 9 | `.......H` | NW | 696 | outer 696 |
| 10 | `....H.HH` | S+W+NW | 355 | inner 342, none 13 |
| 11 | `...HH.H.` | SE+S+W | 312 | inner 299, none 13 |
| 12 | `....H.H.` | S+W | 245 | inner 230, none 15 |
| 13 | `..HHHHH.` | E+SE+S+SW+W | 130 | none 130 |
| 14 | `...HH.HH` | SE+S+W+NW | 72 | inner 60, none 12 |
| 15 | `..HHHHHH` | E+SE+S+SW+W+NW | 57 | none 57 |
| 16 | `...H.HHH` | SE+SW+W+NW | 52 | straight 40, none 12 |
| 17 | `.HHH.HHH` | NE+E+SE+SW+W+NW | 50 | none 50 |
| 18 | `...H.HH.` | SE+SW+W | 47 | straight 26, none 21 |
| 19 | `...HH..H` | SE+S+NW | 47 | none 25, straight 22 |
| 20 | `.HHHHHHH` | NE+E+SE+S+SW+W+NW | 44 | none 44 |
| 21 | `...H..H.` | SE+W | 38 | none 26, straight 12 |
| 22 | `...HHH.H` | SE+S+SW+NW | 38 | none 20, straight 18 |
| 23 | `...H..HH` | SE+W+NW | 36 | straight 20, none 16 |
| 24 | `.HHHHHH.` | NE+E+SE+S+SW+W | 36 | none 36 |
| 25 | `..HH.HHH` | E+SE+SW+W+NW | 36 | none 36 |
| 26 | `..HH.HH.` | E+SE+SW+W | 27 | none 27 |
| 27 | `.HH..HHH` | NE+E+SW+W+NW | 26 | none 26 |
| 28 | `....HH.H` | S+SW+NW | 25 | none 13, straight 12 |
| 29 | `....H..H` | S+NW | 24 | none 20, straight 4 |
| 30 | `..HHH..H` | E+SE+S+NW | 23 | inner 14, none 9 |
| 31 | `..HHHH.H` | E+SE+S+SW+NW | 19 | none 16, inner 3 |
| 32 | `.H.HHHH.` | NE+SE+S+SW+W | 13 | none 10, inner 3 |
| 33 | `..H...HH` | E+W+NW | 12 | none 12 |
| 34 | `..H..HH.` | E+SW+W | 12 | none 12 |
| 35 | `..H...H.` | E+W | 7 | none 7 |
| 36 | `..HH..HH` | E+SE+W+NW | 6 | none 6 |
| 37 | `HHHHHHHH` | N+NE+E+SE+S+SW+W+NW | 6 | none 6 |
| 38 | `.HH..HH.` | NE+E+SW+W | 5 | none 5 |
| 39 | `..H..HHH` | E+SW+W+NW | 5 | none 5 |
| 40 | `..H.HHHH` | E+S+SW+W+NW | 3 | none 3 |
| 41 | `..HHH.HH` | E+SE+S+W+NW | 3 | none 3 |
| 42 | `..HHH.H.` | E+SE+S+W | 3 | none 3 |
| 43 | `.H.HHHHH` | NE+SE+S+SW+W+NW | 3 | inner 2, none 1 |
| 44 | `..H..H.H` | E+SW+NW | 3 | none 3 |
| 45 | `.HH.HHHH` | NE+E+S+SW+W+NW | 3 | none 3 |
| 46 | `...H...H` | SE+NW | 3 | outer 3 |
| 47 | `..H.HHH.` | E+S+SW+W | 2 | none 2 |
| 48 | `.HHHH.H.` | NE+E+SE+S+W | 2 | none 2 |
| 49 | `H.H.HHHH` | N+E+S+SW+W+NW | 1 | none 1 |
| 50 | `..H.H..H` | E+S+NW | 1 | inner 1 |
| 51 | `..H.HH.H` | E+S+SW+NW | 1 | none 1 |
| 52 | `.HHHH.HH` | NE+E+SE+S+W+NW | 1 | none 1 |
| 53 | `.H.H.HHH` | NE+SE+SW+W+NW | 1 | straight 1 |
| 54 | `H.HHHHHH` | N+E+SE+S+SW+W+NW | 1 | none 1 |
