# Map Critic: coastal rural route loses its identity in bare earth

Preserve the improved natural grass/sand/soil contours, recognisable coastal
planting and occupied building silhouettes. A rural approach should remain
readable as something people use, even where surrounding ground is bare.

**The coastal brown approach becomes visually indistinguishable from the
broader brown ground it meets.** The context frame shows a narrow strip
beside the building entrance merging into a much larger bare-earth area.
At the junction, the closer view no longer gives a distinct used-route cue.
Turning E makes the relief easier to see but does not restore that route
identity. This is the coastal follow-up to the accepted temperate #959
repair; that repair remains visibly successful on current main.

This finding concerns route readability and real-place identity. It does
not establish that any path is mechanically disconnected or impassable,
and it does not reopen deliberate #813/#876/N1 terrain geometry. The
picture establishes the ambiguity; I cannot assign its cause to generation
or assets by eye. No particular surface, layout or algorithm is prescribed.

## Evidence and exact reproduction

Fresh main **`9d9ea012e97292ae3f96e2500f1609a1cfdbf412`**, v0.2.15, captured
9 September 2026 UTC. Seed **`mc-resume-03`**, **coastal / rural / small48**.
Models and units on, slope100%, level **all**, initial camera side and one E
turn. 2400×1500 viewport, native 1300×1050 crops, 45 ground-axis pixels/tile.
Coordinates below are camera references (x,y,z), not asserted road columns.
Each image has an exact JSON sidecar, actual pitch/crop, fresh-server runtime
identity, error list and SHA-256. All three native images were opened.

| View | Camera focus | What it establishes |
| --- | --- | --- |
| [D1 approach context](D1-coastal-trail.png) | (13,2,24), initial angle | Narrow brown entrance-side approach widens into bare earth beyond the building. |
| [E1 junction](E1-coastal-junction.png) | (21,2,10), initial angle | Broader bare ground supplies no visibly distinct onward route. |
| [E2 second angle](E2-coastal-junction.png) | (21,2,10), one E turn | Relief is clearer; used-route identity is still absent in the brown patch. |

```text
mapgen-preview.html?seed=mc-resume-03&biome=coastal&settlement=rural&size=small&models=1&units=1&slope=100
```

The earlier C1/C2 seed01 framing attempts and D2 context attempt remain in
scratch. They were inspected, but are not primary evidence for the junction.
D1 is retained only as the labelled approach context above. A projection-only
location search chose the E1/E2 focus from the rendered survey; no generator
implementation was read to infer the route.

## Desired outcome and preservation

The route should remain visibly followable as a plausible continuous rural
approach through this bare-earth area, from both angles. Preserve natural
contours, coastal palette and terrain, supported buildings and the narrow
rural scale. Show same-seed before/after frames and successful contrast
controls, without requiring a specific repair method.

The fresh [temperate two-angle repair and snowy/desert controls](../repairs/README.md)
are positive readability references on the same current runtime, with their
own exact recipes. They are not identical-geometry biome comparisons.
#204's delivered snow/desert work and #959's temperate work remain accepted.
#945 addresses natural material-boundary shape; #1005 separately owns water
seams. #911 owns the deploy landmark and #1006 urban fence relationships.
