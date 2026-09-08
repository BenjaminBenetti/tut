"""Shared apartment mailboxes on an existing solid wall bay (#960)."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from frontage_parts import mailbox_bank  # noqa: E402

FOOTPRINT = (0.62, 0.12)


def build() -> None:
    """Build a mounted cabinet, preserving the neighbouring doorway."""
    mailbox_bank()
