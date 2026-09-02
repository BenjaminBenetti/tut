# VFX sprites

Transparent RGBA PNGs under `public/assets/sprites/vfx/`, registered in `src/graphics/data/sprite-manifest.ts`. Each has a sidecar here with the exact prompt (architecture §7). Regenerate with:

```
tools/art/gen-image.sh docs/design/sprites/prompts/<name>.txt public/assets/sprites/vfx/<name>.png
```

| Sprite | Id | Size | Blend |
|---|---|---|---|
| [muzzle-flash](muzzle-flash.md) | `vfx.muzzle-flash` | 512² | additive |
| [impact](impact.md) | `vfx.impact` | 512² | additive |
| [egg-burst](egg-burst.md) | `vfx.egg-burst` | 256² | normal |

Rules: ≤ 512², alpha actually used, under 150 KB, hard-edged three-tone bands on the style guide palette (§4), no background.
