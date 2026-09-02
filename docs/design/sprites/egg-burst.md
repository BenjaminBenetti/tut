# Sprite: Egg burst

![Egg burst](../../../public/assets/sprites/vfx/egg-burst.png)

- **Asset**: `public/assets/sprites/vfx/egg-burst.png`, 512×512, RGBA, manifest id `vfx.egg-burst` in `src/graphics/data/sprite-manifest.ts`.
- **Generator**: Codex CLI 0.152.1 built-in `image_gen` via `tools/art/gen-image.sh`, transparent background requested in the prompt.
- **Date**: 2026-09-02 (third pass)
- **Prompt file**: [`prompts/egg-burst.txt`](prompts/egg-burst.txt)

## Prompt

```
Game VFX sprite on a fully transparent background (real alpha channel; do not paint a checkerboard, do not paint any background colour): a single alien egg burst seen from the front, a splash of thick fleshy fluid with six to nine irregular spiky tendrils and a few curved shell fragments flying outward from the centre. Flat vector-style fills, hard edges, no shading or gradients inside shapes; colours: bright bioluminescent magenta core #E23DFF, flesh pink #B05A6E, dark flesh outline #7A3A4E, a few small bioluminescent green #9CFF3D droplets. No egg, no ground, nothing outside the splash. Square 512 by 512 pixels, the burst centred, no text, no watermark.
```

## Keep

- Third pass. Flat fills, hard outline, real alpha (corners fully transparent), 17 KB at 512². Magenta `bug-bio-magenta` core, flesh `bug-flesh-light` splash with `bug-flesh` outline, curved shell fragments, green `bug-bio-green` droplets. Matches the muzzle flash and impact style. Normal blend.

## Change next pass

- Nothing pending. History: pass 1 was painterly (250 KB, shipped at 256²); pass 2 painted a magenta checkerboard as fake transparency (alpha 0.16 in the corners) and was rejected. The phrase that fixed it: "fully transparent background (real alpha channel; do not paint a checkerboard, do not paint any background colour)".
