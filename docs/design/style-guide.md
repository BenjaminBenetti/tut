# Terra Under Threat — Art Style Guide

> Owner: Art Director. Palette and scale changes go through a PR on this file; anything that changes gameplay-relevant scale (tile size, floor height) needs Tech Lead sign-off. Manifest format (§8) is agreed with the Tech Lead.
>
> Companion docs: `gdd.md` §3 (setting and tone), §5.7 (roster), §6.1 (presentation), §6.4 (bugs); `architecture.md` §7 (assets).

## 1. Pillars

1. **Readable at isometric distance.** Every unit must be identifiable from its silhouette at the game's default zoom (about 64 px per tile). If it needs a texture to read, it fails.
2. **Two factions, two colour worlds.** TDF is cool grey, olive and orange. Bugs are near-black chitin with sickly bioluminescence. The two palettes never share a hue.
3. **Low-poly with intent.** Flat-shaded, hard-edged, chunky. Detail goes into silhouette and colour blocking, not surface noise.
4. **Modular by construction.** Mech parts, building kits and tile sets are assembled from pieces with shared pivots and sockets so map generation and the mech bay can recombine them.
5. **Military-procedural UI.** Flat, high contrast, monospace data, no ornament.

## 2. Camera facts that drive the art

These are the presentation assumptions the art is built against (GDD §6.1; the camera rig itself is Tech Lead territory).

| Fact | Value | Consequence for art |
|---|---|---|
| Projection | Orthographic | No perspective foreshortening; tall things do not shrink. Keep verticals clean. |
| Elevation angle | ~35° above horizontal (dimetric-ish) | Tops of objects are visible. Roofs and heads matter. |
| Yaw | 4 orientations, 90° steps | Every model must read from all four diagonals. No "back" side. |
| Default zoom | ~64 px per tile, range roughly 40–128 px | A 0.1 u detail is ~6 px. Anything smaller is noise. |
| Lighting | One key directional light + soft ambient, fixed | Bake no lighting into materials. Emissives carry the accents. |

```
            key light
              ╲
   ┌──────────────────────┐   camera at ~35° elevation,
   │  roof / head visible │   looking down the diagonal
   │ ┌────┐   ┌────┐      │
   │ │ N  │   │ E  │      │   the two visible side faces
   │ └────┘   └────┘      │   are equally important
   └──────────────────────┘
```

## 3. Scale and proportions

**1 tile = 1 world unit = 2 metres.** Everything below is in world units (u). Vertical levels from the map contract (ADR 0004) are one storey each, so one level = 1.5 u. Pivot is the centre of the base footprint at y = 0 (feet on the ground). +Y up, +Z forward, right-handed (glTF convention).

| Subject | Footprint (tiles) | Height (u) | Notes |
|---|---|---|---|
| Infantry figure | — | 0.9 | A person is 1.8 m. Five figures share one squad base. |
| Infantry squad token | 1×1 | 0.9 (figures) on a 0.05 thick base disc, Ø 0.85 | Figures arranged in a loose wedge; leader front-centre. |
| Mech (baseline chassis) | 1×1 | 2.4–2.8 | Taller than a building floor (1.5 u) so it visibly cannot enter interiors. Shoulders ~1.1 u wide. |
| Mech, heavy chassis | 1×1 | up to 3.2 | Same footprint. Never exceeds 1.4 u wide at the shoulders; must not clip neighbours. |
| Swarmer | 1×1 | 0.5 | Low wedge, ~0.8 u long. Cheap, many on screen. |
| Lurker | 1×1 | 1.3 | Tall, thin, forward-leaning. Blades longer than legs. |
| Brute | 1×1 | 1.8 | Wide dome, ~0.95 u across. Fills the tile. |
| Egg spawner | 1×1 | 1.4 | Fleshy mound with 3–5 eggs. A 2×2 "clutch" variant may come later. |
| Building floor | — | 1.5 | Floor-to-floor. Interiors are for infantry only. |
| Wall | — | 1.5 × 0.1 thick | Snaps to tile edges. |
| Low cover | ≤ 1×1 | 0.5 | Half cover. Sandbags, barriers, car hoods. |
| High cover | ≤ 1×1 | ≥ 1.0 | Full cover. Walls, dumpsters, pillars. |
| Terrain elevation step | — | 1.5 | One level = one storey (ADR 0004). A one-level ground step is a cliff unless a ramp tile spans it. |
| Door | — | 1.2 tall × 0.6 wide | Centred on a wall segment. |

