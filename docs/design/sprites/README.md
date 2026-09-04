# VFX sprites

Transparent RGBA PNGs under `public/assets/sprites/vfx/`, registered in `src/graphics/data/sprite-manifest.ts`. Each has a sidecar here with the exact prompt (architecture §7). Regenerate with:

```
tools/art/gen-image.sh docs/design/sprites/prompts/<name>.txt public/assets/sprites/vfx/<name>.png
```

![Round 2 contact sheet](vfx-round-2.png)

| Sprite | Id | Size | Blend |
|---|---|---|---|
| [muzzle-flash](muzzle-flash.md) | `vfx.muzzle-flash` | 512² | additive |
| [impact](impact.md) | `vfx.impact` | 512² | additive |
| [egg-burst](egg-burst.md) | `vfx.egg-burst` | 512² | normal |
| [tracer](tracer.md) | `vfx.tracer` | 512² | additive |
| [claw-slash](claw-slash.md) | `vfx.claw-slash` | 512² | additive |
| [bug-death](bug-death.md) | `vfx.bug-death` | 512² | normal |
| [muzzle-flash-sheet](sheets.md) | `vfx.muzzle-flash-sheet` | 256² (2×2 frames of 128) | additive |
| [impact-sheet](sheets.md) | `vfx.impact-sheet` | 256² (2×2 frames of 128) | additive |
| [egg-burst-sheet](sheets.md) | `vfx.egg-burst-sheet` | 384×256 (3×2 frames of 128) | normal |
| [claw-slash-sheet](sheets.md) | `vfx.claw-slash-sheet` | 256² (2×2 frames of 128) | additive |
| [bug-death-sheet](sheets.md) | `vfx.bug-death-sheet` | 384×256 (3×2 frames of 128) | normal |

Rules: ≤ 512² (sheets ≤ 512 wide), alpha actually used, under 150 KB, hard-edged three-tone bands on the style guide palette (§4), no background. Animation sheets are derived from the single sprites by `tools/art/build-vfx-strips.sh`; regenerate them after changing a source sprite. `vfx.tracer` has no sheet: the renderer stretches it along the shot axis, and frames would fight the stretch. Generated PNGs are quantised with `magick -strip +dither -colors 32 png32:` before committing — `png32:` keeps colour type 6, which the manifest test requires.
