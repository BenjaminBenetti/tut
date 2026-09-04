# VFX animation sheets

| | | |
|---|---|---|
| ![muzzle](../../../public/assets/sprites/vfx/muzzle-flash-sheet.png) | ![impact](../../../public/assets/sprites/vfx/impact-sheet.png) | ![egg](../../../public/assets/sprites/vfx/egg-burst-sheet.png) |
| ![claw](../../../public/assets/sprites/vfx/claw-slash-sheet.png) | ![death](../../../public/assets/sprites/vfx/bug-death-sheet.png) | |

- **Assets**: `public/assets/sprites/vfx/muzzle-flash-sheet.png`, `impact-sheet.png` (256², 2×2 frames), `egg-burst-sheet.png` (384×256, 3×2 frames); frames are 128 px, read left to right then top to bottom. `claw-slash-sheet.png` (256², 2×2 frames) and `bug-death-sheet.png` (384×256, 3×2 frames) joined them in #429. Manifest ids `vfx.muzzle-flash-sheet`, `vfx.impact-sheet`, `vfx.egg-burst-sheet`, `vfx.claw-slash-sheet`, `vfx.bug-death-sheet`; each entry's `sheet` field carries frame size, columns, rows, frame count and a suggested `frameMs`.
- **Source**: derived deterministically from the single sprites by `tools/art/build-vfx-strips.sh` (ImageMagick): scale and alpha per frame, no new generation, so the sheets always match the singles. Date: 2026-09-03 (#395).
- **Playback**: muzzle flash 4 × 40 ms additive at the `socket_muzzle` of the firing weapon, oriented along the shot; impact 4 × 50 ms additive at the hit point; egg burst 6 × 70 ms normal blend at the spawner's `socket_hatch`; claw slash 4 × 50 ms additive at the target of a melee (range-1) attacker, mirrored on X when the strike comes from the right; bug death 6 × 70 ms normal blend at a dying bug's chest height, played over the death fade. The last frame of each sheet fades to about 25–45 % alpha, so ending on it needs no extra fade.

## Frames

| Sheet | Frames |
|---|---|
| muzzle flash | 55 % grow, 100 % peak, 100 % × 125 % wide tongue, 80 % at 45 % alpha |
| impact | 50 % spark, 100 % full, 125 % at 70 % (fragments spread), 140 % at 35 % |
| egg burst | 40 %, 70 %, 100 %, 115 % at 85 %, 125 % at 55 %, 135 % at 25 % |
| claw slash | 62 % at −14°, 88 % at 0°, 100 % at +8° and 70 % alpha, 110 % at +14° and 30 % — a swing, not a zoom |
| bug death | 45 %, 75 %, 100 %, 112 % at 85 %, 122 % at 55 %, 132 % at 25 % |

## Change next pass

- `vfx.tracer` deliberately has no sheet: it is stretched along the shot axis and faded, so frames would fight the stretch.
- Hand-drawn intermediate frames (a different silhouette per frame) if the scaled look reads as a zoom rather than a burst in motion; the manifest layout stays the same.