```
 height (u)
 3.0 ┤                       ┌─┐
 2.5 ┤                       │M│  mech
 2.0 ┤             ┌───┐     │ │
 1.5 ┤  ── floor ──│ B │─────│ │──  ┌ ┐
 1.0 ┤        ╱╲   │   │     │ │    │E│ egg spawner
 0.5 ┤  ▲  ▲ ╱L ╲  │   │     │ │    │ │
 0.0 ┴──iii──S────────────────┴─┴───┴─┴──
      squad swarmer lurker brute mech
```

Silhouette rules per class:

- **Infantry squad**: a cluster of five upright sticks on a disc. Helmets are the biggest readable feature; one figure carries something long (rocket, sniper) to identify squad type.
- **Mech**: a tall rectangle with shoulders wider than hips, one arm ends in a weapon, one shoulder or back carries a second weapon. Legs are clearly separate pieces.
- **Swarmer**: a horizontal wedge, head low, back spines. Reads as an arrow pointing where it runs.
- **Lurker**: a vertical, forward-leaning stroke with two long blade arms held up. Thin waist. Reads as a question mark.
- **Brute**: a dome. Head sunk into the carapace, blade-hands dragging. Reads as a boulder.
- **Egg spawner**: a lumpy mound with three to five ovoid eggs, one split open. Reads as wrong.

## 4. Palette

Hex values are the single source of truth. Model materials, textures, sprites and CSS tokens all pull from here. Names are the material names inside GLB files and the CSS custom property names (prefixed `--`).

### 4.1 TDF

| Token | Hex | Use |
|---|---|---|
| `tdf-grey-dark` | `#2E3440` | Joints, undersides, weapon bodies |
| `tdf-grey-mid` | `#5B6573` | Primary mech armour |
| `tdf-grey-light` | `#9AA5B1` | Armour edge highlights, worn paint |
| `tdf-olive` | `#6B7A3F` | Infantry uniform, mech secondary panels |
| `tdf-olive-dark` | `#45502A` | Infantry webbing, boots, olive shadows |
| `tdf-orange` | `#F08A24` | Unit markings, lights, weapon tips, selection ring. Also the UI accent. |
| `tdf-orange-dim` | `#B86414` | Orange in shadow, hazard stripes |
| `tdf-visor` | `#7FD1FF` | Visors, optics, mech cockpit glow (emissive) |

Rule: orange covers at most 10 % of any TDF model's visible surface. It is a marker, not a colour scheme.

### 4.2 Bugs

| Token | Hex | Use |
|---|---|---|
| `bug-chitin-black` | `#14121A` | Blade backs, claws, deepest plates |
| `bug-chitin-dark` | `#2B2436` | Primary body |
| `bug-chitin-mid` | `#4A3B5A` | Plate highlights, joints |
| `bug-flesh` | `#7A3A4E` | Exposed flesh between plates, egg mounds |
| `bug-flesh-light` | `#B05A6E` | Flesh highlights, egg membranes |
| `bug-bio-green` | `#9CFF3D` | Primary bioluminescence: eyes, vein lines, spines (emissive) |
| `bug-bio-green-dim` | `#4C8F1A` | Non-emissive green, sick residue, spawner pools |
| `bug-bio-magenta` | `#E23DFF` | Secondary bioluminescence: egg interiors, lurker markings (emissive) |
| `bug-bone` | `#D8CBB0` | Blade edges, teeth, spines |

Rule: bioluminescence is small and bright, never a wash. Swarmers get green only. Lurkers get magenta. Brutes get green with bone. Spawners get both, pulsing.

