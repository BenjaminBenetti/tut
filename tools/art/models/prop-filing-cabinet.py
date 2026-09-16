"""A paired three-drawer filing bank for offices and warehouse administration."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bpy_kit import box
from commercial_interior_parts import finish_prop

FOOTPRINT = (1, 1)


def build() -> None:
    """Use recessed drawers, prominent handles and label plates to read as filing."""
    box("plinth", (0.65, 0.40, 0.05), (0, 0, 0.025), "env-roof")
    box("cabinet", (0.68, 0.425, 0.74), (0, 0.0125, 0.42), "env-metal")
    box("cap", (0.70, 0.45, 0.035), (0, 0, 0.8075), "env-sidewalk")
    for column, x in enumerate((-0.17, 0.17)):
        for row, z in enumerate((0.18, 0.415, 0.65)):
            box(f"drawer_{column}_{row}", (0.305, 0.016, 0.215), (x, -0.207, z), "env-sidewalk")
            box(f"handle_{column}_{row}", (0.12, 0.025, 0.021), (x, -0.225, z + 0.056), "env-roof")
            box(f"label_{column}_{row}", (0.085, 0.008, 0.034), (x, -0.22, z - 0.012), "env-plaster-warm")
    box("archive_binder", (0.17, 0.265, 0.04), (0.17, 0.01, 0.846), "env-roof-green")
    box("loose_documents", (0.145, 0.235, 0.013), (0.16, -0.002, 0.8725), "env-plaster-warm")
    finish_prop("filing_cabinet", height=1.02)
