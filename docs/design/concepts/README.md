# Concept sheets

Generated reference art for the first asset set. Every image has a sidecar `.md` with the exact prompt, generator, date and keep/change notes (architecture §7). Regenerate any sheet with:

```
tools/art/gen-image.sh docs/design/concepts/prompts/<name>.txt docs/design/concepts/<name>.png
```

Sheets are documentation, not runtime assets; they are downscaled to 1536 px wide.

| Sheet | Subject | Style guide |
|---|---|---|
| [mech](mech.md) | TDF mech, baseline chassis with autocannon and missile pod | §3 mech, §4.1 |
| [infantry-squad](infantry-squad.md) | Five-soldier squad token on one base | §3 squad, §4.1 |
| [bug-swarmer](bug-swarmer.md) | Fast low wedge, green accents | §3 swarmer, §4.2 |
| [bug-lurker](bug-lurker.md) | Tall stalker with scythe arms, magenta accents | §3 lurker, §4.2 |
| [bug-brute](bug-brute.md) | Armoured dome with cleaver blades | §3 brute, §4.2 |
| [egg-spawner](egg-spawner.md) | Fleshy egg mound objective | §3 spawner, §4.2 |
| [tileset-city-street](tileset-city-street.md) | Modular road, sidewalk, wall, roof, stairs and prop kit | §7, §4.3 |

Recipe and environment notes: `docs/handoff/art-director.md` §5. Prompt skeleton: `docs/design/style-guide.md` §10.

Mech customisation reference (chassis, legs, arms, arm weapons, back weapons as separate swappable pieces): [`mech-bay/`](mech-bay/README.md).
