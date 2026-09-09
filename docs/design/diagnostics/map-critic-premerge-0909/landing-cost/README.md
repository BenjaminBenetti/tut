# Dropship reservation: small coastal city cost

9 September 2026 UTC. **The space cost is visible, but acceptable on this
recipe.** The after view has a thinner street frontage and more open shore
space. It still reads as a built coastal neighborhood with an occupied tower,
street-facing buildings and connected pavements. The aircraft now gives
arrival and return a clear physical location, with an exposed ramp and external
boarding area. This cost ranks below the four live Critic defects; no new
change request is established by this case.

The Director explicitly asked the Critic to rank the building-count effect in
[PR#1042](https://github.com/BenjaminBenetti/tut/pull/1042#issuecomment-5594131182).
MapGen reported this as its largest measured reduction, **6→4 buildings** on
`mc-resume-02`, coastal/city/small48. The six visible structures before and
four after agree with that individual case. Population statistics remain
MapGen's evidence; the Critic did not repeat a 108-map count.

| View | Main before | Unmerged PR after |
| --- | --- | --- |
| Initial near framing | [before](before/near.png) | [after](after/near.png) |
| Same zoom, one E turn | [before](before/rotated.png) | [after](after/rotated.png) |
| Initial yaw, maximum zoom out | [before](before/whole.png) | [after](after/whole.png) |

All six native2020×1500 crops were individually opened. Exact recipe:
`mapgen-preview.html?seed=mc-resume-02&biome=coastal&settlement=city&size=small&models=1&units=1&slope=100`.
Level **all**, pointer offscene, viewport2400×1500, cropx380,y0. Each image's
adjacent JSON records the actual all-level readout, camera input sequence,
complete map region x0–47/z0–47, timestamp, image hash and runtime. These are
whole-neighborhood comparisons at deterministic initial framing, not a
camera focused on a single failing tile.

Before: main `9d9ea012e97292ae3f96e2500f1609a1cfdbf412`, fresh port4175.
After: isolated PR#1042 checkout `d4faaf945d2d9a0814c888a35221c29c30629111`,
fresh port4176 with its own Vite cache and no HMR/watching. Its src/public/tools
trees match Director-accepted `00af2715504e476a634cb8ccb3ff10cdd42b0485`.
The different deployed position and changed buildings/props are real generated
outcomes. This is not an unchanged-map or same-deploy-position claim.

The ramp, aircraft supports and boarding area read coherently from both camera
sides; the existing paved, railed waterfront remains visible. Isolated timber
panels and generic yard objects remain the already-owned #1006/#960 scope,
and the water grid remains #1005. This preview does not include those repairs.

No retouching, scene substitutions, generator edits or game-code changes.
No browser errors were recorded. This is a bounded map-quality comparison of
an unmerged PR, not fresh-main acceptance or proof of mission movement/LOS.
The real campaign arrival and the reported medium city still require their
normal post-integration check.
