"""Bug: bug-sovereign, the finale's apex boss (#1179). See sovereign_parts.py."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sovereign_parts import build_sovereign  # noqa: E402

FOOTPRINT = (4, 4)


def build() -> None:
    """Build the Sovereign at her real four-tile footprint."""
    build_sovereign()
