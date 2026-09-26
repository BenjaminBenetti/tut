"""Bug: the crash site's spore pod, split open and about to burst. See spore_pod_parts.py."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from spore_pod_parts import build_spore_pod  # noqa: E402

FOOTPRINT = (1, 1)


def build() -> None:
    """The pod's staves peeled open like petals round its bright core."""
    build_spore_pod(mature=True)