### 4.3 Environment by biome

Shared: `env-asphalt #3A3D42`, `env-concrete #8E8A82`, `env-sidewalk #A7A297`, `env-brick #8A4B3A`, `env-glass #6E8FA6`, `env-roof #55524C`, `env-metal #6F7378`, `env-rust #8C5A3A`, `env-rock #6E6A66`, `env-bark #5A4634`, `env-foliage #3F6B33`.

| Biome | Ground | Secondary | Accent |
|---|---|---|---|
| Temperate | `env-grass #5E7A3A` | `env-dirt #7A6045` | `env-foliage #3F6B33` |
| Snow | `env-snow #E8ECF0` | `env-ice #B9D2E0` | `env-frozen-dirt #6B6A66` |
| Desert | `env-sand #D9B87A` | `env-sandstone #B58A5A` | `env-scrub #8A8A4A` |
| Coastal | `env-wet-sand #B5A276` | `env-water-shallow #3F8FA8` | `env-water-deep #1F5C73`, `env-seawall #7E7F7A` |

Infested ground overlays use `bug-flesh` and `bug-bio-green-dim`; never recolour the base tile.

### 4.4 UI

| Token | Hex | Use |
|---|---|---|
| `ui-bg` | `#0B0D12` | Page and canvas clear colour |
| `ui-panel` | `#141821` | Panels |
| `ui-panel-raised` | `#1C2230` | Hovered rows, active tabs |
| `ui-line` | `#2E3646` | 1 px borders, dividers, grid lines |
| `ui-text` | `#E6E8EE` | Body text |
| `ui-text-dim` | `#8B94A6` | Labels, secondary text |
| `ui-accent` | `#F08A24` | Primary buttons, selection, focus. Same as `tdf-orange`. |
| `ui-info` | `#7FD1FF` | Intel, hover hit chance, links |
| `ui-ok` | `#7CCB5A` | Success, healthy, mission won |
| `ui-warn` | `#F0C63C` | Caution, low ammo, heat |
| `ui-danger` | `#E0453C` | Damage, loss, permadeath |
| `ui-bug` | `#9CFF3D` | Infestation and threat readouts. Same as `bug-bio-green`. |

Contrast: all text on `ui-panel` meets WCAG AA (`ui-text-dim` on `ui-panel` is 6.3:1).

## 5. UI style

Implementation: `src/ui/style/theme.css` exposes the §4.4 tokens as CSS custom properties (`--ui-*`) and provides the `.tut-*` components below (panel, button, label, data, table, badge, meter, top bar, icon). Icons are registered in `src/ui/data/icon-manifest.ts`. Preview: `docs/design/ui-theme-preview.png`, built from `tools/art/preview/ui-theme.html`.

- **Type**: labels and data in monospace: `ui-monospace, "JetBrains Mono", "Cascadia Mono", "SF Mono", Consolas, monospace`. Body copy in `system-ui, "Segoe UI", Roboto, sans-serif`. Labels are uppercase with `letter-spacing: 0.08em`.
- **Shapes**: rectangles with one 45° chamfered corner (top-right, 8 px) on panels and buttons. That chamfer is the signature; nothing else is rounded.
- **Lines**: 1 px `ui-line`. No shadows, no gradients, no blur.
- **States**: hover raises to `ui-panel-raised`; active/selected gets a 2 px `ui-accent` left bar; disabled drops text to `ui-text-dim` at 60 % opacity.
- **Numbers**: tabular figures, right-aligned. Percentages carry the sign (`+12 %`). Credits are prefixed `¢`.
- **Icons**: 16 and 24 px, single colour, 2 px stroke, SVG. Live under `public/assets/ui/icons/`.
- **Voice**: military-procedural. `DEPLOYMENT AUTHORISED`, `CONTACT: 3 SWARMERS`, `MECH LOST — ATLAS-02`. Terse, uppercase for headers, sentence case for body.

## 6. Modelling and material conventions

