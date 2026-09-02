# Sprite: Muzzle flash

![Muzzle flash](../../../public/assets/sprites/vfx/muzzle-flash.png)

- **Asset**: `public/assets/sprites/vfx/muzzle-flash.png`, 512×512, RGBA, manifest id `vfx.muzzle-flash` in `src/graphics/data/sprite-manifest.ts`.
- **Generator**: Codex CLI 0.152.1 built-in `image_gen` via `tools/art/gen-image.sh`, transparent background requested in the prompt.
- **Date**: 2026-09-02
- **Prompt file**: [`prompts/muzzle-flash.txt`](prompts/muzzle-flash.txt)

## Prompt

```
Game VFX sprite: a single muzzle flash from an autocannon, seen from the side, a bright hard-edged star-shaped burst with a short horizontal flame tongue, low-poly flat-shaded game style with three tone bands: white core #FFFFFF, orange #F08A24, dim orange edge #B86414. No smoke, no gun, no background elements. Transparent background PNG, the flash centred, square 512 by 512 pixels, no text, no watermark.
```

## Keep

- Hard-edged three-band star with a horizontal tongue pointing +X; white core, `tdf-orange`, `tdf-orange-dim` edge. Reads at 32 px. Additive blend.

## Change next pass

- Add a 4-frame variant (grow, peak, tongue, fade) as a 1024×256 strip when tactical animation lands.
