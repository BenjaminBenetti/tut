"""City viaduct: a concrete kerb with an open, two-course steel guardrail.

Drop-in half-wall contract: one unit along X, 0.18 maximum depth, 0.5
high, base midpoint at the origin. Continuous rails reach both ends so
neighbouring segments join; the low kerb leaves daylight above the deck.
"""

from bpy_kit import bevel, box

FOOTPRINT = (1, 0)


def build() -> None:
    """Build the chamfered concrete foot and stout grey bridge rail."""
    kerb = box("concrete-kerb", (1.0, 0.18, 0.16), (0, 0, 0.08), "env-concrete")
    bevel(kerb, 0.015)
    for x in (-0.35, 0.35):
        box("rail-post", (0.06, 0.065, 0.33), (x, 0, 0.315), "env-metal")
    box("middle-rail", (1.0, 0.07, 0.05), (0, 0, 0.30), "env-metal")
    top = box("top-rail", (1.0, 0.09, 0.06), (0, 0, 0.47), "env-metal")
    bevel(top, 0.008)
