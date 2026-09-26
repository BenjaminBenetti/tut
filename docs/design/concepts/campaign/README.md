# Campaign concept sheets

Reference art for the campaign's new species, objectives and maps ([campaign arc](../../campaign-arc.md) §6, §7, §8 and §14). Modellers build the Blender low-poly models from these sheets. The per-subject modelling brief (footprint, palette tokens, motion-rig nodes and sockets) is the [campaign bestiary](../../kits/campaign-bestiary.md). The spitter's sheet is made in a separate package.

Every sheet was generated on 2026-09-26 with the Codex CLI through `tools/art/gen-image.sh`. Each has a sidecar `.md` with its exact prompt, its keep and change notes, and any rejected attempts. Prompts are in [`prompts/`](prompts/). Regenerate a sheet with:

```
tools/art/gen-image.sh docs/design/concepts/campaign/prompts/<name>.txt docs/design/concepts/campaign/<name>.png
```

Two sheets used a reference image (codex `-i`), which the script does not pass; their sidecars give the exact input.

| Sheet                                         | Subject                                                                         | Footprint | Attempts |
| --------------------------------------------- | ------------------------------------------------------------------------------- | --------- | -------- |
| [burrower](burrower.md)                       | Tunnelling bug: spade forelimbs, banded back, low                               | 1×1       | 2        |
| [hive-guard](hive-guard.md)                   | Rooted spine thrower: front shield, quill racks                                 | 1×1       | 1        |
| [broodmother](broodmother.md)                 | Boss egg-layer: egg sac under a spine cage                                      | 3×3       | 1        |
| [broodmother-scarred](broodmother-scarred.md) | The nemesis variant: crest scar, snapped spines (edit of the broodmother sheet) | 3×3       | 1        |
| [sovereign](sovereign.md)                     | Final boss: centaur stance, blade crown, plate mantle                           | 4×4       | 2        |
| [armoured-swarmer](armoured-swarmer.md)       | Swarmer with doubled hood and slab plates                                       | 1×1       | 1        |
| [armoured-lurker](armoured-lurker.md)         | Lurker with sickle sleeves, collars and face mask                               | 1×1       | 3        |
| [armoured-brute](armoured-brute.md)           | Brute with a tortoise-shell of slabs and a ram brow                             | 2×2       | 2        |
| [spore-pod](spore-pod.md)                     | Crash-site pod: charred husk, magenta seams; mature state                       | 2×2       | 1        |
| [civilian-group](civilian-group.md)           | Four civilians on one disc, orange emergency blankets                           | 1×1       | 2        |
| [tunnel-mouth](tunnel-mouth.md)               | Burrow through pavement; charged state                                          | 2×2       | 1        |
| [hive-core](hive-core.md)                     | Rib-caged heart organ; damaged state                                            | 3×3       | 1        |
| [hive-cavern](hive-cavern.md)                 | Key art: cut-away cavern of chambers and wide tunnels                           | map       | 1        |
| [spore-platform-hull](spore-platform-hull.md) | Key art: finale stage 1, hull terraces and docking ring                         | map       | 1        |
| [spore-platform-core](spore-platform-core.md) | Key art: finale stage 2, the core chamber and the Sovereign                     | map       | 2        |

The attempts column counts generations: most rejects had a dark vignette and glow instead of the flat grey backdrop. What fixed it was a leading `Scene/backdrop:` line and a closing `Avoid:` line, written in the format the codex imagegen skill uses for its own prompts. Start new prompts from one of the later files (for example [`prompts/sovereign.txt`](prompts/sovereign.txt)).
