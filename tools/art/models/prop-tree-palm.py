"""Prop: palm, 2.0 u tall, leaning trunk with a crown of fronds."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prop_parts import palm  # noqa: E402

FOOTPRINT = (1, 1)


def build() -> None:
    """Bare leaning trunk under six fronds: readable against the other two trees."""
    palm(trunk_height=1.78, fronds=6, lean=0.16)
