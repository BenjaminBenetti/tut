"""Bug: bug-broodmother-scarred, the nemesis who escaped once (#1179).

The same build as bug-broodmother.py with the crest scar, two cage spines
gone and dark regrowth on the left flank. See broodmother_parts.py.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from broodmother_parts import build_broodmother  # noqa: E402

FOOTPRINT = (3, 3)


def build() -> None:
    """Build the scarred Broodmother at her real three-tile footprint."""
    build_broodmother(scarred=True)
