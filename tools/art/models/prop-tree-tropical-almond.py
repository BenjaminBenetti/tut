"""Lagos: tiered tropical almond within the existing one-tile tree contract."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lagos_kit_parts import tropical_almond  # noqa: E402

FOOTPRINT = (1, 1)


def build() -> None:
    """Build a compact urban almond with broad horizontal foliage tiers."""
    tropical_almond()
