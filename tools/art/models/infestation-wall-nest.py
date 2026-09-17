"""Resin hive kit: wall-nest."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from infestation_hive import build_hive
FOOTPRINT = (1, 0)


def build():
    """Build the reproducible wall-nest model."""
    build_hive('wall-nest')
