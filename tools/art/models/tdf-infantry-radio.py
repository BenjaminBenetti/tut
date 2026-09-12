"""Radio squad with a tall whip aerial and a signals backpack."""

import bpy
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from squad_parts import build_squad, SLOTS  # noqa: E402
from bpy_kit import box, cylinder, join  # noqa: E402

FOOTPRINT = (1, 1)


def build() -> None:
    """Five rifle-equipped soldiers; the left flank carries the radio kit."""
    build_squad("rifle")
    x, y = SLOTS[1]
    box("fig1_radio_pack", (0.24, 0.14, 0.32), (x, y + 0.15, 0.65), "tdf-olive-dark")
    box("fig1_radio_panel", (0.16, 0.02, 0.13), (x, y + 0.23, 0.67), "tdf-grey-mid")
    box("fig1_radio_screen", (0.09, 0.012, 0.05), (x, y + 0.245, 0.69), "tdf-visor")
    cylinder("fig1_radio_aerial", 0.009, 0.012, 0.56, 6, (x - 0.08, y + 0.15, 1.07), "tdf-grey-dark")
    cylinder("fig1_radio_aerial_tip", 0.016, 0.016, 0.045, 6, (x - 0.08, y + 0.15, 1.34), "tdf-orange")

    # Retain legs and knee nodes for the runtime motion rig; merge upper parts
    # per soldier to stay inside the 100 KB squad budget.
    for index in range(5):
        prefix = f"fig{index}_"
        upper = [ob for ob in bpy.context.scene.objects
                 if ob.type == "MESH" and ob.name.startswith(prefix)
                 and ob.name not in (prefix + "legs", prefix + "knee")]
        helmet = bpy.data.objects.get(prefix + "helmet")
        if helmet is not None:
            bpy.context.view_layer.objects.active = helmet
            for modifier in list(helmet.modifiers):
                bpy.ops.object.modifier_apply(modifier=modifier.name)
        join(upper, prefix + "upper")
