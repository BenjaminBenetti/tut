# Sprite: Tracer

![Tracer](../../../public/assets/sprites/vfx/tracer.png)

- **Asset**: `public/assets/sprites/vfx/tracer.png`, 512×512, RGBA, manifest id `vfx.tracer` in `src/graphics/data/sprite-manifest.ts`.
- **Generator**: Codex CLI 0.152.1 built-in `image_gen` via `tools/art/gen-image.sh`, then `magick -strip +dither -colors 32 png32:` (7.5 KB).
- **Date**: 2026-09-04
- **Prompt file**: [`prompts/tracer.txt`](prompts/tracer.txt)

## Prompt

```
Game VFX sprite on a fully transparent background (real alpha channel; do not paint a checkerboard, do not paint any background colour): a single bullet tracer round in flight, seen from the side, travelling to the right. One long horizontal streak: a bright blunt rounded head at the right, a body that tapers back to a sharp point at the left. Hard-edged bands from the centre outward: a white core #FFFFFF that is widest at the head and narrows along the tail, an orange #F08A24 body around it, and a dim orange #B86414 outer edge on the tail. Flat vector-style fills, hard edges, no shading or gradients inside shapes. The streak is perfectly horizontal and vertically centred, about one eighth of the image height, and leaves a clear empty margin of at least one twentieth of the width at both the left and the right edge so neither end touches the border. Nothing else in the frame: no gun, no smoke, no sparks, no ground, no background elements. Square 512 by 512 pixels, no text, no watermark.
```

## Keep

- Head points **+X** with a 5 % margin at both ends, ink spans 460×64 px centred on the middle row. Stretch it on X along the shooter→target vector, scale Y to about **0.22 tiles**, fade over the flight; do not rotate the sprite about its own centre for anything but the shot axis. (0.15 was the first guess; composited over a real frame at 64 px per tile it is a hairline that disappears over asphalt — see the README.)
- Additive blend; white core, `tdf-orange` body, `tdf-orange-dim` tail edge. Reads at 32 px as an orange dash with a white glint.

## Change next pass

- A dimmer `vfx.tracer-bug` variant in `bug-bio-green` if ranged bug species land (every species is melee today).
- No animation sheet on purpose: the renderer stretches and moves this one, and frames would fight the stretch.
