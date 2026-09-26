# Campaign bestiary: modeller's brief

This is the brief for building the campaign's new bugs, objectives and maps as Blender low-poly models ([campaign arc](../campaign-arc.md) §6, §7, §8 and §14). Each entry gives the footprint, the silhouette to hit, the palette tokens, the motion-rig nodes and sockets, and the concept sheet to follow. The sheets are in [`concepts/campaign/`](../concepts/campaign/README.md). Each sheet's sidecar lists what to keep and what to change on the model; read it with the sheet.

The spitter has its own brief and sheet in a separate package. Everything here follows the [style guide](../style-guide.md) and the [brown bug family kit](crescent-bugs.md). This page only records what is new.

```
 height (u)
 3.5 ┤                                                              ┌──────────┐
 3.0 ┤                                             ┌─┐              │          │
 2.5 ┤                                  ┌───────┐  │ │              │          │
 2.0 ┤                                  │       │  │ │   ┌───────┐  │          │
 1.5 ┤                   ┌─┐            │       │  │ │   │       │  │          │
 1.0 ┤           ┌────┐  │ │    ┌────┐  │       │  │ │   │       │  │          │
 0.5 ┤ ┌──┐      │    │  │ │    │    │  │       │  │ │   │       │  │          │
 0.0 ┴─┴──┴──────┴────┴──┴─┴────┴────┴──┴───────┴──┴─┴───┴───────┴──┴──────────┴──
       burrower  brute   guard  pod     core       mech  brood      sovereign
       1×1       2×2     1×1    2×2     3×3        1×1   3×3        4×4
```

## Shared rules

