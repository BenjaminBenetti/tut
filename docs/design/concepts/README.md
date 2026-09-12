# Concept sheets

Generated reference art for the first asset set, plus later explorations. Every image has a sidecar `.md` recording its prompt (inline or in a linked text file), generator, date and keep/change notes (architecture §7). Regenerate the original sheets with:

```
tools/art/gen-image.sh docs/design/concepts/prompts/<name>.txt docs/design/concepts/<name>.png
```

Sheets are documentation, not runtime assets; they are stored at 1536 px wide.

**New review:** [Swarmer redesign — Splitmask, Crescent and Ribknife](swarmer-redesign/README.md). Three alternative directions for a future bug-family redesign, with concept sheets, exact built-in image-generation prompts and notes on extending each theme. Direction selection is pending.

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

Recipe and environment notes: `docs/handoff/art-director.md` §5. Prompt skeleton: `docs/design/style-guide.md` §10.

Mech customisation reference (chassis, legs, arms, arm weapons, back weapons as separate swappable pieces): [`mech-bay/`](mech-bay/README.md).
