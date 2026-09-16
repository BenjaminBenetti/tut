# Concept sheets

Generated reference art for the first asset set, plus later explorations. Every image has a sidecar `.md` recording its prompt (inline or in a linked text file), generator, date and keep/change notes (architecture §7). Regenerate the original sheets with:

```
tools/art/gen-image.sh docs/design/concepts/prompts/<name>.txt docs/design/concepts/<name>.png
```

Sheets are documentation, not runtime assets; they are stored at 1536 px wide.

**Selected swarmer direction:** [Brown Crescent B](swarmer-redesign/b-crescent-brown.md). The [brown family kit](../kits/crescent-bugs.md) implements all four replacement models with distinct species silhouettes and shared materials. [The three concept directions](swarmer-redesign/README.md) and earlier palettes remain available as design history. The original bug sheets below are superseded by this kit.

| Sheet | Subject | Style guide |
|---|---|---|
| [mech](mech.md) | TDF mech, baseline chassis with autocannon and missile pod | §3 mech, §4.1 |
| [infantry-squad](infantry-squad.md) | Five-soldier squad token on one base | §3 squad, §4.1 |
| [bug-swarmer](bug-swarmer.md) | Fast low wedge, green accents | §3 swarmer, §4.2 |
| [bug-lurker](bug-lurker.md) | Tall stalker with scythe arms, magenta accents | §3 lurker, §4.2 |
| [bug-brute](bug-brute.md) | Armoured dome with cleaver blades | §3 brute, §4.2 |
| [egg-spawner](egg-spawner.md) | Fleshy egg mound objective | §3 spawner, §4.2 |
| [tileset-city-street](tileset-city-street.md) | Modular road, sidewalk, wall, roof, stairs and prop kit | §7, §4.3 |
| [tactical-firefight](tactical-firefight.md) | A whole mission: what everything adds up to in one scene | §12, §4.1, §4.2 |
| [overworld-deployables](overworld-deployables.md) | Strategic-map deployables: defensive battery, repellent dispersal, sensor array (#1153) | §4.1, §6 |
| [overworld-settlement](overworld-settlement.md) | Strategic-map settlement markers at three scales, plus the egg-infested overlay; superseded by the ten regional sheets below (#1155) | §4.2, §4.3, §6 |
| [overworld-settlement-north-american](overworld-settlement-north-american.md) | North American: farmstead, main-street grid, Manhattan grid with a stepped needle tower (#1155) | §4.3, §6 |
| [overworld-settlement-european](overworld-settlement-european.md) | Western European: ochre roofs, spire church, twin-tower cathedral, iron lattice tower (#1155) | §4.3, §6 |
| [overworld-settlement-slavic](overworld-settlement-slavic.md) | Eastern European and Central Asian: log houses, panel slabs, onion domes, wedding-cake tower (#1155) | §4.3, §6 |
| [overworld-settlement-middle-eastern](overworld-settlement-middle-eastern.md) | Middle Eastern: sand cubes, domes and minarets, tapering glass needle (#1155) | §4.3, §6 |
| [overworld-settlement-african](overworld-settlement-african.md) | Sub-Saharan African: thatched compound, tin-roof town with a mast, drum tower and stadium (#1155) | §4.3, §6 |
| [overworld-settlement-south-asian](overworld-settlement-south-asian.md) | South Asian: pastel flat roofs, shikhara, gopuram, lotus-crowned tower (#1155) | §4.3, §6 |
| [overworld-settlement-east-asian](overworld-settlement-east-asian.md) | East Asian: pagoda roofs, torii and pagoda, castle keep, slender towers with a red lattice tower (#1155) | §4.3, §6 |
| [overworld-settlement-southeast-asian](overworld-settlement-southeast-asian.md) | Southeast Asian: stilt houses and stupa, tiered temple, twin towers with a sky bridge (#1155) | §4.3, §6 |
| [overworld-settlement-latin-american](overworld-settlement-latin-american.md) | Latin American: coloured hillside cubes, colonial churches, summit monument (#1155) | §4.3, §6 |
| [overworld-settlement-oceanian](overworld-settlement-oceanian.md) | Australian and New Zealand: veranda houses and windmill pump, tin-roof sprawl, needle tower and sail shells (#1155) | §4.3, §6 |

Recipe and environment notes: `docs/design/art-tooling.md` §1. Prompt skeleton: `docs/design/style-guide.md` §10.

Mech customisation reference (chassis, legs, arms, arm weapons, back weapons as separate swappable pieces): [`mech-bay/`](mech-bay/README.md).
