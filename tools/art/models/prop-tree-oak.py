"""Prop: broadleaf tree, 1.9 u tall, three canopy lumps on a thick trunk."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prop_parts import broadleaf  # noqa: E402

FOOTPRINT = (1, 1)


def build() -> None:
    """A round, wide crown — the opposite silhouette to the pine."""
    broadleaf(trunk_height=0.72, top=1.9, spread=0.44)