- **Format**: glTF binary (`.glb`), one file per asset, no external buffers or images unless a texture is required.
- **Axes**: +Y up, +Z forward, right-handed. Bake all transforms; root node has identity transform. 1 unit = 1 tile.
- **Pivot**: centre of the base footprint at y = 0. Wall and edge pieces pivot on the tile edge they attach to (see §7).
- **Materials**: one `MeshStandardMaterial` per palette token, named exactly as the token (`tdf-grey-mid`). `metalness 0`, `roughness 0.9` for cloth and chitin, `0.6` for painted metal. Emissive tokens set `emissive` to the same hex with `emissiveIntensity 1.5`.
- **Shading**: flat. No smoothing groups on armour, tiles or buildings. Organic bug flesh may use smooth normals.
- **Textures**: avoid on kits and props. Units use the two 512² palette atlases (`tdf-atlas_albedo`, `bug-atlas_albedo`, one 128 px cell per token, built by `tools/art/build-textures.mjs`); a mesh maps its whole UV range into the cell of its token, and the GLB references the atlas as an external image so files stay small. Linear filtered with mipmaps; nearest-neighbour only for pixel-locked detail. Sprites ≤ 512².
- **Sockets**: empty nodes named `socket_<name>` mark attach points. Mechs expose `socket_arm_l`, `socket_arm_r`, `socket_back`, `socket_legs`. Buildings expose `socket_door`, `socket_roof`. Spawners expose `socket_hatch` for the egg-burst VFX.
- **Mech part nodes**: a mech is assembled at runtime from separate GLBs: `chassis`, `legs`, `arm-l`, `arm-r`, `weapon-arm`, `weapon-back`. Each part pivots at its socket point so the mech bay can swap them.
- **No lights, no cameras, no animations** in GLBs for now. Animation is a later track; when it comes it will be node-transform clips, not skinning, for everything except infantry.

### Poly and file budgets

| Asset class | Triangle budget | File size |
|---|---|---|
| Infantry figure | 150–300 (squad ≤ 1 500) | ≤ 100 KB |
| Mech chassis / legs / arm / weapon | 1 200 / 800 / 400 / 300 | ≤ 150 KB per part |
| Swarmer / lurker / brute | 600 / 1 000 / 2 000 | ≤ 100 KB |
| Egg spawner | 1 200 | ≤ 100 KB |
| Tile piece (ground, road) | ≤ 60 | ≤ 20 KB |
| Building module (wall, floor, roof, stairs) | ≤ 800 | ≤ 100 KB |
| Prop (cover, street furniture) | ≤ 300 | ≤ 60 KB |

Hard cap from the role brief: models < 500 KB, textures ≤ 1024², sprites ≤ 512². One documented exception: the overworld world-map texture is 2048×1024 (a 2:1 plate carrée needs the width for coastlines at map zoom); it is the only texture allowed over 1024² and must stay under 1.5 MB.

## 7. Tile and building kit conventions

Map generation assembles maps from these pieces (GDD §7, architecture §5 map contract).

- **Ground tiles** are 1×1 u, 0.05 u thick slabs, pivot at centre. Variants: `<biome>-ground-a/b/c`, `city-road-straight`, `city-road-corner`, `city-road-cross`, `city-road-t`, `city-sidewalk`, `city-sidewalk-corner`.
- **Walls** are 1 u long, 1.5 u tall, 0.1 u thick, pivot at the wall's base midpoint, running along local +X. Placed on tile edges. Variants: `wall`, `wall-window`, `wall-door` (door 1.2 × 0.6 opening), `wall-half` (0.5 u high, low cover).
- **Floors** are 1×1 u slabs at y = 0 of their level; **stairs** occupy one tile and rise 1.5 u along local +Z; **ramps** are outdoor stairs' terrain cousin, same rise, biome-textured; **roofs** are 1×1 caps with a 0.1 u parapet.
- **Props** are ≤ 1×1, pivot at base centre: `barrier-concrete`, `sandbags`, `dumpster`, `car-sedan` (2×1, pivot at centre of the 2-tile footprint), `lamp-post`, `hydrant`.
- Every kit ships a `README.md` listing pieces, footprints and which edge they snap to.

