"""Building use detail: workplace-entry, mounted against an existing wall (#960)."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from frontage_parts import workplace_entry  # noqa: E402

FOOTPRINT = (2.4, 0.56)


def build() -> None:
    """Build the wall-mounted module without changing the shell."""
    workplace_entry()
