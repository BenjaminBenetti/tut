"""Prop: pine tree, 2.1 u tall, three tiers on a bare trunk."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prop_parts import conifer  # noqa: E402

FOOTPRINT = (1, 1)


def build() -> None:
    """A narrow conifer: the silhouette a player reads at 64 px is the taper."""
    conifer(trunk_height=0.42, tiers=3, top=2.1, spread=0.42)