### Mapgen ids → models

Map generation (`src/mapgen/data/surfaces.ts`, `props.ts`) emits surface ids and prop kinds; graphics resolves them to models with this table. Placeholder ids come from `tools/art/placeholders.manifest.json`.

| Surface id | Model id | Note |
|---|---|---|
| `grass` / `dirt` / `sand` / `snow` / `rock` | `tile.ground.<id>` | 1×1 slabs; rock has lumps |
| `road` | `tile.city.road-straight` | Graphics picks `-corner`, `-t`, `-cross` by road neighbours |
| `sidewalk` | `tile.city.sidewalk` | `-corner` by neighbours |
| `water` | `tile.ground.water` | Recessed 0.02 u below ground |
| `floor` | `building.floor` | Interior |
| `roof` | `building.roof` | Plus `building.roof-parapet` on outer edges |
| `stairs` | `building.stairs` | Rises along local +Z |

| Prop kind | Model id | Cover in mapgen |
|---|---|---|
| `car` | `prop.car-compact` (1×1). `prop.car-sedan` is 2×1 for hand-placed wrecks | high |
| `crate` | `prop.crate` | low |
| `barrier` | `prop.barrier-concrete` | low |
| `sandbags` | `prop.sandbags` | low |
| `dumpster` | `prop.dumpster` | high |
| `shelving` | `prop.shelving` | high |
| `fence` | `prop.fence` | low |
| `boulder` | `prop.boulder` | high |
| `tree-pine` / `tree-oak` / `tree-palm` | `prop.tree-<id>` | high |
| `cactus` | `prop.cactus` | high |

Walls are `Wall` records on tile edges, not props: `building.wall`, `building.wall-window`, `building.wall-door`, `building.wall-half` by wall kind.

### Part catalogue → models

The roster's starter part catalogue (`src/roster/data/parts.ts`) maps to mech part models like this; the mech bay assembles them at the sockets in §6. Utilities have no visual slot.

| Part id | Model id |
|---|---|
| `chassis-vanguard` | `tdf.mech.chassis-a` |
| `chassis-bulwark` | `tdf.mech.chassis.bulwark` |
| `chassis-atlas` | `tdf.mech.chassis.atlas` |
| `legs-strider` | `tdf.mech.legs-a` |
| `legs-bastion` | `tdf.mech.legs.bastion` |
| `legs-jumper` | `tdf.mech.legs.jumper` |
| `arms-tracker` | `tdf.mech.arm-l-a` + `tdf.mech.arm-r-a` |
| `arms-manipulator` | `tdf.mech.arms.manipulator-l` + `-r` |
| `arms-brace` | `tdf.mech.arms.brace-l` + `-r` |
| `arm-weapon-autocannon` / `-flamer` / `-laser` / `-railgun` | `tdf.mech.weapon-arm.autocannon` / `.flamer` / `.laser` / `.railgun` |
| `back-weapon-missile-pod` / `-mortar` / `-rotary-cannon` | `tdf.mech.weapon-back.missile-pod` / `.mortar` / `.rotary-cannon` |
| `utility-*` | none |

Reference assemblies: `tdf.mech.assembled-a` (Vanguard, Strider, Tracker, Autocannon, Missile Pod) and `tdf.mech.assembled-b` (Bulwark, Bastion, Brace, Railgun, Mortar).

## 8. Asset manifests

Shipped in #10; this section describes what exists. Ids and registries are split so simulation data can name a model without importing the renderer (architecture §3, ADR 0002).

