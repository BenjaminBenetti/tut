"""Bug: bug-swarmer. See bug_parts.py; run through make_model.py."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bug_parts import build_swarmer  # noqa: E402

FOOTPRINT = (1, 1)


def build() -> None:
    """Build this bug standing on the ground."""
    build_swarmer()
