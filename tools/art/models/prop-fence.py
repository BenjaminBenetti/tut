"""Prop: timber fence, 0.5 u tall, two posts and two rails across the tile."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prop_parts import post_and_rail  # noqa: E402

FOOTPRINT = (1, 1)


def build() -> None:
    """Low cover that reads as a boundary, not as a wall."""
    post_and_rail(height=0.5, rails=2, span=0.86)