| File | Holds |
|---|---|
| `src/content/data/model-ids.ts` | `MODEL_IDS` const array of dot-separated `faction.subject.variant` ids; `ModelAssetId` is its union. Declare the id here first. |
| `src/graphics/model/asset-manifest.ts` | `ModelAssetEntry { category, path, footprint {w,d}, height, sockets, quality }` and `ModelManifest = Readonly<Record<ModelAssetId, ModelAssetEntry>>`. The key carries the id; entries have no `id` field. |
| `src/graphics/data/model-manifest.ts` | `MODEL_MANIFEST`, typed against `ModelManifest`, so an id without an entry or a misspelt field fails typecheck. |
| `src/graphics/data/model-manifest.test.ts` | Every id registered exactly once; paths inside their category folder; GLB present and < 500 KB; sane footprints and `socket_*` names; entry-for-entry equality with `tools/art/placeholders.manifest.json`; no other file under `src/` may spell `assets/models/`. |
| `src/graphics/service/gltf-model-loader.ts` | Loads by id, prefixes Vite's `BASE_URL`, caches, falls back to `placeholder-model-factory.ts` primitives. External images referenced by a GLB (the unit atlases, §6) resolve relative to the GLB URL. |

Adding a model: add it to `MODEL_DEFS` in `tools/art/build-placeholders.mjs` (or drop a final GLB into the category folder), run `pnpm art:placeholders`, add the id to `MODEL_IDS`, add the entry to `MODEL_MANIFEST` copied from the JSON record, run `pnpm test`.

Sprites, textures and icons use the lighter self-keyed shape, since nothing in simulation references them:

```ts
export const SPRITE_MANIFEST = { "vfx.muzzle-flash": { path, size, blend, label } } as const satisfies Record<string, SpriteAssetEntry>;
export type SpriteId = keyof typeof SPRITE_MANIFEST;
export function spriteUrl(id: SpriteId): string { return `${import.meta.env.BASE_URL}${SPRITE_MANIFEST[id].path}`; }
```

`sprite-manifest.ts` and `texture-manifest.ts` live in `src/graphics/data/`; `icon-manifest.ts` lives in `src/ui/data/` because icons are DOM assets. Each has a test that parses the PNG or SVG header to pin size, alpha and byte budget.

## 9. File naming and locations

| Kind | Location | Pattern | Example |
|---|---|---|---|
| Model | `public/assets/models/<category>/` | `<faction-or-kit>-<subject>[-<variant>].glb` | `units/tdf-infantry-rifle.glb`, `bugs/bug-lurker.glb`, `tiles/city-road-corner.glb` |
| Texture | `public/assets/textures/<category>/` | `<subject>_<map>.png` | `tiles/city-atlas_albedo.png` |
| VFX sprite | `public/assets/sprites/vfx/` | `<effect>[-<variant>].png` | `muzzle-flash-a.png`, `egg-burst.png` |
| UI icon | `public/assets/ui/icons/` | `<name>.svg` | `overwatch.svg` |
| Concept art | `docs/design/concepts/` | `<subject>.png` + `<subject>.md` | `bug-brute.png`, `bug-brute.md` |
| Build scripts | `tools/art/` | `<verb>-<noun>.mjs` | `build-placeholders.mjs` |

All names kebab-case. Faction prefixes: `tdf-`, `bug-`. Kit prefixes: `city-`, `temperate-`, `snow-`, `desert-`, `coastal-`.

## 10. Generated image recipe

Concept art, textures and sprites come from the Codex CLI image generator. Every committed image has a sidecar `.md` with the exact prompt, model, date and keep/change notes (architecture §7).

Prompt skeleton, always in this order:

```
<subject and pose>, <faction palette by name and hex>, low-poly game model style,
flat shading, hard edges, isometric three-quarter view from 35° above,
plain neutral grey background, no text, no watermark, concept sheet with front,
side and three-quarter views
```

Palette hexes go in the prompt verbatim. Ask for "concept sheet with three views" for units and "seamless top-down tile" for ground textures. Sprites are requested on solid black for additive blending or transparent PNG when supported.

## 11. Checklist for any new asset

- [ ] Reads from all four yaw angles at 64 px per tile.
- [ ] Uses only palette tokens; materials named after tokens.
- [ ] Within triangle and file budgets (§6).
- [ ] Pivot, axes and sockets per §6/§7.
- [ ] Registered in the manifest (§8).
- [ ] Concept image, if any, has a prompt sidecar.
