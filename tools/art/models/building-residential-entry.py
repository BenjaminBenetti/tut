"""Building use detail: residential-entry, mounted against an existing wall (#960)."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from frontage_parts import residential_entry  # noqa: E402

FOOTPRINT = (1.35, 0.43)


def build() -> None:
    """Build the wall-mounted module without changing the shell."""
    residential_entry()
