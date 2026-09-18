# Infestation: grown environment kit

Source: [`infestation-organic-kit.py`](../../../tools/art/models/infestation-organic-kit.py).
The colony uses the Crescent bugs' walnut shell, dark throat tissue and sparse
tan exposed edges. Its structures occupy lots, form obstacles and mark connected
resin routes. Every opening is modeled with an inner wall and a dark closed
lining; it is not a black decal on a solid cone.

The thirty pieces include six walkable floor treatments and twenty-four colony
structures. Larger nest mouths, ribs, arches and hive chambers have real 2×1 or
2×2 footprints. Low roots and shell fragments provide transition dressing.

| Build key | Model ID suffix | Footprint | Form |
| --- | --- | --- | --- |
| `nest` | `prop.infested-nest` | 1×1 | Open burrow with five asymmetric buttresses |
| `nest-large` | `prop.infested-nest-large` | 2×2 | Broad burrow with rooted skirt |
| `nest-split` | `prop.infested-nest-split` | 2×1 | Two communicating mouths under fractured ribs |
| `hive-spire` | `prop.infested-hive-spire` | 2×2 | Tall fluted chamber and overlapping armor |
| `hive-crown` | `prop.infested-hive-crown` | 2×2 | Low central chamber within inward blades |
| `spine-tall`, `spine-cluster`, `spine-low` | `prop.infested-<key>` | 1×1 | Curved angular blades in three cover silhouettes |
| `shell-fan`, `shell-ridge` | `prop.infested-<key>` | 1×1 | Overlapping fractured shell fins |
| `shell-barricade` | `prop.infested-shell-barricade` | 2×1 | Long shell defensive wall |
| `arch` | `prop.infested-arch` | 2×1 | Grown gate with a clear central opening |
| `vent-tall`, `vent-low` | `prop.infested-<key>` | 1×1 | Hollow, chipped biological vents |
| `egg-bed` | `prop.infested-egg-bed` | 1×1 | Three ribbed eggs in shell cradles |
| `egg-clutch` | `prop.infested-egg-clutch` | 2×2 | Six eggs and protective hooked blades |
| `tendril-node`, `roots`, `edge-growth` | `prop.infested-<key>` | 1×1 | Branching arteries, junction and growth front |
| `carapace`, `husk` | `prop.infested-<key>` | 1×1 | Discarded shell and collapsed segmented remains |
| `resin-pool` | `prop.infested-resin-pool` | 2×2 | Low sump, crust islands and feeding channels |
| `burrow-ribs` | `prop.infested-burrow-ribs` | 2×1 | Five open vaults with two rooted sills |
| `feeder` | `prop.infested-feeder` | 1×1 | Funnel shielded by two crooked hooks |
| `ground` | `tile.ground.infested` | 1×1 | Three sparse, nearly flush crust fragments |
| `ground-ribbed` | `tile.ground.infested-ribbed` | 1×1 | Three low, curved resin channels |
| `ground-cracked` | `tile.ground.infested-cracked` | 1×1 | Four large, contiguous fractured plates |
| `ground-veined` | `tile.ground.infested-veined` | 1×1 | Fine converging capillaries |
| `ground-rooted` | `tile.ground.infested-rooted` | 1×1 | Two buried arteries and a flush crust fragment |
| `ground-nest-floor` | `tile.ground.infested-nest-floor` | 1×1 | Broken crust with radial feeding channels |

All floor slabs meet at 0.05 u. Relief stays below 0.065 u, so it does not imply
an obstacle on a walkable tile. Structure bases use irregular thin growth fronts,
without circular display plinths. Blade cross sections are faceted and uneven;
shell plates have actual notches and depressed fissures. Tan accents occur along
short exposed edges rather than continuous decorative piping.

Meshes carry continuous authored UVs into the shared bug atlas. The renderer
adds the terrain's continuous resin material so tile seams do not restart the
surface pattern. Each component is closed and validates independently after
export. The user's quality request raises the environment budgets: regular
pieces stay below 10,000 triangles, large formations below 16,000, and every GLB
stays below the 500 KiB cap.

Example regeneration:

```bash
blender -b --threads 2 --python tools/art/make_model.py -- \
  --script tools/art/models/infestation-organic-kit.py \
  --build-arg kind=hive-spire --id prop.infested-hive-spire \
  --category props --file prop-infested-hive-spire.glb \
  --footprint 2x2 --max-triangles 16000 --quality final \
  --size 480 --samples 24
```

The production review uses all three fixed camera angles. Individual images are
under `docs/design/renders/<model-id>_{045,135,225}.png`; the complete contact
sheets are under `docs/design/diagnostics/infestation-organic/`.
