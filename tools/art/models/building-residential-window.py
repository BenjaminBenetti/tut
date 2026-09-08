"""Building use detail: residential-window, mounted against an existing wall (#960)."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from frontage_parts import residential_window  # noqa: E402

FOOTPRINT = (0.74, 0.29)


def build() -> None:
    """Build the wall-mounted module without changing the shell."""
    residential_window()