- **Scale and axes.** 1 tile = 1 u = 2 m. Pivot at the centre of the footprint, y = 0. +Y up, and the front faces +Z in glTF (Blender −Y), as the shipped bugs do; `UnitMotionRig` turns the clone to the tactical facing. Author big units at their tactical footprint and set `footprint` in `MODEL_MANIFEST` to match, as the 2×2 brute does (#1134), so `model-footprint.ts` draws them at scale 1.
- **Materials.** One material per palette token, named exactly as the token, on the shared bug atlas. Chitin roughness is 0.74 and flesh 0.9. Emissive tokens (`bug-bio-green`, `bug-bio-magenta`) use `emissiveIntensity` 1.5. Bioluminescence is small and bright, never a wash. The generated sheets often wash a whole surface in glow, so do not copy that.
- **Budgets.** Each GLB must stay under 500 KB. At the shipped density (the brute is 15,640 triangles in 410 KB) the file cap binds at about 19,000 triangles, before the 20,000 triangle budget. Big bosses get their presence from size, not from triangle count. Each entry below gives a target.
- **Reproducible sources.** One `tools/art/models/<file>.py` per model, built from `bug_parts.py`, `brute_parts.py` and `crescent_geometry.py` where they fit. Run it through `make_model.py`, with a placeholder first (`--quality placeholder`), then the final model. Register it in `MODEL_IDS`, `MODEL_MANIFEST` and `placeholders.manifest.json` (see the [art-blender skill](../../../.claude/skills/art-blender/SKILL.md)).
- **Read test.** Render every new unit on asphalt, grass and rock at 64 px per tile (style guide §4.2.1). Judge it next to the swarmer, lurker and brute at the same scale.

### Motion-rig contract

`src/graphics/service/unit-motion-rig.ts` animates rigid nodes by name. It does not use skeletons or clips. It reads only the model's **top-level** nodes:

| Top-level node name                                                                                                                 | Becomes                          | Notes                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `leg_<l\|r><digit>` (`leg_l0`, `leg_r2`)                                                                                            | one swinging leg                 | Any digit works. Phase is π per side plus π per digit, so `l0 l2 r1` step together against `l1 r0 r2`, a tripod gait for six legs.                                                                     |
| `blade_…`, `scythe_…`, `cleaver_…`, `arm_…`, `upper_arm_…`, `flesh_…`                                                               | the arm on that side (bugs only) | A name containing `_l_` or ending in `_l` is left; **anything else is right**. There are at most two arm pivots, `l` and `r`. They swing on a walk, strike on melee, and kick back on a ranged attack. |
| names starting `foot`, `toe`, `heel`, `shin`, `knee`, `thigh`, `hip_joint`, `claw`, `brace` or `nozzle` and containing `_l` or `_r` | a leg keyed by side only         | A mech convention that the rig applies to bugs too. **Do not use these prefixes for top-level bug parts**, or they become extra legs.                                                                  |
| `base`                                                                                                                              | ignored                          |                                                                                                                                                                                                        |
| anything else                                                                                                                       | body                             | Bobs and rolls on a walk; lunges or recoils on an attack.                                                                                                                                              |

- Put `motion_joint: true` (glTF extras) on each leg or arm node whose origin sits at the hip or shoulder. The authored joint is used **only when that side's group is a single top-level node**. Parent armour, claws, hands and toe caps under their limb node; never make them siblings of it.
- The rig chooses its behaviour by model id. Ids starting `bug.` get the bug roll and bug arm grouping. Only the exact id `bug.swarmer` gets the swarmer's leg swing, and only `tdf.infantry.` ids get the per-figure rig (`fig<n>_legs`, `fig<n>_knee`, `fig<n>_upper`). The armoured-swarmer and civilian entries below each need a one-line rig change; see [Follow-ups](#follow-ups).
- A unit that never moves needs no `leg_*` nodes, because the walk cycle only runs while a unit moves.

### Summary

| Subject          | Proposed model id                            | Category | Footprint | Height (u) | Rig nodes                                      | Target triangles | Concept                                                                                                    |
| ---------------- | -------------------------------------------- | -------- | --------- | ---------- | ---------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------- |
| Burrower         | `bug.burrower`                               | bugs     | 1×1       | 0.45       | `leg_[lr]0..2`, `blade_l`, `blade_r`           | 14,000           | [burrower](../concepts/campaign/burrower.md)                                                               |
| Hive Guard       | `bug.hive-guard`                             | bugs     | 1×1       | 1.3        | `blade_rack_l`, `blade_rack_r`; no legs        | 16,000           | [hive-guard](../concepts/campaign/hive-guard.md)                                                           |
| Broodmother      | `bug.broodmother`, `bug.broodmother-scarred` | bugs     | 3×3       | 1.75       | `leg_[lr]0..2`, `scythe_l`, `scythe_r`         | 19,000           | [broodmother](../concepts/campaign/broodmother.md), [scarred](../concepts/campaign/broodmother-scarred.md) |
| Sovereign        | `bug.sovereign`                              | bugs     | 4×4       | 3.5        | `leg_[lr]0..2`, `scythe_l`, `scythe_r`         | 19,000           | [sovereign](../concepts/campaign/sovereign.md)                                                             |
| Armoured swarmer | `bug.swarmer-armoured`                       | bugs     | 1×1       | 0.55       | as `bug.swarmer`: `leg_[lr][01]`, `blade_[lr]` | 16,000           | [armoured-swarmer](../concepts/campaign/armoured-swarmer.md)                                               |
| Armoured lurker  | `bug.lurker-armoured`                        | bugs     | 1×1       | 1.35       | as `bug.lurker`: `leg_[lr][01]`, `scythe_[lr]` | 18,000           | [armoured-lurker](../concepts/campaign/armoured-lurker.md)                                                 |
| Armoured brute   | `bug.brute-armoured`                         | bugs     | 2×2       | 1.0        | as `bug.brute`: `leg_[lr]0..2`, `cleaver_[lr]` | 19,000           | [armoured-brute](../concepts/campaign/armoured-brute.md)                                                   |
| Spore pod        | `bug.spore-pod`, `bug.spore-pod-mature`      | props    | 2×2       | 1.25       | none                                           | 8,000            | [spore-pod](../concepts/campaign/spore-pod.md)                                                             |
| Civilian group   | `civ.group`                                  | units    | 1×1       | 0.9        | `fig0_…` to `fig3_…`                           | 2,000            | [civilian-group](../concepts/campaign/civilian-group.md)                                                   |
| Tunnel mouth     | `bug.tunnel-mouth`                           | props    | 2×2       | 0.3        | none                                           | 6,000            | [tunnel-mouth](../concepts/campaign/tunnel-mouth.md)                                                       |
| Hive core        | `bug.hive-core`, `bug.hive-core-damaged`     | props    | 3×3       | 2.5        | none                                           | 16,000           | [hive-core](../concepts/campaign/hive-core.md)                                                             |

The ids are proposals in the existing style (`bug.egg-spawner` is a `props` model with a `bug.` id). The package that lands each subject owns its id. Footprints of 3×3 and 4×4 are new to tactical; the brute's 2×2 took its own change (#1130). If a package caps footprints at 3, author the Sovereign at 3×3 and keep its height.

## Species

### Burrower

Act II tunneller (§8). It moves under the ground and surfaces beside a unit or out of a tunnel mouth.

- **Footprint:** 1×1. It is about 0.95 u long and 0.45 u tall to the top of its back.
- **Silhouette:** long, low and banded, like a pill bug. Two huge spade forelimbs splay forward; the wedge head carries a pale ploughshare plate; a short tail spike. It has no eyes: rows of green pits instead.
- **Palette:**

  | Token              | Hex       | Where                                               |
  | ------------------ | --------- | --------------------------------------------------- |
  | `bug-chitin-mid`   | `#8B5D36` | the seven back bands, shovel faces                  |
  | `bug-chitin-tan`   | `#B88B58` | band rims: the tactical read from above             |
  | `bug-bone`         | `#DDC39B` | ploughshare plate, serrated shovel edges, claw tips |
  | `bug-chitin-dark`  | `#5C3B25` | shovel backs, head sides                            |
  | `bug-chitin-black` | `#2E2118` | leg joints, underside                               |
  | `bug-flesh`        | `#73452E` | gaps between bands                                  |
  | `bug-bio-green`    | `#9CFF3D` | sensory pits and two breathing slits (emissive)     |

- **Rig:** `leg_l0..2` and `leg_r0..2` (four legs are also fine), plus `blade_l` and `blade_r` for the shovels, each with `motion_joint` at the shoulder. The shovels are the melee arms.
- **Burrowing:** it sinks through the ground and comes back up. That is a graphics move of the whole model on y plus a dirt-burst VFX; the rig does not do it. Close the underside, and keep the band rims readable when only the top half shows.
- **Follow:** [burrower.png](../concepts/campaign/burrower.png). Fit it to one tile, laid along the diagonal if needed.

### Hive Guard

A stationary spine thrower that never leaves its chamber (§8, §7.5). It guards hive cores.

- **Footprint:** 1×1. It is about 0.95 u wide and 1.3 u tall to the spine tips.
- **Silhouette:** a fortress. The broad front shield has a pale rim, and two fanned racks of dark quills with green tips rise above a domed back. Four root limbs are buried in the floor, so it is plainly immobile.
- **Palette:**

  | Token              | Hex       | Where                                        |
  | ------------------ | --------- | -------------------------------------------- |
  | `bug-chitin-mid`   | `#8B5D36` | front shield, back dome                      |
  | `bug-bone`         | `#DDC39B` | shield rim, spine points, claws              |
  | `bug-chitin-black` | `#2E2118` | spine shafts, joints                         |
  | `bug-chitin-dark`  | `#5C3B25` | root limbs                                   |
  | `bug-flesh`        | `#73452E` | thin launching-muscle band at the rack bases |
  | `bug-chitin-tan`   | `#B88B58` | dome plate edges                             |
  | `bug-bio-green`    | `#9CFF3D` | spine tips, eye clusters (emissive)          |

- **Rig:** it has no `leg_*` nodes, because it never walks. Name the root limbs `root_…` so they stay body. Make each spine rack one node, `blade_rack_l` and `blade_rack_r`, with `motion_joint` at its base on the back. Its weapon is ranged, so on attack the racks kick back and the body recoils, which reads as a volley.
- **Socket (proposed):** `socket_muzzle` at the top of the racks, for a spine-tracer origin. Nothing reads it for bugs today.
- **Follow:** [hive-guard.png](../concepts/campaign/hive-guard.png), top view. Bury the claws in a resin collar.

### Broodmother

The boss egg-layer of Alpha Hunt (§6.8). She lays a clutch every 3 turns and flees at half health. She is Jev-driven when the relay is configured.

- **Footprint:** 3×3. She is about 2.9 u long and 1.75 u tall to the cage spines, lower than a mech and far wider than a brute.
- **Silhouette:** a huge ribbed egg sac behind a small armoured front, with hooked bone spines caging the sac. She has a crest-shaped head shield and sickles folded forward. The sac should read from every yaw.
- **Palette:**

  | Token                           | Hex                   | Where                                |
  | ------------------------------- | --------------------- | ------------------------------------ |
  | `bug-chitin-mid`                | `#8B5D36`             | thorax plates, head shield, legs     |
  | `bug-chitin-dark`               | `#5C3B25`             | thorax undershell                    |
  | `bug-chitin-tan`                | `#B88B58`             | sac hoops, shield rim markings       |
  | `bug-bone`                      | `#DDC39B`             | cage spines, sickle edges, toe tips  |
  | `bug-flesh` / `bug-flesh-light` | `#73452E` / `#956344` | sac membrane: **not emissive**       |
  | `bug-bio-magenta`               | `#E23DFF`             | egg spots in the sac only (emissive) |
  | `bug-bio-green`                 | `#9CFF3D`             | eye clusters (emissive)              |
  | `bug-chitin-black`              | `#2E2118`             | joints, ovipositor                   |

- **Rig:** `leg_l0..2` and `leg_r0..2`, plus `scythe_l` and `scythe_r`. Do not name the sac `flesh_…`: that prefix makes it an arm. Use `sac_…` or `abdomen`.
- **Socket (proposed):** `socket_clutch` at the ovipositor tip, where a new egg spawner is laid.
- **Nemesis variant:** `bug.broodmother-scarred` is the same build with a bone-pale scar across the crest, two cage spines removed and dark regrowth on the left flank. Exaggerate it well past the sheet: the silhouette must change, not two pixels of scar. Follow [broodmother-scarred.png](../concepts/campaign/broodmother-scarred.png).
- **Follow:** [broodmother.png](../concepts/campaign/broodmother.png). Use six legs, not the sheet's eight.

### Sovereign

The final boss, placed at the spore platform core (§6.9, §8). It buffs nearby bugs, summons guards and retreats to the core.

- **Footprint:** 4×4 (see the note under the summary table). It is about 3.5 u tall to the crown, the only bug taller than a heavy mech (3.2 u).
- **Silhouette:** regal and upright, like a centaur. Six armoured legs are planted wide under an upright torso and raised head. A fan crown of pale blades with a magenta gem sits behind the head. A long plate mantle drapes like a train, and two scythes are folded across the chest. From above, the crown and the mantle identify it.
- **Palette:**

  | Token              | Hex       | Where                                     |
  | ------------------ | --------- | ----------------------------------------- |
  | `bug-chitin-dark`  | `#5C3B25` | mantle plates (majority), torso           |
  | `bug-chitin-mid`   | `#8B5D36` | leg armour, torso plates                  |
  | `bug-chitin-tan`   | `#B88B58` | mantle rims only                          |
  | `bug-bone`         | `#DDC39B` | crown blades, scythe edges, claw tips     |
  | `bug-chitin-black` | `#2E2118` | joints, scythe backs                      |
  | `bug-bio-magenta`  | `#E23DFF` | crown gem (emissive)                      |
  | `bug-bio-green`    | `#9CFF3D` | eye clusters, thin crown veins (emissive) |

- **Rig:** `leg_l0..2` and `leg_r0..2`, plus `scythe_l` and `scythe_r`. Parent the two small hands under their scythe node. As top-level `arm_…` siblings they would join the same side group and cancel the authored shoulder joint.
- **Socket (proposed):** `socket_crown` at the gem, as the anchor for the buff aura VFX.
- **Follow:** [sovereign.png](../concepts/campaign/sovereign.png). Curl or shorten the train to fit the footprint, enlarge the crown, and keep tan to the rims. The [platform core key art](../concepts/campaign/spore-platform-core.md) draws it more humanoid; follow the sovereign sheet.

### Armoured variants

The Act III armoured swarmer, lurker and brute (§8). They use the same AI as the base species, with more armour. Their autopsy unlocks armour-piercing rounds (§10).

- **Rule:** keep each shipped model's anatomy, footprint and rig nodes exactly, and add armour. Build each one from the same source (`bug_parts.py` for the swarmer and lurker, `brute_parts.py` for the brute) with an armour pass. Parent every armour plate under the limb or body node it covers.
- **Armour language:** thick dark slab plates with bevelled bone rims and small knobbed bosses. The variant reads **darker overall with bright rims**, where the base species reads mid-brown. The tan markings survive as raised studs, which keeps the family read. Accents are unchanged: green for the swarmer and brute, magenta for the lurker.
- **Palette additions over the base species:**

  | Token              | Hex       | Where                              |
  | ------------------ | --------- | ---------------------------------- |
  | `bug-chitin-black` | `#2E2118` | armour slabs                       |
  | `bug-bone`         | `#DDC39B` | slab rims, bosses                  |
  | `bug-chitin-tan`   | `#B88B58` | studs where the base markings were |

| Variant          | Footprint and height | Rig nodes                      | Add                                                                                                                              | Follow                                                                                                             |
| ---------------- | -------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Armoured swarmer | 1×1, 0.55 u          | `leg_[lr][01]`, `blade_[lr]`   | A second hood layer with a pale rim; a three-slab spine with the lozenges as studs; thickened abdomen plates; leg and hook cuffs | [armoured-swarmer.png](../concepts/campaign/armoured-swarmer.png). Keep four legs; the sheet draws six.            |
| Armoured lurker  | 1×1, 1.35 u          | `leg_[lr][01]`, `scythe_[lr]`  | A face mask with eye slits; thorax collars; slab sleeves on the sickle backs; armoured fins                                      | [armoured-lurker.png](../concepts/campaign/armoured-lurker.png). Thicken past the sheet a little and keep it thin. |
| Armoured brute   | 2×2, 1.0 u           | `leg_[lr]0..2`, `cleaver_[lr]` | A tortoise-shell of slabs over the wing cases; a ram brow plate; leg cuffs; dark-backed cleavers                                 | [armoured-brute.png](../concepts/campaign/armoured-brute.png)                                                      |

## Objectives

### Spore pod

The Crash Site objective (§6.3): destroy it before it matures at the end of turn 8. It is also the pod to protect in Intact Pod.

- **Footprint:** 2×2, about 1.25 u tall, tilted and buried nose first. The crater is map terrain from the crater archetype. The model carries only the pod, its roots and a small scorch skirt inside 2×2.
- **Silhouette:** a charred teardrop husk with glowing seams and a split crown, with root tendrils gripping the ground.
- **Palette:** `bug-chitin-black #2E2118` and `bug-chitin-dark #5C3B25` for the husk plates, with `bug-chitin-tan #B88B58` on the larger plate rims. The interior uses `bug-flesh #73452E` and `bug-flesh-light #956344`. `bug-bio-magenta #E23DFF` lights the seams (emissive) and `bug-bio-green #9CFF3D` the thin veins (emissive). Use `env-dirt #7A6045` for the skirt.
- **States:** `bug.spore-pod`, and `bug.spore-pod-mature` with its petals split open and a brighter core, swapped in over the last turns before the deadline. Smoke is VFX.
- **Socket (proposed):** `socket_hatch` at the crown, where the maturing wave bursts out, as on the egg spawner.
- **Follow:** [spore-pod.png](../concepts/campaign/spore-pod.png).
- **As built (#1179):** both states are registered at a 1×1 footprint, 1.25 u tall, because the crash site's `spore-pod` hook is a single tile and the pod is a spawner that stands on one. The husk and its skirt spread about 1.34 u, so the pod overhangs its tile a little rather than filling 2×2. Sources are `tools/art/models/bug-spore-pod.py`, `bug-spore-pod-mature.py` and the shared `spore_pod_parts.py`; renders are `docs/design/renders/bug.spore-pod*_*.png`.

### Civilian group

The Evacuation objective (§6.4): friendly, unarmed units the player walks to the drop ship.

- **Footprint:** 1×1, on a disc of Ø 0.85 and 0.05 thick, like an infantry squad. Adults are 0.9 u tall and the child about 0.55 u.
- **Silhouette:** four figures huddled together: a woman holding a child's hand, a man with his arm round them, an elderly man with a cane. Bare heads and empty hands separate them from soldiers at a glance, since infantry are defined by helmets and one long weapon. Two adults wear orange emergency blankets.
- **Palette:** clothing in `env-awning-cream #D8D0B8`, `env-glass #6E8FA6`, `env-brick #8A4B3A`, `tdf-grey-light #9AA5B1` and `tdf-grey-dark #2E3440`, with `tdf-orange #F08A24` for the blankets only. The disc is `tdf-grey-light #9AA5B1` with **no orange rim**, because the orange selection ring must stay the only orange ring under a unit. Skin and hair need new tokens (see [Palette additions](#palette-additions)).
- **Rig:** build it with `squad_parts.py`'s figure builder (four figures, `fig0_` to `fig3_`, each with `fig<n>_legs`, an optional `fig<n>_knee`, and `fig<n>_upper`). The figure rig only runs for `tdf.infantry.` ids today (see [Follow-ups](#follow-ups)).
- **Follow:** [civilian-group.png](../concepts/campaign/civilian-group.png).

### Tunnel mouth

The Tunnel Sabotage objective (§6.7): three per map. Units plant charges on them, and burrowers come up through any mouth still open.

- **Footprint:** 2×2, set into the ground. The heaved slabs stay at or below 0.3 u, so the mouth adds no cover unless the mission package decides otherwise. The asphalt and sidewalk around it are the map's own tiles.
- **Silhouette:** a ring of broken slabs tilted up round a dark hole, with a ribbed chitin throat spiralling down and root tendrils across the cracks.
- **Palette:** `env-asphalt #3A3D42` and `env-concrete #8E8A82` for the slabs. The throat ribs are `bug-chitin-dark #5C3B25` and `bug-chitin-mid #8B5D36`, with `bug-chitin-tan #B88B58` on the outer rib rims. Use `bug-flesh #73452E` between the ribs, `bug-chitin-black #2E2118` for the tendrils, and one small `bug-bio-green #9CFF3D` glow deep in the throat.
- **Construction:** give the throat a real inner wall and a closed dark lining, as the [infestation kit](infestation-organic.md) does for every opening. Never use a black decal.
- **Socket (proposed):** `socket_charge` on the rim, where the separate charge prop is mounted. That prop is a small `tdf-grey-mid #5B6573` box with a `tdf-orange #F08A24` stripe and light.
- **Follow:** [tunnel-mouth.png](../concepts/campaign/tunnel-mouth.png).

### Hive core

The Hive Assault and Great Hive objective (§6.5, §7.5): a large destructible target in the deepest chamber, guarded by Hive Guards.

- **Footprint:** 3×3, about 2.5 u tall. Arteries beyond the footprint are floor props or decals in the cavern kit.
- **Silhouette:** a russet heart mass inside a crown of tall ribs, with eggs clustered at the base.
- **Palette:** `bug-flesh #73452E` and `bug-flesh-light #956344` for the mass. The ribs are `bug-chitin-dark #5C3B25` and `bug-chitin-mid #8B5D36`, with `bug-chitin-tan #B88B58` rims. `bug-bio-magenta #E23DFF` fills the membrane windows (emissive, small panels, not the whole mass) and `bug-bio-green #9CFF3D` the thin veins (emissive). Use `bug-bio-green-dim #4C8F1A` for the pools at the base.
- **States:** `bug.hive-core` and `bug.hive-core-damaged`, with ribs broken, the membrane torn and the glow dimmed.
- **Follow:** [hive-core.png](../concepts/campaign/hive-core.png).

## Environments

These are map references, not single models. The mapgen packages build them from kit pieces.

### Hive cavern

The Hive Assault map (§7.5).

- **Layout:** rounded chambers linked by tunnels **at least two tiles wide**. It has a long footprint, the core chamber sits deepest, and the mouth is the deploy and extract end. Walls are elevation cliffs of one level (1.5 u) or more. The camera sees no ceiling, as in the key art.
- **Dressing:** reuse the [infestation organic kit](infestation-organic.md) (`hive-spire`, `burrow-ribs`, `egg-bed`, `egg-clutch`, `resin-pool`, `spine-*`) and the [carapace walls](infestation-carapace.md). Dormant broods sit in egg beds and shell cradles in the side chambers.
- **Palette:** walls in `bug-chitin-black #2E2118` rock with `bug-chitin-dark` and `bug-chitin-mid` ribs and `bug-chitin-tan` rims. Floors are `bug-flesh #73452E` and `env-rock #6E6A66`. Floor pools are **non-emissive** `bug-bio-green-dim #4C8F1A`; green emissive is only thin wall veins. The key art washes the pools in glow; do not copy that.
- **Performance:** it must render within the SwiftShader budget. Bound the per-fragment work.
- **Follow:** [hive-cavern.png](../concepts/campaign/hive-cavern.png), for layout and materials, not lighting.

### Spore platform

The finale's two linked maps (§6.9, §7).

- **Stage 1, hull and docking ring:** a walkable deck of terraced hull plates, with spine buttresses and low rib walls as cover. A docking ring with a magenta iris is cradled with pods. There is black space and Earth's limb beyond the map edge. The plates are `bug-chitin-dark` and `bug-chitin-mid`, with tan on the rims only; the key art is too tan. Follow [spore-platform-hull.png](../concepts/campaign/spore-platform-hull.png).
- **Stage 2, core chamber:** a round chamber of terraces, stairs and low walls, entered along a narrow causeway. The core is a giant rib-caged magenta seed behind the Sovereign's dais. Magenta stays on the core and the wall pods; floors and walls stay brown. Follow [spore-platform-core.png](../concepts/campaign/spore-platform-core.png).

## Palette additions

The civilian group needs colours the palette does not have. Infantry faces are `tdf-grey-mid` under helmets, and no skin or hair token exists. These are proposed hexes, sampled from the [civilian sheet](../concepts/campaign/civilian-group.png). The model package adds them to style guide §4. Like the clothing colours borrowed from the environment palette, they can be flat, untextured tokens added in the model script with `PALETTE.update(...)`, as `frontage_parts.py` does for awning cloth. That avoids pulling env-atlas cells onto a unit.

| Proposed token  | Hex       | Use                          |
| --------------- | --------- | ---------------------------- |
| `civ-skin`      | `#C08A5E` | faces and hands              |
| `civ-skin-deep` | `#8E6544` | faces and hands, second tone |
| `civ-hair`      | `#614C40` | hair                         |
| `civ-hair-grey` | `#D5C4B8` | the elderly figure's hair    |

## Follow-ups

- **Armoured swarmer gait:** `UnitMotionRig` checks `modelId === "bug.swarmer"` for the swarmer's leg swing. With `bug.swarmer-armoured`, change the check to `startsWith("bug.swarmer")`.
- **Civilian figures:** the figure rig runs only for `tdf.infantry.` ids. A `civ.` id needs that check widened, or the group only bobs as one body.
- **Footprints of 3 and 4:** the Broodmother, Sovereign and hive core are the first 3×3 and 4×4 units and props. Movement, spawn fit, vision and wall cutting were proven at 2 (#1130).
- **Sockets:** `socket_clutch`, `socket_crown` and `socket_charge` are new names, and nothing reads them yet. `socket_muzzle` and `socket_hatch` are existing names.
