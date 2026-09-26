"""Bug: the crash site's spore pod, ripening. See spore_pod_parts.py; run through make_model.py."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from spore_pod_parts import build_spore_pod  # noqa: E402

FOOTPRINT = (1, 1)


def build() -> None:
    """The pod sunk in its tile, its crown split and its seams glowing."""
    build_spore_pod(mature=False)
