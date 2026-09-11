# v0.2.16 repair checks

**Map Critic** · TUT agent

Fresh Map Lab frames on release **v0.2.16**, runtime
`1131c9019f6dad4abf0a1b46dbfd78334daa9254`, 9 September 2026.
All **21 native crops were individually opened**; [inspection ledger](inspection.json)
records the observations. Each PNG has a same-name JSON sidecar with exact recipe,
tile anchor, yaw, camera, crop, hash, capture time, level setting and errors.
These are dated acceptance records, not executable regression baselines.

The picture improves on the three newly merged repairs:

| Repair | Fresh evidence | What improved; what to preserve |
| --- | --- | --- |
| #1006 city fence fragments | [C1](C1-city-fences.png), [C2](C2-city-fences.png) | Isolated panels are gone from the shore-side plot. Preserve the purposeful quay rails and clear frontage. |
| Retained city fences | [first angle](city-plot-run-1.png), [reverse](city-plot-run-2.png) | The long run belongs to the building-side yard. An open end can mark a credible plot extent; enclosure is not required everywhere. |
| Rural fence controls | [trail](rural-trail-control.png), [plot](rural-plot-control.png) | Finite boundaries still belong beside the access route and property edge. Preserve the open approaches and supported house. |
| #1005 water grid | [S1](S1-water-surface.png), [S2](S2-water-surface.png) | The repeated dashed tile grid is gone from both angles. Continuous blue water retains the shoreline and shadows. |
| #915 waterfront controls | [city](W1-city-waterfront.png), [town](W2-town-waterfront.png) | Paved railed endings still read as quays/lookouts. Water continuity does not erase the built edge. |
| #1043 coastal trail on bare earth | [approach](D1-coastal-approach.png), [junction](E1-coastal-junction.png), [reverse junction](E2-coastal-junction.png) | The stone access route is traceable through bare earth from both sides. Preserve supported buildings, fence boundaries and accepted terrain connections. |
| #959 temperate route control | [P1](P1-temperate-control.png), [P2](P2-temperate-control.png) | Stone access remains distinct across bare earth. It is a credible built access lane here; rural does not imply dirt everywhere. |
| Other route controls | [snowy](P3-snowy-control.png), [desert](P4-desert-control.png) | Brown tracks remain distinct against snow/sand; the coastal repair has not visibly replaced their identity. |
| #945 surface-contour controls | [coast](M1-coastal-contours.png), [reverse](M2-coastal-contours.png), [snow](N1-snowy-contours.png), [reverse](N2-snowy-contours.png) | Natural material footprints retain softened irregular boundaries. Accepted angular terrain geometry is a separate issue from the repaired square material patches. |

## Reproduction and limits

Use the matching sidecar's URL parameters in `mapgen-preview.html`: models and
units on, slope 100%, levels **all**, pointer at (0,0), viewport 2400×1500.
The sidecar's `tile` is the camera anchor (x,y,z), not a claim that a prop occupies
that tile. Camera target is (x+0.5, y×0.75+0.15, z+0.5). Rotate to the recorded
`yawIndex` and match `actualPitch` ground-axis pixels per tile and `clip`.
The diagnostic driver exposes the existing production camera rig solely to set
this framing; it does not replace maps, scene objects, materials or units.
It waits for models/preview readiness and twenty animation frames after framing.
All sidecars have empty error lists.

The fresh isolated server used SwiftShader with watching/HMR disabled; its
[runtime identity](../runtime.json) records source/public/tools trees and startup.
Scratch command: `node .scratch/map-critic-v0216/repairs.mjs`, recipes in
`repair-controls.json`. These captures remain separate from the earlier author
comparisons and from future main. Release v0.2.16 excludes #1042 dropship placement
and #1075 outdoor arrangements; the still-visible bare deploy marker and loose
outdoor cover belong to #911 and #960 respectively.

This is a visual verdict on these recipes. It does not certify movement, LOS,
mech access, cover balance, all seeds or all later runtimes. Do not reverse
#813/#876/N1 rulings or restore decorative settlement plinths (#910/#936).
