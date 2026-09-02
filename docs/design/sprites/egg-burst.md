# Sprite: Egg burst

![Egg burst](../../../public/assets/sprites/vfx/egg-burst.png)

- **Asset**: `public/assets/sprites/vfx/egg-burst.png`, 256×256 (downscaled from 512), RGBA, manifest id `vfx.egg-burst` in `src/graphics/data/sprite-manifest.ts`.
- **Generator**: Codex CLI 0.152.1 built-in `image_gen` via `tools/art/gen-image.sh`, transparent background requested in the prompt.
- **Date**: 2026-09-02
- **Prompt file**: [`prompts/egg-burst.txt`](prompts/egg-burst.txt)

## Prompt

```
Game VFX sprite: a single alien egg burst, seen from the front: a splash of thick fleshy fluid and a few curved shell fragments flying outward from the centre, low-poly flat-shaded game style with hard edges and three tone bands: bright bioluminescent magenta core #E23DFF, flesh pink #B05A6E, dark flesh edge #7A3A4E, with a few small bioluminescent green #9CFF3D droplets. No egg, no ground, no background elements. Transparent background PNG, the burst centred, square 512 by 512 pixels, no text, no watermark.
```

## Keep

- Magenta `bug-bio-magenta` core, flesh splash in `bug-flesh-light`/`bug-flesh`, curved shell fragments, green `bug-bio-green` droplets. Reads as wrong, matches the spawner concept. Normal blend (opaque fluid).

## Change next pass

- Came out painterly (soft shading inside bands) and 250 KB at 512², so it is shipped at 256². Regenerate with "flat fills, no shading inside shapes" to match the other two, then it can return to 512².
