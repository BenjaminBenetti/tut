# Mech-bay concept sheets

Reference art for the mech customisation screens (#80, #81) and the part catalogue (#46). Each part class is drawn as a separate, swappable piece with the same socket so the mech bay's slot picker reads visually. Baseline mech: `../mech.png`. Socket names and the part split are in the style guide §6 and the placeholder GLBs.

| Sheet | Slot | Variants |
|---|---|---|
| [mech-exploded](mech-exploded.md) | all | one mech pulled apart into chassis, legs, arm ×2, arm weapon, back weapon |
| [mech-chassis-variants](mech-chassis-variants.md) | chassis | light, standard, heavy |
| [mech-legs-variants](mech-legs-variants.md) | legs | runner, standard, heavy |
| [mech-arms-variants](mech-arms-variants.md) | arm | light, standard, heavy with shield |
| [mech-arm-weapons](mech-arm-weapons.md) | arm weapon | autocannon, laser, flamethrower, gauss rifle |
| [mech-back-weapons](mech-back-weapons.md) | back weapon | missile pod, mortar, sensor mast, point-defence turret |

Regenerate any sheet with `tools/art/gen-image.sh docs/design/concepts/mech-bay/prompts/<name>.txt docs/design/concepts/mech-bay/<name>.png`.
